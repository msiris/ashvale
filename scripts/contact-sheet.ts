/**
 * 캐릭터 15장 후보 시트 — 빌드 도구다. 런타임 코드가 아니다.
 *
 *   npx tsx scripts/contact-sheet.ts
 *
 * 배역을 정하려면 15장을 나란히 봐야 한다. 각 장의 정면 정지 프레임을
 * 뽑아 번호를 붙여 한 장으로 만든다.
 *
 * **투명 픽셀은 마젠타에 알파 0이다.** 합성할 때 알파를 그대로 존중한다 —
 * 알파를 평탄화하면 분홍이 드러난다 (docs/ASSETS.md).
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAR_SHEET, IDLE_FRAME, DIR_ROW } from '../src/data/characters';
import { PALETTE } from '../src/data/palette';

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * **구워 놓은 쪽을 읽는다.** 예전에는 `raw-assets/characters` 를 직접 읽었는데,
 * 원본이 늘 규격대로 들어오지는 않는다 — JPEG 가 `.png` 이름으로 들어온 적이 있고
 * 그때 PNG 디코더가 그냥 죽었다. `copy-characters.ts` 가 규격으로 맞춰 둔 것을 본다.
 */
const SRC = resolve(HERE, '../public/assets/characters');
const OUT = resolve(HERE, '../docs/assets');

// ── PNG 읽기 ──────────────────────────────────────────────

interface Bitmap {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8Array;
}

function readChunks(buf: Buffer): { type: string; data: Buffer }[] {
  const out: { type: string; data: Buffer }[] = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    out.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(file: string): Bitmap {
  const buf = readFileSync(file);
  const chunks = readChunks(buf);

  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (ihdr === undefined) throw new Error(`${file}: IHDR 없음`);
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const depth = ihdr.data[8] ?? 8;
  const colorType = ihdr.data[9] ?? 6;
  if (depth !== 8) throw new Error(`${file}: 8비트 깊이만 읽는다 (${depth})`);

  const palette = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = inflateSync(idat);

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const stride = width * channels;
  const lines = new Uint8Array(stride * height);

  // 필터 해제
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++] ?? 0;
    for (let x = 0; x < stride; x++) {
      const cur = raw[pos + x] ?? 0;
      const left = x >= channels ? (lines[y * stride + x - channels] ?? 0) : 0;
      const up = y > 0 ? (lines[(y - 1) * stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= channels ? (lines[(y - 1) * stride + x - channels] ?? 0) : 0;

      let value = cur;
      if (filter === 1) value = cur + left;
      else if (filter === 2) value = cur + up;
      else if (filter === 3) value = cur + ((left + up) >> 1);
      else if (filter === 4) value = cur + paeth(left, up, upLeft);
      lines[y * stride + x] = value & 0xff;
    }
    pos += stride;
  }

  // RGBA 로 편다
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    if (colorType === 3) {
      const idx = lines[s] ?? 0;
      data[d] = palette?.[idx * 3] ?? 0;
      data[d + 1] = palette?.[idx * 3 + 1] ?? 0;
      data[d + 2] = palette?.[idx * 3 + 2] ?? 0;
      data[d + 3] = trns?.[idx] ?? 255;
    } else if (colorType === 6) {
      data[d] = lines[s] ?? 0;
      data[d + 1] = lines[s + 1] ?? 0;
      data[d + 2] = lines[s + 2] ?? 0;
      data[d + 3] = lines[s + 3] ?? 0;
    } else if (colorType === 2) {
      data[d] = lines[s] ?? 0;
      data[d + 1] = lines[s + 1] ?? 0;
      data[d + 2] = lines[s + 2] ?? 0;
      data[d + 3] = 255;
    } else {
      const g = lines[s] ?? 0;
      data[d] = g;
      data[d + 1] = g;
      data[d + 2] = g;
      data[d + 3] = colorType === 4 ? (lines[s + 1] ?? 255) : 255;
    }
  }

  return { width, height, data };
}

// ── PNG 쓰기 ──────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const byte of b) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 숫자 3×5 비트맵 ───────────────────────────────────────

const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

// ── 시트 조립 ─────────────────────────────────────────────

const COUNT = 15;
const COLS = 5;
const SCALE = 4;
const PAD = 6;
const LABEL_H = 10;

const cellW = CHAR_SHEET.frameWidth * SCALE + PAD * 2;
const cellH = CHAR_SHEET.frameHeight * SCALE + PAD * 2 + LABEL_H;
const rows = Math.ceil(COUNT / COLS);
const sheetW = cellW * COLS;
const sheetH = cellH * rows;

const sheet = new Uint8Array(sheetW * sheetH * 4);
const bg = hex(PALETTE.paperDim);
const ink = hex(PALETTE.ink);

function hex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function put(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= sheetW || y >= sheetH) return;
  const i = (y * sheetW + x) * 4;
  sheet[i] = c[0];
  sheet[i + 1] = c[1];
  sheet[i + 2] = c[2];
  sheet[i + 3] = 255;
}

for (let y = 0; y < sheetH; y++) for (let x = 0; x < sheetW; x++) put(x, y, bg);

for (let n = 1; n <= COUNT; n++) {
  const bmp = decodePng(resolve(SRC, `${String(n).padStart(2, '0')}.png`));
  const col = (n - 1) % COLS;
  const row = Math.floor((n - 1) / COLS);
  const ox = col * cellW + PAD;
  const oy = row * cellH + PAD;

  // 정면 정지 프레임 하나만 뽑는다
  const fx = IDLE_FRAME * CHAR_SHEET.frameWidth;
  const fy = DIR_ROW.down * CHAR_SHEET.frameHeight;

  for (let y = 0; y < CHAR_SHEET.frameHeight; y++) {
    for (let x = 0; x < CHAR_SHEET.frameWidth; x++) {
      const s = ((fy + y) * bmp.width + (fx + x)) * 4;
      const a = bmp.data[s + 3] ?? 0;
      // 알파 0 은 건너뛴다. 여기서 평탄화하면 마젠타가 드러난다
      if (a === 0) continue;
      const c: [number, number, number] = [
        bmp.data[s] ?? 0,
        bmp.data[s + 1] ?? 0,
        bmp.data[s + 2] ?? 0,
      ];
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) put(ox + x * SCALE + sx, oy + y * SCALE + sy, c);
      }
    }
  }

  // 번호
  const label = String(n);
  const lx = ox;
  const ly = oy + CHAR_SHEET.frameHeight * SCALE + 2;
  label.split('').forEach((ch, i) => {
    const glyph = DIGITS[ch];
    if (glyph === undefined) return;
    glyph.forEach((line, gy) => {
      line.split('').forEach((bit, gx) => {
        if (bit !== '1') return;
        for (let sy = 0; sy < 2; sy++)
          for (let sx = 0; sx < 2; sx++)
            put(lx + i * 8 + gx * 2 + sx, ly + gy * 2 + sy, ink);
      });
    });
  });
}

mkdirSync(OUT, { recursive: true });
const file = resolve(OUT, 'character-candidates.png');
writeFileSync(file, encodePng(sheetW, sheetH, sheet));
console.log(`${file}  ${sheetW}×${sheetH}`);

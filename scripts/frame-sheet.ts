/**
 * 스프라이트 시트의 16프레임을 그대로 펼쳐 본다 — 빌드 도구다.
 *
 *   npx tsx scripts/frame-sheet.ts [번호]
 *
 * 행이 어느 방향인지 눈으로 확인하려고 만들었다.
 * characters.ts 는 행 0=아래 1=왼쪽 2=위 3=오른쪽 이라고 하는데,
 * 실제 시트가 그런지 사람이 봐야 안다.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png';
import { CHAR_SHEET } from '../src/data/characters';
import { PALETTE } from '../src/data/palette';

const HERE = dirname(fileURLToPath(import.meta.url));
const which = process.argv[2] ?? '1';
/**
 * **구워 놓은 쪽을 읽는다.** 원본은 늘 규격대로 들어오지 않는다 —
 * JPEG 가 `.png` 이름으로 들어온 적이 있고, 그때 PNG 디코더가 그냥 죽었다.
 * `copy-characters.ts` 가 맞춰 둔 것을 본다.
 */
const src = resolve(HERE, `../public/assets/characters/${String(which).padStart(2, '0')}.png`);
const OUT = resolve(HERE, '../docs/assets');

const SCALE = 5;
const PAD = 4;
const bmp = decodePng(src);

const cw = CHAR_SHEET.frameWidth * SCALE + PAD * 2;
const ch = CHAR_SHEET.frameHeight * SCALE + PAD * 2;
const W = cw * CHAR_SHEET.columns;
const H = ch * CHAR_SHEET.rows;

const out = new Uint8Array(W * H * 4);

function hex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
const bg = hex(PALETTE.paperDim);
const line = hex(PALETTE.stoneDark);

function put(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  out[i] = c[0];
  out[i + 1] = c[1];
  out[i + 2] = c[2];
  out[i + 3] = 255;
}

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, bg);

for (let row = 0; row < CHAR_SHEET.rows; row++) {
  for (let col = 0; col < CHAR_SHEET.columns; col++) {
    const ox = col * cw + PAD;
    const oy = row * ch + PAD;

    for (let y = 0; y < CHAR_SHEET.frameHeight; y++) {
      for (let x = 0; x < CHAR_SHEET.frameWidth; x++) {
        const sx = col * CHAR_SHEET.frameWidth + x;
        const sy = row * CHAR_SHEET.frameHeight + y;
        const s = (sy * bmp.width + sx) * 4;
        if ((bmp.data[s + 3] ?? 0) === 0) continue;
        const c: [number, number, number] = [
          bmp.data[s] ?? 0,
          bmp.data[s + 1] ?? 0,
          bmp.data[s + 2] ?? 0,
        ];
        for (let py = 0; py < SCALE; py++)
          for (let pxx = 0; pxx < SCALE; pxx++) put(ox + x * SCALE + pxx, oy + y * SCALE + py, c);
      }
    }

    // 행 구분선
    for (let x = 0; x < W; x++) put(x, row * ch, line);
  }
}

mkdirSync(OUT, { recursive: true });
const file = resolve(OUT, `frames-${which}.png`);
writeFileSync(file, encodePng(W, H, out));
console.log(`${file}  ${W}×${H}  (행 0..3 위에서 아래로, 열 0..3 왼쪽에서 오른쪽으로)`);

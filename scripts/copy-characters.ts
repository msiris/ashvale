/**
 * 캐릭터 팩을 사용본 자리로 옮긴다 — 빌드 도구다. 런타임 코드가 아니다.
 *
 *   npx tsx scripts/copy-characters.ts
 *
 *   raw-assets/characters/1..15.png  ->  public/assets/characters/01..15.png
 *
 * 원본이 **규격대로면 바이트를 그대로 복사한다.** 다시 인코딩하지 않는다.
 * 원래 팩은 투명 픽셀이 마젠타(255,0,255)에 알파 0으로 저장돼 있어서,
 * 알파를 평탄화하는 변환을 한 번이라도 거치면 분홍이 드러난다 (docs/ASSETS.md).
 *
 * 규격에 안 맞으면 맞춰 준다. 새로 그린 시트를 넣을 때 크기도 형식도
 * 제각각이기 때문이다 — 실제로 683×1024 JPEG 가 `.png` 이름으로 들어온 적이 있다.
 * 그대로 복사하면 브라우저가 JPEG 로 읽어 프레임 계산이 통째로 어긋나고,
 * 알파가 없어 캐릭터마다 흰 사각형이 붙는다.
 *
 * 맞춰 주는 일은 셋이다.
 *   1. 알파가 없으면 **바깥에서 이어진 밝은 영역**을 투명으로 만든다.
 *      임계로 한 번에 지우지 않는다 — 눈 흰자와 신발까지 뚫린다.
 *      네 변에서 시작하는 채우기라 몸 안쪽 흰색은 남는다
 *   2. 64×96 으로 줄인다. 4열×4행이므로 프레임이 정확히 16×24 가 된다
 *   3. 팔레트 PNG 로 굽는다. 줄이면서 생긴 수천 색을 그대로 두면
 *      한 장에 17KB 가 된다 — 오프라인 앱이 통째로 지고 갈 무게다
 *
 * 캐릭터 팩은 팔레트 리맵 대상이 아니다 (`scripts/remap-palette.ts` 의 SKIP).
 * 여기서 색을 줄이는 것은 **세계 팔레트로 옮기는 것이 아니라** 제 색 안에서
 * 개수만 줄이는 것이다. 16px 8색을 뭉개지 않는다.
 */

import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CHAR_SHEET } from '../src/data/characters';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, '../raw-assets/characters');
const OUT_DIR = resolve(HERE, '../public/assets/characters');

/** 팩에 든 장수. 기획서 §12 배역 배정표가 이 번호를 그대로 쓴다 */
const COUNT = 15;

/** 시트 규격 — characters.ts 가 유일한 출처다. 여기서 다시 적지 않는다 */
const SHEET_W = CHAR_SHEET.frameWidth * CHAR_SHEET.columns;
const SHEET_H = CHAR_SHEET.frameHeight * CHAR_SHEET.rows;

/**
 * 이 밝기 위쪽은 배경으로 본다.
 *
 * JPEG 로 들어온 그림은 손실 압축이라 흰 배경도 250 언저리에서 흔들린다.
 * 너무 높게 잡으면 배경이 얼룩덜룩 남고, 너무 낮게 잡으면 밝은 옷이 뚫린다.
 */
const BG_MIN_BRIGHT = 232;

/** 이보다 옅은 알파는 지운다. 줄이면서 생기는 옅은 후광을 걷어낸다 */
const ALPHA_FLOOR = 40;

/** 팔레트 색 수. 원래 팩이 9색이었으니 넉넉하다 */
const PALETTE_COLOURS = 64;

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * 바깥에서 이어진 밝은 영역을 투명으로 만든다.
 *
 * 네 변에 닿은 밝은 픽셀에서만 번져 나간다. 몸 안쪽의 흰색(눈·신발)은
 * 바깥과 이어져 있지 않으므로 남는다.
 */
function cutBackground(raw: Raw): void {
  const { data, width, height } = raw;
  const bright = (i: number): boolean => {
    const p = i * 4;
    return (
      data[p]! >= BG_MIN_BRIGHT && data[p + 1]! >= BG_MIN_BRIGHT && data[p + 2]! >= BG_MIN_BRIGHT
    );
  };

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const push = (i: number): void => {
    if (seen[i] === 1 || !bright(i)) return;
    seen[i] = 1;
    queue[tail++] = i;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (head < tail) {
    const i = queue[head++]!;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  for (let i = 0; i < width * height; i++) {
    if (seen[i] === 1) data[i * 4 + 3] = 0;
  }
}

/** 줄이면서 생긴 옅은 후광을 걷어낸다 */
function clearHalo(data: Buffer): void {
  for (let p = 3; p < data.length; p += 4) {
    if (data[p]! < ALPHA_FLOOR) data[p] = 0;
  }
}

/** 규격대로 굽는다. 이미 규격이면 부르지 않는다 */
async function convert(src: string): Promise<Buffer> {
  const input = sharp(src).ensureAlpha();
  const { data, info } = await input.raw().toBuffer({ resolveWithObject: true });
  const raw: Raw = { data, width: info.width, height: info.height };

  // 원본에 이미 투명한 데가 있으면 그 알파를 믿는다
  let hasAlpha = false;
  for (let p = 3; p < data.length; p += 4) {
    if (data[p]! < 250) {
      hasAlpha = true;
      break;
    }
  }
  if (!hasAlpha) cutBackground(raw);

  const shrunk = await sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: 4 },
  })
    .resize(SHEET_W, SHEET_H, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();

  clearHalo(shrunk);

  /**
   * 색을 먼저 줄이고, **8비트 RGBA 로 굽는다.**
   *
   * 팔레트 PNG 로 바로 내보내면 sharp 가 색 수에 맞춰 4비트로 굽는다.
   * 브라우저는 읽지만 **이 저장소의 도구들이 8비트만 읽는다** (`scripts/png.ts`,
   * `contact-sheet.ts`). 몇 백 바이트 아끼자고 도구를 깨뜨릴 일이 아니다.
   * 색이 열여섯 남짓이라 8비트로 구워도 압축이 잘 먹는다.
   */
  const quantized = await sharp(shrunk, {
    raw: { width: SHEET_W, height: SHEET_H, channels: 4 },
  })
    .png({ palette: true, colours: PALETTE_COLOURS, effort: 10 })
    .toBuffer();

  return sharp(quantized).ensureAlpha().png({ palette: false, compressionLevel: 9 }).toBuffer();
}

/** 규격대로인가 — 크기가 맞고 PNG 이며 알파가 있는가 */
async function alreadyFine(src: string): Promise<boolean> {
  const head = readFileSync(src).subarray(0, 8);
  const isPng = head.toString('hex').startsWith('89504e47');
  if (!isPng) return false;
  const meta = await sharp(src).metadata();
  return meta.width === SHEET_W && meta.height === SHEET_H && meta.hasAlpha === true;
}

mkdirSync(OUT_DIR, { recursive: true });

let copied = 0;
let baked = 0;
const missing: string[] = [];

for (let n = 1; n <= COUNT; n++) {
  const src = resolve(SRC_DIR, `${n}.png`);
  if (!existsSync(src)) {
    missing.push(`${n}.png`);
    continue;
  }
  const out = resolve(OUT_DIR, `${String(n).padStart(2, '0')}.png`);

  if (await alreadyFine(src)) {
    copyFileSync(src, out);
    copied += 1;
  } else {
    writeFileSync(out, await convert(src));
    baked += 1;
  }
}

console.log(
  `${copied + baked}/${COUNT}장 -> public/assets/characters/` +
    (baked > 0 ? ` (그대로 ${copied}장 · ${SHEET_W}×${SHEET_H} 로 구운 것 ${baked}장)` : ''),
);

if (missing.length > 0) {
  console.error(
    `없는 파일: ${missing.join(', ')}\n` +
      `raw-assets/characters/ 바로 아래에 1.png ~ ${COUNT}.png 를 두어라. ` +
      `zip이 pack/ 으로 한 겹 감싸 있으면 꺼내야 한다.`,
  );
  process.exitCode = 1;
}

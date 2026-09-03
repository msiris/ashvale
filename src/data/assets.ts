/**
 * 에셋 매니페스트 — 파일 경로를 코드에 박지 않기 위한 유일한 출처.
 *
 * 규칙 (CLAUDE.md, docs/ASSETS.md):
 *  - `path` 가 null 이면 아직 파일이 없다. 플레이스홀더를 그리고 **게임은 그대로 돈다.**
 *  - Kenney 타일셋은 `spacing: 1`, 캐릭터 팩은 `spacing: 0`. 값을 공유하지 않는다.
 *  - 여기 없는 에셋은 프로젝트에 넣지 않는다.
 *
 * 캐릭터 15장은 조달됐다. 타일셋은 아직 원본을 받지 않아 null 이고,
 * 그 자리는 플레이스홀더 지형색으로 그린다.
 */

import type { PaletteKey } from './palette';
import { CHAR_SHEET, CHAR_ROSTER } from './characters';

export type AssetKind = 'tileset' | 'character' | 'ui' | 'illustration';

export interface SheetSpec {
  frameWidth: number;
  frameHeight: number;
  spacing: number;
  margin: number;
  columns?: number;
  rows?: number;
}

export interface AssetLicense {
  source: string;
  type: string;
}

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  /** public/ 기준 상대 경로. null 이면 미조달 */
  path: string | null;
  sheet?: SheetSpec;
  /** 파일이 없을 때 대신 그릴 것 */
  placeholder: {
    label: string;
    color: PaletteKey;
    /** 플레이스홀더 한 장의 크기. 없으면 sheet 프레임 크기를 쓴다 */
    width?: number;
    height?: number;
  };
  license?: AssetLicense;
}

/**
 * **지형은 파일로 싣지 않는다.**
 *
 * 외부 타일셋(Kenney) 대신 팔레트 색으로 직접 그리기로 했다.
 * 지형의 생김새는 src/data/terrain.ts 의 TERRAIN_LOOK 이 유일한 출처이고,
 * 그리는 일은 src/render/terrain.ts 가 한다. 그래서 여기 실을 것이 없다.
 *
 * 나중에 타일셋을 쓰기로 하면 여기에 항목을 더하고
 * `sheet: { frameWidth: 16, frameHeight: 16, spacing: 1, margin: 0 }` 을 준다.
 * **Kenney 시트는 에셋 사이에 1px 간격이 있다.** 16으로 그냥 자르면 밀린다.
 */

/** 캐릭터 시트 값은 characters.ts 에서 그대로 가져온다. 다시 적지 않는다 */
const CHARACTER_SHEET: SheetSpec = {
  frameWidth: CHAR_SHEET.frameWidth,
  frameHeight: CHAR_SHEET.frameHeight,
  spacing: CHAR_SHEET.spacing,
  margin: CHAR_SHEET.margin,
  columns: CHAR_SHEET.columns,
  rows: CHAR_SHEET.rows,
};

/** 역할별 플레이스홀더 색. 배역이 정해지기 전에도 서로 구분되게 */
const ROLE_COLOR: Record<'hero' | 'companion' | 'patron', PaletteKey> = {
  hero: 'clothCool',
  companion: 'clothWarm',
  patron: 'stone',
};

/**
 * 배역 배정은 기획서 §12 의 표를 그대로 따른다.
 *   1 = 플레이어 / 2–9 = 관계 대상 8명 / 10–15 = 의뢰인 6명
 * CHAR_ROSTER 의 나열 순서가 이 번호와 같으므로 자리 순서로 짝지으면 된다.
 * 파일은 scripts/copy-characters.ts 가 01..15.png 로 옮겨 둔다.
 */
const CHARACTERS: AssetEntry[] = CHAR_ROSTER.map((slot, i) => ({
  id: slot.spriteId,
  kind: 'character' as const,
  path: `assets/characters/${String(i + 1).padStart(2, '0')}.png`,
  sheet: CHARACTER_SHEET,
  placeholder: {
    label: slot.bind === '*' ? `${slot.role} 예비` : slot.bind,
    color: ROLE_COLOR[slot.role],
  },
  license: {
    source: 'https://piano-no-renshu.itch.io/top-down-character-sprites',
    type: 'CC0-1.0',
  },
}));

/**
 * 이야기 안에서만 서는 것들 (§11 곁가지, §7).
 *
 * 캐릭터 팩에는 갑옷도 나무뿌리도 없다. **`path` 가 null 이라 플레이스홀더로 선다** —
 * 그래도 서 있어야 한다. 안 서면 길을 막기만 하는 벽이 되어
 * 무엇 때문에 못 지나가는지 알 수가 없다.
 *
 * 그림이 생기면 여기 `path` 만 채우면 된다. 코드는 손대지 않는다.
 */
const FIGURES: AssetEntry[] = [
  {
    id: 'figure:foe',
    kind: 'character',
    path: null,
    sheet: CHARACTER_SHEET,
    placeholder: { label: '마주섬', color: 'blood' },
  },
  {
    id: 'figure:folk',
    kind: 'character',
    path: null,
    sheet: CHARACTER_SHEET,
    placeholder: { label: '세력민', color: 'stone' },
  },
];

export const ASSETS: readonly AssetEntry[] = [...CHARACTERS, ...FIGURES];

const BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

export function getAsset(id: string): AssetEntry | undefined {
  return BY_ID.get(id);
}

/** 파일이 실제로 있는가. 없으면 부르는 쪽은 플레이스홀더로 간다 */
export function hasFile(entry: AssetEntry): boolean {
  return entry.path !== null;
}

/** 아직 조달되지 않은 것들. 디버그 화면이 이걸 보여 준다 */
export function missingAssets(): AssetEntry[] {
  return ASSETS.filter((a) => !hasFile(a));
}

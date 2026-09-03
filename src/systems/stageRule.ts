/**
 * 판마다 걷는 규칙이 다르다 (§11 곁가지) — 순수 함수.
 *
 * 판을 다섯으로 늘렸는데 하는 일은 **걸어서 통과하는 것뿐**이었다.
 * 지형만 바뀌고 규칙이 같으니, 판이 늘어난 만큼 같은 복도가 늘어난 셈이었다.
 *
 * 지형마다 발밑이 다르게 굴게 한다.
 *   `crack`  유리 — 밟은 칸에 금이 간다. **두 번째로 밟으면 깨진다**
 *   `vanish` 걸어 다니는 길 — 밟고 지난 칸이 **바로 사라진다**
 *   `rift`   골짜기 — 갈라진 자리가 걸음 수에 따라 **열리고 닫힌다**
 *
 * 나머지 지형(숲·탑·마을)에는 규칙을 걸지 않는다. 판마다 규칙이 있으면
 * 걷는 일이 전부 시험이 되어 이야기를 읽을 자리가 없다.
 *
 * 규칙 때문에 갇힐 수 있다. 그때는 마을로 돌려보낸다 —
 * 나갈 데가 없는 채로 방향판만 눌러 보게 두면 고장으로 보인다.
 */

import type { GameState } from '@/types/game';
import type { EpisodeLook } from '@/data/content/episodes';
import type { TileMapData } from '@/types/map';
import { isBlocked } from './map';

export type StageRule = 'crack' | 'vanish' | 'rift';

const RULES: Partial<Record<EpisodeLook, StageRule>> = {
  glass: 'crack',
  road: 'vanish',
  valley: 'rift',
};

export function ruleOf(look: EpisodeLook): StageRule | null {
  return RULES[look] ?? null;
}

/** 판에 들어설 때 알려 주는 한 줄. 규칙을 모르고 밟으면 함정이다 */
export const RULE_TEXT: Record<StageRule, string> = {
  crack: '밟은 자리마다 금이 갔다. 두 번 밟은 데는 버티지 못할 것 같았다.',
  vanish: '지나온 자리가 곧바로 사라졌다. 되짚어 갈 데가 없었다.',
  rift: '갈라진 자리가 몇 걸음마다 벌어지고 다시 닫혔다. 때를 봐야 했다.',
};

/** 갈라진 틈이 이 걸음 수마다 열닫힌다 */
export const RIFT_PERIOD = 6;
/** 그중 몇 걸음이 벌어진 채인가 */
export const RIFT_OPEN = 3;

/** 틈이 지금 벌어져 있는가 (rift 판) */
export function riftOpen(steps: number): boolean {
  return steps % RIFT_PERIOD < RIFT_OPEN;
}

/**
 * 이 판에서 규칙 때문에 **추가로** 막힌 칸.
 *
 * 맵의 collision 은 손대지 않는다 — 맵은 캐시되고 여러 판이 같은 것을
 * 나눠 쓴다. 여기서 만든 집합을 이동 판정에 얹는 방식으로 둔다.
 */
export function extraBlocked(
  state: GameState,
  look: EpisodeLook | null,
  map: TileMapData | null,
): ReadonlySet<string> {
  const empty: ReadonlySet<string> = new Set<string>();
  if (look === null || state.episodeRun === null) return empty;
  const rule = ruleOf(look);
  if (rule === null) return empty;

  const stepped = state.world.steppedTiles;
  const here = state.world.heroTile;

  if (rule === 'crack') {
    // 두 번 밟힌 칸만 깨진다. 한 번 밟은 자리는 아직 지날 수 있다
    const count = new Map<string, number>();
    for (const key of stepped) count.set(key, (count.get(key) ?? 0) + 1);
    const out = new Set<string>();
    for (const [key, n] of count) {
      if (n >= 2 && key !== `${here.x},${here.y}`) out.add(key);
    }
    return out;
  }

  if (rule === 'vanish') {
    // 지나온 자리가 사라진다. 지금 서 있는 칸은 아직 남아 있다
    const out = new Set<string>(stepped);
    out.delete(`${here.x},${here.y}`);
    return out;
  }

  // rift — 갈라진 자리는 지형이 정해 준다. 벌어진 동안만 막힌다
  if (map === null || !riftOpen(stepped.length)) return empty;
  return riftTiles(map);
}

/**
 * 갈라진 자리.
 *
 * 길 위에서 가로로 한 줄. 지형을 새로 만들지 않고 **길의 가운데 줄**을
 * 쓴다 — 맵 만드는 쪽이 규칙을 알 필요가 없다.
 */
export function riftTiles(map: TileMapData): ReadonlySet<string> {
  const out = new Set<string>();
  const y = Math.floor(map.height / 2) - 2;
  for (let x = 1; x < map.width - 1; x++) {
    if (!isBlocked(map, x, y)) out.add(`${x},${y}`);
  }
  return out;
}

/**
 * 갇혔는가.
 *
 * 사방이 다 막혔으면 규칙이 길을 다 지운 것이다. 부르는 쪽이 마을로 돌려보낸다.
 */
export function trapped(
  state: GameState,
  map: TileMapData | null,
  blocked: ReadonlySet<string>,
): boolean {
  if (map === null) return false;
  const { x, y } = state.world.heroTile;
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (isBlocked(map, nx, ny)) continue;
    if (blocked.has(`${nx},${ny}`)) continue;
    return false;
  }
  return true;
}

/** 갇혀서 돌아올 때 잃는 기력 */
export const TRAPPED_HP = 3;
export const TRAPPED_TEXT =
  '발 디딜 데가 없어졌다. 되짚어 나오는 데 하루가 다 갔다.';

/**
 * 걷는 규칙 (§11) — 순수 함수.
 *
 * 발밑이 데마다 다르게 군다. 처음에는 에피소드 판에만 걸었는데,
 * **매주 가는 데는 지역이다.** 지역이 여섯인데 여섯 다 같은 땅을 같은
 * 방식으로 걸으니, 지역을 늘린 만큼 같은 들판이 늘어난 셈이었다.
 *
 * 규칙 다섯.
 *   `crack`  두 번 밟은 자리가 깨진다
 *   `vanish` 지나온 자리가 곧바로 사라진다
 *   `sink`   밟은 자리가 몇 걸음 뒤 가라앉는다
 *   `rift`   갈라진 자리가 주기적으로 벌어지고 닫힌다
 *   `dark`   멀리 있는 표식이 보이지 않는다
 *
 * 앞의 넷은 **못 지나가는 칸**을 만든다. `dark` 만 성격이 다르다 —
 * 길을 막지 않고 보이는 것을 줄인다. 걷는 이유가 '찾는 것' 이 된다.
 *
 * **어디에도 안 거는 데를 남긴다.** 첫 지역(속삭이는 숲)과 숲·탑·마을 판은
 * 규칙이 없다. 배우는 자리가 없으면 규칙이 다 함정으로 느껴진다.
 */

import type { GameState } from '@/types/game';
import type { EpisodeLook } from '@/data/content/episodes';
import type { TileMapData } from '@/types/map';
import { isBlocked } from './map';
import { parseEpisodeMap } from '@/data/maps/episode';
import { regionIdFromMap } from '@/data/regions';
import { currentStage } from './episodes';

export type WalkRule = 'crack' | 'vanish' | 'sink' | 'rift' | 'dark';

/** 에피소드 판의 지형별 규칙 */
const LOOK_RULES: Partial<Record<EpisodeLook, WalkRule>> = {
  glass: 'crack',
  road: 'vanish',
  valley: 'rift',
};

/**
 * 지역별 규칙 (§11).
 *
 * 난이도 순서대로 험해진다. **속삭이는 숲에는 걸지 않는다** —
 * 첫 지역은 걷는 법을 배우는 데다.
 */
const REGION_RULES: Record<string, WalkRule> = {
  gate: 'crack',
  marsh: 'sink',
  peaks: 'rift',
  deep: 'dark',
  rift: 'vanish',
};

export function ruleForLook(look: EpisodeLook): WalkRule | null {
  return LOOK_RULES[look] ?? null;
}

export function ruleForRegion(regionId: string): WalkRule | null {
  return REGION_RULES[regionId] ?? null;
}

/**
 * 지금 서 있는 데의 규칙.
 *
 * 에피소드 판이면 그 판의 지형이 정하고, 지역이면 지역이 정한다.
 * 마을과 실내는 규칙이 없다 — 집 안에서 발판이 무너지면 안 된다.
 */
export function ruleOfMap(state: GameState): WalkRule | null {
  const ep = parseEpisodeMap(state.world.currentMap);
  if (ep !== null) {
    const look = currentStage(state)?.stage.look;
    return look === undefined ? null : ruleForLook(look);
  }
  const regionId = regionIdFromMap(state.world.currentMap);
  return regionId === null ? null : ruleForRegion(regionId);
}

/** 걸음을 남기는 데인가. 마을·실내에서는 남기지 않는다 */
export function tracksSteps(mapId: string): boolean {
  return parseEpisodeMap(mapId) !== null || regionIdFromMap(mapId) !== null;
}

/** 들어설 때 알려 주는 한 줄. 규칙을 모르고 밟으면 함정이다 */
export const RULE_TEXT: Record<WalkRule, string> = {
  crack: '밟은 자리마다 금이 갔다. 두 번 밟은 데는 버티지 못할 것 같았다.',
  vanish: '지나온 자리가 곧바로 사라졌다. 되짚어 갈 데가 없었다.',
  sink: '밟은 자리가 몇 걸음 뒤에 가라앉았다. 오래 머물 데가 아니었다.',
  rift: '갈라진 자리가 몇 걸음마다 벌어지고 다시 닫혔다. 때를 봐야 했다.',
  dark: '두어 걸음 앞이 겨우 보였다. 있는 것을 찾아 걸어야 했다.',
};

/** 지역 선택 화면에 적는 짧은 말 */
export const RULE_SHORT: Record<WalkRule, string> = {
  crack: '두 번 밟은 자리가 깨진다',
  vanish: '지나온 자리가 사라진다',
  sink: '밟은 자리가 가라앉는다',
  rift: '갈라진 자리가 열리고 닫힌다',
  dark: '표식이 가까이서만 보인다',
};

/** 갈라진 틈이 이 걸음 수마다 열닫힌다 */
export const RIFT_PERIOD = 6;
/** 그중 몇 걸음이 벌어진 채인가 */
export const RIFT_OPEN = 3;
/** 밟고 몇 걸음 뒤에 가라앉는가 */
export const SINK_DELAY = 3;
/** 어두운 데서 표식이 보이는 거리 (칸) */
export const DARK_RADIUS = 4;

/** 틈이 지금 벌어져 있는가 */
export function riftOpen(steps: number): boolean {
  return steps % RIFT_PERIOD < RIFT_OPEN;
}

/**
 * 규칙 때문에 **추가로** 막힌 칸.
 *
 * 맵의 collision 은 손대지 않는다 — 맵은 캐시되고 여러 판이 같은 것을
 * 나눠 쓴다. 여기서 만든 집합을 이동 판정에 얹는 방식으로 둔다.
 *
 * 지금 서 있는 칸은 어느 규칙에서도 막지 않는다. 서 있는 데가 막히면
 * 그 자리에서 갇힌 것으로 판정되어 곧장 쫓겨난다.
 */
export function extraBlocked(state: GameState, map: TileMapData | null): ReadonlySet<string> {
  const empty: ReadonlySet<string> = new Set<string>();
  const rule = ruleOfMap(state);
  if (rule === null) return empty;

  const stepped = state.world.steppedTiles;
  const here = state.world.heroTile;
  const standing = `${here.x},${here.y}`;

  if (rule === 'crack') {
    // 두 번 밟힌 칸만 깨진다. 한 번 밟은 자리는 아직 지날 수 있다
    const count = new Map<string, number>();
    for (const key of stepped) count.set(key, (count.get(key) ?? 0) + 1);
    const out = new Set<string>();
    for (const [key, n] of count) {
      if (n >= 2 && key !== standing) out.add(key);
    }
    return out;
  }

  if (rule === 'vanish') {
    /**
     * **직전 한 칸은 남긴다.**
     *
     * 지나온 자리를 전부 지우면 길에서 한 칸만 벗어나도 되돌아 나올 수가 없어,
     * 막다른 자리에 들어서는 순간 갇힌다. 실제로 자주 갇혔다.
     * 한 칸만 남겨 두면 잘못 들어선 것을 한 번은 물릴 수 있다 —
     * 되짚어 갈 데가 없다는 결은 그대로다.
     */
    const out = new Set<string>(stepped);
    out.delete(standing);
    const back = stepped[stepped.length - 1];
    if (back !== undefined) out.delete(back);
    return out;
  }

  if (rule === 'sink') {
    // 밟은 지 SINK_DELAY 걸음이 지난 자리만 가라앉는다
    const out = new Set<string>();
    stepped.forEach((key, i) => {
      if (stepped.length - i >= SINK_DELAY && key !== standing) out.add(key);
    });
    return out;
  }

  if (rule === 'rift') {
    if (map === null || !riftOpen(stepped.length)) return empty;
    const out = new Set<string>(riftTiles(map));
    out.delete(standing);
    return out;
  }

  // dark — 길을 막지 않는다. 보이는 것만 줄인다
  return empty;
}

/**
 * 갈라진 자리.
 *
 * 맵 가운데를 가로지르는 한 줄. 지형을 새로 만들지 않고 **걸을 수 있는
 * 칸만** 골라 쓴다 — 맵 만드는 쪽이 규칙을 알 필요가 없다.
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
 * 사방이 다 막혔고 **여기서 할 수 있는 것도 없을 때만** 갇힌 것이다.
 *
 * 처음에는 사방만 봤는데, 그러면 **출구 칸에 도착한 것도 갇힘으로 읽혔다** —
 * 나가는 문은 맵 테두리에 붙어 있어 사방이 테두리와 지나온 자리뿐이다.
 * 다음 판으로 나가려고 거기까지 걸어간 사람을 붙잡아 마을로 쫓아냈다.
 *
 * 그래서 두 가지를 더 본다.
 *   서 있는 칸에 문·표식이 있으면 A 로 빠져나갈 수 있다
 *   옆 칸에 말 걸 것이 서 있으면 그것도 할 일이다 (마지막 판에 마주설 것)
 */
export function trapped(
  state: GameState,
  map: TileMapData | null,
  blocked: ReadonlySet<string>,
): boolean {
  if (map === null) return false;
  const { x, y } = state.world.heroTile;

  // 서 있는 칸에서 할 수 있는 것 — 문으로 나가거나 표식을 밟는다
  const under = map.objects.find((o) => o.x === x && o.y === y);
  if (under !== undefined && under.type !== 'npc') return false;

  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;

    // 막고 서 있어도 말은 걸 수 있다. 갇힌 게 아니다
    const there = map.objects.find((o) => o.x === nx && o.y === ny);
    if (there !== undefined && there.type === 'npc') return false;

    if (isBlocked(map, nx, ny)) continue;
    if (blocked.has(`${nx},${ny}`)) continue;
    return false;
  }
  return true;
}

/** 갇힌 자리를 두고 마을로 돌아올 때 잃는 기력 */
export const TRAPPED_HP = 3;
export const TRAPPED_TEXT = '발 디딜 데가 없어졌다. 되짚어 나오는 데 하루가 다 갔다.';

/** 갇힌 자리를 처음부터 다시 걸을 때 잃는 기력. 공짜면 규칙이 아무것도 막지 못한다 */
export const RETRY_SPOT_HP = 1;
export const RETRY_SPOT_TEXT = '되짚어 입구까지 나왔다. 처음부터 다시 걷는다.';

/** 갇혔을 때 화면에 뜨는 말 */
export const STUCK_TITLE = '더 갈 데가 없다';
export const STUCK_BODY =
  '밟은 자리가 다 무너져 사방이 막혔다. 여기서 나가려면 되짚어 입구까지 가야 한다.';

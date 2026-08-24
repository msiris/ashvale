/**
 * 나들이 — 인물이 가끔 딴 데 가 있다 (§7.6, §10).
 *
 * 상주 인물이 숙소에만 붙박여 있으면 찾아갈 이유가 한 곳뿐이다.
 * 주마다 한 명이 마을 어딘가에 나가 있고, 거기서 말을 걸면 그 자리의 일이 벌어진다.
 *
 * **세이브에 칸을 늘리지 않는다.** 누가 어디 있는지는 주차와 세이브 시드에서
 * 뽑는다 — 같은 주에는 늘 같은 자리다. 난수를 굴리면 새로고침마다 사람이
 * 순간이동한다. 주가 넘어가면 저절로 다른 자리가 된다.
 */

import type { CompanionRecord, GameState } from '@/types/game';
import { createRng } from './rng';
import { getBuilding } from '@/data/buildings';
import { seedOf } from './newGame';

/** 나가 있을 수 있는 곳. 숙소는 집이라 빼고, 지어진 건물만 */
const PLACES = ['hall', 'market', 'library', 'shrine', 'guildhall', 'academy', 'spire'];

/** 주마다 이 확률로 한 명이 나가 있다 */
const OUTING_CHANCE = 0.6;

export interface Outing {
  companionId: string;
  buildingId: string;
}

/**
 * 이번 주에 나가 있는 사람.
 *
 * 다친 사람은 나가지 않는다. 동행 중인 사람도 아니다 — 같이 걷고 있으니까.
 */
export function outingOf(state: GameState): Outing | null {
  const here = Object.values(state.companions).filter(
    (c) =>
      c.departedTurn === null &&
      c.id !== state.escort &&
      c.injuredUntilTurn <= state.world.turn,
  );
  if (here.length === 0) return null;

  const open = PLACES.filter((id) => {
    const level = state.town.buildings[id] ?? 0;
    return level > 0 && getBuilding(id)?.indoor === true;
  });
  if (open.length === 0) return null;

  // 주차가 씨앗에 들어간다. 같은 주에는 늘 같은 답이 나온다
  const rng = createRng(`${seedOf(state)}:outing:${state.world.turn}`);
  if (!rng.chance(OUTING_CHANCE)) return null;

  const who = rng.pick(here);
  const place = rng.pick(open);
  if (who === undefined || place === undefined) return null;

  return { companionId: who.id, buildingId: place };
}

/** 그 건물에 나와 있는 사람. 없으면 null */
export function visitorAt(state: GameState, buildingId: string): CompanionRecord | null {
  const outing = outingOf(state);
  if (outing === null || outing.buildingId !== buildingId) return null;
  return state.companions[outing.companionId] ?? null;
}

/** 지금 나가 있는가. 숙소·마을 배치에서 빼야 한다 */
export function isOut(state: GameState, companionId: string): boolean {
  return outingOf(state)?.companionId === companionId;
}

/**
 * 의뢰인 나들이 (§7.6).
 *
 * 의뢰인이 회관에만 있으니 마을이 텅 비어 보인다. 주마다 한 명은 밖에 나와
 * 마을에 서 있다. **다가오지는 않는다** — §7.6 의 "의뢰인은 찾아가야 만난다"
 * 는 그대로다. 다만 찾아갈 곳이 회관 하나가 아니게 된다.
 *
 * 관계 대상 나들이와 다른 씨앗을 쓴다. 안 그러면 둘이 늘 같은 주에 움직인다.
 */
const PATRON_OUT_CHANCE = 0.5;

export function patronOutingOf(state: GameState, patronIds: string[]): string | null {
  const here = patronIds.filter((id) => state.patrons[id] !== undefined || true);
  if (here.length === 0) return null;

  const rng = createRng(`${seedOf(state)}:patron-out:${state.world.turn}`);
  if (!rng.chance(PATRON_OUT_CHANCE)) return null;
  return rng.pick(here) ?? null;
}

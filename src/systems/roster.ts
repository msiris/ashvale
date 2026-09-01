/**
 * 관계 대상 명단이 자라는 길 (§7.1, §7.4) — 순수 함수.
 *
 * 새 인물은 스스로 오지 않는다. **의뢰인의 소개**나 **맹우의 소개 연쇄**로만 들어온다.
 * 소개 연쇄를 우애 트랙 전용으로 둔 게 §7.4 의 핵심이다 —
 * 전원을 연심으로 밀면 로스터 성장이 멈춘다. 벌이 아니라 기회비용이다.
 */

import type { CompanionOrigin, CompanionRecord, GameState } from '@/types/game';
import { ARCHETYPES, COMPANION_LIMIT, getArchetype } from '@/data/archetypes';
import { LODGE_SLOTS_PER_LEVEL } from '@/data/buildings';
import { canRefer } from './confession';

/** 지금 명단에 있는(떠나지 않은) 인원 */
export function rosterSize(state: GameState): number {
  return Object.values(state.companions).filter((c) => c.departedTurn === null).length;
}

export function rosterFull(state: GameState): boolean {
  return rosterSize(state) >= COMPANION_LIMIT;
}

/**
 * 다음에 들어올 원형을 고른다.
 * 아직 없는 원형을 먼저 채우고, 여섯이 다 차면 중복을 허용한다 (§12 예비 자리 2개).
 */
function nextArchetype(state: GameState): string {
  const used = new Set(
    Object.values(state.companions)
      .filter((c) => c.departedTurn === null)
      .map((c) => c.archetypeId),
  );
  const fresh = ARCHETYPES.find((a) => !used.has(a.id));
  return fresh?.id ?? ARCHETYPES[0]?.id ?? 'knight';
}

/**
 * 숙소에 상주하는 인물 (§7.4, §10).
 *
 * 고백을 받아들이면 마을에 상주 위치가 생긴다 — 그게 숙소다.
 * 자리는 숙소 레벨당 둘. 자리가 없으면 아직 들어오지 못한다.
 */
export function residentsOf(state: GameState): CompanionRecord[] {
  const capacity = (state.town.buildings['lodge'] ?? 0) * LODGE_SLOTS_PER_LEVEL;
  if (capacity <= 0) return [];

  return Object.values(state.companions)
    .filter((c) => c.departedTurn === null && c.track === 'romance' && c.confessed === 'accepted')
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, capacity);
}

export interface RosterGrowth {
  state: GameState;
  companion: CompanionRecord;
}

/**
 * 새 인물을 명단에 올린다. 상한 8명 (§7.1).
 * **이름은 비워 둔다** — 이름은 플레이어가 붙인다.
 */
export function addCompanion(
  state: GameState,
  origin: CompanionOrigin,
  /**
   * 데려오고 싶은 원형. 이야기가 정해 둔 사람이 있을 때 쓴다 (동화 에피소드).
   *
   * **이미 명단에 있는 원형이면 무시한다.** 있는 사람만 또 오면
   * 못 본 원형은 영영 못 본다 — 빈자리부터 채우는 쪽이 낫다.
   */
  prefer?: string,
): RosterGrowth | null {
  if (rosterFull(state)) return null;

  const taken = new Set(
    Object.values(state.companions)
      .filter((c) => c.departedTurn === null)
      .map((c) => c.archetypeId),
  );
  const archetypeId =
    prefer !== undefined && prefer !== '' && !taken.has(prefer) ? prefer : nextArchetype(state);
  // id 는 세이브 안에서만 유일하면 된다. 시계를 읽지 않는다
  let n = Object.keys(state.companions).length + 1;
  while (state.companions[`c${n}`] !== undefined) n += 1;

  const companion: CompanionRecord = {
    id: `c${n}`,
    archetypeId,
    name: '',
    affinity: 0,
    track: null,
    confessed: 'none',
    clearedEvents: [],
    lastApproachTurn: 0,
    injuredUntilTurn: 0,
    images: {},
    pickedSlot: 0,
    unlockedSlots: [0],
    homeRegion: getArchetype(archetypeId)?.homeRegion ?? '',
    origin,
    joinedTurn: state.world.turn,
    departedTurn: null,
  };

  return {
    state: { ...state, companions: { ...state.companions, [companion.id]: companion } },
    companion,
  };
}

/**
 * 마을에 서 있는 인물 (§7.6, §10).
 *
 * 이게 없어서 명단에 있는 사람이 **마을 어디에도 없었다.** 마을 맵에는
 * 기사 하나가 좌표까지 박힌 채로 서 있었고, 나머지는 문턱을 넘어
 * 다가올 때만 잠깐 나타났다가 사라졌다. 말을 걸려면 다가와 주기를
 * 기다리는 수밖에 없었다 — 찾아갈 데가 없으니 관계가 자리를 못 얻는다.
 *
 * 빠지는 사람:
 *   - 숙소에 사는 연인은 숙소 안에 있다 (residentsOf)
 *   - 지금 동행 중인 사람은 함께 지역에 나가 있다
 *
 * 순서를 명단에 들어온 차례로 고정한다. 자리가 흔들리면 갔던 데를 또 못 찾는다.
 */
export function townFolk(state: GameState): CompanionRecord[] {
  const indoors = new Set(residentsOf(state).map((c) => c.id));

  return Object.values(state.companions)
    .filter(
      (c) => c.departedTurn === null && !indoors.has(c.id) && c.id !== state.escort,
    )
    .sort((a, b) => a.joinedTurn - b.joinedTurn || a.id.localeCompare(b.id));
}

/** 소개를 이미 한 사람에게 박는 표. clearedEvents 에 넣는다 */
export const REFERRED = 'referred';

/**
 * 맹우의 소개 연쇄 (§7.4, §3 6단계 "해금 판정 — 인물").
 *
 * **이게 죽은 코드였다.** `canRefer` 는 있었는데 부르는 곳이 없어서
 * 새 인물이 들어오는 길은 의뢰 보상 하나뿐이었다 — 의뢰를 다 하면 명단이
 * 거기서 멈춘다. §7.4 가 소개 연쇄를 **우애 트랙 전용**으로 둔 이유가
 * 있는데(전원을 연심으로 밀면 로스터 성장이 멈춘다) 그 대비가 성립하지
 * 않았다. 벌이 아니라 기회비용이어야 한다.
 *
 * 한 사람이 한 번만 소개한다. 상한(8명)에 닿으면 아무 일도 없다.
 */
export interface Referral {
  /** 데려온 사람 */
  referrer: CompanionRecord;
  /** 새로 들어온 사람. 이름은 비어 있다 (§7.1) */
  joined: CompanionRecord;
}

export function runReferrals(state: GameState): { state: GameState; made: Referral[] } {
  let next = state;
  const made: Referral[] = [];

  // 호감이 높은 쪽부터. 순서가 흔들리면 같은 주에 누가 데려올지 달라진다
  const referrers = Object.values(state.companions)
    .filter((c) => canRefer(c) && !c.clearedEvents.includes(REFERRED))
    .sort((a, b) => b.affinity - a.affinity || a.id.localeCompare(b.id));

  for (const who of referrers) {
    if (rosterFull(next)) break;

    const grown = addCompanion(next, 'referral');
    if (grown === null) break;

    // 소개한 사람에게 표를 박는다. 같은 사람이 계속 데려오면 상한만 채운다
    const marked = {
      ...(grown.state.companions[who.id] ?? who),
      clearedEvents: [...who.clearedEvents, REFERRED],
    };
    next = {
      ...grown.state,
      companions: { ...grown.state.companions, [who.id]: marked },
    };
    made.push({ referrer: who, joined: grown.companion });
  }

  return { state: next, made };
}

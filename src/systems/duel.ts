/**
 * 마주섬 겨룸 (§11 곁가지) — 순수 함수.
 *
 * 규칙만 여기 있고 문장은 `content/duel-text.ts` 에 있다.
 *
 * **주사위를 굴리지 않는다.** 상대의 자세는 미리 정해져 있고(결정적),
 * 그것을 얼마나 좁혀 보여 주는지만 능력치가 정한다. 그래서 잘 읽으면
 * 이기고 못 읽으면 진다 — 숫자가 결과를 굴리는 자리가 아니다.
 *
 * 저울(track)은 −2 부터 +2 까지다. +2 에 닿으면 그 자리에서 넘긴 것이고
 * −2 면 밀린 것이다. 세 판을 다 겨뤘으면 **반걸음이라도 앞서 있어야 넘긴다.**
 *
 * 처음에는 팽팽하게 끝나도 넘긴 것으로 뒀는데, 그러면 한 자세만 반복해도
 * 열 번에 여덟은 넘어갔다 — 고르는 일이 없는 것과 같다.
 * 읽지 못했으면 못 넘긴다. 대신 못 넘겨도 끝낸 표를 남기지 않으니 다시 갈 수 있다.
 */

import type { GameState } from '@/types/game';
import type { EpisodeBoss } from '@/data/content/episodes';
import type { Stance } from '@/data/content/duel-text';
import { STANCES } from '@/data/content/duel-text';
import { FAVOR_TO_ROLL } from '@/data/content/episodes';
import { relicBonus } from './relics';
import { escortBonus } from './escort';
import { escortOf } from './escort';
import { createRng } from './rng';

/** 겨룸은 세 판이다 */
export const DUEL_ROUNDS = 3;

/** 저울이 여기 닿으면 갈린다 */
export const DUEL_EDGE = 2;

/** 되돌리기를 쓸 수 있는 결 */
export const RETRY_FAVOR = 4;

/**
 * 자세 상성.
 *
 *   버팀 → 밀어붙임을 받아넘긴다
 *   밀어붙임 → 물러섬을 밀어낸다
 *   물러섬 → 버팀을 흘려보낸다
 */
const BEATS: Record<Stance, Stance> = {
  hold: 'press',
  press: 'yield',
  yield: 'hold',
};

export type RoundOutcome = 'win' | 'lose' | 'draw';

export function judge(mine: Stance, theirs: Stance): RoundOutcome {
  if (mine === theirs) return 'draw';
  return BEATS[mine] === theirs ? 'win' : 'lose';
}

/**
 * 이 판에서 상대가 취할 자세.
 *
 * 에피소드와 주차와 판 번호로 고정한다. **같은 판에서는 몇 번을 봐도 같다** —
 * 흔들리면 미리 보여 준 기색이 거짓말이 된다.
 */
export function theirStance(state: GameState, episodeId: string, round: number): Stance {
  const rng = createRng(`${episodeId}:${state.world.turn}:duel:${round}`);
  return rng.pick(STANCES) ?? 'hold';
}

/**
 * 읽는 눈.
 *
 * 보스가 요구하는 능력치와, 유물·동행이 더해 준 만큼을 본다.
 * 난도보다 눈이 밝으면 **하나로 짚이고**, 모자라면 둘까지만 좁혀진다.
 *
 * 판정을 없앤 자리에 능력치가 들어갈 데를 남긴 것이다 — 능력치가
 * 결과를 굴리지는 않지만, 무엇을 보고 고를지는 바꾼다.
 */
export function readValue(state: GameState, boss: EpisodeBoss): number {
  const bonus = relicBonus(state);
  const stat = state.hero.stats[boss.stat] + (bonus.stats[boss.stat] ?? 0);
  const escort = escortBonus(escortOf(state), boss.stat).roll;
  const favor = Math.floor((state.episodeRun?.favor ?? 0) * FAVOR_TO_ROLL);
  return stat + escort + favor;
}

/** 눈이 밝으면 하나, 모자라면 둘 */
export function readsClearly(state: GameState, boss: EpisodeBoss): boolean {
  return readValue(state, boss) >= Math.ceil(boss.difficulty / 2);
}

/**
 * 화면에 보여 줄 후보.
 *
 * 하나로 짚이면 한 개, 아니면 정답을 포함한 두 개. 순서도 고정한다 —
 * 매번 흔들리면 순서에서 정답이 새어 나간다.
 */
export function tellCandidates(
  state: GameState,
  boss: EpisodeBoss,
  episodeId: string,
  round: number,
): Stance[] {
  const theirs = theirStance(state, episodeId, round);
  if (readsClearly(state, boss)) return [theirs];

  const rng = createRng(`${episodeId}:${state.world.turn}:tell:${round}`);
  const others = STANCES.filter((s) => s !== theirs);
  const decoy = rng.pick(others) ?? others[0] ?? theirs;
  // 자세 순서(STANCES)대로 세운다. 정답이 늘 앞에 오면 답을 알려 주는 셈이다
  return STANCES.filter((s) => s === theirs || s === decoy);
}

/** 저울이 갈렸는가 */
export function duelSettled(track: number, round: number): boolean {
  return Math.abs(track) >= DUEL_EDGE || round >= DUEL_ROUNDS;
}

/**
 * 겨룸의 끝. **반걸음이라도 앞서 있어야 넘긴다.**
 *
 * 팽팽함(0)은 못 넘긴 것으로 본다. 넘긴 것으로 두면 아무 자세나
 * 반복해도 넘어가서, 기색을 읽는 일이 값을 잃는다.
 */
export function duelWon(track: number): boolean {
  return track >= 1;
}

/** 저울이 시작하는 자리. 결을 다 쌓아 오면 반걸음 앞서 시작한다 */
export function startTrack(state: GameState): number {
  const favor = state.episodeRun?.favor ?? 0;
  return favor >= 7 ? 1 : 0;
}

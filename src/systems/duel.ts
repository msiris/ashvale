/**
 * 마주섬 겨룸 (§11 곁가지) — 순수 함수.
 *
 * 규칙만 여기 있고 문장은 `content/duel-text.ts` 에 있다.
 *
 * **주사위를 굴리지 않는다.** 상대의 자세는 미리 정해져 있고(결정적),
 * 그것을 얼마나 좁혀 보여 주는지만 능력치가 정한다. 그래서 잘 읽으면
 * 이기고 못 읽으면 진다 — 숫자가 결과를 굴리는 자리가 아니다.
 *
 * **체력을 두고 겨룬다.** 예전에는 기세 저울(−2..+2) 세 판이었는데,
 * 세 번 고르면 끝이라 맞부딪히는 무게가 없었다. 이제 양쪽이 체력을 들고
 * 서고 한쪽이 다할 때까지 간다.
 *
 * 이기면 상대가 깎이고 지면 내가 깎인다. 같은 자세면 둘 다 조금 깎인다 —
 * 팽팽해도 시간은 간다. 수치는 `data/combat.ts` 에 있다.
 *
 * 못 넘겨도 끝낸 표를 남기지 않으니 다시 갈 수 있다.
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
import {
  CLASH_CHIP,
  FAVOR_TO_HP,
  FOE_HIT_BASE,
  FOE_HIT_PER_DIFFICULTY,
  FOE_HP_BASE,
  GUARD_RATIO,
  HIT_BASE,
  HIT_PER_STAT,
  HIT_TIMED_BONUS,
  MAX_ROUNDS,
  PLAYER_HP_BASE,
  PLAYER_HP_PER_VIGOR,
} from '@/data/combat';

export { MAX_ROUNDS };

/** 되돌리기를 쓸 수 있는 결 */
export const RETRY_FAVOR = 4;

/** 겨룸 한 판의 상태. 세이브에 그대로 들어간다 */
export interface DuelState {
  /** 내 남은 체력 */
  hp: number;
  /** 시작 체력. 게이지를 그리려면 처음 값을 알아야 한다 */
  hpMax: number;
  foeHp: number;
  foeHpMax: number;
  round: number;
  retried: boolean;
}

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

/** 맞부딪히는 순간을 제대로 잡았는가 */
export type Timing = 'hit' | 'miss';

/*
 * **읽기가 방향을 정하고 손은 크기만 정한다.**
 *
 * 처음에는 때를 잡으면 결과가 한 단계 올라가게 뒀다 (밀림 → 팽팽 → 앞섬).
 * 그랬더니 **일부러 지는 자세를 내고 때만 잡아도 열에 일곱은 이겼다** —
 * 기색을 읽는 일이 값을 잃는다.
 *
 * 지금은 결과를 뒤집지 않는다. 이겼을 때 더 깎고, 맞을 때 덜 맞을 뿐이다.
 * 잘못 읽으면 맞는다. 손이 좋으면 덜 맞는다. 그 둘은 섞이지 않는다.
 */

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

/** 한쪽이 다했거나 너무 길어졌는가 */
export function duelSettled(duel: DuelState): boolean {
  return duel.hp <= 0 || duel.foeHp <= 0 || duel.round >= MAX_ROUNDS;
}

/**
 * 겨룸의 끝.
 *
 * 상대가 먼저 다하면 넘긴 것이다. 너무 길어져 끝난 경우에는
 * **체력이 많은 쪽이 이긴 것으로 본다** — 서로 못 깎고 끝나는 자리를
 * 무승부로 두면 같은 화면을 계속 누르게 된다.
 */
export function duelWon(duel: DuelState): boolean {
  if (duel.foeHp <= 0) return true;
  if (duel.hp <= 0) return false;
  // 남은 **비율**로 견준다. 시작 체력이 서로 다르므로 절대값은 공정하지 않다
  return duel.hp / Math.max(1, duel.hpMax) > duel.foeHp / Math.max(1, duel.foeHpMax);
}

/**
 * 겨룸을 세운다.
 *
 * 내 체력은 기력 상한이 자란 만큼 늘고, 오는 길에 쌓은 결이 더해진다.
 * 상대 체력은 난도가 정한다.
 */
export function startDuel(state: GameState, boss: EpisodeBoss): DuelState {
  const favor = state.episodeRun?.favor ?? 0;
  const hp =
    PLAYER_HP_BASE +
    Math.floor(state.hero.maxHp / PLAYER_HP_PER_VIGOR) +
    Math.floor(favor * FAVOR_TO_HP);
  const foeHp = FOE_HP_BASE + boss.difficulty;
  return { hp, hpMax: hp, foeHp, foeHpMax: foeHp, round: 0, retried: false };
}

export interface Blow {
  /** 상대가 깎이는 양 */
  toFoe: number;
  /** 내가 깎이는 양 */
  toMe: number;
}

/**
 * 한 판이 오간 결과 얼마나 깎이는가.
 *
 * 읽기가 방향을 정하고 손이 크기를 바꾼다. **맞는 순간에 때를 잡으면
 * 덜 맞는다** — 잘못 읽었어도 손으로 버틸 여지를 남긴다.
 */
export function blowFor(
  state: GameState,
  boss: EpisodeBoss,
  outcome: RoundOutcome,
  timing: Timing,
): Blow {
  if (outcome === 'draw') return { toFoe: CLASH_CHIP, toMe: CLASH_CHIP };

  if (outcome === 'win') {
    const bonus = relicBonus(state);
    const stat = state.hero.stats[boss.stat] + (bonus.stats[boss.stat] ?? 0);
    const escort = escortBonus(escortOf(state), boss.stat).roll;
    const hit =
      HIT_BASE +
      Math.floor((stat + escort) / HIT_PER_STAT) +
      (timing === 'hit' ? HIT_TIMED_BONUS : 0);
    return { toFoe: Math.max(1, hit), toMe: 0 };
  }

  const raw = FOE_HIT_BASE + Math.floor(boss.difficulty / FOE_HIT_PER_DIFFICULTY);
  const taken = timing === 'hit' ? Math.ceil(raw * GUARD_RATIO) : raw;
  return { toFoe: 0, toMe: Math.max(1, taken) };
}

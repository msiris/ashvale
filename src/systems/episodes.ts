/**
 * 동화 에피소드 — 순수 함수.
 *
 * 문장은 `content/episodes.ts` 에 있고 규칙만 여기 있다.
 *
 * 판 다섯을 걸어 지나야 하나가 끝난다. 판마다 이야기 자리가 하나 있고,
 * 거기서 고른 것이 결(favor)로 쌓인다. 마지막 판에서 그 결이 판정에 더해진다.
 *
 * **마지막 판정은 지역과 같은 1d20 이다.** 전투가 아니다 —
 * 이 게임에는 전투가 없다. `rollExplore` 를 그대로 쓰되 난도와 능력치만
 * 에피소드가 정한다.
 */

import type { GameState, ResourceId } from '@/types/game';
import type { Episode, EpisodeBoss, EpisodeChoice, EpisodeStage } from '@/data/content/episodes';
import { FAVOR_TO_ROLL } from '@/data/content/episodes';
import { ALL_EPISODES } from '@/data/episodes-index';
import type { RegionDef } from '@/data/regions';
import { FACTION_LABEL } from '@/data/relationships';
import { shiftFaction } from './factions';
import { applyToken } from './korean';
import { rosterFull } from './roster';
import { rollExplore, type ExploreRoll } from './explore';
import type { Rng } from './rng';

export function episodeById(id: string): Episode | null {
  return ALL_EPISODES.find((e) => e.id === id) ?? null;
}

/**
 * 화면에 보이는 주차.
 *
 * `world.turn` 은 0 부터 세는데 HUD 는 1주차부터 보여 준다.
 * `fromTurn` 은 **보이는 주차**로 적혀 있다 — 안 그러면 "1주차부터 열린다"
 * 라고 써 놓고 1주차에 안 열린다.
 */
function weekNumber(state: GameState): number {
  return state.world.turn + 1;
}

/**
 * 지금 갈 수 있는 에피소드.
 *
 * 앞 이야기를 끝내야 다음이 열린다. 주차 조건도 같이 본다 —
 * 첫 주에 여섯 개가 한꺼번에 뜨면 그냥 목록이지 이야기가 아니다.
 *
 * **끝낸 것은 빠진다.** 마지막 판을 못 넘기고 돌아온 것은 끝난 게 아니므로
 * 그대로 남는다. 다시 갈 수 있다.
 */
export function openEpisodes(state: GameState): Episode[] {
  const done = new Set(state.world.clearedEpisodes);
  return ALL_EPISODES.filter((e) => {
    if (done.has(e.id)) return false;
    if (weekNumber(state) < e.fromTurn) return false;
    if (e.needs !== undefined && !done.has(e.needs)) return false;
    return true;
  });
}

/** 다음에 열릴 것 하나. 목록이 비었을 때 무엇을 기다리는지 알려준다 */
export function nextLocked(state: GameState): Episode | null {
  const done = new Set(state.world.clearedEpisodes);
  return ALL_EPISODES.find((e) => !done.has(e.id)) ?? null;
}

/** {거점} 을 채운다 */
export function fillEpisodeText(text: string, state: GameState): string {
  return applyToken(text, '{거점}', state.town.name);
}

// ── 걸어 지나는 중 ──────────────────────────────────────

/** 지금 들어가 있는 에피소드와 판. 밖이면 null */
export function currentStage(
  state: GameState,
): { episode: Episode; stage: EpisodeStage; index: number } | null {
  const run = state.episodeRun;
  if (run === null) return null;
  const episode = episodeById(run.episodeId);
  const stage = episode?.stages[run.stage];
  if (episode === null || episode === undefined || stage === undefined) return null;
  return { episode, stage, index: run.stage };
}

/** 이 판의 이야기를 이미 봤는가 */
export function sceneSeen(state: GameState, stageId: string): boolean {
  return state.episodeRun?.seen.includes(stageId) ?? false;
}

/** 마지막 판인가 */
export function isLastStage(episode: Episode, index: number): boolean {
  return index >= episode.stages.length - 1;
}

export interface EpisodeChoiceResult {
  state: GameState;
  /** 화면에 잠깐 띄울 것들 — `세력 +4`, `기력 -2` */
  notes: string[];
  xp: number;
}

/**
 * 이야기 자리에서 고른 것을 적용한다.
 *
 * 결은 `episodeRun.favor` 에 쌓는다 — 판을 넘어가며 이어져야 하고,
 * 걷는 도중에 새로고침해도 살아 있어야 한다.
 */
export function applyEpisodeChoice(
  state: GameState,
  stageId: string,
  choice: EpisodeChoice,
): EpisodeChoiceResult {
  let next = state;
  const notes: string[] = [];

  if (choice.resources !== undefined) {
    const resources = { ...next.resources };
    for (const [id, delta] of Object.entries(choice.resources) as [ResourceId, number][]) {
      resources[id] = resources[id] + delta;
      notes.push(`${RESOURCE_LABEL[id]} ${delta > 0 ? '+' : ''}${delta}`);
    }
    next = { ...next, resources };
  }

  if (choice.hp !== undefined && choice.hp !== 0) {
    // 기력은 0 아래로 내려가지 않는다. 쓰러짐 판정은 마을로 돌아올 때 본다
    const hp = Math.max(0, Math.min(next.hero.maxHp, next.hero.hp + choice.hp));
    if (hp !== next.hero.hp) notes.push(`기력 ${hp - next.hero.hp}`);
    next = { ...next, hero: { ...next.hero, hp } };
  }

  if (choice.faction !== undefined) {
    const { id, delta } = choice.faction;
    next = { ...next, factions: shiftFaction(next.factions, id, delta) };
    notes.push(`${FACTION_LABEL[id]} ${delta > 0 ? '+' : ''}${delta}`);
  }

  if (next.episodeRun !== null) {
    next = {
      ...next,
      episodeRun: {
        ...next.episodeRun,
        favor: next.episodeRun.favor + choice.favor,
        seen: [...next.episodeRun.seen, stageId],
      },
    };
  }

  return { state: next, notes, xp: choice.xp ?? 0 };
}

// ── 마지막 판 ────────────────────────────────────────────

/**
 * 마주섬을 지역 판정으로 옮긴다.
 *
 * `rollExplore` 는 `RegionDef` 를 받는다. 에피소드는 지역이 아니지만
 * 판정에 필요한 것은 난도와 능력치뿐이라 그 모양만 빌린다 —
 * 판정 규칙을 한 벌 더 만들면 유물·동행·세력 보정이 여기만 빠진다.
 */
function bossAsRegion(boss: EpisodeBoss): RegionDef {
  return {
    id: 'episode',
    unlockEra: 0,
    difficulty: boss.difficulty,
    stat: boss.stat,
    loot: {},
    risk: boss.risk,
  };
}

export interface BossResult {
  roll: ExploreRoll;
  /** 결이 판정에 더한 값 */
  favorBonus: number;
  total: number;
  won: boolean;
}

/**
 * 마지막 판의 판정.
 *
 * 오는 길에 쌓은 결이 더해진다 — 판을 그냥 지나쳐 오면 주사위에만 기댄다.
 * 이야기 자리를 다 밟고 잘 고르면 결 8, 굴림에 +4 다.
 */
export function rollBoss(state: GameState, boss: EpisodeBoss, rng: Rng): BossResult {
  const roll = rollExplore(state, bossAsRegion(boss), rng);
  const favorBonus = Math.floor((state.episodeRun?.favor ?? 0) * FAVOR_TO_ROLL);
  const total = roll.total + favorBonus;
  return { roll, favorBonus, total, won: total >= boss.difficulty };
}

/**
 * 이 에피소드가 데려올 원형.
 *
 * 정해진 원형이 이미 명단에 있으면 **빈 원형을 대신 데려온다.**
 * 안 그러면 오래 놀아 온 판에서는 있는 사람만 또 오고, 정작 못 본
 * 원형은 영영 못 본다. 이야기의 주인공이 누구였는지보다
 * 명단이 자라는 쪽이 중요하다 (§7.1).
 */
export function archetypeFor(state: GameState, episode: Episode): string {
  const used = new Set(
    Object.values(state.companions)
      .filter((c) => c.departedTurn === null)
      .map((c) => c.archetypeId),
  );
  return used.has(episode.archetypeId) ? '' : episode.archetypeId;
}

/** 명단이 차서 못 받는 상황인가 (§7.1 상한 8명) */
export function rosterBlocked(state: GameState): boolean {
  return rosterFull(state);
}

/**
 * 다녀온 이야기에 대해 마을 사람이 하는 말 (§7.6).
 *
 * 가장 마지막에 끝낸 이야기의 것을 돌린다. 끝낸 것이 없으면 지금
 * 들어가 있는 이야기의 것을 쓴다 — 소문은 다녀오기 전에도 돈다.
 * 없으면 null 이고, 부르는 쪽이 조용히 넘긴다.
 */
export function townRumor(state: GameState, seed: number): string | null {
  const cleared = state.world.clearedEpisodes;
  const id = cleared[cleared.length - 1] ?? state.episodeRun?.episodeId ?? openEpisodes(state)[0]?.id;
  if (id === undefined) return null;
  const lines = episodeById(id)?.townTalk ?? [];
  if (lines.length === 0) return null;
  return lines[Math.abs(seed) % lines.length] ?? null;
}

const RESOURCE_LABEL: Record<ResourceId, string> = {
  wood: '목재',
  stone: '석재',
  food: '식량',
  gold: '금화',
};

/**
 * 동화 에피소드 — 순수 함수.
 *
 * 문장은 `content/episodes.ts` 에 있고 규칙만 여기 있다.
 *
 * 지역 탐사와 섞지 않는다. 지역은 표식을 밟고 1d20 을 굴리는 자리고,
 * 여기는 장을 넘기며 고르는 자리다. **주사위를 굴리지 않는다** —
 * 같은 주사위를 한 군데 더 놓으면 곁가지를 만든 뜻이 없다.
 */

import type { GameState, ResourceId } from '@/types/game';
import type { Episode, EpisodeChoice } from '@/data/content/episodes';
import { EPISODES, EPISODE_FAVOR_PASS } from '@/data/content/episodes';
import { FACTION_LABEL } from '@/data/relationships';
import { shiftFaction } from './factions';
import { applyToken } from './korean';
import { rosterFull } from './roster';

export { EPISODE_FAVOR_PASS };

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

export function episodeById(id: string): Episode | null {
  return EPISODES.find((e) => e.id === id) ?? null;
}

/** 끝낸 에피소드 */
export function clearedEpisodes(state: GameState): string[] {
  return state.world.clearedEpisodes;
}

/**
 * 지금 갈 수 있는 에피소드.
 *
 * 앞 이야기를 끝내야 다음이 열린다. 주차 조건도 같이 본다 —
 * 첫 주에 여섯 개가 한꺼번에 뜨면 그냥 목록이지 이야기가 아니다.
 *
 * **끝낸 것은 빠진다.** 결이 모자라 빈손으로 돌아온 것은 끝난 게 아니므로
 * 그대로 남는다. 다시 갈 수 있다.
 */
export function openEpisodes(state: GameState): Episode[] {
  const done = new Set(state.world.clearedEpisodes);
  return EPISODES.filter((e) => {
    if (done.has(e.id)) return false;
    if (weekNumber(state) < e.fromTurn) return false;
    if (e.needs !== undefined && !done.has(e.needs)) return false;
    return true;
  });
}

/** 다음에 열릴 것 하나. 목록이 비었을 때 무엇을 기다리는지 알려준다 */
export function nextLocked(state: GameState): Episode | null {
  const done = new Set(state.world.clearedEpisodes);
  return EPISODES.find((e) => !done.has(e.id)) ?? null;
}

/** {거점} 을 채운다 */
export function fillEpisodeText(text: string, state: GameState): string {
  return applyToken(text, '{거점}', state.town.name);
}

export interface EpisodeChoiceResult {
  state: GameState;
  /** 화면에 잠깐 띄울 것들 — `세력 +4`, `기력 -2` */
  notes: string[];
  xp: number;
}

/**
 * 선택 하나를 적용한다.
 *
 * 결(favor)은 여기서 더하지 않는다 — 진행 중인 값이라 세이브가 아니라
 * 스토어가 들고 있는다. 자원·기력·세력만 상태에 박는다.
 */
export function applyEpisodeChoice(
  state: GameState,
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
    // 기력은 0 아래로 내려가지 않는다. 쓰러짐 판정은 지역 쪽 일이다
    const hp = Math.max(0, Math.min(next.hero.maxHp, next.hero.hp + choice.hp));
    if (hp !== next.hero.hp) notes.push(`기력 ${choice.hp > 0 ? '+' : ''}${hp - next.hero.hp}`);
    next = { ...next, hero: { ...next.hero, hp } };
  }

  if (choice.faction !== undefined) {
    const { id, delta } = choice.faction;
    next = { ...next, factions: shiftFaction(next.factions, id, delta) };
    notes.push(`${FACTION_LABEL[id]} ${delta > 0 ? '+' : ''}${delta}`);
  }

  return { state: next, notes, xp: choice.xp ?? 0 };
}

/** 결이 찼는가 */
export function favorPassed(favor: number): boolean {
  return favor >= EPISODE_FAVOR_PASS;
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

const RESOURCE_LABEL: Record<ResourceId, string> = {
  wood: '목재',
  stone: '석재',
  food: '식량',
  gold: '금화',
};

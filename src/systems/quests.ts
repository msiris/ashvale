/**
 * 의뢰인 퀘스트 (§7.6) — 순수 함수.
 * 동시에 하나. 기한 없음. **실패가 없다** — 조건을 채울 때까지 그냥 열려 있다.
 */

import type { GameState } from '@/types/game';
import {
  QUESTS,
  REPEAT_PREFIX,
  getQuest,
  type QuestDef,
  type QuestGoal,
  type QuestReward,
} from '@/data/quests';
import {
  REPEAT_COOLDOWN,
  REPEAT_REWARD,
  REPEAT_TEMPLATES,
} from '@/data/content/repeat-quests';
import { townPower } from './eras';

/** 지금 이 의뢰인이 내줄 수 있는 퀘스트. 이미 깬 것과 진행 중인 것은 뺀다 */
export function offerFor(state: GameState, patronId: string): QuestDef | null {
  const record = state.patrons[patronId];
  const active = activeQuest(state);
  if (active !== null) return null;

  return (
    QUESTS.find(
      (q) =>
        q.patronId === patronId &&
        state.world.eraIndex >= q.era &&
        !(record?.questsCleared ?? []).includes(q.id),
    ) ?? null
  );
}

/** 진행 중인 퀘스트. 동시에 하나뿐이다 */
export function activeQuest(state: GameState): QuestDef | null {
  for (const record of Object.values(state.patrons)) {
    if (record.activeQuestId === null) continue;
    // 고정 의뢰가 아니면 다시 오는 의뢰다. id 에서 되살린다
    return getQuest(record.activeQuestId) ?? parseRepeatQuest(record.activeQuestId);
  }
  return null;
}

/** 조건을 채웠는가 */
export function isComplete(state: GameState, quest: QuestDef): boolean {
  const goal = quest.goal;
  switch (goal.kind) {
    case 'expeditions':
      return state.counters.expeditions >= goal.count;
    case 'building':
      return (state.town.buildings[goal.buildingId] ?? 0) >= goal.level;
    case 'faction':
      return state.factions[goal.faction] >= goal.value;
    case 'power':
      return townPower(state.town.buildings) >= goal.value;
    case 'resource':
      return state.resources[goal.resource] >= goal.value;
  }
}

/** 진행 상황을 사람 말로 */
export function progressText(state: GameState, quest: QuestDef): string {
  const goal = quest.goal;
  switch (goal.kind) {
    case 'expeditions':
      return `${Math.min(state.counters.expeditions, goal.count)} / ${goal.count}`;
    case 'building':
      return `${state.town.buildings[goal.buildingId] ?? 0} / ${goal.level}단계`;
    case 'faction':
      return `${state.factions[goal.faction]} / ${goal.value}`;
    case 'power':
      return `${townPower(state.town.buildings)} / ${goal.value}`;
    case 'resource':
      return `${state.resources[goal.resource]} / ${goal.value}`;
  }
}

/**
 * 다시 오는 의뢰를 id 에서 되살린다 (§7.6).
 *
 * id 는 `rep:<의뢰인>:<회차>:<틀>`. **의뢰 객체를 세이브에 담지 않는다** —
 * id 만으로 같은 의뢰가 언제든 다시 만들어지므로 모양이 바뀌어도
 * 마이그레이션이 붙지 않는다.
 */
export function parseRepeatQuest(id: string): QuestDef | null {
  const parts = id.split(':');
  if (parts.length !== 4 || parts[0] !== REPEAT_PREFIX) return null;

  const [, patronId, cycleText, indexText] = parts;
  const cycle = Number(cycleText);
  const index = Number(indexText);
  if (patronId === undefined || !Number.isFinite(cycle) || !Number.isFinite(index)) return null;

  const tpl = REPEAT_TEMPLATES[index % REPEAT_TEMPLATES.length];
  if (tpl === undefined) return null;

  const value = tpl.base + tpl.step * cycle;
  const goal: QuestGoal =
    tpl.kind === 'expeditions'
      ? { kind: 'expeditions', count: value }
      : tpl.kind === 'power'
        ? { kind: 'power', value }
        : { kind: 'resource', resource: tpl.resource ?? 'wood', value };

  // 몇 회차마다 한 번은 사람을 데려온다. 나머지는 금화
  const bringsPerson = cycle > 0 && cycle % REPEAT_REWARD.companionEvery === 0;
  const reward: QuestReward = bringsPerson
    ? { kind: 'companion' }
    : { kind: 'resources', gold: REPEAT_REWARD.goldBase + REPEAT_REWARD.goldStep * cycle };

  return {
    id,
    patronId,
    name: tpl.name,
    era: 0,
    goal,
    reward,
    goalText: tpl.goalText.replace('{값}', String(value)),
  };
}

/**
 * 이 의뢰인이 지금 다시 부탁할 것.
 *
 * 고유 의뢰를 다 마쳤고 간격(REPEAT_COOLDOWN)이 지났을 때만 나온다.
 * 회차는 마지막으로 마친 주차에서 센다 — 같은 주에는 늘 같은 의뢰다.
 */
export function repeatOfferFor(state: GameState, patronId: string): QuestDef | null {
  const record = state.patrons[patronId];
  if (record === undefined) return null;

  // 아직 고유 의뢰가 남아 있으면 그것이 먼저다
  const ownUnique = QUESTS.some(
    (q) =>
      q.patronId === patronId &&
      state.world.eraIndex >= q.era &&
      !record.questsCleared.includes(q.id),
  );
  if (ownUnique) return null;

  const last = record.lastQuestTurn ?? -1;
  if (last < 0) return null;
  const waited = state.world.turn - last;
  if (waited < REPEAT_COOLDOWN) return null;

  const cycle = Math.floor(waited / REPEAT_COOLDOWN);
  // 의뢰인마다 다른 틀이 걸리게 이름을 섞는다
  let h = cycle;
  for (let i = 0; i < patronId.length; i++) h = (h * 31 + patronId.charCodeAt(i)) >>> 0;
  const index = h % REPEAT_TEMPLATES.length;

  return parseRepeatQuest(`${REPEAT_PREFIX}:${patronId}:${cycle}:${index}`);
}

/** 다시 오는 의뢰까지 합쳐서, 이 의뢰인이 내놓을 것 */
export function anyOfferFor(state: GameState, patronId: string): QuestDef | null {
  return offerFor(state, patronId) ?? repeatOfferFor(state, patronId);
}

/** 이 의뢰인이 지금 느낌표를 달아야 하는가 (§7.6) */
export type PatronMark = 'offer' | 'report' | null;

export function patronMark(state: GameState, patronId: string): PatronMark {
  const record = state.patrons[patronId];
  const active = activeQuest(state);

  if (active !== null) {
    // 내가 맡긴 의뢰를 다 채웠으면 보고하러 오라는 표
    if (record?.activeQuestId === active.id) return isComplete(state, active) ? 'report' : null;
    return null;
  }
  return anyOfferFor(state, patronId) !== null ? 'offer' : null;
}

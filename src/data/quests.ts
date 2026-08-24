/**
 * 의뢰인 퀘스트 (§7.6).
 *
 * 동시에 하나만. **기한이 없고 실패가 없다.** 완료는 의뢰인을 찾아가 보고한다.
 *
 * 이름과 보상은 §7.6 표 그대로다. 다만 **달성 조건은 기획서에 없다** —
 * 아래 조건은 이미 있는 시스템으로 검사할 수 있게 내가 잡은 잠정치다.
 */

import type { FactionId, ResourceId } from '@/types/game';

/** 무엇을 채워야 하는가. 전부 지금 있는 상태로 검사할 수 있는 것들이다 */
export type QuestGoal =
  | { kind: 'expeditions'; count: number }
  | { kind: 'building'; buildingId: string; level: number }
  | { kind: 'faction'; faction: FactionId; value: number }
  | { kind: 'power'; value: number }
  /** 자원을 그만큼 들고 있으면 된다. 다시 오는 의뢰가 쓴다 */
  | { kind: 'resource'; resource: ResourceId; value: number };

export type QuestReward =
  /** 새 관계 대상이 들어온다 (§7.1 상한 8명) */
  | { kind: 'companion' }
  /** 지역을 미리 연다 */
  | { kind: 'region'; regionId: string }
  /** 자재 지원 */
  | { kind: 'resources'; wood?: number; stone?: number; gold?: number };

/**
 * 다시 오는 의뢰의 id 는 `rep:<의뢰인>:<회차>:<틀>` 이다.
 *
 * **의뢰 객체를 세이브에 담지 않는다.** id 만 있으면 언제든 같은 의뢰를
 * 되살릴 수 있게 만들었다 — 담으면 모양이 바뀔 때마다 마이그레이션이 붙는다.
 */
export const REPEAT_PREFIX = 'rep';

export interface QuestDef {
  id: string;
  patronId: string;
  name: string;
  /** 이 시대부터 발행된다 */
  era: number;
  goal: QuestGoal;
  reward: QuestReward;
  /** 목표를 사람 말로. 패널에 그대로 보인다 */
  goalText: string;
}

export const QUESTS: QuestDef[] = [
  {
    id: 'trade-road',
    patronId: 'bartek',
    name: '교역로 개척',
    era: 0,
    goal: { kind: 'expeditions', count: 3 },
    reward: { kind: 'companion' },
    goalText: '지역 탐사 3회',
  },
  {
    id: 'quarry-up',
    patronId: 'tova',
    name: '채석장 증축',
    era: 1,
    goal: { kind: 'building', buildingId: 'quarry', level: 2 },
    reward: { kind: 'resources', stone: 40, wood: 20 },
    goalText: '채석장 2단계',
  },
  {
    id: 'oath-trial',
    patronId: 'harl',
    name: '서약의 시험',
    era: 1,
    goal: { kind: 'faction', faction: 'oath', value: 15 },
    reward: { kind: 'companion' },
    goalText: '은빛 서약 평판 15',
  },
  {
    id: 'old-text',
    patronId: 'oren',
    name: '고문헌 해독',
    era: 2,
    goal: { kind: 'building', buildingId: 'library', level: 2 },
    reward: { kind: 'region', regionId: 'marsh' },
    goalText: '서고 2단계',
  },
  {
    id: 'settlers',
    patronId: 'doran',
    name: '이주민 유치',
    era: 2,
    goal: { kind: 'power', value: 14 },
    reward: { kind: 'companion' },
    goalText: '마을 지수 14',
  },
  {
    id: 'secret-letter',
    patronId: 'vell',
    name: '은밀한 서신',
    era: 3,
    goal: { kind: 'expeditions', count: 10 },
    reward: { kind: 'companion' },
    goalText: '지역 탐사 10회',
  },
];

export function questsFor(patronId: string): QuestDef[] {
  return QUESTS.filter((q) => q.patronId === patronId);
}

export function getQuest(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

/**
 * 조공 (§7, §9) — 순수 함수.
 *
 * 세력 이야기를 끝내면 그쪽에서 몇 주에 한 번 물자가 온다.
 * 복속시켰으면 두 배로 온다 — 대신 평판과 거래 값을 잃는다.
 *
 * **매주 오면 안 된다.** 세력 넷을 다 끝내면 주간 생산과 맞먹어
 * 건설 곡선이 통째로 무너진다. 두 주에 한 번으로 눌러 둔다.
 */

import type { FactionId, GameState, ResourceId } from '@/types/game';
import { FACTION_LABEL } from '@/data/relationships';
import {
  TRIBUTE,
  TRIBUTE_EVERY,
  TRIBUTE_MULTIPLIER,
  type HoldMode,
} from '@/data/faction-holds';

export interface TributeResult {
  resources: Partial<Record<ResourceId, number>>;
  /** 연대기에 남길 줄. 온 게 없으면 비어 있다 */
  lines: string[];
}

/** 이 주차에 조공이 오는가 */
export function tributeDue(turn: number): boolean {
  return turn > 0 && turn % TRIBUTE_EVERY === 0;
}

/**
 * 이번 주에 들어오는 조공.
 *
 * 주차를 올리기 **전에** 부른다 — 이번 주의 것이다.
 * 오지 않는 주에는 빈 것을 돌려준다.
 */
export function tributeFor(state: GameState): TributeResult {
  const resources: Partial<Record<ResourceId, number>> = {};
  const lines: string[] = [];
  if (!tributeDue(state.world.turn)) return { resources, lines };

  for (const [id, mode] of Object.entries(state.world.factionHolds) as [FactionId, HoldMode][]) {
    const base = TRIBUTE[id];
    const times = TRIBUTE_MULTIPLIER[mode];
    const parts: string[] = [];
    for (const [key, amount] of Object.entries(base) as [ResourceId, number][]) {
      const got = amount * times;
      resources[key] = (resources[key] ?? 0) + got;
      parts.push(`${RESOURCE_LABEL[key]} ${got}`);
    }
    if (parts.length > 0) {
      lines.push(
        mode === 'ruled'
          ? `${FACTION_LABEL[id]}에서 조공이 들어왔다. ${parts.join(' · ')}`
          : `${FACTION_LABEL[id]}이 몫을 나눠 보냈다. ${parts.join(' · ')}`,
      );
    }
  }

  return { resources, lines };
}

const RESOURCE_LABEL: Record<ResourceId, string> = {
  wood: '목재',
  stone: '석재',
  food: '식량',
  gold: '금화',
};

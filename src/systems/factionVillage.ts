/**
 * 세력 마을에서 대표가 하는 말 (§7) — 순수 함수.
 *
 * 지금 사이가 어떤지, 다음 조공에 무엇이 얼마나 오는지 알려 준다.
 * **어딘가에 적혀 있어야 한다.** 조공이 조용히 자원에 얹히기만 하면
 * 이야기를 끝낸 값이 손에 안 잡힌다.
 */

import type { FactionId, GameState, ResourceId } from '@/types/game';
import type { DialogueScript } from '@/types/dialogue';
import { FACTION_LABEL } from '@/data/relationships';
import { HOLD_LABEL, TRIBUTE, TRIBUTE_EVERY, TRIBUTE_MULTIPLIER } from '@/data/faction-holds';
import { ENVOY_LABEL } from '@/data/maps/faction';
import { tributeDue } from './tribute';
import { josa } from './korean';

const RESOURCE_LABEL: Record<ResourceId, string> = {
  wood: '목재',
  stone: '석재',
  food: '식량',
  gold: '금화',
};

/** 다음 조공까지 남은 주 */
export function weeksToTribute(turn: number): number {
  if (tributeDue(turn)) return 0;
  return TRIBUTE_EVERY - (turn % TRIBUTE_EVERY);
}

export function envoyScript(state: GameState, id: FactionId): DialogueScript | null {
  const mode = state.world.factionHolds[id];
  if (mode === undefined) return null;

  const parts = (Object.entries(TRIBUTE[id]) as [ResourceId, number][]).map(
    ([key, amount]) => RESOURCE_LABEL[key] + ' ' + amount * TRIBUTE_MULTIPLIER[mode],
  );
  const left = weeksToTribute(state.world.turn);

  const lines =
    mode === 'helped'
      ? [
          josa(FACTION_LABEL[id], '은') + ' ' + josa(state.town.name, '을') + ' 우호로 둡니다. 값은 잘 쳐드리죠.',
          '몫은 ' + TRIBUTE_EVERY + '주에 한 번 보냅니다. ' + parts.join(' · ') + '.',
          left === 0 ? '이번 주에 갑니다.' : left + '주 뒤에 갑니다.',
        ]
      : [
          josa(FACTION_LABEL[id], '은') + ' ' + state.town.name + '에 복속되어 있습니다.',
          '조공은 ' + TRIBUTE_EVERY + '주마다 올립니다. ' + parts.join(' · ') + '.',
          '장은 이쪽 사정도 있으니, 값은 기대하지 마십시오.',
        ];

  return {
    speakerName: ENVOY_LABEL[id],
    portrait: { speaker: { kind: 'patron', id }, wantSlot: 0, label: ENVOY_LABEL[id] },
    lines,
  };
}

export function holdLabel(mode: 'helped' | 'ruled'): string {
  return HOLD_LABEL[mode];
}

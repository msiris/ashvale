/**
 * 다시 오는 의뢰 (§7.6).
 *
 * **새로 쓴 파일이다.**
 *
 * 의뢰인마다 고유 의뢰가 하나뿐이라 그걸 마치면 그 사람은 영영 할 말이
 * 없어졌다. 여섯을 다 하면 회관이 박물관이 된다.
 *
 * 여기 것들은 **틀**이다. 몇 주마다 그 틀에서 하나를 뽑아 새 의뢰가 된다.
 * 매주 주면 의뢰가 아니라 일과가 되므로 간격을 둔다.
 *
 * 문체는 §15. 의뢰 이름은 명사형, 목표는 명사구.
 */

import type { ResourceId } from '@/types/game';

export interface RepeatTemplate {
  /** 틀 이름. 뽑힌 뒤 그대로 의뢰 이름이 된다 */
  name: string;
  kind: 'expeditions' | 'resource' | 'power';
  /** 회차마다 얼마씩 무거워지는가 */
  base: number;
  step: number;
  /** kind 가 resource 일 때 무엇을 모으는가 */
  resource?: ResourceId;
  /** 목표를 사람 말로. {값} 이 채워진다 */
  goalText: string;
}

export const REPEAT_TEMPLATES: RepeatTemplate[] = [
  {
    name: '길을 다시 밟다',
    kind: 'expeditions',
    base: 4,
    step: 2,
    goalText: '지역 탐사 {값}회',
  },
  {
    name: '재목 조달',
    kind: 'resource',
    resource: 'wood',
    base: 40,
    step: 20,
    goalText: '목재 {값} 보유',
  },
  {
    name: '석재 조달',
    kind: 'resource',
    resource: 'stone',
    base: 40,
    step: 20,
    goalText: '석재 {값} 보유',
  },
  {
    name: '곳간 채우기',
    kind: 'resource',
    resource: 'food',
    base: 60,
    step: 30,
    goalText: '식량 {값} 보유',
  },
  {
    name: '마을 확장',
    kind: 'power',
    base: 20,
    step: 8,
    goalText: '마을 지수 {값}',
  },
];

/**
 * 다시 오기까지의 간격 (주).
 *
 * 매주 주면 일과가 되고, 너무 길면 회관에 갈 이유가 없어진다.
 * 의뢰인이 여섯이라 실제로는 평균 두어 주에 하나씩 새 의뢰가 붙는다.
 */
export const REPEAT_COOLDOWN = 8;

/** 다시 오는 의뢰의 보상. 고유 의뢰보다 가볍게 둔다 */
export const REPEAT_REWARD = {
  /** 회차마다 이만큼씩 늘어난다 */
  goldBase: 30,
  goldStep: 15,
  /**
   * 이 회차마다 한 번은 사람을 데려온다.
   * 명단 상한(8)에 닿으면 금화로 바뀐다 — 부르는 쪽이 그렇게 처리한다.
   */
  companionEvery: 3,
} as const;

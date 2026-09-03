/**
 * 세력과의 사이 (§7) — 세력 이야기를 끝낸 뒤.
 *
 * 두 갈래다.
 *   - `helped` 도움: 평판이 크게 오르고 그쪽 마을에서 값을 잘 쳐준다.
 *     조공은 적다 — 주는 게 아니라 나누는 것이라서다
 *   - `ruled` 복속: 조공이 두 배다. 대신 평판이 깎이고 값이 나빠진다 —
 *     받는 쪽이 웃으면서 주지는 않는다
 *
 * **어느 쪽도 정답이 아니게 둔다.** 한쪽이 늘 낫다면 갈림길이 아니다.
 * 도움은 거래와 평판, 복속은 물자다. 무엇이 모자라냐에 따라 갈린다.
 */

import type { FactionId, ResourceId } from '@/types/game';

export type HoldMode = 'helped' | 'ruled';

/** 세력마다 보내오는 것이 다르다. 그쪽이 가진 것을 보낸다 */
export const TRIBUTE: Record<FactionId, Partial<Record<ResourceId, number>>> = {
  guild: { gold: 14 },
  oath: { stone: 10, gold: 4 },
  grove: { food: 12, wood: 6 },
  tower: { gold: 8, stone: 5 },
};

/** 복속시키면 두 배로 온다 */
export const TRIBUTE_MULTIPLIER: Record<HoldMode, number> = { helped: 1, ruled: 2 };

/** 몇 주에 한 번 오는가. 매주 오면 건설 곡선이 무너진다 (§9) */
export const TRIBUTE_EVERY = 2;

/** 끝낸 그 자리에서 움직이는 평판 */
export const HOLD_REPUTATION: Record<HoldMode, number> = { helped: 25, ruled: -20 };

/**
 * 그쪽 마을에서 거래할 때의 값.
 *
 * 파는 값에 곱하고, 사는 값에서 뺀다. 복속은 마이너스다 —
 * 물자는 많이 오지만 장은 이쪽 편이 아니다.
 */
export const HOLD_TRADE_BONUS: Record<HoldMode, number> = { helped: 0.35, ruled: -0.15 };

export const HOLD_LABEL: Record<HoldMode, string> = { helped: '우호', ruled: '복속' };

/**
 * 교역과 선물 (§10) — 순수 함수. 시장 Lv1 부터 열린다.
 *
 * **주간 거래 한도가 반드시 있어야 한다.** 없으면 무한 환전으로
 * 건설 곡선이 통째로 무너진다.
 */

import type { CompanionRecord, GameState, ResourceId } from '@/types/game';
import { getArchetype } from '@/data/archetypes';
import { factionEffects } from './factions';
import { GIFTS, RESOURCE_GIFT_CATEGORY, getGift } from '@/data/gifts';
import {
  PATRON_SELL_BONUS,
  SELL_BONUS_PER_LEVEL,
  TRADE_RATES,
  WEEKLY_LIMIT_PER_LEVEL,
  WINTER_FOOD_MARKUP,
} from '@/data/trade';
import { AFFINITY, GIFT_COOLDOWN_WEEKS } from '@/data/relationships';
import { seasonOf } from '@/data/seasons';
import { HOLD_TRADE_BONUS } from '@/data/faction-holds';
import { parseFactionMap } from '@/data/maps/faction';

/**
 * 지금 서 있는 세력 마을이 값에 붙이는 보정 (§7).
 *
 * 도운 세력의 마을에서는 잘 쳐주고, 복속시킨 데서는 나쁘게 쳐준다.
 * 우리 마을 시장에서는 0 이다 — 여기까지 걸어와야 붙는 값이다.
 */
function villageBonus(state: GameState): number {
  const id = parseFactionMap(state.world.currentMap);
  if (id === null) return 0;
  const mode = state.world.factionHolds[id];
  return mode === undefined ? 0 : HOLD_TRADE_BONUS[mode];
}

export function marketLevel(state: GameState): number {
  return state.town.buildings['market'] ?? 0;
}

/** 주간 거래 한도 = 시장 레벨 × 30 금화 상당 */
export function weeklyLimit(state: GameState): number {
  // 상인 길드의 태도가 한도를 늘리거나 줄인다 (§7)
  const base = marketLevel(state) * WEEKLY_LIMIT_PER_LEVEL;
  return Math.max(0, base + factionEffects(state.factions).tradeLimit);
}

export function rateFor(resource: ResourceId) {
  return TRADE_RATES.find((r) => r.resource === resource);
}

/** 파는 값. 시장 레벨과 바르텍 신뢰가 값을 올린다 */
export function sellValue(state: GameState, resource: ResourceId, amount: number): number {
  const rate = rateFor(resource);
  if (rate === undefined) return 0;

  const trust = state.patrons['bartek']?.trust ?? 0;
  const patronBonus =
    trust >= 40 ? PATRON_SELL_BONUS.oldFriend : trust >= 20 ? PATRON_SELL_BONUS.client : 0;
  const bonus = 1 + marketLevel(state) * SELL_BONUS_PER_LEVEL + patronBonus + villageBonus(state);

  return Math.floor((amount / rate.sellPer) * bonus);
}

/** 사는 값. 겨울에는 식량이 비싸다 */
export function buyCost(state: GameState, resource: ResourceId, amount: number): number {
  const rate = rateFor(resource);
  if (rate === undefined) return 0;

  const units = Math.ceil(amount / rate.buyAmount);
  let gold = units * rate.buyGold;

  if (resource === 'food' && seasonOf(state.world.week) === 'winter') {
    gold = Math.ceil(gold * (1 + WINTER_FOOD_MARKUP));
  }
  return gold;
}

// ── 선물 ──────────────────────────────────────────────────

export type GiftReaction = 'match' | 'mismatch' | 'dislike';

/**
 * 취향 일치 여부 (§7.2, §7.3).
 *
 * 원형이 들고 있는 건 **좋아하는 것** 목록뿐이다. 싫어하는 것 표가
 * 기획서에 없어서 'dislike' 는 지금 나오지 않는다 — 콘텐츠에 대사는 있다.
 */
export function giftReaction(companion: CompanionRecord, category: string): GiftReaction {
  const taste = getArchetype(companion.archetypeId)?.taste ?? [];
  return taste.includes(category) ? 'match' : 'mismatch';
}

export function giftAffinity(reaction: GiftReaction): number {
  return AFFINITY.gift[reaction];
}

/** 인물당 4주 쿨다운 (§7.3) */
export function giftReady(companion: CompanionRecord, turn: number): boolean {
  if (companion.departedTurn !== null) return false;
  if (companion.injuredUntilTurn > turn) return false;
  return turn - companion.lastApproachTurn >= GIFT_COOLDOWN_WEEKS || companion.lastApproachTurn === 0;
}

/** 살 수 있는 선물 목록. 자원 직접 전달도 선물이다 */
export function giftCatalog() {
  return {
    items: GIFTS,
    resources: Object.entries(RESOURCE_GIFT_CATEGORY) as [ResourceId, string][],
  };
}

export { getGift };

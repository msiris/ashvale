/**
 * 주 종료 처리 (§3) — 순수 함수.
 *
 * **8단계 순서는 고정이다.** 순서를 바꾸면 결과가 달라진다 —
 * 예를 들어 시대 판정(6)이 자원 생산(2)보다 앞서면, 그 주에 올린 건물의
 * 산출이 한 주 늦게 반영된다. 단계를 끼워 넣을 때는 번호 자리를 지킨다.
 *
 * 마을 활동(대화·건설·선물)은 시간을 쓰지 않는다. 이 함수는 지역 탐사로만 불린다.
 */

import type { ChronicleEntry, GameState } from '@/types/game';
import type { Rng } from './rng';
import { WEEKS_PER_YEAR, seasonOf } from '@/data/seasons';
import { eraName, extentFor } from '@/data/eras';
import { CHRONICLE_TEXT } from '@/data/chronicle';
import { applyProduction, computeHeal, computeProduction } from './economy';
import { eraFor, townPower } from './eras';
import { appendEntries, makeEntry } from './chronicle';
import { queueApproaches, displayName, withAffinity } from './relationships';
import { requestsOf } from './requests';
import { REQUEST_AFFINITY } from '@/data/content/requests';
import { regionName } from '@/data/regions';
import { applyToken } from './korean';
import { applyEvent, rollEvent } from './worldEvents';
import { collapse, shouldCollapse } from './collapse';
import { rollRival, type RivalPick } from './rivals';
import { runReferrals } from './roster';
import { devotionTotals } from './devotion';
import { factionEffects } from './factions';
import { getArchetype } from '@/data/archetypes';
import { COLLAPSE_TEXT as CHRONICLE_TEXT_COLLAPSE } from '@/data/collapse';
import { tributeFor } from './tribute';

export interface WeekInput {
  /**
   * 1단계에 적용할 탐사 결과.
   * 탐사 판정이 붙기 전에는 비어 있다.
   */
  expedition?: {
    resources?: Partial<Record<'wood' | 'stone' | 'food' | 'gold', number>>;
    xp?: number;
  };
  /**
   * 이번 주에 나간 지역 (§11). 부탁을 들어줬는지 여기서 갈린다.
   * 쉬었으면 비어 있다 — 아무 부탁도 못 들어준 것이다.
   */
  wentTo?: string;
}

export interface WeekResult {
  state: GameState;
  entries: ChronicleEntry[];
  /** 이번 주에 마을이 무너졌는가 (§13) */
  collapsed: boolean;
  /** 연인이 둘 이상이라 벌어진 경쟁 사건 (§7.5). 다음 마을 진입 때 열린다 */
  rival: RivalPick | null;
}

export function endWeek(state: GameState, input: WeekInput, _rng: Rng): WeekResult {
  let next = state;
  const lines: string[] = [];

  const season = seasonOf(next.world.week);

  // ── 1. 탐사 결과 적용 ────────────────────────────────
  if (input.expedition?.resources !== undefined) {
    const gained = input.expedition.resources;
    const resources = { ...next.resources };
    for (const [key, amount] of Object.entries(gained)) {
      const r = key as keyof typeof resources;
      resources[r] += amount;
    }
    next = { ...next, resources };
  }
  if (input.expedition?.xp !== undefined) {
    next = { ...next, hero: { ...next.hero, xp: next.hero.xp + input.expedition.xp } };
  }

  // ── 2. 자원 생산 − 식량 소비 (계절 보정) ──────────────
  // 최대 호감이 남긴 주간 보탬을 함께 넘긴다 (§7 헌신)
  // 헌신과 세력의 태도를 함께 넘긴다 (§7)
  const boons = { ...devotionTotals(next).weekly };
  const grove = factionEffects(next.factions).weeklyFood;
  if (grove !== 0) boons.food = (boons.food ?? 0) + grove;
  const production = computeProduction(next.town.buildings, season, boons);
  next = { ...next, resources: applyProduction(next.resources, production) };

  const foodIn = production.gross.food + production.season.food;
  if (foodIn > 0 || production.foodConsumed > 0) {
    lines.push(CHRONICLE_TEXT.harvest(foodIn, production.foodConsumed));
  }
  if (next.resources.food < 0) {
    lines.push(CHRONICLE_TEXT.famine(-next.resources.food));
  }

  /**
   * 세력에서 오는 조공 (§7).
   *
   * 생산 다음에 얹는다 — 흉년에 조공으로 버티는 그림이 나와야
   * 세력 이야기를 끝낸 값이 손에 잡힌다.
   */
  const tribute = tributeFor(next);
  if (tribute.lines.length > 0) {
    const resources = { ...next.resources };
    for (const [key, amount] of Object.entries(tribute.resources)) {
      resources[key as keyof typeof resources] += amount;
    }
    next = { ...next, resources };
    lines.push(...tribute.lines);
  }

  // ── 3. 회복 (신전 등) ────────────────────────────────
  const healed = computeHeal(next);
  if (healed > 0) {
    next = { ...next, hero: { ...next.hero, hp: next.hero.hp + healed } };
    lines.push(CHRONICLE_TEXT.heal(healed));
  }

  /**
   * 주간 부탁 정산 (§7.3).
   *
   * 한 주에 한 곳만 갈 수 있으니 둘이 다른 데를 부탁하면 하나는 못 들어준다.
   * **주차를 올리기 전에 본다** — 부탁은 이번 주의 것이다.
   */
  for (const req of requestsOf(next)) {
    const who = next.companions[req.companionId];
    if (who === undefined) continue;

    const kept = input.wentTo === req.regionId;
    const delta = kept ? REQUEST_AFFINITY.done : REQUEST_AFFINITY.missed;
    next = {
      ...next,
      companions: { ...next.companions, [who.id]: withAffinity(who, delta) },
    };
    lines.push(
      `${displayName(who)}: ${applyToken(req.line[kept ? 'done' : 'missed'], '{지역}', regionName(req.regionId))}`,
    );
  }

  // ── 4. 관계 갱신 — 호감 반영, 다가옴 판정 (§7.3) ──────
  // 문턱을 넘고 아직 소화하지 않은 사건이 있는 인물을 대기열에 세운다.
  // 실제로 다가오는 건 다음에 마을에 들어설 때다.
  next = { ...next, pendingApproach: queueApproaches(next) };

  // ── 5. 세계 이벤트 판정 (12%) ────────────────────────
  const event = rollEvent(next, _rng);
  if (event !== null) {
    next = applyEvent(next, event);
    lines.push(event.text);
  }

  // 식량이 마이너스인 주를 센다 (§13 붕괴 조건)
  const starving = next.resources.food < 0;
  next = {
    ...next,
    counters: {
      ...next.counters,
      famineWeeks: starving ? next.counters.famineWeeks + 1 : 0,
    },
  };

  // ── 6. 시대 판정 → 해금 판정 ─────────────────────────
  const power = townPower(next.town.buildings);
  const standing = eraFor(power, next.counters.collapses);
  if (standing.eraIndex !== next.world.eraIndex || standing.eraTier !== next.world.eraTier) {
    const before = eraName(next.world.eraIndex, next.world.eraTier);
    const after = eraName(standing.eraIndex, standing.eraTier);

    const wasExtent = extentFor(next.world.eraIndex);
    const nowExtent = extentFor(standing.eraIndex);

    next = {
      ...next,
      world: { ...next.world, eraIndex: standing.eraIndex, eraTier: standing.eraTier },
    };
    lines.push(CHRONICLE_TEXT.era(before, after));

    if (nowExtent.width !== wasExtent.width || nowExtent.height !== wasExtent.height) {
      lines.push(CHRONICLE_TEXT.expand(nowExtent.width, nowExtent.height));
    }
  }

  /**
   * 인물 해금 — 맹우의 소개 연쇄 (§3 6단계 "해금 판정(지역·인물·건물)").
   *
   * "인물" 이 6단계에 적혀 있는데 구현이 없었다. 새 사람이 들어오는 길이
   * 의뢰 보상 하나뿐이라, 의뢰를 다 하면 명단이 거기서 멈췄다.
   */
  const referred = runReferrals(next);
  if (referred.made.length > 0) {
    next = referred.state;
    for (const { referrer, joined } of referred.made) {
      lines.push(
        CHRONICLE_TEXT.referral(
          displayName(referrer),
          getArchetype(joined.archetypeId)?.label ?? '낯선 사람',
        ),
      );
    }
  }

  // ── 7. 주차 증가, 연대기 기록 ────────────────────────
  let year = next.world.year;
  let week = next.world.week + 1;
  if (week > WEEKS_PER_YEAR) {
    week = 1;
    year += 1;
  }
  const turn = next.world.turn + 1;

  lines.unshift(CHRONICLE_TEXT.week(year, week, seasonOf(week)));

  const entries = lines.map((text, i) => makeEntry(turn, i, text));
  next = {
    ...next,
    world: { ...next.world, year, week, turn },
    // 주가 넘어갔으니 거래 한도가 새로 찬다 (§9)
    counters: { ...next.counters, tradedThisWeek: 0 },
    chronicle: appendEntries(next.chronicle, entries),
  };

  /**
   * 경쟁 사건 추첨 (§7.5). **주차를 올린 뒤에 뽑는다** —
   * "8주마다"는 새 주차 기준이다. 4단계에서 뽑으면 아직 지난 주차라
   * 문턱을 영영 못 넘는다. 실제로 그렇게 짰다가 한 번도 안 열렸다.
   * 사건 자체는 다음에 마을에 들어설 때 벌어진다.
   */
  const rival = rollRival(next, _rng);

  // 붕괴 판정. 주차를 올린 뒤에 본다 — 그 주를 끝까지 살아낸 다음이다 (§13)
  let collapsed = false;
  if (shouldCollapse(next)) {
    const fallen = collapse(next, _rng);
    const line = CHRONICLE_TEXT_COLLAPSE.collapsed(fallen.generation, next.town.name);
    next = {
      ...fallen.state,
      chronicle: appendEntries(fallen.state.chronicle, [
        makeEntry(turn, entries.length, line),
      ]),
    };
    entries.push(makeEntry(turn, entries.length, line));
    collapsed = true;
  }

  // ── 8. 자동 저장 ─────────────────────────────────────
  //    부작용이라 여기서 하지 않는다. 부르는 쪽(스토어)이 저장한다.

  return { state: next, entries, collapsed, rival };
}

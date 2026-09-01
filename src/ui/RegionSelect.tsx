/**
 * 지역 선택 (§11).
 * 고르면 **1주가 소모된다.** 그 사실을 고르기 전에 보여 준다.
 */

import { useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { REGIONS, regionName, type LootRange } from '@/data/regions';
import { computeHeal } from '@/systems/economy';
import { TOUCH_MIN } from '@/data/layout';
import { eraName } from '@/data/eras';
import { ESCORT_MIN_AFFINITY } from '@/data/relationships';
import { displayName } from '@/systems/relationships';
import { escortOf, escortText } from '@/systems/escort';
import { askerName, fillRequest, requestsOf } from '@/systems/requests';
import { nextLocked, openEpisodes } from '@/systems/episodes';

const STAT_LABEL = { might: '힘', agility: '민첩', insight: '통찰', will: '의지' } as const;

/**
 * 무엇을 얻을 수 있는지 (§11 전리품 표).
 *
 * 나가기 전에 볼 데가 서고 열람대뿐이었다 — 서고는 성장기 건물이라
 * 그전에는 어디가 무엇을 주는지 모르고 골라야 했다.
 * 지역마다 나오는 자원이 다르므로 없는 것은 적지 않는다.
 */
function lootText(loot: LootRange): string {
  const parts: string[] = [];
  for (const [id, label] of [
    ['wood', '목'],
    ['stone', '석'],
    ['food', '식'],
    ['gold', '금'],
  ] as const) {
    const range = loot[id];
    if (range === undefined) continue;
    parts.push(`${label} ${range[0]}~${range[1]}`);
  }
  return parts.join(' ');
}

/**
 * 동행 (§11) — 주당 1명, 동료(40) 이상만.
 * 데려갈 사람이 없으면 아무것도 보이지 않는다. 빈 목록을 띄우지 않는다.
 */
function EscortPicker() {
  const state = useGameStore((s) => s.state);
  const setEscort = useGameStore((s) => s.setEscort);
  if (state === null) return null;

  const eligible = Object.values(state.companions).filter(
    (c) =>
      c.departedTurn === null &&
      c.affinity >= ESCORT_MIN_AFFINITY &&
      c.injuredUntilTurn <= state.world.turn,
  );
  if (eligible.length === 0) return null;

  return (
    <div className="mb-2 border-y border-stoneDark/30 py-2">
      <div className="mb-1 text-[11px] text-inkSoft">동행</div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setEscort(null)}
          className={`rounded border border-stoneDark px-2 py-1 text-[11px] ${
            state.escort === null ? 'bg-gold' : 'bg-paperDim'
          }`}
        >
          혼자
        </button>
        {eligible.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setEscort(c.id)}
            className={`rounded border border-stoneDark px-2 py-1 text-[11px] ${
              state.escort === c.id ? 'bg-gold' : 'bg-paperDim'
            }`}
          >
            {displayName(c)}
          </button>
        ))}
      </div>

      {/*
        데려가도 아무 일이 없는 것처럼 보였다 — 보정 수치가 화면 어디에도
        없었기 때문이다. 고른 사람이 무엇을 해 주는지 여기서 말한다.
      */}
      <p className="mt-1 text-[11px] text-grassDark">
        {state.escort === null
          ? '혼자 가면 동행 보정도, 동행 자리도 없다.'
          : `${escortText(escortOf(state))} · 동행 자리가 하나 생긴다`}
      </p>
    </div>
  );
}

/**
 * 동화 에피소드 (§11 곁가지).
 *
 * 지역 목록 **위에** 둔다. 아래에 두면 지역을 고르러 온 손이 끝까지
 * 내려오지 않는다 — 새로 만든 길인데 아무도 못 보면 만들지 않은 것과 같다.
 * 갈 데가 없으면 목록째 감춘다. 빈 칸을 띄우지 않는다.
 */
function EpisodeList({ resting }: { resting: boolean }) {
  const state = useGameStore((s) => s.state);
  const start = useGameStore((s) => s.startEpisode);
  if (state === null) return null;

  const open = openEpisodes(state);
  if (open.length === 0) {
    const waiting = nextLocked(state);
    if (waiting === null) return null;
    return (
      <p className="mt-2 rounded border border-stoneDark bg-paperDim px-2 py-1 text-[11px] text-inkSoft">
        다음 이야기는 {waiting.fromTurn}주차부터 열린다.
      </p>
    );
  }

  return (
    <>
      <div className="mt-2 mb-1 text-[11px] font-medium text-gold">이야기</div>
      <ul className="space-y-1">
        {open.map((episode) => (
          <li key={episode.id}>
            <button
              type="button"
              disabled={resting}
              onClick={() => start(episode.id)}
              style={{ minHeight: TOUCH_MIN }}
              className="w-full rounded border border-gold/60 bg-paperDim px-3 py-2 text-left disabled:opacity-50"
            >
              <div className="text-[13px] font-medium">{episode.title}</div>
              <div className="text-[11px] leading-snug text-inkSoft">{episode.lure}</div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RegionSelect() {
  const open = useGameStore((s) => s.regionSelect);
  const state = useGameStore((s) => s.state);
  const close = useGameStore((s) => s.closeRegionSelect);
  const enter = useGameStore((s) => s.enterRegion);
  const rest = useGameStore((s) => s.restWeek);
  /**
   * 혼자 나가려 할 때 한 번 묻는다.
   *
   * 동행을 고르는 자리가 목록 위에 있어서, 지역만 누르면 고르지 않은 채
   * 그대로 나가진다. 한 주가 소모되는 선택이라 되돌릴 수 없다.
   * **데려갈 사람이 아무도 없으면 묻지 않는다** — 답이 하나뿐인 질문은 방해다.
   */
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!open || state === null) return null;

  // 쓰러진 뒤에는 2주 나갈 수 없다 (§11)
  const canEscort = Object.values(state.companions).some(
    (c) =>
      c.departedTurn === null &&
      c.affinity >= ESCORT_MIN_AFFINITY &&
      c.injuredUntilTurn <= state.world.turn,
  );
  const ask = (regionId: string) => {
    if (state.escort === null && canEscort) setConfirming(regionId);
    else enter(regionId);
  };

  const asks = requestsOf(state);

  const restLeft = Math.max(0, state.hero.restUntilTurn - state.world.turn);
  const resting = restLeft > 0;
  const heal = computeHeal(state);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-ink/80 p-3">
      {confirming !== null && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/70 p-4">
          <div className="w-full rounded border border-stoneDark bg-paper p-3 text-ink">
            <p className="text-[13px]">
              {regionName(confirming)}에 혼자 나가겠는가.
            </p>
            <p className="mt-1 text-[11px] text-inkSoft">
              동행이 있으면 판정 보정이 붙고 동행 자리가 하나 더 생긴다. 한 주는 되돌릴 수 없다.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = confirming;
                  setConfirming(null);
                  enter(target);
                }}
                style={{ minHeight: TOUCH_MIN }}
                className="flex-1 rounded border border-stoneDark bg-gold text-[13px] font-medium"
              >
                혼자 간다
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                style={{ minHeight: TOUCH_MIN }}
                className="flex-1 rounded border border-stoneDark bg-paperDim text-[13px]"
              >
                동행을 고른다
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col rounded border border-stoneDark bg-paper p-3 text-ink">
        <h2 className="text-[15px] font-medium">지역 탐사</h2>
        <p className="mb-2 text-[11px] text-inkSoft">
          나가든 쉬든 1주가 지난다.
        </p>

        {resting && (
          <p className="mb-2 rounded border border-blood bg-paperDim px-2 py-1 text-[11px] text-blood">
            아직 몸이 성치 않다. {restLeft}주 더 쉬어야 나갈 수 있다.
          </p>
        )}

        {/*
          이번 주의 부탁 (§7.3). **고르기 전에 보여야 한다** —
          한 주에 한 곳만 가므로 둘이 다른 데를 부탁하면 하나는 못 들어준다.
          그 갈등이 이 화면에서 보여야 고민이 생긴다.
        */}
        {asks.length > 0 && (
          <div className="mb-2 rounded border border-gold/60 bg-paperDim px-2 py-1">
            <div className="text-[11px] font-medium text-gold">
              이번 주 부탁{asks.length > 1 ? ' — 하나만 들어줄 수 있다' : ''}
            </div>
            {asks.map((req) => (
              <p key={req.companionId} className="text-[11px] leading-snug">
                <b>{askerName(state, req)}</b> · {fillRequest(state, req, 'ask')}
              </p>
            ))}
          </div>
        )}

        <EscortPicker />

        <EpisodeList resting={resting} />

        <div className="mt-2 mb-1 text-[11px] font-medium text-inkSoft">지역</div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {REGIONS.map((region) => {
            const locked = state.world.eraIndex < region.unlockEra;
            return (
              <li key={region.id}>
                <button
                  type="button"
                  disabled={locked || resting}
                  onClick={() => ask(region.id)}
                  style={{ minHeight: TOUCH_MIN }}
                  className="w-full rounded border border-stoneDark bg-paperDim px-3 py-2 text-left disabled:opacity-50"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-medium">{regionName(region.id)}</span>
                    <span className="text-[11px] text-inkSoft">
                      {locked
                        ? `${eraName(region.unlockEra, 0)}에 열림`
                        : `난이도 ${region.difficulty} · ${STAT_LABEL[region.stat]}`}
                    </span>
                  </div>
                  {!locked && asks.some((a) => a.regionId === region.id) && (
                    <div className="text-[11px] text-gold">
                      {askerName(state, asks.find((a) => a.regionId === region.id)!)}가 부탁한 곳
                    </div>
                  )}
                  {!locked && (
                    <div className="text-[11px] tabular-nums text-inkSoft">
                      위험도 {region.risk} · 전리품 {lootText(region.loot)}
                      {region.doubleRelic === true ? ' · 유물 두 배' : ''}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* 나가는 것 말고도 한 주를 쓰는 길이 있어야 한다. 쉬면 기력이 돌아온다 */}
        <button
          type="button"
          onClick={rest}
          style={{ minHeight: TOUCH_MIN }}
          className="mt-2 rounded border border-stoneDark bg-paperDim px-3 text-left"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium">이번 주는 쉰다</span>
            <span className="text-[11px] text-inkSoft">
              기력 {state.hero.hp}/{state.hero.maxHp} · 회복 +{heal}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={close}
          style={{ minHeight: TOUCH_MIN }}
          className="mt-2 rounded border border-stoneDark bg-paperDim text-[13px]"
        >
          돌아가기
        </button>
      </div>
    </div>
  );
}

/**
 * 마주섬 판 (§11 곁가지) — 맞부딪히는 자리.
 *
 * 규칙은 그대로다. 바뀐 것은 **보이는 것과 손이 하는 일**이다.
 *
 * 예전에는 막대 하나와 버튼 셋이었다. 자세를 누르면 결과 문장이 뜨고 끝 —
 * 누가 누구와 맞서는지도, 부딪혔다는 것도 화면에 없었다.
 * 이제 둘이 마주 서고, 고른 뒤 **때를 잡는 한 번**이 더 있고, 부딪히면 밀린다.
 *
 * 손이 하는 일:
 *   1. 기색을 읽고 자세를 고른다 (읽기)
 *   2. 겹치는 순간에 누른다 (때)
 * 때를 잡으면 결과가 한 단계 오른다. 놓쳐도 벌은 없다 — 손이 느린 것이
 * 잘못 읽은 것보다 나쁘면 읽는 일이 값을 잃는다.
 *
 * 규칙은 계산하지 않는다. `systems/duel.ts` 가 정하고 여기서는 보여만 준다.
 * 움직임을 줄여 둔 사람에게는 막대를 느리게 돌린다 — 없애지 않는다.
 * 없애면 그 사람만 때를 못 잡아 규칙이 달라진다.
 */

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { currentStage } from '@/systems/episodes';
import {
  DUEL_EDGE,
  DUEL_ROUNDS,
  RETRY_FAVOR,
  readsClearly,
  tellCandidates,
  type RoundOutcome,
  type Timing,
} from '@/systems/duel';
import {
  STANCES,
  STANCE_HINT,
  STANCE_LABEL,
  TELL,
  TELL_CLEAR,
  TELL_VAGUE,
  TIMING_HIT,
  TIMING_MISS,
  TIMING_PROMPT,
  type Stance,
} from '@/data/content/duel-text';
import { companionSprite } from '@/data/sprites';
import { escortOf } from '@/systems/escort';
import { displayName } from '@/systems/relationships';
import { TOUCH_MIN } from '@/data/layout';
import { useReducedMotion } from './useReducedMotion';
import { CharBust } from './CharBust';

/** 때를 재는 막대가 한 번 오가는 데 걸리는 시간(ms) */
const SWEEP_MS = 1100;
/** 움직임을 줄여 뒀으면 이만큼 느리게 */
const SWEEP_MS_SLOW = 2200;
/** 가운데에서 이 안쪽이면 잡은 것으로 본다 (0~1 중 비율) */
const HIT_WINDOW = 0.12;

interface Props {
  open: {
    text: string;
    round: { mine: Stance; theirs: Stance; outcome: RoundOutcome; line: string } | null;
  };
  onPick: (stance: Stance, timing: Timing) => void;
  onRetry: () => void;
  onNext: () => void;
}

/**
 * 기세. −2 부터 +2 까지 다섯 칸.
 *
 * 숫자로 적으면 또 숫자돌리기가 된다. 칸으로 보여야 지금 어느 쪽으로
 * 기울었는지가 한눈에 들어온다.
 */
function Momentum({ track }: { track: number }) {
  return (
    <div className="flex items-center gap-1">
      {[-2, -1, 0, 1, 2].map((slot) => {
        const on = slot === track;
        return (
          <div
            key={slot}
            className={
              'h-2 flex-1 rounded transition-colors ' +
              (on
                ? track > 0
                  ? 'bg-gold'
                  : track < 0
                    ? 'bg-blood'
                    : 'bg-inkSoft'
                : 'bg-paperDim border border-stoneDark')
            }
          />
        );
      })}
    </div>
  );
}

/**
 * 때를 재는 막대.
 *
 * 표시가 좌우로 오간다. 가운데 띠와 겹칠 때 누르면 잡은 것이다.
 * 한 번 오가고도 안 누르면 놓친 것으로 넘긴다 — 눌러야만 넘어가면
 * 화면이 멎은 것처럼 보인다.
 */
function TimingBar({ stance, onDone }: { stance: Stance; onDone: (t: Timing) => void }) {
  const reduced = useReducedMotion();
  const period = reduced ? SWEEP_MS_SLOW : SWEEP_MS;
  const [pos, setPos] = useState(0);
  const started = useRef(0);
  const done = useRef(false);

  /**
   * 콜백을 상자에 담아 둔다.
   *
   * 부르는 쪽이 인라인 함수를 넘기므로 렌더마다 새 함수다. 그것을 의존성에
   * 두면 **막대가 움직일 때마다 효과가 다시 걸리고**, 그때 정리 함수가
   * 막대를 끝난 것으로 표시해 버린다 — 눌러도 아무 일이 안 일어났다.
   */
  const sink = useRef(onDone);
  sink.current = onDone;

  useEffect(() => {
    started.current = performance.now();
    done.current = false;
    let raf = 0;
    const tick = (now: number): void => {
      if (done.current) return;
      const t = (now - started.current) / period;
      if (t >= 1) {
        done.current = true;
        sink.current('miss');
        return;
      }
      // 0 → 1 → 0 으로 한 번 오간다
      setPos(t < 0.5 ? t * 2 : (1 - t) * 2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // 걷어낼 때 끝난 것으로 **표시하지 않는다.** 표시하면 다시 걸릴 때 죽어 있다
    return () => cancelAnimationFrame(raf);
  }, [period]);

  const strike = (): void => {
    if (done.current) return;
    done.current = true;
    sink.current(Math.abs(pos - 0.5) <= HIT_WINDOW ? 'hit' : 'miss');
  };

  return (
    <div className="mt-3">
      <p className="mb-1 text-center text-[11px] text-inkSoft">
        {STANCE_LABEL[stance]} · {TIMING_PROMPT}
      </p>
      <div className="relative h-6 overflow-hidden rounded border border-stoneDark bg-paperDim">
        {/* 가운데 띠 — 여기 겹칠 때가 그때다 */}
        <div
          className="absolute inset-y-0 bg-gold/40"
          style={{ left: `${(0.5 - HIT_WINDOW) * 100}%`, width: `${HIT_WINDOW * 200}%` }}
        />
        <div
          className="absolute inset-y-0 w-1.5 bg-ink"
          style={{ left: `calc(${pos * 100}% - 3px)` }}
        />
      </div>
      <button
        type="button"
        onClick={strike}
        style={{ minHeight: TOUCH_MIN }}
        className="mt-2 w-full rounded border border-stoneDark bg-gold text-[14px] font-medium"
      >
        지금
      </button>
    </div>
  );
}

export function DuelStage({ open, onPick, onRetry, onNext }: Props) {
  const state = useGameStore((s) => s.state);
  /** 자세를 고른 뒤 때를 재는 중. 화면에만 있는 값이라 스토어에 넣지 않는다 */
  const [aiming, setAiming] = useState<Stance | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);

  // 판이 넘어가면 겨냥을 놓는다
  useEffect(() => {
    if (open.round !== null) setAiming(null);
  }, [open.round]);

  if (state === null) return null;
  const here = currentStage(state);
  const boss = here?.stage.boss;
  const duel = state.episodeRun?.duel;
  if (here == null || boss === undefined || duel == null) return null;

  const favor = state.episodeRun?.favor ?? 0;
  const canRetry = !duel.retried && favor >= RETRY_FAVOR;
  const settled = Math.abs(duel.track) >= DUEL_EDGE || duel.round >= DUEL_ROUNDS;

  const ally = escortOf(state);
  const allySprite = ally === null ? 'char.hero' : companionSprite(ally.archetypeId);
  const allyName = ally === null ? (state.hero.name === '' ? '나' : state.hero.name) : displayName(ally);

  /** 부딪힌 만큼 몸이 밀린다. 기세가 그림으로 보여야 맞부딪힌 것이다 */
  const push = duel.track * 6;

  return (
    <>
      {/* ── 마주 선 자리 ── */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <CharBust
          spriteId={allySprite}
          label={allyName}
          facing="right"
          shift={push}
          dim={open.round?.outcome === 'lose'}
        />
        <div className="flex-1 pb-1">
          <Momentum track={duel.track} />
          <p className="mt-1 text-center text-[11px] text-inkSoft">
            {settled && open.round !== null
              ? '겨룸이 끝났다'
              : `${Math.min(duel.round + 1, DUEL_ROUNDS)} / ${DUEL_ROUNDS} 판`}
          </p>
        </div>
        <CharBust
          label={boss.name}
          facing="left"
          shift={-push}
          dim={open.round?.outcome === 'win'}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-inkSoft">
        <span>{allyName}</span>
        <span>{boss.name}</span>
      </div>

      {/* ── 결과를 읽는 중 ── */}
      {open.round !== null ? (
        <>
          <p className="mt-2 font-serif text-[13px] leading-relaxed">
            {timing !== null ? `${timing === 'hit' ? TIMING_HIT : TIMING_MISS} ` : ''}
            {open.round.line}
          </p>
          <p className="mt-1 text-[11px] text-inkSoft">
            {STANCE_LABEL[open.round.mine]} 대 {STANCE_LABEL[open.round.theirs]}
          </p>
          <div className="mt-3 space-y-1">
            <button
              type="button"
              onClick={onNext}
              style={{ minHeight: TOUCH_MIN }}
              className="w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
            >
              {settled ? '끝까지 본다' : '다시 마주선다'}
            </button>
            {canRetry && !settled && (
              <button
                type="button"
                onClick={onRetry}
                style={{ minHeight: TOUCH_MIN }}
                className="w-full rounded border border-stoneDark bg-paperDim text-[12px]"
              >
                숨을 고른다 · 방금 것을 없던 일로 (결 {RETRY_FAVOR} 소모, 한 번)
              </button>
            )}
          </div>
        </>
      ) : aiming !== null ? (
        /* ── 때를 재는 중 ── */
        <TimingBar
          stance={aiming}
          onDone={(t) => {
            setTiming(t);
            onPick(aiming, t);
          }}
        />
      ) : (
        /* ── 자세를 고르는 중 ── */
        <>
          {duel.round === 0 && (
            <p className="mt-2 font-serif text-[13px] leading-relaxed">{open.text}</p>
          )}
          <p className="mt-2 text-[11px] text-inkSoft">
            {readsClearly(state, boss) ? TELL_CLEAR : TELL_VAGUE}
          </p>
          <div className="mt-1 rounded border border-stoneDark bg-paperDim px-2 py-1">
            {tellCandidates(state, boss, here.episode.id, duel.round).map((c) => (
              <p key={c} className="font-serif text-[12px] leading-snug">
                {TELL[c][duel.round % TELL[c].length]}
              </p>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            {STANCES.map((stance) => (
              <button
                key={stance}
                type="button"
                onClick={() => {
                  setTiming(null);
                  setAiming(stance);
                }}
                style={{ minHeight: TOUCH_MIN }}
                className="w-full rounded border border-stoneDark bg-paperDim px-3 py-2 text-left"
              >
                <div className="text-[13px] font-medium">{STANCE_LABEL[stance]}</div>
                <div className="text-[11px] text-inkSoft">{STANCE_HINT[stance]}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

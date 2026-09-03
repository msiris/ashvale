/**
 * 동화 에피소드 창 (§11 곁가지).
 *
 * 걸어 다니는 것은 맵이 한다. 여기는 판 위에서 열리는 창 셋뿐이다.
 *   - 들어섬: 판에 들어설 때 한 문단
 *   - 이야기: 한가운데를 밟았을 때. 고르는 자리다
 *   - 마주섬: 마지막 판. **주사위를 굴린다** — 지역과 같은 1d20 이다
 *
 * 규칙은 계산하지 않는다. 상태를 읽어 보여주고 누르면 스토어 액션을 부른다.
 */

import { useGameStore } from '@/store/useGameStore';
import { currentStage, fillEpisodeText, isLastStage } from '@/systems/episodes';
import {
  DUEL_EDGE,
  DUEL_ROUNDS,
  RETRY_FAVOR,
  readsClearly,
  tellCandidates,
} from '@/systems/duel';
import type { Stance } from '@/data/content/duel-text';
import {
  STANCES,
  STANCE_HINT,
  STANCE_LABEL,
  TELL,
  TELL_CLEAR,
  TELL_VAGUE,
} from '@/data/content/duel-text';
import { HOLD_TRADE_BONUS, TRIBUTE_MULTIPLIER } from '@/data/faction-holds';
import { TOUCH_MIN } from '@/data/layout';

/** 문단 사이를 띄운다. 서술이 한 덩어리로 붙으면 읽히지 않는다 */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((para) => (
        <p key={para} className="mt-2 font-serif text-[13px] leading-relaxed first:mt-0">
          {para}
        </p>
      ))}
    </>
  );
}

export function EpisodePanel() {
  const open = useGameStore((s) => s.episode);
  const state = useGameStore((s) => s.state);
  const choose = useGameStore((s) => s.chooseEpisodeBeat);
  const pick = useGameStore((s) => s.pickStance);
  const retry = useGameStore((s) => s.retryRound);
  const next = useGameStore((s) => s.nextRound);
  const settle = useGameStore((s) => s.settleFaction);
  const retryBoss = useGameStore((s) => s.retryBoss);
  const leave = useGameStore((s) => s.leaveEpisode);
  const close = useGameStore((s) => s.closeEpisode);

  if (open === null || state === null) return null;

  const here = currentStage(state);
  if (here === null) return null;

  const total = here.episode.stages.length;
  const last = isLastStage(here.episode, here.index);

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-ink/80 p-3">
      <div className="max-h-full overflow-y-auto rounded border border-stoneDark bg-paper p-3 text-ink">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-gold">{here.episode.title}</h2>
          <span className="text-[11px] text-inkSoft">
            {last ? '마지막 판' : `${here.index + 1} / ${total}`}
          </span>
        </div>

        {open.kind === 'enter' && (
          <>
            <div className="mt-2">
              <Prose text={open.text} />
            </div>
            <button
              type="button"
              onClick={close}
              style={{ minHeight: TOUCH_MIN }}
              className="mt-3 w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
            >
              걷는다
            </button>
          </>
        )}

        {open.kind === 'scene' &&
          (open.result === null ? (
            <>
              <p className="mt-2 font-serif text-[13px] leading-relaxed">
                {fillEpisodeText(here.stage.scene?.text ?? '', state)}
              </p>
              <div className="mt-3 space-y-1">
                {(here.stage.scene?.choices ?? []).map((choice, i) => (
                  <button
                    key={choice.text}
                    type="button"
                    onClick={() => choose(i)}
                    style={{ minHeight: TOUCH_MIN }}
                    className="w-full rounded border border-stoneDark bg-paperDim px-3 py-2 text-left text-[13px]"
                  >
                    {fillEpisodeText(choice.text, state)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 font-serif text-[13px] leading-relaxed">{open.result.result}</p>
              {(open.result.notes.length > 0 || open.result.xp > 0) && (
                <p className="mt-1 text-[11px] text-inkSoft">
                  {[...open.result.notes, open.result.xp > 0 ? `경험 +${open.result.xp}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {open.result.levelUp !== null && (
                <p className="mt-1 text-[11px] text-gold">단계가 올랐다</p>
              )}
              <button
                type="button"
                onClick={close}
                style={{ minHeight: TOUCH_MIN }}
                className="mt-3 w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
              >
                계속
              </button>
            </>
          ))}

        {open.kind === 'boss' && open.result === null && (
          <DuelView open={open} onPick={pick} onRetry={retry} onNext={next} />
        )}

        {open.kind === 'boss' && open.result !== null && (
          <>
            <div className="mt-2">
              <Prose text={open.result.line} />
            </div>
            {open.result.joined !== null && (
              <p className="mt-2 rounded border border-gold/60 bg-paperDim px-2 py-1 text-[12px] text-gold">
                {open.result.joined} 합류
              </p>
            )}

            {/*
              세력 이야기는 여기서 한 번 더 갈린다 (§7).
              어느 쪽도 정답이 아니므로 **무엇을 얻고 무엇을 잃는지 적어 둔다** —
              안 적으면 둘 다 그냥 버튼이다.
            */}
            {open.result.pendingFaction ? (
              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  onClick={() => settle('helped')}
                  style={{ minHeight: TOUCH_MIN }}
                  className="w-full rounded border border-stoneDark bg-paperDim px-3 py-2 text-left"
                >
                  <div className="text-[13px] font-medium">{here.episode.outcome?.helpTitle}</div>
                  <div className="text-[11px] text-inkSoft">
                    평판이 크게 오르고 그쪽 마을에서 값을 잘 쳐준다 (+
                    {Math.round(HOLD_TRADE_BONUS.helped * 100)}%). 조공은 적다
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => settle('ruled')}
                  style={{ minHeight: TOUCH_MIN }}
                  className="w-full rounded border border-stoneDark bg-paperDim px-3 py-2 text-left"
                >
                  <div className="text-[13px] font-medium">{here.episode.outcome?.ruleTitle}</div>
                  <div className="text-[11px] text-inkSoft">
                    조공이 {TRIBUTE_MULTIPLIER.ruled}배로 온다. 평판이 깎이고 거래 값이 나빠진다
                  </div>
                </button>
              </div>
            ) : open.result.won ? (
              <button
                type="button"
                onClick={close}
                style={{ minHeight: TOUCH_MIN }}
                className="mt-3 w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
              >
                마을로 돌아간다
              </button>
            ) : (
              /*
                못 넘겼을 때 (§11 곁가지).
                **돌려보내지 않는다.** 판에는 그대로 서 있으므로 다시 설 수 있다.
                기력이 없으면 다시 설 수 없다 — 무한히 다시 서면 마주섬이
                아무것도 걸지 않는 자리가 된다.
              */
              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  onClick={retryBoss}
                  disabled={state.hero.hp <= 0}
                  style={{ minHeight: TOUCH_MIN }}
                  className="w-full rounded border border-stoneDark bg-gold px-3 py-2 text-left disabled:opacity-50"
                >
                  <div className="text-[13px] font-medium">다시 마주선다</div>
                  <div className="text-[11px] text-inkSoft">
                    {state.hero.hp <= 0
                      ? '기력이 없다. 이번에는 돌아가야 한다'
                      : `이 판에 그대로 선다 · 기력 ${state.hero.hp}/${state.hero.maxHp}`}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={leave}
                  style={{ minHeight: TOUCH_MIN }}
                  className="w-full rounded border border-stoneDark bg-paperDim px-3 py-2 text-left"
                >
                  <div className="text-[13px] font-medium">마을로 돌아간다</div>
                  <div className="text-[11px] text-inkSoft">
                    끝낸 표를 남기지 않으니 다음에 다시 올 수 있다
                  </div>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 저울. −2 부터 +2 까지 다섯 칸으로 보여 준다.
 *
 * 숫자로 적으면 또 숫자돌리기가 된다. **칸으로 보여야** 지금 어느 쪽으로
 * 기울었는지가 한눈에 들어온다.
 */
function Scale({ track }: { track: number }) {
  return (
    <div className="mt-2 flex items-center gap-1">
      {[-2, -1, 0, 1, 2].map((slot) => {
        const on = slot === track;
        return (
          <div
            key={slot}
            className={
              'h-2 flex-1 rounded ' +
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

interface DuelProps {
  open: { text: string; round: { mine: Stance; theirs: Stance; outcome: string; line: string } | null };
  onPick: (s: Stance) => void;
  onRetry: () => void;
  onNext: () => void;
}

/**
 * 마주섬 (§11 곁가지).
 *
 * 예전에는 「마주선다」 버튼 하나를 누르면 1d20 이 굴러 끝났다.
 * 누를 것이 하나뿐이라 **고르는 일이 없었다.**
 *
 * 이제 상대의 기색을 먼저 보여 주고 자세 셋 중에서 고르게 한다.
 * 눈이 밝으면 하나로 짚이고 모자라면 둘까지만 좁혀진다 —
 * 능력치가 결과를 굴리는 대신 **정보의 질을 산다.**
 */
function DuelView({ open, onPick, onRetry, onNext }: DuelProps) {
  const state = useGameStore((s) => s.state);
  if (state === null) return null;

  const here = currentStage(state);
  const boss = here?.stage.boss;
  const duel = state.episodeRun?.duel;
  if (here === null || boss === undefined || duel === undefined || duel === null) return null;

  const favor = state.episodeRun?.favor ?? 0;
  const canRetry = !duel.retried && favor >= RETRY_FAVOR;
  const settled = Math.abs(duel.track) >= DUEL_EDGE || duel.round >= DUEL_ROUNDS;

  // 결과를 읽는 중
  if (open.round !== null) {
    return (
      <>
        <Scale track={duel.track} />
        <p className="mt-2 font-serif text-[13px] leading-relaxed">{open.round.line}</p>
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
    );
  }

  // 자세를 고르는 중
  const candidates = tellCandidates(state, boss, here.episode.id, duel.round);
  const clear = readsClearly(state, boss);

  return (
    <>
      {duel.round === 0 && (
        <div className="mt-2">
          <Prose text={open.text} />
        </div>
      )}
      <Scale track={duel.track} />
      <p className="mt-1 text-[11px] text-inkSoft">
        {duel.round + 1} / {DUEL_ROUNDS} 판 · {clear ? TELL_CLEAR : TELL_VAGUE}
      </p>

      {/* 상대의 기색. 여기가 고르는 근거다 */}
      <div className="mt-2 rounded border border-stoneDark bg-paperDim px-2 py-1">
        {candidates.map((c) => (
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
            onClick={() => onPick(stance)}
            style={{ minHeight: TOUCH_MIN }}
            className="w-full rounded border border-stoneDark bg-paperDim px-3 py-2 text-left"
          >
            <div className="text-[13px] font-medium">{STANCE_LABEL[stance]}</div>
            <div className="text-[11px] text-inkSoft">{STANCE_HINT[stance]}</div>
          </button>
        ))}
      </div>
    </>
  );
}


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
import { currentStage, isLastStage, isRecall } from '@/systems/episodes';
import { HOLD_TRADE_BONUS, TRIBUTE_MULTIPLIER } from '@/data/faction-holds';
import { TOUCH_MIN } from '@/data/layout';
import { DuelStage } from './DuelStage';
import { RETRY_FAVOR, startDuel } from '@/systems/duel';
import { companionSprite } from '@/data/sprites';
import { escortOf } from '@/systems/escort';
import { displayName } from '@/systems/relationships';
import { SceneStage } from './SceneStage';

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
          <h2 className="text-[13px] font-medium text-gold">
            {here.episode.title}
            {/* 회상이면 표시한다. 처음 걷는 것과 헷갈리면 안 된다 */}
            {isRecall(state, here.episode.id) && (
              <span className="ml-1 text-[11px] font-normal text-inkSoft">회상</span>
            )}
          </h2>
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

        {open.kind === 'scene' && (
          <SceneStage result={open.result} onChoose={choose} onClose={close} />
        )}

        {open.kind === 'boss' && open.result === null && here.stage.boss !== undefined && (
          <DuelStage
            foe={here.stage.boss}
            duel={state.episodeRun?.duel ?? startDuel(state, here.stage.boss)}
            intro={open.text}
            round={open.round}
            seedId={here.episode.id}
            allySprite={
              escortOf(state) === null
                ? 'char.hero'
                : companionSprite(escortOf(state)!.archetypeId)
            }
            allyName={
              escortOf(state) === null
                ? state.hero.name === ''
                  ? '나'
                  : state.hero.name
                : displayName(escortOf(state)!)
            }
            canRetry={
              state.episodeRun?.duel?.retried === false &&
              (state.episodeRun?.favor ?? 0) >= RETRY_FAVOR
            }
            onPick={pick}
            onRetry={retry}
            onNext={next}
          />
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

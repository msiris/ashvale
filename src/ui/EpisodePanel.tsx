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
  const roll = useGameStore((s) => s.rollEpisodeBoss);
  const settle = useGameStore((s) => s.settleFaction);
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

        {open.kind === 'boss' &&
          (open.result === null ? (
            <>
              <p className="mt-2 font-serif text-[13px] leading-relaxed">{open.text}</p>
              {/* 어떤 판정인지 먼저 보여 준다. 굴리고 나서 알면 고를 게 없다 */}
              <p className="mt-2 text-[11px] text-inkSoft">
                {STAT_LABEL[here.stage.boss?.stat ?? 'might']} 판정 · 난도{' '}
                {here.stage.boss?.difficulty} · 여기까지 쌓은 결{' '}
                {state.episodeRun?.favor ?? 0}
              </p>
              <button
                type="button"
                onClick={roll}
                style={{ minHeight: TOUCH_MIN }}
                className="mt-3 w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
              >
                마주선다
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-[11px] text-inkSoft">
                주사위 {open.result.roll.die} + 보정{' '}
                {open.result.roll.total - open.result.roll.die} + 결 {open.result.favorBonus} ={' '}
                <b className={open.result.won ? 'text-gold' : 'text-blood'}>{open.result.total}</b> /{' '}
                {open.result.roll.difficulty}
              </p>
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
                    <div className="text-[13px] font-medium">
                      {here.episode.outcome?.helpTitle}
                    </div>
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
                    <div className="text-[13px] font-medium">
                      {here.episode.outcome?.ruleTitle}
                    </div>
                    <div className="text-[11px] text-inkSoft">
                      조공이 {TRIBUTE_MULTIPLIER.ruled}배로 온다. 평판이 깎이고 거래 값이 나빠진다
                    </div>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={close}
                  style={{ minHeight: TOUCH_MIN }}
                  className="mt-3 w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
                >
                  마을로 돌아간다
                </button>
              )}
            </>
          ))}
      </div>
    </div>
  );
}

const STAT_LABEL = { might: '힘', agility: '민첩', insight: '통찰', will: '의지' } as const;

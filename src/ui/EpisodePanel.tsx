/**
 * 동화 에피소드 (§11 곁가지).
 *
 * 지역 사건 패널과 같은 결로 만든다 — 상황을 읽고 고르고 결과를 읽는다.
 * **주사위 연출이 없다.** 여기는 굴리는 자리가 아니다.
 *
 * 규칙은 계산하지 않는다. 상태를 읽어 보여주고 누르면 스토어 액션을 부른다.
 */

import { useGameStore } from '@/store/useGameStore';
import { episodeById, fillEpisodeText } from '@/systems/episodes';
import { TOUCH_MIN } from '@/data/layout';

export function EpisodePanel() {
  const open = useGameStore((s) => s.episode);
  const state = useGameStore((s) => s.state);
  const choose = useGameStore((s) => s.chooseEpisodeBeat);
  const advance = useGameStore((s) => s.advanceEpisode);
  const close = useGameStore((s) => s.closeEpisode);

  if (open === null || state === null) return null;

  const episode = episodeById(open.episodeId);
  if (episode === null) return null;

  const beat = episode.beats[open.beat];
  const { last, ending } = open;

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-ink/80 p-3">
      <div className="max-h-full overflow-y-auto rounded border border-stoneDark bg-paper p-3 text-ink">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-gold">{episode.title}</h2>
          {ending === null && (
            <span className="text-[11px] text-inkSoft">
              {open.beat + 1} / {episode.beats.length}
            </span>
          )}
        </div>

        {/* 들어설 때의 한 문단. 첫 장에서만 보인다 */}
        {open.beat === 0 && last === null && ending === null && (
          <p className="mt-2 font-serif text-[13px] leading-relaxed text-inkSoft">
            {fillEpisodeText(episode.intro, state)}
          </p>
        )}

        {ending !== null ? (
          <>
            <p className="mt-2 font-serif text-[13px] leading-relaxed">{ending.text}</p>
            {ending.joined !== null && (
              <p className="mt-2 rounded border border-gold/60 bg-paperDim px-2 py-1 text-[12px] text-gold">
                {ending.joined} 합류
              </p>
            )}
            <button
              type="button"
              onClick={close}
              style={{ minHeight: TOUCH_MIN }}
              className="mt-3 w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
            >
              닫기
            </button>
          </>
        ) : last !== null ? (
          <>
            <p className="mt-2 font-serif text-[13px] leading-relaxed">{last.result}</p>
            {(last.notes.length > 0 || last.xp > 0) && (
              <p className="mt-1 text-[11px] text-inkSoft">
                {[...last.notes, last.xp > 0 ? `경험 +${last.xp}` : ''].filter(Boolean).join(' · ')}
              </p>
            )}
            {last.levelUp && <p className="mt-1 text-[11px] text-gold">단계가 올랐다</p>}
            <button
              type="button"
              onClick={advance}
              style={{ minHeight: TOUCH_MIN }}
              className="mt-3 w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
            >
              {open.beat + 1 < episode.beats.length ? '계속' : '끝까지 본다'}
            </button>
          </>
        ) : beat === undefined ? null : (
          <>
            <p className="mt-2 font-serif text-[13px] leading-relaxed">
              {fillEpisodeText(beat.text, state)}
            </p>
            <div className="mt-3 space-y-1">
              {beat.choices.map((choice, i) => (
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
        )}
      </div>
    </div>
  );
}

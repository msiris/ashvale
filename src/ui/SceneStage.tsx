/**
 * 이야기 자리 (§11 곁가지) — 마주 보고 하는 말.
 *
 * 판 한가운데를 밟으면 열리는 자리다. 예전에는 서술 한 문단과 버튼 셋뿐이라
 * **누구와 이야기하는지 화면에 없었다.** 마을 대화에는 초상이 서는데
 * 이야기 판에서는 아무도 얼굴이 없었다.
 *
 * 이제 둘이 마주 선다. 왼쪽은 이쪽(동행이 있으면 그 사람), 오른쪽은
 * 그 자리에서 만난 상대다. 상대 이름이 적혀 있지 않은 자리 —
 * 둥지나 우리처럼 사람이 없는 데 — 는 이쪽만 선다.
 *
 * 규칙은 계산하지 않는다. 상태를 읽어 보여주고 누르면 스토어 액션을 부른다.
 */

import { useGameStore } from '@/store/useGameStore';
import { currentStage, fillEpisodeText } from '@/systems/episodes';
import { companionSprite } from '@/data/sprites';
import { escortOf } from '@/systems/escort';
import { displayName } from '@/systems/relationships';
import { TOUCH_MIN } from '@/data/layout';
import { CharBust } from './CharBust';

interface Props {
  result: { result: string; notes: string[]; xp: number; levelUp: unknown } | null;
  onChoose: (index: number) => void;
  onClose: () => void;
}

export function SceneStage({ result, onChoose, onClose }: Props) {
  const state = useGameStore((s) => s.state);
  if (state === null) return null;

  const here = currentStage(state);
  const scene = here?.stage.scene;
  if (here == null || scene === undefined) return null;

  const ally = escortOf(state);
  const allySprite = ally === null ? 'char.hero' : companionSprite(ally.archetypeId);
  const allyName =
    ally === null ? (state.hero.name === '' ? '나' : state.hero.name) : displayName(ally);

  return (
    <>
      {/* ── 마주 선 자리 ── */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-center">
          <CharBust spriteId={allySprite} label={allyName} facing="right" />
          <div className="mt-0.5 text-[11px] text-inkSoft">{allyName}</div>
        </div>
        {scene.speaker !== undefined && (
          <div className="text-center">
            <CharBust label={scene.speaker} facing="left" />
            <div className="mt-0.5 text-[11px] text-inkSoft">{scene.speaker}</div>
          </div>
        )}
      </div>

      {result === null ? (
        <>
          <p className="mt-2 font-serif text-[13px] leading-relaxed">
            {fillEpisodeText(scene.text, state)}
          </p>
          <div className="mt-3 space-y-1">
            {scene.choices.map((choice, i) => (
              <button
                key={choice.text}
                type="button"
                onClick={() => onChoose(i)}
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
          <p className="mt-2 font-serif text-[13px] leading-relaxed">{result.result}</p>
          {(result.notes.length > 0 || result.xp > 0) && (
            <p className="mt-1 text-[11px] text-inkSoft">
              {[...result.notes, result.xp > 0 ? `경험 +${result.xp}` : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {result.levelUp != null && <p className="mt-1 text-[11px] text-gold">단계가 올랐다</p>}
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: TOUCH_MIN }}
            className="mt-3 w-full rounded border border-stoneDark bg-gold text-[13px] font-medium"
          >
            계속
          </button>
        </>
      )}
    </>
  );
}

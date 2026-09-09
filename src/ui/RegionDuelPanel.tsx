/**
 * 지역에서 마주선 창 (§11).
 *
 * 이야기의 마지막 판과 **같은 화면**을 쓴다 (`DuelStage`). 규칙이 같은데
 * 화면을 둘로 두면 한쪽만 고치는 일이 생긴다.
 *
 * 다른 것은 걸린 것뿐이다 — 이기면 전리품이고, 지면 기력을 잃고 물러난다.
 * **죽지 않는다.** 표식이 남으므로 몸을 추스르고 다시 설 수 있다.
 *
 * 규칙은 계산하지 않는다. 상태를 읽어 보여주고 누르면 스토어 액션을 부른다.
 */

import { useGameStore } from '@/store/useGameStore';
import { regionIdFromMap } from '@/data/regions';
import { FOE_ENCOUNTER, foeOf } from '@/data/content/region-foes';
import { companionSprite } from '@/data/sprites';
import { escortOf } from '@/systems/escort';
import { displayName } from '@/systems/relationships';
import { TOUCH_MIN } from '@/data/layout';
import { DuelStage } from './DuelStage';

export function RegionDuelPanel() {
  const open = useGameStore((s) => s.regionDuel);
  const state = useGameStore((s) => s.state);
  const pick = useGameStore((s) => s.pickRegionStance);
  const next = useGameStore((s) => s.nextRegionRound);
  const close = useGameStore((s) => s.closeRegionDuel);

  if (open === null || state === null) return null;

  const regionId = regionIdFromMap(state.world.currentMap);
  const foe = regionId === null ? null : foeOf(regionId);
  const duel = state.world.regionDuel;
  if (regionId === null || foe === null) return null;

  const ally = escortOf(state);
  const allySprite = ally === null ? 'char.hero' : companionSprite(ally.archetypeId);
  const allyName =
    ally === null ? (state.hero.name === '' ? '나' : state.hero.name) : displayName(ally);

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-ink/80 p-3">
      <div className="max-h-full overflow-y-auto rounded border border-stoneDark bg-paper p-3 text-ink">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-blood">{foe.name}</h2>
          <span className="text-[11px] text-inkSoft">마주섬</span>
        </div>

        {open.result !== null ? (
          <>
            <p className="mt-2 font-serif text-[13px] leading-relaxed">{open.result.line}</p>
            <p className="mt-1 text-[11px] text-inkSoft">{open.result.spoils}</p>
            {!open.result.won && (
              <p className="mt-1 text-[11px] text-inkSoft">
                물러났을 뿐이다. 표식은 그대로 있으니 다시 설 수 있다.
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
        ) : duel === null ? null : (
          <DuelStage
            foe={foe}
            duel={duel}
            intro={`${FOE_ENCOUNTER}\n\n${foe.text}`}
            round={open.round}
            seedId={regionId}
            allySprite={allySprite}
            allyName={allyName}
            /* 되돌리기는 이야기에서 쌓은 결로 쓰는 것이다. 지역에는 없다 */
            canRetry={false}
            onPick={pick}
            onRetry={() => undefined}
            onNext={next}
          />
        )}
      </div>
    </div>
  );
}

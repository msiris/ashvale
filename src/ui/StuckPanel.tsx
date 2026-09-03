/**
 * 갇혔을 때 (§11 걷는 규칙).
 *
 * 예전에는 곧장 마을로 쫓아냈다. 걸어 들어온 사람을 묻지도 않고
 * 되돌려 보내는 건 벌이지 결정이 아니다. **고르게 한다.**
 *
 * 지역에서도 에피소드 판에서도 같은 창을 쓴다 — 발밑이 무너진 사정은 같다.
 *
 * 규칙은 계산하지 않는다. 상태를 읽어 보여주고 누르면 스토어 액션을 부른다.
 */

import { useGameStore } from '@/store/useGameStore';
import { RETRY_SPOT_HP, STUCK_BODY, STUCK_TITLE, TRAPPED_HP } from '@/systems/walkRule';
import { TOUCH_MIN } from '@/data/layout';

export function StuckPanel() {
  const stuck = useGameStore((s) => s.stuck);
  const state = useGameStore((s) => s.state);
  const retry = useGameStore((s) => s.retrySpot);
  const giveUp = useGameStore((s) => s.giveUpSpot);

  if (!stuck || state === null) return null;

  const hp = state.hero.hp;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/85 p-4">
      <div className="w-full rounded border border-stoneDark bg-paper p-3 text-ink">
        <h2 className="text-[13px] font-medium text-blood">{STUCK_TITLE}</h2>
        <p className="mt-2 font-serif text-[13px] leading-relaxed">{STUCK_BODY}</p>

        <div className="mt-3 space-y-1">
          <button
            type="button"
            onClick={retry}
            disabled={hp <= RETRY_SPOT_HP}
            style={{ minHeight: TOUCH_MIN }}
            className="w-full rounded border border-stoneDark bg-gold px-3 py-2 text-left disabled:opacity-50"
          >
            <div className="text-[13px] font-medium">처음부터 다시 걷는다</div>
            <div className="text-[11px] text-inkSoft">
              입구로 돌아가 밟은 자리를 되돌린다 · 기력 −{RETRY_SPOT_HP}
              {hp <= RETRY_SPOT_HP ? ' (기력이 모자라다)' : ''}
            </div>
          </button>
          <button
            type="button"
            onClick={giveUp}
            style={{ minHeight: TOUCH_MIN }}
            className="w-full rounded border border-stoneDark bg-paperDim px-3 py-2 text-left"
          >
            <div className="text-[13px] font-medium">마을로 돌아간다</div>
            <div className="text-[11px] text-inkSoft">
              여기까지 한 것은 남는다 · 기력 −{TRAPPED_HP}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

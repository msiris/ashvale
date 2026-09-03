/**
 * 가운데 필드 — 남는 높이를 흡수한다 (§2, src/data/layout.ts).
 *
 * Phaser 캔버스가 배경이고, React UI 가 그 위에 겹친다.
 * 설계 목표 높이는 470dp 이지만 **하한으로 걸지 않는다** —
 * 낮은 화면에서 470 을 고집하면 조작부가 화면 밖으로 밀려
 * D패드 아랫줄을 누를 수 없게 된다. 좁으면 필드가 양보한다.
 */

import { PhaserHost } from '@/phaser/PhaserHost';
import { InteractPrompt } from './InteractPrompt';
import { DialogueLayer } from './dialogue/DialogueLayer';
import { BuildPanel } from './BuildPanel';
import { RegionSelect } from './RegionSelect';
import { RoomPanel } from './RoomPanel';
import { RegionEventPanel } from './RegionEventPanel';
import { EpisodePanel } from './EpisodePanel';
import { StuckPanel } from './StuckPanel';
import { OutingPanel } from './OutingPanel';
import { ExploreResult } from './ExploreResult';
import { Toast } from './Toast';
import { FamineBanner } from './FamineBanner';
import { Hint } from './Hint';
import { MarketPanel } from './menu/MarketPanel';
import { NamingPrompt } from './NamingPrompt';

interface Props {
  prompt: string | null;
  talking: boolean;
}

export function FieldBand({ prompt, talking }: Props) {
  return (
    <main className="relative min-h-0 flex-1 overflow-hidden bg-ink">
      <PhaserHost />
      {/* 대화 중에는 상호작용 프롬프트를 감춘다. 대사창이 그 자리를 쓴다 */}
      {!talking && <InteractPrompt label={prompt} />}
      <DialogueLayer />
      <BuildPanel />
      <RegionSelect />
      <RoomPanel />
      <RegionEventPanel />
      <EpisodePanel />
      <StuckPanel />
      <OutingPanel />
      <ExploreResult />
      <Toast />
      <FamineBanner />
      <Hint />
      <MarketPanel />
      <NamingPrompt />
    </main>
  );
}

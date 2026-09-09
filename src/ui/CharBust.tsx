/**
 * 인물 흉상 — 필드 스프라이트의 정면 정지 프레임 하나를 크게 그린다.
 *
 * 대화 초상(§8.1)은 **플레이어가 넣는 3:4 이미지**다. 넣기 전에는 실루엣이고,
 * 이야기 속 인물(마주설 것, 빨간 망토를 쓴 아이)은 애초에 넣을 자리가 없다.
 * 그래서 이야기 판에서는 **아무도 얼굴이 없었다** — 글만 오갔다.
 *
 * 이미 있는 것을 쓴다. 필드에 서 있는 그 그림이다. 시트에서 프레임 하나를
 * 잘라 확대하면 얼굴이 생기고, 플레이어가 아무것도 안 넣어도 나온다.
 *
 * 경로를 박지 않는다. 에셋 매니페스트를 거치고, `path` 가 없으면
 * 실루엣으로 간다 — 그림이 아직 없어도 게임은 굴러가야 한다.
 */

import { CHAR_SHEET, DIR_ROW, IDLE_FRAME } from '@/data/characters';
import { getAsset } from '@/data/assets';
import { Silhouette } from './dialogue/Silhouette';

/** 몇 배로 키울지. 16×24 를 이만큼 키워 얼굴이 보이게 한다 */
const ZOOM = 4;

interface Props {
  /** 에셋 매니페스트의 id. 없으면 실루엣이 선다 */
  spriteId?: string | undefined;
  /** 실루엣에 적을 이름. 그림이 없을 때만 보인다 */
  label: string;
  /** 오른쪽에 선 쪽은 뒤집어 마주 보게 한다 */
  facing?: 'left' | 'right';
  /** 밀리거나 앞선 만큼. 부딪힘을 몸으로 보여 준다 */
  shift?: number;
  dim?: boolean;
}

export function CharBust({ spriteId, label, facing = 'right', shift = 0, dim = false }: Props) {
  const entry = spriteId === undefined ? undefined : getAsset(spriteId);
  const sheet = entry?.sheet ?? CHAR_SHEET;
  // 시트 스펙은 열·행이 선택 항목이다. 캐릭터 시트 값을 기본으로 둔다
  const cols = sheet.columns ?? CHAR_SHEET.columns;
  const rows = sheet.rows ?? CHAR_SHEET.rows;
  const w = sheet.frameWidth * ZOOM;
  const h = sheet.frameHeight * ZOOM;

  // 그림이 아직 없다. 조용히 실루엣으로 간다 (§8.2)
  if (entry?.path == null) {
    return (
      <div
        style={{ width: w, height: h, transform: `translateX(${shift}px)`, opacity: dim ? 0.55 : 1 }}
        className="overflow-hidden rounded border border-stoneDark transition-transform duration-200"
      >
        <Silhouette label={label} />
      </div>
    );
  }

  /**
   * 정면 정지 프레임 하나만 보이게 시트를 밀어 넣는다.
   * `pixelated` 를 걸지 않으면 16px 원본이 뭉개진다.
   */
  const row = DIR_ROW.down;
  return (
    <div
      style={{
        width: w,
        height: h,
        transform: `translateX(${shift}px) scaleX(${facing === 'left' ? -1 : 1})`,
        opacity: dim ? 0.55 : 1,
        backgroundImage: `url(${entry.path})`,
        backgroundPosition: `-${IDLE_FRAME * w}px -${row * h}px`,
        backgroundSize: `${sheet.frameWidth * cols * ZOOM}px ${sheet.frameHeight * rows * ZOOM}px`,
        imageRendering: 'pixelated',
      }}
      className="transition-transform duration-200"
      role="img"
      aria-label={label}
    />
  );
}

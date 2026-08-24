/**
 * 아쉬베일 마을 — 기획서 §6, §10.
 *
 * **맵은 한 벌뿐이다.** 시대마다 별도 파일을 그리면 유지가 불가능해진다 (§6).
 * 36×30 을 통째로 만들고, 아직 열리지 않은 바깥을 수풀로 막는다.
 * 시대가 오르면 그 수풀이 치워지면서 마을이 넓어진다.
 *
 * 건물은 걸어다니며 보이는 것이다 (§10). 레벨에 따라 부지 안의 구조물이 커지고,
 * 시각 단계는 1 / 4 / 10 세 개뿐이다.
 *
 * **임시다.** Tiled JSON 이 들어오면 지형과 부지 배치는 그쪽에서 온다.
 */

import type { MapObject, Terrain, TileMapData } from '@/types/map';
import { TOWN_MAX, inRect, playableRect } from '@/data/eras';
import { visualStage, wallStage } from '@/data/buildings';
import { createRng } from '@/systems/rng';
import { companionSprite, patronSprite } from '@/data/sprites';

const W = TOWN_MAX.width;
const H = TOWN_MAX.height;

/** 건물 부지. 최대 단계에서 이만큼을 차지한다 */
interface Plot {
  buildingId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 부지는 그 건물이 열리는 시대의 범위 안에 있어야 한다 */
const PLOTS: Plot[] = [
  { buildingId: 'hall', x: 8, y: 15, w: 5, h: 4 },
  { buildingId: 'lumber', x: 3, y: 17, w: 3, h: 3 },
  { buildingId: 'farm', x: 14, y: 19, w: 4, h: 4 },
  { buildingId: 'quarry', x: 3, y: 22, w: 3, h: 3 },
  { buildingId: 'lodge', x: 14, y: 24, w: 4, h: 3 },
  // 성장기 — 북쪽 구역
  { buildingId: 'market', x: 9, y: 7, w: 4, h: 4 },
  { buildingId: 'library', x: 16, y: 8, w: 3, h: 3 },
  { buildingId: 'shrine', x: 4, y: 8, w: 3, h: 3 },
  // 영주기
  { buildingId: 'guildhall', x: 21, y: 15, w: 4, h: 4 },
  // 왕국기 — 동쪽 구역
  { buildingId: 'academy', x: 28, y: 10, w: 4, h: 4 },
  { buildingId: 'spire', x: 28, y: 20, w: 4, h: 5 },
];

/** 남쪽 길목. 여기로 지역에 나간다 */
const GATEWAY_X = 10;

export interface TownContext {
  eraIndex: number;
  buildings: Record<string, number>;
  /**
   * 마을에 서 있을 인물 (§7.6).
   *
   * 예전에는 기사 하나가 좌표까지 박힌 채 서 있었고 나머지는 마을에 없었다.
   * 이제 명단에서 온다 — 상태가 정하고 맵은 그리기만 한다.
   */
  folk?: { id: string; archetypeId: string; name: string }[];
  /**
   * 회관을 나와 마을에 서 있는 의뢰인 (§7.6 나들이).
   * 다가오지는 않는다 — 찾아가야 만나는 건 그대로다.
   */
  patronOut?: { id: string; name: string; badge?: 'offer' | 'report' };
}

/**
 * 인물이 서는 자리. 길과 부지를 피해 잡았다.
 *
 * 명단 순서대로 앞에서부터 채운다. **자리를 흔들지 않는다** —
 * 어제 만난 사람이 오늘 딴 데 가 있으면 찾아갈 데가 없는 것과 같다.
 * 시대가 낮아 마을이 좁으면 바깥 자리는 그냥 건너뛴다.
 */
const FOLK_SPOTS: { x: number; y: number }[] = [
  { x: 13, y: 23 },
  { x: 7, y: 21 },
  { x: 14, y: 17 },
  { x: 6, y: 26 },
  { x: 16, y: 26 },
  { x: 4, y: 18 },
  { x: 18, y: 20 },
  { x: 8, y: 15 },
];

/** 같은 입력이면 같은 맵이다. 씬이 이 열쇠로 다시 그릴지 판단한다 */
export function townKey(ctx: TownContext): string {
  const levels = Object.keys(ctx.buildings)
    .sort()
    .map((id) => `${id}${ctx.buildings[id] ?? 0}`)
    .join(',');
  // 누가 마을에 서 있는지도 열쇠에 넣는다. 안 그러면 명단이 바뀌어도 다시 안 그린다
  // 이름도 넣는다. 이름을 바꿨는데 이름표가 그대로면 안 바꾼 것과 같다
  const who = (ctx.folk ?? []).map((f) => `${f.id}@${f.archetypeId}@${f.name}`).join(',');
  const out = ctx.patronOut === undefined ? '' : `${ctx.patronOut.id}${ctx.patronOut.badge ?? ''}`;
  return `town:${ctx.eraIndex}:${levels}:${who}:${out}`;
}

export function buildTownMap(ctx: TownContext): TileMapData {
  const size = W * H;
  const ground: Terrain[] = new Array<Terrain>(size).fill('grass');
  const deco: (Terrain | null)[] = new Array<Terrain | null>(size).fill(null);
  const collision: boolean[] = new Array<boolean>(size).fill(false);
  const objects: MapObject[] = [];

  const at = (x: number, y: number) => y * W + x;
  const put = (x: number, y: number, t: Terrain, solid: boolean) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ground[at(x, y)] = t;
    collision[at(x, y)] = solid;
  };

  const rect = playableRect(ctx.eraIndex);

  // 풀숲 무늬. 시드를 고정해 새로 그려도 같은 그림이 나오게 한다
  const rng = createRng('town:deco');
  for (let i = 0; i < size; i++) {
    if (rng.chance(0.12)) ground[i] = 'grassTuft';
  }

  // ── 아직 열리지 않은 바깥을 막는다 ──────────────────
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inRect(rect, x, y)) put(x, y, 'overgrown', true);
    }
  }

  /**
   * 못과 길.
   *
   * 못을 한 칸 내리고 왼쪽으로 붙였다. 예전 자리(x2~4, y25~27)는 채석장
   * 부지(3,22 · 3×3) 문 바로 아래에 물이 닿았다 — 채석장이 4단계가 되면
   * 부지 전체가 건물이라 옆으로 붙을 수 없고, 남은 접근로인 문 아래가
   * 물이라 **문에 갈 수가 없었다.**
   */
  for (let y = 26; y <= 28; y++) {
    for (let x = 1; x <= 3; x++) if (inRect(rect, x, y)) put(x, y, 'water', true);
  }
  for (let y = 19; y <= rect.y1; y++) if (inRect(rect, GATEWAY_X, y)) put(GATEWAY_X, y, 'path', false);

  // ── 건물 ───────────────────────────────────────────
  for (const plot of PLOTS) {
    if (!inRect(rect, plot.x, plot.y)) continue;

    const level = ctx.buildings[plot.buildingId] ?? 0;
    const stage = visualStage(level);

    // 비어 있는 자리도 부지로 보여야 무엇을 지을 수 있는지 알 수 있다
    for (let y = plot.y; y < plot.y + plot.h; y++) {
      for (let x = plot.x; x < plot.x + plot.w; x++) put(x, y, 'plot', false);
    }

    const built = stampBuilding(put, plot, stage);
    objects.push({
      id: `plot-${plot.buildingId}`,
      type: 'node',
      x: built.doorX,
      y: built.doorY,
      // 부지는 밟고 서서 A 를 누른다. 막지 않는다
      solid: false,
      building: plot.buildingId,
    });
  }

  /**
   * 문 앞 한 칸을 반드시 비운다.
   *
   * 건물이 커지면 부지를 다 덮어 옆으로 붙을 수 없게 되고, 그때 남는
   * 유일한 접근로가 문 아래 칸이다. 거기가 물이나 다른 건물이면 그 건물은
   * 영영 못 들어간다 — 채석장이 실제로 그랬다.
   * 막혀 있으면 흙길을 깔아 둔다. 자리마다 손으로 맞추지 않아도 되게.
   */
  for (const plot of PLOTS) {
    if (!inRect(rect, plot.x, plot.y)) continue;
    const doorX = plot.x + Math.floor(plot.w / 2);
    const front = plot.y + plot.h;
    if (!inRect(rect, doorX, front)) continue;
    if (collision[front * W + doorX]) put(doorX, front, 'path', false);
  }

  /**
   * 회관을 나와 있는 의뢰인 (§7.6 나들이).
   * 길목 가는 길가에 세운다 — 지나다니다 마주치게.
   */
  if (ctx.patronOut !== undefined) {
    const spot = { x: GATEWAY_X + 2, y: rect.y1 - 4 };
    if (inRect(rect, spot.x, spot.y) && !collision[spot.y * W + spot.x]) {
      objects.push({
        id: `patron-${ctx.patronOut.id}`,
        type: 'npc',
        x: spot.x,
        y: spot.y,
        sprite: patronSprite(ctx.patronOut.id),
        voice: { kind: 'patron', id: ctx.patronOut.id },
        label: ctx.patronOut.name,
        ...(ctx.patronOut.badge !== undefined ? { badge: ctx.patronOut.badge } : {}),
        solid: true,
      });
    }
  }

  // ── 성벽 링 ────────────────────────────────────────
  // 개별 건물이 아니라 마을 둘레를 감싸는 타일 링이다 (§10)
  const wallLevel = ctx.buildings['wall'] ?? 0;
  const ring = wallStage(wallLevel);
  const ringTerrain: Terrain | null =
    ring === 'fence' ? 'fence' : ring === 'stone' ? 'rampart' : ring === 'tower' ? 'tower' : null;

  for (let x = rect.x0; x <= rect.x1; x++) {
    put(x, rect.y0, ringTerrain ?? 'tree', true);
    put(x, rect.y1, ringTerrain ?? 'tree', true);
  }
  for (let y = rect.y0; y <= rect.y1; y++) {
    put(rect.x0, y, ringTerrain ?? 'tree', true);
    put(rect.x1, y, ringTerrain ?? 'tree', true);
  }

  // 길목 한 칸은 늘 열려 있다
  put(GATEWAY_X, rect.y1, 'gateway', false);
  objects.push({
    id: 'south-gateway',
    type: 'gateway',
    x: GATEWAY_X,
    y: rect.y1,
    target: 'region-select',
    solid: false,
  });

  /**
   * 인물 (§7.6).
   *
   * 의뢰인은 길바닥에 서 있지 않는다 — 회관 안에 상주한다 (§10).
   * 관계 대상은 마을에 서 있어야 한다. 다가와 줄 때까지 기다리는 것 말고
   * **찾아가서 말을 걸 수 있어야** 관계가 자리를 얻는다.
   */
  let spot = 0;
  for (const who of ctx.folk ?? []) {
    // 마을이 좁아 바깥이거나 이미 막힌 자리는 건너뛰고 다음 자리를 본다
    while (spot < FOLK_SPOTS.length) {
      const at = FOLK_SPOTS[spot];
      spot += 1;
      if (at === undefined) continue;
      if (!inRect(rect, at.x, at.y)) continue;
      if (collision[at.y * W + at.x]) continue;

      objects.push({
        id: `folk-${who.id}`,
        type: 'npc',
        x: at.x,
        y: at.y,
        sprite: companionSprite(who.archetypeId),
        voice: { kind: 'companion', id: who.archetypeId },
        label: who.name,
        solid: true,
      });
      break;
    }
  }

  return { id: 'town', width: W, height: H, ground, deco, collision, objects };
}

/**
 * 부지 안에 구조물을 찍는다. 단계가 오를수록 커진다.
 *
 * 구조물을 부지 가운데에 맞추고 문을 **부지의 가운데 칸**에 둔다.
 * 그래야 단계가 올라도 문이 제자리에 있다 — 문이 움직이면 방금 증축을 누른
 * 자리가 벽이 되어 사람이 벽 안에 서게 된다.
 */
function stampBuilding(
  put: (x: number, y: number, t: Terrain, solid: boolean) => void,
  plot: Plot,
  stage: number,
): { doorX: number; doorY: number } {
  const doorX = plot.x + Math.floor(plot.w / 2);
  const y1 = plot.y + plot.h - 1;

  if (stage === 0) return { doorX, doorY: y1 };

  // 단계별 구조물 크기. 부지를 넘지 않는다
  const w = Math.min(plot.w, stage === 1 ? 2 : stage === 2 ? 3 : plot.w);
  const h = Math.min(plot.h, stage === 1 ? 2 : stage === 2 ? 3 : plot.h);

  const x0 = plot.x + Math.floor((plot.w - w) / 2);
  const y0 = y1 - h + 1;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x < x0 + w; x++) {
      // 맨 아랫줄은 벽, 그 위는 지붕
      put(x, y, y === y1 ? 'wall' : 'roof', true);
    }
  }

  // 문은 늘 걸어 들어갈 수 있다
  put(doorX, y1, 'door', false);
  return { doorX, doorY: y1 };
}

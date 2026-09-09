/**
 * 지역 맵 (§11).
 *
 * 지역은 **걸어다니는 맵**이다. 목록에서 고르고 결과만 보는 방식이 아니다.
 * 맵에 사건 노드 3~5개가 놓이고, 밟으면 판정이 돈다.
 *
 * **임시다.** Tiled JSON 이 들어오면 지형과 노드 배치는 그쪽에서 온다.
 * 노드 자리는 지역 id 로 시드를 고정해서, 같은 지역은 늘 같은 지도가 되게 한다.
 */

import type { MapObject, Terrain, TileMapData } from '@/types/map';
import { NODE_COUNT, regionMapId } from '@/data/regions';
import { createRng } from '@/systems/rng';

const W = 24;
const H = 20;

/** 입구 — 남쪽 가운데. 여기로 들어오고 여기로 나간다 */
const ENTRY_X = 12;

export const REGION_ENTRY = { x: ENTRY_X, y: H - 2, dir: 'up' } as const;

/** 지역마다 바닥과 막힌 것이 다르다 */
interface RegionLook {
  floor: Terrain;
  accent: Terrain;
  block: Terrain;
}

const LOOK: Record<string, RegionLook> = {
  whisper: { floor: 'grass', accent: 'grassTuft', block: 'tree' },
  gate: { floor: 'sand', accent: 'path', block: 'rock' },
  marsh: { floor: 'bog', accent: 'plot', block: 'water' },
  peaks: { floor: 'scree', accent: 'rock', block: 'rampart' },
  deep: { floor: 'scree', accent: 'rock', block: 'tower' },
  rift: { floor: 'riftGround', accent: 'rock', block: 'tower' },
};

const FALLBACK: RegionLook = { floor: 'grass', accent: 'grassTuft', block: 'tree' };

/**
 * 지역 맵을 세운다.
 *
 * `escort` 가 true 면 **동행 노드**를 하나 더 놓는다 (§11 — 동행자가 있을 때만
 * 나타난다). 전용 서술과 호감이 붙는 자리다. 빼먹고 있었다.
 */
export function buildRegionMap(regionId: string, escort = false, visit = 0): TileMapData {
  const size = W * H;
  const look = LOOK[regionId] ?? FALLBACK;

  const ground: Terrain[] = new Array<Terrain>(size).fill(look.floor);
  const deco: (Terrain | null)[] = new Array<Terrain | null>(size).fill(null);
  const collision: boolean[] = new Array<boolean>(size).fill(false);

  const at = (x: number, y: number) => y * W + x;
  const put = (x: number, y: number, t: Terrain, solid: boolean) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ground[at(x, y)] = t;
    collision[at(x, y)] = solid;
  };

  /**
   * 갈 때마다 지형이 새로 뽑힌다.
   *
   * 예전에는 `region:${regionId}` 하나로 고정이라 속삭이는 숲은 백 번을 가도
   * 같은 모양이었다 — 두 번째부터는 길을 외워서 표식만 찍고 나온다.
   * `visit` 이 들어가면 갈 때마다 다른 지도가 된다.
   *
   * **그 방문 안에서는 고정이다.** visit 은 그 탐사의 주차라, 걷다 새로고침해도
   * 지형이 바뀌지 않는다. 매번 난수를 굴리면 그 자리에서 지도가 흔들린다.
   */
  const rng = createRng(`region:${regionId}:${visit}`);

  for (let i = 0; i < size; i++) {
    if (rng.chance(0.14)) ground[i] = look.accent;
  }

  // 테두리
  for (let x = 0; x < W; x++) {
    put(x, 0, look.block, true);
    put(x, H - 1, look.block, true);
  }
  for (let y = 0; y < H; y++) {
    put(0, y, look.block, true);
    put(W - 1, y, look.block, true);
  }

  /**
   * ── 노드 자리 정하기 ──
   *
   * 전리품 2~3 + 사건 1 (§11). 무작위로 뿌리면 한쪽에 몰려서
   * 지도의 절반이 빈 들판이 된다. 세로로 구간을 나눠 하나씩 놓는다.
   */
  // 전리품 2~3 · 사건 1 · 동행 0~1 (§11)
  const base = rng.int(NODE_COUNT.min, NODE_COUNT.max);
  const total = escort ? base + 1 : base;
  const lootCount = base - 1;
  const band = Math.floor((H - 4) / total);

  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < total; i++) {
    // 입구에서 먼 쪽부터 채운다. 안쪽으로 들어갈수록 볼 게 있어야 한다
    const y = 2 + i * band + rng.int(0, Math.max(0, band - 1));
    const left = rng.chance(0.5);
    const x = left ? rng.int(2, ENTRY_X - 2) : rng.int(ENTRY_X + 2, W - 3);
    spots.push({ x, y: Math.min(y, H - 4) });
  }

  /**
   * ── 길 내기 ──
   *
   * 입구에서 북쪽으로 등뼈를 하나 세우고, 거기서 각 표식으로 가지를 뻗는다.
   * 길이 없으면 표식이 보여도 들판을 가로지르게 되어 걷는 맛이 없다.
   */
  const trail = new Set<string>();
  const carve = (x: number, y: number) => {
    trail.add(`${x},${y}`);
    put(x, y, 'path', false);
  };

  const spineTop = Math.min(...spots.map((s) => s.y));
  for (let y = H - 2; y >= spineTop; y--) carve(ENTRY_X, y);

  for (const spot of spots) {
    const step = spot.x < ENTRY_X ? -1 : 1;
    for (let x = ENTRY_X; x !== spot.x + step; x += step) carve(x, spot.y);
  }

  // 흩어진 장애물. 길과 표식 자리는 비켜 간다
  for (let i = 0; i < 30; i++) {
    const x = rng.int(1, W - 2);
    const y = rng.int(1, H - 2);
    if (trail.has(`${x},${y}`)) continue;
    put(x, y, look.block, true);
  }

  put(ENTRY_X, H - 1, 'gateway', false);

  const objects: MapObject[] = [
    { id: 'exit', type: 'gateway', x: ENTRY_X, y: H - 1, target: 'town', solid: false },
  ];

  /**
   * 마주설 것 하나 (§11).
   *
   * 지역은 표식을 밟고 판정을 굴리는 자리였다. 매주 가는 데인데 거기서
   * 마주설 일이 없었다. **하나만 둔다** — 여럿과 연달아 맞서지 않는다.
   *
   * 등뼈 위쪽, 입구에서 먼 데에 세운다. 들어서자마자 부딪히면
   * 지역을 둘러볼 일이 없다.
   */
  const foeY = Math.max(2, spineTop - 1);
  collision[at(ENTRY_X, foeY)] = false;
  put(ENTRY_X, foeY, 'path', false);
  objects.push({
    id: 'foe',
    type: 'node',
    x: ENTRY_X,
    y: foeY,
    solid: false,
    nodeKind: 'foe',
  });

  spots.forEach((spot, i) => {
    // 길 위에 놓았으니 막힐 일이 없다
    collision[at(spot.x, spot.y)] = false;
    objects.push({
      id: `node-${i}`,
      type: 'node',
      x: spot.x,
      y: spot.y,
      // 밟으면 판정이다 (§11). 막지 않는다
      solid: false,
      // 전리품 → 사건 → 동행 순. 동행 노드는 데려갔을 때만 만들어진다
      nodeKind: i < lootCount ? 'loot' : i < base ? 'event' : 'escort',
    });
  });

  return { id: regionMapId(regionId), width: W, height: H, ground, deco, collision, objects };
}

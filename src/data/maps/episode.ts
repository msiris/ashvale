/**
 * 에피소드 판 (§11 곁가지).
 *
 * 지역 맵과 같은 뼈대를 쓴다 — 걸어 들어가고, 한가운데를 밟고, 위로 빠져나간다.
 * 다른 점은 **나가는 문이 마을이 아니라 다음 판**이라는 것이다.
 * 판 다섯을 이어 붙이면 하나의 이야기가 된다.
 *
 * 지역과 달리 지형은 **에피소드와 판 번호로 고정**한다. 갈 때마다 달라지면
 * 다시 도전할 때 처음 오는 데가 되어, 지난번에 어디까지 갔는지가 사라진다.
 */

import type { MapObject, Terrain, TileMapData } from '@/types/map';
import type { EpisodeLook } from '@/data/content/episodes';
import { createRng } from '@/systems/rng';

const W = 20;
const H = 18;
const ENTRY_X = 10;

/** 판에 들어설 때 서는 자리 — 남쪽 가운데 */
export const EPISODE_ENTRY = { x: ENTRY_X, y: H - 2, dir: 'up' } as const;

/** `episode:<id>:<판 번호>` */
export function episodeMapId(episodeId: string, stage: number): string {
  return `episode:${episodeId}:${stage}`;
}

/** 에피소드 맵이면 그 에피소드와 판 번호. 아니면 null */
export function parseEpisodeMap(mapId: string): { episodeId: string; stage: number } | null {
  if (!mapId.startsWith('episode:')) return null;
  const parts = mapId.split(':');
  const episodeId = parts[1];
  const stage = Number(parts[2]);
  if (episodeId === undefined || !Number.isInteger(stage) || stage < 0) return null;
  return { episodeId, stage };
}

interface Look {
  floor: Terrain;
  accent: Terrain;
  block: Terrain;
}

/**
 * 판마다 걸어다니는 땅의 결이 다르다.
 *
 * 유리 다리는 `water` 로 막는다 — 아래가 그대로 보이는데 아무것도 없는 자리라
 * 밟을 수 없는 것이 물과 같은 뜻이다.
 */
const LOOKS: Record<EpisodeLook, Look> = {
  glass: { floor: 'path', accent: 'scree', block: 'water' },
  forest: { floor: 'grass', accent: 'grassTuft', block: 'tree' },
  tower: { floor: 'floor', accent: 'rug', block: 'pillar' },
  village: { floor: 'path', accent: 'plot', block: 'wall' },
  valley: { floor: 'sand', accent: 'rock', block: 'rampart' },
  road: { floor: 'path', accent: 'grassTuft', block: 'rock' },
};

export interface EpisodeMapInput {
  episodeId: string;
  stage: number;
  look: EpisodeLook;
  /** 한가운데에 이야기 자리를 놓는가 */
  hasScene: boolean;
  /** 마지막 판이면 그 앞에 선 것의 이름 */
  bossName?: string;
  /** 이 판의 이야기를 이미 봤는가. 봤으면 표를 지운다 */
  sceneDone?: boolean;
}

/**
 * 판 하나를 세운다.
 *
 * 구조는 늘 같다 — 남쪽 입구에서 북쪽 출구까지 길이 한 줄 나 있고,
 * 그 위 한가운데에 이야기 자리가 놓인다. **길에서 벗어나야 볼 게 있는**
 * 지역과 반대로 두었다. 이야기는 지나치면 안 되는 것이라 길 위에 놓는다.
 */
export function buildEpisodeMap(input: EpisodeMapInput): TileMapData {
  const { episodeId, stage, look: lookId, hasScene, bossName, sceneDone } = input;
  const size = W * H;
  const look = LOOKS[lookId];

  const ground: Terrain[] = new Array<Terrain>(size).fill(look.floor);
  const deco: (Terrain | null)[] = new Array<Terrain | null>(size).fill(null);
  const collision: boolean[] = new Array<boolean>(size).fill(false);

  const at = (x: number, y: number) => y * W + x;
  const put = (x: number, y: number, t: Terrain, solid: boolean) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ground[at(x, y)] = t;
    collision[at(x, y)] = solid;
  };

  // 판마다 고정. 다시 와도 같은 지형이라 어디까지 갔는지가 남는다
  const rng = createRng(`episode:${episodeId}:${stage}`);

  for (let i = 0; i < size; i++) {
    if (rng.chance(0.16)) ground[i] = look.accent;
  }

  for (let x = 0; x < W; x++) {
    put(x, 0, look.block, true);
    put(x, H - 1, look.block, true);
  }
  for (let y = 0; y < H; y++) {
    put(0, y, look.block, true);
    put(W - 1, y, look.block, true);
  }

  /**
   * 길 — 남쪽 입구에서 북쪽 출구까지. 가운데에서 한 번 꺾는다.
   * 곧게 뻗으면 한 화면에 다 보여서 걸을 이유가 없다.
   */
  const trail = new Set<string>();
  const carve = (x: number, y: number) => {
    trail.add(`${x},${y}`);
    put(x, y, look.floor === 'floor' ? 'rug' : 'path', false);
  };

  const bendY = 9;
  const bendX = rng.chance(0.5) ? ENTRY_X - 5 : ENTRY_X + 5;

  for (let y = H - 2; y >= bendY; y--) carve(ENTRY_X, y);
  const step = bendX < ENTRY_X ? -1 : 1;
  for (let x = ENTRY_X; x !== bendX + step; x += step) carve(x, bendY);
  for (let y = bendY; y >= 1; y--) carve(bendX, y);

  // 흩어진 장애물. 길은 비켜 간다
  for (let i = 0; i < 26; i++) {
    const x = rng.int(1, W - 2);
    const y = rng.int(1, H - 2);
    if (trail.has(`${x},${y}`)) continue;
    put(x, y, look.block, true);
  }

  // 들어온 자리와 나가는 자리
  put(ENTRY_X, H - 1, 'gateway', false);
  put(bendX, 0, 'gateway', false);

  const objects: MapObject[] = [
    // 뒤로 나가면 마을로 돌아간다. 도중에 그만두는 길이다
    { id: 'episode-back', type: 'gateway', x: ENTRY_X, y: H - 1, target: 'town', solid: false },
    // 앞으로 나가면 다음 판. target 은 스토어가 읽는다
    { id: 'episode-next', type: 'gateway', x: bendX, y: 0, target: 'episode-next', solid: false },
  ];

  /**
   * 이야기 자리는 꺾이는 데에 둔다. 길 위라 지나칠 수 없고,
   * 입구에서 바로 보이지도 않는다.
   */
  if (hasScene && sceneDone !== true) {
    collision[at(ENTRY_X, bendY)] = false;
    objects.push({
      id: 'episode-scene',
      type: 'node',
      x: ENTRY_X,
      y: bendY,
      solid: false,
      nodeKind: 'event',
    });
  }

  if (bossName !== undefined) {
    // 마주 서는 자리. 출구 바로 앞을 막는다 — 지나쳐 갈 수 없어야 한다
    const bx = bendX;
    const by = 2;
    collision[at(bx, by)] = false;
    put(bx, by, look.floor === 'floor' ? 'rug' : 'path', false);
    objects.push({
      id: 'episode-boss',
      type: 'npc',
      x: bx,
      y: by,
      solid: true,
      sprite: 'figure:foe',
      label: bossName,
    });
    // 출구를 막는다. 마주서기 전에는 못 나간다
    collision[at(bx, 1)] = true;
    put(bx, 1, look.block, true);
  }

  return {
    id: episodeMapId(episodeId, stage),
    width: W,
    height: H,
    ground,
    deco,
    collision,
    objects,
  };
}

/**
 * 세력 마을 (§7, §11 곁가지).
 *
 * 세력 이야기를 끝내면 그쪽 마을에 갈 수 있게 된다. 끝낸 자리가
 * 지도에서 사라지면 끝낸 뜻이 없다.
 *
 * 안에 둘이 서 있다.
 *   - **거래 자리**: 그쪽 값으로 사고판다. 사이가 좋으면 잘 쳐주고,
 *     복속시켰으면 나쁘게 쳐준다
 *   - **대표**: 지금 사이가 어떤지, 조공이 얼마나 오는지 말해 준다
 *
 * 지역이 아니라 마을이므로 **판정도 표식도 없다.** 걸어 들어가 볼 일만 본다.
 */

import type { MapObject, Terrain, TileMapData } from '@/types/map';
import type { FactionId } from '@/types/game';
import type { HoldMode } from '@/data/faction-holds';
import { createRng } from '@/systems/rng';

const W = 18;
const H = 16;
const ENTRY_X = 9;

export const FACTION_ENTRY = { x: ENTRY_X, y: H - 2, dir: 'up' } as const;

export function factionMapId(id: FactionId): string {
  return `faction:${id}`;
}

export function parseFactionMap(mapId: string): FactionId | null {
  if (!mapId.startsWith('faction:')) return null;
  const id = mapId.slice('faction:'.length);
  return id === 'guild' || id === 'oath' || id === 'grove' || id === 'tower' ? id : null;
}

interface Look {
  floor: Terrain;
  accent: Terrain;
  block: Terrain;
  house: Terrain;
}

/** 세력마다 사는 데가 다르게 보여야 한다 */
const LOOKS: Record<FactionId, Look> = {
  guild: { floor: 'path', accent: 'plot', block: 'wall', house: 'roof' },
  oath: { floor: 'sand', accent: 'rock', block: 'rampart', house: 'tower' },
  grove: { floor: 'grass', accent: 'grassTuft', block: 'tree', house: 'roof' },
  tower: { floor: 'floor', accent: 'rug', block: 'pillar', house: 'shelf' },
};

/** 대표를 뭐라고 부르는가 */
export const ENVOY_LABEL: Record<FactionId, string> = {
  guild: '길드 대표',
  oath: '서약 기사',
  grove: '부족 장로',
  tower: '탑의 서기',
};

export function buildFactionMap(id: FactionId, mode: HoldMode): TileMapData {
  const size = W * H;
  const look = LOOKS[id];

  const ground: Terrain[] = new Array<Terrain>(size).fill(look.floor);
  const deco: (Terrain | null)[] = new Array<Terrain | null>(size).fill(null);
  const collision: boolean[] = new Array<boolean>(size).fill(false);

  const at = (x: number, y: number) => y * W + x;
  const put = (x: number, y: number, t: Terrain, solid: boolean) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ground[at(x, y)] = t;
    collision[at(x, y)] = solid;
  };

  const rng = createRng(`faction:${id}`);
  for (let i = 0; i < size; i++) {
    if (rng.chance(0.15)) ground[i] = look.accent;
  }

  for (let x = 0; x < W; x++) {
    put(x, 0, look.block, true);
    put(x, H - 1, look.block, true);
  }
  for (let y = 0; y < H; y++) {
    put(0, y, look.block, true);
    put(W - 1, y, look.block, true);
  }

  // 가운데를 지나는 길. 두 자리는 그 길 위에 둔다
  for (let y = H - 2; y >= 2; y--) put(ENTRY_X, y, look.floor === 'floor' ? 'rug' : 'path', false);
  for (let x = 3; x < W - 3; x++) put(x, 7, look.floor === 'floor' ? 'rug' : 'path', false);

  /** 집 두 채. 길에서 비켜 세운다 */
  const house = (hx: number, hy: number) => {
    for (let y = hy; y < hy + 2; y++) {
      for (let x = hx; x < hx + 3; x++) put(x, y, look.house, true);
    }
  };
  house(2, 3);
  house(W - 5, 3);
  house(2, 10);
  house(W - 5, 10);

  const objects: MapObject[] = [
    { id: 'faction-exit', type: 'gateway', x: ENTRY_X, y: H - 1, target: 'town', solid: false },
    // 거래 자리 — 여기 서서 A 를 누르면 교역이 열린다 (§10)
    {
      id: 'faction-shop',
      type: 'npc',
      x: ENTRY_X - 2,
      y: 7,
      solid: true,
      shop: true,
      label: mode === 'ruled' ? '징수인' : '거래인',
    },
    // 대표 — 지금 사이와 조공을 말해 준다
    {
      id: 'faction-envoy',
      type: 'npc',
      x: ENTRY_X + 2,
      y: 7,
      solid: true,
      label: ENVOY_LABEL[id],
    },
  ];

  put(ENTRY_X, H - 1, 'gateway', false);
  for (const o of objects) {
    if (o.solid === true) collision[at(o.x, o.y)] = true;
  }

  return { id: factionMapId(id), width: W, height: H, ground, deco, collision, objects };
}

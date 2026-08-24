/**
 * 실내 (§6, §10).
 *
 * 문 타일을 밟고 A 를 누르면 들어온다. 밖에서 증축 패널만 뜨는 것과 달리
 * 실내가 있는 건물은 **들어가서** 일을 본다.
 *
 * 여기가 §7.6 의 대비를 살리는 자리다 —
 * **관계 대상은 마을에서 먼저 다가오고, 의뢰인은 찾아가야 만난다.**
 * 의뢰인은 전부 회관에 상주한다 (§10 회관 실내: 의뢰인 상주).
 *
 * **임시다.** Tiled 로 그린 실내가 들어오면 이 파일을 지운다.
 */

import type { MapObject, Terrain, TileMapData } from '@/types/map';
import { getBuilding } from '@/data/buildings';
import { PATRON_VOICES } from '@/data/content/patron-dialogue';
import { companionSprite, patronSprite } from '@/data/sprites';
import { roomForBuilding } from '@/data/rooms';

const W = 13;
/**
 * 세로 화면이다. 13×9 로 두면 방이 가로로 납작해서 필드 위쪽만 차고
 * 아래가 새까맣게 남는다. 화면 비율에 맞춰 세로로 늘린다.
 */
const H = 15;

/** 나가는 문. 남쪽 가운데 */
const EXIT_X = Math.floor(W / 2);

export const INDOOR_ENTRY = { x: EXIT_X, y: H - 2, dir: 'up' } as const;

/**
 * 숙소 방 배치 (§10 관계 대상 상주 자리).
 *
 * 13×15 안에 가운데 복도(EXIT_X)를 두고 양옆으로 방을 셋씩.
 * 숙소는 레벨당 자리 둘이므로 3레벨이면 여섯 방이 다 찬다.
 */
const LODGE = {
  wallLeft: EXIT_X - 1,
  wallRight: EXIT_X + 1,
  /** 방과 방을 가르는 가로벽 */
  splits: [6, 10],
  rooms: [
    { side: 'left', doorY: 4, bedX: 1, bedY: 3, standX: 3, standY: 4 },
    { side: 'right', doorY: 4, bedX: W - 2, bedY: 3, standX: W - 4, standY: 4 },
    { side: 'left', doorY: 8, bedX: 1, bedY: 7, standX: 3, standY: 8 },
    { side: 'right', doorY: 8, bedX: W - 2, bedY: 7, standX: W - 4, standY: 8 },
    { side: 'left', doorY: 12, bedX: 1, bedY: 11, standX: 3, standY: 12 },
    { side: 'right', doorY: 12, bedX: W - 2, bedY: 11, standX: W - 4, standY: 12 },
  ] as const,
} as const;

/** 실내 맵 id 는 'indoor:hall' 꼴이다 (§4) */
export function indoorMapId(buildingId: string): string {
  return `indoor:${buildingId}`;
}

export function buildingIdFromIndoor(mapId: string): string | null {
  return mapId.startsWith('indoor:') ? mapId.slice('indoor:'.length) : null;
}

/** 시대별 등장 의뢰인 (§7.6). 전부 회관에 있다 */
const PATRON_ERA: Record<string, number> = {
  bartek: 0,
  tova: 1,
  harl: 1,
  oren: 2,
  doran: 2,
  vell: 3,
};

export interface IndoorContext {
  buildingId: string;
  eraIndex: number;
  /** 숙소에 상주하는 인물 (§7.4 수락 → 마을에 상주 위치가 생긴다) */
  residents?: { id: string; archetypeId: string; name: string }[];
  /**
   * 이번 주 이 건물에 나와 있는 인물 (§7.6 나들이).
   * 숙소에만 붙박여 있으면 찾아갈 이유가 한 곳뿐이다.
   */
  visitor?: { id: string; archetypeId: string; name: string };
}

export function buildIndoorMap(ctx: IndoorContext): TileMapData {
  const size = W * H;
  const ground: Terrain[] = new Array<Terrain>(size).fill('floor');
  const deco: (Terrain | null)[] = new Array<Terrain | null>(size).fill(null);
  const collision: boolean[] = new Array<boolean>(size).fill(false);
  const objects: MapObject[] = [];

  const at = (x: number, y: number) => y * W + x;
  const put = (x: number, y: number, t: Terrain, solid: boolean) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ground[at(x, y)] = t;
    collision[at(x, y)] = solid;
  };

  // 벽
  for (let x = 0; x < W; x++) {
    put(x, 0, 'wall', true);
    put(x, 1, 'wall', true);
    put(x, H - 1, 'wall', true);
  }
  for (let y = 0; y < H; y++) {
    put(0, y, 'wall', true);
    put(W - 1, y, 'wall', true);
  }

  // 가운데 깔개. 벽과 세간에서 한 칸 떼어 놓는다.
  // 숙소는 방으로 나뉘므로 깔개를 깔지 않는다 — 방 사이로 천이 이어지면 이상하다
  if (ctx.buildingId !== 'lodge') {
    for (let y = 5; y <= H - 5; y++) {
      for (let x = 4; x <= W - 5; x++) put(x, y, 'rug', false);
    }
  }

  // 나가는 문
  put(EXIT_X, H - 1, 'door', false);
  objects.push({
    id: 'indoor-exit',
    type: 'gateway',
    x: EXIT_X,
    y: H - 1,
    target: 'town',
    solid: false,
  });

  // 안쪽 벽에 붙은 탁자. 보기 위한 것이다
  for (let x = 2; x <= W - 3; x++) put(x, 2, 'counter', true);

  /**
   * 증축하는 자리 (§10).
   *
   * **문 안쪽 바로 그 칸에 둔다.** 예전에는 탁자 왼쪽 끝(2,3)에 있었다 —
   * 실내가 있는 건물은 문 앞에서 A 를 누르면 들어와 버리므로 밖에서는
   * 증축할 길이 없고, 안에서는 저 구석까지 걸어가야 프롬프트가 떴다.
   * 회관과 숙소를 올릴 방법이 사실상 없었다.
   *
   * 여기 두면 들어선 순간 발밑에 잡혀 "A — 증축" 이 바로 보인다.
   */
  objects.push({
    id: `indoor-desk-${ctx.buildingId}`,
    type: 'node',
    x: INDOOR_ENTRY.x,
    y: INDOOR_ENTRY.y,
    solid: false,
    building: ctx.buildingId,
    label: '목수',
  });

  /**
   * 목적 자리가 있는 건물 — 서고·신전·길드관·학당·첨탑 (§10).
   *
   * 다섯 다 효과가 수치뿐이라 들어가도 볼 것이 없었다. 방마다 세간을 다르게
   * 놓고 가운데에 설 자리를 하나 둔다. 세간은 막고, 설 자리는 비운다.
   */
  const room = roomForBuilding(ctx.buildingId);
  if (room !== undefined) {
    // 방마다 벽을 두르는 세간이 다르다 — 들어서면 어느 건물인지 바로 보인다
    const FURNITURE: Record<string, Terrain> = {
      library: 'shelf',
      shrine: 'altar',
      guildhall: 'board',
      academy: 'pillar',
      spire: 'pillar',
    };
    const piece = FURNITURE[ctx.buildingId] ?? 'shelf';

    const centered = ctx.buildingId === 'shrine' || ctx.buildingId === 'spire';
    if (centered) {
      // 제단과 관측의는 가운데 하나만 둔다. 방이 비어야 그 하나가 산다
      put(EXIT_X, 3, piece, true);
      put(EXIT_X - 1, 3, piece, true);
      put(EXIT_X + 1, 3, piece, true);
    } else {
      // 서고·명부·수련장은 양옆을 채운다
      for (let y = 4; y <= H - 4; y++) {
        put(2, y, piece, true);
        put(W - 3, y, piece, true);
      }
    }

    // 일 보는 자리는 걸어 올라오다 자연히 밟는 가운데 칸이다
    objects.push({
      id: `room-${room.id}`,
      type: 'node',
      x: EXIT_X,
      y: centered ? 5 : Math.floor(H / 2),
      solid: false,
      room: room.id,
      label: room.keeper,
    });
  }

  // 시장 — 판매대에서 교역과 선물을 본다 (§10)
  if (ctx.buildingId === 'market') {
    objects.push({
      id: 'market-counter',
      type: 'node',
      x: EXIT_X,
      y: 3,
      solid: false,
      shop: true,
      label: '상인',
    });
  }

  /**
   * 숙소 — 상주하는 인물이 여기 산다 (§10 관계 대상 상주 자리, §7.4).
   * 고백을 받아들이면 마을에 상주 위치가 생긴다. 그게 여기다 —
   * 찾아갈 데가 생겨야 관계가 자리를 얻는다.
   */
  if (ctx.buildingId === 'lodge') {
    /**
     * 각자 방을 준다.
     *
     * 예전에는 한 줄로 나란히 세웠다 — 사는 곳이 아니라 진열장이었다.
     * 가운데 복도를 내고 양옆으로 방을 세 칸씩 나눈다. 방마다 문이 하나,
     * 침대가 하나, 사람이 하나다. 빈 방은 그대로 빈 방으로 둔다 —
     * 자리가 있는데 아무도 없다는 것도 보여야 할 정보다.
     */
    for (let y = 3; y <= H - 2; y++) {
      put(LODGE.wallLeft, y, 'wall', true);
      put(LODGE.wallRight, y, 'wall', true);
    }
    for (const y of LODGE.splits) {
      for (let x = 1; x < W - 1; x++) {
        if (x === EXIT_X) continue; // 복도는 뚫려 있어야 한다
        put(x, y, 'wall', true);
      }
    }

    // 복도. 문 안쪽부터 맨 위 방까지 곧게 낸다
    for (let y = 3; y <= H - 2; y++) put(EXIT_X, y, 'floor', false);

    LODGE.rooms.forEach((room, i) => {
      // 방문 — 복도 쪽 벽을 한 칸 연다
      put(room.side === 'left' ? LODGE.wallLeft : LODGE.wallRight, room.doorY, 'floor', false);
      // 침대는 바깥쪽 벽에 붙인다
      put(room.bedX, room.bedY, 'bed', true);

      const who = (ctx.residents ?? [])[i];
      if (who === undefined) return;
      objects.push({
        id: `resident-${who.id}`,
        type: 'npc',
        x: room.standX,
        y: room.standY,
        sprite: companionSprite(who.archetypeId),
        voice: { kind: 'companion', id: who.archetypeId },
        label: who.name,
        solid: true,
      });
    });
  }

  /**
   * 이번 주 나와 있는 사람 (§7.6 나들이).
   *
   * 목적 자리(상인·사서…) 와 겹치지 않게 한 칸 옆에 세운다.
   * 말을 걸면 그 자리의 일이 벌어진다.
   */
  if (ctx.visitor !== undefined) {
    objects.push({
      id: `visitor-${ctx.visitor.id}`,
      type: 'npc',
      x: EXIT_X - 2,
      y: Math.floor(H / 2),
      sprite: companionSprite(ctx.visitor.archetypeId),
      voice: { kind: 'companion', id: ctx.visitor.archetypeId },
      label: ctx.visitor.name,
      solid: true,
    });
  }

  // 의뢰인은 회관에 상주한다 (§7.6, §10)
  if (ctx.buildingId === 'hall') {
    const present = Object.keys(PATRON_VOICES).filter(
      (id) => ctx.eraIndex >= (PATRON_ERA[id] ?? 99),
    );
    /**
     * 탁자 앞에 나란히 선다.
     *
     * 예전에는 `4 + i * 2` 에 `x >= W - 2` 면 **조용히 버렸다.** W 가 13 이라
     * 다섯째부터 잘려서 성장기의 도란과 영주기의 벨이 회관에 없었다 —
     * 둘 다 사람을 주는 의뢰인이라, 전설기까지 가도 명단이 늘지 않는 원인이었다.
     *
     * 벽 안쪽(1..W-2)을 한 칸씩 쓰면 여섯이 정확히 들어간다.
     * 자리가 모자라면 버리지 않고 **윗줄로 접는다** — 사람이 사라지는 것보다
     * 붐비는 게 낫다.
     */
    present.forEach((patronId, i) => {
      const span = W - 2;
      const x = 1 + (i % span);
      const y = 3 + Math.floor(i / span);
      objects.push({
        id: `patron-${patronId}`,
        type: 'npc',
        x,
        y,
        sprite: patronSprite(patronId),
        voice: { kind: 'patron', id: patronId },
        label: PATRON_VOICES[patronId]?.name ?? '',
        solid: true,
      });
    });
  }

  return {
    id: indoorMapId(ctx.buildingId),
    width: W,
    height: H,
    ground,
    deco,
    collision,
    objects,
  };
}

/** 그 건물에 들어갈 수 있는가. 지어져 있고 실내가 있어야 한다 */
export function hasIndoor(buildingId: string, level: number): boolean {
  return level > 0 && getBuilding(buildingId)?.indoor === true;
}

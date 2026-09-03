/**
 * 이동과 상호작용 규칙 (§5) — 순수 함수.
 *
 * 여기서 시간을 재지 않는다. 한 칸에 140ms 를 흘려보내는 건 씬의 일이고,
 * "갈 수 있는가 / 방향만 바꾸는가"를 정하는 건 여기 일이다.
 */

import type { Dir } from '@/types/game';
import type { MapObject, TileMapData } from '@/types/map';
import { isBlocked, objectAt } from './map';
import { buildingIdFromIndoor, hasIndoor } from '@/data/maps/indoor';
import { getRoom } from '@/data/rooms';

export interface HeroTile {
  x: number;
  y: number;
  dir: Dir;
}

const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export type MoveOutcome =
  /** 방향만 바꾼다. 정지 상태에서 다른 방향을 처음 눌렀을 때 */
  | { kind: 'turn'; dir: Dir }
  /** 한 칸 간다 */
  | { kind: 'step'; dir: Dir; to: { x: number; y: number } }
  /** 막혔다. 방향은 바뀐다 — 벽을 보고 서게 된다 */
  | { kind: 'blocked'; dir: Dir };

/** 바라보는 칸 */
export function facingTile(hero: HeroTile): { x: number; y: number } {
  const d = DELTA[hero.dir];
  return { x: hero.x + d.dx, y: hero.y + d.dy };
}

/**
 * 입력 하나를 어떻게 처리할지 정한다.
 *
 * `fromStandstill` 이 참일 때만 방향 전환 규칙이 걸린다.
 * 걷는 도중에 꺾을 때까지 한 번 멈춰 세우면 모퉁이를 돌 때마다 걸린다.
 */
export function resolveMove(
  hero: HeroTile,
  map: TileMapData,
  dir: Dir,
  opts: {
    fromStandstill: boolean;
    /**
     * 맵의 collision 말고 **추가로** 막힌 칸 (§11 곁가지 — 판 규칙).
     *
     * 깨진 발판과 사라진 길이 여기로 온다. 맵을 고치지 않는 이유는
     * 맵이 캐시되기 때문이다 — 한 번 깨면 다음에 와도 깨진 채가 된다.
     */
    extraBlocked?: ReadonlySet<string>;
  },
): MoveOutcome {
  // 벽을 보고 말을 걸어야 할 때가 있다 (§5)
  if (opts.fromStandstill && hero.dir !== dir) {
    return { kind: 'turn', dir };
  }

  const d = DELTA[dir];
  const to = { x: hero.x + d.dx, y: hero.y + d.dy };

  if (isBlocked(map, to.x, to.y)) return { kind: 'blocked', dir };
  if (opts.extraBlocked?.has(`${to.x},${to.y}`) === true) return { kind: 'blocked', dir };
  return { kind: 'step', dir, to };
}

/**
 * 갇힌 자리에서 꺼낸다.
 *
 * 맵이 바뀌면 예전 세이브의 `heroTile` 이 막힌 칸이 될 수 있다.
 * 실제로 그런 일이 있었다 — 마을을 20×18 에서 36×30 으로 옮기면서
 * 옛 시작 칸이 잠긴 수풀 한복판이 되어 사방이 다 막혔다.
 *
 * 서 있는 칸이 막혔으면 가장 가까운 걸어갈 수 있는 칸으로 옮기고,
 * 그마저 없으면 그 맵의 기본 자리로 되돌린다.
 */
export function rescueTile(
  map: TileMapData,
  tile: HeroTile,
  fallback: { x: number; y: number; dir: Dir },
): HeroTile {
  if (!isBlocked(map, tile.x, tile.y)) return tile;

  // 둘레를 넓혀 가며 성한 칸을 찾는다
  for (let radius = 1; radius <= 24; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // 테두리만 본다. 안쪽은 이미 지난 바퀴에서 봤다
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = tile.x + dx;
        const y = tile.y + dy;
        if (!isBlocked(map, x, y)) return { x, y, dir: tile.dir };
      }
    }
  }

  return { ...fallback };
}

/** 오브젝트 종류별 프롬프트 문구 (§5) */
const PROMPT: Record<MapObject['type'], string> = {
  npc: '말 걸기',
  door: '들어가기',
  node: '살펴보기',
  gateway: '나가기',
};

export interface Interaction {
  object: MapObject;
  /** 하단에 띄울 문구. 'A — 말 걸기' 형태로 조립해서 쓴다 */
  label: string;
}

/**
 * 건물 앞 문구 (§6, §10).
 *
 * 아직 안 지었으면 건설. 지었고 실내가 있으면 **들어가기** —
 * 증축은 안에 들어가서 한다. 실내가 없는 헛간 종류는 밖에서 증축한다.
 */
function labelFor(
  object: MapObject,
  buildings: Record<string, number> | undefined,
  indoors: boolean,
): string {
  if (object.shop === true) return '거래';
  if (object.room !== undefined) return getRoom(object.room)?.prompt ?? '살펴보기';

  if (object.building !== undefined) {
    const level = buildings?.[object.building] ?? 0;
    if (level === 0) return '건설';
    // 이미 안에 들어와 있으면 더 들어갈 데가 없다. 여기서는 증축한다
    if (indoors) return '증축';
    return hasIndoor(object.building, level) ? '들어가기' : '증축';
  }
  return PROMPT[object.type];
}

/**
 * 지금 A 를 누르면 무엇이 되는가.
 *
 * 바라보는 칸을 먼저 본다 (§5). 거기 아무것도 없으면 **밟고 선 칸**의
 * 문·길목·건물 부지를 본다 (§6 — 문 타일을 밟고 A). 둘 다 없으면 null.
 */
export function interactionAt(
  map: TileMapData,
  hero: HeroTile,
  buildings?: Record<string, number>,
): Interaction | null {
  const indoors = buildingIdFromIndoor(map.id) !== null;

  const front = facingTile(hero);
  const faced = objectAt(map, front.x, front.y);
  if (faced !== undefined) {
    return { object: faced, label: labelFor(faced, buildings, indoors) };
  }

  // 밟고 선 칸도 본다 — 문·길목·건물 부지·판매대는 그 위에 서서 누른다
  const under = objectAt(map, hero.x, hero.y);
  if (
    under !== undefined &&
    (under.type === 'door' ||
      under.type === 'gateway' ||
      under.building !== undefined ||
      under.shop === true ||
      under.room !== undefined)
  ) {
    return { object: under, label: labelFor(under, buildings, indoors) };
  }

  return null;
}

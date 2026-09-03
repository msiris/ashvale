/**
 * 맵 불러오기와 조회.
 *
 * **여기가 Tiled 교체 지점이다.** 지금은 코드로 만든 마을을 돌려주지만,
 * Tiled JSON 이 생기면 `loadMap` 안에서 파싱한 결과를 돌려주면 된다.
 * 부르는 쪽(씬·규칙)은 `TileMapData` 만 알고 있으므로 손댈 필요가 없다.
 *
 * Tiled 에서 가져올 때의 대응:
 *   ground 레이어    -> ground   (gid -> Terrain 대응표를 거친다)
 *   deco 레이어      -> deco
 *   collision 레이어 -> collision (칸이 채워져 있으면 true)
 *   objects 레이어   -> objects   (type / target / building 속성을 그대로 읽는다)
 */

import type { MapObject, TileMapData } from '@/types/map';
import { inBounds, tileIndex } from '@/types/map';
import { buildTownMap, townKey, type TownContext } from '@/data/maps/town';
import { buildRegionMap } from '@/data/maps/region';
import { buildIndoorMap, buildingIdFromIndoor } from '@/data/maps/indoor';
import { buildEpisodeMap, parseEpisodeMap } from '@/data/maps/episode';
import { ALL_EPISODES } from '@/data/episodes-index';
import { buildFactionMap, parseFactionMap } from '@/data/maps/faction';
import { regionIdFromMap } from '@/data/regions';

/**
 * 맵을 정하는 데 필요한 것.
 * 마을은 시대와 건물 레벨에 따라 모습이 달라진다 — 같은 'town' 이어도 그림이 다르다.
 */
export interface MapContext extends TownContext {
  mapId: string;
  /** 숙소에 서 있을 인물 (§7.4). 실내 맵에서만 쓴다 */
  residents?: { id: string; archetypeId: string; name: string }[];
  /**
   * 지금 누군가를 데려왔는가 (§11).
   * 동행 노드는 데려갔을 때만 나타나므로 맵 열쇠에도 들어가야 한다 —
   * 안 그러면 혼자 갔던 지도가 캐시에서 그대로 나온다.
   */
  escorted?: boolean;
  /** 이번 주 이 건물에 나와 있는 인물 (§7.6 나들이) */
  visitor?: { id: string; archetypeId: string; name: string };
  /**
   * 몇 번째 나들이인가. 지역 지형을 뽑는 데 쓴다 (§11).
   * 이 값이 열쇠에 들어가야 갈 때마다 새 지도가 나온다.
   */
  visit?: number;
  /** 머리 위에 표를 달 의뢰인 (§7.6) */
  patronMarks?: Record<string, 'offer' | 'report'>;
  /** 이번 주 밖에 나가 있는 의뢰인 (§7.6). 회관에서 빠지고 마을에 선다 */
  patronAway?: string;
  /** 세력 마을에서 지금 사이가 어떤가 (§7) */
  holdMode?: 'helped' | 'ruled';
  /**
   * 이 판의 이야기를 이미 봤는가 (§11 곁가지).
   *
   * 열쇠에 들어가야 한다 — 안 그러면 이야기를 보고 나서도 캐시에 남은
   * 지도가 그대로 나와 표식이 되살아난다.
   */
  sceneDone?: boolean;
}

const cache = new Map<string, TileMapData>();

/** 같은 열쇠면 같은 맵이다. 씬이 다시 그릴지 판단할 때도 쓴다 */
export function mapKey(ctx: MapContext): string {
  if (ctx.mapId === 'town') return townKey(ctx);
  // 실내는 시대에 따라 의뢰인이, 숙소는 상주하는 인물이 달라진다
  if (buildingIdFromIndoor(ctx.mapId) !== null) {
    const who = (ctx.residents ?? []).map((r) => `${r.id}@${r.name}`).join(',');
    // 나와 있는 사람이 바뀌면 다시 그린다
    const guest = ctx.visitor === undefined ? '' : `${ctx.visitor.id}@${ctx.visitor.name}`;
    // 표가 붙거나 떨어지면 다시 그려야 한다
    const away = ctx.patronAway ?? '';
    const marks = Object.entries(ctx.patronMarks ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, kind]) => `${id}${kind}`)
      .join(',');
    return `${ctx.mapId}:${ctx.eraIndex}:${who}:${guest}:${marks}:${away}`;
  }
  const ep = parseEpisodeMap(ctx.mapId);
  if (ep !== null) return `${ctx.mapId}:${ctx.sceneDone === true ? 'done' : 'open'}`;
  // 사이가 바뀌면 서 있는 사람의 이름표가 바뀐다
  if (parseFactionMap(ctx.mapId) !== null) return `${ctx.mapId}:${ctx.holdMode ?? 'helped'}`;
  if (regionIdFromMap(ctx.mapId) !== null) {
    const trip = ctx.visit ?? 0;
    return `${ctx.mapId}:${trip}${ctx.escorted === true ? ':escort' : ''}`;
  }
  return ctx.mapId;
}

/**
 * 에피소드 맵이면 세우는 데 필요한 것들을 모아 준다.
 *
 * 판의 지형과 이야기 자리는 `content/episodes.ts` 가 정한다 —
 * 맵 만드는 쪽이 이야기를 알 필요는 없으므로 여기서 옮겨 담는다.
 */
function episodeInput(mapId: string, sceneDone: boolean) {
  const parsed = parseEpisodeMap(mapId);
  if (parsed === null) return null;
  const episode = ALL_EPISODES.find((e) => e.id === parsed.episodeId);
  const stage = episode?.stages[parsed.stage];
  if (episode === undefined || stage === undefined) return null;
  return {
    episodeId: episode.id,
    stage: parsed.stage,
    look: stage.look,
    hasScene: stage.scene !== undefined,
    sceneDone,
    ...(stage.boss !== undefined ? { bossName: stage.boss.name } : {}),
  };
}

export function loadMap(ctx: MapContext): TileMapData {
  const key = mapKey(ctx);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const regionId = regionIdFromMap(ctx.mapId);
  const indoorOf = buildingIdFromIndoor(ctx.mapId);
  const episode = episodeInput(ctx.mapId, ctx.sceneDone === true);
  const factionId = parseFactionMap(ctx.mapId);

  let map: TileMapData;
  if (ctx.mapId === 'town') {
    map = buildTownMap(ctx);
  } else if (regionId !== null) {
    map = buildRegionMap(regionId, ctx.escorted === true, ctx.visit ?? 0);
  } else if (episode !== null) {
    map = buildEpisodeMap(episode);
  } else if (factionId !== null) {
    map = buildFactionMap(factionId, ctx.holdMode ?? 'helped');
  } else if (indoorOf !== null) {
    map = buildIndoorMap({
      buildingId: indoorOf,
      eraIndex: ctx.eraIndex,
      ...(ctx.residents !== undefined ? { residents: ctx.residents } : {}),
      ...(ctx.visitor !== undefined ? { visitor: ctx.visitor } : {}),
      ...(ctx.patronMarks !== undefined ? { patronMarks: ctx.patronMarks } : {}),
      ...(ctx.patronAway !== undefined ? { patronAway: ctx.patronAway } : {}),
    });
  } else {
    throw new Error(`맵 '${ctx.mapId}' 가 없다. src/systems/map.ts 의 loadMap 에 추가하라.`);
  }

  cache.set(key, map);
  return map;
}

/** 그 칸에 놓인 오브젝트. 한 칸에 하나만 둔다 */
export function objectAt(map: TileMapData, x: number, y: number): MapObject | undefined {
  return map.objects.find((o) => o.x === x && o.y === y);
}

/**
 * 그 칸으로 들어갈 수 없는가.
 *
 * 지형 종류를 보지 않는다 — collision 레이어와, 막는 오브젝트만 본다.
 * 인물은 밀어서 지나갈 수 없다 (§5).
 */
export function isBlocked(map: TileMapData, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return true;
  if (map.collision[tileIndex(map, x, y)] === true) return true;
  return objectAt(map, x, y)?.solid === true;
}

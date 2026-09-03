/**
 * 판 규칙 점검 (§11 곁가지).
 *
 *  1. 규칙이 걸린 판이 실제로 있고, 전부에 걸리지는 않았는가
 *  2. **규칙을 지키면 입구에서 출구까지 갈 수 있는가** — 못 가면 막힌 판이다
 *  3. 되짚어 가면 정말 막히는가 (규칙이 규칙인가)
 *  4. 갈라진 틈이 열리고 닫히는가
 *  5. 10판 세이브가 11판으로 올라오는가
 */

import { ALL_EPISODES } from '../src/data/episodes-index';
import { buildEpisodeMap, EPISODE_ENTRY } from '../src/data/maps/episode';
import { RIFT_OPEN, RIFT_PERIOD, extraBlocked, riftOpen, ruleOf } from '../src/systems/stageRule';
import { isBlocked } from '../src/systems/map';
import { resolveMove } from '../src/systems/movement';
import { newGame } from '../src/systems/newGame';
import { migrate } from '../src/storage/migrate';
import { SCHEMA_VERSION } from '../src/data/save';
import type { GameState } from '../src/types/game';
import type { TileMapData } from '../src/types/map';
import type { EpisodeLook } from '../src/data/content/episodes';

// 1. 어느 판에 규칙이 걸렸나
const LOOKS: EpisodeLook[] = ['glass', 'forest', 'tower', 'village', 'valley', 'road'];
const ruled = LOOKS.filter((l) => ruleOf(l) !== null);
if (ruled.length === 0) throw new Error('규칙이 걸린 지형이 없다');
if (ruled.length === LOOKS.length) throw new Error('전부에 규칙이 걸렸다 — 걷는 일이 다 시험이 된다');
console.log(`  규칙이 걸린 지형: ${ruled.map((l) => `${l}(${ruleOf(l)})`).join(' · ')}`);

const base: GameState = newGame({ now: 1, townName: '점검' });

function stateAt(
  look: EpisodeLook,
  mapId: string,
  at: { x: number; y: number },
  trail: string[],
): GameState {
  return {
    ...base,
    world: {
      ...base.world,
      currentMap: mapId,
      heroTile: { x: at.x, y: at.y, dir: 'up' },
      steppedTiles: trail,
    },
    episodeRun: { episodeId: 'x', stage: 0, favor: 0, seen: [], duel: null },
  };
}

/**
 * 규칙을 지키며 걷는다 — 밟은 칸을 남기고, 막힌 데는 안 간다.
 * 되짚지 않는 너비 우선으로 출구를 찾는다.
 */
function canReachExit(map: TileMapData, look: EpisodeLook): boolean {
  const exit = map.objects.find((o) => o.id === 'episode-next');
  if (exit === undefined) return false;

  // 걸음마다 막힌 칸이 달라지므로 (경로, 자리) 를 함께 들고 넓힌다
  interface Node {
    at: { x: number; y: number };
    trail: string[];
  }
  const queue: Node[] = [{ at: { x: EPISODE_ENTRY.x, y: EPISODE_ENTRY.y }, trail: [] }];
  const seen = new Set<string>();
  let guard = 0;

  while (queue.length > 0 && guard < 60000) {
    guard += 1;
    const node = queue.shift();
    if (node === undefined) break;
    if (node.at.x === exit.x && node.at.y === exit.y) return true;

    const state = stateAt(look, map.id, node.at, node.trail);
    const blocked = extraBlocked(state, look, map);

    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
    ] as const) {
      const nx = node.at.x + dx;
      const ny = node.at.y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      if (isBlocked(map, nx, ny)) continue;
      if (blocked.has(`${nx},${ny}`)) continue;

      const trail = [...node.trail, `${node.at.x},${node.at.y}`];
      // 자리 + 걸음 수로 접어 둔다. 경로 전부를 열쇠로 쓰면 폭발한다
      const key = `${nx},${ny}@${trail.length % (RIFT_PERIOD * 2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ at: { x: nx, y: ny }, trail });
    }
  }
  return false;
}

// 2. 규칙을 지키면 통과할 수 있다
for (const e of ALL_EPISODES) {
  e.stages.forEach((stage, i) => {
    if (ruleOf(stage.look) === null) return;
    const map = buildEpisodeMap({
      episodeId: e.id,
      stage: i,
      look: stage.look,
      hasScene: stage.scene !== undefined,
      ...(stage.boss !== undefined ? { bossName: stage.boss.name } : {}),
    });
    // 마지막 판은 출구가 막혀 있다. 마주설 것 앞까지 가는 것으로 본다
    if (stage.boss !== undefined) return;
    if (!canReachExit(map, stage.look)) {
      throw new Error(`${map.id} (${ruleOf(stage.look)}): 규칙을 지켜도 출구에 못 간다`);
    }
  });
}
console.log('  규칙이 걸린 판마다 입구에서 출구까지 길이 남는다');

// 3. 되짚어 가면 막힌다
const glassMap = buildEpisodeMap({
  episodeId: 'glass-bridge',
  stage: 1,
  look: 'glass',
  hasScene: true,
});
const start = { x: EPISODE_ENTRY.x, y: EPISODE_ENTRY.y };
const behind = `${start.x},${start.y + 1}`;
// 유리: 두 번 밟은 자리만 깨진다
const once = stateAt('glass', glassMap.id, start, [behind]);
if (extraBlocked(once, 'glass', glassMap).has(behind)) {
  throw new Error('유리: 한 번 밟은 자리가 벌써 깨졌다');
}
const twice = stateAt('glass', glassMap.id, start, [behind, behind]);
if (!extraBlocked(twice, 'glass', glassMap).has(behind)) {
  throw new Error('유리: 두 번 밟았는데 안 깨진다');
}
console.log('  유리 — 한 번은 견디고 두 번째에 깨진다');

const roadMap = buildEpisodeMap({ episodeId: 'walking-road', stage: 0, look: 'road', hasScene: true });
const gone = stateAt('road', roadMap.id, start, [behind]);
if (!extraBlocked(gone, 'road', roadMap).has(behind)) {
  throw new Error('길: 지나온 자리가 안 사라진다');
}
// 지금 서 있는 칸은 남아 있어야 한다
if (extraBlocked(gone, 'road', roadMap).has(`${start.x},${start.y}`)) {
  throw new Error('길: 서 있는 칸이 사라졌다');
}
console.log('  길 — 지나온 자리가 사라지고 서 있는 칸은 남는다');

// 4. 틈이 열닫힌다
let open = 0;
for (let n = 0; n < RIFT_PERIOD; n++) if (riftOpen(n)) open += 1;
if (open !== RIFT_OPEN) throw new Error(`틈이 ${RIFT_PERIOD}걸음 중 ${open}걸음 벌어진다`);
const valleyMap = buildEpisodeMap({
  episodeId: 'two-letters',
  stage: 0,
  look: 'valley',
  hasScene: true,
});
const trailOpen = new Array<string>(0).fill('');
const openState = stateAt('valley', valleyMap.id, start, trailOpen);
const closedState = stateAt('valley', valleyMap.id, start, new Array<string>(RIFT_OPEN).fill('0,0'));
if (extraBlocked(openState, 'valley', valleyMap).size === 0) {
  throw new Error('골짜기: 벌어진 동안인데 막힌 칸이 없다');
}
if (extraBlocked(closedState, 'valley', valleyMap).size !== 0) {
  throw new Error('골짜기: 닫힌 동안인데 막혀 있다');
}
console.log(`  골짜기 — ${RIFT_PERIOD}걸음 중 ${RIFT_OPEN}걸음 벌어진다`);

// 4b. 이동 판정이 추가로 막힌 칸을 존중하는가
const hero = { x: start.x, y: start.y - 1, dir: 'up' as const };
const broken = new Set<string>([`${start.x},${start.y}`]);
const free = resolveMove(hero, glassMap, 'down', { fromStandstill: false });
if (free.kind !== 'step') throw new Error('막지 않았는데도 못 내려간다 — 지형부터 다시 봐야 한다');
const stopped = resolveMove(hero, glassMap, 'down', {
  fromStandstill: false,
  extraBlocked: broken,
});
if (stopped.kind !== 'blocked') throw new Error('깨진 칸으로 그냥 걸어 들어간다');
// 막히지 않은 방향은 그대로 간다
const still = resolveMove(hero, glassMap, 'up', { fromStandstill: false, extraBlocked: broken });
if (still.kind !== 'step') throw new Error('엉뚱한 방향까지 막혔다');
console.log('  이동 판정이 깨진 칸을 벽으로 본다');

// 5. 마이그레이션
const old = JSON.parse(JSON.stringify(newGame({ now: 2, townName: '옛판' }))) as Record<string, unknown>;
old['schemaVersion'] = 10;
delete (old['world'] as Record<string, unknown>)['steppedTiles'];
const result = migrate(JSON.stringify(old));
if (!result.ok) throw new Error(`마이그레이션 실패: ${result.message}`);
if (result.state.schemaVersion !== SCHEMA_VERSION) throw new Error('판이 안 올라갔다');
if (result.state.world.steppedTiles.length !== 0) throw new Error('steppedTiles 가 안 생겼다');
console.log(`10판 → ${SCHEMA_VERSION}판 통과`);

console.log('판 규칙 점검 통과');

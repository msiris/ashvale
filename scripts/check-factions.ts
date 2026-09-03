/**
 * 세력 이야기 점검.
 *
 *  1. 네 세력이 다 있고 사슬이 이어지는가
 *  2. 세력 마을 넷이 다 세워지고, 입구에서 거래 자리와 대표에 닿는가
 *  3. 조공이 두 주에 한 번만 오는가 · 복속이 두 배인가
 *  4. 세력 마을에서 값이 달라지는가
 *  5. 8판 세이브가 9판으로 올라오는가
 */

import { FACTION_EPISODES } from '../src/data/content/faction-episodes';
import { ALL_EPISODES } from '../src/data/episodes-index';
import { buildFactionMap, FACTION_ENTRY, parseFactionMap } from '../src/data/maps/faction';
import { TRIBUTE_EVERY } from '../src/data/faction-holds';
import { tributeDue, tributeFor } from '../src/systems/tribute';
import { envoyScript } from '../src/systems/factionVillage';
import { sellValue } from '../src/systems/market';
import { newGame } from '../src/systems/newGame';
import { migrate } from '../src/storage/migrate';
import { SCHEMA_VERSION } from '../src/data/save';
import { FACTION_LABEL } from '../src/data/relationships';
import type { FactionId, GameState } from '../src/types/game';
import type { TileMapData } from '../src/types/map';

const FACTIONS: FactionId[] = ['guild', 'oath', 'grove', 'tower'];

// 1. 짜임새
const covered = new Set(FACTION_EPISODES.map((e) => e.factionId));
for (const id of FACTIONS) {
  if (!covered.has(id)) throw new Error(`${FACTION_LABEL[id]} 이야기가 없다`);
}
const allIds = new Set(ALL_EPISODES.map((e) => e.id));
for (const e of FACTION_EPISODES) {
  if (e.outcome === undefined) throw new Error(`${e.id}: 갈림길이 없다`);
  if (e.stages.length !== 5) throw new Error(`${e.id}: 판이 다섯이 아니다`);
  if (e.needs !== undefined && !allIds.has(e.needs)) throw new Error(`${e.id}: needs 가 없는 이야기다`);
  const boss = e.stages[e.stages.length - 1]?.boss;
  if (boss === undefined) throw new Error(`${e.id}: 마주설 것이 없다`);
  console.log(`  ${e.id.padEnd(15)} ${FACTION_LABEL[e.factionId!]} · 난도 ${boss.difficulty}`);
}

// 2. 세력 마을
function walkable(map: TileMapData, from: { x: number; y: number }): Set<string> {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift();
    if (at === undefined) break;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const x = at.x + dx;
      const y = at.y + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      if (map.collision[y * map.width + x] === true) continue;
      seen.add(key);
      queue.push({ x, y });
    }
  }
  return seen;
}

for (const id of FACTIONS) {
  for (const mode of ['helped', 'ruled'] as const) {
    const map = buildFactionMap(id, mode);
    if (parseFactionMap(map.id) !== id) throw new Error(`${map.id}: 세력 id 를 되읽지 못한다`);
    const reach = walkable(map, FACTION_ENTRY);

    for (const want of ['faction-shop', 'faction-envoy', 'faction-exit']) {
      const o = map.objects.find((x) => x.id === want);
      if (o === undefined) throw new Error(`${map.id}: ${want} 가 없다`);
      // 막고 서 있는 사람은 그 칸이 아니라 옆에서 말을 건다
      const spots =
        o.solid === true
          ? [
              { x: o.x, y: o.y + 1 },
              { x: o.x, y: o.y - 1 },
              { x: o.x - 1, y: o.y },
              { x: o.x + 1, y: o.y },
            ]
          : [{ x: o.x, y: o.y }];
      if (!spots.some((p) => reach.has(`${p.x},${p.y}`))) {
        throw new Error(`${map.id}: ${want} 에 닿을 수 없다`);
      }
    }
  }
  console.log(`  ${FACTION_LABEL[id].padEnd(8)} 마을 · 거래 자리와 대표에 닿는다`);
}

// 3. 조공
let state: GameState = newGame({ now: 1, townName: '조공' });
state = {
  ...state,
  world: { ...state.world, turn: TRIBUTE_EVERY, factionHolds: { guild: 'helped' } },
};
const helped = tributeFor(state);
if (helped.lines.length !== 1) throw new Error('도운 세력의 조공이 안 온다');

const ruledState: GameState = {
  ...state,
  world: { ...state.world, factionHolds: { guild: 'ruled' } },
};
const ruled = tributeFor(ruledState);
if ((ruled.resources.gold ?? 0) !== (helped.resources.gold ?? 0) * 2) {
  throw new Error('복속인데 두 배가 아니다');
}
console.log(`  조공 · 우호 금화 ${helped.resources.gold} / 복속 금화 ${ruled.resources.gold}`);

const off: GameState = { ...state, world: { ...state.world, turn: TRIBUTE_EVERY + 1 } };
if (tributeFor(off).lines.length !== 0) throw new Error(`${TRIBUTE_EVERY}주에 한 번이 아니다`);
if (tributeDue(0)) throw new Error('0주차에 조공이 온다');

// 대표가 할 말이 있는가
for (const id of FACTIONS) {
  const s: GameState = { ...state, world: { ...state.world, factionHolds: { [id]: 'helped' } } };
  const script = envoyScript(s, id);
  if (script === null || script.lines.length < 2) throw new Error(`${id}: 대표가 할 말이 없다`);
}

// 4. 세력 마을에서의 값
const inTown: GameState = {
  ...state,
  town: { ...state.town, buildings: { ...state.town.buildings, market: 1 } },
};
const atHelped: GameState = {
  ...inTown,
  world: { ...inTown.world, currentMap: 'faction:guild', factionHolds: { guild: 'helped' } },
};
const atRuled: GameState = {
  ...inTown,
  world: { ...inTown.world, currentMap: 'faction:guild', factionHolds: { guild: 'ruled' } },
};
const home = sellValue(inTown, 'wood', 100);
const good = sellValue(atHelped, 'wood', 100);
const bad = sellValue(atRuled, 'wood', 100);
if (!(good > home && home > bad)) {
  throw new Error(`값이 안 갈린다: 우호 ${good} / 우리 ${home} / 복속 ${bad}`);
}
console.log(`  목재 100 팔 때 · 우호 마을 ${good} / 우리 시장 ${home} / 복속 마을 ${bad}`);

// 5. 마이그레이션
const old = JSON.parse(JSON.stringify(newGame({ now: 2, townName: '옛판' }))) as Record<string, unknown>;
old['schemaVersion'] = 8;
delete (old['world'] as Record<string, unknown>)['factionHolds'];
const result = migrate(JSON.stringify(old));
if (!result.ok) throw new Error(`마이그레이션 실패: ${result.message}`);
if (result.state.schemaVersion !== SCHEMA_VERSION) throw new Error('판이 안 올라갔다');
if (Object.keys(result.state.world.factionHolds).length !== 0) throw new Error('factionHolds 가 안 생겼다');
console.log(`8판 → ${SCHEMA_VERSION}판 통과`);

console.log('세력 이야기 점검 통과');

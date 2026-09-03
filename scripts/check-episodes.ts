/**
 * 동화 에피소드 점검.
 *
 *  1. 사슬이 끊기지 않는가 · 판이 다섯인가 · 마지막에만 마주섬이 있는가
 *  2. 판마다 지도가 세워지고, 입구에서 출구까지 걸어갈 수 있는가
 *  3. 다 잘 골라도 못 넘기는 난도는 아닌가 (결 최대치 기준)
 *  4. 여섯을 다 끝내면 원형 여섯이 다 들어오는가
 *  5. 오래 진행한 판에서 빈 원형이 오는가
 *  6. 1주차에 첫 이야기가 열리는가
 *  7. 7판 세이브가 8판으로 올라오는가
 */

import { TALES } from '../src/data/content/tales';
import { ALL_EPISODES } from '../src/data/episodes-index';
import { archetypeFor, clearedTales, isRecall, openEpisodes } from '../src/systems/episodes';
import { buildEpisodeMap, EPISODE_ENTRY, episodeMapId, parseEpisodeMap } from '../src/data/maps/episode';
import { addCompanion } from '../src/systems/roster';
import { newGame } from '../src/systems/newGame';
import { migrate } from '../src/storage/migrate';
import { SCHEMA_VERSION } from '../src/data/save';
import type { GameState } from '../src/types/game';
import type { TileMapData } from '../src/types/map';

const ids = new Set(ALL_EPISODES.map((e) => e.id));

// 1. 짜임새
for (const e of ALL_EPISODES) {
  if (e.needs !== undefined && !ids.has(e.needs)) throw new Error(`${e.id}: needs 가 없는 이야기다`);
  if (e.stages.length !== 5) throw new Error(`${e.id}: 판이 ${e.stages.length}개다. 다섯이어야 한다`);
  if (e.townTalk.length < 2) throw new Error(`${e.id}: 마을 소문이 모자란다`);

  e.stages.forEach((stage, i) => {
    const isLast = i === e.stages.length - 1;
    if (isLast && stage.boss === undefined) throw new Error(`${e.id}/${stage.id}: 마지막인데 마주설 것이 없다`);
    if (!isLast && stage.boss !== undefined) throw new Error(`${e.id}/${stage.id}: 마지막이 아닌데 마주섬이 있다`);
    if (!isLast && stage.scene === undefined) throw new Error(`${e.id}/${stage.id}: 이야기 자리가 없다`);
    if (stage.scene !== undefined && stage.scene.choices.length < 3) {
      throw new Error(`${e.id}/${stage.id}: 선택지가 셋보다 적다`);
    }
  });
}

// 2. 지도 — 입구에서 출구까지 닿는가
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

for (const e of ALL_EPISODES) {
  e.stages.forEach((stage, i) => {
    const map = buildEpisodeMap({
      episodeId: e.id,
      stage: i,
      look: stage.look,
      hasScene: stage.scene !== undefined,
      ...(stage.boss !== undefined ? { bossName: stage.boss.name } : {}),
    });
    if (parseEpisodeMap(map.id)?.stage !== i) throw new Error(`${map.id}: 판 번호를 되읽지 못한다`);

    const reach = walkable(map, EPISODE_ENTRY);

    const next = map.objects.find((o) => o.id === 'episode-next');
    const scene = map.objects.find((o) => o.id === 'episode-scene');
    const boss = map.objects.find((o) => o.id === 'episode-boss');

    if (next === undefined) throw new Error(`${map.id}: 다음 판으로 나가는 문이 없다`);
    if (stage.scene !== undefined && scene === undefined) throw new Error(`${map.id}: 이야기 자리가 안 놓였다`);
    if (stage.boss !== undefined && boss === undefined) throw new Error(`${map.id}: 마주설 것이 안 놓였다`);

    if (scene !== undefined && !reach.has(`${scene.x},${scene.y}`)) {
      throw new Error(`${map.id}: 이야기 자리에 못 닿는다`);
    }
    if (boss === undefined) {
      // 마주섬이 없는 판은 그냥 지나갈 수 있어야 한다
      if (!reach.has(`${next.x},${next.y}`)) throw new Error(`${map.id}: 출구에 못 닿는다`);
    } else {
      // 마지막 판은 마주설 것 앞까지 닿고, 그 너머 출구는 막혀 있어야 한다
      if (!reach.has(`${boss.x},${boss.y + 1}`)) throw new Error(`${map.id}: 마주설 것 앞에 못 선다`);
      if (reach.has(`${next.x},${next.y}`)) throw new Error(`${map.id}: 마주서지 않고 지나갈 수 있다`);
    }
  });
  console.log(`  ${e.id.padEnd(14)} 판 ${e.stages.length}개 · 전부 걸어 통과`);
}

// 3. 난도 — 결을 다 쌓으면 어느 정도인가
for (const e of ALL_EPISODES) {
  const best = e.stages.reduce(
    (n, s) => n + (s.scene === undefined ? 0 : Math.max(...s.scene.choices.map((c) => c.favor))),
    0,
  );
  const boss = e.stages[e.stages.length - 1]?.boss;
  if (boss === undefined) continue;
  const favorBonus = Math.floor(best * 0.5);
  // 주사위 1~20 뿐이어도 결을 다 쌓으면 넘길 여지가 있어야 한다
  if (20 + favorBonus < boss.difficulty) throw new Error(`${e.id}: 결을 다 쌓아도 못 넘긴다`);
  console.log(`  ${e.id.padEnd(14)} 결 최대 ${best} (굴림 +${favorBonus}) · 난도 ${boss.difficulty}`);
}

// 4. 여섯을 다 끝내면
let state: GameState = newGame({ now: 1, townName: '점검' });
state = { ...state, world: { ...state.world, turn: 99 } };
for (const e of TALES) {
  const grown = addCompanion(state, 'episode', archetypeFor(state, e));
  if (grown === null) throw new Error(`${e.id}: 명단에 못 들어갔다`);
  state = {
    ...grown.state,
    world: { ...grown.state.world, clearedEpisodes: [...grown.state.world.clearedEpisodes, e.id] },
  };
}
const arcs = new Set(Object.values(state.companions).map((c) => c.archetypeId));
console.log(`원형 ${arcs.size}종: ${[...arcs].join(' ')}`);
if (arcs.size !== 6) throw new Error('여섯을 다 끝냈는데 원형이 여섯이 아니다');
const stillOpen = openEpisodes(state);
if (stillOpen.some((e) => e.factionId === undefined)) {
  throw new Error('끝낸 동화 이야기가 목록에 남아 있다');
}
console.log(`동화 여섯을 끝낸 뒤 남은 것: 세력 이야기 ${stillOpen.length}편`);

// 5. 오래 진행한 판 — 기사·사냥꾼·마법사만 있는 전설기 세이브
let old2: GameState = newGame({ now: 3, townName: '전설' });
old2 = { ...old2, world: { ...old2.world, turn: 120, eraIndex: 4 }, companions: {} };
for (const arc of ['knight', 'hunter', 'mage']) {
  const g = addCompanion(old2, 'quest', arc);
  if (g === null) throw new Error('초기 3인 배치 실패');
  old2 = g.state;
}
const first = openEpisodes(old2)[0];
if (first === undefined) throw new Error('전설기인데 갈 이야기가 없다');
const grown2 = addCompanion(old2, 'episode', archetypeFor(old2, first));
if (grown2 === null) throw new Error('합류 실패');
const arc2 = grown2.companion.archetypeId;
console.log(`전설기 · 3인 → "${first.title}" 이 데려오는 원형: ${arc2}`);
if (['knight', 'hunter', 'mage'].includes(arc2)) throw new Error('있는 원형이 또 왔다');

// 6. 1주차
const fresh: GameState = newGame({ now: 4, townName: '첫주' });
if (fresh.world.turn !== 0) throw new Error('시작 turn 이 0 이 아니다 — 주차 계산을 다시 봐야 한다');
const day1 = openEpisodes(fresh);
if (day1.length !== 1) throw new Error(`1주차에 열린 이야기가 ${day1.length}개다. 하나여야 한다`);
console.log(`1주차에 열린 이야기: ${day1[0]?.title}`);
/**
 * 사슬 둘이 따로 돈다 — 동화와 세력.
 * 아무것도 안 끝낸 채로 주차만 흘러도 각 사슬의 머리 하나씩만 열려야 한다.
 */
const later = openEpisodes({ ...fresh, world: { ...fresh.world, turn: 99 } });
const heads = later.map((e) => e.id).sort();
if (heads.length !== 2) throw new Error(`앞 이야기를 안 끝냈는데 ${heads.length}편이 열렸다: ${heads.join(', ')}`);
console.log(`사슬 머리 둘: ${heads.join(' · ')}`);

// 8. 오래 진행한 판 — 지난 판의 죽은 이야기 id 가 남아 있어도 처음부터 열린다
const legacy: GameState = {
  ...fresh,
  world: {
    ...fresh.world,
    turn: 140,
    eraIndex: 5,
    // 지난 판에만 있던 이야기 id 들. 지금은 없는 이야기다
    clearedEpisodes: ['glass-bridge', 'lantern-wolf', 'paper-tower', 'bitter-well'],
  },
};
const heads2 = openEpisodes(legacy).map((e) => e.id).sort();
if (heads2.length !== 2) {
  throw new Error(`옛 세이브에서 ${heads2.length}편이 열렸다: ${heads2.join(', ')}`);
}
if (!heads2.includes(TALES[0]!.id)) {
  throw new Error('옛 세이브에서 첫 이야기가 안 열린다');
}
console.log(`옛 세이브(전설기·죽은 id 4개) → 열린 것: ${heads2.join(' · ')}`);

// 죽은 id 는 회상 목록에도 안 나온다
if (clearedTales(legacy).length !== 0) {
  throw new Error('없는 이야기가 회상 목록에 나온다');
}

// 9. 회상 — 끝낸 것이 목록에 나오고, 다시 걸어도 보상이 같다
const afterOne: GameState = {
  ...fresh,
  world: { ...fresh.world, turn: 140, clearedEpisodes: [TALES[0]!.id] },
};
const recallable = clearedTales(afterOne);
if (recallable.length !== 1 || recallable[0]?.id !== TALES[0]!.id) {
  throw new Error('끝낸 이야기가 회상 목록에 안 나온다');
}
if (!isRecall(afterOne, TALES[0]!.id)) throw new Error('회상인데 회상으로 안 본다');
if (isRecall(afterOne, TALES[1]!.id)) throw new Error('안 끝낸 것을 회상으로 본다');

// 끝낸 이야기는 갈 목록에서 빠지고, 다음 편이 대신 열린다
const openAfter = openEpisodes(afterOne).map((e) => e.id);
if (openAfter.includes(TALES[0]!.id)) throw new Error('끝낸 이야기가 갈 목록에 남아 있다');
if (!openAfter.includes(TALES[1]!.id)) throw new Error('다음 편이 안 열렸다');

// 회상으로 다시 걸어도 원형이 들어온다 — 보상이 같다
const grown3 = addCompanion(afterOne, 'episode', archetypeFor(afterOne, TALES[0]!));
if (grown3 === null) throw new Error('회상으로는 동료가 안 들어온다');
console.log(`회상 · "${TALES[0]!.title}" 다시 걸으면 ${grown3.companion.archetypeId} 합류`);

// 7. 마이그레이션
const old = JSON.parse(JSON.stringify(newGame({ now: 2, townName: '옛판' }))) as Record<string, unknown>;
old['schemaVersion'] = 7;
delete old['episodeRun'];
const result = migrate(JSON.stringify(old));
if (!result.ok) throw new Error(`마이그레이션 실패: ${result.message}`);
if (result.state.schemaVersion !== SCHEMA_VERSION) throw new Error('판이 안 올라갔다');
if (result.state.episodeRun !== null) throw new Error('episodeRun 이 안 생겼다');
console.log(`7판 → ${SCHEMA_VERSION}판 통과`);

console.log(`맵 id 보기: ${episodeMapId('red-hood', 3)}`);
console.log('에피소드 점검 통과');

/**
 * 동화 에피소드 점검.
 *
 *  1. 사슬이 끊기지 않는가 (needs 가 실제 에피소드를 가리키는가)
 *  2. 최선을 고르면 결이 차고, 최악을 고르면 안 차는가
 *  3. 여섯을 다 끝내면 원형 여섯이 다 들어오는가
 *  4. 6판 세이브가 7판으로 올라오는가
 */

import { EPISODES, EPISODE_FAVOR_PASS } from '../src/data/content/episodes';
import { applyEpisodeChoice, archetypeFor, openEpisodes } from '../src/systems/episodes';
import { addCompanion } from '../src/systems/roster';
import { newGame } from '../src/systems/newGame';
import { migrate } from '../src/storage/migrate';
import { SCHEMA_VERSION } from '../src/data/save';
import type { GameState } from '../src/types/game';

const ids = new Set(EPISODES.map((e) => e.id));

// 1. 사슬
for (const e of EPISODES) {
  if (e.needs !== undefined && !ids.has(e.needs)) throw new Error(`${e.id}: needs 가 없는 이야기다`);
  if (e.beats.length < 2) throw new Error(`${e.id}: 장이 너무 적다`);
  for (const b of e.beats) {
    if (b.choices.length < 2) throw new Error(`${e.id}/${b.id}: 선택지가 하나뿐이다`);
    const best = Math.max(...b.choices.map((c) => c.favor));
    if (best < 1) throw new Error(`${e.id}/${b.id}: 결이 오르는 선택지가 없다`);
  }
}

// 2. 최선 / 최악
for (const e of EPISODES) {
  const best = e.beats.reduce((n, b) => n + Math.max(...b.choices.map((c) => c.favor)), 0);
  const worst = e.beats.reduce((n, b) => n + Math.min(...b.choices.map((c) => c.favor)), 0);
  if (best < EPISODE_FAVOR_PASS) throw new Error(`${e.id}: 다 잘 골라도 못 데려온다`);
  if (worst >= EPISODE_FAVOR_PASS) throw new Error(`${e.id}: 아무렇게나 골라도 따라온다`);
  console.log(`  ${e.id.padEnd(14)} 결 ${worst}~${best} (기준 ${EPISODE_FAVOR_PASS})`);
}

// 3. 여섯을 다 끝내면
let state: GameState = newGame({ now: 1, townName: '점검' });
state = { ...state, world: { ...state.world, turn: 99 } };
for (const e of EPISODES) {
  for (const b of e.beats) {
    const pick = b.choices.reduce((a, c) => (c.favor > a.favor ? c : a));
    state = applyEpisodeChoice(state, pick).state;
  }
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
if (openEpisodes(state).length !== 0) throw new Error('끝낸 이야기가 목록에 남아 있다');

// 4. 마이그레이션
const old = JSON.parse(JSON.stringify(newGame({ now: 2, townName: '옛판' }))) as Record<string, unknown>;
old['schemaVersion'] = 6;
delete (old['world'] as Record<string, unknown>)['clearedEpisodes'];
const result = migrate(JSON.stringify(old));
if (!result.ok) throw new Error(`마이그레이션 실패: ${result.message}`);
if (result.state.schemaVersion !== SCHEMA_VERSION) throw new Error('판이 안 올라갔다');
if (result.state.world.clearedEpisodes.length !== 0) throw new Error('clearedEpisodes 가 안 생겼다');
console.log(`6판 → ${SCHEMA_VERSION}판 통과`);

console.log('에피소드 점검 통과');

// 5. 이미 오래 진행한 판 — 기사·사냥꾼·마법사만 있는 전설기 세이브
let old2: GameState = newGame({ now: 3, townName: '전설' });
old2 = { ...old2, world: { ...old2.world, turn: 120, eraIndex: 4 } };
for (const arc of ['knight', 'hunter', 'mage']) {
  const g = addCompanion(old2, 'quest', arc);
  if (g === null) throw new Error('초기 3인 배치 실패');
  old2 = g.state;
}
const first = openEpisodes(old2)[0];
if (first === undefined) throw new Error('전설기인데 갈 이야기가 없다');
const brings = archetypeFor(old2, first);
const grown2 = addCompanion(old2, 'episode', brings);
if (grown2 === null) throw new Error('합류 실패');
const arc2 = grown2.companion.archetypeId;
console.log(`전설기 · 3인 → "${first.title}" 이 데려오는 원형: ${arc2}`);
if (['knight', 'hunter', 'mage'].includes(arc2)) throw new Error('있는 원형이 또 왔다');

// 6. 첫 주에 첫 이야기가 열려야 한다 (turn 은 0 부터, 화면은 1주차)
const fresh: GameState = newGame({ now: 4, townName: '첫주' });
if (fresh.world.turn !== 0) throw new Error('시작 turn 이 0 이 아니다 — 주차 계산을 다시 봐야 한다');
const day1 = openEpisodes(fresh);
if (day1.length !== 1) throw new Error(`1주차에 열린 이야기가 ${day1.length}개다. 하나여야 한다`);
console.log(`1주차에 열린 이야기: ${day1[0]?.title}`);

// 사슬을 안 깨면 주차만으로는 열리지 않는다
const later = openEpisodes({ ...fresh, world: { ...fresh.world, turn: 99 } });
if (later.length !== 1) throw new Error('앞 이야기를 안 끝냈는데 뒤가 열렸다');

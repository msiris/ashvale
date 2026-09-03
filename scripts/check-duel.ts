/**
 * 마주섬 겨룸 점검.
 *
 *  1. 상성이 순환하는가 (버팀 → 밀어붙임 → 물러섬 → 버팀)
 *  2. 기색이 정답을 반드시 포함하는가 · 눈이 밝으면 하나로 짚이는가
 *  3. **기색대로 고르면 이기고, 늘 같은 것만 고르면 진다** —
 *     이게 안 되면 여전히 숫자돌리기다
 *  4. 상대의 자세가 같은 판에서 흔들리지 않는가
 *  5. 9판 세이브가 10판으로 올라오는가
 */

import { ALL_EPISODES } from '../src/data/episodes-index';
import { STANCES, type Stance } from '../src/data/content/duel-text';
import {
  DUEL_EDGE,
  DUEL_ROUNDS,
  duelSettled,
  duelWon,
  judge,
  readsClearly,
  startTrack,
  tellCandidates,
  theirStance,
} from '../src/systems/duel';
import { newGame } from '../src/systems/newGame';
import { migrate } from '../src/storage/migrate';
import { SCHEMA_VERSION } from '../src/data/save';
import type { GameState } from '../src/types/game';

// 1. 상성 순환
const CYCLE: [Stance, Stance][] = [
  ['hold', 'press'],
  ['press', 'yield'],
  ['yield', 'hold'],
];
for (const [win, lose] of CYCLE) {
  if (judge(win, lose) !== 'win') throw new Error(`${win} 이 ${lose} 를 못 이긴다`);
  if (judge(lose, win) !== 'lose') throw new Error(`${lose} 가 ${win} 에 안 진다`);
}
for (const s of STANCES) {
  if (judge(s, s) !== 'draw') throw new Error(`${s} 끼리 무승부가 아니다`);
}
console.log('  상성 순환 확인');

/** 겨룸 한 판을 끝까지 돌린다 */
function runDuel(
  state: GameState,
  episodeId: string,
  boss: NonNullable<ReturnType<typeof bossOf>>,
  choose: (candidates: Stance[], round: number) => Stance,
): boolean {
  let track = startTrack(state);
  let round = 0;
  while (!duelSettled(track, round)) {
    const candidates = tellCandidates(state, boss, episodeId, round);
    const theirs = theirStance(state, episodeId, round);
    if (!candidates.includes(theirs)) throw new Error(`${episodeId} ${round}판: 기색에 정답이 없다`);

    const mine = choose(candidates, round);
    const out = judge(mine, theirs);
    track += out === 'win' ? 1 : out === 'lose' ? -1 : 0;
    track = Math.max(-DUEL_EDGE, Math.min(DUEL_EDGE, track));
    round += 1;
  }
  return duelWon(track);
}

function bossOf(episodeId: string) {
  const e = ALL_EPISODES.find((x) => x.id === episodeId);
  return e?.stages[e.stages.length - 1]?.boss;
}

const base: GameState = newGame({ now: 1, townName: '점검' });

// 2 & 3. 읽고 고르면 이기고, 한 자세만 고집하면 진다
let readWins = 0;
let stubbornWins = 0;
let clearCount = 0;

for (const e of ALL_EPISODES) {
  const boss = bossOf(e.id);
  if (boss === undefined) throw new Error(`${e.id}: 마주설 것이 없다`);

  for (let turn = 1; turn <= 40; turn++) {
    // 눈이 아주 밝은 판 — 하나로 짚인다
    const sharp: GameState = {
      ...base,
      hero: { ...base.hero, stats: { might: 20, agility: 20, insight: 20, will: 20 } },
      world: { ...base.world, turn },
      episodeRun: { episodeId: e.id, stage: 4, favor: 8, seen: [], duel: null },
    };
    if (readsClearly(sharp, boss)) clearCount += 1;

    // 기색대로 고른다. 후보가 둘이면 앞의 것을 믿는다
    const read = runDuel(sharp, e.id, boss, (cands) => {
      const target = cands[0] ?? 'hold';
      // 그 자세를 이기는 자세를 고른다
      return (STANCES.find((s) => judge(s, target) === 'win') ?? 'hold') as Stance;
    });
    if (read) readWins += 1;

    // 늘 '버틴다' 만 고른다
    const dull: GameState = { ...sharp, episodeRun: { ...sharp.episodeRun!, favor: 0 } };
    if (runDuel(dull, e.id, boss, () => 'hold')) stubbornWins += 1;
  }
}

const total = ALL_EPISODES.length * 40;
console.log(`  기색 읽고 고름: ${readWins}/${total} 승`);
console.log(`  '버틴다' 만 반복: ${stubbornWins}/${total} 승`);
console.log(`  눈이 밝아 하나로 짚인 판: ${clearCount}/${total}`);

if (readWins <= stubbornWins) {
  throw new Error('읽어도 이득이 없다 — 고르는 일이 없는 것과 같다');
}
if (readWins < total * 0.9) throw new Error('제대로 읽었는데도 자주 진다');
if (stubbornWins > total * 0.7) throw new Error('한 자세만 고집해도 너무 잘 이긴다');

// 3b. 눈이 어두우면 후보가 둘이고, 반타작이어야 한다
let dimWins = 0;
let dimVague = 0;
const hardest = ALL_EPISODES.reduce((a, b) => {
  const da = bossOf(a.id)?.difficulty ?? 0;
  const db = bossOf(b.id)?.difficulty ?? 0;
  return db > da ? b : a;
});
const hardBoss = bossOf(hardest.id)!;
for (let turn = 1; turn <= 200; turn++) {
  const dim: GameState = {
    ...base,
    world: { ...base.world, turn },
    episodeRun: { episodeId: hardest.id, stage: 4, favor: 0, seen: [], duel: null },
  };
  if (!readsClearly(dim, hardBoss)) dimVague += 1;
  // 후보 중 첫 것을 정답이라 믿고 고른다
  if (
    runDuel(dim, hardest.id, hardBoss, (cands) => {
      const target = cands[0] ?? 'hold';
      return (STANCES.find((s) => judge(s, target) === 'win') ?? 'hold') as Stance;
    })
  ) {
    dimWins += 1;
  }
}
console.log(`  ${hardest.title} · 눈이 어두운 판 ${dimVague}/200 · 그때 승률 ${dimWins}/200`);
if (dimVague < 190) throw new Error('시작 능력치로도 가장 어려운 상대가 다 읽힌다');
if (dimWins > 160) throw new Error('둘 중 하나를 찍어도 너무 잘 이긴다');
if (dimWins < 20) throw new Error('눈이 어두우면 손쓸 데가 없다');

// 4. 같은 판에서 자세가 흔들리지 않는다
const fixed: GameState = { ...base, world: { ...base.world, turn: 7 } };
for (let round = 0; round < DUEL_ROUNDS; round++) {
  const a = theirStance(fixed, 'glass-bridge', round);
  for (let again = 0; again < 5; again++) {
    if (theirStance(fixed, 'glass-bridge', round) !== a) {
      throw new Error(`${round}판: 볼 때마다 자세가 바뀐다`);
    }
  }
}
console.log('  같은 판에서 자세가 고정된다');

// 5. 마이그레이션
const old = JSON.parse(JSON.stringify(newGame({ now: 2, townName: '옛판' }))) as Record<string, unknown>;
old['schemaVersion'] = 9;
old['episodeRun'] = { episodeId: 'glass-bridge', stage: 2, favor: 4, seen: ['approach'] };
const result = migrate(JSON.stringify(old));
if (!result.ok) throw new Error(`마이그레이션 실패: ${result.message}`);
if (result.state.schemaVersion !== SCHEMA_VERSION) throw new Error('판이 안 올라갔다');
if (result.state.episodeRun?.duel !== null) throw new Error('duel 이 null 로 안 생겼다');
if (result.state.episodeRun?.favor !== 4) throw new Error('걷던 중이던 결이 사라졌다');
console.log(`9판 → ${SCHEMA_VERSION}판 통과 (걷던 중이던 결 ${result.state.episodeRun?.favor} 유지)`);

console.log('마주섬 점검 통과');

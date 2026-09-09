/**
 * 마주섬 점검 — 체력을 두고 겨룬다.
 *
 *  1. 상성이 순환하는가 (버팀 → 밀어붙임 → 물러섬 → 버팀)
 *  2. 기색이 정답을 반드시 포함하는가 · 눈이 밝으면 하나로 짚이는가
 *  3. **기색대로 고르면 이기고, 늘 같은 것만 고르면 진다** —
 *     이게 안 되면 여전히 숫자돌리기다
 *  4. 때를 잡으면 더 깎고 덜 맞는가 · **때만으로는 못 이기는가**
 *  5. 겨룸이 너무 짧거나 길지 않은가
 *  6. 상대의 자세가 같은 판에서 흔들리지 않는가
 *  7. 11판 세이브가 12판으로 올라오는가
 */

import { ALL_EPISODES } from '../src/data/episodes-index';
import { STANCES, type Stance } from '../src/data/content/duel-text';
import {
  MAX_ROUNDS,
  blowFor,
  duelSettled,
  duelWon,
  judge,
  readsClearly,
  startDuel,
  tellCandidates,
  theirStance,
  type DuelState,
} from '../src/systems/duel';
import { foeOf } from '../src/data/content/region-foes';
import { REGIONS } from '../src/data/regions';
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

function bossOf(episodeId: string) {
  const e = ALL_EPISODES.find((x) => x.id === episodeId);
  return e?.stages[e.stages.length - 1]?.boss;
}

const base: GameState = newGame({ now: 1, townName: '점검' });

/** 겨룸 한 판을 끝까지 돌린다. 몇 판 걸렸는지도 돌려준다 */
function runDuel(
  state: GameState,
  episodeId: string,
  boss: NonNullable<ReturnType<typeof bossOf>>,
  choose: (candidates: Stance[], round: number) => Stance,
  timing: 'hit' | 'miss' = 'miss',
): { won: boolean; rounds: number } {
  let duel: DuelState = startDuel(state, boss);
  while (!duelSettled(duel)) {
    const candidates = tellCandidates(state, boss, episodeId, duel.round);
    const theirs = theirStance(state, episodeId, duel.round);
    if (!candidates.includes(theirs)) {
      throw new Error(`${episodeId} ${duel.round}판: 기색에 정답이 없다`);
    }

    const mine = choose(candidates, duel.round);
    const outcome = judge(mine, theirs);
    const blow = blowFor(state, boss, outcome, timing);
    duel = {
      ...duel,
      hp: Math.max(0, duel.hp - blow.toMe),
      foeHp: Math.max(0, duel.foeHp - blow.toFoe),
      round: duel.round + 1,
    };
  }
  return { won: duelWon(duel), rounds: duel.round };
}

/**
 * **제대로 읽은 사람** — 상대의 자세를 알고 그걸 이기는 자세를 고른다.
 *
 * 눈이 밝으면 기색이 하나로 짚이므로 이 상태가 된다.
 */
function readWell(state: GameState, episodeId: string) {
  return (_cands: Stance[], round: number): Stance => {
    const theirs = theirStance(state, episodeId, round);
    return (STANCES.find((x) => judge(x, theirs) === 'win') ?? 'hold') as Stance;
  };
}

/**
 * **찍은 사람** — 좁혀진 후보 중 앞의 것을 믿는다.
 * 눈이 어두우면 후보가 둘이라 절반은 틀린다.
 */
const guess = (cands: Stance[]): Stance => {
  const target = cands[0] ?? 'hold';
  return (STANCES.find((s) => judge(s, target) === 'win') ?? 'hold') as Stance;
};

// 2 & 3. 읽고 고르면 이기고, 한 자세만 고집하면 진다
let readWins = 0;
let stubbornWins = 0;
let clearCount = 0;
let roundSum = 0;
let roundMax = 0;

for (const e of ALL_EPISODES) {
  const boss = bossOf(e.id);
  if (boss === undefined) throw new Error(`${e.id}: 마주설 것이 없다`);

  for (let turn = 1; turn <= 40; turn++) {
    /**
     * 눈이 밝은 판은 **하나로 짚이는지만** 잰다.
     * 여기에 능력치 만렙을 주고 승률까지 재면 읽기의 값이 성장에 가려진다.
     */
    const sharp: GameState = {
      ...base,
      hero: { ...base.hero, stats: { might: 20, agility: 20, insight: 20, will: 20 } },
      world: { ...base.world, turn },
      episodeRun: { episodeId: e.id, stage: 4, favor: 8, seen: [], duel: null },
    };
    if (readsClearly(sharp, boss)) clearCount += 1;

    /**
     * 읽는 사람과 안 읽는 사람을 **같은 시작 능력치**로 세워 견준다.
     * 그래야 벌어지는 차이가 읽기에서 온 것이다.
     */
    const plain: GameState = {
      ...base,
      world: { ...base.world, turn },
      episodeRun: { episodeId: e.id, stage: 4, favor: 0, seen: [], duel: null },
    };

    const read = runDuel(plain, e.id, boss, readWell(plain, e.id));
    if (read.won) readWins += 1;
    roundSum += read.rounds;
    roundMax = Math.max(roundMax, read.rounds);

    if (runDuel(plain, e.id, boss, () => 'hold').won) stubbornWins += 1;
  }
}

const total = ALL_EPISODES.length * 40;
console.log(`  제대로 읽고 고름: ${readWins}/${total} 승`);
console.log(`  '버틴다' 만 반복: ${stubbornWins}/${total} 승`);
console.log(`  눈이 밝아 하나로 짚인 판: ${clearCount}/${total}`);

if (readWins <= stubbornWins) throw new Error('읽어도 이득이 없다 — 고르는 일이 없는 것과 같다');
if (readWins < total * 0.9) throw new Error('제대로 읽었는데도 자주 진다');
if (stubbornWins > total * 0.7) throw new Error('한 자세만 고집해도 너무 잘 이긴다');

// 3b. 눈이 어두우면 후보가 둘이고, 반타작이어야 한다
let dimWins = 0;
let dimVague = 0;
const hardest = ALL_EPISODES.reduce((a, b) =>
  (bossOf(b.id)?.difficulty ?? 0) > (bossOf(a.id)?.difficulty ?? 0) ? b : a,
);
const hardBoss = bossOf(hardest.id)!;
for (let turn = 1; turn <= 200; turn++) {
  const dim: GameState = {
    ...base,
    world: { ...base.world, turn },
    episodeRun: { episodeId: hardest.id, stage: 4, favor: 0, seen: [], duel: null },
  };
  if (!readsClearly(dim, hardBoss)) dimVague += 1;
  if (runDuel(dim, hardest.id, hardBoss, guess).won) dimWins += 1;
}
console.log(`  ${hardest.title} · 눈이 어두운 판 ${dimVague}/200 · 그때 승률 ${dimWins}/200`);
if (dimVague < 190) throw new Error('시작 능력치로도 가장 어려운 상대가 다 읽힌다');
if (dimWins > 175) throw new Error('둘 중 하나를 찍어도 너무 잘 이긴다');
if (dimWins < 20) throw new Error('눈이 어두우면 손쓸 데가 없다');

// 4. 때 — 크기만 바꾸고 방향은 안 바꾼다
const anyBoss = bossOf(ALL_EPISODES[0]!.id)!;
const hitBlow = blowFor(base, anyBoss, 'win', 'hit');
const missBlow = blowFor(base, anyBoss, 'win', 'miss');
if (hitBlow.toFoe <= missBlow.toFoe) throw new Error('때를 잡아도 더 깎지 못한다');
const guarded = blowFor(base, anyBoss, 'lose', 'hit');
const bare = blowFor(base, anyBoss, 'lose', 'miss');
if (guarded.toMe >= bare.toMe) throw new Error('맞을 때 때를 잡아도 덜 맞지 않는다');
console.log(
  `  때 · 더 깎음 ${missBlow.toFoe}→${hitBlow.toFoe} · 덜 맞음 ${bare.toMe}→${guarded.toMe}`,
);

/**
 * 때가 읽기를 대신하지는 못한다.
 *
 * 일부러 지는 자세를 내고 때만 잡는다. 덜 맞을 뿐 계속 맞으므로
 * **거의 못 이겨야 한다.** 여기가 무너지면 기색을 읽을 이유가 없어진다.
 */
let timedOnly = 0;
for (const e of ALL_EPISODES) {
  const boss = bossOf(e.id);
  if (boss === undefined) continue;
  for (let turn = 1; turn <= 40; turn++) {
    const s2: GameState = {
      ...base,
      world: { ...base.world, turn },
      episodeRun: { episodeId: e.id, stage: 4, favor: 0, seen: [], duel: null },
    };
    // 일부러 지는 자세를 고르고, 때는 늘 잡는다
    const worst = (_cands: Stance[], round: number): Stance => {
      const theirs = theirStance(s2, e.id, round);
      return (STANCES.find((x) => judge(x, theirs) === 'lose') ?? 'hold') as Stance;
    };
    if (runDuel(s2, e.id, boss, worst, 'hit').won) timedOnly += 1;
  }
}
console.log(`  못 읽고 때만 잡음: ${timedOnly}/${total} 승`);
if (timedOnly > total * 0.25) {
  throw new Error(`때만 잡아도 ${timedOnly}/${total} 이긴다 — 읽는 일이 값을 잃는다`);
}

// 5. 길이
const avg = roundSum / total;
console.log(`  잘 읽었을 때 걸린 판: 평균 ${avg.toFixed(1)} · 최대 ${roundMax}`);
if (avg < 2.5) throw new Error('두어 번에 끝난다 — 읽을 기회가 없다');
if (roundMax >= MAX_ROUNDS) throw new Error('제대로 읽었는데도 판 수 상한까지 간다');

// 5b. 지역에도 마주설 것이 있고, 그 지역 난도를 따라가는가
const REGIONS_IDS = ['whisper', 'gate', 'marsh', 'peaks', 'deep', 'rift'];
for (const id of REGIONS_IDS) {
  const foe = foeOf(id);
  if (foe === null) throw new Error(`${id}: 마주설 것이 없다`);
  const region = REGIONS.find((r) => r.id === id);
  if (region === undefined) throw new Error(`${id}: 지역이 없다`);
  if (foe.difficulty !== region.difficulty) {
    throw new Error(`${id}: 마주섬 난도 ${foe.difficulty} 가 지역 난도 ${region.difficulty} 와 다르다`);
  }
  if (foe.spoils.xp <= 0 || foe.spoils.gold <= 0) throw new Error(`${id}: 이겨도 받는 게 없다`);
}
console.log(`  지역 마주섬 ${REGIONS_IDS.length}곳 · 난도가 지역과 맞는다`);

/** 지역 마주섬도 읽으면 이기고 안 읽으면 진다 */
let regionRead = 0;
let regionDull = 0;
for (const id of REGIONS_IDS) {
  const foe = foeOf(id)!;
  for (let turn = 1; turn <= 40; turn++) {
    const st: GameState = { ...base, world: { ...base.world, turn }, episodeRun: null };
    if (runDuel(st, id, foe, readWell(st, id)).won) regionRead += 1;
    if (runDuel(st, id, foe, () => 'hold').won) regionDull += 1;
  }
}
const rTotal = REGIONS_IDS.length * 40;
console.log(`  지역 · 제대로 읽음 ${regionRead}/${rTotal} · '버틴다' 만 ${regionDull}/${rTotal}`);
if (regionRead < rTotal * 0.85) throw new Error('지역에서 제대로 읽었는데도 자주 진다');
if (regionDull >= regionRead) throw new Error('지역에서 읽어도 이득이 없다');

// 6. 같은 판에서 자세가 흔들리지 않는다
const fixed: GameState = { ...base, world: { ...base.world, turn: 7 } };
for (let round = 0; round < 4; round++) {
  const a = theirStance(fixed, 'red-hood', round);
  for (let again = 0; again < 5; again++) {
    if (theirStance(fixed, 'red-hood', round) !== a) {
      throw new Error(`${round}판: 볼 때마다 자세가 바뀐다`);
    }
  }
}
console.log('  같은 판에서 자세가 고정된다');

// 7. 마이그레이션
const old = JSON.parse(
  JSON.stringify(newGame({ now: 2, townName: '옛판' })),
) as Record<string, unknown>;
old['schemaVersion'] = 11;
old['episodeRun'] = {
  episodeId: 'red-hood',
  stage: 2,
  favor: 4,
  seen: ['errand'],
  duel: { track: 1, round: 1, retried: false },
};
const result = migrate(JSON.stringify(old));
if (!result.ok) throw new Error(`마이그레이션 실패: ${result.message}`);
if (result.state.schemaVersion !== SCHEMA_VERSION) throw new Error('판이 안 올라갔다');
if (result.state.episodeRun?.duel !== null) throw new Error('옛 저울이 안 비워졌다');
if (result.state.episodeRun?.favor !== 4) throw new Error('걷던 중이던 결이 사라졌다');
console.log(`11판 → ${SCHEMA_VERSION}판 통과 (걷던 중이던 결 ${result.state.episodeRun?.favor} 유지)`);

console.log('마주섬 점검 통과');

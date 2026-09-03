/**
 * schemaVersion 마이그레이션 체인 (§14).
 *
 * 한 단계씩 올린다: n -> n+1. 건너뛰는 단계를 만들지 않는다.
 * **실패하면 덮어쓰지 않는다.** 원본 문자열을 그대로 돌려주고, 부르는 쪽이
 * 백업 키로 옮긴 다음 오류를 표시한다.
 *
 * 지금은 판이 1 하나뿐이라 체인이 비어 있다. 모양을 바꿀 때
 *   1. src/data/save.ts 의 SCHEMA_VERSION 을 올리고
 *   2. 아래 MIGRATIONS 에 이전 판 번호를 키로 한 단계를 추가한다
 */

import type { GameState } from '@/types/game';
import { SCHEMA_VERSION } from '@/data/save';

/** 한 판을 다음 판으로. 입력을 제자리에서 고치지 말고 새 객체를 돌려준다 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** 키 = 출발 판 번호. MIGRATIONS[1] 은 1판을 2판으로 만든다 */
const MIGRATIONS: Record<number, Migration> = {
  /** 1 -> 2: counters.famineWeeks 추가 (§13 붕괴 판정) */
  1: (raw) => {
    const counters = isRecord(raw['counters']) ? raw['counters'] : {};
    return {
      ...raw,
      schemaVersion: 2,
      counters: { ...counters, famineWeeks: 0 },
    };
  },

  /** 2 -> 3: hero.restUntilTurn 추가 (§11 쓰러진 뒤 2주) */
  2: (raw) => {
    const hero = isRecord(raw['hero']) ? raw['hero'] : {};
    return { ...raw, schemaVersion: 3, hero: { ...hero, restUntilTurn: 0 } };
  },

  /** 3 -> 4: 새로고침으로 되감기던 두 값을 세이브로 옮긴다 */
  3: (raw) => {
    const world = isRecord(raw['world']) ? raw['world'] : {};
    const counters = isRecord(raw['counters']) ? raw['counters'] : {};
    return {
      ...raw,
      schemaVersion: 4,
      world: { ...world, clearedNodes: [] },
      counters: { ...counters, tradedThisWeek: 0 },
    };
  },

  /** 4 -> 5: CompanionRecord.pickedSlot 추가. 기본은 0번(기본 초상) */
  4: (raw) => {
    const companions = isRecord(raw['companions']) ? raw['companions'] : {};
    const moved: Record<string, unknown> = {};
    for (const [id, who] of Object.entries(companions)) {
      moved[id] = isRecord(who) ? { ...who, pickedSlot: 0 } : who;
    }
    return { ...raw, schemaVersion: 5, companions: moved };
  },

  /** 5 -> 6: PatronRecord.lastQuestTurn 추가. 아직 마친 적 없으면 -1 */
  5: (raw) => {
    const patrons = isRecord(raw['patrons']) ? raw['patrons'] : {};
    const moved: Record<string, unknown> = {};
    for (const [id, who] of Object.entries(patrons)) {
      moved[id] = isRecord(who) ? { lastQuestTurn: -1, ...who } : who;
    }
    return { ...raw, schemaVersion: 6, patrons: moved };
  },

  /** 6 -> 7: WorldState.clearedEpisodes 추가. 아직 아무것도 안 끝냈다 */
  6: (raw) => {
    const world = isRecord(raw['world']) ? raw['world'] : {};
    return { ...raw, schemaVersion: 7, world: { ...world, clearedEpisodes: [] } };
  },

  /**
   * 7 -> 8: episodeRun 추가.
   *
   * 에피소드가 글상자에서 걸어 다니는 판으로 바뀌었다. 판 중간에 있던
   * 세이브는 없으므로 null 로 둔다. 끝낸 표(clearedEpisodes)는 그대로 산다.
   */
  7: (raw) => ({ ...raw, schemaVersion: 8, episodeRun: null }),

  /** 8 -> 9: world.factionHolds 추가. 아직 어느 세력과도 사이가 정해지지 않았다 */
  8: (raw) => {
    const world = isRecord(raw['world']) ? raw['world'] : {};
    return { ...raw, schemaVersion: 9, world: { ...world, factionHolds: {} } };
  },

  /**
   * 9 -> 10: episodeRun.duel 추가.
   *
   * 마주섬이 주사위 한 번에서 세 판 겨룸으로 바뀌었다. 걷던 중이었으면
   * 겨룸에는 아직 안 들어선 것이므로 null 로 둔다.
   */
  9: (raw) => {
    const run = isRecord(raw['episodeRun']) ? { ...raw['episodeRun'], duel: null } : null;
    return { ...raw, schemaVersion: 10, episodeRun: run };
  },
};

export type MigrateResult =
  | { ok: true; state: GameState; from: number }
  | { ok: false; failure: 'corrupt' | 'future' | 'no-path' | 'threw'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 마이그레이션 뒤 최소 형태 검사.
 * 전부를 검증하지는 않는다 — 불러오기가 통째로 막히는 쪽이 더 나쁘다.
 * 없으면 게임이 곧장 깨지는 뼈대만 본다.
 */
function looksLikeGameState(raw: Record<string, unknown>): boolean {
  return (
    raw['schemaVersion'] === SCHEMA_VERSION &&
    typeof raw['createdAt'] === 'number' &&
    isRecord(raw['hero']) &&
    isRecord(raw['town']) &&
    isRecord(raw['resources']) &&
    isRecord(raw['world']) &&
    isRecord(raw['companions']) &&
    isRecord(raw['patrons']) &&
    Array.isArray(raw['chronicle'])
  );
}

export function migrate(text: string): MigrateResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      failure: 'corrupt',
      message: '세이브를 읽을 수 없는 형식이다. 꾸러미가 있으면 그것으로 불러와라.',
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      failure: 'corrupt',
      message: '세이브의 모양이 어긋났다. 꾸러미가 있으면 그것으로 불러와라.',
    };
  }

  const rawVersion = parsed['schemaVersion'];
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 1) {
    return {
      ok: false,
      failure: 'corrupt',
      message: '세이브의 판 번호가 없다. 꾸러미가 있으면 그것으로 불러와라.',
    };
  }

  if (rawVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      failure: 'future',
      message:
        '더 새로운 판에서 만든 세이브다. 앱을 최신으로 갱신한 뒤 다시 열어라.',
    };
  }

  let current = parsed;
  let version = rawVersion;

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (step === undefined) {
      return {
        ok: false,
        failure: 'no-path',
        message: `${version}판에서 ${SCHEMA_VERSION}판으로 올리는 길이 없다. 꾸러미로 불러와라.`,
      };
    }
    try {
      current = step(current);
    } catch {
      return {
        ok: false,
        failure: 'threw',
        message: `${version}판을 올리는 도중 실패했다. 원본은 백업 키에 남겼다.`,
      };
    }
    version += 1;
  }

  if (!looksLikeGameState(current)) {
    return {
      ok: false,
      failure: 'corrupt',
      message: '세이브에 빠진 항목이 있다. 꾸러미가 있으면 그것으로 불러와라.',
    };
  }

  return { ok: true, state: current as unknown as GameState, from: rawVersion };
}

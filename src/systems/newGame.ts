/**
 * 새 게임 — 순수 함수. 여기서 부작용을 일으키지 않는다.
 * 저장은 부르는 쪽이 한다.
 */

import type { GameState, Ledger } from '@/types/game';
import { SCHEMA_VERSION, LEDGER_VERSION } from '@/data/save';
import { getArchetype } from '@/data/archetypes';
import {
  DEFAULT_TOWN_NAME,
  DEFAULT_HERO_NAME,
  START_BUILDINGS,
  START_COMPANIONS,
  START_HERO,
  START_STATS,
  START_RESOURCES,
  START_FACTIONS,
  START_WORLD,
  START_UNLOCKED_REGIONS,
  START_HERO_TILE,
} from '@/data/start';

export interface NewGameInput {
  /** 지금 시각. 부르는 쪽이 넣는다 — 순수 함수 안에서 Date.now()를 부르지 않는다 */
  now: number;
  heroName?: string;
  townName?: string;
}

export function newGame(input: NewGameInput): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: input.now,

    hero: {
      name: input.heroName ?? DEFAULT_HERO_NAME,
      level: START_HERO.level,
      xp: START_HERO.xp,
      hp: START_HERO.hp,
      maxHp: START_HERO.maxHp,
      stats: { ...START_STATS },
      statPoints: START_HERO.statPoints,
      skillPoints: START_HERO.skillPoints,
      skills: {},
      relics: [],
      restUntilTurn: 0,
    },

    town: {
      name: input.townName ?? DEFAULT_TOWN_NAME,
      buildings: { ...START_BUILDINGS },
    },

    resources: { ...START_RESOURCES },

    world: {
      year: START_WORLD.year,
      week: START_WORLD.week,
      turn: START_WORLD.turn,
      eraIndex: START_WORLD.eraIndex,
      eraTier: START_WORLD.eraTier,
      unlockedRegions: [...START_UNLOCKED_REGIONS],
      currentMap: START_WORLD.currentMap,
      heroTile: { ...START_HERO_TILE },
      clearedNodes: [],
      steppedTiles: [],
      clearedEpisodes: [],
      factionHolds: {},
    },

    companions: Object.fromEntries(
      START_COMPANIONS.map((seed) => [
        seed.id,
        {
          id: seed.id,
          archetypeId: seed.archetypeId,
          // 이름은 플레이어가 붙인다 (§7.1)
          name: '',
          affinity: 0,
          track: null,
          confessed: 'none',
          clearedEvents: [],
          lastApproachTurn: 0,
          injuredUntilTurn: 0,
          images: {},
          // 여섯 자리 중 어느 것을 보일지. 기본은 기본 초상
          pickedSlot: 0,
          unlockedSlots: [0],
          homeRegion: getArchetype(seed.archetypeId)?.homeRegion ?? '',
          origin: 'preset' as const,
          joinedTurn: 0,
          departedTurn: null,
        },
      ]),
    ),
    patrons: {},
    factions: { ...START_FACTIONS },

    escort: null,
    episodeRun: null,
    pendingApproach: [],

    chronicle: [],
    counters: {
      expeditions: 0,
      buildsMade: 0,
      collapses: 0,
      confessions: 0,
      firsts: {},
      famineWeeks: 0,
      tradedThisWeek: 0,
    },
  };
}

/** 원장 초기값. 세이브를 지워도 이건 남는다 (§14) */
export function newLedger(): Ledger {
  return {
    ledgerVersion: LEDGER_VERSION,
    maxTurnReached: 0,
    collapses: 0,
    lastCollapseTurn: null,
  };
}

/**
 * 세이브가 만들어내는 난수 흐름의 시드.
 * GameState에 시드 필드를 따로 두지 않는다(§4가 정한 모양을 늘리지 않는다).
 * createdAt이 세이브마다 다르므로 이것으로 충분하고, 같은 세이브에서는 항상 같다.
 */
export function seedOf(state: GameState): number {
  return state.createdAt;
}

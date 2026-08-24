/**
 * 저장 관련 상수 — 기획서 §14.
 * 키 문자열과 판 번호를 코드에 박지 않는다.
 */

/**
 * 현재 상태 스키마 판. 모양이 바뀌면 올리고 마이그레이션을 한 단계 추가한다.
 *
 * 2 — counters.famineWeeks 추가. 붕괴 판정(§13)이 "식량 0 미만 4주 연속"을
 *     세는데 담을 자리가 없었다.
 * 3 — hero.restUntilTurn 추가. 쓰러진 뒤 2주 탐사 불가(§11)를 담을 자리.
 * 4 — world.clearedNodes / counters.tradedThisWeek 추가. 둘 다 세션에만 있어서
 *     새로고침으로 되감을 수 있었다 — 표식 무한 채집과 거래 한도 우회.
 * 5 — CompanionRecord.pickedSlot 추가. 여섯 슬롯 중 어느 것을 보일지
 *     플레이어가 고른다. 해금 사다리가 구현된 적이 없어 0번만 보였다.
 * 6 — PatronRecord.lastQuestTurn 추가. 의뢰를 몇 주 뒤에 다시 받을 수 있게
 *     하려면 마지막으로 마친 주차가 필요하다.
 */
export const SCHEMA_VERSION = 6 as const;

/** 원장 스키마 판. 세이브와 따로 움직인다 */
export const LEDGER_VERSION = 1 as const;

/** 연대기 보관 개수 (§4) */
export const CHRONICLE_MAX = 200;

/** 저장 키. 전부 이 접두를 쓴다 */
export const KEY_PREFIX = 'ashvale';

export const KEYS = {
  /** 상태 — localStorage */
  save: `${KEY_PREFIX}:save`,
  /** 원장 — 세이브와 **별도 키**. 세이브를 지워도 남는다 (§14) */
  ledger: `${KEY_PREFIX}:ledger`,
  /** 마이그레이션 실패 시 원본을 옮겨 두는 자리의 접두 */
  backupPrefix: `${KEY_PREFIX}:backup`,
} as const;

/** 이미지 IndexedDB — 실제 접근은 StorageAdapter 뒤에서만 (§14) */
export const IMAGE_DB = {
  name: `${KEY_PREFIX}-images`,
  version: 1,
  store: 'images',
} as const;

/** 자동 저장 시점 (§14). 주 종료·건설·관계 변화·맵 전환 */
export type SaveReason = 'turn-end' | 'build' | 'relationship' | 'map-change' | 'manual';

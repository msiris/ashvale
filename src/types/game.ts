/**
 * 게임 상태 모델 — 기획서 §4 그대로.
 *
 * 여기 있는 모양을 임의로 늘리지 않는다. 필드를 추가해야 할 이유가 생기면
 * 기획서를 먼저 고친다.
 *
 * 시각 상태는 저장하지 않는다 (§4 구현 지침). 맵 렌더 상태·NPC 스프라이트 위치는
 * 전부 이 상태에서 파생한다. 예외는 `world.heroTile` 하나 —
 * 어디에 서 있는지는 세이브의 일부다.
 */

export type ResourceId = 'wood' | 'stone' | 'food' | 'gold';
export type StatId = 'might' | 'agility' | 'insight' | 'will';
export type FactionId = 'guild' | 'oath' | 'grove' | 'tower';
export type Dir = 'up' | 'down' | 'left' | 'right';

/** 관계 트랙 (§7). null 이면 아직 갈리지 않았다 */
export type Track = null | 'bond' | 'romance';

/** 고백 상태 (§7.4). 고백은 인물이 한다 — 플레이어가 거는 쪽이 아니다 */
export type ConfessState = 'none' | 'pending' | 'accepted' | 'declined';

/** 인물이 명단에 들어온 경로 (§7.1) */
export type CompanionOrigin = 'preset' | 'quest' | 'drifter' | 'referral' | 'episode';

/**
 * 연대기 한 줄 (§4, §15).
 * 무주어 문어체 과거형으로 쓴다. 2인칭 금지.
 * M0에서는 담을 그릇만 둔다. 분류·서식은 연대기 시스템에서 확장한다.
 */
export interface ChronicleEntry {
  id: string;
  turn: number;
  text: string;
}

export interface CompanionRecord {
  id: string;
  archetypeId: string;
  name: string;
  /** 0..100 */
  affinity: number;
  track: Track;
  confessed: ConfessState;
  clearedEvents: string[];
  lastApproachTurn: number;
  injuredUntilTurn: number;
  /** slot -> IndexedDB 키. 이미지 자체가 아니라 **참조만** 넣는다 */
  images: Record<number, string | null>;
  /**
   * 화면에 쓸 슬롯. 플레이어가 고른다.
   *
   * **§4 에 없던 칸이다.** §8.2 의 해금 사다리는 구현된 적이 없다 —
   * `unlockedSlots` 는 [0] 으로 시작하고 이를 늘리는 곳은 고백 수락 때
   * 4번을 더하는 자리 하나뿐인데, 4번을 요청하는 대사가 없다. 그래서
   * 여섯 자리 중 0번만 평생 보였다. 사다리를 짜 맞추는 대신 **고르게** 한다.
   */
  pickedSlot: number;
  /**
   * 열린 슬롯 (§8.2).
   *
   * 지금은 아무것도 잠그지 않는다 — 여섯 자리를 다 채울 수 있다.
   * 값은 옛 세이브와의 호환을 위해 남겨 둔다.
   */
  unlockedSlots: number[];
  homeRegion: string;
  origin: CompanionOrigin;
  joinedTurn: number;
  departedTurn: number | null;
}

export interface PatronRecord {
  id: string;
  met: boolean;
  /** 0..60 */
  trust: number;
  questsCleared: string[];
  activeQuestId: string | null;
  /**
   * 마지막으로 의뢰를 마친 주차. 아직 없으면 -1 (§7.6).
   *
   * **§4 에 없던 칸이다.** 의뢰인마다 고유 의뢰가 하나뿐이라 그걸 마치면
   * 그 사람은 영영 할 말이 없어졌다. 몇 주 지나면 다시 부탁할 수 있게
   * 하려면 마지막이 언제였는지 알아야 한다. 세션에만 두면 새로고침으로
   * 간격을 건너뛴다.
   */
  lastQuestTurn: number;
}

export interface HeroState {
  name: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  stats: Record<StatId, number>;
  statPoints: number;
  skillPoints: number;
  skills: Record<string, number>;
  relics: string[];
  /**
   * 이 주차까지는 지역에 나갈 수 없다 (§11 — HP 0 이면 2주 탐사 불가).
   *
   * §4 에 없던 칸이다. 쓰러져도 금화만 조금 잃고 바로 다시 나갈 수 있으면
   * 탐사에 위험이 없다. CompanionRecord.injuredUntilTurn 과 같은 결로 둔다.
   */
  restUntilTurn: number;
}

export interface TownState {
  name: string;
  /** buildingId -> level (0 = 미건설) */
  buildings: Record<string, number>;
}

export interface WorldState {
  year: number;
  week: number;
  turn: number;
  eraIndex: number;
  eraTier: number;
  unlockedRegions: string[];
  /** 'town' | 'region:whisper' | 'indoor:hall' ... */
  currentMap: string;
  heroTile: { x: number; y: number; dir: Dir };
  /**
   * 이번 지역행에서 이미 치운 표식 (§11).
   *
   * **§4 에 없던 칸이다.** 세션에만 두면 지역 안에서 새로고침하는 것만으로
   * 표식이 전부 되살아나 전리품을 무한히 캘 수 있다. 그러면 기력도 위험도
   * 아무 의미가 없다. 지역에 들어가거나 마을로 돌아올 때 비운다.
   */
  clearedNodes: string[];
  /**
   * 이 판에서 밟은 칸 (§11 곁가지 — 판 규칙).
   *
   * 유리 다리는 두 번 밟은 자리가 깨지고, 걸어 다니는 길은 지나온 자리가
   * 사라진다. **세션에만 두면 새로고침으로 발판이 되살아난다** —
   * 되짚어 갈 수 없다는 규칙이 규칙이 아니게 된다.
   *
   * 걸음 순서대로 쌓는다. 갈라진 틈이 열닫히는 주기도 이 길이로 센다.
   * 판에 들어서거나 마을로 돌아올 때 비운다.
   */
  steppedTiles: string[];
  /**
   * 끝낸 동화 에피소드 (§11 곁가지).
   *
   * **§4 에 없던 칸이다.** 세션에만 두면 새로고침으로 같은 이야기를
   * 몇 번이고 다시 하며 동료를 계속 뽑을 수 있다. 명단 상한(§7.1)이
   * 있어도 자원과 세력은 그대로 새 나간다.
   *
   * 결이 모자라 빈손으로 돌아온 것은 여기 들어오지 않는다 — 다시 갈 수 있다.
   */
  clearedEpisodes: string[];
  /**
   * 이야기를 끝낸 세력과 그때 고른 갈래 (§7).
   *
   * 여기 있으면 그쪽 마을에 갈 수 있고, 몇 주에 한 번 조공이 온다.
   * **끝낸 표(clearedEpisodes)와 따로 둔다** — 끝낸 것만으로는
   * 도왔는지 복속시켰는지를 알 수 없다.
   */
  factionHolds: Partial<Record<FactionId, 'helped' | 'ruled'>>;
}

export interface Counters {
  expeditions: number;
  buildsMade: number;
  collapses: number;
  confessions: number;
  firsts: Record<string, boolean>;
  /**
   * 식량이 마이너스인 채로 이어진 주 수 (§13 붕괴 조건).
   *
   * **§4 에 없던 칸이다.** 붕괴는 "식량 0 미만 4주 연속"으로 판정하는데
   * 이걸 담을 자리가 없었다. 세션에만 두면 새로고침으로 붕괴를 피할 수 있고,
   * 그건 원장(§14)이 막으려는 바로 그 행동이다. 그래서 판을 2로 올렸다.
   */
  famineWeeks: number;
  /**
   * 이번 주에 이미 오간 거래액 (§9 주간 한도).
   *
   * **§4 에 없던 칸이다.** famineWeeks 와 같은 이유 — 세션에만 두면
   * 새로고침 한 번으로 한도가 풀린다.
   */
  tradedThisWeek: number;
}

export interface GameState {
  schemaVersion: 11;
  createdAt: number;

  hero: HeroState;
  town: TownState;
  resources: Record<ResourceId, number>;
  world: WorldState;

  companions: Record<string, CompanionRecord>;
  patrons: Record<string, PatronRecord>;
  /** -100..100 */
  factions: Record<FactionId, number>;

  /** 동행 중인 관계 대상 id (§11 동행) */
  escort: string | null;
  /**
   * 지금 걸어 들어가 있는 에피소드 (§11 곁가지).
   *
   * **세션에 둘 수 없다.** 판 다섯을 걸어 지나는 동안 새로고침 한 번이면
   * 어느 판에 있었는지도, 쌓은 결도 사라진다. 지도 밖으로 나오면 비운다.
   */
  episodeRun: {
    episodeId: string;
    /** 몇 번째 판인가. 0부터 */
    stage: number;
    /** 오는 길에 쌓인 결. 마지막 판정에 더해진다 */
    favor: number;
    /** 이야기를 본 판들 */
    seen: string[];
    /**
     * 마지막 판의 겨룸 (§11 곁가지).
     *
     * **세션에 둘 수 없다.** 저울이 밀린 채로 새로고침하면 처음부터
     * 다시 겨루게 되어, 불리해질 때마다 새로 고치면 된다.
     * 겨룸에 들어서지 않았으면 null 이다.
     */
    duel: { track: number; round: number; retried: boolean } | null;
  } | null;
  /** 말을 걸어오려고 대기 중인 인물 (§7.3 다가옴 구조) */
  pendingApproach: string[];

  /** 최근 CHRONICLE_MAX개 */
  chronicle: ChronicleEntry[];
  counters: Counters;
}

/**
 * 원장 — 세이브와 **별도 키**다 (§14).
 * 불러오기가 값을 낮추지 못한다. 붕괴 이전 세이브를 불러와도 붕괴는 되돌아오지 않는다.
 */
export interface Ledger {
  ledgerVersion: 1;
  maxTurnReached: number;
  collapses: number;
  lastCollapseTurn: number | null;
}

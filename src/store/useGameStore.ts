/**
 * 상태 보관과 액션.
 *
 * 규칙 계산은 여기서 하지 않는다 — systems/ 의 순수 함수를 부르고 결과를 담기만 한다.
 * 입력은 Phaser -> 콜백 -> 여기 액션 순서로만 흐른다.
 */

import { create } from 'zustand';
import type { Dir, FactionId, GameState, Ledger, ResourceId, StatId } from '@/types/game';
import type { DialogueScript, DialogueState } from '@/types/dialogue';
import type { SaveReason } from '@/data/save';
import { newGame, newLedger, seedOf } from '@/systems/newGame';
import { build, blockMessage } from '@/systems/construction';
import { endWeek } from '@/systems/week';
import { appendEntries, makeEntry } from '@/systems/chronicle';
import { createRng } from '@/systems/rng';
import { getBuilding } from '@/data/buildings';
import { CHRONICLE_TEXT } from '@/data/chronicle';
import { DOWNED, getRegion, regionIdFromMap, regionMapId, regionName } from '@/data/regions';
import { REGION_ENTRY } from '@/data/maps/region';
import { INDOOR_ENTRY, buildingIdFromIndoor, indoorMapId } from '@/data/maps/indoor';
import { REGION_TEXT } from '@/data/content/region-text';
import { START_HERO_TILE } from '@/data/start';
import { resolveExplore, rollExplore, type ExploreOutcome } from '@/systems/explore';
import { isBlocked, loadMap } from '@/systems/map';
import { rescueTile } from '@/systems/movement';
import { escortOf } from '@/systems/escort';
import {
  gainXp,
  makeOffering,
  raiseSkill,
  raiseStat,
  type LevelUp,
} from '@/systems/progression';
import type { RoomId } from '@/types/map';
import { OFFERING_DONE, OFFERING_POOR } from '@/data/content/room-text';
import { getRelic, rollRelic } from '@/systems/relics';
import { applyToken } from '@/systems/korean';
import {
  AFFINITY,
  APPROACH_IGNORE_LIMIT,
  ESCORT_INJURY,
  ESCORT_MIN_AFFINITY,
  FACTION_LABEL,
  OUTING_AFFINITY,
  TRUST,
  TRUST_MAX,
} from '@/data/relationships';
import { shiftFaction } from '@/systems/factions';
import { buildConfessionScript, buildEventScript } from '@/systems/dialogue';
import { answerConfession, shouldConfess } from '@/systems/confession';
import { addCompanion, residentsOf, townFolk } from '@/systems/roster';
import { buildSceneScripts, nextFieldScene, nextRomanceScene } from '@/systems/scenes';
import { buildRivalScript, rivalDeltas } from '@/systems/rivals';
import { RIVAL_AFFINITY } from '@/data/content/rival-events';
import type { RivalPick } from '@/systems/rivals';
import { getQuest, REPEAT_PREFIX } from '@/data/quests';
import type { RegionEvent } from '@/data/content/region-events';
import { applyRegionChoice, fillEventText, pickRegionEvent } from '@/systems/regionEvents';
import {
  applyEpisodeChoice,
  archetypeFor,
  currentStage,
  episodeById,
  fillEpisodeText,
  isLastStage,
} from '@/systems/episodes';
import {
  DUEL_EDGE,
  RETRY_FAVOR,
  duelSettled,
  duelWon,
  judge,
  startTrack,
  theirStance,
  type RoundOutcome,
} from '@/systems/duel';
import type { Stance } from '@/data/content/duel-text';
import {
  RETRY_TEXT,
  ROUND_DRAW,
  ROUND_LOSE,
  ROUND_WIN,
  TRACK_TEXT,
} from '@/data/content/duel-text';
import { EPISODE_ENTRY, episodeMapId } from '@/data/maps/episode';
import { FACTION_ENTRY, factionMapId, parseFactionMap } from '@/data/maps/faction';
import { envoyScript } from '@/systems/factionVillage';
import { HOLD_LABEL, HOLD_REPUTATION } from '@/data/faction-holds';
import { outingOf } from '@/systems/outing';
import {
  GAME_INVITE,
  GAME_LOSE,
  GAME_WIN,
  OUTING_INTRO,
} from '@/data/content/outing-events';
import {
  buyCost,
  getGift,
  giftAffinity,
  giftReaction,
  giftReady,
  sellValue,
  weeklyLimit,
} from '@/systems/market';
import { josa } from '@/systems/korean';
import { COLLAPSE_TEXT, RELIC_SALE_FOOD } from '@/data/collapse';
import { AUDIO_KEY } from '@/data/audio';
import { play, setAudioEnabled } from '@/audio/sfx';

const RESOURCE_NAME: Record<ResourceId, string> = {
  wood: '목재',
  stone: '석재',
  food: '식량',
  gold: '금화',
};
import {
  displayName,
  isHomeRegion,
  nextApproach,
  pendingTier,
  withAffinity,
} from '@/systems/relationships';
import { encodeForSlot } from '@/systems/imagePipeline';
import { imageKey, SCENE_SLOT, SLOT_COUNT } from '@/data/images';
import {
  exportBundle as buildBundle,
  importBundle as restoreBundle,
} from '@/storage/bundle';

/**
 * 사건이 끝난 뒤 걸 그림의 자리.
 *
 * 사건 삽화(슬롯 3)가 채워져 있으면 그것. 없으면 평소 쓰는 자리를 뺀
 * 나머지 중 채워진 첫 자리. 그것도 없으면 null — 바꿀 것이 없다.
 */
function revealFor(who: { images: Record<number, string | null>; pickedSlot: number } | undefined): number | null {
  if (who === undefined) return null;
  const filled = (slot: number) => {
    const key = who.images[slot];
    return key !== null && key !== undefined && key !== '';
  };
  if (filled(SCENE_SLOT) && who.pickedSlot !== SCENE_SLOT) return SCENE_SLOT;
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (slot !== who.pickedSlot && filled(slot)) return slot;
  }
  return null;
}

/** 지역 사건에서 고르고 난 뒤 화면에 남는 것 */
export interface RegionEventView {
  result: string;
  notes: string[];
  xp: number;
  levelUp: LevelUp | null;
  relicName: string | null;
  relicFound: string | null;
}

/** 판정 연출이 보여 줄 것 */
export interface ExploreView {
  regionId: string;
  outcome: ExploreOutcome;
  narration: string;
  levelUp: LevelUp | null;
  relicName: string | null;
  relicFound: string | null;
}
import { getStorage, loadGame, saveAll, saveLedger, StorageError } from '@/storage';
import { mergeLedger } from '@/systems/ledger';

export type BootStatus = 'booting' | 'empty' | 'ready' | 'failed';

interface GameStore {
  status: BootStatus;
  state: GameState | null;
  ledger: Ledger;
  /** 세이브를 쓸 수 없을 때 사람이 읽을 이유. 무엇을 하면 되는지 담는다 */
  error: string | null;
  /** 마이그레이션이 실패해 원본을 옮겨 둔 자리 */
  backupKey: string | null;
  /** 이전 판에서 올라온 세이브면 그 판 번호 */
  migratedFrom: number | null;
  /** navigator.storage.persist() 승인 여부 */
  persisted: boolean;
  /** 효과음. 세이브와 별개 키에 둔다 — 판을 지워도 설정은 남는다 */
  audio: boolean;
  setAudio: (on: boolean) => void;
  /** 하단 상호작용 문구. 씬이 올려 준다. 저장하지 않는다 */
  prompt: string | null;
  /** 화면 위쪽에 잠깐 뜨는 결과 문구 (§8.3) — `호감 +8` */
  toast: string | null;
  clearToast: () => void;

  /** 처음 한 번만 보이는 안내. 본 것은 counters.firsts 에 적힌다 */
  hint: string | null;
  showHint: (id: string, text: string) => void;
  dismissHint: () => void;

  boot: () => Promise<void>;
  startNewGame: (opts?: { heroName?: string; townName?: string }) => Promise<void>;
  save: (reason: SaveReason) => Promise<void>;
  requestPersistence: () => Promise<void>;

  /** 대화 레이어. 열려 있으면 필드 입력이 멈춘다 */
  dialogue: DialogueState | null;
  /**
   * 이어서 틀 대본 (§8.3).
   *
   * 여러 마디로 된 장면은 마디마다 대본이 하나다. 하나가 닫힐 때
   * 여기 남은 것이 있으면 곧장 다음 마디가 열린다 —
   * 그래야 대화가 한마디로 끊기지 않는다.
   */
  dialogueQueue: DialogueScript[];
  openDialogue: (script: DialogueScript) => void;
  /** A 또는 대사창 탭. §8.3 의 상태 기계를 한 칸 민다 */
  advanceDialogue: () => void;
  /** 타이핑이 끝났다. 대기(▼)로만 넘긴다 — 여러 번 불려도 같은 결과여야 한다 */
  finishTyping: () => void;
  chooseDialogue: (optionId: string) => void;
  closeDialogue: () => void;

  /** 대기 중인 경쟁 사건 (§7.5). 다음 마을 진입 때 열린다 */
  rival: RivalPick | null;
  /**
   * 이름을 아직 안 붙인 인물. 만나기 전에 먼저 물어본다 (§7.1) —
   * 이름 없는 사람과 대화가 시작되면 누구와 말하는지 알 수가 없다.
   */
  naming: string | null;
  askName: (companionId: string) => void;
  nameCompanion: (name: string) => void;

  /** 지금 걸어오고 있는 인물 id (§7.3). 스프라이트가 도착하면 대화가 열린다 */
  approaching: string | null;
  /**
   * 다가옴을 몇 번 무시했는지. 세이브에 담을 자리가 §4 에 없어 세션에만 둔다 —
   * 새로고침하면 0 으로 돌아간다.
   */
  approachIgnores: Record<string, number>;
  /** 마을에 들어섰다. 대기 중인 인물이 있으면 걸어오게 한다 */
  beginApproach: () => void;
  /** 스프라이트가 앞까지 왔다 → 대화 사건을 연다 */
  approachArrived: () => void;
  /** 마을을 떠났다. 다가오던 사람을 무시한 것으로 친다 */
  abandonApproach: () => void;

  /** 동행 — 주당 1명, 동료(40) 이상만 (§11) */
  setEscort: (companionId: string | null) => void;
  /** 의뢰인과 대화하면 신뢰가 오른다. 주를 쓰지 않는다 (§7.6) */
  talkToPatron: (patronId: string) => void;

  /** 이름은 플레이어가 붙인다 (§7.1) */
  renameCompanion: (companionId: string, name: string) => void;
  /** 이번 주에 쓴 거래액. 세이브에 담을 자리가 §4 에 없어 세션에만 둔다 */
  sellResource: (resource: ResourceId, amount: number) => void;
  buyResource: (resource: ResourceId, amount: number) => void;
  /** 선물 — 취향이 맞으면 크게 오른다. 인물당 4주 쿨다운 (§7.3) */
  giveGift: (companionId: string, giftId: string) => void;

  /** 상단 HUD 를 눌러 여는 메뉴 (§5) */
  menu: 'status' | 'companions' | 'chronicle' | 'bundle' | 'settings' | null;
  openMenu: (tab: 'status' | 'companions' | 'chronicle' | 'bundle' | 'settings') => void;
  closeMenu: () => void;

  /** 인물 이미지 — 고른 즉시 WebP 로 다시 구워 저장한다 (§9.1) */
  putImage: (companionId: string, slot: number, file: File) => Promise<void>;
  /** 여섯 슬롯 중 어느 것을 보일지 고른다 (§8.2) */
  pickSlot: (companionId: string, slot: number) => void;
  clearImage: (companionId: string, slot: number) => Promise<void>;
  /** 꾸러미 내보내기. Blob 을 돌려주면 화면이 내려받기를 건다 */
  exportBundle: () => Promise<Blob | null>;
  importBundle: (file: Blob) => Promise<void>;

  /** 지역 선택 화면이 열려 있는가 */
  regionSelect: boolean;
  /** 판정 연출 중인 결과. 닫아야 다시 걸을 수 있다 */
  explore: ExploreView | null;
  /** 이번 탐사에서 이미 밟은 노드. 세이브에 넣지 않는다 */

  openRegionSelect: () => void;
  closeRegionSelect: () => void;
  /** 지역으로 나간다. 이때 1주가 소모된다 (§11) */
  enterRegion: (regionId: string) => void;
  /** 마을로 돌아온다. 추가 시간 소모 없음 */
  leaveRegion: () => void;
  /** 건물 안으로 들어간다 (§6). 시간을 쓰지 않는다 */
  enterIndoor: (buildingId: string) => void;
  /** 밖으로 나온다. 들어갔던 문 앞에 선다 */
  leaveIndoor: () => void;
  /**
   * 지금 열려 있는 지역 사건 (§11 사건 노드).
   * 전리품 노드와 달리 주사위를 굴리지 않는다 — 고르는 자리다.
   */
  regionEvent: { nodeId: string; event: RegionEvent; result: RegionEventView | null } | null;
  chooseRegionEvent: (index: number) => void;
  closeRegionEvent: () => void;

  /**
   * 지금 화면에 떠 있는 에피소드 창 (§11 곁가지).
   *
   * 걸어 다니는 것은 맵이 하고, 여기는 **판 위에서 열리는 창**만 든다.
   * 어디까지 갔는지와 쌓인 결은 `state.episodeRun` 에 있다 —
   * 판을 넘나드는 값이라 세이브에 있어야 한다.
   */
  episode:
    | { kind: 'enter'; text: string }
    | {
        kind: 'scene';
        stageId: string;
        result: { result: string; notes: string[]; xp: number; levelUp: LevelUp | null } | null;
      }
    | {
        kind: 'boss';
        text: string;
        /** 방금 판의 결과. null 이면 자세를 고르는 중이다 */
        round: { mine: Stance; theirs: Stance; outcome: RoundOutcome; line: string } | null;
        /** 겨룸이 끝났을 때 */
        result: {
          won: boolean;
          line: string;
          joined: string | null;
          /** 세력 이야기면 아직 갈래를 고르지 않았다 */
          pendingFaction: boolean;
        } | null;
      }
    | null;
  /** 에피소드에 들어간다. 이때 1주가 소모된다 */
  startEpisode: (episodeId: string) => void;
  /** 이야기 자리를 밟았다 */
  openEpisodeScene: () => void;
  chooseEpisodeBeat: (index: number) => void;
  /** 다음 판으로 */
  nextEpisodeStage: () => void;
  /** 마지막 판에서 마주선다 */
  faceEpisodeBoss: () => void;
  /** 자세를 골라 한 판 겨룬다 */
  pickStance: (stance: Stance) => void;
  /** 방금 판을 없던 일로 한다. 결 4 이상에서 한 번 */
  retryRound: () => void;
  /** 결과를 읽었다 → 다음 판, 또는 끝 */
  nextRound: () => void;
  /** 세력 이야기의 끝 — 도울 것인가 복속시킬 것인가 (§7) */
  settleFaction: (mode: 'helped' | 'ruled') => void;
  /** 세력 마을로 간다. 이미 이야기를 끝낸 데만 (§7) */
  enterFactionVillage: (factionId: FactionId) => void;
  /** 세력 마을의 대표에게 말을 건다 */
  talkToEnvoy: () => void;
  /** 창을 닫는다. 마주선 결과였으면 마을로 돌아간다 */
  closeEpisode: () => void;
  /** 도중에 그만두고 마을로 */
  leaveEpisode: () => void;

  /** 노드를 밟았다 → 판정 */
  stepNode: (nodeId: string) => void;
  closeExplore: () => void;

  /**
   * 나들이 (§7.6). 나와 있는 사람에게 말을 걸면 열린다.
   * `phase` 로 대화 → 놀이 → 마무리 순으로 넘어간다.
   */
  outing: {
    companionId: string;
    buildingId: string;
    phase: 'intro' | 'playing' | 'after';
    lines: string[];
    won: boolean;
  } | null;
  openOuting: (companionId: string) => void;
  startOutingGame: () => void;
  finishOutingGame: (won: boolean) => void;
  closeOuting: () => void;

  /** 시장 판매대가 열려 있는가. 메뉴가 아니라 시장 안에서 연다 (§10) */
  shop: boolean;
  openShop: () => void;

  /** 열려 있는 실내 목적 자리 (§10). null 이면 닫혀 있다 */
  room: RoomId | null;
  openRoom: (id: RoomId) => void;
  closeRoom: () => void;
  /** 학당 수련장 — 쌓인 점수를 쓴다 */
  spendStat: (stat: StatId) => void;
  spendSkill: (skillId: string) => void;
  /** 신전 제단 — 금화를 기력으로 바꾼다 */
  offer: () => void;
  closeShop: () => void;

  /** 열려 있는 건설·증축 패널의 건물 id */
  buildPanel: string | null;
  openBuildPanel: (buildingId: string) => void;
  closeBuildPanel: () => void;
  /** 한 단계 올린다. 시간은 흐르지 않는다 (§10) */
  raiseBuilding: (buildingId: string) => void;
  /** 주 종료. §3 의 8단계를 돈다 */
  endWeek: () => void;
  /** 이번 주는 나가지 않고 쉰다. 한 주가 지나고 기력이 돌아온다 */
  restWeek: () => void;
  /** 붕괴 직전, 유물을 넘겨 시간을 산다. 한 번뿐이다 (§13) */
  sellRelicForTime: () => void;

  setPrompt: (label: string | null) => void;
  /** 방향만 바꾼다 */
  faceHero: (dir: Dir) => void;
  /** 한 칸 옮긴다 */
  stepHero: (to: { x: number; y: number }, dir: Dir) => void;
}

/**
 * 걸음마다 저장하면 140ms 간격으로 localStorage 를 두드리게 된다.
 * 발이 멈추고 조금 지난 뒤 한 번만 쓴다.
 */
const SETTLE_MS = 800;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 불러온 판이 갇혀 있으면 꺼낸다.
 *
 * 맵 모양이 바뀌면 예전 세이브의 좌표가 막힌 칸이 될 수 있다.
 * 이걸 안 하면 사방이 막힌 자리에서 아무것도 못 하고 앉아 있게 된다.
 */
function rescueLoadedState(state: GameState): GameState {
  let map;
  try {
    map = loadMap({
      mapId: state.world.currentMap,
      eraIndex: state.world.eraIndex,
      buildings: state.town.buildings,
    });
  } catch {
    // 없는 맵을 가리키고 있으면 마을로 돌려보낸다
    return {
      ...state,
      world: { ...state.world, currentMap: 'town', heroTile: { ...START_HERO_TILE } },
    };
  }

  const fallback =
    state.world.currentMap === 'town' ? START_HERO_TILE : REGION_ENTRY;
  const tile = rescueTile(map, state.world.heroTile, fallback);

  if (tile.x === state.world.heroTile.x && tile.y === state.world.heroTile.y) return state;
  return { ...state, world: { ...state.world, heroTile: tile } };
}

function describe(err: unknown): string {
  if (err instanceof StorageError) return err.message;
  if (err instanceof Error) return err.message;
  return '알 수 없는 문제가 생겼다. 앱을 다시 열어라.';
}

export const useGameStore = create<GameStore>((set, get) => ({
  status: 'booting',
  state: null,
  ledger: newLedger(),
  error: null,
  backupKey: null,
  migratedFrom: null,
  persisted: false,
  audio: true,
  prompt: null,
  toast: null,
  hint: null,
  dialogue: null,
  dialogueQueue: [],
  buildPanel: null,
  shop: false,
  outing: null,
  regionEvent: null,
  episode: null,
  room: null,
  regionSelect: false,
  explore: null,
  menu: null,
  approaching: null,
  approachIgnores: {},
  rival: null,
  naming: null,

  async boot() {
    const storage = getStorage();
    try {
      const outcome = await loadGame(storage, Date.now());
      switch (outcome.kind) {
        case 'loaded': {
          // 맵이 바뀌어 서 있던 칸이 막혔을 수 있다. 갇힌 채로 열지 않는다
          const rescued = rescueLoadedState(outcome.state);
          set({
            status: 'ready',
            state: rescued,
            ledger: outcome.ledger,
            error: null,
            backupKey: null,
            migratedFrom: outcome.migratedFrom,
          });
          if (rescued !== outcome.state) void get().save('map-change');
          break;
        }
        case 'empty':
          set({ status: 'empty', state: null, ledger: outcome.ledger, error: null });
          break;
        case 'failed':
          // 덮어쓰지 않는다. 원본은 backupKey 에 있다
          set({
            status: 'failed',
            state: null,
            ledger: outcome.ledger,
            error: outcome.message,
            backupKey: outcome.backupKey,
          });
          break;
      }
    } catch (err) {
      set({ status: 'failed', error: describe(err) });
    }

    set({ persisted: await storage.isPersisted() });

    // 소리 설정은 세이브와 별개 키다. 어댑터를 거쳐 읽는다
    try {
      const saved = await storage.getText(AUDIO_KEY);
      const on = saved !== 'off';
      setAudioEnabled(on);
      set({ audio: on });
    } catch {
      setAudioEnabled(true);
    }
  },

  setAudio(on) {
    setAudioEnabled(on);
    set({ audio: on });
    // 켜는 순간 한 번 들려 준다. 잘 나오는지 알아야 한다
    if (on) play('confirm');
    void getStorage().setText(AUDIO_KEY, on ? 'on' : 'off');
  },

  async startNewGame(opts) {
    const state = newGame({
      now: Date.now(),
      ...(opts?.heroName !== undefined ? { heroName: opts.heroName } : {}),
      ...(opts?.townName !== undefined ? { townName: opts.townName } : {}),
    });
    set({ status: 'ready', state, error: null, backupKey: null, migratedFrom: null });

    // 새 게임은 사용자 조작으로 시작된다. 지속 저장을 요청하기 좋은 자리다 (§14)
    await get().requestPersistence();
    await get().save('manual');
  },

  async save(_reason) {
    const { state } = get();
    if (state === null) return;
    try {
      const ledger = await saveAll(getStorage(), state);
      set({ ledger, error: null });
    } catch (err) {
      set({ error: describe(err) });
    }
  },

  async requestPersistence() {
    const storage = getStorage();
    const granted = await storage.requestPersistence();
    set({ persisted: granted || (await storage.isPersisted()) });
  },

  openDialogue(script) {
    if (script.lines.length === 0) return;
    set({ dialogue: { script, lineIndex: 0, phase: 'typing', reply: null, revealSlot: null } });
  },

  /**
   * §8.3: 닫힘 → 열림(타이핑) → 대기(▼) → [다음 줄 | 선택지 | 닫힘]
   * 선택지가 떠 있을 때 A 는 아무 동작도 하지 않는다. 반드시 탭으로 고른다.
   */
  advanceDialogue() {
    const d = get().dialogue;
    if (d === null) return;

    if (d.phase === 'choosing') return;

    // 타이핑 중이면 먼저 전체를 보여 준다
    if (d.phase === 'typing') {
      set({ dialogue: { ...d, phase: 'waiting' } });
      return;
    }

    play('talk');

    // 마무리 대사를 보고 있었으면 여기서 닫는다 — 이어질 마디가 있으면 그리로
    if (d.reply !== null) {
      get().closeDialogue();
      return;
    }

    if (d.lineIndex < d.script.lines.length - 1) {
      set({ dialogue: { ...d, lineIndex: d.lineIndex + 1, phase: 'typing' } });
      return;
    }

    const choices = d.script.choices;
    if (choices !== undefined && choices.length > 0) {
      set({ dialogue: { ...d, phase: 'choosing' } });
      return;
    }

    /**
     * 선택지 없이 줄이 끝났다. **여기서 그냥 닫으면 안 된다** —
     * 여러 마디짜리 장면이 첫 마디에서 끊긴다. 큐를 거친다.
     */
    get().closeDialogue();
  },

  /**
   * 다 찍혔다는 신호. `advanceDialogue` 를 쓰면 안 된다 —
   * 그건 한 칸 미는 동작이라 두 번 불리면 줄을 건너뛴다.
   */
  finishTyping() {
    const d = get().dialogue;
    if (d === null || d.phase !== 'typing') return;
    set({ dialogue: { ...d, phase: 'waiting' } });
  },

  chooseDialogue(optionId) {
    const d = get().dialogue;
    if (d === null || d.phase !== 'choosing') return;

    play('choose');

    const option = d.script.choices?.find((c) => c.id === optionId);
    if (option === undefined) {
      get().closeDialogue();
      return;
    }

    // 고른 것이 실제로 일어난다 (§8.4). 정답은 없다 —
    // 호감이 적게 오르는 쪽은 세력 평판 같은 다른 것을 준다
    const effect = option.effect;
    const { state } = get();
    if (effect !== undefined && state !== null) {
      let next = state;
      const toast: string[] = [];

      if (effect.companionId !== undefined) {
        const companion = next.companions[effect.companionId];
        if (companion !== undefined && effect.confess !== undefined) {
          // 고백에 답한다 (§7.4). 보류가 이 장르의 핵심이다
          const answered = answerConfession(companion, effect.confess, next.world.turn);
          next = {
            ...next,
            companions: { ...next.companions, [answered.id]: answered },
            counters: {
              ...next.counters,
              confessions:
                effect.confess === 'accept'
                  ? next.counters.confessions + 1
                  : next.counters.confessions,
            },
          };
          toast.push(
            effect.confess === 'accept'
              ? '연심'
              : effect.confess === 'hold'
                ? '보류'
                : '우애로 굳음 · 호감 -10',
          );
        } else if (companion !== undefined) {
          let moved = companion;
          if (effect.affinity !== undefined && effect.affinity !== 0) {
            moved = withAffinity(moved, effect.affinity);
            toast.push(`호감 ${effect.affinity > 0 ? '+' : ''}${effect.affinity}`);
          }
          if (effect.clearedEvent !== undefined && !moved.clearedEvents.includes(effect.clearedEvent)) {
            moved = { ...moved, clearedEvents: [...moved.clearedEvents, effect.clearedEvent] };
          }
          moved = { ...moved, lastApproachTurn: next.world.turn };
          next = { ...next, companions: { ...next.companions, [moved.id]: moved } };
        }
      }

      // 의뢰를 맡는다 (§7.6) — 동시에 하나뿐이다
      if (effect.questAccept !== undefined && effect.patronId !== undefined) {
        const p = next.patrons[effect.patronId];
        next = {
          ...next,
          patrons: {
            ...next.patrons,
            [effect.patronId]: {
              id: effect.patronId,
              met: true,
              trust: p?.trust ?? 0,
              questsCleared: p?.questsCleared ?? [],
              lastQuestTurn: p?.lastQuestTurn ?? -1,
              activeQuestId: effect.questAccept,
            },
          },
        };
        toast.push('의뢰를 맡았다');
      }

      // 완료 보고 — 실패가 없으므로 여기까지 오면 반드시 성공이다
      if (effect.questReport !== undefined) {
        const quest = getQuest(effect.questReport);
        const holder = Object.values(next.patrons).find(
          (p) => p.activeQuestId === effect.questReport,
        );
        if (quest !== undefined && holder !== undefined) {
          next = {
            ...next,
            patrons: {
              ...next.patrons,
              [holder.id]: {
                ...holder,
                trust: Math.min(TRUST_MAX, holder.trust + TRUST.questCleared),
                /**
                 * 다시 오는 의뢰는 목록에 쌓지 않는다 — 회차마다 id 가 달라
                 * 쌓으면 세이브가 끝없이 자란다. 간격은 lastQuestTurn 이 센다.
                 */
                questsCleared: quest.id.startsWith(`${REPEAT_PREFIX}:`)
                  ? holder.questsCleared
                  : [...holder.questsCleared, quest.id],
                lastQuestTurn: next.world.turn,
                activeQuestId: null,
              },
            },
          };
          toast.push(`신뢰 +${TRUST.questCleared}`);

          const reward = quest.reward;
          if (reward.kind === 'resources') {
            next = {
              ...next,
              resources: {
                ...next.resources,
                wood: next.resources.wood + (reward.wood ?? 0),
                stone: next.resources.stone + (reward.stone ?? 0),
                gold: next.resources.gold + (reward.gold ?? 0),
              },
            };
          } else if (reward.kind === 'region') {
            if (!next.world.unlockedRegions.includes(reward.regionId)) {
              next = {
                ...next,
                world: {
                  ...next.world,
                  unlockedRegions: [...next.world.unlockedRegions, reward.regionId],
                },
              };
              toast.push(`${regionName(reward.regionId)} 개방`);
            }
          } else {
            const grown = addCompanion(next, 'quest');
            if (grown !== null) {
              next = grown.state;
              toast.push(`${displayName(grown.companion)} 합류`);
            } else {
              // 명단이 찼다 (§7.1 상한 8명). 빈손으로 돌려보내지 않는다
              next = { ...next, resources: { ...next.resources, gold: next.resources.gold + 40 } };
              toast.push('명단이 찼다 · 금화 +40');
            }
          }
        }
      }

      // 경쟁 사건 — 편든 쪽 +6, 반대쪽 −4 / 중립은 양쪽 +1 (§7.5)
      if (effect.rival !== undefined) {
        const { firstId, secondId, side } = effect.rival;
        const d = rivalDeltas(side);
        const a = next.companions[firstId];
        const b = next.companions[secondId];
        const companions = { ...next.companions };
        if (a !== undefined) companions[firstId] = withAffinity(a, d.first);
        if (b !== undefined) companions[secondId] = withAffinity(b, d.second);
        next = { ...next, companions };
        toast.push(
          side === 'neutral'
            ? '양쪽 +1'
            : `${displayName(side === 'first' ? (a ?? b)! : (b ?? a)!)} +${RIVAL_AFFINITY.sided}`,
        );
      }

      if (effect.factionShift !== undefined) {
        const [faction, delta] = effect.factionShift;
        next = { ...next, factions: shiftFaction(next.factions, faction, delta) };
        toast.push(`${FACTION_LABEL[faction]} ${delta > 0 ? '+' : ''}${delta}`);
      }

      // 소화한 사건은 대기열에서 빠진다
      next = {
        ...next,
        pendingApproach: next.pendingApproach.filter((id) => id !== effect.companionId),
      };

      set({ state: next, toast: toast.length > 0 ? toast.join(' · ') : null });
      void get().save('relationship');
    }

    // 마무리 대사가 없으면 고르는 즉시 닫힌다. 이어질 마디는 큐가 챙긴다
    if (option.reply === '') {
      set({ approaching: null });
      get().closeDialogue();
      return;
    }
    /**
     * 마무리 대사와 함께 그림을 바꾼다 (§8.2).
     *
     * 고르고 나면 화면이 그대로여서 무엇이 달라졌는지 눈에 남는 게 없었다.
     * 사건 삽화(슬롯 3)를 먼저 찾고, 없으면 평소 쓰는 자리가 아닌 다른 자리를
     * 쓴다. 한 장만 넣었으면 바꿀 것이 없으니 그대로 둔다.
     */
    const speaker = d.script.portrait.speaker;
    const who =
      speaker.kind === 'companion'
        ? Object.values(get().state?.companions ?? {}).find(
            (c) => c.archetypeId === speaker.id && c.departedTurn === null,
          )
        : undefined;
    set({ dialogue: { ...d, phase: 'typing', reply: option.reply, revealSlot: revealFor(who) } });
  },

  closeDialogue() {
    /**
     * 이어질 마디가 남아 있으면 곧장 다음을 연다 (§8.3).
     * 여기서 그냥 닫으면 여러 마디짜리 장면이 첫 마디에서 끊긴다.
     */
    const queue = get().dialogueQueue;
    const next = queue[0];
    if (next !== undefined) {
      set({
        dialogue: { script: next, lineIndex: 0, phase: 'typing', reply: null, revealSlot: null },
        dialogueQueue: queue.slice(1),
      });
      return;
    }
    set({ dialogue: null, dialogueQueue: [] });
  },

  askName(companionId) {
    set({ naming: companionId });
  },

  nameCompanion(name) {
    const { state, naming } = get();
    if (state === null || naming === null) return;
    const companion = state.companions[naming];
    if (companion === undefined) return;

    const trimmed = name.trim();
    set({
      state: {
        ...state,
        companions: {
          ...state.companions,
          [naming]: { ...companion, name: trimmed === '' ? displayName(companion) : trimmed },
        },
      },
      naming: null,
    });
    void get().save('relationship');
  },

  beginApproach() {
    const { state, approaching, rival } = get();
    if (state === null || approaching !== null) return;
    if (state.world.currentMap !== 'town') return;

    // 경쟁 사건이 먼저다. 두 사람이 같이 와 있다 (§7.5)
    if (rival !== null) {
      const script = buildRivalScript(state, rival, state.town.name);
      set({ rival: null });
      if (script !== null) {
        set({ dialogue: { script, lineIndex: 0, phase: 'typing', reply: null, revealSlot: null } });
        return;
      }
    }

    // 대기 중인 인물이 둘 이상이면 호감이 높은 쪽부터 한 명씩 (§7.3)
    const who = nextApproach(state);
    if (who === null) return;
    set({ approaching: who.id });
  },

  approachArrived() {
    const { state, approaching } = get();
    if (state === null || approaching === null) return;
    const companion = state.companions[approaching];
    if (companion === undefined) return;

    // 다가온 사람이 아직 이름이 없으면 먼저 이름부터 묻는다 (§7.1)
    if (companion.name === '') {
      set({ naming: companion.id });
      return;
    }

    // 고백이 먼저다 (§7.4). 벗에 닿으면 인물이 그 말을 하러 온다
    const req = { townName: state.town.name, characterName: companion.name };
    if (shouldConfess(companion, state.world.turn)) {
      const script = buildConfessionScript(companion, req);
      if (script !== null) {
        set({ dialogue: { script, lineIndex: 0, phase: 'typing', reply: null, revealSlot: null } });
        return;
      }
    }

    /**
     * 연애 장면 (§7.4). 여러 마디로 이어진다 —
     * 한마디 하고 닫히던 것이 관계가 안 쌓이는 원인이었다.
     * 연심 트랙에서만 열린다. 우애로 굳은 사이에는 오지 않는다.
     */
    const scene = nextRomanceScene(companion);
    if (scene !== null) {
      const scripts = buildSceneScripts(state, companion, scene);
      const first = scripts[0];
      if (first !== undefined) {
        set({
          dialogue: { script: first, lineIndex: 0, phase: 'typing', reply: null, revealSlot: null },
          dialogueQueue: scripts.slice(1),
        });
        return;
      }
    }

    const tier = pendingTier(companion);
    const script = tier === null ? null : buildEventScript(companion, tier, req);
    if (script === null) {
      set({ approaching: null });
      return;
    }
    set({ dialogue: { script, lineIndex: 0, phase: 'typing', reply: null, revealSlot: null } });
  },

  /** 무시하고 걸어갔다. 세 번이면 호감 −3 과 함께 물러난다 (§7.3) */
  abandonApproach() {
    const { state, approaching, approachIgnores } = get();
    if (approaching === null) return;

    const count = (approachIgnores[approaching] ?? 0) + 1;
    const ignores = { ...approachIgnores, [approaching]: count };

    if (state !== null && count >= APPROACH_IGNORE_LIMIT) {
      const companion = state.companions[approaching];
      if (companion !== undefined) {
        set({
          state: {
            ...state,
            companions: {
              ...state.companions,
              [approaching]: withAffinity(companion, AFFINITY.ignoredApproach),
            },
            // 사건은 사라지지 않는다. 다시 대기열로 돌아간다
            pendingApproach: state.pendingApproach.filter((id) => id !== approaching),
          },
        });
      }
      ignores[approaching] = 0;
    }

    set({ approaching: null, approachIgnores: ignores });
  },

  setEscort(companionId) {
    const { state } = get();
    if (state === null) return;
    if (companionId === null) {
      set({ state: { ...state, escort: null } });
      void get().save('relationship');
      return;
    }
    const companion = state.companions[companionId];
    if (companion === undefined) return;
    // 동료(40) 이상만. 부상 중이면 못 데려간다
    if (companion.affinity < ESCORT_MIN_AFFINITY) return;
    if (companion.injuredUntilTurn > state.world.turn) return;
    set({ state: { ...state, escort: companionId } });
    void get().save('relationship');
  },

  talkToPatron(patronId) {
    const { state } = get();
    if (state === null) return;

    const existing = state.patrons[patronId];
    const trust = Math.min(TRUST_MAX, (existing?.trust ?? 0) + TRUST.talk);
    const record = {
      id: patronId,
      met: true,
      trust,
      questsCleared: existing?.questsCleared ?? [],
      lastQuestTurn: existing?.lastQuestTurn ?? -1,
      activeQuestId: existing?.activeQuestId ?? null,
    };

    set({
      state: { ...state, patrons: { ...state.patrons, [patronId]: record } },
      toast: `신뢰 +${TRUST.talk}`,
    });
    void get().save('relationship');
  },

  renameCompanion(companionId, name) {
    const { state } = get();
    if (state === null) return;
    const companion = state.companions[companionId];
    if (companion === undefined) return;
    set({
      state: {
        ...state,
        companions: { ...state.companions, [companionId]: { ...companion, name: name.trim() } },
      },
    });
    void get().save('relationship');
  },

  sellResource(resource, amount) {
    const { state } = get();
    if (state === null || amount <= 0) return;
    if (state.resources[resource] < amount) {
      set({ error: `${josa(RESOURCE_NAME[resource], '이')} 모자랍니다.` });
      return;
    }
    const gold = sellValue(state, resource, amount);
    const limit = weeklyLimit(state);
    const traded = state.counters.tradedThisWeek;
    if (traded + gold > limit) {
      set({ error: `이번 주 거래 한도(${limit})를 넘습니다. 시장을 올리거나 다음 주에 하세요.` });
      return;
    }
    set({
      state: {
        ...state,
        resources: {
          ...state.resources,
          [resource]: state.resources[resource] - amount,
          gold: state.resources.gold + gold,
        },
        counters: { ...state.counters, tradedThisWeek: traded + gold },
      },
      error: null,
      toast: `금화 +${gold}`,
    });
    void get().save('manual');
  },

  buyResource(resource, amount) {
    const { state } = get();
    if (state === null || amount <= 0) return;
    const gold = buyCost(state, resource, amount);
    if (state.resources.gold < gold) {
      set({ error: `금화가 ${gold - state.resources.gold} 부족합니다. 자원을 팔거나 모으세요.` });
      return;
    }
    const limit = weeklyLimit(state);
    const traded = state.counters.tradedThisWeek;
    if (traded + gold > limit) {
      set({ error: `이번 주 거래 한도(${limit})를 넘습니다. 시장을 올리거나 다음 주에 하세요.` });
      return;
    }
    set({
      state: {
        ...state,
        resources: {
          ...state.resources,
          [resource]: state.resources[resource] + amount,
          gold: state.resources.gold - gold,
        },
        counters: { ...state.counters, tradedThisWeek: traded + gold },
      },
      error: null,
      toast: `${RESOURCE_NAME[resource]} +${amount}`,
    });
    void get().save('manual');
  },

  giveGift(companionId, giftId) {
    const { state } = get();
    if (state === null) return;
    const companion = state.companions[companionId];
    const gift = getGift(giftId);
    if (companion === undefined || gift === undefined) return;

    if (!giftReady(companion, state.world.turn)) {
      set({ error: '얼마 전에도 받았습니다. 몇 주 뒤에 다시 건네세요.' });
      return;
    }
    if (state.resources.gold < gift.gold) {
      set({ error: `금화가 ${gift.gold - state.resources.gold} 부족합니다.` });
      return;
    }

    const reaction = giftReaction(companion, gift.category);
    const delta = giftAffinity(reaction);

    set({
      state: {
        ...state,
        resources: { ...state.resources, gold: state.resources.gold - gift.gold },
        companions: {
          ...state.companions,
          [companionId]: {
            ...withAffinity(companion, delta),
            lastApproachTurn: state.world.turn,
          },
        },
      },
      error: null,
      toast: `호감 ${delta > 0 ? '+' : ''}${delta}`,
    });
    play('warm');
    void get().save('relationship');
  },

  openMenu(tab) {
    set({ menu: tab });
  },

  closeMenu() {
    set({ menu: null });
  },

  pickSlot(companionId, slot) {
    const { state } = get();
    if (state === null) return;
    const companion = state.companions[companionId];
    if (companion === undefined) return;
    // 비어 있는 자리를 고르게 두지 않는다. 골라 놓고 실루엣이 나오면 고장으로 보인다
    const key = companion.images[slot];
    if (key === null || key === undefined || key === '') return;

    set({
      state: {
        ...state,
        companions: { ...state.companions, [companionId]: { ...companion, pickedSlot: slot } },
      },
      error: null,
    });
    void get().save('relationship');
  },

  async putImage(companionId, slot, file) {
    const { state } = get();
    if (state === null) return;

    try {
      const encoded = await encodeForSlot(file, slot);
      const key = imageKey(companionId, slot);
      // 저장하는 건 다시 구운 바이트뿐이다. 원본을 가리키는 값은 남기지 않는다 (§9.1)
      await getStorage().putImage(key, encoded.blob);

      const companion = state.companions[companionId];
      if (companion === undefined) return;

      set({
        state: {
          ...state,
          companions: {
            ...state.companions,
            [companionId]: { ...companion, images: { ...companion.images, [slot]: key } },
          },
        },
        error: null,
      });
      void get().save('relationship');
    } catch (err) {
      set({ error: describe(err) });
    }
  },

  async clearImage(companionId, slot) {
    const { state } = get();
    if (state === null) return;
    const companion = state.companions[companionId];
    if (companion === undefined) return;

    try {
      await getStorage().removeImage(imageKey(companionId, slot));
    } catch {
      // 지우기가 실패해도 참조는 끊는다. 남은 바이트는 다음 저장에서 덮인다
    }

    const images = { ...companion.images };
    delete images[slot];
    set({
      state: {
        ...state,
        companions: { ...state.companions, [companionId]: { ...companion, images } },
      },
    });
    void get().save('relationship');
  },

  async exportBundle() {
    const { state } = get();
    if (state === null) return null;
    try {
      return await buildBundle(getStorage(), state, new Date());
    } catch (err) {
      set({ error: describe(err) });
      return null;
    }
  },

  async importBundle(file) {
    const outcome = await restoreBundle(getStorage(), file);
    if (outcome.kind === 'failed') {
      set({ error: outcome.message });
      return;
    }
    set({
      status: 'ready',
      state: outcome.state,
      ledger: outcome.ledger,
      error: null,
      menu: null,
          explore: null,
      dialogue: null,
    });
  },

  openRegionSelect() {
    set({ regionSelect: true });
  },

  closeRegionSelect() {
    set({ regionSelect: false });
  },

  enterRegion(regionId) {
    const { state } = get();
    if (state === null) return;

    // 쓰러진 뒤 쉬는 동안은 나갈 수 없다 (§11). UI 만 막아 두지 않는다
    if (state.world.turn < state.hero.restUntilTurn) return;

    // 1. 1주 소모 (§11). 마을 활동은 시간을 쓰지 않지만 나가는 것은 쓴다
    // 어디로 나가는지 넘긴다 — 부탁을 들어줬는지가 여기서 갈린다 (§7.3)
    const weekResult = endWeek(state, { wentTo: regionId }, createRng(seedOf(state) + state.world.turn));
    const afterWeek = weekResult.state;

    // 2. 지역 맵 진입
    set({
      state: {
        ...afterWeek,
        world: {
          ...afterWeek.world,
          currentMap: regionMapId(regionId),
          heroTile: { ...REGION_ENTRY },
          clearedNodes: [],
        },
      },
      regionSelect: false,
          explore: null,
      // 주가 넘어갔으니 거래 한도도 새로 찬다
          rival: weekResult.rival ?? get().rival,
    });
    void get().save('map-change');
  },

  leaveRegion() {
    const { state } = get();
    if (state === null) return;
    set({
      state: {
        ...state,
        // 동행은 한 번 나갈 때마다 고른다 (§11). 돌아오면 풀린다 —
        // 안 풀면 데려갔던 사람만 마을에서 영영 사라진 것처럼 보인다
        escort: null,
        world: {
          ...state.world,
          currentMap: 'town',
          heroTile: { ...START_HERO_TILE },
          clearedNodes: [],
        },
      },
          explore: null,
    });
    void get().save('map-change');
  },

  enterIndoor(buildingId) {
    const { state } = get();
    if (state === null) return;
    set({
      state: {
        ...state,
        world: {
          ...state.world,
          currentMap: indoorMapId(buildingId),
          heroTile: { ...INDOOR_ENTRY },
        },
      },
    });
    void get().save('map-change');
  },

  leaveIndoor() {
    const { state } = get();
    if (state === null) return;

    /**
     * 들어갔던 건물의 **문 앞**으로 나온다.
     *
     * 두 군데가 틀려 있었다.
     *
     *  1. 문 타일 **위**에 세우고 있었다. 나오자마자 발밑이 '들어가기' 라
     *     한 번 더 누르면 그대로 다시 들어간다 — 나온 것 같지 않다.
     *     문 아래 한 칸은 마을 맵이 반드시 비워 두므로 거기 세운다.
     *  2. `loadMap` 을 folk·escorted 없이 불러 **씬과 다른 열쇠**로 마을을
     *     또 지었다. 같은 맥락으로 불러야 같은 지도를 본다.
     */
    const buildingId = buildingIdFromIndoor(state.world.currentMap);
    const town = loadMap({
      mapId: 'town',
      eraIndex: state.world.eraIndex,
      buildings: state.town.buildings,
      escorted: state.escort !== null,
      residents: residentsOf(state).map((c) => ({
        id: c.id,
        archetypeId: c.archetypeId,
        name: displayName(c),
      })),
      folk: townFolk(state).map((c) => ({
        id: c.id,
        archetypeId: c.archetypeId,
        name: displayName(c),
      })),
    });
    const door = town.objects.find((o) => o.building === buildingId);
    const front = door === undefined ? null : { x: door.x, y: door.y + 1 };
    const tile =
      front !== null && !isBlocked(town, front.x, front.y)
        ? { x: front.x, y: front.y, dir: 'down' as const }
        : door !== undefined
          ? { x: door.x, y: door.y, dir: 'down' as const }
          : START_HERO_TILE;

    set({
      state: { ...state, world: { ...state.world, currentMap: 'town', heroTile: tile } },
    });
    void get().save('map-change');
  },

  stepNode(nodeId) {
    const { state } = get();
    if (state === null || state.world.clearedNodes.includes(nodeId)) return;

    const regionId = regionIdFromMap(state.world.currentMap);
    if (regionId === null) return;
    const region = getRegion(regionId);
    if (region === undefined) return;

    // 같은 노드를 두 번 밟아도 결과는 한 번이다
    const rng = createRng(`${seedOf(state)}:${state.world.turn}:${nodeId}`);

    /**
     * 사건 노드는 **판정이 아니다** (§11 — 텍스트 사건, 세력 평판이나 소량 XP).
     * 셋 다 같은 1d20 을 굴리니 지역이 단조로웠다. 여기서 갈린다.
     */
    const here = loadMap({
      mapId: state.world.currentMap,
      eraIndex: state.world.eraIndex,
      buildings: state.town.buildings,
      escorted: state.escort !== null,
      visit: state.world.turn,
    }).objects.find((o) => o.id === nodeId);

    if (here?.nodeKind === 'event') {
      const picked = pickRegionEvent(state, regionId, rng);
      if (picked !== null) {
        set({ regionEvent: { nodeId, event: picked, result: null } });
        play('talk');
        return;
      }
      // 맞는 사건이 없으면 조용히 판정으로 넘어간다. 밟았는데 아무 일도 없으면 고장으로 보인다
    }

    const roll = rollExplore(state, region, rng);
    const outcome = resolveExplore(state, region, roll, rng, (r) => rollRelic(state, r)?.id ?? null);

    /**
     * 서술은 콘텐츠에서 가져온다. 새로 쓰지 않는다 (§11).
     *
     * 동행 노드는 **전용 문장**을 쓴다 — region-text.ts 의 escort 24문장이
     * 그동안 한 번도 화면에 안 나왔다. 그 자리가 없었기 때문이다.
     */
    const map = loadMap({
      mapId: state.world.currentMap,
      eraIndex: state.world.eraIndex,
      buildings: state.town.buildings,
      escorted: state.escort !== null,
      visit: state.world.turn,
    });
    const node = map.objects.find((o) => o.id === nodeId);
    const escortNode = node?.nodeKind === 'escort';

    const withMe = escortOf(state);

    /**
     * 동행 노드는 **그 사람과의 한 장면**이다 (§11 동행).
     *
     * 한 줄 서술로 끝나서 데려간 사람과 아무 일도 없었다.
     * 마을 대화와 같은 방식으로 연다 — 초상이 서고, 말이 오가고, 고른다.
     * 볼 장면이 남아 있지 않으면 예전대로 서술 한 줄로 간다.
     */
    if (escortNode && withMe !== null) {
      const scene = nextFieldScene(withMe);
      if (scene !== null) {
        const scripts = buildSceneScripts(state, withMe, scene);
        const first = scripts[0];
        if (first !== undefined) {
          set({
            state: {
              ...state,
              world: {
                ...state.world,
                clearedNodes: [...state.world.clearedNodes, nodeId],
              },
            },
            dialogue: {
              script: first,
              lineIndex: 0,
              phase: 'typing',
              reply: null,
              revealSlot: null,
            },
            dialogueQueue: scripts.slice(1),
          });
          play('talk');
          void get().save('relationship');
          return;
        }
      }
    }

    const text = REGION_TEXT[regionId];
    const raw =
      escortNode && withMe !== null
        ? (text?.escort[roll.grade] ?? '')
        : (rng.pick(text?.lines[roll.grade] ?? []) ?? '');
    const narration = applyToken(
      applyToken(raw, '{거점}', state.town.name),
      '{동료}',
      withMe === null ? '' : displayName(withMe),
    );

    // 전리품·경험치·피해
    let next: GameState = { ...state, resources: { ...state.resources } };
    for (const [key, amount] of Object.entries(outcome.loot)) {
      next.resources[key as ResourceId] += amount;
    }
    next.hero = { ...next.hero, hp: Math.max(0, next.hero.hp - outcome.hpLoss) };

    const relic = outcome.relicId === null ? null : getRelic(outcome.relicId);
    if (relic !== null && relic !== undefined) {
      next.hero = { ...next.hero, relics: [...next.hero.relics, relic.id] };
    }

    // ── 호감 (§7.3). 교류 버튼이 아니라 함께 겪은 일에서 오른다 ──
    const companions = { ...next.companions };
    const affinityNotes: string[] = [];

    // 동행 탐사 — 판정 등급별
    const escortId = next.escort;
    const escort = escortId === null ? undefined : companions[escortId];
    if (escort !== undefined) {
      let moved = withAffinity(escort, AFFINITY.escort[roll.grade]);
      // 위기면 동행자가 다친다 — 4주간 동행·대화 불가
      if (roll.grade === 'crisis') {
        moved = withAffinity(moved, ESCORT_INJURY.affinity);
        moved = { ...moved, injuredUntilTurn: next.world.turn + ESCORT_INJURY.weeks };
        affinityNotes.push(`${displayName(moved)}이(가) 다쳤다.`);
      }
      companions[moved.id] = moved;
    }

    // 고향 지역 탐사 — 동행 여부와 무관하다
    for (const c of Object.values(companions)) {
      if (c.departedTurn !== null || !isHomeRegion(c, regionId)) continue;
      companions[c.id] = withAffinity(c, AFFINITY.homeRegion);
    }

    next = { ...next, companions };

    const gained = gainXp(next, outcome.xp);
    next = gained.state;
    next = {
      ...next,
      counters: { ...next.counters, expeditions: next.counters.expeditions + 1 },
    };

    // 연대기에 남는다. 서술은 콘텐츠 문장 그대로
    const lines = [narration, ...affinityNotes];
    if (relic !== null && relic !== undefined) lines.push(relic.found);
    const entries = lines
      .filter((t) => t !== '')
      .map((text, i) => makeEntry(next.world.turn, next.chronicle.length + i, text));
    next = { ...next, chronicle: appendEntries(next.chronicle, entries) };

    set({
      state: {
        ...next,
        world: { ...next.world, clearedNodes: [...next.world.clearedNodes, nodeId] },
      },
      explore: {
        regionId,
        outcome,
        narration,
        levelUp: gained.levelUp,
        relicName: relic?.name ?? null,
        relicFound: relic?.found ?? null,
      },
    });
    void get().save('turn-end');
  },

  closeExplore() {
    const { state } = get();
    set({ explore: null });

    // HP 가 0이면 강제 복귀 (§11). 죽지는 않는다
    if (state !== null && state.hero.hp <= 0) {
      const gold = Math.round(state.resources.gold * (1 - DOWNED.goldLossPercent));
      set({
        state: {
          ...state,
          hero: {
            ...state.hero,
            hp: DOWNED.hpOnReturn,
            // 2주는 나갈 수 없다 (§11). 이게 없으면 쓰러져도 곧장 다시 나가진다
            restUntilTurn: state.world.turn + DOWNED.restWeeks,
          },
          resources: { ...state.resources, gold },
          // 쓰러져 실려 와도 동행은 끝난다
          escort: null,
          world: {
            ...state.world,
            currentMap: 'town',
            heroTile: { ...START_HERO_TILE },
            clearedNodes: [],
          },
        },
      });
      void get().save('map-change');
    }
  },

  chooseRegionEvent(index) {
    const open = get().regionEvent;
    const { state } = get();
    if (open === null || state === null || open.result !== null) return;

    const choice = open.event.choices[index];
    if (choice === undefined) return;
    play('choose');

    const applied = applyRegionChoice(state, choice, (id) => FACTION_LABEL[id as FactionId] ?? id);
    let next = applied.state;

    // 유물은 부르는 쪽이 굴린다. 순수 함수가 난수를 쥐지 않는다
    const rng = createRng(`${seedOf(state)}:${state.world.turn}:${open.nodeId}:choice`);
    let relic: { id: string; name: string; found: string } | null = null;
    if (applied.rollRelic) {
      const rolled = rollRelic(next, rng);
      if (rolled !== undefined && rolled !== null) {
        relic = rolled;
        next = { ...next, hero: { ...next.hero, relics: [...next.hero.relics, rolled.id] } };
      }
    }

    const gained = gainXp(next, applied.xp);
    next = gained.state;

    // 연대기에 남긴다. 지나간 일이 기록으로 쌓여야 지역이 기억된다 (§15)
    const line = fillEventText(choice.result, state);
    next = {
      ...next,
      world: {
        ...next.world,
        clearedNodes: [...next.world.clearedNodes, open.nodeId],
      },
      chronicle: appendEntries(next.chronicle, [
        makeEntry(next.world.turn, next.chronicle.length, line),
      ]),
    };

    set({
      state: next,
      regionEvent: {
        ...open,
        result: {
          result: line,
          notes: applied.notes,
          xp: applied.xp,
          levelUp: gained.levelUp,
          relicName: relic?.name ?? null,
          relicFound: relic?.found ?? null,
        },
      },
    });
    void get().save('turn-end');
  },

  closeRegionEvent() {
    set({ regionEvent: null });
  },

  /**
   * 에피소드에 들어선다.
   *
   * 지역에 나가는 것과 같은 값을 치른다 — **1주.** 공짜로 이야기만 얻는
   * 자리를 두면 지역 탐사를 아무도 안 간다. 다만 지역과 달리 맵으로
   * 옮겨가지 않는다. 마을에 선 채로 이야기만 흐른다.
   */
  /**
   * 에피소드에 들어선다.
   *
   * 지역에 나가는 것과 같은 값을 치른다 — **1주.** 그리고 지역과 같이
   * 맵으로 옮겨 간다. 다른 점은 나가는 문이 마을이 아니라 다음 판이라는 것뿐이다.
   */
  startEpisode(episodeId) {
    const { state } = get();
    if (state === null) return;
    const episode = episodeById(episodeId);
    if (episode === null) return;

    // 쓰러진 뒤 쉬는 동안은 나갈 수 없다 (§11). 여기도 나가는 것이다
    if (state.world.turn < state.hero.restUntilTurn) return;

    const weekResult = endWeek(state, {}, createRng(seedOf(state) + state.world.turn));
    const after = weekResult.state;
    const first = episode.stages[0];
    if (first === undefined) return;

    set({
      state: {
        ...after,
        episodeRun: { episodeId, stage: 0, favor: 0, seen: [], duel: null },
        world: {
          ...after.world,
          currentMap: episodeMapId(episodeId, 0),
          heroTile: { ...EPISODE_ENTRY },
          clearedNodes: [],
        },
      },
      regionSelect: false,
      episode: {
        kind: 'enter',
        text: fillEpisodeText(episode.intro + '\n\n' + first.enter, after),
      },
      rival: weekResult.rival ?? get().rival,
    });
    void get().save('map-change');
  },

  openEpisodeScene() {
    const { state } = get();
    if (state === null || get().episode !== null) return;
    const here = currentStage(state);
    if (here === null || here.stage.scene === undefined) return;
    if (state.episodeRun?.seen.includes(here.stage.id) === true) return;
    set({ episode: { kind: 'scene', stageId: here.stage.id, result: null } });
  },

  chooseEpisodeBeat(index) {
    const open = get().episode;
    const { state } = get();
    if (open === null || open.kind !== 'scene' || open.result !== null || state === null) return;

    const here = currentStage(state);
    const choice = here?.stage.scene?.choices[index];
    if (here === null || choice === undefined) return;
    play('choose');

    const applied = applyEpisodeChoice(state, here.stage.id, choice);
    const gained = gainXp(applied.state, applied.xp);
    const line = fillEpisodeText(choice.result, state);

    set({
      state: {
        ...gained.state,
        chronicle: appendEntries(gained.state.chronicle, [
          makeEntry(gained.state.world.turn, gained.state.chronicle.length, line),
        ]),
      },
      episode: {
        ...open,
        result: { result: line, notes: applied.notes, xp: applied.xp, levelUp: gained.levelUp },
      },
    });
    void get().save('turn-end');
  },

  /**
   * 북쪽 문으로 나갔다 → 다음 판.
   *
   * 마지막 판 뒤에는 문이 없다. 거기서는 마주서야 나간다.
   */
  nextEpisodeStage() {
    const { state } = get();
    if (state === null) return;
    const here = currentStage(state);
    if (here === null || state.episodeRun === null) return;
    if (isLastStage(here.episode, here.index)) return;

    const index = here.index + 1;
    const stage = here.episode.stages[index];
    if (stage === undefined) return;

    set({
      state: {
        ...state,
        episodeRun: { ...state.episodeRun, stage: index },
        world: {
          ...state.world,
          currentMap: episodeMapId(here.episode.id, index),
          heroTile: { ...EPISODE_ENTRY },
          clearedNodes: [],
        },
      },
      episode: { kind: 'enter', text: fillEpisodeText(stage.enter, state) },
    });
    void get().save('map-change');
  },

  /**
   * 마주선다 (§11 곁가지).
   *
   * 저울을 세우고 첫 판을 연다. 이미 겨루던 중이면 그 자리에서 이어진다 —
   * 걷다 새로고침해도 밀린 저울이 그대로 있어야 한다.
   */
  faceEpisodeBoss() {
    const { state } = get();
    if (state === null || get().episode !== null) return;
    const here = currentStage(state);
    const boss = here?.stage.boss;
    if (here === null || boss === undefined || state.episodeRun === null) return;

    let next = state;
    if (state.episodeRun.duel === null) {
      next = {
        ...state,
        episodeRun: {
          ...state.episodeRun,
          duel: { track: startTrack(state), round: 0, retried: false },
        },
      };
    }

    set({
      state: next,
      episode: { kind: 'boss', text: fillEpisodeText(boss.text, next), round: null, result: null },
    });
  },

  /**
   * 마주선 판정 (§11).
   *
   * **싸우지 않는다.** 지역과 같은 1d20 에 오는 길에 쌓은 결이 더해진다.
   * 넘기면 그 사람이 따라오고 다음 이야기가 열린다.
   * 못 넘기면 마을로 돌아온다 — 끝낸 표를 남기지 않으니 다시 갈 수 있다.
   */
  /**
   * 한 판 겨룬다 (§11 곁가지).
   *
   * **주사위를 굴리지 않는다.** 상대의 자세는 이미 정해져 있고 기색으로
   * 미리 보여 줬다. 상성대로 갈린다 — 잘 읽었으면 앞서고 못 읽었으면 밀린다.
   */
  pickStance(stance) {
    const open = get().episode;
    const { state } = get();
    if (open === null || open.kind !== 'boss') return;
    if (open.round !== null || open.result !== null || state === null) return;

    const here = currentStage(state);
    const boss = here?.stage.boss;
    const duel = state.episodeRun?.duel;
    if (here === null || boss === undefined || duel === undefined || duel === null) return;
    if (state.episodeRun === null) return;
    play('choose');

    const theirs = theirStance(state, here.episode.id, duel.round);
    const outcome = judge(stance, theirs);
    const step = outcome === 'win' ? 1 : outcome === 'lose' ? -1 : 0;
    const track = Math.max(-DUEL_EDGE, Math.min(DUEL_EDGE, duel.track + step));

    const body =
      outcome === 'win'
        ? ROUND_WIN[stance]
        : outcome === 'lose'
          ? ROUND_LOSE[theirs]
          : (ROUND_DRAW[duel.round % ROUND_DRAW.length] ?? ROUND_DRAW[0] ?? '');
    const line = body + ' ' + (TRACK_TEXT[track] ?? '');

    set({
      state: {
        ...state,
        episodeRun: {
          ...state.episodeRun,
          duel: { ...duel, track, round: duel.round + 1 },
        },
      },
      episode: { ...open, round: { mine: stance, theirs, outcome, line } },
    });
    void get().save('turn-end');
  },

  /**
   * 방금 판을 없던 일로 한다.
   *
   * 결을 넉넉히 쌓아 왔으면 한 번 쓸 수 있다. 오는 길에 이야기 자리를
   * 다 밟은 값이 여기서 나온다 — 굴림에 몇을 더해 주는 것보다
   * **한 번 다시 고르게 해 주는 쪽**이 손에 잡힌다.
   */
  retryRound() {
    const open = get().episode;
    const { state } = get();
    if (open === null || open.kind !== 'boss' || open.round === null || state === null) return;

    const duel = state.episodeRun?.duel;
    if (state.episodeRun === null || duel === undefined || duel === null) return;
    if (duel.retried || (state.episodeRun.favor ?? 0) < RETRY_FAVOR) return;
    play('choose');

    // 저울과 판 번호를 되돌린다. 상대의 자세는 판 번호로 정해지므로 그대로다
    const back = open.round.outcome === 'win' ? -1 : open.round.outcome === 'lose' ? 1 : 0;
    set({
      state: {
        ...state,
        episodeRun: {
          ...state.episodeRun,
          duel: { track: duel.track + back, round: duel.round - 1, retried: true },
        },
      },
      episode: { ...open, round: null },
      toast: RETRY_TEXT,
    });
    void get().save('turn-end');
  },

  /**
   * 결과를 읽었다 → 다음 판. 저울이 갈렸거나 세 판을 다 겨뤘으면 끝을 낸다.
   *
   * 팽팽하게 끝나면 넘긴 것으로 본다 — 걸어온 판 넷을 빈손으로
   * 돌려보내면 다시 갈 마음이 안 생긴다.
   */
  nextRound() {
    const open = get().episode;
    const { state } = get();
    if (open === null || open.kind !== 'boss' || open.round === null || state === null) return;

    const here = currentStage(state);
    const boss = here?.stage.boss;
    const duel = state.episodeRun?.duel;
    if (here === null || boss === undefined || duel === undefined || duel === null) return;

    if (!duelSettled(duel.track, duel.round)) {
      set({ episode: { ...open, round: null } });
      return;
    }

    const won = duelWon(duel.track);
    let next = state;
    let joined: string | null = null;
    const isFaction = here.episode.factionId !== undefined;

    if (won && !isFaction) {
      const grown = addCompanion(next, 'episode', archetypeFor(next, here.episode));
      if (grown !== null) {
        next = grown.state;
        joined = displayName(grown.companion);
      } else {
        // 명단이 찼다 (§7.1 상한 8명). 빈손으로 돌려보내지 않는다
        next = { ...next, resources: { ...next.resources, gold: next.resources.gold + 60 } };
        set({ toast: '명단이 찼다 · 금화 +60' });
      }
    }

    if (won) {
      next = {
        ...next,
        world: {
          ...next.world,
          clearedEpisodes: [...next.world.clearedEpisodes, here.episode.id],
        },
      };
    } else {
      const hp = Math.max(0, next.hero.hp - boss.risk);
      next = { ...next, hero: { ...next.hero, hp } };
    }

    // 세력 이야기는 여기서 끝나지 않는다. 갈래를 고르고 나서 끝난다
    const closing = won ? (isFaction ? '' : here.episode.join) : here.episode.miss;
    const line = fillEpisodeText((won ? boss.win : boss.lose) + '\n\n' + closing, next);
    next = {
      ...next,
      chronicle: appendEntries(next.chronicle, [
        makeEntry(next.world.turn, next.chronicle.length, line),
      ]),
    };

    set({
      state: next,
      episode: {
        ...open,
        round: null,
        result: { won, line, joined, pendingFaction: won && isFaction },
      },
    });
    void get().save('turn-end');
  },

  /**
   * 세력 이야기의 끝 (§7).
   *
   * **어느 쪽도 정답이 아니다.** 도우면 평판과 거래 값이, 복속시키면
   * 조공이 온다. 무엇이 모자라냐에 따라 갈린다.
   */
  settleFaction(mode) {
    const open = get().episode;
    const { state } = get();
    if (open === null || open.kind !== 'boss' || open.result === null || state === null) return;
    if (!open.result.pendingFaction) return;

    const here = currentStage(state);
    const id = here?.episode.factionId;
    const outcome = here?.episode.outcome;
    if (here === null || id === undefined || outcome === undefined) return;
    play('choose');

    let next: GameState = {
      ...state,
      factions: shiftFaction(state.factions, id, HOLD_REPUTATION[mode]),
      world: { ...state.world, factionHolds: { ...state.world.factionHolds, [id]: mode } },
    };

    const line = fillEpisodeText(mode === 'helped' ? outcome.help : outcome.rule, next);
    next = {
      ...next,
      chronicle: appendEntries(next.chronicle, [
        makeEntry(next.world.turn, next.chronicle.length, line),
      ]),
    };

    set({
      state: next,
      episode: {
        ...open,
        result: { ...open.result, line, pendingFaction: false },
      },
      toast: FACTION_LABEL[id] + ' · ' + HOLD_LABEL[mode],
    });
    void get().save('turn-end');
  },

  /**
   * 세력 마을로 간다 (§7).
   *
   * **주를 쓰지 않는다.** 지역이 아니라 마을이라 판정도 표식도 없고,
   * 볼 일만 보고 나온다. 주를 쓰게 하면 아무도 안 간다.
   */
  enterFactionVillage(factionId) {
    const { state } = get();
    if (state === null) return;
    if (state.world.factionHolds[factionId] === undefined) return;
    set({
      state: {
        ...state,
        world: {
          ...state.world,
          currentMap: factionMapId(factionId),
          heroTile: { ...FACTION_ENTRY },
          clearedNodes: [],
        },
      },
      regionSelect: false,
    });
    void get().save('map-change');
  },

  talkToEnvoy() {
    const { state } = get();
    if (state === null) return;
    const id = parseFactionMap(state.world.currentMap);
    if (id === null) return;
    const script = envoyScript(state, id);
    if (script !== null) get().openDialogue(script);
  },

  /**
   * 창을 닫는다.
   *
   * 마주선 결과였으면 이기든 지든 마을로 돌아간다 — 그 판에는 더 볼 게 없다.
   */
  closeEpisode() {
    const open = get().episode;
    if (open !== null && open.kind === 'boss' && open.result !== null) {
      set({ episode: null });
      get().leaveEpisode();
      return;
    }
    set({ episode: null });
  },

  leaveEpisode() {
    const { state } = get();
    if (state === null) return;
    set({
      state: {
        ...state,
        episodeRun: null,
        // 동행은 한 번 나갈 때마다 고른다 (§11). 돌아오면 풀린다
        escort: null,
        world: {
          ...state.world,
          currentMap: 'town',
          heroTile: { ...START_HERO_TILE },
          clearedNodes: [],
        },
      },
      episode: null,
    });
    void get().save('map-change');
  },

  openOuting(companionId) {
    const { state } = get();
    if (state === null) return;
    const outing = outingOf(state);
    if (outing === null || outing.companionId !== companionId) return;

    const intro = OUTING_INTRO[outing.buildingId] ?? [];
    set({
      outing: {
        companionId,
        buildingId: outing.buildingId,
        phase: 'intro',
        // 자리에서 하는 말 + 놀이를 걸어오는 말
        lines: [...intro, ...GAME_INVITE].map((line) =>
          applyToken(line, '{거점}', state.town.name),
        ),
        won: false,
      },
    });
    play('talk');
  },

  startOutingGame() {
    const open = get().outing;
    if (open === null) return;
    set({ outing: { ...open, phase: 'playing' } });
  },

  finishOutingGame(won) {
    const open = get().outing;
    const { state } = get();
    if (open === null || state === null) return;

    const who = state.companions[open.companionId];
    if (who === undefined) return;

    /**
     * 이긴 쪽이 크게 오른다. 진 쪽도 오른다 — 놀이는 놀이다 (§8.4).
     * 벌을 주면 다시 안 하게 된다.
     */
    const delta = won ? OUTING_AFFINITY.win : OUTING_AFFINITY.lose;
    const moved = withAffinity(who, delta);

    set({
      state: { ...state, companions: { ...state.companions, [moved.id]: moved } },
      outing: {
        ...open,
        phase: 'after',
        won,
        lines: won ? [...GAME_WIN] : [...GAME_LOSE],
      },
      toast: `호감 +${delta}`,
    });
    play(won ? 'good' : 'talk');
    void get().save('relationship');
  },

  closeOuting() {
    set({ outing: null });
  },

  openShop() {
    set({ shop: true });
  },

  openRoom(id) {
    set({ room: id, error: null });
  },

  closeRoom() {
    set({ room: null, error: null });
  },

  spendStat(stat) {
    const { state } = get();
    if (state === null) return;
    const result = raiseStat(state, stat);
    if (result.blocked !== 'ok') {
      set({ error: '쓸 점수가 없습니다. 탐사로 경험을 쌓으세요.' });
      return;
    }
    set({ state: result.state, error: null });
    play('build');
    void get().save('manual');
  },

  spendSkill(skillId) {
    const { state } = get();
    if (state === null) return;
    const result = raiseSkill(state, skillId);
    if (result.blocked !== 'ok') {
      set({
        error:
          result.blocked === 'maxed'
            ? '이미 끝까지 올렸습니다.'
            : '쓸 점수가 없습니다. 탐사로 경험을 쌓으세요.',
      });
      return;
    }
    set({ state: result.state, error: null });
    play('build');
    void get().save('manual');
  },

  offer() {
    const { state } = get();
    if (state === null) return;
    const result = makeOffering(state);
    if (result.healed <= 0) {
      set({ error: OFFERING_POOR });
      return;
    }
    set({ state: result.state, error: null, toast: `${OFFERING_DONE} 기력 +${result.healed}` });
    play('warm');
    void get().save('manual');
  },

  closeShop() {
    set({ shop: false });
  },

  openBuildPanel(buildingId) {
    set({ buildPanel: buildingId });
  },

  closeBuildPanel() {
    set({ buildPanel: null });
  },

  raiseBuilding(buildingId) {
    const { state } = get();
    if (state === null) return;

    const result = build(state, buildingId);
    if (result.level === null) {
      set({ error: blockMessage(result.blocked) });
      return;
    }

    play('build');

    // 건설도 연대기에 남는다 (§4). 주 종료를 기다리지 않는다
    const def = getBuilding(buildingId);
    const entry = makeEntry(
      result.state.world.turn,
      result.state.chronicle.length,
      CHRONICLE_TEXT.build(def?.name ?? buildingId, result.level),
    );

    set({
      state: { ...result.state, chronicle: appendEntries(result.state.chronicle, [entry]) },
      error: null,
    });
    void get().save('build');
  },

  /**
   * 이번 주를 쉬는 데 쓴다.
   *
   * 주를 넘기는 길이 탐사뿐이면 쓰러진 뒤 2주 금족이 그대로 **막다른 길**이 된다.
   * 나가지도 못하고 주도 안 가니 영영 그 자리다. 쉬는 쪽도 한 주를 쓴다 —
   * 공짜가 아니라 탐사와 맞바꾸는 선택이다.
   */
  restWeek() {
    const { state } = get();
    if (state === null) return;
    const before = state.hero.hp;
    get().endWeek();
    const after = get().state?.hero.hp ?? before;
    set({ regionSelect: false });
    set({ toast: after > before ? `한 주를 쉬었다 · 기력 +${after - before}` : '한 주를 쉬었다' });
  },

  endWeek() {
    const { state } = get();
    if (state === null) return;
    const result = endWeek(state, {}, createRng(seedOf(state) + state.world.turn));
    set({ state: result.state, rival: result.rival ?? get().rival });

    if (result.collapsed) {
      // 원장에 붕괴 시점을 남긴다. 이건 불러오기로 지워지지 않는다 (§14)
      const ledger = mergeLedger(get().ledger, {
        ledgerVersion: get().ledger.ledgerVersion,
        maxTurnReached: result.state.world.turn,
        collapses: result.state.counters.collapses,
        lastCollapseTurn: result.state.world.turn,
      });
      set({ ledger, toast: '무너졌다', approaching: null });
      play('collapse');
      void saveLedger(getStorage(), ledger);
    }

    void get().save('turn-end');
  },

  sellRelicForTime() {
    const { state } = get();
    if (state === null || state.hero.relics.length === 0) return;

    // 값을 따지지 않는다. 하나 넘기고 곡식을 받는다
    const [given, ...rest] = state.hero.relics;
    const next: GameState = {
      ...state,
      hero: { ...state.hero, relics: rest },
      resources: { ...state.resources, food: state.resources.food + RELIC_SALE_FOOD },
      counters: { ...state.counters, famineWeeks: 0 },
    };

    const entry = makeEntry(next.world.turn, next.chronicle.length, COLLAPSE_TEXT.relicSold);
    set({
      state: { ...next, chronicle: appendEntries(next.chronicle, [entry]) },
      toast: `${getRelic(given ?? '')?.name ?? '유물'}을 넘겼다`,
    });
    void get().save('manual');
  },

  setPrompt(label) {
    if (get().prompt !== label) set({ prompt: label });
  },

  clearToast() {
    set({ toast: null });
  },

  showHint(id, text) {
    const { state } = get();
    // 한 번 본 것은 다시 띄우지 않는다
    if (state === null || state.counters.firsts[id] === true) return;
    set({
      state: { ...state, counters: { ...state.counters, firsts: { ...state.counters.firsts, [id]: true } } },
      hint: text,
    });
    void get().save('manual');
  },

  dismissHint() {
    set({ hint: null });
  },

  faceHero(dir) {
    const { state } = get();
    if (state === null || state.world.heroTile.dir === dir) return;
    set({
      state: {
        ...state,
        world: { ...state.world, heroTile: { ...state.world.heroTile, dir } },
      },
    });
    scheduleSettleSave(get);
  },

  stepHero(to, dir) {
    const { state } = get();
    if (state === null) return;
    set({
      state: {
        ...state,
        world: { ...state.world, heroTile: { x: to.x, y: to.y, dir } },
      },
    });
    scheduleSettleSave(get);
  },
}));

/**
 * 어디에 서 있는지는 세이브의 일부다 (§4). 다만 걸음마다 쓰지는 않는다 —
 * 발이 멎고 SETTLE_MS 뒤에 한 번만 쓴다.
 */
function scheduleSettleSave(get: () => GameStore): void {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    void get().save('map-change');
  }, SETTLE_MS);
}

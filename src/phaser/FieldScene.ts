/**
 * 필드 씬 — 마을을 걸어다니는 화면.
 *
 * 이 씬은 `GameState` 를 **읽기만** 한다. 갱신은 `syncFromState` 한 곳으로 들어오고,
 * 상태를 바꿔야 할 때는 콜백으로 올려서 스토어 액션이 처리한다.
 * 갈 수 있는가·방향만 바꾸는가는 systems/movement.ts 가 정한다. 여기는 시간과 그림만 맡는다.
 */

import Phaser from 'phaser';
import type { Dir, GameState } from '@/types/game';
import type { MapObject, TileMapData } from '@/types/map';
import { CHAR_SHEET, IDLE_FRAME, WALK_FPS, WALK_ORDER, frameIndex } from '@/data/characters';
import { ASSETS, getAsset } from '@/data/assets';
import { getBuilding } from '@/data/buildings';
import { CHAR_TINT_SCALE, PALETTE, SEASON_TINT } from '@/data/palette';
import { STEP_MS, TILE, TURN_HOLD_MS } from '@/data/layout';
import { seasonOf } from '@/data/seasons';
import { isBlocked, loadMap, mapKey, objectAt, type MapContext } from '@/systems/map';
import { currentStage } from '@/systems/episodes';
import { extraBlocked, ruleOf } from '@/systems/stageRule';
import { interactionAt, resolveMove, type HeroTile } from '@/systems/movement';
import { residentsOf, townFolk } from '@/systems/roster';
import { displayName } from '@/systems/relationships';
import { companionSprite } from '@/data/sprites';
import { patronMark } from '@/systems/quests';
import { PATRON_VOICES } from '@/data/content/patron-dialogue';
import { PATRON_ERA_MIN } from '@/data/maps/indoor';
import { isOut, patronOutingOf, visitorAt } from '@/systems/outing';
import { buildingIdFromIndoor } from '@/data/maps/indoor';
import { drawPlaceholder } from '@/render/placeholder';
import { paintMapCanvas } from '@/render/terrain';
import {
  drawEventMarker,
  drawLootMarker,
  drawSpentMarker,
  drawSpotMarker,
  drawEscortMarker,
  drawOfferBadge,
  drawReportBadge,
} from '@/render/markers';
import { readInput } from './inputBus';
import { play } from '@/audio/sfx';

const S = TILE.source;
const HERO_SPRITE = 'char.hero';

export interface FieldSceneCallbacks {
  /** 한 칸 옮겨갔다 */
  onStep: (to: { x: number; y: number }, dir: Dir) => void;
  /** 방향만 바뀌었다 */
  onFace: (dir: Dir) => void;
  /** 하단 프롬프트 문구가 바뀌었다. 없으면 null */
  onPrompt: (label: string | null) => void;
  /** A 를 눌렀다. 바라보는 자리에 아무것도 없으면 null */
  onAction: (object: MapObject | null) => void;
  /** 한 칸 밟고 올라섰다. 지역 사건 노드는 밟는 것으로 발동한다 (§11) */
  onEnterTile: (object: MapObject) => void;
  /** 다가오던 인물이 앞까지 왔다 (§7.3) */
  onApproachArrive: () => void;
}

/** 바라보는 방향의 반대. 동행자를 뒤에 세울 때 쓴다 */
const BEHIND: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
};

/** 타일 좌표를 세계 좌표로. 스프라이트 기준점은 발밑(가운데 아래)이다 */
const worldX = (tx: number) => tx * S + S / 2;
const worldY = (ty: number) => ty * S + S;

/** 지금 서 있는 판의 id. 에피소드 밖이면 빈 문자열 */
function stageIdOf(state: GameState): string {
  return currentStage(state)?.stage.id ?? '';
}

export class FieldScene extends Phaser.Scene {
  static readonly KEY = 'field';

  private readonly cbs: FieldSceneCallbacks;

  private map: TileMapData | null = null;
  /** 지금 그려 둔 맵의 열쇠. 시대나 건물 레벨이 바뀌면 달라진다 */
  private mapKeyDrawn: string | null = null;
  /** 프롬프트가 건설·증축을 가르려면 레벨을 알아야 한다 */
  private buildings: Record<string, number> = {};
  private seasonOverlay: Phaser.GameObjects.Rectangle | null = null;
  /** 지금 걸어오고 있는 인물의 스프라이트 */
  private approachSprite: Phaser.GameObjects.Sprite | null = null;
  /** 씬이 서기 전에 들어온 다가옴 요청 */
  private wantApproach: string | null = null;
  /** 사건 노드 표식. 밟은 것만 골라 바꾸려고 id 로 들고 있는다 */
  private markerLayer: Phaser.GameObjects.Group | null = null;
  /** 건물 이름표. 마을에서만 쓴다 */
  private labelLayer: Phaser.GameObjects.Group | null = null;
  private readonly markers = new Map<string, Phaser.GameObjects.Image>();
  private cleared: string[] = [];
  private readonly reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private hero: HeroTile = { x: 0, y: 0, dir: 'down' };
  private heroSprite: Phaser.GameObjects.Sprite | null = null;
  private npcLayer: Phaser.GameObjects.Group | null = null;
  /**
   * 판 규칙으로 막힌 칸 (§11 곁가지).
   *
   * 깨진 발판과 사라진 길을 그린다. **상태가 아니다** — 매 갱신마다
   * `stageRule.extraBlocked` 를 다시 물어 그린다.
   */
  private ruleLayer: Phaser.GameObjects.Graphics | null = null;
  private ruleBlocked: ReadonlySet<string> = new Set<string>();
  /** 지역에서 뒤를 따라오는 동행자 (§11) */
  private escortSprite: Phaser.GameObjects.Sprite | null = null;
  private escortSpriteId = '';
  private escortTile = { x: 0, y: 0 };
  private mapImage: Phaser.GameObjects.Image | null = null;
  /** 인물 발밑 이름표. 주인 스프라이트를 따라다닌다 */
  private nameTags: { owner: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject; tag: Phaser.GameObjects.Text }[] = [];
  /** 주인공 이름. 이름 짓기에서 바뀔 수 있어 들고 있는다 */
  private heroName = '';

  /** create() 전에 들어온 상태를 담아 둔다 */
  private pending: GameState | null = null;
  private ready = false;

  // 이동 진행 상태. 게임 상태가 아니라 애니메이션 상태다
  private walking = false;
  private queued: Dir | null = null;
  /** 맵이 갈린 뒤, 누르고 있던 방향을 놓을 때까지 걷지 않는다 */
  private holdBlocked = false;
  private turnUntil = 0;
  private lastPressCount = 0;
  private lastActionCount = 0;
  private lastPrompt: string | null = null;
  /** 대화가 열려 있으면 필드는 입력을 받지 않는다 */
  private paused = false;

  constructor(cbs: FieldSceneCallbacks) {
    super({ key: FieldScene.KEY });
    this.cbs = cbs;
  }

  // ── 적재 ────────────────────────────────────────────────

  preload(): void {
    // 매니페스트에 경로가 있는 캐릭터만 싣는다. 없으면 플레이스홀더로 간다
    for (const entry of ASSETS) {
      if (entry.kind !== 'character' || entry.path === null) continue;
      const sheet = entry.sheet ?? CHAR_SHEET;
      this.load.spritesheet(entry.id, new URL(entry.path, document.baseURI).href, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        spacing: sheet.spacing,
        margin: sheet.margin,
      });
    }

    // 한 장이 없어도 게임은 돌아야 한다. 실패는 조용히 넘기고 플레이스홀더를 쓴다
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`에셋 '${file.key}' 를 싣지 못했다. 플레이스홀더로 그린다.`);
    });
  }

  create(): void {
    this.ready = true;
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(TILE.scale);

    this.npcLayer = this.add.group();

    if (this.pending !== null) this.applyState(this.pending);
  }

  // ── 상태 반영 ───────────────────────────────────────────

  /** GameState 가 들어오는 유일한 통로 */
  syncFromState(state: GameState): void {
    this.pending = state;
    if (this.ready) this.applyState(state);
  }

  private applyState(state: GameState): void {
    this.buildings = state.town.buildings;

    // 이름을 새로 지었으면 이름표도 다시 단다
    if (state.hero.name !== this.heroName) {
      this.heroName = state.hero.name;
      if (this.heroSprite !== null) {
        this.nameTags = this.nameTags.filter(({ owner, tag }) => {
          if (owner !== this.heroSprite) return true;
          tag.destroy();
          return false;
        });
        this.makeNameTag(this.heroSprite, this.heroName);
      }
    }

    /**
     * 이번 주 회관을 나와 있는 의뢰인 (§7.6 나들이).
     * 그 시대에 나온 사람 중에서만 뽑는다 — 아직 없는 사람이 밖에 서 있으면 안 된다.
     */
    const outPatron = patronOutingOf(
      state,
      Object.keys(PATRON_VOICES).filter((id) => state.world.eraIndex >= (PATRON_ERA_MIN[id] ?? 99)),
    );

    const ctx: MapContext = {
      mapId: state.world.currentMap,
      eraIndex: state.world.eraIndex,
      buildings: state.town.buildings,
      // 숙소에 누가 사는지는 관계 상태에서 나온다 (§7.4).
      // 이번 주 나가 있는 사람은 집에 없다
      residents: residentsOf(state)
        .filter((c) => !isOut(state, c.id))
        .map((c) => ({ id: c.id, archetypeId: c.archetypeId, name: displayName(c) })),
      // 마을에 서 있을 인물 (§7.6). 동행 중인 사람과 숙소 거주자는 빠진다
      // 동행 노드는 데려갔을 때만 생긴다 (§11)
      escorted: state.escort !== null,
      // 갈 때마다 새 지형. 그 탐사 안에서는 주차가 안 바뀌므로 고정이다 (§11)
      visit: state.world.turn,
      // 이 판의 이야기를 이미 봤는가 (§11 곁가지). 봤으면 표식이 사라진다
      sceneDone: state.episodeRun !== null && state.episodeRun.seen.length > 0
        ? state.episodeRun.seen.includes(stageIdOf(state))
        : false,
      // 누구에게 볼 일이 있는지 (§7.6). 머리 위 표로 나간다
      patronMarks: Object.fromEntries(
        Object.keys(PATRON_VOICES)
          .filter((id) => id !== outPatron)
          .map((id) => [id, patronMark(state, id)] as const)
          .filter((pair): pair is readonly [string, 'offer' | 'report'] => pair[1] !== null),
      ),
      // 회관을 나와 마을에 서 있는 의뢰인 (§7.6). 회관에서는 빠진다
      ...(outPatron !== null
        ? {
            patronOut: {
              id: outPatron,
              name: PATRON_VOICES[outPatron]?.name ?? '',
              ...(patronMark(state, outPatron) !== null
                ? { badge: patronMark(state, outPatron) as 'offer' | 'report' }
                : {}),
            },
            patronAway: outPatron,
          }
        : {}),
      folk: townFolk(state)
        .filter((c) => !isOut(state, c.id))
        .map((c) => ({ id: c.id, archetypeId: c.archetypeId, name: displayName(c) })),
    };

    // 이번 주 이 건물에 나와 있는 사람 (§7.6 나들이)
    const indoorOf = buildingIdFromIndoor(state.world.currentMap);
    if (indoorOf !== null) {
      const guest = visitorAt(state, indoorOf);
      if (guest !== null) {
        ctx.visitor = {
          id: guest.id,
          archetypeId: guest.archetypeId,
          name: displayName(guest),
        };
      }
    }

    // 건물을 올리면 열쇠가 달라진다. 그때 마을 그림을 다시 굽는다
    const key = mapKey(ctx);
    const changed = key !== this.mapKeyDrawn;
    if (changed) {
      this.mapKeyDrawn = key;
      this.buildMap(ctx, key);
    }

    this.applySeason(state.world.week);

    // 씬이 서기 전에 들어온 다가옴이 있으면 이제 시작한다
    if (this.wantApproach !== null && this.map !== null && this.heroSprite !== null) {
      const pending = this.wantApproach;
      this.wantApproach = null;
      this.setApproach(pending);
    }

    /**
     * 걷는 중에는 씬이 앞서 있으므로 트윈과 싸우지 않게 둔다.
     *
     * **맵이 갈렸으면 예외다.** 한 걸음 걷는 중에 문에 닿아 A 를 누르면
     * 맵은 바뀌는데 씬은 옛 좌표를 들고 있다가, 트윈이 끝나면서 그 좌표를
     * 새 맵의 위치로 되써 버린다 — 들어가고 나올 때 엉뚱한 자리에 서 있던 원인이다.
     * buildMap 이 걷던 것을 끊어 두었으므로 여기서 새 자리로 앉힌다.
     */
    if (!this.walking || changed) {
      const tile = state.world.heroTile;
      this.hero = { x: tile.x, y: tile.y, dir: tile.dir };
      this.placeHero();
      this.refreshPrompt();
    }

    // 주인공 자리가 정해진 뒤에 세운다 — 뒤쪽 칸을 알아야 하기 때문이다
    this.syncEscort(state);

    // 판 규칙으로 막힌 칸 (§11 곁가지). 맵을 고치지 않고 위에 덧그린다
    this.syncRuleTiles(state);
  }

  /**
   * 깨진 발판과 사라진 길, 벌어진 틈을 그린다 (§11 곁가지).
   *
   * **맵의 collision 을 건드리지 않는다.** 맵은 캐시되어 여러 판이 나눠 쓰므로,
   * 한 번 깨면 다음에 와도 깨진 채가 된다. 상태를 물어 매번 다시 그린다.
   */
  private syncRuleTiles(state: GameState): void {
    const here = currentStage(state);
    const look = here?.stage.look ?? null;
    const rule = look === null ? null : ruleOf(look);

    if (rule === null || this.map === null) {
      this.ruleBlocked = new Set<string>();
      this.ruleLayer?.clear();
      return;
    }

    const blocked = extraBlocked(state, look, this.map);
    this.ruleBlocked = blocked;

    if (this.ruleLayer === null) {
      this.ruleLayer = this.add.graphics();
      // 지형 위, 인물 아래
      this.ruleLayer.setDepth(1);
    }
    const g = this.ruleLayer;
    g.clear();

    const fill = Phaser.Display.Color.HexStringToColor(PALETTE.ink).color;
    const edge = Phaser.Display.Color.HexStringToColor(PALETTE.blood).color;

    for (const key of blocked) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const px = x * S;
      const py = y * S;

      // 발 디딜 데가 없다는 뜻이다. 어둡게 덮고 테두리를 붉게 둔다
      g.fillStyle(fill, rule === 'rift' ? 0.85 : 0.65);
      g.fillRect(px, py, S, S);
      g.lineStyle(1, edge, 0.7);
      g.strokeRect(px + 0.5, py + 0.5, S - 1, S - 1);
    }

    /**
     * 아직 한 번만 밟은 칸도 표시한다 (유리 다리).
     * 두 번 밟으면 깨진다는 규칙은 **밟기 전에 보여야** 규칙이다.
     */
    if (rule === 'crack') {
      const once = new Set<string>();
      const seen = new Set<string>();
      for (const key of state.world.steppedTiles) {
        if (seen.has(key)) once.delete(key);
        else {
          seen.add(key);
          once.add(key);
        }
      }
      g.lineStyle(1, edge, 0.35);
      for (const key of once) {
        const parts = key.split(',');
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        g.beginPath();
        g.moveTo(x * S + 3, y * S + S - 3);
        g.lineTo(x * S + S - 3, y * S + 3);
        g.strokePath();
      }
    }
  }

  private buildMap(ctx: MapContext, cacheKey: string): void {
    /**
     * 걷던 것을 끊는다.
     *
     * 스프라이트를 새로 세우는데 옛 스프라이트를 겨눈 트윈이 남아 있으면
     * 그 트윈의 onComplete 가 `finishStep` 을 불러 **옛 좌표를 새 맵에
     * 기록하고, 쌓인 입력으로 한 걸음 더 걷는다.** 위치가 어긋나는 자리다.
     */
    if (this.heroSprite !== null) this.tweens.killTweensOf(this.heroSprite);
    if (this.escortSprite !== null) this.tweens.killTweensOf(this.escortSprite);
    this.walking = false;
    this.queued = null;
    /**
     * 누르고 있던 방향을 새 맵으로 넘기지 않는다.
     *
     * 걸어가며 A 로 문에 들어가면 손은 아직 방향판을 누른 채다. 그 hold 가
     * 그대로 이어져 들어선 자리에서 한 칸 더 걸었다 — 진입 자리가 (6,13)
     * 이어야 하는데 (6,12) 로, 퇴장은 문 앞이 아니라 그 아래로 밀렸다.
     * **다시 누를 때까지** 걷지 않는다. 문을 여는 A 와 걷는 입력은 다른 뜻이다.
     */
    this.holdBlocked = true;

    const map = loadMap(ctx);
    this.map = map;

    // 타일마다 객체를 만들지 않는다. 한 장으로 구워서 이미지 하나로 붙인다
    const key = `map:${cacheKey}`;
    if (this.textures.exists(key)) this.textures.remove(key);

    const tex = this.textures.createCanvas(key, map.width * S, map.height * S);
    if (tex !== null) {
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;
      paintMapCanvas(ctx, map.width, map.height, map.ground, map.deco);
      tex.refresh();
    }

    this.mapImage?.destroy();
    this.mapImage = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-1000);

    // 실제 bounds 는 centerSmallMap 이 화면 크기를 보고 정한다
    this.lastBounds = '';

    // 이름표는 주인을 따라 붙는다. 주인을 새로 세우니 먼저 걷는다
    this.clearNameTags();

    this.buildNpcs(map);
    this.buildMarkers(map);
    this.buildLabels(map);
    this.buildHero();
    // 맵이 갈리면 옛 스프라이트는 버린다. 다음 syncEscort 가 다시 세운다
    this.escortSprite?.destroy();
    this.escortSprite = null;
    this.escortSpriteId = '';
    this.buildSeasonOverlay(map);
  }

  /**
   * 사건 노드 표식 (§11).
   *
   * 노드가 안 보이면 아무 데나 걷다가 갑자기 판정이 뜬다.
   * 어디로 가야 하는지 보여야 지역을 걸어다니는 뜻이 생긴다.
   * 맵 텍스처에 굽지 않고 따로 얹는다 — 밟은 것만 골라 바꿔야 하기 때문이다.
   */
  private buildMarkers(map: TileMapData): void {
    this.markerLayer?.clear(true, true);
    this.markers.clear();
    this.markerLayer ??= this.add.group();

    this.ensureMarkerTexture('marker:loot', drawLootMarker);
    this.ensureMarkerTexture('marker:event', drawEventMarker);
    this.ensureMarkerTexture('marker:spent', drawSpentMarker);
    this.ensureMarkerTexture('marker:spot', drawSpotMarker);
    this.ensureMarkerTexture('marker:escort', drawEscortMarker);
    this.ensureMarkerTexture('badge:offer', drawOfferBadge);
    this.ensureMarkerTexture('badge:report', drawReportBadge);

    /**
     * 실내에서 일을 보는 자리 (§10).
     *
     * 빈 바닥 한 칸이라 그 위에 서야만 프롬프트가 떴다 — 어디서 거래하고
     * 어디서 증축하는지 몰라 계속 지나치게 된다. 표를 세우고 이름을 붙인다.
     * 지역 노드와 달리 흔들지 않는다. 실내에서 계속 까딱거리면 어지럽다.
     */
    for (const obj of map.objects) {
      if (obj.type !== 'node') continue;
      if (obj.nodeKind !== undefined) continue;
      const isSpot = obj.shop === true || obj.room !== undefined || obj.building !== undefined;
      if (!isSpot) continue;

      const spot = this.add.image(worldX(obj.x), worldY(obj.y), 'marker:spot');
      spot.setOrigin(0.5, 1);
      // 주인공보다 뒤에 둔다. 밟고 서면 사람이 가려지면 안 된다
      spot.setDepth(worldY(obj.y) - 1);
      this.markerLayer.add(spot);
      this.makeNameTag(spot, obj.label ?? '');
    }

    for (const obj of map.objects) {
      if (obj.nodeKind === undefined) continue;
      const key =
        obj.nodeKind === 'loot'
          ? 'marker:loot'
          : obj.nodeKind === 'escort'
            ? 'marker:escort'
            : 'marker:event';
      const sprite = this.add.image(worldX(obj.x), worldY(obj.y), key);
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(worldY(obj.y) - 1);
      this.markerLayer.add(sprite);
      this.markers.set(obj.id, sprite);

      // 살짝 떠올랐다 가라앉는다. 멀리서도 눈에 걸리라고
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: sprite,
          y: sprite.y - 2,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
    }

    this.applyCleared();
  }

  private ensureMarkerTexture(key: string, draw: (ctx: CanvasRenderingContext2D) => void): void {
    if (this.textures.exists(key)) return;
    const tex = this.textures.createCanvas(key, S, S);
    if (tex === null) return;
    draw(tex.getContext());
    tex.refresh();
  }

  /** 이미 밟은 노드는 흔적만 남긴다. 어디를 봤는지 알아야 한다 */
  setCleared(ids: string[]): void {
    this.cleared = ids;
    this.applyCleared();
  }

  private applyCleared(): void {
    for (const [id, sprite] of this.markers) {
      if (!this.cleared.includes(id)) continue;
      this.tweens.killTweensOf(sprite);
      sprite.setTexture('marker:spent');
      sprite.setAlpha(0.55);
    }
  }

  /**
   * 계절 틴트 — 곱셈 오버레이 (§12).
   * 세계에는 그대로 걸고, 인물에는 CHAR_TINT_SCALE 만큼만 건다.
   * 100%로 걸면 인물이 배경과 함께 물들어 안 읽힌다.
   */
  private buildSeasonOverlay(map: TileMapData): void {
    this.seasonOverlay?.destroy();
    const rect = this.add.rectangle(0, 0, map.width * S, map.height * S, 0xffffff, 0);
    rect.setOrigin(0, 0);
    rect.setBlendMode(Phaser.BlendModes.MULTIPLY);
    // 인물보다 위, UI 보다 아래
    rect.setDepth(100000);
    this.seasonOverlay = rect;
  }

  private applySeason(week: number): void {
    const tint = SEASON_TINT[seasonOf(week)];
    const color = Phaser.Display.Color.HexStringToColor(tint.color).color;

    this.seasonOverlay?.setFillStyle(color, tint.alpha);

    // 캐릭터는 절반 강도. 곱셈 틴트라서 흰색 쪽으로 섞어 옅게 만든다
    const charTint = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xffffff),
      Phaser.Display.Color.ValueToColor(color),
      100,
      Math.round(tint.alpha * CHAR_TINT_SCALE * 100),
    );
    const packed = Phaser.Display.Color.GetColor(charTint.r, charTint.g, charTint.b);

    this.heroSprite?.setTint(packed);
    this.npcLayer?.getChildren().forEach((child) => {
      (child as Phaser.GameObjects.Sprite).setTint(packed);
    });
  }

  /** 시트가 실제로 실렸는지. 실패했으면 플레이스홀더 텍스처를 만들어 준다 */
  private textureFor(spriteId: string): string {
    if (this.textures.exists(spriteId)) return spriteId;

    const key = `ph:${spriteId}`;
    if (!this.textures.exists(key)) {
      const entry = getAsset(spriteId);
      const w = entry?.sheet?.frameWidth ?? CHAR_SHEET.frameWidth;
      const h = entry?.sheet?.frameHeight ?? CHAR_SHEET.frameHeight;
      const tex = this.textures.createCanvas(key, w, h);
      if (tex !== null) {
        drawPlaceholder(tex.getContext(), {
          width: w,
          height: h,
          label: spriteId,
          color: entry?.placeholder.color ?? 'clothWarm',
        });
        tex.refresh();
      }
    }
    return key;
  }

  /** 방향별 걷기 애니메이션. 프레임 배열은 characters.ts 값을 그대로 쓴다 */
  private ensureAnims(spriteId: string): boolean {
    if (!this.textures.exists(spriteId)) return false;
    for (const dir of ['down', 'left', 'up', 'right'] as const) {
      const key = `${spriteId}-walk-${dir}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: WALK_ORDER.map((col) => ({ key: spriteId, frame: frameIndex(dir, col) })),
        frameRate: WALK_FPS,
        repeat: -1,
      });
    }
    return true;
  }

  private buildNpcs(map: TileMapData): void {
    this.npcLayer?.clear(true, true);

    for (const obj of map.objects) {
      if (obj.type !== 'npc') continue;

      /**
       * **스프라이트가 없어도 세운다.**
       *
       * 예전에는 `obj.sprite === undefined` 면 통째로 건너뛰었다. 그래서
       * 마지막 판에 선 것과 세력 마을 사람들이 하나도 안 보였다 —
       * 길만 막혀 있고 무엇이 막고 있는지 알 수가 없었다.
       * `textureFor` 가 그림이 없으면 플레이스홀더를 만들어 준다.
       */
      const spriteId = obj.sprite ?? 'figure:folk';
      const texKey = this.textureFor(spriteId);
      const sprite = this.add.sprite(worldX(obj.x), worldY(obj.y), texKey);
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(worldY(obj.y));
      // 인물은 아래를 보고 서 있는다. 말을 걸면 돌아보는 건 대화가 붙을 때다
      if (this.ensureAnims(spriteId)) sprite.setFrame(frameIndex('down', IDLE_FRAME));
      this.npcLayer?.add(sprite);
      this.makeNameTag(sprite, obj.label ?? '');

      /**
       * 볼 일이 있으면 머리 위에 표를 세운다 (§7.6).
       *
       * 회관에 여섯이 서 있는데 누구에게 볼 일이 있는지 알 방법이 없었다 —
       * 하나씩 붙잡고 말을 걸어 봐야 했다.
       */
      if (obj.badge !== undefined) {
        const bang = this.add.image(
          worldX(obj.x),
          worldY(obj.y) - CHAR_SHEET.frameHeight,
          obj.badge === 'report' ? 'badge:report' : 'badge:offer',
        );
        bang.setOrigin(0.5, 1);
        bang.setDepth(worldY(obj.y) + 1);
        this.npcLayer?.add(bang);

        // 눈에 걸리게 조금 까딱인다. 움직임을 줄여 뒀으면 가만히 둔다
        if (!this.reducedMotion) {
          this.tweens.add({
            targets: bang,
            y: bang.y - 2,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
          });
        }
      }
    }
  }

  /**
   * 건물 이름표 (§10).
   *
   * 건물 그림만으로는 어느 것이 서고이고 어느 것이 신전인지 알 수 없다.
   * 부지마다 문 아래에 이름을 적는다. 안 지은 자리도 적는다 —
   * 무엇을 지을 수 있는지 보여야 마을을 키울 마음이 생긴다.
   *
   * **마을에서만 붙인다.** 실내는 이미 어느 건물인지 알고 들어온 것이라
   * 이름표가 붙으면 잔소리가 된다.
   *
   * 글씨는 화면 픽셀 크기로 굽고 1/배율로 줄여 놓는다. 카메라가 다시 2배로
   * 당기므로 결과가 1:1 이 되어 흐려지지 않는다.
   */
  private buildLabels(map: TileMapData): void {
    this.labelLayer?.clear(true, true);
    this.labelLayer ??= this.add.group();

    if (map.id !== 'town') return;

    for (const obj of map.objects) {
      if (obj.building === undefined) continue;
      const def = getBuilding(obj.building);
      if (def === undefined) continue;

      const level = this.buildings[obj.building] ?? 0;
      const text = level > 0 ? `${def.name} ${level}` : def.name;

      const label = this.add.text(worldX(obj.x), worldY(obj.y) + 2, text, {
        fontFamily: 'Pretendard, system-ui, sans-serif',
        fontSize: '11px',
        // 지은 것은 또렷하게, 빈 자리는 물러나게
        color: level > 0 ? PALETTE.paper : PALETTE.paperDim,
        // 풀밭 위에서도 읽히게 어두운 테두리를 두른다
        stroke: PALETTE.ink,
        strokeThickness: 3,
      });
      label.setOrigin(0.5, 0);
      label.setScale(1 / TILE.scale);
      // 인물보다 앞에 둔다. 맵 아래쪽 건물에 가리지 않게
      label.setDepth(10_000);
      this.labelLayer.add(label);
    }
  }

  /**
   * 인물 발밑 이름표.
   *
   * 건물 이름표(buildLabels)와 달리 **스프라이트를 따라다녀야 한다** —
   * 동행자도 다가오는 인물도 움직인다. 그래서 자리를 굳히지 않고
   * 매 프레임 주인 스프라이트에 맞춘다.
   *
   * 글씨는 화면 픽셀로 굽고 1/배율로 줄인다. 카메라가 2배로 당기니 1:1 이 된다.
   */
  private makeNameTag(
    owner: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
    text: string,
  ): void {
    if (text === '') return;

    const tag = this.add.text(owner.x, owner.y + 2, text, {
      fontFamily: 'Pretendard, system-ui, sans-serif',
      fontSize: '11px',
      color: PALETTE.paper,
      // 풀밭이든 마루든 읽히게 어두운 테두리를 두른다
      stroke: PALETTE.ink,
      strokeThickness: 3,
    });
    tag.setOrigin(0.5, 0);
    tag.setScale(1 / TILE.scale);
    tag.setDepth(10_000);
    this.nameTags.push({ owner, tag });
  }

  /** 주인이 사라졌으면 이름표도 걷는다. 아니면 발밑에 맞춘다 */
  private syncNameTags(): void {
    this.nameTags = this.nameTags.filter(({ owner, tag }) => {
      if (!owner.active) {
        tag.destroy();
        return false;
      }
      tag.setPosition(owner.x, owner.y + 2);
      return true;
    });
  }

  private clearNameTags(): void {
    for (const { tag } of this.nameTags) tag.destroy();
    this.nameTags = [];
  }

  private buildHero(): void {
    this.heroSprite?.destroy();
    const texKey = this.textureFor(HERO_SPRITE);
    this.heroSprite = this.add.sprite(0, 0, texKey).setOrigin(0.5, 1);
    this.ensureAnims(HERO_SPRITE);
    this.placeHero();
    this.cameras.main.startFollow(this.heroSprite, true, 1, 1);
    this.makeNameTag(this.heroSprite, this.heroName);
  }

  private placeHero(): void {
    const s = this.heroSprite;
    if (s === null) return;
    s.setPosition(worldX(this.hero.x), worldY(this.hero.y));
    s.setDepth(worldY(this.hero.y));
    this.setIdleFrame();
  }

  private setIdleFrame(): void {
    const s = this.heroSprite;
    if (s === null) return;
    s.anims.stop();
    if (this.textures.exists(HERO_SPRITE)) {
      s.setFrame(frameIndex(this.hero.dir, IDLE_FRAME));
    }
  }

  private playWalk(dir: Dir): void {
    this.playWalkOn(this.heroSprite, HERO_SPRITE, dir);
  }

  /** 아무 스프라이트나 걷는 동작으로. 주인공과 동행자가 같이 쓴다 */
  private playWalkOn(
    sprite: Phaser.GameObjects.Sprite | null,
    spriteId: string,
    dir: Dir,
  ): void {
    if (sprite === null || spriteId === '' || !this.textures.exists(spriteId)) return;
    sprite.play(`${spriteId}-walk-${dir}`, true);
  }

  // ── 매 프레임 ───────────────────────────────────────────

  /**
   * 인물이 플레이어 쪽으로 걸어온다 (§7.3).
   *
   * **플레이어가 찾아가는 것이 아니다.** 마을에 들어선 순간 스프라이트가
   * 이쪽으로 이동하고, 앞에 서면 대화가 저절로 열린다.
   */
  setApproach(spriteId: string | null): void {
    // 앞서 걸어오던 스프라이트가 있으면 트윈까지 함께 끊는다.
    // 스프라이트만 지우면 트윈이 살아남아 없어진 대상 위에서 onComplete 가 터진다
    if (this.approachSprite !== null) {
      this.tweens.killTweensOf(this.approachSprite);
      this.approachSprite.destroy();
      this.approachSprite = null;
    }

    // 씬이 아직 안 섰으면 적어 두었다가 맵이 준비되면 시작한다.
    // 마을에서 새로 켠 판은 이 경로로 들어온다
    this.wantApproach = spriteId;
    if (spriteId === null || this.map === null || this.heroSprite === null) return;
    this.wantApproach = null;

    const from = this.approachStart();
    if (from === null) {
      // 설 자리가 없으면 걷는 연출을 건너뛰고 바로 말을 건다
      this.cbs.onApproachArrive();
      return;
    }

    const sprite = this.add.sprite(worldX(from.x), worldY(from.y), this.textureFor(spriteId));
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(worldY(from.y));
    this.ensureAnims(spriteId);
    this.approachSprite = sprite;

    // 주인공 바로 앞 칸에서 멈춘다
    const toX = worldX(this.hero.x);
    const toY = worldY(this.hero.y - 1);

    const dir: Dir =
      Math.abs(toX - sprite.x) > Math.abs(toY - sprite.y)
        ? toX > sprite.x
          ? 'right'
          : 'left'
        : toY > sprite.y
          ? 'down'
          : 'up';
    if (this.textures.exists(spriteId)) sprite.play(`${spriteId}-walk-${dir}`, true);

    this.tweens.add({
      targets: sprite,
      x: toX,
      y: toY,
      duration: STEP_MS * 6,
      ease: 'Linear',
      onUpdate: () => sprite.setDepth(sprite.y),
      onComplete: () => {
        // 그새 다른 스프라이트로 갈렸으면 이 도착은 무효다
        if (this.approachSprite !== sprite || !sprite.active) return;
        sprite.anims?.stop();
        if (this.textures.exists(spriteId)) sprite.setFrame(frameIndex('down', IDLE_FRAME));
        this.cbs.onApproachArrive();
      },
    });
  }

  /** 주인공에게서 조금 떨어진, 걸어올 수 있는 자리 */
  private approachStart(): { x: number; y: number } | null {
    const map = this.map;
    if (map === null) return null;
    const candidates = [
      { x: this.hero.x, y: this.hero.y + 5 },
      { x: this.hero.x + 5, y: this.hero.y },
      { x: this.hero.x - 5, y: this.hero.y },
      { x: this.hero.x, y: this.hero.y - 5 },
      { x: this.hero.x + 3, y: this.hero.y + 3 },
    ];
    for (const c of candidates) if (!isBlocked(map, c.x, c.y)) return c;
    return null;
  }

  /** 대화가 열리고 닫힐 때 호스트가 알려 준다 */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.queued = null;

    // 멈춤이 풀리는 그 순간의 누름은 대화를 닫으려고 누른 것이다.
    // 여기서 카운터를 맞춰 두지 않으면, 그 한 번이 다음 프레임에 대화를 다시 연다
    const input = readInput();
    this.lastActionCount = input.actionCount;
    this.lastPressCount = input.pressCount;
  }

  /**
   * 화면보다 작은 맵을 가운데에 놓는다.
   *
   * 실내가 그렇다. `startFollow` 는 주인공을 쫓느라 매 프레임 스크롤을 덮어써서
   * `setBounds(..., centerOn)` 만으로는 왼쪽 위에 붙는다 — 방 아래가 통째로
   * 비어 잘린 것처럼 보였다. 따라갈 여지가 없는 축은 여기서 눌러 둔다.
   */
  private lastBounds = '';

  private centerSmallMap(): void {
    const map = this.map;
    if (map === null) return;
    const cam = this.cameras.main;

    const w = map.width * S;
    const h = map.height * S;

    /**
     * 스크롤을 직접 넣어도 소용없다 — 카메라가 그리기 직전에 bounds 로 다시
     * 잘라낸다. 그래서 **bounds 를 넓힌다.** 맵이 화면보다 작은 축은 맵을
     * 가운데 둔 채 화면 크기만큼 늘리고, 큰 축은 맵 그대로 둔다.
     * 작은 축에서는 bounds 폭이 화면 폭과 같아져 스크롤이 한 값에 못 박힌다.
     */
    // 카메라가 2배로 당겨져 있다. 화면 픽셀이 아니라 **월드 크기**와 견줘야 한다
    const viewW = cam.displayWidth;
    const viewH = cam.displayHeight;

    const bw = Math.max(w, viewW);
    const bh = Math.max(h, viewH);
    const bx = (w - bw) / 2;
    const by = (h - bh) / 2;

    const key = `${bx},${by},${bw},${bh}`;
    if (key === this.lastBounds) return;
    this.lastBounds = key;
    cam.setBounds(bx, by, bw, bh);
  }

  override update(time: number): void {
    if (this.map === null || this.heroSprite === null) return;

    this.centerSmallMap();
    this.syncNameTags();

    const input = readInput();

    // 대화 중에 눌린 것은 대화가 가져간다. 여기서는 흘려보내되, 카운터는 맞춰 둔다 —
    // 안 맞춰 두면 대화를 닫은 그 누름이 다시 대화를 연다
    if (this.paused) {
      this.lastActionCount = input.actionCount;
      this.lastPressCount = input.pressCount;
      return;
    }

    if (input.actionCount !== this.lastActionCount) {
      this.lastActionCount = input.actionCount;
      const it = interactionAt(this.map, this.hero, this.buildings);
      this.cbs.onAction(it?.object ?? null);
    }

    const newPress = input.pressCount !== this.lastPressCount;
    if (newPress) this.lastPressCount = input.pressCount;

    // 걷는 중에는 입력을 하나만 쌓아 둔다 (§5). 연타해도 무너지지 않는다
    if (this.walking) {
      if (newPress && input.held !== null) this.queued = input.held;
      return;
    }

    // 방향만 바꾼 직후의 짧은 틈
    if (time < this.turnUntil) return;

    // 맵이 갈릴 때 눌려 있던 손은 놓을 때까지 무시한다
    if (this.holdBlocked) {
      if (input.held === null) this.holdBlocked = false;
      else if (!newPress) return;
      else this.holdBlocked = false;
    }

    const next = this.queued ?? input.held;
    this.queued = null;
    if (next === null) return;

    this.begin(next, time, true);
  }

  /** fromStandstill 이 참일 때만 방향 전환 규칙이 걸린다 */
  private begin(dir: Dir, time: number, fromStandstill: boolean): void {
    const map = this.map;
    if (map === null) return;

    // 판 규칙으로 막힌 칸도 벽으로 본다 (§11 곁가지)
    const outcome = resolveMove(this.hero, map, dir, {
      fromStandstill,
      extraBlocked: this.ruleBlocked,
    });

    switch (outcome.kind) {
      case 'turn':
        this.face(dir);
        this.turnUntil = time + TURN_HOLD_MS;
        play('turn');
        break;

      case 'blocked':
        // 벽을 보고 선다. 제자리에서 발만 구르지는 않는다
        if (this.hero.dir !== dir) this.face(dir);
        else this.setIdleFrame();
        play('bump');
        break;

      case 'step':
        this.startStep(outcome.to, dir);
        break;
    }
  }

  private face(dir: Dir): void {
    this.hero.dir = dir;
    this.setIdleFrame();
    this.cbs.onFace(dir);
    this.refreshPrompt();
  }

  private startStep(to: { x: number; y: number }, dir: Dir): void {
    const s = this.heroSprite;
    if (s === null) return;

    // 동행자는 주인공이 방금 비운 칸으로 들어온다. 먼저 읽어 둔다
    const vacated = { x: this.hero.x, y: this.hero.y };

    this.walking = true;
    this.hero = { x: to.x, y: to.y, dir };
    play('step');
    this.cbs.onStep(to, dir);
    this.refreshPrompt();
    this.playWalk(dir);

    this.stepEscort(vacated, dir);

    this.tweens.add({
      targets: s,
      x: worldX(to.x),
      y: worldY(to.y),
      duration: STEP_MS,
      ease: 'Linear',
      onUpdate: () => s.setDepth(s.y),
      onComplete: () => this.finishStep(),
    });
  }

  /**
   * 동행자를 한 칸 끌고 온다 (§11 동행).
   *
   * 데려간 사람이 지역에 **아무 데도 없었다.** 호감은 조용히 오르는데
   * 화면에는 흔적이 없으니 동행을 골랐는지조차 알 수 없었다.
   * 뒤를 따라오게 하면 데려왔다는 게 보인다.
   *
   * 충돌을 보지 않는다 — 주인공이 방금 지나온 칸이라 갈 수 있는 자리가 확실하다.
   */
  private stepEscort(to: { x: number; y: number }, dir: Dir): void {
    const e = this.escortSprite;
    if (e === null) return;

    this.escortTile = to;
    this.playWalkOn(e, this.escortSpriteId, dir);

    this.tweens.add({
      targets: e,
      x: worldX(to.x),
      y: worldY(to.y),
      duration: STEP_MS,
      ease: 'Linear',
      // 주인공보다 한 칸 뒤에 있으니 깊이도 제 y 를 따른다
      onUpdate: () => e.setDepth(e.y),
      onComplete: () => {
        if (this.escortSprite !== e || !e.active) return;
        e.anims?.stop();
        if (this.textures.exists(this.escortSpriteId)) e.setFrame(frameIndex(dir, IDLE_FRAME));
      },
    });
  }

  /**
   * 동행자를 세운다. 지역에서만 따라붙는다 —
   * 마을에서는 제 자리에 서 있고(townFolk), 실내는 좁다.
   */
  private syncEscort(state: GameState): void {
    const inRegion = state.world.currentMap.startsWith('region:');
    const who = state.escort === null ? undefined : state.companions[state.escort];

    if (!inRegion || who === undefined || who.departedTurn !== null) {
      this.escortSprite?.destroy();
      this.escortSprite = null;
      this.escortSpriteId = '';
      return;
    }

    const spriteId = companionSprite(who.archetypeId);
    // 같은 사람이 이미 따라오고 있으면 그대로 둔다. 다시 만들면 자리가 튄다
    if (this.escortSprite !== null && this.escortSpriteId === spriteId) return;

    this.escortSprite?.destroy();
    this.escortSpriteId = spriteId;

    // 처음에는 주인공이 바라보는 반대쪽, 즉 뒤에 세운다
    const behind = BEHIND[this.hero.dir];
    const tile = { x: this.hero.x + behind.x, y: this.hero.y + behind.y };
    this.escortTile =
      this.map !== null && isBlocked(this.map, tile.x, tile.y) ? { ...this.hero } : tile;

    const sprite = this.add.sprite(
      worldX(this.escortTile.x),
      worldY(this.escortTile.y),
      this.textureFor(spriteId),
    );
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(worldY(this.escortTile.y));
    if (this.ensureAnims(spriteId)) sprite.setFrame(frameIndex(this.hero.dir, IDLE_FRAME));
    this.escortSprite = sprite;
    this.makeNameTag(sprite, displayName(who));
  }

  private finishStep(): void {
    this.walking = false;

    // 밟고 올라선 칸에 사건 노드가 있으면 알린다 (§11 — 밟으면 판정)
    if (this.map !== null) {
      const here = objectAt(this.map, this.hero.x, this.hero.y);
      if (here !== undefined && here.nodeKind !== undefined) this.cbs.onEnterTile(here);
    }

    // 쌓아 둔 입력이나 여전히 눌린 방향이 있으면 멈추지 않고 이어 간다.
    // 여기서 한 번 세우면 모퉁이를 돌 때마다 걸린다
    const input = readInput();
    const next = this.holdBlocked ? this.queued : (this.queued ?? input.held);
    this.queued = null;

    if (next !== null) {
      this.begin(next, this.time.now, false);
      return;
    }
    this.setIdleFrame();
  }

  private refreshPrompt(): void {
    if (this.map === null) return;
    const it = interactionAt(this.map, this.hero, this.buildings);
    const label = it === null ? null : it.label;
    if (label !== this.lastPrompt) {
      this.lastPrompt = label;
      this.cbs.onPrompt(label);
    }
  }
}

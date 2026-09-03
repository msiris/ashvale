/**
 * Phaser 캔버스를 필드 자리에 붙인다.
 *
 * 캔버스가 배경이고 React UI 가 그 위에 겹친다 (HUD·조작부·프롬프트).
 * 상태는 여기서 한 방향으로만 흐른다:
 *   스토어 -> scene.syncFromState  /  씬 콜백 -> 스토어 액션
 */

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { PALETTE } from '@/data/palette';
import { companionSprite } from '@/data/sprites';
import { useGameStore } from '@/store/useGameStore';
import { townRumor } from '@/systems/episodes';
import type { GameState } from '@/types/game';
import { buildPatronScript, buildScript, type PatronContext } from '@/systems/dialogue';
import { toneFor } from '@/systems/relationships';
import { activeQuest, anyOfferFor, isComplete } from '@/systems/quests';
import { buildingIdFromIndoor, hasIndoor } from '@/data/maps/indoor';
import { FieldScene } from './FieldScene';

/** 이 의뢰인이 지금 무슨 말을 할 상황인가 (§7.6) */
function patronContext(state: GameState, patronId: string): PatronContext {
  const record = state.patrons[patronId];
  const active = activeQuest(state);
  const mine = active !== null && active.patronId === patronId;

  return {
    trust: record?.trust ?? 0,
    // 고유 의뢰를 다 마쳤으면 다시 오는 의뢰가 나온다 (§7.6)
    offer: anyOfferFor(state, patronId) ?? undefined,
    completed: mine && isComplete(state, active) ? active : undefined,
    inProgress: mine && !isComplete(state, active),
  };
}

/** 원형에 배정된 스프라이트를 찾는다 (§12 배역표) */
export function PhaserHost() {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = holder.current;
    if (parent === null) return;

    const scene = new FieldScene({
      onStep: (to, dir) => useGameStore.getState().stepHero(to, dir),
      onFace: (dir) => useGameStore.getState().faceHero(dir),
      onPrompt: (label) => useGameStore.getState().setPrompt(label),
      onAction: (object) => {
        if (object === null) return;
        const store = useGameStore.getState();
        const state = store.state;
        const indoorNow = buildingIdFromIndoor(state?.world.currentMap ?? '') !== null;

        /**
         * 건물 (§6, §10).
         * 안 지었으면 건설 패널. 지었고 실내가 있으면 들어간다 —
         * 증축은 안에 있는 탁자에서 한다. 실내가 없으면 밖에서 바로 증축.
         */
        if (object.building !== undefined) {
          const level = state?.town.buildings[object.building] ?? 0;
          if (!indoorNow && hasIndoor(object.building, level)) store.enterIndoor(object.building);
          else store.openBuildPanel(object.building);
          return;
        }

        // 시장 판매대 (§10) — 교역과 선물
        if (object.shop === true) {
          store.openShop();
          return;
        }

        // 실내의 목적 자리 (§10) — 열람·봉납·명부·수련·관측
        if (object.room !== undefined) {
          store.openRoom(object.room);
          return;
        }

        /**
         * 사건 노드는 밟으면 발동한다 (§11). 다만 마주 보고 섰을 때도
         * '살펴보기' 프롬프트가 뜬다 — 그때 A 가 아무 일도 안 하면
         * 프롬프트가 거짓말이 된다. 눌러도 같은 판정이 돌게 한다
         */
        if (object.nodeKind !== undefined) {
          // 에피소드 판의 이야기 자리는 판정이 아니라 고르는 자리다 (§11 곁가지)
          if (object.id === 'episode-scene') store.openEpisodeScene();
          else store.stepNode(object.id);
          return;
        }

        // 마지막 판에 서 있는 것 (§11 곁가지). 지나쳐 갈 수 없다
        if (object.id === 'episode-boss') {
          store.faceEpisodeBoss();
          return;
        }

        // 길목 — 실내면 밖으로, 지역이면 마을로, 마을이면 지역 선택 (§6, §11)
        if (object.type === 'gateway') {
          if (indoorNow) store.leaveIndoor();
          // 에피소드 판 (§11 곁가지) — 북쪽이면 다음 판, 남쪽이면 그만두고 마을로
          else if (object.target === 'episode-next') store.nextEpisodeStage();
          else if (state !== null && state.episodeRun !== null) store.leaveEpisode();
          else if (object.target === 'town') store.leaveRegion();
          else store.openRegionSelect();
          return;
        }

        if (object.voice === undefined) return;
        const townName = state?.town.name ?? '';

        // 말투는 호감 단계를 따라간다 (§15). 명단에서 그 원형의 인물을 찾는다
        const companion =
          object.voice.kind === 'companion' && state !== null
            ? Object.values(state.companions).find((c) => c.archetypeId === object.voice?.id)
            : undefined;

        /**
         * 이름 없는 사람과는 대화를 시작하지 않는다 (§7.1 — 이름은 플레이어가 붙인다).
         * 먼저 이름을 받고, 그 다음에 말을 건다. 누구와 이야기하는지 모르는 채로
         * 대사가 흐르면 관계가 붙지 않는다.
         */
        if (companion !== undefined && companion.name === '') {
          store.askName(companion.id);
          return;
        }

        const rumor = state === null ? null : townRumor(state, state.world.turn);
        const req = {
          townName,
          // 주마다 다른 말을 하게 한다 (§15.1)
          ...(state !== null ? { turn: state.world.turn } : {}),
          // 다녀온 이야기를 마을 사람들이 입에 올린다 (§11 곁가지)
          ...(rumor !== null ? { rumor } : {}),
          ...(companion !== undefined
            ? { characterName: companion.name, tone: toneFor(companion) }
            : {}),
        };

        /**
         * 나와 있는 사람에게 말을 걸었다 (§7.6 나들이).
         *
         * 평소 교류 대사 대신 그 자리의 일이 벌어진다 — 자리마다 하는 말이
         * 다르고, 놀이가 따라온다. `visitor-` 로 시작하는 객체만 그렇다.
         */
        if (object.id.startsWith('visitor-') && companion !== undefined) {
          store.openOuting(companion.id);
          return;
        }

        let script = null;
        if (object.voice.kind === 'patron' && state !== null) {
          script = buildPatronScript(object.voice.id, req, patronContext(state, object.voice.id));
        } else {
          script = buildScript(object.voice, req);
        }

        if (script !== null) {
          store.openDialogue(script);
          // 의뢰인은 대화만으로 신뢰가 오른다. 주를 쓰지 않는다 (§7.6)
          if (object.voice.kind === 'patron') store.talkToPatron(object.voice.id);
        }
      },
      onEnterTile: (object) => {
        if (object.nodeKind === undefined) return;
        // 에피소드 판의 이야기 자리는 밟으면 열린다 (§11 곁가지)
        if (object.id === 'episode-scene') useGameStore.getState().openEpisodeScene();
        else useGameStore.getState().stepNode(object.id);
      },
      onApproachArrive: () => useGameStore.getState().approachArrived(),
    });

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: parent.clientWidth,
      height: parent.clientHeight,
      pixelArt: true,
      backgroundColor: PALETTE.ink,
      scene,
      scale: { mode: Phaser.Scale.NONE },
      // 물리 엔진을 쓰지 않는다. 격자 이동이라 필요 없다
    });

    let wasTalking = false;
    let lastApproach: string | null = null;
    let lastMap: string | null = null;
    let lastCleared = '';

    const handle = (s: ReturnType<typeof useGameStore.getState>) => {
      if (s.state !== null) scene.syncFromState(s.state);

      // 마을에 들어서면 대기 중인 인물이 걸어온다 (§7.3)
      const map = s.state?.world.currentMap ?? null;
      if (map !== lastMap) {
        const leftTown = lastMap === 'town' && map !== 'town';
        lastMap = map;
        if (leftTown && useGameStore.getState().approaching !== null) {
          useGameStore.getState().abandonApproach();
        }
        if (map === 'town') useGameStore.getState().beginApproach();
      }

      // 밟은 표식은 흔적으로 바꾼다. 남은 곳이 어디인지 보여야 한다
      const clearedKey = s.state?.world.clearedNodes.join(',') ?? '';
      if (clearedKey !== lastCleared) {
        lastCleared = clearedKey;
        scene.setCleared(s.state?.world.clearedNodes ?? []);
      }

      if (s.approaching !== lastApproach) {
        lastApproach = s.approaching;
        const companion = s.approaching === null ? undefined : s.state?.companions[s.approaching];
        scene.setApproach(companion === undefined ? null : companionSprite(companion.archetypeId));
      }
      // 대화나 패널이 열려 있는 동안 필드는 입력을 받지 않는다
      const busy =
        s.dialogue !== null ||
        s.buildPanel !== null ||
        s.regionSelect ||
        s.explore !== null ||
        s.shop ||
        s.room !== null ||
        s.regionEvent !== null ||
        s.outing !== null ||
        s.naming !== null ||
        s.menu !== null;
      if (busy !== wasTalking) {
        wasTalking = busy;
        scene.setPaused(busy);
      }
    };

    // 구독을 **먼저** 걸고 첫 상태를 흘린다.
    // 순서가 뒤집히면, 첫 호출이 일으킨 변화(다가옴 시작)를 받아 줄 사람이 없다.
    // 그리고 subscribe 는 변화가 있을 때만 부르므로 첫 호출 자체도 반드시 필요하다
    const unsubscribe = useGameStore.subscribe(handle);
    handle(useGameStore.getState());

    const resize = () => {
      if (holder.current === null) return;
      game.scale.resize(holder.current.clientWidth, holder.current.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    return () => {
      observer.disconnect();
      unsubscribe();
      game.destroy(true);
    };
  }, []);

  return <div ref={holder} className="h-full w-full" />;
}

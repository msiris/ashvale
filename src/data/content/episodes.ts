/**
 * 동화 에피소드의 **틀** (§11 곁가지).
 *
 * 이야기 본문은 `content/tales/` 에 편당 한 파일로 있다. 한 파일에 다 넣으면
 * 천 몇백 줄이 되어 한 편을 고치려 해도 다른 다섯 편을 스크롤해야 한다.
 *
 * **걸어 다니는 이야기다.** 판 다섯을 지나야 하나가 끝난다 —
 * 판마다 지형이 다르고, 한가운데에 이야기 자리가 하나 놓인다.
 * 마지막 판에는 그 이야기를 붙들고 있는 것이 서 있다.
 *
 * 처음에는 선택지만 넘기는 자리로 만들었는데, 그건 지역 탐사 옆에
 * 글상자를 하나 더 놓은 것에 지나지 않았다. 걸어 들어가고 걸어 나와야
 * 다녀온 데가 된다.
 *
 * **여기 서는 것과 싸우지 않는다.** 이 게임에 전투는 없다.
 * 마지막 판의 마주섬은 지역과 같은 1d20 판정이다 — 능력치와,
 * 오는 길에 쌓은 결(favor)과, 데려온 사람이 더해진다.
 *   - 넘기면 그 사람이 따라오고 다음 이야기가 열린다
 *   - 못 넘기면 마을로 돌아온다. **끝낸 표를 남기지 않으니 다시 갈 수 있다**
 *
 * 문체는 §15 를 따른다.
 *   - 서술은 무주어 문어체 과거형. 2인칭을 쓰지 않는다
 *   - 선택지는 지금 하는 행동을 적는다. 따옴표 안은 말한 그대로
 *
 * 토큰: {거점} 마을 이름.
 */

import type { FactionId, ResourceId, StatId } from '@/types/game';

/**
 * 마지막 판정에 결이 더해지는 비율.
 *
 * 오는 길 네 자리에서 최대 8. 그대로 더하면 주사위(1~20)보다 커져
 * 판정이 아니라 덧셈이 된다. 절반으로 눌러 최대 4 로 둔다.
 */
export const FAVOR_TO_ROLL = 0.5;

/** 판의 지형 결 */
export type EpisodeLook = 'glass' | 'forest' | 'tower' | 'village' | 'valley' | 'road';

export interface EpisodeChoice {
  text: string;
  /** 고른 뒤 남는 한 줄. 무주어 문어체 과거형 */
  result: string;
  /** 그 사람의 마음이 기우는 정도. 0~2 */
  favor: number;
  xp?: number;
  hp?: number;
  resources?: Partial<Record<ResourceId, number>>;
  faction?: { id: FactionId; delta: number };
}

/** 판 한가운데의 이야기 자리 */
export interface EpisodeScene {
  id: string;
  text: string;
  choices: EpisodeChoice[];
}

/** 마지막 판에 서 있는 것 */
export interface EpisodeBoss {
  /** 발밑에 적히는 이름 */
  name: string;
  /** 마주 섰을 때 */
  text: string;
  /** 판정에 더해지는 능력치 */
  stat: StatId;
  difficulty: number;
  /** 넘겼을 때 */
  win: string;
  /** 못 넘겼을 때 */
  lose: string;
  /** 못 넘기고 잃는 기력 */
  risk: number;
}

export interface EpisodeStage {
  id: string;
  look: EpisodeLook;
  /** 판에 들어설 때 위에 뜨는 한 줄 */
  enter: string;
  /** 이야기 자리. 마지막 판에는 없다 */
  scene?: EpisodeScene;
  /** 마지막 판에만 있다 */
  boss?: EpisodeBoss;
}

/** 세력 이야기의 끝 — 도울 것인가 복속시킬 것인가 */
export interface EpisodeOutcome {
  helpTitle: string;
  help: string;
  ruleTitle: string;
  rule: string;
}

export interface Episode {
  id: string;
  title: string;
  /**
   * 세력 이야기면 그 세력 (§7).
   *
   * 있으면 끝이 다르다 — 사람이 따라오는 대신 그 세력과의 사이가 정해지고,
   * 그쪽 마을에 갈 수 있게 된다. 문장은 content/faction-episodes.ts 에 있다.
   */
  factionId?: FactionId;
  /** 세력 이야기면 끝에서 갈리는 두 갈래 */
  outcome?: EpisodeOutcome;
  /** 데려오려는 원형. 이미 있으면 빈 원형이 대신 온다 */
  archetypeId: string;
  /** 이 에피소드를 끝내야 열린다 */
  needs?: string;
  /** 이 주차부터 열린다. HUD 에 보이는 주차와 같은 수다 (1부터) */
  fromTurn: number;
  /** 목록에 적히는 한 줄 */
  lure: string;
  /** 들어설 때 */
  intro: string;
  stages: EpisodeStage[];
  /** 넘겼을 때 — 따라온다 */
  join: string;
  /** 못 넘겼을 때 */
  miss: string;
  /**
   * 다녀온 뒤 마을 사람들이 하는 말 (§7.6).
   *
   * 다녀온 데가 마을에서 한 번도 언급되지 않으면 다녀오지 않은 것과 같다.
   * 끝낸 뒤 몇 주 동안 교류 대사 앞에 이 줄이 먼저 붙는다.
   */
  townTalk: string[];
}

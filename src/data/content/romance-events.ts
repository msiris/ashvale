/**
 * 연애 장면 — 여러 마디가 이어지는 사건 (§7.3, §8.3).
 *
 * **새로 쓴 파일이다.** 수정 금지인 `dialogue-events.ts` 는 원형마다
 * 문턱 하나씩 한 장면(한 마디 + 선택지)이라 **이어지지 않는다.**
 * 다가와서 한마디 하고 끝나니 관계가 쌓이는 느낌이 없었다.
 *
 * 여기 장면은 **마디(beat)가 여럿**이다. 고르면 다음 마디로 넘어가고,
 * 마지막 마디에서 끝난다. 고른 것이 다음 마디의 말투를 바꾼다.
 *
 * 문체는 §15.1 을 따른다.
 *   - 구어체 반말. 연심 트랙과 동행은 호감 40 이상에서만 열리므로 반말이 맞다
 *   - **외형 묘사 금지.** 플레이어가 어떤 이미지를 넣을지 모른다
 *   - 토큰: {이름} 인물 이름, {거점} 마을 이름
 *
 * 두 갈래로 쓴다.
 *   `ROMANCE_SCENES` — 마을에서 다가와 벌어진다. 연심 트랙 전용
 *   `FIELD_SCENES`   — 동행 중 지역에서 벌어진다. 트랙을 가리지 않는다
 */

export interface SceneChoice {
  text: string;
  /** 고른 뒤 그 사람이 하는 말 */
  reply: string;
  affinity: number;
  /** 이 선택이 다음 마디를 바꾼다. 없으면 그냥 다음 마디로 */
  next?: number;
}

export interface SceneBeat {
  lines: string[];
  /** 없으면 A 로 넘어가고 다음 마디가 이어진다 */
  choices?: SceneChoice[];
}

export interface Scene {
  id: string;
  /** 이 호감 이상에서 열린다 */
  at: number;
  /** 연심 트랙에서만 열리는가 */
  romanceOnly?: boolean;
  beats: SceneBeat[];
}

/**
 * 마을 연애 장면. 연심 트랙으로 갈린 뒤에만 열린다 (§7.4).
 * 우애로 굳은 사이에는 오지 않는다 — 트랙이 갈리는 값이 여기 있다.
 */
export const ROMANCE_SCENES: Scene[] = [
  {
    id: 'rain-porch',
    at: 45,
    romanceOnly: true,
    beats: [
      {
        lines: [
          '비가 와서 처마 밑에 서 있었어. 오는 거 보고도 안 불렀지.',
          '왜 안 불렀냐면… 부르면 뛰어올 거 아니야. 젖잖아.',
        ],
      },
      {
        lines: ['근데 지금은 좀 불렀으면 싶어. 이상하지.'],
        choices: [
          {
            text: '옆에 가서 선다.',
            reply: '…아무 말도 안 하네. 그게 제일 좋아.',
            affinity: 10,
          },
          {
            text: '"다음엔 불러."',
            reply: '알았어. 다음엔 부를게. 진짜로 올 거지?',
            affinity: 7,
          },
          {
            text: '우산을 건네고 돌아선다.',
            reply: '…이건 원래 네 우산인데. 너는 어쩌라고.',
            affinity: 3,
          },
        ],
      },
    ],
  },

  {
    id: 'late-return',
    at: 60,
    romanceOnly: true,
    beats: [
      {
        lines: [
          '늦었잖아. 해 떨어지고도 한참 됐는데.',
          '기다린 거 아니야. 그냥… 문 쪽에 볼일이 있었어.',
        ],
      },
      {
        lines: ['다음부터 늦으면 말이라도 해 줘. 그게 그렇게 어려워?'],
        choices: [
          {
            text: '"미안. 다음엔 말할게."',
            reply: '됐어. 들어와. 국 식었어.',
            affinity: 10,
          },
          {
            text: '"기다린 거 맞잖아."',
            reply: '…아니라니까. 웃지 마. 웃지 말라고.',
            affinity: 12,
          },
          {
            text: '아무 말 없이 지나친다.',
            reply: '…그래. 피곤한가 보다. 자.',
            affinity: -2,
          },
        ],
      },
    ],
  },

  {
    id: 'name-call',
    at: 75,
    romanceOnly: true,
    beats: [
      {
        lines: ['이름으로 불러 봐도 돼? 직함 말고, 그냥 이름.'],
        choices: [
          {
            text: '"불러."',
            reply: '…생각보다 어렵네. 조금만 더 있다가 부를게.',
            affinity: 12,
          },
          {
            text: '"사람들 앞에서는 말고."',
            reply: '알았어. 그럼 둘일 때만. 그거면 충분해.',
            affinity: 9,
          },
        ],
      },
      {
        lines: [
          '있잖아. 나 여기 오래 있을 것 같아.',
          '그 말 하려고 아침부터 서성였어. 다 했다.',
        ],
      },
    ],
  },
];

/**
 * 지역에서 벌어지는 장면 (§11 동행).
 *
 * 동행 노드가 한 줄 서술로 끝나서 **데려간 사람과 아무 일도 없었다.**
 * 마을 대화와 같은 방식으로 — 초상이 서고, 말이 오가고, 고른다.
 * 연심·우애를 가리지 않는다. 같이 걷다 생기는 일이라서.
 */
export const FIELD_SCENES: Scene[] = [
  {
    id: 'field-rest',
    at: 0,
    beats: [
      {
        lines: ['잠깐 앉자. 아까부터 숨소리가 이상해.'],
        choices: [
          {
            text: '앉는다.',
            reply: '그래. 급할 거 없어. 해는 아직 높아.',
            affinity: 6,
          },
          {
            text: '"조금만 더 가자."',
            reply: '…알았어. 대신 다음 자리에서는 진짜 쉬는 거야.',
            affinity: 3,
          },
        ],
      },
    ],
  },
  {
    id: 'field-share',
    at: 30,
    beats: [
      {
        lines: [
          '이거 반. 아까 챙겨 뒀어.',
          '아니야, 네 거 뺏은 거 아니고. 내 몫에서 뗀 거야.',
        ],
        choices: [
          {
            text: '받아서 먹는다.',
            reply: '맛없지. 그래도 다 먹어.',
            affinity: 7,
          },
          {
            text: '"네가 더 먹어."',
            reply: '그럼 반의 반. 이건 안 물러.',
            affinity: 9,
          },
        ],
      },
    ],
  },
  {
    id: 'field-dark',
    at: 55,
    beats: [
      {
        lines: ['해 지겠다. 여기서 밤 되면 길 안 보여.'],
      },
      {
        lines: ['…옷자락 좀 잡고 갈게. 놓치면 큰일이니까.'],
        choices: [
          {
            text: '손을 내민다.',
            reply: '…옷자락이라고 했잖아. 됐어, 이게 낫다.',
            affinity: 12,
          },
          {
            text: '"앞장서. 네가 더 잘 봐."',
            reply: '그건 그래. 따라와. 놓치지 말고.',
            affinity: 8,
          },
        ],
      },
    ],
  },
];

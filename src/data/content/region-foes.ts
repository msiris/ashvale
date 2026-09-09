/**
 * 지역에서 만나는 것 (§11).
 *
 * 지역은 표식을 밟고 판정을 굴리는 자리였다. 매주 가는 데인데 **거기서
 * 마주설 일이 없었다** — 이야기의 마지막 판에만 있던 것을 지역에도 둔다.
 *
 * 이야기의 마주섬과 **같은 규칙**이다. 기색을 읽고 자세로 맞서고 체력으로
 * 갈린다. 다른 것은 걸린 것뿐이다 — 여기서 이기면 전리품이고,
 * 지면 기력을 잃고 물러난다. 죽지 않는다.
 *
 * 지역마다 하나씩. **여럿과 연달아 맞서지 않는다** (§ 프로젝트 정의).
 * 한 번 물리치면 그 주 그 지역에서는 다시 나오지 않는다.
 *
 * 문체는 §15. 서술은 무주어 문어체 과거형, 2인칭을 쓰지 않는다.
 */

import type { EpisodeBoss } from './episodes';

/** 이긴 뒤 받는 것. 지역 전리품과 별개로 얹힌다 */
export interface FoeSpoils {
  xp: number;
  gold: number;
}

export interface RegionFoe extends EpisodeBoss {
  /** 이겼을 때 받는 것 */
  spoils: FoeSpoils;
}

/**
 * 지역마다 하나.
 *
 * 난도는 그 지역 판정 난도를 따라간다 — 속삭이는 숲이 9 니 거기 선 것도 가볍고,
 * 별의 균열이 25 면 거기 선 것도 그만큼 버틴다.
 */
export const REGION_FOES: Record<string, RegionFoe> = {
  whisper: {
    name: '숲을 지키는 것',
    text:
      '나무 사이에 서 있었다. 사슴 뿔을 얹었는데 사슴은 아니었다. 길을 막은 것이 아니라 그냥 서 있었는데, 지나가려 하자 따라 움직였다.',
    stat: 'agility',
    difficulty: 9,
    risk: 2,
    win: '먼저 눈을 피하고 옆으로 돌았다. 따라오지 않았다. 뿔이 나뭇가지에 걸려 흔들렸다.',
    lose: '정면으로 갔다. 뿔이 스쳤고, 정신을 차렸을 때는 숲 어귀였다.',
    spoils: { xp: 8, gold: 12 },
  },
  gate: {
    name: '관문에 남은 것',
    text:
      '무너진 문 아래에 갑옷 한 벌이 서 있었다. 안이 비어 있는데 서 있었다. 문을 지키라는 명이 아직 안 풀린 것 같았다.',
    stat: 'might',
    difficulty: 12,
    risk: 4,
    win: '밀지 않고 버텼다. 한참 뒤에 갑옷이 무릎을 꿇었다. 명이 그때 풀린 듯했다.',
    lose: '밀고 지나가려 했다. 갑옷은 생각보다 무거웠고, 돌무더기가 함께 무너졌다.',
    spoils: { xp: 12, gold: 20 },
  },
  marsh: {
    name: '늪이 삼킨 것',
    text:
      '수면 아래에서 올라왔다. 사람 모양인데 진흙이 흘러내렸다. 발밑이 가라앉는 데서는 이쪽이 늘 불리했다.',
    stat: 'will',
    difficulty: 15,
    risk: 6,
    win: '가라앉는 쪽으로 유인하고 물러섰다. 제 무게에 잠겼다. 진흙이 다시 평평해졌다.',
    lose: '맞서다 발이 빠졌다. 빠져나오는 데 반나절이 갔다.',
    spoils: { xp: 16, gold: 28 },
  },
  peaks: {
    name: '능선에 선 것',
    text:
      '눈보라 속에 그림자가 하나 서 있었다. 바람이 그쪽만 비켜 갔다. 가까이 가자 그림자가 이쪽으로 몸을 돌렸다.',
    stat: 'might',
    difficulty: 18,
    risk: 8,
    win: '바람이 멎는 틈에 파고들었다. 그림자가 흩어지며 눈이 한꺼번에 쏟아졌다.',
    lose: '바람을 안고 밀어붙였다. 밀린 것은 이쪽이었다.',
    spoils: { xp: 20, gold: 40 },
  },
  deep: {
    name: '어둠에 익은 것',
    text:
      '빛이 닿지 않는 데서 소리만 났다. 발소리가 넷이었다가 둘이 되었다. 보이지 않는 것과 맞서는 일은 처음이었다.',
    stat: 'insight',
    difficulty: 21,
    risk: 9,
    win: '보려 하지 않고 들었다. 숨소리가 멎는 데를 짚었다. 그 뒤로 소리가 나지 않았다.',
    lose: '등불을 들었다. 밝힌 만큼 이쪽이 먼저 보였다.',
    spoils: { xp: 26, gold: 55 },
  },
  rift: {
    name: '틈에서 나온 것',
    text:
      '갈라진 자리에서 무언가 반쯤 나와 있었다. 나온 만큼만 형태가 있었고 나머지는 아직 저쪽이었다. 다 나오기 전에 끝내야 했다.',
    stat: 'will',
    difficulty: 25,
    risk: 10,
    win: '나온 쪽을 치지 않고 틈을 막았다. 반쯤 나온 채로 닫혔다. 그 뒤로 조용해졌다.',
    lose: '나온 쪽을 쳤다. 그만큼 더 나왔다. 물러서는 수밖에 없었다.',
    spoils: { xp: 32, gold: 70 },
  },
};

/** 이 지역에 선 것. 없으면 null */
export function foeOf(regionId: string): RegionFoe | null {
  return REGION_FOES[regionId] ?? null;
}

/** 마주섬 표식을 밟았을 때 뜨는 말 */
export const FOE_ENCOUNTER = '앞을 막아섰다. 지나가려면 마주서야 한다.';

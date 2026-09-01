/**
 * 대화 대본 조립 (§8) — 순수 함수.
 *
 * **여기서 대사를 쓰지 않는다.** 문구는 전부 src/data/content/ 에서 가져온다.
 * 문체 규약(§15)에 맞춰 쓰인 글이라, 새로 쓰거나 다듬으면 톤이 무너진다.
 * 이 파일이 하는 일은 어떤 줄을 어떤 차례로 보여줄지 고르고, 치환 토큰을 채우는 것뿐이다.
 */

import type { CompanionRecord } from '@/types/game';
import type { DialogueOption, DialogueScript, SpeakerRef } from '@/types/dialogue';
import { toneFor } from './relationships';
import { COMPANION_VOICES, type AffinityTier } from '@/data/content/companion-dialogue';
import { addressOf, talkLinesOf } from './voice';
import { PATRON_VOICES } from '@/data/content/patron-dialogue';
import { DIALOGUE_EVENTS } from '@/data/content/dialogue-events';
import { MAX_CHOICES } from '@/data/dialogue';
import { applyToken } from './korean';

export interface DialogueContext {
  /** {거점} */
  townName: string;
  /** {이름} — 인물 이름 */
  characterName: string;
  /** {호칭} — 그 인물이 주인공을 부르는 말 */
  address: string;
}

/** 부르는 쪽이 아는 것만 넘기면 나머지는 콘텐츠에서 채운다 */
export interface DialogueRequest {
  townName: string;
  /** 플레이어가 붙인 이름. 아직 없으면 비워 둔다 — 원형 이름표로 대신한다 */
  characterName?: string;
  /** 말투 단계 (§15). 없으면 낯선 사람으로 본다 */
  tone?: AffinityTier;
  /**
   * 지금 주차. 대사를 고르는 데 쓴다 (§15.1).
   *
   * **이게 없어서 대사가 하나로 굳어 있었다** — `talkLine(..., 0)` 이라
   * 단계마다 첫 줄만 나왔다. 72줄을 써 두고 18줄만 보이던 셈이다.
   * 주차가 들어오면 주마다 다른 말을 한다. 같은 주에 두 번 걸면 같은 말이지만
   * 그건 자연스럽다 — 하루 사이에 할 말이 바뀌지는 않는다.
   */
  turn?: number;
}

/** 콘텐츠의 치환 토큰을 채운다. 뒤따르는 조사는 앞말에 맞춰진다 */
export function fillTokens(text: string, ctx: DialogueContext): string {
  let out = applyToken(text, '{거점}', ctx.townName);
  out = applyToken(out, '{이름}', ctx.characterName);
  return applyToken(out, '{호칭}', ctx.address);
}

/** 그 원형의 단계별 말투에서 한 줄. 인덱스는 부르는 쪽이 정한다 */
function talkLine(archetypeId: string, tier: AffinityTier, index: number): string | null {
  const voice = COMPANION_VOICES[archetypeId];
  if (voice === undefined) return null;
  // 덧입힘이 있으면 그쪽이 먼저다 (systems/voice.ts)
  const lines = talkLinesOf(archetypeId, tier);
  if (lines.length === 0) return null;
  return lines[index % lines.length] ?? null;
}

/**
 * 마무리 대사로 쓸 줄 번호.
 * 0번은 첫 줄로 이미 썼으니 1번 이후에서 고른다. 줄이 하나뿐이면 어쩔 수 없이 0번.
 */
function replyIndex(archetypeId: string, tier: AffinityTier, choiceIndex: number): number {
  const count = COMPANION_VOICES[archetypeId]?.talk[tier].length ?? 0;
  if (count <= 1) return 0;
  return 1 + (choiceIndex % (count - 1));
}

/**
 * 관계 대상과의 대화.
 *
 * 아직 호감 수치가 붙기 전이라 단계는 stranger 로 고정한다.
 * 호감·명단이 들어오면 tier 를 인자로 받아 갈라진다.
 */
export function buildCompanionScript(
  archetypeId: string,
  req: DialogueRequest,
  tone?: AffinityTier,
): DialogueScript | null {
  const voice = COMPANION_VOICES[archetypeId];
  if (voice === undefined) return null;
  const tier: AffinityTier = tone ?? req.tone ?? 'stranger';

  // 이름은 플레이어가 붙인다. 아직 없으면 원형 이름표로 대신한다
  const ctx: DialogueContext = {
    townName: req.townName,
    characterName:
      req.characterName !== undefined && req.characterName !== '' ? req.characterName : voice.label,
    address: addressOf(archetypeId, tier),
  };

  /**
   * 주차와 원형을 섞어 고른다. 원형마다 다른 자리에서 시작해야
   * 같은 주에 둘에게 말을 걸었을 때 나란히 같은 번째 줄이 나오지 않는다.
   */
  let seed = req.turn ?? 0;
  for (let i = 0; i < archetypeId.length; i++) seed = (seed * 31 + archetypeId.charCodeAt(i)) >>> 0;

  const lines: string[] = [];
  const opener = talkLine(archetypeId, tier, seed);
  if (opener !== null) lines.push(fillTokens(opener, ctx));

  // 그냥 말을 건 것뿐이다. 선택지는 다가옴 사건에서만 열린다 (§7.3, §8.4)
  return {
    speakerName: ctx.characterName,
    portrait: { speaker: { kind: 'companion', id: archetypeId }, wantSlot: 0, label: voice.label },
    lines,
  };
}

/**
 * 다가옴으로 열리는 대화 사건 (§8.4).
 *
 * **주사위를 굴리지 않는다.** 탐사는 판정이지만 대화는 선택이다.
 * 정답이 없다 — 호감이 적게 오르는 선택지는 세력 평판 같은 다른 것을 준다.
 */
export function buildEventScript(
  companion: CompanionRecord,
  tier: number,
  req: DialogueRequest,
): DialogueScript | null {
  const voice = COMPANION_VOICES[companion.archetypeId];
  const event = DIALOGUE_EVENTS.find(
    (e) => e.archetypeId === companion.archetypeId && e.tier === tier,
  );
  if (voice === undefined || event === undefined) return null;

  const tone = toneFor(companion);
  const name = req.characterName !== undefined && req.characterName !== '' ? req.characterName : voice.label;
  const ctx: DialogueContext = {
    townName: req.townName,
    characterName: name,
    address: addressOf(companion.archetypeId, tone),
  };

  const choices: DialogueOption[] = event.choices.slice(0, MAX_CHOICES).map((c, i) => ({
    id: `${event.id}:${i}`,
    text: fillTokens(c.text, ctx),
    reply: fillTokens(talkLine(companion.archetypeId, tone, replyIndex(companion.archetypeId, tone, i)) ?? '', ctx),
    effect: {
      companionId: companion.id,
      affinity: c.affinity,
      ...(c.factionShift !== undefined ? { factionShift: c.factionShift } : {}),
      clearedEvent: event.id,
    },
  }));

  return {
    speakerName: name,
    portrait: {
      speaker: { kind: 'companion', id: companion.archetypeId },
      // 감정이 실린 대사는 슬롯 1. 없으면 조용히 0으로 내려간다 (§8.2)
      wantSlot: 1,
      label: voice.label,
    },
    lines: [fillTokens(event.situation, ctx)],
    choices,
  };
}

/**
 * 고백 (§7.4).
 *
 * **인물이 한다.** 플레이어가 고백하는 선택지는 만들지 않는다.
 * 고를 수 있는 건 답 세 가지뿐이다 — 수락 / 보류 / 거절.
 *
 * 콘텐츠에 고백 전용 대사가 없어 벗(60) 승급 대사를 쓴다.
 * 전용 대사가 생기면 그쪽으로 바꾼다 — 여기서 지어내지 않는다.
 */
export function buildConfessionScript(
  companion: CompanionRecord,
  req: DialogueRequest,
): DialogueScript | null {
  const voice = COMPANION_VOICES[companion.archetypeId];
  if (voice === undefined) return null;

  const tone = toneFor(companion);
  const name = companion.name !== '' ? companion.name : voice.label;
  const ctx: DialogueContext = {
    townName: req.townName,
    characterName: name,
    address: addressOf(companion.archetypeId, tone),
  };

  const answers: { id: 'accept' | 'hold' | 'decline'; text: string }[] = [
    { id: 'accept', text: '받아들인다' },
    { id: 'hold', text: '지금은 답하지 않는다' },
    { id: 'decline', text: '그 마음은 받지 않는다' },
  ];

  return {
    speakerName: name,
    portrait: {
      speaker: { kind: 'companion', id: companion.archetypeId },
      // 고백은 사건 삽화 자리다. 없으면 조용히 내려간다 (§8.2)
      wantSlot: 3,
      label: voice.label,
    },
    lines: [fillTokens(voice.promote.t60, ctx)],
    choices: answers.map((a) => ({
      id: `confess:${a.id}`,
      text: a.text,
      reply: fillTokens(
        a.id === 'accept'
          ? voice.promote.t80
          : (talkLine(companion.archetypeId, tone, 1) ?? ''),
        ctx,
      ),
      effect: { companionId: companion.id, confess: a.id },
    })),
  };
}

/**
 * 의뢰인과의 대화 (§7.6).
 *
 * 의뢰인은 실내에 상주한다 — **찾아가야 만난다.** 관계 대상과 반대다.
 * 퀘스트는 동시 하나, 기한 없음, 실패 없음. 완료 보고도 여기서 한다.
 */
export interface PatronContext {
  /** 신뢰 단계에 따라 인사가 갈린다 */
  trust: number;
  /** 지금 내줄 수 있는 의뢰 */
  offer?: { id: string; name: string } | undefined;
  /** 이 의뢰인에게 보고할 수 있는, 조건을 채운 의뢰 */
  completed?: { id: string; name: string } | undefined;
  /** 진행 중이라 아직 보고할 수 없는 의뢰 */
  inProgress?: boolean;
}

export function buildPatronScript(
  patronId: string,
  req: DialogueRequest,
  patron?: PatronContext,
): DialogueScript | null {
  const voice = PATRON_VOICES[patronId];
  if (voice === undefined) return null;

  const ctx: DialogueContext = { townName: req.townName, characterName: voice.name, address: '' };
  const trust = patron?.trust ?? 0;
  const greet =
    trust >= 40 ? voice.greet.oldFriend : trust >= 20 ? voice.greet.client : voice.greet.acquaintance;

  const portrait = {
    speaker: { kind: 'patron' as const, id: patronId },
    wantSlot: 0,
    label: voice.role,
  };
  const base = { speakerName: voice.name, portrait };

  // 조건을 채웠으면 보고를 받는다
  if (patron?.completed !== undefined) {
    return {
      ...base,
      lines: [fillTokens(greet, ctx), fillTokens(voice.questComplete, ctx)],
      choices: [
        {
          id: `quest:report:${patron.completed.id}`,
          text: '보고한다',
          reply: '',
          effect: { questReport: patron.completed.id },
        },
      ],
    };
  }

  // 진행 중이면 재촉하지 않고 상황만 말한다
  if (patron?.inProgress === true) {
    return { ...base, lines: [fillTokens(greet, ctx), fillTokens(voice.questProgress, ctx)] };
  }

  // 내줄 의뢰가 있으면 받을지 고른다
  if (patron?.offer !== undefined) {
    return {
      ...base,
      lines: [fillTokens(greet, ctx), fillTokens(voice.questOffer, ctx)],
      choices: [
        {
          id: `quest:take:${patron.offer.id}`,
          text: '맡는다',
          reply: '',
          effect: { questAccept: patron.offer.id, patronId },
        },
        {
          id: 'quest:pass',
          text: '나중에',
          reply: fillTokens(voice.questDecline, ctx),
        },
      ],
    };
  }

  return { ...base, lines: [fillTokens(greet, ctx)] };
}

export function buildScript(speaker: SpeakerRef, req: DialogueRequest): DialogueScript | null {
  return speaker.kind === 'companion'
    ? buildCompanionScript(speaker.id, req)
    : buildPatronScript(speaker.id, req);
}

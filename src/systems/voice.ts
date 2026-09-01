/**
 * 말투 조회 — 원본 위에 덧입힘을 얹는다 (§15.1).
 *
 * `companion-dialogue.ts` 는 수정 금지 파일이다. 가까워진 뒤의 어휘를 바꾸려고
 * 그 파일을 고치는 대신, `sibling-voice.ts` 가 덮을 자리만 덮게 한다.
 * 덧입힘이 없는 단계·원형은 원본 그대로 나온다.
 */

import type { AffinityTier, CompanionVoice } from '@/data/content/companion-dialogue';
import { COMPANION_VOICES } from '@/data/content/companion-dialogue';
import { SIBLING_VOICE } from '@/data/content/sibling-voice';

export function voiceOf(archetypeId: string): CompanionVoice | undefined {
  return COMPANION_VOICES[archetypeId];
}

/** 주인공을 부르는 말 */
export function addressOf(archetypeId: string, tier: AffinityTier): string {
  const overlay = SIBLING_VOICE[archetypeId]?.address?.[tier];
  if (overlay !== undefined) return overlay;
  return COMPANION_VOICES[archetypeId]?.address[tier] ?? '';
}

/**
 * 그 단계의 교류 대사.
 *
 * `talk` 이 있으면 원본을 갈아 끼우고, `extra` 는 뒤에 덧붙인다.
 * 가까운 단계는 갈아 끼우고(여동생 톤), 먼 단계는 원본에 더하기만 한다 —
 * 낯선 사람의 말투까지 바꾸면 가까워지는 낙차가 사라진다.
 */
export function talkLinesOf(archetypeId: string, tier: AffinityTier): string[] {
  const overlay = SIBLING_VOICE[archetypeId];
  const base =
    overlay?.talk?.[tier] !== undefined && overlay.talk[tier].length > 0
      ? overlay.talk[tier]
      : (COMPANION_VOICES[archetypeId]?.talk[tier] ?? []);

  const extra = overlay?.extra?.[tier] ?? [];
  return extra.length > 0 ? [...base, ...extra] : base;
}

/**
 * 말투 조회 — 원본 위에 덧입힘을 얹는다 (§15.1).
 *
 * `companion-dialogue.ts` 는 수정 금지 파일이다. 단계마다 3줄뿐이라 몇 주 놀면
 * 같은 말이 돌아오는데, 그 파일을 고치는 대신 `extra-voice.ts` 의 덧줄을 뒤에 붙인다.
 * 덧줄이 없는 단계·원형은 원본 그대로 나온다.
 */

import type { AffinityTier, CompanionVoice } from '@/data/content/companion-dialogue';
import { COMPANION_VOICES } from '@/data/content/companion-dialogue';
import { EXTRA_VOICE } from '@/data/content/extra-voice';

export function voiceOf(archetypeId: string): CompanionVoice | undefined {
  return COMPANION_VOICES[archetypeId];
}

/** 주인공을 부르는 말 */
export function addressOf(archetypeId: string, tier: AffinityTier): string {
  const overlay = EXTRA_VOICE[archetypeId]?.address?.[tier];
  if (overlay !== undefined) return overlay;
  return COMPANION_VOICES[archetypeId]?.address[tier] ?? '';
}

/**
 * 그 단계의 교류 대사.
 *
 * `talk` 이 있으면 원본을 갈아 끼우고, `extra` 는 뒤에 덧붙인다.
 * **지금은 어느 원형도 갈아 끼우지 않는다** — 덧붙이기만 한다.
 * 원본이 정한 호칭과 말투가 호감 단계의 낙차를 만드는 자리라서다.
 */
export function talkLinesOf(archetypeId: string, tier: AffinityTier): string[] {
  const overlay = EXTRA_VOICE[archetypeId];
  const base =
    overlay?.talk?.[tier] !== undefined && overlay.talk[tier].length > 0
      ? overlay.talk[tier]
      : (COMPANION_VOICES[archetypeId]?.talk[tier] ?? []);

  const extra = overlay?.extra?.[tier] ?? [];
  return extra.length > 0 ? [...base, ...extra] : base;
}

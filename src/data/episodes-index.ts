/**
 * 이야기 전체 목록.
 *
 * 동화 여섯 편(`content/tales/`)과 세력 이야기 넷을 한 줄에 세운다. **엔진은 둘을 구분하지 않는다** —
 * 판 다섯을 걸어 마지막에 마주서는 것까지 같고, 갈리는 것은 끝뿐이다.
 *
 * 여기 따로 둔 이유는 순환 참조다. `faction-episodes.ts` 가 `episodes.ts` 의
 * 타입을 쓰므로, 반대로 `episodes.ts` 가 세력 목록을 불러오면 서로 문다.
 */

import { TALES } from './content/tales';
import { FACTION_EPISODES } from './content/faction-episodes';

export const ALL_EPISODES = [...TALES, ...FACTION_EPISODES];

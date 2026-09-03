/**
 * 동화 여섯 편 (§11 곁가지).
 *
 * 전부 오래된 이야기의 원전을 모티프로 **새로 쓴 것**이다. 원문을 옮기지 않았고,
 * 결말은 이 게임 쪽으로 돌렸다 — 도우러 온 사람이 있으면 원전대로 흐르지 않는다.
 * 그게 이 곁가지의 뜻이다. 도와서 결말을 본다.
 *
 * 사슬 순서가 곧 목록 순서다. 앞 편을 끝내야 다음이 열린다.
 * 편당 한 파일로 둔다 — 한 파일에 다 넣으면 한 편을 고치려 해도
 * 다른 다섯 편을 스크롤해야 한다.
 */

import type { Episode } from '../episodes';
import { RED_HOOD } from './red-hood';
import { BEANSTALK } from './beanstalk';
import { MERMAID } from './mermaid';
import { GINGERBREAD } from './gingerbread';
import { PIPER } from './piper';
import { MATCHGIRL } from './matchgirl';

export const TALES: Episode[] = [
  RED_HOOD,
  BEANSTALK,
  MERMAID,
  GINGERBREAD,
  PIPER,
  MATCHGIRL,
];

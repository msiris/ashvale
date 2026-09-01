/** 대사 줄 수 점검 — 단계마다 몇 줄이 실제로 돌아가는지 (§15.1) */
import { talkLinesOf } from '../src/systems/voice';

const TIERS = ['stranger', 'ally', 'friend', 'lover'] as const;
const ARCS = ['knight', 'hunter', 'mage', 'herbalist', 'envoy', 'wanderer'];

let total = 0;
for (const a of ARCS) {
  const counts = TIERS.map((t) => talkLinesOf(a, t).length);
  const seen = new Set(TIERS.flatMap((t) => talkLinesOf(a, t)));
  const sum = counts.reduce((x, y) => x + y, 0);
  if (seen.size !== sum) throw new Error(`${a}: 중복된 대사가 있다`);
  if (counts.some((c) => c < 4)) throw new Error(`${a}: 단계 하나가 4줄 미만이다`);
  total += sum;
  console.log(`  ${a.padEnd(10)} ${counts.join(' / ')}`);
}
console.log(`총 ${total} 줄`);

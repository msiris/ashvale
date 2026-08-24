/**
 * 문 왕복 점검 — 빌드 도구다.
 *
 *   npx tsx scripts/check-doors.ts
 *
 * 들어가고 나올 때 서는 자리가 **걸을 수 있는 칸인지** 본다.
 * 나올 때 문 위가 아니라 문 앞에 서야 하고, 그 칸이 막혀 있으면 안 된다.
 */

import { buildTownMap } from '../src/data/maps/town';
import { buildIndoorMap, INDOOR_ENTRY } from '../src/data/maps/indoor';
import { isBlocked } from '../src/systems/map';
import { BUILDINGS } from '../src/data/buildings';

let ok = true;

for (const eraIndex of [0, 1, 2, 3, 4, 5]) {
  for (const level of [1, 4, 12]) {
    const buildings: Record<string, number> = {};
    for (const b of BUILDINGS) buildings[b.id] = level;
    const town = buildTownMap({ eraIndex, buildings });

    for (const door of town.objects.filter((o) => o.building !== undefined)) {
      // 나오는 자리 = 문 아래 한 칸
      const front = { x: door.x, y: door.y + 1 };
      const usable = !isBlocked(town, front.x, front.y);
      if (!usable) {
        ok = false;
        console.log(`실패 시대 ${eraIndex} lv${level} ${door.building} — 문 앞(${front.x},${front.y})이 막혔다`);
      }

      // 들어가는 자리
      if (BUILDINGS.find((b) => b.id === door.building)?.indoor !== true) continue;
      const inside = buildIndoorMap({ buildingId: door.building!, eraIndex });
      if (isBlocked(inside, INDOOR_ENTRY.x, INDOOR_ENTRY.y)) {
        ok = false;
        console.log(`실패 ${door.building} 실내 입구가 막혔다`);
      }
    }
  }
}

/**
 * 숙소는 방으로 나뉜다 (§10). 복도에서 **모든 방에 닿아야** 한다 —
 * 벽 한 칸을 잘못 놓으면 그 방 사람에게 영영 말을 못 건다.
 */
{
  const residents = Array.from({ length: 6 }, (_, i) => ({
    id: `c${i}`,
    archetypeId: ['knight', 'hunter', 'mage', 'herbalist', 'envoy', 'wanderer'][i] ?? 'knight',
    name: `사람${i}`,
  }));
  const lodge = buildIndoorMap({ buildingId: 'lodge', eraIndex: 3, residents });

  const seen = new Set<string>([`${INDOOR_ENTRY.x},${INDOOR_ENTRY.y}`]);
  const queue: { x: number; y: number }[] = [{ x: INDOOR_ENTRY.x, y: INDOOR_ENTRY.y }];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      const key = `${x},${y}`;
      if (seen.has(key) || isBlocked(lodge, x, y)) continue;
      seen.add(key);
      queue.push({ x, y });
    }
  }

  // 사람은 막힌 칸에 선다. 옆에 설 자리가 있어야 말을 건다
  const people = lodge.objects.filter((o) => o.type === 'npc');
  const unreachable = people.filter(
    (p) => ![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => seen.has(`${p.x + dx},${p.y + dy}`)),
  );
  if (people.length !== 6 || unreachable.length > 0) {
    ok = false;
    console.log(`실패 숙소 — 방 ${people.length}개, 못 닿는 방 ${unreachable.length}개`);
  } else {
    console.log('OK  숙소 방 6개 모두 복도에서 닿는다');
  }
}

/**
 * 회관에 그 시대의 의뢰인이 **전부** 서 있어야 한다 (§7.6).
 *
 * 자리 계산이 `x >= W - 2` 면 조용히 버리고 있었다. 다섯째부터 잘려서
 * 도란과 벨이 회관에 없었고, 둘 다 사람을 주는 의뢰인이라
 * 전설기까지 가도 명단이 늘지 않았다. 사람이 사라지는 건 조용히 지나가므로
 * 여기서 센다.
 */
{
  const PATRON_ERA: Record<string, number> = {
    bartek: 0, tova: 1, harl: 1, oren: 2, doran: 2, vell: 3,
  };
  for (const eraIndex of [0, 1, 2, 3, 4, 5]) {
    const hall = buildIndoorMap({ buildingId: 'hall', eraIndex });
    const placed = hall.objects.filter((o) => o.id.startsWith('patron-'));
    const expected = Object.keys(PATRON_ERA).filter((id) => eraIndex >= (PATRON_ERA[id] ?? 99));
    const missing = expected.filter((id) => !placed.some((p) => p.id === `patron-${id}`));

    // 서 있어도 말을 걸 수 없으면 없는 것과 같다
    const walled = placed.filter(
      (p) => ![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => !isBlocked(hall, p.x + dx, p.y + dy)),
    );

    if (missing.length > 0 || walled.length > 0) {
      ok = false;
      console.log(
        `실패 회관 시대 ${eraIndex} — 빠짐 ${missing.length}명, 말 못 거는 사람 ${walled.length}명`,
      );
    }
  }
  if (ok) console.log('OK  회관에 그 시대 의뢰인이 전부 서 있고 다 말을 걸 수 있다');
}

console.log(ok ? 'OK  모든 문의 안팎 자리가 걸을 수 있다' : '실패');
if (!ok) process.exitCode = 1;

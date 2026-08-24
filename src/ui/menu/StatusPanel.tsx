/**
 * 상태 — 나와 마을 (§10, §11).
 *
 * 이 화면이 없어서 두 가지가 보이지 않았다.
 *
 *  1. **능력치.** 레벨업이 "능력치 2 · 스킬 1" 이라고 알리는데 정작 그 수치를
 *     볼 데가 학당 수련장뿐이었다. 학당은 왕국기 건물이다 — 오른 걸 확인하려면
 *     시대 넷을 넘어야 했다. 쓰는 것도 여기서 한다.
 *  2. **다음 주 수지.** 자원이 주마다 얼마나 들어오는지 미리 볼 데가 없었다.
 *     계절 보정과 식량 소비까지 갈라서 보여 준다.
 *
 * 규칙은 계산하지 않는다. systems/ 의 순수 함수를 부르고 담기만 한다.
 */

import type { ResourceId, StatId } from '@/types/game';
import { useGameStore } from '@/store/useGameStore';
import { computeProduction } from '@/systems/economy';
import { devotionLines, devotionTotals } from '@/systems/devotion';
import { factionStanding, standingLines } from '@/systems/factions';
import { FACTION_LABEL, FACTION_STANDING } from '@/data/relationships';
import type { FactionId } from '@/types/game';
import { xpToNext } from '@/data/levels';
import { SKILLS } from '@/data/skills';
import { RELICS } from '@/data/content/world-content';
import { ERAS, eraName } from '@/data/eras';
import { SEASON_LABEL, seasonOf } from '@/data/seasons';
import { TOUCH_MIN } from '@/data/layout';
import { activeQuest, anyOfferFor, isComplete, progressText } from '@/systems/quests';
import { patronOutingOf } from '@/systems/outing';
import { PATRON_ERA_MIN } from '@/data/maps/indoor';
import { PATRON_VOICES } from '@/data/content/patron-dialogue';

const STAT_LABEL: Record<StatId, string> = {
  might: '힘',
  agility: '민첩',
  insight: '통찰',
  will: '의지',
};
const STAT_ORDER: StatId[] = ['might', 'agility', 'insight', 'will'];

const RESOURCE_LABEL: Record<ResourceId, string> = {
  wood: '목재',
  stone: '석재',
  food: '식량',
  gold: '금화',
};
const RESOURCE_ORDER: ResourceId[] = ['wood', 'stone', 'food', 'gold'];
const FACTION_ORDER: FactionId[] = ['guild', 'oath', 'grove', 'tower'];

/** 부호를 붙인다. 늘어나는지 줄어드는지가 한눈에 보여야 한다 */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-stoneDark/20 py-1">
      <span className="text-[12px]">{label}</span>
      <span className="text-[11px] tabular-nums text-inkSoft">{value}</span>
    </div>
  );
}

export function StatusPanel() {
  const state = useGameStore((s) => s.state);
  const spendStat = useGameStore((s) => s.spendStat);
  const spendSkill = useGameStore((s) => s.spendSkill);
  const error = useGameStore((s) => s.error);

  if (state === null) return null;

  const { hero } = state;
  const season = seasonOf(state.world.week);
  const devoted = devotionTotals(state);
  const devotions = devotionLines(state);
  const standings = standingLines(state.factions);
  const production = computeProduction(state.town.buildings, season, devoted.weekly);
  const power = Object.values(state.town.buildings).reduce((sum, n) => sum + n, 0);
  const nextEra = ERAS.find((era) => era.power > power);
  const held = RELICS.filter((relic) => hero.relics.includes(relic.id));
  const active = activeQuest(state);
  // 지금 맡을 수 있는 의뢰. 하나를 맡고 있으면 offerFor 가 비어 나온다
  // 고유 의뢰와 다시 오는 의뢰를 함께 본다 (§7.6)
  const offers = Object.keys(PATRON_VOICES)
    .map((id) => anyOfferFor(state, id))
    .filter((q): q is NonNullable<typeof q> => q !== null);
  // 밖에 나와 있으면 회관이 아니라 마을에서 만난다
  const outPatron = patronOutingOf(
    state,
    Object.keys(PATRON_VOICES).filter((id) => state.world.eraIndex >= (PATRON_ERA_MIN[id] ?? 99)),
  );
  const whereToFind = (id: string) => (id === outPatron ? '마을에 나와 있다' : '회관');
  const patronName = (id: string) => PATRON_VOICES[id]?.name ?? id;

  return (
    <div className="space-y-4">
      {error !== null && (
        <p className="rounded border border-blood bg-paperDim px-2 py-1 text-[11px] text-blood">
          {error}
        </p>
      )}

      <section>
        <h3 className="mb-1 text-[13px] font-medium">{hero.name}</h3>
        <Row
          label="단계"
          value={`${hero.level}단계 · 경험 ${hero.xp} / ${xpToNext(hero.level)}`}
        />
        <Row label="기력" value={`${hero.hp} / ${hero.maxHp}`} />
      </section>

      <section>
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium">능력치</h3>
          <span className="text-[11px] tabular-nums text-inkSoft">
            {hero.statPoints > 0 ? `쓸 점수 ${hero.statPoints}` : '쓸 점수 없음'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {STAT_ORDER.map((stat) => (
            <button
              key={stat}
              type="button"
              onClick={() => spendStat(stat)}
              disabled={hero.statPoints <= 0}
              style={{ minHeight: TOUCH_MIN }}
              className="flex items-baseline justify-between rounded border border-stoneDark bg-paperDim px-2 text-[12px] disabled:opacity-60"
            >
              <span>{STAT_LABEL[stat]}</span>
              <span className="font-medium tabular-nums">{hero.stats[stat]}</span>
            </button>
          ))}
        </div>
        {hero.statPoints > 0 && (
          <p className="mt-1 text-[11px] text-inkSoft">눌러서 올린다. 되돌릴 수 없다.</p>
        )}
      </section>

      <section>
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium">기술</h3>
          <span className="text-[11px] tabular-nums text-inkSoft">
            {hero.skillPoints > 0 ? `쓸 점수 ${hero.skillPoints}` : '쓸 점수 없음'}
          </span>
        </div>
        {SKILLS.map((skill) => {
          const rank = hero.skills[skill.id] ?? 0;
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => spendSkill(skill.id)}
              disabled={rank >= skill.maxRank || hero.skillPoints < skill.cost}
              style={{ minHeight: TOUCH_MIN }}
              className="w-full rounded border border-stoneDark bg-paperDim px-2 text-left disabled:opacity-60"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[12px]">{skill.name}</span>
                <span className="text-[11px] tabular-nums text-inkSoft">
                  {rank} / {skill.maxRank}
                </span>
              </div>
              <div className="text-[11px] text-inkSoft">{skill.desc}</div>
            </button>
          );
        })}
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-medium">
          다음 주 수지 <span className="text-[11px] text-inkSoft">· {SEASON_LABEL[season]}</span>
        </h3>
        {RESOURCE_ORDER.map((id) => {
          const gross = production.gross[id];
          const adj = production.season[id];
          const net = production.net[id];
          // 왜 그 수가 나왔는지 보이게 쪼갠다. 식량만 소비가 붙는다
          const parts = [`생산 ${gross}`];
          if (adj !== 0) parts.push(`계절 ${signed(adj)}`);
          const boon = devoted.weekly[id] ?? 0;
          if (boon !== 0) parts.push(`헌신 ${signed(boon)}`);
          if (id === 'food' && production.foodConsumed > 0) {
            parts.push(`식비 -${production.foodConsumed}`);
          }
          return (
            <div
              key={id}
              className="flex items-baseline justify-between border-b border-stoneDark/20 py-1"
            >
              <span className="text-[12px]">
                {RESOURCE_LABEL[id]}{' '}
                <span className="text-[11px] tabular-nums text-inkSoft">{parts.join(' · ')}</span>
              </span>
              <span
                className={`text-[13px] font-medium tabular-nums ${
                  net < 0 ? 'text-blood' : 'text-ink'
                }`}
              >
                {signed(net)}
              </span>
            </div>
          );
        })}
        <p className="mt-1 text-[11px] text-inkSoft">
          한 주가 지날 때마다 이만큼 더해진다. 식량이 마이너스로 이어지면 기근이 온다.
        </p>
      </section>

      {devotions.length > 0 && (
        <section>
          <h3 className="mb-1 text-[13px] font-medium">
            헌신 <span className="text-[11px] text-inkSoft">· 호감이 끝까지 닿은 사람</span>
          </h3>
          {devotions.map((d) => (
            <Row key={d.name} label={d.name} value={d.text} />
          ))}
          <p className="mt-1 text-[11px] text-inkSoft">
            같은 원형이 여럿이어도 겹치지 않는다.
          </p>
        </section>
      )}

      {/*
        의뢰가 어디에도 안 보였다.
        새 인물이 오는 길이 둘인데(의뢰 · 소개) 의뢰는 회관에 찾아가 받고
        조건을 채우고 다시 보고해야 한다. 그 흐름이 화면에 없으면
        전설기까지 가도 인물이 셋에서 멈춘다 — 실제로 그랬다.
      */}
      <section>
        <h3 className="mb-1 text-[13px] font-medium">
          의뢰 <span className="text-[11px] text-inkSoft">· 새 인물이 오는 길</span>
        </h3>

        {active !== null ? (
          <>
            <Row
              label={active.name}
              value={
                isComplete(state, active)
                  ? '조건 충족 — 보고하라'
                  : `${active.goalText} · ${progressText(state, active)}`
              }
            />
            <p className={`mt-1 text-[11px] ${isComplete(state, active) ? 'text-gold' : 'text-inkSoft'}`}>
              {isComplete(state, active)
                ? `${patronName(active.patronId)}에게 보고하면 끝난다 — ${whereToFind(active.patronId)}.`
                : '조건을 채우면 찾아가 보고한다.'}
            </p>
          </>
        ) : offers.length > 0 ? (
          <>
            {offers.map((q) => (
              <Row
                key={q.id}
                label={`${patronName(q.patronId)} · ${q.name}`}
                value={
                  (q.reward.kind === 'companion' ? '보상 — 사람이 온다 · ' : '') +
                  `${q.goalText} · ${whereToFind(q.patronId)}`
                }
              />
            ))}
            <p className="mt-1 text-[11px] text-gold">
              머리 위에 느낌표가 뜬 사람에게 말을 걸면 맡을 수 있다. 한 번에 하나씩.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-inkSoft">
            지금 받을 의뢰가 없다. 몇 주 지나면 의뢰인이 다시 부탁한다.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-medium">세력</h3>
        {FACTION_ORDER.map((id) => (
          <Row
            key={id}
            label={FACTION_LABEL[id]}
            value={`${state.factions[id]} · ${factionStanding(state.factions[id])}`}
          />
        ))}
        {standings.length === 0 ? (
          <p className="mt-1 text-[11px] text-inkSoft">
            아직 걸린 것이 없다. 평판 {FACTION_STANDING.boon} 을 넘으면 편의를 봐준다.
          </p>
        ) : (
          standings.map((st) => (
            <p key={st.name} className={`text-[11px] ${st.good ? 'text-grassDark' : 'text-blood'}`}>
              {st.name} — {st.text}
            </p>
          ))
        )}
        <p className="mt-1 text-[11px] text-inkSoft">
          마탑과 숲의 부족은 서로 반대다. 넷을 다 챙길 수는 없다.
        </p>
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-medium">마을</h3>
        <Row label="마을 지수" value={`${power}`} />
        <Row
          label="다음 시대"
          value={
            nextEra === undefined
              ? '신화기 너머'
              : `${eraName(nextEra.index, 0)}까지 ${nextEra.power - power}`
          }
        />
        <Row label="거둔 유물" value={held.length === 0 ? '없음' : `${held.length}`} />
        {held.map((relic) => (
          <div key={relic.id} className="flex items-baseline justify-between py-0.5">
            <span className="text-[11px]">{relic.name}</span>
            <span className="text-[11px] text-inkSoft">{relic.desc}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

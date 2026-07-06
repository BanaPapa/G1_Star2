// 무기 스탯 탭 — items.json의 weapons/uniques(slot=weapon) 위에 config.overrides.weaponStats[id]로 덮어쓴다.
// 전투 v1.0의 무기 사거리/AP/명중/관통/범위 필드는 아직 데이터에 없으므로 override로 선반영할 수 있다.
import { useDataStore } from '../../../state/useDataStore'
import { useGameConfigStore } from '../../../state/useGameConfigStore'
import { Section } from '../controls'

const STATS = [
  { key: 'atk', label: 'ATK', baseFrom: (w) => w.mods?.atk ?? 0 },
  { key: 'range', label: '사거리', baseFrom: (w) => w.range ?? 0 },
  { key: 'apCost', label: 'AP', baseFrom: (w) => w.apCost ?? 1 },
  { key: 'rangeBonus', label: '사거리+', baseFrom: (w) => w.rangeBonus ?? 0 },
  { key: 'accuracy', label: '명중', baseFrom: (w) => w.accuracy ?? 0 },
  { key: 'pierce', label: '관통%', baseFrom: (w) => w.pierce ?? 0 },
  { key: 'areaRadius', label: '범위', baseFrom: (w) => w.areaRadius ?? 0 },
  { key: 'cooldown', label: '쿨타임', baseFrom: (w) => w.cooldown ?? 0 },
]

function StatCell({ weaponId, stat, base }) {
  const override = useGameConfigStore((s) => s.config.overrides?.weaponStats?.[weaponId]?.[stat])
  const setPath = useGameConfigStore((s) => s.setPath)
  const value = override ?? base ?? ''
  const isOverridden = override != null && override !== base
  return (
    <input
      className={`scr-statcell${isOverridden ? ' scr-statcell--over' : ''}`}
      type="number"
      value={value}
      title={isOverridden ? `기본값 ${base}` : '기본값'}
      onChange={(e) => {
        const v = e.target.value === '' ? '' : Number(e.target.value)
        setPath(`overrides.weaponStats.${weaponId}.${stat}`, v === '' ? base ?? 0 : v)
      }}
    />
  )
}

export default function WeaponStatsTab() {
  const items = useDataStore((s) => s.data?.items)
  const weapons = [
    ...(items?.weapons ?? []),
    ...((items?.uniques ?? []).filter((u) => u.slot === 'weapon')),
  ]

  return (
    <div className="scr-tabbody">
      <Section
        title="무기 스탯 (요청서 27장)"
        desc="items.json 무기 위에 override. cooldown 등 미사용 필드는 유지(삭제 금지)되며 관제실 Attack 탭에서 cooldownEnabled로 제어."
      >
        <div className="scr-table-wrap">
          <table className="scr-table">
            <thead>
              <tr>
                <th className="scr-table-name">무기</th>
                {STATS.map((s) => <th key={s.key}>{s.label}</th>)}
                <th>특수</th>
              </tr>
            </thead>
            <tbody>
              {weapons.map((w) => (
                <tr key={w.id}>
                  <td className="scr-table-name">{w.name} <em>{w.id}</em></td>
                  {STATS.map((s) => (
                    <td key={s.key}>
                      <StatCell weaponId={w.id} stat={s.key} base={s.baseFrom(w)} />
                    </td>
                  ))}
                  <td className="scr-table-extra">{w.extra ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

// 수리 시설 패널 (Phase 5-2) — 손상 이월된 HP/장갑 내구도를 SC로 회복한다.
// 조선소(모항) = 완전 수리(capPct 1), 아웃포스트 = 레벨별 간이수리 한도(config outpostCapByLevel).
// 비용 공식: 회복 HP × costPerHpSc + 회복 내구도 × costPerArmorDurSc (관제실 조정).
import { useDataStore } from '../../state/useDataStore'
import { useFleetStore } from '../../state/useFleetStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { getEffectiveShip, applyEquipment } from '../../core/growth'
import AssetImage from '../components/AssetImage'

// 로스터 엔트리의 손상/한도/비용 계산 — 패널과 "전체 수리"가 같은 산식을 쓴다 (단위 테스트 대상).
export function repairPlanFor(entry, ship, ov, repairCfg, capPct) {
  const maxHp = ship.hp
  const maxDur = ov.armorDurability ?? ship.armorDurability ?? ship.maxArmorDurability ?? 0
  const curHp = entry.currentHp != null ? Math.min(entry.currentHp, maxHp) : maxHp
  const curDur = entry.currentArmorDur != null ? Math.min(entry.currentArmorDur, maxDur) : maxDur
  // 간이수리 한도 — 최대치의 capPct까지만 회복 가능 (그 이상은 모항 조선소)
  const hpTarget = Math.min(maxHp, Math.max(curHp, Math.floor(maxHp * capPct)))
  const durTarget = Math.min(maxDur, Math.max(curDur, Math.floor(maxDur * capPct)))
  const hpHeal = hpTarget - curHp
  const durHeal = durTarget - curDur
  const cost = Math.ceil(hpHeal * (repairCfg.costPerHpSc ?? 2) + durHeal * (repairCfg.costPerArmorDurSc ?? 1))
  return { maxHp, maxDur, curHp, curDur, hpTarget, durTarget, hpHeal, durHeal, cost }
}

export default function RepairPanel({ capPct = 1, facilityName = '조선소 정비 도크' }) {
  const ships = useDataStore((s) => s.data?.ships?.ships)
  const items = useDataStore((s) => s.data?.items)
  const roster = useFleetStore((s) => s.roster)
  const applyRepair = useFleetStore((s) => s.applyRepair)
  useResourceStore((s) => s.wallet)
  const canAfford = useResourceStore((s) => s.canAfford)
  const spend = useResourceStore((s) => s.spend)
  const config = useGameConfigStore((s) => s.config)

  if (!ships || !items) return null
  const shipsById = new Map(ships.map((s) => [s.id, s]))
  const itemsById = new Map(
    ['weapons', 'modules', 'consumables', 'uniques'].flatMap((cat) => items[cat] ?? []).map((i) => [i.id, i]),
  )
  const repairCfg = config?.economy?.repair ?? {}

  const plans = roster
    .map((entry) => {
      const baseShip = shipsById.get(entry.shipId)
      if (!baseShip) return null
      const ship = applyEquipment(getEffectiveShip(baseShip, entry), entry, itemsById)
      const ov = config?.overrides?.shipStats?.[baseShip.id] ?? {}
      return { entry, ship, plan: repairPlanFor(entry, ship, ov, repairCfg, capPct) }
    })
    .filter(Boolean)

  const damaged = plans.filter(({ plan }) => plan.hpHeal > 0 || plan.durHeal > 0)
  const totalCost = damaged.reduce((sum, { plan }) => sum + plan.cost, 0)

  function repairOne({ entry, plan }) {
    if (plan.cost > 0 && !spend({ sc: plan.cost })) return
    applyRepair(entry.instanceId, { hp: plan.hpTarget, armorDur: plan.durTarget })
  }

  function repairAll() {
    if (totalCost > 0 && !spend({ sc: totalCost })) return
    for (const { entry, plan } of damaged) applyRepair(entry.instanceId, { hp: plan.hpTarget, armorDur: plan.durTarget })
  }

  return (
    <div className="hub-shop">
      <h3 className="hub-shop-name">🛠️ {facilityName}</h3>
      <p className="hub-card-meta">
        {capPct >= 1
          ? '손상된 함선을 완전 수리합니다.'
          : `간이수리 — 최대치의 ${Math.round(capPct * 100)}%까지만 회복됩니다. 완전 수리는 모항 조선소에서.`}
        {' '}비용 = 회복량 비례 (HP ×{repairCfg.costPerHpSc ?? 2} SC · 장갑 내구 ×{repairCfg.costPerArmorDurSc ?? 1} SC)
      </p>

      {damaged.length === 0 ? (
        <p className="hub-card-meta">✅ 손상된 함선이 없습니다{capPct < 1 ? ' (간이수리 한도 기준)' : ''}.</p>
      ) : (
        <>
          <button
            className="hub-action-btn"
            style={{ marginBottom: 10 }}
            disabled={!canAfford({ sc: totalCost })}
            onClick={repairAll}
          >
            🛠 전체 수리 — 💳 {totalCost} SC ({damaged.length}척)
          </button>
          <div className="hub-grid">
            {damaged.map(({ entry, ship, plan }) => (
              <div key={entry.instanceId} className="hub-card">
                <div className="hub-card-head">
                  <AssetImage assetKey={ship.sprite} alt={ship.name} className="hub-item-icon" />
                  <div>
                    <h4 className="hub-card-title">{ship.name} <small>Lv.{entry.level}</small></h4>
                    <p className="hub-card-meta">
                      HP {plan.curHp}/{plan.maxHp}
                      {plan.maxDur > 0 ? ` · 장갑 내구 ${plan.curDur}/${plan.maxDur}` : ''}
                    </p>
                  </div>
                </div>
                <p className="hub-card-meta">
                  회복: HP +{plan.hpHeal}
                  {plan.durHeal > 0 ? ` · 내구 +${plan.durHeal}` : ''}
                  {capPct < 1 ? ` (한도 ${Math.round(capPct * 100)}%)` : ''}
                </p>
                <button className="hub-action-btn" disabled={!canAfford({ sc: plan.cost })} onClick={() => repairOne({ entry, plan })}>
                  {canAfford({ sc: plan.cost }) ? `🛠 수리 — 💳 ${plan.cost} SC` : `⚠ SC 부족 (필요 ${plan.cost})`}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// 건물 시설 패널 — 모항은 본부 건물 4종, 점령 행성은 아웃포스트 (스펙 §2 건물 관리).
// CostRow/BuildingCard는 구 PlanetManagementScreen에서 그대로 옮긴 것.
import { useState } from 'react'
import { useResourceStore } from '../../state/useResourceStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { HOME_BUILDINGS, getEffectiveBuildingDef } from '../../data/buildings'
import '../screens/PlanetManagementScreen.css'

const RESOURCE_ICONS = { sc: '💰', ti: '🔩', ec: '💎', dm: '🌑', nc: '🧬', qd: '📡' }
const RESOURCE_NAMES = {
  sc: 'Stellar', ti: 'Alloy', ec: 'Energy Crystal',
  nc: 'Nanocarbon', qd: 'Quantum Data', ur: '고유자원',
}

function CostRow({ cost, wallet, uniqueRes }) {
  if (!cost) return <span className="pm-cost-none">최대 레벨</span>
  return (
    <div className="pm-cost-list">
      {Object.entries(cost).map(([k, v]) => {
        const have = k === 'ur' ? uniqueRes : (wallet[k] ?? 0)
        const ok = have >= v
        return (
          <span key={k} className={`pm-cost-item${ok ? '' : ' pm-cost-item--short'}`}>
            {RESOURCE_ICONS[k] ?? '📦'} {RESOURCE_NAMES[k] ?? k} {v}
            <span className="pm-cost-have">/{have}</span>
          </span>
        )
      })}
    </div>
  )
}

function BuildingCard({ nodeId, buildingId }) {
  const config = useGameConfigStore((s) => s.config)
  const def = getEffectiveBuildingDef(buildingId, config)
  const level = useBuildingStore((s) => s.getLevel(nodeId, buildingId))
  const upgrade = useBuildingStore((s) => s.upgrade)
  const getUniqueResource = useBuildingStore((s) => s.getUniqueResource)
  const spendUniqueResource = useBuildingStore((s) => s.spendUniqueResource)
  const wallet = useResourceStore((s) => s.wallet)
  const canAfford = useResourceStore((s) => s.canAfford)
  const spend = useResourceStore((s) => s.spend)
  const [flash, setFlash] = useState(false)

  if (!def || level === 0) return null

  const isMaxLevel = level >= def.maxLevel
  const nextLevel = level + 1
  const cost = !isMaxLevel ? def.upgradeCosts[nextLevel] : null
  const uniqueRes = getUniqueResource(nodeId)

  function canAffordCost(c) {
    if (!c) return false
    const normalCost = Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'ur'))
    return canAfford(normalCost) && uniqueRes >= (c.ur ?? 0)
  }

  function handleUpgrade() {
    if (!cost || !canAffordCost(cost)) return
    const normalCost = Object.fromEntries(Object.entries(cost).filter(([k]) => k !== 'ur'))
    spend(normalCost)
    if ((cost.ur ?? 0) > 0) spendUniqueResource(nodeId, cost.ur)
    upgrade(nodeId, buildingId)
    setFlash(true)
    setTimeout(() => setFlash(false), 800)
  }

  return (
    <div className={`pm-card${flash ? ' pm-card--upgraded' : ''}`}>
      <div className="pm-card-header">
        <span className="pm-card-icon">{def.icon}</span>
        <div className="pm-card-title">
          <span className="pm-card-name">{def.name}</span>
          <span className="pm-card-level">
            Lv{level}
            <span className="pm-card-level-bar">
              {Array.from({ length: def.maxLevel }, (_, i) => (
                <span key={i} className={`pm-level-pip${i < level ? ' filled' : ''}`} />
              ))}
            </span>
          </span>
        </div>
      </div>

      <p className="pm-card-desc">{def.description}</p>

      <div className="pm-card-effect">
        <span className="pm-effect-label">현재 효과</span>
        <span className="pm-effect-value">{def.effectByLevel[level] ?? '—'}</span>
      </div>

      {!isMaxLevel && (
        <div className="pm-card-effect pm-card-effect--next">
          <span className="pm-effect-label">Lv{nextLevel} 효과</span>
          <span className="pm-effect-value">{def.effectByLevel[nextLevel]}</span>
        </div>
      )}

      <div className="pm-card-footer">
        {isMaxLevel ? (
          <div className="pm-upgrade-max">★ MAX LEVEL</div>
        ) : (
          <>
            <div className="pm-upgrade-cost">
              <span className="pm-cost-label">업그레이드 비용</span>
              <CostRow cost={cost} wallet={wallet} uniqueRes={uniqueRes} />
            </div>
            <button
              className={`pm-upgrade-btn${canAffordCost(cost) ? '' : ' pm-upgrade-btn--disabled'}`}
              disabled={!canAffordCost(cost)}
              onClick={handleUpgrade}
            >
              {canAffordCost(cost) ? `▲ Lv${nextLevel} 업그레이드` : '⚠ 자원 부족'}
            </button>
          </>
        )}
      </div>

      {buildingId === 'bld_outpost' && (
        <div className="pm-outpost-res">
          <span className="pm-outpost-res-label">🌟 고유자원 보유</span>
          <span className="pm-outpost-res-value">{uniqueRes}</span>
        </div>
      )}
    </div>
  )
}

// 장소맵 건물 탭 — 모항은 본부 건물 4종, 점령 행성은 아웃포스트.
export default function BuildPanel({ nodeId, isHome }) {
  const buildingList = isHome ? HOME_BUILDINGS : ['bld_outpost']
  return (
    <div className="pm-building-grid">
      {buildingList.map((bid) => (
        <BuildingCard key={bid} nodeId={nodeId} buildingId={bid} />
      ))}
    </div>
  )
}

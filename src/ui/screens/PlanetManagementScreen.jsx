import { useState, useEffect } from 'react'
import { useProgressStore } from '../../state/useProgressStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { useDataStore } from '../../state/useDataStore'
import { BUILDINGS, HOME_BUILDINGS, formatBuildingCost } from '../../data/buildings'
import './PlanetManagementScreen.css'

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
  const def = BUILDINGS[buildingId]
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

export default function PlanetManagementScreen({ nodeId, onBack }) {
  // ← 핵심 수정: data.systems.systems 로 배열에 접근
  const systems = useDataStore((s) => s.data?.systems?.systems)
  const conqueredNodeIds = useProgressStore((s) => s.conqueredNodeIds)
  const currentNodeId = useProgressStore((s) => s.currentNodeId)
  const initOutpost = useBuildingStore((s) => s.initOutpost)

  const [selectedNode, setSelectedNode] = useState(nodeId ?? currentNodeId ?? 's0')

  const manageableNodes = [...new Set(['s0', ...conqueredNodeIds])].filter(Boolean)
  const node = systems?.find((s) => s.id === selectedNode)
  const isHome = selectedNode === 's0'
  const isConquered = conqueredNodeIds.includes(selectedNode)

  // 점령 행성 선택 시 아웃포스트 Lv1 자동 생성 (side-effect → useEffect)
  useEffect(() => {
    if (!isHome && isConquered) {
      initOutpost(selectedNode)
    }
  }, [selectedNode, isHome, isConquered, initOutpost])

  const buildingList = isHome ? HOME_BUILDINGS : ['bld_outpost']

  return (
    <div className="pm-screen">
      {/* 우주 배경 */}
      <div className="pm-bg" aria-hidden="true">
        <div className="pm-bg-stars" />
        <div className="pm-bg-nebula" />
        {isHome
          ? <div className="pm-bg-planet pm-bg-planet--home" />
          : <div className="pm-bg-planet pm-bg-planet--colony" />
        }
      </div>

      <div className="pm-content">
        <div className="pm-header">
          <button className="pm-back-btn" onClick={onBack}>← 돌아가기</button>
          <div className="pm-header-title">
            <span className="pm-header-icon">🏗️</span>
            <h1 className="pm-title">행성 관리</h1>
          </div>
          <div className="pm-planet-selector">
            <label className="pm-selector-label">행성 선택</label>
            <select
              className="pm-selector-select"
              value={selectedNode}
              onChange={(e) => setSelectedNode(e.target.value)}
            >
              {manageableNodes.map((nid) => {
                const sys = systems?.find((s) => s.id === nid)
                const label = nid === 's0'
                  ? `🏠 ${sys?.name ?? nid} (모항)`
                  : `🪐 ${sys?.name ?? nid}`
                return <option key={nid} value={nid}>{label}</option>
              })}
            </select>
          </div>
        </div>

        {node && (
          <div className="pm-planet-info">
            <span className="pm-planet-name">{node.name}</span>
            {node.theme && <span className="pm-planet-trait">✦ {node.theme}</span>}
            {isHome
              ? <span className="pm-planet-badge pm-planet-badge--home">모항</span>
              : <span className="pm-planet-badge pm-planet-badge--colony">점령지</span>
            }
          </div>
        )}

        {!isHome && !isConquered ? (
          <div className="pm-empty">
            <div className="pm-empty-icon">🔒</div>
            <p>이 행성은 아직 점령되지 않았습니다.</p>
            <p>전략 맵에서 별계를 정복하면 건물을 관리할 수 있습니다.</p>
          </div>
        ) : (
          <div className="pm-building-grid">
            {buildingList.map((bid) => (
              <BuildingCard key={bid} nodeId={selectedNode} buildingId={bid} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

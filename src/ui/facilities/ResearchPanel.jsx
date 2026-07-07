// 연구 시설 패널 — 연구소(bld_research_lab)가 있는 장소에서만 열린다 (스펙 §2).
// 본문은 구 MaintenanceHubScreen의 ResearchTab/SynergyCard를 그대로 옮긴 것.
// Phase 5-4: 연구소 레벨 = 연구 가능 티어 (buildings.js effectByLevel) — 티어 미달 노드는 해금 차단.
import { useResearchStore } from '../../state/useResearchStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useDevelopmentStore } from '../../state/useDevelopmentStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { researchRequiredTier } from '../../data/facilityGates'
import { formatCost, describeUnlock, useFacilityData } from './common'

// 연구 시너지 카드 — requires 전부 해금되면 활성(✅), 아니면 미충족 연구명을 보여준다(🔒).
function SynergyCard({ synergy, researchById, isUnlocked }) {
  const active = synergy.requires.every((id) => isUnlocked(id))
  const reqNames = synergy.requires.map((id) => researchById.get(id)?.name ?? id)
  const bonusText = Object.entries(synergy.bonus ?? {})
    .map(([key, amount]) => `${key.toUpperCase()} +${amount}`)
    .join(' / ')

  return (
    <div className={`hub-card${active ? ' hub-card--done' : ''}`}>
      <h4 className="hub-card-title">{active ? '✅' : '🔒'} 시너지 — {synergy.name}</h4>
      <p className="hub-card-meta">필요 연구: {reqNames.join(' + ')}</p>
      <p className="hub-card-meta">{synergy.desc}</p>
      <p className="hub-card-meta">함대 보너스: {bonusText}</p>
      <span className={`hub-status${active ? ' hub-status--done' : ''}`}>{active ? '활성' : '미충족'}</span>
    </div>
  )
}

function ResearchTab({ research, synergies, resourcesById, itemsById, shipsById, labLevel }) {
  const isUnlocked = useResearchStore((s) => s.isUnlocked)
  const canUnlock = useResearchStore((s) => s.canUnlock)
  const canAffordUnlock = useResearchStore((s) => s.canAffordUnlock)
  const unlock = useResearchStore((s) => s.unlock)
  useResourceStore((s) => s.wallet) // 지갑 변동 시 재렌더
  const isDeveloped = useDevelopmentStore((s) => s.isDeveloped)
  useDevelopmentStore((s) => s.developed) // 개발 상태 변경 시 재렌더
  const config = useGameConfigStore((s) => s.config)
  const s2Boost = isDeveloped('s2')
  const researchById = new Map(research.map((n) => [n.id, n]))

  return (
    <>
    <p className="hub-card-meta">
      🔬 연구소 Lv.{labLevel} — Tier {labLevel}까지 연구 가능. 상위 티어는 건물 탭에서 연구소를 업그레이드하세요.
    </p>
    <div className="hub-grid">
      {research.map((node) => {
        const unlocked = isUnlocked(node.id)
        const prereqNames = (node.prereq ?? []).map((id) => researchById.get(id)?.name ?? id)
        const prereqMet = (node.prereq ?? []).every((id) => isUnlocked(id))
        const devReqMet = !node.devReq || isDeveloped(node.devReq)
        const requiredTier = researchRequiredTier(node.id, config)
        const tierMet = requiredTier <= labLevel
        const affordable = canAffordUnlock(node)
        const canUnlockNow = canUnlock(node, labLevel) && affordable

        return (
          <div key={node.id} className={`hub-card${unlocked ? ' hub-card--done' : ''}`}>
            <h4 className="hub-card-title">
              {unlocked ? '✅' : prereqMet && tierMet ? '🔬' : '🔒'} {node.name}
            </h4>
            {requiredTier > 1 && (
              <p className="hub-card-meta">
                필요 시설: 연구소 Lv.{requiredTier}
                {tierMet ? ' ✅' : ` 🔒 (현재 Lv.${labLevel})`}
              </p>
            )}
            {prereqNames.length > 0 && (
              <p className="hub-card-meta">선행 연구: {prereqNames.join(', ')}{!prereqMet ? ' (미충족)' : ''}</p>
            )}
            {node.devReq && (
              <p className="hub-card-meta">
                개발 조건: {node.devReq} 별계 개발
                {devReqMet ? ' ✅' : ' 🔒 (미완료)'}
              </p>
            )}
            <p className="hub-card-meta">
              비용: <span className={affordable ? '' : 'hub-cost--short'}>{formatCost(node.cost, resourcesById)}</span>
              {s2Boost && <span style={{ color: '#7cffb2', marginLeft: 6 }}>(-25% 할인 적용)</span>}
            </p>
            <ul className="hub-card-unlocks">
              {node.unlock.map((key) => (
                <li key={key}>{describeUnlock(key, { itemsById, shipsById })}</li>
              ))}
            </ul>
            {unlocked ? (
              <span className="hub-status hub-status--done">해금 완료</span>
            ) : (
              <button className="hub-action-btn" disabled={!canUnlockNow} onClick={() => unlock(node, labLevel)}>
                {!prereqMet ? '🔒 선행 연구 필요'
                  : !devReqMet ? `🔒 ${node.devReq} 별계 개발 필요`
                  : !tierMet ? `🔒 연구소 Lv.${requiredTier} 필요 (현재 Lv.${labLevel})`
                  : affordable ? '🔬 연구 해금'
                  : '⚠ 자원 부족'}
              </button>
            )}
          </div>
        )
      })}
    </div>
    {synergies.length > 0 && (
      <div className="hub-grid">
        {synergies.map((synergy) => (
          <SynergyCard key={synergy.id} synergy={synergy} researchById={researchById} isUnlocked={isUnlocked} />
        ))}
      </div>
    )}
    </>
  )
}

export default function ResearchPanel({ nodeId }) {
  const data = useFacilityData()
  const getLevel = useBuildingStore((s) => s.getLevel)
  useBuildingStore((s) => s.buildings) // 연구소 업그레이드 시 티어 게이트 재계산
  if (!data) return null
  const { effectiveResearch, synergies, resourcesById, itemsById, shipsById } = data
  return (
    <ResearchTab
      research={effectiveResearch}
      synergies={synergies}
      resourcesById={resourcesById}
      itemsById={itemsById}
      shipsById={shipsById}
      labLevel={getLevel(nodeId, 'bld_research_lab')}
    />
  )
}

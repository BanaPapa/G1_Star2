// 조합 시설 패널 — 워크샵(bld_workshop)이 있는 장소에서만 열린다 (스펙 §2).
// 본문은 구 MaintenanceHubScreen의 CraftTab을 그대로 옮긴 것.
// Phase 5-4: 워크샵 레벨 = 제작 가능 티어 (buildings.js effectByLevel) — 결과물 티어 미달이면 제작 차단.
import { useResearchStore } from '../../state/useResearchStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useFleetStore } from '../../state/useFleetStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { recipeRequiredTier } from '../../data/facilityGates'
import AssetImage from '../components/AssetImage'
import { formatCost, useFacilityData } from './common'

function CraftTab({ recipes, research, itemsById, resourcesById, workshopLevel }) {
  const isUnlocked = useResearchStore((s) => s.isUnlocked)
  useResourceStore((s) => s.wallet) // 지갑 변동 시 재렌더되어야 canAfford 결과가 최신으로 반영된다
  const canAfford = useResourceStore((s) => s.canAfford)
  const spend = useResourceStore((s) => s.spend)
  const addItem = useFleetStore((s) => s.addItem)
  const ownedItems = useFleetStore((s) => s.ownedItems)
  const researchById = new Map(research.map((n) => [n.id, n]))

  if (!recipes.length) {
    return <p className="hub-card-meta">아직 해금된 조합 레시피가 없습니다 — 연구 탭에서 관련 기술을 해금해보세요.</p>
  }

  function craft(recipe) {
    if (recipeRequiredTier(recipe, itemsById) > workshopLevel) return
    if (!spend(recipe.materials)) return
    addItem(recipe.result)
  }

  return (
    <>
    <p className="hub-card-meta">
      ⚒️ 워크샵 Lv.{workshopLevel} — Tier {workshopLevel}까지 제작 가능. 상위 티어는 건물 탭에서 워크샵을 업그레이드하세요.
    </p>
    <div className="hub-grid">
      {recipes.map((recipe) => {
        const result = itemsById.get(recipe.result)
        const requirementMet = !recipe.requires || isUnlocked(recipe.requires)
        const requiredTier = recipeRequiredTier(recipe, itemsById)
        const tierMet = requiredTier <= workshopLevel
        const affordable = canAfford(recipe.materials)
        const canCraft = requirementMet && tierMet && affordable
        return (
          <div key={recipe.id} className="hub-card">
            <div className="hub-card-head">
              {result && <AssetImage assetKey={result.icon} alt={result.name} className="hub-item-icon" />}
              <div>
                <h4 className="hub-card-title">{recipe.name}</h4>
                <p className="hub-card-meta">
                  결과물: {result?.name ?? recipe.result}
                  {result?.extra ? ` (${result.extra})` : ''}
                  {' · '}보유 {ownedItems[recipe.result] ?? 0}개
                </p>
              </div>
            </div>
            {recipe.requires && (
              <p className="hub-card-meta">
                필요 연구: {researchById.get(recipe.requires)?.name ?? recipe.requires}
                {!requirementMet ? ' (미해금)' : ''}
              </p>
            )}
            {requiredTier > 1 && (
              <p className="hub-card-meta">
                필요 시설: 워크샵 Lv.{requiredTier}
                {tierMet ? ' ✅' : ` 🔒 (현재 Lv.${workshopLevel})`}
              </p>
            )}
            <p className="hub-card-meta">
              재료: <span className={affordable ? '' : 'hub-cost--short'}>{formatCost(recipe.materials, resourcesById)}</span>
            </p>
            {recipe.note && <p className="hub-card-meta">{recipe.note}</p>}
            <button className="hub-action-btn" disabled={!canCraft} onClick={() => craft(recipe)}>
              {!requirementMet ? '🔒 연구 필요'
                : !tierMet ? `🔒 워크샵 Lv.${requiredTier} 필요 (현재 Lv.${workshopLevel})`
                : affordable ? '🔧 제작'
                : '⚠ 재료 부족'}
            </button>
          </div>
        )
      })}
    </div>
    </>
  )
}

export default function CraftPanel({ nodeId }) {
  const data = useFacilityData()
  const getLevel = useBuildingStore((s) => s.getLevel)
  useBuildingStore((s) => s.buildings) // 워크샵 업그레이드 시 티어 게이트 재계산
  if (!data) return null
  return (
    <CraftTab
      recipes={data.items.recipes ?? []}
      research={data.effectiveResearch}
      itemsById={data.itemsById}
      resourcesById={data.resourcesById}
      workshopLevel={getLevel(nodeId, 'bld_workshop')}
    />
  )
}

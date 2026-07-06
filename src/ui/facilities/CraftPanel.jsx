// 조합 시설 패널 — 워크샵(bld_workshop)이 있는 장소에서만 열린다 (스펙 §2).
// 본문은 구 MaintenanceHubScreen의 CraftTab을 그대로 옮긴 것.
import { useResearchStore } from '../../state/useResearchStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useFleetStore } from '../../state/useFleetStore'
import AssetImage from '../components/AssetImage'
import { formatCost, useFacilityData } from './common'

function CraftTab({ recipes, research, itemsById, resourcesById }) {
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
    if (!spend(recipe.materials)) return
    addItem(recipe.result)
  }

  return (
    <div className="hub-grid">
      {recipes.map((recipe) => {
        const result = itemsById.get(recipe.result)
        const requirementMet = !recipe.requires || isUnlocked(recipe.requires)
        const affordable = canAfford(recipe.materials)
        const canCraft = requirementMet && affordable
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
            <p className="hub-card-meta">
              재료: <span className={affordable ? '' : 'hub-cost--short'}>{formatCost(recipe.materials, resourcesById)}</span>
            </p>
            {recipe.note && <p className="hub-card-meta">{recipe.note}</p>}
            <button className="hub-action-btn" disabled={!canCraft} onClick={() => craft(recipe)}>
              {!requirementMet ? '🔒 연구 필요' : affordable ? '🔧 제작' : '⚠ 재료 부족'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function CraftPanel() {
  const data = useFacilityData()
  if (!data) return null
  return (
    <CraftTab
      recipes={data.items.recipes ?? []}
      research={data.effectiveResearch}
      itemsById={data.itemsById}
      resourcesById={data.resourcesById}
    />
  )
}

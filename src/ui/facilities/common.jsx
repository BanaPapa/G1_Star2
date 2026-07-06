// 시설 패널(연구/상점/조합) 공용 헬퍼 — MaintenanceHubScreen에서 추출.
import { useDataStore } from '../../state/useDataStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import '../screens/MaintenanceHubScreen.css'

export function formatCost(cost, resourcesById) {
  return Object.entries(cost ?? {})
    .map(([key, amount]) => `${resourcesById.get(key)?.name ?? key} ${amount}`)
    .join(' · ')
}

// research.json의 unlock 항목은 "craft:id"/"feature:key"/"buff:key"/"ship:id" 같은 접두 표기와
// 일반 아이템 id가 섞여 있다 — 표시용으로 의미를 풀어 보여준다.
export function describeUnlock(key, { itemsById, shipsById }) {
  const [prefix, rest] = key.includes(':') ? key.split(':') : [null, key]
  if (prefix === 'craft') return `🔧 조합 레시피 해금 — ${itemsById.get(rest)?.name ?? rest}`
  if (prefix === 'feature') return `✨ 기능 해금 — ${rest.replace(/_/g, ' ')}`
  if (prefix === 'buff') return `📈 함대 버프 — ${rest.replace(/_/g, ' ')}`
  if (prefix === 'ship') return `🚀 함선 해금 — ${shipsById.get(rest)?.name ?? rest}`
  const item = itemsById.get(key)
  return item ? `📦 ${item.name} (${item.slot === 'weapon' ? '무기' : '모듈'})` : key
}

// 연구/상점/조합 패널 공용 데이터 — 관제실 override(연구/자원)를 적용해 반환.
// 데이터 로딩 전이면 null을 반환하므로 호출측은 `if (!data) return null` 가드가 필요하다.
export function useFacilityData() {
  const research = useDataStore((s) => s.data?.research?.research)
  const synergies = useDataStore((s) => s.data?.research?.synergies ?? [])
  const items = useDataStore((s) => s.data?.items)
  const shops = useDataStore((s) => s.data?.shops?.shops)
  const resources = useDataStore((s) => s.data?.resources?.resources)
  const ships = useDataStore((s) => s.data?.ships?.ships)
  const wallet = useResourceStore((s) => s.wallet)
  const researchOverride = useGameConfigStore((s) => s.config.overrides?.research) ?? {}
  const resourcesOverride = useGameConfigStore((s) => s.config.overrides?.resources) ?? {}

  if (!research || !items || !shops || !resources || !ships) return null

  // override.research[id] = { cost, prereq, ... } — shallow-merge onto each node.
  const effectiveResearch = Object.keys(researchOverride).length === 0
    ? research
    : research.map((node) => {
        const ov = researchOverride[node.id]
        return ov ? { ...node, ...ov } : node
      })

  // override.resources[id] = { name, icon, ... } — shallow-merge metadata only.
  const effectiveResources = Object.keys(resourcesOverride).length === 0
    ? resources
    : resources.map((r) => {
        const ov = resourcesOverride[r.id]
        return ov ? { ...r, ...ov } : r
      })

  return {
    effectiveResearch,
    synergies,
    items,
    shops,
    wallet,
    effectiveResources,
    resourcesById: new Map(effectiveResources.map((r) => [r.id, r])),
    shipsById: new Map(ships.map((s) => [s.id, s])),
    itemsById: new Map(
      ['weapons', 'modules', 'consumables', 'uniques']
        .flatMap((cat) => items[cat] ?? [])
        .map((i) => [i.id, i])
    ),
  }
}

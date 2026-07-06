// 장소(모항/점령 행성)가 제공하는 시설 탭 목록 — PlaceScreen이 사용.
// 규칙(스펙 §2): 시설 탭은 그 장소에 해당 시설을 제공하는 건물이 존재할 때만 생성된다.
// 모항 상점은 정거장 자체 시설(systems.json facilities의 'shop')이라 건물과 무관하게 항상 제공.
import { HOME_BUILDINGS, getEffectiveBuildingDef } from './buildings'

// 시설 탭 표시 순서 — 이 배열에 있는 것만, 이 순서로 렌더된다.
export const FACILITY_ORDER = ['build', 'research', 'shop', 'craft', 'shipyard', 'repair']

export function getPlaceFacilities(node, getLevel, config) {
  if (!node) return []
  const isHome = node.role === 'home'
  const facilities = new Set(['build'])
  const buildingIds = isHome ? HOME_BUILDINGS : ['bld_outpost']
  for (const buildingId of buildingIds) {
    const def = getEffectiveBuildingDef(buildingId, config)
    if (def?.providesFacility && getLevel(node.id, buildingId) > 0) {
      facilities.add(def.providesFacility)
    }
  }
  if (isHome) facilities.add('shop')
  return FACILITY_ORDER.filter((f) => facilities.has(f))
}

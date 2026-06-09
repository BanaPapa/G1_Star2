import { create } from 'zustand'
import { useResourceStore } from './useResourceStore'

// 별계 개발 시스템 — 정복한 별계에 자원을 투자해 개발하면 devUnlock 효과가 활성화된다(MOD-9).
// 개발 비용·효과는 systems.json의 dev 필드가 출처; 정복 여부는 호출자(StrategyMapScreen)가 판단한다.

export const useDevelopmentStore = create((set, get) => ({
  developed: [], // 개발 완료된 별계 id 목록

  isDeveloped: (nodeId) => get().developed.includes(nodeId),

  // 개발 가능 여부 — dev 데이터가 있고, 정복됐고, 미개발이며, 자원이 충분할 때
  canDevelop: (node, isConquered) => {
    if (!node?.dev) return false
    if (!isConquered) return false
    if (get().developed.includes(node.id)) return false
    return useResourceStore.getState().canAfford(node.dev.cost)
  },

  // 개발 실행 — 자원 소비 후 완료 목록에 추가
  develop: (node, isConquered) => {
    if (!get().canDevelop(node, isConquered)) return false
    if (!useResourceStore.getState().spend(node.dev.cost)) return false
    set((state) => ({ developed: [...state.developed, node.id] }))
    return true
  },
}))

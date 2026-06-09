import { create } from 'zustand'
import { useResourceStore } from './useResourceStore'
import { useDevelopmentStore } from './useDevelopmentStore'

// 연구·개발 트리 진행 상태 — research.json의 prereq(선행 노드)·cost(자원)를 그대로 판정에 쓴다(MOD-7).
// MOD-9: devReq 필드(특정 별계 개발 완료 필요) + s3 개발 시 연구 비용 25% 절감(research_boost) 지원.

// s3 research_boost 개발 완료 시 연구 비용 25% 절감 (최솟값 1)
function getEffectiveCost(cost) {
  if (!useDevelopmentStore.getState().isDeveloped('s3')) return cost ?? {}
  return Object.fromEntries(
    Object.entries(cost ?? {}).map(([k, v]) => [k, Math.max(1, Math.ceil(v * 0.75))]),
  )
}

export const useResearchStore = create((set, get) => ({
  unlockedIds: [],

  isUnlocked: (id) => get().unlockedIds.includes(id),

  // 선행 연구 충족 + devReq(별계 개발 조건) 충족 여부 — 자원은 별도 canAffordUnlock으로 확인
  canUnlock: (node) => {
    if (get().unlockedIds.includes(node.id)) return false
    if (!(node.prereq ?? []).every((id) => get().unlockedIds.includes(id))) return false
    if (node.devReq && !useDevelopmentStore.getState().isDeveloped(node.devReq)) return false
    return true
  },

  // 연구 비용 충족 여부 (research_boost 할인 반영)
  canAffordUnlock: (node) => useResourceStore.getState().canAfford(getEffectiveCost(node.cost)),

  // 조건 + 자원 충족 시 research_boost 할인 적용해 자원 소비 후 해금
  unlock: (node) => {
    if (!get().canUnlock(node)) return false
    if (!useResourceStore.getState().spend(getEffectiveCost(node.cost))) return false
    set((state) => ({ unlockedIds: [...state.unlockedIds, node.id] }))
    return true
  },
}))

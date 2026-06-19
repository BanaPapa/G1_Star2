import { create } from 'zustand'

// 행성별 건물 레벨 + 고유자원 관리
// buildings: { [nodeId]: { [buildingId]: level } }
// uniqueResources: { [nodeId]: amount }  — 각 점령 행성의 고유자원 보유량

const INITIAL_BUILDINGS = {
  s0: {
    bld_command_center: 1,
    bld_research_lab: 1,
    bld_workshop: 1,
    bld_shipyard: 1,
  },
}

export const useBuildingStore = create((set, get) => ({
  buildings: INITIAL_BUILDINGS,
  uniqueResources: {},

  getLevel(nodeId, buildingId) {
    return get().buildings?.[nodeId]?.[buildingId] ?? 0
  },

  upgrade(nodeId, buildingId) {
    const current = get().getLevel(nodeId, buildingId)
    set((state) => ({
      buildings: {
        ...state.buildings,
        [nodeId]: {
          ...(state.buildings[nodeId] ?? {}),
          [buildingId]: current + 1,
        },
      },
    }))
  },

  // 점령 시 아웃포스트 Lv1 자동 생성
  initOutpost(nodeId) {
    if (get().getLevel(nodeId, 'bld_outpost') === 0) {
      set((state) => ({
        buildings: {
          ...state.buildings,
          [nodeId]: {
            ...(state.buildings[nodeId] ?? {}),
            bld_outpost: 1,
          },
        },
      }))
    }
  },

  getUniqueResource(nodeId) {
    return get().uniqueResources[nodeId] ?? 0
  },

  addUniqueResource(nodeId, amount) {
    set((state) => ({
      uniqueResources: {
        ...state.uniqueResources,
        [nodeId]: (state.uniqueResources[nodeId] ?? 0) + amount,
      },
    }))
  },

  spendUniqueResource(nodeId, amount) {
    const current = get().uniqueResources[nodeId] ?? 0
    if (current < amount) return false
    set((state) => ({
      uniqueResources: {
        ...state.uniqueResources,
        [nodeId]: current - amount,
      },
    }))
    return true
  },

  // 세이브/로드용 상태 복원
  loadState({ buildings, uniqueResources }) {
    set({
      buildings: buildings ?? INITIAL_BUILDINGS,
      uniqueResources: uniqueResources ?? {},
    })
  },
}))

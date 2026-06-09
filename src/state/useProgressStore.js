import { create } from 'zustand'
import { useResourceStore } from './useResourceStore'

// 성단 진행 상태 — 현재 위치(currentNodeId)와 정복한 노드 집합(conqueredNodeIds)을 영구 보관한다(MOD-6).
// MOD-8: miningDeposits — 채굴 노드별 잔여 매장량. 없으면 systems.json의 mining.deposit 값이 기본.
// MOD-10: obtainedHiddens — 히든 유니크를 이미 획득한 노드 id 목록(1회 한정). recruitedAces — 영입한 에이스 id 목록.
const HOME_NODE_ID = 's0'

export const useProgressStore = create((set, get) => ({
  currentNodeId: HOME_NODE_ID,
  conqueredNodeIds: [HOME_NODE_ID],
  miningDeposits: {}, // { [nodeId]: remainingDeposit }
  obtainedHiddens: [], // { nodeId } 히든 유니크 획득 완료 노드
  recruitedAces: [],   // 영입된 에이스 id 목록

  isConquered: (nodeId) => get().conqueredNodeIds.includes(nodeId),

  moveTo: (nodeId) => set({ currentNodeId: nodeId }),

  conquer: (nodeId) =>
    set((state) => ({
      currentNodeId: nodeId,
      conqueredNodeIds: state.conqueredNodeIds.includes(nodeId)
        ? state.conqueredNodeIds
        : [...state.conqueredNodeIds, nodeId],
    })),

  // 채굴 가능 여부 — 해당 노드에 mining 데이터가 있고 매장량이 남아 있을 때
  canHarvest: (node) => {
    if (!node?.mining) return false
    const remaining = get().miningDeposits[node.id] ?? node.mining.deposit
    return remaining > 0
  },

  // 채굴 실행 — mining.yield만큼 자원을 획득하고 매장량을 차감한다.
  // isDev: s5 개발 완료 여부 — true 시 mining.devYieldBonus 적용
  // 반환: { resource, amount, remaining } | null
  harvest: (node, isDev = false) => {
    if (!node?.mining) return null
    const remaining = get().miningDeposits[node.id] ?? node.mining.deposit
    if (remaining <= 0) return null
    let yieldAmount = node.mining.yield ?? 1
    if (isDev && node.mining.devYieldBonus) yieldAmount += node.mining.devYieldBonus
    const amount = Math.min(yieldAmount, remaining)
    const newRemaining = remaining - amount
    set((state) => ({
      miningDeposits: { ...state.miningDeposits, [node.id]: newRemaining },
    }))
    useResourceStore.getState().earn({ [node.mining.resource]: amount })
    return { resource: node.mining.resource, amount, remaining: newRemaining }
  },

  // 개발 후 채굴 — devMining 데이터 기반(s2 채굴장 등). 호출자가 isDeveloped를 확인 후 호출한다.
  harvestDev: (node) => {
    if (!node?.devMining) return null
    const key = node.id + '_dev'
    const remaining = get().miningDeposits[key] ?? node.devMining.deposit
    if (remaining <= 0) return null
    const amount = Math.min(node.devMining.yield ?? 1, remaining)
    const newRemaining = remaining - amount
    set((state) => ({
      miningDeposits: { ...state.miningDeposits, [key]: newRemaining },
    }))
    useResourceStore.getState().earn({ [node.devMining.resource]: amount })
    return { resource: node.devMining.resource, amount, remaining: newRemaining }
  },

  // MOD-10: 히든 유니크 획득 여부 — 노드 id 기준(1회 한정)
  isHiddenObtained: (nodeId) => get().obtainedHiddens.includes(nodeId),

  markHiddenObtained: (nodeId) =>
    set((state) => ({
      obtainedHiddens: state.obtainedHiddens.includes(nodeId)
        ? state.obtainedHiddens
        : [...state.obtainedHiddens, nodeId],
    })),

  // MOD-10: 에이스 영입 — 중복 방지
  recruitAce: (aceId) =>
    set((state) => ({
      recruitedAces: state.recruitedAces.includes(aceId)
        ? state.recruitedAces
        : [...state.recruitedAces, aceId],
    })),
}))

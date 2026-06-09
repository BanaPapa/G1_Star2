import { create } from 'zustand'
import { useDataStore } from './useDataStore'

// 자원 지갑(스텔라크레딧·티타늄·에너지크리스탈·다크매터) — resources.json의 start 값으로 초기화되며
// 정비 허브(연구·상점·조합)의 모든 소비·획득이 여기를 거친다(MOD-7).
// "자원 부족 시 비활성" 판정에 쓰이는 canAfford는 cost 객체({ti:30, ec:20} 등)를 그대로 받는다.

function startingWallet(data) {
  const resources = data?.resources?.resources ?? []
  const wallet = {}
  for (const r of resources) wallet[r.id] = r.start ?? 0
  return wallet
}

export const useResourceStore = create((set, get) => ({
  wallet: startingWallet(useDataStore.getState().data),

  canAfford: (cost) => {
    const wallet = get().wallet
    return Object.entries(cost ?? {}).every(([key, amount]) => (wallet[key] ?? 0) >= amount)
  },

  spend: (cost) => {
    if (!get().canAfford(cost)) return false
    set((state) => {
      const wallet = { ...state.wallet }
      for (const [key, amount] of Object.entries(cost ?? {})) wallet[key] -= amount
      return { wallet }
    })
    return true
  },

  earn: (amounts) => {
    set((state) => {
      const wallet = { ...state.wallet }
      for (const [key, amount] of Object.entries(amounts ?? {})) wallet[key] = (wallet[key] ?? 0) + amount
      return { wallet }
    })
  },
}))

// useDataStore.init()은 비동기라 이 스토어가 데이터 로드 완료보다 먼저 만들어질 수 있다 —
// 위 초기값(startingWallet)이 빈 데이터를 보고 0으로 채워질 수 있으므로, 로드가 'ready'가
// 되는 순간 한 번 더 resources.json의 start 값으로 지갑을 채운다(이후엔 플레이 변경값을 그대로 유지).
let hydrated = false
function hydrateWallet(state) {
  if (hydrated || state.status !== 'ready' || !state.data) return
  hydrated = true
  useResourceStore.setState({ wallet: startingWallet(state.data) })
}
hydrateWallet(useDataStore.getState())
useDataStore.subscribe(hydrateWallet)

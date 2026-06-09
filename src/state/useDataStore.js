import { create } from 'zustand'
import { loadGameData } from '../core/dataLoader'

// 앱 시작 시 src/data/*.json 을 로드해 보관하는 스토어.
// status: 'idle' | 'loading' | 'ready' | 'error'
export const useDataStore = create((set, get) => ({
  status: 'idle',
  progress: 0,
  currentKey: null,
  data: null,
  error: null,

  init: async () => {
    if (get().status === 'loading' || get().status === 'ready') return
    set({ status: 'loading', progress: 0, error: null })

    try {
      const data = await loadGameData(({ ratio, key }) => {
        set({ progress: ratio, currentKey: key })
      })
      set({ status: 'ready', progress: 1, currentKey: null, data })
      console.log('[dataLoader] 게임 데이터 로드 완료 — 스토어에 적재됨:', data)
      console.log('[dataLoader] ships:', data.ships?.ships)
    } catch (error) {
      console.error('[dataLoader] 게임 데이터 로드 실패:', error)
      set({ status: 'error', error })
    }
  },
}))

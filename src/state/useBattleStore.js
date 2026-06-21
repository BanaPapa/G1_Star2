import { create } from 'zustand'

export const useBattleStore = create((set) => ({
  units: [],
  setUnits:     (units) => set({ units }),
  clearUnits:   ()      => set({ units: [], activeUnitId: null, playerFlagshipDestroyed: false, enemyFlagshipDestroyed: false }),

  // 현재 선택/행동 중인 함선 id — 하단 카드덱에서 살짝 올라오게(뽑힌 카드처럼) 표시.
  activeUnitId: null,
  setActiveUnit: (id) => set({ activeUnitId: id }),

  autoBattle:    false,
  setAutoBattle: (v)    => set({ autoBattle: v }),

  playerPhase:    true,
  setPlayerPhase: (v)   => set({ playerPhase: v }),

  playerFlagshipDestroyed: false,
  setPlayerFlagshipDestroyed: (v) => set({ playerFlagshipDestroyed: v }),

  enemyFlagshipDestroyed: false,
  setEnemyFlagshipDestroyed: (v) => set({ enemyFlagshipDestroyed: v }),

  // 전투 기록 (최대 50건 보관)
  battleLog: [],
  addBattleRecord: (record) => set((state) => ({
    battleLog: [{ ...record, id: Date.now() }, ...state.battleLog].slice(0, 50),
  })),
  clearBattleLog: () => set({ battleLog: [] }),
}))

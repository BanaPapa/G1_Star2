import { create } from 'zustand'

export const useBattleStore = create((set) => ({
  units: [],
  setUnits:     (units) => set({ units }),
  clearUnits:   ()      => set({ units: [] }),

  autoBattle:    false,
  setAutoBattle: (v)    => set({ autoBattle: v }),

  playerPhase:    true,
  setPlayerPhase: (v)   => set({ playerPhase: v }),
}))

import { create } from 'zustand'

export const useBattleStore = create((set) => ({
  units: [],
  setUnits: (units) => set({ units }),
  clearUnits: () => set({ units: [] }),
}))

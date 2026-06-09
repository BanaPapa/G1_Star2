// 게임 설정 — localStorage에 즉시 영구 저장. BattleScene과 UI 양쪽에서 읽는다(MOD-12).
const SETTINGS_KEY = '7star_settings'

function load() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') } catch { return {} }
}

function persist(patch) {
  try {
    const prev = load()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...prev, ...patch }))
  } catch {}
}

import { create } from 'zustand'

const saved = load()

export const useSettingsStore = create((set) => ({
  cutinEnabled:  saved.cutinEnabled  ?? true,
  soundVolume:   saved.soundVolume   ?? 70,
  battleSpeed:   saved.battleSpeed   ?? 'normal', // 'normal' | 'fast'
  summaryBattle: saved.summaryBattle ?? false,    // true: 요약전투(맵에서 즉시 결과), false: 전술전투

  setCutinEnabled:  (v) => { set({ cutinEnabled: v });  persist({ cutinEnabled: v })  },
  setSoundVolume:   (v) => { set({ soundVolume: v });   persist({ soundVolume: v })   },
  setBattleSpeed:   (v) => { set({ battleSpeed: v });   persist({ battleSpeed: v })   },
  setSummaryBattle: (v) => { set({ summaryBattle: v }); persist({ summaryBattle: v }) },
}))

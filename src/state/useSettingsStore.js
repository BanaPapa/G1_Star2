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
  vfxIntensity:  saved.vfxIntensity  ?? 'full',   // 'off' | 'low' | 'full' — 전투 연출 강도 (셰이크/히트스톱/플래시, 사진 민감성 대비)

  // 튜토리얼 노출 여부 — 첫 전투/첫 입항 가이드를 각각 1회만 띄운다(Phase 10-3).
  // 저장 포맷 호환: 이전 저장본에 없으면 기본 false. 개별 키가 빠져도 false로 채운다.
  tutorialSeen: { battle: false, place: false, ...(saved.tutorialSeen ?? {}) },

  setCutinEnabled:  (v) => { set({ cutinEnabled: v });  persist({ cutinEnabled: v })  },
  setSoundVolume:   (v) => { set({ soundVolume: v });   persist({ soundVolume: v })   },
  setBattleSpeed:   (v) => { set({ battleSpeed: v });   persist({ battleSpeed: v })   },
  setSummaryBattle: (v) => { set({ summaryBattle: v }); persist({ summaryBattle: v }) },
  setVfxIntensity:  (v) => { set({ vfxIntensity: v });  persist({ vfxIntensity: v })  },

  // 튜토리얼 1회 노출 완료 표시 — kind: 'battle' | 'place'
  markTutorialSeen: (kind) => set((s) => {
    if (s.tutorialSeen[kind]) return s
    const next = { ...s.tutorialSeen, [kind]: true }
    persist({ tutorialSeen: next })
    return { tutorialSeen: next }
  }),
}))

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

  // 전투 중 액션 로그 (HUD 메시지 스트림) — 최대 80줄, 오래된 것부터 제거.
  // battleLog(승패 기록)와 완전히 별개. 최신이 배열 끝(아래)에 온다.
  actionLog: [],
  pushActionLog: (text, turn) => set((state) => {
    const prev = state.actionLog
    const last = prev[prev.length - 1]
    if (last && last.text === text && last.turn === (turn ?? 0)) return {} // 연속 중복 스킵 (같은 턴 한정 — 다른 턴의 동일 메시지는 기록)
    const _alSeq = (state._alSeq ?? 0) + 1
    const entry = { id: _alSeq, text, turn: turn ?? 0 }
    const next = prev.length >= 80 ? [...prev.slice(prev.length - 79), entry] : [...prev, entry]
    return { actionLog: next, _alSeq }
  }),
  clearActionLog: () => set({ actionLog: [], _alSeq: 0 }),
}))

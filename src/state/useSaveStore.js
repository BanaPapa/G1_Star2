import { create } from 'zustand'
import { useProgressStore } from './useProgressStore'
import { useFleetStore } from './useFleetStore'
import { useResearchStore } from './useResearchStore'
import { useDevelopmentStore } from './useDevelopmentStore'
import { useResourceStore } from './useResourceStore'
import { useBuildingStore } from './useBuildingStore'

// 세이브 슬롯 1~3 — 모든 게임 상태를 localStorage에 JSON 직렬화(MOD-12).
const PREFIX = '7star_save_'

function readSlot(slot) {
  try { return JSON.parse(localStorage.getItem(PREFIX + slot) ?? 'null') } catch { return null }
}

function writeSlot(slot, data) {
  try { localStorage.setItem(PREFIX + slot, JSON.stringify(data)) } catch {}
}

function eraseSlot(slot) {
  try { localStorage.removeItem(PREFIX + slot) } catch {}
}

// 슬롯 메타정보 — 저장 시각 + 진행 요약(UI 표시용). 전체 데이터를 파싱하지 않고 헤더만 읽는다.
export function getSlotMeta(slot) {
  const data = readSlot(slot)
  if (!data) return null
  return {
    timestamp: data.timestamp,
    conqueredCount: data.progress?.conqueredNodeIds?.length ?? 0,
    wallet: data.resources?.wallet ?? {},
  }
}

export const useSaveStore = create((set) => ({
  rev: 0, // 저장/삭제 시 증가 → SaveScreen이 구독해 재렌더

  save: (slot) => {
    const p = useProgressStore.getState()
    const f = useFleetStore.getState()
    const r = useResearchStore.getState()
    const d = useDevelopmentStore.getState()
    const res = useResourceStore.getState()
    const b = useBuildingStore.getState()

    writeSlot(slot, {
      timestamp: Date.now(),
      progress: {
        currentNodeId:    p.currentNodeId,
        conqueredNodeIds: p.conqueredNodeIds,
        miningDeposits:   p.miningDeposits,
        obtainedHiddens:  p.obtainedHiddens,
        recruitedAces:    p.recruitedAces,
      },
      fleet: {
        roster:     f.roster,
        ownedItems: f.ownedItems,
      },
      research:    { unlockedIds: r.unlockedIds },
      development: { developed:   d.developed   },
      resources:   { wallet:      res.wallet    },
      buildings:   { buildings: b.buildings, uniqueResources: b.uniqueResources },
    })

    set((s) => ({ rev: s.rev + 1 }))
  },

  load: (slot) => {
    const data = readSlot(slot)
    if (!data) return false

    useProgressStore.setState({
      currentNodeId:    data.progress.currentNodeId,
      conqueredNodeIds: data.progress.conqueredNodeIds,
      miningDeposits:   data.progress.miningDeposits   ?? {},
      obtainedHiddens:  data.progress.obtainedHiddens  ?? [],
      recruitedAces:    data.progress.recruitedAces    ?? [],
    })
    useFleetStore.setState({
      roster:     data.fleet.roster,
      ownedItems: data.fleet.ownedItems ?? {},
    })
    useResearchStore.setState({
      unlockedIds: data.research?.unlockedIds ?? [],
    })
    useDevelopmentStore.setState({
      developed: data.development?.developed ?? [],
    })
    useResourceStore.setState({
      wallet: data.resources.wallet,
    })
    if (data.buildings) {
      useBuildingStore.getState().loadState(data.buildings)
    }

    return true
  },

  delete: (slot) => {
    eraseSlot(slot)
    set((s) => ({ rev: s.rev + 1 }))
  },
}))

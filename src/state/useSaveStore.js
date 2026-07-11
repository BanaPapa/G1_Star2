import { create } from 'zustand'
import { useProgressStore } from './useProgressStore'
import { useFleetStore } from './useFleetStore'
import { useResearchStore } from './useResearchStore'
import { useDevelopmentStore } from './useDevelopmentStore'
import { useResourceStore } from './useResourceStore'
import { useBuildingStore } from './useBuildingStore'
import { useStoryStore } from './useStoryStore'
import { SAVE_SCHEMA_VERSION, migrateSave } from '../core/saveMigrations'

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
  const schemaVersion = data.schemaVersion ?? 1
  return {
    timestamp: data.timestamp,
    conqueredCount: data.progress?.conqueredNodeIds?.length ?? 0,
    wallet: data.resources?.wallet ?? {},
    schemaVersion,
    // 미래 빌드가 만든 상위 버전 세이브 — 현재 빌드로는 로드 불가(SaveScreen이 비활성화 표시).
    incompatible: schemaVersion > SAVE_SCHEMA_VERSION,
  }
}

export const useSaveStore = create((set) => ({
  rev: 0, // 저장/삭제 시 증가 → SaveScreen이 구독해 재렌더
  loadRev: 0, // 로드 시 증가 — App이 StrategyMapScreen의 key로 사용해 로드 직후 리마운트(위치 반영)
  lastLoadError: null, // 마지막 load 실패 사유('newer'|'corrupt') — 성공 시 null

  save: (slot) => {
    const p = useProgressStore.getState()
    const f = useFleetStore.getState()
    const r = useResearchStore.getState()
    const d = useDevelopmentStore.getState()
    const res = useResourceStore.getState()
    const b = useBuildingStore.getState()

    writeSlot(slot, {
      schemaVersion: SAVE_SCHEMA_VERSION,
      timestamp: Date.now(),
      progress: {
        currentNodeId:    p.currentNodeId,
        conqueredNodeIds: p.conqueredNodeIds,
        miningDeposits:   p.miningDeposits,
        obtainedHiddens:  p.obtainedHiddens,
        recruitedAces:    p.recruitedAces,
        fleetPos:         p.fleetPos,
      },
      fleet: {
        roster:     f.roster,
        ownedItems: f.ownedItems,
      },
      research:    { unlockedIds: r.unlockedIds },
      development: { developed:   d.developed   },
      resources:   { wallet:      res.wallet    },
      buildings:   { buildings: b.buildings, uniqueResources: b.uniqueResources },
      story:       { seenIds: useStoryStore.getState().seenIds, choices: useStoryStore.getState().choices },
    })

    set((s) => ({ rev: s.rev + 1 }))
  },

  load: (slot) => {
    const raw = readSlot(slot)
    if (!raw) {
      set({ lastLoadError: null }) // 빈 슬롯 — 이전 실패 사유가 남아 UI를 오도하지 않게 초기화
      return false
    }

    // 세이브를 현재 스키마 버전으로 마이그레이션(순수 변환, 원본 불변).
    // 디스크 write-back은 하지 않는다 — 로드는 비파괴(구세이브 원본 보존).
    // 매 로드 시 메모리 마이그레이션 비용은 무시 가능하다.
    const result = migrateSave(raw)
    if (!result.ok) {
      set({ lastLoadError: result.reason })
      return false
    }
    const data = result.data

    // 마이그레이션으로 데이터가 정규화됐으므로 아래 setState의 `??` 폴백은 제거(단일 출처: 마이그레이션).
    useProgressStore.setState({
      currentNodeId:    data.progress.currentNodeId,
      conqueredNodeIds: data.progress.conqueredNodeIds,
      miningDeposits:   data.progress.miningDeposits,
      obtainedHiddens:  data.progress.obtainedHiddens,
      recruitedAces:    data.progress.recruitedAces,
      fleetPos:         data.progress.fleetPos,
    })
    useFleetStore.setState({
      roster:     data.fleet.roster,
      ownedItems: data.fleet.ownedItems,
    })
    useResearchStore.setState({
      unlockedIds: data.research.unlockedIds,
    })
    useDevelopmentStore.setState({
      developed: data.development.developed,
    })
    useResourceStore.setState({
      wallet: data.resources.wallet,
    })
    // buildings는 구세이브에 없을 수 있어 존재 분기를 유지(마이그레이션이 채우지 않음).
    if (data.buildings) {
      useBuildingStore.getState().loadState(data.buildings)
    }
    useStoryStore.setState({ seenIds: data.story.seenIds, choices: data.story.choices, active: null, queue: [] })

    set((s) => ({ loadRev: s.loadRev + 1, lastLoadError: null }))
    return true
  },

  delete: (slot) => {
    eraseSlot(slot)
    set((s) => ({ rev: s.rev + 1 }))
  },
}))

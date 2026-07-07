import { create } from 'zustand'
import storyData from '../data/story.json'

// 스토리 대사 이벤트 상태 (Phase 6-2).
// - trigger(key, onDone): story.json에서 trigger===key인 미재생 이벤트를 찾아 활성화. 재생됐으면 false.
// - 재생 완료 목록(seenIds)은 useSaveStore가 세이브에 포함한다.
// - onDone(choiceId): 대화가 닫힐 때 호출 — 선택지 분기(레이븐 영입 등)는 호출부가 처리.
const EVENTS = storyData.events ?? []

export const useStoryStore = create((set, get) => ({
  seenIds: [],
  active: null, // { event, onDone } — StoryDialog가 구독해 표시

  trigger: (key, onDone = null) => {
    const ev = EVENTS.find((e) => e.trigger === key)
    if (!ev || get().active || get().seenIds.includes(ev.id)) return false
    set({ active: { event: ev, onDone } })
    return true
  },

  close: (choiceId = null) => {
    const { active, seenIds } = get()
    if (!active) return
    set({ seenIds: [...seenIds, active.event.id], active: null })
    active.onDone?.(choiceId)
  },
}))

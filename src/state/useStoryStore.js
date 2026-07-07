import { create } from 'zustand'
import storyData from '../data/story.json'

// 스토리 대사 이벤트 상태 (Phase 6-2).
// - trigger(key, onDone): story.json에서 trigger===key인 미재생 이벤트를 찾아 활성화. 재생됐으면 false.
// - 재생 완료 목록(seenIds)은 useSaveStore가 세이브에 포함한다.
// - onDone(choiceId): 대화가 닫힐 때 호출 — 선택지 분기(레이븐 영입 등)는 호출부가 처리.
const EVENTS = storyData.events ?? []

export const useStoryStore = create((set, get) => ({
  seenIds: [],
  choices: {},  // { 이벤트id: 선택지id } — 문답/분기 선택 기록. 엔딩 등이 참조 (세이브 포함)
  active: null, // { event, onDone } — StoryDialog가 구독해 표시
  queue: [],    // 다른 대사가 재생 중일 때 들어온 트리거 — 닫히면 순서대로 이어진다 (정복 대사→영입 제안 등)

  trigger: (key, onDone = null) => {
    const ev = EVENTS.find((e) => e.trigger === key)
    if (!ev || get().seenIds.includes(ev.id)) return false
    const { active, queue } = get()
    if (active) {
      if (active.event.id === ev.id || queue.some((q) => q.event.id === ev.id)) return false
      set({ queue: [...queue, { event: ev, onDone }] })
    } else {
      set({ active: { event: ev, onDone } })
    }
    return true
  },

  close: (choiceId = null) => {
    const { active, seenIds, queue, choices } = get()
    if (!active) return
    const [next, ...rest] = queue
    set({
      seenIds: [...seenIds, active.event.id],
      choices: choiceId ? { ...choices, [active.event.id]: choiceId } : choices,
      active: next ?? null,
      queue: rest,
    })
    active.onDone?.(choiceId)
  },
}))

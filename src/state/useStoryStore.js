import { create } from 'zustand'
import storyData from '../data/story.json'
import { getGameConfig } from './useGameConfigStore'

// 스토리 대사 이벤트 상태 (Phase 6-2).
// - trigger(key, onDone): story.json에서 trigger===key인 미재생 이벤트를 찾아 활성화. 재생됐으면 false.
// - 재생 완료 목록(seenIds)은 useSaveStore가 세이브에 포함한다.
// - onDone(choiceId): 대화가 닫힐 때 호출 — 선택지 분기(레이븐 영입 등)는 호출부가 처리.
const EVENTS = storyData.events ?? []

// 소품 대화 뽑기 (Phase 6-6) — situation: 'battleWin' | 'dock'.
// 화자 전원이 사용 가능한(카이는 항상, 나머지는 영입된) 항목 중 확률 통과 시 1건. 실패/후보 없음 → null.
// 순환 import 방지를 위해 recruitedAces는 호출부가 넘긴다.
export function pickBark(situation, recruitedAces = [], chance = 0.4) {
  if (Math.random() > chance) return null
  const pool = (storyData.barks?.[situation] ?? []).filter((lines) =>
    lines.every((l) => l.speaker === 'kai' || recruitedAces.includes(l.speaker)),
  )
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export const useStoryStore = create((set, get) => ({
  seenIds: [],
  choices: {},  // { 이벤트id: 선택지id } — 문답/분기 선택 기록. 엔딩 등이 참조 (세이브 포함)
  active: null, // { event, onDone } — StoryDialog가 구독해 표시
  queue: [],    // 다른 대사가 재생 중일 때 들어온 트리거 — 닫히면 순서대로 이어진다 (정복 대사→영입 제안 등)

  trigger: (key, onDone = null) => {
    // 대사 모달 전역 스위치 (config story.dialogEnabled) — OFF면 재생하지 않고 seen도 남기지 않는다
    // (나중에 켜면 그때부터 안 본 대사가 정상 재생). 호출부는 false를 받아 폴백 처리한다.
    if (!getGameConfig()?.story?.dialogEnabled) return false
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

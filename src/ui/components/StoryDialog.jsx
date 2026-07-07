import { useEffect, useState } from 'react'
import { useStoryStore } from '../../state/useStoryStore'
import { useDataStore } from '../../state/useDataStore'
import AssetImage from './AssetImage'
import './StoryDialog.css'

// 스토리 대사 오버레이 (Phase 6-2) — 비주얼 노벨식 하단 대화 상자.
// useStoryStore.active를 구독해 스스로 표시/숨김. 클릭/Enter/Space로 다음 페이지,
// 마지막 페이지에 choices가 있으면 버튼 선택 → close(choiceId)로 분기 전달.
// 초상화는 AssetImage(에이스 portrait 키) — PNG가 없으면 이모지 폴백이라 아트 없이도 동작한다.

export default function StoryDialog() {
  const active = useStoryStore((s) => s.active)
  const close = useStoryStore((s) => s.close)
  const aces = useDataStore((s) => s.data?.aces?.aces)
  const [pageIdx, setPageIdx] = useState(0)

  // 이벤트가 바뀌면 첫 페이지부터
  useEffect(() => { setPageIdx(0) }, [active?.event?.id])

  const pages = active?.event?.pages ?? []
  const page = pages[pageIdx]
  const isLast = pageIdx >= pages.length - 1
  const hasChoices = isLast && Array.isArray(page?.choices) && page.choices.length > 0

  function advance() {
    if (!active || hasChoices) return // 선택지 페이지는 버튼으로만 진행
    if (isLast) close(null)
    else setPageIdx((i) => i + 1)
  }

  useEffect(() => {
    if (!active) return
    function onKey(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!active || !page) return null

  // 화자 해석: narrator → 내레이션(초상화 없음) / 에이스 id → aces.json / 그 외 → 페이지 필드
  const ace = aces?.find((a) => a.id === page.speaker)
  const isNarrator = page.speaker === 'narrator'
  const name = isNarrator ? null : (ace?.name ?? page.name ?? '')
  const portraitKey = ace?.portrait ?? page.portrait ?? null

  return (
    <div className="story-overlay" onClick={advance}>
      <div className={`story-box ${isNarrator ? 'story-box--narrator' : ''}`} onClick={(e) => { e.stopPropagation(); advance() }}>
        {!isNarrator && (
          <div className="story-portrait">
            {portraitKey
              ? <AssetImage assetKey={portraitKey} alt={name} className="story-portrait-img" />
              : <span className="story-portrait-emoji" role="img" aria-label={name}>{page.emoji ?? '👤'}</span>}
          </div>
        )}
        <div className="story-text-area">
          {name && <p className="story-name">{name}</p>}
          <p className="story-text">{page.text}</p>

          {hasChoices ? (
            <div className="story-choices">
              {page.choices.map((c) => (
                <button
                  key={c.id}
                  className="story-choice-btn"
                  onClick={(e) => { e.stopPropagation(); close(c.id) }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="story-advance">{isLast ? '클릭해서 닫기' : '▼'}</span>
          )}
        </div>
        <span className="story-page-count">{pageIdx + 1}/{pages.length}</span>
      </div>
    </div>
  )
}

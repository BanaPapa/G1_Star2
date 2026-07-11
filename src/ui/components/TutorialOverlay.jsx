import { useCallback, useEffect, useState } from 'react'
import './TutorialOverlay.css'

// 절제된 스텝 카드형 튜토리얼 오버레이 (Phase 10-3).
// - steps: [{ title, body, icon? }]
// - onDone: 완료/건너뛰기 콜백 (한 번만 호출)
// - accent: 강조색 (기본 --cyan)
// 요소 타게팅 하이라이트/화살표는 없음 — 화면 하단 중앙의 컴팩트 카드 1장으로 안내한다.
export default function TutorialOverlay({ steps = [], onDone, accent = 'var(--cyan)' }) {
  const [idx, setIdx] = useState(0)
  const [closing, setClosing] = useState(false)

  const total = steps.length
  const step = steps[idx]
  const isLast = idx >= total - 1

  // 완료/건너뛰기 — 중복 호출 방지
  const finish = useCallback(() => {
    setClosing(true)
    onDone?.()
  }, [onDone])

  const next = useCallback(() => {
    if (isLast) finish()
    else setIdx((i) => Math.min(i + 1, total - 1))
  }, [isLast, finish, total])

  // Esc = 건너뛰기
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  if (!total || !step || closing) return null

  return (
    <div className="tut-overlay" style={{ '--tut-accent': accent }}>
      {/* 뒷배경 — 어둡게 깔아 클릭 통과 차단(요소 타게팅 스포트라이트는 없음) */}
      <div className="tut-scrim" onClick={finish} />

      <div className="tut-card" role="dialog" aria-modal="true" aria-label="튜토리얼 안내">
        <button className="tut-skip" onClick={finish} aria-label="건너뛰기">건너뛰기 ✕</button>

        <div className="tut-body" key={idx}>
          {step.icon && <div className="tut-icon" aria-hidden="true">{step.icon}</div>}
          <h3 className="tut-title">{step.title}</h3>
          <p className="tut-text">{step.body}</p>
        </div>

        <div className="tut-footer">
          <div className="tut-dots" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={`tut-dot${i === idx ? ' tut-dot--on' : ''}${i < idx ? ' tut-dot--done' : ''}`} />
            ))}
          </div>
          <button className="tut-next" onClick={next}>
            {isLast ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  )
}

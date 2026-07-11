import { useCallback, useEffect, useRef, useState } from 'react'

// 화면 전환 타이밍(ms). 게임 밸런스 수치가 아니라 UI 연출 상수이므로 config 불필요 — 여기서 한곳에 모아 관리.
// out: 오버레이가 화면을 덮는 시간 / in: 오버레이가 걷히는 시간. CSS 애니메이션 duration과 일치시킬 것.
const TRANSITIONS = {
  warp: { out: 420, in: 320 },
  dock: { out: 380, in: 380 },
  fade: { out: 240, in: 240 },
  slowfade: { out: 900, in: 600 },
}
const DEFAULT_KIND = 'fade'

/**
 * 화면 전환 컨트롤러 훅.
 * startTransition(kind, apply):
 *   1) out 페이즈 시작(오버레이가 덮임) → OUT_MS 후
 *   2) apply()로 실제 화면 교체(덮인 순간) → in 페이즈 시작 → IN_MS 후
 *   3) 오버레이 DOM 제거(transition=null)
 * 전환 중 재호출되면 타이머를 리셋하고 최신 apply로 교체(큐 없이 latest-wins).
 */
export function useScreenTransition() {
  const [transition, setTransition] = useState(null) // null | { kind, phase: 'out' | 'in' }
  const timerRef = useRef(null)
  const applyRef = useRef(null)

  const startTransition = useCallback((kind, apply) => {
    const k = TRANSITIONS[kind] ? kind : DEFAULT_KIND
    const timing = TRANSITIONS[k]
    // latest-wins: 진행 중이던 전환의 타이머/대기 apply를 폐기하고 새 목적지로 다시 시작.
    if (timerRef.current) clearTimeout(timerRef.current)
    applyRef.current = apply
    setTransition({ kind: k, phase: 'out' })
    timerRef.current = setTimeout(() => {
      // 오버레이가 화면을 덮은 순간 실제 화면 교체.
      if (applyRef.current) applyRef.current()
      applyRef.current = null
      setTransition({ kind: k, phase: 'in' })
      timerRef.current = setTimeout(() => {
        setTransition(null)
        timerRef.current = null
      }, timing.in)
    }, timing.out)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return { transition, startTransition }
}

/**
 * 전환 오버레이. transition이 null이면 아무것도 렌더하지 않는다.
 * 애니메이션은 전부 CSS keyframes(transform/opacity/clip-path)로 처리 — JS는 페이즈 전환만 담당.
 * 최상위 fixed, pointer-events로 전환 중 입력 차단. StoryDialog(z600)보다 위, 관제실(z9000)보다 아래.
 */
export default function ScreenTransition({ transition }) {
  if (!transition) return null
  const { kind, phase } = transition
  return (
    <div className={`screen-transition st--${kind} st--${phase}`} aria-hidden="true">
      {kind === 'warp' && (
        <>
          <div className="st-warp-streaks" />
          <div className="st-warp-flash" />
        </>
      )}
      {kind === 'dock' && (
        <>
          <div className="st-dock-bar st-dock-bar--top" />
          <div className="st-dock-bar st-dock-bar--bottom" />
          <div className="st-dock-line" />
        </>
      )}
      {(kind === 'fade' || kind === 'slowfade') && <div className="st-fade" />}
    </div>
  )
}

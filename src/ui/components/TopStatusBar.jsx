import { useState } from 'react'
import ResourceHud from './ResourceHud'
import { useProgressStore } from '../../state/useProgressStore'
import { useFleetStore } from '../../state/useFleetStore'

// 전역 메뉴 — 함대 편성/저장·설정만. 상점·연구·조합·건설은 장소맵(입항) 소속 (스펙 §2·§3).
const NAV_ITEMS = [
  { key: 'fleet', label: '🚀 함대 편성' },
  { key: 'save',  label: '💾 저장/설정' },
]

// Endless Space 2 스타일 상단 한 줄 상태바 — 자원·턴·함대 생존 수를 항상 노출하고,
// 전역 메뉴(함대/저장)는 햄버거 토글 드롭다운에 압축한다.
export default function TopStatusBar({ inBattle, onOpenFleet, onOpenSave, onOpenDevRoom }) {
  const [navOpen, setNavOpen] = useState(false)
  const conqueredNodeIds = useProgressStore((s) => s.conqueredNodeIds)
  const roster = useFleetStore((s) => s.roster)

  // 정복한 별계 수(모항 포함)를 현재 턴으로 표시 — 별계 정복마다 1턴씩 진행된다.
  const turn = conqueredNodeIds.length

  return (
    <header className="app-topbar">
      <button
        className={`app-topbar-burger${navOpen ? ' open' : ''}`}
        onClick={() => setNavOpen((o) => !o)}
        aria-label="메뉴 열기"
      >
        <span className="app-topbar-burger-icon">☰</span>
        <span className="app-topbar-logo">7<span className="accent">★</span></span>
      </button>

      <div className="app-topbar-status">
        <span className="app-topbar-stat app-topbar-stat--turn" title="현재 턴">
          <span className="app-topbar-stat-icon">⏱</span>턴 <b>{turn}</b>
        </span>
        <span className="app-topbar-stat app-topbar-stat--fleet" title="함대 생존 수">
          <span className="app-topbar-stat-icon">🚀</span>함대 <b>{roster.length}</b>
        </span>
      </div>

      <ResourceHud compact />

      {onOpenDevRoom && (
        <button
          className="app-topbar-devbtn"
          onClick={onOpenDevRoom}
          title="개발자 설정 관제실 (F9)"
        >
          ⚙ 관제실
        </button>
      )}

      {navOpen && (
        <>
          <div className="app-topbar-backdrop" onClick={() => setNavOpen(false)} />
          <nav className="app-topbar-drawer holo-panel">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className="app-topbar-drawer-btn"
                onClick={() => {
                  if (item.key === 'fleet') onOpenFleet()
                  else onOpenSave()
                  setNavOpen(false)
                }}
                disabled={inBattle}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </header>
  )
}

import { useState } from 'react'
import ResourceHud from './ResourceHud'
import { useProgressStore } from '../../state/useProgressStore'
import { useFleetStore } from '../../state/useFleetStore'

// 좌측 메뉴(성단 맵·함대 편성·정비 허브·저장설정)를 압축한 드롭다운 항목
const NAV_ITEMS = [
  { key: 'map',    label: '🌌 성단 맵' },
  { key: 'fleet',  label: '🚀 함대 편성' },
  { key: 'hub',    label: '🔧 정비 허브' },
  { key: 'planet', label: '🏗️ 행성 관리' },
  { key: 'save',   label: '💾 저장/설정' },
]

// Endless Space 2 스타일 상단 한 줄 상태바 — 자원·턴·함대 생존 수를 항상 노출하고,
// 기존 좌측 내비게이션은 햄버거 토글로 펼치는 드롭다운에 압축한다.
export default function TopStatusBar({ view, onNavigate, onManagePlanet, inBattle }) {
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

      {navOpen && (
        <>
          <div className="app-topbar-backdrop" onClick={() => setNavOpen(false)} />
          <nav className="app-topbar-drawer holo-panel">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`app-topbar-drawer-btn${view === item.key ? ' active' : ''}`}
                onClick={() => {
                  if (item.key === 'planet' && onManagePlanet) {
                    onManagePlanet()
                  } else {
                    onNavigate(item.key)
                  }
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

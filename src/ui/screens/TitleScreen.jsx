import { getSlotMeta } from '../../state/useSaveStore'
import './TitleScreen.css'

// MOD-13: 타이틀 화면 — 앱 최초 진입점.
// hasSave는 슬롯 1~3 중 하나라도 데이터가 있을 때 "이어하기"를 활성화한다.
export default function TitleScreen({ onNewGame, onContinue, onSettings }) {
  const hasSave = [1, 2, 3].some((i) => getSlotMeta(i) !== null)

  return (
    <div className="title-screen">
      <div className="title-bg" aria-hidden="true" />

      <div className="title-content">
        <div className="title-logo-wrap">
          <h1 className="title-logo">
            7<span className="title-star">★</span> STAR
          </h1>
          <p className="title-tagline">변경 성단 원정기</p>
        </div>

        <nav className="title-menu">
          <button className="title-btn title-btn--primary" onClick={onNewGame}>
            🚀 새 게임
          </button>
          <button
            className="title-btn title-btn--primary"
            disabled={!hasSave}
            onClick={onContinue}
          >
            📂 이어하기{!hasSave && ' (저장 없음)'}
          </button>
          <button className="title-btn title-btn--secondary" onClick={onSettings}>
            ⚙️ 저장 / 설정
          </button>
        </nav>

        <p className="title-version">MOD-13 COMPLETE · 1성단 수직 슬라이스</p>
      </div>
    </div>
  )
}

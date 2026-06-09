import './EndingScreen.css'

// MOD-11: 성단 클리어 엔딩 화면 — 보스 격파 후 표시되며 "처음부터" 버튼으로 게임을 재시작한다.
export default function EndingScreen({ onRestart }) {
  return (
    <div className="ending-screen">
      <div className="ending-stars" aria-hidden="true" />

      <div className="ending-content">
        <h2 className="ending-title">🌌 1성단 클리어!</h2>
        <p className="ending-subtitle">심연의 파수꾼을 격파했습니다.</p>

        <div className="ending-story">
          <p>변경 성단을 뒤덮던 보이드의 어둠이 걷혔습니다.</p>
          <p>함대는 최후의 요새를 돌파하고, 성단 너머의 항로를 열었습니다.</p>
          <p>그러나 심연 깊은 곳에서, 더 강한 신호가 포착되기 시작합니다...</p>
          <p className="ending-teaser">
            ── <em>7★ STAR — 다음 은하로 이어집니다.</em> ──
          </p>
        </div>

        <div className="ending-stats">
          <p className="ending-stats-label">수고하셨습니다!</p>
        </div>

        <button className="ending-restart-btn" onClick={onRestart}>
          🔄 처음부터
        </button>
      </div>
    </div>
  )
}

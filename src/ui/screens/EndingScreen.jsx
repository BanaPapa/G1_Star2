import { useStoryStore } from '../../state/useStoryStore'
import { useProgressStore } from '../../state/useProgressStore'
import './EndingScreen.css'

// MOD-11: 성단 클리어 엔딩 화면 — 보스 격파 후 표시되며 "처음부터" 버튼으로 게임을 재시작한다.
// Phase 6-5: 니힐 문답의 답(useStoryStore.choices)과 레이븐 영입 여부에 따라 문구가 달라진다.

// 워든 2페이즈 문답 "문명은 왜 존재해야 하는가"의 답 → 엔딩 한 줄
const ANSWER_LINES = {
  memory: '"기억하기 위해서." — 루멘의 이름은 이제 폐허가 아니라, 살아 있는 함대의 항해일지에 남습니다.',
  future: '"다음 아침을 건네주기 위해서." — 다이달로스의 관문 너머로, 새 개척선들이 첫 항해를 준비합니다.',
  defiance: '"살아 있음을 증명하겠다." — 답은 말이 아니라, 니힐의 정적을 깬 함포 소리로 기록되었습니다.',
}

export default function EndingScreen({ onRestart }) {
  const answer = useStoryStore((s) => s.choices['warden_phase2'])
  const hasRaven = useProgressStore((s) => s.recruitedAces.includes('raven'))

  return (
    <div className="ending-screen">
      <div className="ending-stars" aria-hidden="true" />

      <div className="ending-content">
        <h2 className="ending-title">🌌 1성단 클리어!</h2>
        <p className="ending-subtitle">심연의 파수꾼을 격파했습니다.</p>

        <div className="ending-story">
          <p>변경 성단을 뒤덮던 보이드의 어둠이 걷혔습니다.</p>
          <p>루멘을 지운 시스템은 침묵했고, 항법 장치에는 별들이 하나씩 돌아옵니다.</p>
          {answer && ANSWER_LINES[answer] && <p className="ending-answer">{ANSWER_LINES[answer]}</p>}
          {hasRaven && <p>한때 적이었던 검은 날개가, 지금은 함대와 같은 하늘을 날고 있습니다.</p>}
          <p>다이달로스 정거장은 새로운 시대의 관문으로 재탄생합니다 — 우주는 다시 연결되기 시작합니다.</p>
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

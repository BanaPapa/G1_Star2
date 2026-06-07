import { useEffect } from 'react'
import { useDataStore } from './state/useDataStore'
import LoadingScreen from './ui/screens/LoadingScreen'
import BattleScreen from './ui/screens/BattleScreen'
import './App.css'

function App() {
  const status = useDataStore((s) => s.status)
  const progress = useDataStore((s) => s.progress)
  const currentKey = useDataStore((s) => s.currentKey)
  const init = useDataStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  if (status !== 'ready') {
    return <LoadingScreen progress={progress} currentKey={currentKey} status={status} />
  }

  return (
    <div className="dev-screen">
      <h1>
        7<span className="accent">★</span> STAR
      </h1>
      <p className="subtitle">MOD-4 · 스킬·필살기 & 컷인 연출 확인</p>
      <p className="hint">
        전투기(카이)·순양함(세라)에는 에이스가 배치되어 있습니다 — 유닛을 선택하면 HUD 아래에 필살기
        칩이 표시되고, <b>TP가 100%</b>가 되면 황금색으로 점멸하며 클릭해 발동할 수 있습니다(TP 전액 소모).
        대상 지정 방식은 필살기마다 다릅니다 — 카이의 &ldquo;광휘 돌격&rdquo;은 직선 방향의 칸을 클릭하면
        그 직선 위의 적을 모두 관통하고, 세라의 &ldquo;성흔 저격&rdquo;은 사거리와 무관하게 적 유닛을 바로
        클릭해 저격합니다. 발동하면 시간이 멈추고 일러스트가 슬라이드인되며 화면 흔들림·플래시와 함께
        데이터 그대로의 데미지가 적용되는 풀스크린 컷인이 재생됩니다. 화면 우측 상단의{' '}
        <b>🎬 컷인 연출 ON/OFF</b> 토글을 끄면 연출 없이 결과만 즉시 적용되어 빠르게 진행할 수 있습니다.
        그 외 이동·공격·턴 진행은 MOD-3과 동일합니다(스페이스바: 턴 종료).
      </p>
      <BattleScreen />
    </div>
  )
}

export default App

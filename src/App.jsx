import { useEffect, useRef, useState } from 'react'
import { useDataStore } from './state/useDataStore'
import { useSettingsStore } from './state/useSettingsStore'
import { useMapStore } from './state/useMapStore'
import { soundManager } from './core/soundManager'
import LoadingScreen from './ui/screens/LoadingScreen'
import TitleScreen from './ui/screens/TitleScreen'
import StrategyMapScreen from './ui/screens/StrategyMapScreen'
import BattleScreen from './ui/screens/BattleScreen'
import FleetScreen from './ui/screens/FleetScreen'
import MaintenanceHubScreen from './ui/screens/MaintenanceHubScreen'
import PlanetManagementScreen from './ui/screens/PlanetManagementScreen'
import EndingScreen from './ui/screens/EndingScreen'
import SaveScreen from './ui/screens/SaveScreen'
import TopStatusBar from './ui/components/TopStatusBar'
import SystemControlRoom from './ui/devroom/SystemControlRoom'
import './App.css'

const BGM_FOR_VIEW = {
  title: 'title',
  map: 'map',
  fleet: 'map',
  hub: 'map',
  planet: 'map',
  save: 'map',
  battle: 'battle',
  ending: 'map',
}

function App() {
  const status = useDataStore((s) => s.status)
  const progress = useDataStore((s) => s.progress)
  const currentKey = useDataStore((s) => s.currentKey)
  const init = useDataStore((s) => s.init)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const [view, setView] = useState('title')
  const [prevView, setPrevView] = useState(null)
  const [activeNodeId, setActiveNodeId] = useState(null)
  const [planetNodeId, setPlanetNodeId] = useState(null)
  const [devRoomOpen, setDevRoomOpen] = useState(false)
  const [devRoomTab, setDevRoomTab] = useState('combat')
  const [mockBattle, setMockBattle] = useState(false)
  const [battleCategory, setBattleCategory] = useState(null)
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  function navigate(next) {
    setPrevView(view)
    setView(next)
  }

  // 에디터 "모의 전투" — testBattleMap이 설정되면(스토어 구독) 관제실을 닫고 테스트 전투로 진입.
  useEffect(() => useMapStore.subscribe((state, prev) => {
    // mockNonce가 바뀌면(=모의 전투 버튼을 눌렀으면) 같은 맵이어도 항상 재진입한다.
    if (!state.testBattleMap || state.mockNonce === prev.mockNonce) return
    const sys = useDataStore.getState().data?.systems?.systems ?? []
    const node = sys.find((s) => s.role !== 'home') ?? sys[0]
    setDevRoomOpen(false)
    setMockBattle(true)
    setBattleCategory(null)
    setActiveNodeId(node?.id ?? null)
    setPrevView(viewRef.current)
    setView('battle')
  }), [viewRef])

  useEffect(() => { init() }, [init])

  // 개발자 관제실 전역 단축키: F9는 항상 토글, 백틱(`)은 입력 중이 아닐 때만 토글, Esc는 닫기.
  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'F9' || (e.key === '`' && !typing)) {
        e.preventDefault()
        setDevRoomOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setDevRoomOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    soundManager.setVolume(soundVolume)
  }, [soundVolume])

  useEffect(() => {
    const bgmKey = BGM_FOR_VIEW[view]
    if (bgmKey) soundManager.playBgm(bgmKey)
  }, [view])

  if (status !== 'ready') {
    return <LoadingScreen progress={progress} currentKey={currentKey} status={status} />
  }

  function handleNewGame() { navigate('map') }
  function handleContinue() { navigate('save') }
  function handleSettings()  { navigate('save') }
  function handleGameOver()  { navigate('gameover') }

  function handleEnterBattle(nodeId, category = null) {
    setActiveNodeId(nodeId)
    setBattleCategory(category)
    setMockBattle(false)
    navigate('battle')
  }

  function handleExitBattle() {
    setActiveNodeId(null)
    if (mockBattle) {
      // 모의 전투는 테스트 — 끝나면 메인맵이 아니라 에디터(관제실)로 복귀한다.
      setMockBattle(false)
      useMapStore.getState().clearTestBattleMap()
      setView(prevView ?? 'map')
      setDevRoomTab('mapeditor')
      setDevRoomOpen(true)
      return
    }
    navigate('map')
  }

  function handleEnding() {
    setActiveNodeId(null)
    navigate('ending')
  }

  function handleManagePlanet(nodeId) {
    setPlanetNodeId(nodeId ?? null)
    navigate('planet')
  }

  const inBattle = view === 'battle'

  return (
    <>
      {view === 'title' && (
        <TitleScreen
          onNewGame={handleNewGame}
          onContinue={handleContinue}
          onSettings={handleSettings}
        />
      )}

      {view === 'gameover' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#05020a', gap: 24 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 52, color: '#dc2626', textShadow: '0 0 40px rgba(220,38,38,0.6)' }}>💥 GAME OVER</div>
          <p style={{ fontFamily: 'var(--mono)', color: '#cdd8f4', fontSize: 18, margin: 0 }}>함대가 전멸했습니다. 처음부터 다시 도전하세요.</p>
          <button onClick={() => window.location.reload()} style={{ fontFamily: 'var(--mono)', fontSize: 16, padding: '12px 32px', background: 'rgba(220,38,38,0.18)', border: '2px solid #dc2626', borderRadius: 10, color: '#ffd166', cursor: 'pointer', letterSpacing: 1 }}>
            🔄 새 게임 시작
          </button>
        </div>
      )}

      {view !== 'title' && view !== 'gameover' && (
        <div className="app-shell">
          <TopStatusBar
            view={view}
            onNavigate={(next) => !inBattle && navigate(next)}
            onManagePlanet={() => !inBattle && handleManagePlanet(null)}
            inBattle={inBattle}
            onOpenDevRoom={() => setDevRoomOpen(true)}
          />

          <main className="app-content">
            {view === 'map' && (
              <StrategyMapScreen onEnterBattle={handleEnterBattle} onGameOver={handleGameOver} onManagePlanet={handleManagePlanet} />
            )}

            {view === 'battle' && (
              <BattleScreen nodeId={activeNodeId} mock={mockBattle} battleCategory={battleCategory} onExit={handleExitBattle} onEnding={handleEnding} onGameOver={handleGameOver} />
            )}

            {view === 'ending' && <EndingScreen onRestart={() => window.location.reload()} />}

            {(view === 'fleet' || view === 'hub' || view === 'save' || view === 'planet') && (
              <div className="app-content-scroll">
                {view === 'save' && (
                  <SaveScreen
                    onBack={prevView === 'title' ? () => navigate('title') : undefined}
                    onLoaded={() => navigate('map')}
                  />
                )}
                {view === 'fleet' && <FleetScreen />}
                {view === 'hub' && <MaintenanceHubScreen />}
                {view === 'planet' && (
                  <PlanetManagementScreen
                    nodeId={planetNodeId}
                    onBack={() => navigate(prevView ?? 'map')}
                  />
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* 개발자 설정 관제실 — F9 / 백틱(`) / ⚙ 버튼으로 토글. 어느 화면에서나 접근 가능. */}
      {devRoomOpen && (
        <SystemControlRoom onClose={() => setDevRoomOpen(false)} inBattle={inBattle} initialTab={devRoomTab} />
      )}
    </>
  )
}

export default App

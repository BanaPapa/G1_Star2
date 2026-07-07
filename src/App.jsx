import { useEffect, useRef, useState } from 'react'
import { useDataStore } from './state/useDataStore'
import { useSettingsStore } from './state/useSettingsStore'
import { useMapStore } from './state/useMapStore'
import { useSaveStore } from './state/useSaveStore'
import { soundManager } from './core/soundManager'
import LoadingScreen from './ui/screens/LoadingScreen'
import TitleScreen from './ui/screens/TitleScreen'
import StrategyMapScreen from './ui/screens/StrategyMapScreen'
import BattleScreen from './ui/screens/BattleScreen'
import FleetScreen from './ui/screens/FleetScreen'
import PlaceScreen from './ui/screens/PlaceScreen'
import EndingScreen from './ui/screens/EndingScreen'
import SaveScreen from './ui/screens/SaveScreen'
import TopStatusBar from './ui/components/TopStatusBar'
import StoryDialog from './ui/components/StoryDialog'
import { useStoryStore } from './state/useStoryStore'
import SystemControlRoom from './ui/devroom/SystemControlRoom'
import './App.css'

// 화면 3계층: main(성단맵) / place(장소맵) / battle(전투맵) + title/ending/gameover (스펙 §1)
const BGM_FOR_SCREEN = {
  title: 'title',
  main: 'map',
  place: 'map',
  battle: 'battle',
  ending: 'map',
}

function App() {
  const status = useDataStore((s) => s.status)
  const progress = useDataStore((s) => s.progress)
  const currentKey = useDataStore((s) => s.currentKey)
  const init = useDataStore((s) => s.init)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const loadRev = useSaveStore((s) => s.loadRev)

  const [nav, setNav] = useState({ screen: 'title', placeId: null })
  const [prevNav, setPrevNav] = useState(null)
  // 전역 오버레이: 함대 편성/저장·설정 — 어느 화면 위에서든 열린다 (전투 중 제외, 스펙 §2)
  const [overlay, setOverlay] = useState(null) // null | 'fleet' | 'save'
  const [activeNodeId, setActiveNodeId] = useState(null)
  const [devRoomOpen, setDevRoomOpen] = useState(false)
  const [devRoomTab, setDevRoomTab] = useState('combat')
  const [mockBattle, setMockBattle] = useState(false)
  const [battleCategory, setBattleCategory] = useState(null)
  const navRef = useRef(nav)
  useEffect(() => { navRef.current = nav }, [nav])

  function navigate(screen, placeId = null) {
    setPrevNav(navRef.current)
    setNav({ screen, placeId })
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
    setPrevNav(navRef.current)
    setNav({ screen: 'battle', placeId: null })
  }), [])

  useEffect(() => { init() }, [init])

  // 개발자 관제실 전역 단축키: F9는 항상 토글, 백틱(`)은 입력 중이 아닐 때만 토글,
  // Esc는 관제실·전역 오버레이 닫기.
  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'F9' || (e.key === '`' && !typing)) {
        e.preventDefault()
        setDevRoomOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setDevRoomOpen(false)
        setOverlay(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    soundManager.setVolume(soundVolume)
  }, [soundVolume])

  useEffect(() => {
    const bgmKey = BGM_FOR_SCREEN[nav.screen]
    if (bgmKey) soundManager.playBgm(bgmKey)
  }, [nav.screen])

  if (status !== 'ready') {
    return <LoadingScreen progress={progress} currentKey={currentKey} status={status} />
  }

  function handleNewGame() {
    navigate('main')
    useStoryStore.getState().trigger('newGame') // 프롤로그 — 최초 1회만 재생 (Phase 6-2)
  }
  function handleContinue() { setOverlay('save') }
  function handleSettings() { setOverlay('save') }
  function handleGameOver() { navigate('gameover') }

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
      setNav(prevNav ?? { screen: 'main', placeId: null })
      setDevRoomTab('mapeditor')
      setDevRoomOpen(true)
      return
    }
    navigate('main')
  }

  function handleEnding() {
    setActiveNodeId(null)
    navigate('ending')
  }

  function handleEnterPlace(placeId) { navigate('place', placeId) }
  function handleExitPlace()         { navigate('main') }

  const inBattle = nav.screen === 'battle'

  return (
    <>
      {nav.screen === 'title' && (
        <TitleScreen
          onNewGame={handleNewGame}
          onContinue={handleContinue}
          onSettings={handleSettings}
        />
      )}

      {nav.screen === 'gameover' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#05020a', gap: 24 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 52, color: '#dc2626', textShadow: '0 0 40px rgba(220,38,38,0.6)' }}>💥 GAME OVER</div>
          <p style={{ fontFamily: 'var(--mono)', color: '#cdd8f4', fontSize: 18, margin: 0 }}>함대가 전멸했습니다. 처음부터 다시 도전하세요.</p>
          <button onClick={() => window.location.reload()} style={{ fontFamily: 'var(--mono)', fontSize: 16, padding: '12px 32px', background: 'rgba(220,38,38,0.18)', border: '2px solid #dc2626', borderRadius: 10, color: '#ffd166', cursor: 'pointer', letterSpacing: 1 }}>
            🔄 새 게임 시작
          </button>
        </div>
      )}

      {nav.screen !== 'title' && nav.screen !== 'gameover' && (
        <div className="app-shell">
          <TopStatusBar
            inBattle={inBattle}
            onOpenFleet={() => !inBattle && setOverlay('fleet')}
            onOpenSave={() => !inBattle && setOverlay('save')}
            onOpenDevRoom={() => setDevRoomOpen(true)}
          />

          <main className="app-content">
            {nav.screen === 'main' && (
              // key=loadRev: 세이브 로드 직후 리마운트해 로드된 함대 위치(fleetPos)를 반영
              <StrategyMapScreen
                key={loadRev}
                onEnterBattle={handleEnterBattle}
                onGameOver={handleGameOver}
                onEnterPlace={handleEnterPlace}
              />
            )}

            {nav.screen === 'place' && (
              <div className="app-content-scroll">
                <PlaceScreen placeId={nav.placeId} onExit={handleExitPlace} />
              </div>
            )}

            {nav.screen === 'battle' && (
              <BattleScreen nodeId={activeNodeId} mock={mockBattle} battleCategory={battleCategory} onExit={handleExitBattle} onEnding={handleEnding} onGameOver={handleGameOver} />
            )}

            {nav.screen === 'ending' && <EndingScreen onRestart={() => window.location.reload()} />}
          </main>
        </div>
      )}

      {/* 전역 오버레이 — 함대 편성 / 저장·설정 (스펙 §2 전역 메뉴). Esc 또는 ✕로 닫는다. */}
      {overlay && (
        <div className="app-overlay">
          <div className="app-overlay-head">
            <button className="app-overlay-close" onClick={() => setOverlay(null)}>✕ 닫기 (Esc)</button>
          </div>
          <div className="app-overlay-body">
            {overlay === 'fleet' && <FleetScreen />}
            {overlay === 'save' && (
              <SaveScreen
                onBack={() => setOverlay(null)}
                onLoaded={() => { setOverlay(null); navigate('main') }}
              />
            )}
          </div>
        </div>
      )}

      {/* 스토리 대사 오버레이 — useStoryStore.active가 있을 때만 스스로 표시 (Phase 6-2) */}
      <StoryDialog />

      {/* 개발자 설정 관제실 — F9 / 백틱(`) / ⚙ 버튼으로 토글. 어느 화면에서나 접근 가능. */}
      {devRoomOpen && (
        <SystemControlRoom onClose={() => setDevRoomOpen(false)} inBattle={inBattle} initialTab={devRoomTab} />
      )}
    </>
  )
}

export default App

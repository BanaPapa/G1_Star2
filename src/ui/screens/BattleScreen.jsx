import { useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import BattleScene from '../../game/scenes/BattleScene'
import { useDataStore }     from '../../state/useDataStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useBattleStore }   from '../../state/useBattleStore'
import { useFleetStore }    from '../../state/useFleetStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useResearchStore } from '../../state/useResearchStore'
import { getBattlefieldSizeByTier, getPlayerWeaponTier } from '../../core/combatMath'
import { calculateRetreatChance, calculateNegotiationChance } from '../../core/combatMath/flagship'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { useMapStore, pickCategoryMap } from '../../state/useMapStore'

// 함선 전투력(카드덱 정렬 기준) — 화력 비중을 크게, 기함은 최상위.
function shipStrength(u) {
  return (u.atk ?? 0) * 6 + (u.maxHp ?? 0) + (u.maxShield ?? 0) + (u.isFlagship ? 100000 : 0)
}

// 무기 계열 아이콘 — 카드/HUD에서 장착 무기를 한눈에 구분
const FAMILY_ICON = { laser: '🔦', ion: '⚡', plasma: '🔥', gravity: '🌀', antimatter: '🕳️' }

// ── 좌측 플로팅 액션 버튼 (호버 시 이름·설명 펼침) ──
function BtlFab({ emoji, label, desc, color, onClick, disabled, active }) {
  return (
    <button className={`btl-fab${active ? ' btl-fab--on' : ''}`} style={{ '--fab': color }}
      onClick={onClick} disabled={disabled}>
      <span className="btl-fab-emoji">{emoji}</span>
      <span className="btl-fab-info">
        <b>{label}</b>
        <small>{desc}</small>
      </span>
    </button>
  )
}

// ── 하단 함선 카드 (카드덱 스타일) ──
// 평소엔 이름이 적힌 상단만 보이고, 호버/행동 중이면 카드 전체가 올라온다.
// index 0 = 가장 강함(가장 바깥쪽). 안쪽(중앙) 기준선에서 약함→강함 순으로 바깥에 깔린다.
function ShipCard({ u, side, index, count, active }) {
  const [hov, setHov] = useState(false)
  const raised = hov || active
  const isAlly = side === 'ally'
  const hpPct = u.maxHp > 0 ? Math.max(0, (u.hp / u.maxHp) * 100) : 0
  const shPct = u.maxShield > 0 ? Math.max(0, (u.shield / u.maxShield) * 100) : 0
  const STEP = 92 // 카드 간 가로 간격(겹침 줄임)
  // 안쪽(중앙 기준선)에 가장 약한 카드, 강한 카드일수록 바깥(화면 끝)으로.
  // distFromInner: 안쪽 기준선에서 바깥으로의 거리. 가장 약한 카드(가장 큰 index) = 0.
  const distFromInner = (count - 1 - index) * STEP
  const pos = isAlly ? { right: distFromInner } : { left: distFromInner }
  // 바깥(강한) 카드가 위로 오게 z-index. 올라온 카드는 최상위.
  const z = raised ? 500 : (count - index)
  return (
    <div
      className={`btl-card btl-card--${side}${raised ? ' btl-card--raised' : ''}${u.dead ? ' btl-card--dead' : ''}`}
      style={{ ...pos, zIndex: z }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* 카드 상단 — 평소에 보이는 부분(이름) */}
      <div className="btl-card-head">
        <span className="btl-card-emoji">{u.sprite}{u.isFlagship ? '👑' : ''}</span>
        <span className="btl-card-name">{u.name}</span>
      </div>
      {/* 카드 본문 — 카드가 올라왔을 때 드러나는 부분 */}
      <div className="btl-card-body">
        {u.aceName && <div className="btl-card-ace">{u.aceName}</div>}
        <div className="btl-card-hpbar">
          <div className="btl-card-hpfill" style={{ width: hpPct + '%', background: isAlly ? '#3ad6c4' : '#e23b4e' }} />
        </div>
        {u.maxShield > 0 && (
          <div className="btl-card-shbar">
            <div className="btl-card-shfill" style={{ width: shPct + '%' }} />
          </div>
        )}
        <div className="btl-card-stats">
          <span title="체력">🛡 {u.hp}/{u.maxHp}</span>
          <span title="화력">⚔ {u.atk}</span>
        </div>
        <div className="btl-card-stats btl-card-stats--sub">
          <span title="행동력">AP {u.ap}/{u.maxAp}</span>
          <span title="기동성">MOV {u.mov}</span>
        </div>
        {/* 장착 무기 — 아군은 미장착도 안내 (함대 편성 유도) */}
        {(u.weapon1 || u.weapon2) ? (
          <div className="btl-card-weapons">
            {[u.weapon1, u.weapon2].filter(Boolean).map((w, i) => (
              <div key={i} className="btl-card-weapon" title={`티어 ${w.tier} · AP ${w.apCost}`}>
                {FAMILY_ICON[w.family] ?? '🗡'} {w.name} <small>T{w.tier}{w.cd > 0 ? ` · ⏳${w.cd}` : ''}</small>
              </div>
            ))}
          </div>
        ) : (isAlly && (
          <div className="btl-card-weapons">
            <div className="btl-card-weapon btl-card-weapon--none">🗡 기본 포 — 함대 편성에서 장착</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ──
export default function BattleScreen({ nodeId, mock = false, battleCategory = null, onExit, onEnding, onGameOver }) {
  const containerRef  = useRef(null)
  const gameRef       = useRef(null)
  const onExitRef     = useRef(onExit)
  const onEndingRef   = useRef(onEnding)
  const onGameOverRef = useRef(onGameOver)
  useEffect(() => { onExitRef.current    = onExit },    [onExit])
  useEffect(() => { onEndingRef.current  = onEnding },  [onEnding])
  useEffect(() => { onGameOverRef.current = onGameOver }, [onGameOver])

  // ── 데이터 ──
  const ships      = useDataStore((s) => s.data?.ships?.ships)
  const combatRules= useDataStore((s) => s.data?.ships?.combatRules)
  const skills     = useDataStore((s) => s.data?.skills?.skills)
  const aces       = useDataStore((s) => s.data?.aces?.aces)
  const enemies    = useDataStore((s) => s.data?.enemies)
  const items      = useDataStore((s) => s.data?.items)
  const systems    = useDataStore((s) => s.data?.systems?.systems)
  const conquer    = useProgressStore((s) => s.conquer)
  const roster     = useFleetStore((s) => s.roster)
  const wallet     = useResourceStore((s) => s.wallet)

  // 연구 단계(해금한 최고 무기 티어) → 전장 크기 (요청서 2장). 관제실 config에서 조정 가능.
  const unlockedResearch = useResearchStore((s) => s.unlockedIds)
  const gameConfig = useGameConfigStore((s) => s.config)
  const weaponTier = getPlayerWeaponTier(unlockedResearch, gameConfig)
  const { width: gridCols, height: gridRows } = getBattlefieldSizeByTier(weaponTier, gameConfig)

  // Battle Map Editor에서 활성 맵으로 지정한 mapDefinition이 있으면 전투에 사용한다.
  // node.battleMapId가 우선, 없으면 전역 activeMapId(에디터의 "전투에서 미리보기").
  const activeMapId = useMapStore((s) => s.activeMapId)
  const battleMaps  = useMapStore((s) => s.maps)
  const nodeMaps    = useMapStore((s) => s.nodeMaps)
  const testBattleMap = useMapStore((s) => s.testBattleMap)

  // ── 전투 스토어 ──
  const units                   = useBattleStore((s) => s.units)
  const autoBattle              = useBattleStore((s) => s.autoBattle)
  const playerPhase             = useBattleStore((s) => s.playerPhase)
  const playerFlagshipDestroyed = useBattleStore((s) => s.playerFlagshipDestroyed)
  const activeUnitId            = useBattleStore((s) => s.activeUnitId)

  const allies     = units.filter((u) => u.side === 'ally')
  const enemyUnits = units.filter((u) => u.side === 'enemy')
  const node       = systems?.find((s) => s.id === nodeId) ?? null

  // 카드덱 정렬 — 강한 함선이 바깥쪽(아군=좌측끝, 적군=우측끝). index 0 = 가장 강함.
  const allyDeck  = [...allies].sort((a, b) => shipStrength(b) - shipStrength(a))
  const enemyDeck = [...enemyUnits].sort((a, b) => shipStrength(b) - shipStrength(a))

  // 이 전투에 실제로 쓰이는 mapDefinition(미니맵·카메라 토글 UI에서도 사용).
  const resolvedMapDef = useMemo(() => {
    const assignedMapId = node?.battleMapId || nodeMaps?.[node?.id]
    return testBattleMap
      || pickCategoryMap(battleCategory)
      || (assignedMapId && battleMaps[assignedMapId])
      || (activeMapId && battleMaps[activeMapId])
      || null
  }, [testBattleMap, battleCategory, node, nodeMaps, battleMaps, activeMapId])

  // 카메라 조감↔전투뷰 토글 + 미니맵
  const [camOverview, setCamOverview] = useState(true)
  const minimapViewRef = useRef(null)

  // ── 도망/협상 모달 ──
  const [fleeModal,      setFleeModal]      = useState(null)
  const [negotiateModal, setNegotiateModal] = useState(null)
  const fleeModalRef      = useRef(fleeModal)
  const negotiateModalRef = useRef(negotiateModal)
  useEffect(() => { fleeModalRef.current = fleeModal },           [fleeModal])
  useEffect(() => { negotiateModalRef.current = negotiateModal }, [negotiateModal])

  // Enter 키로 결과 모달 닫기
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Enter') return
      const fm = fleeModalRef.current
      const nm = negotiateModalRef.current
      if (fm) {
        if (fm.result === 'fail') { setFleeModal(null); return }
        if (!fm.result)           { setFleeModal(null); return }
        return
      }
      if (nm) { setNegotiateModal(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { return () => useBattleStore.getState().clearUnits() }, [])

  // ── Phaser 초기화 ──
  useEffect(() => {
    if (!ships || !combatRules || !skills || !aces || !enemies || !items || !node || !containerRef.current || gameRef.current) return

    const w = containerRef.current.offsetWidth  || window.innerWidth
    const h = containerRef.current.offsetHeight || window.innerHeight - 90

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: w,
      height: h,
      backgroundColor: '#0a0e27',
    })
    // 우선순위: 모의 전투 맵 → 카테고리 할당(랜덤) → 노드 정적 battleMapId → 노드 할당(레거시) → 전역 미리보기
    const mapDefinition = resolvedMapDef

    game.scene.add('BattleScene', BattleScene, true, {
      ships, combatRules, skills, aces, enemies, items, node,
      gridCols, gridRows, mapDefinition, mock,
      // 모의 전투는 테스트용 — 점령(진행도)에 반영하지 않고 그대로 종료한다.
      onVictory:  (clearedNode) => { if (mock) { onExitRef.current?.() } else { conquer(clearedNode.id) } },
      onExit:     () => onExitRef.current?.(),
      onEnding:   () => onEndingRef.current?.(),
      // 모의 전투는 패배해도 실제 게임오버 화면으로 가지 않고 에디터로 복귀한다.
      onGameOver: () => { if (mock) { onExitRef.current?.() } else { onGameOverRef.current?.() } },
    })
    gameRef.current = game
    return () => { game.destroy(true); gameRef.current = null }
  }, [ships, combatRules, skills, aces, enemies, items, node, conquer])

  const getScene = () => gameRef.current?.scene?.getScene('BattleScene')

  // ── 미니맵 뷰포트 사각형 + 조감/전투뷰 상태를 매 프레임 갱신 ──
  useEffect(() => {
    if (!resolvedMapDef) return
    let raf
    const tick = () => {
      const info = gameRef.current?.scene?.getScene('BattleScene')?.getCameraInfo?.()
      const el = minimapViewRef.current
      if (info && el && info.mapW > 0 && info.mapH > 0) {
        el.style.left   = `${Math.max(0, (info.x / info.mapW) * 100)}%`
        el.style.top    = `${Math.max(0, (info.y / info.mapH) * 100)}%`
        el.style.width  = `${Math.min(100, (info.w / info.mapW) * 100)}%`
        el.style.height = `${Math.min(100, (info.h / info.mapH) * 100)}%`
        setCamOverview((prev) => (prev === info.overview ? prev : info.overview))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [resolvedMapDef])

  // ── 도망·협상 계산 (기함 기준) ──
  const aliveAllies  = allies.filter(u => !u.dead)
  const aliveEnemies = enemyUnits.filter(u => !u.dead)

  const playerFlagshipUnit = aliveAllies.find(u => u.isFlagship)
  const enemyFlagshipUnit  = aliveEnemies.find(u => u.isFlagship)

  const totalEnemyMaxHp  = aliveEnemies.reduce((s, u) => s + (u.maxHp || u.hp || 1), 0)
  const totalEnemyHp     = aliveEnemies.reduce((s, u) => s + u.hp, 0)
  const enemyDamageRatio = totalEnemyMaxHp > 0 ? 1 - (totalEnemyHp / totalEnemyMaxHp) : 0
  const enemyFlagshipHpRatio = enemyFlagshipUnit
    ? (enemyFlagshipUnit.hp / (enemyFlagshipUnit.maxHp || enemyFlagshipUnit.hp || 1))
    : 1

  const fleePct = (playerFlagshipUnit && enemyFlagshipUnit)
    ? calculateRetreatChance(playerFlagshipUnit, enemyFlagshipUnit, { enemyDamageRatio }, gameConfig)
    : 40

  const baseNegChance = (playerFlagshipUnit && enemyFlagshipUnit)
    ? calculateNegotiationChance(
        playerFlagshipUnit,
        enemyFlagshipUnit,
        {
          enemyTotalHpRatio: totalEnemyMaxHp > 0 ? totalEnemyHp / totalEnemyMaxHp : 1,
          enemyFlagshipHpRatio,
          researchUnlocked: unlockedResearch,
        },
        gameConfig
      )
    : 25

  const persuadeChance = Math.round(baseNegChance)
  const payChance      = Math.round(Math.min(85, baseNegChance + 20))
  const sacrificeChance = Math.round(Math.min(90, baseNegChance + 35))

  const enemyAtk = aliveEnemies.reduce((s, u) => s + (u.atk || 1), 0)
  const enemyHp  = aliveEnemies.reduce((s, u) => s + u.hp, 0)
  const payAmount = Math.max(200, Math.round((enemyAtk * 12 + enemyHp * 0.4)))

  const sacrificeEntry = roster.length > 1
    ? [...roster].sort((a, b) => (a.level ?? 1) - (b.level ?? 1))[0]
    : null
  const sacrificeShipName = sacrificeEntry
    ? (ships?.find(s => s.id === sacrificeEntry.shipId)?.name ?? sacrificeEntry.shipId)
    : null

  function handleFleeOpen() {
    setFleeModal({ chance: fleePct })
  }
  function handleFleeAttempt() {
    if (Math.random() * 100 < fleePct) {
      getScene()?.setPendingFlee()
      setFleeModal({ result: 'ok', chance: fleePct })
    } else {
      getScene()?.penalizeFlagshipAp()
      setFleeModal({ result: 'fail', chance: fleePct })
    }
  }

  function handleNegotiateAttempt(type) {
    const roll   = Math.random() * 100
    let chance, costDesc = null, shipLost = false

    if (type === 'pay') {
      chance   = payChance
      costDesc = `💰 ${payAmount} SC 지불`
      useResourceStore.getState().spend({ sc: payAmount })
    } else if (type === 'ship') {
      chance   = sacrificeChance
      costDesc = `🚀 "${sacrificeShipName}" 양도`
      shipLost = true
      useFleetStore.getState().removeFromRoster(sacrificeEntry.instanceId)
    } else {
      chance   = persuadeChance
      costDesc = '🤝 외교적 설득'
    }

    const success = roll < chance
    if (success) getScene()?.setPendingFlee()
    else getScene()?.penalizeFlagshipAp()
    setNegotiateModal({
      step: 'result',
      success,
      costDesc,
      shipLost,
      message: success
        ? '협상 성공! 적이 조건을 수락했습니다. 다음 턴 시작 시 철수합니다.'
        : shipLost
          ? '협상 실패. 함선을 잃었지만 적은 조건을 거부했습니다. 기함 행동 불가, 전투를 계속합니다.'
          : `협상 실패. 기함 행동 불가, 전투를 계속합니다.`,
    })
  }

  const canAct    = playerPhase && !autoBattle
  const canFlee   = canAct && !playerFlagshipDestroyed
  const canNegotiate = canAct && !playerFlagshipDestroyed

  return (
    <div className="battle-layout">

      {/* ── Phaser 캔버스 ── */}
      <div className="battle-screen" ref={containerRef} />

      {/* ── 우측 상단 조작 버튼 오버레이 ── */}
      {/* ── 좌측 플로팅 액션 이모지 (호버 시 이름·설명 펼침) ── */}
      <div className="btl-fab-col">
        {mock && (
          <BtlFab emoji="🧪" label="테스트 종료" desc="모의 전투를 즉시 끝내고 에디터로 돌아갑니다."
            color="#c850e0" onClick={() => onExitRef.current?.()} />
        )}
        <BtlFab emoji="🤖" label={`자동 전투 ${autoBattle ? 'ON' : 'OFF'}`} desc="아군(및 적) 유닛이 AI로 자동 전투합니다."
          color="#7dffb0" active={autoBattle} onClick={() => useBattleStore.getState().setAutoBattle(!autoBattle)} />
        <BtlFab emoji="🚀" label={`도망 (${fleePct}%)`} desc={playerFlagshipDestroyed ? '기함 격파 — 도주 불가' : '기동력을 비교해 전선에서 이탈합니다. 실패해도 피해는 없습니다.'}
          color="#4fb8ff" disabled={!canFlee} onClick={handleFleeOpen} />
        <BtlFab emoji="🤝" label="협상" desc={playerFlagshipDestroyed ? '기함 격파 — 협상 불가' : '자원·함선을 제안해 적과 협상합니다.'}
          color="#ffd166" disabled={!canNegotiate} onClick={() => setNegotiateModal({ step: 'choose' })} />
        <BtlFab emoji="⏭" label="턴 종료" desc="이번 턴을 마칩니다. (스페이스바)"
          color="#ff7043" disabled={!canAct} onClick={() => getScene()?.endCurrentPhase()} />
      </div>

      {/* ── 미니맵(키맵) + 조감↔전투뷰 토글 — 에디터 맵에서만 ── */}
      {resolvedMapDef && (
        <div className="btl-minimap">
          <div className="btl-minimap-frame" style={{ aspectRatio: `${resolvedMapDef.imageSize?.width ?? 16} / ${resolvedMapDef.imageSize?.height ?? 9}` }}>
            {resolvedMapDef.background
              ? <img src={resolvedMapDef.background} alt="키맵" className="btl-minimap-img" draggable={false} />
              : <div className="btl-minimap-img btl-minimap-img--blank" />}
            <div ref={minimapViewRef} className="btl-minimap-view" />
          </div>
          <button className="btl-minimap-toggle" onClick={() => getScene()?.toggleCameraOverview()}
            title="전체 지도 조감 ↔ 전투뷰 전환">
            {camOverview ? '🔍 전투뷰로' : '🗺 전체지도 보기'}
          </button>
        </div>
      )}

      {/* ── 하단 플로팅 함선 카드덱 — 중앙 기준 좌(아군)/우(적군), 강한 함선이 바깥쪽, 카드덱처럼 중첩 ── */}
      <div className="btl-decks">
        <div className="btl-deck btl-deck--ally">
          {allyDeck.map((u, i) => (
            <ShipCard key={u.id} u={u} side="ally" index={i} count={allyDeck.length}
              active={activeUnitId === u.id} />
          ))}
        </div>
        <div className="btl-deck btl-deck--enemy">
          {enemyDeck.map((u, i) => (
            <ShipCard key={u.id} u={u} side="enemy" index={i} count={enemyDeck.length}
              active={activeUnitId === u.id} />
          ))}
        </div>
      </div>

      {/* ── 도망 모달 ── */}
      {fleeModal && (
        <div className="btl-modal-bg" onClick={() => !fleeModal.result && setFleeModal(null)}>
          <div className="btl-modal" onClick={(e) => e.stopPropagation()}>
            {!fleeModal.result ? (
              <>
                <div className="btl-modal-title">🚀 도주 시도</div>
                <p className="btl-modal-desc">
                  이동력을 비교해 전선에서 이탈합니다.<br />
                  <span className="btl-modal-chance">성공률: <b>{fleeModal.chance}%</b></span>
                </p>
                <p className="btl-modal-note">실패해도 아군 피해는 없습니다. 전투가 이어집니다.</p>
                <div className="btl-modal-btns">
                  <button className="btl-btn btl-btn--confirm" onClick={handleFleeAttempt}>시도</button>
                  <button className="btl-btn btl-btn--cancel"  onClick={() => setFleeModal(null)}>취소</button>
                </div>
              </>
            ) : fleeModal.result === 'ok' ? (
              <>
                <div className="btl-modal-title" style={{ color: '#3ad6c4' }}>✅ 도주 신청 완료!</div>
                <p className="btl-modal-desc">다음 턴 시작 시 전선에서 이탈합니다.</p>
                <div className="btl-modal-btns">
                  <button className="btl-btn btl-btn--cancel" onClick={() => setFleeModal(null)}>확인</button>
                </div>
              </>
            ) : (
              <>
                <div className="btl-modal-title" style={{ color: '#e23b4e' }}>❌ 도주 실패</div>
                <p className="btl-modal-desc">이탈에 실패했습니다. 전투를 계속합니다.</p>
                <div className="btl-modal-btns">
                  <button className="btl-btn btl-btn--cancel" onClick={() => setFleeModal(null)}>계속</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 협상 모달 ── */}
      {negotiateModal && (
        <div className="btl-modal-bg" onClick={() => negotiateModal.step === 'choose' && setNegotiateModal(null)}>
          <div className="btl-modal" onClick={(e) => e.stopPropagation()}>
            {negotiateModal.step === 'choose' ? (
              <>
                <div className="btl-modal-title">🤝 협상 시도</div>
                <p className="btl-modal-desc">
                  제안을 선택하세요. <span className="btl-modal-note-inline">제안한 자원은 성공 여부와 관계없이 소모됩니다. (설득 제외)</span>
                </p>
                <div className="btl-modal-options">
                  <div className="btl-option">
                    <div className="btl-option-info">
                      <span className="btl-option-name">💰 스텔라크레딧 지불</span>
                      <span className="btl-option-cost">소모: {payAmount} SC (보유: {wallet.sc ?? 0})</span>
                    </div>
                    <span className="btl-option-chance" style={{ color: '#ffd166' }}>{payChance}%</span>
                    <button
                      className="btl-btn btl-btn--option"
                      disabled={(wallet.sc ?? 0) < payAmount}
                      onClick={() => handleNegotiateAttempt('pay')}
                    >선택</button>
                  </div>

                  <div className="btl-option">
                    <div className="btl-option-info">
                      <span className="btl-option-name">🎙 외교적 설득</span>
                      <span className="btl-option-cost">소모 없음 · 실패해도 자원 손실 없음</span>
                    </div>
                    <span className="btl-option-chance" style={{ color: '#4fb8ff' }}>{persuadeChance}%</span>
                    <button
                      className="btl-btn btl-btn--option"
                      onClick={() => handleNegotiateAttempt('persuade')}
                    >선택</button>
                  </div>

                  {sacrificeEntry ? (
                    <div className="btl-option">
                      <div className="btl-option-info">
                        <span className="btl-option-name">🚀 함선 양도</span>
                        <span className="btl-option-cost">"{sacrificeShipName}" 영구 포기 (성공 여부 무관)</span>
                      </div>
                      <span className="btl-option-chance" style={{ color: '#7dffb0' }}>{sacrificeChance}%</span>
                      <button
                        className="btl-btn btl-btn--option btl-btn--danger"
                        onClick={() => handleNegotiateAttempt('ship')}
                      >선택</button>
                    </div>
                  ) : (
                    <div className="btl-option btl-option--disabled">
                      <div className="btl-option-info">
                        <span className="btl-option-name">🚀 함선 양도</span>
                        <span className="btl-option-cost">함선이 1척뿐이라 불가</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="btl-modal-btns">
                  <button className="btl-btn btl-btn--cancel" onClick={() => setNegotiateModal(null)}>취소</button>
                </div>
              </>
            ) : (
              <>
                <div
                  className="btl-modal-title"
                  style={{ color: negotiateModal.success ? '#3ad6c4' : '#e23b4e' }}
                >
                  {negotiateModal.success ? '✅ 협상 성공!' : '❌ 협상 실패'}
                </div>
                <p className="btl-modal-desc">{negotiateModal.message}</p>
                {!negotiateModal.success && (
                  <div className="btl-modal-btns">
                    <button className="btl-btn btl-btn--cancel" onClick={() => setNegotiateModal(null)}>계속</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import BattleScene from '../../game/scenes/BattleScene'
import { useDataStore }     from '../../state/useDataStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useBattleStore }   from '../../state/useBattleStore'
import { useFleetStore }    from '../../state/useFleetStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { TERRAIN_TYPES }    from '../../game/systems/terrain'

// ── 모듈 레벨 헬퍼 ──
const tpColor = (tp) => tp >= 100 ? '#ffd166' : tp >= 50 ? '#4fb8ff' : '#6b7aa8'

// ── 하단 유닛 카드 ──
function UnitBottomCard({ u }) {
  const [hov, setHov] = useState(false)
  const hpPct = u.maxHp > 0 ? Math.max(0, (u.hp / u.maxHp) * 100) : 0
  const apPct = u.maxAp > 0 ? Math.max(0, (u.ap / u.maxAp) * 100) : 0
  const tpPct = Math.min(100, Math.round(u.tp))
  const isAlly = u.side === 'ally'
  return (
    <div
      className={`btm-card btm-card--unit${u.dead ? ' btm-card--dead' : ''}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span className="btm-card-sprite">{u.sprite}</span>
      <span className="btm-card-uname">{u.name}</span>
      {hov && (
        <div className={`btm-popup${isAlly ? ' btm-popup--ally' : ' btm-popup--enemy'}`}>
          <div className="btm-popup-name">{u.name}</div>
          {u.aceName && <div className="btm-popup-ace">{u.aceName}</div>}
          <div className="btm-popup-bars">
            <div className="btm-popup-bar-row">
              <span className="btm-popup-bar-lbl">HP</span>
              <div className="btm-popup-bar-track">
                <div className="btm-popup-bar-fill" style={{ width: hpPct + '%', background: isAlly ? '#3ad6c4' : '#e23b4e' }} />
              </div>
              <span className="btm-popup-bar-val">{u.hp}/{u.maxHp}</span>
            </div>
            <div className="btm-popup-bar-row">
              <span className="btm-popup-bar-lbl">AP</span>
              <div className="btm-popup-bar-track">
                <div className="btm-popup-bar-fill" style={{ width: apPct + '%', background: '#ffd166' }} />
              </div>
              <span className="btm-popup-bar-val">{u.ap}/{u.maxAp}</span>
            </div>
            <div className="btm-popup-bar-row">
              <span className="btm-popup-bar-lbl">TP</span>
              <div className="btm-popup-bar-track">
                <div className="btm-popup-bar-fill" style={{ width: tpPct + '%', background: tpColor(u.tp) }} />
              </div>
              <span className="btm-popup-bar-val" style={{ color: tpColor(u.tp) }}>{tpPct}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 하단 지형 카드 ──
function TerrainBottomCard({ t }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      className="btm-card btm-card--terrain"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span className="btm-card-glyph">{t.glyph || '·'}</span>
      <span className="btm-card-tname">{t.label}</span>
      {hov && (
        <div className="btm-popup btm-popup--terrain">
          <div className="btm-popup-name">{t.label}</div>
          {t.effect && <div className="btm-popup-effect">{t.effect}</div>}
          <div className="btm-popup-desc">{t.desc}</div>
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ──
export default function BattleScreen({ nodeId, onExit, onEnding, onGameOver }) {
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

  // 연구소 레벨 → 전투 그리드 크기: Lv1-2=10×8, Lv3=16×13, Lv4+=20×16
  const labLevel   = useBuildingStore((s) => s.getLevel('s0', 'bld_research_lab'))
  const gridCols   = labLevel >= 4 ? 20 : labLevel >= 3 ? 16 : 10
  const gridRows   = labLevel >= 4 ? 16 : labLevel >= 3 ? 13 : 8

  // ── 전투 스토어 ──
  const units       = useBattleStore((s) => s.units)
  const autoBattle  = useBattleStore((s) => s.autoBattle)
  const playerPhase = useBattleStore((s) => s.playerPhase)

  const allies     = units.filter((u) => u.side === 'ally')
  const enemyUnits = units.filter((u) => u.side === 'enemy')
  const node       = systems?.find((s) => s.id === nodeId) ?? null

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
    game.scene.add('BattleScene', BattleScene, true, {
      ships, combatRules, skills, aces, enemies, items, node,
      gridCols, gridRows,
      onVictory:  (clearedNode) => conquer(clearedNode.id),
      onExit:     () => onExitRef.current?.(),
      onEnding:   () => onEndingRef.current?.(),
      onGameOver: () => onGameOverRef.current?.(),
    })
    gameRef.current = game
    return () => { game.destroy(true); gameRef.current = null }
  }, [ships, combatRules, skills, aces, enemies, items, node, conquer])

  const getScene = () => gameRef.current?.scene?.getScene('BattleScene')

  // ── 도망 계산 ──
  const aliveAllies  = allies.filter(u => !u.dead)
  const aliveEnemies = enemyUnits.filter(u => !u.dead)
  const allyMov  = aliveAllies.length  ? aliveAllies.reduce((s, u)  => s + (u.mov || 3), 0) / aliveAllies.length  : 3
  const enemyMov = aliveEnemies.length ? aliveEnemies.reduce((s, u) => s + (u.mov || 3), 0) / aliveEnemies.length : 3
  const fleePct = Math.round(Math.min(80, Math.max(20, allyMov / (allyMov + enemyMov) * 100)))

  function handleFleeOpen() {
    setFleeModal({ chance: fleePct })
  }
  function handleFleeAttempt() {
    if (Math.random() * 100 < fleePct) {
      getScene()?.executeFlee()
      setFleeModal({ result: 'ok', chance: fleePct })
    } else {
      setFleeModal({ result: 'fail', chance: fleePct })
    }
  }

  // ── 협상 계산 ──
  const allyAtk  = aliveAllies.reduce((s, u)  => s + (u.atk || 1), 0)
  const enemyAtk = aliveEnemies.reduce((s, u) => s + (u.atk || 1), 0)
  const enemyHp  = aliveEnemies.reduce((s, u) => s + u.hp, 0)
  const powerRatio = allyAtk / Math.max(1, allyAtk + enemyAtk)

  const payAmount   = Math.max(200, Math.round((enemyAtk * 12 + enemyHp * 0.4)))
  const payChance   = Math.round(Math.min(68, Math.max(30, 32 + powerRatio * 36)))
  const persuadeChance = Math.round(Math.min(38, Math.max(10, 10 + powerRatio * 28)))

  const sacrificeEntry = roster.length > 1
    ? [...roster].sort((a, b) => (a.level ?? 1) - (b.level ?? 1))[0]
    : null
  const sacrificeShipName = sacrificeEntry
    ? (ships?.find(s => s.id === sacrificeEntry.shipId)?.name ?? sacrificeEntry.shipId)
    : null
  const sacrificeChance = Math.round(Math.min(82, Math.max(52, 55 + powerRatio * 27)))

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
    if (success) getScene()?.executeFlee()
    setNegotiateModal({
      step: 'result',
      success,
      costDesc,
      shipLost,
      message: success
        ? '협상 성공! 적이 조건을 수락했습니다. 철수합니다.'
        : shipLost
          ? '협상 실패. 함선을 잃었지만 적은 조건을 거부했습니다. 전투를 계속합니다.'
          : `협상 실패. ${costDesc ? costDesc + '을(를) 잃었습니다. ' : ''}전투를 계속합니다.`,
    })
  }

  const canAct = playerPhase && !autoBattle

  return (
    <div className="battle-layout">

      {/* ── Phaser 캔버스 ── */}
      <div className="battle-screen" ref={containerRef} />

      {/* ── 우측 상단 조작 버튼 오버레이 ── */}
      <div className="btl-action-overlay">
        <button
          className={`btl-act-btn${autoBattle ? ' btl-act-btn--on' : ''}`}
          onClick={() => useBattleStore.getState().setAutoBattle(!autoBattle)}
          title="아군 유닛도 AI 자동 행동"
        >
          🤖 자동{autoBattle ? ' ON' : ' OFF'}
        </button>
        <button
          className="btl-act-btn btl-act-btn--flee"
          onClick={handleFleeOpen}
          disabled={!canAct}
          title={`도주 성공률 ${fleePct}%`}
        >
          🚀 도망 ({fleePct}%)
        </button>
        <button
          className="btl-act-btn btl-act-btn--negotiate"
          onClick={() => setNegotiateModal({ step: 'choose' })}
          disabled={!canAct}
          title="자원·함선을 제안해 협상"
        >
          🤝 협상
        </button>
        <button
          className="btl-act-btn btl-act-btn--endturn"
          onClick={() => getScene()?.endPlayerPhase()}
          disabled={!canAct}
          title="턴 종료 (스페이스)"
        >
          ⏭ 턴종료
        </button>
      </div>

      {/* ── 하단 카드 바 ── */}
      <div className="battle-bottom-bar">

        <div className="btm-section">
          <span className="btm-sec-label">아군</span>
          <div className="btm-cards-row">
            {allies.length === 0 && units.length === 0
              ? <span className="btm-loading">로딩 중…</span>
              : allies.map((u) => <UnitBottomCard key={u.id} u={u} />)
            }
          </div>
        </div>

        <div className="btm-divider" />

        <div className="btm-section">
          <span className="btm-sec-label">적군</span>
          <div className="btm-cards-row">
            {enemyUnits.map((u) => <UnitBottomCard key={u.id} u={u} />)}
          </div>
        </div>

        <div className="btm-divider" />

        <div className="btm-section">
          <span className="btm-sec-label">지형</span>
          <div className="btm-cards-row">
            {Object.values(TERRAIN_TYPES).map((t) => (
              <TerrainBottomCard key={t.id} t={t} />
            ))}
          </div>
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
                <div className="btl-modal-title" style={{ color: '#3ad6c4' }}>✅ 도주 성공!</div>
                <p className="btl-modal-desc">전선에서 이탈했습니다.</p>
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

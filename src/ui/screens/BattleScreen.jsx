import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import BattleScene from '../../game/scenes/BattleScene'
import { useDataStore }     from '../../state/useDataStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useBattleStore }   from '../../state/useBattleStore'
import { useFleetStore }    from '../../state/useFleetStore'
import { useResourceStore } from '../../state/useResourceStore'
import { TERRAIN_TYPES }    from '../../game/systems/terrain'

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

  // ── 전투 스토어 ──
  const units       = useBattleStore((s) => s.units)
  const autoBattle  = useBattleStore((s) => s.autoBattle)
  const playerPhase = useBattleStore((s) => s.playerPhase)

  const allies     = units.filter((u) => u.side === 'ally')
  const enemyUnits = units.filter((u) => u.side === 'enemy')
  const node       = systems?.find((s) => s.id === nodeId) ?? null

  // ── 도망/협상 모달 ──
  const [fleeModal,      setFleeModal]      = useState(null) // null | {chance} | {result:'ok'|'fail'}
  const [negotiateModal, setNegotiateModal] = useState(null) // null | {step:'choose'} | {step:'result', ...}

  useEffect(() => { return () => useBattleStore.getState().clearUnits() }, [])

  // ── Phaser 초기화 ──
  useEffect(() => {
    if (!ships || !combatRules || !skills || !aces || !enemies || !items || !node || !containerRef.current || gameRef.current) return

    const w = containerRef.current.offsetWidth  || window.innerWidth - 380
    const h = containerRef.current.offsetHeight || window.innerHeight

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: w,
      height: h,
      backgroundColor: '#0a0e27',
    })
    game.scene.add('BattleScene', BattleScene, true, {
      ships, combatRules, skills, aces, enemies, items, node,
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
  const powerRatio = allyAtk / Math.max(1, allyAtk + enemyAtk) // 0~1, 0.5=동등

  const payAmount   = Math.max(200, Math.round((enemyAtk * 12 + enemyHp * 0.4)))
  const payChance   = Math.round(Math.min(68, Math.max(30, 32 + powerRatio * 36)))
  const persuadeChance = Math.round(Math.min(38, Math.max(10, 10 + powerRatio * 28)))

  // 희생할 함선 = 로스터에서 레벨 최저 함선 (1척만 있으면 불가)
  const sacrificeEntry = roster.length > 1
    ? [...roster].sort((a, b) => (a.level ?? 1) - (b.level ?? 1))[0]
    : null
  const sacrificeShipName = sacrificeEntry
    ? (ships?.find(s => s.id === sacrificeEntry.shipId)?.name ?? sacrificeEntry.shipId)
    : null
  const sacrificeChance = Math.round(Math.min(82, Math.max(52, 55 + powerRatio * 27)))

  function handleNegotiateAttempt(type) {
    const roll   = Math.random() * 100
    let chance, cost = null, costDesc = null, shipLost = false

    if (type === 'pay') {
      chance   = payChance
      cost     = { sc: payAmount }
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
    if (success) {
      getScene()?.executeFlee()
    }
    setNegotiateModal({
      step:     'result',
      success,
      costDesc,
      shipLost,
      message:  success
        ? '협상 성공! 적이 조건을 수락했습니다. 철수합니다.'
        : shipLost
          ? '협상 실패. 함선을 잃었지만 적은 조건을 거부했습니다. 전투를 계속합니다.'
          : `협상 실패. ${costDesc ? costDesc + '을(를) 잃었습니다. ' : ''}전투를 계속합니다.`,
    })
  }

  // ── UnitCard ──
  const tpColor = (tp) => tp >= 100 ? '#ffd166' : tp >= 50 ? '#4fb8ff' : '#6b7aa8'

  function UnitCard({ u }) {
    const hpPct = u.maxHp > 0 ? Math.max(0, (u.hp / u.maxHp) * 100) : 0
    const apPct = u.maxAp > 0 ? Math.max(0, (u.ap / u.maxAp) * 100) : 0
    const tpPct = Math.min(100, Math.round((u.tp / 100) * 100))
    const isAlly = u.side === 'ally'
    return (
      <div className={`bnav-unit${u.dead ? ' bnav-unit--dead' : ''}`}>
        <div className="bnav-unit-header">
          <span className="bnav-unit-sprite">{u.sprite}</span>
          <div className="bnav-unit-info">
            <span className="bnav-unit-name">{u.name}</span>
            {u.aceName && <span className="bnav-unit-ace">{u.aceName}</span>}
          </div>
        </div>
        <div className="bnav-bars">
          <div className="bnav-bar-row">
            <span className="bnav-bar-label">HP</span>
            <div className="bnav-bar-track">
              <div className="bnav-bar-fill" style={{ width: hpPct + '%', background: isAlly ? '#3ad6c4' : '#e23b4e' }} />
            </div>
            <span className="bnav-bar-val">{u.hp}</span>
          </div>
          <div className="bnav-bar-row">
            <span className="bnav-bar-label">AP</span>
            <div className="bnav-bar-track">
              <div className="bnav-bar-fill" style={{ width: apPct + '%', background: '#ffd166' }} />
            </div>
            <span className="bnav-bar-val">{u.ap}</span>
          </div>
          <div className="bnav-bar-row">
            <span className="bnav-bar-label">TP</span>
            <div className="bnav-bar-track">
              <div className="bnav-bar-fill" style={{ width: tpPct + '%', background: tpColor(u.tp) }} />
            </div>
            <span className="bnav-bar-val" style={{ color: tpColor(u.tp) }}>{tpPct}%</span>
          </div>
        </div>
      </div>
    )
  }

  const canAct = playerPhase && !autoBattle

  return (
    <div className="battle-layout">

      {/* ── 좌측: 아군 패널 ── */}
      <aside className="battle-subnav">
        <div className="bnav-heading bnav-heading--ally">⚡ 아군</div>
        {allies.length === 0 && units.length === 0 && <p className="bnav-empty">로딩 중…</p>}
        {allies.map((u) => <UnitCard key={u.id} u={u} />)}
      </aside>

      {/* ── 중앙: Phaser 캔버스 ── */}
      <div className="battle-screen" ref={containerRef} />

      {/* ── 우측: 적군 패널 + 전투 조작 ── */}
      <aside className="battle-subnav battle-subnav--right">

        {/* 전투 조작 버튼 */}
        <div className="bnav-actions">
          <button
            className={`bnav-action-btn${autoBattle ? ' bnav-action-btn--on' : ''}`}
            onClick={() => useBattleStore.getState().setAutoBattle(!autoBattle)}
            title="아군 유닛도 AI와 동일한 휴리스틱으로 자동 행동합니다"
          >
            <span className="bnav-action-icon">🤖</span>
            <span>자동전투 {autoBattle ? 'ON' : 'OFF'}</span>
          </button>

          <button
            className="bnav-action-btn bnav-action-btn--flee"
            onClick={handleFleeOpen}
            disabled={!canAct}
            title={`이동력 비교 기반 도주 — 현재 성공률 ${fleePct}%`}
          >
            <span className="bnav-action-icon">🚀</span>
            <span>도망 ({fleePct}%)</span>
          </button>

          <button
            className="bnav-action-btn bnav-action-btn--negotiate"
            onClick={() => setNegotiateModal({ step: 'choose' })}
            disabled={!canAct}
            title="자원·함선을 제안해 협상을 시도합니다"
          >
            <span className="bnav-action-icon">🤝</span>
            <span>협상</span>
          </button>

          <button
            className="bnav-action-btn bnav-action-btn--endturn"
            onClick={() => getScene()?.endPlayerPhase()}
            disabled={!canAct}
            title="플레이어 턴을 종료하고 적 턴으로 넘깁니다 (스페이스바와 동일)"
          >
            <span className="bnav-action-icon">⏭</span>
            <span>턴 종료</span>
          </button>
        </div>

        {/* 적군 유닛 목록 */}
        <div className="bnav-heading bnav-heading--enemy">💀 적군</div>
        {enemyUnits.map((u) => <UnitCard key={u.id} u={u} />)}

        {/* 지형 범례 */}
        <div className="bnav-terrain-legend">
          <div className="bnav-terrain-title">지형 안내</div>
          {Object.values(TERRAIN_TYPES).map((t) => (
            <div key={t.id} className="bnav-terrain-row">
              <span className="bnav-terrain-glyph">{t.glyph || '·'}</span>
              <div className="bnav-terrain-info">
                <span className="bnav-terrain-name">{t.label}</span>
                {t.effect && <span className="bnav-terrain-effect">{t.effect}</span>}
                <span className="bnav-terrain-desc">{t.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

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
                  {/* 크레딧 지불 */}
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

                  {/* 외교적 설득 */}
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

                  {/* 함선 포기 */}
                  {sacrificeEntry ? (
                    <div className="btl-option">
                      <div className="btl-option-info">
                        <span className="btl-option-name">🚀 함선 양도</span>
                        <span className="btl-option-cost">
                          "{sacrificeShipName}" 영구 포기 (성공 여부 무관)
                        </span>
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

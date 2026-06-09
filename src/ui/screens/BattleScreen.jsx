import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import BattleScene from '../../game/scenes/BattleScene'
import { useDataStore } from '../../state/useDataStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useBattleStore } from '../../state/useBattleStore'

export default function BattleScreen({ nodeId, onExit, onEnding, onGameOver }) {
  const containerRef = useRef(null)
  const gameRef = useRef(null)
  const onExitRef = useRef(onExit)
  const onEndingRef = useRef(onEnding)
  const onGameOverRef = useRef(onGameOver)
  useEffect(() => { onExitRef.current = onExit }, [onExit])
  useEffect(() => { onEndingRef.current = onEnding }, [onEnding])
  useEffect(() => { onGameOverRef.current = onGameOver }, [onGameOver])

  const ships = useDataStore((s) => s.data?.ships?.ships)
  const combatRules = useDataStore((s) => s.data?.ships?.combatRules)
  const skills = useDataStore((s) => s.data?.skills?.skills)
  const aces = useDataStore((s) => s.data?.aces?.aces)
  const enemies = useDataStore((s) => s.data?.enemies)
  const items = useDataStore((s) => s.data?.items)
  const systems = useDataStore((s) => s.data?.systems?.systems)
  const conquer = useProgressStore((s) => s.conquer)

  const units = useBattleStore((s) => s.units)
  const allies = units.filter((u) => u.side === 'ally')
  const enemyUnits = units.filter((u) => u.side === 'enemy')

  const node = systems?.find((s) => s.id === nodeId) ?? null

  useEffect(() => {
    return () => useBattleStore.getState().clearUnits()
  }, [])

  useEffect(() => {
    if (!ships || !combatRules || !skills || !aces || !enemies || !items || !node || !containerRef.current || gameRef.current) return

    const w = containerRef.current.offsetWidth || window.innerWidth - 360
    const h = containerRef.current.offsetHeight || window.innerHeight

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: w,
      height: h,
      backgroundColor: '#0a0e27',
    })
    game.scene.add('BattleScene', BattleScene, true, {
      ships,
      combatRules,
      skills,
      aces,
      enemies,
      items,
      node,
      onVictory: (clearedNode) => conquer(clearedNode.id),
      onExit: () => onExitRef.current?.(),
      onEnding: () => onEndingRef.current?.(),
      onGameOver: () => onGameOverRef.current?.(),
    })
    gameRef.current = game

    return () => {
      game.destroy(true)
      gameRef.current = null
    }
  }, [ships, combatRules, skills, aces, enemies, items, node, conquer])

  const tpColor = (tp) => {
    if (tp >= 100) return '#ffd166'
    if (tp >= 50) return '#4fb8ff'
    return '#6b7aa8'
  }

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

  return (
    <div className="battle-layout">
      <aside className="battle-subnav">
        <div className="bnav-section">
          <div className="bnav-heading bnav-heading--ally">⚡ 아군</div>
          {allies.length === 0 && units.length === 0 && (
            <p className="bnav-empty">로딩 중…</p>
          )}
          {allies.map((u) => <UnitCard key={u.id} u={u} />)}
        </div>
        <div className="bnav-section">
          <div className="bnav-heading bnav-heading--enemy">💀 적군</div>
          {enemyUnits.map((u) => <UnitCard key={u.id} u={u} />)}
        </div>
      </aside>
      <div className="battle-screen" ref={containerRef} />
    </div>
  )
}

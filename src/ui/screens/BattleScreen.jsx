import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import BattleScene from '../../game/scenes/BattleScene'
import { useDataStore } from '../../state/useDataStore'

const WIDTH = 960
const HEIGHT = 680

export default function BattleScreen() {
  const containerRef = useRef(null)
  const gameRef = useRef(null)
  const ships = useDataStore((s) => s.data?.ships?.ships)
  const combatRules = useDataStore((s) => s.data?.ships?.combatRules)
  const skills = useDataStore((s) => s.data?.skills?.skills)
  const aces = useDataStore((s) => s.data?.aces?.aces)

  useEffect(() => {
    if (!ships || !combatRules || !skills || !aces || !containerRef.current || gameRef.current) return

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: '#0a0e27',
    })
    game.scene.add('BattleScene', BattleScene, true, { ships, combatRules, skills, aces })
    gameRef.current = game

    return () => {
      game.destroy(true)
      gameRef.current = null
    }
  }, [ships, combatRules, skills, aces])

  return <div className="battle-screen" ref={containerRef} />
}

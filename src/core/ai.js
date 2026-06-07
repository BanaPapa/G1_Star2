// 기본 적 AI 휴리스틱 — 순수함수 (Phaser에 의존하지 않고 grid.js/combat.js를 그대로 재사용한다).
//
// dev_plan_guide.md MOD-3 설계 의도: "가장 약하거나 상성상 유리한 적에게 이동 후 공격"
//   1) 표적 선정(pickTarget): counterMultiplier가 더 유리한(배율↑) 쪽을 1순위,
//      배율이 같으면 현재 HP가 더 낮은(약한) 쪽을 선택한다 — combat.js의 "소프트 그물" 상성을 그대로 활용.
//   2) 이동 계획(planApproach): 사거리 안에 들어갈 수 있는 칸 중 이동량이 가장 적은 칸을 고르고,
//      사거리 진입이 불가능하면 표적과 가장 가까워지는 칸으로 접근한다.
import { computeMovementRange, manhattanDistance } from './grid'
import { lookupCounterMultiplier } from './combat'

export function pickTarget(attackerShipId, candidates, counterMultiplierTable) {
  if (candidates.length === 0) return null

  return candidates.reduce((best, candidate) => {
    if (!best) return candidate
    const bestMul = lookupCounterMultiplier(counterMultiplierTable, attackerShipId, best.ship.id)
    const candMul = lookupCounterMultiplier(counterMultiplierTable, attackerShipId, candidate.ship.id)
    if (candMul !== bestMul) return candMul > bestMul ? candidate : best
    return candidate.hp < best.hp ? candidate : best
  }, null)
}

export function inAttackRange(unit, target) {
  const [minRng, maxRng] = unit.ship.rng
  const distance = manhattanDistance({ x: unit.gridX, y: unit.gridY }, { x: target.gridX, y: target.gridY })
  return distance >= minRng && distance <= maxRng
}

// target을 공격하기 위해 이동할 칸을 고른다. 반환값이 현재 위치와 같으면 "이동 불필요/불가".
export function planApproach(unit, target, isPassable) {
  const here = { x: unit.gridX, y: unit.gridY, cost: 0 }
  const reachable = [here, ...computeMovementRange(here, unit.ship.mov, isPassable)]
  const [minRng, maxRng] = unit.ship.rng
  const targetPos = { x: target.gridX, y: target.gridY }

  const inRange = reachable.filter((cell) => {
    const distance = manhattanDistance(cell, targetPos)
    return distance >= minRng && distance <= maxRng
  })
  if (inRange.length > 0) {
    return inRange.reduce((best, cell) => (cell.cost < best.cost ? cell : best))
  }

  return reachable.reduce((best, cell) =>
    manhattanDistance(cell, targetPos) < manhattanDistance(best, targetPos) ? cell : best,
  )
}

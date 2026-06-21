// 기본 적 AI 휴리스틱 — 순수함수 (Phaser에 의존하지 않고 grid.js/combat.js를 그대로 재사용한다).
//
// dev_plan_guide.md MOD-3 설계 의도: "가장 약하거나 상성상 유리한 적에게 이동 후 공격"
//   1) 표적 선정(pickTarget): counterMultiplier가 더 유리한(배율↑) 쪽을 1순위,
//      배율이 같으면 현재 HP가 더 낮은(약한) 쪽을 선택한다 — combat.js의 "소프트 그물" 상성을 그대로 활용.
//   2) 이동 계획(planApproach): 사거리 안에 들어갈 수 있는 칸 중 이동량이 가장 적은 칸을 고르고,
//      사거리 진입이 불가능하면 표적과 가장 가까워지는 칸으로 접근한다.
//
// 역할별 전술(ship.aiTactic, enemies.json에서 옴): 미지정 시 위 기본(aggressive) 동작.
//   - "tank": 상성 무시, 항상 최근접 적을 표적으로 삼아 전진해 전선을 막는다.
//   - "kiter": 표적까지 거리가 사거리 최소값보다 가까워지면 사거리를 회복할 수 있는 칸으로 후퇴한다.
import { computeMovementRange, manhattanDistance } from './grid'
import { lookupCounterMultiplier } from './combat'

export function pickTarget(attacker, candidates, counterMultiplierTable) {
  if (candidates.length === 0) return null

  if (attacker.ship.aiTactic === 'tank') {
    const here = { x: attacker.gridX, y: attacker.gridY }
    return candidates.reduce((best, candidate) => {
      if (!best) return candidate
      const candDist = manhattanDistance(here, { x: candidate.gridX, y: candidate.gridY })
      const bestDist = manhattanDistance(here, { x: best.gridX, y: best.gridY })
      return candDist < bestDist ? candidate : best
    }, null)
  }

  return candidates.reduce((best, candidate) => {
    if (!best) return candidate
    const bestMul = lookupCounterMultiplier(counterMultiplierTable, attacker.ship.id, best.ship.id)
    const candMul = lookupCounterMultiplier(counterMultiplierTable, attacker.ship.id, candidate.ship.id)
    if (candMul !== bestMul) return candMul > bestMul ? candidate : best
    return candidate.hp < best.hp ? candidate : best
  }, null)
}

export function inAttackRange(unit, target) {
  const [minRng, baseMaxRng] = unit.ship.rng
  const rangeBonus = unit.weaponRangeBonus ?? 0
  const maxRng = Math.max(minRng, baseMaxRng + rangeBonus)
  const distance = manhattanDistance({ x: unit.gridX, y: unit.gridY }, { x: target.gridX, y: target.gridY })
  return distance >= minRng && distance <= maxRng
}

// target을 공격하기 위해 이동할 칸을 고른다. 반환값이 현재 위치와 같으면 "이동 불필요/불가".
// getCost(x, y): 지형 이동 비용 함수 (없으면 균등 1).
export function planApproach(unit, target, isPassable, getCost = () => 1) {
  const here = { x: unit.gridX, y: unit.gridY, cost: 0 }
  // 한 칸 이동에 AP 1을 소모하므로, 이번 행동에서 갈 수 있는 거리는 MOV와 남은 AP 중 더 작은 쪽이다.
  const moveRange = Math.min(unit.ship.mov, unit.ap)
  const reachable = [here, ...computeMovementRange(here, moveRange, isPassable, getCost)]
  const [minRng, maxRng] = unit.ship.rng
  const targetPos = { x: target.gridX, y: target.gridY }

  const inRange = reachable.filter((cell) => {
    const distance = manhattanDistance(cell, targetPos)
    return distance >= minRng && distance <= maxRng
  })

  // "kiter": 표적이 너무 가까워져(거리 < 최소 사거리) 명중 자체가 불가능해진 경우, 사거리를
  // 회복할 수 있는 칸으로 후퇴(없으면 가장 멀어지는 칸으로 물러난다). here는 거리 부족으로
  // 이미 inRange에서 제외되어 있으므로, inRange가 있으면 그쪽으로 재진입하면 된다.
  if (unit.ship.aiTactic === 'kiter' && manhattanDistance(here, targetPos) < minRng) {
    if (inRange.length > 0) {
      return inRange.reduce((best, cell) => (cell.cost < best.cost ? cell : best))
    }
    return reachable.reduce((best, cell) =>
      manhattanDistance(cell, targetPos) > manhattanDistance(best, targetPos) ? cell : best,
    )
  }

  if (inRange.length > 0) {
    return inRange.reduce((best, cell) => (cell.cost < best.cost ? cell : best))
  }

  return reachable.reduce((best, cell) =>
    manhattanDistance(cell, targetPos) < manhattanDistance(best, targetPos) ? cell : best,
  )
}

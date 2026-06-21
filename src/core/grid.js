// 사각 그리드 좌표·이동 계산 순수함수 모음 (Phaser 등 렌더러에 의존하지 않음).
// 이동은 4방향(상하좌우) 1칸당 1 비용으로 계산한다 (창세기전 2 계열 SRPG 기준).

const DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
]

const cellKey = (x, y) => `${x},${y}`

export function neighborsOf(x, y) {
  return DIRECTIONS.map(({ dx, dy }) => ({ x: x + dx, y: y + dy }))
}

export function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

// start에서 mov 이동력 이내에 도달 가능한 칸들을 다익스트라로 구한다.
// isPassable(x, y)가 false인 칸은 통과·정지 모두 불가 (start 자신은 결과에서 제외).
// getCost(x, y): 해당 칸에 진입할 때 소모되는 이동력 (기본 1). 지형 AP 비용 적용 시 사용.
export function computeMovementRange(start, mov, isPassable, getCost = () => 1) {
  const startKey = cellKey(start.x, start.y)
  const dist = new Map([[startKey, 0]])
  // [costSoFar, x, y] 우선순위 큐 (배열 정렬로 구현)
  const pq = [{ cost: 0, x: start.x, y: start.y }]

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost)
    const { cost, x, y } = pq.shift()

    if (cost > (dist.get(cellKey(x, y)) ?? Infinity)) continue

    for (const n of neighborsOf(x, y)) {
      if (!isPassable(n.x, n.y)) continue
      const newCost = cost + getCost(n.x, n.y)
      if (newCost > mov) continue
      const key = cellKey(n.x, n.y)
      if (newCost < (dist.get(key) ?? Infinity)) {
        dist.set(key, newCost)
        pq.push({ cost: newCost, x: n.x, y: n.y })
      }
    }
  }

  dist.delete(startKey)
  return [...dist.entries()].map(([key, cost]) => {
    const [x, y] = key.split(',').map(Number)
    return { x, y, cost }
  })
}

// start → goal 최단 경로를 BFS로 구한다 (start 포함, goal 도달 불가 시 null).
export function findPath(start, goal, isPassable) {
  const startKey = cellKey(start.x, start.y)
  const goalKey = cellKey(goal.x, goal.y)
  if (startKey === goalKey) return [start]

  const cameFrom = new Map([[startKey, null]])
  const queue = [start]

  while (queue.length > 0) {
    const current = queue.shift()
    const currentKey = cellKey(current.x, current.y)
    if (currentKey === goalKey) break

    for (const n of neighborsOf(current.x, current.y)) {
      const key = cellKey(n.x, n.y)
      if (cameFrom.has(key) || !isPassable(n.x, n.y)) continue
      cameFrom.set(key, currentKey)
      queue.push(n)
    }
  }

  if (!cameFrom.has(goalKey)) return null

  const path = []
  for (let key = goalKey; key !== null; key = cameFrom.get(key)) {
    const [x, y] = key.split(',').map(Number)
    path.unshift({ x, y })
  }
  return path
}

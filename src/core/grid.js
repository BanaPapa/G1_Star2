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

// start에서 mov 칸 이내에 도달 가능한 칸들을 BFS로 구한다.
// isPassable(x, y)가 false인 칸은 통과·정지 모두 불가 (start 자신은 결과에서 제외).
export function computeMovementRange(start, mov, isPassable) {
  const visited = new Map([[cellKey(start.x, start.y), 0]])
  let frontier = [start]

  for (let step = 1; step <= mov && frontier.length > 0; step += 1) {
    const next = []
    for (const { x, y } of frontier) {
      for (const n of neighborsOf(x, y)) {
        const key = cellKey(n.x, n.y)
        if (visited.has(key) || !isPassable(n.x, n.y)) continue
        visited.set(key, step)
        next.push(n)
      }
    }
    frontier = next
  }

  visited.delete(cellKey(start.x, start.y))
  return [...visited.entries()].map(([key, cost]) => {
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

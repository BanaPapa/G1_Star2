// Gravity 계열 판정 — 순수 함수 모듈 (BattleScene과 분리, 단위 테스트 대상).
// 설계 근거: docs/design/weapons_master_plan.md §5 (Gravity 판정 규칙), DESIGN_BIBLE §3-6
//
// 계열 문법: T1 밀어내기 → T2 강제 워프 → T3 고중력장 → T4 집결 붕괴 → T5 사건의 지평선
// Gravity의 정체성 = 위치·이동·행동 비용 조작. 강제 이동 판정을 이 모듈이 담당한다.

export function gravityDefaults(cfg = {}) {
  return {
    ram: { pushDistance: 5, collisionMult: 0.5, bossPushDistance: 1, ...cfg.ram },
    displacer: { ejectChance: 0.12, strongerBlockPct: 30, aiWarpRadius: 3, ...cfg.displacer },
    well: { turns: 1, apCostMult: 2, attackMult: 0.5, damageTakenMult: 2, ...cfg.well },
    collapse: { collisionMult: 0.6, wellTurns: 2, ...cfg.collapse },
    eventHorizon: {
      weaken: { atkPct: -30, defPct: -30, apCostPct: 100, turns: 2 },
      dot: { pct: 5, turns: 2 },
      boss: { movPct: -50, atkPct: -30, defPct: -30, turns: 2 },
      ...cfg.eventHorizon,
    },
  }
}

// ── T1 밀어내기: from에서 dir(8방향 단위 벡터)로 최대 maxDistance칸 진행 ──
// blockedAt(x, y) → 'unit' | 'obstacle' | null (전장 밖은 이 함수가 판정)
// 반환: { dest: {x,y}, moved, collided: null | { type: 'unit'|'obstacle'|'edge', x, y } }
//   - unit/obstacle 충돌: 그 직전 칸에 멈춤. edge: 경계 칸까지 밀림.
export function computePush({ from, dir, maxDistance, cols, rows, blockedAt }) {
  let cur = { ...from }
  let collided = null
  for (let i = 0; i < maxDistance; i++) {
    const nx = cur.x + dir[0]
    const ny = cur.y + dir[1]
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
      collided = { type: 'edge', x: nx, y: ny }
      break
    }
    const b = blockedAt(nx, ny)
    if (b) {
      collided = { type: b, x: nx, y: ny }
      break
    }
    cur = { x: nx, y: ny }
  }
  return { dest: cur, moved: Math.max(Math.abs(cur.x - from.x), Math.abs(cur.y - from.y)), collided }
}

// ── T2 워프: 이탈 판정 — 보스 불가, 시전자보다 전체 능력 30% 이상 높은 적 불가 ──
// strength: 능력 총합 비교용 (atk + maxHp + def 합)
export function unitStrength(u) {
  return (u.atk ?? 0) + (u.maxHp ?? 0) + (u.def ?? 0)
}

export function rollDisplace({ isBoss, attackerStrength, targetStrength, cfg, rng = Math.random }) {
  const c = gravityDefaults(cfg).displacer
  const tooStrong = attackerStrength > 0 && ((targetStrength - attackerStrength) / attackerStrength) * 100 >= c.strongerBlockPct
  const canEject = !isBoss && !tooStrong
  if (canEject && rng() < c.ejectChance) return { type: 'eject' }
  return { type: 'warp' }
}

// ── T4 집결: 대상들을 중심(ring0)·인접(ring1) 빈 칸으로 배치 ──
// units: [{x, y}] (중심 칸의 유닛 포함 가능 — 그 유닛은 제자리 유지)
// isFree(x, y): 배치 가능 여부 (경계·지형·다른 유닛 판정은 호출측)
// 반환: Map<'x,y' (원래 위치) → {x, y} (배치 위치)> — 배치 불가면 원위치 유지
export function computeGatherPlacements({ center, units, isFree }) {
  const placements = new Map()
  const taken = new Set([`${center.x},${center.y}`])
  const ring1 = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      ring1.push({ x: center.x + dx, y: center.y + dy })
    }
  }
  // 중심에서 가까운 유닛부터 배치 (중심 칸 유닛은 제자리)
  const sorted = [...units].sort((a, b) =>
    (Math.abs(a.x - center.x) + Math.abs(a.y - center.y)) - (Math.abs(b.x - center.x) + Math.abs(b.y - center.y)))
  for (const u of sorted) {
    const key = `${u.x},${u.y}`
    if (u.x === center.x && u.y === center.y) {
      placements.set(key, { x: u.x, y: u.y })
      continue
    }
    // 이 유닛에서 가장 가까운 빈 ring1 칸
    const candidates = ring1
      .filter((c) => !taken.has(`${c.x},${c.y}`) && isFree(c.x, c.y))
      .sort((a, b) =>
        (Math.abs(a.x - u.x) + Math.abs(a.y - u.y)) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))
    if (candidates.length === 0) {
      placements.set(key, { x: u.x, y: u.y }) // 빈 칸 없음 — 원위치
      continue
    }
    const dest = candidates[0]
    taken.add(`${dest.x},${dest.y}`)
    placements.set(key, dest)
  }
  return placements
}

// ── T5 사건의 지평선: 피격자에게 부착할 modifier 목록 ──
export function eventHorizonModifiers({ isBoss, cfg }) {
  const c = gravityDefaults(cfg).eventHorizon
  if (isBoss) {
    // 보스 예외: 이동 봉쇄 → 이동력 감소 + 약화 (weapons_master_plan §5)
    return [
      { id: 'grav_horizon', kind: 'stat', turnsLeft: c.boss.turns, icon: '🌀',
        data: { movPct: c.boss.movPct, atkPct: c.boss.atkPct, defPct: c.boss.defPct } },
    ]
  }
  return [
    { id: 'grav_horizon_block', kind: 'move_block', turnsLeft: 1, icon: '⛓️' },
    { id: 'grav_horizon', kind: 'stat', turnsLeft: c.weaken.turns, icon: '🌀',
      data: { atkPct: c.weaken.atkPct, defPct: c.weaken.defPct, apCostPct: c.weaken.apCostPct } },
    { id: 'grav_horizon_dot', kind: 'dot', turnsLeft: c.dot.turns, icon: '☣️', data: { pct: c.dot.pct } },
  ]
}

// Laser 계열 조준/판정 — 순수 함수 모듈 (BattleScene과 분리, 단위 테스트 대상).
// 설계 근거: docs/design/weapons_master_plan.md §2 (Laser 판정 규칙)
//
// 계열 문법: T1 직선(4방향) → T2 8방향 → T3 1회 관통(2번째 50%) → T4 굴절 1회 → T5 굴절+최대 3기
//
// 입력
//   attacker/target : { x, y } 그리드 좌표
//   tier            : 1~5
//   range           : 빔 최대 길이(칸) — 굴절 시 두 구간 합
//   cols, rows      : 전장 크기
//   occupied        : Map<'x,y', { kind: 'ally'|'enemy'|'blocked' }> (공격자 칸 제외)
//   mults           : { pierceSecondMult, deflectMults, phaseMults } — 관제실 config에서 주입
// 출력
//   { valid, reason, path: [{x,y}...], pivot: {x,y}|null, hits: [{x,y,mult}...] }
//   reason: 'not_aligned' | 'blocked' | 'ally_block' | 'blocked_by_unit' | 'out_of_range' | 'no_path'

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIRS8 = [...DIRS4, [1, 1], [1, -1], [-1, 1], [-1, -1]]

// 두 칸이 허용 방향으로 정렬되어 있으면 단위 스텝 [dx,dy] 반환, 아니면 null
function alignDir(from, to, dirs) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return null
  const straight = dx === 0 || dy === 0
  const diagonal = Math.abs(dx) === Math.abs(dy)
  if (!straight && !diagonal) return null
  const step = [Math.sign(dx), Math.sign(dy)]
  return dirs.some(([sx, sy]) => sx === step[0] && sy === step[1]) ? step : null
}

// 방향 정렬된 두 칸 사이 거리 (직선·대각선 공용)
function stepDistance(from, to) {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))
}

// from에서 dir 방향으로 maxSteps까지 진행하며 칸 이벤트를 순서대로 수집.
// 각 항목: { x, y, ent: 'ally'|'enemy'|'blocked'|null }
// 전장 밖으로 나가면 그 전에서 멈춘다.
function walk(from, dir, maxSteps, cols, rows, occupied) {
  const cells = []
  let { x, y } = from
  for (let i = 0; i < maxSteps; i++) {
    x += dir[0]
    y += dir[1]
    if (x < 0 || y < 0 || x >= cols || y >= rows) break
    cells.push({ x, y, ent: occupied.get(`${x},${y}`)?.kind ?? null })
  }
  return cells
}

// 티어별 최대 피격 수 (직사 기준. T4 직사는 단일 — 굴절이 정체성)
function maxHitsForTier(tier) {
  if (tier >= 5) return 3
  if (tier === 3) return 2
  return 1
}

// 피격 순서별 배율
function multForIndex(index, tier, mults) {
  if (tier >= 5) return mults.phaseMults[index] ?? mults.phaseMults[mults.phaseMults.length - 1]
  if (tier === 3) return index === 0 ? 1 : mults.pierceSecondMult
  return 1
}

// 직선 사격 판정. startFrom에서 dir로 진행하며 target을 포함한 피격 목록을 만든다.
// alreadyHit: 굴절점(적)이 이미 피격된 경우 그 수 — 관통 예산에서 차감.
function resolveStraight({ startFrom, dir, target, tier, budget, cols, rows, occupied, startIndex, mults, maxSteps }) {
  const cells = walk(startFrom, dir, maxSteps, cols, rows, occupied)
  const hits = []
  const path = []
  let reachedTarget = false
  let failReason = null

  for (const cell of cells) {
    path.push({ x: cell.x, y: cell.y })
    const isTarget = cell.x === target.x && cell.y === target.y

    if (cell.ent === 'blocked') {
      if (!reachedTarget && !isTarget) failReason = 'blocked'
      break
    }
    if (cell.ent === 'ally') {
      if (!reachedTarget) failReason = 'ally_block'
      break
    }
    if (cell.ent === 'enemy') {
      hits.push({ x: cell.x, y: cell.y, mult: multForIndex(startIndex + hits.length, tier, mults) })
      if (isTarget) reachedTarget = true
      if (hits.length >= budget) {
        // 관통 예산 소진 — 빔이 여기서 멈춘다. 타깃 미도달이면 다른 유닛이 막은 것.
        if (!reachedTarget) failReason = 'blocked_by_unit'
        break
      }
      continue
    }
    if (isTarget) {
      // 타깃 칸에 도달했는데 유닛이 없는 경우는 호출측 오류 — 방어적으로 중단
      break
    }
  }

  if (!reachedTarget) {
    return { ok: false, reason: failReason ?? 'blocked' }
  }
  return { ok: true, hits, path, reachedTarget }
}

export function computeLaserShot({ attacker, target, tier, range, cols, rows, occupied, mults }) {
  const dirs = tier === 1 ? DIRS4 : DIRS8
  const invalid = (reason) => ({ valid: false, reason, path: [], pivot: null, hits: [] })

  // ── 1) 직사 시도 ──
  const directDir = alignDir(attacker, target, dirs)
  if (directDir) {
    if (stepDistance(attacker, target) > range) return invalid('out_of_range')
    const res = resolveStraight({
      startFrom: attacker, dir: directDir, target, tier,
      budget: maxHitsForTier(tier), cols, rows, occupied,
      startIndex: 0, mults, maxSteps: range,
    })
    if (res.ok) return { valid: true, reason: null, path: res.path, pivot: null, hits: res.hits }
    // 직사 실패 — T4/T5는 굴절 시도로 넘어감, T1~T3는 실패 확정
    if (tier < 4) return invalid(res.reason)
    // T4/T5 직사 실패 사유는 굴절 실패 시의 기본 사유로 보존
    const fallbackReason = res.reason
    const deflected = tryDeflection({ attacker, target, tier, range, cols, rows, occupied, mults, dirs })
    return deflected ?? invalid(fallbackReason)
  }

  // ── 2) 비정렬 — T4/T5는 굴절 탐색, 그 외 실패 ──
  if (tier < 4) return invalid('not_aligned')
  const deflected = tryDeflection({ attacker, target, tier, range, cols, rows, occupied, mults, dirs })
  return deflected ?? invalid('no_path')
}

// 굴절 탐색: 실체가 있는 칸(장애물/아군/적군)만 굴절점이 될 수 있다 (빈 공간 불가).
// 조건: 공격자→굴절점이 첫 실체까지의 깨끗한 직선, 굴절점→타깃이 유효한 직선, 방향이 실제로 꺾임.
// 여러 후보 중 총 경로가 가장 짧은 것을 선택.
function tryDeflection({ attacker, target, tier, range, cols, rows, occupied, mults, dirs }) {
  let best = null

  for (const [key, ent] of occupied) {
    const [px, py] = key.split(',').map(Number)
    const pivot = { x: px, y: py }
    if (pivot.x === target.x && pivot.y === target.y) continue // 타깃 자신은 굴절점이 아님

    const d1 = alignDir(attacker, pivot, dirs)
    if (!d1) continue
    const len1 = stepDistance(attacker, pivot)
    if (len1 > range) continue

    // 공격자→굴절점 구간: 굴절점 이전에 다른 실체가 있으면 안 됨
    const seg1 = walk(attacker, d1, len1, cols, rows, occupied)
    if (seg1.length < len1) continue // 전장 밖
    const beforePivot = seg1.slice(0, -1)
    if (beforePivot.some((c) => c.ent)) continue

    const d2 = alignDir(pivot, target, dirs)
    if (!d2) continue
    if (d2[0] === d1[0] && d2[1] === d1[1]) continue // 꺾이지 않으면 직사와 동일 — 제외
    const len2 = stepDistance(pivot, target)
    const totalLen = len1 + len2
    if (totalLen > range) continue

    // 굴절점이 적이면 첫 피격 대상
    const pivotHits = ent.kind === 'enemy'
      ? [{ x: pivot.x, y: pivot.y, mult: multForIndex(0, tier, mults) }]
      : []
    const budgetTotal = tier >= 5 ? 3 : (tier === 4 ? mults.deflectMults.length : 2)
    const remainingBudget = Math.max(0, budgetTotal - pivotHits.length)
    if (remainingBudget === 0) continue

    // 굴절점→타깃 구간 판정 (관통 예산은 남은 만큼)
    const res = resolveStraight({
      startFrom: pivot, dir: d2, target, tier: tier >= 5 ? 5 : 4,
      budget: tier >= 5 ? remainingBudget : 1,
      cols, rows, occupied,
      startIndex: pivotHits.length, mults, maxSteps: range - len1,
    })
    if (!res.ok) continue

    // T4 배율은 deflectMults 순서 적용 (기본 [1,1])
    let hits = [...pivotHits, ...res.hits]
    if (tier === 4) {
      hits = hits.map((h, i) => ({ ...h, mult: mults.deflectMults[i] ?? 1 }))
    }

    const path = [...seg1.map(({ x, y }) => ({ x, y })), ...res.path]
    const candidate = { valid: true, reason: null, path, pivot, hits, totalLen }
    if (!best || candidate.totalLen < best.totalLen) best = candidate
  }

  if (!best) return null
  const { totalLen: _len, ...result } = best
  return result
}

import { describe, it, expect } from 'vitest'
import { computePush, rollDisplace, computeGatherPlacements, eventHorizonModifiers, unitStrength } from '../gravityEffects'

const GRID = { cols: 12, rows: 10 }

describe('Gravity T1 — computePush (밀어내기)', () => {
  const push = (over = {}) => computePush({
    from: { x: 5, y: 5 }, dir: [1, 0], maxDistance: 5,
    cols: GRID.cols, rows: GRID.rows,
    blockedAt: () => null,
    ...over,
  })

  it('막힘 없으면 최대 거리만큼 밀린다', () => {
    const r = push()
    expect(r.dest).toEqual({ x: 10, y: 5 })
    expect(r.moved).toBe(5)
    expect(r.collided).toBeNull()
  })

  it('맵 경계 → 경계 칸까지 밀리고 edge 충돌', () => {
    const r = push({ from: { x: 9, y: 5 } })
    expect(r.dest).toEqual({ x: 11, y: 5 })
    expect(r.collided?.type).toBe('edge')
  })

  it('다른 유닛 → 직전 칸에 멈추고 unit 충돌', () => {
    const r = push({ blockedAt: (x, y) => (x === 8 && y === 5 ? 'unit' : null) })
    expect(r.dest).toEqual({ x: 7, y: 5 })
    expect(r.collided).toMatchObject({ type: 'unit', x: 8, y: 5 })
  })

  it('장애물 → obstacle 충돌', () => {
    const r = push({ blockedAt: (x) => (x === 7 ? 'obstacle' : null) })
    expect(r.dest).toEqual({ x: 6, y: 5 })
    expect(r.collided?.type).toBe('obstacle')
  })

  it('대각선 밀어내기도 동작한다', () => {
    const r = push({ dir: [1, 1], maxDistance: 3 })
    expect(r.dest).toEqual({ x: 8, y: 8 })
  })

  it('보스 감소 거리(1칸) 적용', () => {
    const r = push({ maxDistance: 1 })
    expect(r.dest).toEqual({ x: 6, y: 5 })
  })
})

describe('Gravity T2 — rollDisplace (워프/이탈)', () => {
  it('낮은 확률로 전장 이탈', () => {
    const r = rollDisplace({ isBoss: false, attackerStrength: 100, targetStrength: 100, rng: () => 0.05 })
    expect(r.type).toBe('eject')
  })

  it('이탈 실패 → 워프', () => {
    const r = rollDisplace({ isBoss: false, attackerStrength: 100, targetStrength: 100, rng: () => 0.5 })
    expect(r.type).toBe('warp')
  })

  it('보스는 이탈 불가', () => {
    const r = rollDisplace({ isBoss: true, attackerStrength: 100, targetStrength: 100, rng: () => 0.01 })
    expect(r.type).toBe('warp')
  })

  it('시전자보다 30% 이상 강한 적은 이탈 불가', () => {
    const r = rollDisplace({ isBoss: false, attackerStrength: 100, targetStrength: 130, rng: () => 0.01 })
    expect(r.type).toBe('warp')
    const r2 = rollDisplace({ isBoss: false, attackerStrength: 100, targetStrength: 129, rng: () => 0.01 })
    expect(r2.type).toBe('eject')
  })

  it('unitStrength = atk + maxHp + def 합', () => {
    expect(unitStrength({ atk: 20, maxHp: 70, def: 10 })).toBe(100)
  })
})

describe('Gravity T4 — computeGatherPlacements (집결)', () => {
  it('중심 칸 유닛은 제자리, 나머지는 인접 빈 칸으로', () => {
    const p = computeGatherPlacements({
      center: { x: 5, y: 5 },
      units: [{ x: 5, y: 5 }, { x: 7, y: 5 }, { x: 3, y: 7 }],
      isFree: () => true,
    })
    expect(p.get('5,5')).toEqual({ x: 5, y: 5 })
    const d1 = p.get('7,5')
    const d2 = p.get('3,7')
    // 인접 링(체비쇼프 1) 안에 배치
    expect(Math.max(Math.abs(d1.x - 5), Math.abs(d1.y - 5))).toBe(1)
    expect(Math.max(Math.abs(d2.x - 5), Math.abs(d2.y - 5))).toBe(1)
    // 서로 다른 칸
    expect(`${d1.x},${d1.y}`).not.toBe(`${d2.x},${d2.y}`)
  })

  it('빈 칸이 없으면 원위치 유지', () => {
    const p = computeGatherPlacements({
      center: { x: 5, y: 5 },
      units: [{ x: 8, y: 8 }],
      isFree: () => false,
    })
    expect(p.get('8,8')).toEqual({ x: 8, y: 8 })
  })
})

describe('Gravity T5 — eventHorizonModifiers', () => {
  it('일반: 이동 봉쇄 1턴 + 약화(AP 비용 +100%) 2턴 + 도트 2턴', () => {
    const mods = eventHorizonModifiers({ isBoss: false })
    const kinds = mods.map((m) => m.kind).sort()
    expect(kinds).toEqual(['dot', 'move_block', 'stat'])
    expect(mods.find((m) => m.kind === 'move_block').turnsLeft).toBe(1)
    expect(mods.find((m) => m.kind === 'stat').data.apCostPct).toBe(100)
    expect(mods.find((m) => m.kind === 'dot').data.pct).toBe(5)
  })

  it('보스: 이동 봉쇄 대신 이동력/공방 감소', () => {
    const mods = eventHorizonModifiers({ isBoss: true })
    expect(mods).toHaveLength(1)
    expect(mods[0].kind).toBe('stat')
    expect(mods[0].data.movPct).toBe(-50)
  })
})

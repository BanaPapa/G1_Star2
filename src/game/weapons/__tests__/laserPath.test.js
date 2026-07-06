import { describe, it, expect } from 'vitest'
import { computeLaserShot } from '../laserPath'

// 10×8 전장. occupied: Map<'x,y', {kind}> — 공격자 칸은 포함하지 않는다.
const GRID = { cols: 10, rows: 8 }

function occ(entries) {
  const map = new Map()
  for (const [x, y, kind] of entries) map.set(`${x},${y}`, { kind })
  return map
}

function shot({ attacker = { x: 1, y: 4 }, target, tier, range = 10, occupied = new Map(), mults }) {
  return computeLaserShot({
    attacker, target, tier, range,
    cols: GRID.cols, rows: GRID.rows,
    occupied,
    mults: mults ?? { pierceSecondMult: 0.5, deflectMults: [1, 1], phaseMults: [1, 1, 0.5] },
  })
}

describe('Laser T1 — 선형 레이저 (상하좌우)', () => {
  it('같은 행의 첫 적을 맞힌다', () => {
    const r = shot({ target: { x: 5, y: 4 }, tier: 1, occupied: occ([[5, 4, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([{ x: 5, y: 4, mult: 1 }])
  })

  it('대각선 대상은 불가', () => {
    const r = shot({ target: { x: 4, y: 7 }, tier: 1, occupied: occ([[4, 7, 'enemy']]) })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('not_aligned')
  })

  it('경로의 장애물이 빔을 차단한다', () => {
    const r = shot({ target: { x: 6, y: 4 }, tier: 1, occupied: occ([[3, 4, 'blocked'], [6, 4, 'enemy']]) })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('blocked')
  })

  it('경로의 아군이 빔을 차단한다', () => {
    const r = shot({ target: { x: 6, y: 4 }, tier: 1, occupied: occ([[3, 4, 'ally'], [6, 4, 'enemy']]) })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('ally_block')
  })

  it('앞의 다른 적 뒤에 있는 적은 조준 불가 (첫 적만)', () => {
    const r = shot({ target: { x: 6, y: 4 }, tier: 1, occupied: occ([[3, 4, 'enemy'], [6, 4, 'enemy']]) })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('blocked_by_unit')
  })

  it('사거리 밖이면 불가', () => {
    const r = shot({ target: { x: 8, y: 4 }, tier: 1, range: 5, occupied: occ([[8, 4, 'enemy']]) })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('out_of_range')
  })
})

describe('Laser T2 — 벡터 레이저 (8방향)', () => {
  it('대각선 첫 적을 맞힌다', () => {
    const r = shot({ target: { x: 4, y: 7 }, tier: 2, occupied: occ([[4, 7, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([{ x: 4, y: 7, mult: 1 }])
  })
})

describe('Laser T3 — 관통 빔 (2기, 2번째 50%)', () => {
  it('같은 라인의 두 번째 적까지 자동 관통한다', () => {
    const r = shot({ target: { x: 3, y: 4 }, tier: 3, occupied: occ([[3, 4, 'enemy'], [6, 4, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([
      { x: 3, y: 4, mult: 1 },
      { x: 6, y: 4, mult: 0.5 },
    ])
  })

  it('두 번째 적을 직접 조준해도 첫 적부터 순서대로 맞는다', () => {
    const r = shot({ target: { x: 6, y: 4 }, tier: 3, occupied: occ([[3, 4, 'enemy'], [6, 4, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([
      { x: 3, y: 4, mult: 1 },
      { x: 6, y: 4, mult: 0.5 },
    ])
  })

  it('두 적 사이의 장애물은 관통을 막는다 (첫 적만 피해)', () => {
    const r = shot({ target: { x: 3, y: 4 }, tier: 3, occupied: occ([[3, 4, 'enemy'], [5, 4, 'blocked'], [7, 4, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([{ x: 3, y: 4, mult: 1 }])
  })

  it('세 번째 적은 맞지 않는다', () => {
    const r = shot({ target: { x: 3, y: 4 }, tier: 3, occupied: occ([[3, 4, 'enemy'], [5, 4, 'enemy'], [7, 4, 'enemy']]) })
    expect(r.hits).toHaveLength(2)
  })
})

describe('Laser T4 — 굴절 빔 (1회 꺾임)', () => {
  it('장애물을 굴절점 삼아 직선 밖의 적을 맞힌다', () => {
    // 공격자(1,4) → 굴절점 장애물(5,4) → 적(5,1): ─ 직진 후 ↑ 꺾임
    const r = shot({ target: { x: 5, y: 1 }, tier: 4, occupied: occ([[5, 4, 'blocked'], [5, 1, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.pivot).toEqual({ x: 5, y: 4 })
    expect(r.hits).toEqual([{ x: 5, y: 1, mult: 1 }])
  })

  it('아군 굴절점은 피해 없이 빔만 꺾는다', () => {
    const r = shot({ target: { x: 5, y: 1 }, tier: 4, occupied: occ([[5, 4, 'ally'], [5, 1, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([{ x: 5, y: 1, mult: 1 }])
  })

  it('적군 굴절점은 피격 대상이 된다', () => {
    const r = shot({ target: { x: 5, y: 1 }, tier: 4, occupied: occ([[5, 4, 'enemy'], [5, 1, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([
      { x: 5, y: 4, mult: 1 },
      { x: 5, y: 1, mult: 1 },
    ])
  })

  it('직선으로 닿으면 굴절 없이 직사한다', () => {
    const r = shot({ target: { x: 5, y: 4 }, tier: 4, occupied: occ([[5, 4, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.pivot).toBeNull()
    expect(r.hits).toEqual([{ x: 5, y: 4, mult: 1 }])
  })

  it('총 경로 길이가 사거리를 넘으면 불가', () => {
    // 1,4→5,4 (4칸) + 5,4→5,1 (3칸) = 7칸 > range 6
    const r = shot({ target: { x: 5, y: 1 }, tier: 4, range: 6, occupied: occ([[5, 4, 'blocked'], [5, 1, 'enemy']]) })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('no_path')
  })
})

describe('Laser T5 — 위상 랜스 (최대 3기, 100/100/50%)', () => {
  it('직선 경로에서 3기를 100/100/50%로 맞힌다', () => {
    const r = shot({ target: { x: 3, y: 4 }, tier: 5, occupied: occ([[3, 4, 'enemy'], [5, 4, 'enemy'], [7, 4, 'enemy']]) })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([
      { x: 3, y: 4, mult: 1 },
      { x: 5, y: 4, mult: 1 },
      { x: 7, y: 4, mult: 0.5 },
    ])
  })

  it('굴절 경로에서도 관통한다 — 적 굴절점 + 뒤 2기', () => {
    // 공격자(1,4) → 적 굴절점(5,4) → ↑ 적(5,2), 적(5,1)
    const r = shot({
      target: { x: 5, y: 2 }, tier: 5,
      occupied: occ([[5, 4, 'enemy'], [5, 2, 'enemy'], [5, 1, 'enemy']]),
    })
    expect(r.valid).toBe(true)
    expect(r.hits).toEqual([
      { x: 5, y: 4, mult: 1 },
      { x: 5, y: 2, mult: 1 },
      { x: 5, y: 1, mult: 0.5 },
    ])
  })
})

import { describe, it, expect } from 'vitest'
import { rollAntimatterHit, pickBlackHoleCells } from '../antimatterEffects'

function rngQueue(...values) {
  const q = [...values]
  return () => (q.length ? q.shift() : 0.999)
}

describe('Antimatter T1 — 추진계 절삭탄 (이동만 제한, 공격은 가능)', () => {
  it('낮은 확률 → 다음 턴 이동 불가(move_block)', () => {
    const r = rollAntimatterHit({ tier: 1, rng: rngQueue(0.1) })
    expect(r.modifiers[0].kind).toBe('move_block')
  })

  it('높은 확률 → 이동 효율 -50%', () => {
    const r = rollAntimatterHit({ tier: 1, rng: rngQueue(0.9, 0.3) })
    expect(r.modifiers[0]).toMatchObject({ kind: 'stat', data: { movPct: -50 } })
  })

  it('보스는 이동 봉쇄 불가 — 감소만', () => {
    const r = rollAntimatterHit({ tier: 1, isBoss: true, rng: rngQueue(0.1, 0.3) })
    expect(r.modifiers[0].kind).toBe('stat')
  })
})

describe('Antimatter T2 — 방어층 소거기', () => {
  it('절삭 성공: 장갑 내구도·쉴드 -50% + 절삭 플래그', () => {
    const r = rollAntimatterHit({ tier: 2, rng: rngQueue(0.5) })
    expect(r.mutations).toMatchObject({ armorDurMult: 0.5, shieldMult: 0.5 })
    expect(r.modifiers.find((m) => m.kind === 'flag')).toBeTruthy()
  })

  it('절삭 상태 재피격 → 완전 붕괴 (장갑 0 + 쉴드 0 + 재충전 불가)', () => {
    const r = rollAntimatterHit({ tier: 2, alreadyEroded: true, rng: rngQueue(0.5) })
    expect(r.mutations).toMatchObject({ armorDurZero: true, shieldZero: true })
    expect(r.modifiers.find((m) => m.kind === 'recharge_block').turnsLeft).toBe(Infinity)
  })

  it('보스는 완전 파괴 불가 — 재피격도 50% 절삭만', () => {
    const r = rollAntimatterHit({ tier: 2, isBoss: true, alreadyEroded: true, rng: rngQueue(0.5) })
    expect(r.mutations.armorDurZero).toBeUndefined()
    expect(r.mutations.armorDurMult).toBe(0.5)
  })
})

describe('Antimatter T3 — 반물질 에너지장 (방어층 삭제 + 무기 폭주)', () => {
  it('적용 성공: 장갑·쉴드 영구 손실 + 2턴 rampage', () => {
    const r = rollAntimatterHit({ tier: 3, rng: rngQueue(0.5) })
    expect(r.mutations).toMatchObject({ armorDurZero: true, shieldZero: true })
    expect(r.modifiers.find((m) => m.kind === 'rampage').turnsLeft).toBe(2)
  })

  it('보스: 난사 대신 공격력 감소 + 재충전 봉쇄', () => {
    const r = rollAntimatterHit({ tier: 3, isBoss: true, rng: rngQueue(0.5) })
    expect(r.modifiers.some((m) => m.kind === 'rampage')).toBe(false)
    expect(r.modifiers.find((m) => m.kind === 'stat').data.atkPct).toBe(-30)
    expect(r.modifiers.some((m) => m.kind === 'recharge_block')).toBe(true)
  })
})

describe('Antimatter T5 — 완전 소멸 병기', () => {
  it('소멸 성공: annihilate + 연쇄 확률 전달 (처치 판정)', () => {
    const r = rollAntimatterHit({ tier: 5, rng: rngQueue(0.5) })
    expect(r.mutations.annihilate).toBe(true)
    expect(r.mutations.chainChance).toBe(0.5)
  })

  it('소멸 실패: 쉴드 100% 파괴 + 70% 확률 내구도 -50%', () => {
    const r = rollAntimatterHit({ tier: 5, rng: rngQueue(0.9, 0.5) })
    expect(r.mutations.annihilate).toBeUndefined()
    expect(r.mutations.shieldZero).toBe(true)
    expect(r.mutations.armorDurMult).toBe(0.5)
  })

  it('보스는 소멸 불가 — 쉴드 파괴 + 재충전 봉쇄로 변환', () => {
    const r = rollAntimatterHit({ tier: 5, isBoss: true, rng: rngQueue(0.1) })
    expect(r.mutations.annihilate).toBeUndefined()
    expect(r.mutations.shieldZero).toBe(true)
    expect(r.modifiers.some((m) => m.kind === 'recharge_block')).toBe(true)
  })
})

describe('Antimatter T4 — pickBlackHoleCells (블랙홀 위치)', () => {
  it('중심 제외 8칸 중 유효한 칸에서 4개 선택', () => {
    const cells = pickBlackHoleCells({ center: { x: 5, y: 5 }, isValid: () => true, rng: rngQueue(0.1, 0.5, 0.3, 0.7, 0.2, 0.9, 0.4) })
    expect(cells).toHaveLength(4)
    for (const c of cells) {
      expect(c.x === 5 && c.y === 5).toBe(false) // 중심점은 블랙홀 안 됨
      expect(Math.max(Math.abs(c.x - 5), Math.abs(c.y - 5))).toBe(1)
    }
    // 중복 없음
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(4)
  })

  it('유효 칸이 4개 미만이면 있는 만큼만', () => {
    const cells = pickBlackHoleCells({ center: { x: 5, y: 5 }, isValid: (x, y) => x === 6 && y === 5, rng: rngQueue() })
    expect(cells).toHaveLength(1)
  })
})

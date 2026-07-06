import { describe, it, expect } from 'vitest'
import { rollIonHit } from '../ionEffects'

// rng 주입 — 큐에서 순서대로 꺼내 쓰고, 소진되면 1(모든 확률 실패)을 반환한다.
function rngQueue(...values) {
  const q = [...values]
  return () => (q.length ? q.shift() : 0.999)
}

const roll = (over = {}) => rollIonHit({ tier: 1, rng: rngQueue(), ...over })

describe('Ion T1 — 이온 재머 (조준 교란)', () => {
  it('명중 시 확정으로 명중/회피 -30% 1턴 부착', () => {
    const r = roll({ tier: 1 })
    expect(r.modifiers).toHaveLength(1)
    expect(r.modifiers[0]).toMatchObject({ id: 'ion_jammer', kind: 'stat', turnsLeft: 1, data: { accMod: -30, evaMod: -30 } })
    expect(r.nullifyShield).toBe(false)
  })

  it('수치는 config에서 주입된다 (관제실 조정)', () => {
    const r = roll({ tier: 1, cfg: { jammer: { accMod: -50, evaMod: -10, turns: 2 } } })
    expect(r.modifiers[0].data).toEqual({ accMod: -50, evaMod: -10 })
    expect(r.modifiers[0].turnsLeft).toBe(2)
  })
})

describe('Ion T2 — 행동력 교란기 (AP-2 또는 스턴, 동시 발생 없음)', () => {
  it('첫 판정 성공 → AP 드레인', () => {
    const r = roll({ tier: 2, rng: rngQueue(0.1) })
    expect(r.modifiers).toHaveLength(1)
    expect(r.modifiers[0]).toMatchObject({ kind: 'ap_drain', data: { amount: 2 } })
  })

  it('드레인 실패 + 스턴 성공 → 스턴만', () => {
    const r = roll({ tier: 2, rng: rngQueue(0.9, 0.05) })
    expect(r.modifiers).toHaveLength(1)
    expect(r.modifiers[0].kind).toBe('stun')
  })

  it('둘 다 실패 → 부가 효과 없음', () => {
    const r = roll({ tier: 2, rng: rngQueue(0.9, 0.9) })
    expect(r.modifiers).toHaveLength(0)
  })

  it('보스는 스턴 대신 AP -1 (보스 예외 레이어)', () => {
    const r = roll({ tier: 2, isBoss: true, rng: rngQueue(0.9, 0.05) })
    expect(r.modifiers[0]).toMatchObject({ kind: 'ap_drain', data: { amount: 1 } })
    expect(r.events[0].bossConverted).toBe(true)
  })
})

describe('Ion T3 — 쉴드 무력화기 (기본 30% × 이온 취약도)', () => {
  it('판정 성공 → 쉴드 0% + 재충전 차단 1턴', () => {
    const r = roll({ tier: 3, rng: rngQueue(0.29) })
    expect(r.nullifyShield).toBe(true)
    expect(r.modifiers[0]).toMatchObject({ kind: 'recharge_block', turnsLeft: 1 })
  })

  it('판정 실패 → 아무 효과 없음', () => {
    const r = roll({ tier: 3, rng: rngQueue(0.31) })
    expect(r.nullifyShield).toBe(false)
    expect(r.modifiers).toHaveLength(0)
  })

  it('이온 취약도가 최종 확률을 낮춘다 (0.4 → 12%)', () => {
    // 0.29는 30%면 성공이지만 30%×0.4=12%면 실패
    const r = roll({ tier: 3, ionVulnerability: 0.4, rng: rngQueue(0.29) })
    expect(r.nullifyShield).toBe(false)
    const r2 = roll({ tier: 3, ionVulnerability: 0.4, rng: rngQueue(0.11) })
    expect(r2.nullifyShield).toBe(true)
  })
})

describe('Ion T4 — 피아식별 교란기', () => {
  it('일반 적 → iff_scramble 1턴', () => {
    const r = roll({ tier: 4 })
    expect(r.modifiers[0]).toMatchObject({ kind: 'iff_scramble', turnsLeft: 1 })
  })

  it('보스 → 교란 불가, 약화 디버프로 대체', () => {
    const r = roll({ tier: 4, isBoss: true })
    expect(r.modifiers[0]).toMatchObject({ kind: 'stat', data: { accMod: -20, evaMod: -20 } })
    expect(r.events[0].type).toBe('iff_boss_resist')
  })
})

describe('Ion T5 — 시스템 붕괴 (복합 마비, 전부 확정 금지)', () => {
  it('명중/회피 -70%는 확정, 쉴드 무력화 실패 시 그것만', () => {
    const r = roll({ tier: 5, rng: rngQueue(0.7) })
    expect(r.modifiers).toHaveLength(1)
    expect(r.modifiers[0]).toMatchObject({ id: 'ion_collapse', kind: 'stat', data: { accMod: -70, evaMod: -70 } })
    expect(r.nullifyShield).toBe(false)
  })

  it('쉴드 무력화 성공 + 스턴 성공 → 3중 효과', () => {
    const r = roll({ tier: 5, rng: rngQueue(0.5, 0.2) })
    expect(r.nullifyShield).toBe(true)
    const kinds = r.modifiers.map((m) => m.kind).sort()
    expect(kinds).toEqual(['recharge_block', 'stat', 'stun'])
  })

  it('쉴드 무력화 성공 + 스턴 실패 → 스턴 없음', () => {
    const r = roll({ tier: 5, rng: rngQueue(0.5, 0.9) })
    expect(r.nullifyShield).toBe(true)
    expect(r.modifiers.some((m) => m.kind === 'stun')).toBe(false)
  })

  it('보스는 조건부 스턴도 AP 드레인으로 변환된다', () => {
    const r = roll({ tier: 5, isBoss: true, rng: rngQueue(0.5, 0.2) })
    expect(r.modifiers.some((m) => m.kind === 'stun')).toBe(false)
    expect(r.modifiers.find((m) => m.kind === 'ap_drain')).toMatchObject({ data: { amount: 1 } })
  })
})

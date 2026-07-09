import { describe, it, expect } from 'vitest'
import {
  garrWeakpointArmorMult,
  garrFrontalDamageMult,
  wardenShouldSummonPhase1,
  wardenAoeDamage,
} from '../bossPatterns'

describe('garrWeakpointArmorMult', () => {
  it('측후방(flank) 피격이면 DEF -50% → 0.5 배율', () => {
    expect(garrWeakpointArmorMult({ isFlank: true, cfg: { weakpointDefReductionPct: 50 } })).toBe(0.5)
  })
  it('전면(비flank) 피격이면 배율 1 (약점 없음)', () => {
    expect(garrWeakpointArmorMult({ isFlank: false, cfg: { weakpointDefReductionPct: 50 } })).toBe(1)
  })
  it('감소 100%면 0으로 클램프', () => {
    expect(garrWeakpointArmorMult({ isFlank: true, cfg: { weakpointDefReductionPct: 100 } })).toBe(0)
  })
  it('cfg 없으면 기본 50% 사용', () => {
    expect(garrWeakpointArmorMult({ isFlank: true })).toBe(0.5)
  })
})

describe('garrFrontalDamageMult', () => {
  it('전면(비flank) 대상이면 +30% → 1.3 배율', () => {
    expect(garrFrontalDamageMult({ isFlank: false, cfg: { frontalDamageBonusPct: 30 } })).toBeCloseTo(1.3)
  })
  it('측면(flank) 대상이면 보너스 없음 → 1', () => {
    expect(garrFrontalDamageMult({ isFlank: true, cfg: { frontalDamageBonusPct: 30 } })).toBe(1)
  })
  it('cfg 없으면 기본 30% 사용', () => {
    expect(garrFrontalDamageMult({ isFlank: false })).toBeCloseTo(1.3)
  })
})

describe('wardenShouldSummonPhase1', () => {
  const cfg = { phase1SummonTurn: 2 }
  it('턴 수가 기준 미만이면 false', () => {
    expect(wardenShouldSummonPhase1({ turnNumber: 1, alreadySummoned: false, bossPhase: 1, cfg })).toBe(false)
  })
  it('턴 수가 기준 이상이면 true', () => {
    expect(wardenShouldSummonPhase1({ turnNumber: 2, alreadySummoned: false, bossPhase: 1, cfg })).toBe(true)
    expect(wardenShouldSummonPhase1({ turnNumber: 5, alreadySummoned: false, bossPhase: 1, cfg })).toBe(true)
  })
  it('이미 증원했으면 false', () => {
    expect(wardenShouldSummonPhase1({ turnNumber: 5, alreadySummoned: true, bossPhase: 1, cfg })).toBe(false)
  })
  it('2페이즈면 false (1페이즈 전용)', () => {
    expect(wardenShouldSummonPhase1({ turnNumber: 5, alreadySummoned: false, bossPhase: 2, cfg })).toBe(false)
  })
})

describe('wardenAoeDamage', () => {
  it('ATK 60 × 0.5 → 30', () => {
    expect(wardenAoeDamage({ atk: 60, cfg: { phase2AoeAtkMult: 0.5 } })).toBe(30)
  })
  it('최소 1 보장 (ATK 1 × 0.1 → 1)', () => {
    expect(wardenAoeDamage({ atk: 1, cfg: { phase2AoeAtkMult: 0.1 } })).toBe(1)
  })
  it('cfg 없으면 기본 0.5 배율', () => {
    expect(wardenAoeDamage({ atk: 40 })).toBe(20)
  })
})

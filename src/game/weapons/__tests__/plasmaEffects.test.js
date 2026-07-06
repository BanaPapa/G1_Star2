import { describe, it, expect } from 'vitest'
import { rollPlasmaHit, computeBlastCells, blastMultsForTier } from '../plasmaEffects'
import { tickTurn, sumStat, hasModifier } from '../../systems/unitModifiers'

function rngQueue(...values) {
  const q = [...values]
  return () => (q.length ? q.shift() : 0.999)
}

describe('Plasma T1 — 아머 멜터 (방어력 -30%)', () => {
  it('명중 시 방어력 디버프 1턴 부착', () => {
    const r = rollPlasmaHit({ tier: 1, rng: rngQueue(0.9) })
    expect(r.modifiers).toHaveLength(1)
    expect(r.modifiers[0]).toMatchObject({ id: 'plasma_armor_melt', kind: 'stat', turnsLeft: 1, data: { defPct: -30, atkPct: 0 } })
  })

  it('낮은 확률로 전투 종료까지 지속 (turnsLeft Infinity)', () => {
    const r = rollPlasmaHit({ tier: 1, rng: rngQueue(0.1) })
    expect(r.modifiers[0].turnsLeft).toBe(Infinity)
    expect(r.events[0].permanent).toBe(true)
    // 영구 효과는 틱을 아무리 돌려도 만료되지 않는다
    let list = r.modifiers
    for (let i = 0; i < 5; i++) list = tickTurn(list)
    expect(list).toHaveLength(1)
  })
})

describe('Plasma T2 — 코어 멜터 (방어/공격 -30%)', () => {
  it('방어력과 공격력을 함께 낮춘다', () => {
    const r = rollPlasmaHit({ tier: 2, rng: rngQueue(0.9) })
    expect(r.modifiers[0].data).toEqual({ defPct: -30, atkPct: -30 })
    expect(sumStat(r.modifiers, 'atkPct')).toBe(-30)
  })

  it('수치는 config에서 주입된다', () => {
    const r = rollPlasmaHit({ tier: 2, cfg: { coreMelter: { defPct: -50, atkPct: -10, turns: 2, permanentChance: 0 } }, rng: rngQueue(0.5) })
    expect(r.modifiers[0].data).toEqual({ defPct: -50, atkPct: -10 })
    expect(r.modifiers[0].turnsLeft).toBe(2)
  })
})

describe('Plasma T5 — 아머 애니힐레이터', () => {
  it('일반 적: 아머 무력화(-100% 영구) + 최대 HP -30% (높은 확률)', () => {
    const r = rollPlasmaHit({ tier: 5, rng: rngQueue(0.9) })
    const armor = r.modifiers.find((m) => m.id === 'plasma_annihilator')
    expect(armor).toMatchObject({ turnsLeft: Infinity, data: { defPct: -100 } })
    expect(r.maxHpDamagePct).toBe(30)
    expect(hasModifier(r.modifiers, 'flag')).toBe(true) // 재중첩 방지 플래그
  })

  it('낮은 확률 → 최대 HP -50%', () => {
    const r = rollPlasmaHit({ tier: 5, rng: rngQueue(0.1) })
    expect(r.maxHpDamagePct).toBe(50)
  })

  it('이미 T5를 맞은 대상은 재중첩 불가', () => {
    const r = rollPlasmaHit({ tier: 5, alreadyMaxHpHit: true, rng: rngQueue(0.1) })
    expect(r.modifiers).toHaveLength(0)
    expect(r.maxHpDamagePct).toBe(0)
    expect(r.events[0].type).toBe('annihilate_resist')
  })

  it('보스: 완전 무력화 없음 — 방어도 -50% + 최대 HP -10%', () => {
    const r = rollPlasmaHit({ tier: 5, isBoss: true, rng: rngQueue(0.5, 0.9) })
    const armor = r.modifiers.find((m) => m.id === 'plasma_annihilator')
    expect(armor.data.defPct).toBe(-50) // -100 아님
    expect(r.maxHpDamagePct).toBe(10)
  })

  it('보스 낮은 확률 → 최대 HP -20%', () => {
    const r = rollPlasmaHit({ tier: 5, isBoss: true, rng: rngQueue(0.9, 0.1) })
    expect(r.modifiers.find((m) => m.id === 'plasma_annihilator')).toBeUndefined() // 방어도 감소도 실패
    expect(r.maxHpDamagePct).toBe(20)
  })
})

describe('computeBlastCells — 5×5 폭발 범위', () => {
  const MULTS = [1.0, 0.8, 0.6]

  it('중심 100% / 1칸 80% / 2칸 60% 링 배율', () => {
    const cells = computeBlastCells({ center: { x: 5, y: 5 }, cols: 12, rows: 10, ringMults: MULTS })
    expect(cells).toHaveLength(25)
    const at = (x, y) => cells.find((c) => c.x === x && c.y === y)
    expect(at(5, 5)).toMatchObject({ ring: 0, mult: 1.0 })
    expect(at(6, 5)).toMatchObject({ ring: 1, mult: 0.8 })
    expect(at(6, 6)).toMatchObject({ ring: 1, mult: 0.8 })  // 대각선도 체비쇼프 1
    expect(at(7, 5)).toMatchObject({ ring: 2, mult: 0.6 })
    expect(at(7, 7)).toMatchObject({ ring: 2, mult: 0.6 })
  })

  it('전장 밖 칸은 제외된다', () => {
    const cells = computeBlastCells({ center: { x: 0, y: 0 }, cols: 12, rows: 10, ringMults: MULTS })
    expect(cells).toHaveLength(9) // 3×3만 (음수 좌표 제외)
    expect(cells.every((c) => c.x >= 0 && c.y >= 0)).toBe(true)
  })

  it('티어별 배율: T3 기본 / T4 강화(120/100/80)', () => {
    expect(blastMultsForTier(3)).toEqual([1.0, 0.8, 0.6])
    expect(blastMultsForTier(4)).toEqual([1.2, 1.0, 0.8])
    expect(blastMultsForTier(4, { hellfireMults: [1.5, 1, 0.5] })).toEqual([1.5, 1, 0.5])
  })
})

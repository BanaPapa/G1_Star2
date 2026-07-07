import { describe, it, expect } from 'vitest'
import { repairPlanFor } from '../RepairPanel'

const SHIP = { hp: 100, armorDurability: 60 }
const CFG = { costPerHpSc: 2, costPerArmorDurSc: 1 }

const plan = (entry, capPct = 1, ov = {}) => repairPlanFor(entry, SHIP, ov, CFG, capPct)

describe('repairPlanFor — 수리 산식 (Phase 5-2)', () => {
  it('완전 수리: 손상 전량 회복, 비용 = HP×2 + 내구×1', () => {
    const p = plan({ currentHp: 40, currentArmorDur: 30 })
    expect(p.hpHeal).toBe(60)
    expect(p.durHeal).toBe(30)
    expect(p.cost).toBe(60 * 2 + 30 * 1) // 150
    expect(p.hpTarget).toBe(100)
    expect(p.durTarget).toBe(60)
  })

  it('간이수리 50%: 최대치의 절반까지만 회복', () => {
    const p = plan({ currentHp: 20, currentArmorDur: 10 }, 0.5)
    expect(p.hpTarget).toBe(50)
    expect(p.durTarget).toBe(30)
    expect(p.cost).toBe(30 * 2 + 20 * 1) // 80
  })

  it('간이수리 한도 이상으로 이미 회복돼 있으면 손상 없음 취급', () => {
    const p = plan({ currentHp: 80, currentArmorDur: 50 }, 0.5)
    expect(p.hpHeal).toBe(0)
    expect(p.durHeal).toBe(0)
    expect(p.cost).toBe(0)
  })

  it('무손상(null) 엔트리는 회복량 0', () => {
    const p = plan({ currentHp: null, currentArmorDur: null })
    expect(p.hpHeal).toBe(0)
    expect(p.durHeal).toBe(0)
  })

  it('이월값이 최대치보다 크면(레벨업 등) 최대치로 클램프', () => {
    const p = plan({ currentHp: 150, currentArmorDur: 90 })
    expect(p.curHp).toBe(100)
    expect(p.curDur).toBe(60)
    expect(p.cost).toBe(0)
  })

  it('관제실 override 내구도(ov.armorDurability)가 우선', () => {
    const p = plan({ currentHp: 100, currentArmorDur: 40 }, 1, { armorDurability: 80 })
    expect(p.maxDur).toBe(80)
    expect(p.durHeal).toBe(40)
  })
})

import { describe, it, expect } from 'vitest'
import { startCooldown, tickCooldowns, cooldownLeft } from '../weaponCooldowns'

describe('weaponCooldowns — 발사/틱/조회', () => {
  it('발사 시 슬롯에 쿨다운 부여', () => {
    const cd = startCooldown({}, 'weapon', 2)
    expect(cooldownLeft(cd, 'weapon')).toBe(2)
    expect(cooldownLeft(cd, 'weapon2')).toBe(0)
  })

  it('cooldown 0인 무기는 부여되지 않는다', () => {
    const cd = startCooldown({}, 'weapon', 0)
    expect(cooldownLeft(cd, 'weapon')).toBe(0)
  })

  it('틱마다 1씩 감소, 0이 되면 제거', () => {
    let cd = startCooldown({}, 'weapon', 2)
    cd = tickCooldowns(cd)
    expect(cooldownLeft(cd, 'weapon')).toBe(1)
    cd = tickCooldowns(cd)
    expect(cooldownLeft(cd, 'weapon')).toBe(0)
    expect(cd).toEqual({})
  })

  it('슬롯별 독립 관리 — 무기2 발사가 무기1에 영향 없음', () => {
    let cd = startCooldown({}, 'weapon', 3)
    cd = startCooldown(cd, 'weapon2', 1)
    cd = tickCooldowns(cd)
    expect(cooldownLeft(cd, 'weapon')).toBe(2)
    expect(cooldownLeft(cd, 'weapon2')).toBe(0)
  })

  it('undefined 입력 안전', () => {
    expect(cooldownLeft(undefined, 'weapon')).toBe(0)
    expect(tickCooldowns(undefined)).toEqual({})
    expect(cooldownLeft(startCooldown(undefined, 'weapon', 1), 'weapon')).toBe(1)
  })
})

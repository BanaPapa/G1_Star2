import { describe, it, expect } from 'vitest'
import {
  addModifier,
  sumStat,
  hasModifier,
  consumeApEffects,
  tickTurn,
  modifierIcons,
} from '../unitModifiers'

const jammer = { id: 'ion_jammer', kind: 'stat', turnsLeft: 1, data: { accMod: -30, evaMod: -30 } }

describe('addModifier — 부착·중첩 규칙', () => {
  it('빈 목록에 부착한다', () => {
    const list = addModifier([], jammer)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('ion_jammer')
  })

  it('같은 id 재부착은 중첩 없이 지속턴만 갱신한다', () => {
    let list = addModifier([], { ...jammer, turnsLeft: 1 })
    list = tickTurn(list) // 만료 직전 상태를 만들 수 없으므로 재부착으로 검증
    list = addModifier(addModifier([], jammer), { ...jammer, turnsLeft: 2 })
    expect(list).toHaveLength(1)
    expect(list[0].turnsLeft).toBe(2)
    expect(sumStat(list, 'accMod')).toBe(-30) // -60이 아님 (중첩 금지)
  })

  it('다른 id는 함께 유지된다', () => {
    const collapse = { id: 'ion_collapse', kind: 'stat', turnsLeft: 1, data: { accMod: -70, evaMod: -70 } }
    const list = addModifier(addModifier([], jammer), collapse)
    expect(list).toHaveLength(2)
    expect(sumStat(list, 'accMod')).toBe(-100)
  })
})

describe('sumStat / hasModifier', () => {
  it('stat 이외의 kind는 합산에서 제외한다', () => {
    const list = [jammer, { id: 's', kind: 'stun' }, { id: 'd', kind: 'ap_drain', data: { amount: 2 } }]
    expect(sumStat(list, 'accMod')).toBe(-30)
    expect(sumStat(list, 'evaMod')).toBe(-30)
    expect(hasModifier(list, 'stun')).toBe(true)
    expect(hasModifier(list, 'iff_scramble')).toBe(false)
  })

  it('빈/누락 목록은 0', () => {
    expect(sumStat(undefined, 'accMod')).toBe(0)
    expect(hasModifier(null, 'stun')).toBe(false)
  })
})

describe('consumeApEffects — 원샷 AP 효과 소비', () => {
  it('스턴이 있으면 stunned=true이고 소비 후 제거된다', () => {
    const list = [jammer, { id: 's', kind: 'stun' }]
    const r = consumeApEffects(list)
    expect(r.stunned).toBe(true)
    expect(r.remaining).toHaveLength(1)
    expect(r.remaining[0].id).toBe('ion_jammer')
  })

  it('AP 드레인은 amount 합산 후 제거된다', () => {
    const list = [{ id: 'd', kind: 'ap_drain', data: { amount: 2 } }]
    const r = consumeApEffects(list)
    expect(r.stunned).toBe(false)
    expect(r.apDrain).toBe(2)
    expect(r.remaining).toHaveLength(0)
  })

  it('효과가 없으면 아무 일도 없다', () => {
    const r = consumeApEffects([jammer])
    expect(r.stunned).toBe(false)
    expect(r.apDrain).toBe(0)
    expect(r.remaining).toHaveLength(1)
  })
})

describe('tickTurn — 자기 페이즈 종료 시 지속턴 감소', () => {
  it('turnsLeft 1 → 만료 제거', () => {
    expect(tickTurn([jammer])).toHaveLength(0)
  })

  it('turnsLeft 2 → 1로 감소하고 유지', () => {
    const list = tickTurn([{ ...jammer, turnsLeft: 2 }])
    expect(list).toHaveLength(1)
    expect(list[0].turnsLeft).toBe(1)
  })

  it('원샷(stun/ap_drain)은 틱의 영향을 받지 않는다', () => {
    const list = tickTurn([{ id: 's', kind: 'stun' }, { id: 'd', kind: 'ap_drain', data: { amount: 2 } }])
    expect(list).toHaveLength(2)
  })

  it('iff_scramble/recharge_block도 지속형으로 만료된다', () => {
    const list = tickTurn([
      { id: 'iff', kind: 'iff_scramble', turnsLeft: 1 },
      { id: 'rb', kind: 'recharge_block', turnsLeft: 2 },
    ])
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('rb')
  })
})

describe('modifierIcons', () => {
  it('kind별 아이콘을 중복 없이 이어붙인다', () => {
    const list = [jammer, { id: 'x', kind: 'stat', data: {} }, { id: 'iff', kind: 'iff_scramble', turnsLeft: 1 }]
    expect(modifierIcons(list)).toBe('📡🔀')
  })
})

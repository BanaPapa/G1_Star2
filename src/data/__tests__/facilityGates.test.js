import { describe, it, expect } from 'vitest'
import { researchRequiredTier, recipeRequiredTier } from '../facilityGates'
import { DEFAULT_GAME_CONFIG as defaultGameConfig } from '../defaultGameConfig'

describe('researchRequiredTier — 연구소 레벨 게이트 (Phase 5-4)', () => {
  it('weaponTierByResearch에 등록된 노드는 해당 티어를 요구한다', () => {
    expect(researchRequiredTier('weapon_eng_1', defaultGameConfig)).toBe(2)
    expect(researchRequiredTier('weapon_eng_adv', defaultGameConfig)).toBe(3)
    expect(researchRequiredTier('weapon_eng_4', defaultGameConfig)).toBe(4)
    expect(researchRequiredTier('weapon_eng_5', defaultGameConfig)).toBe(5)
  })

  it('미등록 노드(방어공학 등)는 Tier 1 — 연구소 Lv1부터 가능', () => {
    expect(researchRequiredTier('defense_eng_1', defaultGameConfig)).toBe(1)
    expect(researchRequiredTier('없는_노드', defaultGameConfig)).toBe(1)
  })

  it('config 누락 시에도 Tier 1로 안전 폴백', () => {
    expect(researchRequiredTier('weapon_eng_5', undefined)).toBe(1)
    expect(researchRequiredTier('weapon_eng_5', {})).toBe(1)
  })

  it('관제실 override로 매핑을 바꾸면 그 값을 따른다', () => {
    const config = { combat: { weaponTierByResearch: { weapon_eng_1: 1 } } }
    expect(researchRequiredTier('weapon_eng_1', config)).toBe(1)
  })
})

describe('recipeRequiredTier — 워크샵 레벨 게이트 (Phase 5-4)', () => {
  const itemsById = new Map([
    ['wpn_hellfire_burst', { id: 'wpn_hellfire_burst', tier: 4 }],
    ['shield_gen', { id: 'shield_gen' }], // 모듈: tier 없음
  ])

  it('결과물 아이템의 tier를 요구 레벨로 쓴다', () => {
    expect(recipeRequiredTier({ result: 'wpn_hellfire_burst' }, itemsById)).toBe(4)
  })

  it('tier 없는 아이템(모듈)·미등록 결과물은 Tier 1', () => {
    expect(recipeRequiredTier({ result: 'shield_gen' }, itemsById)).toBe(1)
    expect(recipeRequiredTier({ result: '없는_아이템' }, itemsById)).toBe(1)
    expect(recipeRequiredTier({ result: 'x' }, undefined)).toBe(1)
  })
})

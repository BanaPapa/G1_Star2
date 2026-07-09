import { describe, it, expect } from 'vitest'
import items from '../items.json'
import shops from '../shops.json'
import research from '../research.json'
import resources from '../resources.json'

// 유효 아이템 id 집합 (무기 + 모듈 + 소모품 + 유니크)
const itemIds = new Set([
  ...items.weapons.map((w) => w.id),
  ...items.modules.map((m) => m.id),
  ...items.consumables.map((c) => c.id),
  ...items.uniques.map((u) => u.id),
])

// 무기 id → tier 조회 맵
const weaponTier = new Map(items.weapons.map((w) => [w.id, w.tier]))

// 무기 id → family 조회 맵
const weaponFamily = new Map(items.weapons.map((w) => [w.id, w.family]))

// 유효 자원 id 집합
const resourceIds = new Set(resources.resources.map((r) => r.id))
const EXPECTED_RESOURCES = new Set(['sc', 'ti', 'ec', 'dm', 'nc', 'qd'])

// 연구 노드 id 집합
const researchIds = new Set(research.research.map((n) => n.id))

const recipes = items.recipes

describe('recipes 정합성 (Phase 7-4)', () => {
  it('모든 recipe.result가 유효 아이템 id에 존재한다', () => {
    for (const r of recipes) {
      expect(itemIds.has(r.result), `${r.id} → ${r.result}`).toBe(true)
    }
  })

  it('모든 recipe.materials 키가 유효 자원 id이고 값이 > 0이다', () => {
    for (const r of recipes) {
      const keys = Object.keys(r.materials)
      expect(keys.length, `${r.id} materials 비어있음`).toBeGreaterThan(0)
      for (const [res, amount] of Object.entries(r.materials)) {
        expect(resourceIds.has(res), `${r.id} 자원 ${res}`).toBe(true)
        expect(EXPECTED_RESOURCES.has(res), `${r.id} 자원 ${res}`).toBe(true)
        expect(typeof amount, `${r.id} 자원 ${res} 수량 타입`).toBe('number')
        expect(amount, `${r.id} 자원 ${res} 수량`).toBeGreaterThan(0)
      }
    }
  })

  it('requires가 있으면 research 노드 id에 존재한다', () => {
    for (const r of recipes) {
      if (r.requires) {
        expect(researchIds.has(r.requires), `${r.id} requires ${r.requires}`).toBe(true)
      }
    }
  })

  it('모든 recipe.result 무기의 tier가 4 이하다 (조합은 T4까지 — T5 제외)', () => {
    for (const r of recipes) {
      const tier = weaponTier.get(r.result)
      // 무기가 아닌 result(모듈 등)는 tier 미정의 → 통과
      if (tier !== undefined) {
        expect(tier, `${r.id} → ${r.result} tier`).toBeLessThanOrEqual(4)
      }
    }
  })

  it('recipe.id가 유일하다', () => {
    const ids = recipes.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('5개 무기 계열 각각 craft 가능한 무기 result가 1개 이상 존재한다', () => {
    const families = ['laser', 'ion', 'plasma', 'gravity', 'antimatter']
    const covered = new Set()
    for (const r of recipes) {
      const fam = weaponFamily.get(r.result)
      if (fam) covered.add(fam)
    }
    for (const fam of families) {
      expect(covered.has(fam), `계열 ${fam} 미커버`).toBe(true)
    }
  })
})

describe('shops 재고 정합성 (Phase 7-4)', () => {
  it('모든 shop.inventory 아이템 id가 유효 아이템에 존재한다', () => {
    for (const shop of shops.shops) {
      const inv = shop.inventory || []
      for (const id of inv) {
        expect(itemIds.has(id), `${shop.id} inventory ${id}`).toBe(true)
      }
    }
  })

  it('shop.expands.add 아이템 id도 유효 아이템에 존재한다', () => {
    for (const shop of shops.shops) {
      for (const exp of shop.expands || []) {
        for (const id of exp.add || []) {
          expect(itemIds.has(id), `${shop.id} expands ${id}`).toBe(true)
        }
      }
    }
  })
})

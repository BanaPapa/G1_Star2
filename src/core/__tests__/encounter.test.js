// 적 편성 합성(encounter.js) + 적 무기 데이터 정합성 (Phase 7-2)
import { describe, it, expect } from 'vitest'
import { buildEncounterPlacements } from '../encounter'
import enemiesData from '../../data/enemies.json'
import systemsData from '../../data/systems.json'
import itemsData from '../../data/items.json'
import shipsData from '../../data/ships.json'

const enemiesById = new Map(enemiesData.enemies.map((e) => [e.id, e]))
const bossesById  = new Map(enemiesData.bosses.map((b) => [b.id, b]))
const shipsById   = new Map(shipsData.ships.map((s) => [s.id, s]))
const weaponIds   = new Set(itemsData.weapons.map((w) => w.id))
const positions   = Array.from({ length: 12 }, (_, i) => ({ x: 10 + (i % 3), y: i }))

describe('적 무기 데이터 정합성 (Phase 7-2)', () => {
  it('enemies/bosses의 weapon id가 전부 items.json 무기에 존재한다', () => {
    for (const def of [...enemiesData.enemies, ...enemiesData.bosses]) {
      if (def.weapon != null) {
        expect(weaponIds.has(def.weapon), `${def.id}: ${def.weapon}`).toBe(true)
      }
    }
  })

  it('Gravity/Antimatter 계열을 쓰는 적이 각각 1종 이상 있다', () => {
    const familyOf = new Map(itemsData.weapons.map((w) => [w.id, w.family]))
    const families = new Set(
      enemiesData.enemies.filter((e) => e.weapon).map((e) => familyOf.get(e.weapon)),
    )
    expect(families.has('gravity')).toBe(true)
    expect(families.has('antimatter')).toBe(true)
  })

  it('systems.json의 enemy/miniboss/boss id가 전부 enemies.json에 존재한다', () => {
    for (const sys of systemsData.systems) {
      for (const id of sys.enemy ?? []) {
        expect(enemiesById.has(id), `${sys.id}: ${id}`).toBe(true)
      }
      if (sys.miniboss) expect(bossesById.has(sys.miniboss), `${sys.id}: ${sys.miniboss}`).toBe(true)
      if (sys.boss) expect(bossesById.has(sys.boss), `${sys.id}: ${sys.boss}`).toBe(true)
    }
  })

  it('성계별 적 조합이 서로 다르다 (차별화)', () => {
    const comps = systemsData.systems
      .filter((s) => (s.enemy ?? []).length > 0)
      .map((s) => [...s.enemy].sort().join(','))
    expect(new Set(comps).size).toBe(comps.length)
  })
})

describe('buildEncounterPlacements — weapon 통과', () => {
  it('base 참조형 적의 ship에 weapon이 실린다', () => {
    const node = systemsData.systems.find((s) => s.id === 's3')
    const placements = buildEncounterPlacements(node, { enemiesById, bossesById, shipsById, positions })
    expect(placements.length).toBe(node.enemy.length)
    const graviton = placements.find((p) => p.ship.id === 'void_graviton')
    expect(graviton?.ship.weapon).toBe('wpn_spatial_displacer')
  })

  it('stats 명시형(unique)·보스의 ship에도 weapon이 실린다', () => {
    const node = systemsData.systems.find((s) => s.id === 's4')
    const placements = buildEncounterPlacements(node, { enemiesById, bossesById, shipsById, positions })
    const warden = placements.find((p) => p.ship.id === 'warden')
    expect(warden?.ship.weapon).toBe('wpn_antimatter_field')
    const thornNode = systemsData.systems.find((s) => s.id === 's2')
    const thorn = buildEncounterPlacements(thornNode, { enemiesById, bossesById, shipsById, positions })
      .find((p) => p.ship.id === 'void_thorn')
    expect(thorn?.ship.weapon).toBe('wpn_graviton_ram')
  })

  it('weapon 없는 적(void_drone)은 weapon null', () => {
    const node = systemsData.systems.find((s) => s.id === 's3')
    const placements = buildEncounterPlacements(node, { enemiesById, bossesById, shipsById, positions })
    const drone = placements.find((p) => p.ship.id === 'void_drone')
    expect(drone?.ship.weapon).toBeNull()
  })
})

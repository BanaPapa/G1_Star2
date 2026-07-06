import { describe, it, expect } from 'vitest'
import { getPlaceFacilities } from '../placeFacilities'

const homeNode   = { id: 's0', role: 'home' }
const colonyNode = { id: 's1', role: 'mission' }

// getLevel(nodeId, buildingId) 형태의 스텁 — 주어진 맵의 레벨만 반환
function levelsOf(map) {
  return (nodeId, buildingId) => map[buildingId] ?? 0
}

describe('getPlaceFacilities', () => {
  it('모항: 본부 건물 Lv1 기준으로 build/research/shop/craft/shipyard 탭 제공', () => {
    const getLevel = levelsOf({
      bld_command_center: 1, bld_research_lab: 1, bld_workshop: 1, bld_shipyard: 1,
    })
    expect(getPlaceFacilities(homeNode, getLevel, {})).toEqual(
      ['build', 'research', 'shop', 'craft', 'shipyard']
    )
  })

  it('점령 행성: 아웃포스트 Lv1이면 build/repair', () => {
    const getLevel = levelsOf({ bld_outpost: 1 })
    expect(getPlaceFacilities(colonyNode, getLevel, {})).toEqual(['build', 'repair'])
  })

  it('건물이 없으면 build 탭만 남는다', () => {
    expect(getPlaceFacilities(colonyNode, levelsOf({}), {})).toEqual(['build'])
  })

  it('관제실 override로 providesFacility를 바꿀 수 있다', () => {
    const config = { overrides: { buildings: { bld_outpost: { providesFacility: 'shop' } } } }
    expect(getPlaceFacilities(colonyNode, levelsOf({ bld_outpost: 1 }), config)).toEqual(['build', 'shop'])
  })

  it('node가 null이면 빈 배열', () => {
    expect(getPlaceFacilities(null, levelsOf({}), {})).toEqual([])
  })
})

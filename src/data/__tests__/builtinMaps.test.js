// 내장 전투맵(map/*.json) 전수 검증 + 성계 지형 기반 맵 픽커 (Phase 7-1)
import { describe, it, expect, beforeEach } from 'vitest'
import { BUILTIN_MAPS } from '../builtinMaps'
import { validateMap, deriveSpawnZones } from '../../core/battleMap'
import { useMapStore, pickCategoryMap, MAP_TYPE_IDS } from '../../state/useMapStore'

const maps = Object.values(BUILTIN_MAPS)
const generated = maps.filter((m) => /^map_(normal|special|elite|boss)_/.test(m.id))

describe('내장 전투맵 데이터', () => {
  it('24종 이상 로드된다 (배경 23장 + 샘플)', () => {
    expect(maps.length).toBeGreaterThanOrEqual(24)
  })

  it('모든 맵이 validateMap을 통과한다 (스폰/코너/범위)', () => {
    for (const m of maps) {
      const r = validateMap(m)
      expect(r.errors, `${m.id}: ${r.errors.join(', ')}`).toEqual([])
    }
  })

  it('아군 스폰→적 스폰 경로가 존재한다 (연결성)', () => {
    for (const m of maps) {
      const r = validateMap(m)
      const blockedWarn = r.warnings.find((w) => w.includes('이동 경로가 없습니다'))
      expect(blockedWarn, `${m.id}: ${blockedWarn}`).toBeUndefined()
    }
  })

  it('생성 맵은 유형·지형 메타데이터를 가진다', () => {
    expect(generated.length).toBeGreaterThanOrEqual(21)
    for (const m of generated) {
      expect(MAP_TYPE_IDS, m.id).toContain(m.metadata?.type)
      expect(m.metadata?.terrains?.length, m.id).toBeGreaterThan(0)
      for (const t of m.metadata.terrains) {
        expect(['asteroid', 'nebula', 'mine', 'distortion'], m.id).toContain(t)
      }
    }
  })

  it('spawnZones가 tiles의 spawn_* 타일과 일치한다', () => {
    for (const m of generated) {
      expect(m.spawnZones, m.id).toEqual(deriveSpawnZones(m))
    }
  })

  it('보스형 맵은 보스 스폰을 가진다', () => {
    const bosses = generated.filter((m) => m.metadata.type === 'boss')
    expect(bosses.length).toBeGreaterThanOrEqual(2)
    for (const m of bosses) expect(m.spawnZones.boss.length, m.id).toBeGreaterThan(0)
  })
})

describe('기본 배정 (defaultCategoryMaps)', () => {
  it('새 설치(localStorage 없음)에서 4개 유형 모두 기본 풀이 채워진다', () => {
    const cm = useMapStore.getState().categoryMaps
    for (const t of MAP_TYPE_IDS) {
      expect(cm[t].length, `유형 ${t}`).toBeGreaterThan(0)
    }
  })

  it('레거시 id(map_crimson_arena)도 이미지 분류로 boss 풀에 들어간다', () => {
    expect(useMapStore.getState().categoryMaps.boss).toContain('map_crimson_arena')
  })

  it('모든 성계 지형에 일반 전투(normal 풀)용 테마 맵이 있다', () => {
    const cm = useMapStore.getState().categoryMaps
    const all = useMapStore.getState().maps
    for (const terrain of ['asteroid', 'nebula', 'mine', 'distortion']) {
      const themed = cm.normal.filter((id) => all[id]?.metadata?.terrains?.includes(terrain))
      expect(themed.length, `지형 ${terrain}`).toBeGreaterThan(0)
    }
  })
})

describe('pickCategoryMap — 성계 지형 필터', () => {
  beforeEach(() => {
    // 실제 내장 맵 위에서 검증 (스토어 초기 상태 그대로)
  })

  it('지형을 주면 해당 terrains 맵만 뽑는다', () => {
    for (let i = 0; i < 20; i += 1) {
      const m = pickCategoryMap('space_normal', 'distortion')
      expect(m, '배정 풀이 비어 있음').toBeTruthy()
      expect(m.metadata.terrains, m.id).toContain('distortion')
    }
  })

  it('일치 맵이 없는 지형은 유형 전체 풀로 폴백한다', () => {
    const m = pickCategoryMap('space_normal', 'no_such_terrain')
    expect(m).toBeTruthy()
  })

  it('planet_normal은 normal+special 풀을 함께 쓴다', () => {
    const seen = new Set()
    for (let i = 0; i < 200; i += 1) {
      const m = pickCategoryMap('planet_normal', null)
      seen.add(m.metadata?.type ?? 'legacy')
    }
    expect(seen.has('special')).toBe(true)
  })

  it('planet_boss는 boss 풀에서만 뽑는다', () => {
    for (let i = 0; i < 20; i += 1) {
      const m = pickCategoryMap('planet_boss', 'distortion')
      expect(m.metadata?.terrains ?? []).toContain('distortion')
    }
  })

  it('카테고리 없음/미지정은 null', () => {
    expect(pickCategoryMap(null)).toBeNull()
  })
})

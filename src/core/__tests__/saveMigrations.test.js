// 세이브 스키마 마이그레이션 (Phase 11-1)
import { describe, it, expect } from 'vitest'
import { migrateSave, SAVE_SCHEMA_VERSION } from '../saveMigrations'

describe('migrateSave — 버전 없는 v1 세이브', () => {
  it('필드 일부가 누락된 v1 세이브를 v2로 채우고, 원본을 변형하지 않는다', () => {
    const v1 = {
      timestamp: 123,
      progress: { currentNodeId: 'n1', conqueredNodeIds: ['n1'] }, // 나머지 누락
      fleet: { roster: [{ id: 's1' }] }, // ownedItems 누락
      resources: { wallet: { sc: 10 } },
      // research / development / story 전부 누락
    }
    const snapshot = JSON.stringify(v1)

    const result = migrateSave(v1)

    expect(result.ok).toBe(true)
    expect(result.fromVersion).toBe(1)
    expect(result.data.schemaVersion).toBe(2)

    // 누락 필드가 기본값으로 채워짐
    expect(result.data.progress.miningDeposits).toEqual({})
    expect(result.data.progress.obtainedHiddens).toEqual([])
    expect(result.data.progress.recruitedAces).toEqual([])
    expect(result.data.progress.fleetPos).toBeNull()
    expect(result.data.fleet.ownedItems).toEqual({})
    expect(result.data.research.unlockedIds).toEqual([])
    expect(result.data.development.developed).toEqual([])
    expect(result.data.story.seenIds).toEqual([])
    expect(result.data.story.choices).toEqual({})

    // 보존돼야 할 값
    expect(result.data.progress.currentNodeId).toBe('n1')
    expect(result.data.progress.conqueredNodeIds).toEqual(['n1'])
    expect(result.data.fleet.roster).toEqual([{ id: 's1' }])
    expect(result.data.resources.wallet).toEqual({ sc: 10 })

    // 원본 불변
    expect(JSON.stringify(v1)).toBe(snapshot)
    expect(result.data).not.toBe(v1)
  })

  it('buildings가 없으면 undefined로 남긴다(load의 존재 분기가 처리)', () => {
    const result = migrateSave({ timestamp: 1, progress: {}, fleet: {}, resources: { wallet: {} } })
    expect(result.ok).toBe(true)
    expect(result.data.buildings).toBeUndefined()
  })

  it('buildings가 있으면 그대로 통과시킨다', () => {
    const buildings = { buildings: [{ id: 'b1' }], uniqueResources: {} }
    const result = migrateSave({ progress: {}, fleet: {}, resources: { wallet: {} }, buildings })
    expect(result.ok).toBe(true)
    expect(result.data.buildings).toEqual(buildings)
  })
})

describe('migrateSave — 현재 버전', () => {
  it('현재 스키마 버전 세이브는 그대로 통과한다', () => {
    const current = { schemaVersion: SAVE_SCHEMA_VERSION, timestamp: 1, progress: {}, fleet: {} }
    const result = migrateSave(current)
    expect(result.ok).toBe(true)
    expect(result.fromVersion).toBe(SAVE_SCHEMA_VERSION)
    expect(result.data).toBe(current) // 동일 참조
  })
})

describe('migrateSave — 미래 버전', () => {
  it('상위 버전 세이브는 newer로 거부한다', () => {
    const future = { schemaVersion: 99, progress: {} }
    const result = migrateSave(future)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('newer')
    expect(result.fromVersion).toBe(99)
  })
})

describe('migrateSave — 손상 입력', () => {
  it('null은 corrupt', () => {
    expect(migrateSave(null)).toEqual({ ok: false, reason: 'corrupt', fromVersion: null })
  })

  it('문자열은 corrupt', () => {
    const result = migrateSave('nope')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('corrupt')
  })

  it('배열은 corrupt', () => {
    const result = migrateSave([])
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('corrupt')
  })

  it('schemaVersion이 숫자가 아니면 corrupt', () => {
    const result = migrateSave({ schemaVersion: 'x', progress: {} })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('corrupt')
  })
})

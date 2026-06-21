import { describe, it, expect } from 'vitest'
import {
  createMapDefinition, gridToScreen, screenToGrid, getTileCenter,
  withTile, getTileType, tileExists, isTilePlayable, isTileBlocked, isTileVoid,
  addLine, removeLine, lineRemovalImpact, deriveSpawnZones, validateMap, hasPathBetween,
  getCellVectors, gridCenter, resizeGridKeepingCell, rotateGrid, scaleGrid, setGridResolution,
} from '../battleMap'

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

function makeMap() {
  return createMapDefinition({ id: 'm1', name: 'Test', cols: 20, rows: 16, imageSize: { width: 2560, height: 1440 } })
}

describe('battleMap 좌표 변환', () => {
  it('gridToScreen/screenToGrid 왕복이 일치한다', () => {
    const m = makeMap()
    for (const [tx, ty] of [[0, 0], [5, 3], [19, 15], [10, 8]]) {
      const c = getTileCenter(m, tx, ty)
      const g = screenToGrid(m, c.x, c.y)
      expect(g.tileX).toBe(tx)
      expect(g.tileY).toBe(ty)
    }
  })

  it('네 꼭짓점이 grid 격자점과 매핑된다', () => {
    const m = makeMap()
    const top = gridToScreen(m, 0, 0)
    expect(top.x).toBeCloseTo(m.grid.corners.top.x)
    expect(top.y).toBeCloseTo(m.grid.corners.top.y)
    const right = gridToScreen(m, m.grid.cols, 0)
    expect(right.x).toBeCloseTo(m.grid.corners.right.x)
  })
})

describe('battleMap 타일 유틸', () => {
  it('default가 playable이고 override로 void/blocked 지정된다', () => {
    let m = makeMap()
    expect(getTileType(m, 2, 2)).toBe('playable')
    expect(isTilePlayable(m, 2, 2)).toBe(true)
    expect(tileExists(m, 2, 2)).toBe(true)
    m = withTile(m, 2, 2, 'void')
    expect(isTileVoid(m, 2, 2)).toBe(true)
    expect(tileExists(m, 2, 2)).toBe(false)
    m = withTile(m, 3, 3, 'blocked')
    expect(isTileBlocked(m, 3, 3)).toBe(true)
    expect(isTilePlayable(m, 3, 3)).toBe(false)
  })

  it('default와 같은 타입 지정 시 override가 제거된다', () => {
    let m = makeMap()
    m = withTile(m, 1, 1, 'void')
    expect(Object.keys(m.tiles.overrides)).toContain('1,1')
    m = withTile(m, 1, 1, 'playable')
    expect(Object.keys(m.tiles.overrides)).not.toContain('1,1')
  })

  it('범위 밖 좌표는 void/불가로 처리된다', () => {
    const m = makeMap()
    expect(getTileType(m, -1, 0)).toBe('void')
    expect(tileExists(m, 100, 100)).toBe(false)
    expect(isTilePlayable(m, -1, -1)).toBe(false)
  })
})

describe('battleMap 줄 추가/삭제', () => {
  it('오른쪽 줄 추가 시 cols가 1 증가하고 새 줄이 채워진다', () => {
    const m0 = makeMap()
    const m = addLine(m0, 'right', 'playable')
    expect(m.grid.cols).toBe(m0.grid.cols + 1)
    expect(getTileType(m, m0.grid.cols, 0)).toBe('playable')
  })

  it('위쪽 줄 추가 시 기존 타일이 아래로 이동한다', () => {
    let m = makeMap()
    m = withTile(m, 5, 0, 'spawn_player')
    const added = addLine(m, 'top', 'void')
    expect(added.grid.rows).toBe(m.grid.rows + 1)
    expect(getTileType(added, 5, 1)).toBe('spawn_player')
  })

  it('삭제 영향 계산이 가장자리 타일/오브젝트를 센다', () => {
    let m = makeMap()
    m = withTile(m, 0, 0, 'spawn_player')
    m = withTile(m, 0, 5, 'blocked')
    const impact = lineRemovalImpact(m, 'left')
    expect(impact.tiles).toBe(2)
  })

  it('마지막 한 줄은 삭제되지 않는다', () => {
    let m = createMapDefinition({ cols: 1, rows: 1 })
    const r = removeLine(m, 'left')
    expect(r.grid.cols).toBe(1)
  })
})

describe('battleMap 스폰/검증', () => {
  it('spawn_* 타일에서 spawnZones가 파생된다', () => {
    let m = makeMap()
    m = withTile(m, 2, 12, 'spawn_player')
    m = withTile(m, 3, 12, 'spawn_player')
    m = withTile(m, 17, 3, 'spawn_enemy')
    const z = deriveSpawnZones(m)
    expect(z.player).toHaveLength(2)
    expect(z.enemy).toHaveLength(1)
  })

  it('스폰이 없으면 검증 오류가 난다', () => {
    const m = makeMap()
    const v = validateMap(m)
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.includes('아군'))).toBe(true)
  })

  it('연결된 playable 경로를 BFS로 찾는다', () => {
    let m = createMapDefinition({ cols: 5, rows: 1 })
    for (let x = 0; x < 5; x += 1) m = withTile(m, x, 0, 'playable')
    expect(hasPathBetween(m, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true)
    m = withTile(m, 2, 0, 'void') // 가운데 끊기
    expect(hasPathBetween(m, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false)
  })
})

describe('battleMap 그리드 변형', () => {
  it('칸 수를 바꿔도 1칸 크기가 동일하다(셀이 작아지지 않음)', () => {
    const m = makeMap()
    const before = getCellVectors(m.grid)
    for (const [cols, rows] of [[24, 18], [8, 6], [40, 30]]) {
      const r = resizeGridKeepingCell(m, cols, rows)
      expect(r.grid.cols).toBe(cols)
      expect(r.grid.rows).toBe(rows)
      const after = getCellVectors(r.grid)
      expect(after.col.x).toBeCloseTo(before.col.x, 6)
      expect(after.col.y).toBeCloseTo(before.col.y, 6)
      expect(after.row.x).toBeCloseTo(before.row.x, 6)
      expect(after.row.y).toBeCloseTo(before.row.y, 6)
    }
  })

  it('resize는 중심을 유지한다', () => {
    const m = makeMap()
    const c0 = gridCenter(m.grid)
    const r = resizeGridKeepingCell(m, 30, 24)
    const c1 = gridCenter(r.grid)
    expect(c1.x).toBeCloseTo(c0.x, 6)
    expect(c1.y).toBeCloseTo(c0.y, 6)
  })

  it('회전은 각도만 바꾸고 셀 크기(꼭짓점 간 거리)를 보존한다', () => {
    const m = makeMap()
    const C0 = m.grid.corners
    const d0 = { tr: dist(C0.top, C0.right), rb: dist(C0.right, C0.bottom), bl: dist(C0.bottom, C0.left), lt: dist(C0.left, C0.top) }
    const r = rotateGrid(m, Math.PI / 6)
    const C1 = r.grid.corners
    expect(dist(C1.top, C1.right)).toBeCloseTo(d0.tr, 6)
    expect(dist(C1.right, C1.bottom)).toBeCloseTo(d0.rb, 6)
    expect(dist(C1.bottom, C1.left)).toBeCloseTo(d0.bl, 6)
    expect(dist(C1.left, C1.top)).toBeCloseTo(d0.lt, 6)
    // 중심은 불변
    expect(gridCenter(r.grid).x).toBeCloseTo(gridCenter(m.grid).x, 6)
    // 실제로 회전이 일어났다(top이 이동)
    expect(dist(C1.top, C0.top)).toBeGreaterThan(1)
  })

  it('scaleGrid는 셀 크기를 factor배로 균일 변경한다', () => {
    const m = makeMap()
    const b = getCellVectors(m.grid)
    const r = scaleGrid(m, 2)
    const a = getCellVectors(r.grid)
    expect(a.col.x).toBeCloseTo(b.col.x * 2, 6)
    expect(a.row.y).toBeCloseTo(b.row.y * 2, 6)
  })

  it('setGridResolution은 footprint(corners)는 유지하고 칸 수만 줄여 셀을 키운다', () => {
    const m = makeMap() // 20x16
    const C0 = m.grid.corners
    const r = setGridResolution(m, 10, 8)
    expect(r.grid.cols).toBe(10)
    expect(r.grid.rows).toBe(8)
    // corners(픽셀 footprint)는 불변
    expect(r.grid.corners.top.x).toBeCloseTo(C0.top.x, 6)
    expect(r.grid.corners.right.y).toBeCloseTo(C0.right.y, 6)
    // 칸 수가 절반 → 셀 벡터(1칸 픽셀 크기)는 2배
    const before = getCellVectors(m.grid), after = getCellVectors(r.grid)
    expect(Math.hypot(after.col.x, after.col.y)).toBeCloseTo(Math.hypot(before.col.x, before.col.y) * 2, 4)
  })

  it('setGridResolution은 스폰 페인트를 비례 리맵해 형태를 보존하고 범위를 넘지 않는다', () => {
    let m = makeMap() // 20x16
    m = withTile(m, 0, 0, 'spawn_player')
    m = withTile(m, 19, 15, 'spawn_enemy')
    const r = setGridResolution(m, 10, 8)
    const zones = deriveSpawnZones(r)
    expect(zones.player.length).toBe(1)
    expect(zones.enemy.length).toBe(1)
    for (const side of ['player', 'enemy']) for (const c of zones[side]) {
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThan(10)
      expect(c.y).toBeGreaterThanOrEqual(0); expect(c.y).toBeLessThan(8)
    }
    // 좌상단/우하단 스폰이 새 그리드의 양 끝쪽에 유지된다
    expect(zones.player[0].x).toBeLessThan(zones.enemy[0].x)
  })
})

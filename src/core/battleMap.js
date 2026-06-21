// 전투맵 데이터 모델 + 순수 좌표/타일 유틸리티 (Battle Map Editor & 전투 통합 공용).
// 렌더러(Phaser/Canvas)에 의존하지 않는다 — 모든 좌표는 "이미지 픽셀 공간" 기준.
//
// mapDefinition 구조:
// {
//   id, name, background, imageSize:{width,height},
//   grid: { type:'isometric', cols, rows, corners:{ top,right,bottom,left } },   // corners는 이미지 픽셀 좌표
//   tiles: { default:'void', overrides:{ "x,y": type } },
//   spawnZones: { player:[{x,y}], enemy:[...], neutral:[...], boss:[...] },        // tiles에서 파생(저장 시 동기화)
//   objects: [{ id, assetKey, tileX, tileY, size:{w,h}, rotation, blocksMovement, providesCover, destructible }],
//   metadata: { biome, difficulty }
// }

export const MAP_SCHEMA_VERSION = 1

// ── 타일 타입 정의 (오버레이 색은 에디터/전투 공용) ─────────────────────
export const TILE_TYPES = {
  playable:      { id: 'playable',      label: '이동 가능',  color: '#3ad6c4', passable: true,  spawnable: true,  exists: true },
  void:          { id: 'void',          label: '빈 공간',    color: '#1c2230', passable: false, spawnable: false, exists: false },
  blocked:       { id: 'blocked',       label: '장애물',     color: '#e8843a', passable: false, spawnable: false, exists: true },
  spawn_player:  { id: 'spawn_player',  label: '아군 스폰',  color: '#4f9bff', passable: true,  spawnable: true,  exists: true, spawnSide: 'player' },
  spawn_enemy:   { id: 'spawn_enemy',   label: '적 스폰',    color: '#e23b4e', passable: true,  spawnable: true,  exists: true, spawnSide: 'enemy' },
  // 확장 타입
  hazard:        { id: 'hazard',        label: '위험 지대',  color: '#c850e0', passable: true,  spawnable: false, exists: true },
  spawn_neutral: { id: 'spawn_neutral', label: '중립 스폰',  color: '#9aa6c8', passable: true,  spawnable: true,  exists: true, spawnSide: 'neutral' },
  spawn_boss:    { id: 'spawn_boss',    label: '보스 스폰',  color: '#ffb020', passable: true,  spawnable: true,  exists: true, spawnSide: 'boss' },
  objective:     { id: 'objective',     label: '목표 지점',  color: '#ffe066', passable: true,  spawnable: false, exists: true },
  repair_zone:   { id: 'repair_zone',   label: '수리 구역',  color: '#7dffb0', passable: true,  spawnable: false, exists: true },
  special_zone:  { id: 'special_zone',  label: '특수 구역',  color: '#a06bff', passable: true,  spawnable: false, exists: true },
}

export function getTileTypeDef(type) {
  return TILE_TYPES[type] ?? TILE_TYPES.void
}

// 오브젝트 에셋 → 이모지(전용 PNG 제작 전 폴백). 에디터·전투 공용.
export const OBSTACLE_EMOJI = {
  obstacle_low_wall: '🧱', obstacle_container: '📦', obstacle_metal_wreckage: '🛰️',
  obstacle_energy_pylon: '🗼', obstacle_ruin_block: '🪨', obstacle_shield_generator: '🛡️',
}
export function obstacleEmoji(key) {
  return OBSTACLE_EMOJI[key] ?? '⬢'
}

// 그리드 프리셋 (rows/cols)
export const GRID_PRESETS = [
  { label: '14×12', cols: 14, rows: 12 },
  { label: '16×12', cols: 16, rows: 12 },
  { label: '20×16', cols: 20, rows: 16 },
  { label: '24×18', cols: 24, rows: 18 },
]

const cellKey = (x, y) => `${x},${y}`

// ── 기본 corner 자동 생성 (이미지 중앙에 아이소 다이아몬드) ──────────────
// top=(0,0), right=(cols,0), bottom=(cols,rows), left=(0,rows) 의 이미지 좌표.
export function getDefaultCorners(imageSize) {
  const W = imageSize?.width ?? 2560
  const H = imageSize?.height ?? 1440
  const cx = W / 2
  const cy = H / 2
  const halfW = W * 0.42
  const halfH = H * 0.40
  return {
    top:    { x: cx,         y: cy - halfH },
    right:  { x: cx + halfW, y: cy },
    bottom: { x: cx,         y: cy + halfH },
    left:   { x: cx - halfW, y: cy },
  }
}

// ── 셀 기반 그리드 변형 (셀 크기 일정 유지) ────────────────────────────
// corners에서 "한 칸(셀)"의 픽셀 벡터를 추출한다. col=가로 1칸, row=세로 1칸.
export function getCellVectors(grid) {
  const { cols, rows, corners } = grid
  const c = cols > 0 ? cols : 1
  const r = rows > 0 ? rows : 1
  return {
    col: { x: (corners.right.x - corners.top.x) / c, y: (corners.right.y - corners.top.y) / c },
    row: { x: (corners.left.x - corners.top.x) / r, y: (corners.left.y - corners.top.y) / r },
  }
}

// 그리드 중심(네 꼭짓점 평균) — 이미지 픽셀 좌표.
export function gridCenter(grid) {
  const c = grid.corners
  return {
    x: (c.top.x + c.right.x + c.bottom.x + c.left.x) / 4,
    y: (c.top.y + c.right.y + c.bottom.y + c.left.y) / 4,
  }
}

// 중심·셀 벡터·칸 수로부터 네 꼭짓점을 재구성(중심 고정, 셀 크기 유지).
export function cornersFromCell(center, col, row, cols, rows) {
  const hx = (col.x * cols + row.x * rows) / 2
  const hy = (col.y * cols + row.y * rows) / 2
  const top = { x: center.x - hx, y: center.y - hy }
  return {
    top,
    right:  { x: top.x + col.x * cols,             y: top.y + col.y * cols },
    bottom: { x: top.x + col.x * cols + row.x * rows, y: top.y + col.y * cols + row.y * rows },
    left:   { x: top.x + row.x * rows,             y: top.y + row.y * rows },
  }
}

// 칸 수를 바꾸되 "1칸 크기"는 그대로 유지한다(중심 고정, 맵을 넘어가도 셀 크기 동일).
// 기존 corners에서 셀 벡터를 추출해 그대로 쓰므로 회전/셀 크기 설정이 보존된다.
export function resizeGridKeepingCell(map, cols, rows) {
  const m = cloneMap(map)
  const nCols = Math.max(1, Math.round(cols) || 1)
  const nRows = Math.max(1, Math.round(rows) || 1)
  const { col, row } = getCellVectors(m.grid)
  const center = gridCenter(m.grid)
  m.grid.cols = nCols
  m.grid.rows = nRows
  m.grid.corners = cornersFromCell(center, col, row, nCols, nRows)
  return m
}

// 그리드 전체를 중심 기준으로 angle(rad)만큼 강체 회전 — 셀 크기 불변, 각도만 변경.
export function rotateGrid(map, angleRad, center) {
  const m = cloneMap(map)
  const c = center ?? gridCenter(m.grid)
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad)
  for (const k of ['top', 'right', 'bottom', 'left']) {
    const p = m.grid.corners[k]
    const dx = p.x - c.x, dy = p.y - c.y
    m.grid.corners[k] = { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
  }
  return m
}

// 전투 해상도 변경 — corners(픽셀 footprint)는 그대로 두고 "칸 수"만 바꾼다.
// 칸 수를 줄이면 같은 영역에 큰 칸이 깔려 셀(=함선)이 커진다. 칸 수를 늘리면 작아진다.
// 페인트(void/스폰 overrides)와 objects는 비례 리맵으로 대략적 형태를 보존한다.
export function setGridResolution(map, cols, rows) {
  const m = cloneMap(map)
  const nCols = Math.max(1, Math.round(cols) || 1)
  const nRows = Math.max(1, Math.round(rows) || 1)
  const oCols = m.grid.cols || 1, oRows = m.grid.rows || 1
  const remapX = (x) => Math.min(nCols - 1, Math.max(0, Math.floor((x + 0.5) * nCols / oCols)))
  const remapY = (y) => Math.min(nRows - 1, Math.max(0, Math.floor((y + 0.5) * nRows / oRows)))
  const next = {}
  for (const [key, type] of Object.entries(m.tiles.overrides)) {
    const [x, y] = key.split(',').map(Number)
    next[cellKey(remapX(x), remapY(y))] = type
  }
  m.grid.cols = nCols
  m.grid.rows = nRows
  m.tiles.overrides = next
  m.objects = (m.objects ?? []).map((o) => ({ ...o, tileX: remapX(o.tileX), tileY: remapY(o.tileY) }))
  return m
}

// 그리드 전체(=모든 셀)를 중심 기준으로 factor배 균일 확대/축소 — 각도 불변, 셀 크기만 변경.
export function scaleGrid(map, factor, center) {
  const m = cloneMap(map)
  const c = center ?? gridCenter(m.grid)
  for (const k of ['top', 'right', 'bottom', 'left']) {
    const p = m.grid.corners[k]
    m.grid.corners[k] = { x: c.x + (p.x - c.x) * factor, y: c.y + (p.y - c.y) * factor }
  }
  return m
}

// ── mapDefinition 팩토리 ──────────────────────────────────────────────
export function createMapDefinition({ id, name, cols = 20, rows = 16, background = '', imageSize } = {}) {
  const size = imageSize ?? { width: 2560, height: 1440 }
  const mapId = id || `battle_map_${Date.now().toString(36)}`
  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    id: mapId,
    name: name || '새 전투맵',
    background,
    imageSize: { width: size.width, height: size.height },
    grid: {
      type: 'isometric',
      cols,
      rows,
      corners: getDefaultCorners(size),
    },
    // 새 맵은 그리드 전체가 이동 가능(playable)으로 시작 — 우클릭 삭제 시 void override가 쌓인다.
    tiles: { default: 'playable', overrides: {} },
    spawnZones: { player: [], enemy: [], neutral: [], boss: [] },
    objects: [],
    metadata: { biome: 'space_platform', difficulty: 'standard' },
  }
}

// ── 좌표 변환 (corners 기반 bilinear) ─────────────────────────────────
// gridToScreen: 그리드 격자점(gx∈[0..cols], gy∈[0..rows]) → 이미지 픽셀 좌표.
export function gridToScreen(map, gx, gy) {
  const { cols, rows, corners } = map.grid
  const u = cols > 0 ? gx / cols : 0
  const v = rows > 0 ? gy / rows : 0
  const T = corners.top, R = corners.right, B = corners.bottom, L = corners.left
  // bilinear: T(0,0) R(1,0) B(1,1) L(0,1)
  const x = T.x * (1 - u) * (1 - v) + R.x * u * (1 - v) + B.x * u * v + L.x * (1 - u) * v
  const y = T.y * (1 - u) * (1 - v) + R.y * u * (1 - v) + B.y * u * v + L.y * (1 - u) * v
  return { x, y }
}

// screenToGrid: 이미지 픽셀 좌표 → { gx, gy }(연속) 및 타일 { tileX, tileY }.
// bilinear 역변환을 뉴턴 반복으로 구한다(근사 affine이라 빠르게 수렴).
export function screenToGrid(map, px, py) {
  const { cols, rows, corners } = map.grid
  const T = corners.top, R = corners.right, B = corners.bottom, L = corners.left
  // P(u,v) = T + u·a + v·b + uv·c
  const ax = R.x - T.x, ay = R.y - T.y
  const bx = L.x - T.x, by = L.y - T.y
  const cx = T.x - R.x - L.x + B.x, cy = T.y - R.y - L.y + B.y

  let u = 0.5, v = 0.5
  for (let i = 0; i < 12; i += 1) {
    const rx = T.x + u * ax + v * bx + u * v * cx - px
    const ry = T.y + u * ay + v * by + u * v * cy - py
    // Jacobian
    const j11 = ax + v * cx, j12 = bx + u * cx
    const j21 = ay + v * cy, j22 = by + u * cy
    const det = j11 * j22 - j12 * j21
    if (Math.abs(det) < 1e-9) break
    const du = (rx * j22 - ry * j12) / det
    const dv = (ry * j11 - rx * j21) / det
    u -= du
    v -= dv
    if (Math.abs(du) < 1e-6 && Math.abs(dv) < 1e-6) break
  }
  const gx = u * cols
  const gy = v * rows
  return { gx, gy, tileX: Math.floor(gx), tileY: Math.floor(gy) }
}

// 타일 (tileX,tileY) 의 4꼭짓점 폴리곤(이미지 좌표) — 렌더용.
export function getTilePolygon(map, tileX, tileY) {
  return [
    gridToScreen(map, tileX, tileY),
    gridToScreen(map, tileX + 1, tileY),
    gridToScreen(map, tileX + 1, tileY + 1),
    gridToScreen(map, tileX, tileY + 1),
  ]
}

export function getTileCenter(map, tileX, tileY) {
  return gridToScreen(map, tileX + 0.5, tileY + 0.5)
}

// ── 타일 데이터 유틸 ───────────────────────────────────────────────────
export function inBounds(map, x, y) {
  return x >= 0 && y >= 0 && x < map.grid.cols && y < map.grid.rows
}

export function getTileType(map, x, y) {
  if (!inBounds(map, x, y)) return 'void'
  return map.tiles.overrides[cellKey(x, y)] ?? map.tiles.default
}

export function tileExists(map, x, y) {
  if (!inBounds(map, x, y)) return false
  return getTileTypeDef(getTileType(map, x, y)).exists
}

export function isTilePlayable(map, x, y) {
  const def = getTileTypeDef(getTileType(map, x, y))
  return inBounds(map, x, y) && def.exists && def.passable
}

export function isTileBlocked(map, x, y) {
  return getTileType(map, x, y) === 'blocked'
}

export function isTileVoid(map, x, y) {
  return getTileType(map, x, y) === 'void'
}

export function isTileSpawnable(map, x, y) {
  return getTileTypeDef(getTileType(map, x, y)).spawnable && !isTileBlocked(map, x, y)
}

// 불변: 타일 타입 설정한 새 tiles 객체 반환(default와 같으면 override 제거).
export function withTile(map, x, y, type) {
  if (!inBounds(map, x, y)) return map
  const overrides = { ...map.tiles.overrides }
  if (type === map.tiles.default) delete overrides[cellKey(x, y)]
  else overrides[cellKey(x, y)] = type
  return { ...map, tiles: { ...map.tiles, overrides } }
}

// ── spawnZones 파생 (tiles의 spawn_* 타입 → 좌표 목록) ─────────────────
export function deriveSpawnZones(map) {
  const zones = { player: [], enemy: [], neutral: [], boss: [] }
  for (const [key, type] of Object.entries(map.tiles.overrides)) {
    const def = TILE_TYPES[type]
    if (!def?.spawnSide) continue
    const [x, y] = key.split(',').map(Number)
    zones[def.spawnSide]?.push({ x, y })
  }
  return zones
}

// 전투에서 쓸 모든 playable/spawnable 좌표 (objects의 blocksMovement는 제외)
export function getPlayableCells(map) {
  const cells = []
  for (let y = 0; y < map.grid.rows; y += 1) {
    for (let x = 0; x < map.grid.cols; x += 1) {
      if (isTilePlayable(map, x, y)) cells.push({ x, y })
    }
  }
  return cells
}

// objects가 점유한 타일 좌표 Set("x,y") — blocksMovement만.
export function getBlockingObjectCells(map) {
  const set = new Set()
  for (const obj of map.objects ?? []) {
    if (!obj.blocksMovement) continue
    const w = obj.size?.w ?? 1
    const h = obj.size?.h ?? 1
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) set.add(cellKey(obj.tileX + dx, obj.tileY + dy))
    }
  }
  return set
}

// ── 한 줄(행/열) 추가·삭제 ─────────────────────────────────────────────
// edge: 'top' | 'bottom' | 'left' | 'right'. newType: 새 줄 타일 타입.
// corners를 grid 한 칸만큼 연장/축소해 시각적 형태를 유지한다.
export function addLine(map, edge, newType = 'playable') {
  const m = cloneMap(map)
  const { cols, rows } = m.grid
  if (edge === 'top') {
    shiftOverrides(m, 0, 1)
    extendCorners(m, 'top')
    m.grid.rows = rows + 1
    for (let x = 0; x < cols; x += 1) m.tiles.overrides[cellKey(x, 0)] = newType
  } else if (edge === 'bottom') {
    extendCorners(m, 'bottom')
    m.grid.rows = rows + 1
    for (let x = 0; x < cols; x += 1) m.tiles.overrides[cellKey(x, rows)] = newType
  } else if (edge === 'left') {
    shiftOverrides(m, 1, 0)
    extendCorners(m, 'left')
    m.grid.cols = cols + 1
    for (let y = 0; y < rows; y += 1) m.tiles.overrides[cellKey(0, y)] = newType
  } else if (edge === 'right') {
    extendCorners(m, 'right')
    m.grid.cols = cols + 1
    for (let y = 0; y < rows; y += 1) m.tiles.overrides[cellKey(cols, y)] = newType
  }
  return m
}

export function removeLine(map, edge) {
  const m = cloneMap(map)
  const { cols, rows } = m.grid
  if ((edge === 'top' || edge === 'bottom') && rows <= 1) return map
  if ((edge === 'left' || edge === 'right') && cols <= 1) return map
  if (edge === 'top') {
    pruneOverrides(m, (x, y) => y === 0)
    shiftOverrides(m, 0, -1)
    extendCorners(m, 'top', -1)
    m.grid.rows = rows - 1
  } else if (edge === 'bottom') {
    pruneOverrides(m, (x, y) => y === rows - 1)
    extendCorners(m, 'bottom', -1)
    m.grid.rows = rows - 1
  } else if (edge === 'left') {
    pruneOverrides(m, (x) => x === 0)
    shiftOverrides(m, -1, 0)
    extendCorners(m, 'left', -1)
    m.grid.cols = cols - 1
  } else if (edge === 'right') {
    pruneOverrides(m, (x) => x === cols - 1)
    extendCorners(m, 'right', -1)
    m.grid.cols = cols - 1
  }
  // 범위 밖으로 밀려난 objects 제거
  m.objects = (m.objects ?? []).filter((o) => o.tileX < m.grid.cols && o.tileY < m.grid.rows && o.tileX >= 0 && o.tileY >= 0)
  return m
}

// 삭제 시 영향받는 "의미 있는" 타일/오브젝트 개수(경고용).
// 평범한 playable·void는 세지 않고 스폰·blocked 등 지정된 칸과 오브젝트만 센다.
export function lineRemovalImpact(map, edge) {
  const { cols, rows } = map.grid
  let tiles = 0, objects = 0
  const lastX = cols - 1, lastY = rows - 1
  for (const [key, type] of Object.entries(map.tiles.overrides)) {
    const [x, y] = key.split(',').map(Number)
    const onEdge = (edge === 'top' && y === 0) || (edge === 'bottom' && y === lastY) ||
                   (edge === 'left' && x === 0) || (edge === 'right' && x === lastX)
    if (onEdge && type !== 'void' && type !== 'playable') tiles += 1
  }
  for (const o of map.objects ?? []) {
    const onEdge = (edge === 'top' && o.tileY === 0) || (edge === 'bottom' && o.tileY === lastY) ||
                   (edge === 'left' && o.tileX === 0) || (edge === 'right' && o.tileX === lastX)
    if (onEdge) objects += 1
  }
  return { tiles, objects }
}

function shiftOverrides(m, dx, dy) {
  const next = {}
  for (const [key, type] of Object.entries(m.tiles.overrides)) {
    const [x, y] = key.split(',').map(Number)
    next[cellKey(x + dx, y + dy)] = type
  }
  m.tiles.overrides = next
}

function pruneOverrides(m, predicate) {
  for (const key of Object.keys(m.tiles.overrides)) {
    const [x, y] = key.split(',').map(Number)
    if (predicate(x, y)) delete m.tiles.overrides[key]
  }
}

// corners를 edge 방향으로 dir(±1)줄만큼 연장: 한 줄의 픽셀 벡터를 더한다.
function extendCorners(m, edge, dir = 1) {
  const c = m.grid.corners
  const { cols, rows } = m.grid
  // 행 벡터(top→bottom 방향, 한 행) / 열 벡터(left→right, 한 열)
  const rowVec = { x: (c.left.x - c.top.x) / rows, y: (c.left.y - c.top.y) / rows }   // y+ 방향 1행
  const colVec = { x: (c.right.x - c.top.x) / cols, y: (c.right.y - c.top.y) / cols }  // x+ 방향 1열
  const add = (p, v, k) => { p.x += v.x * k; p.y += v.y * k }
  if (edge === 'top') { // top/right를 위(-row)로
    add(c.top, rowVec, -dir); add(c.right, rowVec, -dir)
  } else if (edge === 'bottom') {
    add(c.bottom, rowVec, dir); add(c.left, rowVec, dir)
  } else if (edge === 'left') {
    add(c.top, colVec, -dir); add(c.left, colVec, -dir)
  } else if (edge === 'right') {
    add(c.right, colVec, dir); add(c.bottom, colVec, dir)
  }
}

export function cloneMap(map) {
  return {
    ...map,
    imageSize: { ...map.imageSize },
    grid: { ...map.grid, corners: {
      top: { ...map.grid.corners.top }, right: { ...map.grid.corners.right },
      bottom: { ...map.grid.corners.bottom }, left: { ...map.grid.corners.left },
    } },
    tiles: { default: map.tiles.default, overrides: { ...map.tiles.overrides } },
    spawnZones: {
      player: [...(map.spawnZones?.player ?? [])], enemy: [...(map.spawnZones?.enemy ?? [])],
      neutral: [...(map.spawnZones?.neutral ?? [])], boss: [...(map.spawnZones?.boss ?? [])],
    },
    objects: (map.objects ?? []).map((o) => ({ ...o, size: { ...(o.size ?? { w: 1, h: 1 }) } })),
    metadata: { ...(map.metadata ?? {}) },
  }
}

// ── 유효성 검사 ────────────────────────────────────────────────────────
export function validateMap(map) {
  const errors = []
  const warnings = []
  if (!map.id) errors.push('맵 ID가 없습니다.')
  if (!map.background) warnings.push('배경 이미지가 지정되지 않았습니다.')
  if (!(map.grid.cols >= 1) || !(map.grid.rows >= 1)) errors.push('cols/rows는 1 이상이어야 합니다.')
  const c = map.grid.corners
  if (!c?.top || !c?.right || !c?.bottom || !c?.left) errors.push('그리드 꼭짓점(corners) 4개가 필요합니다.')

  const zones = deriveSpawnZones(map)
  if (zones.player.length < 1) errors.push('아군 스폰(spawn_player) 타일이 최소 1개 필요합니다.')
  if (zones.enemy.length < 1) errors.push('적 스폰(spawn_enemy) 타일이 최소 1개 필요합니다.')

  // 스폰이 void/blocked 위가 아닌지 (spawn 타일 자체는 항상 OK이나, 안전 점검)
  for (const side of ['player', 'enemy']) {
    for (const { x, y } of zones[side]) {
      if (!inBounds(map, x, y)) errors.push(`${side} 스폰(${x},${y})이 맵 범위를 벗어났습니다.`)
    }
  }

  // objects 범위 검사
  for (const o of map.objects ?? []) {
    const w = o.size?.w ?? 1, h = o.size?.h ?? 1
    if (o.tileX < 0 || o.tileY < 0 || o.tileX + w > map.grid.cols || o.tileY + h > map.grid.rows) {
      warnings.push(`오브젝트 ${o.assetKey}(${o.tileX},${o.tileY})가 맵 범위를 벗어납니다.`)
    }
  }

  // 플레이 가능 타일 수
  const playable = getPlayableCells(map)
  if (playable.length < 4) warnings.push(`플레이 가능 타일이 너무 적습니다 (${playable.length}칸).`)

  // 스폰 근접도
  if (zones.player.length && zones.enemy.length) {
    let minDist = Infinity
    for (const p of zones.player) for (const e of zones.enemy) {
      minDist = Math.min(minDist, Math.abs(p.x - e.x) + Math.abs(p.y - e.y))
    }
    if (minDist <= 2) warnings.push(`아군과 적 스폰이 너무 가깝습니다 (최소 거리 ${minDist}칸).`)
  }

  // 경로 검증 — 아군 스폰에서 적 스폰까지 최소 1개 경로
  if (zones.player.length && zones.enemy.length) {
    if (!hasPathBetween(map, zones.player[0], zones.enemy[0])) {
      warnings.push('아군 스폰에서 적 스폰까지 이동 경로가 없습니다 (모든 길이 막혀 있을 수 있음).')
    }
  }
  return { ok: errors.length === 0, errors, warnings }
}

// 이동 가능(playable & blocking object 없음) 타일만 통과하는 BFS 연결성 검사.
export function hasPathBetween(map, start, goal) {
  if (!start || !goal) return false
  const blocking = getBlockingObjectCells(map)
  const passable = (x, y) => isTilePlayable(map, x, y) && !blocking.has(cellKey(x, y))
  if (!passable(goal.x, goal.y) && !(goal.x === start.x && goal.y === start.y)) {
    // goal이 막힌 스폰일 수 있으니 goal 인접까지 도달하면 OK로 본다
  }
  const seen = new Set([cellKey(start.x, start.y)])
  const queue = [start]
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  while (queue.length) {
    const cur = queue.shift()
    if (cur.x === goal.x && cur.y === goal.y) return true
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy
      const k = cellKey(nx, ny)
      if (seen.has(k)) continue
      if (nx === goal.x && ny === goal.y) return true
      if (!passable(nx, ny)) continue
      seen.add(k)
      queue.push({ x: nx, y: ny })
    }
  }
  return false
}

// 저장 직전 정규화 — spawnZones를 tiles에서 재동기화.
export function normalizeForSave(map) {
  const m = cloneMap(map)
  m.spawnZones = deriveSpawnZones(m)
  m.schemaVersion = MAP_SCHEMA_VERSION
  return m
}

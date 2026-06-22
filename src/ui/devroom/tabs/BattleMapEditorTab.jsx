// Battle Map Editor — 게임 내장 전투맵 제작 도구 (관제실 탭).
// 배경 이미지 위에 아이소 그리드를 자동 생성한다. 모든 그리드 칸 = 이동 가능 공간이고,
// 우클릭으로 칸을 삭제(=void)하거나 빈칸을 더블클릭해 그리드를 만든다. 캔버스 4변의 +/−로
// 줄을 늘리고 줄인다. 브러시는 스폰 지정용, 오브젝트는 별도 팔레트에서 배치한다. 모든 메뉴는
// 드래그·접기 가능한 플로팅 패널이며 "자동정렬"로 기본 위치로 되돌린다.
import { useEffect, useRef, useState, useCallback } from 'react'
import { useMapStore, MAP_TYPES, mapTypeOf } from '../../../state/useMapStore'
import {
  createMapDefinition, cloneMap,
  gridToScreen, screenToGrid, getTileType, getTileTypeDef, withTile,
  addLine, removeLine, lineRemovalImpact, validateMap,
  rotateGrid, gridCenter, setGridResolution,
  TILE_TYPES, obstacleEmoji,
} from '../../../core/battleMap'
import { listMapImages, imageBaseName, mapIdFromImage, saveMapJson, deleteMapFile, renameMapFile } from '../../../data/mapImages'
import './BattleMapEditorTab.css'

// 브러시 = 그리드 칸의 용도 지정. 이동 그리드(기본) + 아군/적 스폰만 유지한다.
const BRUSHES = [
  { id: 'playable',     label: '이동 그리드', color: TILE_TYPES.playable.color },
  { id: 'spawn_player', label: '아군 스폰',   color: TILE_TYPES.spawn_player.color },
  { id: 'spawn_enemy',  label: '적 스폰',     color: TILE_TYPES.spawn_enemy.color },
]

// 오브젝트 팔레트 (저장된 에셋 목록)
const OBJECT_ASSETS = [
  { key: 'obstacle_low_wall',        blocksMovement: true,  providesCover: true },
  { key: 'obstacle_container',       blocksMovement: true,  providesCover: true },
  { key: 'obstacle_metal_wreckage',  blocksMovement: true,  providesCover: true },
  { key: 'obstacle_energy_pylon',    blocksMovement: true,  providesCover: false },
  { key: 'obstacle_ruin_block',      blocksMovement: true,  providesCover: true },
  { key: 'obstacle_shield_generator',blocksMovement: false, providesCover: true },
]
const objEmoji = (key) => obstacleEmoji(key)

const cellKey = (x, y) => `${x},${y}`

// 플로팅 패널 기본 위치 — 좌우 양 끝 정렬. 맵 정보=좌측, 브러시 팔레트=우측, 오브젝트=팔레트 바로 아래(우측).
const PANEL_DEFAULTS = {
  info:    { left: 10,  top: 96 },
  palette: { right: 12, top: 96 },
  object:  { right: 12, top: 372 },
}

export default function BattleMapEditorTab() {
  const maps          = useMapStore((s) => s.maps)
  const saveMapStore  = useMapStore((s) => s.saveMap)
  const setTestBattleMap = useMapStore((s) => s.setTestBattleMap)
  const categoryMaps  = useMapStore((s) => s.categoryMaps)
  const assignMapToType = useMapStore((s) => s.assignMapToType)
  const removeMapEverywhere = useMapStore((s) => s.removeMapEverywhere)
  const mapCategories = useMapStore((s) => s.mapCategories)
  const setMapCategory = useMapStore((s) => s.setMapCategory)
  const rekeyMap      = useMapStore((s) => s.rekeyMap)

  const mapList = Object.values(maps)

  // ── 작업 중 맵 + UI 상태 ──
  const [map, setMap]       = useState(() => mapList[0] ? cloneMap(mapList[0]) : createMapDefinition({ name: '새 전투맵' }))
  const [brush, setBrush]   = useState('playable')
  const [dirty, setDirty]   = useState(false)
  const [selObjId, setSelObjId] = useState(null)
  const [armedAsset, setArmedAsset] = useState(null)
  const [hoverTile, setHoverTile]   = useState(null)
  const [showGrid, setShowGrid]     = useState(true)
  const [gridOpacity, setGridOpacity] = useState(0.5)
  const [gridColor, setGridColor]   = useState('#4fb8ff')
  const [preview, setPreview] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState('normal') // 불러오기 모달 카테고리 탭
  const [mapImages, setMapImages] = useState([]) // map/ 폴더 이미지 목록 [{ name, url }]
  const [applyOpen, setApplyOpen] = useState(false) // 맵 적용(전투 배정) 모달
  const [applyTab, setApplyTab] = useState('all')   // 적용 모달 좌측 분류 탭(all/normal/special/elite/boss/other)
  const [applyHint, setApplyHint] = useState(null)  // 적용 모달 안내 배너(미구현 맵 클릭 시)
  const [notice, setNotice] = useState(null)        // 중앙 안내 모달 { icon, title, body }
  const [testOpen, setTestOpen] = useState(false)   // 테스트할 맵 선택 모달
  const [selection, setSelection] = useState(() => new Set()) // 엑셀식 다중선택된 그리드 "x,y"
  // 플로팅 패널 위치(null이면 기본 배치, 드래그하면 절대좌표) + 열림 상태
  const [pos, setPos] = useState({ info: null, object: null, palette: null })
  const [open, setOpen] = useState({ info: true, object: true, palette: true })
  const setPanelPos = (id) => (p) => setPos((s) => ({ ...s, [id]: p }))
  const togglePanel = (id) => setOpen((s) => ({ ...s, [id]: !s[id] }))
  // 자동정렬 — 모든 패널을 기본 위치(좌우 양끝)로 되돌리고 전부 연다.
  const autoArrange = () => { setPos({ info: null, object: null, palette: null }); setOpen({ info: true, object: true, palette: true }) }

  // ── 비-렌더 상태(ref) ──
  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)
  const edgeRefs = { top: useRef(null), right: useRef(null), bottom: useRef(null), left: useRef(null) }
  const mapRef    = useRef(map)
  const brushRef  = useRef(brush)
  const armedRef  = useRef(armedAsset)
  const selObjRef = useRef(selObjId)
  const showGridRef = useRef(showGrid)
  const gridOpacityRef = useRef(gridOpacity)
  const gridColorRef = useRef(gridColor)
  const viewRef   = useRef({ scale: 0.3, offsetX: 40, offsetY: 20, fitted: false })
  const dragRef   = useRef(null)
  const hoverRef  = useRef(null)
  const imgRef    = useRef(null)
  const undoRef   = useRef([])
  const redoRef   = useRef([])
  const previewRef = useRef(preview)
  const dragAssetRef = useRef(null)   // 네이티브 DnD로 끌고 있는 오브젝트 에셋
  const selectionRef = useRef(selection) // draw()에서 읽는 최신 선택 집합
  const rubberRef = useRef(null)         // Shift 드래그 사각 선택 { x0,y0,x1,y1, paint } 또는 null

  useEffect(() => { mapRef.current = map }, [map])
  useEffect(() => { brushRef.current = brush }, [brush])
  useEffect(() => { armedRef.current = armedAsset }, [armedAsset])
  useEffect(() => { selObjRef.current = selObjId }, [selObjId])
  useEffect(() => { showGridRef.current = showGrid }, [showGrid])
  useEffect(() => { gridOpacityRef.current = gridOpacity }, [gridOpacity])
  useEffect(() => { gridColorRef.current = gridColor; requestDraw() }, [gridColor]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { previewRef.current = preview; requestDraw() }, [preview]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 맵 변경 적용(undo 스택) ──
  const applyMap = useCallback((next, pushUndo = true) => {
    if (pushUndo) {
      undoRef.current.push(cloneMap(mapRef.current))
      if (undoRef.current.length > 60) undoRef.current.shift()
      redoRef.current = []
    }
    mapRef.current = next
    setMap(next)
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    if (!undoRef.current.length) return
    redoRef.current.push(cloneMap(mapRef.current))
    const prev = undoRef.current.pop()
    mapRef.current = prev; setMap(prev); setDirty(true)
  }, [])
  const redo = useCallback(() => {
    if (!redoRef.current.length) return
    undoRef.current.push(cloneMap(mapRef.current))
    const next = redoRef.current.pop()
    mapRef.current = next; setMap(next); setDirty(true)
  }, [])

  // ── 배경 이미지 로드 ──
  useEffect(() => {
    if (!map.background) { imgRef.current = null; requestDraw(); return }
    const img = new Image()
    img.onload = () => { imgRef.current = img; requestDraw() }
    img.onerror = () => { imgRef.current = null; requestDraw() }
    img.src = map.background
  }, [map.background]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 캔버스 리사이즈 + 최초 fit ──
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = wrap.clientWidth
      canvas.height = wrap.clientHeight
      if (!viewRef.current.fitted) fitView()
      requestDraw()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function fitView() {
    const canvas = canvasRef.current
    const m = mapRef.current
    if (!canvas) return
    const W = m.imageSize.width, H = m.imageSize.height
    const scale = Math.min(canvas.width / W, canvas.height / H) * 0.92
    viewRef.current = {
      scale,
      offsetX: (canvas.width - W * scale) / 2,
      offsetY: (canvas.height - H * scale) / 2,
      fitted: true,
    }
  }

  // ── 좌표 변환 ──
  const imgToCanvas = (ix, iy) => {
    const v = viewRef.current
    return { x: ix * v.scale + v.offsetX, y: iy * v.scale + v.offsetY }
  }
  const canvasToImg = (cx, cy) => {
    const v = viewRef.current
    return { x: (cx - v.offsetX) / v.scale, y: (cy - v.offsetY) / v.scale }
  }
  const eventCanvasPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // ── 렌더 ──
  const drawRaf = useRef(0)
  const requestDraw = useCallback(() => {
    if (drawRaf.current) return
    drawRaf.current = requestAnimationFrame(() => { drawRaf.current = 0; draw() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const m = mapRef.current
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0a0e1c'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 배경 이미지 / 플레이스홀더
    const tl = imgToCanvas(0, 0)
    const dispW = m.imageSize.width * viewRef.current.scale
    const dispH = m.imageSize.height * viewRef.current.scale
    if (imgRef.current) {
      ctx.drawImage(imgRef.current, tl.x, tl.y, dispW, dispH)
    } else {
      ctx.fillStyle = '#10162e'
      ctx.fillRect(tl.x, tl.y, dispW, dispH)
      ctx.strokeStyle = '#2a3658'
      ctx.strokeRect(tl.x, tl.y, dispW, dispH)
      ctx.fillStyle = '#3a4670'
      ctx.font = '14px monospace'
      ctx.fillText('배경 이미지 없음 — 맵 정보 패널에서 경로/파일 지정', tl.x + 16, tl.y + 28)
    }

    // 오브젝트가 점유한 칸 — 그리드를 그리지 않아 "오브젝트만 남고 그리드가 사라진" 것처럼 보인다.
    const objCells = objectFootprintCells(m)

    // 그리드 타일
    const { cols, rows } = m.grid
    const hov = hoverRef.current
    const isPreview = previewRef.current
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const type = getTileType(m, x, y)
        if (type === 'void') continue          // 삭제된 칸 = 배경만 노출, 이동 불가
        if (objCells.has(cellKey(x, y))) continue // 오브젝트 자리 = 그리드 숨김
        const def = getTileTypeDef(type)
        const p0 = imgToCanvas(...Object.values(gridToScreen(m, x, y)))
        const p1 = imgToCanvas(...Object.values(gridToScreen(m, x + 1, y)))
        const p2 = imgToCanvas(...Object.values(gridToScreen(m, x + 1, y + 1)))
        const p3 = imgToCanvas(...Object.values(gridToScreen(m, x, y + 1)))
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath()
        if (isPreview) {
          // 미리보기: 스폰만 옅게 강조, 격자선 약하게
          if (def.spawnSide) { ctx.fillStyle = hexToRgba(def.color, 0.22); ctx.fill() }
          ctx.strokeStyle = 'rgba(120,150,200,0.18)'; ctx.lineWidth = 1; ctx.stroke()
          continue
        }
        ctx.fillStyle = hexToRgba(def.color, 0.32)
        ctx.fill()
        if (showGridRef.current) {
          ctx.strokeStyle = hexToRgba(gridColorRef.current, gridOpacityRef.current)
          ctx.lineWidth = 1
          ctx.stroke()
        }
        if (selectionRef.current.has(cellKey(x, y))) {
          ctx.fillStyle = 'rgba(255,209,102,0.42)'; ctx.fill()
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke()
        }
        const rb = rubberRef.current
        if (rb && x >= Math.min(rb.x0, rb.x1) && x <= Math.max(rb.x0, rb.x1) && y >= Math.min(rb.y0, rb.y1) && y <= Math.max(rb.y0, rb.y1)) {
          const col = rb.paint ? getTileTypeDef(rb.paint).color : '#ffd166'
          ctx.fillStyle = hexToRgba(col, 0.42); ctx.fill()
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke()
        }
        if (hov && hov.x === x && hov.y === y) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)'
          ctx.fill()
        }
      }
    }

    // 오브젝트
    for (const obj of m.objects ?? []) {
      const c = imgToCanvas(...Object.values(gridToScreen(m, obj.tileX + (obj.size?.w ?? 1) / 2, obj.tileY + (obj.size?.h ?? 1) / 2)))
      const r = Math.max(10, 16 * viewRef.current.scale * 1.2)
      ctx.font = `${Math.round(r * 1.6)}px serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      if (obj.id === selObjRef.current) {
        ctx.beginPath(); ctx.arc(c.x, c.y, r * 1.5, 0, Math.PI * 2)
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke()
      }
      ctx.fillText(objEmoji(obj.assetKey), c.x, c.y)
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'

    // 캔버스 4변 +/− 버튼을 그리드 경계선 끝(각 변의 중점)에 따라붙인다.
    if (!isPreview) positionEdgeButtons(m)

    // 좌표 HUD
    if (hov) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(8, canvas.height - 26, 160, 20)
      ctx.fillStyle = '#cdd8f4'; ctx.font = '12px monospace'
      ctx.fillText(`tile (${hov.x}, ${hov.y}) · ${getTileType(m, hov.x, hov.y)}`, 14, canvas.height - 12)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 상태 변화 시 재그림
  useEffect(() => { requestDraw() }, [map, hoverTile, showGrid, gridOpacity, selObjId, selection]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4변 +/− 버튼을 각 경계선(아이소 대각선)에 맞춰 배치 ──
  // 버튼 쌍을 변의 진행방향(접선)에 나란히 놓고, 변 바깥(법선)으로 살짝 밀어낸다.
  function positionEdgeButtons(m) {
    const { cols, rows } = m.grid
    // 각 edge의 두 꼭짓점(경계선 양 끝) — addLine 의미와 일치.
    const ends = {
      top:    [gridToScreen(m, 0, 0),    gridToScreen(m, cols, 0)],
      right:  [gridToScreen(m, cols, 0),  gridToScreen(m, cols, rows)],
      bottom: [gridToScreen(m, 0, rows),  gridToScreen(m, cols, rows)],
      left:   [gridToScreen(m, 0, 0),     gridToScreen(m, 0, rows)],
    }
    const center = imgToCanvas(...Object.values(gridCenter(m.grid)))
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      const el = edgeRefs[edge].current
      if (!el) continue
      const a = imgToCanvas(ends[edge][0].x, ends[edge][0].y)
      const b = imgToCanvas(ends[edge][1].x, ends[edge][1].y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      let tx = b.x - a.x, ty = b.y - a.y
      const tlen = Math.hypot(tx, ty) || 1
      tx /= tlen; ty /= tlen                  // 접선(변 방향)
      let nx = -ty, ny = tx                    // 법선(변에 수직)
      if ((mid.x - center.x) * nx + (mid.y - center.y) * ny < 0) { nx = -nx; ny = -ny } // 바깥쪽
      const off = 34
      el.style.left = `${mid.x + nx * off}px`
      el.style.top = `${mid.y + ny * off}px`
      // 컨테이너를 변 각도로 회전(버튼들이 경계선을 따라 나란히 놓이게). 글리프는 CSS가 역회전해 똑바로 유지.
      el.style.setProperty('--erot', `${Math.atan2(ty, tx)}rad`)
    }
  }
  function pickObject(imgPos) {
    const m = mapRef.current
    const g = screenToGrid(m, imgPos.x, imgPos.y)
    for (let i = (m.objects?.length ?? 0) - 1; i >= 0; i -= 1) {
      const o = m.objects[i]
      const w = o.size?.w ?? 1, h = o.size?.h ?? 1
      if (g.tileX >= o.tileX && g.tileX < o.tileX + w && g.tileY >= o.tileY && g.tileY < o.tileY + h) return o
    }
    return null
  }

  // ── 페인트/삭제 적용 ──
  function applyBrushAt(x, y, base) {
    const m = base ?? mapRef.current
    return withTile(m, x, y, brushRef.current)
  }
  // 우클릭: 그리드 칸 삭제(=void). 위치 무관, 그리드 위면 어디든 사라진다.
  function deleteTileAt(x, y) {
    const m = mapRef.current
    if (!inBounds(m, x, y) || getTileType(m, x, y) === 'void') return
    applyMap(withTile(m, x, y, 'void'))
  }
  // ── 엑셀식 다중선택 ──
  const applySelection = (next) => { selectionRef.current = next; setSelection(next); requestDraw() }
  function clearSelection() {
    rubberRef.current = null
    if (selectionRef.current.size) applySelection(new Set())
  }
  // Ctrl + 좌클릭 = 개별 칸 토글(엑셀의 개별 셀 선택).
  function selectToggle(x, y) {
    const next = new Set(selectionRef.current)
    const k = cellKey(x, y)
    if (next.has(k)) next.delete(k); else next.add(k)
    applySelection(next)
  }
  // 사각 영역(x0..x1, y0..y1)의 존재하는 그리드 칸 집합.
  function rectCells(x0, y0, x1, y1) {
    const m = mapRef.current
    const cells = new Set()
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1)
    for (let yy = ay; yy <= by; yy += 1) for (let xx = ax; xx <= bx; xx += 1) {
      if (inBounds(m, xx, yy) && getTileType(m, xx, yy) !== 'void') cells.add(cellKey(xx, yy))
    }
    return cells
  }
  // Shift 드래그 종료 — 브러시가 켜져 있으면 영역을 그 브러시로 칠하고, 없으면 삭제용으로 선택만 한다.
  function commitRubber() {
    const r = rubberRef.current
    rubberRef.current = null
    if (!r) return
    const cells = rectCells(r.x0, r.y0, r.x1, r.y1)
    if (r.paint) {
      let next = mapRef.current
      for (const key of cells) { const [x, y] = key.split(',').map(Number); next = withTile(next, x, y, r.paint) }
      applyMap(next)
      if (selectionRef.current.size) applySelection(new Set())
      else requestDraw()
    } else {
      applySelection(cells)
    }
  }
  // 선택된 칸 전체를 void로(한 번의 undo).
  function deleteSelection() {
    const sel = selectionRef.current
    if (!sel.size) return
    let next = mapRef.current
    for (const key of sel) {
      const [x, y] = key.split(',').map(Number)
      if (inBounds(next, x, y)) next = withTile(next, x, y, 'void')
    }
    applyMap(next)
    clearSelection()
  }
  // 우클릭 삭제: 선택된 칸 위면 선택 전체, 아니면 단일 칸.
  function deleteTileOrSelection(tile) {
    if (selectionRef.current.size && selectionRef.current.has(cellKey(tile.x, tile.y))) deleteSelection()
    else deleteTileAt(tile.x, tile.y)
  }
  // 좌클릭 드래그: 그리드 전체를 배경 위에서 평행이동(corners를 delta만큼 옮긴다).
  function translateGrid(base, dx, dy) {
    const m = cloneMap(base)
    for (const k of ['top', 'right', 'bottom', 'left']) { m.grid.corners[k].x += dx; m.grid.corners[k].y += dy }
    return m
  }
  // 우클릭: 오브젝트 삭제 → 그 자리 그리드가 자동으로 다시 보인다(타일 데이터는 건드리지 않음).
  function deleteObject(objId) {
    const next = cloneMap(mapRef.current)
    next.objects = (next.objects ?? []).filter((o) => o.id !== objId)
    applyMap(next)
    if (selObjRef.current === objId) { setSelObjId(null); selObjRef.current = null }
  }

  // ── 포인터 이벤트 ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onDown = (e) => {
      try { canvas.setPointerCapture?.(e.pointerId) } catch { /* 무시 */ }
      const cp = eventCanvasPos(e)
      const ip = canvasToImg(cp.x, cp.y)
      const m = mapRef.current
      const g = screenToGrid(m, ip.x, ip.y)

      // 미리보기 모드: 편집 잠금(좌클릭도 팬만 허용)
      if (previewRef.current) {
        dragRef.current = { type: 'pan', startX: cp.x, startY: cp.y, ox: viewRef.current.offsetX, oy: viewRef.current.offsetY }
        return
      }

      // 휠클릭 = 팬
      if (e.button === 1) {
        dragRef.current = { type: 'pan', startX: cp.x, startY: cp.y, ox: viewRef.current.offsetX, oy: viewRef.current.offsetY }
        return
      }

      // 우클릭 = 삭제(클릭) / 화면 이동(드래그). 이동 여부는 onUp에서 판정.
      if (e.button === 2) {
        const obj = pickObject(ip)
        dragRef.current = {
          type: 'pan', startX: cp.x, startY: cp.y, ox: viewRef.current.offsetX, oy: viewRef.current.offsetY,
          right: true, moved: false, downObj: obj?.id ?? null, downTile: inBounds(m, g.tileX, g.tileY) ? { x: g.tileX, y: g.tileY } : null,
        }
        return
      }

      // 오브젝트가 무장돼 있으면 배치
      if (armedRef.current) { placeObjectAt(ip, armedRef.current); return }

      // 기존 오브젝트 클릭 = 선택/이동
      const obj = pickObject(ip)
      if (obj) {
        setSelObjId(obj.id); selObjRef.current = obj.id
        dragRef.current = { type: 'objmove', objId: obj.id, base: cloneMap(m), moved: false }
        return
      }

      const inGrid = inBounds(m, g.tileX, g.tileY) && getTileType(m, g.tileX, g.tileY) !== 'void'

      // Shift + 좌드래그 = 사각 영역 선택(브러시 켜져 있으면 그 브러시로 칠하기, 없으면 삭제용 선택)
      if (e.shiftKey && inBounds(m, g.tileX, g.tileY)) {
        rubberRef.current = { x0: g.tileX, y0: g.tileY, x1: g.tileX, y1: g.tileY, paint: brushRef.current }
        dragRef.current = { type: 'rubber' }
        requestDraw()
        return
      }

      // Ctrl + 좌클릭 = 개별 칸 토글 선택(삭제용)
      if (inGrid && (e.ctrlKey || e.metaKey)) {
        selectToggle(g.tileX, g.tileY)
        dragRef.current = { type: 'ctrlsel' } // 드래그 무시
        return
      }

      // 좌클릭(수식어 없음): 클릭=브러시 칠하기, 드래그=그리드 전체 이동. 판정은 onMove/onUp에서.
      dragRef.current = {
        type: 'leftpending', startX: cp.x, startY: cp.y, base: cloneMap(m),
        tile: inGrid ? { x: g.tileX, y: g.tileY } : null, moved: false,
      }
    }

    const onMove = (e) => {
      const cp = eventCanvasPos(e)
      const ip = canvasToImg(cp.x, cp.y)
      const m = mapRef.current
      const g = screenToGrid(m, ip.x, ip.y)
      const nh = inBounds(m, g.tileX, g.tileY) ? { x: g.tileX, y: g.tileY } : null
      if (!sameTile(nh, hoverRef.current)) { hoverRef.current = nh; requestDraw() }

      const d = dragRef.current
      if (!d) return

      if (d.type === 'pan') {
        const dx = cp.x - d.startX, dy = cp.y - d.startY
        if (d.right && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) d.moved = true
        viewRef.current.offsetX = d.ox + dx
        viewRef.current.offsetY = d.oy + dy
        requestDraw(); return
      }
      // Shift 드래그 사각 선택 — 현재 칸까지 영역 확장(라이브 미리보기)
      if (d.type === 'rubber') {
        const r = rubberRef.current
        if (r && inBounds(m, g.tileX, g.tileY) && (r.x1 !== g.tileX || r.y1 !== g.tileY)) {
          r.x1 = g.tileX; r.y1 = g.tileY; requestDraw()
        }
        return
      }
      if (d.type === 'ctrlsel') return
      // 좌클릭 드래그 시작 판정 → 그리드 전체 이동으로 전환
      if (d.type === 'leftpending') {
        if (Math.abs(cp.x - d.startX) > 4 || Math.abs(cp.y - d.startY) > 4) {
          d.type = 'gridmove'
          d.startImg = canvasToImg(d.startX, d.startY)
        } else return
      }
      if (d.type === 'gridmove') {
        const cur = canvasToImg(cp.x, cp.y)
        const next = translateGrid(d.base, cur.x - d.startImg.x, cur.y - d.startImg.y)
        d.moved = true
        mapRef.current = next; setMap(next); setDirty(true); requestDraw(); return
      }
      if (d.type === 'objmove') {
        const obj = m.objects.find((o) => o.id === d.objId)
        if (obj && inBounds(m, g.tileX, g.tileY)) {
          const next = cloneMap(mapRef.current)
          const t = next.objects.find((o) => o.id === d.objId)
          t.tileX = g.tileX; t.tileY = g.tileY; d.moved = true
          mapRef.current = next; setMap(next); requestDraw()
        }
        return
      }
    }

    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      if (!d) return
      if (d.type === 'rubber') { commitRubber(); return }
      if (d.type === 'ctrlsel') return
      if ((d.type === 'objmove' || d.type === 'gridmove') && d.moved && d.base) { pushUndoBase(d.base); return }
      // 좌클릭(이동 없음) = 브러시 칠하기 + 선택 해제
      if (d.type === 'leftpending' && !d.moved) {
        if (d.tile && brushRef.current) applyMap(applyBrushAt(d.tile.x, d.tile.y))
        clearSelection()
        return
      }
      // 우클릭 + 이동 없음 = 삭제(선택된 칸 위면 선택 전체 삭제)
      if (d.type === 'pan' && d.right && !d.moved) {
        if (d.downObj) deleteObject(d.downObj)
        else if (d.downTile) deleteTileOrSelection(d.downTile)
      }
    }

    function pushUndoBase(base) {
      undoRef.current.push(base)
      if (undoRef.current.length > 60) undoRef.current.shift()
      redoRef.current = []
      setDirty(true)
    }

    // 더블클릭 — 빈칸이면 그리드 생성(회전은 좌상단 ⟲⟳ 버튼으로 처리).
    const onDblClick = (e) => {
      if (previewRef.current) return
      const cp = eventCanvasPos(e)
      const ip = canvasToImg(cp.x, cp.y)
      const m = mapRef.current
      const g = screenToGrid(m, ip.x, ip.y)
      if (inBounds(m, g.tileX, g.tileY) && getTileType(m, g.tileX, g.tileY) === 'void') {
        applyMap(withTile(m, g.tileX, g.tileY, 'playable'))
      }
    }

    const onWheel = (e) => {
      e.preventDefault()
      const cp = eventCanvasPos(e)
      const before = canvasToImg(cp.x, cp.y)
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      viewRef.current.scale = Math.max(0.05, Math.min(3, viewRef.current.scale * factor))
      viewRef.current.offsetX = cp.x - before.x * viewRef.current.scale
      viewRef.current.offsetY = cp.y - before.y * viewRef.current.scale
      requestDraw()
    }
    const onCtx = (e) => e.preventDefault()

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('dblclick', onDblClick)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onCtx)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onCtx)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // hover 타일 state 동기화(좌표 표시용)
  useEffect(() => {
    const id = setInterval(() => {
      const h = hoverRef.current
      setHoverTile((prev) => sameTile(prev, h) ? prev : (h ? { ...h } : null))
    }, 80)
    return () => clearInterval(id)
  }, [])

  // ── 오브젝트 배치 ──
  function placeObjectAt(imgPos, asset) {
    const m = mapRef.current
    const g = screenToGrid(m, imgPos.x, imgPos.y)
    if (!inBounds(m, g.tileX, g.tileY)) return
    const next = cloneMap(m)
    const obj = {
      id: `obj_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`,
      assetKey: asset.key,
      tileX: g.tileX, tileY: g.tileY,
      size: { w: 1, h: 1 },
      rotation: 'ne',
      blocksMovement: asset.blocksMovement,
      providesCover: asset.providesCover,
      destructible: false,
    }
    next.objects = [...(next.objects ?? []), obj]
    applyMap(next)
    setSelObjId(obj.id)
  }

  // 이미지(파일명+URL)로 새 맵을 만들거나, 같은 이미지의 저장된 맵이 있으면 복원한다.
  // 맵 id는 유형(일반/특수/전략/보스) 접두사를 포함한다(예: map_normal_crimson_arena).
  function createMapFromImage(filename, url) {
    clearSelection()
    const all = useMapStore.getState().maps
    const id = mapIdFromImage(filename, mapTypeOf(imageBaseName(filename), mapCategories))
    // 같은 배경 이미지를 쓰는 저장 맵이 있으면 그것을 복원(레거시 _grid id 호환). 없으면 계산 id로.
    const existing = Object.values(all).find((m) => sameImageUrl(m.background, url)) ?? all[id]
    if (existing) {
      const copy = cloneMap(existing)
      mapRef.current = copy; setMap(copy); setDirty(false)
      undoRef.current = []; redoRef.current = []
      viewRef.current.fitted = false; fitView(); requestDraw()
      return
    }
    const buildNew = (w, h) => {
      const m = createMapDefinition({ id, name: imageBaseName(filename), imageSize: { width: w, height: h } })
      m.background = url
      mapRef.current = m; setMap(m); setDirty(true)
      undoRef.current = []; redoRef.current = []
      viewRef.current.fitted = false; fitView(); requestDraw()
    }
    const probe = new Image()
    probe.onload = () => buildNew(probe.naturalWidth || 2560, probe.naturalHeight || 1440)
    probe.onerror = () => buildNew(2560, 1440)
    probe.src = url
  }

  // 맵 불러오기 — map/ 폴더 이미지 목록을 받아 picker를 연다.
  async function openImagePicker() {
    setMapImages(await listMapImages())
    setPickerOpen(true)
  }
  // 맵 적용 모달 — map/ 폴더 이미지 전체를 받아 분류 탭으로 보여준다.
  async function openApplyModal() {
    setMapImages(await listMapImages())
    setApplyTab('all')
    setApplyHint(null)
    setApplyOpen(true)
  }
  function pickImage(img) {
    if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 다른 맵을 불러올까요?')) return
    setPickerOpen(false)
    createMapFromImage(img.name, img.url)
  }
  // 우클릭 삭제(목록) — 원본 이미지 + 그 이미지의 저장된 그리드 맵까지 함께 정리.
  async function deletePickerImage(img) {
    const type = mapTypeOf(imageBaseName(img.name), mapCategories)
    const baseId = mapIdFromImage(img.name, type)
    const gridIds = Object.keys(useMapStore.getState().maps).filter((k) => k === baseId || k.startsWith(`${baseId}_`))
    if (!window.confirm(`"${imageBaseName(img.name)}"을(를) map 폴더에서 삭제할까요?${gridIds.length ? `\n저장된 그리드 맵 ${gridIds.length}개와 맵 할당도 함께 삭제됩니다.` : ''}`)) return
    for (const id of gridIds) { removeMapEverywhere(id); await deleteMapFile(`${id}.json`) }
    await deleteMapFile(img.name)
    setMapImages(await listMapImages())
  }

  // 드래그로 다른 카테고리 탭에 떨어뜨려 맵 유형을 바꾼다.
  // → 유형 오버라이드 저장 + 저장된 그리드 맵 id 접두사 변경(파일/스토어 rename).
  async function recategorizeImage(filename, newTypeRaw) {
    const newType = newTypeRaw === 'other' ? null : newTypeRaw
    const basename = imageBaseName(filename)
    const oldType = mapTypeOf(basename, mapCategories)
    if (oldType === newType) return
    const oldBaseId = mapIdFromImage(filename, oldType)
    const newBaseId = mapIdFromImage(filename, newType)
    const allMaps = useMapStore.getState().maps
    for (const id of Object.keys(allMaps)) {
      if (id === oldBaseId || id.startsWith(`${oldBaseId}_`)) {
        const newId = newBaseId + id.slice(oldBaseId.length)
        rekeyMap(id, newId)
        await renameMapFile(`${id}.json`, `${newId}.json`)
        if (mapRef.current?.id === id) applyMap({ ...mapRef.current, id: newId }, false)
      }
    }
    setMapCategory(basename, newType)
  }

  // 저장 — 이미지 위에 그린 그리드를 같은 id(map_<type>_<slug>)로 저장한다. 저장하면 바로 "맵 적용"으로 배정 가능.
  function doSave() {
    const v = validateMap(mapRef.current)
    if (!v.ok) { window.alert('저장할 수 없습니다 — 먼저 아래 항목을 해결하세요:\n\n• ' + v.errors.join('\n• ')); return }
    const saved = saveMapStore(cloneMap(mapRef.current))
    mapRef.current = cloneMap(saved); setMap(mapRef.current); setDirty(false)
    saveMapJson(saved.id, saved).then((r) => { if (!r?.ok) console.warn('map/ 파일 저장 실패:', r?.error) })
    setNotice({
      icon: '💾',
      title: `＂${saved.name}＂ 저장 완료`,
      body: '이제부터 전투에 사용할 수 있는 맵입니다. ＂✅ 맵 적용＂에서 전투 유형에 배정하세요.',
    })
  }
  function setField(key, value) {
    applyMap({ ...mapRef.current, [key]: value }, false)
  }

  // ── 줄 추가/삭제 (캔버스 4변 +/− 버튼) ──
  function doAddLine(edge) { applyMap(addLine(mapRef.current, edge, 'playable')) }
  function doRemoveLine(edge) {
    const impact = lineRemovalImpact(mapRef.current, edge)
    if (impact.tiles > 0 || impact.objects > 0) {
      if (!window.confirm(`이 줄을 삭제하면 ${impact.tiles}개 타일과 ${impact.objects}개 오브젝트가 사라집니다. 계속할까요?`)) return
    }
    applyMap(removeLine(mapRef.current, edge))
  }

  function deleteSelectedObject() {
    if (!selObjId) return
    deleteObject(selObjId)
  }
  function updateSelectedObject(patch) {
    const next = cloneMap(mapRef.current)
    const o = next.objects.find((x) => x.id === selObjId)
    if (!o) return
    Object.assign(o, patch)
    applyMap(next, false)
  }

  // 모의 전투(테스트) — 지정 맵(없으면 현재 편집 중인 맵)으로 1회 테스트 전투(메인 진행·배정에 영향 없음).
  function startMockBattle(targetMap) {
    const m = targetMap ?? mapRef.current
    const v = validateMap(m)
    if (!v.ok) { window.alert('테스트할 수 없습니다 — 먼저 아래 항목을 해결하세요:\n\n• ' + v.errors.join('\n• ')); return }
    setTestBattleMap(cloneMap(m))
    setTestOpen(false)
  }

  // ── 오브젝트 네이티브 드래그 배치 (팔레트 → 캔버스 드롭) ──
  function onCanvasDrop(e) {
    e.preventDefault()
    const asset = dragAssetRef.current
    dragAssetRef.current = null
    if (!asset) return
    const r = canvasRef.current.getBoundingClientRect()
    const ip = canvasToImg(e.clientX - r.left, e.clientY - r.top)
    placeObjectAt(ip, asset)
  }

  const selObj = (map.objects ?? []).find((o) => o.id === selObjId) ?? null

  // 키보드 단축키 (Delete/undo/redo/Esc)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (notice) { e.preventDefault(); e.stopPropagation(); setNotice(null); return }
        if (applyOpen || pickerOpen || testOpen) { e.preventDefault(); e.stopPropagation(); setApplyOpen(false); setPickerOpen(false); setTestOpen(false); return }
        if (selectionRef.current.size) { e.preventDefault(); clearSelection(); return }
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (e.key === 'Delete') {
        if (selectionRef.current.size) deleteSelection()
        else if (selObjRef.current) deleteSelectedObject()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const PANEL_TOGGLES = [
    { id: 'info', label: '맵 정보' }, { id: 'palette', label: '브러시' },
    { id: 'object', label: '오브젝트' },
  ]

  return (
    <div className="bme">
      <div className="bme-center">
        {/* 툴바 — 불러오기/저장/적용 + 뷰/패널 토글 */}
        <div className="bme-toolbar">
          <div className="bme-toolbar-row">
            <div className="bme-toolgroup bme-toolgroup--first">
              <button className="bme-tbtn bme-tbtn--ico" onClick={openImagePicker} title="맵 불러오기 — map 폴더 이미지 선택">📂</button>
              <button className="bme-tbtn bme-tbtn--save" onClick={doSave} title="현재 맵 저장 (저장하면 바로 맵 적용 가능)">💾 저장하기{dirty ? ' *' : ''}</button>
              <button className="bme-tbtn bme-tbtn--apply" onClick={openApplyModal} title="저장된 맵을 전투 유형에 배정">✅ 맵 적용</button>
              <button className="bme-tbtn bme-tbtn--run" onClick={() => setTestOpen(true)} title="현재 맵 또는 적용된 맵으로 모의 전투 테스트">🧪 테스트</button>
              <span className="bme-tg-sep" />
              <button className="bme-tbtn bme-tbtn--ico" onClick={undo} title="실행취소 (Ctrl+Z)">↶</button>
              <button className="bme-tbtn bme-tbtn--ico" onClick={redo} title="다시실행 (Ctrl+Y)">↷</button>
              <button className="bme-tbtn bme-tbtn--ico" onClick={() => applyMap(rotateGrid(mapRef.current, -Math.PI / 12))} title="맵 좌회전 15°">⟲</button>
              <button className="bme-tbtn bme-tbtn--ico" onClick={() => applyMap(rotateGrid(mapRef.current, Math.PI / 12))} title="맵 우회전 15°">⟳</button>
              <label className="bme-toggle"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> 그리드</label>
              <input type="range" min={0.1} max={1} step={0.05} value={gridOpacity} onChange={(e) => setGridOpacity(+e.target.value)} title="그리드 투명도" />
              <input type="color" className="bme-color" value={gridColor} onChange={(e) => setGridColor(e.target.value)} title="그리드 색상" />
            </div>
            <div className="bme-toolgroup">
              <span className="bme-tg-label">패널</span>
              {PANEL_TOGGLES.map((p) => (
                <button key={p.id} className={`bme-tbtn${open[p.id] ? ' bme-tbtn--on' : ''}`} onClick={() => togglePanel(p.id)}>{p.label}</button>
              ))}
              <button className="bme-tbtn" onClick={autoArrange} title="패널을 기본 위치로 정렬">⊞ 자동정렬</button>
            </div>
            <div className="bme-toolgroup">
              <button className={`bme-tbtn${preview ? ' bme-tbtn--on' : ''}`} onClick={() => setPreview((p) => !p)} title="전투처럼 캔버스 렌더(편집 잠금)">👁 미리보기</button>
            </div>
          </div>
        </div>

        <div className="bme-canvas-wrap" ref={wrapRef} onDragOver={(e) => e.preventDefault()} onDrop={onCanvasDrop}>
          <canvas ref={canvasRef} className="bme-canvas" />
          <div className="bme-hint">
            {preview && '👁 미리보기 모드 — 편집 잠금. 우클릭 드래그=화면 이동, 휠=줌.'}
            {!preview && '좌클릭=칠하기 / 좌드래그=그리드 이동 / Shift+드래그=영역(브러시 있으면 칠하기·없으면 삭제선택) / Ctrl+클릭=개별선택 / 우클릭=삭제 / 빈칸 더블클릭=그리드 생성 / 우드래그·휠클릭=화면 이동'}
          </div>

          {/* 캔버스 4변 줄 추가/삭제 버튼 — 각 그리드 경계선 중점에 따라붙는다(positionEdgeButtons) */}
          {!preview && (
            <>
              <div className="bme-edge bme-edge--top" ref={edgeRefs.top}>
                <button className="bme-edge-btn" onClick={() => doAddLine('top')} title="위쪽 줄 추가">＋</button>
                <button className="bme-edge-btn bme-edge-btn--minus" onClick={() => doRemoveLine('top')} title="위쪽 줄 삭제">－</button>
              </div>
              <div className="bme-edge bme-edge--bottom" ref={edgeRefs.bottom}>
                <button className="bme-edge-btn" onClick={() => doAddLine('bottom')} title="아래쪽 줄 추가">＋</button>
                <button className="bme-edge-btn bme-edge-btn--minus" onClick={() => doRemoveLine('bottom')} title="아래쪽 줄 삭제">－</button>
              </div>
              <div className="bme-edge bme-edge--left" ref={edgeRefs.left}>
                <button className="bme-edge-btn" onClick={() => doAddLine('left')} title="왼쪽 열 추가">＋</button>
                <button className="bme-edge-btn bme-edge-btn--minus" onClick={() => doRemoveLine('left')} title="왼쪽 열 삭제">－</button>
              </div>
              <div className="bme-edge bme-edge--right" ref={edgeRefs.right}>
                <button className="bme-edge-btn" onClick={() => doAddLine('right')} title="오른쪽 열 추가">＋</button>
                <button className="bme-edge-btn bme-edge-btn--minus" onClick={() => doRemoveLine('right')} title="오른쪽 열 삭제">－</button>
              </div>
            </>
          )}
        </div>

        {/* ── 맵 정보 ── */}
        {open.info && (
          <FloatingPanel title="🗺 맵 정보" pos={pos.info} onMove={setPanelPos('info')} onClose={() => togglePanel('info')} defaultStyle={PANEL_DEFAULTS.info}>
            <label className="bme-field"><span>이름 <small>( {map.grid.rows} * {map.grid.cols} )</small></span>
              <input value={map.name} onChange={(e) => setField('name', e.target.value)} /></label>
            <label className="bme-field"><span>Map ID</span>
              <input value={map.id} onChange={(e) => setField('id', e.target.value)} /></label>
            <div className="bme-field">
              <span>전투 칸 수 <small>(적을수록 함선이 큼)</small></span>
              <div className="bme-res-row">
                <label>가로<input type="number" min={2} max={40} value={map.grid.cols}
                  onChange={(e) => applyMap(setGridResolution(mapRef.current, +e.target.value || 1, mapRef.current.grid.rows))} /></label>
                <label>세로<input type="number" min={2} max={40} value={map.grid.rows}
                  onChange={(e) => applyMap(setGridResolution(mapRef.current, mapRef.current.grid.cols, +e.target.value || 1))} /></label>
              </div>
              <div className="bme-res-presets">
                {[[10, 8], [12, 10], [14, 12], [16, 14]].map(([c, r]) => (
                  <button key={`${c}x${r}`} className="bme-res-preset"
                    onClick={() => applyMap(setGridResolution(mapRef.current, c, r))}>{c}×{r}</button>
                ))}
              </div>
              <div className="bme-note">배경 footprint는 그대로, 칸 수만 바뀝니다. 칸이 커지면 함선도 커져 박진감이 살아납니다(권장 10~14칸).</div>
            </div>
          </FloatingPanel>
        )}


        {/* ── 브러시 팔레트 ── */}
        {open.palette && (
          <FloatingPanel title="🖌 브러시 팔레트" pos={pos.palette} onMove={setPanelPos('palette')} onClose={() => togglePanel('palette')} defaultStyle={PANEL_DEFAULTS.palette}>
            <div className="bme-brushes">
              {BRUSHES.map((b) => (
                <button key={b.id}
                  className={`bme-brush${brush === b.id && !armedAsset ? ' bme-brush--active' : ''}`}
                  onClick={() => { setBrush(brush === b.id && !armedAsset ? null : b.id); setArmedAsset(null) }}>
                  <span className="bme-brush-sw" style={{ background: b.color }} />
                  {b.label}
                </button>
              ))}
            </div>
            <div className="bme-note">{brush && !armedAsset
              ? '좌클릭=칠하기 · Shift+드래그=영역 칠하기. 브러시를 다시 누르면 해제됩니다.'
              : '브러시 해제 상태 — Shift+드래그는 ＂삭제할 영역＂ 선택으로 동작합니다(우클릭/Delete로 삭제).'}</div>
          </FloatingPanel>
        )}

        {/* ── 오브젝트 배치 ── */}
        {open.object && (
          <FloatingPanel title="📦 오브젝트 배치" pos={pos.object} onMove={setPanelPos('object')} onClose={() => togglePanel('object')} defaultStyle={PANEL_DEFAULTS.object}>
            <div className="bme-obj-grid">
              {OBJECT_ASSETS.map((a) => (
                <button key={a.key}
                  className={`bme-obj-item${armedAsset?.key === a.key ? ' bme-obj-item--armed' : ''}`}
                  draggable
                  onDragStart={() => { dragAssetRef.current = a }}
                  onClick={() => setArmedAsset(armedAsset?.key === a.key ? null : a)}
                  title={a.key}>
                  <span className="bme-obj-emoji">{objEmoji(a.key)}</span>
                  <span className="bme-obj-name">{a.key.replace('obstacle_', '')}</span>
                </button>
              ))}
            </div>
            <div className="bme-note">{armedAsset ? `배치 대기: ${armedAsset.key} — 캔버스를 클릭하세요. 우클릭으로 삭제하면 그리드가 다시 생깁니다.` : '에셋을 선택 후 캔버스 클릭, 또는 캔버스로 드래그해 배치합니다.'}</div>
            {selObj && (
              <div className="bme-fp-block">
                <div className="bme-objprop"><span>{objEmoji(selObj.assetKey)} {selObj.assetKey} ({selObj.tileX}, {selObj.tileY})</span></div>
                <label className="bme-toggle"><input type="checkbox" checked={selObj.blocksMovement} onChange={(e) => updateSelectedObject({ blocksMovement: e.target.checked })} /> 이동 차단</label>
                <label className="bme-toggle"><input type="checkbox" checked={selObj.providesCover} onChange={(e) => updateSelectedObject({ providesCover: e.target.checked })} /> 엄폐 제공</label>
                <label className="bme-toggle"><input type="checkbox" checked={selObj.destructible} onChange={(e) => updateSelectedObject({ destructible: e.target.checked })} /> 파괴 가능</label>
                <div className="bme-row">
                  <label className="bme-field bme-field--sm"><span>w</span><input type="number" min={1} value={selObj.size?.w ?? 1} onChange={(e) => updateSelectedObject({ size: { ...selObj.size, w: Math.max(1, +e.target.value || 1) } })} /></label>
                  <label className="bme-field bme-field--sm"><span>h</span><input type="number" min={1} value={selObj.size?.h ?? 1} onChange={(e) => updateSelectedObject({ size: { ...selObj.size, h: Math.max(1, +e.target.value || 1) } })} /></label>
                </div>
                <button className="bme-btn bme-btn--danger bme-btn--wide" onClick={deleteSelectedObject}>🗑 오브젝트 삭제</button>
              </div>
            )}
          </FloatingPanel>
        )}
      </div>

      {/* ── 맵 불러오기 모달 (유형 탭 + 드래그로 카테고리 재분류, 우클릭=삭제) ── */}
      {pickerOpen && (() => {
        const TABS = [...MAP_TYPES, { id: 'other', label: '기타' }]
        const inTab = (img) => (mapTypeOf(imageBaseName(img.name), mapCategories) ?? 'other')
        const shown = mapImages.filter((img) => inTab(img) === pickerTab)
        const count = (tid) => mapImages.filter((img) => inTab(img) === tid).length
        return (
        <div className="bme-picker-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setPickerOpen(false) }}>
          <div className="bme-picker">
            <div className="bme-picker-head">
              <span className="bme-picker-title">📂 맵 불러오기</span>
              <span className="bme-modal-sub">클릭=불러오기 · 우클릭=삭제 · 카드를 다른 탭으로 드래그=유형 변경</span>
              <button className="bme-modal-x" onClick={() => setPickerOpen(false)}>✕</button>
            </div>
            <div className="bme-picker-tabs">
              {TABS.map((t) => (
                <button key={t.id}
                  className={`bme-picker-tab${pickerTab === t.id ? ' bme-picker-tab--on' : ''}`}
                  onClick={() => setPickerTab(t.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.getData('text/plain'); if (f) recategorizeImage(f, t.id) }}>
                  {t.label} <span className="bme-picker-tabn">{count(t.id)}</span>
                </button>
              ))}
            </div>
            <div className="bme-picker-body">
              <div className="bme-picker-grid">
                {mapImages.length === 0 && <div className="bme-note">map 폴더에 이미지가 없습니다. map 폴더에 배경 이미지를 직접 넣으세요. (개발 서버 필요)</div>}
                {mapImages.length > 0 && shown.length === 0 && <div className="bme-note">이 유형에 해당하는 맵이 없습니다. 다른 탭의 카드를 여기 탭으로 드래그하세요.</div>}
                {shown.map((img) => {
                  // 저장 여부/현재맵 강조는 background URL 매칭(레거시 _grid id 호환).
                  const savedMap = Object.values(maps).find((m) => sameImageUrl(m.background, img.url))
                  const id = savedMap ? savedMap.id : mapIdFromImage(img.name, mapTypeOf(imageBaseName(img.name), mapCategories))
                  return (
                    <button key={img.name} className={`bme-picker-card${id === map.id ? ' bme-picker-card--current' : ''}`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', img.name)}
                      onClick={() => pickImage(img)}
                      onContextMenu={(e) => { e.preventDefault(); deletePickerImage(img) }}>
                      <img src={img.url} className="bme-thumb-canvas" alt={img.name} loading="lazy" />
                      <div className="bme-picker-name">{imageBaseName(img.name)}{savedMap ? ' 💾' : ''}</div>
                      <div className="bme-picker-meta">{id}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ── 맵 적용(전투 배정) 모달 — 2열: 좌(분류 탭별 전체 맵) → 우(전투 유형 드롭) ── */}
      {applyOpen && (() => {
        const clsLabel = (c) => MAP_TYPES.find((t) => t.id === c)?.label ?? '기타'
        const assignedTypeOf = (id) => MAP_TYPES.find((t) => (categoryMaps[t.id] ?? []).includes(id))?.id ?? null
        // map/ 폴더 이미지 = 맵 전체 우주. 저장된 그리드 맵 존재 여부로 적용 가능 판정.
        // 매칭은 background URL 기준(레거시 _grid id 등 id 스킴이 달라도 정확히 연결).
        const savedList = Object.values(maps)
        const entries = mapImages.map((img) => {
          const base = imageBaseName(img.name)
          const cls = mapTypeOf(base, mapCategories) ?? 'other'
          const saved = savedList.find((m) => sameImageUrl(m.background, img.url))
          const id = saved ? saved.id : mapIdFromImage(img.name, cls === 'other' ? null : cls)
          return { img, base, cls, id, ready: !!saved, assigned: assignedTypeOf(id) }
        })
        const TABS = [{ id: 'all', label: '전체' }, ...MAP_TYPES, { id: 'other', label: '기타' }]
        const tabCount = (tid) => tid === 'all' ? entries.length : entries.filter((e) => e.cls === tid).length
        const readyCount = (tid) => (tid === 'all' ? entries : entries.filter((e) => e.cls === tid)).filter((e) => e.ready).length
        const shown = applyTab === 'all' ? entries : entries.filter((e) => e.cls === applyTab)
        const onDropTo = (e, type) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) assignMapToType(id, type) }
        const lockHint = (e) => setApplyHint(`"${e.base}" — 아직 맵 위에 그리드가 없습니다. 카드를 더블클릭하면 편집 화면으로 이동합니다. 그리드를 그리고 💾 저장하면 적용할 수 있어요.`)
        // 카드 더블클릭 → 해당 이미지를 편집 화면으로 불러온다(모달 닫고 이동).
        const editImage = (e) => {
          if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 이 맵을 편집할까요?')) return
          setApplyOpen(false)
          createMapFromImage(e.img.name, e.img.url)
        }
        return (
          <div className="bme-picker-overlay" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) setApplyOpen(false) }}>
            <div className="bme-apply2">
              <div className="bme-picker-head">
                <span className="bme-picker-title">✅ 맵 적용</span>
                <span className="bme-modal-sub">적용 가능한 맵을 우측 전투 유형으로 드래그하면 배정됩니다 (한 맵 = 한 유형)</span>
                <button className="bme-modal-x" onClick={() => setApplyOpen(false)}>✕</button>
              </div>
              {applyHint && (
                <div className="bme-apply2-hint">
                  <span>⚠ {applyHint}</span>
                  <button className="bme-modal-x bme-modal-x--sm" onClick={() => setApplyHint(null)}>✕</button>
                </div>
              )}
              <div className="bme-apply2-body">
                {/* 좌: 분류 탭 + 맵 카드 그리드 */}
                <div className="bme-apply2-left">
                  <div className="bme-apply2-tabs">
                    {TABS.map((t) => (
                      <button key={t.id}
                        className={`bme-apply2-tab${applyTab === t.id ? ' bme-apply2-tab--on' : ''}`}
                        onClick={() => setApplyTab(t.id)}>
                        {t.label}
                        <span className="bme-apply2-tabn">{readyCount(t.id)}/{tabCount(t.id)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="bme-apply2-grid">
                    {shown.length === 0 && <div className="bme-note">이 분류에 맵이 없습니다.</div>}
                    {shown.map((e) => (
                      <div key={e.img.name}
                        className={`bme-mapcard${e.ready ? ' bme-mapcard--ready' : ' bme-mapcard--locked'}${e.assigned ? ' bme-mapcard--assigned' : ''}`}
                        draggable={e.ready}
                        onDragStart={e.ready ? (ev) => ev.dataTransfer.setData('text/plain', e.id) : undefined}
                        onClick={() => { if (!e.ready) lockHint(e) }}
                        onDoubleClick={() => editImage(e)}
                        title={e.ready ? '드래그해 전투 유형에 배정 · 더블클릭=편집' : '그리드 미구현 — 더블클릭=편집 화면으로 이동'}>
                        <div className="bme-mapcard-thumb">
                          <img src={e.img.url} alt={e.base} loading="lazy" />
                          {!e.ready && <span className="bme-mapcard-lock">🔒</span>}
                        </div>
                        <div className="bme-mapcard-info">
                          <span className="bme-mapcard-name">{e.base}</span>
                          <span className="bme-mapcard-tags">
                            {applyTab === 'all' && <span className="bme-tag bme-tag--cls">{clsLabel(e.cls)}</span>}
                            {e.assigned && <span className="bme-tag bme-tag--assigned">▶ {clsLabel(e.assigned)}</span>}
                          </span>
                        </div>
                        <span className={`bme-mapcard-flag${e.ready ? ' bme-mapcard-flag--ok' : ''}`}>
                          {e.ready ? '적용 가능' : '그리드 미구현'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* 우: 전투 유형 4개(드롭 타깃) */}
                <div className="bme-apply2-types">
                  {MAP_TYPES.map((t) => {
                    const ids = (categoryMaps[t.id] ?? []).filter((id) => maps[id])
                    return (
                      <div key={t.id} className="bme-apply2-type"
                        onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => onDropTo(ev, t.id)}>
                        <div className="bme-apply2-typetitle">{t.label} <span className="bme-apply2-typen">{ids.length}</span></div>
                        <div className="bme-apply2-typelist">
                          {ids.length === 0 && <div className="bme-apply2-drop">여기로 드래그</div>}
                          {ids.map((id) => (
                            <div key={id} className="bme-apply2-chip" draggable
                              onDragStart={(ev) => ev.dataTransfer.setData('text/plain', id)}
                              title="다른 유형으로 드래그해 이동">
                              {maps[id]?.background ? <img src={maps[id].background} className="bme-apply2-chipimg" alt={maps[id]?.name} loading="lazy" /> : <div className="bme-apply2-chipimg" />}
                              <span className="bme-apply2-chipname">{maps[id]?.name ?? id}</span>
                              <button className="bme-apply2-unassign" title="배정 해제"
                                onClick={() => assignMapToType(id, null)}>✕</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── 테스트할 맵 선택 모달 — 현재 편집 맵 또는 적용된 맵 ── */}
      {testOpen && (() => {
        const applied = MAP_TYPES.map((t) => ({ type: t, ids: (categoryMaps[t.id] ?? []).filter((id) => maps[id]) }))
        const hasApplied = applied.some((a) => a.ids.length)
        return (
          <div className="bme-picker-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setTestOpen(false) }}>
            <div className="bme-test">
              <div className="bme-picker-head">
                <span className="bme-picker-title">🧪 테스트할 맵 선택</span>
                <button className="bme-modal-x" onClick={() => setTestOpen(false)}>✕</button>
              </div>
              <div className="bme-test-body">
                <button className="bme-test-hero" onClick={() => startMockBattle()}>
                  <div className="bme-test-hero-thumb">
                    {map.background ? <img src={map.background} alt={map.name} loading="lazy" /> : <div className="bme-test-hero-ph" />}
                    <span className="bme-test-play">▶</span>
                  </div>
                  <div className="bme-test-hero-info">
                    <span className="bme-test-hero-tag">✏️ 현재 편집 중</span>
                    <span className="bme-test-hero-name">{map.name}</span>
                    <span className="bme-test-hero-meta">{map.grid.cols}×{map.grid.rows} 칸 · 클릭해 즉시 모의 전투</span>
                  </div>
                </button>
                <div className="bme-test-sec">적용된 맵으로 테스트</div>
                {!hasApplied && <div className="bme-test-empty">아직 적용된 맵이 없습니다. ＂✅ 맵 적용＂에서 전투 유형에 배정하세요.</div>}
                {applied.map((a) => a.ids.length > 0 && (
                  <div key={a.type.id} className="bme-test-grp">
                    <div className="bme-test-grptitle">{a.type.label} <span className="bme-test-grpn">{a.ids.length}</span></div>
                    <div className="bme-test-grid">
                      {a.ids.map((id) => (
                        <button key={id} className="bme-test-card" onClick={() => startMockBattle(maps[id])}>
                          <div className="bme-test-card-thumb">
                            {maps[id]?.background ? <img src={maps[id].background} alt={maps[id]?.name} loading="lazy" /> : <div className="bme-test-card-ph" />}
                            <span className="bme-test-play">▶</span>
                          </div>
                          <span className="bme-test-card-name">{maps[id]?.name ?? id}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── 중앙 안내 모달 (저장 완료 등) ── */}
      {notice && (
        <div className="bme-notice-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setNotice(null) }}>
          <div className="bme-notice">
            <div className="bme-notice-icon">{notice.icon ?? '✅'}</div>
            <div className="bme-notice-title">{notice.title}</div>
            {notice.body && <div className="bme-notice-body">{notice.body}</div>}
            <button className="bme-notice-ok" onClick={() => setNotice(null)} autoFocus>확인</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 플로팅 패널 (헤더 드래그로 이동 · 접기/닫기) ──
function FloatingPanel({ title, pos, onMove, onClose, defaultStyle, children }) {
  const ref = useRef(null)
  const [folded, setFolded] = useState(false)
  const onHeadDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = ref.current
    const parent = el?.offsetParent
    const startLeft = el.offsetLeft, startTop = el.offsetTop
    const sx = e.clientX, sy = e.clientY
    const move = (ev) => {
      let nx = startLeft + (ev.clientX - sx)
      let ny = startTop + (ev.clientY - sy)
      if (parent) {
        nx = Math.max(0, Math.min(parent.clientWidth - 60, nx))
        ny = Math.max(0, Math.min(parent.clientHeight - 28, ny))
      }
      onMove({ x: nx, y: ny })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const style = pos ? { left: pos.x, top: pos.y } : defaultStyle
  return (
    <div className="bme-fp" ref={ref} style={style}>
      <div className="bme-fp-head" onPointerDown={onHeadDown}>
        <button className="bme-fp-fold" onPointerDown={(e) => e.stopPropagation()} onClick={() => setFolded((f) => !f)} title={folded ? '펼치기' : '접기'}>{folded ? '▸' : '▾'}</button>
        <span className="bme-fp-title">{title}</span>
        <button className="bme-fp-x" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} title="닫기">✕</button>
      </div>
      {!folded && <div className="bme-fp-body">{children}</div>}
    </div>
  )
}

// ── 헬퍼 ──
function inBounds(m, x, y) { return x >= 0 && y >= 0 && x < m.grid.cols && y < m.grid.rows }
function sameTile(a, b) { return (!a && !b) || (a && b && a.x === b.x && a.y === b.y) }
// 두 배경 URL이 같은 map/ 이미지를 가리키는지(퍼센트 인코딩 차이 허용). 저장맵 ↔ 이미지 매칭용.
function sameImageUrl(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  try { return decodeURIComponent(a) === decodeURIComponent(b) } catch { return false }
}
// 오브젝트가 점유한 모든 칸 "x,y" Set — 그리드를 가려 "오브젝트만 남은" 표현에 사용.
function objectFootprintCells(m) {
  const set = new Set()
  for (const obj of m.objects ?? []) {
    const w = obj.size?.w ?? 1, h = obj.size?.h ?? 1
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) set.add(`${obj.tileX + dx},${obj.tileY + dy}`)
  }
  return set
}
function hexToRgba(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

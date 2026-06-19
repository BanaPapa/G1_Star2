import Phaser from 'phaser'
import { computeMovementRange, findPath, manhattanDistance } from '../../core/grid'
import { resolveAttack } from '../../core/combat'
import { pickTarget, inAttackRange, planApproach } from '../../core/ai'
import { collectLineTargets } from '../../core/skills'
import { getEffectiveShip, applyEquipment, getUnitFinishers, xpRewardForVictory, canPromote } from '../../core/growth'
import { buildEncounterPlacements } from '../../core/encounter'
import { useFleetStore } from '../../state/useFleetStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useDataStore } from '../../state/useDataStore'
import { useSettingsStore } from '../../state/useSettingsStore'
import { getTerrain } from '../systems/terrain'
import { getEmojiFallback } from '../../core/assetMap'
import CutinManager from '../effects/CutinManager'
import { useBattleStore } from '../../state/useBattleStore'

// COLS/ROWS는 init()에서 gridCols/gridRows로 동적 설정된다 (기본값 20×16)
let COLS = 20
let ROWS = 16
let CELL = 80

// 기준 그리드(20×16) 좌표를 현재 COLS×ROWS로 비례 변환 (중복 제거 포함)
function scaleCells(cells) {
  const seen = new Set()
  return cells.map(([x, y]) => [
    Math.min(Math.round(x * COLS / 20), COLS - 1),
    Math.min(Math.round(y * ROWS / 16), ROWS - 1),
  ]).filter(([x, y]) => { const k = `${x},${y}`; if (seen.has(k)) return false; seen.add(k); return true })
}

// 기준 단일 좌표를 현재 그리드 크기로 변환
function scalePos(x, y) {
  return {
    x: Math.min(Math.round(x * COLS / 20), COLS - 1),
    y: Math.min(Math.round(y * ROWS / 16), ROWS - 1),
  }
}

// 지형 배치 기준 좌표 (20×16 기준)
const BASE_ASTEROID_CELLS      = [[5,2],[6,2],[5,3],[8,6],[8,7],[9,7]]
const BASE_DEBRIS_CELLS        = [[3,6],[4,6],[4,7],[7,2],[7,3]]
const BASE_NEBULA_CELLS        = [[2,4],[3,4]]
const BASE_ASTEROID_FIELD_CELLS= [[6,5],[7,5]]
const BASE_MINEFIELD_CELLS     = [[9,2],[10,3]]
const BASE_PLASMA_STORM_CELLS  = [[4,8],[5,8]]

function buildTerrainLayout(threatLevel = 1) {
  const layout = Array.from({ length: ROWS }, () => new Array(COLS).fill('empty'))

  // 위협1-2: 평지 — 소행성 2칸만 (입문, 전략 부담 최소)
  if (threatLevel <= 2) {
    for (const [x, y] of scaleCells([[5,4],[5,5]])) layout[y][x] = 'asteroid'
    return layout
  }

  // 위협3-4: 가벼운 지형 — 소행성 + 잔해 + 성운
  if (threatLevel <= 4) {
    for (const [x, y] of scaleCells([[5,2],[6,2],[8,6]])) layout[y][x] = 'asteroid'
    for (const [x, y] of scaleCells([[3,6],[4,6]]))        layout[y][x] = 'debris'
    for (const [x, y] of scaleCells([[2,4],[3,4]]))        layout[y][x] = 'nebula'
    return layout
  }

  // 위협5-6: 중간 지형 — 소행성 + 잔해 + 성운 + 소행성대
  if (threatLevel <= 6) {
    for (const [x, y] of scaleCells(BASE_ASTEROID_CELLS))       layout[y][x] = 'asteroid'
    for (const [x, y] of scaleCells(BASE_DEBRIS_CELLS))         layout[y][x] = 'debris'
    for (const [x, y] of scaleCells(BASE_NEBULA_CELLS))         layout[y][x] = 'nebula'
    for (const [x, y] of scaleCells(BASE_ASTEROID_FIELD_CELLS)) layout[y][x] = 'asteroid_field'
    return layout
  }

  // 위협7+: 풀 지형 — 지뢰밭·플라즈마 폭풍까지 포함
  for (const [x, y] of scaleCells(BASE_ASTEROID_CELLS))       layout[y][x] = 'asteroid'
  for (const [x, y] of scaleCells(BASE_DEBRIS_CELLS))         layout[y][x] = 'debris'
  for (const [x, y] of scaleCells(BASE_NEBULA_CELLS))         layout[y][x] = 'nebula'
  for (const [x, y] of scaleCells(BASE_ASTEROID_FIELD_CELLS)) layout[y][x] = 'asteroid_field'
  for (const [x, y] of scaleCells(BASE_MINEFIELD_CELLS))      layout[y][x] = 'minefield'
  for (const [x, y] of scaleCells(BASE_PLASMA_STORM_CELLS))   layout[y][x] = 'plasma_storm'
  return layout
}

// 아군/적 배치 위치는 COLS/ROWS 결정 후 생성 (init() 이후 호출)
function getAllyStartPositions() {
  return [scalePos(2, 8), scalePos(2, 10), scalePos(2, 6)]
}
function getEnemySpawnPositions() {
  return [
    scalePos(17, 7), scalePos(17, 11),
    scalePos(16, 7), scalePos(16, 10),
    scalePos(18, 8), scalePos(18, 11),
  ]
}

const SIDE_COLOR = {
  ally: { ring: 0x3ad6c4, fill: 0x123a38, label: '#3ad6c4' },
  enemy: { ring: 0xe23b4e, fill: 0x3a1820, label: '#e23b4e' },
}

const HIGHLIGHT_COLOR = 0x3ad6c4
const HIGHLIGHT_ALPHA = 0.28
const ABILITY_HIGHLIGHT_COLOR = 0xffd166
const SELECT_RING_COLOR = 0x00f0ff  // 선택 링 — 전기 사이안, 우주 테마에 어울리는 강한 발광색
const GRID_LINE_COLOR  = 0x4fb8ff  // XCOM 스타일 사이안 격자선
const GRID_LINE_ALPHA  = 0.10
const TILE_FILL_ALPHA  = 0.18      // 반투명 — 배경 성운이 바닥으로 보임
const TILE_BLOCK_ALPHA = 0.55      // 통행불가 타일은 약간 더 진하게
const ISO_TILE_RATIO = 0.92  // 기본 시야각 — 우클릭 드래그로 실시간 조정 가능

let HP_BAR_WIDTH = CELL * 0.56
const HP_BAR_HEIGHT = 4
const HP_BAR_BG_COLOR = 0x0d1520
const AP_BAR_COLOR = 0x4a90d9
const AP_BAR_BG_COLOR = 0x0d1520

// Cover block palette (impassable terrain)
const COVER_TOP    = 0x3a5a7a
const COVER_RIGHT  = 0x243e56
const COVER_LEFT   = 0x182d3f
const COVER_EDGE   = 0x6a9acc
// Selection brackets
const BRACKET_COLOR = 0x3ad6c4
const BRACKET_THICK = 2.5

const DAMAGE_TEXT_COLOR = '#ffd166'
const MISS_TEXT_COLOR = '#c8d8ff'
const HEAL_TEXT_COLOR = '#7dffb0'
const FINISHER_READY_COLOR = '#ffd166'
const FINISHER_WAIT_COLOR = '#5a6a96'
const TOGGLE_COLOR = '#8fa3d6'

const STATUS_LABEL_COLOR = '#8fa3d6'
const ACTED_ALPHA = 0.5

// TP 게이지 "가득 참" 기준값. skills.json의 필살기 발동 조건이 cost.tp = "full"(문자열)로만
// 표현되어 있고, 데이터 전반에서 진행도를 %로 표기하므로(보스 페이즈 at: "100%"/"50%" 등)
// 100을 "가득 참" = 100%로 둔다. 정확한 발동 임계값/연출은 MOD-4에서 데이터로 확정될 예정 —
// 여기서는 "턴마다 충전되는 추이"를 보여주는 표시값이다.
const TP_MAX = 100

const DELAY_NORMAL = 260
const DELAY_FAST   = 80

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene')
  }

  preload() {
    this.load.image('bg_space', '/assets/bg_space.jpg')
  }

  init({ ships, combatRules, skills, aces, enemies, items, node, gridCols, gridRows, onVictory, onExit, onEnding, onGameOver }) {
    // 그리드 크기 설정 (연구소 레벨에 따라 BattleScreen에서 결정)
    COLS = gridCols ?? 20
    ROWS = gridRows ?? 16
    // this.scene.restart()에 그대로 재전달하기 위해 보관(MOD-6: 노드·콜백도 함께 — "같은 전투 다시 시작"에 필요)
    this.initArgs = { ships, combatRules, skills, aces, enemies, items, node, gridCols, gridRows, onVictory, onExit, onEnding, onGameOver }
    this.shipsById = new Map(ships.map((s) => [s.id, s]))
    this.combatRules = combatRules
    this.allSkills = skills
    this.acesById = new Map(aces.map((a) => [a.id, a]))
    this.enemiesById = new Map((enemies?.enemies ?? []).map((e) => [e.id, e]))
    this.bossesById = new Map((enemies?.bosses ?? []).map((b) => [b.id, b]))
    // MOD-7: 장착 장비(weapons/modules/...)를 id로 한번에 조회하기 위한 맵 — 카테고리 무관하게 합친다.
    this.itemsById = new Map(
      ['weapons', 'modules', 'consumables', 'uniques'].flatMap((cat) => items?.[cat] ?? []).map((item) => [item.id, item]),
    )
    // MOD-6: 어느 노드(systems.json)의 전투인지 — 적 구성을 결정하고, 결과를 정복 상태로 돌려줄 때 쓰인다.
    this.node = node ?? null
    this.onVictory = onVictory ?? null
    this.onExit = onExit ?? null
    this.onEnding = onEnding ?? null
    this.onGameOver = onGameOver ?? null
    this.terrain = buildTerrainLayout(node?.threatLevel ?? 1)
    this.units = []
    this.selected = null
    this.highlighted = new Set()
    this.busy = false // 이동/공격/적 행동 애니메이션 동안 입력 잠금
    this.turnNumber = 1
    this.phase = 'player' // 'player' | 'enemy'
    this.pendingAbility = null // { unit, skill, presenter } — 필살기 조준 대기 상태
    this.cutinEnabled = useSettingsStore.getState().cutinEnabled // 설정에서 초기값 읽기(MOD-12)
    this.autoBattle = useBattleStore.getState().autoBattle

    // MOD-5: 아군은 useFleetStore의 로스터(레벨·성장치·전직 여부 보유)를 그대로 가져와 생성한다 —
    // 전투 사이에도 성장이 영구 보존되며, 승리 시 이 스토어에 XP를 돌려준다.
    this.roster = useFleetStore.getState().roster
    this.battleEnded = false
    this.defeatedEnemyShips = [] // 격파한 적의 베이스 함선 데이터 — 승리 보상 XP 계산에 사용
    this.bossPhase2Triggered = new Set() // MOD-11: 보스 페이즈 2 전환 중복 방지
  }

  create() {
    // ── 아이소메트릭 타일 크기 계산 ─────────────────────────────────
    // 그리드 시각 폭: (COLS + ROWS - 2) * hw = 20 * hw
    // 그리드 시각 높: (COLS + ROWS) * hh     = 22 * hh  (각 타일 상하 팁 포함)
    const HUD_TOP    = 62   // 상단 HUD 여백
    const MARGIN_BOT = 18   // 하단 여백
    const availW = this.scale.width  * 0.98
    const availH = this.scale.height - HUD_TOP - MARGIN_BOT

    // 화면 최적 크기의 1.5× — 그리드가 화면보다 커지며 카메라 드래그로 탐색
    const screenFitHw = Math.min(
      Math.floor(availW / (COLS + ROWS - 2)),
      Math.floor(availH / (COLS + ROWS) / ISO_TILE_RATIO),
    )
    const iso_hw = Math.max(44, Math.floor(screenFitHw * 1.5))
    const iso_hh = Math.round(iso_hw * ISO_TILE_RATIO)

    CELL = iso_hw
    HP_BAR_WIDTH = Math.round(iso_hw * 1.6)

    // ── 그리드 중앙 정렬 ────────────────────────────────────────────
    // cx/cy = 그리드 중심 (COLS/2, ROWS/2) 의 화면 좌표
    // 회전 시에도 이 점이 화면 중앙에 고정된다
    const gridFullH  = (COLS + ROWS) * iso_hh
    const topPad     = Math.max(0, (availH - gridFullH) / 2)
    this.iso = {
      hw: iso_hw,
      hh: iso_hh,
      cx: Math.round(this.scale.width / 2),
      cy: Math.round(HUD_TOP + iso_hh + topPad + (COLS + ROWS) / 2 * iso_hh),
    }

    // ── 우주 배경 이미지 (월드 좌표 + 시차) ─────────────────────────
    // 그리드 중앙에 배치, 화면의 3배 크기로 카메라 이동 여유 확보
    // scrollFactor(0.15) → 카메라가 100px 이동 시 배경은 15px만 이동(원근감/몰입감)
    const bgCX = this.iso.cx
    const bgCY = this.iso.cy
    const bg = this.add.image(bgCX, bgCY, 'bg_space')
    bg.setDisplaySize(this.scale.width * 3.2, this.scale.height * 3.2)
    bg.setDepth(-10).setScrollFactor(0.15).setAlpha(0.92)

    // ── 그리드 타일 생성 ─────────────────────────────────────────
    this.cellRects = []
    for (let y = 0; y < ROWS; y += 1) {
      const row = []
      for (let x = 0; x < COLS; x += 1) row.push(this.createCell(x, y))
      this.cellRects.push(row)
    }

    // 선택 브래킷·타겟팅 라인용 그래픽 레이어
    this.selectionGfx = null
    this.targetingGfx = null

    const allyStartPos = getAllyStartPositions()
    const allyPlacements = this.roster.map((entry, index) => {
      const pos = allyStartPos[index % allyStartPos.length]
      return { side: 'ally', instanceId: entry.instanceId, shipId: entry.shipId, aceId: entry.aceId, x: pos.x, y: pos.y }
    })
    const enemyPlacements = buildEncounterPlacements(this.node, {
      enemiesById: this.enemiesById,
      bossesById: this.bossesById,
      shipsById: this.shipsById,
      positions: getEnemySpawnPositions(),
    })
    ;[...allyPlacements, ...enemyPlacements].forEach((placement) => this.spawnUnit(placement))

    // ── HUD (카메라 스크롤에 고정) ────────────────────────────────
    this.hudText = this.add.text(16, 12, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '14px',
      color: '#cdd8f4',
    }).setScrollFactor(0).setDepth(20)
    this.actionChips = []

    this.cutinToggleText = this.add
      .text(this.scale.width - 16, 34, '', {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '13px',
        color: TOGGLE_COLOR,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0).setDepth(20)
      .setInteractive({ useHandCursor: true })
    this.cutinToggleText.on('pointerup', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation()
      if (this._isDragging) return
      this.cutinEnabled = !this.cutinEnabled
      useSettingsStore.getState().setCutinEnabled(this.cutinEnabled)
      this.refreshCutinToggleLabel()
    })
    this.refreshCutinToggleLabel()

    // ── 카메라 드래그 스크롤 (XCOM 스타일) ───────────────────────
    // 그리드 전체가 카메라 월드보다 크게 설정되므로 드래그로 탐색 가능
    const camMargin = iso_hw * 3
    // 360° 회전 + 줌아웃(최소 0.35×)을 감안해 중심 대칭으로 넉넉하게 설정
    const halfW = (COLS + ROWS) * iso_hw + camMargin * 4
    const halfH = (COLS + ROWS) * iso_hh + camMargin * 4
    this.cameras.main.setBounds(
      this.iso.cx - halfW, this.iso.cy - halfH,
      halfW * 2, halfH * 2,
    )
    // 카메라 초기 위치: 그리드 중앙
    this.cameras.main.centerOn(this.iso.cx, this.iso.cy)

    this._isDragging   = false
    this._dragOriginX  = 0
    this._dragOriginY  = 0
    this._dragScrollX  = 0
    this._dragScrollY  = 0
    this.viewAngle     = 1.0        // 우클릭 Y드래그: pitch (상하 시야각)
    this.viewRotation  = Math.PI / 4  // 우클릭 X드래그: yaw (좌우 회전, 기본 45°)
    this._rightDrag    = null  // { startX, startY, startAngle, startRotation }

    // 브라우저 우클릭 컨텍스트 메뉴 억제
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    this.input.on('pointerdown', (p) => {
      if (p.rightButtonDown()) {
        // 우클릭: 시야각(Y) + 좌우 회전(X) 드래그 시작
        this._rightDrag = { startX: p.x, startY: p.y, startAngle: this.viewAngle, startRotation: this.viewRotation }
        return
      }
      // 좌클릭: 카메라 드래그
      this._isDragging  = false
      this._dragOriginX = p.x
      this._dragOriginY = p.y
      this._dragScrollX = this.cameras.main.scrollX
      this._dragScrollY = this.cameras.main.scrollY
    })
    this.input.on('pointermove', (p) => {
      // 우클릭 드래그: Y → pitch(상하), X → yaw(좌우 회전)
      if (this._rightDrag) {
        if (!p.rightButtonDown()) { this._rightDrag = null; return }
        const dy = p.y - this._rightDrag.startY
        const dx = p.x - this._rightDrag.startX
        // pitch: 0.3(탑뷰에 가까움) ~ 1.05(표준 아이소) — 옆면 노출 방지
        // 위로 드래그 = 탑뷰, 아래로 드래그 = 사이드뷰 (일반적인 오빗 카메라 관례)
        const newAngle = Phaser.Math.Clamp(this._rightDrag.startAngle + dy * 0.004, 0.3, 1.05)
        // yaw: 360° 자유 회전 (wrap-around)
        const rawRot = this._rightDrag.startRotation - dx * 0.005
        const newRotation = ((rawRot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        const changed = Math.abs(newAngle - this.viewAngle) > 0.01 || Math.abs(newRotation - this.viewRotation) > 0.005
        if (changed) {
          this.viewAngle = newAngle
          this.viewRotation = newRotation
          this.rebuildTileGeometry()
        }
        return
      }
      // 좌클릭 드래그: 카메라 스크롤
      if (!p.leftButtonDown()) return
      const dx = p.x - this._dragOriginX
      const dy = p.y - this._dragOriginY
      if (!this._isDragging && (Math.abs(dx) > 7 || Math.abs(dy) > 7)) {
        this._isDragging = true
      }
      if (this._isDragging) {
        this.cameras.main.setScroll(
          this._dragScrollX - dx,
          this._dragScrollY - dy,
        )
      }
    })
    this.input.on('pointerup', () => {
      if (this._rightDrag) { this._rightDrag = null; return }
      // 50ms 후 isDragging 해제 — pointerup 에 등록된 다른 핸들러들이 먼저 실행된 뒤 초기화
      this.time.delayedCall(50, () => { this._isDragging = false })
    })

    // 마우스 휠 줌 (Ctrl+휠도 동일하게 처리)
    this.zoomLevel = 1.0
    this.input.on('wheel', (_p, _go, _dx, deltaY) => {
      const step = deltaY > 0 ? -0.1 : 0.1
      this.zoomLevel = Phaser.Math.Clamp(this.zoomLevel + step, 0.35, 2.5)
      this.cameras.main.setZoom(this.zoomLevel)
    })

    // 자동전투 토글은 React UI(BattleScreen)에서 관리 — 스토어 변경을 구독해 this.autoBattle 동기화
    this._unsubAutoBattle = useBattleStore.subscribe((state) => {
      const v = state.autoBattle
      if (v === this.autoBattle) return
      this.autoBattle = v
      if (v && this.phase === 'player' && !this.busy && !this.battleEnded) {
        this.pendingAbility = null
        this.clearSelection()
        this.time.delayedCall(this.actionDelay, () => this.runAllyAutoTurn(0))
      }
    })

    this.cutinManager = new CutinManager(this)

    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.phase !== 'player' || this.busy || this.battleEnded) return
      this.endPlayerPhase()
    })

    this.startPlayerPhase()
  }

  // 전투 속도 설정에 따른 적 행동 딜레이(ms) — 설정 화면에서 변경 즉시 반영된다.
  get actionDelay() {
    return useSettingsStore.getState().battleSpeed === 'fast' ? DELAY_FAST : DELAY_NORMAL
  }

  refreshCutinToggleLabel() {
    this.cutinToggleText.setText(
      this.cutinEnabled
        ? '🎬 컷인 연출 ON (클릭 시 끄기)'
        : '⏩ 컷인 연출 OFF — 결과만 즉시 적용 (클릭 시 켜기)',
    )
  }

  // ----- 좌표 변환 (아이소메트릭 + yaw 회전) -----
  // rot = PI/4 일 때 기존 45° 표준 아이소와 동일
  // rot → 0 : 동쪽에서 바라보는 뷰, rot → PI/2 : 남쪽에서 바라보는 뷰
  cellToWorld(x, y) {
    const rot = this.viewRotation ?? Math.PI / 4
    const hw  = this.iso.hw
    const hh  = this.iso.hh
    const s   = Math.SQRT2
    const gx  = x - COLS / 2   // 그리드 중심 기준 상대 좌표
    const gy  = y - ROWS / 2
    return {
      px: this.iso.cx + (gx * Math.cos(rot) - gy * Math.sin(rot)) * hw * s,
      py: this.iso.cy + (gx * Math.sin(rot) + gy * Math.cos(rot)) * hh * s,
    }
  }

  // ----- 그리드 셀 (아이소메트릭 마름모 — Graphics 방식: WebGL 삼각분할 선 없음) -----
  createCell(x, y) {
    const terrain = getTerrain(this.terrain[y][x])
    const { px, py } = this.cellToWorld(x, y)
    const hw = this.iso.hw
    const hh = this.iso.hh
    const baseAlpha = terrain.passable ? TILE_FILL_ALPHA : TILE_BLOCK_ALPHA

    // Graphics 객체 — fill + stroke를 직접 경로로 그려 삼각분할 아티팩트 없음
    const g = this.add.graphics()
    this._redrawTile(g, x, y, terrain.color, baseAlpha, GRID_LINE_ALPHA)
    g.setDepth(0)
    g.setData('baseColor', terrain.color)
    g.setData('baseAlpha', baseAlpha)

    // 충돌 판정: 회전을 반영한 마름모 폴리곤 히트 영역
    const hitGeom = this._makeTileHitGeom(x, y)
    g.setInteractive({ hitArea: hitGeom, hitAreaCallback: Phaser.Geom.Polygon.Contains, useHandCursor: true })
    g.setData('hitArea', hitGeom)

    g.on('pointerup', () => { if (!this._isDragging && !this._rightDrag) this.handleCellClick(x, y) })
    g.on('pointerover', () => {
      if (!this.highlighted.has(`${x},${y}`)) {
        this._redrawTile(g, x, y, g.getData('baseColor'), g.getData('baseAlpha'), 0.42)
      }
      if (terrain.id !== 'empty' && !this.selected && !this.pendingAbility && !this.busy)
        this.hudText.setText(`[지형] ${terrain.label}  —  ${terrain.desc}`)
    })
    g.on('pointerout', () => {
      if (!this.highlighted.has(`${x},${y}`)) {
        this._redrawTile(g, x, y, g.getData('baseColor'), g.getData('baseAlpha'), GRID_LINE_ALPHA)
      }
      if (terrain.id !== 'empty' && !this.selected && !this.pendingAbility && !this.busy)
        this.refreshHud()
    })

    // 지형 글리프 (작게)
    if (terrain.glyph && terrain.passable) {
      const gs = Math.max(10, Math.floor(hw * 0.44))
      const t = this.add.text(px, py - hh * 0.15, terrain.glyph, { fontSize: `${gs}px` })
        .setOrigin(0.5).setAlpha(0.7).setDepth(1)
      if (!this.terrainGlyphList) this.terrainGlyphList = []
      this.terrainGlyphList.push(t)
    }

    // 통행 불가 지형 → 아이소메트릭 엄폐물 블록
    if (!terrain.passable) this.drawCoverBlock(px, py)

    return g
  }

  // 현재 viewRotation 기준으로 타일 (x,y) 의 히트 폴리곤을 생성/갱신
  _makeTileHitGeom(x, y) {
    const { px: tx, py: ty } = this.cellToWorld(x - 0.5, y - 0.5)
    const { px: rx, py: ry } = this.cellToWorld(x + 0.5, y - 0.5)
    const { px: bx, py: by } = this.cellToWorld(x + 0.5, y + 0.5)
    const { px: lx, py: ly } = this.cellToWorld(x - 0.5, y + 0.5)
    return new Phaser.Geom.Polygon([tx, ty, rx, ry, bx, by, lx, ly])
  }

  // 타일 경로 재그리기 헬퍼 — 그리드 좌표(gridX, gridY)를 받아 꼭짓점을 cellToWorld로 계산
  // yaw 회전 후에도 정확한 마름모 형태를 유지한다
  _redrawTile(g, gridX, gridY, fillColor, fillAlpha, lineAlpha,
              lineColor = GRID_LINE_COLOR, lineWidth = 0.8) {
    const { px: tx, py: ty } = this.cellToWorld(gridX - 0.5, gridY - 0.5)  // 상단
    const { px: rx, py: ry } = this.cellToWorld(gridX + 0.5, gridY - 0.5)  // 우측
    const { px: bx, py: by } = this.cellToWorld(gridX + 0.5, gridY + 0.5)  // 하단
    const { px: lx, py: ly } = this.cellToWorld(gridX - 0.5, gridY + 0.5)  // 좌측
    g.clear()
    g.fillStyle(fillColor, fillAlpha)
    g.lineStyle(lineWidth, lineColor, lineAlpha)
    g.beginPath()
    g.moveTo(tx, ty)
    g.lineTo(rx, ry)
    g.lineTo(bx, by)
    g.lineTo(lx, ly)
    g.closePath()
    g.fillPath()
    g.strokePath()
  }

  // 아이소메트릭 3D 엄폐물 블록 (상면 + 우면 + 좌면)
  drawCoverBlock(px, py) {
    const hw = this.iso.hw * 0.62
    const hh = this.iso.hh * 0.62
    const lift = hh * 1.5  // 블록 높이

    const g = this.add.graphics().setDepth(2)
    if (!this.coverBlockGfxList) this.coverBlockGfxList = []
    this.coverBlockGfxList.push(g)

    // 상면 (마름모)
    g.fillStyle(COVER_TOP, 1)
    g.beginPath()
    g.moveTo(px,      py - hh - lift)
    g.lineTo(px + hw, py      - lift)
    g.lineTo(px,      py + hh - lift)
    g.lineTo(px - hw, py      - lift)
    g.closePath()
    g.fillPath()

    // 우면
    g.fillStyle(COVER_RIGHT, 1)
    g.beginPath()
    g.moveTo(px + hw, py      - lift)
    g.lineTo(px + hw, py)
    g.lineTo(px,      py + hh)
    g.lineTo(px,      py + hh - lift)
    g.closePath()
    g.fillPath()

    // 좌면
    g.fillStyle(COVER_LEFT, 1)
    g.beginPath()
    g.moveTo(px - hw, py      - lift)
    g.lineTo(px,      py - hh - lift)
    g.lineTo(px,      py - hh)
    g.lineTo(px - hw, py)
    g.closePath()
    g.fillPath()

    // 윤곽선
    g.lineStyle(1, COVER_EDGE, 0.5)
    g.beginPath()
    g.moveTo(px,      py - hh - lift)
    g.lineTo(px + hw, py      - lift)
    g.lineTo(px,      py + hh - lift)
    g.lineTo(px - hw, py      - lift)
    g.closePath()
    g.strokePath()

    g.lineStyle(1, COVER_EDGE, 0.3)
    g.beginPath(); g.moveTo(px + hw, py - lift); g.lineTo(px + hw, py); g.strokePath()
    g.beginPath(); g.moveTo(px - hw, py - lift); g.lineTo(px - hw, py); g.strokePath()
    g.beginPath(); g.moveTo(px, py + hh - lift); g.lineTo(px, py + hh); g.strokePath()
  }

  // ----- 유닛 -----
  spawnUnit(placement) {
    // 아군은 ships.json에서 shipId로 조회하지만, 적은 core/encounter.js가 enemies.json+ships.json을
    // 합성해 만든 ship 객체를 placement.ship으로 직접 들고 온다(MOD-6: ships.json에 없는 적 함선).
    const baseShip = placement.ship ?? this.shipsById.get(placement.shipId)
    if (!baseShip) return

    const palette = SIDE_COLOR[placement.side]
    const { px, py } = this.cellToWorld(placement.x, placement.y)
    const hw = this.iso.hw
    const radius = Math.max(14, Math.round(hw * 0.44))

    const ace = placement.aceId ? this.acesById.get(placement.aceId) ?? null : null
    // MOD-5: 아군(instanceId 보유)은 로스터 성장치·전직 보너스를 합성한 "현재 실전 스탯"으로 생성하고,
    // 에이스 필살기 + 전직 함선 고유 필살기를 함께(복수) 보유할 수 있다. 적은 베이스 스탯 그대로.
    const entry = placement.instanceId ? (this.roster.find((e) => e.instanceId === placement.instanceId) ?? null) : null
    // MOD-7: 성장·전직 보너스 위에 장착 무기·모듈(items.json mods)을 추가로 합산한 "최종 실전 스탯".
    const ship = entry ? applyEquipment(getEffectiveShip(baseShip, entry), entry, this.itemsById) : baseShip
    const finishers = entry ? getUnitFinishers({ ace, ship: baseShip, entry, allSkills: this.allSkills }) : []

    // 유닛 본체 — 아이소메트릭 분위기에 맞게 더 작은 원 + 강한 테두리
    const ring = this.add.circle(0, 0, radius, palette.fill)
    ring.setStrokeStyle(2.5, palette.ring, 0.95)

    // 이모지 — 타일 크기에 비례
    const glyphPx = Math.max(14, Math.round(hw * 0.62))
    const glyph = this.add.text(0, 0, getEmojiFallback(ship.sprite), {
      fontSize: `${glyphPx}px`,
    }).setOrigin(0.5, 0.5)

    // HP 바 (유닛 바로 위) — 배경 + 전면
    const barOffY = -radius - 6
    const hpBarBg = this.add.rectangle(0, barOffY, HP_BAR_WIDTH, HP_BAR_HEIGHT, HP_BAR_BG_COLOR)
      .setOrigin(0.5, 0.5)
    const hpBarFg = this.add.rectangle(-HP_BAR_WIDTH / 2, barOffY, HP_BAR_WIDTH, HP_BAR_HEIGHT, palette.ring)
      .setOrigin(0, 0.5)

    // AP 바 (HP 바 위) — 파란색
    const apBarOffY = barOffY - HP_BAR_HEIGHT - 3
    const apBarBg = this.add.rectangle(0, apBarOffY, HP_BAR_WIDTH, HP_BAR_HEIGHT - 1, AP_BAR_BG_COLOR)
      .setOrigin(0.5, 0.5)
    const apBarFg = this.add.rectangle(-HP_BAR_WIDTH / 2, apBarOffY, HP_BAR_WIDTH, HP_BAR_HEIGHT - 1, AP_BAR_COLOR)
      .setOrigin(0, 0.5)

    // 이름 레이블 (하단, 선택 시만 표시)
    const levelPart = entry ? ` Lv.${ship.level}` : ''
    const acePart = ace ? ` · ${ace.name}` : ''
    const labelText = `${ship.name}${levelPart}${acePart}`
    const label = this.add.text(0, radius + 4, labelText, {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: `${Math.max(8, Math.round(hw * 0.24))}px`,
      color: palette.label,
    }).setOrigin(0.5, 0).setAlpha(0)

    // 상태 레이블 (AP/TP 숫자, 선택 시만 표시)
    const statusLabel = this.add.text(0, radius + 4 + Math.max(8, Math.round(hw * 0.24)) + 2, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: `${Math.max(7, Math.round(hw * 0.2))}px`,
      color: STATUS_LABEL_COLOR,
    }).setOrigin(0.5, 0).setAlpha(0)

    const container = this.add.container(px, py, [ring, hpBarBg, hpBarFg, apBarBg, apBarFg, glyph, label, statusLabel])
    container.setSize(radius * 2, radius * 2)
    container.setDepth(4)  // 커버 블록(depth 2) 위에 표시
    container.setInteractive({ useHandCursor: true })

    const unit = {
      side: placement.side,
      ship,
      baseShip,
      instanceId: placement.instanceId ?? null,
      gridX: placement.x,
      gridY: placement.y,
      hp: ship.hp,
      maxHp: ship.hp,
      ap: ship.ap,
      maxAp: ship.ap,
      tp: 0,
      tpPerTurn: ship.tpPerTurn,
      shield: 0,
      apDebuff: 0,
      ace,
      finishers,
      container,
      ring,
      hpBarFg,
      apBarFg,
      label,
      statusLabel,
    }
    container.on('pointerup', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation()
      if (!this._isDragging) this.handleUnitClick(unit)
    })

    this.units.push(unit)
    this.refreshUnitStatusLabel(unit)
    return unit
  }

  // ----- 입력 처리 -----
  handleUnitClick(unit) {
    if (this.busy || this.phase !== 'player' || this.battleEnded || this.autoBattle) return

    if (unit.side !== 'ally') {
      this.handleEnemyClick(unit)
      return
    }

    if (this.pendingAbility) {
      // 필살기 조준 중 — 같은 유닛을 다시 클릭하면 취소, 다른 아군 클릭은 무시
      if (this.pendingAbility.unit === unit) this.cancelPendingAbility()
      return
    }

    if (unit.ap <= 0) {
      this.refreshHud(
        `${unit.ship.name} — AP를 모두 사용해 더 이상 행동할 수 없습니다. 다른 유닛을 선택하거나 스페이스바로 턴을 종료하세요.`,
      )
      return
    }

    if (this.selected === unit) {
      this.clearSelection()
      return
    }
    this.selectUnit(unit)
  }

  handleEnemyClick(enemy) {
    if (this.pendingAbility) {
      const { unit, skill, presenter } = this.pendingAbility
      if (skill.target === 'single') {
        this.launchFinisher(unit, skill, [enemy], presenter)
      } else if (skill.target === 'line') {
        this.tryFireLine(unit, skill, { x: enemy.gridX, y: enemy.gridY }, presenter)
      }
      return
    }

    const attacker = this.selected
    if (!attacker) {
      this.refreshHud(
        `${enemy.ship.name} (적) — HP ${enemy.hp}/${enemy.maxHp} · ATK ${enemy.ship.atk} DEF ${enemy.ship.def} ACC ${enemy.ship.acc} EVA ${enemy.ship.eva} (공격하려면 먼저 아군 유닛을 선택하세요)`,
      )
      return
    }

    const distance = manhattanDistance({ x: attacker.gridX, y: attacker.gridY }, { x: enemy.gridX, y: enemy.gridY })
    const [minRng, maxRng] = attacker.ship.rng

    if (distance < minRng || distance > maxRng) {
      this.refreshHud(
        `${attacker.ship.name}의 사거리(${minRng}-${maxRng}칸) 밖입니다 — 대상까지 거리 ${distance}칸. 이동 후 다시 시도하세요.`,
      )
      return
    }

    this.resolveCombat(attacker, enemy)
  }

  handleCellClick(x, y) {
    if (this.busy || this.phase !== 'player' || this.battleEnded || this.autoBattle) return

    if (this.pendingAbility) {
      const { unit, skill, presenter } = this.pendingAbility
      if (skill.target === 'line') this.tryFireLine(unit, skill, { x, y }, presenter)
      return
    }

    if (!this.selected) return
    if (this.highlighted.has(`${x},${y}`)) {
      this.moveSelectedTo(x, y)
    } else {
      this.clearSelection()
    }
  }

  // ----- 선택 & 이동범위 하이라이트 -----
  selectUnit(unit) {
    this.clearSelection()
    this.selected = unit
    unit.ring.setStrokeStyle(4, SELECT_RING_COLOR, 1)
    unit.label?.setAlpha(1)
    unit.statusLabel?.setAlpha(1)
    // 선택 링 펄스 — 스케일+알파로 발광하는 깜빡임
    unit._selectionTween = this.tweens.add({
      targets: unit.ring,
      alpha: 0.35,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 680,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const range = computeMovementRange({ x: unit.gridX, y: unit.gridY }, unit.ship.mov, (cx, cy) =>
      this.isPassable(cx, cy),
    )
    for (const { x, y } of range) {
      this.highlighted.add(`${x},${y}`)
      this.setCellHighlight(x, y, true, HIGHLIGHT_COLOR)
    }

    this.drawSelectionIndicator(unit)
    this.refreshActionMenu()
    this.refreshHud(
      `선택: ${unit.ship.name} (MOV ${unit.ship.mov} · AP ${unit.ap}/${unit.maxAp}) — 이동 가능 ${range.length}칸. ` +
        `칸을 클릭하면 이동(AP -1), 사거리 안의 적을 클릭하면 공격(AP -1)합니다.`,
    )
  }

  clearSelection() {
    if (this.selected) {
      // ring 펄스 tween 종료 + 상태 복원
      if (this.selected._selectionTween) {
        this.tweens.killTweensOf(this.selected.ring)
        this.selected._selectionTween = null
        this.selected.ring.setAlpha(1).setScale(1)
      }
      const palette = SIDE_COLOR[this.selected.side]
      this.selected.ring.setStrokeStyle(2, palette.ring, 0.9)
      this.selected.label?.setAlpha(0)
      this.selected.statusLabel?.setAlpha(0)
    }
    this.removeSelectionIndicator()
    this.clearHighlights()
    this.selected = null
    this.pendingAbility = null
    this.refreshActionMenu()
    this.refreshHud()
  }

  // 유닛 바닥 글로우 다이아몬드 — 타일 위에 빛나는 선택 표시 (yaw 회전 반영)
  drawSelectionIndicator(unit) {
    this.removeSelectionIndicator()
    const gx = unit.gridX
    const gy = unit.gridY

    const g = this.add.graphics().setDepth(3)  // 유닛(4) 아래, 타일(0) 위

    const drawRing = (halfSize, lineWidth, alpha) => {
      const h = halfSize
      const { px: tx, py: ty } = this.cellToWorld(gx - h, gy - h)
      const { px: rx, py: ry } = this.cellToWorld(gx + h, gy - h)
      const { px: bx, py: by } = this.cellToWorld(gx + h, gy + h)
      const { px: lx, py: ly } = this.cellToWorld(gx - h, gy + h)
      g.lineStyle(lineWidth, BRACKET_COLOR, alpha)
      g.beginPath()
      g.moveTo(tx, ty)
      g.lineTo(rx, ry)
      g.lineTo(bx, by)
      g.lineTo(lx, ly)
      g.closePath()
      g.strokePath()
    }

    drawRing(0.45, 2.5, 1.0)   // 외곽 링
    drawRing(0.36, 1.0, 0.55)  // 중간 링
    drawRing(0.24, 1.0, 0.28)  // 내부 링

    this.selectionGfx = g
  }

  removeSelectionIndicator() {
    if (this.selectionGfx) {
      this.tweens.killTweensOf(this.selectionGfx)
      this.selectionGfx.destroy()
      this.selectionGfx = null
    }
  }

  // 우클릭 드래그 시야각 변경 후 타일 지오메트리 재계산
  rebuildTileGeometry() {
    const baseHh = Math.round(this.iso.hw * ISO_TILE_RATIO)
    this.iso.hh = Math.round(baseHh * this.viewAngle)
    const hw = this.iso.hw
    const hh = this.iso.hh

    // 타일 Graphics 경로 + 히트 영역 갱신
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const g = this.cellRects[y][x]
        const baseColor = g.getData('baseColor')
        const baseAlpha = g.getData('baseAlpha')
        const isHl = this.highlighted.has(`${x},${y}`)
        const hlColor = this.pendingAbility ? ABILITY_HIGHLIGHT_COLOR : HIGHLIGHT_COLOR
        if (isHl) {
          this._redrawTile(g, x, y, hlColor, HIGHLIGHT_ALPHA, 0.9, hlColor, 1.5)
        } else {
          this._redrawTile(g, x, y, baseColor, baseAlpha, GRID_LINE_ALPHA)
        }
        // 히트 영역을 회전된 꼭짓점으로 교체
        const { px: tx, py: ty } = this.cellToWorld(x - 0.5, y - 0.5)
        const { px: rx, py: ry } = this.cellToWorld(x + 0.5, y - 0.5)
        const { px: bx, py: by } = this.cellToWorld(x + 0.5, y + 0.5)
        const { px: lx, py: ly } = this.cellToWorld(x - 0.5, y + 0.5)
        const hitGeom = g.getData('hitArea')
        if (hitGeom) hitGeom.setTo([tx, ty, rx, ry, bx, by, lx, ly])
      }
    }

    // 엄폐물 블록 재생성
    this.coverBlockGfxList?.forEach((b) => b.destroy())
    this.coverBlockGfxList = []
    // 지형 글리프 재생성
    this.terrainGlyphList?.forEach((t) => t.destroy())
    this.terrainGlyphList = []
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const terrain = getTerrain(this.terrain[y][x])
        const { px, py } = this.cellToWorld(x, y)
        if (terrain.glyph && terrain.passable) {
          const gs = Math.max(10, Math.floor(hw * 0.44))
          const t = this.add.text(px, py - hh * 0.15, terrain.glyph, { fontSize: `${gs}px` })
            .setOrigin(0.5).setAlpha(0.7).setDepth(1)
          this.terrainGlyphList.push(t)
        }
        if (!terrain.passable) this.drawCoverBlock(px, py)
      }
    }

    // 유닛 위치 갱신
    for (const unit of this.units) {
      const { px, py } = this.cellToWorld(unit.gridX, unit.gridY)
      unit.container.setPosition(px, py)
    }

    // 선택 표시 갱신
    if (this.selected) this.drawSelectionIndicator(this.selected)
  }

  clearHighlights() {
    for (const key of this.highlighted) {
      const [x, y] = key.split(',').map(Number)
      this.setCellHighlight(x, y, false)
    }
    this.highlighted.clear()
  }

  setCellHighlight(x, y, on, color = HIGHLIGHT_COLOR) {
    const g = this.cellRects[y][x]
    if (on) {
      this._redrawTile(g, x, y, color, HIGHLIGHT_ALPHA, 0.9, color, 1.5)
    } else {
      const baseAlpha = g.getData('baseAlpha') ?? TILE_FILL_ALPHA
      this._redrawTile(g, x, y, g.getData('baseColor'), baseAlpha, GRID_LINE_ALPHA)
    }
  }

  // ----- 행동 메뉴 (필살기 발동 칩) -----
  // dev_plan_guide.md MOD-4 요청 예시: "필살기 FINISHER·TP" 버튼이 TP가 가득 차면 활성화/점멸한다.
  // 통상 스킬(type:"active")은 skills.js의 getUsableSkills로 조회 가능하지만, 이번 모듈의 DoD·테스트는
  // 모두 필살기·컷인에 집중되어 있어(통상 스킬은 버프 지속시간/반격 트리거 등 데이터에 없는 세부 규칙을
  // 새로 정의해야 함) 이번 메뉴는 필살기 발동에만 집중했다 — 보고서에 그대로 공개한다.
  refreshActionMenu() {
    this.actionChips?.forEach((chip) => chip.destroy())
    this.actionChips = []

    const unit = this.selected
    if (!unit || unit.side !== 'ally' || !unit.finishers?.length) return

    const ready = unit.tp >= TP_MAX
    unit.finishers.forEach((finisherEntry, index) => {
      const { skill, presenterName } = finisherEntry
      const label = ready
        ? `✨ [${presenterName}] 필살기 "${skill.name}" 발동 가능! — 클릭해서 사용`
        : `${presenterName}의 필살기 "${skill.name}" — TP ${Math.round((unit.tp / TP_MAX) * 100)}% (가득 차면 발동)`

      const chip = this.add
        .text(16, 34 + index * 19, label, {
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '13px',
          fontStyle: ready ? 'bold' : 'normal',
          color: ready ? FINISHER_READY_COLOR : FINISHER_WAIT_COLOR,
        })
        .setDepth(22).setScrollFactor(0)

      if (ready) {
        chip.setInteractive({ useHandCursor: true })
        chip.on('pointerup', (_pointer, _lx, _ly, event) => {
          event?.stopPropagation()
          if (!this._isDragging) this.beginFinisherTargeting(unit, finisherEntry)
        })
        this.tweens.add({ targets: chip, alpha: 0.4, duration: 480, yoyo: true, repeat: -1 })
      }

      this.actionChips.push(chip)
    })
  }

  // ----- 필살기 조준/발동 -----
  // finisherEntry: core/growth.js의 getUnitFinishers가 반환하는 { skill, source, presenterName, presenterPortrait }.
  // presenter(이름·포트레이트)는 컷인에서 "누구의 필살기인지" 보여주는 데 쓰인다 — 에이스 필살기는 에이스,
  // 전직 함선 고유 필살기는 그 함선 자신이 컷인의 주인공이 된다(에이스가 없는 유닛도 자기 필살기를 쓸 수 있다).
  beginFinisherTargeting(unit, finisherEntry) {
    const { skill, presenterName, presenterPortrait } = finisherEntry
    const presenter = { name: presenterName, portrait: presenterPortrait }

    // 광역(아군/적 전체)은 대상 선택 없이 즉시 발동
    if (skill.target === 'aoe_ally' || skill.target === 'aoe_enemy') {
      const targets =
        skill.target === 'aoe_ally'
          ? this.units.filter((u) => u.side === unit.side)
          : this.units.filter((u) => u.side !== unit.side)
      this.launchFinisher(unit, skill, targets, presenter)
      return
    }

    this.pendingAbility = { unit, skill, presenter }
    this.actionChips?.forEach((chip) => chip.destroy())
    this.actionChips = []
    this.clearHighlights()

    if (skill.target === 'line') {
      this.highlightLineAimCells(unit)
      this.refreshHud(
        `${presenter.name} — "${skill.name}" 조준 중! 직선 방향(상하좌우)의 칸이나 그 위의 적을 클릭해 발사하세요. (취소: 유닛을 다시 클릭)`,
      )
    } else {
      this.refreshHud(
        `${presenter.name} — "${skill.name}" 조준 중! 사거리와 무관하게 대상 적 유닛을 클릭하세요. (취소: 유닛을 다시 클릭)`,
      )
    }
  }

  cancelPendingAbility() {
    this.pendingAbility = null
    const unit = this.selected
    this.clearHighlights()
    if (unit) this.selectUnit(unit)
  }

  // 사용자 위치에서 4방향(상하좌우) 직선 위의 모든 칸을 강조 — collectLineTargets의 방향 스냅과 짝을 이룬다.
  highlightLineAimCells(unit) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
    for (const [dx, dy] of dirs) {
      let x = unit.gridX + dx
      let y = unit.gridY + dy
      while (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
        this.highlighted.add(`${x},${y}`)
        this.setCellHighlight(x, y, true, ABILITY_HIGHLIGHT_COLOR)
        x += dx
        y += dy
      }
    }
  }

  tryFireLine(unit, skill, aimCell, presenter) {
    if (!this.highlighted.has(`${aimCell.x},${aimCell.y}`)) {
      this.cancelPendingAbility()
      return
    }
    const targets = collectLineTargets(unit, aimCell, this.units, { cols: COLS, rows: ROWS })
    if (targets.length === 0) {
      this.refreshHud(
        `${presenter.name} — 그 방향에는 적이 없습니다. 다른 방향의 칸을 클릭하거나, 유닛을 다시 클릭해 취소하세요.`,
      )
      return
    }
    this.launchFinisher(unit, skill, targets, presenter)
  }

  // 컷인 연출(ON일 때) → onApply 시점에 실제 효과 적용 → 복귀까지 끝나면 입력 잠금 해제.
  // dev_plan_guide.md 요청 예시 그대로: TP는 사용 즉시 0으로 초기화한다(전액 소모, cost.tp:"full").
  // presenter: { name, portrait } — 컷인에 등장하는 주체(에이스 또는 전직한 함선 자신).
  launchFinisher(unit, skill, targets, presenter) {
    this.pendingAbility = null
    this.clearSelection()
    this.busy = true

    unit.tp = 0
    this.refreshUnitStatusLabel(unit)

    this.cutinManager.play({
      ace: presenter,
      skill,
      onApply: () => this.applyFinisherEffect(unit, skill, targets),
      onComplete: () => {
        this.busy = false
        this.refreshHud()
      },
    })
  }

  // skill.effect 구조에 따라 지원형(heal/shield)과 공격형(damageMultiplier 등)으로 분기한다 —
  // skills.json의 effect 필드를 그대로 읽어 처리할 뿐, 새로운 수치를 만들어내지 않는다.
  applyFinisherEffect(unit, skill, targets) {
    const effect = skill.effect
    if (effect.heal != null || effect.shield != null) {
      this.applySupportFinisher(unit, skill, targets)
    } else {
      this.applyOffensiveFinisher(unit, skill, targets)
    }
  }

  applySupportFinisher(unit, skill, targets) {
    const effect = skill.effect
    for (const target of targets) {
      if (effect.heal) {
        target.hp = Math.min(target.maxHp, target.hp + effect.heal)
        this.updateHpBar(target)
        this.showFloatingText(target, `+${effect.heal}`, HEAL_TEXT_COLOR)
      }
      if (effect.shield) {
        target.shield = (target.shield ?? 0) + effect.shield
        this.refreshUnitStatusLabel(target)
      }
    }
    const parts = []
    if (effect.heal) parts.push(`HP +${effect.heal}`)
    if (effect.shield) parts.push(`실드 +${effect.shield}`)
    this.refreshHud(`${unit.ship.name} → "${skill.name}" 발동! 아군 전원 ${parts.join(' · ')}`)
  }

  applyOffensiveFinisher(unit, skill, targets) {
    const effect = skill.effect
    const summaries = []
    for (const target of targets) {
      if (!this.units.includes(target)) continue

      const defTerrainF = getTerrain(this.terrain[target.gridY][target.gridX])
      const result = resolveAttack(
        {
          attacker: { id: unit.ship.id, acc: unit.ship.acc, atk: unit.ship.atk },
          defender: { id: target.ship.id, eva: target.ship.eva, def: target.ship.def, hp: target.hp },
          terrainEvaMod: defTerrainF.evaMod,
          terrainAccMod: defTerrainF.accMod,
          boosterActive: false,
          forceHit: !!effect.unavoidable,
          damageMultiplier: effect.damageMultiplier ?? 1,
        },
        this.combatRules,
      )

      if (!result.hit) {
        this._dodgeUnit(target, unit)
        this.showFloatingText(target, '회피!', MISS_TEXT_COLOR)
        summaries.push(`${target.ship.name} 회피`)
        continue
      }

      const dealt = this.applyDamageWithShield(target, result.damage)
      this.showFloatingText(target, `-${dealt}`, DAMAGE_TEXT_COLOR)
      if (effect.apDebuff) target.apDebuff = (target.apDebuff ?? 0) + effect.apDebuff
      const lethal = target.hp <= 0
      if (lethal) this.destroyUnit(target)
      else this.checkBossPhaseTransition(target)
      summaries.push(`${target.ship.name} ${dealt}데미지${lethal ? ' (격파!)' : ''}`)
    }

    const aimLabel = skill.target === 'line' ? '직선 관통' : skill.target === 'aoe_enemy' ? '광역' : '단일'
    this.refreshHud(
      summaries.length > 0
        ? `${unit.ship.name} → "${skill.name}" (${aimLabel}) 명중! ${summaries.join(' / ')}`
        : `${unit.ship.name} → "${skill.name}" 발동했지만 명중 시점에 대상이 사라졌습니다.`,
    )
  }

  // 실드가 있으면 데미지를 먼저 흡수하고, 남는 만큼만 HP에서 차감한다. 반환값은 실제 HP 손실량(표시용).
  applyDamageWithShield(unit, rawDamage) {
    let toShield = 0
    if (unit.shield > 0) {
      toShield = Math.min(unit.shield, rawDamage)
      unit.shield -= toShield
    }
    const toHp = rawDamage - toShield
    unit.hp = Math.max(0, unit.hp - toHp)
    this.updateHpBar(unit)
    this.refreshUnitStatusLabel(unit)
    return toHp
  }

  // 진입 피해 — 지형의 entryDamage(%)만큼 HP를 깎는다. 지형 단독으로는 격파되지 않는다.
  applyEntryDamage(unit, terrain) {
    if (!terrain.entryDamage) return
    const dmg = Math.max(1, Math.floor(unit.maxHp * terrain.entryDamage / 100))
    unit.hp = Math.max(1, unit.hp - dmg)
    this.updateHpBar(unit)
    this.showFloatingText(unit, `-${dmg} (지형)`, '#ff9966')
    this.syncUnitsToStore()
  }

  // 주기 피해 — 플레이어 턴 시작 시 periodicDamage(%)가 있는 지형 위의 모든 유닛에게 적용.
  applyPeriodicTerrainDamage() {
    for (const unit of [...this.units]) {
      const terrain = getTerrain(this.terrain[unit.gridY][unit.gridX])
      if (!terrain.periodicDamage) continue
      const dmg = Math.max(1, Math.floor(unit.maxHp * terrain.periodicDamage / 100))
      unit.hp = Math.max(1, unit.hp - dmg)
      this.updateHpBar(unit)
      this.showFloatingText(unit, `-${dmg} (폭풍)`, '#cc66ff')
    }
    this.syncUnitsToStore()
  }

  // ----- 이동 -----
  isPassable(x, y, exclude = this.selected) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false
    if (!getTerrain(this.terrain[y][x]).passable) return false
    if (this.units.some((u) => u !== exclude && u.gridX === x && u.gridY === y)) return false
    return true
  }

  // path를 따라 유닛 컨테이너를 한 칸씩 트윈으로 이동시키고 완료 시 콜백한다 (좌표 갱신은 호출자 책임).
  animateUnitAlongPath(unit, path, onComplete) {
    const step = (index) => {
      if (index >= path.length) {
        onComplete()
        return
      }
      const { px, py } = this.cellToWorld(path[index].x, path[index].y)
      this.tweens.add({
        targets: unit.container,
        x: px,
        y: py,
        duration: 130,
        ease: 'Sine.easeInOut',
        onComplete: () => step(index + 1),
      })
    }
    step(1)
  }

  moveSelectedTo(targetX, targetY) {
    const unit = this.selected
    const path = findPath(
      { x: unit.gridX, y: unit.gridY },
      { x: targetX, y: targetY },
      (cx, cy) => this.isPassable(cx, cy),
    )
    if (!path || path.length < 2) return

    this.clearSelection()
    this.busy = true
    this.refreshHud(`${unit.ship.name} 이동 중...`)

    this.animateUnitAlongPath(unit, path, () => {
      unit.gridX = targetX
      unit.gridY = targetY
      const destTerrain = getTerrain(this.terrain[targetY][targetX])
      this.spendAp(unit, 1 + (destTerrain.movCost ?? 0))
      this.applyEntryDamage(unit, destTerrain)
      this.busy = false
      this.refreshHud()
    })
  }

  // ----- 전투 -----
  // onComplete: 연출까지 끝난 뒤 호출(적 AI가 다음 행동으로 이어갈 때 사용). 공격은 명중 여부와 무관하게 AP 1을 소모한다.
  resolveCombat(attacker, defender, onComplete) {
    const defTerrain = getTerrain(this.terrain[defender.gridY][defender.gridX])

    // 측면 공격 보너스 — y좌표 차이 2 이상이면 +25% (포위·측면 기동의 가치를 직접적으로 반영)
    const dy = Math.abs(attacker.gridY - defender.gridY)
    const isFlank = dy >= 2
    const flankMult = isFlank ? 1.25 : 1.0

    // 크리티컬 판정 — 15% 확률로 1.8× 데미지
    const isCrit = Math.random() < 0.15
    const critMult = isCrit ? 1.8 : 1.0

    const result = resolveAttack(
      {
        attacker: { id: attacker.ship.id, acc: attacker.ship.acc, atk: attacker.ship.atk },
        defender: { id: defender.ship.id, eva: defender.ship.eva, def: defender.ship.def, hp: defender.hp },
        terrainEvaMod: defTerrain.evaMod,
        terrainAccMod: defTerrain.accMod,
        boosterActive: false,
        damageMultiplier: flankMult * critMult,
      },
      this.combatRules,
    )

    this.clearSelection()
    this.busy = true
    this.spendAp(attacker, 1)
    const chancePct = Math.round(result.hitChance)

    // 타겟팅 라인 — 공격 방향과 명중/회피 색으로 짧게 번쩍임
    this.flashTargetingLine(attacker, defender, result.hit ? 0x44ff88 : 0xff6655)

    const finish = () => {
      this.busy = false
      onComplete?.()
    }

    if (!result.hit) {
      this._dodgeUnit(defender, attacker)
      this.showFloatingText(defender, '회피!', MISS_TEXT_COLOR, finish)
      this.refreshHud(`${attacker.ship.name} → ${defender.ship.name} : 빗나감! (명중률 ${chancePct}%)`)
      return
    }

    defender.hp = Math.max(0, defender.hp - result.damage)
    this.updateHpBar(defender)

    const hitColor  = isCrit ? '#ff6b35' : DAMAGE_TEXT_COLOR
    const hitLabel  = isCrit ? `💥${result.damage}!` : `-${result.damage}`
    const bonusTxt  = [isFlank ? '측면' : null, isCrit ? '크리티컬!' : null].filter(Boolean).join(' · ')
    const bonusPart = bonusTxt ? ` [${bonusTxt}]` : ''

    this.showFloatingText(defender, hitLabel, hitColor, () => {
      if (result.lethal) {
        this.destroyUnit(defender)
        // 킬 시 AP +1 반환 (아군만) — 추격·연속 제거의 손맛
        if (attacker.side === 'ally' && attacker.ap < attacker.maxAp) {
          attacker.ap = Math.min(attacker.maxAp, attacker.ap + 1)
          this.showFloatingText(attacker, '⚡ AP+1', HEAL_TEXT_COLOR)
          this.refreshUnitStatusLabel(attacker)
          this.updateUnitAvailability(attacker)
        }
      } else {
        this.checkBossPhaseTransition(defender)
      }
      finish()
    })

    if (result.lethal) {
      this.refreshHud(
        `${attacker.ship.name} → ${defender.ship.name} : 명중! ${result.damage} 데미지로 격파!${bonusPart} (명중률 ${chancePct}%)`,
      )
    } else {
      this.refreshHud(
        `${attacker.ship.name} → ${defender.ship.name} : 명중! ${result.damage} 데미지${bonusPart} (남은 HP ${defender.hp}/${defender.maxHp}, 명중률 ${chancePct}%)`,
      )
    }
  }

  showFloatingText(unit, text, color, onComplete) {
    // 데미지 숫자(-N, 💥N)는 크고 흔들리게, 나머지는 작고 조용하게
    const isBigHit = text.startsWith('-') || text.startsWith('💥')
    const isMiss = text === '회피!'
    const fontSize = isBigHit ? '62px' : isMiss ? '36px' : '20px'
    const strokeThick = isBigHit ? 8 : isMiss ? 5 : 3
    const fontFamily = (isBigHit || isMiss) ? 'Bangers, Impact, sans-serif' : 'Share Tech Mono, monospace'

    const popup = this.add
      .text(unit.container.x, unit.container.y - CELL * 0.88, text, {
        fontFamily,
        fontSize,
        fontStyle: 'normal',
        color,
        stroke: '#000000',
        strokeThickness: strokeThick,
      })
      .setOrigin(0.5)
      .setDepth(10)

    if (isBigHit) {
      // 피격 유닛 좌우 흔들기
      this._shakeUnit(unit)

      // 숫자 자체도 좌우 흔들고 난 뒤 위로 떠올라 사라짐
      const origX = popup.x
      this.tweens.add({
        targets: popup,
        x: origX + 12,
        duration: 45,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          popup.setX(origX)
          this.tweens.add({
            targets: popup,
            y: popup.y - 60,
            alpha: 0,
            duration: 680,
            ease: 'Cubic.easeOut',
            onComplete: () => { popup.destroy(); onComplete?.() },
          })
        },
      })
    } else {
      this.tweens.add({
        targets: popup,
        y: popup.y - 34,
        alpha: 0,
        duration: 650,
        ease: 'Cubic.easeOut',
        onComplete: () => { popup.destroy(); onComplete?.() },
      })
    }
  }

  _shakeUnit(unit) {
    if (!unit?.container) return
    const origX = unit.container.x
    this.tweens.add({
      targets: unit.container,
      x: origX - 10,
      duration: 40,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onComplete: () => { unit.container.x = origX },
    })
  }

  // 회피 애니메이션 — 공격자 방향의 수직으로 빠르게 대시한 뒤 원위치로 복귀
  _dodgeUnit(unit, attacker) {
    if (!unit?.container) return
    const origX = unit.container.x
    const origY = unit.container.y

    // 공격자 → 방어자 방향 벡터
    const { px: ax, py: ay } = this.cellToWorld(attacker.gridX, attacker.gridY)
    const dx = origX - ax
    const dy = origY - ay
    const len = Math.sqrt(dx * dx + dy * dy) || 1

    // 수직(lateral) 회피 방향 + 약간 뒤로 물러남
    const perpX = -dy / len
    const perpY = dx / len
    const awayX = dx / len
    const awayY = dy / len

    // 홀수 턴 왼쪽 / 짝수 턴 오른쪽 — 같은 방향만 피하지 않도록 교번
    const side = (attacker.gridX + attacker.gridY) % 2 === 0 ? 1 : -1
    const dodgeX = origX + perpX * 22 * side + awayX * 10
    const dodgeY = origY + perpY * 22 * side + awayY * 10

    this.tweens.killTweensOf(unit.container)
    this.tweens.add({
      targets: unit.container,
      x: dodgeX,
      y: dodgeY,
      scaleX: 0.82,
      scaleY: 0.82,
      duration: 75,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: unit.container,
          x: origX,
          y: origY,
          scaleX: 1,
          scaleY: 1,
          duration: 240,
          ease: 'Back.easeOut',
          onComplete: () => unit.container.setPosition(origX, origY),
        })
      },
    })
  }

  updateHpBar(unit) {
    const ratio = Math.max(0, unit.hp) / unit.maxHp
    unit.hpBarFg.setSize(HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT)
  }

  updateApBar(unit) {
    if (!unit.apBarFg) return
    const ratio = unit.maxAp > 0 ? Math.max(0, unit.ap) / unit.maxAp : 0
    unit.apBarFg.setSize(HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT - 1)
  }

  destroyUnit(unit) {
    unit.container.destroy()
    this.units = this.units.filter((u) => u !== unit)
    if (this.selected === unit) this.selected = null
    if (unit.side === 'enemy') this.defeatedEnemyShips.push(unit.baseShip)
    this.checkBattleEnd()
  }

  // ----- MOD-11: 보스 페이즈 전환 -----

  // HP가 50% 이하로 내려간 보스 유닛의 2페이즈 전환을 1회만 발동한다.
  checkBossPhaseTransition(unit) {
    if (unit.side !== 'enemy' || unit.bossPhase === 2) return
    const bossData = this.bossesById.get(unit.ship.id)
    if (!bossData?.phases?.length) return
    const key = unit.instanceId ?? unit.ship.id
    if (this.bossPhase2Triggered.has(key)) return
    if (unit.hp > unit.maxHp * 0.5) return
    this.bossPhase2Triggered.add(key)
    this.triggerBossPhase2(unit, bossData)
  }

  triggerBossPhase2(unit, bossData) {
    unit.bossPhase = 2
    // ATK 증폭 (enemies.json의 phaseBoost)
    const boost = bossData.phaseBoost?.atk ?? 0
    if (boost > 0) unit.ship = { ...unit.ship, atk: unit.ship.atk + boost }

    this.refreshHud(
      `⚡ "${unit.ship.name}" 2페이즈 전환! ${bossData.phases[1]?.behavior ?? '강화 패턴 활성화'} — ATK +${boost}!`,
    )

    // 차원 균열(void_rift) 소환 — 빈 슬롯에 1기
    const riftDef = this.enemiesById.get('void_rift')
    if (riftDef?.stats) {
      const riftShip = {
        ...riftDef.stats,
        id: 'void_rift',
        name: riftDef.name,
        sprite: riftDef.sprite,
        tpPerTurn: riftDef.stats.tpPerTurn ?? 0,
      }
      const spawnPos = ENEMY_SPAWN_POSITIONS.find(
        (pos) => !this.units.some((u) => u.gridX === pos.x && u.gridY === pos.y),
      )
      if (spawnPos) {
        this.spawnUnit({ side: 'enemy', shipId: 'void_rift', ship: riftShip, x: spawnPos.x, y: spawnPos.y })
      }
    }
  }

  // 보스 2페이즈 광역 차원 파동 — ATK×0.5 피해를 아군 전원에게 동시 적용
  executeWardenAoe(unit, onDone) {
    const allies = [...this.units.filter((u) => u.side === 'ally')]
    if (!allies.length) { onDone(); return }

    const rawDamage = Math.floor(unit.ship.atk * 0.5)
    this.refreshHud(`⚡ ${unit.ship.name} — 차원 파동! 아군 전원에게 ${rawDamage} 광역 피해!`)
    this.busy = true

    for (const ally of allies) {
      const dealt = this.applyDamageWithShield(ally, rawDamage)
      this.showFloatingText(ally, `-${dealt}`, DAMAGE_TEXT_COLOR)
    }

    this.time.delayedCall(700, () => {
      const dead = allies.filter((a) => a.hp <= 0 && this.units.includes(a))
      for (const ally of dead) this.destroyUnit(ally)
      this.busy = false
      if (!this.battleEnded) onDone()
    })
  }

  // ----- 전투 종료 판정 & 보상 (MOD-5: "전투 승리 시 XP 분배"의 출발점) -----
  // 한쪽 진영이 전멸하면 즉시 종료 처리 — 이후 입력은 battleEnded 가드로 모두 막는다.
  checkBattleEnd() {
    if (this.battleEnded) return
    const enemiesLeft = this.units.some((u) => u.side === 'enemy')
    const alliesLeft = this.units.some((u) => u.side === 'ally')
    if (enemiesLeft && alliesLeft) return

    this.battleEnded = true
    this.busy = true
    this.clearSelection()
    this.actionChips?.forEach((chip) => chip.destroy())
    this.actionChips = []

    if (!enemiesLeft) this.handleVictory()
    else this.handleDefeat()
  }

  // 격파한 적의 베이스 스탯에서 보상 XP를 계산해(core/growth.xpRewardForVictory) 생존 아군 전원에게
  // useFleetStore.gainXp로 지급한다 — 레벨업·전직 가능 여부까지 한 번에 확인해 결과를 보여준다.
  // MOD-6: 노드 진입 전투라면 onVictory(node)를 호출해 정복 상태를 즉시 갱신한다(인접 다음 노드 잠금 해제).
  handleVictory() {
    const totalXp = xpRewardForVictory(this.defeatedEnemyShips)
    const survivors = this.units.filter((u) => u.side === 'ally' && u.instanceId)

    const lines = survivors.map((unit) => {
      const result = useFleetStore.getState().gainXp(unit.instanceId, totalXp)
      if (!result) return `${unit.ship.name}: 보상을 받지 못했습니다.`

      const updatedEntry = useFleetStore.getState().roster.find((e) => e.instanceId === unit.instanceId)
      const levelPart = result.levelsGained > 0 ? ` → Lv.${result.level} 달성!` : ` (Lv.${result.level})`
      const promotionHint = updatedEntry && canPromote(unit.baseShip, updatedEntry) ? ' ✨ 전직 조건 달성! 함대 편성에서 전직하세요.' : ''
      return `${unit.ship.baseName ?? unit.ship.name} +${totalXp} XP${levelPart}${promotionHint}`
    })

    const extraLines = []

    if (this.node) {
      this.onVictory?.(this.node)

      // MOD-8: 전투 보상 자원 지급
      if (this.node.reward?.resource) {
        useResourceStore.getState().earn(this.node.reward.resource)
        const resText = Object.entries(this.node.reward.resource)
          .map(([k, v]) => `${k} +${v}`)
          .join(' · ')
        extraLines.push(`💰 자원 획득: ${resText}`)
      }

      // MOD-8: 채굴 노드 첫 방문 시 즉시 채굴 (mining 데이터가 있는 별계)
      const mineResult = useProgressStore.getState().harvest(this.node)
      if (mineResult) {
        extraLines.push(
          `⛏ 채굴: ${mineResult.resource} +${mineResult.amount} (잔여 매장량 ${mineResult.remaining})`,
        )
      }

      // MOD-10: 히든 유니크 — 아직 획득하지 않은 경우 1회 자동 지급
      if (this.node.hidden) {
        const progressStore = useProgressStore.getState()
        if (!progressStore.isHiddenObtained(this.node.id)) {
          useFleetStore.getState().addItem(this.node.hidden)
          progressStore.markHiddenObtained(this.node.id)
          const hiddenItem = this.itemsById.get(this.node.hidden)
          extraLines.push(`🎁 히든 유니크 획득: "${hiddenItem?.name ?? this.node.hidden}"! (놓치면 영구 불가)`)
        }
      }
    }

    const isEnding = !!this.node?.reward?.ending
    const headline = this.node
      ? isEnding
        ? [`성단 보스 "심연의 파수꾼" 격파! 변경 성단을 해방했습니다!`]
        : [`"${this.node.name}" 정복! 인접한 다음 별계로 가는 길이 열렸습니다.`]
      : []

    // MOD-10: 레이븐 영입 선택지 — s6 정복 시 1회만 제공
    const endActions = this.buildEndActions()
    if (this.node?.recruit) {
      const aceId = this.node.recruit
      const progressStore = useProgressStore.getState()
      if (!progressStore.recruitedAces.includes(aceId)) {
        const acesData = useDataStore.getState().data?.aces?.aces ?? []
        const aceData = acesData.find((a) => a.id === aceId)
        if (aceData) {
          extraLines.push(`🎖 ${aceData.name} 영입 가능 — 아래 버튼으로 영입하세요. (놓치면 영구 불가)`)
          endActions.push({
            label: `🎖 ${aceData.name} 영입하기`,
            onClick: () => { useProgressStore.getState().recruitAce(aceId) },
          })
        }
      }
    }

    // MOD-11: 엔딩 — 최종 보스 격파 시 별도 버튼 추가
    if (isEnding) {
      endActions.unshift({
        label: '🌌 엔딩 보기 — 다음 은하로',
        onClick: () => this.onEnding?.(),
      })
    }

    this.showBattleEndBanner(
      isEnding ? '🌌 성단 클리어!' : '🏆 승리!',
      [
        ...headline,
        ...extraLines,
        `격파한 적 함선 ${this.defeatedEnemyShips.length}척 — 보상 XP ${totalXp} (모든 생존 함선에게 동일 지급)`,
        ...lines,
      ],
      endActions,
    )
  }

  handleDefeat() {
    const { width, height } = this.scale
    const cx = width / 2, cy = height / 2

    this.add.rectangle(cx, cy, width, height, 0x050008, 0.88).setDepth(300).setScrollFactor(0)
    this.add.text(cx, cy - 80, '💥 게임 오버', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '42px', fontStyle: 'bold', color: '#dc2626',
    }).setOrigin(0.5).setDepth(301).setScrollFactor(0)
    this.add.text(cx, cy - 20, '함대가 전멸했습니다.', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '18px', color: '#cdd8f4',
    }).setOrigin(0.5).setDepth(301).setScrollFactor(0)

    const btn = this.add.text(cx, cy + 60, '🔄 처음부터 다시 시작', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '18px', fontStyle: 'bold', color: '#ffd166',
    }).setOrigin(0.5).setDepth(301).setScrollFactor(0).setInteractive({ useHandCursor: true })
    btn.on('pointerup', () => { if (!this._isDragging) this.onGameOver?.() })
    this.tweens.add({ targets: btn, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 })
    // Enter 키로 재시작
    this.input.keyboard.once('keydown-ENTER', () => this.onGameOver?.())
  }

  // 전투 종료 후 선택지 — "맵으로 복귀"는 노드 기반 전투(MOD-6)일 때만 보여준다(자유 전투 호환).
  buildEndActions() {
    if (this.node && this.onExit) {
      return [{ label: '🌌 성단 맵으로 복귀', onClick: () => this.onExit() }]
    }
    return []
  }

  // 풀스크린 결과 배너 + 선택지 버튼들(위에서부터 쌓임). MOD-6: 맵 복귀/재도전 중 골라 다음 행동을 잇는다.
  showBattleEndBanner(title, lines, actions) {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    const sf0 = (obj) => obj.setScrollFactor(0)  // 헬퍼: 카메라 고정
    const dim = sf0(this.add.rectangle(cx, cy, width, height, 0x05060f, 0.8).setDepth(300))
    const titleText = sf0(this.add
      .text(cx, cy - 130, title, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setDepth(301))
    const bodyText = sf0(this.add
      .text(cx, cy - 80, lines.join('\n'), {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '14px',
        color: '#cdd8f4',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)
      .setDepth(301))

    const buttonColors = ['#ffd166', '#3ad6c4']
    const buttons = actions.map((action, index) => {
      const btn = sf0(this.add
        .text(cx, cy + 150 + index * 36, action.label, {
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: buttonColors[index % buttonColors.length],
        })
        .setOrigin(0.5)
        .setDepth(301)
        .setInteractive({ useHandCursor: true }))

      btn.on('pointerup', (_pointer, _lx, _ly, event) => {
        event?.stopPropagation()
        if (!this._isDragging) action.onClick()
      })
      this.tweens.add({ targets: btn, alpha: 0.4, duration: 480, yoyo: true, repeat: -1 })
      return btn
    })

    this.battleEndLayer = [dim, titleText, bodyText, ...buttons]
    // Enter 키로 첫 번째 버튼(맵 복귀 등) 실행
    if (actions.length > 0) {
      this.input.keyboard.once('keydown-ENTER', () => actions[0].onClick())
    }
  }

  // ----- AP/TP -----
  // 행동(이동=1, 공격=1) 시 AP를 소모한다 — dev_plan_guide.md MOD-3 요청 예시의 비용 규칙을 그대로 따른다.
  spendAp(unit, cost) {
    unit.ap = Math.max(0, unit.ap - cost)
    this.refreshUnitStatusLabel(unit)
    this.updateApBar(unit)
    this.updateUnitAvailability(unit)
  }

  // ships.json의 tpPerTurn만큼 턴마다 충전한다(밸런싱 수치는 데이터 그대로 사용).
  chargeTp(unit) {
    unit.tp = Math.min(TP_MAX, unit.tp + unit.tpPerTurn)
    this.refreshUnitStatusLabel(unit)
  }

  // 턴 시작 시 AP를 최대치로 채운다. area_emp의 effect.apDebuff(예: "다음 턴 행동 -1AP", duration:1)는
  // 누적된 디버프만큼 이번 한 턴만 maxAp를 줄이고 즉시 소멸시킨다 — 그 외에는 ship.ap 그대로 사용.
  refillAp(unit) {
    if (unit.apDebuff > 0) {
      unit.maxAp = Math.max(0, unit.ship.ap - unit.apDebuff)
      unit.apDebuff = 0
    } else {
      unit.maxAp = unit.ship.ap
    }
    unit.ap = unit.maxAp
    unit.aoeFiredThisTurn = false // MOD-11: 보스 2페이즈 광역 공격 플래그 초기화
    this.refreshUnitStatusLabel(unit)
    this.updateApBar(unit)
    this.updateUnitAvailability(unit)
  }

  refreshUnitStatusLabel(unit) {
    const tpPct = Math.round((unit.tp / TP_MAX) * 100)
    const shieldPart = unit.shield > 0 ? ` · 실드 ${unit.shield}` : ''
    unit.statusLabel.setText(`AP ${unit.ap}/${unit.maxAp} · TP ${tpPct}%${shieldPart}`)
  }

  // AP가 소진된 유닛은 더 이상 행동할 수 없음을 시각적으로 표시한다(반투명 처리).
  updateUnitAvailability(unit) {
    unit.container.setAlpha(unit.ap > 0 ? 1 : ACTED_ALPHA)
  }

  // ----- 배틀 스토어 동기화 (React 사이드패널용) -----
  syncUnitsToStore() {
    useBattleStore.getState().setUnits(
      this.units.map(u => ({
        id:         u.instanceId ?? `${u.side}_${u.ship.name}`,
        instanceId: u.instanceId ?? null,
        side:       u.side,
        name:       u.ship.name,
        sprite:     getEmojiFallback(u.ship.sprite),
        hp:         u.hp,
        maxHp:      u.maxHp,
        ap:         u.ap,
        maxAp:      u.maxAp,
        tp:         u.tp,
        level:      u.ship.level ?? 1,
        aceName:    u.ace?.name ?? null,
        dead:       u.hp <= 0,
        mov:        u.ship.mov ?? 3,
        atk:        u.ship.atk ?? 1,
      }))
    )
  }

  // 맵으로 즉시 복귀 — 도주/협상 성공 시 React에서 호출
  executeFlee() {
    if (this.battleEnded) return
    this.battleEnded = true
    this.busy = true
    this.clearSelection()
    this.actionChips?.forEach((chip) => chip.destroy())
    this.actionChips = []
    this.refreshHud('철수합니다...')
    this.time.delayedCall(600, () => this.onExit?.())
  }

  // ----- 씬 정리 -----
  shutdown() {
    this._unsubAutoBattle?.()
  }

  // ----- 턴 순환: 플레이어 페이즈 ↔ 적 페이즈 -----
  startPlayerPhase() {
    this.phase = 'player'
    useBattleStore.getState().setPlayerPhase(true)
    this.allyQueue = this.units.filter((u) => u.side === 'ally')
    for (const unit of this.allyQueue) this.refillAp(unit)
    if (this.turnNumber > 1) this.applyPeriodicTerrainDamage()
    this.refreshHud()
    this.syncUnitsToStore()

    if (this.autoBattle && !this.battleEnded) {
      this.time.delayedCall(this.actionDelay, () => this.runAllyAutoTurn(0))
    }
  }

  endPlayerPhase() {
    this.clearSelection()
    for (const unit of this.units) {
      if (unit.side === 'ally') this.chargeTp(unit)
    }
    this.startEnemyPhase()
  }

  startEnemyPhase() {
    this.phase = 'enemy'
    useBattleStore.getState().setPlayerPhase(false)
    this.clearSelection()
    this.enemyQueue = this.units.filter((u) => u.side === 'enemy')
    for (const unit of this.enemyQueue) this.refillAp(unit)
    this.refreshHud(`적 턴 ${this.turnNumber} — 적이 행동합니다...`)
    this.syncUnitsToStore()
    this.runEnemyUnit(0)
  }

  endEnemyPhase() {
    for (const unit of this.units) {
      if (unit.side === 'enemy') this.chargeTp(unit)
    }
    this.turnNumber += 1
    this.startPlayerPhase()
  }

  // ----- 기본 적 AI: '가장 약하거나 상성상 유리한 적에게 이동 후 공격' (core/ai.js 휴리스틱 사용) -----
  runEnemyUnit(index) {
    if (this.battleEnded) return // 적 턴 도중 아군이 전멸(패배)하면 큐 진행을 멈춘다 — 페이즈 전환 방지
    if (index >= this.enemyQueue.length) {
      this.endEnemyPhase()
      return
    }
    const unit = this.enemyQueue[index]
    if (!this.units.includes(unit)) {
      // 이번 페이즈 중 격파되어 더 이상 존재하지 않음 — 다음 유닛으로
      this.runEnemyUnit(index + 1)
      return
    }
    this.takeEnemyTurn(unit, () => {
      this.time.delayedCall(this.actionDelay, () => {
        this.refreshHud(`적 턴 ${this.turnNumber} — 적이 행동합니다...`)
        this.runEnemyUnit(index + 1)
      })
    })
  }

  // unit이 AP를 모두 쓰거나 더 할 행동이 없을 때까지 이동→공격을 반복한다.
  takeEnemyTurn(unit, onDone) {
    // MOD-11: 보스 2페이즈 — 매 턴 첫 AP를 광역 차원 파동에 소모
    if (unit.bossPhase === 2 && !unit.aoeFiredThisTurn && unit.ap >= 1) {
      unit.aoeFiredThisTurn = true
      this.spendAp(unit, 1)
      this.executeWardenAoe(unit, () => {
        if (!this.battleEnded) this.takeEnemyTurn(unit, onDone)
        else onDone()
      })
      return
    }

    const step = () => {
      if (unit.ap <= 0 || !this.units.includes(unit)) {
        onDone()
        return
      }
      const allies = this.units.filter((u) => u.side === 'ally')
      const target = pickTarget(unit.ship.id, allies, this.combatRules.counterMultiplier)
      if (!target) {
        onDone()
        return
      }

      if (inAttackRange(unit, target)) {
        this.busy = true
        this.resolveCombat(unit, target, step)
        return
      }

      const move = planApproach(unit, target, (x, y) => this.isPassable(x, y, unit))
      if (move.x === unit.gridX && move.y === unit.gridY) {
        // 더 다가갈 수 없음 — 이번 유닛의 행동 종료
        onDone()
        return
      }
      this.aiMoveTo(unit, move.x, move.y, step)
    }
    step()
  }

  aiMoveTo(unit, targetX, targetY, onDone) {
    const path = findPath(
      { x: unit.gridX, y: unit.gridY },
      { x: targetX, y: targetY },
      (cx, cy) => this.isPassable(cx, cy, unit),
    )
    if (!path || path.length < 2) {
      onDone()
      return
    }

    this.busy = true
    const sideLabel = unit.side === 'ally' ? '(자동)' : '(적)'
    this.refreshHud(`${unit.ship.name}${sideLabel} 이동 중...`)
    this.animateUnitAlongPath(unit, path, () => {
      unit.gridX = targetX
      unit.gridY = targetY
      const destTerrain = getTerrain(this.terrain[targetY][targetX])
      this.spendAp(unit, 1 + (destTerrain.movCost ?? 0))
      this.applyEntryDamage(unit, destTerrain)
      this.busy = false
      onDone()
    })
  }

  // ----- 자동전투: 적 AI와 동일한 휴리스틱(core/ai.js)을 아군에게 그대로 적용 (테스트 편의용 QoL) -----
  runAllyAutoTurn(index) {
    if (this.battleEnded || !this.autoBattle || this.phase !== 'player') return
    if (index >= this.allyQueue.length) {
      this.endPlayerPhase()
      return
    }
    const unit = this.allyQueue[index]
    if (!this.units.includes(unit)) {
      this.runAllyAutoTurn(index + 1)
      return
    }
    this.takeAllyAutoTurn(unit, () => {
      this.time.delayedCall(this.actionDelay, () => {
        if (!this.autoBattle || this.battleEnded || this.phase !== 'player') return
        this.refreshHud(`자동전투 — 아군이 행동합니다... (턴 ${this.turnNumber})`)
        this.runAllyAutoTurn(index + 1)
      })
    })
  }

  takeAllyAutoTurn(unit, onDone) {
    const step = () => {
      if (unit.ap <= 0 || !this.units.includes(unit) || this.battleEnded || !this.autoBattle) {
        onDone()
        return
      }
      const enemies = this.units.filter((u) => u.side === 'enemy')
      const target = pickTarget(unit.ship.id, enemies, this.combatRules.counterMultiplier)
      if (!target) {
        onDone()
        return
      }

      if (inAttackRange(unit, target)) {
        this.busy = true
        this.resolveCombat(unit, target, step)
        return
      }

      const move = planApproach(unit, target, (x, y) => this.isPassable(x, y, unit))
      if (move.x === unit.gridX && move.y === unit.gridY) {
        onDone()
        return
      }
      this.aiMoveTo(unit, move.x, move.y, step)
    }
    step()
  }

  // ----- 타겟팅 라인 -----
  // 공격자→방어자 사이를 색상 광선으로 연결하고 빠르게 페이드아웃
  flashTargetingLine(attacker, defender, color) {
    if (this.targetingGfx) {
      this.tweens.killTweensOf(this.targetingGfx)
      this.targetingGfx.destroy()
    }
    const ax = attacker.container.x, ay = attacker.container.y
    const dx = defender.container.x, dy = defender.container.y

    const g = this.add.graphics().setDepth(9)
    // 메인 광선
    g.lineStyle(2.5, color, 0.9)
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(dx, dy); g.strokePath()
    // 두꺼운 글로우 레이어
    g.lineStyle(6, color, 0.18)
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(dx, dy); g.strokePath()
    // 임팩트 십자
    const r = Math.max(8, this.iso.hw * 0.22)
    g.lineStyle(2, color, 0.85)
    g.beginPath(); g.moveTo(dx - r, dy); g.lineTo(dx + r, dy); g.strokePath()
    g.beginPath(); g.moveTo(dx, dy - r); g.lineTo(dx, dy + r); g.strokePath()

    this.targetingGfx = g
    this.tweens.add({
      targets: g, alpha: 0, duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => { g.destroy(); if (this.targetingGfx === g) this.targetingGfx = null },
    })
  }

  // ----- HUD -----
  refreshHud(message) {
    const phaseLabel = this.phase === 'player' ? '플레이어 턴' : '적 턴'
    const fallback =
      this.phase === 'player'
        ? '아군 유닛을 클릭해 이동/공격하세요(각 행동마다 AP 1 소모, AP 0이면 더 행동 불가). 스페이스바: 턴 종료.'
        : '적이 행동 중입니다...'
    const text = message ?? fallback
    this.hudText.setText(`MOD-4 · 턴 ${this.turnNumber} (${phaseLabel})  —  ${text}`)
  }
}

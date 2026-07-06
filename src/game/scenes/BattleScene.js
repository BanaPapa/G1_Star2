import Phaser from 'phaser'
import { computeMovementRange, findPath, manhattanDistance } from '../../core/grid'
import { lookupCounterMultiplier } from '../../core/combat'
import { calculateHitChance, calculateDamage, resolveDamagePipeline, getDamageState, calculateDefenseReduction, calculateOverwatchChance, calculateFlagshipPower } from '../../core/combatMath'
import { getGameConfig } from '../../state/useGameConfigStore'
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
import { deriveSpawnZones, isTileBlocked, isTileVoid, getBlockingObjectCells, obstacleEmoji, gridToScreen, getCellVectors } from '../../core/battleMap'
import { getEmojiFallback } from '../../core/assetMap'
import CutinManager from '../effects/CutinManager'
import { useBattleStore } from '../../state/useBattleStore'
import { computeLaserShot } from '../weapons/laserPath'
import { rollIonHit } from '../weapons/ionEffects'
import { rollPlasmaHit, computeBlastCells, blastMultsForTier } from '../weapons/plasmaEffects'
import { familyColor, playHitImpact, playIonBolt, playPlasmaShot, playCannonTracer } from '../effects/weaponVfx'
import { addModifier, sumStat, hasModifier, consumeApEffects, tickTurn, modifierIcons } from '../systems/unitModifiers'

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

// ── Battle Map Editor 연동 ─────────────────────────────────────────────
// mapDefinition.tiles → 전투용 terrain id 2D 배열. void→'void', blocked→'blocked',
// blocksMovement 오브젝트가 점유한 타일도 'blocked', 나머지는 'empty'.
function buildTerrainFromMap(mapDef) {
  const layout = Array.from({ length: ROWS }, () => new Array(COLS).fill('empty'))
  const blockingObjs = getBlockingObjectCells(mapDef)
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (isTileVoid(mapDef, x, y)) layout[y][x] = 'void'
      else if (isTileBlocked(mapDef, x, y) || blockingObjs.has(`${x},${y}`)) layout[y][x] = 'blocked'
    }
  }
  return layout
}

// spawnZones에서 좌표 목록을 만들고, 필요한 최소 개수까지 순환 패딩한다.
function spawnPositionsFromMap(mapDef, side, minCount) {
  const zones = deriveSpawnZones(mapDef)
  const cells = (zones[side] ?? []).filter((c) => !isTileVoid(mapDef, c.x, c.y) && !isTileBlocked(mapDef, c.x, c.y))
  if (cells.length === 0) return null
  const out = []
  for (let i = 0; i < Math.max(minCount, cells.length); i += 1) out.push(cells[i % cells.length])
  return out
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

// providesCover 오브젝트에 인접한 칸에 서면 방어자에게 부여되는 EVA 보너스(엄폐).
const COVER_EVA_BONUS = 15

let HP_BAR_WIDTH = CELL * 0.56
const HP_BAR_HEIGHT = 4
const HP_BAR_BG_COLOR = 0x0d1520
const AP_BAR_COLOR = 0x4a90d9
const AP_BAR_BG_COLOR = 0x0d1520
const SHIELD_BAR_COLOR = 0x3ad6c4 // 실드 바(시안) — HP 바 위에 표시

// Cover block palette (impassable terrain)
const COVER_TOP    = 0x3a5a7a
const COVER_RIGHT  = 0x243e56
const COVER_LEFT   = 0x182d3f
const COVER_EDGE   = 0x6a9acc
// Selection brackets
const BRACKET_COLOR = 0x3ad6c4

const DAMAGE_TEXT_COLOR = '#ffd166'
const MISS_TEXT_COLOR = '#c8d8ff'
const HEAL_TEXT_COLOR = '#7dffb0'
const SHIELD_TEXT_COLOR = '#3ad6c4'
const FINISHER_READY_COLOR   = '#ffd166'
const FINISHER_WAIT_COLOR    = '#5a6a96'
const TOGGLE_COLOR           = '#8fa3d6'
const DEFENSE_STANCE_COLOR   = '#7dffb0'
const OVERWATCH_COLOR        = '#ff9f1c'

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
    // Battle Map Editor 맵의 커스텀 배경(경로 또는 dataURL) — 있으면 전장 배경으로 사용.
    if (this.mapDef?.background) {
      this.load.image('map_bg_custom', this.mapDef.background)
    }
    // 방향별 함선 스프라이트 — PNG가 있을 때만 실제 렌더링에 사용됨(없으면 이모지 폴백).
    for (const dir of ['ne', 'nw', 'se', 'sw']) {
      this.load.image(`hull_gunship_${dir}`, `/assets/hull_gunship_${dir}.png`)
    }
  }

  init({ ships, combatRules, skills, aces, enemies, items, node, gridCols, gridRows, mapDefinition, mock, onVictory, onExit, onEnding, onGameOver }) {
    // Battle Map Editor 맵이 지정되면 그 cols/rows를 우선 사용, 아니면 연구소 레벨 기반 크기.
    this.mapDef = mapDefinition ?? null
    this.mockControl = !!mock // 모의 전투: 적도 플레이어가 직접 조작
    COLS = this.mapDef ? this.mapDef.grid.cols : (gridCols ?? 20)
    ROWS = this.mapDef ? this.mapDef.grid.rows : (gridRows ?? 16)
    // this.scene.restart()에 그대로 재전달하기 위해 보관(MOD-6: 노드·콜백도 함께 — "같은 전투 다시 시작"에 필요)
    this.initArgs = { ships, combatRules, skills, aces, enemies, items, node, gridCols, gridRows, mapDefinition, mock, onVictory, onExit, onEnding, onGameOver }
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
    this.terrain = this.mapDef ? buildTerrainFromMap(this.mapDef) : buildTerrainLayout(node?.threatLevel ?? 1)
    // 엄폐: providesCover 오브젝트의 인접 칸 → 그 칸에 선 방어자는 EVA 보너스.
    this.coverTiles = new Set()
    this.mapObjects = this.mapDef?.objects ?? []
    for (const obj of this.mapObjects) {
      if (!obj.providesCover) continue
      const w = obj.size?.w ?? 1, h = obj.size?.h ?? 1
      for (let oy = obj.tileY; oy < obj.tileY + h; oy += 1) {
        for (let ox = obj.tileX; ox < obj.tileX + w; ox += 1) {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            this.coverTiles.add(`${ox + dx},${oy + dy}`)
          }
        }
      }
    }
    this.units = []
    this.allyQueue = []
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
    this.capturedShips    = []   // 투항으로 포획한 함선 이름 목록 — 승리 배너 표시용
    this.bossPhase2Triggered = new Set() // MOD-11: 보스 페이즈 2 전환 중복 방지
  }

  create() {
    // 개발 모드 전용 — E2E/헤드리스 QA가 씬을 직접 구동할 수 있는 훅 (프로덕션 빌드 제외)
    if (import.meta.env.DEV) window.__battleScene = this

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
    this.baseZoom = 1.0

    // ── Battle Map Editor 맵: 에디터 좌표(corners 기반 bilinear)를 그대로 사용 ──
    // cellToWorld가 mapDef.corners 투영을 쓰므로 그리드 형태·위치가 에디터와 동일.
    // 여기서는 스프라이트/HP바 크기만 셀 픽셀 크기에 맞춰 보정한다(월드=이미지 픽셀 공간).
    if (this.mapDef) {
      const cv = getCellVectors(this.mapDef.grid)
      const cellPx = (Math.hypot(cv.col.x, cv.col.y) + Math.hypot(cv.row.x, cv.row.y)) / 2
      // 함선이 셀을 가득 채우도록 넉넉히(셀 픽셀의 ~0.62) — 셀 수가 많아도 함선이 충분히 크게 보임.
      const hw = Math.max(24, cellPx * 0.62)
      const img = this.mapDef.imageSize ?? { width: 2560, height: 1440 }
      this.iso.hw = hw
      this.iso.hh = Math.round(hw * ISO_TILE_RATIO)
      this.iso.cx = img.width / 2
      this.iso.cy = img.height / 2
      CELL = hw
      HP_BAR_WIDTH = Math.round(hw * 1.6)
    }

    // ── 배경 이미지 ─────────────────────────────────────────────────
    // 커스텀 맵 배경이 있으면 그리드 영역에 맞춰(cover) 배치하고 그리드와 함께 스크롤(scrollFactor 1).
    // 아니면 기존 우주 배경(시차 0.15)으로 폴백.
    const bgCX = this.iso.cx
    const bgCY = this.iso.cy
    if (this.mapDef?.background && this.textures.exists('map_bg_custom')) {
      // 에디터에서 본 그대로 — 맵 이미지만 자연 크기(=imageSize)로 배치한다.
      // 이미지 바깥에는 아무 배경도 두지 않는다(카메라 줌/팬을 이미지 안으로 제한해 바깥이 보이지 않음).
      const img = this.mapDef.imageSize ?? { width: 2560, height: 1440 }
      const bg = this.add.image(img.width / 2, img.height / 2, 'map_bg_custom')
      bg.setDisplaySize(img.width, img.height)
      bg.setDepth(-10).setScrollFactor(1).setAlpha(1)
    } else {
      const bg = this.add.image(bgCX, bgCY, 'bg_space')
      bg.setDisplaySize(this.scale.width * 3.2, this.scale.height * 3.2)
      bg.setDepth(-10).setScrollFactor(0.15).setAlpha(0.92)
    }

    // ── 그리드 타일 생성 ─────────────────────────────────────────
    this.cellRects = []
    for (let y = 0; y < ROWS; y += 1) {
      const row = []
      for (let x = 0; x < COLS; x += 1) row.push(this.createCell(x, y))
      this.cellRects.push(row)
    }
    this.drawMapObjects()

    // 선택 브래킷·타겟팅 라인용 그래픽 레이어
    this.selectionGfx = null
    this.targetingGfx = null

    // 맵 스폰존이 있으면 우선 사용(없거나 비면 레거시 하드코딩 위치로 폴백).
    const allyStartPos = (this.mapDef && spawnPositionsFromMap(this.mapDef, 'player', this.roster.length)) || getAllyStartPositions()
    const allyPlacements = this.roster.map((entry, index) => {
      const pos = allyStartPos[index % allyStartPos.length]
      return { side: 'ally', instanceId: entry.instanceId, shipId: entry.shipId, aceId: entry.aceId, x: pos.x, y: pos.y }
    })
    // 전투 중 추가 소환(보스 2페이즈 void_rift 등)에서도 재사용하도록 this에 보관.
    this.enemySpawnPositions = (this.mapDef && spawnPositionsFromMap(this.mapDef, 'enemy', 8)) || getEnemySpawnPositions()
    const enemyPlacements = buildEncounterPlacements(this.node, {
      enemiesById: this.enemiesById,
      bossesById: this.bossesById,
      shipsById: this.shipsById,
      positions: this.enemySpawnPositions,
    })
    ;[...allyPlacements, ...enemyPlacements].forEach((placement) => this.spawnUnit(placement))
    this.designateFlagships()

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

    // 에디터 맵: 카메라/팬을 "이미지 영역 안"으로 제한한다.
    // - 최대 축소(min zoom) = 이미지 전체가 화면에 들어오는 contain-fit. 그 바깥으론 줌아웃/팬 불가(쓸데없는 배경 안 보임).
    // - 전투 시작은 이미지 전체 조감, 함대 이동/공격 시 줌인·추적.
    if (this.mapDef) {
      const img = this.mapDef.imageSize ?? { width: 2560, height: 1440 }
      // cover-fit: 이미지가 화면(상단 제외 전 영역)을 가득 채운다(여백 없음). 최소 줌도 이 값이라 바깥이 안 보임.
      const coverZoom = Math.max(this.scale.width / img.width, this.scale.height / img.height)
      this.cameras.main.setBounds(0, 0, img.width, img.height)
      this.cameras.main.setZoom(coverZoom)
      this.cameras.main.centerOn(img.width / 2, img.height / 2)
      this.baseZoom = coverZoom // 조감 = 최소 줌 = 화면 가득
      this.overviewCenter = { x: img.width / 2, y: img.height / 2 }
      this._camOverview = true
      this._lastFocus = null
    }

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
        // 에디터 맵은 corners 투영이 고정 — 회전하면 그리드/배경이 어긋나므로 비활성(팬·줌만).
        if (this.mapDef) return
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

    // 마우스 휠 줌 (Ctrl+휠도 동일하게 처리). 에디터 맵은 "맞춤 줌"을 기준으로 ±범위를 잡는다.
    this.zoomLevel = this.baseZoom ?? 1.0
    this.input.on('wheel', (_p, _go, _dx, deltaY) => {
      const base = this.baseZoom ?? 1.0
      const step = (deltaY > 0 ? -0.1 : 0.1) * base
      // 에디터 맵은 최소 줌 = base(이미지 전체). 그보다 더 축소 불가 → 이미지 바깥이 보이지 않는다.
      const minZ = this.mapDef ? base : 0.35
      const maxZ = this.mapDef ? base * 5 : 2.5
      this.zoomLevel = Phaser.Math.Clamp(this.zoomLevel + step, minZ, maxZ)
      this.cameras.main.setZoom(this.zoomLevel)
    })

    // 자동전투 토글은 React UI(BattleScreen)에서 관리 — 스토어 변경을 구독해 this.autoBattle 동기화
    this._unsubAutoBattle = useBattleStore.subscribe((state) => {
      const v = state.autoBattle
      if (v === this.autoBattle) return
      this.autoBattle = v
      if (!v || this.battleEnded) return
      this.pendingAbility = null
      this.clearSelection()
      // busy(애니메이션 중) 여부와 무관하게 일정 딜레이 후 시작 — busy가 먼저 풀리므로 타이밍 안전
      this.time.delayedCall(Math.max(this.actionDelay, 300), () => {
        if (!this.autoBattle || this.battleEnded) return
        if (this.phase === 'player') {
          this.runAllyAutoTurn(0)
        } else if (this.mockControl && this.phase === 'enemy') {
          // 모의 전투에서 적 수동 조작 중 자동전투를 켜면 적 AI가 이어받아 일반 전투처럼 진행한다.
          useBattleStore.getState().setPlayerPhase(false)
          this.clearSelection()
          this.enemyQueue = this.units.filter((u) => u.side === 'enemy')
          this.runEnemyUnit(0)
        }
      })
    })

    this.cutinManager = new CutinManager(this)

    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.busy || this.battleEnded) return
      if (this.phase === 'player' || (this.mockControl && this.phase === 'enemy')) this.endCurrentPhase()
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
    // 에디터 맵: corners 기반 bilinear 투영을 그대로 사용 → 그리드/유닛이 에디터와 동일 위치.
    // cellToWorld(x,y)=타일 중심이므로 그리드 라인 좌표(x+0.5,y+0.5)로 변환한다.
    if (this.mapDef) {
      const p = gridToScreen(this.mapDef, x + 0.5, y + 0.5)
      return { px: p.x, py: p.y }
    }
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

  // ----- 전투 카메라 연출 (에디터 맵 전용) -----
  // 전투 시작은 전체 조감(overview), 함대가 움직이거나 공격할 때부터 그 지점으로 줌인해 따라간다.
  // 플레이어는 토글 버튼으로 언제든 조감↔전투뷰를 오갈 수 있다.
  focusCameraOnWorld(px, py) {
    if (!this.mapDef || this.overviewCenter == null) return
    const zoom = Math.min((this.baseZoom ?? 1) * 2.1, 3.5)
    const cam = this.cameras.main
    this._lastFocus = { px, py }
    cam.pan(px, py, 300, 'Sine.easeInOut')
    cam.zoomTo(zoom, 300, 'Sine.easeInOut')
    this._camOverview = false
  }

  focusCameraOnUnit(unit) {
    if (!unit) return
    useBattleStore.getState().setActiveUnit(this._storeUnitId(unit)) // 행동 중인 함선 카드 강조
    if (!this.mapDef) return
    const { px, py } = this.cellToWorld(unit.gridX, unit.gridY)
    this.focusCameraOnWorld(px, py)
  }

  // 스토어 유닛 식별자(syncUnitsToStore의 id와 동일).
  _storeUnitId(unit) { return unit.instanceId ?? `${unit.side}_${unit.ship.name}` }

  restoreCameraOverview() {
    if (!this.mapDef || this.overviewCenter == null) return
    const cam = this.cameras.main
    cam.pan(this.overviewCenter.x, this.overviewCenter.y, 350, 'Sine.easeInOut')
    cam.zoomTo(this.baseZoom ?? 1, 350, 'Sine.easeInOut')
    this._camOverview = true
  }

  // 토글 버튼/단축키 — 조감(overview) ↔ 전투뷰(마지막 교전 지점)
  toggleCameraOverview() {
    if (!this.mapDef) return
    if (this._camOverview) {
      if (this._lastFocus) this.focusCameraOnWorld(this._lastFocus.px, this._lastFocus.py)
      else this.focusCameraOnUnit(this.units.find((u) => u.side === 'ally'))
    } else {
      this.restoreCameraOverview()
    }
  }

  // BattleScreen 미니맵용 — 현재 카메라가 전체 맵에서 차지하는 영역.
  getCameraInfo() {
    if (!this.mapDef) return null
    const v = this.cameras.main.worldView
    const img = this.mapDef.imageSize ?? { width: 2560, height: 1440 }
    return { x: v.x, y: v.y, w: v.width, h: v.height, mapW: img.width, mapH: img.height, overview: !!this._camOverview }
  }

  // ----- 그리드 셀 (아이소메트릭 마름모 — Graphics 방식: WebGL 삼각분할 선 없음) -----
  createCell(x, y) {
    const terrain = getTerrain(this.terrain[y][x])
    const { px, py } = this.cellToWorld(x, y)
    const hw = this.iso.hw
    const hh = this.iso.hh
    // void(맵에 없는 칸)는 아주 옅게 — 그리드 윤곽만 희미하게 남긴다.
    const baseAlpha = terrain.id === 'void' ? 0.06 : (terrain.passable ? TILE_FILL_ALPHA : TILE_BLOCK_ALPHA)

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

    // 통행 불가 지형 → 아이소메트릭 엄폐물 블록 (void는 "빈 공간"이므로 블록 없음)
    if (!terrain.passable && terrain.id !== 'void') this.drawCoverBlock(px, py)

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

  // mapDefinition.objects 를 타일 중심에 이모지로 렌더(전용 PNG 제작 전 폴백).
  // blocksMovement 오브젝트는 'blocked' 지형의 엄폐 블록 위에 아이콘으로 얹힌다.
  drawMapObjects() {
    this.objectGfxList?.forEach((o) => o.destroy())
    this.objectGfxList = []
    if (!this.mapObjects?.length) return
    const hw = this.iso.hw
    for (const obj of this.mapObjects) {
      const w = obj.size?.w ?? 1, h = obj.size?.h ?? 1
      const { px, py } = this.cellToWorld(obj.tileX + (w - 1) / 2, obj.tileY + (h - 1) / 2)
      const size = Math.max(16, Math.round(hw * 0.7))
      const t = this.add.text(px, py - hw * 0.2, obstacleEmoji(obj.assetKey), { fontSize: `${size}px` })
        .setOrigin(0.5).setDepth(3).setAlpha(0.95)
      if (obj.providesCover) {
        // 엄폐 제공 표식 — 작은 방패 글리프를 우하단에 덧붙임
        t.setData('cover', true)
      }
      this.objectGfxList.push(t)
    }
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
    let ship = entry ? applyEquipment(getEffectiveShip(baseShip, entry), entry, this.itemsById) : baseShip
    const finishers = entry ? getUnitFinishers({ ace, ship: baseShip, entry, allSkills: this.allSkills }) : []

    // enemyScaling override — config.overrides.enemyScaling[id] 또는 "*" (전체 적 공통) 배율 적용.
    if (placement.side === 'enemy') {
      const esConfig = getGameConfig()?.overrides?.enemyScaling
      const scaling = esConfig ? (esConfig[ship.id] ?? esConfig['*']) : null
      if (scaling) {
        ship = { ...ship }
        const m = (key, mult) => { if (mult != null) ship[key] = Math.round((ship[key] ?? 0) * mult) }
        m('hp',  scaling.hpMult)
        m('atk', scaling.atkMult)
        m('def', scaling.defMult)
        m('acc', scaling.accMult)
        m('eva', scaling.evaMult)
      }
    }

    // 유닛 본체 링 — hull 스프라이트가 있을 때는 숨기고 스프라이트로 대체
    const ring = this.add.circle(0, 0, radius, palette.fill)
    ring.setStrokeStyle(2.5, palette.ring, 0.95)

    // 방향별 스프라이트 또는 이모지 폴백 — hull 필드가 있고 PNG가 로드됐을 때 이미지 사용.
    // 아군은 화면 우하(se), 적군은 화면 좌상(nw) 방향을 기본으로 설정한다.
    const hull = ship.hull ?? null
    const defaultDir = placement.side === 'ally' ? 'se' : 'nw'
    const hullSpriteKey = hull ? `${hull}_${defaultDir}` : null
    const hasHullSprite = hullSpriteKey ? this.textures.exists(hullSpriteKey) : false

    // hull 스프라이트 사용 시: 링 숨김 + 이미지 그림자는 이미지에 포함하지 않으므로 별도 ellipse로 렌더링
    let shadowEllipse = null
    if (hasHullSprite) {
      ring.setAlpha(0)
      const shW = Math.round(hw * 1.4)
      const shH = Math.round(hw * 0.38)
      const shY = Math.round(hw * 0.6)
      shadowEllipse = this.add.ellipse(0, shY, shW, shH, 0x000000, 0.22)
    }

    let glyph
    if (hasHullSprite) {
      const spriteSize = Math.round(hw * 2.0)
      glyph = this.add.image(0, 0, hullSpriteKey)
        .setDisplaySize(spriteSize, spriteSize)
        .setOrigin(0.5, 0.5)
    } else {
      const glyphPx = Math.max(14, Math.round(hw * 0.62))
      glyph = this.add.text(0, 0, getEmojiFallback(ship.sprite), {
        fontSize: `${glyphPx}px`,
      }).setOrigin(0.5, 0.5)
    }

    // HP 바 (유닛 바로 위) — 배경 + 전면
    const barOffY = -radius - 6
    const hpBarBg = this.add.rectangle(0, barOffY, HP_BAR_WIDTH, HP_BAR_HEIGHT, HP_BAR_BG_COLOR)
      .setOrigin(0.5, 0.5)
    const hpBarFg = this.add.rectangle(-HP_BAR_WIDTH / 2, barOffY, HP_BAR_WIDTH, HP_BAR_HEIGHT, palette.ring)
      .setOrigin(0, 0.5)

    // Shield 바 (HP 바 위) — 시안. maxShield 0이면 숨김(요청서 18·19장).
    const config = getGameConfig()
    const ov = config.overrides?.shipStats?.[baseShip.id] ?? {}
    const maxShield = ov.maxShield ?? ov.shield ?? ship.maxShield ?? ship.shield ?? 0
    const armorVal = ov.armor ?? ship.armor ?? ship.def ?? 0
    const maxArmorDur = ov.armorDurability ?? ship.armorDurability ?? ship.maxArmorDurability ?? 0

    const shieldBarOffY = barOffY - HP_BAR_HEIGHT - 1
    const shieldBarBg = this.add.rectangle(0, shieldBarOffY, HP_BAR_WIDTH, HP_BAR_HEIGHT - 1, HP_BAR_BG_COLOR)
      .setOrigin(0.5, 0.5).setAlpha(maxShield > 0 ? 1 : 0)
    const shieldBarFg = this.add.rectangle(-HP_BAR_WIDTH / 2, shieldBarOffY, HP_BAR_WIDTH, HP_BAR_HEIGHT - 1, SHIELD_BAR_COLOR)
      .setOrigin(0, 0.5).setAlpha(maxShield > 0 ? 1 : 0)

    // AP 바 (Shield 바 위) — 파란색
    const apBarOffY = shieldBarOffY - HP_BAR_HEIGHT - 2
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

    // 그림자(shadowEllipse)는 컨테이너 맨 앞 — 링·스프라이트보다 먼저 그려져야 뒤에 깔림
    const containerItems = shadowEllipse
      ? [shadowEllipse, ring, hpBarBg, hpBarFg, shieldBarBg, shieldBarFg, apBarBg, apBarFg, glyph, label, statusLabel]
      : [ring, hpBarBg, hpBarFg, shieldBarBg, shieldBarFg, apBarBg, apBarFg, glyph, label, statusLabel]
    const container = this.add.container(px, py, containerItems)
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
      // Shield 이월 (요청서 19장): 아군이면 이전 전투 종료 시 저장된 방어막을 복원.
      shield: (() => {
        if (placement.side === 'ally' && placement.instanceId) {
          const rEntry = this.roster.find((r) => r.instanceId === placement.instanceId)
          if (rEntry?.currentShield != null) return Math.min(rEntry.currentShield, maxShield)
        }
        return maxShield
      })(),
      maxShield,
      armor: armorVal,
      armorDurability: maxArmorDur,
      maxArmorDurability: maxArmorDur,
      defenseReduction: 0,
      isDefenseStance: false,
      overwatchState: null,  // { radius, chance, accuracyPenalty, damageMultiplier, triggersLeft }
      isFlagship: false,
      apDebuff: 0,
      modifiers: [],         // Unit Modifier (Phase 4-0) — 무기 고유 효과 부착 목록 (systems/unitModifiers.js)
      weaponRangeBonus: (() => {
        if (placement.side !== 'ally' || !placement.instanceId) return 0
        const rEntry = this.roster.find((r) => r.instanceId === placement.instanceId)
        const weaponId = rEntry?.equipment?.weapon
        if (!weaponId) return 0
        const item = this.itemsById.get(weaponId)
        return item?.rangeBonus ?? 0
      })(),
      ace,
      finishers,
      hull,
      direction: defaultDir,
      hasHullSprite,
      glyph,
      container,
      ring,
      hpBarFg,
      shieldBarFg,
      apBarFg,
      label,
      statusLabel,
    }
    container.on('pointerup', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation()
      if (!this._isDragging) this.handleUnitClick(unit)
    })
    // 레이저 조준 프리뷰 — 적 유닛 호버 시 빔 경로·피격 순서 미리보기 (Phase 4-1)
    container.on('pointerover', () => this._onUnitHover(unit))
    container.on('pointerout', () => { this._clearLaserPreview(); this._clearPlasmaPreview() })

    this.units.push(unit)
    this.refreshUnitStatusLabel(unit)
    return unit
  }

  // ----- 입력 처리 -----
  // 현재 플레이어가 조작 가능한 진영. 일반 전투는 항상 'ally', 모의 전투에서는 적 턴이면 'enemy'.
  controlledSide() { return (this.mockControl && this.phase === 'enemy') ? 'enemy' : 'ally' }
  // 지금 캔버스 조작(선택/이동/공격)이 가능한가.
  canControl() {
    if (this.busy || this.battleEnded || this.autoBattle) return false
    return this.phase === 'player' || (this.mockControl && this.phase === 'enemy')
  }

  handleUnitClick(unit) {
    if (!this.canControl()) return

    // 내 조작 진영이 아닌 유닛 = 공격 대상으로 처리(모의 전투에서는 진영이 턴마다 뒤바뀐다).
    if (unit.side !== this.controlledSide()) {
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

    const config = getGameConfig()
    const distance = manhattanDistance({ x: attacker.gridX, y: attacker.gridY }, { x: enemy.gridX, y: enemy.gridY })
    const [minRng, baseMaxRng] = attacker.ship.rng

    // 무기2 슬롯이 장착된 경우 무기 선택 UI를 먼저 표시한다.
    const rEntry = attacker.instanceId
      ? useFleetStore.getState().roster.find((r) => r.instanceId === attacker.instanceId)
      : null
    if (rEntry?.equipment?.weapon2) {
      const w1 = this._getEquippedWeaponData(attacker, config, 'weapon')
      const w2 = this._getEquippedWeaponData(attacker, config, 'weapon2')
      const w1Ok = this._canFire(attacker, enemy, w1).ok
      const w2Ok = this._canFire(attacker, enemy, w2).ok
      if (w1Ok || w2Ok) {
        this._promptWeaponChoice(attacker, enemy, w1, w2, w1Ok, w2Ok, rEntry)
        return
      }
      // 둘 다 범위 밖이면 아래 단일 무기 경로에서 오류 메시지를 낸다
    }

    const weaponData = this._getEquippedWeaponData(attacker, config, 'weapon')

    // Laser 계열(Phase 4-1) — 맨해튼 사거리 대신 빔 경로(직선/관통/굴절)로 판정한다.
    if (weaponData.family === 'laser') {
      this._tryLaserAttack(attacker, enemy, weaponData, 'weapon')
      return
    }

    const maxRng = Math.max(minRng, baseMaxRng + (weaponData.rangeBonus ?? 0))

    if (distance < minRng || distance > maxRng) {
      this.refreshHud(
        `${attacker.ship.name}의 사거리(${minRng}-${maxRng}칸) 밖입니다 — 대상까지 거리 ${distance}칸. 이동 후 다시 시도하세요.`,
      )
      return
    }

    const apCost = weaponData.apCost ?? 1
    if (attacker.ap < apCost) {
      this.refreshHud(`${attacker.ship.name} — AP 부족! 이 무기는 ${apCost} AP 필요 (현재 ${attacker.ap} AP)`)
      return
    }

    // Plasma 광역(T3/T4)은 지점 폭발로 해소 — 그 외에는 단일 대상 전투
    if (this._isPlasmaBurst(weaponData)) {
      this.resolvePlasmaBurst(attacker, enemy, weaponData, 'weapon')
      return
    }
    this.resolveCombat(attacker, enemy)
  }

  // 두 무기 슬롯이 모두 장착된 경우 어떤 무기로 공격할지 칩으로 선택하게 한다.
  _promptWeaponChoice(attacker, enemy, w1, w2, w1Ok, w2Ok, rEntry) {
    this.actionChips?.forEach((chip) => chip.destroy())
    this.actionChips = []

    const w1Item = rEntry?.equipment?.weapon ? this.itemsById.get(rEntry.equipment.weapon) : null
    const w2Item = rEntry?.equipment?.weapon2 ? this.itemsById.get(rEntry.equipment.weapon2) : null
    let chipY = 34

    const addWeaponChip = (y, label, enabled, slot) => {
      const chip = this.add
        .text(16, y, label, {
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '14px',
          color: enabled ? '#ffd166' : '#555',
          fontStyle: enabled ? 'bold' : 'normal',
        })
        .setDepth(22).setScrollFactor(0)
      if (enabled) {
        chip.setInteractive({ useHandCursor: true })
        chip.on('pointerup', (_pointer, _lx, _ly, event) => {
          event?.stopPropagation()
          if (this._isDragging) return
          this.actionChips?.forEach((c) => c.destroy())
          this.actionChips = []
          this._attackWith(attacker, enemy, slot)
        })
      }
      this.actionChips.push(chip)
    }

    addWeaponChip(chipY,      `⚔️ 무기1: ${w1Item?.name ?? '기본'} (AP ${w1.apCost ?? 1}) — 클릭해서 선택`, w1Ok, 'weapon')
    addWeaponChip(chipY + 19, `⚔️ 무기2: ${w2Item?.name ?? '없음'} (AP ${w2.apCost ?? 1}) — 클릭해서 선택`, w2Ok, 'weapon2')
    this.refreshHud(`${attacker.ship.name} → ${enemy.ship.name}: 어떤 무기로 공격하시겠습니까?`)
  }

  // ── Laser 계열 (Phase 4-1) — 경로 판정은 weapons/laserPath.js 순수 모듈이 담당 ──

  // 이 무기로 지금 대상을 공격할 수 있는가 (듀얼 슬롯 칩 활성 판정 공용)
  _canFire(attacker, enemy, weaponData) {
    if (attacker.ap < (weaponData.apCost ?? 1)) return { ok: false }
    if (weaponData.family === 'laser') {
      return { ok: this._computeLaserShotFor(attacker, enemy, weaponData).valid }
    }
    const distance = manhattanDistance({ x: attacker.gridX, y: attacker.gridY }, { x: enemy.gridX, y: enemy.gridY })
    const [minRng, baseMaxRng] = attacker.ship.rng
    const maxRng = Math.max(minRng, baseMaxRng + (weaponData.rangeBonus ?? 0))
    return { ok: distance >= minRng && distance <= maxRng }
  }

  // 슬롯의 무기 계열에 따라 공격 방식 라우팅 (듀얼 슬롯 칩에서 호출)
  _attackWith(attacker, enemy, slot) {
    const weaponData = this._getEquippedWeaponData(attacker, getGameConfig(), slot)
    if (weaponData.family === 'laser') {
      this._tryLaserAttack(attacker, enemy, weaponData, slot)
    } else if (this._isPlasmaBurst(weaponData)) {
      this.resolvePlasmaBurst(attacker, enemy, weaponData, slot)
    } else {
      this.resolveCombat(attacker, enemy, undefined, slot)
    }
  }

  _laserMults(config) {
    const c = config?.combat?.weaponEffects?.laser ?? {}
    return {
      pierceSecondMult: c.pierceSecondMult ?? 0.5,
      deflectMults: c.deflectMults ?? [1, 1],
      phaseMults: c.phaseMults ?? [1, 1, 0.5],
    }
  }

  // 빔 차단 판정용 점유 맵 — 유닛(피아) + 통과 불가 지형. 공격자 칸은 제외.
  _buildLaserOccupancy(attacker) {
    const occupied = new Map()
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!getTerrain(this.terrain[y][x]).passable) occupied.set(`${x},${y}`, { kind: 'blocked' })
      }
    }
    for (const u of this.units) {
      if (u === attacker || u.hp <= 0) continue
      occupied.set(`${u.gridX},${u.gridY}`, { kind: u.side === attacker.side ? 'ally' : 'enemy' })
    }
    return occupied
  }

  _computeLaserShotFor(attacker, enemy, weaponData, config = getGameConfig()) {
    return computeLaserShot({
      attacker: { x: attacker.gridX, y: attacker.gridY },
      target: { x: enemy.gridX, y: enemy.gridY },
      tier: weaponData.tier || 1,
      range: weaponData.range ?? 10,
      cols: COLS,
      rows: ROWS,
      occupied: this._buildLaserOccupancy(attacker),
      mults: this._laserMults(config),
    })
  }

  _tryLaserAttack(attacker, enemy, weaponData, slot) {
    const apCost = weaponData.apCost ?? 1
    if (attacker.ap < apCost) {
      this.refreshHud(`${attacker.ship.name} — AP 부족! 이 무기는 ${apCost} AP 필요 (현재 ${attacker.ap} AP)`)
      return
    }
    this._clearLaserPreview()
    const shot = this._computeLaserShotFor(attacker, enemy, weaponData)
    if (!shot.valid) {
      const msg = {
        not_aligned: weaponData.tier <= 1 ? '상하좌우 직선 위의 적만 조준할 수 있습니다' : '직선(8방향) 위의 적만 조준할 수 있습니다',
        blocked: '장애물이 빔을 차단합니다',
        ally_block: '아군이 사선에 있어 발사할 수 없습니다',
        blocked_by_unit: '다른 유닛이 사선을 막고 있습니다 — 앞의 적을 먼저 조준하세요',
        out_of_range: '빔 사거리 밖입니다',
        no_path: '직선으로도, 굴절로도 닿는 경로가 없습니다',
      }[shot.reason] ?? '조준할 수 없습니다'
      this.refreshHud(`🔴 ${attacker.ship.name} [레이저] — ${msg}`)
      return
    }
    this.resolveLaserAttack(attacker, shot, weaponData, slot)
  }

  // 레이저 발사 — AP는 1회만 차감하고, 경로상 피격 대상을 순서대로 해소한다.
  resolveLaserAttack(attacker, shot, weaponData, slot) {
    this.clearSelection()
    this.spendAp(attacker, weaponData.apCost ?? 1)
    this.focusCameraOnUnit(attacker)
    this._flashLaserBeam(attacker, shot.path, shot.hits)

    const targets = shot.hits
      .map((h) => ({ unit: this.units.find((u) => u.gridX === h.x && u.gridY === h.y && u.hp > 0), mult: h.mult }))
      .filter((t) => t.unit)

    const fireAt = (idx) => {
      if (idx >= targets.length) return
      const { unit, mult } = targets[idx]
      if (!this.units.includes(unit) || unit.hp <= 0) { fireAt(idx + 1); return }
      this.resolveCombat(attacker, unit, () => fireAt(idx + 1), slot, {
        damageMultiplier: mult,
        skipApSpend: true,
        skipTargetLine: true,
      })
    }
    fireAt(0)
  }

  // 빔 폴리라인 그리기 (연출·프리뷰 공용) — { g, badges } 반환
  _drawLaserPolyline(attacker, pathCells, color, hits) {
    const g = this.add.graphics().setDepth(9)
    const points = [
      { x: attacker.container.x, y: attacker.container.y },
      ...pathCells.map((c) => {
        const { px, py } = this.cellToWorld(c.x, c.y)
        return { x: px, y: py }
      }),
    ]
    g.lineStyle(6, color, 0.25)
    g.beginPath()
    g.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y)
    g.strokePath()
    g.lineStyle(2.5, 0xffffff, 0.9)
    g.beginPath()
    g.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y)
    g.strokePath()

    const badges = hits.map((h, i) => {
      const { px, py } = this.cellToWorld(h.x, h.y)
      return this.add
        .text(px, py - CELL * 0.6, `${i + 1}${h.mult !== 1 ? ` ×${h.mult}` : ''}`, {
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#9be8ff',
          stroke: '#00303c',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(10)
    })
    return { g, badges }
  }

  // 발사 연출 — 잠깐 번쩍인 뒤 페이드아웃
  _flashLaserBeam(attacker, pathCells, hits) {
    if (this.laserFlash) {
      this.tweens.killTweensOf([this.laserFlash.g, ...this.laserFlash.badges])
      this.laserFlash.g.destroy()
      this.laserFlash.badges.forEach((b) => b.destroy())
    }
    const drawn = this._drawLaserPolyline(attacker, pathCells, 0x66eaff, hits)
    this.laserFlash = drawn
    this.tweens.add({
      targets: [drawn.g, ...drawn.badges],
      alpha: 0,
      duration: 800,
      delay: 350,
      onComplete: () => {
        drawn.g.destroy()
        drawn.badges.forEach((b) => b.destroy())
        if (this.laserFlash === drawn) this.laserFlash = null
      },
    })
  }

  // 조준 프리뷰 — 레이저 장착 아군 선택 상태에서 적 위에 호버하면 경로·피격 순서를 미리 보여준다.
  _onUnitHover(unit) {
    if (this.busy || this.battleEnded) return
    const attacker = this.selected
    if (!attacker || unit.side === attacker.side) return
    const config = getGameConfig()
    const weaponData = this._getEquippedWeaponData(attacker, config, 'weapon')
    // Plasma 광역 — 호버한 적을 중심으로 5×5 폭발 범위 프리뷰
    if (this._isPlasmaBurst(weaponData)) {
      this._clearPlasmaPreview()
      const cells = computeBlastCells({
        center: { x: unit.gridX, y: unit.gridY },
        cols: COLS, rows: ROWS,
        ringMults: blastMultsForTier(weaponData.tier || 3, config?.combat?.weaponEffects?.plasma),
      })
      this.plasmaPreview = this._drawBlastOverlay(cells, 0xff7a2a, 0.28)
      return
    }
    if (weaponData.family !== 'laser') return
    const shot = this._computeLaserShotFor(attacker, unit, weaponData, config)
    this._clearLaserPreview()
    if (!shot.valid) return
    this.laserPreview = this._drawLaserPolyline(attacker, shot.path, 0x66eaff, shot.hits)
    this.laserPreview.g.setAlpha(0.55)
  }

  _clearLaserPreview() {
    if (!this.laserPreview) return
    this.laserPreview.g.destroy()
    this.laserPreview.badges.forEach((b) => b.destroy())
    this.laserPreview = null
  }

  // 계열별 발사 연출 라우팅 — 이온=전기 볼트, 플라즈마=화염구, 그 외=예광탄. 명중이면 임팩트 링 추가.
  // (레이저는 _tryLaserAttack의 빔 연출이 담당 — 이 경로로 오지 않는다)
  _playAttackVfx(attacker, defender, weaponData, hit) {
    const from = { x: attacker.container.x, y: attacker.container.y }
    const to = { x: defender.container.x, y: defender.container.y }
    const fam = weaponData.family
    const color = familyColor(fam)
    if (fam === 'ion') {
      playIonBolt(this, from, to, color)
      if (hit) this.time.delayedCall(160, () => playHitImpact(this, to.x, to.y, color))
    } else if (fam === 'plasma') {
      playPlasmaShot(this, from, to, color, () => {
        if (hit) playHitImpact(this, to.x, to.y, color)
      })
    } else {
      playCannonTracer(this, from, to, color, () => {
        if (hit) playHitImpact(this, to.x, to.y, color)
      })
    }
  }

  // ── 무기 계열별 명중 시 효과 (Phase 4) — 판정은 weapons/* 순수 모듈, 부착·지속 규칙은 systems/unitModifiers.js ──

  // 보스 예외 레이어 대상 판정 — enemies.json bosses 등재 또는 role='boss'
  _isBossUnit(unit) {
    return this.bossesById.has(unit.ship.id) || unit.baseShip?.role === 'boss'
  }

  // 계열 라우터 — resolveCombat에서 명중 확정 후 호출. HUD 요약 문자열(또는 null) 반환.
  _applyWeaponHitEffects(defender, weaponData, config) {
    if (weaponData.family === 'ion') return this._applyIonHitEffects(defender, weaponData, config)
    if (weaponData.family === 'plasma' && [1, 2, 5].includes(weaponData.tier)) {
      return this._applyPlasmaHitEffects(defender, weaponData, config)
    }
    return null
  }

  // 이온 무기 명중 시 효과 부착. HUD용 요약 문자열(또는 null)을 반환한다.
  _applyIonHitEffects(defender, weaponData, config) {
    const fx = config?.combat?.weaponEffects ?? {}
    const roll = rollIonHit({
      tier: weaponData.tier || 1,
      isBoss: this._isBossUnit(defender),
      ionVulnerability: config?.combat?.shield?.ionVulnerabilityDefault ?? 1.0,
      cfg: fx.ion,
      bossCfg: fx.bossExceptions,
    })
    for (const mod of roll.modifiers) defender.modifiers = addModifier(defender.modifiers, mod)
    if (roll.nullifyShield) {
      defender.shield = 0
      this.updateShieldBar(defender)
    }
    this.refreshUnitStatusLabel(defender)

    const labels = roll.events
      .map((e) => ({
        stat: `📡 명중/회피 ${e.accMod}%`,
        ap_drain: e.bossConverted ? `⚡ AP -${e.amount} (보스 저항)` : `⚡ 다음 턴 AP -${e.amount}`,
        stun: '💫 스턴 — 다음 턴 행동 불가',
        shield_null: '🛡 쉴드 무력화!',
        iff: '🔀 피아식별 교란!',
        iff_boss_resist: `🔀 교란 저항 — 명중/회피 ${e.accMod}%`,
      })[e.type] ?? null)
      .filter(Boolean)

    if (labels.length > 0) {
      // 데미지 팝업과 겹치지 않게 살짝 늦게 띄운다
      this.time.delayedCall(450, () => {
        if (this.units.includes(defender)) this.showFloatingText(defender, labels[0], '#9be8ff')
      })
    }
    return labels.join(' · ') || null
  }

  // ── Plasma 계열 (Phase 4-3) — 멜팅 디버프·아머 붕괴·5×5 폭발·잔열 지대 ──

  // 플라즈마 명중 시 효과 부착 (T1/T2/T5). HUD 요약 문자열(또는 null) 반환.
  _applyPlasmaHitEffects(defender, weaponData, config) {
    const roll = rollPlasmaHit({
      tier: weaponData.tier || 1,
      isBoss: this._isBossUnit(defender),
      alreadyMaxHpHit: (defender.modifiers ?? []).some((m) => m.id === 'plasma_maxhp_hit'),
      cfg: config?.combat?.weaponEffects?.plasma,
    })
    for (const mod of roll.modifiers) defender.modifiers = addModifier(defender.modifiers, mod)
    if (roll.maxHpDamagePct > 0) {
      const loss = Math.floor(defender.maxHp * roll.maxHpDamagePct / 100)
      defender.maxHp = Math.max(1, defender.maxHp - loss)
      defender.hp = Math.min(defender.hp, defender.maxHp)
      this.updateHpBar(defender)
    }
    this.refreshUnitStatusLabel(defender)

    const labels = roll.events
      .map((e) => ({
        melt: `🔥 방어 ${e.defPct}%${e.atkPct ? ` · 공격 ${e.atkPct}%` : ''}${e.permanent ? ' (영구)' : ''}`,
        annihilate: `☢ 아머 붕괴 · 최대HP -${e.maxHpDamagePct}%`,
        annihilate_boss: `☢ 최대HP -${e.maxHpDamagePct}% (보스 저항)`,
        annihilate_resist: '☢ 저항 — 이미 적용됨',
      })[e.type] ?? null)
      .filter(Boolean)

    if (labels.length > 0) {
      this.time.delayedCall(450, () => {
        if (this.units.includes(defender)) this.showFloatingText(defender, labels[0], '#ff9a3d')
      })
    }
    return labels.join(' · ') || null
  }

  // T3/T4 광역 여부 — area 태그 기준 (데이터 주도)
  _isPlasmaBurst(weaponData) {
    return weaponData.family === 'plasma' && weaponData.area === 'burst5x5'
  }

  // 지점 폭발 해소 — 중심 명중 판정 1회(빗나가면 전체 불발), 명중 시 5×5 링 배율로 피아 무차별 피해.
  resolvePlasmaBurst(attacker, target, weaponData, slot) {
    const config = getGameConfig()
    this._clearPlasmaPreview()
    this.clearSelection()
    this.busy = true
    this.spendAp(attacker, weaponData.apCost ?? 1)
    this.focusCameraOnUnit(attacker)

    // 중심 명중 판정 — resolveCombat과 동일한 명중식 (guaranteedHit 파생 피해에는 미적용)
    const defTerrain = getTerrain(this.terrain[target.gridY][target.gridX])
    const atkState = getDamageState(attacker.maxHp > 0 ? attacker.hp / attacker.maxHp : 1, config)
    const defState = getDamageState(target.maxHp > 0 ? target.hp / target.maxHp : 1, config)
    const flagAcc = this.flagshipAccPenalty ?? { ally: 0, enemy: 0 }
    const hitRes = calculateHitChance(
      { acc: attacker.ship.acc + (attacker.side === 'ally' ? (flagAcc.ally ?? 0) : (flagAcc.enemy ?? 0)) + sumStat(attacker.modifiers, 'accMod') },
      { eva: target.ship.eva },
      null,
      {
        terrainAccMod: defTerrain.accMod,
        damageStateAccMod: atkState.accMod,
        evasionContext: { terrainEvaMod: defTerrain.evaMod + this._coverEvaBonus(target.gridX, target.gridY), damageStateEvaMod: defState.evaMod + sumStat(target.modifiers, 'evaMod') },
      },
      config,
    )
    if (Math.random() * 100 >= hitRes.hitChance) {
      this._dodgeUnit(target, attacker)
      this.showFloatingText(target, '회피!', MISS_TEXT_COLOR, () => { this.busy = false })
      this.refreshHud(`${attacker.ship.name} → ${target.ship.name} : 폭발 조준 빗나감! (명중률 ${hitRes.hitChance}%)`)
      return
    }

    // 폭발 범위 — 배율 링 계산 + 연출
    const plasmaCfg = config?.combat?.weaponEffects?.plasma
    const cells = computeBlastCells({
      center: { x: target.gridX, y: target.gridY },
      cols: COLS, rows: ROWS,
      ringMults: blastMultsForTier(weaponData.tier || 3, plasmaCfg),
    })

    // 범위 내 모든 유닛(피아 무차별, 공격자 포함)을 링 배율로 순차 해소
    const cellMult = new Map(cells.map((c) => [`${c.x},${c.y}`, c.mult]))
    const victims = this.units
      .filter((u) => u.hp > 0 && cellMult.has(`${u.gridX},${u.gridY}`))
      .map((u) => ({ unit: u, mult: cellMult.get(`${u.gridX},${u.gridY}`) }))

    const isHellfire = (weaponData.tier || 3) >= 4
    const fireAt = (idx) => {
      if (idx >= victims.length) {
        // T4 — 잔열 지대 생성 (기존 residual_heat 필드효과 연결)
        if (isHellfire) this._createHeatZone(cells, config)
        this.busy = false
        this.refreshHud(
          `${attacker.ship.name} [플라즈마] 폭발! 범위 내 ${victims.length}기 피격${isHellfire ? ' · 잔열 지대 생성' : ''} (명중률 ${hitRes.hitChance}%)`,
        )
        return
      }
      const { unit, mult } = victims[idx]
      if (!this.units.includes(unit) || unit.hp <= 0 || mult <= 0) { fireAt(idx + 1); return }
      this.resolveCombat(attacker, unit, () => fireAt(idx + 1), slot, {
        damageMultiplier: mult,
        guaranteedHit: true,
        skipApSpend: true,
        skipTargetLine: true,
      })
    }
    // 화염구가 중심에 도착하면 폭발 범위 플래시 + 피해 해소 시작
    playPlasmaShot(
      this,
      { x: attacker.container.x, y: attacker.container.y },
      { x: target.container.x, y: target.container.y },
      familyColor('plasma'),
      () => {
        this._flashBlastArea(cells)
        fireAt(0)
      },
    )
  }

  // 폭발/프리뷰 공용 — 셀 다이아몬드 오버레이 그리기 ({ g } 반환)
  _drawBlastOverlay(cells, color, alpha) {
    const g = this.add.graphics().setDepth(3)
    for (const c of cells) {
      if (c.mult <= 0) continue
      const h = 0.45
      const pts = [
        this.cellToWorld(c.x - h, c.y - h),
        this.cellToWorld(c.x + h, c.y - h),
        this.cellToWorld(c.x + h, c.y + h),
        this.cellToWorld(c.x - h, c.y + h),
      ]
      g.fillStyle(color, alpha * (0.5 + 0.5 * c.mult))
      g.beginPath()
      g.moveTo(pts[0].px, pts[0].py)
      for (let i = 1; i < 4; i++) g.lineTo(pts[i].px, pts[i].py)
      g.closePath()
      g.fillPath()
    }
    return { g }
  }

  _flashBlastArea(cells) {
    const drawn = this._drawBlastOverlay(cells, 0xff7a2a, 0.5)
    this.tweens.add({
      targets: drawn.g, alpha: 0, duration: 900, delay: 250, ease: 'Cubic.easeOut',
      onComplete: () => drawn.g.destroy(),
    })
  }

  _clearPlasmaPreview() {
    if (!this.plasmaPreview) return
    this.plasmaPreview.g.destroy()
    this.plasmaPreview = null
  }

  // ── 잔열 지대 (T4) — this.terrain을 residual_heat로 임시 전환, 만료 시 원복 ──

  _createHeatZone(blastCells, config) {
    const turns = config?.combat?.weaponEffects?.plasma?.heatZoneTurns ?? 1
    const zone = { cells: [], expiresTurn: this.turnNumber + turns }
    for (const c of blastCells) {
      const cur = this.terrain[c.y][c.x]
      const t = getTerrain(cur)
      if (!t.passable || t.fieldEffectType) continue // 통과 불가·기존 필드효과 칸은 덮지 않음
      zone.cells.push({ x: c.x, y: c.y, prevType: cur })
      this.terrain[c.y][c.x] = 'residual_heat'
      this._repaintTerrainTile(c.x, c.y)
    }
    if (zone.cells.length > 0) {
      if (!this.heatZones) this.heatZones = []
      this.heatZones.push(zone)
    }
  }

  // 플레이어 턴 시작 시(주기 피해 이전) 만료 잔열을 원복한다.
  _expireHeatZones() {
    if (!this.heatZones?.length) return
    const keep = []
    for (const zone of this.heatZones) {
      if (this.turnNumber > zone.expiresTurn) {
        for (const c of zone.cells) {
          this.terrain[c.y][c.x] = c.prevType
          this._repaintTerrainTile(c.x, c.y)
        }
      } else {
        keep.push(zone)
      }
    }
    this.heatZones = keep
  }

  // 지형 타입 변경 후 타일 시각을 갱신한다 (하이라이트 중이면 색만 저장).
  _repaintTerrainTile(x, y) {
    const g = this.cellRects?.[y]?.[x]
    if (!g) return
    const terrain = getTerrain(this.terrain[y][x])
    const baseAlpha = terrain.id === 'void' ? 0.06 : (terrain.passable ? TILE_FILL_ALPHA : TILE_BLOCK_ALPHA)
    g.setData('baseColor', terrain.color)
    g.setData('baseAlpha', baseAlpha)
    if (!this.highlighted.has(`${x},${y}`)) {
      this._redrawTile(g, x, y, terrain.color, baseAlpha, GRID_LINE_ALPHA)
    }
  }

  handleCellClick(x, y) {
    if (!this.canControl()) return

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
    useBattleStore.getState().setActiveUnit(this._storeUnitId(unit))
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

    const range = computeMovementRange(
      { x: unit.gridX, y: unit.gridY },
      unit.ship.mov,
      (cx, cy) => this.isPassable(cx, cy),
      (cx, cy) => this._getTerrainMoveCost(cx, cy),
    )
    for (const { x, y } of range) {
      this.highlighted.add(`${x},${y}`)
      this.setCellHighlight(x, y, true, HIGHLIGHT_COLOR)
    }

    this.drawSelectionIndicator(unit)
    this.refreshActionMenu()
    const w1 = this._equippedWeaponInfo(unit)
    const w2 = this._equippedWeaponInfo(unit, 'weapon2')
    const weaponPart = (w1 || w2)
      ? ` · 무기: ${[w1, w2].filter(Boolean).map((w) => `${w.name}(T${w.tier}·AP${w.apCost})`).join(' / ')}`
      : (unit.side === 'ally' && unit.instanceId ? ' · 무기: 기본 포 (함대 편성에서 장착 가능)' : '')
    this.refreshHud(
      `선택: ${unit.ship.name} (MOV ${unit.ship.mov} · AP ${unit.ap}/${unit.maxAp}${weaponPart}) — 이동 가능 ${range.length}칸. ` +
        `칸을 클릭하면 이동(AP -1), 사거리 안의 적을 클릭하면 공격합니다.`,
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
    useBattleStore.getState().setActiveUnit(null)
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
        if (!terrain.passable && terrain.id !== 'void') this.drawCoverBlock(px, py)
      }
    }

    // 맵 오브젝트 재배치(yaw 회전 반영)
    this.drawMapObjects()

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
    if (!unit || unit.side !== 'ally') return

    let chipY = 34
    const addChip = (y, text, color, opts = {}) => {
      const chip = this.add
        .text(16, y, text, {
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '13px',
          fontStyle: opts.bold ? 'bold' : 'normal',
          color,
        })
        .setDepth(22).setScrollFactor(0)
      if (opts.blink) this.tweens.add({ targets: chip, alpha: 0.4, duration: 480, yoyo: true, repeat: -1 })
      this.actionChips.push(chip)
      return chip
    }

    // ── 필살기 칩 ──
    if (unit.finishers?.length) {
      const ready = unit.tp >= TP_MAX
      unit.finishers.forEach((finisherEntry, idx) => {
        const { skill, presenterName } = finisherEntry
        const label = ready
          ? `✨ [${presenterName}] 필살기 "${skill.name}" 발동 가능! — 클릭해서 사용`
          : `${presenterName}의 필살기 "${skill.name}" — TP ${Math.round((unit.tp / TP_MAX) * 100)}% (가득 차면 발동)`
        const chip = addChip(chipY + idx * 19, label, ready ? FINISHER_READY_COLOR : FINISHER_WAIT_COLOR, { bold: ready, blink: ready })
        if (ready) {
          chip.setInteractive({ useHandCursor: true })
          chip.on('pointerup', (_pointer, _lx, _ly, event) => {
            event?.stopPropagation()
            if (!this._isDragging) this.beginFinisherTargeting(unit, finisherEntry)
          })
        }
      })
      chipY += unit.finishers.length * 19 + 6
    }

    // ── 태세 칩 ──
    if (unit.isDefenseStance) {
      const pct = Math.round((unit.defenseReduction ?? 0) * 100)
      addChip(chipY, `🛡 방어 태세 활성 — 피해 ${pct}% 감소 (이 턴)`, DEFENSE_STANCE_COLOR)
    } else if (unit.overwatchState) {
      const ow = unit.overwatchState
      addChip(chipY, `👁 경계 태세 활성 — 반경 ${ow.radius}칸 · 반격 ${ow.chance}% (반격 ${ow.triggersLeft}회 · ${ow.turnsLeft ?? 1}턴 남음)`, OVERWATCH_COLOR)
    } else if (unit.ap > 0) {
      const config = getGameConfig()
      const dr  = calculateDefenseReduction(unit.ship, unit.ap, config)
      const pct = Math.round(dr * 100)
      const defChip = addChip(chipY, `🛡 방어 태세 (AP ${unit.ap} 소모 → 피해 -${pct}%) — 클릭`, DEFENSE_STANCE_COLOR)
      defChip.setInteractive({ useHandCursor: true })
      defChip.on('pointerup', (_pointer, _lx, _ly, event) => {
        event?.stopPropagation()
        if (!this._isDragging) this.executeDefenseStance(unit)
      })

      const ow = calculateOverwatchChance(unit.ship, unit.ap, config)
      if (ow) {
        const owChip = addChip(chipY + 19, `👁 경계 태세 (AP ${unit.ap} 소모 → 반경 ${ow.radius}칸 · 반격 ${ow.chance}%) — 클릭`, OVERWATCH_COLOR)
        owChip.setInteractive({ useHandCursor: true })
        owChip.on('pointerup', (_pointer, _lx, _ly, event) => {
          event?.stopPropagation()
          if (!this._isDragging) this.executeOverwatch(unit)
        })
      }
    }
  }

  executeDefenseStance(unit) {
    if (unit.ap <= 0 || unit.isDefenseStance || unit.overwatchState) return
    const config = getGameConfig()
    const reduction = calculateDefenseReduction(unit.ship, unit.ap, config)
    unit.defenseReduction = reduction
    unit.isDefenseStance  = true
    this.spendAp(unit, unit.ap)
    const pct = Math.round(reduction * 100)
    this.showFloatingText(unit, `🛡 +${pct}%`, DEFENSE_STANCE_COLOR)
    this.refreshHud(`${unit.ship.name} — 방어 태세! 이번 턴 피해 ${pct}% 감소`)
    this.refreshActionMenu()
    this.syncUnitsToStore()
  }

  executeOverwatch(unit) {
    if (unit.ap <= 0 || unit.isDefenseStance || unit.overwatchState) return
    const config = getGameConfig()
    const ow = calculateOverwatchChance(unit.ship, unit.ap, config)
    if (!ow) return
    unit.overwatchState = {
      ...ow,
      triggersLeft: config?.combat?.overwatch?.maxTriggersPerTurn ?? 1,
      turnsLeft: config?.combat?.overwatch?.duration ?? 1,
    }
    this.spendAp(unit, unit.ap)
    this.showFloatingText(unit, '👁 경계!', OVERWATCH_COLOR)
    this.refreshHud(`${unit.ship.name} — 경계 태세! 반경 ${ow.radius}칸 안에 적이 이동하면 반격 (확률 ${ow.chance}%)`)
    this.refreshActionMenu()
    this.syncUnitsToStore()
  }

  // 적 유닛이 이동을 마친 뒤 호출 — 경계 태세 아군이 사거리 안에 있으면 반격 발사.
  checkOverwatchTrigger(movedEnemy, onDone) {
    if (!this.units.includes(movedEnemy) || movedEnemy.hp <= 0) { onDone(); return }

    const eligible = this.units.filter(u =>
      u.side === 'ally' &&
      u.overwatchState &&
      u.overwatchState.triggersLeft > 0 &&
      u.hp > 0 &&
      manhattanDistance({ x: u.gridX, y: u.gridY }, { x: movedEnemy.gridX, y: movedEnemy.gridY }) <= u.overwatchState.radius
    )
    if (eligible.length === 0) { onDone(); return }

    const fireNext = (idx) => {
      if (idx >= eligible.length || !this.units.includes(movedEnemy) || movedEnemy.hp <= 0) { onDone(); return }
      const watcher = eligible[idx]
      if (!this.units.includes(watcher) || watcher.hp <= 0) { fireNext(idx + 1); return }

      const owState = watcher.overwatchState
      if (Math.random() * 100 >= owState.chance) {
        this.refreshHud(`${watcher.ship.name} 경계 반격 빗나감 (확률 ${owState.chance}%)`)
        fireNext(idx + 1)
        return
      }

      watcher.overwatchState.triggersLeft -= 1
      this.showFloatingText(watcher, '👁 반격!', OVERWATCH_COLOR)
      watcher._overwatchAccPenalty = owState.accuracyPenalty ?? 0
      watcher._overwatchDmgMult   = owState.damageMultiplier ?? 0.7
      this.resolveCombat(watcher, movedEnemy, () => {
        watcher._overwatchAccPenalty = null
        watcher._overwatchDmgMult   = null
        fireNext(idx + 1)
      })
    }
    fireNext(0)
  }

  // ----- 기함 시스템 (요청서 25장) -----

  // 전투 시작 시 기함을 지정한다. 전투력(calculateFlagshipPower) 최고 유닛이 자동 선정.
  designateFlagships() {
    const config = getGameConfig()
    this.playerFlagshipDestroyed = false
    this.enemyFlagshipDestroyed  = false
    this.flagshipAccPenalty      = { ally: 0, enemy: 0 }
    this.pendingFlee             = false

    const pickFlagship = (side) => {
      const group = this.units.filter(u => u.side === side)
      if (!group.length) return null
      return group.reduce((best, u) =>
        calculateFlagshipPower(u.ship, config) > calculateFlagshipPower(best.ship, config) ? u : best
      )
    }

    const ally = pickFlagship('ally')
    if (ally) { ally.isFlagship = true; this._attachFlagshipCrown(ally) }

    const enemy = pickFlagship('enemy')
    if (enemy) { enemy.isFlagship = true; this._attachFlagshipCrown(enemy) }
  }

  // 유닛 컨테이너에 왕관 아이콘을 추가한다.
  _attachFlagshipCrown(unit) {
    const hw = this.iso.hw
    const radius = Math.max(14, Math.round(hw * 0.44))
    const crownSize = Math.max(8, Math.round(hw * 0.28))
    const crown = this.add.text(0, -(radius + crownSize + 2), '👑', {
      fontSize: `${crownSize}px`,
    }).setOrigin(0.5, 1).setDepth(0)
    unit.container.add(crown)
    unit.flagshipCrown = crown
  }

  // 기함 격파 시 효과 적용 — destroyUnit에서 호출.
  _applyFlagshipDestroyedEffects(unit) {
    const config = getGameConfig()
    const flagCfg = config?.combat?.flagship ?? {}

    if (unit.side === 'ally') {
      this.playerFlagshipDestroyed = true
      const fx = flagCfg.playerFlagshipDestroyedEffects ?? {}
      this.flagshipAccPenalty.ally = fx.allyAccuracyPenalty ?? 0
      useBattleStore.getState().setPlayerFlagshipDestroyed(true)
      this.refreshHud(
        `⚠️ 아군 기함 "${unit.ship.name}" 격파! 도주·협상 불가, 명중률 ${fx.allyAccuracyPenalty ?? 0}%`
      )
    } else {
      this.enemyFlagshipDestroyed = true
      const fx = flagCfg.enemyFlagshipDestroyedEffects ?? {}
      this.flagshipAccPenalty.enemy = fx.enemyAccuracyPenalty ?? 0
      useBattleStore.getState().setEnemyFlagshipDestroyed(true)
      this.refreshHud(
        `✅ 적 기함 "${unit.ship.name}" 격파! 적 명중률 저하, 협상 성공률 상승`
      )
    }
  }

  // 도주 신청 — 다음 플레이어 턴 시작 시 자동 이탈.
  setPendingFlee() {
    if (this.battleEnded) return
    this.pendingFlee = true
    this.refreshHud('🚀 도주 신청 완료 — 다음 턴 시작 시 이탈합니다.')
  }

  // 장착 무기 데이터를 config override와 병합해 반환 (요청서 6장 무기별 AP·사거리·관통).
  // 적 유닛이나 무기 미장착 시 기본값(apCost:1, rangeBonus:0, pierce:0) 폴백.
  // slot: 'weapon' | 'weapon2' — 어떤 슬롯의 무기를 읽을지 지정 (기본 'weapon').
  _getEquippedWeaponData(unit, config, slot = 'weapon') {
    const defaults = { apCost: 1, rangeBonus: 0, pierce: 0, family: null, tier: 0, range: null, area: null, areaRadius: 0 }
    if (!unit.instanceId) return defaults
    const rEntry = useFleetStore.getState().roster.find((r) => r.instanceId === unit.instanceId)
    const weaponId = rEntry?.equipment?.[slot]
    if (!weaponId) return defaults
    const item = this.itemsById.get(weaponId)
    if (!item) return defaults
    const ov = config?.overrides?.weaponStats?.[weaponId] ?? {}
    return {
      apCost:     ov.apCost     ?? item.apCost     ?? 1,
      rangeBonus: ov.rangeBonus ?? item.rangeBonus ?? 0,
      pierce:     ov.pierce     ?? item.pierce     ?? 0,
      // 계열 메커니즘용(Phase 4) — family/tier로 판정 분기, range는 절대 사거리(빔 길이 등), area는 광역 형태
      family:     ov.family     ?? item.family     ?? null,
      tier:       ov.tier       ?? item.tier       ?? 0,
      range:      ov.range      ?? item.range      ?? null,
      area:       ov.area       ?? item.area       ?? null,
      areaRadius: ov.areaRadius ?? item.areaRadius ?? 0,
    }
  }

  // 장착 무기 표시 정보 (카드덱/HUD용) — 미장착이면 null
  _equippedWeaponInfo(unit, slot = 'weapon') {
    if (!unit.instanceId) return null
    const rEntry = useFleetStore.getState().roster.find((r) => r.instanceId === unit.instanceId)
    const weaponId = rEntry?.equipment?.[slot]
    const item = weaponId ? this.itemsById.get(weaponId) : null
    return item ? { name: item.name, tier: item.tier ?? 0, family: item.family ?? null, apCost: item.apCost ?? 1 } : null
  }

  // 투항 판정 — boss/플래그십이 아닌 적이 격파될 때 config 확률로 투항.
  _rollSurrender(unit) {
    const config = getGameConfig()
    const surCfg = config?.combat?.surrender ?? {}
    if (!surCfg.enabled) return false
    const role = unit.baseShip?.role ?? ''
    if (role === 'boss' && !surCfg.bossCanSurrender) return false
    return Math.random() * 100 < (surCfg.baseChance ?? 20)
  }

  // 투항 포획 처리 — 적 함선을 플레이어 로스터에 추가하고 캡처 목록에 기록.
  _captureEnemyShip(unit) {
    const shipId = unit.baseShip?.id ?? unit.ship?.id
    if (!shipId) { this.defeatedEnemyShips.push(unit.baseShip); return }
    const instanceId = `${shipId}-captured-${Date.now()}`
    useFleetStore.getState().addCapturedShip({ instanceId, shipId })
    this.capturedShips.push(unit.ship?.name ?? shipId)
    this.showFloatingText(unit, '🏳 투항!', '#7dffb0')
  }

  // 도주·협상 실패 패널티 — 아군 기함 AP를 0으로.
  penalizeFlagshipAp() {
    const flagship = this.units.find((u) => u.side === 'ally' && u.isFlagship)
    if (!flagship) return
    this.spendAp(flagship, flagship.ap)
    this.showFloatingText(flagship, 'AP 0!', '#e23b4e')
    this.refreshHud(`⚠️ 기함 "${flagship.ship.name}" — 도주/협상 실패로 이번 턴 행동 불가!`)
    this.syncUnitsToStore()
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
        // 이온 쉴드 무력화(recharge_block) 중에는 충전 불가
        if (hasModifier(target.modifiers, 'recharge_block')) {
          this.showFloatingText(target, '🚫 재충전 차단', '#9be8ff')
        } else {
          target.shield = (target.shield ?? 0) + effect.shield
          this.refreshUnitStatusLabel(target)
        }
      }
    }
    const parts = []
    if (effect.heal) parts.push(`HP +${effect.heal}`)
    if (effect.shield) parts.push(`실드 +${effect.shield}`)
    this.refreshHud(`${unit.ship.name} → "${skill.name}" 발동! 아군 전원 ${parts.join(' · ')}`)
  }

  applyOffensiveFinisher(unit, skill, targets) {
    const effect = skill.effect
    const config = getGameConfig()
    const summaries = []
    for (const target of targets) {
      if (!this.units.includes(target)) continue

      const defTerrain = getTerrain(this.terrain[target.gridY][target.gridX])
      const atkState = getDamageState(unit.maxHp > 0 ? unit.hp / unit.maxHp : 1, config)
      const defState = getDamageState(target.maxHp > 0 ? target.hp / target.maxHp : 1, config)

      const hitRes = calculateHitChance(
        { acc: unit.ship.acc },
        { eva: target.ship.eva },
        null,
        {
          terrainAccMod: defTerrain.accMod,
          damageStateAccMod: atkState.accMod,
          evasionContext: { terrainEvaMod: defTerrain.evaMod + this._coverEvaBonus(target.gridX, target.gridY), damageStateEvaMod: defState.evaMod },
        },
        config,
      )
      const hit = !!effect.unavoidable || Math.random() * 100 < hitRes.hitChance

      if (!hit) {
        this._dodgeUnit(target, unit)
        this.showFloatingText(target, '회피!', MISS_TEXT_COLOR)
        summaries.push(`${target.ship.name} 회피`)
        continue
      }

      const counter = lookupCounterMultiplier(this.combatRules.counterMultiplier, unit.ship.id, target.ship.id)
      const finalDamage = calculateDamage(
        { atk: unit.ship.atk }, null,
        { counterMultiplier: counter, damageMultiplier: effect.damageMultiplier ?? 1 },
        config,
      )
      const shieldBefore = target.shield ?? 0
      const pipe = resolveDamagePipeline(
        {
          defender: { shield: target.shield, armor: target.armor, armorDurability: target.armorDurability, hp: target.hp },
          finalDamage,
          shieldPierce: effect.pierce ?? 0,
          defenseReduction: target.defenseReduction ?? 0,
        },
        config,
      )
      target.shield = pipe.shieldAfter
      target.armorDurability = pipe.armorDurabilityAfter
      target.hp = Math.max(0, pipe.hpAfter)
      this.updateHpBar(target)
      this.updateShieldBar(target)

      const shieldAbsorbed = Math.max(0, Math.round(shieldBefore - pipe.shieldAfter))
      const toShield = pipe.hpDamage <= 0 && shieldAbsorbed > 0
      const dmgColor = toShield ? SHIELD_TEXT_COLOR : DAMAGE_TEXT_COLOR
      const dmgLabel = toShield ? `🛡-${shieldAbsorbed}` : `-${pipe.hpDamage}`
      this.showFloatingText(target, dmgLabel, dmgColor)

      if (effect.apDebuff) target.apDebuff = (target.apDebuff ?? 0) + effect.apDebuff
      const lethal = pipe.destroyed
      if (lethal) this.destroyUnit(target)
      else this.checkBossPhaseTransition(target)
      const displayDmg = toShield ? shieldAbsorbed : pipe.hpDamage
      summaries.push(`${target.ship.name} ${displayDmg}데미지${lethal ? ' (격파!)' : ''}`)
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

  // 이동 벡터(dx, dy)로 아이소메트릭 4방향을 결정한다.
  // 아이소 좌표계에서 +x=우하(SE), -x=좌상(NW), +y=좌하(SW), -y=우상(NE).
  _dirFromDelta(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'se' : 'nw'
    return dy >= 0 ? 'sw' : 'ne'
  }

  // 유닛의 방향이 바뀌었을 때 hull 스프라이트(Phaser Image) 텍스처를 교체한다.
  // hasHullSprite가 false면 이모지 Text이므로 아무것도 하지 않는다.
  _refreshUnitSprite(unit) {
    if (!unit.hasHullSprite || !unit.hull) return
    const key = `${unit.hull}_${unit.direction}`
    if (this.textures.exists(key)) unit.glyph.setTexture(key)
  }

  // 특정 칸의 이동 AP 비용을 지형 기본값 + 필드효과 추가비용으로 계산한다.
  // computeMovementRange / planApproach의 getCost 함수로 전달된다.
  _getTerrainMoveCost(cx, cy) {
    const terrainType = this.terrain?.[cy]?.[cx] ?? 'empty'
    const config = getGameConfig()
    const terrain = getTerrain(terrainType)
    const { extraMoveCost } = this._resolveFieldParams(terrain, config)
    const baseCost = config?.combat?.movement?.terrainMoveCosts?.[terrainType] ?? 1
    return Math.max(1, baseCost + extraMoveCost)
  }

  // config.combat.fieldEffects から지형의 실효 파라미터를 해결한다.
  // fieldEffects.enabled이면 config 값, 아니면 terrain.js 하드코딩 값(폴백).
  _resolveFieldParams(terrain, config) {
    const fxCfg = config?.combat?.fieldEffects
    if (fxCfg?.enabled && terrain.fieldEffectType) {
      const p = fxCfg.params?.[terrain.fieldEffectType]
      if (p) return {
        entryDamagePct:  p.entryDamagePct  ?? terrain.entryDamage  ?? 0,
        periodicDamagePct: p.periodicDamagePct ?? terrain.periodicDamage ?? 0,
        extraMoveCost:   p.extraMoveCost    ?? terrain.movCost      ?? 0,
      }
    }
    return {
      entryDamagePct:    terrain.entryDamage    ?? 0,
      periodicDamagePct: terrain.periodicDamage ?? 0,
      extraMoveCost:     terrain.movCost        ?? 0,
    }
  }

  // 진입 피해 — terrain.js 폴백 또는 fieldEffects config 수치로 적용. 지형 단독으로는 격파 안 됨.
  applyEntryDamage(unit, terrain) {
    const config = getGameConfig()
    const { entryDamagePct } = this._resolveFieldParams(terrain, config)
    if (!entryDamagePct) return
    const dmg = Math.max(1, Math.floor(unit.maxHp * entryDamagePct / 100))
    unit.hp = Math.max(1, unit.hp - dmg)
    this.updateHpBar(unit)
    this.showFloatingText(unit, `-${dmg} (진입)`, '#ff6644')
    this.syncUnitsToStore()
  }

  // 주기 피해 — 플레이어 턴 시작 시 periodicDamage가 있는 지형 위의 모든 유닛에게 적용.
  applyPeriodicTerrainDamage() {
    const config = getGameConfig()
    for (const unit of [...this.units]) {
      const terrain = getTerrain(this.terrain[unit.gridY][unit.gridX])
      const { periodicDamagePct } = this._resolveFieldParams(terrain, config)
      if (!periodicDamagePct) continue
      const dmg = Math.max(1, Math.floor(unit.maxHp * periodicDamagePct / 100))
      unit.hp = Math.max(1, unit.hp - dmg)
      this.updateHpBar(unit)
      const label = terrain.fieldEffectType === 'portal' ? '포탈'
        : terrain.fieldEffectType === 'residual_heat' ? '잔열'
        : terrain.fieldEffectType === 'black_hole'    ? '블랙홀'
        : terrain.fieldEffectType === 'energy_storm'  ? '폭풍'
        : '장판'
      this.showFloatingText(unit, `-${dmg} (${label})`, '#cc66ff')
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

  // 엄폐 EVA 보너스 — providesCover 오브젝트에 인접한 칸이면 COVER_EVA_BONUS.
  _coverEvaBonus(x, y) {
    return this.coverTiles?.has(`${x},${y}`) ? COVER_EVA_BONUS : 0
  }

  // path를 따라 유닛 컨테이너를 한 칸씩 트윈으로 이동시키고 완료 시 콜백한다 (좌표 갱신은 호출자 책임).
  // 각 스텝 전에 이동 방향을 계산해 hull 스프라이트를 교체한다.
  animateUnitAlongPath(unit, path, onComplete) {
    const step = (index) => {
      if (index >= path.length) {
        onComplete()
        return
      }
      // 방향 업데이트 — 현재 칸 → 다음 칸 벡터로 facing 결정
      const prev = path[index - 1] ?? path[0]
      const dx = path[index].x - prev.x
      const dy = path[index].y - prev.y
      if (dx !== 0 || dy !== 0) {
        const newDir = this._dirFromDelta(dx, dy)
        if (newDir !== unit.direction) {
          unit.direction = newDir
          this._refreshUnitSprite(unit)
        }
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
    this.focusCameraOnUnit(unit) // 함대가 움직이면 그 지점으로 카메라 줌인·추적
    this.refreshHud(`${unit.ship.name} 이동 중...`)

    this.animateUnitAlongPath(unit, path, () => {
      unit.gridX = targetX
      unit.gridY = targetY
      const destTerrain = getTerrain(this.terrain[targetY][targetX])
      const { extraMoveCost } = this._resolveFieldParams(destTerrain, getGameConfig())
      this.spendAp(unit, 1 + extraMoveCost)
      this.applyEntryDamage(unit, destTerrain)
      this.busy = false
      this.refreshHud()
    })
  }

  // ----- 전투 -----
  // onComplete: 연출까지 끝난 뒤 호출(적 AI가 다음 행동으로 이어갈 때 사용). 공격은 명중 여부와 무관하게 AP 1을 소모한다.
  // weaponSlot: 'weapon' | 'weapon2' — 어떤 슬롯의 무기를 사용할지 (기본 'weapon').
  // opts (Phase 4 멀티히트용): damageMultiplier=피격 순서 배율, skipApSpend=AP 차감 생략(호출측이 1회 차감),
  // skipTargetLine=단일 타겟팅 라인 생략(빔 연출이 대체).
  resolveCombat(attacker, defender, onComplete, weaponSlot = 'weapon', opts = {}) {
    const defTerrain = getTerrain(this.terrain[defender.gridY][defender.gridX])

    // 공격 방향으로 공격자 스프라이트를 전환한다 (hull 스프라이트가 있을 때만).
    const atkDx = defender.gridX - attacker.gridX
    const atkDy = defender.gridY - attacker.gridY
    if (atkDx !== 0 || atkDy !== 0) {
      const newDir = this._dirFromDelta(atkDx, atkDy)
      if (newDir !== attacker.direction) {
        attacker.direction = newDir
        this._refreshUnitSprite(attacker)
      }
    }

    // 측면 공격 보너스 — y좌표 차이 2 이상이면 +25% (포위·측면 기동의 가치를 직접적으로 반영)
    const dy = Math.abs(attacker.gridY - defender.gridY)
    const isFlank = dy >= 2
    const flankMult = isFlank ? 1.25 : 1.0

    // 크리티컬 판정 — 15% 확률로 1.8× 데미지
    const isCrit = Math.random() < 0.15
    const critMult = isCrit ? 1.8 : 1.0

    // ── 명중/피해 계산을 데이터 주도 combatMath로 처리 (요청서 14·15·18·21장) ──
    const config = getGameConfig()

    // 손상 단계 보정 — 공격자 명중, 방어자 회피 (요청서 21장)
    const atkState = getDamageState(attacker.maxHp > 0 ? attacker.hp / attacker.maxHp : 1, config)
    const defState = getDamageState(defender.maxHp > 0 ? defender.hp / defender.maxHp : 1, config)

    // 경계 태세 반격 패널티 + 기함 격파 명중 패널티 + Unit Modifier(이온 교란 등) 명중/회피 보정
    const owAccPenalty      = attacker._overwatchAccPenalty ?? 0
    const flagAcc           = this.flagshipAccPenalty ?? { ally: 0, enemy: 0 }
    const flagshipAccPenalty = attacker.side === 'ally' ? (flagAcc.ally ?? 0) : (flagAcc.enemy ?? 0)
    const modAcc = sumStat(attacker.modifiers, 'accMod')
    const modEva = sumStat(defender.modifiers, 'evaMod')
    const hitRes = calculateHitChance(
      { acc: attacker.ship.acc + owAccPenalty + flagshipAccPenalty + modAcc },
      { eva: defender.ship.eva },
      null,
      {
        terrainAccMod: defTerrain.accMod,
        damageStateAccMod: atkState.accMod,
        evasionContext: { terrainEvaMod: defTerrain.evaMod + this._coverEvaBonus(defender.gridX, defender.gridY), damageStateEvaMod: defState.evaMod + modEva },
      },
      config,
    )
    const chancePct = hitRes.hitChance
    // guaranteedHit: 광역 폭발 등 중심 명중 판정이 이미 끝난 파생 피해 (회피 불가)
    const hit = opts.guaranteedHit === true || Math.random() * 100 < chancePct

    const weaponData = this._getEquippedWeaponData(attacker, config, weaponSlot)

    this.clearSelection()
    this.busy = true
    if (!opts.skipApSpend) this.spendAp(attacker, weaponData.apCost ?? 1)

    // 공격하는 함대 쪽으로 카메라가 따라가며 줌인(전투뷰). 조감 복귀는 토글 버튼으로만.
    this.focusCameraOnUnit(attacker)

    // 무기 계열별 발사 연출 (빔 연출이 이미 나간 레이저 멀티히트 등은 skipTargetLine으로 생략)
    if (!opts.skipTargetLine) this._playAttackVfx(attacker, defender, weaponData, hit)

    const finish = () => {
      this.busy = false
      onComplete?.()
    }

    if (!hit) {
      this._dodgeUnit(defender, attacker)
      this.showFloatingText(defender, '회피!', MISS_TEXT_COLOR, finish)
      this.refreshHud(`${attacker.ship.name} → ${defender.ship.name} : 빗나감! (명중률 ${chancePct}%)`)
      return
    }

    // 피해량 = 상성 배율 × 측면/크리티컬 → Shield → Armor → HP 파이프라인
    const counter = lookupCounterMultiplier(this.combatRules.counterMultiplier, attacker.ship.id, defender.ship.id)
    const owDmgMult   = attacker._overwatchDmgMult ?? 1
    const extraMult   = opts.damageMultiplier ?? 1
    // Unit Modifier 공격력/방어력 % 보정 (Plasma 멜팅 등) + 잔열 지대 위 방어력 감소(환경성 — 벗어나면 해제)
    const modAtkPct = sumStat(attacker.modifiers, 'atkPct')
    const effAtk = Math.max(1, Math.round(attacker.ship.atk * (1 + modAtkPct / 100)))
    const onHeatZone = getTerrain(this.terrain[defender.gridY][defender.gridX]).id === 'residual_heat'
    const heatPct = onHeatZone ? (config?.combat?.weaponEffects?.plasma?.heatZoneArmorPct ?? -50) : 0
    const modDefPct = Math.max(-100, sumStat(defender.modifiers, 'defPct') + heatPct)
    const effArmor = Math.max(0, Math.round((defender.armor ?? 0) * (1 + modDefPct / 100)))
    const finalDamage = calculateDamage(
      { atk: effAtk }, null,
      { counterMultiplier: counter, damageMultiplier: flankMult * critMult * owDmgMult * extraMult },
      config,
    )
    const shieldBefore = defender.shield
    const pipe = resolveDamagePipeline(
      {
        defender: { shield: defender.shield, armor: effArmor, armorDurability: defender.armorDurability, hp: defender.hp },
        finalDamage,
        // 아이템 pierce는 %(0~100) — 파이프라인은 0~1 비율을 기대 (예전엔 pierce≥1이 전부 100% 우회되던 버그)
        shieldPierce: (weaponData.pierce ?? 0) / 100,
        defenseReduction: defender.defenseReduction ?? 0,
      },
      config,
    )
    defender.shield = pipe.shieldAfter
    defender.armorDurability = pipe.armorDurabilityAfter
    defender.hp = Math.max(0, pipe.hpAfter)
    this.updateHpBar(defender)
    this.updateShieldBar(defender)

    // 계열별 명중 시 효과 부착 (Ion 교란 / Plasma 멜팅·붕괴 — 판정은 weapons/* 순수 모듈)
    const ionSummary = !pipe.destroyed ? this._applyWeaponHitEffects(defender, weaponData, config) : null
    const ionPart = ionSummary ? ` ⚡ ${ionSummary}` : ''

    const shieldAbsorbed = Math.max(0, Math.round(shieldBefore - pipe.shieldAfter))
    const lethal = pipe.destroyed
    const toShield = pipe.hpDamage <= 0 && shieldAbsorbed > 0

    const hitColor  = toShield ? SHIELD_TEXT_COLOR : (isCrit ? '#ff6b35' : DAMAGE_TEXT_COLOR)
    const hitLabel  = toShield ? `🛡-${shieldAbsorbed}` : (isCrit ? `💥${pipe.hpDamage}!` : `-${pipe.hpDamage}`)
    const bonusTxt  = [isFlank ? '측면' : null, isCrit ? '크리티컬!' : null].filter(Boolean).join(' · ')
    const bonusPart = bonusTxt ? ` [${bonusTxt}]` : ''

    this.showFloatingText(defender, hitLabel, hitColor, () => {
      if (lethal) {
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

    const dmgDesc = toShield ? `실드 ${shieldAbsorbed} 흡수` : `${pipe.hpDamage} 데미지`
    if (lethal) {
      this.refreshHud(
        `${attacker.ship.name} → ${defender.ship.name} : 명중! ${dmgDesc}로 격파!${bonusPart} (명중률 ${chancePct}%)`,
      )
    } else {
      const shieldPart = defender.maxShield > 0 ? ` · 🛡${defender.shield}/${defender.maxShield}` : ''
      this.refreshHud(
        `${attacker.ship.name} → ${defender.ship.name} : 명중! ${dmgDesc}${bonusPart}${ionPart} (HP ${defender.hp}/${defender.maxHp}${shieldPart}, 명중률 ${chancePct}%)`,
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

  updateShieldBar(unit) {
    if (!unit.shieldBarFg || !unit.maxShield) return
    const ratio = Math.max(0, unit.shield) / unit.maxShield
    unit.shieldBarFg.setSize(HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT - 1)
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
    if (unit.side === 'enemy') {
      if (this._rollSurrender(unit)) {
        this._captureEnemyShip(unit)
      } else {
        this.defeatedEnemyShips.push(unit.baseShip)
      }
    } else if (unit.side === 'ally' && unit.instanceId) {
      useFleetStore.getState().removeFromRoster(unit.instanceId)
    }
    if (unit.isFlagship) this._applyFlagshipDestroyedEffects(unit)
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
    const boost = bossData.phaseBoost?.atk ?? 0
    if (boost > 0) unit.ship = { ...unit.ship, atk: unit.ship.atk + boost }

    const applyPhase2Effects = () => {
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
        const spawnPos = (this.enemySpawnPositions ?? []).find(
          (pos) => !this.units.some((u) => u.gridX === pos.x && u.gridY === pos.y),
        )
        if (spawnPos) {
          this.spawnUnit({ side: 'enemy', shipId: 'void_rift', ship: riftShip, x: spawnPos.x, y: spawnPos.y })
        }
      }
    }

    this.cutinManager.playBossPhase({ unit, bossData, onApply: applyPhase2Effects, onComplete: () => {} })
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
    // Shield 이월 저장 — 생존 아군의 현재 방어막을 로스터에 보관 (다음 전투에서 복원).
    const shieldMap = {}
    for (const u of this.units.filter((u) => u.side === 'ally' && u.instanceId)) {
      shieldMap[u.instanceId] = u.shield ?? 0
    }
    useFleetStore.getState().saveShields(shieldMap)

    const totalXp = xpRewardForVictory(this.defeatedEnemyShips)

    // 전투 기록 저장
    useBattleStore.getState().addBattleRecord({
      result: 'victory',
      nodeName: this.node?.name ?? '자유 전투',
      date: new Date().toISOString(),
      xpGained: totalXp,
      captured: this.capturedShips.length,
    })
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

    // 투항 포획 함선 표시
    if (this.capturedShips.length > 0) {
      extraLines.push(`🏳 투항 포획: ${this.capturedShips.join(', ')} — 함대에 추가됨!`)
    }

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
    // 전투 기록 저장
    useBattleStore.getState().addBattleRecord({
      result: 'defeat',
      nodeName: this.node?.name ?? '자유 전투',
      date: new Date().toISOString(),
      xpGained: 0,
      captured: 0,
    })

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
    // 손상 단계 AP 페널티 (요청서 21장: 중파 -1, 대파 -2)
    const dmgState = getDamageState(unit.maxHp > 0 ? unit.hp / unit.maxHp : 1, getGameConfig())
    let base = unit.ship.ap
    if (unit.apDebuff > 0) {
      base = unit.ship.ap - unit.apDebuff
      unit.apDebuff = 0
    }
    unit.maxAp = Math.max(0, base + (dmgState.apMod ?? 0))
    unit.ap = unit.maxAp
    // Unit Modifier 원샷 AP 효과(Phase 4-0) — 스턴이면 이번 턴 AP 0, 아니면 드레인만큼 차감 후 소멸
    const apFx = consumeApEffects(unit.modifiers)
    unit.modifiers = apFx.remaining
    if (apFx.stunned) {
      unit.ap = 0
      this.showFloatingText(unit, '💫 스턴!', '#9be8ff')
    } else if (apFx.apDrain > 0) {
      unit.ap = Math.max(0, unit.ap - apFx.apDrain)
      this.showFloatingText(unit, `⚡ AP -${apFx.apDrain}`, '#9be8ff')
    }
    unit.aoeFiredThisTurn = false
    // 태세 리셋 — 방어 태세는 발동한 턴에만 유효. 경계 태세는 duration 설정에 따라 다중 턴 유지 가능.
    unit.defenseReduction = 0
    unit.isDefenseStance  = false
    if (unit.overwatchState) {
      const owCfg = getGameConfig()?.combat?.overwatch ?? {}
      if ((owCfg.duration ?? 1) > 1 && (unit.overwatchState.turnsLeft ?? 1) > 1) {
        unit.overwatchState = {
          ...unit.overwatchState,
          turnsLeft: unit.overwatchState.turnsLeft - 1,
          triggersLeft: owCfg.maxTriggersPerTurn ?? 1,
        }
      } else {
        unit.overwatchState = null
      }
    }
    this.refreshUnitStatusLabel(unit)
    this.updateApBar(unit)
    this.updateUnitAvailability(unit)
  }

  refreshUnitStatusLabel(unit) {
    const tpPct = Math.round((unit.tp / TP_MAX) * 100)
    const shieldPart  = unit.shield > 0 ? ` · 실드 ${unit.shield}` : ''
    const stancePart  = unit.isDefenseStance ? ' · 🛡' : unit.overwatchState ? ' · 👁' : ''
    const modIcons    = modifierIcons(unit.modifiers)
    const modPart     = modIcons ? ` · ${modIcons}` : ''
    unit.statusLabel.setText(`AP ${unit.ap}/${unit.maxAp} · TP ${tpPct}%${shieldPart}${stancePart}${modPart}`)
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
        shield:     u.shield,
        maxShield:  u.maxShield,
        armor:      u.armor,
        ap:         u.ap,
        maxAp:      u.maxAp,
        tp:         u.tp,
        level:      u.ship.level ?? 1,
        aceName:    u.ace?.name ?? null,
        dead:             u.hp <= 0,
        mov:              u.ship.mov ?? 3,
        atk:              u.ship.atk ?? 1,
        isDefenseStance:  u.isDefenseStance ?? false,
        overwatchState:   u.overwatchState ?? null,
        isFlagship:       u.isFlagship ?? false,
        eva:              u.ship.eva ?? 0,
        modifiers:        (u.modifiers ?? []).map((m) => ({ id: m.id, kind: m.kind, turnsLeft: m.turnsLeft ?? null })),
        weapon1:          this._equippedWeaponInfo(u, 'weapon'),
        weapon2:          this._equippedWeaponInfo(u, 'weapon2'),
      }))
    )
  }

  // 맵으로 즉시 복귀 — 도주/협상 성공 시 React에서 호출
  executeFlee() {
    if (this.battleEnded) return
    this.battleEnded = true
    this.busy = true

    useBattleStore.getState().addBattleRecord({
      result: 'flee',
      nodeName: this.node?.name ?? '자유 전투',
      date: new Date().toISOString(),
      xpGained: 0,
      captured: 0,
    })
    this.clearSelection()
    this.actionChips?.forEach((chip) => chip.destroy())
    this.actionChips = []
    // 도주 성공 시 Shield 이월 저장
    const shieldMap = {}
    for (const u of this.units.filter((u) => u.side === 'ally' && u.instanceId)) {
      shieldMap[u.instanceId] = u.shield ?? 0
    }
    useFleetStore.getState().saveShields(shieldMap)
    this.refreshHud('철수합니다...')
    this.time.delayedCall(600, () => this.onExit?.())
  }

  // ----- 씬 정리 -----
  shutdown() {
    this._unsubAutoBattle?.()
  }

  // ----- 턴 순환: 플레이어 페이즈 ↔ 적 페이즈 -----
  startPlayerPhase() {
    if (this.pendingFlee && !this.battleEnded) {
      this.pendingFlee = false
      this.executeFlee()
      return
    }
    this.phase = 'player'
    useBattleStore.getState().setPlayerPhase(true)
    this.allyQueue = this.units.filter((u) => u.side === 'ally')
    for (const unit of this.allyQueue) this.refillAp(unit)
    this._expireHeatZones() // 만료된 잔열 지대 원복 (주기 피해 판정 이전)
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
      if (unit.side === 'ally') {
        this.chargeTp(unit)
        this._tickUnitModifiers(unit)
      }
    }
    this.startEnemyPhase()
  }

  // 자기 페이즈 종료 시 지속형 Unit Modifier의 남은 턴을 줄인다 (1턴 효과 = 다음 자기 페이즈까지)
  _tickUnitModifiers(unit) {
    if (!unit.modifiers?.length) return
    unit.modifiers = tickTurn(unit.modifiers)
    this.refreshUnitStatusLabel(unit)
  }

  startEnemyPhase() {
    this.phase = 'enemy'
    this.clearSelection()
    this.enemyQueue = this.units.filter((u) => u.side === 'enemy')
    for (const unit of this.enemyQueue) this.refillAp(unit)
    // 모의 전투 + 자동전투 OFF: 적을 플레이어가 직접 조작(AI 미실행). 자동전투 ON이면 일반 전투처럼 적 AI가 행동.
    if (this.mockControl && !this.autoBattle) {
      useBattleStore.getState().setPlayerPhase(true)
      this.refreshHud(`🧪 모의 전투 — 적군 조작 턴 ${this.turnNumber}. 적 유닛을 클릭해 이동/공격하고, 턴종료로 마무리하세요. (자동전투를 켜면 적 AI가 대신 싸웁니다)`)
      this.syncUnitsToStore()
      return
    }
    useBattleStore.getState().setPlayerPhase(false)
    this.refreshHud(`적 턴 ${this.turnNumber} — 적이 행동합니다...`)
    this.syncUnitsToStore()
    this.runEnemyUnit(0)
  }

  // 턴종료 버튼/스페이스 — 현재 페이즈를 마친다(모의 전투 적 조작 턴 포함).
  endCurrentPhase() {
    if (this.busy || this.battleEnded) return
    if (this.phase === 'player') { this.endPlayerPhase(); return }
    if (this.mockControl && this.phase === 'enemy') { this.clearSelection(); this.endEnemyPhase() }
  }

  endEnemyPhase() {
    for (const unit of this.units) {
      if (unit.side === 'enemy') {
        this.chargeTp(unit)
        this._tickUnitModifiers(unit)
      }
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
      // IFF 교란(Ion T4) — 자기 페이즈 동안 가장 가까운 같은 편을 일반 공격 (특수기 사용 불가)
      const target = hasModifier(unit.modifiers, 'iff_scramble')
        ? this._nearestUnit(unit, this.units.filter((u) => u.side === unit.side && u !== unit))
        : pickTarget(unit, this.units.filter((u) => u.side === 'ally'), this.combatRules.counterMultiplier)
      if (!target) {
        onDone()
        return
      }

      if (inAttackRange(unit, target)) {
        this.busy = true
        this.resolveCombat(unit, target, step)
        return
      }

      const move = planApproach(unit, target, (x, y) => this.isPassable(x, y, unit), (x, y) => this._getTerrainMoveCost(x, y))
      if (move.x === unit.gridX && move.y === unit.gridY) {
        // 더 다가갈 수 없음 — 이번 유닛의 행동 종료
        onDone()
        return
      }
      this.aiMoveTo(unit, move.x, move.y, step)
    }
    step()
  }

  // 맨해튼 거리 기준 최근접 유닛 (IFF 교란 — 최근접 아군 우선 규칙)
  _nearestUnit(unit, pool) {
    let best = null
    let bestDist = Infinity
    for (const u of pool) {
      const d = manhattanDistance({ x: unit.gridX, y: unit.gridY }, { x: u.gridX, y: u.gridY })
      if (d < bestDist) { best = u; bestDist = d }
    }
    return best
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
    this.focusCameraOnUnit(unit) // 자동/적 함대 이동도 카메라가 따라가며 줌인
    const sideLabel = unit.side === 'ally' ? '(자동)' : '(적)'
    this.refreshHud(`${unit.ship.name}${sideLabel} 이동 중...`)
    this.animateUnitAlongPath(unit, path, () => {
      unit.gridX = targetX
      unit.gridY = targetY
      const destTerrain = getTerrain(this.terrain[targetY][targetX])
      const { extraMoveCost } = this._resolveFieldParams(destTerrain, getGameConfig())
      this.spendAp(unit, 1 + extraMoveCost)
      this.applyEntryDamage(unit, destTerrain)
      this.busy = false
      // 적 이동 후 경계 태세 아군의 반격 트리거
      if (unit.side === 'enemy' && this.units.includes(unit) && unit.hp > 0) {
        this.checkOverwatchTrigger(unit, onDone)
      } else {
        onDone()
      }
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
      // IFF 교란(Ion T4) — 자동전투 아군도 교란되면 가장 가까운 같은 편을 공격한다
      const target = hasModifier(unit.modifiers, 'iff_scramble')
        ? this._nearestUnit(unit, this.units.filter((u) => u.side === unit.side && u !== unit))
        : pickTarget(unit, this.units.filter((u) => u.side === 'enemy'), this.combatRules.counterMultiplier)
      if (!target) {
        onDone()
        return
      }

      if (inAttackRange(unit, target)) {
        this.busy = true
        this.resolveCombat(unit, target, step)
        return
      }

      const move = planApproach(unit, target, (x, y) => this.isPassable(x, y, unit), (x, y) => this._getTerrainMoveCost(x, y))
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

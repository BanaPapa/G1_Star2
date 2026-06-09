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

const COLS = 12
const ROWS = 10
let CELL = 80

// 지형 샘플 배치 (MOD-1 프로토타입 — 빈 공간/소행성/잔해 표시 확인용)
const ASTEROID_CELLS = [
  [5, 2], [6, 2], [5, 3],
  [8, 6], [8, 7], [9, 7],
]
const DEBRIS_CELLS = [
  [3, 6], [4, 6], [4, 7],
  [7, 2], [7, 3],
]

function buildTerrainLayout() {
  const layout = Array.from({ length: ROWS }, () => new Array(COLS).fill('empty'))
  for (const [x, y] of ASTEROID_CELLS) layout[y][x] = 'asteroid'
  for (const [x, y] of DEBRIS_CELLS) layout[y][x] = 'debris'
  return layout
}

// 아군 시작 위치 — useFleetStore의 로스터 순서에 그대로 매핑된다(MOD-5: 로스터 기반 생성으로 교체).
const ALLY_START_POSITIONS = [
  { x: 1, y: 5 },
  { x: 1, y: 7 },
  { x: 1, y: 3 },
]

// 적 출현 위치 슬롯 — core/encounter.js가 노드의 적 구성을 이 자리에 순서대로 배치한다(MOD-6).
// 가장 큰 편성(관문 요새 s7: 4기)도 겹치지 않도록 충분히 마련.
const ENEMY_SPAWN_POSITIONS = [
  { x: 10, y: 2 },
  { x: 10, y: 7 },
  { x: 9, y: 4 },
  { x: 9, y: 5 },
  { x: 11, y: 3 },
  { x: 11, y: 6 },
]

const SIDE_COLOR = {
  ally: { ring: 0x3ad6c4, fill: 0x123a38, label: '#3ad6c4' },
  enemy: { ring: 0xe23b4e, fill: 0x3a1820, label: '#e23b4e' },
}

const HIGHLIGHT_COLOR = 0x3ad6c4
const HIGHLIGHT_ALPHA = 0.3
const ABILITY_HIGHLIGHT_COLOR = 0xffd166 // 필살기 조준 모드 — 이동범위와 구분되는 강조색(에이스 테마색)
const SELECT_RING_COLOR = 0xffd166
const GRID_LINE_COLOR = 0x4fb8ff

let HP_BAR_WIDTH = CELL * 0.56
const HP_BAR_HEIGHT = 5
const HP_BAR_BG_COLOR = 0x1a2030

const DAMAGE_TEXT_COLOR = '#ffd166'
const MISS_TEXT_COLOR = '#6b7aa8'
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

  init({ ships, combatRules, skills, aces, enemies, items, node, onVictory, onExit, onEnding, onGameOver }) {
    // this.scene.restart()에 그대로 재전달하기 위해 보관(MOD-6: 노드·콜백도 함께 — "같은 전투 다시 시작"에 필요)
    this.initArgs = { ships, combatRules, skills, aces, enemies, items, node, onVictory, onExit, onEnding, onGameOver }
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
    this.terrain = buildTerrainLayout()
    this.units = []
    this.selected = null
    this.highlighted = new Set()
    this.busy = false // 이동/공격/적 행동 애니메이션 동안 입력 잠금
    this.turnNumber = 1
    this.phase = 'player' // 'player' | 'enemy'
    this.pendingAbility = null // { unit, skill, presenter } — 필살기 조준 대기 상태
    this.cutinEnabled = useSettingsStore.getState().cutinEnabled // 설정에서 초기값 읽기(MOD-12)
    this.autoBattle = false // ON 시 플레이어 페이즈에서 아군도 적 AI와 동일한 휴리스틱으로 자동 행동(테스트 편의용 QoL)

    // MOD-5: 아군은 useFleetStore의 로스터(레벨·성장치·전직 여부 보유)를 그대로 가져와 생성한다 —
    // 전투 사이에도 성장이 영구 보존되며, 승리 시 이 스토어에 XP를 돌려준다.
    this.roster = useFleetStore.getState().roster
    this.battleEnded = false
    this.defeatedEnemyShips = [] // 격파한 적의 베이스 함선 데이터 — 승리 보상 XP 계산에 사용
    this.bossPhase2Triggered = new Set() // MOD-11: 보스 페이즈 2 전환 중복 방지
  }

  create() {
    // 컨테이너 크기에 맞춰 CELL 동적 결정 — 상단 HUD 80px 확보
    CELL = Math.max(52, Math.min(
      Math.floor(this.scale.width * 0.92 / COLS),
      Math.floor((this.scale.height - 80) / ROWS),
    ))
    HP_BAR_WIDTH = CELL * 0.56

    this.originX = (this.scale.width - COLS * CELL) / 2
    this.originY = (this.scale.height - ROWS * CELL) / 2 + 22

    this.cellRects = []
    for (let y = 0; y < ROWS; y += 1) {
      const row = []
      for (let x = 0; x < COLS; x += 1) row.push(this.createCell(x, y))
      this.cellRects.push(row)
    }

    const allyPlacements = this.roster.map((entry, index) => {
      const pos = ALLY_START_POSITIONS[index % ALLY_START_POSITIONS.length]
      return { side: 'ally', instanceId: entry.instanceId, shipId: entry.shipId, aceId: entry.aceId, x: pos.x, y: pos.y }
    })
    // MOD-6: 적 구성은 더 이상 하드코딩이 아니라, 진입한 노드(systems.json)의 enemy/miniboss/boss를
    // enemies.json·ships.json과 합성한 결과 그대로다(core/encounter.js).
    const enemyPlacements = buildEncounterPlacements(this.node, {
      enemiesById: this.enemiesById,
      bossesById: this.bossesById,
      shipsById: this.shipsById,
      positions: ENEMY_SPAWN_POSITIONS,
    })
    ;[...allyPlacements, ...enemyPlacements].forEach((placement) => this.spawnUnit(placement))

    this.hudText = this.add.text(16, 12, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '14px',
      color: '#cdd8f4',
    })
    this.actionChips = []

    this.cutinToggleText = this.add
      .text(this.scale.width - 16, 34, '', {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '13px',
        color: TOGGLE_COLOR,
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
    this.cutinToggleText.on('pointerdown', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation()
      this.cutinEnabled = !this.cutinEnabled
      useSettingsStore.getState().setCutinEnabled(this.cutinEnabled) // 설정 영구 저장
      this.refreshCutinToggleLabel()
    })
    this.refreshCutinToggleLabel()

    this.autoBattleBg = this.add
      .rectangle(this.scale.width - 14, 56, 295, 26, 0x1a1608, 0.94)
      .setOrigin(1, 0)
      .setDepth(20)
      .setInteractive({ useHandCursor: true })

    this.autoBattleToggleText = this.add
      .text(this.scale.width - 22, 59, '', {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffd166',
      })
      .setOrigin(1, 0)
      .setDepth(21)
      .setInteractive({ useHandCursor: true })

    const _doToggleAuto = (_pointer, _lx, _ly, event) => {
      event?.stopPropagation()
      this.autoBattle = !this.autoBattle
      this.refreshAutoBattleToggleLabel()
      if (this.autoBattle && this.phase === 'player' && !this.busy && !this.battleEnded) {
        this.pendingAbility = null
        this.clearSelection()
        this.time.delayedCall(this.actionDelay, () => this.runAllyAutoTurn(0))
      }
    }
    this.autoBattleToggleText.on('pointerdown', _doToggleAuto)
    this.autoBattleBg.on('pointerdown', _doToggleAuto)
    this.refreshAutoBattleToggleLabel()

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

  refreshAutoBattleToggleLabel() {
    if (this.autoBattle) {
      this.autoBattleToggleText?.setColor('#7dffb0')
      this.autoBattleToggleText?.setText('🤖 자동전투 ON — 클릭 시 끄기')
      if (this.autoBattleBg) {
        this.autoBattleBg.setFillStyle(0x082212, 0.95)
        this.autoBattleBg.setStrokeStyle(2, 0x7dffb0, 0.8)
      }
    } else {
      this.autoBattleToggleText?.setColor('#ffd166')
      this.autoBattleToggleText?.setText('🤖 자동전투 OFF ← 클릭해서 켜기')
      if (this.autoBattleBg) {
        this.autoBattleBg.setFillStyle(0x1a1608, 0.94)
        this.autoBattleBg.setStrokeStyle(2, 0xffd166, 0.7)
      }
    }
  }

  // ----- 좌표 변환 -----
  cellToWorld(x, y) {
    return {
      px: this.originX + x * CELL + CELL / 2,
      py: this.originY + y * CELL + CELL / 2,
    }
  }

  // ----- 그리드 셀 -----
  createCell(x, y) {
    const terrain = getTerrain(this.terrain[y][x])
    const { px, py } = this.cellToWorld(x, y)

    const rect = this.add.rectangle(px, py, CELL - 3, CELL - 3, terrain.color)
    rect.setStrokeStyle(1, GRID_LINE_COLOR, 0.18)
    rect.setData('baseColor', terrain.color)
    rect.setInteractive({ useHandCursor: true })
    rect.on('pointerdown', () => this.handleCellClick(x, y))

    if (terrain.glyph) {
      this.add.text(px, py, terrain.glyph, { fontSize: '28px' }).setOrigin(0.5).setAlpha(0.85)
    }
    return rect
  }

  // ----- 유닛 -----
  spawnUnit(placement) {
    // 아군은 ships.json에서 shipId로 조회하지만, 적은 core/encounter.js가 enemies.json+ships.json을
    // 합성해 만든 ship 객체를 placement.ship으로 직접 들고 온다(MOD-6: ships.json에 없는 적 함선).
    const baseShip = placement.ship ?? this.shipsById.get(placement.shipId)
    if (!baseShip) return

    const palette = SIDE_COLOR[placement.side]
    const { px, py } = this.cellToWorld(placement.x, placement.y)
    const radius = CELL * 0.36

    const ace = placement.aceId ? this.acesById.get(placement.aceId) ?? null : null
    // MOD-5: 아군(instanceId 보유)은 로스터 성장치·전직 보너스를 합성한 "현재 실전 스탯"으로 생성하고,
    // 에이스 필살기 + 전직 함선 고유 필살기를 함께(복수) 보유할 수 있다. 적은 베이스 스탯 그대로.
    const entry = placement.instanceId ? (this.roster.find((e) => e.instanceId === placement.instanceId) ?? null) : null
    // MOD-7: 성장·전직 보너스 위에 장착 무기·모듈(items.json mods)을 추가로 합산한 "최종 실전 스탯".
    const ship = entry ? applyEquipment(getEffectiveShip(baseShip, entry), entry, this.itemsById) : baseShip
    const finishers = entry ? getUnitFinishers({ ace, ship: baseShip, entry, allSkills: this.allSkills }) : []

    const ring = this.add.circle(0, 0, radius, palette.fill)
    ring.setStrokeStyle(2, palette.ring, 0.9)
    const glyph = this.add.text(0, -4, getEmojiFallback(ship.sprite), { fontSize: '28px' }).setOrigin(0.5)
    const levelPart = entry ? ` Lv.${ship.level}` : ''
    const acePart = ace ? ` · 지휘관 ${ace.name}` : ''
    const labelText = `${ship.name}${levelPart} MOV${ship.mov}${acePart}`
    const label = this.add
      .text(0, radius + 8, labelText, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '11px',
        color: palette.label,
      })
      .setOrigin(0.5, 0)
    const statusLabel = this.add
      .text(0, radius + 24, '', {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '10px',
        color: STATUS_LABEL_COLOR,
      })
      .setOrigin(0.5, 0)

    const barY = -radius - 9
    const hpBarBg = this.add.rectangle(-HP_BAR_WIDTH / 2, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT, HP_BAR_BG_COLOR).setOrigin(0, 0.5)
    const hpBarFg = this.add.rectangle(-HP_BAR_WIDTH / 2, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT, palette.ring).setOrigin(0, 0.5)

    const container = this.add.container(px, py, [ring, hpBarBg, hpBarFg, glyph, label, statusLabel])
    container.setSize(radius * 2, radius * 2)
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
      statusLabel,
    }
    container.on('pointerdown', (_pointer, _lx, _ly, event) => {
      event?.stopPropagation()
      this.handleUnitClick(unit)
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
    unit.ring.setStrokeStyle(3, SELECT_RING_COLOR, 1)

    const range = computeMovementRange({ x: unit.gridX, y: unit.gridY }, unit.ship.mov, (cx, cy) =>
      this.isPassable(cx, cy),
    )
    for (const { x, y } of range) {
      this.highlighted.add(`${x},${y}`)
      this.setCellHighlight(x, y, true, HIGHLIGHT_COLOR)
    }

    this.refreshActionMenu()
    this.refreshHud(
      `선택: ${unit.ship.name} (MOV ${unit.ship.mov} · AP ${unit.ap}/${unit.maxAp}) — 이동 가능 ${range.length}칸. ` +
        `칸을 클릭하면 이동(AP -1), 사거리 안의 적을 클릭하면 공격(AP -1)합니다.`,
    )
  }

  clearSelection() {
    if (this.selected) {
      const palette = SIDE_COLOR[this.selected.side]
      this.selected.ring.setStrokeStyle(2, palette.ring, 0.9)
    }
    this.clearHighlights()
    this.selected = null
    this.pendingAbility = null
    this.refreshActionMenu()
    this.refreshHud()
  }

  clearHighlights() {
    for (const key of this.highlighted) {
      const [x, y] = key.split(',').map(Number)
      this.setCellHighlight(x, y, false)
    }
    this.highlighted.clear()
  }

  setCellHighlight(x, y, on, color = HIGHLIGHT_COLOR) {
    const rect = this.cellRects[y][x]
    if (on) {
      rect.setFillStyle(color, HIGHLIGHT_ALPHA)
      rect.setStrokeStyle(1, color, 0.6)
    } else {
      rect.setFillStyle(rect.getData('baseColor'), 1)
      rect.setStrokeStyle(1, GRID_LINE_COLOR, 0.18)
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
        .setDepth(5)

      if (ready) {
        chip.setInteractive({ useHandCursor: true })
        chip.on('pointerdown', (_pointer, _lx, _ly, event) => {
          event?.stopPropagation()
          this.beginFinisherTargeting(unit, finisherEntry)
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

      const result = resolveAttack(
        {
          attacker: { id: unit.ship.id, acc: unit.ship.acc, atk: unit.ship.atk },
          defender: { id: target.ship.id, eva: target.ship.eva, def: target.ship.def, hp: target.hp },
          defenderCovered: getTerrain(this.terrain[target.gridY][target.gridX]).cover,
          boosterActive: false,
          forceHit: !!effect.unavoidable,
          damageMultiplier: effect.damageMultiplier ?? 1,
        },
        this.combatRules,
      )

      if (!result.hit) {
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
      this.spendAp(unit, 1)
      this.busy = false
      this.refreshHud()
    })
  }

  // ----- 전투 -----
  // onComplete: 연출까지 끝난 뒤 호출(적 AI가 다음 행동으로 이어갈 때 사용). 공격은 명중 여부와 무관하게 AP 1을 소모한다.
  resolveCombat(attacker, defender, onComplete) {
    const result = resolveAttack(
      {
        attacker: { id: attacker.ship.id, acc: attacker.ship.acc, atk: attacker.ship.atk },
        defender: { id: defender.ship.id, eva: defender.ship.eva, def: defender.ship.def, hp: defender.hp },
        defenderCovered: getTerrain(this.terrain[defender.gridY][defender.gridX]).cover,
        boosterActive: false,
      },
      this.combatRules,
    )

    this.clearSelection()
    this.busy = true
    this.spendAp(attacker, 1)
    const chancePct = Math.round(result.hitChance)

    const finish = () => {
      this.busy = false
      onComplete?.()
    }

    if (!result.hit) {
      this.showFloatingText(defender, '회피!', MISS_TEXT_COLOR, finish)
      this.refreshHud(`${attacker.ship.name} → ${defender.ship.name} : 빗나감! (명중률 ${chancePct}%)`)
      return
    }

    defender.hp = Math.max(0, defender.hp - result.damage)
    this.updateHpBar(defender)

    this.showFloatingText(defender, `-${result.damage}`, DAMAGE_TEXT_COLOR, () => {
      if (result.lethal) this.destroyUnit(defender)
      else this.checkBossPhaseTransition(defender)
      finish()
    })

    if (result.lethal) {
      this.refreshHud(
        `${attacker.ship.name} → ${defender.ship.name} : 명중! ${result.damage} 데미지로 격파! (명중률 ${chancePct}%)`,
      )
    } else {
      this.refreshHud(
        `${attacker.ship.name} → ${defender.ship.name} : 명중! ${result.damage} 데미지 (남은 HP ${defender.hp}/${defender.maxHp}, 명중률 ${chancePct}%)`,
      )
    }
  }

  showFloatingText(unit, text, color, onComplete) {
    const popup = this.add
      .text(unit.container.x, unit.container.y - CELL * 0.42, text, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color,
      })
      .setOrigin(0.5)
      .setDepth(10)

    this.tweens.add({
      targets: popup,
      y: popup.y - 34,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        popup.destroy()
        onComplete?.()
      },
    })
  }

  updateHpBar(unit) {
    const ratio = Math.max(0, unit.hp) / unit.maxHp
    unit.hpBarFg.setSize(HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT)
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

    this.add.rectangle(cx, cy, width, height, 0x050008, 0.88).setDepth(300)
    this.add.text(cx, cy - 80, '💥 게임 오버', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '42px', fontStyle: 'bold', color: '#dc2626',
    }).setOrigin(0.5).setDepth(301)
    this.add.text(cx, cy - 20, '함대가 전멸했습니다.', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '18px', color: '#cdd8f4',
    }).setOrigin(0.5).setDepth(301)

    const btn = this.add.text(cx, cy + 60, '🔄 처음부터 다시 시작', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '18px', fontStyle: 'bold', color: '#ffd166',
    }).setOrigin(0.5).setDepth(301).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.onGameOver?.())
    this.tweens.add({ targets: btn, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 })
  }

  // 전투 종료 후 선택지 — "맵으로 복귀"는 노드 기반 전투(MOD-6)일 때만 보여준다(자유 전투 호환).
  buildEndActions() {
    const actions = [{ label: '🔁 같은 전투 다시 시작 (함대 성장은 유지됩니다)', onClick: () => this.scene.restart(this.initArgs) }]
    if (this.node && this.onExit) {
      actions.unshift({ label: '🌌 성단 맵으로 복귀', onClick: () => this.onExit() })
    }
    return actions
  }

  // 풀스크린 결과 배너 + 선택지 버튼들(위에서부터 쌓임). MOD-6: 맵 복귀/재도전 중 골라 다음 행동을 잇는다.
  showBattleEndBanner(title, lines, actions) {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    const dim = this.add.rectangle(cx, cy, width, height, 0x05060f, 0.8).setDepth(300)
    const titleText = this.add
      .text(cx, cy - 130, title, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setDepth(301)
    const bodyText = this.add
      .text(cx, cy - 80, lines.join('\n'), {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '14px',
        color: '#cdd8f4',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)
      .setDepth(301)

    const buttonColors = ['#ffd166', '#3ad6c4']
    const buttons = actions.map((action, index) => {
      const btn = this.add
        .text(cx, cy + 150 + index * 36, action.label, {
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: buttonColors[index % buttonColors.length],
        })
        .setOrigin(0.5)
        .setDepth(301)
        .setInteractive({ useHandCursor: true })

      btn.on('pointerdown', (_pointer, _lx, _ly, event) => {
        event?.stopPropagation()
        action.onClick()
      })
      this.tweens.add({ targets: btn, alpha: 0.4, duration: 480, yoyo: true, repeat: -1 })
      return btn
    })

    this.battleEndLayer = [dim, titleText, bodyText, ...buttons]
  }

  // ----- AP/TP -----
  // 행동(이동=1, 공격=1) 시 AP를 소모한다 — dev_plan_guide.md MOD-3 요청 예시의 비용 규칙을 그대로 따른다.
  spendAp(unit, cost) {
    unit.ap = Math.max(0, unit.ap - cost)
    this.refreshUnitStatusLabel(unit)
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

  // ----- 배틀 스토어 동기화 (React 서브네비 패널용) -----
  syncUnitsToStore() {
    useBattleStore.getState().setUnits(
      this.units.map(u => ({
        id: u.instanceId ?? `${u.side}_${u.ship.name}`,
        side: u.side,
        name: u.ship.name,
        sprite: getEmojiFallback(u.ship.sprite),
        hp: u.hp,
        maxHp: u.maxHp,
        ap: u.ap,
        maxAp: u.maxAp,
        tp: u.tp,
        level: u.ship.level ?? 1,
        aceName: u.ace?.name ?? null,
        dead: u.hp <= 0,
      }))
    )
  }

  // ----- 턴 순환: 플레이어 페이즈 ↔ 적 페이즈 -----
  startPlayerPhase() {
    this.phase = 'player'
    this.allyQueue = this.units.filter((u) => u.side === 'ally')
    for (const unit of this.allyQueue) this.refillAp(unit)
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
      this.spendAp(unit, 1)
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

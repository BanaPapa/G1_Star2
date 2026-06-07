import Phaser from 'phaser'
import { computeMovementRange, findPath, manhattanDistance } from '../../core/grid'
import { resolveAttack } from '../../core/combat'
import { pickTarget, inAttackRange, planApproach } from '../../core/ai'
import { getUsableSkills, getFinisher, collectLineTargets } from '../../core/skills'
import { getTerrain } from '../systems/terrain'
import { getEmojiFallback } from '../../core/assetMap'
import CutinManager from '../effects/CutinManager'

const COLS = 12
const ROWS = 10
const CELL = 64

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

// 유닛 샘플 배치 — ships.json의 정찰함(MOV6)·전함(MOV2) 등 MOV 차이를 바로 비교할 수 있게 구성
// MOD-4: aces.json의 affinity(탑승 가능 함선)와 정확히 일치하는 조합으로 에이스 2명을 배정한다
//   (카이→전투기, 세라→순양함). 밀라(공모 전용)·레이븐(영입이 missable로 명시된 스토리 한정 캐릭터)은
//   현재 로스터에 대응 함선이 없거나 임의 배정이 데이터 의도와 어긋나므로 제외 — 보고서에 그대로 공개한다.
const UNIT_PLACEMENTS = [
  { side: 'ally', shipId: 'scout', x: 1, y: 5 },
  { side: 'ally', shipId: 'fighter', x: 1, y: 7, aceId: 'kai' },
  { side: 'ally', shipId: 'cruiser', x: 1, y: 3, aceId: 'sera' },
  { side: 'enemy', shipId: 'battleship', x: 10, y: 5 },
  { side: 'enemy', shipId: 'fighter', x: 10, y: 3 },
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

const HP_BAR_WIDTH = CELL * 0.56
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

const ENEMY_ACTION_DELAY = 260 // 적 행동 사이 텀(ms) — 무슨 일이 일어나는지 눈으로 따라갈 수 있게

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene')
  }

  init({ ships, combatRules, skills, aces }) {
    this.shipsById = new Map(ships.map((s) => [s.id, s]))
    this.combatRules = combatRules
    this.allSkills = skills
    this.acesById = new Map(aces.map((a) => [a.id, a]))
    this.terrain = buildTerrainLayout()
    this.units = []
    this.selected = null
    this.highlighted = new Set()
    this.busy = false // 이동/공격/적 행동 애니메이션 동안 입력 잠금
    this.turnNumber = 1
    this.phase = 'player' // 'player' | 'enemy'
    this.pendingAbility = null // { unit, skill } — 필살기 조준 대기 상태
    this.cutinEnabled = true // 토글 off 시 컷인 연출을 건너뛰고 효과만 즉시 적용 (DoD: "토글 off 시 빠른 진행")
  }

  create() {
    this.originX = (this.scale.width - COLS * CELL) / 2
    this.originY = (this.scale.height - ROWS * CELL) / 2 + 22

    this.cellRects = []
    for (let y = 0; y < ROWS; y += 1) {
      const row = []
      for (let x = 0; x < COLS; x += 1) row.push(this.createCell(x, y))
      this.cellRects.push(row)
    }

    UNIT_PLACEMENTS.forEach((placement) => this.spawnUnit(placement))

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
      this.refreshCutinToggleLabel()
    })
    this.refreshCutinToggleLabel()

    this.cutinManager = new CutinManager(this)

    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.phase !== 'player' || this.busy) return
      this.endPlayerPhase()
    })

    this.startPlayerPhase()
  }

  refreshCutinToggleLabel() {
    this.cutinToggleText.setText(
      this.cutinEnabled
        ? '🎬 컷인 연출 ON (클릭 시 끄기)'
        : '⏩ 컷인 연출 OFF — 결과만 즉시 적용 (클릭 시 켜기)',
    )
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
      this.add.text(px, py, terrain.glyph, { fontSize: '22px' }).setOrigin(0.5).setAlpha(0.85)
    }
    return rect
  }

  // ----- 유닛 -----
  spawnUnit(placement) {
    const ship = this.shipsById.get(placement.shipId)
    if (!ship) return

    const palette = SIDE_COLOR[placement.side]
    const { px, py } = this.cellToWorld(placement.x, placement.y)
    const radius = CELL * 0.36

    const ace = placement.aceId ? this.acesById.get(placement.aceId) ?? null : null
    const finisher = ace ? getFinisher(ace, this.allSkills) : null

    const ring = this.add.circle(0, 0, radius, palette.fill)
    ring.setStrokeStyle(2, palette.ring, 0.9)
    const glyph = this.add.text(0, -4, getEmojiFallback(ship.sprite), { fontSize: '22px' }).setOrigin(0.5)
    const labelText = ace ? `${ship.name} MOV${ship.mov} · 지휘관 ${ace.name}` : `${ship.name} MOV${ship.mov}`
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
      finisher,
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
    if (this.busy || this.phase !== 'player') return

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
      const { unit, skill } = this.pendingAbility
      if (skill.target === 'single') {
        this.launchFinisher(unit, skill, [enemy])
      } else if (skill.target === 'line') {
        this.tryFireLine(unit, skill, { x: enemy.gridX, y: enemy.gridY })
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
    if (this.busy || this.phase !== 'player') return

    if (this.pendingAbility) {
      const { unit, skill } = this.pendingAbility
      if (skill.target === 'line') this.tryFireLine(unit, skill, { x, y })
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
    if (!unit || unit.side !== 'ally' || !unit.finisher) return

    const skill = unit.finisher
    const ready = unit.tp >= TP_MAX
    const label = ready
      ? `✨ [${unit.ace.name}] 필살기 "${skill.name}" 발동 가능! — 클릭해서 사용`
      : `${unit.ace.name}의 필살기 "${skill.name}" — TP ${Math.round((unit.tp / TP_MAX) * 100)}% (가득 차면 발동)`

    const chip = this.add
      .text(16, 34, label, {
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
        this.beginFinisherTargeting(unit)
      })
      this.tweens.add({ targets: chip, alpha: 0.4, duration: 480, yoyo: true, repeat: -1 })
    }

    this.actionChips.push(chip)
  }

  // ----- 필살기 조준/발동 -----
  beginFinisherTargeting(unit) {
    const skill = unit.finisher

    // 광역(아군/적 전체)은 대상 선택 없이 즉시 발동
    if (skill.target === 'aoe_ally' || skill.target === 'aoe_enemy') {
      const targets =
        skill.target === 'aoe_ally'
          ? this.units.filter((u) => u.side === unit.side)
          : this.units.filter((u) => u.side !== unit.side)
      this.launchFinisher(unit, skill, targets)
      return
    }

    this.pendingAbility = { unit, skill }
    this.actionChips?.forEach((chip) => chip.destroy())
    this.actionChips = []
    this.clearHighlights()

    if (skill.target === 'line') {
      this.highlightLineAimCells(unit)
      this.refreshHud(
        `${unit.ace.name} — "${skill.name}" 조준 중! 직선 방향(상하좌우)의 칸이나 그 위의 적을 클릭해 발사하세요. (취소: 유닛을 다시 클릭)`,
      )
    } else {
      this.refreshHud(
        `${unit.ace.name} — "${skill.name}" 조준 중! 사거리와 무관하게 대상 적 유닛을 클릭하세요. (취소: 유닛을 다시 클릭)`,
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

  tryFireLine(unit, skill, aimCell) {
    if (!this.highlighted.has(`${aimCell.x},${aimCell.y}`)) {
      this.cancelPendingAbility()
      return
    }
    const targets = collectLineTargets(unit, aimCell, this.units, { cols: COLS, rows: ROWS })
    if (targets.length === 0) {
      this.refreshHud(
        `${unit.ace.name} — 그 방향에는 적이 없습니다. 다른 방향의 칸을 클릭하거나, 유닛을 다시 클릭해 취소하세요.`,
      )
      return
    }
    this.launchFinisher(unit, skill, targets)
  }

  // 컷인 연출(ON일 때) → onApply 시점에 실제 효과 적용 → 복귀까지 끝나면 입력 잠금 해제.
  // dev_plan_guide.md 요청 예시 그대로: TP는 사용 즉시 0으로 초기화한다(전액 소모, cost.tp:"full").
  launchFinisher(unit, skill, targets) {
    this.pendingAbility = null
    this.clearSelection()
    this.busy = true

    const ace = unit.ace
    unit.tp = 0
    this.refreshUnitStatusLabel(unit)

    this.cutinManager.play({
      ace,
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

  // ----- 턴 순환: 플레이어 페이즈 ↔ 적 페이즈 -----
  startPlayerPhase() {
    this.phase = 'player'
    for (const unit of this.units) {
      if (unit.side === 'ally') this.refillAp(unit)
    }
    this.refreshHud()
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
      this.time.delayedCall(ENEMY_ACTION_DELAY, () => {
        this.refreshHud(`적 턴 ${this.turnNumber} — 적이 행동합니다...`)
        this.runEnemyUnit(index + 1)
      })
    })
  }

  // unit이 AP를 모두 쓰거나 더 할 행동이 없을 때까지 이동→공격을 반복한다.
  takeEnemyTurn(unit, onDone) {
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
    this.refreshHud(`${unit.ship.name}(적) 이동 중...`)
    this.animateUnitAlongPath(unit, path, () => {
      unit.gridX = targetX
      unit.gridY = targetY
      this.spendAp(unit, 1)
      this.busy = false
      onDone()
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

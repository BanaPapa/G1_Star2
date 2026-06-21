import { getEmojiFallback } from '../../core/assetMap'

// 필살기·보스 풀스크린 컷인 연출.
//   ① 시간정지 + 배경 디밍  ② 컷인 일러 슬라이드인  ③ 이펙트 재생 + 화면 흔들림 + 플래시
//   ④ (호출자가 onApply에서) 데미지 적용 · 숫자팝  ⑤ 복귀
//
// 일러/이펙트 PNG가 없으므로(그록 제작 전) assetMap의 이모지 폴백을 그대로 사용한다 — 작업 규칙 5.
// scene.cutinEnabled가 false면 연출을 모두 건너뛰고 onApply→onComplete만 즉시 호출한다("토글 off 시 빠른 진행").

const DIM_COLOR  = 0x05060f
const BOSS_COLOR = 0x1a0505
const DIM_ALPHA = 0.74
const FLASH_COLOR = { r: 255, g: 226, b: 160 }
const NAME_COLOR = '#ffd166'
const SUB_COLOR = '#cdd8f4'

export default class CutinManager {
  constructor(scene) {
    this.scene = scene
  }

  // ace: aces.json 항목, skill: skills.json의 필살기 스킬 객체.
  // onApply(): 실제 데미지/효과 적용 + showFloatingText 등 호출 — 컷인의 절정 타이밍에 맞춰 실행된다.
  // onComplete(): 연출 종료 후(또는 토글 off 시 즉시) 호출 — 입력 잠금 해제 등은 호출자 책임.
  play({ ace, skill, onApply, onComplete }) {
    const scene = this.scene

    if (!scene.cutinEnabled) {
      onApply()
      onComplete?.()
      return
    }

    const { width, height } = scene.scale
    const cx = width / 2
    const cy = height / 2

    const dim = scene.add.rectangle(cx, cy, width, height, DIM_COLOR, 0).setDepth(200)
    const portrait = scene.add
      .text(-220, cy, getEmojiFallback(ace.portrait), { fontSize: '180px' })
      .setOrigin(0.5)
      .setDepth(201)
    const nameText = scene.add
      .text(cx, height * 0.78, `${ace.name}`, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: NAME_COLOR,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(202)
    const skillText = scene.add
      .text(cx, height * 0.78 + 30, `필살기 발동 — ${skill.name}`, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '15px',
        color: SUB_COLOR,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(202)
    const burst = scene.add
      .text(cx, cy, getEmojiFallback(skill.cutin), { fontSize: '64px' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.4)
      .setDepth(203)

    const layer = [dim, portrait, nameText, skillText, burst]
    scene.busy = true

    // ① 시간정지 + 배경 디밍
    scene.tweens.add({ targets: dim, fillAlpha: DIM_ALPHA, duration: 200, ease: 'Sine.easeOut' })

    // ② 컷인 일러 슬라이드인
    scene.tweens.add({
      targets: portrait,
      x: cx - 150,
      duration: 380,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({ targets: [nameText, skillText], alpha: 1, duration: 180 })

        // ③ 이펙트 스프라이트 재생 + screen shake + flash
        scene.tweens.add({
          targets: burst,
          alpha: 1,
          scale: 1.6,
          duration: 260,
          ease: 'Cubic.easeOut',
          onComplete: () => scene.tweens.add({ targets: burst, alpha: 0, duration: 220 }),
        })
        scene.cameras.main.shake(280, 0.014)
        scene.cameras.main.flash(220, FLASH_COLOR.r, FLASH_COLOR.g, FLASH_COLOR.b)

        // ④ 데미지 적용 · 숫자팝 (절정 타이밍에 맞춰 호출자에게 위임)
        scene.time.delayedCall(260, () => {
          onApply()

          // ⑤ 복귀
          scene.time.delayedCall(620, () => {
            scene.tweens.add({
              targets: layer,
              alpha: 0,
              duration: 260,
              ease: 'Sine.easeIn',
              onComplete: () => {
                layer.forEach((node) => node.destroy())
                scene.busy = false
                onComplete?.()
              },
            })
          })
        })
      },
    })
  }

  // 보스 2페이즈 전환 연출 — unit: 보스 유닛, bossData: enemies.json 항목.
  // onApply(): ATK 부스트·소환 등 실제 효과 적용 (연출 절정에 호출됨).
  // onComplete(): 연출 종료 후 호출.
  playBossPhase({ unit, bossData, onApply, onComplete }) {
    const scene = this.scene

    if (!scene.cutinEnabled) {
      onApply?.()
      onComplete?.()
      return
    }

    const { width, height } = scene.scale
    const cx = width / 2
    const cy = height / 2

    const dim = scene.add.rectangle(cx, cy, width, height, BOSS_COLOR, 0).setDepth(200)
    const bossEmoji = getEmojiFallback(unit.ship.sprite)
    const portrait = scene.add
      .text(cx, cy + 80, bossEmoji, { fontSize: '120px' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(201)
    const phaseText = scene.add
      .text(cx, cy - 60, '⚡ PHASE 2', {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#dc2626',
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(202)
    const nameText = scene.add
      .text(cx, cy - 10, unit.ship.name, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '22px',
        color: NAME_COLOR,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(202)
    const descText = scene.add
      .text(cx, cy + 22, bossData.phases?.[1]?.behavior ?? '강화 패턴 활성화', {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '14px',
        color: SUB_COLOR,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(202)

    const layer = [dim, portrait, phaseText, nameText, descText]
    scene.busy = true

    scene.tweens.add({ targets: dim, fillAlpha: 0.88, duration: 200, ease: 'Sine.easeOut' })
    scene.tweens.add({
      targets: portrait,
      alpha: 1,
      y: cy + 20,
      duration: 340,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({ targets: [phaseText, nameText, descText], alpha: 1, duration: 200 })
        scene.cameras.main.shake(400, 0.022)
        scene.cameras.main.flash(300, 220, 30, 30)

        scene.time.delayedCall(320, () => {
          onApply?.()

          scene.time.delayedCall(700, () => {
            scene.tweens.add({
              targets: layer,
              alpha: 0,
              duration: 280,
              ease: 'Sine.easeIn',
              onComplete: () => {
                layer.forEach((n) => n.destroy())
                scene.busy = false
                onComplete?.()
              },
            })
          })
        })
      },
    })
  }
}

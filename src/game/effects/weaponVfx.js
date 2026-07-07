// 무기 계열별 프로시저럴 전투 이펙트 — 아트 에셋 없이 Phaser Graphics/트윈만으로 계열의 손맛을 구분한다.
// (MASTER_PLAN Phase 10-1 선행 구현 — 스프라이트 이펙트로 교체되기 전까지의 표준 연출)
//
// 모든 함수는 fire-and-forget: 생성한 오브젝트는 연출이 끝나면 스스로 파괴한다.
// from/to는 월드 좌표 { x, y }.

const FAMILY_COLOR = {
  laser: 0x66eaff,
  ion: 0x7fd9ff,
  plasma: 0xff7a2a,
  gravity: 0xb18cff,
  antimatter: 0xff5ce1,
  basic: 0xffd166,
}

export function familyColor(family) {
  return FAMILY_COLOR[family] ?? FAMILY_COLOR.basic
}

// ── 공용: 명중 임팩트 — 확장 링 + 사방 파편 ──
export function playHitImpact(scene, x, y, color = FAMILY_COLOR.basic) {
  const ring = scene.add.circle(x, y, 9, color, 0).setStrokeStyle(3, color, 0.95).setDepth(9)
  scene.tweens.add({
    targets: ring, scale: 3.2, alpha: 0, duration: 340, ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  })
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.6
    const dist = 22 + Math.random() * 18
    const p = scene.add.circle(x, y, 2.2, color, 0.95).setDepth(9)
    scene.tweens.add({
      targets: p, x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist,
      alpha: 0, duration: 300 + Math.random() * 150, ease: 'Cubic.easeOut',
      onComplete: () => p.destroy(),
    })
  }
}

// ── Ion: 톱니형 전기 볼트 — 여러 번 다시 그리며 지지직거린 뒤 사라진다 ──
export function playIonBolt(scene, from, to, color = FAMILY_COLOR.ion) {
  const g = scene.add.graphics().setDepth(9)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const px = -dy / len // 수직 방향 (지그재그 오프셋용)
  const py = dx / len

  const drawBolt = () => {
    g.clear()
    const segs = Math.max(5, Math.floor(len / 46))
    const pts = [{ x: from.x, y: from.y }]
    for (let i = 1; i < segs; i++) {
      const t = i / segs
      const off = (Math.random() - 0.5) * 22
      pts.push({ x: from.x + dx * t + px * off, y: from.y + dy * t + py * off })
    }
    pts.push({ x: to.x, y: to.y })
    const stroke = (width, alpha) => {
      g.lineStyle(width, color, alpha)
      g.beginPath()
      g.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
      g.strokePath()
    }
    stroke(6, 0.22)          // 글로우
    stroke(2, 0.95)          // 코어
    g.lineStyle(1, 0xffffff, 0.9)
    g.strokeCircle(to.x, to.y, 6 + Math.random() * 5) // 타깃 주변 스파크 링
  }

  drawBolt()
  scene.time.delayedCall(70, drawBolt)
  scene.time.delayedCall(140, drawBolt)
  scene.tweens.add({
    targets: g, alpha: 0, duration: 260, delay: 200, ease: 'Cubic.easeOut',
    onComplete: () => g.destroy(),
  })
}

// ── Plasma: 화염구 발사체 — 날아가서 도착 시 폭발. onArrive로 후속 연출을 연결한다 ──
export function playPlasmaShot(scene, from, to, color = FAMILY_COLOR.plasma, onArrive) {
  const glow = scene.add.circle(from.x, from.y, 13, color, 0.28).setDepth(9)
  const core = scene.add.circle(from.x, from.y, 7, color, 1).setDepth(9)
  const inner = scene.add.circle(from.x, from.y, 3.5, 0xffe0b0, 1).setDepth(9)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const duration = Math.min(420, Math.max(180, dist * 0.55))
  scene.tweens.add({
    targets: [glow, core, inner], x: to.x, y: to.y, duration, ease: 'Sine.easeIn',
    onComplete: () => {
      glow.destroy(); core.destroy(); inner.destroy()
      playPlasmaExplosion(scene, to.x, to.y, color)
      onArrive?.()
    },
  })
}

// Plasma 폭발 — 섬광 + 이중 확장 링
export function playPlasmaExplosion(scene, x, y, color = FAMILY_COLOR.plasma) {
  const flash = scene.add.circle(x, y, 16, 0xffffff, 0.85).setDepth(9)
  scene.tweens.add({ targets: flash, scale: 2.4, alpha: 0, duration: 200, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() })
  const ring1 = scene.add.circle(x, y, 12, color, 0).setStrokeStyle(4, color, 0.9).setDepth(9)
  scene.tweens.add({ targets: ring1, scale: 3.6, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring1.destroy() })
  const ring2 = scene.add.circle(x, y, 12, color, 0).setStrokeStyle(2, 0xffd166, 0.8).setDepth(9)
  scene.tweens.add({ targets: ring2, scale: 2.2, alpha: 0, duration: 520, delay: 90, ease: 'Cubic.easeOut', onComplete: () => ring2.destroy() })
}

// ── Gravity: 중력 파동 — 타깃 위로 수축하는 링 (끌려 들어가는 왜곡감). onArrive로 후속 연결 ──
export function playGravityWave(scene, from, to, color = FAMILY_COLOR.gravity, onArrive) {
  const wave = scene.add.circle(from.x, from.y, 10, color, 0.35).setDepth(9)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const duration = Math.min(380, Math.max(160, dist * 0.5))
  scene.tweens.add({
    targets: wave, x: to.x, y: to.y, duration, ease: 'Sine.easeIn',
    onComplete: () => {
      wave.destroy()
      // 도착 — 바깥에서 안으로 수축하는 삼중 링 (블랙홀로 빨려드는 인상)
      for (let i = 0; i < 3; i++) {
        const ring = scene.add.circle(to.x, to.y, 8, color, 0).setStrokeStyle(2.5, color, 0.85).setDepth(9)
        ring.setScale(4 - i)
        scene.tweens.add({
          targets: ring, scale: 0.3, alpha: 0, duration: 380, delay: i * 90, ease: 'Cubic.easeIn',
          onComplete: () => ring.destroy(),
        })
      }
      onArrive?.()
    },
  })
}

// ── Antimatter: 소멸 섬광 — 검은 수축 + 마젠타 링 팽창 (존재가 지워지는 인상) ──
export function playAntimatterFlash(scene, x, y, color = FAMILY_COLOR.antimatter) {
  const dark = scene.add.circle(x, y, 22, 0x000000, 0.8).setDepth(9)
  scene.tweens.add({ targets: dark, scale: 0.1, alpha: 0, duration: 360, ease: 'Cubic.easeIn', onComplete: () => dark.destroy() })
  const ring = scene.add.circle(x, y, 10, color, 0).setStrokeStyle(3, color, 0.95).setDepth(9)
  scene.tweens.add({ targets: ring, scale: 3.4, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() })
  const flash = scene.add.circle(x, y, 8, 0xffffff, 0.9).setDepth(9)
  scene.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: 180, onComplete: () => flash.destroy() })
}

// ── 격파 연출 — 선행 폭발 1~2회 → 본 폭발(섬광+링) → 파편 비산 (WO-2) ──
// 파괴 판정은 즉시, 연출은 fire-and-forget. 유닛 스프라이트 페이드는 호출부(destroyUnit) 담당.
export function playDestruction(scene, x, y, color = 0xff9a3d) {
  for (let i = 0; i < 2; i++) {
    scene.time.delayedCall(i * 85, () => {
      const ox = x + (Math.random() - 0.5) * 28
      const oy = y + (Math.random() - 0.5) * 22
      const pop = scene.add.circle(ox, oy, 7, 0xffffff, 0.9).setDepth(9)
      scene.tweens.add({ targets: pop, scale: 2.0, alpha: 0, duration: 160, ease: 'Cubic.easeOut', onComplete: () => pop.destroy() })
    })
  }
  scene.time.delayedCall(170, () => {
    playPlasmaExplosion(scene, x, y, color)
    for (let i = 0; i < 9; i++) {
      const ang = Math.random() * Math.PI * 2
      const dist = 30 + Math.random() * 40
      const size = 1.6 + Math.random() * 2.4
      const p = scene.add.circle(x, y, size, i % 3 === 0 ? 0xffffff : color, 0.95).setDepth(9)
      scene.tweens.add({
        targets: p, x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist,
        alpha: 0, duration: 420 + Math.random() * 260, ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      })
    }
  })
}

// ── Antimatter 완전 소멸 — 폭발이 아니라 "존재가 지워지는" 파편화. 중력 없이 감속만 (WO-6) ──
export function playAnnihilateShards(scene, x, y, color = FAMILY_COLOR.antimatter) {
  playAntimatterFlash(scene, x, y, color)
  const n = 8 + Math.floor(Math.random() * 5)
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2
    const dist = 26 + Math.random() * 46
    const s = 2 + Math.random() * 4
    const shard = scene.add
      .rectangle(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14, s, s, i % 3 === 0 ? 0xffffff : color, 0.95)
      .setDepth(9)
      .setAngle(Math.random() * 90)
    scene.tweens.add({
      targets: shard,
      x: shard.x + Math.cos(ang) * dist, y: shard.y + Math.sin(ang) * dist,
      angle: shard.angle + (Math.random() - 0.5) * 180,
      alpha: 0, scale: 0.2,
      duration: 480 + Math.random() * 240, ease: 'Cubic.easeOut',
      onComplete: () => shard.destroy(),
    })
  }
}

// ── Ion 잔류 스파크 — 명중 후 0.5초간 대상 주변이 지지직거린다 (WO-4) ──
export function playIonSparks(scene, x, y, color = FAMILY_COLOR.ion) {
  for (let i = 0; i < 5; i++) {
    scene.time.delayedCall(i * 90 + Math.random() * 40, () => {
      const ox = x + (Math.random() - 0.5) * 44
      const oy = y + (Math.random() - 0.5) * 36
      const g = scene.add.graphics().setDepth(9)
      g.lineStyle(1.5, color, 0.95)
      g.beginPath()
      g.moveTo(ox - 5, oy)
      g.lineTo(ox - 1, oy - 4)
      g.lineTo(ox + 1, oy + 3)
      g.lineTo(ox + 5, oy - 2)
      g.strokePath()
      scene.tweens.add({ targets: g, alpha: 0, duration: 140, delay: 60, onComplete: () => g.destroy() })
    })
  }
}

// ── 기본 포: 총구 섬광 + 예광탄 ──
export function playCannonTracer(scene, from, to, color = FAMILY_COLOR.basic, onArrive) {
  const muzzle = scene.add.circle(from.x, from.y, 8, 0xffffff, 0.9).setDepth(9)
  scene.tweens.add({ targets: muzzle, scale: 1.8, alpha: 0, duration: 130, onComplete: () => muzzle.destroy() })
  const tracer = scene.add.circle(from.x, from.y, 3, color, 1).setDepth(9)
  const trail = scene.add.circle(from.x, from.y, 5.5, color, 0.3).setDepth(9)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const duration = Math.min(260, Math.max(110, dist * 0.32))
  scene.tweens.add({
    targets: [tracer, trail], x: to.x, y: to.y, duration, ease: 'Linear',
    onComplete: () => { tracer.destroy(); trail.destroy(); onArrive?.() },
  })
}

// Plasma 계열 판정 — 순수 함수 모듈 (BattleScene과 분리, 단위 테스트 대상).
// 설계 근거: docs/design/weapons_master_plan.md §4 (Plasma 판정·중첩 규칙), DESIGN_BIBLE §3-6
//
// 계열 문법: T1 아머 약화 → T2 방어/공격 약화 → T3 5×5 폭발 → T4 강화 폭발+잔열 → T5 아머 붕괴/최대 HP 손상
//
// 효과 표현: unitModifiers의 stat 모디파이어 (data.defPct/atkPct = 방어력·공격력 % 증감).
//   "전투 종료까지" = turnsLeft Infinity (tickTurn이 자연히 유지).
//   중첩 금지 = 같은 id 재부착 시 지속턴 갱신만 (unitModifiers.addModifier 규칙).
//   §7 구분 유지: Plasma는 방어력(%) 약화 — 장갑 내구도 삭제(Antimatter)와 다른 축.

function defaults(cfg = {}) {
  return {
    armorMelter: { defPct: -30, turns: 1, permanentChance: 0.15, ...cfg.armorMelter },
    coreMelter:  { defPct: -30, atkPct: -30, turns: 1, permanentChance: 0.15, ...cfg.coreMelter },
    burstMults:    cfg.burstMults    ?? [1.0, 0.8, 0.6], // T3 — [중심, 1칸, 2칸]
    hellfireMults: cfg.hellfireMults ?? [1.2, 1.0, 0.8], // T4
    heatZoneTurns:    cfg.heatZoneTurns    ?? 1,   // 잔열 지속 턴 (다음 턴까지)
    heatZoneArmorPct: cfg.heatZoneArmorPct ?? -50, // 잔열 위 방어력 감소 (환경성 — 벗어나면 해제)
    annihilator: {
      maxHpStrongChance: 0.25, maxHpNormalPct: 30, maxHpStrongPct: 50,
      boss: { defPct: -50, defChance: 0.7, maxHpNormalPct: 10, maxHpStrongPct: 20, maxHpStrongChance: 0.25 },
      ...cfg.annihilator,
    },
  }
}

// T1/T2/T5 명중 시 효과 판정.
//   alreadyMaxHpHit : 대상이 이미 T5 효과를 받았는가 (5단계 효과끼리 중첩 불가 — master_plan §4 중첩 규칙)
// 반환: { modifiers, maxHpDamagePct, events }
export function rollPlasmaHit({ tier, isBoss = false, alreadyMaxHpHit = false, cfg, rng = Math.random }) {
  const c = defaults(cfg)
  const modifiers = []
  const events = []
  let maxHpDamagePct = 0

  const statMod = (id, data, permanent) => ({
    id, kind: 'stat', turnsLeft: permanent ? Infinity : (data.turns ?? 1), icon: '🔥',
    data: { defPct: data.defPct ?? 0, atkPct: data.atkPct ?? 0 },
  })

  if (tier === 1) {
    const permanent = rng() < c.armorMelter.permanentChance
    modifiers.push(statMod('plasma_armor_melt', c.armorMelter, permanent))
    events.push({ type: 'melt', defPct: c.armorMelter.defPct, permanent })
  } else if (tier === 2) {
    const permanent = rng() < c.coreMelter.permanentChance
    modifiers.push(statMod('plasma_core_melt', c.coreMelter, permanent))
    events.push({ type: 'melt', defPct: c.coreMelter.defPct, atkPct: c.coreMelter.atkPct, permanent })
  } else if (tier >= 5) {
    if (alreadyMaxHpHit) {
      events.push({ type: 'annihilate_resist' }) // 이미 적용됨 — 재중첩 불가
    } else if (isBoss) {
      // 보스 예외: 완전 무력화 없음 — 확률 방어도 감소 + 축소된 최대 HP 손상 (master_plan §4)
      const b = c.annihilator.boss
      if (rng() < b.defChance) {
        modifiers.push(statMod('plasma_annihilator', { defPct: b.defPct }, true))
      }
      maxHpDamagePct = rng() < b.maxHpStrongChance ? b.maxHpStrongPct : b.maxHpNormalPct
      modifiers.push({ id: 'plasma_maxhp_hit', kind: 'flag', turnsLeft: Infinity })
      events.push({ type: 'annihilate_boss', maxHpDamagePct })
    } else {
      // 일반 적: 아머 전투 종료까지 무력화 + 최대 HP -30%(높은 확률)/-50%(낮은 확률)
      modifiers.push(statMod('plasma_annihilator', { defPct: -100 }, true))
      maxHpDamagePct = rng() < c.annihilator.maxHpStrongChance
        ? c.annihilator.maxHpStrongPct
        : c.annihilator.maxHpNormalPct
      modifiers.push({ id: 'plasma_maxhp_hit', kind: 'flag', turnsLeft: Infinity })
      events.push({ type: 'annihilate', maxHpDamagePct })
    }
  }

  return { modifiers, maxHpDamagePct, events }
}

// 5×5 폭발 범위 — 중심에서 체비쇼프 거리 0/1/2 링별 배율. 전장 밖 칸은 제외.
// 반환: [{ x, y, ring, mult }]
export function computeBlastCells({ center, cols, rows, ringMults }) {
  const cells = []
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue
      const ring = Math.max(Math.abs(dx), Math.abs(dy))
      cells.push({ x, y, ring, mult: ringMults[ring] ?? 0 })
    }
  }
  return cells
}

// 티어별 폭발 링 배율 (config 주입)
export function blastMultsForTier(tier, cfg) {
  const c = defaults(cfg)
  return tier >= 4 ? c.hellfireMults : c.burstMults
}

export { defaults as plasmaDefaults }

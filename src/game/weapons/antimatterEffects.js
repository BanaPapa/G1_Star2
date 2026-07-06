// Antimatter 계열 판정 — 순수 함수 모듈 (BattleScene과 분리, 단위 테스트 대상).
// 설계 근거: docs/design/weapons_master_plan.md §6 (Antimatter 판정 규칙), DESIGN_BIBLE §3-6
//
// 계열 문법: T1 이동계 삭제 → T2 방어층 소거 → T3 제어계 붕괴(폭주) → T4 블랙홀 → T5 존재 소멸
// §7 구분 유지: Antimatter는 "내구도/존재의 삭제" — Plasma의 방어력(%) 약화와 다른 축.
// 보상 구분: Gravity 전장 이탈 = 보상 제외 / Antimatter 소멸 = 처치 판정, 보상 지급.

export function antimatterDefaults(cfg = {}) {
  return {
    thruster: { movPct: -50, turns: 1, penaltyChance: 0.8, blockChance: 0.15, ...cfg.thruster },
    defenseEraser: { erodeChance: 0.8, erodeMult: 0.5, ...cfg.defenseEraser },
    field: { applyChance: 0.8, rampageTurns: 2, boss: { atkPct: -30, turns: 2 }, ...cfg.field },
    singularity: { holeCount: 4, adjacentDurabilityLossPct: 20, entryKills: true, ...cfg.singularity },
    annihilation: {
      annihilateChance: 0.6, chainChance: 0.5,
      failDurabilityChance: 0.7, failDurabilityMult: 0.5,
      ...cfg.annihilation,
    },
  }
}

// 명중 시 판정 (T1/T2/T3/T5).
//   alreadyEroded : T2 절삭 상태 재피격 여부 (재피격 → 완전 붕괴)
// 반환: { modifiers, mutations, events }
//   mutations — BattleScene이 대상 유닛에 직접 적용:
//     { shieldMult?, armorDurMult?, shieldZero?, armorDurZero?, annihilate?, chainChance? }
export function rollAntimatterHit({ tier, isBoss = false, alreadyEroded = false, cfg, rng = Math.random }) {
  const c = antimatterDefaults(cfg)
  const modifiers = []
  const mutations = {}
  const events = []

  if (tier === 1) {
    // MOVE만 제한 — 공격은 가능 (AP 태그 요구사항을 이동 제한 modifier로 구현)
    if (rng() < c.thruster.blockChance && !isBoss) {
      modifiers.push({ id: 'am_move_block', kind: 'move_block', turnsLeft: 1, icon: '⛓️' })
      events.push({ type: 'move_block' })
    } else if (rng() < c.thruster.penaltyChance) {
      modifiers.push({ id: 'am_move_cut', kind: 'stat', turnsLeft: c.thruster.turns, icon: '🕳️', data: { movPct: c.thruster.movPct } })
      events.push({ type: 'move_cut', movPct: c.thruster.movPct })
    }
  } else if (tier === 2) {
    if (alreadyEroded && !isBoss) {
      // 절삭 상태 재피격 → 장갑 완전 파괴 + 쉴드 완전 붕괴(재충전 불가)
      mutations.armorDurZero = true
      mutations.shieldZero = true
      modifiers.push({ id: 'am_shield_block', kind: 'recharge_block', turnsLeft: Infinity, icon: '🚫' })
      events.push({ type: 'erode_collapse' })
    } else if (rng() < c.defenseEraser.erodeChance) {
      mutations.armorDurMult = c.defenseEraser.erodeMult
      mutations.shieldMult = c.defenseEraser.erodeMult
      modifiers.push({ id: 'am_eroded', kind: 'flag', turnsLeft: Infinity })
      events.push({ type: 'erode', mult: c.defenseEraser.erodeMult })
    }
  } else if (tier === 3) {
    if (isBoss) {
      // 보스 예외: 난사 대신 공격력 감소 + 쉴드 재충전 봉쇄 (weapons_master_plan §6)
      modifiers.push({ id: 'am_field_boss', kind: 'stat', turnsLeft: c.field.boss.turns, icon: '🕳️', data: { atkPct: c.field.boss.atkPct } })
      modifiers.push({ id: 'am_shield_block', kind: 'recharge_block', turnsLeft: c.field.boss.turns, icon: '🚫' })
      events.push({ type: 'field_boss', atkPct: c.field.boss.atkPct })
    } else if (rng() < c.field.applyChance) {
      mutations.armorDurZero = true
      mutations.shieldZero = true
      modifiers.push({ id: 'am_shield_block', kind: 'recharge_block', turnsLeft: Infinity, icon: '🚫' })
      modifiers.push({ id: 'am_rampage', kind: 'rampage', turnsLeft: c.field.rampageTurns, icon: '💢' })
      events.push({ type: 'field', rampageTurns: c.field.rampageTurns })
    }
  } else if (tier >= 5) {
    if (!isBoss && rng() < c.annihilation.annihilateChance) {
      // 완전 소멸 — 처치 판정 (경험치/아이템 정상 지급). 인접 연쇄는 호출측이 chainChance로 굴린다.
      mutations.annihilate = true
      mutations.chainChance = c.annihilation.chainChance
      events.push({ type: 'annihilate' })
    } else {
      // 소멸 실패(또는 보스): 쉴드 100% 파괴 + 70% 확률 장갑 내구도 -50%
      mutations.shieldZero = true
      if (isBoss) {
        modifiers.push({ id: 'am_shield_block', kind: 'recharge_block', turnsLeft: Infinity, icon: '🚫' })
        events.push({ type: 'annihilate_boss_resist' })
      } else if (rng() < c.annihilation.failDurabilityChance) {
        mutations.armorDurMult = c.annihilation.failDurabilityMult
        modifiers.push({ id: 'am_eroded', kind: 'flag', turnsLeft: Infinity })
        events.push({ type: 'annihilate_fail', durabilityMult: c.annihilation.failDurabilityMult })
      } else {
        events.push({ type: 'annihilate_fail' })
      }
    }
  }

  return { modifiers, mutations, events }
}

// T4 블랙홀 위치 선정 — 중심 주변 8칸 중 유효한 칸에서 랜덤 holeCount개.
// isValid(x, y): 전장 안 + 통과 가능 + 유닛 없음 + 기존 필드효과 아님 (호출측 판정)
export function pickBlackHoleCells({ center, holeCount = 4, isValid, rng = Math.random }) {
  const candidates = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue // 중심점은 블랙홀이 되지 않음
      const x = center.x + dx
      const y = center.y + dy
      if (isValid(x, y)) candidates.push({ x, y })
    }
  }
  // Fisher–Yates 부분 셔플로 랜덤 추출
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  return candidates.slice(0, holeCount)
}

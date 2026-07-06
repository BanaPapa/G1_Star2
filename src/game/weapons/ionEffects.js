// Ion 계열 명중 시 효과 판정 — 순수 함수 모듈 (BattleScene과 분리, 단위 테스트 대상).
// 설계 근거: docs/design/weapons_master_plan.md §3 (Ion 판정 규칙), DESIGN_BIBLE §3-6 (Unit Modifier)
//
// 계열 문법: T1 조준 교란 → T2 행동력 교란 → T3 쉴드 무력화 → T4 피아식별 오류 → T5 시스템 붕괴
//
// 입력
//   tier             : 1~5
//   isBoss           : 대상이 보스면 예외 레이어 적용 (weapons_master_plan §8 — 그대로 적용 금지)
//   ionVulnerability : 대상 쉴드의 이온 취약도 (등급 체계 상세화 전까지 기본 1.0)
//   cfg              : config.combat.weaponEffects.ion — 수치는 전부 관제실 조정 대상
//   bossCfg          : config.combat.weaponEffects.bossExceptions
//   rng              : () => [0,1) — 테스트에서 주입
// 출력
//   { modifiers: [unitModifiers 형식], nullifyShield: boolean, events: [{type,...}] }
//   events는 연출/HUD용 서술자 — 표시 문구는 호출측(BattleScene)이 정한다.

function defaults(cfg = {}) {
  return {
    jammer:          { accMod: -30, evaMod: -30, turns: 1, ...cfg.jammer },
    apDisruptor:     { apDrainChance: 0.35, apDrainAmount: 2, stunChance: 0.15, ...cfg.apDisruptor },
    shieldNullifier: { baseChance: 0.3, rechargeBlockTurns: 1, ...cfg.shieldNullifier },
    iffScrambler:    { turns: 1, bossFallback: { accMod: -20, evaMod: -20, turns: 1 }, ...cfg.iffScrambler },
    systemCollapse:  { accMod: -70, evaMod: -70, turns: 1, shieldNullifyChance: 0.6, stunChanceOnNullify: 0.25, ...cfg.systemCollapse },
  }
}

function bossDefaults(bossCfg = {}) {
  return {
    stunConvertsToApDrain: 1,  // 보스 스턴 → AP -n 로 변환 (이동 봉쇄 → 감소 원칙)
    iffScrambleAllowed: false, // 보스 피아식별 교란 불가 → bossFallback 디버프로 약화 적용
    ...bossCfg,
  }
}

const statMod = (id, { accMod, evaMod, turns }) => ({
  id, kind: 'stat', turnsLeft: turns ?? 1, data: { accMod: accMod ?? 0, evaMod: evaMod ?? 0 },
})

export function rollIonHit({ tier, isBoss = false, ionVulnerability = 1.0, cfg, bossCfg, rng = Math.random }) {
  const c = defaults(cfg)
  const b = bossDefaults(bossCfg)
  const modifiers = []
  const events = []
  let nullifyShield = false

  // 스턴 판정 공통 — 보스는 스턴 대신 AP 드레인으로 약화
  const applyStun = () => {
    if (isBoss) {
      modifiers.push({ id: 'ion_stun', kind: 'ap_drain', data: { amount: b.stunConvertsToApDrain } })
      events.push({ type: 'ap_drain', amount: b.stunConvertsToApDrain, bossConverted: true })
    } else {
      modifiers.push({ id: 'ion_stun', kind: 'stun' })
      events.push({ type: 'stun' })
    }
  }

  // 쉴드 무력화 공통 — 충전율 0% + 재충전 차단
  const applyShieldNull = (blockTurns) => {
    nullifyShield = true
    modifiers.push({ id: 'ion_shield_block', kind: 'recharge_block', turnsLeft: blockTurns })
    events.push({ type: 'shield_null', blockTurns })
  }

  if (tier === 1) {
    modifiers.push(statMod('ion_jammer', c.jammer))
    events.push({ type: 'stat', ...c.jammer })
  } else if (tier === 2) {
    // AP -2 또는 (낮은 확률) 스턴 — 동시 발생 없음, 순차 배타 판정
    if (rng() < c.apDisruptor.apDrainChance) {
      modifiers.push({ id: 'ion_ap_drain', kind: 'ap_drain', data: { amount: c.apDisruptor.apDrainAmount } })
      events.push({ type: 'ap_drain', amount: c.apDisruptor.apDrainAmount })
    } else if (rng() < c.apDisruptor.stunChance) {
      applyStun()
    }
  } else if (tier === 3) {
    // 최종 확률 = 무기 기본 확률 × 쉴드 이온 취약도
    if (rng() < c.shieldNullifier.baseChance * ionVulnerability) {
      applyShieldNull(c.shieldNullifier.rechargeBlockTurns)
    }
  } else if (tier === 4) {
    if (isBoss && !b.iffScrambleAllowed) {
      modifiers.push(statMod('ion_iff_fallback', c.iffScrambler.bossFallback))
      events.push({ type: 'iff_boss_resist', ...c.iffScrambler.bossFallback })
    } else {
      modifiers.push({ id: 'ion_iff', kind: 'iff_scramble', turnsLeft: c.iffScrambler.turns })
      events.push({ type: 'iff', turns: c.iffScrambler.turns })
    }
  } else if (tier >= 5) {
    // 명중/회피 대폭 감소는 확정, 나머지는 확률 (모든 효과 확정 금지 — master_plan §3)
    modifiers.push(statMod('ion_collapse', c.systemCollapse))
    events.push({ type: 'stat', accMod: c.systemCollapse.accMod, evaMod: c.systemCollapse.evaMod, turns: c.systemCollapse.turns })
    if (rng() < c.systemCollapse.shieldNullifyChance) {
      applyShieldNull(c.shieldNullifier.rechargeBlockTurns)
      if (rng() < c.systemCollapse.stunChanceOnNullify) applyStun()
    }
  }

  return { modifiers, nullifyShield, events }
}

// 전투 판정 순수함수 — 수치는 ships.json의 combatRules를 그대로 전달받아 사용한다(하드코딩 금지).
//
// 명중 판정: hitChance = 공격자 ACC − (방어자 EVA + 지형 보정) + 부스터 보정
//   지형 보정은 dev_plan_guide.md의 설계("엄폐 시 방어 EVA +20 / 완전 노출 시 −20")를 그대로 따른다.
//   combatRules.terrainMod의 cover/exposed 값을 방어자의 "유효 EVA"에 가감하는 방식으로 해석한다
//   (JSON에 적힌 값(20 / -20)이 그 EVA 보정폭과 정확히 일치한다).
// 데미지: combatRules.damageFormula 그대로 max(1, ATK − DEF) × 상성 배율(counterMultiplier).

const titleCase = (id) => id.charAt(0).toUpperCase() + id.slice(1)

// counterMultiplier 테이블의 "exampleAttackerVsDefender[_attack]" 키 규칙을 그대로 조회한다.
// 표에 없는 조합은 데이터의 default 배율을 사용 — 표가 채워질수록 코드 변경 없이 자동 반영된다.
export function lookupCounterMultiplier(table, attackerId, defenderId) {
  const base = `example${titleCase(attackerId)}Vs${titleCase(defenderId)}`
  if (table[base] != null) return table[base]
  if (table[`${base}_attack`] != null) return table[`${base}_attack`]
  return table.default ?? 1
}

/**
 * 공격 1회를 판정한다.
 * @param {object} input
 * @param {{id:string, acc:number, atk:number}} input.attacker
 * @param {{id:string, eva:number, def:number, hp:number}} input.defender - hp는 현재 HP
 * @param {boolean} input.defenderCovered - 방어자가 엄폐 지형 위에 있는지
 * @param {boolean} [input.boosterActive] - 공격자가 부스터를 가동 중인지
 * @param {boolean} [input.forceHit] - true면 명중 판정을 건너뛰고 항상 명중시킨다
 *   (skills.json의 필살기 effect.unavoidable="회피불가 확정 대미지" 등 — 데이터가 명시한 경우에만 사용)
 * @param {number} [input.damageMultiplier] - 최종 데미지에 추가로 곱하는 배율(기본 1)
 *   (skills.json 필살기의 effect.damageMultiplier — counterMultiplier 위에 곱으로 누적되어
 *    "상성 + 필살기 위력"이 함께 반영된다. 통상 전투 호출은 인자를 생략해 기존과 동일하게 동작)
 * @param {() => number} [input.rng] - 0~1 난수 함수 (테스트용으로 주입 가능)
 * @param {object} rules - ships.json의 combatRules 객체
 * @returns {{hit:boolean, hitChance:number, damage:number, lethal:boolean}}
 */
export function resolveAttack(
  { attacker, defender, defenderCovered, boosterActive, forceHit = false, damageMultiplier = 1, rng = Math.random },
  rules,
) {
  const terrainEvaMod = rules.terrainMod[defenderCovered ? 'cover' : 'exposed'] ?? 0
  const boosterAccMod = boosterActive ? (rules.boosterMod.acc ?? 0) : 0

  const hitChance = attacker.acc - (defender.eva + terrainEvaMod) + boosterAccMod
  const hit = forceHit || rng() * 100 < hitChance

  if (!hit) {
    return { hit: false, hitChance, damage: 0, lethal: false }
  }

  const counterMultiplier = lookupCounterMultiplier(rules.counterMultiplier, attacker.id, defender.id)
  const damage = Math.round(Math.max(1, attacker.atk - defender.def) * counterMultiplier * damageMultiplier)
  const lethal = damage >= defender.hp

  return { hit: true, hitChance, damage, lethal }
}

// 무기 쿨타임 — 순수 함수 모듈 (BattleScene과 분리, 단위 테스트 대상).
// config `combat.weapon.cooldownEnabled` 토글(기본 OFF)이 켜졌을 때만 BattleScene이 사용한다.
// (MASTER_PLAN Phase 4-6 — 요청서 9장의 v1.0 쿨타임 미사용 방침을 데이터 주도 토글로 구현)
//
// 상태 표현: 유닛별 { [slot]: 남은 턴 수 } 평면 객체 (slot: 'weapon' | 'weapon2').
// 의미: 발사 시 cooldown N 부여 → 이후 자기 턴 시작(틱) N번을 지나야 다시 발사 가능.

// 발사 직후 쿨다운 부여 — turns 0 이하면 변화 없음. 새 객체를 반환한다.
export function startCooldown(cooldowns, slot, turns) {
  if (!turns || turns <= 0) return { ...(cooldowns ?? {}) }
  return { ...(cooldowns ?? {}), [slot]: turns }
}

// 자기 턴 시작 틱 — 모든 슬롯 1 감소, 0 이하는 제거.
export function tickCooldowns(cooldowns) {
  const next = {}
  for (const [slot, left] of Object.entries(cooldowns ?? {})) {
    if (left - 1 > 0) next[slot] = left - 1
  }
  return next
}

// 해당 슬롯의 남은 쿨다운 턴 (0 = 발사 가능)
export function cooldownLeft(cooldowns, slot) {
  return cooldowns?.[slot] ?? 0
}

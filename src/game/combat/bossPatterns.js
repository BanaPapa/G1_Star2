// 보스 고유 패턴 순수 로직 (Phase 7-3)
// 렌더러/씬 비의존 — 데미지 배율·발동 조건·광역 피해량만 계산한다. 실제 스폰·연출은 BattleScene이 담당.

// 가르가 피격될 때 측후방(isFlank) 명중이면 유효 DEF에 곱할 배율(0~1) 반환.
export function garrWeakpointArmorMult({ isFlank, cfg }) {
  const pct = cfg?.weakpointDefReductionPct ?? 50
  return isFlank ? Math.max(0, 1 - pct / 100) : 1
}

// 가르가 공격할 때 전면(비isFlank) 대상이면 피해 배율 반환.
export function garrFrontalDamageMult({ isFlank, cfg }) {
  const pct = cfg?.frontalDamageBonusPct ?? 30
  return isFlank ? 1 : 1 + pct / 100
}

// 워든 1페이즈 증원 발동 여부.
export function wardenShouldSummonPhase1({ turnNumber, alreadySummoned, bossPhase, cfg }) {
  if (alreadySummoned || bossPhase === 2) return false
  return turnNumber >= (cfg?.phase1SummonTurn ?? 2)
}

// 워든 2페이즈 차원 파동 피해량.
export function wardenAoeDamage({ atk, cfg }) {
  return Math.max(1, Math.floor(atk * (cfg?.phase2AoeAtkMult ?? 0.5)))
}

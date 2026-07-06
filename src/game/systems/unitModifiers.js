// Unit Modifier 시스템 — 유닛에 붙는 무기 고유 효과(명중/회피 디버프, 스턴, AP 드레인,
// IFF 교란, 쉴드 충전 차단)의 부착·지속턴·중첩 규칙. 순수 함수 모듈 (BattleScene과 분리, 단위 테스트 대상).
// 설계 근거: DESIGN_BIBLE §3-6 (범용 상태이상이 아닌 Weapon Effect 레이어), MASTER_PLAN Phase 4-0.
//
// modifier 형태
//   { id, kind, turnsLeft, data }
//   kind:
//     'stat'           — data: { accMod, evaMod } 지속형. 자기 페이즈 종료 시 turnsLeft 감소, 0이면 만료.
//     'stun'           — 원샷. 다음 AP 충전 시 AP 0으로 만들고 소멸.
//     'ap_drain'       — 원샷. data: { amount }. 다음 AP 충전 시 AP -amount 후 소멸.
//     'iff_scramble'   — 지속형. 자기 페이즈 동안 같은 편을 일반 공격 (특수기 불가).
//     'recharge_block' — 지속형. 쉴드 충전(스킬/아이템) 차단.
//
// 지속턴 의미: turnsLeft=1 로 부착된 효과는 "대상의 다음 자기 페이즈가 끝날 때" 만료된다.
//   (플레이어 페이즈에 적에게 부착 → 적 페이즈 내내 유효 → 적 페이즈 종료 시 만료)

// 부착 — 같은 id의 기존 효과는 지속턴 갱신(중첩 없음). 새 배열을 반환한다.
export function addModifier(list, mod) {
  const existing = (list ?? []).filter((m) => m.id !== mod.id)
  return [...existing, { ...mod }]
}

// 지속형 스탯 보정 합산 (key: 'accMod' | 'evaMod')
export function sumStat(list, key) {
  return (list ?? []).reduce((sum, m) => sum + (m.kind === 'stat' ? (m.data?.[key] ?? 0) : 0), 0)
}

export function hasModifier(list, kind) {
  return (list ?? []).some((m) => m.kind === kind)
}

// AP 충전 시점의 원샷 효과 소비 — 스턴이 있으면 AP 0(드레인 무시), 없으면 드레인 합산.
// { stunned, apDrain, remaining } 반환. stun/ap_drain은 remaining에서 제거된다.
export function consumeApEffects(list) {
  const src = list ?? []
  const stunned = src.some((m) => m.kind === 'stun')
  const apDrain = src.reduce((sum, m) => sum + (m.kind === 'ap_drain' ? (m.data?.amount ?? 0) : 0), 0)
  const remaining = src.filter((m) => m.kind !== 'stun' && m.kind !== 'ap_drain')
  return { stunned, apDrain, remaining }
}

// 자기 페이즈 종료 틱 — 지속형 효과의 turnsLeft를 줄이고 만료를 걸러낸다. 원샷은 건드리지 않는다.
export function tickTurn(list) {
  return (list ?? [])
    .map((m) => {
      if (m.kind === 'stun' || m.kind === 'ap_drain') return m
      return { ...m, turnsLeft: (m.turnsLeft ?? 1) - 1 }
    })
    .filter((m) => m.kind === 'stun' || m.kind === 'ap_drain' || m.turnsLeft > 0)
}

// 상태 라벨용 아이콘 요약 (예: '📡🔀') — 같은 아이콘은 1회만.
const KIND_ICON = {
  stat: '📡',
  stun: '💫',
  ap_drain: '⚡',
  iff_scramble: '🔀',
  recharge_block: '🚫',
}
export function modifierIcons(list) {
  const icons = []
  for (const m of list ?? []) {
    const icon = m.icon ?? KIND_ICON[m.kind] // 부착 시 icon 필드로 계열별 표시 오버라이드 가능 (예: Plasma 🔥)
    if (icon && !icons.includes(icon)) icons.push(icon)
  }
  return icons.join('')
}

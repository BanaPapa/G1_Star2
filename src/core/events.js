// 이벤트 시스템 순수함수 — events.json의 가중치 기반 랜덤 이벤트 선택 및 효과 계산 (MOD-10)

// eventWeights 배열에서 가중치 랜덤으로 type을 선택
export function pickEventType(eventWeights) {
  const total = eventWeights.reduce((sum, e) => sum + e.weight, 0)
  let rand = Math.random() * total
  for (const e of eventWeights) {
    rand -= e.weight
    if (rand <= 0) return e.type
  }
  return eventWeights[eventWeights.length - 1].type
}

// specialEvents 배열에서 균등 랜덤으로 하나 선택
export function pickSpecialEvent(specialEvents) {
  return specialEvents[Math.floor(Math.random() * specialEvents.length)]
}

// resource 이벤트: sc 제외 랜덤 자원 15~45 획득
export function buildResourceEvent(resources) {
  const pickable = (resources ?? []).filter((r) => r.id !== 'sc')
  if (!pickable.length) return { resourceId: 'ti', resourceName: '티타늄', amount: 20 }
  const r = pickable[Math.floor(Math.random() * pickable.length)]
  const amount = 15 + Math.floor(Math.random() * 31)
  return { resourceId: r.id, resourceName: r.name, amount }
}

// battle 이벤트: 이동 중 적 조우 — SC 손실 20~50
export function buildBattleEvent() {
  const loss = 20 + Math.floor(Math.random() * 31)
  return { loss }
}

// special 이벤트의 자원 보상/패널티를 정규화 — sc/ti/ec/dm 값만 추출 (xp 등 비자원 제외)
export function extractResourceEffect(obj) {
  if (!obj) return null
  const keys = ['sc', 'ti', 'ec', 'dm']
  const result = {}
  for (const k of keys) {
    if (obj[k] != null) result[k] = obj[k]
  }
  return Object.keys(result).length ? result : null
}

// 함대·유닛 성장(레벨업)·전직 가공용 순수함수 — ships.json의 growth/promotion 구조를 그대로 다룬다.
// (MOD-5) 로스터 인스턴스(state/useFleetStore)의 { level, xp, statGrowth, promoted }를
// ships.json 베이스 스탯과 합성해 "현재 실제 전투 스탯"을 계산하는 책임을 진다.

const STAT_KEYS = ['hp', 'atk', 'def', 'acc', 'eva']

// 장비(items.json의 mods)는 ships.json의 growth/promotion이 다루지 않는 mov까지 바꿀 수 있다
// (예: 부스터 엔진). 장착 보너스 적용 시에는 이 더 넓은 키 집합을 본다.
const EQUIP_STAT_KEYS = ['hp', 'atk', 'def', 'acc', 'eva', 'mov']

function emptyGrowth() {
  return { hp: 0, atk: 0, def: 0, acc: 0, eva: 0 }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// 해당 레벨에서 "다음 레벨"까지 필요한 누적 XP. ships.json의 growth.xpToNextLevel = { base, perLevel }.
export function xpToNextLevel(ship, level) {
  const curve = ship.growth?.xpToNextLevel
  if (!curve) return Infinity
  return curve.base + curve.perLevel * (level - 1)
}

// 격파한 적 함선들의 베이스 스탯(hp·atk)으로부터 전투 보상 XP를 계산한다 — 데이터에 없는 고정값 대신
// 실제로 마주친 적의 강함을 그대로 반영(강한 적을 잡을수록 더 많이 큼).
export function xpRewardForVictory(defeatedEnemyShips) {
  return defeatedEnemyShips.reduce((sum, ship) => sum + Math.round(ship.hp * 0.4 + ship.atk * 0.6), 0)
}

// xp를 가산하고, 임계치를 넘는 동안 반복해서 레벨업(레벨당 stat growth 1회 무작위 굴림 후 누적)한다.
// 입력 entry는 변경하지 않고 새 entry를 반환한다(순수함수) — levelsGained로 몇 레벨 올랐는지 알려준다.
export function applyXpGain(ship, entry, amount) {
  let level = entry.level
  let xp = entry.xp + amount
  const statGrowth = { ...emptyGrowth(), ...entry.statGrowth }
  let levelsGained = 0

  let next = xpToNextLevel(ship, level)
  while (xp >= next && Number.isFinite(next)) {
    xp -= next
    level += 1
    levelsGained += 1
    const ranges = ship.growth?.perLevelGain ?? {}
    for (const key of STAT_KEYS) {
      const range = ranges[key]
      if (range) statGrowth[key] += randInt(range[0], range[1])
    }
    next = xpToNextLevel(ship, level)
  }

  return { ...entry, level, xp, statGrowth, levelsGained }
}

// 전직 가능 여부 — 아직 전직하지 않았고, 데이터에 전직 정보가 있고, 레벨 조건을 만족하는지.
export function canPromote(ship, entry) {
  const promotion = ship.promotion
  if (!promotion || entry.promoted) return false
  return entry.level >= promotion.requireLevel
}

// 전직을 적용한 새 entry를 반환한다(순수함수). 조건 미충족 시 변경 없이 그대로 반환.
export function promoteUnit(ship, entry) {
  if (!canPromote(ship, entry)) return entry
  return { ...entry, promoted: true }
}

// 베이스 함선 데이터 + 누적 성장치 + 전직 보너스를 합성한 "현재 실전 스탯" 함선 객체를 만든다.
// id·sprite·role 등은 베이스를 유지(자산·AI 매핑 호환), name과 수치만 교체된다.
export function getEffectiveShip(ship, entry) {
  const promotion = ship.promotion
  const promoted = entry.promoted && promotion
  const stats = {}
  for (const key of STAT_KEYS) {
    const growthBonus = entry.statGrowth?.[key] ?? 0
    const promotionBonus = promoted ? promotion.statBonus?.[key] ?? 0 : 0
    stats[key] = ship[key] + growthBonus + promotionBonus
  }

  return {
    ...ship,
    ...stats,
    name: promoted ? promotion.name : ship.name,
    baseName: ship.name,
    level: entry.level,
    promoted: !!promoted,
  }
}

// entry.equipment(weapon/module)에 장착된 아이템의 mods를 효과 함선 스탯에 더한다(MOD-7).
// itemsById가 없거나 장착 슬롯이 비어 있으면 입력을 그대로 반환 — 순수 가산 합성이라 순서 무관.
export function applyEquipment(ship, entry, itemsById) {
  if (!itemsById) return ship
  const stats = {}
  for (const slot of ['weapon', 'module']) {
    const item = itemsById.get(entry.equipment?.[slot])
    if (!item?.mods) continue
    for (const key of EQUIP_STAT_KEYS) {
      const bonus = item.mods[key]
      if (bonus) stats[key] = (stats[key] ?? ship[key] ?? 0) + bonus
    }
  }
  return Object.keys(stats).length ? { ...ship, ...stats } : ship
}

// 유닛이 전투에서 쓸 수 있는 필살기 목록 — 에이스 고유 필살기(있다면) + 전직으로 해금한 함선 고유
// 필살기(전직했다면)를 합친 배열. 둘 다 있으면 함께 보유(서로 다른 출처의 "고유 필살기"이므로 대체가 아닌 추가).
export function getUnitFinishers({ ace, ship, entry, allSkills }) {
  const finishers = []
  if (ace?.finisher) {
    const aceFinisher = allSkills.find((skill) => skill.id === ace.finisher)
    if (aceFinisher) finishers.push({ skill: aceFinisher, source: 'ace', presenterName: ace.name, presenterPortrait: ace.portrait })
  }
  if (entry.promoted && ship.promotion?.unlockSkill) {
    const classFinisher = allSkills.find((skill) => skill.id === ship.promotion.unlockSkill)
    if (classFinisher) {
      finishers.push({ skill: classFinisher, source: 'class', presenterName: ship.promotion.name, presenterPortrait: ship.sprite })
    }
  }
  return finishers
}

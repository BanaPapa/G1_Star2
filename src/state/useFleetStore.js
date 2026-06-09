import { create } from 'zustand'
import { useDataStore } from './useDataStore'
import { useResourceStore } from './useResourceStore'
import { applyXpGain, canPromote, promoteUnit } from '../core/growth'

// 보유 함대 로스터 — ships.json의 "클래스 정의"와 별개로, 플레이어가 실제로 보유한 함선 인스턴스
// (레벨·누적 XP·성장치·전직 여부·배정 에이스·장착 장비)를 영구 보관한다(MOD-5, 장비는 MOD-7).
// 전투 결과(XP 획득)와 함대 편성 화면(전직·장착)이 모두 이 스토어를 갱신·조회한다.

const STARTING_ROSTER = [
  { instanceId: 'scout-1', shipId: 'scout', aceId: null },
  { instanceId: 'fighter-1', shipId: 'fighter', aceId: 'kai' },
  { instanceId: 'cruiser-1', shipId: 'cruiser', aceId: 'sera' },
]

function freshEntry({ instanceId, shipId, aceId }) {
  return {
    instanceId,
    shipId,
    aceId,
    level: 1,
    xp: 0,
    statGrowth: { hp: 0, atk: 0, def: 0, acc: 0, eva: 0 },
    promoted: false,
    equipment: { weapon: null, module: null },
  }
}

function getShipById(shipId) {
  const ships = useDataStore.getState().data?.ships?.ships ?? []
  return ships.find((ship) => ship.id === shipId) ?? null
}

// items.json은 weapons/modules/consumables/uniques 네 카테고리로 나뉘어 있다 — 장착 판정엔
// 카테고리 구분 없이 id로만 조회하면 된다(slot·fit·mods는 항목 자체에 있음).
function getItemById(itemId) {
  const items = useDataStore.getState().data?.items
  if (!items || !itemId) return null
  for (const category of ['weapons', 'modules', 'consumables', 'uniques']) {
    const found = (items[category] ?? []).find((item) => item.id === itemId)
    if (found) return found
  }
  return null
}

// 함선 클래스(shipId)가 아이템의 fit 목록에 맞는지 — fit이 없거나 "all"을 포함하면 모든 클래스 장착 가능.
function fitsClass(item, shipId) {
  if (!item.fit) return true
  return item.fit.includes('all') || item.fit.includes(shipId)
}

export const useFleetStore = create((set, get) => ({
  roster: STARTING_ROSTER.map(freshEntry),
  ownedItems: {}, // { itemId: count } — 구매·조합으로 늘어나는 보유 수량(MOD-7)

  // 전투 승리 보상 — instanceId 유닛에 XP를 가산하고 필요한 만큼 레벨업까지 처리한다.
  // 반환값: { levelsGained, level, xpGained } — 호출자(BattleScene)가 결과 메시지를 만들 때 사용.
  gainXp: (instanceId, amount) => {
    const entry = get().roster.find((e) => e.instanceId === instanceId)
    const ship = entry && getShipById(entry.shipId)
    if (!entry || !ship || amount <= 0) return null

    const { levelsGained, ...nextEntry } = applyXpGain(ship, entry, amount)
    set((state) => ({
      roster: state.roster.map((e) => (e.instanceId === instanceId ? nextEntry : e)),
    }))
    return { levelsGained, level: nextEntry.level, xpGained: amount }
  },

  // 전직 — 레벨 조건을 만족해야 적용된다(canPromote). 성공 여부를 반환.
  promote: (instanceId) => {
    const entry = get().roster.find((e) => e.instanceId === instanceId)
    const ship = entry && getShipById(entry.shipId)
    if (!entry || !ship || !canPromote(ship, entry)) return false

    set((state) => ({
      roster: state.roster.map((e) => (e.instanceId === instanceId ? promoteUnit(ship, e) : e)),
    }))
    return true
  },

  // 구매·조합으로 아이템을 보유 목록에 추가한다(자원 소비는 호출자가 useResourceStore로 먼저 처리).
  addItem: (itemId, count = 1) => {
    set((state) => ({
      ownedItems: { ...state.ownedItems, [itemId]: (state.ownedItems[itemId] ?? 0) + count },
    }))
  },

  // 함대 전체에서 해당 아이템을 장착 중인 수 — "보유 수량보다 많이 장착할 수 없다" 판정에 쓰인다.
  equippedCount: (itemId) => get().roster.filter((e) => e.equipment.weapon === itemId || e.equipment.module === itemId).length,

  // 장착 가능 여부 — slot 일치 + 함선 클래스 적합성(fit) + 여분 보유(같은 아이템을 이미 장착 중인
  // 다른 함선이 있어도, 보유 수량이 더 있다면 추가로 장착할 수 있다).
  canEquip: (itemId, instanceId, slot) => {
    const entry = get().roster.find((e) => e.instanceId === instanceId)
    const item = getItemById(itemId)
    if (!entry || !item || item.slot !== slot) return false
    if (!fitsClass(item, entry.shipId)) return false
    if (entry.equipment[slot] === itemId) return false // 이미 장착 중

    const owned = get().ownedItems[itemId] ?? 0
    const equippedElsewhere = get().equippedCount(itemId)
    return owned > equippedElsewhere
  },

  equip: (instanceId, slot, itemId) => {
    if (!get().canEquip(itemId, instanceId, slot)) return false
    set((state) => ({
      roster: state.roster.map((e) =>
        e.instanceId === instanceId ? { ...e, equipment: { ...e.equipment, [slot]: itemId } } : e,
      ),
    }))
    return true
  },

  unequip: (instanceId, slot) => {
    set((state) => ({
      roster: state.roster.map((e) =>
        e.instanceId === instanceId ? { ...e, equipment: { ...e.equipment, [slot]: null } } : e,
      ),
    }))
  },

  // 조선소 — 비용(sc)을 지불하고 함선을 새 인스턴스로 편성에 추가한다(MOD-9).
  buyShip: (shipId) => {
    const ship = getShipById(shipId)
    if (!ship) return false
    if (!useResourceStore.getState().spend({ sc: ship.cost })) return false
    const instanceId = `${shipId}-${Date.now()}`
    set((state) => ({ roster: [...state.roster, freshEntry({ instanceId, shipId, aceId: null })] }))
    return true
  },

  // MOD-10: 에이스 배정 — 해당 함선 인스턴스의 aceId를 교체한다(null 전달 시 배정 해제).
  assignAce: (instanceId, aceId) => {
    set((state) => ({
      roster: state.roster.map((e) => (e.instanceId === instanceId ? { ...e, aceId } : e)),
    }))
  },
}))

import { create } from 'zustand'
import { useDataStore } from './useDataStore'
import { useResourceStore } from './useResourceStore'
import { useBuildingStore } from './useBuildingStore'
import { useProgressStore } from './useProgressStore'
import { useResearchStore } from './useResearchStore'
import { getGameConfig } from './useGameConfigStore'
import { getEffectiveBuildingDef } from '../data/buildings'
import { applyXpGain, canPromote, promoteUnit } from '../core/growth'

// 보유 함대 로스터 — ships.json의 "클래스 정의"와 별개로, 플레이어가 실제로 보유한 함선 인스턴스
// (레벨·누적 XP·성장치·전직 여부·배정 에이스·장착 장비)를 영구 보관한다(MOD-5, 장비는 MOD-7).
// 전투 결과(XP 획득)와 함대 편성 화면(전직·장착)이 모두 이 스토어를 갱신·조회한다.

const STARTING_ROSTER = [
  { instanceId: 'gunship-1', shipId: 'gunship', aceId: null },
  { instanceId: 'frigate-1', shipId: 'frigate', aceId: 'kai' },
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
    equipment: { weapon: null, weapon2: null, module: null },
    currentShield: null,   // null = 최대치(전투 시작 시 초기화). number = 이전 전투 종료 시 남은 방어막.
    currentHp: null,       // 전투 간 HP 이월 (Phase 5-2) — null = 무손상(최대)
    currentArmorDur: null, // 전투 간 장갑 내구도 이월 — null = 무손상
    isCaptured: false,     // true = 투항 포획 함선
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

  removeFromRoster: (instanceId) => {
    set((state) => ({ roster: state.roster.filter((e) => e.instanceId !== instanceId) }))
  },

  // 전투 종료 시 상태 이월값 저장 (승리·도주 시 호출) — 방어막 + HP/장갑 내구도 (Phase 5-2).
  // map[instanceId] = { shield, hp, armorDur } (hp/armorDur는 damageCarryOver 켜졌을 때만 전달됨)
  saveBattleDamage: (map) => {
    set((state) => ({
      roster: state.roster.map((e) => {
        const d = map[e.instanceId]
        if (!d) return e
        return {
          ...e,
          currentShield: d.shield ?? e.currentShield,
          currentHp: d.hp !== undefined ? d.hp : e.currentHp,
          currentArmorDur: d.armorDur !== undefined ? d.armorDur : e.currentArmorDur,
        }
      }),
    }))
  },

  // 수리 적용 (Phase 5-2) — 비용 지불은 호출자(수리 패널)가 처리. 값은 호출자가 한도까지 계산해 전달.
  applyRepair: (instanceId, { hp, armorDur }) => {
    set((state) => ({
      roster: state.roster.map((e) =>
        e.instanceId === instanceId
          ? { ...e, currentHp: hp !== undefined ? hp : e.currentHp, currentArmorDur: armorDur !== undefined ? armorDur : e.currentArmorDur }
          : e,
      ),
    }))
  },

  // 투항 포획 함선 추가 — buyShip과 달리 비용 없이 레벨 1로 편성에 추가.
  addCapturedShip: ({ instanceId, shipId }) => {
    const entry = freshEntry({ instanceId, shipId, aceId: null })
    entry.isCaptured = true
    set((state) => ({ roster: [...state.roster, entry] }))
  },

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

  // 보유 중인 미장착 여분 아이템을 모항 상점 sellRate(환율)에 따라 SC로 되판다(MOD-12).
  sellItem: (itemId) => {
    const owned = get().ownedItems[itemId] ?? 0
    if (owned <= get().equippedCount(itemId)) return false // 장착 중인 것만 있으면 판매 불가

    const item = getItemById(itemId)
    if (!item?.price) return false // 소모품 중 price 없는 항목·유니크는 판매 대상 아님

    const shops = useDataStore.getState().data?.shops?.shops ?? []
    const sellRate = shops.find((s) => s.type === 'base')?.sellRate ?? 0.6

    set((state) => ({ ownedItems: { ...state.ownedItems, [itemId]: owned - 1 } }))
    useResourceStore.getState().earn({ sc: Math.floor(item.price * sellRate) })
    return true
  },

  // 함대 전체에서 해당 아이템을 장착 중인 수 — "보유 수량보다 많이 장착할 수 없다" 판정에 쓰인다.
  equippedCount: (itemId) => get().roster.filter((e) =>
    e.equipment.weapon === itemId || e.equipment.weapon2 === itemId || e.equipment.module === itemId
  ).length,

  // 장착 가능 여부 — slot 일치 + 함선 클래스 적합성(fit) + 여분 보유(같은 아이템을 이미 장착 중인
  // 다른 함선이 있어도, 보유 수량이 더 있다면 추가로 장착할 수 있다).
  // weapon2 슬롯은 무기 아이템(item.slot === 'weapon')을 장착할 수 있다.
  canEquip: (itemId, instanceId, slot) => {
    const entry = get().roster.find((e) => e.instanceId === instanceId)
    const item = getItemById(itemId)
    const effectiveSlot = slot === 'weapon2' ? 'weapon' : slot
    if (!entry || !item || item.slot !== effectiveSlot) return false
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

  // 조선소 건조 게이트 (Phase 5-1) — 사유를 함께 반환해 UI가 안내문을 만들 수 있게 한다.
  // { ok, reason: 'unknown'|'unlock'|'shipyard_level'|'fleet_cap'|'cost'|null, requiredLevel?, cap?, unlockLabel? }
  canBuyShip: (shipId) => {
    const ship = getShipById(shipId)
    if (!ship) return { ok: false, reason: 'unknown' }
    const config = getGameConfig()

    // 시나리오 해금 (ships.json unlock: progress:노드 / research:연구) — 볼륨 진행 게이트 유지
    const unlock = ship.unlock
    if (unlock && unlock !== 'start') {
      const [kind, id] = unlock.split(':')
      if (kind === 'progress' && !useProgressStore.getState().conqueredNodeIds.includes(id)) {
        return { ok: false, reason: 'unlock', unlockLabel: `${id} 별계 정복 필요` }
      }
      if (kind === 'research' && !useResearchStore.getState().unlockedIds.includes(id)) {
        return { ok: false, reason: 'unlock', unlockLabel: `연구 "${id}" 필요` }
      }
    }

    // 조선소 레벨별 함급 제한 — 조선소는 모항 건물이므로 모항 레벨 기준
    const homeId = useDataStore.getState().data?.systems?.systems?.find((n) => n.role === 'home')?.id ?? 's0'
    const yardLevel = useBuildingStore.getState().getLevel(homeId, 'bld_shipyard')
    const requiredLevel = config?.economy?.shipyard?.classUnlockLevel?.[shipId] ?? 1
    if (yardLevel < requiredLevel) return { ok: false, reason: 'shipyard_level', requiredLevel }

    // 함대 정원 — 사령부(Command Center) 레벨의 fleetCap (buildings.js)
    const ccDef = getEffectiveBuildingDef('bld_command_center', config)
    const ccLevel = useBuildingStore.getState().getLevel(homeId, 'bld_command_center')
    const cap = ccDef?.fleetCap?.[ccLevel] ?? 2
    if (get().roster.length >= cap) return { ok: false, reason: 'fleet_cap', cap }

    if (!useResourceStore.getState().canAfford({ sc: ship.cost })) return { ok: false, reason: 'cost' }
    return { ok: true, reason: null, cap }
  },

  // 조선소 — 게이트 통과 시 비용(sc)을 지불하고 함선을 새 인스턴스로 편성에 추가한다(MOD-9 → Phase 5-1 게이팅).
  buyShip: (shipId) => {
    if (!get().canBuyShip(shipId).ok) return false
    const ship = getShipById(shipId)
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

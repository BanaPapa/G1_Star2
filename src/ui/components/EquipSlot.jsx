import { useFleetStore } from '../../state/useFleetStore'
import AssetImage from './AssetImage'

const STAT_LABELS = { hp: 'HP', atk: 'ATK', def: 'DEF', acc: 'ACC', eva: 'EVA', mov: 'MOV' }
const SLOT_LABELS = { weapon: '⚔️ 무기', module: '🧩 모듈' }

function formatMods(mods) {
  const parts = Object.entries(mods ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${STAT_LABELS[key] ?? key} ${value > 0 ? '+' : ''}${value}`)
  return parts.length ? parts.join(' · ') : null
}

// 함대 카드 한 슬롯(weapon|module)의 장착 상태 표시 + 변경 셀렉터(MOD-7).
// useFleetStore.canEquip으로 "보유했고 함급에 맞고 여분이 있는" 후보만 골라 보여준다 —
// 이 컴포넌트는 무엇이 장착 가능한지 스스로 판단하지 않고 스토어 판정을 그대로 따른다.
export default function EquipSlot({ entry, slot, itemsById, ownedItems }) {
  const equip = useFleetStore((s) => s.equip)
  const unequip = useFleetStore((s) => s.unequip)
  const canEquip = useFleetStore((s) => s.canEquip)

  const equippedId = entry.equipment?.[slot] ?? null
  const equippedItem = equippedId ? itemsById.get(equippedId) : null

  const candidateIds = Object.keys(ownedItems).filter(
    (itemId) => (ownedItems[itemId] ?? 0) > 0 && canEquip(itemId, entry.instanceId, slot),
  )
  const optionIds = equippedId && !candidateIds.includes(equippedId) ? [equippedId, ...candidateIds] : candidateIds

  function handleChange(event) {
    const value = event.target.value
    if (value === '') unequip(entry.instanceId, slot)
    else equip(entry.instanceId, slot, value)
  }

  return (
    <div className="equip-slot">
      <span className="equip-slot-label">{SLOT_LABELS[slot]}</span>
      <span className="equip-slot-current">
        {equippedItem ? (
          <>
            <AssetImage assetKey={equippedItem.icon} alt={equippedItem.name} className="equip-slot-icon" />
            <span className="equip-slot-name">{equippedItem.name}</span>
            {formatMods(equippedItem.mods) && <span className="equip-slot-mods">{formatMods(equippedItem.mods)}</span>}
          </>
        ) : (
          <span className="equip-slot-empty">미장착</span>
        )}
      </span>
      <select className="equip-slot-select" value={equippedId ?? ''} onChange={handleChange}>
        <option value="">— 해제 —</option>
        {optionIds.map((itemId) => (
          <option key={itemId} value={itemId}>
            {itemsById.get(itemId)?.name ?? itemId}
          </option>
        ))}
      </select>
    </div>
  )
}

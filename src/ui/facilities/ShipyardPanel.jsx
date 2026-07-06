// 조선소 시설 패널 (Phase 5-1) — 함선 건조. 조선소 건물이 있는 장소(모항)에서만 열린다.
// 함급 해금 = 조선소 레벨 (config economy.shipyard.classUnlockLevel), 정원 = 사령부 fleetCap.
// 게이트 판정은 useFleetStore.canBuyShip이 담당 — 이 패널은 표시와 호출만 한다.
import { useDataStore } from '../../state/useDataStore'
import { useFleetStore } from '../../state/useFleetStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { getEffectiveBuildingDef } from '../../data/buildings'
import AssetImage from '../components/AssetImage'

export default function ShipyardPanel({ nodeId }) {
  const ships = useDataStore((s) => s.data?.ships?.ships)
  const roster = useFleetStore((s) => s.roster)
  const buyShip = useFleetStore((s) => s.buyShip)
  const canBuyShip = useFleetStore((s) => s.canBuyShip)
  const wallet = useResourceStore((s) => s.wallet)
  const getLevel = useBuildingStore((s) => s.getLevel)
  useBuildingStore((s) => s.buildings)
  const config = useGameConfigStore((s) => s.config)

  if (!ships) return null

  const yardLevel = getLevel(nodeId, 'bld_shipyard')
  const ccLevel = getLevel(nodeId, 'bld_command_center')
  const ccDef = getEffectiveBuildingDef('bld_command_center', config)
  const fleetCap = ccDef?.fleetCap?.[ccLevel] ?? 2
  const unlockMap = config?.economy?.shipyard?.classUnlockLevel ?? {}
  const fleetFull = roster.length >= fleetCap

  return (
    <div className="hub-shop">
      <h3 className="hub-shop-name">🚀 조선소 Lv.{yardLevel}</h3>
      <p className="hub-card-meta">
        함대 {roster.length} / {fleetCap}척 (사령부 Lv.{ccLevel})
        {fleetFull ? ' — 정원이 가득 찼습니다. 사령부를 업그레이드하세요.' : ''}
        {' · '}조선소 레벨을 올리면 더 큰 함급을 건조할 수 있습니다 (건물 탭).
      </p>
      <div className="hub-grid">
        {ships.map((ship) => {
          const requiredLevel = unlockMap[ship.id] ?? 1
          const gate = canBuyShip(ship.id)
          const owned = roster.filter((e) => e.shipId === ship.id).length
          const statusText = gate.ok
            ? `🏭 건조 — 💳 ${ship.cost} SC`
            : gate.reason === 'unlock'
              ? `🔒 ${gate.unlockLabel}`
              : gate.reason === 'shipyard_level'
                ? `🔒 조선소 Lv.${requiredLevel} 필요 (현재 Lv.${yardLevel})`
                : gate.reason === 'fleet_cap'
                  ? `⚠ 함대 정원 초과 (${roster.length}/${fleetCap})`
                  : `⚠ SC 부족 (필요 ${ship.cost}, 보유 ${wallet.sc ?? 0})`
          const locked = gate.reason === 'unlock' || gate.reason === 'shipyard_level'
          return (
            <div key={ship.id} className={`hub-card${locked ? ' hub-card--locked' : ''}`}>
              <div className="hub-card-head">
                <AssetImage assetKey={ship.sprite} alt={ship.name} className="hub-item-icon" />
                <div>
                  <h4 className="hub-card-title">{ship.name}</h4>
                  <p className="hub-card-meta">{ship.role} · 보유 {owned}척</p>
                </div>
              </div>
              <p className="hub-card-meta">
                HP {ship.hp} · ATK {ship.atk} · DEF {ship.def} · MOV {ship.mov}
                {' · '}💳 {ship.cost} SC
                {' · '}해금: 조선소 Lv.{requiredLevel}
              </p>
              <button className="hub-action-btn" disabled={!gate.ok} onClick={() => buyShip(ship.id)}>
                {statusText}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

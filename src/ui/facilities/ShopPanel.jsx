// 상점 시설 패널 — 상점 시설이 있는 장소에서만 열린다 (스펙 §2).
// 본문은 구 MaintenanceHubScreen의 ShopTab을 그대로 옮긴 것.
import { useResearchStore } from '../../state/useResearchStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useFleetStore } from '../../state/useFleetStore'
import AssetImage from '../components/AssetImage'
import { useFacilityData } from './common'

function ShopTab({ shops, itemsById }) {
  const isUnlocked = useResearchStore((s) => s.isUnlocked)
  useResourceStore((s) => s.wallet) // 지갑 변동 시 재렌더되어야 canAfford 결과가 최신으로 반영된다
  const canAfford = useResourceStore((s) => s.canAfford)
  const spend = useResourceStore((s) => s.spend)
  const addItem = useFleetStore((s) => s.addItem)
  const ownedItems = useFleetStore((s) => s.ownedItems)
  const equippedCount = useFleetStore((s) => s.equippedCount)
  const sellItem = useFleetStore((s) => s.sellItem)

  const homeShop = shops.find((s) => s.type === 'base')
  const otherShops = shops.filter((s) => s.type !== 'base')

  const expandedIds = (homeShop?.expands ?? [])
    .filter((expansion) => isUnlocked(expansion.unlockedBy))
    .flatMap((expansion) => expansion.add)
  const inventoryIds = [...new Set([...(homeShop?.inventory ?? []), ...expandedIds])]
  const sellRate = homeShop?.sellRate ?? 0.6

  // 보유 수량 중 장착되지 않은 여분 — sellRate(환율)로 SC 환전 가능한 항목만 표시.
  const sellableEntries = Object.entries(ownedItems)
    .map(([itemId, count]) => ({ itemId, item: itemsById.get(itemId), spare: count - equippedCount(itemId) }))
    .filter(({ item, spare }) => item?.price && spare > 0)

  function buy(itemId, price) {
    if (!spend({ sc: price })) return
    addItem(itemId)
  }

  return (
    <div className="hub-shop">
      <h3 className="hub-shop-name">{homeShop?.name}</h3>
      <p className="hub-card-meta">{homeShop?.note}</p>
      <div className="hub-grid">
        {inventoryIds.map((itemId) => {
          const item = itemsById.get(itemId)
          if (!item) return null
          const price = Math.round((item.price ?? 0) * (homeShop?.priceMultiplier ?? 1))
          const affordable = canAfford({ sc: price })
          return (
            <div key={itemId} className="hub-card">
              <div className="hub-card-head">
                <AssetImage assetKey={item.icon} alt={item.name} className="hub-item-icon" />
                <div>
                  <h4 className="hub-card-title">{item.name}</h4>
                  <p className="hub-card-meta">
                    {item.slot === 'weapon' ? '⚔️ 무기' : '🧩 모듈'}
                    {item.extra ? ` · ${item.extra}` : ''}
                    {item.fit ? ` · 장착: ${item.fit.includes('all') ? '전 함급' : item.fit.join(', ')}` : ''}
                  </p>
                </div>
              </div>
              <p className="hub-card-meta">
                가격: <span className={affordable ? '' : 'hub-cost--short'}>💳 {price} SC</span>
                {' · '}보유 {ownedItems[itemId] ?? 0}개
              </p>
              <button className="hub-action-btn" disabled={!affordable} onClick={() => buy(itemId, price)}>
                {affordable ? '🛒 구매' : '⚠ 자원 부족'}
              </button>
            </div>
          )
        })}
      </div>

      {sellableEntries.length > 0 && (
        <>
          <h3 className="hub-shop-name">보유 장비 판매 (환율 {Math.round(sellRate * 100)}%)</h3>
          <div className="hub-grid">
            {sellableEntries.map(({ itemId, item, spare }) => {
              const sellPrice = Math.floor(item.price * sellRate)
              return (
                <div key={itemId} className="hub-card">
                  <div className="hub-card-head">
                    <AssetImage assetKey={item.icon} alt={item.name} className="hub-item-icon" />
                    <div>
                      <h4 className="hub-card-title">{item.name}</h4>
                      <p className="hub-card-meta">여분 {spare}개</p>
                    </div>
                  </div>
                  <p className="hub-card-meta">판매가: 💳 {sellPrice} SC</p>
                  <button className="hub-action-btn" onClick={() => sellItem(itemId)}>
                    💰 판매
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {otherShops.map((shop) => (
        <div key={shop.id} className="hub-locked-shop">
          <h4 className="hub-card-title">🔒 {shop.name}</h4>
          <p className="hub-card-meta">{shop.unlockCondition ? `해금 조건: ${shop.unlockCondition}` : shop.note}</p>
        </div>
      ))}
    </div>
  )
}

export default function ShopPanel() {
  const data = useFacilityData()
  if (!data) return null
  return <ShopTab shops={data.shops} itemsById={data.itemsById} />
}

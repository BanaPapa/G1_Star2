import { useResourceStore } from '../../state/useResourceStore'
import { useFleetStore } from '../../state/useFleetStore'
import AssetImage from './AssetImage'
import './EventModal.css'

// 이벤트 결과(자원·평화·정찰·특수) 및 상점(떠돌이 상인·유령 시장)을 표시하는 팝업 모달(MOD-10)
// props:
//   title: string — 이벤트 제목
//   body: string  — 설명 텍스트 (줄바꿈 포함 가능)
//   shop: null | { id, name, inventory, priceMultiplier } — 상점 데이터가 있으면 구매 UI 표시
//   itemsById: Map<id, item>
//   onClose: () => void

export default function EventModal({ title, body, shop, itemsById, onClose }) {
  const canAfford = useResourceStore((s) => s.canAfford)
  const spend = useResourceStore((s) => s.spend)
  const addItem = useFleetStore((s) => s.addItem)
  const ownedItems = useFleetStore((s) => s.ownedItems)
  useResourceStore((s) => s.wallet) // 지갑 변동 시 재렌더

  function buy(itemId, price) {
    if (!spend({ sc: price })) return
    addItem(itemId)
  }

  return (
    <div className="event-overlay" onClick={onClose}>
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="event-modal-title">{title}</h3>
        <p className="event-modal-body" style={{ whiteSpace: 'pre-line' }}>{body}</p>

        {shop && (
          <div className="event-shop">
            <h4 className="event-shop-name">{shop.name}</h4>
            <div className="event-shop-grid">
              {(shop.inventory ?? []).map((itemId) => {
                const item = itemsById.get(itemId)
                if (!item) return null
                const price = Math.round((item.price ?? 0) * (shop.priceMultiplier ?? 1))
                const affordable = canAfford({ sc: price })
                return (
                  <div key={itemId} className="event-shop-card">
                    <div className="event-shop-head">
                      <AssetImage assetKey={item.icon} alt={item.name} className="event-shop-icon" />
                      <div>
                        <p className="event-shop-item-name">{item.name}</p>
                        <p className="event-shop-item-meta">
                          {item.slot === 'weapon' ? '⚔️ 무기' : item.slot === 'module' ? '🧩 모듈' : '🧪 소모품'}
                          {item.extra ? ` · ${item.extra}` : ''}
                          {item.fit ? ` · 장착: ${item.fit.includes('all') ? '전 함급' : item.fit.join(', ')}` : ''}
                        </p>
                      </div>
                    </div>
                    <p className="event-shop-item-price">
                      <span className={affordable ? '' : 'event-cost--short'}>💳 {price} SC</span>
                      {' · '}보유 {ownedItems[itemId] ?? 0}개
                    </p>
                    <button
                      className="event-shop-btn"
                      disabled={!affordable}
                      onClick={() => buy(itemId, price)}
                    >
                      {affordable ? '🛒 구매' : '⚠ 자원 부족'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <button className="event-modal-close-btn" onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  )
}

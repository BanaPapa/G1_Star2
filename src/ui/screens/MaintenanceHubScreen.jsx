import { useState } from 'react'
import { useDataStore } from '../../state/useDataStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useResearchStore } from '../../state/useResearchStore'
import { useFleetStore } from '../../state/useFleetStore'
import { useDevelopmentStore } from '../../state/useDevelopmentStore'
import AssetImage from '../components/AssetImage'
import './MaintenanceHubScreen.css'

const TABS = [
  { id: 'research', label: '🔬 연구' },
  { id: 'shop', label: '🛒 상점' },
  { id: 'craft', label: '🔧 조합' },
]

function formatCost(cost, resourcesById) {
  return Object.entries(cost ?? {})
    .map(([key, amount]) => `${resourcesById.get(key)?.name ?? key} ${amount}`)
    .join(' · ')
}

// research.json의 unlock 항목은 "craft:id"/"feature:key"/"buff:key"/"ship:id" 같은 접두 표기와
// 일반 아이템 id가 섞여 있다 — 표시용으로 의미를 풀어 보여준다(데이터 자체엔 표시명이 없는 추상 키 포함).
function describeUnlock(key, { itemsById, shipsById }) {
  const [prefix, rest] = key.includes(':') ? key.split(':') : [null, key]
  if (prefix === 'craft') return `🔧 조합 레시피 해금 — ${itemsById.get(rest)?.name ?? rest}`
  if (prefix === 'feature') return `✨ 기능 해금 — ${rest.replace(/_/g, ' ')}`
  if (prefix === 'buff') return `📈 함대 버프 — ${rest.replace(/_/g, ' ')}`
  if (prefix === 'ship') return `🚀 함선 해금 — ${shipsById.get(rest)?.name ?? rest}`
  const item = itemsById.get(key)
  return item ? `📦 ${item.name} (${item.slot === 'weapon' ? '무기' : '모듈'})` : key
}

function ResourceBar({ resources, wallet }) {
  return (
    <div className="hub-wallet">
      {resources.map((r) => (
        <span key={r.id} className="hub-wallet-chip">
          <AssetImage assetKey={r.icon} alt={r.name} className="hub-wallet-icon" />
          {r.name} <b>{wallet[r.id] ?? 0}</b>
        </span>
      ))}
    </div>
  )
}

function ResearchTab({ research, resourcesById, itemsById, shipsById }) {
  const isUnlocked = useResearchStore((s) => s.isUnlocked)
  const canUnlock = useResearchStore((s) => s.canUnlock)
  const canAffordUnlock = useResearchStore((s) => s.canAffordUnlock)
  const unlock = useResearchStore((s) => s.unlock)
  useResourceStore((s) => s.wallet) // 지갑 변동 시 재렌더
  const isDeveloped = useDevelopmentStore((s) => s.isDeveloped)
  useDevelopmentStore((s) => s.developed) // 개발 상태 변경 시 재렌더
  const s3Boost = isDeveloped('s3')
  const researchById = new Map(research.map((n) => [n.id, n]))

  return (
    <div className="hub-grid">
      {research.map((node) => {
        const unlocked = isUnlocked(node.id)
        const prereqNames = (node.prereq ?? []).map((id) => researchById.get(id)?.name ?? id)
        const prereqMet = (node.prereq ?? []).every((id) => isUnlocked(id))
        const devReqMet = !node.devReq || isDeveloped(node.devReq)
        const affordable = canAffordUnlock(node)
        const canUnlockNow = canUnlock(node) && affordable

        return (
          <div key={node.id} className={`hub-card${unlocked ? ' hub-card--done' : ''}`}>
            <h4 className="hub-card-title">
              {unlocked ? '✅' : prereqMet ? '🔬' : '🔒'} {node.name}
            </h4>
            {prereqNames.length > 0 && (
              <p className="hub-card-meta">선행 연구: {prereqNames.join(', ')}{!prereqMet ? ' (미충족)' : ''}</p>
            )}
            {node.devReq && (
              <p className="hub-card-meta">
                개발 조건: {node.devReq} 별계 개발
                {devReqMet ? ' ✅' : ' 🔒 (미완료)'}
              </p>
            )}
            <p className="hub-card-meta">
              비용: <span className={affordable ? '' : 'hub-cost--short'}>{formatCost(node.cost, resourcesById)}</span>
              {s3Boost && <span style={{ color: '#7cffb2', marginLeft: 6 }}>(-25% 할인 적용)</span>}
            </p>
            <ul className="hub-card-unlocks">
              {node.unlock.map((key) => (
                <li key={key}>{describeUnlock(key, { itemsById, shipsById })}</li>
              ))}
            </ul>
            {unlocked ? (
              <span className="hub-status hub-status--done">해금 완료</span>
            ) : (
              <button className="hub-action-btn" disabled={!canUnlockNow} onClick={() => unlock(node)}>
                {!prereqMet ? '🔒 선행 연구 필요'
                  : !devReqMet ? `🔒 ${node.devReq} 별계 개발 필요`
                  : affordable ? '🔬 연구 해금'
                  : '⚠ 자원 부족'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ShopTab({ shops, itemsById }) {
  const isUnlocked = useResearchStore((s) => s.isUnlocked)
  useResourceStore((s) => s.wallet) // 지갑 변동 시 재렌더되어야 canAfford 결과가 최신으로 반영된다
  const canAfford = useResourceStore((s) => s.canAfford)
  const spend = useResourceStore((s) => s.spend)
  const addItem = useFleetStore((s) => s.addItem)
  const ownedItems = useFleetStore((s) => s.ownedItems)

  const homeShop = shops.find((s) => s.type === 'base')
  const otherShops = shops.filter((s) => s.type !== 'base')

  const expandedIds = (homeShop?.expands ?? [])
    .filter((expansion) => isUnlocked(expansion.unlockedBy))
    .flatMap((expansion) => expansion.add)
  const inventoryIds = [...new Set([...(homeShop?.inventory ?? []), ...expandedIds])]

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

      {otherShops.map((shop) => (
        <div key={shop.id} className="hub-locked-shop">
          <h4 className="hub-card-title">🔒 {shop.name}</h4>
          <p className="hub-card-meta">{shop.unlockCondition ? `해금 조건: ${shop.unlockCondition}` : shop.note}</p>
        </div>
      ))}
    </div>
  )
}

function CraftTab({ recipes, research, itemsById, resourcesById }) {
  const isUnlocked = useResearchStore((s) => s.isUnlocked)
  useResourceStore((s) => s.wallet) // 지갑 변동 시 재렌더되어야 canAfford 결과가 최신으로 반영된다
  const canAfford = useResourceStore((s) => s.canAfford)
  const spend = useResourceStore((s) => s.spend)
  const addItem = useFleetStore((s) => s.addItem)
  const ownedItems = useFleetStore((s) => s.ownedItems)
  const researchById = new Map(research.map((n) => [n.id, n]))

  if (!recipes.length) {
    return <p className="hub-card-meta">아직 해금된 조합 레시피가 없습니다 — 연구 탭에서 관련 기술을 해금해보세요.</p>
  }

  function craft(recipe) {
    if (!spend(recipe.materials)) return
    addItem(recipe.result)
  }

  return (
    <div className="hub-grid">
      {recipes.map((recipe) => {
        const result = itemsById.get(recipe.result)
        const requirementMet = !recipe.requires || isUnlocked(recipe.requires)
        const affordable = canAfford(recipe.materials)
        const canCraft = requirementMet && affordable
        return (
          <div key={recipe.id} className="hub-card">
            <div className="hub-card-head">
              {result && <AssetImage assetKey={result.icon} alt={result.name} className="hub-item-icon" />}
              <div>
                <h4 className="hub-card-title">{recipe.name}</h4>
                <p className="hub-card-meta">
                  결과물: {result?.name ?? recipe.result}
                  {result?.extra ? ` (${result.extra})` : ''}
                  {' · '}보유 {ownedItems[recipe.result] ?? 0}개
                </p>
              </div>
            </div>
            {recipe.requires && (
              <p className="hub-card-meta">
                필요 연구: {researchById.get(recipe.requires)?.name ?? recipe.requires}
                {!requirementMet ? ' (미해금)' : ''}
              </p>
            )}
            <p className="hub-card-meta">
              재료: <span className={affordable ? '' : 'hub-cost--short'}>{formatCost(recipe.materials, resourcesById)}</span>
            </p>
            {recipe.note && <p className="hub-card-meta">{recipe.note}</p>}
            <button className="hub-action-btn" disabled={!canCraft} onClick={() => craft(recipe)}>
              {!requirementMet ? '🔒 연구 필요' : affordable ? '🔧 제작' : '⚠ 재료 부족'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function MaintenanceHubScreen() {
  const [tab, setTab] = useState('research')

  const research = useDataStore((s) => s.data?.research?.research)
  const items = useDataStore((s) => s.data?.items)
  const shops = useDataStore((s) => s.data?.shops?.shops)
  const resources = useDataStore((s) => s.data?.resources?.resources)
  const ships = useDataStore((s) => s.data?.ships?.ships)
  const wallet = useResourceStore((s) => s.wallet)

  if (!research || !items || !shops || !resources || !ships) return null

  const resourcesById = new Map(resources.map((r) => [r.id, r]))
  const shipsById = new Map(ships.map((s) => [s.id, s]))
  const itemsById = new Map(['weapons', 'modules', 'consumables', 'uniques'].flatMap((cat) => items[cat] ?? []).map((i) => [i.id, i]))

  return (
    <div className="hub-screen">
      <ResourceBar resources={resources} wallet={wallet} />

      <div className="hub-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`hub-tab-btn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'research' && (
        <ResearchTab research={research} resourcesById={resourcesById} itemsById={itemsById} shipsById={shipsById} />
      )}
      {tab === 'shop' && <ShopTab shops={shops} itemsById={itemsById} />}
      {tab === 'craft' && (
        <CraftTab recipes={items.recipes ?? []} research={research} itemsById={itemsById} resourcesById={resourcesById} />
      )}
    </div>
  )
}

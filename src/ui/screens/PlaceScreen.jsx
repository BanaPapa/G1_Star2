import { useEffect, useState } from 'react'
import { useDataStore } from '../../state/useDataStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { getPlaceFacilities } from '../../data/placeFacilities'
import { pickBark } from '../../state/useStoryStore'
import ResearchPanel from '../facilities/ResearchPanel'
import ShopPanel from '../facilities/ShopPanel'
import CraftPanel from '../facilities/CraftPanel'
import BuildPanel from '../facilities/BuildPanel'
import ShipyardPanel from '../facilities/ShipyardPanel'
import RepairPanel from '../facilities/RepairPanel'
import './PlaceScreen.css'

const FACILITY_LABEL = {
  build:    '🏗️ 건물',
  research: '🔬 연구',
  shop:     '🛒 상점',
  craft:    '🔧 조합',
  shipyard: '🚀 조선소',
  repair:   '🛠️ 수리',
}


export default function PlaceScreen({ placeId, onExit }) {
  const systems = useDataStore((s) => s.data?.systems?.systems)
  const conqueredNodeIds = useProgressStore((s) => s.conqueredNodeIds)
  const getLevel = useBuildingStore((s) => s.getLevel)
  useBuildingStore((s) => s.buildings) // 건물 레벨 변화 시 시설 탭 재계산
  const initOutpost = useBuildingStore((s) => s.initOutpost)
  const config = useGameConfigStore((s) => s.config)
  const [tab, setTab] = useState(null)

  const aces = useDataStore((s) => s.data?.aces?.aces)

  const node = systems?.find((s) => s.id === placeId)
  const isHome = node?.role === 'home'
  const isConquered = conqueredNodeIds.includes(placeId)

  // 입항 소품 대화 (Phase 6-6) — 입항(마운트) 시 1회 확률 판정, 영입된 에이스만 화자 후보
  const [dockBark] = useState(() =>
    pickBark('dock', useProgressStore.getState().recruitedAces, config?.story?.barkChance ?? 0.4),
  )

  // 점령 행성 입항 시 아웃포스트 Lv1 자동 생성 (구 PlanetManagementScreen 동작 유지)
  useEffect(() => {
    if (node && !isHome && isConquered) initOutpost(placeId)
  }, [node, isHome, isConquered, placeId, initOutpost])

  // 존재하지 않거나 입항 불가한 장소 → 안내 후 출항 (스펙 §4 에러 처리)
  if (!node || (!isHome && !isConquered)) {
    return (
      <div className="place-screen hub-screen">
        <p className="hub-card-meta">⚠ 입항할 수 없는 장소입니다.</p>
        <button className="place-exit-btn" onClick={onExit}>🚀 출항 — 성단 맵</button>
      </div>
    )
  }

  const facilities = getPlaceFacilities(node, getLevel, config)
  const activeTab = facilities.includes(tab) ? tab : facilities[0] ?? null

  return (
    <div className="place-screen hub-screen">
      <header className="place-header">
        <div className="place-title">
          <span className="place-icon">{isHome ? '🏠' : '🪐'}</span>
          <div>
            <h2 className="place-name">{node.name}</h2>
            <p className="place-meta">
              {isHome ? '모항 정거장' : '점령 행성'}
              {node.theme ? ` · ${node.theme}` : ''}
            </p>
          </div>
        </div>
        <button className="place-exit-btn" onClick={onExit}>🚀 출항 — 성단 맵</button>
      </header>

      {dockBark && (
        <div className="place-bark">
          {dockBark.map((line, i) => {
            const name = aces?.find((a) => a.id === line.speaker)?.name ?? line.speaker
            return <p key={i}>💬 <strong>{name}</strong> — “{line.text}”</p>
          })}
        </div>
      )}

      <div className="hub-tabs">
        {facilities.map((f) => (
          <button
            key={f}
            className={`hub-tab-btn${activeTab === f ? ' active' : ''}`}
            onClick={() => setTab(f)}
          >
            {FACILITY_LABEL[f] ?? f}
          </button>
        ))}
      </div>

      {activeTab === 'build' && <BuildPanel nodeId={placeId} isHome={isHome} />}
      {activeTab === 'research' && <ResearchPanel nodeId={placeId} />}
      {activeTab === 'shop' && <ShopPanel />}
      {activeTab === 'craft' && <CraftPanel nodeId={placeId} />}
      {activeTab === 'shipyard' && <ShipyardPanel nodeId={placeId} />}
      {activeTab === 'repair' && (
        <RepairPanel
          capPct={config?.economy?.repair?.outpostCapByLevel?.[getLevel(placeId, 'bld_outpost')] ?? 0.5}
          facilityName={`아웃포스트 간이수리 Lv.${getLevel(placeId, 'bld_outpost')}`}
        />
      )}
    </div>
  )
}

// 개발자 설정 관제실 (System Control Room) — 전투 v1.0 모든 수치/규칙을 게임 안에서 조정한다(요청서 26·27장).
// 단순 옵션 모달이 아니라 데이터 주도 밸런스 도구. localStorage 저장 + JSON Export/Import.
import { useState } from 'react'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { useDataStore } from '../../state/useDataStore'
import { BUILDINGS } from '../../data/buildings'
import SchemaTab from './tabs/SchemaTab'
import ShipStatsTab from './tabs/ShipStatsTab'
import WeaponStatsTab from './tabs/WeaponStatsTab'
import OverrideTab from './tabs/OverrideTab'
import DebugExportTab from './tabs/DebugExportTab'
import BattleMapEditorTab from './tabs/BattleMapEditorTab'
import PriorityResolver from './PriorityResolver'
import {
  COMBAT_RULES_SCHEMA, TERRAIN_RULES_SCHEMA, ATTACK_RULES_SCHEMA, DAMAGE_RULES_SCHEMA,
  DEFENSE_OVERWATCH_SCHEMA, RETREAT_NEGOTIATION_SCHEMA, FIELD_EFFECTS_SCHEMA,
} from './tabSchemas'
import './SystemControlRoom.css'

const TABS = [
  { id: 'combat',   label: 'Combat Rules' },
  { id: 'terrain',  label: 'Terrain Rules' },
  { id: 'attack',   label: 'Attack Rules' },
  { id: 'damage',   label: 'Damage Rules' },
  { id: 'defense',  label: 'Defense / Overwatch' },
  { id: 'retreat',  label: 'Retreat / Negotiation' },
  { id: 'ship',     label: 'Ship Stats' },
  { id: 'weapon',   label: 'Weapon Stats' },
  { id: 'field',    label: 'Field Effects' },
  { id: 'building', label: 'Building Costs' },
  { id: 'research', label: 'Research Costs' },
  { id: 'resource', label: 'Resource Settings' },
  { id: 'enemy',    label: 'Enemy Scaling' },
  { id: 'priority', label: 'Priority Resolver' },
  { id: 'mapeditor',label: 'Battle Map Editor' },
  { id: 'debug',    label: 'Debug / Export' },
]

export default function SystemControlRoom({ onClose, inBattle, initialTab = 'combat' }) {
  const [tab, setTab] = useState(initialTab)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const dirty = useGameConfigStore((s) => s.dirty)
  const pendingScope = useGameConfigStore((s) => s.pendingScope)
  const save = useGameConfigStore((s) => s.save)
  const resetAll = useGameConfigStore((s) => s.resetAll)
  const exportJson = useGameConfigStore((s) => s.exportJson)
  const applyToCurrentBattle = useGameConfigStore((s) => s.applyToCurrentBattle)
  const applyNextBattleOnly = useGameConfigStore((s) => s.applyNextBattleOnly)

  const data = useDataStore((s) => s.data)

  function renderTab() {
    switch (tab) {
      case 'combat':   return <SchemaTab schema={COMBAT_RULES_SCHEMA} />
      case 'terrain':  return <SchemaTab schema={TERRAIN_RULES_SCHEMA} />
      case 'attack':   return <SchemaTab schema={ATTACK_RULES_SCHEMA} />
      case 'damage':   return <SchemaTab schema={DAMAGE_RULES_SCHEMA} />
      case 'defense':  return <SchemaTab schema={DEFENSE_OVERWATCH_SCHEMA} />
      case 'retreat':  return <SchemaTab schema={RETREAT_NEGOTIATION_SCHEMA} />
      case 'ship':     return <ShipStatsTab />
      case 'weapon':   return <WeaponStatsTab />
      case 'field':    return <SchemaTab schema={FIELD_EFFECTS_SCHEMA} />
      case 'building': return <OverrideTab title="건물 업그레이드 비용" desc="기존 buildings.js 위에 override (런타임 적용은 다음 단계)." overrideKey="buildings" sourceData={BUILDINGS} sourceLabel="buildings.js" />
      case 'research': return <OverrideTab title="연구 비용 / 티어 해금" desc="research.json 위에 override." overrideKey="research" sourceData={data?.research} sourceLabel="research.json" />
      case 'resource': return <OverrideTab title="자원 설정" desc="resources.json 위에 override (이름/코드/생산량/드랍률)." overrideKey="resources" sourceData={data?.resources} sourceLabel="resources.json" />
      case 'enemy':    return <OverrideTab title="적 스케일링" desc="적 티어/보스 보정/전투력 스케일링 override." overrideKey="enemyScaling" sourceData={data?.enemies} sourceLabel="enemies.json" />
      case 'priority': return <PriorityResolver />
      case 'mapeditor':return <BattleMapEditorTab />
      case 'debug':    return <DebugExportTab />
      default:         return null
    }
  }

  return (
    <div className="scr-overlay">
      <div className="scr-panel" role="dialog" aria-label="System Control Room">
        {/* 헤더 + 액션바 */}
        <header className="scr-header">
          <button
            className="scr-btn scr-nav-toggle"
            onClick={() => setNavCollapsed((c) => !c)}
            title={navCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
          >{navCollapsed ? '☰' : '◀'}</button>
          <div className="scr-title">
            <span className="scr-title-main">⚙ System Control Room</span>
            <span className="scr-title-sub">개발자 설정 관제실 · 전투 v1.0</span>
          </div>
          <div className="scr-actions">
            {/* Battle Map Editor는 자체 저장/Export를 쓰므로(게임 config 저장과 무관) 헤더 버튼을 숨긴다 */}
            {tab !== 'mapeditor' && (
              <>
                <span className={`scr-scope${pendingScope === 'next' ? ' scr-scope--next' : ''}`}>
                  적용 범위: {pendingScope === 'next' ? '다음 전투' : '현재 전투'}
                </span>
                <button className={`scr-btn${dirty ? ' scr-btn--dirty' : ''}`} onClick={save} title="localStorage 저장">
                  💾 Save{dirty ? ' *' : ''}
                </button>
                <button className="scr-btn" onClick={() => exportJson()}>⬇ Export</button>
                <button className="scr-btn" onClick={applyToCurrentBattle} disabled={!inBattle} title={inBattle ? '' : '전투 중에만'}>현재 전투 반영</button>
                <button className="scr-btn" onClick={applyNextBattleOnly}>다음 전투만</button>
                <button className="scr-btn scr-btn--danger" onClick={() => { if (window.confirm('기본값으로 초기화할까요?')) resetAll() }}>↺ Reset</button>
              </>
            )}
            {tab === 'mapeditor' && (
              <span className="scr-scope">맵 저장은 좌측 패널에서 (게임 config와 별개)</span>
            )}
            <button className="scr-btn scr-btn--close" onClick={onClose} title="닫기 (Esc)">✕</button>
          </div>
        </header>

        <div className="scr-body">
          {/* 탭 내비 (접기 가능) */}
          <nav className={`scr-tabs${navCollapsed ? ' scr-tabs--collapsed' : ''}`}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`scr-tab${tab === t.id ? ' scr-tab--active' : ''}`}
                onClick={() => setTab(t.id)}
              >{t.label}</button>
            ))}
          </nav>

          {/* 탭 본문 */}
          <div className="scr-content">{renderTab()}</div>
        </div>
      </div>
    </div>
  )
}

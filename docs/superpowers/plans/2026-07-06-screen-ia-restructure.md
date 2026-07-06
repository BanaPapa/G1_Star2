# 화면 구조(IA) 재설계 구현 계획 — 메인맵/전투맵/장소맵 3계층

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 평면 화면 전환 + 전역 메뉴 구조를, 장소 도킹 기반 3계층(메인맵/장소맵/전투맵) 구조로 재편한다.

**Architecture:** `App.jsx`의 `view` 문자열을 `{ screen, placeId }` 내비 상태로 교체하고, 전역이던 연구/상점/조합/건설을 신규 `PlaceScreen`(장소맵)의 시설 패널로 이전한다. 시설 탭은 장소의 건물(`providesFacility`)에서 파생된다. 함대 편성/저장은 전역 오버레이로 남긴다.

**Tech Stack:** Vite + React 18(jsx), Zustand, vitest. 스펙: `docs/superpowers/specs/2026-07-06-screen-ia-design.md`

**사전 참고 — 현재 코드 위치 (2026-07-06 HEAD `6870a98` 기준):**
- `src/App.jsx` — view state 평면 전환 (137~202행 렌더 분기)
- `src/ui/components/TopStatusBar.jsx` — NAV_ITEMS 5개 햄버거 (7~13행)
- `src/ui/screens/MaintenanceHubScreen.jsx` — ResearchTab(67행~)/ShopTab(137행~)/CraftTab(237행~) + 헬퍼(17~46행)
- `src/ui/screens/PlanetManagementScreen.jsx` — CostRow(16행~)/BuildingCard(34행~)/화면(130행~)
- `src/ui/screens/StrategyMapScreen.jsx` — 행성 관리 버튼(1729~1736행), `isConq`(1608행), `status`(1606행)
- `src/data/buildings.js` — BUILDINGS 정의, HOME_BUILDINGS
- `src/state/useBuildingStore.js` — 모항 건물 4종 Lv1로 시작 (INITIAL_BUILDINGS)

---

### Task 1: 시설 파생 규칙 `getPlaceFacilities` (TDD)

**Files:**
- Create: `src/data/placeFacilities.js`
- Create: `src/data/__tests__/placeFacilities.test.js`
- Modify: `src/data/buildings.js` (providesFacility 필드 4개 + Dreadnought 표기 수정)

- [ ] **Step 1-1: 실패하는 테스트 작성**

`src/data/__tests__/placeFacilities.test.js` 전체 내용:

```js
import { describe, it, expect } from 'vitest'
import { getPlaceFacilities } from '../placeFacilities'

const homeNode   = { id: 's0', role: 'home' }
const colonyNode = { id: 's1', role: 'mission' }

// getLevel(nodeId, buildingId) 형태의 스텁 — 주어진 맵의 레벨만 반환
function levelsOf(map) {
  return (nodeId, buildingId) => map[buildingId] ?? 0
}

describe('getPlaceFacilities', () => {
  it('모항: 본부 건물 Lv1 기준으로 build/research/shop/craft/shipyard 탭 제공', () => {
    const getLevel = levelsOf({
      bld_command_center: 1, bld_research_lab: 1, bld_workshop: 1, bld_shipyard: 1,
    })
    expect(getPlaceFacilities(homeNode, getLevel, {})).toEqual(
      ['build', 'research', 'shop', 'craft', 'shipyard']
    )
  })

  it('점령 행성: 아웃포스트 Lv1이면 build/repair', () => {
    const getLevel = levelsOf({ bld_outpost: 1 })
    expect(getPlaceFacilities(colonyNode, getLevel, {})).toEqual(['build', 'repair'])
  })

  it('건물이 없으면 build 탭만 남는다', () => {
    expect(getPlaceFacilities(colonyNode, levelsOf({}), {})).toEqual(['build'])
  })

  it('관제실 override로 providesFacility를 바꿀 수 있다', () => {
    const config = { overrides: { buildings: { bld_outpost: { providesFacility: 'shop' } } } }
    expect(getPlaceFacilities(colonyNode, levelsOf({ bld_outpost: 1 }), config)).toEqual(['build', 'shop'])
  })

  it('node가 null이면 빈 배열', () => {
    expect(getPlaceFacilities(null, levelsOf({}), {})).toEqual([])
  })
})
```

- [ ] **Step 1-2: 실패 확인**

Run: `npx vitest run src/data/__tests__/placeFacilities.test.js`
Expected: FAIL — `Cannot find module '../placeFacilities'` (5개 테스트 실패)

- [ ] **Step 1-3: buildings.js에 providesFacility 추가 + 함급 표기 수정**

`src/data/buildings.js`에서 4개 건물 정의에 한 줄씩 추가한다 (Edit 4회):

`bld_research_lab`의 `maxLevel: 5,` 다음 줄에:
```js
    providesFacility: 'research',
```
`bld_workshop`의 `maxLevel: 5,` 다음 줄에:
```js
    providesFacility: 'craft',
```
`bld_shipyard`의 `maxLevel: 5,` 다음 줄에:
```js
    providesFacility: 'shipyard',
```
`bld_outpost`의 `maxLevel: 5,` 다음 줄에:
```js
    providesFacility: 'repair',
```
(`bld_command_center`는 시설 탭 없음 — 필드 추가하지 않는다.)

같은 파일 `bld_shipyard.effectByLevel`의 `5:` 값에서 DESIGN_BIBLE §3-3 확정 반영:
```js
      5: '제작: + Battleship   | 장착: Tier V',
```
(기존 `'제작: + Dreadnought  | 장착: Tier V'`를 교체.)

- [ ] **Step 1-4: 구현**

`src/data/placeFacilities.js` 전체 내용:

```js
// 장소(모항/점령 행성)가 제공하는 시설 탭 목록 — PlaceScreen이 사용.
// 규칙(스펙 §2): 시설 탭은 그 장소에 해당 시설을 제공하는 건물이 존재할 때만 생성된다.
// 모항 상점은 정거장 자체 시설(systems.json facilities의 'shop')이라 건물과 무관하게 항상 제공.
import { HOME_BUILDINGS, getEffectiveBuildingDef } from './buildings'

// 시설 탭 표시 순서 — 이 배열에 있는 것만, 이 순서로 렌더된다.
export const FACILITY_ORDER = ['build', 'research', 'shop', 'craft', 'shipyard', 'repair']

export function getPlaceFacilities(node, getLevel, config) {
  if (!node) return []
  const isHome = node.role === 'home'
  const facilities = new Set(['build'])
  const buildingIds = isHome ? HOME_BUILDINGS : ['bld_outpost']
  for (const buildingId of buildingIds) {
    const def = getEffectiveBuildingDef(buildingId, config)
    if (def?.providesFacility && getLevel(node.id, buildingId) > 0) {
      facilities.add(def.providesFacility)
    }
  }
  if (isHome) facilities.add('shop')
  return FACILITY_ORDER.filter((f) => facilities.has(f))
}
```

- [ ] **Step 1-5: 테스트 통과 확인**

Run: `npx vitest run src/data/__tests__/placeFacilities.test.js`
Expected: PASS (5 passed)

Run: `npm test`
Expected: 52 passed (기존 47 + 신규 5)

- [ ] **Step 1-6: 커밋**

```bash
git add src/data/placeFacilities.js src/data/__tests__/placeFacilities.test.js src/data/buildings.js
git commit -m "feat(ia): 장소 시설 파생 규칙 getPlaceFacilities + 건물 providesFacility 필드"
```

---

### Task 2: 시설 패널 추출 — Research/Shop/Craft

기존 `MaintenanceHubScreen.jsx`의 탭 3개를 독립 패널 파일로 옮긴다. 이 Task에서는 **새 파일 생성만** 하고 MaintenanceHubScreen은 건드리지 않는다(잠시 코드 중복 — Task 4에서 화면 자체를 삭제하며 해소). 각 패널은 props 없이 스토어에서 스스로 데이터를 읽는다.

**Files:**
- Create: `src/ui/facilities/common.jsx`
- Create: `src/ui/facilities/ResearchPanel.jsx`
- Create: `src/ui/facilities/ShopPanel.jsx`
- Create: `src/ui/facilities/CraftPanel.jsx`

- [ ] **Step 2-1: 공용 헬퍼 + 데이터 훅**

`src/ui/facilities/common.jsx` 전체 내용 — `formatCost`/`describeUnlock`은 `MaintenanceHubScreen.jsx` 17~33행을 그대로 옮긴 것이고, `useFacilityData`는 같은 파일 295~329행의 데이터 준비 로직을 훅으로 묶은 것이다:

```jsx
// 시설 패널(연구/상점/조합) 공용 헬퍼 — MaintenanceHubScreen에서 추출.
import { useDataStore } from '../../state/useDataStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import '../screens/MaintenanceHubScreen.css'

export function formatCost(cost, resourcesById) {
  return Object.entries(cost ?? {})
    .map(([key, amount]) => `${resourcesById.get(key)?.name ?? key} ${amount}`)
    .join(' · ')
}

// research.json의 unlock 항목은 "craft:id"/"feature:key"/"buff:key"/"ship:id" 같은 접두 표기와
// 일반 아이템 id가 섞여 있다 — 표시용으로 의미를 풀어 보여준다.
export function describeUnlock(key, { itemsById, shipsById }) {
  const [prefix, rest] = key.includes(':') ? key.split(':') : [null, key]
  if (prefix === 'craft') return `🔧 조합 레시피 해금 — ${itemsById.get(rest)?.name ?? rest}`
  if (prefix === 'feature') return `✨ 기능 해금 — ${rest.replace(/_/g, ' ')}`
  if (prefix === 'buff') return `📈 함대 버프 — ${rest.replace(/_/g, ' ')}`
  if (prefix === 'ship') return `🚀 함선 해금 — ${shipsById.get(rest)?.name ?? rest}`
  const item = itemsById.get(key)
  return item ? `📦 ${item.name} (${item.slot === 'weapon' ? '무기' : '모듈'})` : key
}

// 연구/상점/조합 패널 공용 데이터 — 관제실 override(연구/자원)를 적용해 반환.
// 데이터 로딩 전이면 null을 반환하므로 호출측은 `if (!data) return null` 가드가 필요하다.
export function useFacilityData() {
  const research = useDataStore((s) => s.data?.research?.research)
  const synergies = useDataStore((s) => s.data?.research?.synergies ?? [])
  const items = useDataStore((s) => s.data?.items)
  const shops = useDataStore((s) => s.data?.shops?.shops)
  const resources = useDataStore((s) => s.data?.resources?.resources)
  const ships = useDataStore((s) => s.data?.ships?.ships)
  const wallet = useResourceStore((s) => s.wallet)
  const researchOverride = useGameConfigStore((s) => s.config.overrides?.research) ?? {}
  const resourcesOverride = useGameConfigStore((s) => s.config.overrides?.resources) ?? {}

  if (!research || !items || !shops || !resources || !ships) return null

  const effectiveResearch = Object.keys(researchOverride).length === 0
    ? research
    : research.map((node) => {
        const ov = researchOverride[node.id]
        return ov ? { ...node, ...ov } : node
      })

  const effectiveResources = Object.keys(resourcesOverride).length === 0
    ? resources
    : resources.map((r) => {
        const ov = resourcesOverride[r.id]
        return ov ? { ...r, ...ov } : r
      })

  return {
    effectiveResearch,
    synergies,
    items,
    shops,
    wallet,
    effectiveResources,
    resourcesById: new Map(effectiveResources.map((r) => [r.id, r])),
    shipsById: new Map(ships.map((s) => [s.id, s])),
    itemsById: new Map(
      ['weapons', 'modules', 'consumables', 'uniques']
        .flatMap((cat) => items[cat] ?? [])
        .map((i) => [i.id, i])
    ),
  }
}
```

- [ ] **Step 2-2: ResearchPanel**

`src/ui/facilities/ResearchPanel.jsx` — `MaintenanceHubScreen.jsx`의 `SynergyCard`(49~65행)와 `ResearchTab`(67~135행) 본문을 **그대로 복사**하고, 아래 래퍼로 감싼다. 복사 시 변경점은 (a) import 경로, (b) `formatCost`를 common에서 import, (c) props 대신 `useFacilityData()` 사용 — 세 가지뿐이다:

```jsx
import { useResearchStore } from '../../state/useResearchStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useDevelopmentStore } from '../../state/useDevelopmentStore'
import { formatCost, describeUnlock, useFacilityData } from './common'

// ── 여기에 MaintenanceHubScreen.jsx 49~65행의 SynergyCard 함수를 그대로 붙여넣는다 ──
// ── 여기에 MaintenanceHubScreen.jsx 67~135행의 ResearchTab 함수 본문을 그대로 붙여넣되,
//    함수 시그니처만 아래처럼 바꾼다:
//    function ResearchTab({ research, synergies, resourcesById, itemsById, shipsById }) { ... }
//    (시그니처·본문 변경 없음 — 파일 내 지역 컴포넌트로 유지) ──

export default function ResearchPanel() {
  const data = useFacilityData()
  if (!data) return null
  const { effectiveResearch, synergies, resourcesById, itemsById, shipsById } = data
  return (
    <ResearchTab
      research={effectiveResearch}
      synergies={synergies}
      resourcesById={resourcesById}
      itemsById={itemsById}
      shipsById={shipsById}
    />
  )
}
```

- [ ] **Step 2-3: ShopPanel**

`src/ui/facilities/ShopPanel.jsx` — `ShopTab`(137~235행)을 그대로 복사해 지역 컴포넌트로 두고 래핑:

```jsx
import { useResearchStore } from '../../state/useResearchStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useFleetStore } from '../../state/useFleetStore'
import AssetImage from '../components/AssetImage'
import { useFacilityData } from './common'

// ── 여기에 MaintenanceHubScreen.jsx 137~235행의 ShopTab 함수를 그대로 붙여넣는다 ──

export default function ShopPanel() {
  const data = useFacilityData()
  if (!data) return null
  return <ShopTab shops={data.shops} itemsById={data.itemsById} />
}
```

- [ ] **Step 2-4: CraftPanel**

`src/ui/facilities/CraftPanel.jsx` — `CraftTab`(237~293행)을 그대로 복사해 래핑:

```jsx
import { useResearchStore } from '../../state/useResearchStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useFleetStore } from '../../state/useFleetStore'
import AssetImage from '../components/AssetImage'
import { formatCost, useFacilityData } from './common'

// ── 여기에 MaintenanceHubScreen.jsx 237~293행의 CraftTab 함수를 그대로 붙여넣는다 ──

export default function CraftPanel() {
  const data = useFacilityData()
  if (!data) return null
  return (
    <CraftTab
      recipes={data.items.recipes ?? []}
      research={data.effectiveResearch}
      itemsById={data.itemsById}
      resourcesById={data.resourcesById}
    />
  )
}
```

- [ ] **Step 2-5: 빌드 확인 + 커밋**

Run: `npm run build`
Expected: ✓ built (신규 파일은 아직 어디서도 import되지 않지만 구문 검증됨)

```bash
git add src/ui/facilities/
git commit -m "feat(ia): 연구/상점/조합 시설 패널 추출 (PlaceScreen 준비)"
```

---

### Task 3: BuildPanel + PlaceScreen (장소맵)

**Files:**
- Create: `src/ui/facilities/BuildPanel.jsx`
- Create: `src/ui/screens/PlaceScreen.jsx`
- Create: `src/ui/screens/PlaceScreen.css`

- [ ] **Step 3-1: BuildPanel**

`src/ui/facilities/BuildPanel.jsx` — `PlanetManagementScreen.jsx`의 `RESOURCE_ICONS`/`RESOURCE_NAMES`(10~14행), `CostRow`(16~32행), `BuildingCard`(34~128행)를 **그대로 복사**하고 아래 래퍼를 추가한다. import는 아래와 같이 바꾼다:

```jsx
import { useState } from 'react'
import { useResourceStore } from '../../state/useResourceStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { HOME_BUILDINGS, getEffectiveBuildingDef } from '../../data/buildings'
import '../screens/PlanetManagementScreen.css'

// ── 여기에 PlanetManagementScreen.jsx 10~14행(RESOURCE_ICONS/RESOURCE_NAMES),
//    16~32행(CostRow), 34~128행(BuildingCard)을 그대로 붙여넣는다 ──

// 장소맵 건물 탭 — 모항은 본부 건물 4종, 점령 행성은 아웃포스트.
export default function BuildPanel({ nodeId, isHome }) {
  const buildingList = isHome ? HOME_BUILDINGS : ['bld_outpost']
  return (
    <div className="pm-building-grid">
      {buildingList.map((bid) => (
        <BuildingCard key={bid} nodeId={nodeId} buildingId={bid} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3-2: PlaceScreen**

`src/ui/screens/PlaceScreen.jsx` 전체 내용:

```jsx
import { useEffect, useState } from 'react'
import { useDataStore } from '../../state/useDataStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useBuildingStore } from '../../state/useBuildingStore'
import { useGameConfigStore } from '../../state/useGameConfigStore'
import { getPlaceFacilities } from '../../data/placeFacilities'
import ResearchPanel from '../facilities/ResearchPanel'
import ShopPanel from '../facilities/ShopPanel'
import CraftPanel from '../facilities/CraftPanel'
import BuildPanel from '../facilities/BuildPanel'
import './PlaceScreen.css'

const FACILITY_LABEL = {
  build:    '🏗️ 건물',
  research: '🔬 연구',
  shop:     '🛒 상점',
  craft:    '🔧 조합',
  shipyard: '🚀 조선소',
  repair:   '🛠️ 수리',
}

// 아직 전용 UI가 없는 시설 — 자리만 확보 (스펙 §7 비범위: 조선소/수리)
function PlaceholderPanel({ label }) {
  return <p className="hub-card-meta">{label} 시설은 준비 중입니다 — 다음 업데이트에서 열립니다.</p>
}

export default function PlaceScreen({ placeId, onExit }) {
  const systems = useDataStore((s) => s.data?.systems?.systems)
  const conqueredNodeIds = useProgressStore((s) => s.conqueredNodeIds)
  const getLevel = useBuildingStore((s) => s.getLevel)
  useBuildingStore((s) => s.buildings) // 건물 레벨 변화 시 시설 탭 재계산
  const initOutpost = useBuildingStore((s) => s.initOutpost)
  const config = useGameConfigStore((s) => s.config)
  const [tab, setTab] = useState(null)

  const node = systems?.find((s) => s.id === placeId)
  const isHome = node?.role === 'home'
  const isConquered = conqueredNodeIds.includes(placeId)

  // 점령 행성 입항 시 아웃포스트 Lv1 자동 생성 (기존 PlanetManagementScreen 동작 유지)
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
      {activeTab === 'research' && <ResearchPanel />}
      {activeTab === 'shop' && <ShopPanel />}
      {activeTab === 'craft' && <CraftPanel />}
      {activeTab === 'shipyard' && <PlaceholderPanel label={FACILITY_LABEL.shipyard} />}
      {activeTab === 'repair' && <PlaceholderPanel label={FACILITY_LABEL.repair} />}
    </div>
  )
}
```

- [ ] **Step 3-3: PlaceScreen.css**

`src/ui/screens/PlaceScreen.css` 전체 내용:

```css
.place-screen { min-height: 100%; }

.place-header {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; flex-wrap: wrap; margin-bottom: 14px;
}
.place-title { display: flex; align-items: center; gap: 12px; }
.place-icon { font-size: 40px; }
.place-name { margin: 0; font-size: 22px; color: #e8f0ff; }
.place-meta { margin: 2px 0 0; font-size: 13px; color: #8fa3c8; }

.place-exit-btn {
  font-family: var(--mono); font-size: 14px; padding: 10px 18px;
  background: rgba(58, 214, 196, 0.12); border: 1px solid #3ad6c4;
  border-radius: 8px; color: #3ad6c4; cursor: pointer; letter-spacing: 0.5px;
}
.place-exit-btn:hover { background: rgba(58, 214, 196, 0.22); }
```

- [ ] **Step 3-4: 빌드 확인 + 커밋**

Run: `npm run build`
Expected: ✓ built

```bash
git add src/ui/facilities/BuildPanel.jsx src/ui/screens/PlaceScreen.jsx src/ui/screens/PlaceScreen.css
git commit -m "feat(ia): PlaceScreen(장소맵) + BuildPanel — 시설 탭 파생 렌더"
```

---

### Task 4: App 내비게이션 개편 + 구 화면 철거

**Files:**
- Modify: `src/App.jsx` (view → nav/overlay)
- Modify: `src/App.css` (오버레이 스타일 추가)
- Modify: `src/ui/components/TopStatusBar.jsx` (NAV_ITEMS 2개로 축소)
- Modify: `src/ui/screens/StrategyMapScreen.jsx` (행성 관리 → 입항 버튼)
- Delete: `src/ui/screens/MaintenanceHubScreen.jsx`
- Delete: `src/ui/screens/PlanetManagementScreen.jsx`
- Move: `src/ui/screens/MaintenanceHubScreen.css` → 유지(패널들이 import 중 — 이름만 유지)
- Move: `src/ui/screens/PlanetManagementScreen.css` → 유지(BuildPanel이 import 중)

> CSS 파일 2개는 화면(jsx)이 삭제돼도 패널들이 클래스(`hub-*`, `pm-*`)를 계속 쓰므로 **삭제하지 않는다**.

- [ ] **Step 4-1: App.jsx 내비 상태 교체**

`src/App.jsx`를 다음 규칙으로 수정한다.

(a) state 교체 — 기존 36~43행의 `view/prevView/planetNodeId` 관련을 다음으로:

```jsx
  // 화면 3계층: main(성단맵) / place(장소맵) / battle(전투맵) + title/ending/gameover (스펙 §1)
  const [nav, setNav] = useState({ screen: 'title', placeId: null })
  const [prevNav, setPrevNav] = useState(null)
  // 전역 오버레이: 함대 편성/저장·설정 — 어느 화면 위에서든 열린다 (전투 중 제외)
  const [overlay, setOverlay] = useState(null) // null | 'fleet' | 'save'
  const [devRoomOpen, setDevRoomOpen] = useState(false)
  const [devRoomTab, setDevRoomTab] = useState('combat')
  const [mockBattle, setMockBattle] = useState(false)
  const [battleCategory, setBattleCategory] = useState(null)
  const [activeNodeId, setActiveNodeId] = useState(null)
  const navRef = useRef(nav)
  useEffect(() => { navRef.current = nav }, [nav])

  function navigate(screen, placeId = null) {
    setPrevNav(navRef.current)
    setNav({ screen, placeId })
  }
```

(b) BGM 매핑(기존 19~28행) 교체:

```jsx
const BGM_FOR_SCREEN = {
  title: 'title',
  main: 'map',
  place: 'map',
  battle: 'battle',
  ending: 'map',
}
```
BGM effect는 `BGM_FOR_SCREEN[nav.screen]`을 읽도록 수정.

(c) 모의 전투 진입 effect(기존 53~64행)의 `setPrevView(viewRef.current); setView('battle')`를:

```jsx
    setPrevNav(navRef.current)
    setNav({ screen: 'battle', placeId: null })
```
로 교체 (viewRef 제거, navRef 사용).

(d) 키 핸들러(기존 69~82행)의 Escape 분기를 오버레이도 닫도록:

```jsx
      } else if (e.key === 'Escape') {
        setDevRoomOpen(false)
        setOverlay(null)
      }
```

(e) 핸들러들 교체:

```jsx
  function handleNewGame()  { navigate('main') }
  function handleContinue() { setOverlay('save') }
  function handleSettings() { setOverlay('save') }
  function handleGameOver() { navigate('gameover') }

  function handleEnterBattle(nodeId, category = null) {
    setActiveNodeId(nodeId)
    setBattleCategory(category)
    setMockBattle(false)
    navigate('battle')
  }

  function handleExitBattle() {
    setActiveNodeId(null)
    if (mockBattle) {
      setMockBattle(false)
      useMapStore.getState().clearTestBattleMap()
      setNav(prevNav ?? { screen: 'main', placeId: null })
      setDevRoomTab('mapeditor')
      setDevRoomOpen(true)
      return
    }
    navigate('main')
  }

  function handleEnding() {
    setActiveNodeId(null)
    navigate('ending')
  }

  function handleEnterPlace(placeId) { navigate('place', placeId) }
  function handleExitPlace()         { navigate('main') }

  const inBattle = nav.screen === 'battle'
```

(f) 렌더 트리(기존 135~203행) 교체:

```jsx
  return (
    <>
      {nav.screen === 'title' && (
        <TitleScreen
          onNewGame={handleNewGame}
          onContinue={handleContinue}
          onSettings={handleSettings}
        />
      )}

      {nav.screen === 'gameover' && (
        /* 기존 gameover div 그대로 유지 (146~153행) */
      )}

      {nav.screen !== 'title' && nav.screen !== 'gameover' && (
        <div className="app-shell">
          <TopStatusBar
            inBattle={inBattle}
            onOpenFleet={() => !inBattle && setOverlay('fleet')}
            onOpenSave={() => !inBattle && setOverlay('save')}
            onOpenDevRoom={() => setDevRoomOpen(true)}
          />

          <main className="app-content">
            {nav.screen === 'main' && (
              <StrategyMapScreen
                onEnterBattle={handleEnterBattle}
                onGameOver={handleGameOver}
                onEnterPlace={handleEnterPlace}
              />
            )}

            {nav.screen === 'place' && (
              <div className="app-content-scroll">
                <PlaceScreen placeId={nav.placeId} onExit={handleExitPlace} />
              </div>
            )}

            {nav.screen === 'battle' && (
              <BattleScreen nodeId={activeNodeId} mock={mockBattle} battleCategory={battleCategory} onExit={handleExitBattle} onEnding={handleEnding} onGameOver={handleGameOver} />
            )}

            {nav.screen === 'ending' && <EndingScreen onRestart={() => window.location.reload()} />}
          </main>
        </div>
      )}

      {/* 전역 오버레이 — 함대 편성 / 저장·설정 (스펙 §2: 전역 메뉴) */}
      {overlay && (
        <div className="app-overlay">
          <div className="app-overlay-head">
            <button className="app-overlay-close" onClick={() => setOverlay(null)}>✕ 닫기 (Esc)</button>
          </div>
          <div className="app-overlay-body">
            {overlay === 'fleet' && <FleetScreen />}
            {overlay === 'save' && (
              <SaveScreen
                onBack={() => setOverlay(null)}
                onLoaded={() => { setOverlay(null); navigate('main') }}
              />
            )}
          </div>
        </div>
      )}

      {devRoomOpen && (
        <SystemControlRoom onClose={() => setDevRoomOpen(false)} inBattle={inBattle} initialTab={devRoomTab} />
      )}
    </>
  )
```

(g) import 정리: `MaintenanceHubScreen`/`PlanetManagementScreen` import 삭제, `PlaceScreen` import 추가:

```jsx
import PlaceScreen from './ui/screens/PlaceScreen'
```

- [ ] **Step 4-2: App.css에 오버레이 스타일 추가**

`src/App.css` 끝에 추가:

```css
/* 전역 오버레이 — 함대 편성/저장·설정 (관제실 z-index보다 아래) */
.app-overlay {
  position: fixed; inset: 0; z-index: 900;
  background: rgba(4, 8, 20, 0.97);
  display: flex; flex-direction: column;
}
.app-overlay-head {
  display: flex; justify-content: flex-end; padding: 10px 16px 0;
}
.app-overlay-close {
  font-family: var(--mono); font-size: 13px; padding: 6px 14px;
  background: rgba(255, 255, 255, 0.06); border: 1px solid #445;
  border-radius: 8px; color: #cdd8f4; cursor: pointer;
}
.app-overlay-close:hover { background: rgba(255, 255, 255, 0.12); }
.app-overlay-body { flex: 1; overflow-y: auto; }
```

> 관제실(SystemControlRoom)의 z-index가 900 이하라면 관제실 값을 확인해 오버레이보다 위(예: 1000)로 유지한다. 구현 시 `SystemControlRoom.css`의 z-index를 확인할 것.

- [ ] **Step 4-3: TopStatusBar 축소**

`src/ui/components/TopStatusBar.jsx`에서:

NAV_ITEMS(7~13행)를:
```jsx
// 전역 메뉴 — 함대 편성/저장·설정만. 상점·연구·조합·건설은 장소맵(입항) 소속 (스펙 §2·§3).
const NAV_ITEMS = [
  { key: 'fleet', label: '🚀 함대 편성' },
  { key: 'save',  label: '💾 저장/설정' },
]
```

컴포넌트 시그니처(17행)를:
```jsx
export default function TopStatusBar({ inBattle, onOpenFleet, onOpenSave, onOpenDevRoom }) {
```

드로어 버튼 onClick(65~72행)을:
```jsx
                onClick={() => {
                  if (item.key === 'fleet') onOpenFleet()
                  else onOpenSave()
                  setNavOpen(false)
                }}
```

`view` prop 기반 active 표시(64행 `view === item.key`)는 오버레이 방식에선 의미 없으므로 클래스에서 제거:
```jsx
                className="app-topbar-drawer-btn"
```

- [ ] **Step 4-4: StrategyMapScreen — 행성 관리 버튼 → 입항 버튼**

`src/ui/screens/StrategyMapScreen.jsx`에서:

(a) 컴포넌트 시그니처(303행):
```jsx
export default function StrategyMapScreen({ onEnterBattle, onGameOver, onEnterPlace }) {
```

(b) 기존 행성 관리 버튼(1729~1736행)을 교체 — **도킹 조건: 함대가 그 노드에 있고(status current) 모항/정복지일 때만**:
```jsx
            {status === 'current' && (selected.role === 'home' || isConq) && onEnterPlace && (
              <button
                className="map-action-btn map-action-btn--planet"
                onClick={() => onEnterPlace(selected.id)}
              >
                🛬 입항 — {selected.role === 'home' ? '정거장 내부' : '행성 관리'}
              </button>
            )}
```

(c) 같은 파일에서 `onManagePlanet` 잔여 참조가 없는지 확인:
Run: `grep -n "onManagePlanet" src/ui/screens/StrategyMapScreen.jsx src/App.jsx src/ui/components/TopStatusBar.jsx`
Expected: (no matches)

- [ ] **Step 4-5: 구 화면 삭제**

```bash
git rm src/ui/screens/MaintenanceHubScreen.jsx src/ui/screens/PlanetManagementScreen.jsx
```

Run: `grep -rn "MaintenanceHubScreen\|PlanetManagementScreen" src/ --include=*.jsx --include=*.js`
Expected: CSS import 2건만 남음 (`facilities/common.jsx`의 MaintenanceHubScreen.css, `facilities/BuildPanel.jsx`의 PlanetManagementScreen.css) — jsx 참조는 0건.

- [ ] **Step 4-6: 검증 + 커밋**

Run: `npm test`
Expected: 52 passed

Run: `npm run build`
Expected: ✓ built

```bash
git add -A
git commit -m "feat(ia): 3계층 내비게이션 — PlaceScreen 배선, 전역 오버레이(함대/저장), 정비허브·행성관리 화면 철거"
```

---

### Task 5: 수동 QA + 문서 갱신

- [ ] **Step 5-1: 개발 서버 기동**

Run: `npm run dev` (백그라운드)
Expected: Vite ready, 콘솔에 신규 에러 없음 (`bg_space` 이미지 누락 에러는 기존 알려진 사항)

- [ ] **Step 5-2: 수동 QA 체크리스트 (스펙 §6)**

브라우저에서 확인 (사용자 함께):
1. 타이틀 → 새 게임 → 성단맵 진입
2. 모항(다이달로스) 선택 → **🛬 입항** 버튼 → 장소맵: 건물/연구/상점/조합/조선소 탭 표시
3. 각 탭 동작: 건물 업그레이드 / 연구 해금 / 상점 구매·판매 / 조합
4. **🚀 출항** → 성단맵 복귀
5. 모항에서 떨어진 우주 공간에서: 햄버거 메뉴에 함대 편성/저장·설정만 있음 (상점·연구 접근 불가)
6. 함대 편성 오버레이 열기/닫기(Esc), 저장·설정 오버레이 열기/닫기
7. 적 조우 → 전투 → 종료 → 성단맵 복귀. 전투 중 햄버거 비활성
8. 별계 정복 → 그 노드에서 입항 → 건물 탭(아웃포스트) + 수리 탭(준비 중) 표시
9. 저장 → 새로고침 → 이어하기 → 로드 → 성단맵 복귀
10. F9 관제실 정상, 관제실 → 전투맵 에디터 → 모의 전투 → 종료 시 관제실 복귀

- [ ] **Step 5-3: 발견된 문제 수정 후 재검증**

문제가 있으면 수정 → `npm test && npm run build` 재실행 → 해당 항목 재확인.

- [ ] **Step 5-4: DESIGN_BIBLE 로드맵 갱신**

`docs/DESIGN_BIBLE.md` §5 로드맵에 항목 추가/갱신: 화면 구조(IA) 재설계 완료 기록, 다음 = 무기 계열 메커니즘(4단계).

- [ ] **Step 5-5: 최종 커밋**

```bash
git add -A
git commit -m "docs: 화면 IA 재설계 완료 기록 + QA 결과 반영"
```

---

## Self-Review 결과

- **스펙 커버리지**: §1 화면지도→Task 4, §2 메뉴 소속(도킹 게이트)→Task 1·3·4, §3 상단바→Task 4-3, §4 코드 구조(placeFacilities/PlaceScreen/패널 분리/에러 처리)→Task 1~3, §5 구현 순서→Task 순서 일치, §6 테스트→Task 5. 갭 없음.
- **플레이스홀더**: "그대로 붙여넣는다" 지시는 모두 원본 파일·행 번호를 명시했으므로 실행 가능. 조선소/수리 PlaceholderPanel은 스펙 §7 비범위로 의도된 것.
- **타입/이름 일관성**: `getPlaceFacilities(node, getLevel, config)` — Task 1 정의와 Task 3 사용 일치. `onEnterPlace(placeId)` — Task 4 (a)(b)와 App 핸들러 일치. `providesFacility` — Task 1 데이터와 테스트 일치.

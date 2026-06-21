// 전투맵 저장소 — Battle Map Editor가 만든 mapDefinition을 localStorage("7star_battle_maps")에 보관.
// 전투(BattleScreen)는 activeMapId로 현재 사용할 맵을 읽는다.
import { create } from 'zustand'
import { createMapDefinition, cloneMap, normalizeForSave } from '../core/battleMap'
import { BUILTIN_MAPS } from '../data/builtinMaps'

const MAPS_KEY   = '7star_battle_maps'
const ACTIVE_KEY = '7star_battle_active_map'
const NODEMAP_KEY = '7star_node_maps'
const CATMAP_KEY = '7star_category_maps'
const MAPTYPE_KEY = '7star_map_categories'

// 맵 유형(파일명 접두사로 인코딩) — 일반형/특수형/전략형/보스형. 미지정은 '기타'(null).
export const MAP_TYPES = [
  { id: 'normal',  label: '일반형' },
  { id: 'special', label: '특수형' },
  { id: 'elite',   label: '전략형' },
  { id: 'boss',    label: '보스형' },
]
export const MAP_TYPE_IDS = MAP_TYPES.map((t) => t.id)
// 이미지 기본 분류(파일명 기준). 사용자가 드래그로 바꾸면 mapCategories 오버라이드가 우선.
export const PREDEFINED_MAP_TYPES = {
  'Nebula Platform': 'normal', 'Eclipse Cross': 'normal', 'Emerald Crescent': 'normal',
  'Starpoint Field': 'normal', 'Twin Expanse': 'normal', 'Violet Frontier': 'normal',
  'Cross Nexus': 'special', 'Crossfire Gate': 'special', 'Frontier Outpost': 'special',
  'Highground Citadel': 'special', 'Linebreaker': 'special', 'Longfront Passage': 'special',
  'Amber Stronghold': 'elite', 'Bastion Guard': 'elite', 'Celestial Bastion': 'elite',
  'Central Dominion': 'elite', 'Classic Nexus': 'elite', 'Starforge Citadel': 'elite',
}
function loadMapCategories() {
  try {
    const raw = JSON.parse(localStorage.getItem(MAPTYPE_KEY) ?? 'null')
    if (raw && typeof raw === 'object') return raw
  } catch { /* 무시 */ }
  return {}
}
function persistMapCategories(mc) {
  try { localStorage.setItem(MAPTYPE_KEY, JSON.stringify(mc)) } catch { /* 무시 */ }
}

// 맵 적용(전투 배정) 단위 = 맵 유형 4종(일반/특수/전략/보스). categoryMaps는 이 유형들로 키잉.
const CATEGORY_IDS = MAP_TYPE_IDS
const emptyCategoryMaps = () => Object.fromEntries(CATEGORY_IDS.map((id) => [id, []]))
// 전투 종류 → 사용할 맵 유형 매핑(전투 진행은 기존 planet/space 식별자를 그대로 넘김).
const BATTLE_CATEGORY_TO_TYPE = {
  planet_normal: 'normal', space_normal: 'normal',
  planet_boss: 'boss', space_elite: 'elite',
}

function loadMaps() {
  // map/ 폴더의 내장 맵을 기본으로, localStorage 저장본이 같은 id를 덮어쓴다.
  let stored = {}
  try {
    const raw = JSON.parse(localStorage.getItem(MAPS_KEY) ?? 'null')
    if (raw && typeof raw === 'object' && raw.maps && typeof raw.maps === 'object') stored = raw.maps
  } catch { /* 무시 */ }
  return { ...BUILTIN_MAPS, ...stored }
}

function persistMaps(maps) {
  // 내장(map/ 폴더) 맵과 동일한 항목은 저장하지 않아 파일이 원본으로 남도록 한다.
  const stored = {}
  for (const [id, m] of Object.entries(maps)) {
    const b = BUILTIN_MAPS[id]
    if (b && JSON.stringify(b) === JSON.stringify(m)) continue
    stored[id] = m
  }
  try { localStorage.setItem(MAPS_KEY, JSON.stringify({ version: 1, maps: stored })) } catch { /* 무시 */ }
}

function loadActive() {
  try { return localStorage.getItem(ACTIVE_KEY) || null } catch { return null }
}

function persistActive(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch { /* 무시 */ }
}

function loadNodeMaps() {
  try {
    const raw = JSON.parse(localStorage.getItem(NODEMAP_KEY) ?? 'null')
    if (raw && typeof raw === 'object') return raw
  } catch { /* 무시 */ }
  return {}
}

function persistNodeMaps(nodeMaps) {
  try { localStorage.setItem(NODEMAP_KEY, JSON.stringify(nodeMaps)) } catch { /* 무시 */ }
}

function loadCategoryMaps() {
  const base = emptyCategoryMaps()
  try {
    const raw = JSON.parse(localStorage.getItem(CATMAP_KEY) ?? 'null')
    if (raw && typeof raw === 'object') for (const id of CATEGORY_IDS) if (Array.isArray(raw[id])) base[id] = raw[id]
  } catch { /* 무시 */ }
  return base
}
function persistCategoryMaps(cm) {
  try { localStorage.setItem(CATMAP_KEY, JSON.stringify(cm)) } catch { /* 무시 */ }
}
export const useMapStore = create((set, get) => ({
  maps: loadMaps(),            // { [id]: mapDefinition }
  activeMapId: loadActive(),   // 다음 전투에서 사용할 맵 id (null이면 레거시 기본 전장)
  nodeMaps: loadNodeMaps(),    // { [nodeId]: mapId } — (레거시) 노드별 고정 전투맵, BattleScreen 폴백용
  categoryMaps: loadCategoryMaps(), // { [type]: [mapId] } — 맵 유형(일반/특수/전략/보스)별 배정. 한 맵=한 유형.
  mapCategories: loadMapCategories(), // { [이미지basename]: 'normal'|'special'|'elite'|'boss' } — 맵 유형 오버라이드
  testBattleMap: null,         // 에디터 "모의 전투" 1회용 맵(영구저장·활성맵에 영향 없음)
  mockNonce: 0,                // 모의 전투 "요청" 카운터 — 같은 맵을 다시 눌러도 재진입되도록 식별

  // 모의 전투(테스트) — 현재 편집 중인 맵으로 1회 전투. 끝나면 clear.
  // map이 있으면 nonce를 올려 App 구독이 (맵 동일 여부와 무관하게) 항상 전투를 재진입하도록 한다.
  setTestBattleMap: (map) => set((s) => ({ testBattleMap: map, mockNonce: map ? s.mockNonce + 1 : s.mockNonce })),
  clearTestBattleMap: () => set({ testBattleMap: null }),

  // 단일 맵 저장(정규화 후 영구 저장).
  saveMap: (map) => {
    const normalized = normalizeForSave(map)
    const maps = { ...get().maps, [normalized.id]: normalized }
    persistMaps(maps)
    set({ maps })
    return normalized
  },

  createMap: (opts) => {
    const map = createMapDefinition(opts)
    const maps = { ...get().maps, [map.id]: map }
    persistMaps(maps)
    set({ maps })
    return map
  },

  duplicateMap: (id) => {
    const src = get().maps[id]
    if (!src) return null
    const copy = cloneMap(src)
    copy.id = `${src.id}_copy_${Date.now().toString(36)}`
    copy.name = `${src.name} (복사본)`
    const maps = { ...get().maps, [copy.id]: copy }
    persistMaps(maps)
    set({ maps })
    return copy
  },

  deleteMap: (id) => {
    const maps = { ...get().maps }
    delete maps[id]
    persistMaps(maps)
    const activeMapId = get().activeMapId === id ? null : get().activeMapId
    persistActive(activeMapId)
    // 이 맵을 가리키던 노드 할당도 해제
    const nodeMaps = { ...get().nodeMaps }
    let changed = false
    for (const [nid, mid] of Object.entries(nodeMaps)) {
      if (mid === id) { delete nodeMaps[nid]; changed = true }
    }
    if (changed) persistNodeMaps(nodeMaps)
    set({ maps, activeMapId, nodeMaps })
  },

  getMap: (id) => get().maps[id] ?? null,

  setActiveMap: (id) => { persistActive(id); set({ activeMapId: id }) },

  // 맵 적용(배정) — 맵을 모든 유형에서 제거 후 지정 유형에 추가(type=null이면 미배정으로). 한 맵=한 유형(자동 이동).
  assignMapToType: (mapId, type) => {
    if (!mapId) return
    const cm = { ...get().categoryMaps }
    for (const c of CATEGORY_IDS) cm[c] = (cm[c] ?? []).filter((id) => id !== mapId)
    if (type && CATEGORY_IDS.includes(type)) cm[type] = [...(cm[type] ?? []), mapId]
    persistCategoryMaps(cm)
    set({ categoryMaps: cm })
  },

  // 맵 완전 삭제 — maps·categoryMaps에서 모두 제거.
  removeMapEverywhere: (mapId) => {
    const maps = { ...get().maps }; delete maps[mapId]; persistMaps(maps)
    const cm = { ...get().categoryMaps }
    for (const c of CATEGORY_IDS) cm[c] = (cm[c] ?? []).filter((id) => id !== mapId)
    persistCategoryMaps(cm)
    const activeMapId = get().activeMapId === mapId ? null : get().activeMapId
    if (get().activeMapId === mapId) persistActive(null)
    set({ maps, categoryMaps: cm, activeMapId })
  },

  // 맵 유형(일반/특수/전략/보스) 오버라이드 지정. type=null이면 오버라이드 해제(기본 분류로).
  setMapCategory: (basename, type) => {
    const mc = { ...get().mapCategories }
    if (type) mc[basename] = type
    else delete mc[basename]
    persistMapCategories(mc)
    set({ mapCategories: mc })
  },

  // 맵을 다른 id로 재키잉(카테고리 변경 시 저장 그리드 맵의 id 접두사 변경).
  rekeyMap: (oldId, newId) => {
    if (oldId === newId) return
    const maps = { ...get().maps }
    if (!maps[oldId]) return
    const m = { ...maps[oldId], id: newId }
    delete maps[oldId]
    maps[newId] = m
    persistMaps(maps)
    // 전투 카테고리 할당도 새 id로 갱신
    const cm = { ...get().categoryMaps }
    for (const c of CATEGORY_IDS) cm[c] = (cm[c] ?? []).map((id) => (id === oldId ? newId : id))
    persistCategoryMaps(cm)
    set({ maps, categoryMaps: cm })
  },

  // 노드별 맵 할당(빈 값이면 해제).
  setNodeMap: (nodeId, mapId) => {
    const nodeMaps = { ...get().nodeMaps }
    if (mapId) nodeMaps[nodeId] = mapId
    else delete nodeMaps[nodeId]
    persistNodeMaps(nodeMaps)
    set({ nodeMaps })
  },

  // JSON 가져오기 — 단일 맵 또는 { maps:{...} } 묶음 모두 허용.
  importMaps: (obj) => {
    const incoming = obj?.maps && typeof obj.maps === 'object'
      ? obj.maps
      : (obj?.id ? { [obj.id]: obj } : null)
    if (!incoming) return { ok: false, error: '유효한 맵 JSON이 아닙니다 (id 또는 maps 필요).' }
    const maps = { ...get().maps }
    let count = 0
    for (const [id, m] of Object.entries(incoming)) {
      if (m && m.grid && m.tiles) { maps[id] = m; count += 1 }
    }
    persistMaps(maps)
    set({ maps })
    return { ok: true, count }
  },
}))

// 이미지 basename의 유효 유형: 사용자 오버라이드 > 기본 분류 > null(기타).
export const mapTypeOf = (basename, overrides) => {
  const o = overrides ?? useMapStore.getState().mapCategories
  return o[basename] ?? PREDEFINED_MAP_TYPES[basename] ?? null
}

// 비-React 접근 헬퍼 (BattleScreen 등).
export const getActiveMap = () => {
  const { activeMapId, maps } = useMapStore.getState()
  return activeMapId ? (maps[activeMapId] ?? null) : null
}

// 전투 종류(planet_normal 등)에 맞는 맵 유형의 배정 맵 중 랜덤 1개. 배정 없으면 null(→ 호출측 폴백).
export const pickCategoryMap = (battleCategory) => {
  if (!battleCategory) return null
  const type = BATTLE_CATEGORY_TO_TYPE[battleCategory] ?? battleCategory
  const { categoryMaps, maps } = useMapStore.getState()
  const ids = (categoryMaps[type] ?? []).filter((id) => maps[id])
  if (!ids.length) return null
  return maps[ids[Math.floor(Math.random() * ids.length)]] ?? null
}

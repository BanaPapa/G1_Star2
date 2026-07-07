// 전투맵 저장소 — Battle Map Editor가 만든 mapDefinition을 localStorage("7star_battle_maps")에 보관.
// 전투(BattleScreen)는 activeMapId로 현재 사용할 맵을 읽는다.
import { create } from 'zustand'
import { normalizeForSave } from '../core/battleMap'
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
  'Resource Archipelago': 'special', 'Twin Outpost': 'special',
  'Amber Stronghold': 'elite', 'Bastion Guard': 'elite', 'Celestial Bastion': 'elite',
  'Central Dominion': 'elite', 'Classic Nexus': 'elite', 'Starforge Citadel': 'elite',
  'Crimson Arena': 'boss', 'Solar Bastion': 'boss', 'Violet Rampart': 'boss',
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
// 별계 정복전(planet_normal)은 지형 문법이 뚜렷한 특수형도 함께 뽑아 경험을 다양화한다.
const BATTLE_CATEGORY_TO_TYPES = {
  planet_normal: ['normal', 'special'], space_normal: ['normal'],
  planet_boss: ['boss'], space_elite: ['elite'],
}

// 내장 맵의 기본 유형 — metadata.type > 이미지 기본 분류(name) > id 접두사(map_<type>_...).
function builtinTypeOf(m) {
  if (CATEGORY_IDS.includes(m?.metadata?.type)) return m.metadata.type
  if (CATEGORY_IDS.includes(PREDEFINED_MAP_TYPES[m?.name])) return PREDEFINED_MAP_TYPES[m.name]
  const prefixed = CATEGORY_IDS.find((t) => String(m?.id ?? '').startsWith(`map_${t}_`))
  return prefixed ?? null
}

// 새 설치에서도 배정이 비어 있지 않도록 내장 맵으로 유형별 기본 풀을 구성한다.
function defaultCategoryMaps() {
  const base = emptyCategoryMaps()
  for (const m of Object.values(BUILTIN_MAPS)) {
    const t = builtinTypeOf(m)
    if (t) base[t].push(m.id)
  }
  return base
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

// 저장본은 "사용자가 손댄 맵"만 기본값과 다르게 만든다:
// 저장 목록(또는 명시적 미배정 unassigned)에 등장하는 맵은 사용자 배정을 따르고,
// 등장하지 않는 내장 맵은 기본 풀(defaultCategoryMaps)에 남는다.
function loadCategoryMaps() {
  const base = defaultCategoryMaps()
  try {
    const raw = JSON.parse(localStorage.getItem(CATMAP_KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      const touched = new Set([
        ...(Array.isArray(raw.unassigned) ? raw.unassigned : []),
        ...CATEGORY_IDS.flatMap((id) => (Array.isArray(raw[id]) ? raw[id] : [])),
      ])
      for (const id of CATEGORY_IDS) {
        const kept = base[id].filter((mid) => !touched.has(mid))
        const stored = Array.isArray(raw[id]) ? raw[id] : []
        base[id] = [...kept, ...stored]
      }
    }
  } catch { /* 무시 */ }
  return base
}
function loadUnassignedMaps() {
  try {
    const raw = JSON.parse(localStorage.getItem(CATMAP_KEY) ?? 'null')
    if (raw && Array.isArray(raw.unassigned)) return raw.unassigned
  } catch { /* 무시 */ }
  return []
}
function persistCategoryMaps(cm, unassigned = []) {
  try { localStorage.setItem(CATMAP_KEY, JSON.stringify({ ...cm, unassigned })) } catch { /* 무시 */ }
}
export const useMapStore = create((set, get) => ({
  maps: loadMaps(),            // { [id]: mapDefinition }
  activeMapId: loadActive(),   // 다음 전투에서 사용할 맵 id (null이면 레거시 기본 전장)
  nodeMaps: loadNodeMaps(),    // { [nodeId]: mapId } — (레거시) 노드별 고정 전투맵, BattleScreen 폴백용
  categoryMaps: loadCategoryMaps(), // { [type]: [mapId] } — 맵 유형(일반/특수/전략/보스)별 배정. 한 맵=한 유형.
  unassignedMaps: loadUnassignedMaps(), // 사용자가 명시적으로 미배정(✕)한 맵 id — 기본 풀 부활 방지 표식.
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

  // 맵 적용(배정) — 맵을 모든 유형에서 제거 후 지정 유형에 추가(type=null이면 미배정으로). 한 맵=한 유형(자동 이동).
  assignMapToType: (mapId, type) => {
    if (!mapId) return
    const cm = { ...get().categoryMaps }
    for (const c of CATEGORY_IDS) cm[c] = (cm[c] ?? []).filter((id) => id !== mapId)
    const valid = type && CATEGORY_IDS.includes(type)
    if (valid) cm[type] = [...(cm[type] ?? []), mapId]
    // 미배정(✕)은 명시 표식으로 남겨 다음 로드에서 기본 풀로 부활하지 않게 한다.
    const unassigned = valid
      ? get().unassignedMaps.filter((id) => id !== mapId)
      : [...new Set([...get().unassignedMaps, mapId])]
    persistCategoryMaps(cm, unassigned)
    set({ categoryMaps: cm, unassignedMaps: unassigned })
  },

  // 맵 완전 삭제 — maps·categoryMaps에서 모두 제거.
  removeMapEverywhere: (mapId) => {
    const maps = { ...get().maps }; delete maps[mapId]; persistMaps(maps)
    const cm = { ...get().categoryMaps }
    for (const c of CATEGORY_IDS) cm[c] = (cm[c] ?? []).filter((id) => id !== mapId)
    const unassigned = [...new Set([...get().unassignedMaps, mapId])]
    persistCategoryMaps(cm, unassigned)
    const activeMapId = get().activeMapId === mapId ? null : get().activeMapId
    if (get().activeMapId === mapId) persistActive(null)
    set({ maps, categoryMaps: cm, activeMapId, unassignedMaps: unassigned })
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
    // 전투 카테고리 할당·미배정 표식도 새 id로 갱신
    const cm = { ...get().categoryMaps }
    for (const c of CATEGORY_IDS) cm[c] = (cm[c] ?? []).map((id) => (id === oldId ? newId : id))
    const unassigned = get().unassignedMaps.map((id) => (id === oldId ? newId : id))
    persistCategoryMaps(cm, unassigned)
    set({ maps, categoryMaps: cm, unassignedMaps: unassigned })
  },

}))

// 이미지 basename의 유효 유형: 사용자 오버라이드 > 기본 분류 > null(기타).
export const mapTypeOf = (basename, overrides) => {
  const o = overrides ?? useMapStore.getState().mapCategories
  return o[basename] ?? PREDEFINED_MAP_TYPES[basename] ?? null
}

// 전투 종류(planet_normal 등)에 맞는 맵 유형의 배정 맵 중 랜덤 1개. 배정 없으면 null(→ 호출측 폴백).
// terrain(성계 지형: asteroid/nebula/mine/distortion)을 주면 metadata.terrains가 일치하는 맵을
// 우선 뽑는다 — 아르카디아=소행성, 오르페우스=성운처럼 성계별 전장 테마가 유지된다 (Phase 7-1).
// 일치하는 맵이 하나도 없으면 유형 전체 풀로 폴백(전투는 항상 성립).
export const pickCategoryMap = (battleCategory, terrain = null) => {
  if (!battleCategory) return null
  const types = BATTLE_CATEGORY_TO_TYPES[battleCategory] ?? [battleCategory]
  const { categoryMaps, maps } = useMapStore.getState()
  const ids = types.flatMap((t) => categoryMaps[t] ?? []).filter((id) => maps[id])
  if (!ids.length) return null
  const themed = terrain ? ids.filter((id) => maps[id]?.metadata?.terrains?.includes(terrain)) : []
  const pool = themed.length ? themed : ids
  return maps[pool[Math.floor(Math.random() * pool.length)]] ?? null
}

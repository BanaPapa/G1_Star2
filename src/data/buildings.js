// 건물 정의 — v1.0 (건물 시스템 설계 문서 기준)
// 비용 키: sc=Stellar, ti=Alloy, ec=Energy Crystal, nc=Nanocarbon, qd=Quantum Data, ur=고유자원

export const HOME_BUILDINGS = [
  'bld_command_center',
  'bld_research_lab',
  'bld_workshop',
  'bld_shipyard',
]

export const BUILDINGS = {
  bld_command_center: {
    id: 'bld_command_center',
    name: 'Command Center',
    icon: '🏛️',
    description: '함대 최대 보유량을 결정합니다.',
    maxLevel: 5,
    upgradeCosts: {
      2: { sc: 500,  ti: 100 },
      3: { sc: 1000, ti: 200, ec: 50 },
      4: { sc: 1800, ti: 350, nc: 50 },
      5: { sc: 3000, ti: 600, nc: 120, qd: 50 },
    },
    effectByLevel: {
      1: '최대 함선 보유량 2척',
      2: '최대 함선 보유량 4척',
      3: '최대 함선 보유량 6척',
      4: '최대 함선 보유량 8척',
      5: '최대 함선 보유량 10척',
    },
    fleetCap: { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 },
  },

  bld_research_lab: {
    id: 'bld_research_lab',
    name: 'Research Lab',
    icon: '🔬',
    description: '연구 해금 티어를 결정합니다.',
    maxLevel: 5,
    upgradeCosts: {
      2: { sc: 400,  ti: 80 },
      3: { sc: 800,  ti: 150, ec: 40 },
      4: { sc: 1500, ti: 250, nc: 40,  ec: 80 },
      5: { sc: 2500, ti: 400, nc: 100, ec: 150, qd: 50 },
    },
    effectByLevel: {
      1: '연구 가능 Tier I',
      2: '연구 가능 Tier II',
      3: '연구 가능 Tier III',
      4: '연구 가능 Tier IV',
      5: '연구 가능 Tier V',
    },
  },

  bld_workshop: {
    id: 'bld_workshop',
    name: 'Workshop',
    icon: '⚒️',
    description: '장비(무기·방어구·쉴드·엔진·코어 모듈)를 제작합니다.',
    maxLevel: 5,
    upgradeCosts: {
      2: { sc: 500,  ti: 80,  ec: 20 },
      3: { sc: 1000, ti: 180, ec: 60 },
      4: { sc: 1800, ti: 250, ec: 120, nc: 50 },
      5: { sc: 3000, ti: 400, ec: 250, nc: 120, qd: 50 },
    },
    effectByLevel: {
      1: '제작 가능 Tier I',
      2: '제작 가능 Tier II',
      3: '제작 가능 Tier III',
      4: '제작 가능 Tier IV',
      5: '제작 가능 Tier V',
    },
  },

  bld_shipyard: {
    id: 'bld_shipyard',
    name: 'Shipyard',
    icon: '🚀',
    description: '함선 제작·수리·장비 장착 및 교체를 담당합니다.',
    maxLevel: 5,
    upgradeCosts: {
      2: { sc: 500,  ti: 120 },
      3: { sc: 1000, ti: 220, ec: 40 },
      4: { sc: 1800, ti: 400, nc: 50 },
      5: { sc: 3000, ti: 700, nc: 150, qd: 50 },
    },
    effectByLevel: {
      1: '제작: Gunship, Frigate | 장착: Tier I',
      2: '제작: + Destroyer    | 장착: Tier II',
      3: '제작: + Cruiser      | 장착: Tier III',
      4: '제작: + Battlecruiser| 장착: Tier IV',
      5: '제작: + Dreadnought  | 장착: Tier V',
    },
  },

  bld_outpost: {
    id: 'bld_outpost',
    name: 'Outpost',
    icon: '🛰️',
    description: '점령 행성 운영 거점. 고유자원을 생산하고 간이수리를 지원합니다.',
    maxLevel: 5,
    upgradeCosts: {
      2: { sc: 300,  ti: 60,  ec: 20,  ur: 1 },
      3: { sc: 700,  ti: 120, ec: 50,  nc: 20,  ur: 3 },
      4: { sc: 1300, ti: 220, ec: 100, nc: 50,  ur: 6 },
      5: { sc: 2200, ti: 350, ec: 180, nc: 100, qd: 30, ur: 10 },
    },
    effectByLevel: {
      1: '고유자원 +1/h | 간이수리 50%',
      2: '고유자원 +2/h | 간이수리 75%',
      3: '고유자원 +4/h | 완전수리 가능',
      4: '고유자원 +6/h | 해당 계열 연구비 -10%',
      5: '고유자원 +10/h| 해당 계열 제작비 -10%',
    },
    productionByLevel: { 1: 1, 2: 2, 3: 4, 4: 6, 5: 10 },
    repairByLevel: {
      1: '간이수리 50%',
      2: '간이수리 75%',
      3: '완전수리 가능',
      4: '완전수리 + 연구비 -10%',
      5: '완전수리 + 연구비/제작비 -10%',
    },
  },
}

// 비용 객체를 사람이 읽기 쉬운 문자열로 변환
const COST_LABELS = {
  sc: 'Stellar',
  ti: 'Alloy',
  ec: 'Energy Crystal',
  nc: 'Nanocarbon',
  qd: 'Quantum Data',
  ur: '고유자원',
}

export function formatBuildingCost(cost) {
  if (!cost) return '—'
  return Object.entries(cost)
    .map(([k, v]) => `${COST_LABELS[k] ?? k} ${v}`)
    .join(' + ')
}

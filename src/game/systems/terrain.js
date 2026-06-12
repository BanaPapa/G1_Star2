// 전술 전투 지형 타입
// passable     : 이동 가능 여부
// evaMod       : 이 칸에 있는 방어자 EVA 보정 (양수=유리)
// accMod       : 이 칸을 노리는 공격자 ACC 보정 (음수=불리)
// entryDamage  : 진입 시 최대 HP 대비 % 피해 (0=없음)
// movCost      : 진입 시 추가 소모 AP (기본 이동 1AP 위에 추가)
// periodicDamage: 매 턴 시작 시 최대 HP 대비 % 피해 (0=없음)
export const TERRAIN_TYPES = {
  empty: {
    id: 'empty', label: '빈 공간', passable: true,
    evaMod: 0, accMod: 0, entryDamage: 0, movCost: 0, periodicDamage: 0,
    color: 0x0c1530, glyph: '',
    desc: '특수 효과 없음.',
    effect: null,
  },
  asteroid: {
    id: 'asteroid', label: '소행성', passable: false,
    evaMod: 0, accMod: 0, entryDamage: 0, movCost: 0, periodicDamage: 0,
    color: 0x3a3024, glyph: '🪨',
    desc: '이동 불가 장애물. 경로를 완전히 차단합니다.',
    effect: '이동 불가',
  },
  debris: {
    id: 'debris', label: '우주 잔해', passable: true,
    evaMod: 15, accMod: 0, entryDamage: 5, movCost: 0, periodicDamage: 0,
    color: 0x2a2840, glyph: '🛰️',
    desc: '잔해 속 엄폐 — 방어자 EVA +15. 진입 시 기체 HP 5% 손상.',
    effect: 'EVA +15 / 진입 HP -5%',
  },
  nebula: {
    id: 'nebula', label: '성운', passable: true,
    evaMod: 10, accMod: -20, entryDamage: 0, movCost: 0, periodicDamage: 0,
    color: 0x1a0a44, glyph: '≈',
    desc: '가스 구름 — 방어자 EVA +10, 이 칸을 노리는 공격자 ACC -20.',
    effect: 'EVA +10 / 공격자 ACC -20',
  },
  asteroid_field: {
    id: 'asteroid_field', label: '소행성 군', passable: true,
    evaMod: 10, accMod: 0, entryDamage: 10, movCost: 1, periodicDamage: 0,
    color: 0x2d2015, glyph: '∗',
    desc: '밀집 소행성 — 방어자 EVA +10, 진입 시 HP -10%, 이동 비용 +1 AP.',
    effect: 'EVA +10 / 진입 HP -10% / 이동 +1AP',
  },
  minefield: {
    id: 'minefield', label: '기뢰 지대', passable: true,
    evaMod: 0, accMod: 0, entryDamage: 25, movCost: 0, periodicDamage: 0,
    color: 0x3a1010, glyph: '!',
    desc: '기뢰 지대 — 진입 시 HP -25%. 적을 유인하는 함정으로 활용 가능.',
    effect: '진입 HP -25%',
  },
  plasma_storm: {
    id: 'plasma_storm', label: '플라즈마 폭풍', passable: true,
    evaMod: 0, accMod: -10, entryDamage: 0, movCost: 0, periodicDamage: 3,
    color: 0x2d0a24, glyph: '~',
    desc: '에너지 폭풍 — 매 턴 시작 시 HP -3%, 이 칸을 노리는 공격자 ACC -10.',
    effect: '매 턴 HP -3% / 공격자 ACC -10',
  },
}

export function getTerrain(id) {
  return TERRAIN_TYPES[id] ?? TERRAIN_TYPES.empty
}

// 전술 전투 지형 타입 (MOD-1 프로토타입 — systems.json terrain 값 중 그리드에 표시할 3종).
// passable: 이동 가능 여부 / cover: 엄폐 제공 여부(명중·회피 계산에서 방어자의 유효 EVA 보정에 사용).
export const TERRAIN_TYPES = {
  empty: { id: 'empty', label: '빈 공간', passable: true, cover: false, color: 0x0c1530, glyph: '' },
  asteroid: { id: 'asteroid', label: '소행성', passable: false, cover: true, color: 0x3a3024, glyph: '🪨' },
  debris: { id: 'debris', label: '잔해', passable: true, cover: true, color: 0x2a2840, glyph: '🛰️' },
}

export function getTerrain(id) {
  return TERRAIN_TYPES[id] ?? TERRAIN_TYPES.empty
}

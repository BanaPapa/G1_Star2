// 시설 티어 게이트 (Phase 5-4) — 연구소/워크샵 건물 레벨이 연구·제작 티어를 실제로 막는다.
// 연구 티어: config.combat.weaponTierByResearch 재사용 (전장 크기 연동과 같은 매핑 — 단일 출처).
//   미등록 노드(방어공학·채굴 효율 등)는 Tier 1 = 연구소 Lv1부터 가능.
// 제작 티어: 결과물 아이템의 tier — tier 없는 아이템(모듈 등)은 Tier 1 = 워크샵 Lv1부터 가능.
// 건물 effectByLevel 규칙(buildings.js): 연구소/워크샵 Lv N = Tier N까지 허용.

/** 연구 노드에 필요한 연구소 레벨(=티어). @returns {number} 1~5 */
export function researchRequiredTier(nodeId, config) {
  const tier = config?.combat?.weaponTierByResearch?.[nodeId]
  return typeof tier === 'number' ? tier : 1
}

/** 조합 레시피에 필요한 워크샵 레벨(=결과물 티어). @returns {number} 1~5 */
export function recipeRequiredTier(recipe, itemsById) {
  const tier = itemsById?.get(recipe.result)?.tier
  return typeof tier === 'number' ? tier : 1
}

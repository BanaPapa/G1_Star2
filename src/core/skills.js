// 스킬/필살기 데이터 가공용 순수함수 — Phaser에 의존하지 않고 skills.json 구조를 그대로 다룬다.
//
// skills.json 구조 요약: type "active"(통상, AP 소모) / "finisher"(필살기, TP "full" 소모).
// effect는 함수마다 다른 필드를 갖는 구조화 객체이며, 여기서는 그 필드를 그대로 읽어
// "무엇을 누구에게 적용해야 하는지"를 계산한다 — 실제 Phaser 연출/상태 반영은 호출자(Scene) 책임.

// unit이 사용 가능한 통상 스킬 목록 (restrict가 있으면 해당 함선 클래스 전용).
export function getUsableSkills(unit, allSkills) {
  return allSkills.filter((skill) => skill.type === 'active' && (!skill.restrict || skill.restrict === unit.ship.id))
}

// ace.finisher(스킬 id 문자열)가 가리키는 필살기 스킬 객체를 찾는다.
export function getFinisher(ace, allSkills) {
  if (!ace) return null
  return allSkills.find((skill) => skill.id === ace.finisher) ?? null
}

// 사용자 → 조준 칸 방향을 4방向(상하좌우) 중 하나로 스냅하고,
// 그 직선 위에서 사용자보다 먼 칸에 있는 적 유닛들을 가까운 순으로 모은다 (광휘 돌격의 "직선 관통").
export function collectLineTargets(user, aimCell, units, bounds) {
  const dx = aimCell.x - user.gridX
  const dy = aimCell.y - user.gridY
  if (dx === 0 && dy === 0) return []

  const stepX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0
  const stepY = stepX === 0 ? Math.sign(dy) : 0
  const enemies = units.filter((u) => u.side !== user.side)

  const targets = []
  let cx = user.gridX + stepX
  let cy = user.gridY + stepY
  while (cx >= 0 && cy >= 0 && cx < bounds.cols && cy < bounds.rows) {
    const hit = enemies.find((e) => e.gridX === cx && e.gridY === cy)
    if (hit) targets.push(hit)
    cx += stepX
    cy += stepY
  }
  return targets
}

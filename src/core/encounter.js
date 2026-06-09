// 별계 노드(systems.json)의 적 구성을 enemies.json + ships.json 베이스 스탯과 합성해
// BattleScene이 그대로 스폰할 수 있는 "적 함선 데이터" placement 배열로 만든다(MOD-6).
// 보스/미니보스의 페이즈·전용 컷인 연출은 MOD-11의 몫 — 여기서는 데이터의 stats 그대로
// 일반 유닛처럼 배치해 "별계 진입 시 그 별계의 적과 싸운다"는 흐름만 연결한다.

const STAT_KEYS = ['hp', 'atk', 'def', 'acc', 'eva', 'mov', 'rng', 'ap']
const DEFAULT_TP_PER_TURN = 1 // enemies.json의 unique/boss 항목엔 tpPerTurn이 없다 — 표시용 기본치
const THREAT_SCALE_PER_TIER = 0.3 // 위협 레벨 1당 스탯 30% 증가 (tier1=1.0x, tier6=2.5x)

// enemies.json 한 항목을 스폰 가능한 "함선 데이터" 형태로 합성한다.
// base 참조형(예: void_scout → scout)은 ships.json 베이스 능력치를 그대로 쓰고,
// stats 명시형(unique/miniboss/boss)은 그 stats를 그대로 쓴다 — 이름·스프라이트만 적 고유로 교체.
// base형 적만 threatLevel 스케일링 적용 — 고유 stats형(unique/boss)은 이미 수동 조정된 값.
function resolveEnemyShip(enemyDef, shipsById, threatLevel = 1) {
  const base = enemyDef.base ? shipsById.get(enemyDef.base) : null
  const source = base ?? enemyDef.stats
  if (!source) return null

  const stats = {}
  for (const key of STAT_KEYS) stats[key] = source[key]
  stats.tpPerTurn = source.tpPerTurn ?? DEFAULT_TP_PER_TURN

  if (base && threatLevel > 1) {
    const m = 1 + (threatLevel - 1) * THREAT_SCALE_PER_TIER
    stats.hp = Math.round(stats.hp * m)
    stats.atk = Math.round(stats.atk * m)
    stats.def = Math.round(stats.def * m)
  }

  return { ...stats, id: enemyDef.id, name: enemyDef.name, sprite: enemyDef.sprite }
}

// node.enemy(+miniboss/boss) id들을 순서대로 positions에 배치한 placement 배열을 만든다.
// 자체 ship 데이터를 직접 들고 있으므로(shipId 조회 불필요) BattleScene.spawnUnit이 placement.ship을
// 우선 사용하도록 되어 있다.
export function buildEncounterPlacements(node, { enemiesById, bossesById, shipsById, positions }) {
  if (!node) return []

  const threatLevel = node.threatLevel ?? 1
  const enemyIds = [...(node.enemy ?? [])]
  if (node.miniboss) enemyIds.push(node.miniboss)
  if (node.boss) enemyIds.push(node.boss)

  const placements = []
  enemyIds.forEach((enemyId, index) => {
    const enemyDef = enemiesById.get(enemyId) ?? bossesById.get(enemyId)
    const ship = enemyDef && resolveEnemyShip(enemyDef, shipsById, threatLevel)
    if (!ship) return

    const pos = positions[index % positions.length]
    placements.push({ side: 'enemy', shipId: ship.id, ship, x: pos.x, y: pos.y })
  })
  return placements
}

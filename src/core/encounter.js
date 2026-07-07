// 별계 노드(systems.json)의 적 구성을 enemies.json + ships.json 베이스 스탯과 합성해
// BattleScene이 그대로 스폰할 수 있는 "적 함선 데이터" placement 배열로 만든다(MOD-6).
// 보스/미니보스의 페이즈·전용 컷인 연출은 MOD-11의 몫 — 여기서는 데이터의 stats 그대로
// 일반 유닛처럼 배치해 "별계 진입 시 그 별계의 적과 싸운다"는 흐름만 연결한다.

const STAT_KEYS = ['hp', 'atk', 'def', 'acc', 'eva', 'mov', 'rng', 'ap']
const DEFAULT_TP_PER_TURN = 1 // enemies.json의 unique/boss 항목엔 tpPerTurn이 없다 — 표시용 기본치
const THREAT_SCALE_PER_TIER = 0.2 // 위협 레벨 1당 스탯 20% 증가
// 스케일 기준점: threat1=0.70x (플레이어보다 약함) → threat3=1.10x → threat7=1.90x
const THREAT_BASE = 0.7

// enemies.json 한 항목을 스폰 가능한 "함선 데이터" 형태로 합성한다.
// base 참조형은 ships.json 스탯을 threatLevel 스케일로 조정해 사용.
// stats 명시형(unique/boss)은 그 stats를 그대로 씀 — 이름·스프라이트만 적 고유로 교체.
function resolveEnemyShip(enemyDef, shipsById, threatLevel = 1) {
  const base = enemyDef.base ? shipsById.get(enemyDef.base) : null
  const source = base ?? enemyDef.stats
  if (!source) return null

  const stats = {}
  for (const key of STAT_KEYS) stats[key] = source[key]
  stats.tpPerTurn = source.tpPerTurn ?? DEFAULT_TP_PER_TURN
  stats.aiTactic = enemyDef.aiTactic ?? 'aggressive'

  if (base) {
    const m = THREAT_BASE + (threatLevel - 1) * THREAT_SCALE_PER_TIER
    stats.hp  = Math.round(stats.hp  * m)
    stats.atk = Math.round(stats.atk * m)
    // DEF는 스케일하지 않음 — 플레이어 ATK 성장으로 극복하는 구조.
    // EVA는 기본치의 30%로 고정 — 적이 지나치게 회피해 전투가 늘어지는 것 방지.
    stats.eva = Math.round(stats.eva * 0.3)
  }

  // base(원본 플레이어 함급) = 투항 포획 시 로스터 함급 매핑용 (Phase 5-3).
  // role 'boss' = 투항 불가 판정용 — enemies.json type(miniboss/galaxy_boss)에서 환산.
  const isBoss = typeof enemyDef.type === 'string' && enemyDef.type.includes('boss')
  return { ...stats, id: enemyDef.id, name: enemyDef.name, sprite: enemyDef.sprite, base: enemyDef.base ?? null, role: isBoss ? 'boss' : '' }
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

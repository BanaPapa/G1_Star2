// 세이브 스키마 버전 + 마이그레이션 프레임 (Phase 11-1)
// 렌더러/스토어 비의존 순수 모듈 — vitest 테스트 대상.
// 출시 후 세이브 포맷이 바뀌어도 구세이브를 로드할 수 있도록 버전 체인 변환을 제공한다.

// 현재 빌드가 쓰는 스키마 버전. 버전 필드가 없는 기존 세이브는 v1로 간주한다.
export const SAVE_SCHEMA_VERSION = 2

// 버전 n → n+1 순수 변환 함수 맵.
// 각 함수는 새 객체를 반환하고 schemaVersion을 n+1로 올린다. 원본은 변형하지 않는다.
const MIGRATIONS = {
  // v1 → v2: 기존 load()의 `??` 임기응변 폴백을 데이터로 정규화(정착)한다.
  1: (data) => ({
    ...data,
    schemaVersion: 2,
    progress: {
      currentNodeId:    data.progress?.currentNodeId    ?? null,
      conqueredNodeIds: data.progress?.conqueredNodeIds  ?? [],
      miningDeposits:   data.progress?.miningDeposits    ?? {},
      obtainedHiddens:  data.progress?.obtainedHiddens   ?? [],
      recruitedAces:    data.progress?.recruitedAces     ?? [],
      fleetPos:         data.progress?.fleetPos          ?? null,
    },
    fleet: {
      roster:     data.fleet?.roster     ?? [],
      ownedItems: data.fleet?.ownedItems ?? {},
    },
    research:    { unlockedIds: data.research?.unlockedIds ?? [] },
    development: { developed:   data.development?.developed ?? [] },
    story:       { seenIds: data.story?.seenIds ?? [], choices: data.story?.choices ?? {} },
    resources:   { wallet: data.resources?.wallet ?? {} }, // 손상 세이브에서도 로드가 throw하지 않게 정규화
    // buildings는 load 쪽 분기(있으면 loadState)를 유지하므로 원본 그대로 통과.
  }),
}

// raw 세이브를 현재 스키마 버전으로 마이그레이션한다. 원본 raw는 변형하지 않는다(불변).
// 반환:
//   { ok: true,  data, fromVersion }
//   { ok: false, reason: 'newer' | 'corrupt', fromVersion }
export function migrateSave(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'corrupt', fromVersion: null }
  }

  const from = raw.schemaVersion ?? 1

  if (typeof from !== 'number' || !Number.isFinite(from)) {
    return { ok: false, reason: 'corrupt', fromVersion: from }
  }

  // 미래 빌드가 만든 세이브 — 로드 거부, 데이터는 보존.
  if (from > SAVE_SCHEMA_VERSION) {
    return { ok: false, reason: 'newer', fromVersion: from }
  }

  // 이미 현재 버전 — 그대로 통과.
  if (from === SAVE_SCHEMA_VERSION) {
    return { ok: true, data: raw, fromVersion: from }
  }

  // 구버전 — 마이그레이션 체인을 순서대로 적용.
  let data = raw
  for (let v = from; v < SAVE_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (typeof step !== 'function') {
      // 체인에 갭이 있으면 안전하게 로드를 거부한다.
      return { ok: false, reason: 'corrupt', fromVersion: from }
    }
    data = step(data)
  }

  return { ok: true, data, fromVersion: from }
}

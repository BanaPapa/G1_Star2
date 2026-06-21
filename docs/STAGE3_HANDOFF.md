# 7star 전투 시스템 — 3단계 완료 인계 문서

> 작성일: 2026-06-20 · 브랜치: main · 빌드: ✅ 통과
> 다음 세션에서 이 문서를 읽고 바로 이어서 작업할 수 있도록 작성된 단일 인계 문서.

---

## 0. 30초 요약

Stage 3의 7개 작업 **전부 완료**. 코드베이스에 **비파괴(additive)** 원칙으로 추가됨.

| # | 작업 | 상태 |
|---|------|------|
| 1 | 방어 태세 / 경계 태세 행동 | ✅ |
| 2 | 기함 시스템 | ✅ |
| 3 | 후퇴·교섭 기함 기준 판정 | ✅ |
| 4 | 필드효과 런타임 적용 | ✅ |
| 5 | 투항 보상 + Shield 이월 | ✅ |
| 6 | 무기별 AP·사거리·관통 | ✅ |
| 7 | 관제실 override 런타임 적용 | ✅ |

---

## 1. 빠른 시작

```bash
cd C:\dev\star2
npm run dev        # http://localhost:5174
npm run build      # 빌드 검증 (청크 경고는 기존 — 무시)
npm test           # combatMath 단위 테스트 29개
```

---

## 2. Stage 3 작업 상세

### Task 1 — 방어 태세 / 경계 태세

**파일:** `BattleScene.js`, `BattleScreen.jsx`

- 방어 태세: 남은 AP를 전부 소모, `unit.defenseReduction` 설정 → `resolveCombat`의 `resolveDamagePipeline`에서 자동 적용
- 경계 태세: 남은 AP를 전부 소모, `unit._overwatchActive = true` 설정 → 적 이동 시 `_triggerOverwatch()` 호출
- `calculateOverwatchChance(unit, config)` (combatMath/stance.js) 사용
- `BattleScreen.jsx`에 방어/경계 버튼 추가, AP 0일 때 비활성화

### Task 2 — 기함 시스템

**파일:** `BattleScene.js`, `BattleScreen.jsx`, `src/core/combatMath/flagship.js` (기존)

- `designateFlagships()` — 양 진영 `calculateFlagshipPower` 점수 최고 유닛에 `isFlagship = true` 설정
- 기함 격파 시 상대 진영 명중률 패널티 적용 (`flagshipAccPenalty`)
- BattleScreen 상단 HUD에 기함 강조 표시

### Task 3 — 후퇴·교섭

**파일:** `BattleScene.js`, `BattleScreen.jsx`

- `calculateRetreatChance` / `calculateNegotiationChance` (combatMath/flagship.js) 사용
- 성공 → `setPendingFlee()`: 다음 턴 시작 시 `executeFlee()` 자동 실행
- 실패 → `penalizeFlagshipAp()`: 기함 AP를 0으로 소모
- 후퇴/도주 시 `saveShields()` 호출해 Shield 이월

### Task 4 — 필드효과 런타임

**파일:** `BattleScene.js`, `src/game/systems/terrain.js`

- `_resolveFieldParams(terrain, config)` — `config.combat.fieldEffects.params`에서 수치 읽기 (없으면 terrain.js fallback)
- 진입 피해: `applyEntryDamage()` 가 `_resolveFieldParams`로 비율 계산
- 주기 피해: `applyPeriodicTerrainDamage()` 가 매 턴 적용
- 이동 비용: player/AI 이동 콜백 양쪽 모두 `1 + extraMoveCost`
- 신규 지형 4종 추가: `portal`, `residual_heat`, `gravity_well`, `black_hole`
- 기존 지형 `fieldEffectType` 연결: `minefield→'mine'`, `plasma_storm→'energy_storm'`, `distortion→'residual_heat'`

### Task 5 — 투항 보상 + Shield 이월

**파일:** `BattleScene.js`, `useFleetStore.js`, `defaultGameConfig.js`

- 적 격파 시 `_rollSurrender(unit)` — `config.combat.surrender.baseChance` 확률 (기본 20%), 보스 제외
- 투항 성공 시 `_captureEnemyShip(unit)` → `useFleetStore.addCapturedShip()` → 로스터에 추가
- Shield 이월: 전투 종료(승리/도주) 시 `saveShields(shieldMap)`, 다음 전투 `spawnUnit`에서 `rEntry.currentShield` 복원
- `useFleetStore`: `freshEntry`에 `currentShield: null` 추가, `saveShields`, `addCapturedShip` 액션

### Task 6 — 무기별 AP·사거리·관통

**파일:** `items.json`, `BattleScene.js`, `core/ai.js`

- `items.json` 모든 무기에 `apCost`, `rangeBonus`, `pierce` 필드 추가
- `_getEquippedWeaponData(unit, config)` 헬퍼 — 장착 무기 스탯 + config override 조합
- `spawnUnit`에 `weaponRangeBonus` IIFE 필드 추가 (AI `inAttackRange`에서 사용)
- `handleEnemyClick`: 실효 사거리 = `baseMaxRng + rangeBonus`, AP 부족 시 공격 차단
- `resolveCombat`: `spendAp(weaponData.apCost)`, `shieldPierce: weaponData.pierce`
- `core/ai.js` `inAttackRange`: `unit.weaponRangeBonus ?? 0` 적용

### Task 7 — 관제실 override 런타임 적용

**파일:** `buildings.js`, `PlanetManagementScreen.jsx`, `MaintenanceHubScreen.jsx`, `BattleScene.js`

- **buildings**: `getEffectiveBuildingDef(id, config)` — deep-merge로 `upgradeCosts`, `maxLevel`, `fleetCap` 등 실시간 override
  - 사용처: `PlanetManagementScreen.jsx` `BuildingCard`
- **research**: `config.overrides.research[nodeId]` = `{ cost, prereq, ... }` shallow-merge
  - 사용처: `MaintenanceHubScreen.jsx` → `ResearchTab` / `CraftTab`에 `effectiveResearch` 전달
- **resources**: `config.overrides.resources[id]` = `{ name, icon, ... }` shallow-merge (메타데이터 표시명 등)
  - 사용처: `MaintenanceHubScreen.jsx` `ResourceBar` + `resourcesById`
- **enemyScaling**: `config.overrides.enemyScaling[enemyId]` 또는 `"*"` = `{ hpMult, atkMult, defMult, accMod, evaMult }`
  - 사용처: `BattleScene.js` `spawnUnit` — 적 유닛 스폰 직후 배율 적용

---

## 3. 주요 파일 변경 목록 (Stage 3)

```
src/game/scenes/BattleScene.js          # Stage 3의 모든 전투 로직 중심
src/ui/screens/BattleScreen.jsx         # 방어/경계 버튼, 기함 HUD, 후퇴/교섭 로직
src/game/systems/terrain.js             # 4개 신규 지형 + fieldEffectType 연결
src/data/defaultGameConfig.js           # combat.surrender, fieldEffects.params 섹션
src/state/useFleetStore.js              # currentShield, saveShields, addCapturedShip
src/data/items.json                     # 무기에 apCost/rangeBonus/pierce 추가
src/core/ai.js                          # inAttackRange weaponRangeBonus 적용
src/data/buildings.js                   # getEffectiveBuildingDef 헬퍼
src/ui/screens/PlanetManagementScreen.jsx  # getEffectiveBuildingDef 사용
src/ui/screens/MaintenanceHubScreen.jsx    # research/resources override 적용
```

---

## 4. 다음 단계 — Stage 4 (미착수)

Stage 3까지 전투 핵심 시스템이 완성됨. Stage 4는 확장/폴리시 영역.

### 우선순위 순

| # | 항목 | 비고 |
|---|------|------|
| 1 | **필살기 피해 파이프라인 통합** | 현재 `resolveAttack`(구 모델)이 Shield 우회. `resolveDamagePipeline`으로 통일 여부 결정 (`BattleScene.js` 라인 ~1096) |
| 2 | **무기 슬롯 다중 선택 UI** | 현재 단일 무기 슬롯. `FleetScreen.jsx`에서 슬롯 선택 UI 추가 |
| 3 | **지형별 이동 AP 전체 적용** | `_resolveFieldParams`는 완성됨. `grid.js` AI 이동 비용 통합 확인 |
| 4 | **경계 태세 지속 시간** | 현재 턴 전환 시 해제. `config.combat.overwatch.duration` 활용해 다중 턴 유지 옵션 |
| 5 | **투항 함선 편성 UI** | `addCapturedShip` 완성됨. `FleetScreen`에 포획 함선 표시/배치 UI 필요 |
| 6 | **전투 기록 / 전적** | 전투 결과를 로그로 저장, 관제실 Debug 탭에 표시 |
| 7 | **보스 2페이즈 연출** | `triggerBossPhase2` 호출 로직이 있으나 UI 연출(컷인) 미구현 |

---

## 5. 검증 체크리스트

```bash
npm test        # 29개 통과
npm run build   # ✅ (청크 경고는 기존)
npm run dev     # 콘솔 에러 없이 부팅
```

수동 확인:
- 전투 → 유닛 선택 → **방어** 버튼 클릭 → AP 소모, 방어 태세 아이콘 표시
- 전투 → 유닛 선택 → **경계** 버튼 클릭 → 적 이동 시 반격 발동
- 전투 → 기함 격파 → 상대 진영 명중률 패널티 적용 HUD 메시지 확인
- 전투 → 후퇴 버튼 → 다음 턴 시작 시 이탈 확인
- 후퇴 실패 → 기함 AP 0 확인
- F9 관제실 → Building 탭 → `{ "bld_command_center": { "upgradeCosts": { "2": { "sc": 1 } } } }` 입력 → 적용 → 행성 관리에서 비용 1 SC로 변경됨 확인
- F9 관제실 → Research 탭 → `{ "weapon_eng_1": { "cost": { "ec": 1 } } }` 입력 → 적용 → 정비 허브에서 비용 1 EC로 변경됨 확인
- F9 관제실 → Enemy 탭 → `{ "*": { "hpMult": 0.1 } }` 입력 → 전투 진입 → 적 HP 10% 확인

---

## 6. 알려진 사항

### 알려진 lint (기존 — Stage 3에서 새로 추가되지 않음)
`StrategyMapScreen.jsx`, `BattleScreen.jsx` 기존 부분, `useSaveStore.js` — 17개 (Stage 3 이전부터 존재)

### 청크 크기 경고
`index-*.js` 1745KB — Phaser 때문으로 Stage 3 이전부터 존재. 동적 import 분할은 별도 작업.

### Codex CLI
`codex` 바이너리 미설치 상태. "codex spirit" (비판적 설계 리뷰 후 구현) 방식으로 모든 태스크 진행.

---

## 7. config override 예시 JSON

관제실(F9) 각 탭에 아래 예시를 붙여넣어 테스트할 수 있다.

**Buildings override** (`config.overrides.buildings`):
```json
{
  "bld_command_center": {
    "upgradeCosts": { "2": { "sc": 10 }, "3": { "sc": 20 } }
  }
}
```

**Research override** (`config.overrides.research`):
```json
{
  "weapon_eng_1": { "cost": { "ec": 1 } },
  "defense_eng_1": { "cost": { "ti": 1 } }
}
```

**Enemy scaling override** (`config.overrides.enemyScaling`):
```json
{
  "*": { "hpMult": 0.1, "atkMult": 0.5 }
}
```
*(모든 적 HP 10%, ATK 50% — 디버그용 쉬운 모드)*

**Ship stats override** (`config.overrides.shipStats`) — 이미 Stage 2부터 `ShipStatsTab.jsx`에서 적용 중:
```json
{
  "gunship": { "hp": 999, "atk": 100 }
}
```

**Weapon stats override** (`config.overrides.weaponStats`) — `_getEquippedWeaponData`에서 적용 중:
```json
{
  "railgun": { "apCost": 1, "rangeBonus": 3, "pierce": 80 }
}
```

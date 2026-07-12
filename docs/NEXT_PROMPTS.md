# NEXT_PROMPTS — 후행작업 프롬프트 큐

> **용도**: 대화 세션이 바뀌어도 작업이 이어지도록, 남은 작업을 "복붙 가능한 프롬프트" 형태로 쌓아두는 문서.
> 새 세션은 이 파일 하나만 읽으면 된다 (CLAUDE.md가 자동으로 안내함).
>
> **운영 규칙** (코딩 에이전트용):
> 1. 사용자가 "다음 진행"이라고 하면 이 문서의 **대기 목록 맨 위 항목부터** 실행한다. 단, `⏸ 트리거` 조건이 안 갖춰진 항목은 건너뛴다.
> 2. 항목을 완료하면 **그 항목을 이 문서에서 삭제**하고, MASTER_PLAN 체크박스를 갱신한 뒤 함께 커밋한다.
> 3. 작업 중 새 후행작업이 생기면 아래 형식(트리거/프롬프트/완료 기준)으로 이 문서에 추가한다.
> 4. "현재 상황" 절은 문서를 갱신할 때마다 날짜와 함께 최신화한다.

---

## 현재 상황 (2026-07-12)

- **Phase 1~5 완료** (전투 코어 → 무기 25종 → 경제 루프·조선소·수리·티어 게이트). 상세는 `docs/MASTER_PLAN.md`.
- **VFX WO-1~8 전부 완료** (2026-07-07): 타격감 레이어 + 계열별 디테일 + fx 텍스처 6장 연동(글로우/스파크/블랙홀/중력장/폭발·소멸 시트).
  원본 가공 스크립트는 `scripts/process_fx_textures.py` (생성 AI 출력 → 규격 리사이즈·크로마키·격자선 제거).
- **병렬 진행 중**: 별도 대화 세션에서 `docs/design/image_prompts/`의 프롬프트로 **이미지(아트) 생성 작업 중**.
  산출물은 `public/assets/`에 배치될 예정. 들어오면 아래 2번(아트 QA)이 실행 가능해진다.
- **Phase 6(캐릭터·스토리) 전체 완료** (2026-07-07): 루멘 네이밍 → 대사 시스템(StoryDialog) →
  노드별 대사 → 에이스 합류·레이븐 분기 → 니힐 문답·엔딩 분기 → 소품 대화.
- **Phase 7-1 완료** (2026-07-07): 내장 전투맵 21종 생성(배경 23장 전부 커버) + 성계 지형(terrains) 기반
  맵 추첨 + 기본 배정 시드. **전투 카메라 개편 병행**: 거친 그리드 표준(보스 11×9~특수 15×12)으로 함선 확대,
  시작=전술 줌(1.7×)·통상=팬만·격파/크리티컬만 줌 펀치(`combat.camera.*`).
  맵 세부 조정은 에디터에서 가능(생성기: `scripts/generate_builtin_maps.py`).
- **Phase 7-2 완료** (2026-07-08): 적 전원 무기 배정(enemies.json `weapon` — 5계열 커버) + 신규 적 2종
  (견인함 Gravity T2 · 소거함 Antimatter T2) + 성계별 조합 차별화(s2 이온 교란/s3 중력·물량/s4 정점 6종).
- **Phase 7-3 완료** (2026-07-08): 보스 패턴 강화 — 가르(측후방 DEF -50% 약점 + 전면 주포 +30%), 워든(1페이즈
  지휘함 증원 + 2페이즈 차원 파동 텔레그래프 예고). 순수 모듈 `game/combat/bossPatterns.js` + `combat.boss.*` config.
  구현 opus-coder 위임 + Codex 리뷰 2건 반영.
- **Phase 7-4 완료** (2026-07-08): 조합 레시피 1→10개(5계열 T3+T4, module_craft+워크샵 게이트, T5 제외) +
  상점 재고 조정(유령시장=T5 exotic 프리미엄 / 떠돌이상인=소모품·중티어 랜덤 보급). 순수 데이터.
  구현 opus-coder 위임 + Codex 리뷰 3건 오탐 판정.
- **Phase 7-5 분석 완료** (2026-07-08): 난이도 곡선 정량 분석 + **자동 오토배틀 실측** 리포트 `docs/design/balance_pass_7-5.md`.
  개별 스케일은 건강(단조 증가), 실측도 방향 일치 — s1 easy·s2 진입벽(조정 1순위)·s4 워든 장기전. **사용자 결정으로
  실수치 조정은 보류 → 7-6 완주 플레이테스트에서 체감 수집 후 관제실 튜닝.**
  **신규 후행(AI)**: void 간극 맵에서 자동전투 아군이 카이팅 원거리 적에 재접근 못 하고 정지 → 7-6/AI 폴리시에서 점검.
- **Phase 10 전체 완료** (2026-07-08, 사용자 "촌스러움" 피드백 기점 UI 폴리시 일괄):
  전투 카드덱 리디자인(미니카드+스프링 펼침) → 이모지 전면 SVG 아이콘화(함급 실루엣 6종·스탯·무기 계열) →
  10-2 화면 전환(워프/도킹 셔터/페이드, ScreenTransition) → 10-3 튜토리얼(첫 전투 4스텝·첫 입항 3스텝,
  tutorialSeen 플래그) → 10-4 무기 리치 툴팁·전투 액션 로그 패널(refreshHud 후킹)·데미지 스케일 팝.
  다음 코드 작업은 Phase 11(안정화) — 11-1 세이브 마이그레이션이 출시 전 필수.
- **효과음(SFX) 트랙** (2026-07-07): 준비 가이드 `docs/design/image_prompts/12_sfx_plan.md`.
  사용자가 효과음 파일을 `public/assets/sfx/`에 넣으면 아래 1번(WO-9)이 실행 가능해진다.
- **Phase 8 아트 파이프라인 진행 중** (2026-07-12, 힉스필드 MCP 세션):
  - **0단계 완료**: 이전 PC 생성분 41장 힉스필드 CDN 회수 → `docs/design/generated/` + `manifest.json`(생성 id·모델·타깃 파일명).
  - **8-2 기본 스킨 완료**: 헬리온 6함급 × 아이소 4방향 24장 적용(`scripts/process_hulls.py` 가공, ships.json hull 키,
    BattleScene 프리로드 확장, 모의전투 실검증). **단, 이 백색 플랫 스타일은 임시 폴백** — 사용자가 원하는 최종 스타일이 아님.
  - **핵심 신규 컨셉 (문서 미반영이었던 사용자 요구)**: 함선은 무기 5계열 테마 스킨을 가진다
    (Laser 창/렌즈/파란 관통선 · Ion 안테나/회로/초록 전자파 · Plasma 반응로/포대/붉은 폭발 ·
    Gravity 고리/중력핵/보라 왜곡 · Antimatter 백색장갑/검은 공허). 성계 5개(s0~s4)와 1:1 대응 예정(대응표 미확정).
  - **계열별 건십 후보 9안 보드**: `docs/design/generated/style_sheets/gunship_candidates_{계열}.png`.
    선정 기록은 같은 폴더 `SELECTIONS.md` — **레이저 = 04안 확정**, 나머지 4계열 미정.
  - **생성 모델 방침**: 대량 생성은 힉스필드 `nano_banana_2_lite`(1k, thinking=HIGH, 이미지 레퍼런스 지원),
    아이콘은 `recraft_v4_1`(vector), 초상화는 soul 계열. 모델은 generate_image 호출마다 지정.
  - **레이저 계열 라인 완성 (2026-07-12)**: 04안 → 탑다운 6함급(전부 1회 생성 통과) → `hull_{함급}_laser_{방향}` 24장.
    **건조 행성 스킨 시스템 구현**(사용자 결정: 원안): systems.json family(s0 plasma/s1 laser/s2 ion/s3 gravity/s4 antimatter,
    대응은 조정 가능) → buyShip이 현재 노드 family를 roster 인스턴스 `skin`에 기록 → BattleScene이
    `hull_{함급}_{skin}_{방향}` 텍스처 존재 시 우선, 없으면 기본 폴백. QA는 개발실 Debug 탭 "🎨 함대 스킨 순환" 버튼.
    생성 절차 상세(레퍼런스 크롭→media_upload→generate→process_hulls.py)는 git log 50fa017~ 및 manifest.json 참조.
  - 다음 작업은 아래 0번(이온 계열 라인) — 사용자가 "N단계 시작" 방식으로 단계별 트리거함.

---

## 대기 목록 (위에서부터 순서대로)

### 0. Phase 8 — 이온 계열 함선 라인 (레이저 파이프라인 반복)

**⏸ 트리거**: 힉스필드 MCP 연결된 세션에서 사용자가 "이온 계열 진행" 또는 "다음 계열"이라고 하면.

```
G1_Star2 Phase 8 이온 계열 함선 라인을 진행해줘. 레이저 계열과 동일한 파이프라인이야.
컨텍스트: docs/NEXT_PROMPTS.md 현재 상황 절 + docs/design/generated/style_sheets/SELECTIONS.md.

1) 선정: gunship_candidates_ion.png의 9안 중 1안을 이온 컨셉(안테나/회로/초록 전자파) 기준으로
   선정하고 SELECTIONS.md에 근거와 함께 기록. (탑다운 변환 적합성: 좌우 대칭·실루엣 명확·컴팩트)
2) 크롭: 선정안을 3×3 그리드에서 크롭 + 번호 라벨을 배경색으로 지움 →
   docs/design/generated/ion_gunship_ref_XX.png 저장.
3) 건십 생성: media_upload(+curl PUT+media_confirm) → generate_image(model=nano_banana_2_lite,
   thinking=HIGH, 크롭을 image_references로). 프롬프트 핵심: "referenced design exactly, strict top-down,
   nose pointing straight up, perfectly symmetrical, solid green chroma-key background, no shadow".
   이온 모티프(antenna arrays, circuit patterns, green EM glow #7FD9FF~green) 유지.
4) 건십 통과 후 → 건십 생성물(job id)을 레퍼런스로 5함급 병렬 생성 (프리깃 slim/디스트로이어 flank
   batteries/크루저 flagship graceful/배틀크루저 long spine/배틀십 fortress bulk — 레이저 때 프롬프트를
   git log에서 재활용). 전부 docs/design/generated/ion_topdown_{함급}.png 저장 + manifest.json 갱신.
5) 가공: scripts/process_hulls.py의 SKIN_SOURCES에 'ion' 블록 추가 →
   python scripts/process_hulls.py ion → hull_{함급}_ion_{ne,nw,se,sw} 24장.
6) 코드: BattleScene preload의 hullSkins 배열에 'ion' 추가 + DebugExportTab SKIN_CYCLE에 'ion' 추가.
   (스킨 해석·건조 배정 로직은 이미 구현됨 — 추가 코드 불필요)
7) 검증: 개발실 Debug 탭 "함대 스킨 순환"으로 ion 전환 → 모의전투 → window.__game 훅으로
   unit.hull이 hull_{함급}_ion인지 확인 → vitest·빌드 → 커밋/푸시.
완료 기준: 이온 스킨 6함급 전투 표시, SELECTIONS.md·MASTER_PLAN·이 문서 갱신, 테스트 통과.
```

**완료 기준**: 프롬프트 내 완료 기준과 동일. 이후 플라즈마 → 중력 → 반물질 순서로 같은 항목을 복제해 반복.

### 1. WO-9 — 전투 효과음(SFX) 시스템 연동

**⏸ 트리거**: `public/assets/sfx/`에 효과음 파일이 1개 이상 존재할 때. (전체 목록·파일명 규칙은 `docs/design/image_prompts/12_sfx_plan.md`)

```
public/assets/sfx/에 효과음 파일들이 들어왔어 (docs/design/image_prompts/12_sfx_plan.md §2의
파일명 규칙). 효과음 시스템을 만들어줘:

1) 사운드 매니저: 파일이 존재하는 것만 로드, 없는 키는 재생 요청이 와도 조용히 무시 (필수 — 폴백 원칙).
   Phaser 4 사운드 API 주의 (Phaser 3 지식으로 쓰지 말고 실제 동작 확인할 것).
2) 연결 지점: 무기 발사(계열별 sfx_{family}_fire, 없으면 sfx_laser_fire 폴백) / 명중 sfx_hit /
   크리티컬 sfx_crit / 폭발 sfx_explosion / 격파 sfx_destroy / T5 소멸 sfx_annihilate /
   이동 sfx_move / 선택 sfx_select / 턴 시작 sfx_turn_start / 승리·패배 sfx_victory·sfx_defeat.
3) 같은 소리가 한 프레임에 여러 번 겹치면 1회만 재생 (5×5 폭발에서 8중 재생 방지).
4) 설정: settings에 마스터 볼륨 슬라이더(0~100)와 음소거 토글. 수치 기본값은
   defaultGameConfig audio.* 섹션 신설 (하드코딩 금지 규칙 동일).
완료 기준: 모의 전투에서 발사→명중→격파 소리 확인, 파일 일부를 지워도 에러 없이 동작, npm test 통과.
```

**완료 기준**: 프롬프트 내 완료 기준과 동일. 완료 시 `12_sfx_plan.md`에 연동 완료 표기.

### 2. 아트 에셋 일괄 반영 QA

**⏸ 트리거**: 아트 세션이 `public/assets/`에 이미지(함선/무기/건물/배경/초상화 등)를 배치한 뒤.

```
public/assets/에 아트 세션이 만든 이미지들이 들어왔어. 게임 전체를 돌면서
새 에셋이 실제로 표시되는지 QA해줘:
1) 에셋 파일명이 코드가 기대하는 키(AssetImage assetKey, ships.json sprite,
   docs/design/image_prompts/ 각 파일의 파일명 규격)와 일치하는지 대조 — 불일치는 표로 보고.
2) 타이틀/성단맵/입항 화면/함대 편성/전투에서 ? 폴백이나 이모지가 남아 있는 곳 스크린샷.
3) 콘솔 404/로드 에러 없는지 확인.
누락·불일치는 수정하지 말고 먼저 보고할 것 (파일명 변경은 아트 세션 쪽에서 할 수도 있음).
```

**완료 기준**: 반영/누락 현황 보고서. 이후 필요 시 리네임·코드 수정은 별도 지시로.

### 3. Phase 11 계속 — 11-3 대형 파일 리팩토링부터

**⏸ 트리거**: 없음 (바로 실행 가능). 11-1·11-2 완료됨 (2026-07-08).

```
Phase 11(안정화)을 계속하자. docs/MASTER_PLAN.md Phase 11 목록 순서대로:
11-3 대형 파일 리팩토링 — BattleScene.js(4,000줄+)와 StrategyMapScreen.jsx(1,700줄+) 분할.
동작 불변 리팩토링이 원칙: 순수 로직(그리기/AI/조우 판정/카메라/소환 등)을 모듈로 추출하고
씬/스크린은 오케스트레이션만 남긴다. 분할 단위마다 npm test + 모의 전투 E2E로 회귀 확인.
큰 diff가 되므로 한 커밋에 한 추출 단위씩 쪼개서 진행 권장.
각 항목 완료마다 MASTER_PLAN 체크 + 커밋 (기존 방식 동일).
```

**완료 기준**: 항목별 MASTER_PLAN 체크 + 커밋.

### 4. Phase 7 마무리 — 7-6 완주 플레이테스트 (사용자와 함께)

**⏸ 트리거**: 사용자 참여 필요 (혼자 자동 진행 불가 — 실제 플레이 체감 수집이 목적).
7-1~7-4 완료 + 7-5 분석 리포트 완료 (2026-07-08).

```
Phase 7-6 완주 플레이테스트를 함께 하자. 새 게임→엔딩까지 플레이하며:
1) 각 성계 첫 진입 승률·전투 길이(턴 수)·스트레스 지점을 기록.
2) docs/design/balance_pass_7-5.md의 "만약 조정한다면" 노브(가르 hp·워든 파동/증원·
   s1→s2 진입·s2/s3 골짜기)를 체감과 대조.
3) 막히는 곳·과한 곳을 관제실(F9)로 즉석 조정 → 좋으면 Export → defaultGameConfig 반영(7-5 실조정).
4) 총 플레이 시간 측정(목표 4~6시간 볼륨).
내가 관제실 조작·수치 조정을 대행할 테니, 너는 플레이하며 체감을 알려줘.
```

**완료 기준**: 완주 1회 + balance_pass_7-5.md 갱신(실측 반영) + 7-5/7-6 MASTER_PLAN 체크 + 커밋.

---

## 완료된 항목 기록 (최근 5개만 유지)

- 2026-07-08 Phase 7-5 밸런스 분석 리포트 — balance_pass_7-5.md, 곡선 정량 분석(실조정은 7-6 후로 보류)
- 2026-07-08 Phase 7-4 조합·상점 확충 — 레시피 1→10개(5계열 T3+T4), 유령시장/떠돌이상인 재고, recipes.test.js
- 2026-07-08 Phase 7-3 보스 패턴 강화 — 가르 약점/전면주포 + 워든 증원/텔레그래프, bossPatterns.js, Codex 리뷰 반영
- 2026-07-08 Phase 7-2 적 무기·성계 조합 (커밋 `888c068`) — 적 11종 전원 5계열 무기, 신규 2종, AI AP 가드
- 2026-07-07 Phase 7-1 전투맵 배정 + 카메라 개편 (커밋 `ca5ae53`) — 내장 맵 21종, 지형 추첨, 전술 줌/줌 펀치

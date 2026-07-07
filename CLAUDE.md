# 7★ (g1_star2) — 세션 시작 안내

턴제 우주 함대 SRPG (React + Phaser + Zustand + Vite).

## 세션 시작 시 필수

- **`docs/NEXT_PROMPTS.md`를 먼저 읽을 것.** 세션 간 이어지는 후행작업이 프롬프트 큐로 관리된다.
  사용자가 "다음 진행"이라고 하면 그 문서의 대기 목록 맨 위(트리거 충족 항목)부터 실행한다.
- 전체 로드맵·진행 상태는 `docs/MASTER_PLAN.md` (Phase 체크박스가 단일 진실).
- 항목 완료 시: NEXT_PROMPTS 항목 삭제 + MASTER_PLAN 체크 + 커밋 (검증 결과를 커밋 메시지에 기록).

## 자주 쓰는 명령

- `npm test` — vitest 단위 테스트 (커밋 전 필수 통과)
- `npm run build` — 프로덕션 빌드 확인
- `npm run dev` — 5173 점유 시 5174로 뜸

## E2E 요령

- 전투: 관제실(F9/⚙) → Battle Map Editor → 🧪 테스트 = 즉시 모의 전투. dev 훅 `window.__battleScene`.
- 경제/시설: 새 게임 → 입항(모항). 자원 부족하면 관제실 → Debug/Export 탭 → "💰 자원 지급".
- 게임 수치는 하드코딩 금지 — `defaultGameConfig`(`combat.*`, `economy.*`)에 넣고 관제실에서 조정 가능하게.

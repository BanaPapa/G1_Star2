# 전투 효과음(SFX) 준비 가이드 — 소리가 타격감의 절반이다

> 작성: 2026-07-07 · 대상: 사용자(에셋 준비) + 코딩 세션(연동 작업)
> 화면 이펙트(WO-1~8)가 아무리 화려해도 소리가 없으면 심심하다. **효과음은 텍스처(WO-7/8) 다음 순위**로 진행.
> 이미지와 똑같은 원칙: **파일이 없어도 게임은 조용히 정상 동작** — 부담 없이 하나씩 채우면 된다.

---

## 0. 3줄 요약

```
① 아래 §2 목록의 소리를 구한다 (무료 사이트 검색어 제공 / AI 생성 프롬프트 제공)
② public/assets/sfx/{키이름}.mp3 로 저장 (파일명이 전부 — 이미지와 같은 규칙)
③ 코딩 세션에 "다음 진행" → 효과음 시스템 연동 (NEXT_PROMPTS에 등록됨)
```

---

## 1. 구하는 방법 3가지 (쉬운 순)

### 방법 A — 무료 효과음 사이트에서 다운로드 (추천, 가장 빠름)

| 사이트 | 특징 | 주의 |
|---|---|---|
| [pixabay.com/sound-effects](https://pixabay.com/sound-effects/) | 가입 없이 다운로드, 상업 이용 무료, 출처 표기 불필요 | 첫 선택지로 추천 |
| [freesound.org](https://freesound.org/) | 양이 방대 | 가입 필요. **라이선스 확인** — CC0(표기 불필요)만 고르면 안전 |
| [opengameart.org](https://opengameart.org/) | 게임 전용이라 톤이 잘 맞음 | 라이선스 파일당 확인 (CC0 위주로) |

검색은 영어로: §2 표의 "검색어" 열을 그대로 붙여넣으면 된다.

### 방법 B — AI 효과음 생성 (ElevenLabs Sound Effects 등)

[elevenlabs.io/sound-effects](https://elevenlabs.io/app/sound-effects) — 텍스트로 효과음 생성 (무료 크레딧 있음).
§2 표의 "AI 프롬프트" 열을 붙여넣는다. 길이는 짧게(0.5~1.5초) 지정할 것.

### 방법 C — 일단 아무거나 (임시 채움)

방법 A에서 대충 비슷한 것 하나씩만 넣어도 게임의 인상이 완전히 달라진다.
마음에 안 드는 파일은 나중에 **같은 이름으로 덮어쓰기**만 하면 즉시 교체된다.

**공통 규칙:**
- 형식: **mp3** (가장 호환 좋음. wav를 받았으면 그대로 둬도 됨 — 코딩 세션에 알려만 줄 것)
- 길이: 전투음은 **0.3~1.5초**의 짧은 원샷. 길면 겹칠 때 지저분해진다
- 저장 위치: `public/assets/sfx/` (폴더가 없으면 만든다)

---

## 2. 효과음 목록 (파일명이 전부 — 정확히 이 이름으로)

### 1순위 — 이 8개만 있어도 전투가 달라진다

| 파일명 | 용도 | 무료 사이트 검색어 | AI 프롬프트 |
|---|---|---|---|
| `sfx_laser_fire.mp3` | 레이저 발사 | `laser shot sci-fi` | `short sci-fi laser beam firing, clean high-pitched zap` |
| `sfx_hit.mp3` | 일반 명중 (전 계열 공용) | `sci-fi impact hit` | `short metallic impact hit on a spaceship hull, punchy` |
| `sfx_explosion.mp3` | 폭발 (Plasma·격파 공용) | `explosion short game` | `powerful short explosion with deep bass rumble, game sound` |
| `sfx_destroy.mp3` | 유닛 격파 (폭발보다 크게) | `big explosion debris` | `large spaceship exploding, deep boom with debris scatter` |
| `sfx_move.mp3` | 함선 이동 | `spaceship engine whoosh short` | `short spaceship engine thruster whoosh, quick pass` |
| `sfx_select.mp3` | 유닛 선택/UI 클릭 | `ui click blip sci-fi` | `soft short sci-fi interface blip, single click` |
| `sfx_turn_start.mp3` | 플레이어 턴 시작 | `notification chime sci-fi short` | `short bright sci-fi notification chime, positive` |
| `sfx_victory.mp3` | 전투 승리 | `victory fanfare short game` | `short triumphant sci-fi victory fanfare, 2 seconds` |

### 2순위 — 무기 계열별 개성 (5계열 색깔이 소리에도 생긴다)

| 파일명 | 용도 | 검색어 | AI 프롬프트 |
|---|---|---|---|
| `sfx_ion_fire.mp3` | 이온 발사 | `electric zap taser` | `crackling electric discharge zap, sharp and buzzy` |
| `sfx_plasma_fire.mp3` | 플라즈마 발사 | `plasma cannon fire` | `heavy plasma cannon firing, deep whoomp with sizzle` |
| `sfx_gravity_fire.mp3` | 중력 무기 | `deep bass pulse sci-fi` | `low frequency gravitational pulse, deep sub-bass wobble` |
| `sfx_antimatter_fire.mp3` | 반물질 무기 | `charging energy weapon sci-fi` | `ominous energy charge-up then silent release, eerie` |
| `sfx_annihilate.mp3` | T5 완전 소멸 | `reverse explosion vacuum` | `implosion sound, air being sucked inward then vanishing into silence` |
| `sfx_crit.mp3` | 크리티컬 명중 | `heavy impact metal crunch` | `extra heavy critical impact with metallic crunch, satisfying` |
| `sfx_defeat.mp3` | 전투 패배 | `defeat jingle short game` | `short somber sci-fi defeat sting, 2 seconds` |

### 3순위 — 나중에 (분위기)

| 파일명 | 용도 | 비고 |
|---|---|---|
| `bgm_battle.mp3` | 전투 배경음악 | 1~2분 루프. pixabay `space battle music loop` |
| `bgm_strategy.mp3` | 전략맵 배경음악 | 잔잔한 앰비언트. `space ambient music loop` |
| `sfx_dock.mp3` | 입항 | `airlock door sci-fi` |
| `sfx_build.mp3` | 건물 건설/업그레이드 | `construction complete game` |
| `sfx_research.mp3` | 연구 완료 | `success chime game` |

---

## 3. 코딩 세션용 작업지시서 (WO-9 — 파일이 준비되면 복붙)

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

---

## 4. 자주 하는 실수

- **파일명 오타** — `sfx_lazer_fire.mp3` ❌. 표를 복사해서 이름 바꾸기로 쓸 것.
- **너무 긴 소리** — 4초짜리 폭발음은 연속 전투에서 소음이 된다. 1.5초 이내로 자르거나 짧은 걸 고를 것.
- **볼륨 들쭉날쭉** — 서로 다른 사이트에서 받으면 크기가 제각각. 일단 넣고, 거슬리는 것만 나중에 교체해도 충분 (코드에서 개별 볼륨 조정도 가능 — 코딩 세션에 "○○ 소리만 줄여줘"라고 하면 됨).
- **라이선스** — freesound는 CC0만, pixabay는 전부 안전. "저작자 표기 필요(CC-BY)"를 쓰면 크레딧 화면에 이름을 적어야 한다.

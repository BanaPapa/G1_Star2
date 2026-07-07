# 아트 에셋 & 전투 이펙트 구현 계획서 (Art + VFX Plan)

> 작성: 2026-07-07 · MASTER_PLAN **Phase 8(아트)·Phase 10-1(전투 이펙트)의 실행 문서**
> 이 문서 하나로 "무엇을, 어떤 순서로, 어떤 프롬프트로 만들어서, 어디에 넣는지"를 해결한다.
> 코드 개발(별도 CLI 세션)과 **완전히 병렬 작업 가능** — 폴백 시스템 덕에 이미지가 없어도 게임은 항상 돌아간다.

---

## 0. 딱 3가지만 기억하면 되는 파이프라인

```
① 이미지 생성 AI에 프롬프트 입력 (이 문서 §4의 프롬프트 복붙)
② 배경 제거: python scripts/remove_bg.py (투명 PNG 필요한 것만 — 배경/컷인은 불필요)
③ public/assets/{키이름}.png 로 저장 → 게임 재시작하면 자동 반영
```

- 파일 이름 = **에셋 키**가 전부다. `src/core/assetMap.js`가 `/assets/{key}.png`를 찾고, 없으면 이모지 폴백.
- 등록 코드 수정 불필요. **파일명만 정확하면 끝.**
- 잘못 만들어도 지우면 이모지로 돌아간다. 부담 없이 실험할 것.

---

## 1. 구현 순서 (웨이브 로드맵)

> 원칙: **"화면에 자주 보이는 것 → 임팩트 큰 것 → 나머지"**. 한 웨이브가 끝날 때마다 게임이 눈에 띄게 좋아진다.

### Wave 1 — 첫인상 응급처치 (반나절, 이미지 7장)

가장 적은 장수로 "이모지 게임 → 진짜 게임" 인상 전환.

- [ ] `bg_space.png` — 성단맵 배경 1장 (**현재 콘솔 에러 원인**, 최우선)
- [ ] 무기 계열 아이콘 5장 — `wpn_laser` `wpn_ion` `wpn_plasma` `wpn_gravity` `wpn_antimatter`
      (25종 무기가 계열별로 같은 아이콘 키를 공유하므로 **5장으로 상점·장착·카드덱의 `?` 폴백이 전부 사라진다**)
- [ ] `bg_title.png` — 타이틀 화면 1장

### Wave 2 — 함선 (전투맵·성계맵의 주인공)

- [ ] 헬리온 6함급 톱뷰 원화 6장 → **회전 스크립트로 8방향 48장 자동 생성** (§4.1의 요령 참고)
- [ ] 성계맵 아이콘: 같은 원화를 96px로 축소 → 4방향 24장 (별도 생성 불필요)
- [ ] 보이드(적 세력) 비주얼 확정(§4.2 제안 → DESIGN_BIBLE 기록) → 적 유닛 스프라이트

### Wave 3 — 캐릭터 (임팩트 담당)

- [ ] 에이스 초상화 4장 — `ace_kai_portrait` `ace_sera_portrait` `ace_mila_portrait` `ace_raven_portrait` (512×512)
- [ ] 컷인 일러스트 4장 — `cutin_kai_01` 등 (1280×720)
- [ ] 턴 캐릭터 카드 프레임 리디자인 (§4.6 — 코드 작업 병행 필요, 메인 CLI와 협업)

### Wave 4 — 나머지 아이콘·배경 (짬날 때 하나씩)

- [ ] 무기 25종 개별 아이콘 (계열 아이콘을 티어별로 세분화 — 선택 사항)
- [ ] 모듈 6 + 소모품 4 + 유니크 3 아이콘
- [ ] 건물 5종 아이콘 (`bld_command_center` 등)
- [ ] 장소맵 배경 (모항 `bg_place_daedalus`, 행성 `bg_place_planet`)
- [ ] 자원 6종 아이콘 (`res_sc` `res_ti` `res_ec` `res_dm` ...)

### 이펙트 트랙 (코드 — 아트와 무관하게 병렬)

- [x] E0 프로시저럴 기반 `game/effects/weaponVfx.js` 시작됨 (히트 임팩트/이온 볼트/플라즈마 발사·폭발/기본 트레이서)
- [x] E1 Laser·Gravity·Antimatter 계열 연출 추가 (§5.2) — WO-3~6: 잔열 히트헤이즈·스턴 링·중력장 소용돌이·강제이동 이징·소멸 분해·블랙홀 루프 (2026-07-07)
- [x] E2 타격감 공통 레이어: 히트스톱·셰이크·플래시·데미지 숫자 (§5.3) — WO-1/2: 셰이크 3단계·히트스톱·피격 백색 틴트·격파 연출, `combat.vfx.*` config + 설정 강도(off/low/full) (2026-07-07)
- [ ] E3 파티클 텍스처 업그레이드 (glow PNG 2장으로 입자 품질 상승 — §5.4)
- [ ] E4 (출시 전 선택) 임팩트 큰 장면만 스프라이트시트 애니메이션 (T5 무기·블랙홀·컷인 히트)

---

## 2. 공통 스타일 가이드

모든 프롬프트 앞에 붙이는 **마스터 스타일 문장** (영문 — 이미지 AI는 영어가 정확도가 높다):

```
sci-fi space strategy game asset, clean vector-like digital painting,
dark space aesthetic, high contrast rim lighting, no text, no watermark
```

**세력 팔레트 (프롬프트에 HEX 그대로 써도 된다):**

| 세력 | 메인 | 포인트 | 발광 |
|---|---|---|---|
| 헬리온 연방 (아군) | 화이트 `#F2F4F8` | 레드 `#FF3B3B` | 시안 `#00E0FF` / 엔진 블루 `#3AA8FF` |
| 보이드 (적, §4.2 제안) | 흑요석 블랙 `#12080F` | 딥 바이올렛 `#B84CFF` | 마젠타 코어 `#FF2E88` |

**네거티브(피해야 할 것) 공통:** `text, letters, watermark, blurry, photo-realistic human, frame border` — 도구가 네거티브 프롬프트를 지원하면 넣고, 아니면 무시.

**규격 요약 (MASTER_PLAN §4.1과 동일):**

| 에셋 | 크기 | 투명배경 | 파일명 규칙 |
|---|---|---|---|
| 전술맵 함선 | 256×256 | ✅ | `hull_{함급}_{방향}.png` (방향: n/ne/e/se/s/sw/w/nw) |
| 성계맵 아이콘 | 96×96 | ✅ | `icon_{함급}_{방향}.png` |
| 아이템/무기 아이콘 | 64×64 | ✅ | items.json의 icon 키 (`wpn_laser` 등) |
| 에이스 초상화 | 512×512 | ⭕ (권장) | `ace_{id}_portrait.png` |
| 컷인 일러스트 | 1280×720 | ❌ | `cutin_{id}_01.png` |
| 배경 | 1920×1080 | ❌ | `bg_*.png` |

---

## 3. 이미지 생성 실전 요령 (초보자용)

1. **한 번에 한 장.** 프롬프트에 여러 물건을 요구하면 품질이 떨어진다. 아이콘 25장 = 프롬프트 25번.
2. **크기는 생성 후 리사이즈.** AI는 1024×1024로 뽑고, 저장할 때 64/96/256으로 줄인다 (그림판/포토피아/`magick convert -resize 64x64`).
3. **같은 시리즈는 같은 세션·같은 프롬프트 틀에서.** 함선 6종을 서로 다른 날 다른 문장으로 뽑으면 세트로 안 보인다. §4의 프롬프트는 `{변수}`만 바꾸는 틀이다.
4. **마음에 들 때까지 재생성이 정상.** 4~8번 뽑아 1장 건지는 게 보통의 작업 흐름이다.
5. **투명배경**: 생성 AI가 못 만들면 단색(초록/마젠타) 배경으로 뽑고 `scripts/remove_bg.py` 처리.

---

## 4. 카테고리별 프롬프트 시트

### 4.1 헬리온 함선 6종 (톱뷰 → 8방향 회전)

**8방향을 48장 생성하지 말 것.** 우주 배경은 광원 방향이 자유로우므로, **위(N)를 보는 톱뷰 1장을 뽑아 코드/스크립트로 45°씩 회전**하는 것이 품질·일관성·노력 모두에서 이긴다.

> 회전 스크립트(예: `scripts/rotate_sprites.py`)는 메인 CLI 세션에 요청:
> "hull_{함급}_n.png를 입력받아 45° 간격으로 회전한 8방향 PNG를 만들어줘 (Pillow)".
> 기존 건십 4방향(ne/nw/se/sw) 파이프라인도 이 방식으로 통일 가능.

프롬프트 틀 (`{...}` 부분만 함급별로 교체):

```
top-down view spaceship sprite for a tactical strategy game, facing straight up,
{함급별 묘사}, sleek unified white hull #F2F4F8 with red #FF3B3B accent stripes,
cyan #00E0FF glowing details, blue #3AA8FF engine thrusters at the rear,
ceramic composite armor plating, integrated plasma weapon ports,
symmetrical silhouette, centered, isolated on plain green background,
clean vector-like digital painting, no text, no watermark
```

| 함급 | `{함급별 묘사}` | 실루엣 지침 |
|---|---|---|
| 건십 | `small agile gunship, arrow-shaped light attack craft, twin forward cannons, oversized engines relative to body` | 작고 뾰족, 엔진이 커 보이게 |
| 프리깃 | `medium frigate, balanced multipurpose escort ship, slim elongated hull, modular equipment mounts along the spine` | 날씬한 장방형 |
| 디스트로이어 | `heavily armed destroyer, reinforced angular armor, prominent heavy cannon batteries on both sides` | 각지고 무장이 도드라짐 |
| 크루저(헬리온급) | `flagship-class cruiser, elegant broad hull, integrated plasma cannon array and missile bays, command bridge structure` | 넓고 우아한 주력함 ★기준함 |
| 배틀크루저 | `fast heavy battlecruiser, long powerful hull combining speed and firepower, quad engine cluster` | 길고 빠른 인상 |
| 배틀십 | `massive battleship, fortress-like super-heavy hull, layered thick armor plates, overwhelming main cannon turrets` | 압도적 덩치, 둔중함 |

체크: 6장을 나란히 놓고 **크기·디테일 밀도가 함급 순서대로 증가**하는지 확인. 아니면 해당 함급만 재생성.

### 4.2 보이드 세력 (적) — 비주얼 제안 ⚠ 사용자 승인 필요

적 세력 시트가 미제작이므로 다음을 제안한다 (승인 시 DESIGN_BIBLE에 기록):

> **"빛을 삼키는 자들"** — 헬리온의 매끈한 백색과 정반대. 흑요석처럼 검고 비대칭적인 결정(crystal) 구조 선체,
> 균열 사이로 보라(#B84CFF) 발광, 코어는 마젠타(#FF2E88). 기계인지 생물인지 모호한 실루엣.

```
top-down view alien warship sprite, facing straight up, asymmetric obsidian-black
crystalline hull #12080F, glowing violet #B84CFF energy cracks across the surface,
magenta #FF2E88 core light, jagged organic-mechanical silhouette, menacing,
centered, isolated on plain green background, dark sci-fi game art, no text
```

유닛 11종은 헬리온과 같은 방식(크기·디테일로 위계 표현). 보스 2종(가르/워든)은 위 프롬프트에 `colossal boss` + 고유 모티브(가르=`ramming horns`, 워든=`single giant eye-like core`)를 추가.

### 4.3 무기 계열 아이콘 5종 (Wave 1 핵심)

프롬프트 틀:

```
game item icon of {계열 묘사}, centered single object, dark navy rounded square
background, subtle inner glow, crisp silhouette readable at small size,
clean sci-fi game UI icon style, no text
```

| 파일명 | `{계열 묘사}` |
|---|---|
| `wpn_laser.png` | `a sleek laser beam emitter cannon firing a thin cyan #66EAFF beam` |
| `wpn_ion.png` | `an ion disruptor coil crackling with light-blue #7FD9FF electric arcs` |
| `wpn_plasma.png` | `a plasma cannon charging a fiery orange #FF7A2A energy sphere` |
| `wpn_gravity.png` | `a gravity manipulator device bending purple #B18CFF space-time rings around it` |
| `wpn_antimatter.png` | `an antimatter projector with a contained pink #FF5CE1 singularity core` |

색은 `weaponVfx.js`의 계열 색상과 일치시켰다 — **아이콘 색 = 전투 이펙트 색 = 플레이어의 학습**. 이 규칙은 앞으로도 유지할 것.

### 4.4 에이스 초상화 4종 (aces.json visualNote 기반)

프롬프트 틀:

```
sci-fi anime style character portrait, bust shot, {인물 묘사},
space pilot, dramatic rim lighting, dark starfield background,
clean cel shading, detailed eyes, 512x512 game portrait, no text
```

| 파일명 | `{인물 묘사}` | 성격 힌트 |
|---|---|---|
| `ace_kai_portrait.png` | `young man with short red hair, scar across his cheek, red pilot suit, confident grin` | 열혈 |
| `ace_sera_portrait.png` | `woman with silver ponytail, blue pilot suit, cold expressionless face, sharp piercing eyes` | 냉정 |
| `ace_mila_portrait.png` | `cheerful woman engineer, cyan and green color scheme, engineer goggles on forehead, bright wide smile` | 정비광 |
| `ace_raven_portrait.png` | `mysterious figure in black and purple, face partially hidden by a sleek mask, shadow motif, ominous aura` | 전 보이드 에이스 |

### 4.5 컷인 일러스트 4종 (1280×720)

초상화와 **같은 세션/스타일**에서 이어 생성 (동일 인물로 보여야 함). 틀:

```
dynamic anime cut-in illustration, wide 16:9 composition, {인물 묘사 — 위와 동일},
{액션 연출}, speed lines, intense glowing energy effects, dramatic diagonal angle,
space battle background, high energy special-attack scene, no text
```

`{액션 연출}` 예: 카이=`shouting a battle cry inside a cockpit, flames reflected on the canopy`, 세라=`calmly locking on target, holographic crosshair over her eye`, 밀라=`slamming a lever with a grin, sparks flying`, 레이븐=`emerging from darkness, purple energy blade igniting`.

### 4.6 턴 캐릭터 카드 (리디자인 — 아트+코드 협업)

- 아트에서 만들 것: **카드 프레임 1장** (`ui_card_frame.png`, 투명 PNG, 초상화 들어갈 창이 뚫린 형태) + 계열/함급 문장(emblem) 아이콘.
- 코드에서 할 것(메인 CLI): 프레임 + 초상화 + 함급/무기 아이콘 합성, 등장 애니메이션(슬라이드+글로우). `ui_design_system.md` 톤 준수.

```
sci-fi trading card frame, empty portrait window in the center, white and red
Helion Federation military design #F2F4F8 #FF3B3B, cyan glowing circuit lines,
metallic corners, transparent background, game UI asset, vertical card, no text
```

### 4.7 배경 3종

```
# bg_space.png (성단맵 — 최우선)
vast deep space starfield background for a strategy map, scattered nebula wisps
in dark blue and violet, distant stars, subtle depth, dark enough for bright UI
elements to be readable on top, 1920x1080, no planets in the center, no text

# bg_title.png (타이틀)
epic space opera title screen background, a white-and-red federation fleet
silhouetted against a giant glowing nebula, cinematic lighting, sense of scale,
empty space in upper third for logo, 1920x1080, no text

# bg_place_daedalus.png (모항 장소맵)
orbital space station interior hangar viewed from a command deck, white and red
federation architecture, cyan holographic displays, docked ships visible through
a large window, clean sci-fi environment art, 1920x1080, no text
```

### 4.8 건물 아이콘 5종 (64×64, Wave 4)

무기 아이콘과 같은 틀(`game item icon of ...`)에: 사령부=`command center tower with holographic antenna`, 연구소=`glowing research laboratory dome`, 워크샵=`industrial workshop with robotic arm`, 조선소=`shipyard dry-dock cradling a small vessel`, 아웃포스트=`compact orbital outpost satellite`.

---

## 5. 전투 이펙트 구현 계획 (게임 이펙터 관점)

### 5.1 전략 — 3단 로켓

이펙트는 이미지 에셋이 **아니라 코드가 주인공**이다. 순서:

1. **프로시저럴 (현재)** — Phaser Graphics + 트윈만으로 형태·타이밍을 완성한다. 에셋 0장. `weaponVfx.js`가 이 단계.
2. **파티클 텍스처 (E3)** — 부드러운 glow 원 PNG 1~2장만 추가하면 같은 코드의 입자가 "네온"처럼 보인다. 최소 비용 최대 효과.
3. **스프라이트시트 (E4, 선택)** — 폭발 등 프레임 애니메이션. **T5 무기·블랙홀·컷인 히트 등 임팩트 장면에만** 투자. 전 무기에 하면 물량 폭발.

> 핵심 원칙: **이펙트의 "느낌"은 그림이 아니라 타이밍(이징·지속시간·순서)에서 나온다.** 1단계에서 타이밍을 완성해 두면 2·3단계는 껍데기 교체일 뿐이다.

### 5.2 계열별 이펙트 문법 (각 계열의 "손맛" 정의)

| 계열 | 색 | 발사 연출 | 명중 연출 | 남은 작업 |
|---|---|---|---|---|
| Laser | 시안 `0x66eaff` | **즉발 빔** — 가는 코어+넓은 글로우 라인이 0.1초 만에 그어지고 잔상이 감쇠 | 피격점 백색 플래시. 관통 시 대상마다 30~50ms 시차를 두고 순차 플래시(경로가 "읽히게") | `playLaserBeam(from, pathPoints[])` — 굴절점에서 꺾인 폴리라인 지원 |
| Ion | 담청 `0x7fd9ff` | 지그재그 볼트 (✅ 구현됨) | 명중 후 대상 주변에 0.5초 잔류 스파크 + 디버프 아이콘 뜸 | 스턴 시 대상 머리 위 회전 스파크 링 |
| Plasma | 주황 `0xff7a2a` | 화염구 발사체 (✅ 구현됨) | 폭발 (✅) + **5×5 범위는 링별 시차 폭발**(중심→바깥 60ms 간격) | 잔열 지대 타일에 일렁이는 히트헤이즈(반투명 사각 알파 펄스) |
| Gravity | 보라 `0xb18cff` | 발사체 없음 — **대상 지점에 수축하는 동심원 링**(바깥→안쪽으로 빨려듦) | 밀어내기: 함선 이동 트윈에 `Back.easeIn` + 충돌 시 흰 플래시. 중력장: 타일 위 천천히 회전하는 소용돌이 라인 | `playGravityImplosion`, `playGravityField` — Phase 4-4 코드와 동시 작업 권장 |
| Antimatter | 마젠타 `0xff5ce1` | 대상 위 공간이 **한 점으로 수축**(스케일 1→0) 후 | **소멸 플래시** — 검은 원이 순간 확장했다가 배경색으로 붕괴. 완전 소멸 시 함선 스프라이트가 픽셀 조각으로 흩어지며 사라짐 | `playAnnihilation`, 블랙홀 타일(회전 원반+중심 흑점) — Phase 4-5와 동시 |

### 5.3 타격감 공통 레이어 (E2 — 계열 무관, 효과 대비 비용 최고)

우선순위 순:

1. **데미지 숫자** — 피격점에서 튀어올라 흩어지는 숫자. 크리티컬/관통 50%는 크기·색 차등. (없으면 어떤 이펙트도 심심하다)
2. **화면 셰이크** — `scene.cameras.main.shake(duration, intensity)`. 폭발·격파에만. 강도 3단계(경/중/격파)를 config로.
3. **히트스톱** — 명중 순간 60~90ms 전체 트윈 일시정지. 격파·T5 무기에만.
4. **피격 플래시** — 맞은 함선 스프라이트를 1프레임 백색 틴트.
5. **격파 연출** — 폭발 2연발 + 잔해 파편 + 페이드.

> 수치(강도·지속시간)는 하드코딩 금지 원칙대로 `combat.vfx.*` config 신설을 메인 CLI에 요청할 것.

### 5.4 파티클 텍스처 2장 (E3에서 딱 2장만 생성)

| 파일 | 용도 | 프롬프트 |
|---|---|---|
| `fx_glow_soft.png` | 모든 입자/글로우 공용 | `soft white radial glow orb, perfectly centered, fading to transparent edges, on pure black background, 256x256` |
| `fx_spark.png` | 스파크/파편 | `small sharp white light spark with 4-point star shape, on pure black background, 128x128` |

흰색으로 만들고 코드에서 `setTint(familyColor)` — 5계열 전부 커버. (검정 배경 = Phaser `ADD` 블렌드로 자동 투명화)

---

## 6. 진행 기록

| 날짜 | 작업 | 비고 |
|---|---|---|
| 2026-07-07 | 계획서 작성, weaponVfx.js E0 확인 | |

> 완료 시 §1 체크박스를 갱신하고, 승인된 디자인 결정(보이드 비주얼 등)은 DESIGN_BIBLE에 기록할 것.

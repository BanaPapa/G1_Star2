# 이펙트(VFX) 텍스처 프롬프트 — 파티클 2 + 필드 2 + 스프라이트시트 2

> 전투 이펙트의 본체는 코드(`src/game/effects/weaponVfx.js`, 프로시저럴)다. 여기 이미지들은 그 코드 이펙트의
> **품질을 올려주는 재료**다. 우선순위: A(파티클) > B(필드) > C(스프라이트시트 — 임팩트 장면 전용, 선택).
> 상세 설계는 `docs/design/art_vfx_plan.md` §5 참고.

## A. 파티클 텍스처 2장 (모든 계열 공용 — 흰색으로 만들고 코드에서 계열색 틴트)

- 크기: 생성은 아무 크기(보통 1024), **저장할 때 표기 크기로 리사이즈** (프롬프트 속 숫자는 크기를 정하지 않는다)
- **순수한 검정 배경 필수** (Phaser ADD 블렌드가 검정을 자동 투명 처리 — remove_bg 불필요)

### `fx_glow_soft.png` — 소프트 글로우 (모든 발광 입자의 기본, 256×256)
```
A single soft white radial glow orb, perfectly centered, smoothly fading to fully transparent at the edges, no hard outline, on a pure black background, particle texture for a game engine, 256x256, no text, no watermark
```

### `fx_spark.png` — 스파크 (파편·전기 입자, 128×128)
```
A single small sharp white light spark shaped like a four-pointed star with a bright center, crisp thin rays, on a pure black background, particle texture for a game engine, 128x128, no text, no watermark
```

## B. 필드 이펙트 텍스처 2장 (타일 위에 얹혀 회전/펄스하는 오브젝트)

- 크기: 1024×1024 생성 → **256×256 저장** · 투명배경 **필수**

### `fx_blackhole.png` — 블랙홀 (Antimatter T4/T5, 기존 black_hole 필드효과)
```
Top-down view of a small black hole, a perfectly dark central sphere surrounded by a bright swirling pink #FF5CE1 and violet accretion disk with light bending streaks, wisps spiraling inward, centered, isolated on plain solid green background, stylized sci-fi game VFX art, no text, no watermark
```

### `fx_gravity_well.png` — 중력장 소용돌이 (Gravity T3/T4, gravity_well 필드효과)
```
Top-down view of a translucent purple #B18CFF gravitational vortex, concentric spiral distortion rings pulling inward toward a dim center, semi-transparent so the grid shows through, centered, isolated on plain solid green background, stylized sci-fi game VFX art, no text, no watermark
```

## C. 스프라이트시트 (플립북) 2장 — 선택, 임팩트 장면 전용

- **4×4 그리드 = 16프레임**을 한 장에 담은 이미지.
- ⚠ **픽셀 수치는 프롬프트에 넣는 게 아니다.** 해상도는 생성 도구의 설정에서 정하는 것 —
  ① 도구가 지원하는 가장 큰 정사각형으로 생성하고(1024면 충분, 2048 가능하면 더 좋음)
  ② 저장할 때 **정확히 1024×1024로 리사이즈**한다 (그림판/포토피아 크기 조절).
- 왜 1024×1024가 필수인가: 코드가 이 파일을 256px씩 4×4로 잘라 16프레임으로 읽는다 (1024÷4=256).
  다른 크기로 저장했다면 코딩 세션에 크기를 알려주면 코드 쪽 숫자를 맞출 수 있다.
- 생성 AI가 그리드를 균일하게 못 맞추면 몇 번 재생성 — 프레임 경계가 어긋나면 사용 불가이므로 검수 필수.

### `fx_explosion_sheet.png` — 범용 폭발 (격파·Plasma 폭발 공용)
```
Sprite sheet of an explosion animation for a 2D game, exactly 16 frames arranged in a perfect 4x4 grid with equal cell sizes, frames progressing left to right top to bottom: small white flash, expanding orange fireball, peak burst with debris sparks, dissipating dark smoke ring, each frame perfectly centered in its cell, consistent scale across frames, on a pure black background, no text, no watermark
```

### `fx_annihilation_sheet.png` — 소멸 연출 (Antimatter T5 완전 소멸 전용)
```
Sprite sheet of a disintegration animation for a 2D game, exactly 16 frames arranged in a perfect 4x4 grid with equal cell sizes, frames progressing left to right top to bottom: a pink #FF5CE1 point of light collapsing inward, a ring of magenta energy imploding, a blinding white-pink flash, matter dissolving into scattered fading particles and empty darkness, each frame perfectly centered in its cell, consistent scale across frames, on a pure black background, no text, no watermark
```

## (참고) 이미지가 아닌 이펙트 — 코드로 구현하는 목록

아래는 이미지 생성 대상이 **아니다**. `art_vfx_plan.md` §5.2~5.3의 코드 작업(메인 CLI 담당):
Laser 빔/굴절 폴리라인 · Ion 잔류 스파크·스턴 링 · Plasma 링별 시차 폭발·잔열 히트헤이즈 ·
Gravity 수축 링·강제이동 트윈 · Antimatter 수축-소멸 플래시 · 데미지 숫자 · 화면 셰이크 · 히트스톱 · 피격 플래시.

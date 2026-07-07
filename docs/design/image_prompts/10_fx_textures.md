# 이펙트(VFX) 텍스처 프롬프트 — 파티클 2 + 필드 2 + 스프라이트시트 2

> 전투 이펙트의 본체는 코드(`src/game/effects/weaponVfx.js`, 프로시저럴)다. 여기 이미지들은 그 코드 이펙트의
> **품질을 올려주는 재료**다. 우선순위: A(파티클) > B(필드) > C(스프라이트시트 — 임팩트 장면 전용, 선택).
> 상세 설계는 `docs/design/art_vfx_plan.md` §5 참고.

## A. 파티클 텍스처 2장 (모든 계열 공용 — 흰색으로 만들고 코드에서 계열색 틴트)

- 크기: 표기 크기로 저장 · **순수한 검정 배경 필수** (Phaser ADD 블렌드가 검정을 자동 투명 처리 — remove_bg 불필요)

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

- **4×4 그리드 = 16프레임**을 한 장에. 2048×2048 생성 → 1024×1024 저장 (프레임당 256×256).
- 코드 적용 시 메인 CLI에 전달: "Phaser spritesheet, frameWidth/Height 256, 16프레임 재생 후 파괴"
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

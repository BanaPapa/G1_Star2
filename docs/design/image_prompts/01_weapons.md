# 무기 아이콘 프롬프트 (5계열 25종 + 유니크 무기 1)

- 크기: 1024×1024 생성 → **64×64 저장** · 투명배경 **불필요** (아이콘은 패널 포함 사각형)
- 저장 위치: `public/assets/`

## A. 계열 대표 아이콘 5장 — 최우선 (이것만 있으면 25종 전부 `?` 폴백 해제)

현재 items.json의 모든 무기가 계열별로 이 5개 키를 공유한다. **코드 수정 없이 바로 반영.**

### `wpn_laser.png` — Laser 계열
```
Game item icon of a sleek sci-fi laser cannon emitter firing a thin bright cyan #66EAFF beam diagonally upward, centered single object, dark navy rounded-square background panel, subtle cyan inner glow, crisp silhouette readable at small size, clean vector-style game UI icon, no text, no watermark
```

### `wpn_ion.png` — Ion 계열
```
Game item icon of a sci-fi ion disruptor coil device crackling with light-blue #7FD9FF electric arcs wrapping around it, centered single object, dark navy rounded-square background panel, subtle electric glow, crisp silhouette readable at small size, clean vector-style game UI icon, no text, no watermark
```

### `wpn_plasma.png` — Plasma 계열
```
Game item icon of a heavy sci-fi plasma cannon charging a fiery orange #FF7A2A molten energy sphere at its muzzle, centered single object, dark navy rounded-square background panel, warm inner glow, crisp silhouette readable at small size, clean vector-style game UI icon, no text, no watermark
```

### `wpn_gravity.png` — Gravity 계열
```
Game item icon of a sci-fi gravity manipulator device bending glowing purple #B18CFF space-time rings around its core, centered single object, dark navy rounded-square background panel, subtle purple glow, crisp silhouette readable at small size, clean vector-style game UI icon, no text, no watermark
```

### `wpn_antimatter.png` — Antimatter 계열
```
Game item icon of a sci-fi antimatter projector containing a swirling pink #FF5CE1 singularity core inside a containment frame, centered single object, dark navy rounded-square background panel, ominous magenta glow, crisp silhouette readable at small size, clean vector-style game UI icon, no text, no watermark
```

---

## B. 무기 25종 개별 아이콘 (선택 — 티어별 차별화)

⚠ 사용하려면 items.json의 각 무기 `icon` 필드를 아래 파일명(확장자 제외)으로 바꿔야 한다 (메인 CLI 작업).
티어 표현 규칙: T1=단순한 장비 → T5=화려하고 복잡한 장비 + 강한 발광.

### Laser (시안 #66EAFF)

`wpn_laser_line.png` — T1 선형 레이저
```
Game item icon of a simple compact sci-fi laser emitter firing one thin straight cyan #66EAFF beam, minimal utilitarian design, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_laser_vector.png` — T2 벡터 레이저
```
Game item icon of a sci-fi laser turret with a rotating multi-directional head emitting a cyan #66EAFF beam at a diagonal angle, eight small direction markers around it, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_laser_pierce.png` — T3 관통 빔
```
Game item icon of an elongated sci-fi beam cannon firing an intense cyan #66EAFF lance that pierces through two small target silhouettes, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_laser_deflection.png` — T4 굴절 빔
```
Game item icon of an advanced sci-fi prism cannon whose cyan #66EAFF beam bends sharply at a glowing crystal deflection point, angular refracted light path, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_laser_phase_lance.png` — T5 위상 랜스
```
Game item icon of an ornate top-tier sci-fi phase lance cannon radiating layered cyan #66EAFF and white energy blades, ghostly afterimage duplicates of the beam, prestigious glowing details, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

### Ion (담청 #7FD9FF)

`wpn_ion_jammer.png` — T1 이온 재머
```
Game item icon of a small sci-fi jamming antenna dish emitting light-blue #7FD9FF static interference waves, simple design, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_ap_disruptor.png` — T2 행동력 교란기
```
Game item icon of a sci-fi disruptor device with twin prongs discharging light-blue #7FD9FF electric arcs that form a broken gear symbol, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_shield_nullifier.png` — T3 쉴드 무력화기
```
Game item icon of a sci-fi ion cannon firing a light-blue #7FD9FF bolt shattering a translucent hexagonal energy shield, shield fragments dissolving, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_iff_scrambler.png` — T4 피아식별 교란기
```
Game item icon of a sinister sci-fi signal scrambler with rotating emitter rings broadcasting light-blue #7FD9FF corrupted waves, two small ship silhouettes with swapped red and green markers, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_system_collapse.png` — T5 시스템 붕괴
```
Game item icon of a top-tier sci-fi EMP superweapon core surging with overloaded light-blue #7FD9FF lightning, cracked casing leaking electric energy, ominous and powerful, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

### Plasma (주황 #FF7A2A)

`wpn_armor_melter.png` — T1 아머 멜터
```
Game item icon of a compact sci-fi plasma torch gun dripping molten orange #FF7A2A plasma that melts a metal plate, simple design, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_core_melter.png` — T2 코어 멜터
```
Game item icon of a sci-fi plasma injector drilling a glowing orange #FF7A2A molten hole into a reactor core sphere, heat distortion, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_plasma_burst.png` — T3 플라즈마 버스트
```
Game item icon of a sci-fi mortar-like plasma launcher releasing an orange #FF7A2A fireball that bursts into a wide explosion, radial blast shape, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_hellfire_burst.png` — T4 헬파이어 버스트
```
Game item icon of a heavy sci-fi twin-barrel plasma launcher erupting a violent orange-red #FF7A2A firestorm with lingering embers on the ground, intense heat glow, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_armor_annihilator.png` — T5 아머 애니힐레이터
```
Game item icon of a top-tier sci-fi siege plasma lance with a white-hot orange #FF7A2A core beam vaporizing an armor plate completely, prestigious ornate barrel design, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

### Gravity (보라 #B18CFF)

`wpn_graviton_ram.png` — T1 그래비톤 램
```
Game item icon of a simple sci-fi graviton emitter projecting a purple #B18CFF force wave pushing a small ship silhouette away, motion arrows, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_spatial_displacer.png` — T2 공간 전위기
```
Game item icon of a sci-fi warp device tearing open a small purple #B18CFF portal that teleports a ship silhouette, swirling displaced space, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_gravity_well.png` — T3 중력 우물
```
Game item icon of a sci-fi gravity well generator projecting a purple #B18CFF funnel-shaped spacetime depression grid, objects sinking toward the center, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_gravity_collapse.png` — T4 중력 붕괴
```
Game item icon of a sci-fi implosion device crushing several small ship silhouettes toward one glowing purple #B18CFF convergence point, inward spiral force lines, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_event_horizon.png` — T5 사건의 지평선
```
Game item icon of a top-tier sci-fi singularity cannon projecting a dark sphere ringed by a glowing purple #B18CFF accretion disk, light bending around its edge, ominous and majestic, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

### Antimatter (마젠타 #FF5CE1)

`wpn_thruster_eraser.png` — T1 추진계 절삭탄
```
Game item icon of a sci-fi precision torpedo with a pink #FF5CE1 antimatter tip slicing off the engine section of a ship silhouette, clean surgical cut line, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_defense_eraser.png` — T2 방어층 소거기
```
Game item icon of a sci-fi antimatter beam eraser dissolving the outer armor layer of a hull cross-section into pink #FF5CE1 particles, erased matter fading to nothing, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_antimatter_field.png` — T3 반물질 에너지장
```
Game item icon of a sci-fi field projector engulfing a ship silhouette in an unstable pink #FF5CE1 energy field, sparks of malfunction and chaos, warning motif, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_micro_singularity.png` — T4 미소 특이점
```
Game item icon of a sci-fi launcher scattering several tiny pink #FF5CE1 black holes, each a dark dot with a glowing magenta ring, cluster munition feel, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

`wpn_total_annihilation.png` — T5 완전 소멸 병기
```
Game item icon of the ultimate sci-fi annihilation weapon, a massive ornate cannon whose pink #FF5CE1 blast erases a ship silhouette into pure white void, chain reaction sparks spreading to nearby space, apocalyptic and prestigious, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

---

## C. 유니크 무기 (히든)

### `item_lastflame.png` — 최후의 불꽃 (배틀십 전용, atk 35)
```
Game item icon of a legendary sci-fi mega cannon wreathed in an eternal crimson #FF3B3B flame, battle-worn ancient metal with glowing red engravings, epic relic weapon aura, centered, dark navy rounded-square background panel, clean vector-style game UI icon, no text
```

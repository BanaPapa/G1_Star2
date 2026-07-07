# 자원 아이콘 6 + UI 카드 프레임 + 지형 타일 4 프롬프트

## A. 자원 아이콘 6종 (resources.json icon 키 — 코드 수정 없이 바로 반영)

- 크기: 1024×1024 생성 → **64×64 저장** · 투명배경 **권장** (상단 자원바에 올라감 — remove_bg 처리)

### `res_sc.png` — 스텔라크레딧 (통화)
```
Game resource icon of a futuristic hexagonal golden credit coin engraved with a small star emblem, subtle metallic shine, centered single object, isolated on plain solid green background, clean vector-style game UI icon, readable at tiny size, no text, no watermark
```

### `res_ti.png` — 티타늄 (기본 제작 금속)
```
Game resource icon of a stack of three brushed silver-grey titanium metal ingots, industrial and sturdy, centered single object, isolated on plain solid green background, clean vector-style game UI icon, readable at tiny size, no text, no watermark
```

### `res_ec.png` — 에너지크리스탈 (에너지·연구 연료)
```
Game resource icon of a luminous cyan #00E0FF energy crystal shard glowing from within, faceted gem surfaces, small light sparkles, centered single object, isolated on plain solid green background, clean vector-style game UI icon, readable at tiny size, no text, no watermark
```

### `res_dm.png` — 다크매터 (희귀 고급 소재)
```
Game resource icon of a mysterious dark matter orb, a deep purple-black sphere with swirling violet #B18CFF mist trapped inside and tiny particles orbiting it, rare and exotic feel, centered single object, isolated on plain solid green background, clean vector-style game UI icon, readable at tiny size, no text, no watermark
```

### `res_nc.png` — 나노카본 (고급 건물·장비 소재)
```
Game resource icon of a coil of woven black nanocarbon fiber filament with a subtle hexagonal weave pattern and faint blue sheen, high-tech material feel, centered single object, isolated on plain solid green background, clean vector-style game UI icon, readable at tiny size, no text, no watermark
```

### `res_qd.png` — 퀀텀데이터 (최상위 연구 재화)
```
Game resource icon of a glowing quantum data cube made of translucent layers of golden holographic circuitry, tiny light particles streaming through it, precious information feel, centered single object, isolated on plain solid green background, clean vector-style game UI icon, readable at tiny size, no text, no watermark
```

## B. UI — 턴 캐릭터 카드 프레임 (Phase 8-6 리디자인용)

- 크기: 1024×1536 세로 생성 → 카드 실사용 크기는 코드에서 결정 · 투명배경 **필수** (초상화 창이 뚫려 있어야 함)
- 적용은 코드 작업 병행 필요 (메인 CLI): 프레임 + 초상화 + 무기 아이콘 합성

### `ui_card_frame.png` — 아군 카드 프레임
```
Vertical sci-fi trading card frame asset with a large empty transparent window in the center for a character portrait, elegant white #F2F4F8 and red #FF3B3B federation military design, thin cyan #00E0FF glowing circuit lines along the border, metallic corner ornaments, a small empty emblem slot at the top and a wide empty name bar at the bottom, isolated on plain solid green background, game UI asset, no text, no watermark
```

### `ui_card_frame_enemy.png` — 적 카드 프레임
```
Vertical sci-fi trading card frame asset with a large empty transparent window in the center for a character portrait, menacing obsidian-black #12080F crystalline design with jagged edges, glowing violet #B84CFF energy cracks along the border, magenta #FF2E88 corner gems, a small empty emblem slot at the top and a wide empty name bar at the bottom, isolated on plain solid green background, game UI asset, no text, no watermark
```

## C. 전투맵 지형 타일 4종 (assetMap tile_* 키)

- 크기: 1024×1024 생성 → **128×128 저장** · 투명배경 **필수** (그리드 셀 위에 얹힘)
- 타일은 위에서 내려다본 단일 오브젝트. 셀에 꽉 차지 않게 여백 10% 정도.

### `tile_asteroid.png` — 소행성 (엄폐 +명중 보정)
```
Top-down view of a single large grey-brown asteroid rock with craters and small orbiting debris chunks, game terrain tile object, centered, isolated on plain solid green background, clean stylized sci-fi game art, no text, no watermark
```

### `tile_debris.png` — 잔해 (파괴된 함선 조각)
```
Top-down view of scattered broken spaceship wreckage pieces, torn white hull fragments with scorch marks and exposed glowing wires, game terrain tile object, centered, isolated on plain solid green background, clean stylized sci-fi game art, no text, no watermark
```

### `tile_nebula.png` — 성운 (명중 -15)
```
Top-down view of a soft wispy teal and violet nebula gas cloud puff, semi-transparent edges fading out, dreamy concealment fog, game terrain tile object, centered, isolated on plain solid green background, clean stylized sci-fi game art, no text, no watermark
```

### `tile_mine.png` — 지뢰 (진입 피해 필드)
```
Top-down view of a menacing sci-fi space mine, a dark metal sphere studded with red #FF3B3B blinking spike sensors, faint warning glow ring around it, game terrain tile object, centered, isolated on plain solid green background, clean stylized sci-fi game art, no text, no watermark
```

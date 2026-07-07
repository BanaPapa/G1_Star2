# 적 세력(보이드) 스프라이트 프롬프트 — 유닛 9 + 보스 2 + 보스 컷인 2

- 크기: 유닛 1024×1024 생성 → **256×256 저장** · 투명배경 **필수** · 컷인은 1536×1024(와이드) 생성 → 1280×720 저장, 투명배경 불필요
- 저장 파일명 = enemies.json의 sprite/cutin 키 그대로 (**코드 수정 없이 바로 반영**). 톱뷰 유닛은 위(N)를 향하게.
- ⚠ 보이드 비주얼 컨셉(아래)은 제안 상태 — 첫 1~2장 뽑아보고 마음에 들면 DESIGN_BIBLE에 확정 기록할 것.

**보이드 세력 공통 디자인** (모든 프롬프트에 포함됨): 흑요석처럼 검은 결정질 선체 `#12080F`, 표면 균열 사이 바이올렛 `#B84CFF` 발광, 마젠타 `#FF2E88` 코어, 비대칭·유기체적 실루엣 — "빛을 삼키는 자들".

공통 문구(참고): `asymmetric obsidian-black crystalline hull #12080F, glowing violet #B84CFF energy cracks, magenta #FF2E88 core light, jagged organic-mechanical alien silhouette`

## 기본 유닛 6종 (아군 함급 대응체 — 크기 위계 동일)

### `unit_gunship_void.png` — 보이드 정찰기 (건십급, 다수 출현·교란)
```
Top-down view alien warship sprite for a tactical strategy game, facing straight up, small fast scout craft shaped like a jagged obsidian shard, asymmetric obsidian-black crystalline hull #12080F, glowing violet #B84CFF energy cracks, small magenta #FF2E88 core light, insect-like menacing silhouette, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

### `unit_frigate_void.png` — 보이드 전투기 (프리깃급, 주력)
```
Top-down view alien warship sprite for a tactical strategy game, facing straight up, medium attack craft with blade-like crystalline wings, asymmetric obsidian-black crystalline hull #12080F, glowing violet #B84CFF energy cracks along the wing edges, magenta #FF2E88 core light, jagged organic-mechanical silhouette, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

### `unit_destroyer_void.png` — 보이드 호위함 (디스트로이어급, 호위·집중사격)
```
Top-down view alien warship sprite for a tactical strategy game, facing straight up, sturdy escort warship with clustered crystal cannon spikes on both flanks, asymmetric obsidian-black crystalline hull #12080F, glowing violet #B84CFF energy cracks, magenta #FF2E88 core light, armored jagged silhouette, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

### `unit_cruiser_void.png` — 보이드 포격함 (크루저급, 원거리 견제)
```
Top-down view alien warship sprite for a tactical strategy game, facing straight up, long-range artillery warship with one oversized crystalline lance cannon extending far forward, asymmetric obsidian-black crystalline hull #12080F, glowing violet #B84CFF energy charge lines along the cannon, magenta #FF2E88 core light, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

### `unit_battlecruiser_void.png` — 보이드 지휘함 (배틀크루저급, 버프·소환)
```
Top-down view alien warship sprite for a tactical strategy game, facing straight up, large command warship crowned with a ring of floating crystal spires broadcasting violet #B84CFF command signals, asymmetric obsidian-black crystalline hull #12080F, bright magenta #FF2E88 central core like an eye, imposing regal alien silhouette, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

### `unit_battleship_void.png` — 보이드 중장함 (배틀십급, 탱커)
```
Top-down view alien warship sprite for a tactical strategy game, facing straight up, massive heavily armored dreadnought covered in thick overlapping obsidian crystal plates like a fortress, asymmetric obsidian-black crystalline hull #12080F, deep violet #B84CFF glow between armor seams, magenta #FF2E88 core light, overwhelming bulky silhouette, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

## 고유 유닛 3종

### `unit_drone_void.png` — 보이드 드론 떼 (소형 다수·물량)
```
Top-down view sprite of a swarm of five tiny alien drones flying in loose formation, each a small obsidian-black crystal shard #12080F with a single glowing magenta #FF2E88 dot core and violet #B84CFF trail, insect swarm feel, centered as one group, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

### `unit_thorn_void.png` — 가시 순양함 (근접 피해 반사 — 가시 장갑)
```
Top-down view alien warship sprite for a tactical strategy game, facing straight up, cruiser covered entirely in long sharp obsidian crystal thorns pointing outward in every direction like a sea urchin, obsidian-black hull #12080F, violet #B84CFF glow at each thorn tip, magenta #FF2E88 core, hostile porcupine silhouette, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

### `unit_rift_void.png` — 차원 균열 (이동 불가·고사거리, 보스 2페이즈 소환물)
```
Top-down view sprite of a stationary dimensional rift, a jagged tear in space itself glowing violet #B84CFF and magenta #FF2E88 from within, dark void energy leaking out, floating obsidian fragments orbiting the tear, ominous portal, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

## 보스 2종

### `boss_garr.png` — 약탈왕 가르 (미니보스, 전면 강력 주포 / 측후방 약점)
```
Top-down view alien boss warship sprite for a tactical strategy game, facing straight up, colossal raider flagship with two giant forward ramming horns made of dark crystal and one massive front-facing main cannon, battle-scarred asymmetric obsidian-black hull #12080F with trophy wreckage welded on, aggressive violet #B84CFF energy cracks, burning magenta #FF2E88 core, brutal pirate-king silhouette, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

### `boss_warden.png` — 심연의 파수꾼 (최종보스, 차원 균열 소환)
```
Top-down view alien final boss sprite for a tactical strategy game, facing straight up, ancient colossal guardian entity built around one giant glowing magenta #FF2E88 eye-like core at its center, cathedral-scale obsidian-black crystalline body #12080F with symmetrical wing-like crystal arrays, violet #B84CFF energy veins radiating from the eye, small dimensional rifts opening around it, godlike ominous presence, centered, isolated on plain solid green background, dark sci-fi game art, no text, no watermark
```

## 보스 컷인 일러스트 2종 (1536×1024 생성 → 1280×720 저장)

### `cutin_garr_01.png` — 가르 필살기 컷인
```
Dynamic sci-fi boss cut-in illustration, wide 16:9 composition, a colossal alien raider flagship with giant crystal ramming horns charging directly toward the viewer at a dramatic diagonal angle, its massive front cannon flaring with magenta #FF2E88 light about to fire, violet #B84CFF energy streaks and speed lines, dark space battlefield with burning wrecks, terrifying overwhelming momentum, no text, no watermark
```

### `cutin_warden_01.png` — 워든 2페이즈 컷인
```
Dynamic sci-fi final boss cut-in illustration, wide 16:9 composition, an ancient colossal guardian entity awakening its giant magenta #FF2E88 eye-core which fills the scene with blinding light, obsidian crystal wings unfolding, dimensional rifts tearing open across the dark starfield around it, violet #B84CFF energy veins pulsing, apocalyptic dread and awe, dramatic low angle, no text, no watermark
```

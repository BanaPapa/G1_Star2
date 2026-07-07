# 아군 함선 스프라이트 프롬프트 — 헬리온 연방 6함급 (톱뷰)

- 크기: 1024×1024 생성 → **256×256 저장** · 투명배경 **필수** (`scripts/remove_bg.py`)
- 저장 파일명: `hull_{함급}_n.png` (북쪽=위를 향한 1장만 생성)
- **8방향은 생성하지 말 것** — N 방향 1장을 스크립트로 45°씩 회전해 8장 자동 생성 (메인 CLI에 회전 스크립트 요청)
- 6장을 나란히 두고 건십→배틀십 순으로 **덩치·디테일 밀도가 커지는지** 확인. 어긋난 함급만 재생성.
- 성계맵 아이콘(`icon_{함급}_{방향}.png`, 96×96)은 같은 이미지를 축소해서 사용 — 별도 생성 불필요.

공통 세력 디자인: 매끈한 일제형 백색 선체 `#F2F4F8` + 레드 `#FF3B3B` 포인트 스트라이프 + 시안 `#00E0FF` 디테일 발광 + 청색 `#3AA8FF` 엔진.

### `hull_gunship_n.png` — 건십 (소형·고기동, 기존 4방향 세트 교체용)
```
Top-down view spaceship sprite for a tactical strategy game, facing straight up, small agile arrow-shaped gunship, twin forward light cannons, oversized blue #3AA8FF engine thrusters relative to its tiny body, sleek unified white hull #F2F4F8 with red #FF3B3B accent stripes and cyan #00E0FF glowing details, ceramic composite armor plating, symmetrical silhouette, centered, isolated on plain solid green background, clean vector-like digital painting, no text, no watermark
```

### `hull_frigate_n.png` — 프리깃 (중형·다목적)
```
Top-down view spaceship sprite for a tactical strategy game, facing straight up, medium multipurpose frigate, slim elongated hull with modular equipment mounts along the spine, balanced proportions, twin blue #3AA8FF engine thrusters, sleek unified white hull #F2F4F8 with red #FF3B3B accent stripes and cyan #00E0FF glowing details, symmetrical silhouette, centered, isolated on plain solid green background, clean vector-like digital painting, no text, no watermark
```

### `hull_destroyer_n.png` — 디스트로이어 (중형·화력)
```
Top-down view spaceship sprite for a tactical strategy game, facing straight up, heavily armed destroyer, reinforced angular armor plating, prominent heavy cannon batteries mounted on both sides of the hull, sturdy wide body, blue #3AA8FF engines, sleek unified white hull #F2F4F8 with red #FF3B3B accent stripes and cyan #00E0FF glowing details, symmetrical silhouette, centered, isolated on plain solid green background, clean vector-like digital painting, no text, no watermark
```

### `hull_cruiser_n.png` — 크루저 헬리온급 ★주력함 (기준 함선)
```
Top-down view spaceship sprite for a tactical strategy game, facing straight up, elegant flagship-class cruiser, broad graceful hull with an integrated plasma cannon array along the centerline and missile bays on the wings, raised command bridge structure, quad blue #3AA8FF engines, sleek unified white hull #F2F4F8 with red #FF3B3B accent stripes and cyan #00E0FF glowing details, symmetrical silhouette, centered, isolated on plain solid green background, clean vector-like digital painting, no text, no watermark
```

### `hull_battlecruiser_n.png` — 배틀크루저 (대형·기동 기함)
```
Top-down view spaceship sprite for a tactical strategy game, facing straight up, fast heavy battlecruiser, long powerful streamlined hull combining speed and firepower, layered armor sections, quad cluster of large blue #3AA8FF engines, forward heavy cannon spine, sleek unified white hull #F2F4F8 with red #FF3B3B accent stripes and cyan #00E0FF glowing details, symmetrical silhouette, centered, isolated on plain solid green background, clean vector-like digital painting, no text, no watermark
```

### `hull_battleship_n.png` — 배틀십 (최상위·요새)
```
Top-down view spaceship sprite for a tactical strategy game, facing straight up, massive fortress-like super-heavy battleship, overwhelming bulk with thick layered armor plates, multiple giant main cannon turrets along the deck, slow imposing presence, wide blue #3AA8FF engine block, sleek unified white hull #F2F4F8 with red #FF3B3B accent stripes and cyan #00E0FF glowing details, symmetrical silhouette, centered, isolated on plain solid green background, clean vector-like digital painting, no text, no watermark
```

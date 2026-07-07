# 에이스 캐릭터 프롬프트 — 초상화 4 + 필살기 컷인 4

- 초상화: 1024×1024 생성 → **512×512 저장** · `ace_{id}_portrait.png` (aces.json 키와 일치, 코드 수정 불필요)
- 컷인: 1536×1024(와이드) 생성 → **1280×720 저장** · `cutin_{id}_01.png` · 투명배경 불필요
- **같은 캐릭터의 초상화와 컷인은 같은 세션에서 연달아 생성** (동일 인물로 보여야 함 — 초상화 먼저 뽑고, 그 이미지를 참조로 첨부해 컷인 요청하면 가장 안정적)
- 근거: aces.json `visualNote` 필드

## 카이 레인 (열혈 파일럿 — 건십/배틀십 적성)

### `ace_kai_portrait.png`
```
Sci-fi anime style character portrait, bust shot, a young man with short spiky red hair and a scar across his cheek, wearing a red pilot suit with white trim, confident fearless grin, fiery amber eyes, dramatic rim lighting, dark starfield background, clean cel shading, detailed expressive eyes, high quality game character portrait, no text, no watermark
```

### `cutin_kai_01.png`
```
Dynamic anime special-attack cut-in illustration, wide 16:9 composition, a young man with short spiky red hair and a cheek scar in a red pilot suit, shouting a passionate battle cry inside a fighter cockpit, orange flames and warning lights reflected on the canopy glass, gripping the throttle hard, intense speed lines and glowing energy effects, dramatic diagonal camera angle, space battle visible through the canopy, high energy, no text, no watermark
```

## 세라 노바 (냉정한 저격수 — 크루저 적성)

### `ace_sera_portrait.png`
```
Sci-fi anime style character portrait, bust shot, a woman with a long silver ponytail, wearing a sleek blue pilot suit, cold expressionless face with sharp piercing ice-blue eyes, composed and unshakable, dramatic rim lighting, dark starfield background, clean cel shading, detailed eyes, high quality game character portrait, no text, no watermark
```

### `cutin_sera_01.png`
```
Dynamic anime special-attack cut-in illustration, wide 16:9 composition, a woman with a long silver ponytail in a sleek blue pilot suit, calmly locking onto a distant target, a glowing cyan holographic crosshair reticle projected over one sharp eye, zero emotion and absolute precision, thin light trails converging on her aim point, cool blue tones with speed lines, dramatic side profile angle, space battlefield background, no text, no watermark
```

## 밀라 카르토 (정비광 엔지니어 — 지원 적성)

### `ace_mila_portrait.png`
```
Sci-fi anime style character portrait, bust shot, a cheerful young woman engineer with engineer goggles pushed up on her forehead, cyan and green color scheme jumpsuit with tool harness, bright wide beaming smile, warm friendly energy, a smudge of grease on her cheek, dramatic rim lighting, dark starfield background, clean cel shading, detailed eyes, high quality game character portrait, no text, no watermark
```

### `cutin_mila_01.png`
```
Dynamic anime special-attack cut-in illustration, wide 16:9 composition, a cheerful woman engineer with goggles on her forehead in a cyan and green jumpsuit, gleefully slamming a giant lever down with both hands, electric sparks and steam bursting around her, holographic repair drones spinning into action, mischievous grin, energetic comic exaggeration, speed lines, machinery-filled engine room background, no text, no watermark
```

## 레이븐 (수수께끼의 전 보이드 에이스 — 영입 조건부)

### `ace_raven_portrait.png`
```
Sci-fi anime style character portrait, bust shot, a mysterious androgynous figure in a black and deep-purple flight suit, upper face partially hidden by a sleek angular black mask with a faint violet #B84CFF glow, shadow motif wisps curling around the shoulders, calm unreadable presence, dramatic rim lighting, dark starfield background, clean cel shading, high quality game character portrait, no text, no watermark
```

### `cutin_raven_01.png`
```
Dynamic anime special-attack cut-in illustration, wide 16:9 composition, a mysterious masked figure in a black and deep-purple flight suit emerging from swirling darkness, igniting a blade of violet #B84CFF energy that cuts the shadows apart, magenta #FF2E88 light glinting off the angular mask, tendrils of void energy trailing behind, silent lethal elegance, dramatic low angle with speed lines, dark space background, no text, no watermark
```

"""
fx_*.png 원본(생성 AI 출력, 임의 크기)을 게임 규격으로 가공하는 스크립트.

- fx_glow_soft:  밝기 무게중심으로 재중심 → 256×256 (검정 배경 유지 — ADD 블렌드용)
- fx_spark:      밝기 무게중심으로 재중심 + 내용 크기에 맞게 크롭 → 128×128
- fx_blackhole / fx_gravity_well: 초록 크로마키 제거(despill 포함) → 내용 중심 크롭 → 256×256 RGBA
- fx_explosion_sheet / fx_annihilation_sheet: 1024×1024 리사이즈 → 4×4 셀 경계의
  격자선 제거(셀 가장자리 몇 px을 검정으로) → 재조립

실행: python scripts/process_fx_textures.py  (public/assets/의 파일을 제자리에서 갱신)
"""
import numpy as np
from PIL import Image

ASSETS = 'C:/dev/g1_Star2/public/assets'


def luminance(rgb):
    return rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114


def recenter_crop(img: Image.Image, out_size: int, content_scale: float) -> Image.Image:
    """밝기 무게중심을 중앙에 두고, 내용 반경의 content_scale배 정사각형으로 크롭 후 리사이즈."""
    rgb = np.array(img.convert('RGB'), dtype=np.float32)
    h, w = rgb.shape[:2]
    lum = luminance(rgb)
    mask = lum > 12  # 검정 배경 위 발광 픽셀
    if not mask.any():
        return img.resize((out_size, out_size), Image.LANCZOS)
    ys, xs = np.nonzero(mask)
    weights = lum[ys, xs]
    cy = float((ys * weights).sum() / weights.sum())
    cx = float((xs * weights).sum() / weights.sum())
    # 내용 반경: 무게중심에서 밝은 픽셀까지 거리의 99퍼센타일
    r = float(np.percentile(np.hypot(ys - cy, xs - cx), 99))
    half = max(r * content_scale, out_size / 2)
    half = min(half, cx, cy, w - cx, h - cy)  # 이미지 밖으로 안 나가게
    box = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
    return img.crop(box).resize((out_size, out_size), Image.LANCZOS)


def chroma_key_green(img: Image.Image, out_size: int) -> Image.Image:
    """초록 배경 제거 → RGBA. 발광 가장자리의 반투명을 보존하는 그린스크린 키."""
    rgb = np.array(img.convert('RGB'), dtype=np.float32)
    h, w = rgb.shape[:2]
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    greenness = g - np.maximum(r, b)
    # 코너에서 배경색과 초록 강도 측정
    s = 20
    corner_px = np.concatenate([
        rgb[:s, :s].reshape(-1, 3), rgb[:s, -s:].reshape(-1, 3),
        rgb[-s:, :s].reshape(-1, 3), rgb[-s:, -s:].reshape(-1, 3),
    ])
    bg = np.median(corner_px, axis=0)  # (3,)
    bg_g = float(bg[1] - max(bg[0], bg[2]))
    alpha = 1.0 - np.clip(greenness / bg_g, 0.0, 1.0)
    # 언믹싱: 반투명 픽셀 rgb = subject*a + bg*(1-a) 이므로 배경 기여분을 빼서 원색 복원
    a3 = alpha[:, :, None]
    unmixed = np.clip((rgb - bg[None, None, :] * (1.0 - a3)) / np.maximum(a3, 0.02), 0, 255)
    # despill: 남은 초록 끼 제거 (G를 R/B 최대값 이하로)
    unmixed[:, :, 1] = np.minimum(unmixed[:, :, 1], np.maximum(unmixed[:, :, 0], unmixed[:, :, 2]))
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = unmixed.astype(np.uint8)
    out[:, :, 3] = (alpha * 255).astype(np.uint8)
    result = Image.fromarray(out, 'RGBA')
    # 내용(불투명 픽셀) 중심으로 정사각 크롭
    mask = alpha > 0.05
    ys, xs = np.nonzero(mask)
    if len(ys):
        cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
        half = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2 * 1.02
        half = min(half, cx, cy, w - cx, h - cy)
        result = result.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))
    return result.resize((out_size, out_size), Image.LANCZOS)


def process_sheet(img: Image.Image, trim_px: int = 6) -> Image.Image:
    """1024로 리사이즈 후 4×4 셀 가장자리 trim_px를 검정으로 — 격자선 제거."""
    sheet = img.convert('RGB').resize((1024, 1024), Image.LANCZOS)
    arr = np.array(sheet)
    cell = 256
    for row in range(4):
        for col in range(4):
            y0, x0 = row * cell, col * cell
            arr[y0:y0 + trim_px, x0:x0 + cell] = 0
            arr[y0 + cell - trim_px:y0 + cell, x0:x0 + cell] = 0
            arr[y0:y0 + cell, x0:x0 + trim_px] = 0
            arr[y0:y0 + cell, x0 + cell - trim_px:x0 + cell] = 0
    return Image.fromarray(arr, 'RGB')


def main():
    jobs = [
        ('fx_glow_soft.png', lambda im: recenter_crop(im, 256, 1.15)),
        ('fx_spark.png', lambda im: recenter_crop(im, 128, 1.25)),
        ('fx_blackhole.png', lambda im: chroma_key_green(im, 256)),
        ('fx_gravity_well.png', lambda im: chroma_key_green(im, 256)),
        ('fx_explosion_sheet.png', process_sheet),
        ('fx_annihilation_sheet.png', process_sheet),
    ]
    for name, fn in jobs:
        path = f'{ASSETS}/{name}'
        im = Image.open(path)
        out = fn(im)
        out.save(path, optimize=True)
        print(f'{name}: {im.size} {im.mode} -> {out.size} {out.mode}')
    print('완료.')


if __name__ == '__main__':
    main()

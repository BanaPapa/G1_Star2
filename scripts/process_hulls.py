"""
힉스필드 생성 탑다운 함선 원본(그린스크린) → 게임용 4방향 hull 스프라이트 가공.

파이프라인 (함급당):
  1. BFS 플러드필로 코너와 연결된 배경(그린) 제거 + 엣지 페더링 (remove_bg.py와 동일 방식)
  2. 배경 잔여 스필 억제: 알파 경계부의 배경색 성분을 중화
  3. 콘텐츠 bbox 크롭 → 회전 클리핑 방지용 대각선 크기 정사각 캔버스에 배치
  4. N(위) 기준 회전으로 아이소 4방향 생성: ne=-45°, nw=+45°, se=-135°, sw=+135°
  5. 256×256 리사이즈 → public/assets/hull_{함급}_{방향}.png 저장

사용: python scripts/process_hulls.py [함급 ...]  (인자 없으면 6함급 전부)
"""
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'docs', 'design', 'generated')
OUT_DIR = os.path.join(ROOT, 'public', 'assets')

# 스킨 → (함급 → 원본 파일). 'base'는 기본 백색 헬리온 (프리깃은 v2 재생성본).
# 계열 스킨 출력 키는 hull_{함급}_{스킨}_{방향}, base는 hull_{함급}_{방향}.
SKIN_SOURCES = {
    'base': {
        'gunship': 'topdown_gunship.png',
        'frigate': 'topdown_frigate_v2.png',
        'destroyer': 'topdown_destroyer.png',
        'cruiser': 'topdown_cruiser.png',
        'battlecruiser': 'topdown_battlecruiser.png',
        'battleship': 'topdown_battleship.png',
    },
    'laser': {
        'gunship': 'laser_topdown_gunship.png',
        'frigate': 'laser_topdown_frigate.png',
        'destroyer': 'laser_topdown_destroyer.png',
        'cruiser': 'laser_topdown_cruiser.png',
        'battlecruiser': 'laser_topdown_battlecruiser.png',
        'battleship': 'laser_topdown_battleship.png',
    },
    'ion': {
        'gunship': 'ion_topdown_gunship.png',
        'frigate': 'ion_topdown_frigate.png',
        'destroyer': 'ion_topdown_destroyer.png',
        'cruiser': 'ion_topdown_cruiser.png',
        'battlecruiser': 'ion_topdown_battlecruiser.png',
        'battleship': 'ion_topdown_battleship.png',
    },
    'plasma': {
        'gunship': 'plasma_topdown_gunship.png',
        'frigate': 'plasma_topdown_frigate.png',
        'destroyer': 'plasma_topdown_destroyer.png',
        'cruiser': 'plasma_topdown_cruiser.png',
        'battlecruiser': 'plasma_topdown_battlecruiser.png',
        'battleship': 'plasma_topdown_battleship.png',
    },
    'gravity': {
        'gunship': 'gravity_topdown_gunship.png',
        'frigate': 'gravity_topdown_frigate.png',
        'destroyer': 'gravity_topdown_destroyer.png',
        'cruiser': 'gravity_topdown_cruiser.png',
        'battlecruiser': 'gravity_topdown_battlecruiser.png',
        'battleship': 'gravity_topdown_battleship.png',
    },
}

# N(위)을 기준으로 한 화면 방향 회전각 (PIL rotate: 양수=반시계)
DIRECTIONS = {'ne': -45, 'nw': 45, 'se': -135, 'sw': 135}

FLOOD_TOL = 40      # 배경 플러드필 색상 허용 오차 (그린스크린은 편차가 커서 넉넉히)
FEATHER_PX = 3      # 엣지 페더링 반경
SPILL_RADIUS = 24   # 배경 경계로부터 이 픽셀 이내에만 거리 기반 스필 억제 적용 (반투명 엔진 화염에 비쳐든 배경까지 커버)
SPILL_STRENGTH = 1.0  # 배경 크로마 투영 성분 제거 비율 (1.0=완전 중화)
# 투영 계수(proj)가 큰 픽셀은 색 자체가 배경 크로마 방향 → 함선 고유색일 수 없으므로
# 거리와 무관하게 완전 중화 (화염 팁 깊숙이 비쳐든 마젠타 코어 등). LO→HI 선형 램프.
SPILL_PROJ_LO = 0.35  # 이 미만은 거리 가중치만 적용 (함선 내부 디테일 보존)
SPILL_PROJ_HI = 0.70  # 이 이상은 전량 중화
OUT_SIZE = 256
BBOX_PAD_RATIO = 0.04

# Rec.601 휘도 가중치 — 크로마(색상 성분) = 픽셀 − 휘도 분리에 사용
_LUMA = np.array([0.299, 0.587, 0.114], dtype=np.float32)


def _flood_background_mask(rgb: np.ndarray, tol: float):
    h, w = rgb.shape[:2]
    s = min(20, w // 10)
    corners = np.concatenate([
        rgb[:s, :s].reshape(-1, 3), rgb[:s, -s:].reshape(-1, 3),
        rgb[-s:, :s].reshape(-1, 3), rgb[-s:, -s:].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0)
    close = np.sqrt(((rgb - bg) ** 2).sum(axis=2)) < tol

    visited = np.zeros((h, w), dtype=bool)
    queue = deque([(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)])
    for (sy, sx) in list(queue):
        visited[sy, sx] = close[sy, sx]
    while queue:
        y, x = queue.popleft()
        if not visited[y, x]:
            continue
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))
    return visited, bg  # visited: True=배경, bg: 코너 중앙값 배경색(RGB)


def _suppress_spill(rgb: np.ndarray, bg_mask: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """알파 경계부의 배경색 스필(예: 마젠타/그린 프린지)을 중화.

    픽셀 크로마(픽셀 − 휘도)를 배경 크로마 방향에 투영해, 양(+)의 투영 성분만
    배경 크로마 방향으로 빼서 제거한다. 투영이 음수인 픽셀(배경과 보색 관계인
    함선 자체 발광 등)은 건드리지 않는다. 배경 경계로부터의 거리로 가중치를 줘
    경계 인접부(SPILL_RADIUS 이내)에만 적용하므로 함선 내부 디테일은 보존된다.
    """
    bg = bg.astype(np.float32)
    bg_chroma = bg - float((bg * _LUMA).sum())
    denom = float((bg_chroma * bg_chroma).sum())
    if denom < 1e-6:  # 배경이 무채색이면 방향이 없으므로 스필 억제 불필요
        return rgb

    rgbf = rgb.astype(np.float32)
    luma = rgbf @ _LUMA
    chroma = rgbf - luma[..., None]
    # 각 픽셀 크로마의 배경 크로마 방향 투영 계수 (양수만)
    proj = np.clip((chroma * bg_chroma).sum(axis=2) / denom, 0.0, None)

    # 배경 경계(전경 방향)로부터의 거리 → 가중치. 페더 픽셀(bg_mask 내, 거리 0)은
    # 가중치 1, 전경 안쪽으로 SPILL_RADIUS 까지 선형 감쇠.
    fg_dist = distance_transform_edt(~bg_mask)
    weight = np.clip((SPILL_RADIUS - fg_dist) / SPILL_RADIUS, 0.0, 1.0)

    # 투영이 강한 픽셀은 거리와 무관하게 완전 중화 (화염 팁 깊숙한 마젠타 코어 등).
    # 약한 투영은 기존 거리 가중치 유지 → 함선 내부 디테일 보존.
    strong = np.clip((proj - SPILL_PROJ_LO) / (SPILL_PROJ_HI - SPILL_PROJ_LO), 0.0, 1.0)
    weight = np.maximum(weight, strong)

    factor = (SPILL_STRENGTH * weight * proj)[..., None]
    rgbf = rgbf - factor * bg_chroma
    return np.clip(rgbf, 0, 255)


def _cutout(img: Image.Image) -> Image.Image:
    rgb = np.array(img.convert('RGB'), dtype=np.int32)
    bg_mask, bg = _flood_background_mask(rgb, FLOOD_TOL)

    # 배경 잔여 스필 억제 — 알파 경계부의 배경색 성분 중화
    rgb = _suppress_spill(rgb, bg_mask, bg)

    # 전경까지의 거리 기반 페더링 알파
    dist = distance_transform_edt(bg_mask)
    alpha = np.clip((FEATHER_PX - dist) / FEATHER_PX, 0.0, 1.0)
    alpha[~bg_mask] = 1.0

    out = np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    return Image.fromarray(out)


def _crop_to_content(img: Image.Image) -> Image.Image:
    alpha = np.array(img)[:, :, 3]
    ys, xs = np.where(alpha > 8)
    if len(ys) == 0:
        raise ValueError('빈 이미지 — 배경 제거 실패')
    pad = int(max(img.size) * BBOX_PAD_RATIO)
    x0, x1 = max(0, xs.min() - pad), min(img.width, xs.max() + 1 + pad)
    y0, y1 = max(0, ys.min() - pad), min(img.height, ys.max() + 1 + pad)
    return img.crop((x0, y0, x1, y1))


def _to_rotatable_square(img: Image.Image) -> Image.Image:
    # 45° 회전에도 잘리지 않도록 대각선 길이의 정사각 캔버스 중앙에 배치
    side = math.ceil(math.hypot(img.width, img.height))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def process(skin: str, hull_class: str) -> list:
    src_path = os.path.join(SRC_DIR, SKIN_SOURCES[skin][hull_class])
    square = _to_rotatable_square(_crop_to_content(_cutout(Image.open(src_path))))
    key_mid = hull_class if skin == 'base' else f'{hull_class}_{skin}'
    written = []
    for suffix, angle in DIRECTIONS.items():
        rotated = square.rotate(angle, resample=Image.BICUBIC, expand=False)
        final = rotated.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
        out_path = os.path.join(OUT_DIR, f'hull_{key_mid}_{suffix}.png')
        final.save(out_path)
        written.append(out_path)
    return written


def main():
    # 사용: python scripts/process_hulls.py [스킨] [함급 ...]  (인자 없으면 base 전체)
    args = sys.argv[1:]
    skin = args[0] if args and args[0] in SKIN_SOURCES else 'base'
    targets = [a for a in args if a not in SKIN_SOURCES] or list(SKIN_SOURCES[skin].keys())
    for hull_class in targets:
        if hull_class not in SKIN_SOURCES[skin]:
            print(f'알 수 없는 함급: {hull_class} (가능: {", ".join(SKIN_SOURCES[skin])})')
            sys.exit(1)
        for path in process(skin, hull_class):
            print('saved', os.path.relpath(path, ROOT))


if __name__ == '__main__':
    main()

"""
hull_gunship_{ne,nw,se,sw}.png 흰색 배경 제거 스크립트.
- BFS 플러드필로 코너와 연결된 밝은 배경 영역을 탐지
- scipy distance_transform_edt 으로 엣지 페더링
- RGBA PNG로 저장 (함선 본체·엔진 글로우 보존)
"""
import sys
import numpy as np
from PIL import Image
from collections import deque
from scipy.ndimage import distance_transform_edt

DIRECTIONS = ['ne', 'nw', 'se', 'sw']
ASSETS_DIR = 'C:/dev/star2/public/assets'

# 배경 플러드필 색상 허용 오차 (유클리드 거리)
FLOOD_TOL = 22
# 엣지 페더링 반경 (픽셀)
FEATHER_PX = 4


def remove_bg(img_path: str, out_path: str) -> None:
    img = Image.open(img_path).convert('RGB')
    w, h = img.size
    rgb = np.array(img, dtype=np.int32)

    # 코너 20×20 영역에서 배경색 추정 (중앙값 사용)
    s = min(20, w // 10)
    corner_pixels = np.concatenate([
        rgb[:s, :s].reshape(-1, 3),
        rgb[:s, -s:].reshape(-1, 3),
        rgb[-s:, :s].reshape(-1, 3),
        rgb[-s:, -s:].reshape(-1, 3),
    ])
    bg = np.median(corner_pixels, axis=0)   # shape (3,)

    # BFS: 네 코너에서 시작해 배경색과 가까운 연결된 픽셀을 탐색
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()
    for (sy, sx) in [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]:
        d = float(np.linalg.norm(rgb[sy, sx] - bg))
        if d < FLOOD_TOL:
            visited[sy, sx] = True
            queue.append((sy, sx))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                d = float(np.linalg.norm(rgb[ny, nx] - bg))
                if d < FLOOD_TOL:
                    visited[ny, nx] = True
                    queue.append((ny, nx))

    # visited = 배경 픽셀. 배경에서 함선까지 거리 변환으로 알파 부드럽게 처리
    dist_from_bg = distance_transform_edt(~visited)
    alpha = np.clip(dist_from_bg / FEATHER_PX, 0.0, 1.0)

    # RGBA 배열 조합
    result = np.zeros((h, w, 4), dtype=np.uint8)
    result[:, :, :3] = rgb.astype(np.uint8)
    result[:, :, 3] = (alpha * 255).astype(np.uint8)

    Image.fromarray(result, 'RGBA').save(out_path, optimize=False)

    bg_removed = visited.sum()
    total = h * w
    print(f"  {out_path.split('/')[-1]}: bg={bg.astype(int)}  "
          f"제거={bg_removed}px ({bg_removed/total*100:.1f}%)  "
          f"보존={total-bg_removed}px ({(total-bg_removed)/total*100:.1f}%)")


def main():
    print("hull_gunship 배경 제거 시작...")
    for d in DIRECTIONS:
        src = f'{ASSETS_DIR}/hull_gunship_{d}.png'
        dst = f'{ASSETS_DIR}/hull_gunship_{d}.png'
        remove_bg(src, dst)
    print("완료.")


if __name__ == '__main__':
    main()

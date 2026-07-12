"""
힉스필드 생성 HoMM 장소맵 건물 원본(마젠타 크로마키) → 게임용 건물 스프라이트 가공.

파이프라인 (건물당, 회전 없음 — 함선과 달리 방향 변형 불필요):
  1. _cutout: 마젠타 플러드필 제거 + despill(스필 억제) + 엣지 페더링 (process_hulls 재사용)
  2. _crop_to_content: 콘텐츠 bbox 크롭 (process_hulls 재사용)
  3. 긴 변 기준 정사각 캔버스 중앙에 투명 패딩 배치
  4. 512×512 LANCZOS 리사이즈 → public/assets/bld_{건물}_lv{레벨}.png 저장

계획상 5건물 × Lv1/3/5 = 15장이나, 아직 생성되지 않은 원본은 "skip (missing)"으로
건너뛴다 (크레딧 충전 후 파일 추가되면 같은 스크립트 재실행).

사용: python scripts/process_buildings.py [건물이름 ...]  (인자 없으면 존재하는 전체)
"""
import os
import sys

from PIL import Image

# process_hulls의 크로마키 컷아웃 파이프라인 재사용 (복붙 금지).
# 같은 디렉토리이므로 스크립트 경로를 sys.path에 추가한 뒤 임포트한다.
# process_hulls는 import 시 부작용이 없고, main은 __main__ 가드 안에 있다.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_hulls import _cutout, _crop_to_content  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'docs', 'design', 'generated')
OUT_DIR = os.path.join(ROOT, 'public', 'assets')

# 5건물 × Lv1/3/5 = 15장. 원본 파일명: bld_{건물}_lv{레벨}_src.png
BUILDINGS = ['command_center', 'research_lab', 'workshop', 'shipyard', 'outpost']
LEVELS = [1, 3, 5]

OUT_SIZE = 512


def _to_square(img: Image.Image) -> Image.Image:
    """긴 변 기준 정사각 캔버스 중앙에 투명 패딩으로 배치 (회전 없음)."""
    side = max(img.width, img.height)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def process(building: str, level: int) -> str | None:
    """원본 1장을 가공해 저장. 원본이 없으면 None 반환(skip)."""
    src_name = f'bld_{building}_lv{level}_src.png'
    src_path = os.path.join(SRC_DIR, src_name)
    if not os.path.exists(src_path):
        print(f'skip (missing) {src_name}')
        return None

    square = _to_square(_crop_to_content(_cutout(Image.open(src_path))))
    final = square.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    out_path = os.path.join(OUT_DIR, f'bld_{building}_lv{level}.png')
    final.save(out_path)
    print('saved', os.path.relpath(out_path, ROOT))
    return out_path


def main():
    # 사용: python scripts/process_buildings.py [건물이름 ...]  (인자 없으면 전체)
    targets = sys.argv[1:] or BUILDINGS
    for building in targets:
        if building not in BUILDINGS:
            print(f'알 수 없는 건물: {building} (가능: {", ".join(BUILDINGS)})')
            sys.exit(1)
        for level in LEVELS:
            process(building, level)


if __name__ == '__main__':
    main()

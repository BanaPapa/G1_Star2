# -*- coding: utf-8 -*-
"""내장 전투맵 JSON 생성기 — map/*.png 배경 21장에 대한 mapDefinition을 map/<id>.json으로 생성.

Phase 7-1: 배경 이미지의 플랫폼 실루엣을 근사한 그리드 마스크 + 스폰/장애물/위험 지대 배치.
거친 그리드 표준(함선이 굵직하게 보이도록): 일반 13x10 / 특수·전략 15x12 / 보스 11x9.
에디터(Battle Map Editor)에서 열어 세부 조정 가능 — 이 스크립트는 초기 데이터 생성용.

사용법: python scripts/generate_builtin_maps.py [--preview]
"""
import json
import math
import os
import sys
import urllib.parse
from collections import deque

W, H = 1672, 941
MARGIN_X, MARGIN_Y = 0.03, 0.03  # 그리드 다이아몬드가 이미지 가장자리에서 띄우는 여백

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'map')

# 통과 가능 타일(연결성 검사용) — battleMap.js TILE_TYPES와 동일 기준
PASSABLE = {'playable', 'spawn_player', 'spawn_enemy', 'spawn_neutral', 'spawn_boss',
            'hazard', 'objective', 'repair_zone', 'special_zone'}


def corners():
    return {
        'top':    {'x': W / 2,            'y': H * MARGIN_Y},
        'right':  {'x': W * (1 - MARGIN_X), 'y': H / 2},
        'bottom': {'x': W / 2,            'y': H * (1 - MARGIN_Y)},
        'left':   {'x': W * MARGIN_X,     'y': H / 2},
    }


def cell_fxfy(x, y, cols, rows):
    """셀 중심의 정규화 이미지 좌표(fx, fy) — 0..1. bilinear(다이아몬드) 투영 기준."""
    u = (x + 0.5) / cols
    v = (y + 0.5) / rows
    fx = (1 + u - v) / 2
    fy = (u + v) / 2
    return fx, fy


def superellipse(fx, fy, cx, cy, rx, ry, p=2.0):
    return (abs(fx - cx) / rx) ** p + (abs(fy - cy) / ry) ** p <= 1.0


def ellipse(fx, fy, cx, cy, rx, ry):
    return superellipse(fx, fy, cx, cy, rx, ry, 2.0)


def band_h(fy, cy, half):
    return abs(fy - cy) <= half


# ── 맵별 실루엣/배치 스펙 ────────────────────────────────────────────────
# mask(fx, fy) -> bool (플랫폼 위인가)
# extras: dict — blocked/hazard/special_zone/objective 좌표 지정용 콜백(선택)

def spec_list():
    S = []

    # ── 일반형 (13x10) — 개방 지형, 낮은 장애물 밀도 ──
    S.append(dict(
        base='Nebula Platform', type='normal', terrains=['nebula', 'asteroid'], cols=13, rows=10,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.46, 0.42, 2.5),
    ))
    S.append(dict(
        base='Eclipse Cross', type='normal', terrains=['distortion', 'mine'], cols=13, rows=10,
        mask=lambda fx, fy: (abs(fx - 0.5) < 0.17 or abs(fy - 0.5) < 0.19)
                            and abs(fx - 0.5) < 0.45 and abs(fy - 0.5) < 0.43,
        hazards=[(0.5, 0.34), (0.34, 0.5), (0.66, 0.5), (0.5, 0.66)],  # 왜곡 잔열 — 중앙 교차부 사방
    ))
    S.append(dict(
        base='Starpoint Field', type='normal', terrains=['asteroid', 'nebula'], cols=13, rows=10,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.47, 0.45, 1.4),
    ))
    S.append(dict(
        base='Twin Expanse', type='normal', terrains=['nebula'], cols=13, rows=10,
        mask=lambda fx, fy: (ellipse(fx, fy, 0.30, 0.50, 0.28, 0.34) or ellipse(fx, fy, 0.73, 0.50, 0.28, 0.34))
                            and not ellipse(fx, fy, 0.515, 0.44, 0.11, 0.13),  # 중앙 공동(구멍)
    ))
    S.append(dict(
        base='Violet Frontier', type='normal', terrains=['distortion'], cols=13, rows=10,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.47, 0.43, 1.8),
        hazards=[(0.38, 0.38), (0.62, 0.60), (0.5, 0.5)],
    ))

    # ── 특수형 (15x12, 통로형은 15x10) — 지형 문법이 뚜렷한 맵 ──
    S.append(dict(
        base='Cross Nexus', type='special', terrains=['nebula', 'asteroid'], cols=15, rows=12,
        mask=lambda fx, fy: (abs(fx - 0.5) < 0.13 or abs(fy - 0.5) < 0.15)
                            and superellipse(fx, fy, 0.5, 0.5, 0.47, 0.45, 1.5),
        blocked=[(0.5, 0.5)],                       # 중앙 기념비
        specials=[(0.44, 0.5), (0.56, 0.5), (0.5, 0.42), (0.5, 0.58)],  # 성소 구역
    ))
    S.append(dict(
        base='Crossfire Gate', type='special', terrains=['asteroid', 'nebula'], cols=15, rows=12,
        mask=lambda fx, fy: (abs((fx - 0.5) - (fy - 0.5)) < 0.13 or abs((fx - 0.5) + (fy - 0.5)) < 0.13
                             or ellipse(fx, fy, 0.22, 0.24, 0.15, 0.17) or ellipse(fx, fy, 0.78, 0.24, 0.15, 0.17)
                             or ellipse(fx, fy, 0.22, 0.76, 0.15, 0.17) or ellipse(fx, fy, 0.78, 0.76, 0.15, 0.17))
                            and superellipse(fx, fy, 0.5, 0.5, 0.47, 0.45, 1.6),
    ))
    S.append(dict(
        base='Frontier Outpost', type='special', terrains=['nebula', 'mine'], cols=15, rows=12,
        mask=lambda fx, fy: ellipse(fx, fy, 0.34, 0.46, 0.30, 0.36)
                            or (band_h(fy, 0.56, 0.09) and 0.55 <= fx <= 0.88)
                            or ellipse(fx, fy, 0.84, 0.62, 0.10, 0.13),
        blocked=[(0.28, 0.34), (0.42, 0.52), (0.24, 0.56)],
        specials=[(0.84, 0.62)],                    # 전초기지 착륙 패드
    ))
    S.append(dict(
        base='Highground Citadel', type='special', terrains=['mine'], cols=15, rows=12,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.46, 0.43, 1.8),
        blocked=[(0.38, 0.36), (0.46, 0.36), (0.56, 0.62), (0.64, 0.62), (0.52, 0.48)],  # 성채 내벽
        specials=[(0.30, 0.62), (0.70, 0.36)],      # 크리스탈 채굴점
    ))
    S.append(dict(
        base='Linebreaker', type='special', terrains=['mine', 'asteroid'], cols=15, rows=10,
        mask=lambda fx, fy: band_h(fy, 0.5, 0.22) and abs(fx - 0.5) < 0.47,
        blocked=[(0.5, 0.34), (0.5, 0.44), (0.5, 0.62)],  # 중앙 저지선(돌파 갭 1칸)
    ))
    S.append(dict(
        base='Longfront Passage', type='special', terrains=['asteroid', 'nebula'], cols=15, rows=10,
        mask=lambda fx, fy: (band_h(fy, 0.5, 0.20) and abs(fx - 0.5) < 0.47)
                            or ellipse(fx, fy, 0.12, 0.5, 0.12, 0.30) or ellipse(fx, fy, 0.88, 0.5, 0.12, 0.30),
        blocked=[(0.36, 0.42), (0.64, 0.58)],
    ))
    S.append(dict(
        base='Resource Archipelago', type='special', terrains=['distortion', 'mine'], cols=15, rows=12,
        mask=lambda fx, fy: any(ellipse(fx, fy, cx, cy, 0.11, 0.135) for cx, cy in [
            (0.28, 0.22), (0.55, 0.20), (0.80, 0.30), (0.18, 0.45), (0.44, 0.48),
            (0.68, 0.50), (0.30, 0.72), (0.56, 0.76), (0.80, 0.68)]),
        specials=[(0.55, 0.20), (0.18, 0.45), (0.56, 0.76)],  # 자원 섬
    ))
    S.append(dict(
        base='Twin Outpost', type='special', terrains=['mine', 'nebula'], cols=15, rows=10,
        mask=lambda fx, fy: ellipse(fx, fy, 0.28, 0.47, 0.26, 0.36)
                            or ellipse(fx, fy, 0.80, 0.60, 0.17, 0.26)
                            or (band_h(fy, 0.53, 0.07) and 0.28 <= fx <= 0.80),
        blocked=[(0.28, 0.40), (0.80, 0.56)],
        specials=[(0.22, 0.52), (0.84, 0.66)],
    ))

    # ── 전략형 (15x12) — 장애물·구조물 밀도 높음 ──
    S.append(dict(
        base='Amber Stronghold', type='elite', terrains=['mine'], cols=15, rows=12,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.46, 0.42, 3.0),
        blocked=[(0.30, 0.30), (0.38, 0.30), (0.60, 0.36), (0.44, 0.56), (0.62, 0.62), (0.70, 0.62)],
        specials=[(0.62, 0.72)],                    # 관제 패드
    ))
    S.append(dict(
        base='Bastion Guard', type='elite', terrains=['nebula', 'mine'], cols=15, rows=12,
        mask=lambda fx, fy: ellipse(fx, fy, 0.20, 0.60, 0.17, 0.24)
                            or ellipse(fx, fy, 0.48, 0.48, 0.20, 0.27)
                            or ellipse(fx, fy, 0.78, 0.30, 0.17, 0.24),
        blocked=[(0.48, 0.40), (0.42, 0.56)],
        specials=[(0.20, 0.60), (0.78, 0.30)],
    ))
    S.append(dict(
        base='Celestial Bastion', type='elite', terrains=['asteroid', 'nebula'], cols=15, rows=12,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.46, 0.43, 3.0),
        blocked=[(0.34, 0.28), (0.42, 0.28), (0.58, 0.34), (0.30, 0.52), (0.52, 0.56),
                 (0.60, 0.56), (0.44, 0.72), (0.68, 0.44)],
    ))
    S.append(dict(
        base='Central Dominion', type='elite', terrains=['distortion'], cols=15, rows=12,
        mask=lambda fx, fy: ellipse(fx, fy, 0.5, 0.5, 0.21, 0.25) or any(
            ellipse(fx, fy, 0.5 + 0.34 * math.cos(a), 0.5 + 0.38 * math.sin(a), 0.095, 0.115)
            for a in [k * math.pi / 4 for k in range(8)]),
        hazards=[(0.5, 0.30), (0.5, 0.70), (0.32, 0.5), (0.68, 0.5)],  # 중앙-위성 연결부 왜곡장
    ))
    S.append(dict(
        base='Classic Nexus', type='elite', terrains=['distortion', 'nebula'], cols=15, rows=12,
        mask=lambda fx, fy: (ellipse(fx, fy, 0.27, 0.27, 0.17, 0.21) or ellipse(fx, fy, 0.73, 0.27, 0.17, 0.21)
                             or ellipse(fx, fy, 0.27, 0.73, 0.17, 0.21) or ellipse(fx, fy, 0.73, 0.73, 0.17, 0.21)
                             or abs(fx - 0.5) < 0.08 or abs(fy - 0.5) < 0.09)
                            and superellipse(fx, fy, 0.5, 0.5, 0.47, 0.45, 1.8),
        blocked=[(0.5, 0.5)],
        hazards=[(0.5, 0.28), (0.5, 0.72)],
    ))
    S.append(dict(
        base='Starforge Citadel', type='elite', terrains=['asteroid', 'nebula'], cols=15, rows=12,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.47, 0.45, 1.3),
        blocked=[(0.5, 0.5), (0.34, 0.34), (0.66, 0.34), (0.34, 0.66), (0.66, 0.66)],  # 중앙 코어 + 탑 4
        specials=[(0.42, 0.28), (0.60, 0.70)],      # 단조 패드
    ))

    # ── 보스형 (11x9) — 개방 아레나, 함선 최대 크기 ──
    S.append(dict(
        base='Solar Bastion', type='boss', terrains=['mine', 'nebula'], cols=11, rows=9,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.47, 0.44, 1.6),
        boss=(0.68, 0.42),
    ))
    S.append(dict(
        base='Violet Rampart', type='boss', terrains=['distortion'], cols=11, rows=9,
        mask=lambda fx, fy: superellipse(fx, fy, 0.5, 0.5, 0.46, 0.43, 2.0),
        blocked=[(0.32, 0.36), (0.68, 0.64), (0.32, 0.64), (0.68, 0.36)],  # 성벽 기둥
        boss=(0.60, 0.32),                          # 상단 육각 단상
        hazards=[(0.5, 0.5), (0.42, 0.5)],
    ))

    return S


# ── 생성 로직 ───────────────────────────────────────────────────────────

def slugify(s):
    return ''.join(c if c.isalnum() else '_' for c in s.lower()).strip('_').replace('__', '_')


def nearest_playable(cells, fx0, fy0, cols, rows, taken):
    best, bd = None, 1e9
    for (x, y) in cells:
        if (x, y) in taken:
            continue
        fx, fy = cell_fxfy(x, y, cols, rows)
        d = (fx - fx0) ** 2 + (fy - fy0) ** 2
        if d < bd:
            best, bd = (x, y), d
    return best


def build_map(spec):
    cols, rows = spec['cols'], spec['rows']
    tiles = {}
    playable = []
    for y in range(rows):
        for x in range(cols):
            fx, fy = cell_fxfy(x, y, cols, rows)
            if spec['mask'](fx, fy):
                playable.append((x, y))
            else:
                tiles[(x, y)] = 'void'

    taken = set()

    # 지정 좌표 배치 (blocked / hazard / special_zone / boss)
    def place(points, ttype):
        for (fx0, fy0) in points or []:
            c = nearest_playable(playable, fx0, fy0, cols, rows, taken)
            if c:
                tiles[c] = ttype
                taken.add(c)

    place(spec.get('blocked'), 'blocked')
    place(spec.get('hazards'), 'hazard')
    place(spec.get('specials'), 'special_zone')

    # 스폰: 아군 = 좌측 끝, 적군 = 우측 끝 (fx 기준 정렬, fy로 분산)
    free = [c for c in playable if c not in taken]
    by_fx = sorted(free, key=lambda c: cell_fxfy(c[0], c[1], cols, rows)[0])
    n_p = 8 if spec['type'] != 'boss' else 6
    n_e = 10 if spec['type'] != 'boss' else 8

    for c in by_fx[:n_p]:
        tiles[c] = 'spawn_player'
        taken.add(c)

    if spec.get('boss'):
        bx, by = spec['boss']
        for _ in range(3):
            c = nearest_playable(playable, bx, by, cols, rows, taken)
            if c:
                tiles[c] = 'spawn_boss'
                taken.add(c)

    placed_e = 0
    for c in reversed(by_fx):
        if placed_e >= n_e:
            break
        if c in taken:
            continue
        tiles[c] = 'spawn_enemy'
        taken.add(c)
        placed_e += 1

    # 연결성 보정 — BFS로 컴포넌트 나눠 가장 큰 것에 직선 통로로 연결
    ensure_connected(tiles, cols, rows)

    overrides = {f'{x},{y}': t for (x, y), t in sorted(tiles.items(), key=lambda kv: (kv[0][1], kv[0][0]))}
    spawn_zones = {'player': [], 'enemy': [], 'neutral': [], 'boss': []}
    side_of = {'spawn_player': 'player', 'spawn_enemy': 'enemy', 'spawn_neutral': 'neutral', 'spawn_boss': 'boss'}
    for (x, y), t in sorted(tiles.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        if t in side_of:
            spawn_zones[side_of[t]].append({'x': x, 'y': y})

    map_id = f"map_{spec['type']}_{slugify(spec['base'])}"
    biome_of = {'asteroid': 'asteroid_field', 'nebula': 'nebula', 'mine': 'mining_belt', 'distortion': 'distortion_zone'}
    difficulty = {'normal': 'standard', 'special': 'standard', 'elite': 'elite', 'boss': 'boss'}[spec['type']]

    return {
        'schemaVersion': 1,
        'id': map_id,
        'name': spec['base'],
        'background': '/__maps/file/' + urllib.parse.quote(spec['base'] + '.png'),
        'imageSize': {'width': W, 'height': H},
        'grid': {'type': 'isometric', 'cols': cols, 'rows': rows, 'corners': corners()},
        'tiles': {'default': 'playable', 'overrides': overrides},
        'spawnZones': spawn_zones,
        'objects': [],
        'metadata': {
            'biome': biome_of[spec['terrains'][0]],
            'difficulty': difficulty,
            'type': spec['type'],
            'terrains': spec['terrains'],
        },
    }


def tile_at(tiles, x, y):
    return tiles.get((x, y), 'playable')


def ensure_connected(tiles, cols, rows):
    def passable(x, y):
        return 0 <= x < cols and 0 <= y < rows and tile_at(tiles, x, y) in PASSABLE

    seen = set()
    comps = []
    for y in range(rows):
        for x in range(cols):
            if not passable(x, y) or (x, y) in seen:
                continue
            comp = []
            q = deque([(x, y)])
            seen.add((x, y))
            while q:
                cx, cy = q.popleft()
                comp.append((cx, cy))
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    nx, ny = cx + dx, cy + dy
                    if passable(nx, ny) and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        q.append((nx, ny))
            comps.append(comp)

    if len(comps) <= 1:
        return
    comps.sort(key=len, reverse=True)
    main = set(comps[0])
    for comp in comps[1:]:
        # 가장 가까운 (main, comp) 셀 쌍을 찾아 L자 통로 연결
        best, bd = None, 1e9
        for (ax, ay) in comp:
            for (bx, by) in main:
                d = abs(ax - bx) + abs(ay - by)
                if d < bd:
                    best, bd = ((ax, ay), (bx, by)), d
        (ax, ay), (bx, by) = best
        x, y = ax, ay
        while x != bx:
            x += 1 if bx > x else -1
            if tile_at(tiles, x, y) not in PASSABLE:
                tiles[(x, y)] = 'playable'
        while y != by:
            y += 1 if by > y else -1
            if tile_at(tiles, x, y) not in PASSABLE:
                tiles[(x, y)] = 'playable'
        main |= set(comp)
        main.add((ax, ay))


CHAR = {'void': ' ', 'blocked': '#', 'hazard': '~', 'special_zone': '*', 'objective': 'o',
        'spawn_player': 'P', 'spawn_enemy': 'E', 'spawn_boss': 'B', 'spawn_neutral': 'N', 'playable': '.'}


def preview(m):
    cols, rows = m['grid']['cols'], m['grid']['rows']
    ov = m['tiles']['overrides']
    print(f"\n{m['id']}  ({cols}x{rows})  type={m['metadata']['type']}  terrains={m['metadata']['terrains']}")
    for y in range(rows):
        line = ''
        for x in range(cols):
            line += CHAR[ov.get(f'{x},{y}', 'playable')]
        print('  ' + line)


def main():
    show = '--preview' in sys.argv
    out = []
    for spec in spec_list():
        m = build_map(spec)
        path = os.path.join(OUT_DIR, m['id'] + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(m, f, ensure_ascii=False, indent=2)
        out.append(m)
        if show:
            preview(m)
    print(f"\n생성 완료: {len(out)}개 → map/*.json")


if __name__ == '__main__':
    main()

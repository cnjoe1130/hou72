#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""量每张卡背图的「实画范围」，写 art/crop.json。

粗稿四周留白不一（实画宽 0.55–1.00），直接 object-fit:cover 会留出一条窄画。
这里量出与纸底有差异的外接框，构建时再换算成画槽里的放大倍数与偏移。
只用 PIL 读像素；产物是纯数据，build_art.py 不需要 PIL。

留白区不是纯色（有颗粒噪点），所以按列/行统计超阈像素的比例来定位画边：
单个噪点不该把框撑到留白里，实画边则一整列都超阈。
"""

import json
import os
import statistics
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art")
OUT = os.path.join(ART, "crop.json")
STEP = 2
THRESHOLD = 24       # 三通道绝对差之和
MIN_FRAC = 0.06      # 一列里至少 6% 的取样行要超阈，才算画到这一列
PAD_FRAC = 0.004     # 收边后留 0.4% 的余量，避免软边被切

def paper_color(px, w, h):
    ring = []
    for x in range(0, w, 3):
        ring.append(px[x, 0])
        ring.append(px[x, h - 1])
    for y in range(0, h, 3):
        ring.append(px[0, y])
        ring.append(px[w - 1, y])
    return tuple(int(statistics.median(c[i] for c in ring)) for i in range(3))

def bbox(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    bg = paper_color(px, w, h)

    def white(p):
        # 画稿左/上边常带一条近白纸边（不是画，也不是留白底色），一并当背景
        return min(p) >= 240 and max(p) - min(p) <= 14

    def far(x, y):
        p = px[x, y]
        return not white(p) and abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) > THRESHOLD

    ys = list(range(0, h, STEP))
    xs = list(range(0, w, STEP))
    col_hits = [sum(1 for y in ys if far(x, y)) for x in xs]
    row_hits = [sum(1 for x in xs if far(x, y)) for y in ys]
    need_c = max(1, int(len(ys) * MIN_FRAC))
    need_r = max(1, int(len(xs) * MIN_FRAC))

    cols = [x for x, n in zip(xs, col_hits) if n >= need_c]
    rows = [y for y, n in zip(ys, row_hits) if n >= need_r]
    if not cols or not rows:
        return [0.0, 0.0, 1.0, 1.0]

    x1, x2, y1, y2 = cols[0], cols[-1] + STEP, rows[0], rows[-1] + STEP

    # 贴边的整条白纸边再往里收（最多 40px），免得画框里露出一条白
    def col_white(x):
        return sum(1 for y in ys if white(px[x, y])) >= len(ys) * 0.9

    def row_white(y):
        return sum(1 for x in xs if white(px[x, y])) >= len(xs) * 0.9

    for _ in range(40):
        if x2 - x1 > 40 and col_white(x1):
            x1 += 1
        else:
            break
    for _ in range(40):
        if x2 - x1 > 40 and col_white(x2 - 1):
            x2 -= 1
        else:
            break
    for _ in range(40):
        if y2 - y1 > 40 and row_white(y1):
            y1 += 1
        else:
            break
    for _ in range(40):
        if y2 - y1 > 40 and row_white(y2 - 1):
            y2 -= 1
        else:
            break

    padx, pady = PAD_FRAC * w, PAD_FRAC * h
    x1 = max(0.0, x1 - padx)
    x2 = min(float(w), x2 + padx)
    y1 = max(0.0, y1 - pady)
    y2 = min(float(h), y2 + pady)
    return [round(x1 / w, 4), round(y1 / h, 4),
            round((x2 - x1) / w, 4), round((y2 - y1) / h, 4)]

def main():
    files = sorted(f for f in os.listdir(ART) if f.endswith(".webp"))
    if len(files) != 72:
        sys.exit("art/ 下是 %d 张（期望 72）" % len(files))
    old = {}
    if os.path.isfile(OUT):
        with open(OUT, encoding="utf-8") as fh:
            old = json.load(fh)
    out = {}
    for f in files:
        out[f] = bbox(os.path.join(ART, f))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=0, sort_keys=True)
        fh.write("\n")
    widths = sorted(v[2] for v in out.values())
    heights = sorted(v[3] for v in out.values())
    drift = max((abs(out[k][2] - old[k][2]) for k in out if k in old), default=0)
    print("PASS  crop %d 张 -> %s（实画宽 %.2f–%.2f，中位 %.2f；高 %.2f–%.2f；较旧值最大宽差 %.3f）"
          % (len(out), os.path.relpath(OUT, ROOT), widths[0], widths[-1],
             widths[len(widths) // 2], heights[0], heights[-1], drift))

if __name__ == "__main__":
    main()

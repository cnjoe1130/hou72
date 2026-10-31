#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""art/manifest.txt + art/*.webp -> app/assets/art72/ + app/assets/art-manifest.js

索引只由 manifest.txt 的文件名生成，代码里不出现候号→图的硬编码映射。
图原样复制（不重压缩、不改名），只做存在性 / 尺寸 / 覆盖校验。
"""

import json
import os
import re
import shutil
import struct
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(ROOT, "art")
MANIFEST = os.path.join(SRC_DIR, "manifest.txt")
OUT_DIR = os.path.join(ROOT, "app", "assets", "art72")
OUT_JS = os.path.join(ROOT, "app", "assets", "art-manifest.js")

WANT_W, WANT_H = 512, 683
NAME_RE = re.compile(r"^hou_(\d{2})_[a-z]+\.webp$")


def webp_size(path):
    with open(path, "rb") as f:
        head = f.read(30)
    if head[:4] != b"RIFF" or head[8:12] != b"WEBP":
        sys.exit("不是 webp：%s" % os.path.basename(path))
    chunk = head[12:16]
    if chunk == b"VP8 ":
        b = head[26:30]
        w, h = struct.unpack("<HH", b)
        return w & 0x3FFF, h & 0x3FFF
    if chunk == b"VP8L":
        bits = int.from_bytes(head[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8X":
        w = int.from_bytes(head[24:27], "little") + 1
        h = int.from_bytes(head[27:30], "little") + 1
        return w, h
    sys.exit("未知 webp 子格式（%s）：%s" % (chunk, os.path.basename(path)))


SLOT_W, SLOT_H = 346.0, 461.0     # 与 index.html 的 .art-slot 一致


def crop_css(rows):
    """实画框 -> 画槽尺寸 + 槽内放大与位移。

    槽按实画比例收窄（竖幅画不裁），图再放大到只显示实画框部分。
    现在的 AI 生图本身是满幅 3:4、没有白纸边，crop.json 全为 [0,0,1,1]，
    算出来就是 345.6×461、100%/0%——即整幅入槽，不做任何裁切。
    """
    path = os.path.join(SRC_DIR, "crop.json")
    if not os.path.isfile(path):
        print("WARN 缺 art/crop.json，按满幅处理（先跑 tools/measure_art_crop.py）")
        return {str(r["hou"]): [SLOT_W, SLOT_H, 100.0, 100.0, 0.0, 0.0]
                for r in rows}
    with open(path, encoding="utf-8") as f:
        boxes = json.load(f)

    out = {}
    for r in rows:
        box = boxes.get(r["file"])
        if not box:
            sys.exit("crop.json 缺 %s" % r["file"])
        x, y, w, h = box
        aspect = (w * WANT_W) / (h * WANT_H)
        sw = min(SLOT_W, SLOT_H * aspect)
        sh = sw / aspect
        k = sw / (w * WANT_W)
        iw, ih = WANT_W * k, WANT_H * k
        out[str(r["hou"])] = [round(sw, 1), round(sh, 2),
                              round(iw / sw * 100, 2), round(ih / sh * 100, 2),
                              round(-x * WANT_W * k / sw * 100, 2),
                              round(-y * WANT_H * k / sh * 100, 2)]
    return out


def main():
    if not os.path.isfile(MANIFEST):
        sys.exit("缺 art/manifest.txt")

    rows = []
    with open(MANIFEST, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("|")
            if len(parts) != 4:
                sys.exit("manifest 第 %d 行列数不是 4：%r" % (n, line))
            name, hou, hou_name, motif = parts
            m = NAME_RE.match(name)
            if not m:
                sys.exit("文件名不合规范（hou_NN_拼音.webp）：%s" % name)
            num = int(m.group(1))
            if str(num) != str(int(hou)) or not 1 <= num <= 72:
                sys.exit("manifest 行 %d 候号对不上：%s / %s" % (n, name, hou))
            rows.append({"file": name, "hou": num, "hou_name": hou_name, "motif": motif})

    hids = sorted(r["hou"] for r in rows)
    if hids != list(range(1, 73)):
        missing = sorted(set(range(1, 73)) - set(hids))
        dup = sorted({h for h in hids if hids.count(h) > 1})
        sys.exit("manifest 覆盖不全：缺 %s 重 %s" % (missing, dup))

    files = sorted(f for f in os.listdir(SRC_DIR) if f.lower().endswith(".webp"))
    listed = sorted(r["file"] for r in rows)
    if files != listed:
        sys.exit("manifest 与实际文件不一致：多 %s 少 %s"
                 % (sorted(set(files) - set(listed)), sorted(set(listed) - set(files))))

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)

    total = 0
    for r in rows:
        src = os.path.join(SRC_DIR, r["file"])
        w, h = webp_size(src)
        if (w, h) != (WANT_W, WANT_H):
            sys.exit("尺寸不是 %d×%d：%s（%d×%d）" % (WANT_W, WANT_H, r["file"], w, h))
        dst = os.path.join(OUT_DIR, r["file"])
        shutil.copy2(src, dst)
        total += os.path.getsize(dst)

    index = {str(r["hou"]): "assets/art72/" + r["file"] for r in rows}

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("/* 由 build_art.py 从 art/manifest.txt 生成，勿手改。 */\n")
        f.write("window.HOU_ART = ")
        f.write(json.dumps(index, ensure_ascii=False, indent=0, sort_keys=True))
        f.write(";\n")
        f.write("window.HOU_ART_BOX = ")
        f.write(json.dumps(crop_css(rows), ensure_ascii=False, indent=0, sort_keys=True))
        f.write(";\n")

    print("PASS  art %d 张 %.0f KB -> %s"
          % (len(rows), total / 1024.0, os.path.relpath(OUT_DIR, ROOT)))


if __name__ == "__main__":
    main()

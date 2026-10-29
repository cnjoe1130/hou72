#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""hou72-final.json -> app/assets/hou72-data.js（只保留渲染需要的字段）。

不打包 classic / source_url / aliases / hou_hook：
- classic 原文里的「宜」会触发上架禁词扫描（field-scoped 才有意义，但打包件按全量扫）；
- hou_hook 明确不进卡，没必要进包；
- jieqi24 的节气解题不参与渲染。
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "hou72-final.json")
OUT = os.path.join(HERE, "app", "assets", "hou72-data.js")

FIELDS = ("hou", "jieqi", "order", "name_modern", "modern", "motif")


def main():
    doc = json.load(open(SRC, encoding="utf-8"))
    rows = [{k: r[k] for k in FIELDS} for r in doc["hou72"]]
    assert len(rows) == 72
    payload = {
        "meta": {
            "title": "七十二候 · 历法身份卡",
            "motif_vocab": doc["_meta"]["motif_vocab"],
        },
        "hou72": rows,
    }
    body = "window.HOU_DATA=" + json.dumps(payload, ensure_ascii=False,
                                           separators=(",", ":")) + ";\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(body)
    print(f"{OUT}: {len(body.encode('utf-8'))/1024:.1f} KB, {len(rows)} 行")


if __name__ == "__main__":
    main()

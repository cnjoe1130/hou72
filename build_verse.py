#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""hou72-verse.json -> app/assets/hou72-verse.js（按候号索引）。

build 期就卡禁词：诗与食俗进包，包内按全量扫，命中即失败。
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "hou72-verse.json")
OUT = os.path.join(ROOT, "app", "assets", "hou72-verse.js")

BANNED = re.compile("吉|凶|运|福|灾|宜|忌")
FIELDS = ("poem_text", "poem_author", "poem_title", "houge_text", "houge_src",
          "food_note", "food_src")


def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)

    out = {}
    for row in data["rows"]:
        hou = int(row["hou"])
        if not 1 <= hou <= 72:
            sys.exit("候号越界: %r" % hou)
        item = {}
        for k in FIELDS:
            item[k] = row.get(k)
        if item["poem_text"] is not None and not isinstance(item["poem_text"], list):
            sys.exit("poem_text 必须是数组或 null（候 %d）" % hou)
        if item["poem_text"] and item["poem_author"] and not item["poem_title"]:
            sys.exit("有作者无篇名，违反可考纪律（候 %d）" % hou)
        # 候歌小注只做无诗候的补位层，有诗的卡不许混入
        if item["houge_text"] and item["poem_text"]:
            sys.exit("有诗又有候歌小注，层级冲突（候 %d）" % hou)
        if item["houge_src"] and not item["houge_text"]:
            sys.exit("有候歌落款无小注（候 %d）" % hou)
        text = json.dumps(item, ensure_ascii=False)
        hit = BANNED.findall(text)
        if hit:
            sys.exit("禁词命中（候 %d）：%s" % (hou, "".join(sorted(set(hit)))))
        out[str(hou)] = item

    missing = sorted(set(range(1, 73)) - {int(k) for k in out})
    if missing:
        sys.exit("候号缺 %d 条：%s" % (len(missing), missing))
    extra = sorted({int(k) for k in out} - set(range(1, 73)))
    if extra:
        sys.exit("候号越界：%s" % extra)

    body = json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 由 build_verse.py 从 hou72-verse.json 生成，勿手改。 */\n")
        f.write("window.HOU_VERSE = ")
        f.write(body)
        f.write(";\n")

    print("PASS  verse %d 条 -> %s" % (len(out), os.path.relpath(OUT, ROOT)))


if __name__ == "__main__":
    main()

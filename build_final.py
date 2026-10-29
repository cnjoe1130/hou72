#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""hou72-final.json：baseline v2 -> 简体 motif 词表 + 鸟类/草木花拆分。

classic / name / modern / aliases / source_url / confidence 逐字段原样搬运；
只重写 motif 与 _meta 的词表部分。
"""

import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "..", "baseline", "hou72.json")
OUT = os.path.join(HERE, "hou72-final.json")

# 繁体 -> 简体（只作用于 motif 标签与词表，classic 原文不动）
SIMP = {
    "風": "风", "雲": "云", "鷹隼": "鹰隼", "鴈": "雁", "鷄鸣": "鸡鸣",
    "蟄虫": "蛰虫", "馬": "马", "魚": "鱼", "電": "电", "蟲": "虫",
    "走獸": "走兽", "陽": "阳",
}

# 20 条含「鸟类」的候：按物种定主标签。
# 值落在 APPROVED_SPECIES 内 = 已批词表；其余 = 不在已批 7 物种名单里的罕见鸟种。
BIRD_SPECIES = {
    5: "雁",     # 候鴈北
    8: "仓庚",   # 仓庚鸣（黄鹂）
    9: "鹰隼",   # 鹰化为鸠（主鹰隼，鸠进 all）
    10: "燕",    # 元鸟至
    14: "鴽",    # 田鼠化为鴽（鹌鹑类）
    17: "鸠",    # 鸣鸠拂其羽
    18: "戴胜",  # 戴胜降于桑
    26: "鵙",    # 鵙始鸣（伯劳）
    27: "反舌",  # 反舌无声（乌鸫）
    40: "鹰隼",  # 鹰乃祭鸟
    43: "雁",    # 鸿鴈来
    44: "燕",    # 元鸟归
    45: "鸟类",  # 羣鸟养羞（通称，无单一物种）
    49: "雁",    # 鸿鴈来宾
    50: "雀",    # 雀入大水为蛤
    57: "雉",    # 雉入大水为蜃
    61: "鹖鴠",  # 鹖鴠不鸣
    67: "雁",    # 鴈北乡
    68: "鹊",    # 鹊始巢
    69: "雉",    # 雉雊
}
BIRD_EXTRA = {9: ["鸠"]}   # 鹰化为鸠：主鹰隼，鸠作二级
APPROVED_SPECIES = {"燕", "雁", "鸠", "鹊", "雉", "鸡", "鹰隼", "鸟类"}
# dual：主标签维持「鸟类」，把通行简体物种名追加进 all（只做二级意象，不改聚合）
POLICY = "dual"          # "strict" | "dual" | "extended"
COMMON_NAME = {8: "黄鹂", 14: "鹌鹑", 18: "戴胜", 26: "伯劳",
               27: "乌鸫", 50: "雀", 61: "鹖鴠"}

# 14 条含「草木花」的候：拆成 花/木/禾/草（列表首项为主标签）
PLANT_TAGS = {
    6: ["草", "木"],   # 草木萌动
    7: ["花", "木"],   # 桃始华
    13: ["花", "木"],  # 桐始华
    16: ["草"],        # 萍始生（主标签仍为泽）
    18: ["木"],        # 戴胜降于桑
    21: ["草"],        # 王瓜生
    22: ["草"],        # 苦菜秀
    23: ["草"],        # 靡草死
    24: ["禾"],        # 麦秋至
    30: ["草"],        # 半夏生
    34: ["草"],        # 腐草为萤（主标签仍为蟲）
    42: ["禾"],        # 禾乃登
    51: ["花"],        # 菊有黄华
    53: ["木", "草"],  # 草木黄落
    63: ["草"],        # 荔挺出
}

ORDER = ["日", "月", "星", "虹", "云", "雨雪", "冰", "水泉", "泽", "土", "雷",
         "风", "鹰隼", "鸟类", "雁", "燕", "鸡鸣", "鹿", "马", "蛰虫", "蚯蚓",
         "蝉", "狐", "花", "木", "禾", "草", "鱼", "露", "电", "天地", "走兽",
         "虫", "鸠", "鹊", "雉"]
EXTRA_SPECIES = ["仓庚", "鴽", "戴胜", "鵙", "反舌", "雀", "鹖鴠"]


def simplify(t):
    return SIMP.get(t, t)


def rebuild(row):
    old_p = row["motif"]["primary"]
    old_all = list(row["motif"]["all"])
    tags = [simplify(t) for t in old_all]
    p = simplify(old_p)

    if "鸟类" in tags:
        raw = BIRD_SPECIES[row["hou"]]
        if POLICY == "extended":
            species = raw
        else:
            species = raw if raw in APPROVED_SPECIES else "鸟类"
        rest = [t for t in tags if t != "鸟类"]
        if species != "鸟类" and species not in rest:
            rest.insert(0, species)
        if p == "鸟类":
            p = species
        for t in BIRD_EXTRA.get(row["hou"], []):
            if t not in rest:
                rest.append(t)
        tags = [p] + [t for t in rest if t != p] + (["鸟类"] if "鸟类" not in rest else [])
        if POLICY == "dual" and row["hou"] in COMMON_NAME:
            cn = COMMON_NAME[row["hou"]]
            if cn not in tags:
                tags.append(cn)

    if "草木花" in tags:
        plants = PLANT_TAGS[row["hou"]]
        rest = [t for t in tags if t != "草木花"]
        if p == "草木花":
            p = plants[0]
        tags = [p] + [t for t in rest if t != p]
        for t in plants:
            if t not in tags:
                tags.append(t)

    # 去重、保序、截到 3 个
    seen, out = set(), []
    for t in tags:
        if t not in seen:
            seen.add(t)
            out.append(t)
    if len(out) > 3:
        out = out[:3]
    if p not in out:
        out = [p] + out[:2]

    row["motif"] = {"primary": p, "all": out}
    return row


def main():
    doc = json.load(open(BASE, encoding="utf-8"))
    base_rows = doc["hou72"]
    rows = [rebuild(copy.deepcopy(r)) for r in base_rows]

    if POLICY == "extended":
        vocab = list(ORDER) + EXTRA_SPECIES
    elif POLICY == "dual":
        vocab = list(ORDER) + list(COMMON_NAME.values())
    else:
        vocab = list(ORDER)

    # ---- 校验 ----
    errs = []
    assert len(rows) == 72
    for r, b in zip(rows, base_rows):
        for f in ("name", "name_modern", "classic", "modern", "aliases",
                  "hou_hook", "source_url", "confidence", "jieqi", "order", "hou"):
            if r[f] != b[f]:
                errs.append(f"hou {r['hou']} 字段 {f} 被改动")
        m = r["motif"]
        if not (1 <= len(m["all"]) <= 3):
            errs.append(f"hou {r['hou']} all 长度 {len(m['all'])}")
        if m["primary"] not in m["all"]:
            errs.append(f"hou {r['hou']} primary 不在 all")
        bad = [t for t in m["all"] if t not in vocab]
        if bad:
            errs.append(f"hou {r['hou']} 词表外 {bad}")
        if m["primary"] not in vocab:
            errs.append(f"hou {r['hou']} primary 词表外")

    # 繁体残留（motif 字段）
    trad = set(SIMP) - {"陽"}
    for r in rows:
        for t in r["motif"]["all"]:
            if any(ch in t for ch in trad):
                errs.append(f"hou {r['hou']} 标签残留繁体 {t}")

    used = {t for r in rows for t in r["motif"]["all"]}
    primary_used = {r["motif"]["primary"] for r in rows}
    unused = [t for t in vocab if t not in used]

    # 旧粗标签是否清零
    leftover = [r["hou"] for r in rows
                if "鸟类" in r["motif"]["all"] and r["motif"]["primary"] == "鸟类"]
    plant_left = [r["hou"] for r in rows if "草木花" in r["motif"]["all"]]

    if errs:
        print("\n".join(errs))
        sys.exit(1)

    doc["_meta"]["title"] = "七十二候结构化数据 final（简体 motif 词表 + 家族拆分）"
    doc["_meta"]["motif_vocab"] = vocab
    doc["_meta"]["motif_vocab_note"] = (
        "标签与词表已归一简体；classic 原文保持源文写法未转。"
        "花/木/禾/草 由 草木花 拆出，鸠/鹊/雉 由 鸟类 拆出。")
    doc["_meta"]["motif_vocab_unused"] = unused
    doc["_meta"]["motif_split_note"] = {
        "鸟类": "20 候全部原样保留 鸟类 于 all（二级）；物种可判者主标签改为物种",
        "草木花": "14 候拆为 花/木/禾/草，草木花 不再出现",
        "policy": {
            "strict": "strict：罕见鸟种不入表",
            "dual": "dual：主标签维持 鸟类，通行简体物种名追加进 all（二级意象，不参与同象聚合）",
            "extended": "extended：罕见鸟种直接作主标签",
        }[POLICY],
    }
    if POLICY == "dual":
        doc["_meta"]["motif_vocab_extended"] = list(COMMON_NAME.values())
        doc["_meta"]["motif_vocab_extended_note"] = (
            "7 个物种名只作二级意象，用于意象行与检索；同象聚合按主标签（鸟类）走，不改变分组。")
    doc["hou72"] = rows

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")

    # ---- 打印 ----
    print(f"写出 {OUT}")
    print(f"词表 {len(vocab)} 词：{' '.join(vocab)}")
    print(f"零命中：{' '.join(unused) or '无'}")
    print(f"主标签仍为「鸟类」的行：{[r['hou'] for r in rows if r['motif']['primary'] == '鸟类']}")
    print(f"残留「草木花」的行：{plant_left}")
    from collections import Counter
    fam = Counter(r["motif"]["primary"] for r in rows)
    print("主标签家族：" + "，".join(f"{k}{v}" for k, v in
                                  sorted(fam.items(), key=lambda x: (-x[1], vocab.index(x[0])))))
    print("全部校验通过（字段零改动 / primary∈all / 1-3 标签 / 全部在词表内 / 无繁体标签）")


if __name__ == "__main__":
    main()

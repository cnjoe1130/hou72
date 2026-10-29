#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 hou_terms.js：1899–2050 每年 24 节气时刻（北京时间，视黄经实算）。

内核直接 import output-B/hou_calc.py（与 baseline 逐字节相同，未改一字）。
1899 年组不进入产品覆盖范围，仅用于定位 1900 年 1 月的冬至/小寒/大寒。
"""

import gzip
import hashlib
import importlib.util
import json
import os
import sys

import datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "hou_terms.js")
Y0, Y1 = 1899, 2050
NAME = "hou_calc"


TZ = dt.timezone(dt.timedelta(hours=8))


def parse(y, s):
    m = int(s[:2])
    return dt.datetime.strptime(f"{y if m >= 2 else y + 1}-{s}",
                                "%Y-%m-%dT%H:%M").replace(tzinfo=TZ)


def lookup(table, when):
    """与 app.js 相同的查表逻辑：定节气年 -> 二分/线性找覆盖节气 -> 天数定候。"""
    y = when.year
    first = parse(y, table[str(y)][0])
    key = y if when >= first else y - 1
    terms = [parse(key, s) for s in table[str(key)]]
    passed = [i for i, t in enumerate(terms) if t <= when]
    k = passed[-1]
    elapsed = (when - terms[k]).total_seconds() / 86400.0
    return k, min(int(elapsed // 5) + 1, 3)


def load_kernel():
    spec = importlib.util.spec_from_file_location(NAME, os.path.join(HERE, "hou_calc.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    hc = load_kernel()
    table = {}
    for y in range(Y0, Y1 + 1):
        table[str(y)] = [t.strftime("%m-%dT%H:%M") for _, t in hc.terms_for_year(y)]

    body = "window.HOU_TERMS=" + json.dumps(table, ensure_ascii=False,
                                            separators=(",", ":")) + ";"
    head = ("/* 二十四节气时刻表 · 北京时间(UTC+8) · 太阳视黄经实算 "
            "(ephem, 与 baseline hou_calc.py 同内核) · 覆盖 1900-01-01 ~ 2050-12-31。"
            "键=节气年（立春所在年），值=立春起 24 气，后两气落次年 1 月。"
            "1899 组仅服务 1900 年 1 月。 */\n")
    text = head + body + "\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)

    raw = len(text.encode("utf-8"))
    gz = len(gzip.compress(text.encode("utf-8"), 9))
    print(f"{OUT}: {raw/1024:.1f} KB raw, {gz/1024:.1f} KB gzip, {len(table)} 年 × 24")

    # ---- 对账 1：任务书 / baseline selftest 给定时刻 ----
    # 前三项是验收口径（与 selftest 打印值逐分钟一致）；后两项只是任务书格式示例里
    # 出现的历书值，按四舍五入发布，与本表截断口径差 1 分钟，仅作参考。
    refs = [("1994", "立冬", 18, "11-07T21:48", True),
            ("1994", "小雪", 19, "11-22T19:20", True),
            ("1995", "小寒", 22, "01-06T01:52", True),
            ("1994", "大雪", 20, "12-07T14:39", False),
            ("1994", "冬至", 21, "12-22T08:40", False)]
    ok = True
    for y, nm, k, want, required in refs:
        key = "1994" if (y == "1995" and nm == "小寒") else y
        got = table[key][k]
        if required:
            flag = "PASS" if got == want else "FAIL"
            ok &= got == want
        else:
            flag = "参考" if got == want else "参考（历书四舍五入，本表截断，差 1 分钟）"
        print(f"表查 {y} {nm}: {got} vs {want}  {flag}")

    # ---- 对账 2：2026 年 4 气现算 ----
    for k, nm in [(0, "立春"), (9, "夏至"), (12, "立秋"), (21, "冬至")]:
        fresh = hc._solve_term(hc.TERM_LON[k], hc._approx_utc(2026, k))
        fresh_cst = fresh.astimezone(hc.TZ).strftime("%m-%dT%H:%M")
        got = table["2026"][k]
        flag = "PASS" if got == fresh_cst else "FAIL"
        ok &= got == fresh_cst
        print(f"2026 {nm}: 表 {got} vs 现算 {fresh_cst}  {flag}")

    # ---- 对账 3：表内单调性 ----
    mono = True
    prev = None
    for y in range(Y0, Y1 + 1):
        ts = [parse(y, s) for s in table[str(y)]]
        for a, b in zip(ts, ts[1:]):
            if not a < b:
                mono = False
                print("单调性失败", y, a, b)
        if prev and not prev < ts[0]:
            mono = False
            print("跨年衔接失败", y, prev, ts[0])
        prev = ts[-1]
    ok &= mono
    print("单调性/跨年衔接:", "PASS" if mono else "FAIL")

    # ---- 对账 4：查表复现 hou_calc.locate（6 锚点 + 300 个随机时刻） ----
    import random
    random.seed(72)
    pts = [dt.datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=hc.TZ)
           for s, *_ in hc.ANCHORS]
    lo = dt.datetime(1900, 1, 1, tzinfo=hc.TZ)
    hi = dt.datetime(2050, 12, 31, 23, 59, tzinfo=hc.TZ)
    span = int((hi - lo).total_seconds() // 60)
    pts += [lo + dt.timedelta(minutes=random.randrange(span)) for _ in range(300)]
    bad = 0
    for w in pts:
        k, order = lookup(table, w)
        res = hc.locate(w)
        if (k, order) != (res["jieqi_index"] - 1, res["order"]):
            bad += 1
            if bad <= 5:
                print("  不一致", w.isoformat(), "表", k, order, "算法", res["jieqi_index"] - 1, res["order"])
    ok &= bad == 0
    print(f"查表 vs 算法 {len(pts)} 点:", "PASS" if bad == 0 else f"FAIL({bad})")

    print("体积门槛 (raw<=60KB):", "PASS" if raw <= 60 * 1024 else f"FAIL {raw}")
    print("RESULT:", "ALL PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

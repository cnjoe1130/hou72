#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生日 -> 节气 / 七十二候。

天文口径：ephem 4.x 的地心视位置（apparent geocentric，含光行差与章动）太阳视黄经，
每 15° 一档定 24 节气。时间一律按北京时间（UTC+8）解释与输出。

候边界口径（锁死）：候 n 起于「本节气时刻 + 5×(n-1) 天」，连续时刻制——
不取整到自然日、不换算农历。相邻节气实际间隔在 14.7~15.7 天之间浮动，
因此每节气末尾的余量（0~0.7 天）一律归入该节气三候；即同节气内永不出现第 4 候。

用法：
    python hou_calc.py "1994-11-30 01:50"
    python hou_calc.py --selftest
"""

import datetime as dt
import json
import os
import sys

import ephem

TZ = dt.timezone(dt.timedelta(hours=8))

# 立春起排；黄经按 315° + 15°×k
TERM_LON = [315, 330, 345, 0, 15, 30, 45, 60, 75, 90, 105, 120,
            135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300]
TERM_NAME = ["立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
             "立夏", "小满", "芒种", "夏至", "小暑", "大暑",
             "立秋", "处暑", "白露", "秋分", "寒露", "霜降",
             "立冬", "小雪", "大雪", "冬至", "小寒", "大寒"]

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "hou72.json")


def _sun_lon(date_utc):
    """太阳地心视黄经（弧度，0~2π）。ephem 给出的 ra/dec 为当日真春分点下的视位置。"""
    body = ephem.Sun(date_utc)
    return float(ephem.Ecliptic(body).lon) % (2 * ephem.pi)


def _diff(lon, target):
    d = (lon - target + ephem.pi) % (2 * ephem.pi) - ephem.pi
    return d


def _solve_term(target_deg, approx_utc):
    """在 approx ±6 天窗口内二分求太阳视黄经 = target 的时刻（UTC datetime）。"""
    target = float(ephem.degrees(str(target_deg)))
    lo = ephem.Date(approx_utc - dt.timedelta(days=6))
    hi = ephem.Date(approx_utc + dt.timedelta(days=6))
    for _ in range(50):
        mid = ephem.Date((lo + hi) / 2.0)
        if _diff(_sun_lon(mid), target) < 0:
            lo = mid
        else:
            hi = mid
    return ephem.Date((lo + hi) / 2.0).datetime().replace(tzinfo=dt.timezone.utc)


# 各节气近似公历日（月, 日），仅用于给二分法定位，不参与结果
_APPROX_MD = [(2, 4), (2, 19), (3, 6), (3, 21), (4, 5), (4, 20),
              (5, 6), (5, 21), (6, 6), (6, 21), (7, 7), (7, 23),
              (8, 8), (8, 23), (9, 8), (9, 23), (10, 8), (10, 23),
              (11, 7), (11, 22), (12, 7), (12, 22), (1, 6), (1, 20)]


def _approx_utc(year, k):
    m, d = _APPROX_MD[k]
    y = year if k <= 21 else year + 1      # 小寒/大寒落在次年 1 月
    return dt.datetime(y, m, d, tzinfo=dt.timezone.utc)


def terms_for_year(year):
    """返回从 year 立春到次年大寒的 24 个节气：(name, aware datetime in CST)。"""
    out = []
    for k in range(24):
        t_utc = _solve_term(TERM_LON[k], _approx_utc(year, k))
        out.append((TERM_NAME[k], t_utc.astimezone(TZ)))
    return out


def locate(when):
    """给定北京时间 datetime，返回节气层 + 候层。"""
    if when.tzinfo is None:
        when = when.replace(tzinfo=TZ)
    when = when.astimezone(TZ)
    # 取覆盖该时刻的节气序列：立春在前一年也可能更近，取两年并集后筛选
    cands = []
    for y in (when.year - 1, when.year):
        cands.extend(terms_for_year(y))
    cands.sort(key=lambda x: x[1])
    passed = [c for c in cands if c[1] <= when]
    name, t_start = passed[-1]
    k = TERM_NAME.index(name)
    elapsed_days = (when - t_start).total_seconds() / 86400.0
    order = int(elapsed_days // 5) + 1
    if order > 3:          # 节气间隔 >15 天时的余量归三候
        order = 3
    hou_index = k * 3 + order
    return {
        "input": when.isoformat(),
        "jieqi": name,
        "jieqi_index": k + 1,
        "jieqi_start": t_start.isoformat(),
        "elapsed_days_since_jieqi": round(elapsed_days, 4),
        "order": order,
        "hou_index": hou_index,
    }


def load_data():
    with open(DATA, encoding="utf-8") as f:
        doc = json.load(f)
    return ({r["hou"]: r for r in doc["hou72"]},
            {r["jieqi"]: r for r in doc["jieqi24"]})


def describe(when):
    res = locate(when)
    hous, jieqis = load_data()
    row = hous[res["hou_index"]]
    jq = jieqis[res["jieqi"]]
    res.update({
        "name": row["name"],
        "classic": row["classic"],
        "jieqi_classic": jq["classic"],
        "source_url": row["source_url"],
        "jieqi_source_url": jq["source_url"],
    })
    return res


ANCHORS = [
    # (输入北京时间, 期望节气, 期望候序, 期望候名)
    ("1994-11-30 01:50", "小雪", 2, "天气上升地气下降"),
    ("1994-11-08 10:00", "立冬", 1, "水始冰"),
    ("1994-11-27 19:00", "小雪", 1, "虹藏不见"),
    ("1994-11-27 20:00", "小雪", 2, "天气上升地气下降"),
    ("1995-01-06 00:30", "冬至", 3, "水泉动"),
    ("1995-01-06 10:00", "小寒", 1, "鴈北乡"),
]

REPORTED_TERMS = {           # 任务书给定的视黄经基准时刻
    (1994, "立冬"): "1994-11-07 21:48",
    (1994, "小雪"): "1994-11-22 19:20",
    (1995, "小寒"): "1995-01-06 01:52",
}


def selftest():
    ok = True
    print("== 节气时刻对账（本脚本 ephem 视黄经 vs 任务书基准） ==")
    cache = {}
    for (y, nm), ref in sorted(REPORTED_TERMS.items()):
        for yy in (y - 1, y):
            for n, t in terms_for_year(yy):
                cache[(t.year, n)] = t
        mine = cache.get((y, nm))
        ref_dt = dt.datetime.strptime(ref, "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
        delta_min = (mine - ref_dt).total_seconds() / 60.0
        flag = "PASS" if abs(delta_min) <= 60 else "FAIL"
        if flag == "FAIL":
            ok = False
        print(f"{y} {nm}: mine={mine:%Y-%m-%d %H:%M} ref={ref} delta={delta_min:+.1f} min  {flag}")

    print("\n== 锚点 ==")
    for s, jq, order, name in ANCHORS:
        when = dt.datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
        r = describe(when)
        got = (r["jieqi"], r["order"], r["name"])
        exp = (jq, order, name)
        flag = "PASS" if got == exp else "FAIL"
        if flag == "FAIL":
            ok = False
        print(f"{s} -> {r['jieqi']}{'一二三'[r['order']-1]}候「{r['name']}」 "
              f"(hou_index={r['hou_index']}, 距节气 {r['elapsed_days_since_jieqi']:.3f} d)  {flag}"
              + ("" if flag == "PASS" else f"  期望 {exp}"))
    print("\nRESULT:", "ALL PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) == 1 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
    elif sys.argv[1] == "--selftest":
        sys.exit(selftest())
    else:
        raw = " ".join(sys.argv[1:])
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                when = dt.datetime.strptime(raw, fmt)
                break
            except ValueError:
                continue
        else:
            sys.exit("无法解析时间：" + raw)
        print(json.dumps(describe(when), ensure_ascii=False, indent=2))

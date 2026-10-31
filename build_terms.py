#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重算 1899–2050 二十四节气时刻表 -> hou_terms.js（北京时间）。

口径：太阳视黄经按**当日真春分点**（ecliptic of date）求解。
注意 ephem.Ecliptic(body) 的默认 epoch 是 body.a_epoch（J2000），
与真春分点差一个岁差量（约 20 分钟/年）；必须显式传 epoch=观测日，
否则整张表会随距 2000 年的年数线性偏移（2023 年晚 7.7 小时，1900 年早 34 小时）。

与 ephem.next_equinox 对账，春分时刻残差 ≤15 分钟（岁差外的章动残差）。
"""

import datetime as dt
import ephem
import os

TZ = dt.timezone(dt.timedelta(hours=8))

# 立春起排；黄经按 315° + 15°×k
TERM_LON = [315, 330, 345, 0, 15, 30, 45, 60, 75, 90, 105, 120,
            135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300]
TERM_NAME = ["立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
             "立夏", "小满", "芒种", "夏至", "小暑", "大暑",
             "立秋", "处暑", "白露", "秋分", "寒露", "霜降",
             "立冬", "小雪", "大雪", "冬至", "小寒", "大寒"]

# 各节气近似公历日，仅用于给二分法定位，不参与结果
APPROX_MD = [(2, 4), (2, 19), (3, 6), (3, 21), (4, 5), (4, 20),
             (5, 6), (5, 21), (6, 6), (6, 21), (7, 7), (7, 23),
             (8, 8), (8, 23), (9, 8), (9, 23), (10, 8), (10, 23),
             (11, 7), (11, 22), (12, 7), (12, 22), (1, 6), (1, 20)]

YEAR_FROM, YEAR_TO = 1899, 2050
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "hou_terms.js")

HEADER = ("/* 二十四节气时刻表 · 北京时间(UTC+8) · 太阳视黄经按当日真春分点实算"
          " (ephem ephem.Ecliptic(epoch=观测日)) · 覆盖 1900-01-01 ~ 2050-12-31。"
          "键=节气年（立春所在年），值=立春起 24 气，后两气落次年 1 月。"
          "1899 组仅服务 1900 年 1 月。 */")


def sun_lon(date_utc):
    """太阳地心视黄经（弧度），取当日真春分点。"""
    body = ephem.Sun(date_utc)
    return float(ephem.Ecliptic(body, epoch=ephem.Date(date_utc)).lon) % (2 * ephem.pi)


def solve_term(target_deg, approx_utc):
    target = float(ephem.degrees(str(target_deg)))
    lo = float(ephem.Date(approx_utc - dt.timedelta(days=6)))
    hi = float(ephem.Date(approx_utc + dt.timedelta(days=6)))
    for _ in range(56):
        mid = (lo + hi) / 2.0
        d = (sun_lon(mid) - target + ephem.pi) % (2 * ephem.pi) - ephem.pi
        if d < 0:
            lo = mid
        else:
            hi = mid
    return ephem.Date((lo + hi) / 2.0).datetime().replace(tzinfo=dt.timezone.utc)


def terms_for_year(year):
    out = []
    for k in range(24):
        m, d = APPROX_MD[k]
        y = year if k <= 21 else year + 1
        t_utc = solve_term(TERM_LON[k], dt.datetime(y, m, d, tzinfo=dt.timezone.utc))
        # 分钟一律截断、不四舍五入（与 B 轮口径一致，与历书可能差 1 分钟）
        out.append(t_utc.astimezone(TZ).strftime("%m-%dT%H:%M"))
    return out


def main():
    groups = []
    for y in range(YEAR_FROM, YEAR_TO + 1):
        groups.append('"%d":[%s]' % (y, ",".join('"%s"' % s for s in terms_for_year(y))))
    body = HEADER + "\nwindow.HOU_TERMS={" + ",".join(groups) + "};\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(body)
    print("%s: %.1f KB, %d 年组" % (OUT, len(body.encode("utf-8")) / 1024,
                                   YEAR_TO - YEAR_FROM + 1))


if __name__ == "__main__":
    main()

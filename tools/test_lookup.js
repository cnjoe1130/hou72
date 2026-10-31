#!/usr/bin/env node
/* 查表逻辑单测：不经浏览器，直接跑 assets/lookup.js。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const sandbox = { window: {}, Date, Math, console, parseInt, isNaN, String };
vm.createContext(sandbox);
for (const f of ['app/assets/hou_terms.js', 'app/assets/hou72-data.js', 'app/assets/lookup.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}

const T = sandbox.window.HOU_TERMS;
const ROWS = sandbox.window.HOU_DATA.hou72;
const byHou = {};
for (const r of ROWS) byHou[r.hou] = r;
const L = sandbox.window.HouLookup;

let bad = 0;
function check(label, got, want) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${got} want=${want}`);
}

function locate(s) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  const [y, mo, d, hh, mi] = m.slice(1).map(Number);
  return L.locate(T, y, mo, d, hh, mi);
}

// 6 锚点。1994 小雪起点 = 11-22 21:02（真春分点口径），候界在 11-27 21:02，
// 故跨界锚点取 20:30 / 21:30。hour 与 baseline hou_calc.py 的 selftest 相差
// 约 1.7 小时（baseline 用 J2000 黄道，见 DONE.txt §9），属口径不同。
const ANCHORS = [
  ['1994-11-30 01:50', 59, 20, 2],
  ['1994-11-08 10:00', 55, 19, 1],
  ['1994-11-27 20:30', 58, 20, 1],
  ['1994-11-27 21:30', 59, 20, 2],
  ['1995-01-06 00:30', 66, 22, 3],
  ['1995-01-06 10:00', 67, 23, 1],
];
for (const [s, hou, jq, order] of ANCHORS) {
  const r = locate(s);
  check(`${s} hou`, r.hou, hou);
  check(`${s} jieqiIndex`, r.jieqiIndex, jq);
  check(`${s} order`, r.order, order);
  check(`${s} name`, byHou[r.hou].name_modern, byHou[hou].name_modern);
}

// 产品验收日期
check('2023-05-28 10:00 -> 小满二候 靡草死', byHou[locate('2023-05-28 10:00').hou].name_modern, '靡草死');

// 覆盖边界
check('1900-01-01 00:00 ok', locate('1900-01-01 00:00').ok, true);
// 1899 冬至 12-22 08:54（历书 08:56），+10 天为 01-01 08:54，故 00:00 仍在冬至二候
check('1900-01-01 00:00 hou', locate('1900-01-01 00:00').hou, 65);
check('1899-12-31 23:59 越界', locate('1899-12-31 23:59').reason, 'range');
check('2050-12-31 23:59 ok', locate('2050-12-31 23:59').ok, true);
check('2051-01-01 00:00 越界', locate('2051-01-01 00:00').reason, 'range');

// 历书对账：真春分点口径下，表内节气时刻与历书差应在 20 分内
// （残差来自 ephem 的章动处理；J2000 口径会在这里差 8 小时以上）
function termTime(group, monthOfTerm, expected) {
  const s = T[group][monthOfTerm - 1];
  const y = Number(group) + (monthOfTerm >= 2 ? 0 : 1);
  const got = Date.parse(`${y}-${s.slice(0, 2)}-${s.slice(3, 5)}T${s.slice(6, 11)}:00+08:00`);
  const want = Date.parse(`${expected.replace(' ', 'T')}:00+08:00`);
  const min = (got - want) / 60000;
  check(`历书对账 ${expected}`, Math.abs(min) <= 20, true);
}
termTime('1900', 4, '1900-03-21 09:39');   // 春分
termTime('2023', 4, '2023-03-21 05:24');   // 春分
termTime('2023', 10, '2023-06-21 22:58');  // 夏至
termTime('2023', 22, '2023-12-22 11:27');  // 冬至
termTime('2050', 4, '2050-03-20 18:19');   // 春分

// 表结构
check('152 年组都存在', Object.keys(T).length, 152);
check('24 项/组', Object.values(T).every((a) => a.length === 24), true);

console.log(bad === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: FAIL (${bad})`);
process.exit(bad === 0 ? 0 : 1);

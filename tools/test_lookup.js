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

// 6 锚点（与 baseline hou_calc.py 相同）
const ANCHORS = [
  ['1994-11-30 01:50', 59, 20, 2],
  ['1994-11-08 10:00', 55, 19, 1],
  ['1994-11-27 19:00', 58, 20, 1],
  ['1994-11-27 20:00', 59, 20, 2],
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
check('1900-01-01 00:00 hou', locate('1900-01-01 00:00').hou, 66);
check('1899-12-31 23:59 越界', locate('1899-12-31 23:59').reason, 'range');
check('2050-12-31 23:59 ok', locate('2050-12-31 23:59').ok, true);
check('2051-01-01 00:00 越界', locate('2051-01-01 00:00').reason, 'range');

// 表结构
check('152 年组都存在', Object.keys(T).length, 152);
check('24 项/组', Object.values(T).every((a) => a.length === 24), true);

console.log(bad === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: FAIL (${bad})`);
process.exit(bad === 0 ? 0 : 1);

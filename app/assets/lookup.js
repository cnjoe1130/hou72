/*
 * 生日 -> 七十二候。纯查表，不做天文计算。
 * 时间一律按北京时间（UTC+8）解释；表见 hou_terms.js。
 */
(function (root) {
  'use strict';

  var MS_DAY = 86400000;
  var LO = Date.UTC(1900, 0, 1, -8, 0);          // 1900-01-01 00:00 CST
  var HI = Date.UTC(2050, 11, 31, 15, 59);       // 2050-12-31 23:59 CST

  function parseTerm(year, s) {
    var m = parseInt(s.slice(0, 2), 10);
    var d = parseInt(s.slice(3, 5), 10);
    var hh = parseInt(s.slice(6, 8), 10);
    var mi = parseInt(s.slice(9, 11), 10);
    var y = m >= 2 ? year : year + 1;
    return Date.UTC(y, m - 1, d, hh - 8, mi);
  }

  function locate(table, y, m, d, hh, mi) {
    var t = Date.UTC(y, m - 1, d, hh - 8, mi);
    if (t < LO || t > HI) return { ok: false, reason: 'range' };

    var key = y;
    var arr = table[String(y)];
    if (!arr) return { ok: false, reason: 'miss' };
    if (t < parseTerm(y, arr[0])) key = y - 1;

    arr = table[String(key)];
    if (!arr || arr.length !== 24) return { ok: false, reason: 'miss' };

    var k = -1;
    for (var i = 0; i < arr.length; i++) {
      if (parseTerm(key, arr[i]) <= t) k = i;
      else break;
    }
    if (k < 0) return { ok: false, reason: 'miss' };

    var elapsed = (t - parseTerm(key, arr[k])) / MS_DAY;
    var order = Math.floor(elapsed / 5) + 1;
    if (order > 3) order = 3;          // 节气间隔 >15 天时余量归三候

    return { ok: true, hou: k * 3 + order, jieqiIndex: k + 1, order: order };
  }

  root.HouLookup = { locate: locate, parseTerm: parseTerm };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HouLookup;
})(typeof window !== 'undefined' ? window : globalThis);

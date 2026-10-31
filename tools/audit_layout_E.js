#!/usr/bin/env node
/* 审计背面版式（E+G，即当前产物）：72 张实测——诗块是否与画片/食俗/印章相交、是否越出安全边界。
   只读，不改产物，也不注入覆盖样式：量到什么，线上就是什么。 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const SHOTS = path.join(__dirname, 'shots', 'audit-E');
fs.mkdirSync(SHOTS, { recursive: true });


(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#pickDark');
  await page.waitForSelector('#gate', { state: 'hidden' });
  await page.evaluate(() => document.fonts.ready);

  const dates = await page.evaluate(() => {
    const out = {};
    for (let t = Date.UTC(2001, 0, 1, 4); t < Date.UTC(2004, 11, 31, 4); t += 86400000) {
      const d = new Date(t);
      const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
      const r = window.HouLookup.locate(window.HOU_TERMS, y, m, day, 12, 0);
      if (r.ok && !out[r.hou]) out[r.hou] = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return out;
  });
  const missing = [];
  for (let h = 1; h <= 72; h++) if (!dates[h]) missing.push(h);
  if (missing.length) { console.log('FAIL 缺日期: ' + missing.join(',')); process.exit(1); }

  const rows = [];
  for (let hou = 1; hou <= 72; hou++) {
    await page.fill('#birthDate', dates[hou]);
    await page.fill('#birthTime', '12:00');
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.waitForTimeout(360);
    await page.click('.leaf.is-mine');
    await page.waitForTimeout(400);
    await page.click('.leaf.is-zoom');
    await page.waitForSelector('.leaf.is-zoom .bk-seal.is-on', { timeout: 6000, polling: 40 });
    /* 印章 .is-on 后还有 0.42s 的 scale(1.9)→1 落印动画，中途量会把缩放后的外接框当成越界 */
    await page.waitForTimeout(500);

    /* 版式已经是产物本身（E+G），这里不再注入任何覆盖样式，直接量真实渲染 */

    const m = await page.evaluate(() => {
      const leaf = document.querySelector('.leaf.is-zoom');
      const lr = leaf.getBoundingClientRect();
      const s = lr.width / 390;
      const R = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          l: Math.round((r.left - lr.left) / s * 10) / 10,
          t: Math.round((r.top - lr.top) / s * 10) / 10,
          r: Math.round((r.right - lr.left) / s * 10) / 10,
          b: Math.round((r.bottom - lr.top) / s * 10) / 10,
        };
      };
      const union = (rects) => {
        const rs = rects.filter(Boolean);
        if (!rs.length) return null;
        return {
          l: Math.min(...rs.map((x) => x.l)), t: Math.min(...rs.map((x) => x.t)),
          r: Math.max(...rs.map((x) => x.r)), b: Math.max(...rs.map((x) => x.b)),
        };
      };
      const inter = (a, b) => {
        if (!a || !b) return 0;
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        return w > 0 && h > 0 ? Math.round(w * h * 10) / 10 : 0;
      };
      const lines = [...leaf.querySelectorAll('.bk-poem .ln')].map((n) => ({
        text: n.textContent, n: n.textContent.length, box: R(n),
      }));
      const srcEl = leaf.querySelector('.bk-poem .src');
      /* 候 48 / 63 的候歌小注也是诗位的一部分，量间距时必须算进来 */
      const hgEls = leaf.querySelectorAll('.bk-poem .hg-t, .bk-poem .hg-s');
      const boxes = union([...lines.map((x) => x.box), R(srcEl), ...[...hgEls].map(R)]);
      const food = R(leaf.querySelector('.bk-food'));
      const seal = R(leaf.querySelector('.bk-seal'));
      const art = R(leaf.querySelector('.art-slot'));
      return {
        hou: Number(leaf.dataset.hou),
        isAsk: !!leaf.querySelector('.bk-poem.is-ask'),
        lines, src: srcEl ? srcEl.textContent : '',
        boxes, food, seal, art,
        gapArtPoem: boxes && art ? Math.round((boxes.t - art.b) * 10) / 10 : null,
        gapPoemFood: boxes && food ? Math.round((food.t - boxes.b) * 10) / 10 : null,
        hit: {
          poemFood: inter(boxes, food),
          poemSeal: inter(boxes, seal),
          foodSeal: inter(food, seal),
          poemArt: inter(boxes, art),
        },
      };
    });
    rows.push(m);
    if ([53, 48, 19, 5, 1, 63].includes(hou)) {
      await page.screenshot({ path: path.join(SHOTS, `EG_${String(hou).padStart(2, '0')}.png`) });
    }
    process.stdout.write(`\r测完 ${hou}/72`);
  }
  console.log('');

  const fail = [];
  const warn = [];
  for (const r of rows) {
    const label = String(r.hou).padStart(2, '0');
    if (r.hit.poemFood || r.hit.poemSeal || r.hit.foodSeal || r.hit.poemArt) {
      fail.push(`${label} 重叠 poemFood=${r.hit.poemFood} poemSeal=${r.hit.poemSeal} foodSeal=${r.hit.foodSeal} poemArt=${r.hit.poemArt}`);
    }
    if (r.boxes && r.boxes.b > 812) fail.push(`${label} 诗块越出安全底 (b=${r.boxes.b})`);
    if (r.boxes && r.boxes.r > 372) fail.push(`${label} 诗块越出安全右 (r=${r.boxes.r})`);
    if (r.boxes && r.boxes.l < 22) fail.push(`${label} 诗块越出安全左 (l=${r.boxes.l})`);
    if (r.food && r.food.r > 372) fail.push(`${label} 食俗签越出安全右 (r=${r.food.r})`);
    if (r.food && r.food.b > 818) fail.push(`${label} 食俗签越出安全底 (b=${r.food.b})`);
    if (r.seal && r.seal.b > 818) fail.push(`${label} 印章越界`);
    if (r.gapArtPoem !== null && r.gapArtPoem < 18) warn.push(`${label} 诗块离画片仅 ${r.gapArtPoem}px`);
    console.log(`${label} 行${r.lines.length}+注${r.src ? 1 : 0} 诗[${r.boxes.l},${r.boxes.t}→${r.boxes.r},${r.boxes.b}] 画下沿${r.art.b} 距画${r.gapArtPoem} 距食${r.gapPoemFood}`);
  }

  console.log('\n===== 结果 =====');
  console.log('候选问题:', fail.length ? '\n  ' + fail.join('\n  ') : '无');
  console.log('提示:', warn.length ? '\n  ' + warn.join('\n  ') : '无');
  console.log('页面错误:', errors.length ? errors : '无');

  fs.writeFileSync(path.join(__dirname, 'audit_layout_E.json'), JSON.stringify(rows, null, 1));
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();

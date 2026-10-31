#!/usr/bin/env node
/* 审计：72 张背面版式实测（诗句块是否越界 / 压到食俗签、印章、画框）。只读，不改产物。 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const SHOTS = path.join(__dirname, 'shots', 'audit');
fs.mkdirSync(SHOTS, { recursive: true });

function iso(d) { return d.toISOString().slice(0, 10); }

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

  /* 每个候找一个日期（2001-2004 扫描，一天取一个） */
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

  const openFan = async (date) => {
    await page.fill('#birthDate', date);
    await page.fill('#birthTime', '12:00');
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.waitForTimeout(380);
  };

  const rows = [];
  for (let hou = 1; hou <= 72; hou++) {
    await openFan(dates[hou]);
    await page.click('.leaf.is-mine');
    await page.waitForTimeout(420);
    await page.click('.leaf.is-zoom');
    await page.waitForSelector('.leaf.is-zoom .bk-seal.is-on', { timeout: 6000, polling: 40 });
    await page.waitForTimeout(120);

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
        whiteSpace: getComputedStyle(n).whiteSpace,
      }));
      const srcEl = leaf.querySelector('.bk-poem .src');
      const poem = R(leaf.querySelector('.bk-poem'));
      const boxes = union([...lines.map((x) => x.box), R(srcEl)]);
      const food = R(leaf.querySelector('.bk-food'));
      const foodT = leaf.querySelector('.bk-food .t');
      const foodS = leaf.querySelector('.bk-food .s');
      const seal = R(leaf.querySelector('.bk-seal'));
      const art = R(leaf.querySelector('.art-slot'));
      const kicker = R(leaf.querySelector('.bk-kicker'));
      return {
        hou: Number(leaf.dataset.hou),
        scale: Math.round(s * 1000) / 1000,
        isAsk: !!leaf.querySelector('.bk-poem.is-ask'),
        lines, src: srcEl ? srcEl.textContent : '',
        poem, boxes,
        food, seal, art, kicker,
        foodText: foodT ? foodT.textContent : '',
        foodSub: foodS ? foodS.textContent : '',
        foodLines: foodS ? Math.round(foodS.getBoundingClientRect().width / s) : 0,
        hit: {
          poemFood: inter(boxes, food),
          poemSeal: inter(boxes, seal),
          foodSeal: inter(food, seal),
          poemArt: inter(boxes, art),
          poemKicker: inter(boxes, kicker),
        },
      };
    });
    rows.push(m);
    if ([49, 53, 10, 1, 48, 63].includes(hou)) {
      await page.screenshot({ path: path.join(SHOTS, `back_${String(hou).padStart(2, '0')}.png`) });
    }
    process.stdout.write(`\r测完 ${hou}/72`);
  }
  console.log('');

  const fail = [];
  const warn = [];
  for (const r of rows) {
    const label = String(r.hou).padStart(2, '0');
    const maxChars = Math.max(0, ...r.lines.map((x) => x.n));
    const cols = r.lines.length + (r.src ? 1 : 0);
    const bottom = r.boxes ? r.boxes.b : 0;
    const left = r.boxes ? r.boxes.l : 0;
    if (r.hit.poemFood || r.hit.poemSeal || r.hit.foodSeal || r.hit.poemArt || r.hit.poemKicker) {
      fail.push(`${label} 重叠 poemFood=${r.hit.poemFood} poemSeal=${r.hit.poemSeal} foodSeal=${r.hit.foodSeal} poemArt=${r.hit.poemArt} poemKicker=${r.hit.poemKicker}`);
    }
    if (r.boxes && r.boxes.b > 818) fail.push(`${label} 诗句越出内框底 (b=${r.boxes.b})`);
    if (r.boxes && r.boxes.r > 370) fail.push(`${label} 诗句越过内框右 (r=${r.boxes.r})`);
    if (r.boxes && r.boxes.l < 26) warn.push(`${label} 诗句压到内框左 (l=${r.boxes.l})`);
    if (r.food && r.food.r > 370) fail.push(`${label} 食俗签越过内框右 (r=${r.food.r})`);
    if (r.food && r.food.b > 818) fail.push(`${label} 食俗签越过内框底 (b=${r.food.b})`);
    if (r.seal && r.seal.b > 818) fail.push(`${label} 印章越界`);
    if (r.art && r.art.b > 370) warn.push(`${label} 画框压到 kicker 线 (art.b=${r.art.b})`);
    if (r.lines.some((x) => x.whiteSpace !== 'nowrap')) warn.push(`${label} 诗行允许换行`);
    console.log(`${label} 行${r.lines.length}+注${r.src ? 1 : 0} 最长${maxChars}字 诗块[${r.boxes ? `${r.boxes.l},${r.boxes.t} → ${r.boxes.r},${r.boxes.b}` : '无'}] 食[${r.food.l},${r.food.t} → ${r.food.r},${r.food.b}] 食宽${r.food.r - r.food.l} 印[${r.seal.l},${r.seal.t} → ${r.seal.r},${r.seal.b}] 画[${r.art.l},${r.art.t} → ${r.art.r},${r.art.b}]`);
  }

  console.log('\n===== 结果 =====');
  console.log('候选问题:', fail.length ? '\n  ' + fail.join('\n  ') : '无');
  console.log('提示:', warn.length ? '\n  ' + warn.join('\n  ') : '无');
  console.log('页面错误:', errors.length ? errors : '无');

  fs.writeFileSync(path.join(__dirname, 'audit_verse_layout.json'), JSON.stringify(rows, null, 1));
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();

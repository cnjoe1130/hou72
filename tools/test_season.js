#!/usr/bin/env node
/* 季节色温：四季映射、色值生效、导出图带色。 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const SHOTS = path.join(__dirname, 'shots');

const CASES = [
  { date: '2023-03-01', time: '12:00', season: 'spring', gold: '150,184,124', bg1: '#16231A', jieqi: '#8AA968', name: '雨水', shot: 'season_spring.png' },
  { date: '2023-06-01', time: '12:00', season: 'summer', gold: '222,146,74', bg1: '#2A1A11', jieqi: '#B87A42', name: '小满', shot: 'season_summer.png' },
  { date: '2023-09-01', time: '12:00', season: 'autumn', gold: '200,171,104', bg1: '#221D16', jieqi: '#9C8558', name: '处暑', shot: 'season_autumn.png' },
  { date: '2023-12-01', time: '12:00', season: 'winter', gold: '172,186,200', bg1: '#191E24', jieqi: '#8796A6', name: '小雪', shot: 'season_winter.png' },
];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let bad = 0;
  const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  };

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#pickDark');
  await page.waitForSelector('#gate', { state: 'hidden' });

  const golds = [];
  for (const c of CASES) {
    await page.fill('#birthDate', c.date);
    await page.fill('#birthTime', c.time);
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.waitForTimeout(600);

    const st = await page.evaluate(() => {
      const card = document.getElementById('card');
      const s = getComputedStyle(card);
      return {
        cls: card.className,
        gold: s.getPropertyValue('--gold-rgb').trim(),
        bg1: s.getPropertyValue('--bg-1').trim(),
        jieqi: s.getPropertyValue('--jieqi').trim(),
        jieqiText: document.getElementById('jieqiName').textContent,
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      };
    });
    check(`${c.date} 节气`, st.jieqiText, c.name);
    check(`${c.date} 季节类`, st.cls, 'card season-' + c.season);
    check(`${c.season} 金丝色`, st.gold, c.gold);
    check(`${c.season} 底色顶`, st.bg1, c.bg1);
    check(`${c.season} 节气色`, st.jieqi, c.jieqi);
    check(`${c.date} 无横向滚动`, st.sw <= st.cw, true);
    golds.push(st.gold);

    await page.screenshot({ path: path.join(SHOTS, c.shot) });
  }

  check('四季金丝色两两不同', new Set(golds).size, 4);

  // 导出图必须带季节色：取四季中的两张，比较左上角像素
  const shots = {};
  for (const [season, date] of [['spring', '2023-03-01'], ['winter', '2023-12-01']]) {
    await page.fill('#birthDate', date);
    await page.fill('#birthTime', '12:00');
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.click('#toSingle');
    await page.waitForTimeout(200);
    const url = await page.evaluate(() => window.Capture.toPng(document.getElementById('card'), 2));
    shots[season] = await page.evaluate(async (u) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u; });
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      const px = cx.getImageData(10, 10, 1, 1).data;
      return { w: img.naturalWidth, h: img.naturalHeight, px: [px[0], px[1], px[2]] };
    }, url);
  }
  check('春季导出 780×1688', shots.spring.w === 780 && shots.spring.h === 1688, true);
  check('冬季导出 780×1688', shots.winter.w === 780 && shots.winter.h === 1688, true);
  check('导出图带季节底色（春≠冬）', shots.spring.px.join(',') !== shots.winter.px.join(','), true);

  console.log('\nJS 错误数：' + errors.length);
  errors.forEach((e) => console.log('  ' + e));
  if (errors.length) bad++;

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: FAIL (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/* 墨/纸双版：切换状态、两套色值、宣纸对比度、导出带纸色。 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const SHOTS = path.join(__dirname, 'shots');

const PAPER = {
  spring: { bg1: '#F3F5E6', bg2: '#EDE9D6', jieqi: '#3E6B4E', date: '2023-03-01' },
  summer: { bg1: '#F8F0E0', bg2: '#F0E4CE', jieqi: '#A2452A', date: '2023-06-01' },
  autumn: { bg1: '#F7F1E2', bg2: '#EBE0C9', jieqi: '#8A5A2B', date: '2023-09-01' },
  winter: { bg1: '#F0F2F4', bg2: '#E9E7DE', jieqi: '#3B4754', date: '2023-12-01' },
};

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

  async function submit(date) {
    await page.fill('#birthDate', date);
    await page.fill('#birthTime', '12:00');
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.waitForTimeout(600);
  }

  const state = () => page.evaluate(() => {
    const card = document.getElementById('card');
    const s = getComputedStyle(card);
    const rgb = (sel, prop) => {
      const v = getComputedStyle(document.querySelector(sel))[prop];
      return v.replace(/\s/g, '');
    };
    return {
      cls: card.className,
      bg1: s.getPropertyValue('--bg-1').trim(),
      bg2: s.getPropertyValue('--bg-2').trim(),
      jieqi: s.getPropertyValue('--jieqi').trim(),
      inkOn: document.getElementById('skinInk').className + '|' + document.getElementById('skinInk').getAttribute('aria-pressed'),
      paperOn: document.getElementById('skinPaper').className + '|' + document.getElementById('skinPaper').getAttribute('aria-pressed'),
      bodyColor: rgb('.lines div', 'color'),
      calibrationColor: rgb('.caliber', 'color'),
      disclaimerColor: rgb('.disclaimer', 'color'),
      brandColor: rgb('.brand', 'color'),
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
  });

  const contrast = (fg, bg) => page.evaluate(([f, b]) => {
    const parse = (v) => v.match(/\d+/g).slice(0, 3).map(Number);
    const lin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const L = (v) => {
      const [r, g, b] = parse(v).map(lin);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = L(f), z = L(b);
    const hi = Math.max(a, z), lo = Math.min(a, z);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }, [fg, bg]);

  // 1) 默认墨底
  await submit(PAPER.autumn.date);
  let st = await state();
  check('默认卡片类', st.cls, 'card season-autumn');
  check('默认墨底按下', st.inkOn, 'skin-btn is-on|true');
  check('默认宣纸未按', st.paperOn, 'skin-btn|false');
  check('默认底色', st.bg2, '#14120F');

  // 2) 切到宣纸
  await page.click('#skinPaper');
  st = await state();
  check('宣纸卡片类', st.cls, 'card season-autumn skin-paper');
  check('宣纸按下', st.paperOn, 'skin-btn is-on|true');
  check('墨底松开', st.inkOn, 'skin-btn|false');
  check('宣纸底色顶', st.bg1, PAPER.autumn.bg1);
  check('宣纸底色底', st.bg2, PAPER.autumn.bg2);
  check('宣纸节气色', st.jieqi, PAPER.autumn.jieqi);
  check('宣纸无横向滚动', st.sw <= st.cw, true);

  const bg2rgb = 'rgb(' + [0xEB, 0xE0, 0xC9].join(',') + ')';
  check('宣纸底 computed', await page.evaluate(() =>
    getComputedStyle(document.getElementById('card')).backgroundColor.replace(/\s/g, '')), bg2rgb);
  const cBody = await contrast(st.bodyColor, bg2rgb);
  const cCal = await contrast(st.calibrationColor, bg2rgb);
  const cDis = await contrast(st.disclaimerColor, bg2rgb);
  const cBrand = await contrast(st.brandColor, bg2rgb);
  console.log(`INFO  宣纸对比度 body=${cBody} caliber=${cCal} disclaimer=${cDis} brand=${cBrand}`);
  check('宣纸正文对比度 ≥4.5', cBody >= 4.5, true);
  check('宣纸口径行对比度 ≥4.5', cCal >= 4.5, true);
  check('宣纸免责行对比度 ≥4.5', cDis >= 4.5, true);
  check('宣纸品牌行对比度 ≥4.5', cBrand >= 4.5, true);

  await page.screenshot({ path: path.join(SHOTS, 'skin_paper_autumn.png') });

  // 3) 换日期后保持纸色
  await submit(PAPER.spring.date);
  st = await state();
  check('换日期后仍为宣纸', st.cls, 'card season-spring skin-paper');
  check('宣纸春色', st.bg2, PAPER.spring.bg2);
  await page.screenshot({ path: path.join(SHOTS, 'skin_paper_spring.png') });

  // 4) 四季纸色各不相同
  const jieqi = [], bgs = [];
  for (const [season, c] of Object.entries(PAPER)) {
    await submit(c.date);
    st = await state();
    check(`宣纸 ${season} 节气色`, st.jieqi, c.jieqi);
    check(`宣纸 ${season} 底色`, st.bg2, c.bg2);
    jieqi.push(st.jieqi);
    bgs.push(st.bg2);
    if (season === 'summer' || season === 'winter') {
      await page.screenshot({ path: path.join(SHOTS, `skin_paper_${season}.png`) });
    }
  }
  check('四季纸色两两不同', new Set(bgs).size, 4);
  check('四季纸墨节气色两两不同', new Set(jieqi).size, 4);

  // 5) 宣纸导出
  const shot = await page.evaluate(async () => {
    const url = await window.Capture.toPng(document.getElementById('card'), 2);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(10, 10, 1, 1).data;
    return { w: img.naturalWidth, h: img.naturalHeight, px: [px[0], px[1], px[2]] };
  });
  check('宣纸导出 780×1688', shot.w === 780 && shot.h === 1688, true);
  check('宣纸导出为纸色（亮底）', shot.px[0] > 200 && shot.px[1] > 190 && shot.px[2] > 180, true);

  // 6) 切回墨底
  await page.click('#skinInk');
  st = await state();
  check('切回墨底类', st.cls, 'card season-winter');
  check('切回墨底底色', st.bg2, '#101215');
  check('墨底按下', st.inkOn, 'skin-btn is-on|true');
  const inkShot = await page.evaluate(async () => {
    const url = await window.Capture.toPng(document.getElementById('card'), 2);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(10, 10, 1, 1).data;
    return [px[0], px[1], px[2]];
  });
  check('切回墨底导出为暗底', inkShot[0] < 60 && inkShot[1] < 60, true);

  console.log('\nJS 错误数：' + errors.length);
  errors.forEach((e) => console.log('  ' + e));
  if (errors.length) bad++;

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: FAIL (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/* 开场选纸 + 整页亮/暗 + 今日之候。 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const SHOTS = path.join(__dirname, 'shots');

const DARK_BG = 'rgb(11,10,8)';
const LIGHT_BG = 'rgb(243,236,219)';

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  // 固定“现在”为 2026-10-30 10:00 北京时间，只替换 Date，不动 setTimeout
  await page.addInitScript(() => {
    const RealDate = Date;
    const fixed = RealDate.parse('2026-10-30T02:00:00Z');
    class FakeDate extends RealDate {
      constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
      static now() { return fixed; }
    }
    window.Date = FakeDate;
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  let bad = 0;
  const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  };

  const rgb = (sel, prop) => page.evaluate(([s, p]) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el)[p].replace(/\s/g, '') : '';
  }, [sel, prop]);

  const contrast = (fg, bg) => page.evaluate(([f, b]) => {
    const parse = (v) => v.match(/\d+/g).slice(0, 3).map(Number);
    const lin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const L = (v) => {
      const [r, g, b2] = parse(v).map(lin);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
    };
    const a = L(f), z = L(b);
    return Math.round(((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05)) * 100) / 100;
  }, [fg, bg]);

  async function submit(date, time) {
    await page.fill('#birthDate', date);
    await page.fill('#birthTime', time);
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.click('#toSingle');
    await page.waitForTimeout(600);
  }

  // 1) 开场必选
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  check('开场选纸可见', await page.isVisible('#gate'), true);
  check('未选前主内容 inert', await page.evaluate(() => document.getElementById('shell').hasAttribute('inert')), true);
  check('未选前无主题', await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
  await page.screenshot({ path: path.join(SHOTS, 'gate.png') });

  await page.click('#pickDark');
  check('选后进入退场', await page.evaluate(() => document.getElementById('gate').classList.contains('is-out')), true);
  await page.waitForSelector('#gate', { state: 'hidden' });
  check('退场后移除对话框', await page.evaluate(() => document.getElementById('gate').hidden), true);
  check('暗色主题', await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  check('暗色页面底色', await rgb('body', 'backgroundColor'), DARK_BG);
  check('暗色切换键文案', await page.textContent('#themeToggle'), '宣纸');
  check('主内容解除 inert', await page.evaluate(() => document.getElementById('shell').hasAttribute('inert')), false);

  await submit('2023-09-01', '12:00');
  check('暗色卡片无纸类', await page.evaluate(() => document.getElementById('card').className), 'card season-autumn');

  // 2) 整页换亮
  await page.click('#themeToggle');
  await page.waitForTimeout(700);
  check('亮色主题', await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  check('亮色页面底色', await rgb('body', 'backgroundColor'), LIGHT_BG);
  check('亮色卡片自动换纸', await page.evaluate(() => document.getElementById('card').className), 'card season-autumn skin-paper');
  check('亮色切换键文案', await page.textContent('#themeToggle'), '墨底');
  check('亮色切换键 aria', await page.getAttribute('#themeToggle', 'aria-label'), '切换为墨底');
  check('亮色无横向滚动', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

  await page.click('#methodToggle');
  const pageBg = await rgb('body', 'backgroundColor');
  const pairs = [
    ['lede', await rgb('.lede', 'color')],
    ['field-label', await rgb('.field span', 'color')],
    ['method-dd', await rgb('.method-body dd', 'color')],
    ['footer', await rgb('.foot-page p', 'color')],
  ];
  for (const [name, color] of pairs) {
    const c = await contrast(color, pageBg);
    console.log(`INFO  亮色对比度 ${name}=${c}`);
    check(`亮色 ${name} 对比度 ≥4.5`, c >= 4.5, true);
  }
  await page.click('#methodToggle');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'page_light.png'), fullPage: true });

  // 3) 亮色导出
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
  check('亮色导出 780×1688', shot.w === 780 && shot.h === 1688, true);
  check('亮色导出为纸色', shot.px[0] > 200 && shot.px[1] > 190 && shot.px[2] > 180, true);

  // 4) 今天
  const expected = await page.evaluate(() => window.HouLookup.locate(window.HOU_TERMS, 2026, 10, 30, 10, 0));
  await page.click('#todayBtn');
  await page.waitForSelector('#result:not([hidden])');
  await page.waitForTimeout(600);
  check('今天日期填入', await page.inputValue('#birthDate'), '2026-10-30');
  check('今天时刻填入', await page.inputValue('#birthTime'), '10:00');
  check('今天提示语', (await page.textContent('#msg')).includes('今天 · 2026-10-30 10:00 · 按北京时间'), true);
  check('今天的候编号', (await page.textContent('#houFlag')).includes(expected.hou + ' / 72'), true);
  check('今天卡片日期', (await page.textContent('#kicker')).includes('2026 年 10 月 30 日 · 10:00'), true);
  check('今天仍为亮色', await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  await page.screenshot({ path: path.join(SHOTS, 'today.png') });

  // 5) 375 宽亮色
  const slim = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  await slim.goto(URL, { waitUntil: 'load' });
  await slim.click('#pickLight');
  await slim.waitForSelector('#gate', { state: 'hidden' });
  await slim.click('#todayBtn');
  await slim.waitForSelector('#result:not([hidden])');
  await slim.waitForTimeout(600);
  check('375 亮色无横向滚动', await slim.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  check('375 亮色卡片为纸', await slim.evaluate(() =>
    document.getElementById('card').className.includes('skin-paper')), true);

  // 6) 减少动态
  const calm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await calm.goto(URL, { waitUntil: 'load' });
  await calm.click('#pickLight');
  const calmHidden = await calm.waitForSelector('#gate', { state: 'hidden', timeout: 1200 }).then(() => true).catch(() => false);
  check('减少动态时即刻退场', calmHidden, true);

  console.log('\nJS 错误数：' + errors.length);
  errors.forEach((e) => console.log('  ' + e));
  if (errors.length) bad++;

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: FAIL (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

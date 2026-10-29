#!/usr/bin/env node
/* Playwright 验收：390×844，三锚点 + 保存路径 + 超界 + 布局闸门。 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const CASES = [
  { date: '1994-11-30', time: '01:50', jieqi: '小雪', hou: '天气上升地气下降', flag: '59 / 72', idx: '20 / 24', shot: 'anchor_01_xiaoxue.png' },
  { date: '2023-05-28', time: '10:00', jieqi: '小满', hou: '靡草死', flag: '23 / 72', idx: '8 / 24', shot: 'anchor_02_xiaoman.png' },
  { date: '1995-01-06', time: '00:30', jieqi: '冬至', hou: '水泉动', flag: '66 / 72', idx: '22 / 24', shot: 'anchor_03_dongzhi.png' },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#pickDark');
  await page.waitForSelector('#gate', { state: 'hidden' });

  let bad = 0;
  const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  };

  for (const c of CASES) {
    await page.fill('#birthDate', c.date);
    await page.fill('#birthTime', c.time);
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.waitForTimeout(350);

    check(`${c.date} ${c.time} 节气`, await page.textContent('#jieqiName'), c.jieqi);
    check(`${c.date} ${c.time} 候名`, await page.textContent('#houName'), c.hou);
    check(`${c.date} ${c.time} 进度`, (await page.textContent('#houFlag')).includes(c.flag), true);
    check(`${c.date} ${c.time} 节气序号`, (await page.textContent('#jieqiTag')).includes(c.idx), true);
    check(`${c.date} ${c.time} 卡片可见`, await page.isVisible('#card'), true);

    await page.screenshot({ path: path.join(SHOTS, c.shot), fullPage: false });
  }

  // 布局：无横向滚动 + 卡片内容不出框
  const layout = await page.evaluate(() => {
    const card = document.getElementById('card');
    const d = document.querySelector('.disclaimer');
    const f = document.querySelector('.foot');
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cardH: card.scrollHeight,
      cardTop: card.getBoundingClientRect().top,
      disclaimerBottom: d.getBoundingClientRect().bottom,
      footBottom: f.getBoundingClientRect().bottom,
    };
  });
  check('390 宽无横向滚动', layout.scrollWidth <= layout.clientWidth, true);
  check('卡片高度 844', layout.cardH, 844);
  check('底部内容不出内框（<=818）', layout.disclaimerBottom - layout.cardTop <= 818, true);

  // 保存图片路径
  await page.click('#saveBtn');
  await page.waitForSelector('#lightbox:not([hidden])', { timeout: 8000 });
  const img = await page.evaluate(() => {
    const el = document.getElementById('lbImg');
    return { src: el.src.slice(0, 30), w: el.naturalWidth, h: el.naturalHeight };
  });
  check('保存后为 PNG dataURL', img.src.startsWith('data:image/png;base64'), true);
  check('导出图宽 780', img.w, 780);
  check('导出图高 1688', img.h, 1688);
  const b64 = await page.evaluate(() => document.getElementById('lbImg').src.split(',')[1]);
  fs.writeFileSync(path.join(SHOTS, 'export_card.png'), Buffer.from(b64, 'base64'));
  await page.screenshot({ path: path.join(SHOTS, 'save_lightbox.png') });
  await page.click('#lbClose');
  check('灯箱可关闭', await page.isHidden('#lightbox'), true);

  // 口径面板
  check('口径面板默认收起', await page.isHidden('#methodBody'), true);
  await page.click('#methodToggle');
  check('口径面板可展开', await page.isVisible('#methodBody'), true);
  check('aria-expanded 同步', await page.getAttribute('#methodToggle', 'aria-expanded'), 'true');
  const methodText = await page.textContent('#methodBody');
  check('口径含黄经', methodText.includes('太阳视黄经'), true);
  check('口径含范围', methodText.includes('1900-01-01 至 2050-12-31'), true);
  check('口径含不上传', methodText.includes('不上传'), true);
  await page.screenshot({ path: path.join(SHOTS, 'method_panel.png'), fullPage: true });
  await page.click('#methodToggle');
  check('口径面板可收起', await page.isHidden('#methodBody'), true);

  // 保存失败降级路径（stub 掉 Capture，模拟 toDataURL 失败）
  await page.evaluate(() => {
    window.__origCapture = window.Capture.toPng;
    window.Capture.toPng = function () { return Promise.reject(new Error('simulated')); };
  });
  await page.click('#saveBtn');
  await page.waitForFunction(() => document.getElementById('msg').textContent.length > 0, null, { timeout: 5000 });
  check('保存失败降级提示', await page.textContent('#msg'), '当前环境不支持导出图片，请用系统截图');
  check('失败时不弹灯箱', await page.isHidden('#lightbox'), true);
  await page.evaluate(() => { window.Capture.toPng = window.__origCapture; });
  await page.fill('#msg', '').catch(() => {});

  // 超界：1899
  await page.fill('#birthDate', '1899-12-31');
  await page.click('button[type=submit]');
  check('1899 走 null 路径（无卡）', await page.isHidden('#result'), true);
  check('1899 提示语', await page.textContent('#msg'), '表覆盖 1900-2050，其他年份暂不支持');

  // 超界：2051
  await page.fill('#birthDate', '2051-01-01');
  await page.click('button[type=submit]');
  check('2051 走 null 路径（无卡）', await page.isHidden('#result'), true);

  // 正常回到一张卡，拍全页
  await page.fill('#birthDate', '1994-11-30');
  await page.fill('#birthTime', '01:50');
  await page.click('button[type=submit]');
  await page.waitForSelector('#result:not([hidden])');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(SHOTS, 'page_full.png'), fullPage: true });

  // 375 宽（非验收尺寸，确认缩放不产生横向滚动）
  const slim = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  await slim.goto(URL, { waitUntil: 'load' });
  await slim.click('#pickDark');
  await slim.waitForSelector('#gate', { state: 'hidden' });
  await slim.fill('#birthDate', '1990-03-15');
  await slim.fill('#birthTime', '08:20');
  await slim.click('button[type=submit]');
  await slim.waitForSelector('#result:not([hidden])');
  const slimFit = await slim.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    cardW: document.getElementById('card').getBoundingClientRect().width,
  }));
  check('375 宽无横向滚动', slimFit.sw <= slimFit.cw, true);
  check('375 宽卡片缩放后 <= 375', slimFit.cardW <= 375.5, true);
  await slim.screenshot({ path: path.join(SHOTS, 'width_375.png') });
  await slim.close();

  console.log('\nJS 错误数：' + errors.length);
  errors.forEach((e) => console.log('  ' + e));
  if (errors.length) bad++;

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: FAIL (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

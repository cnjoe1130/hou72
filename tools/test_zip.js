#!/usr/bin/env node
/* 打包冒烟：解压 ziwei-hou.zip 到临时目录，从解压产物直接跑一锚点 + 一次保存。 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ZIP = path.join(ROOT, 'ziwei-hou.zip');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-hou-'));
  execFileSync('unzip', ['-q', ZIP, '-d', tmp]);

  const walk = (d, base) => fs.readdirSync(d).flatMap((n) => {
    const p = path.join(d, n);
    const rel = base ? base + '/' + n : n;
    return fs.statSync(p).isDirectory() ? walk(p, rel) : [rel];
  });
  const files = walk(tmp, '').sort();
  let bad = 0;
  const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  };

  console.log('解压清单：\n  ' + files.join('\n  ') + '\n');
  check('解压后 index.html 在根', files.includes('index.html'), true);
  check('文件数 6', files.length, 6);
  check('无绝对路径 / 无 ..', files.every((f) => !f.startsWith('/') && !f.includes('..')), true);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  await page.goto('file://' + path.join(tmp, 'index.html'), { waitUntil: 'load' });
  check('解压产物无脚本错误即加载', errors.length, 0);

  await page.click('#pickDark');
  await page.waitForSelector('#gate', { state: 'hidden' });

  await page.fill('#birthDate', '1994-11-30');
  await page.fill('#birthTime', '01:50');
  await page.click('button[type=submit]');
  await page.waitForSelector('#result:not([hidden])');
  check('解压产物 节气', await page.textContent('#jieqiName'), '小雪');
  check('解压产物 候名', await page.textContent('#houName'), '天气上升地气下降');
  check('解压产物 进度', (await page.textContent('#houFlag')).includes('59 / 72'), true);

  await page.click('#saveBtn');
  await page.waitForSelector('#lightbox:not([hidden])', { timeout: 8000 });
  const img = await page.evaluate(() => {
    const el = document.getElementById('lbImg');
    return { ok: el.src.startsWith('data:image/png;base64'), w: el.naturalWidth, h: el.naturalHeight };
  });
  check('解压产物 保存为 PNG', img.ok && img.w === 780 && img.h === 1688, true);

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nJS 错误数：${errors.length}`);
  errors.forEach((e) => console.log('  ' + e));
  if (errors.length) bad++;
  console.log(bad === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: FAIL (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

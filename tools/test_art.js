#!/usr/bin/env node
/* 图资产：72 张都在、索引由文件名生成、启动零预载、按候懒加载且不重复请求。 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const ART_DIR = path.join(ROOT, 'app/assets/art72');

(async () => {
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

  const map = await page.evaluate(() => window.HOU_ART || {});
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
  check('HOU_ART 72 条', keys.length, 72);
  check('候号 1..72 连续', keys.join(',') === Array.from({ length: 72 }, (_, i) => i + 1).join(','), true);

  const namere = /^assets\/art72\/hou_(\d{2})_[a-z]+\.webp$/;
  const badName = keys.filter((k) => {
    const m = namere.exec(map[String(k)]);
    return !m || Number(m[1]) !== k;
  });
  check('每条路径 = assets/art72/hou_NN_拼音.webp 且编号对得上', badName.length, 0);

  const onDisk = fs.readdirSync(ART_DIR).filter((f) => f.endsWith('.webp'));
  check('磁盘上 72 张 webp', onDisk.length, 72);
  const missing = keys.filter((k) => !fs.existsSync(path.join(ROOT, 'app', map[String(k)])));
  check('索引每一条都能落到文件', missing.length, 0);

  const boxes = await page.evaluate(() => window.HOU_ART_BOX || {});
  const bkeys = Object.keys(boxes).map(Number).sort((a, b) => a - b);
  check('HOU_ART_BOX 72 条且候号对齐', bkeys.join(',') === keys.join(','), true);
  const badBox = bkeys.filter((k) => {
    const [aw, ah, iw, ih, il, it] = boxes[String(k)];
    const okNum = [aw, ah, iw, ih, il, it].every((v) => typeof v === 'number' && isFinite(v));
    return !okNum || aw < 100 || aw > 346.1 || ah < 100 || ah > 461.1 ||
      iw < 100 || iw > 500 || ih < 100 || ih > 500 ||
      il > 0.01 || il < -60 || it > 0.01 || it < -60;
  });
  check('画框数值都在合理区间（宽 100–346 / 高 100–461 / 放大 ≥100% / 偏移 ≤0）', badBox.length, 0);
  const offAspect = bkeys.filter((k) => {
    const [aw, ah, iw, ih] = boxes[String(k)];
    /* 图在槽里的显示尺寸必须仍是 512:683，否则画会被拉扁 */
    const ratio = (iw / 100 * aw) / (ih / 100 * ah);
    return Math.abs(ratio - 512 / 683) > 0.02;
  });
  check('槽内图显示比例仍是 512:683（不拉伸）', offAspect.length, 0);

  const boot = await page.evaluate(() => window.HouArt.stats());
  check('启动时零张预载（懒加载）', boot.loads, 0);
  const imgsAtBoot = await page.evaluate(() => document.querySelectorAll('.art-slot img').length);
  check('启动时画槽里没有 img', imgsAtBoot, 0);

  const one = await page.evaluate(async () => {
    const img = await window.HouArt.load(10);
    return { w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute('src'),
      loads: window.HouArt.stats().loads };
  });
  check('候 10 载入成功', one.src, map['10']);
  check('候 10 尺寸 512×683', one.w + 'x' + one.h, '512x683');
  check('载入计数 = 1', one.loads, 1);

  const again = await page.evaluate(async () => {
    await window.HouArt.load(10);
    await window.HouArt.load('10');
    return window.HouArt.stats();
  });
  check('同一候重复取不重复请求（缓存）', again.loads, 1);
  check('缓存里只有 1 张', again.cached, 1);

  const pre = await page.evaluate(async () => {
    window.HouArt.preload([9, 11]);
    await new Promise((r) => setTimeout(r, 400));
    return window.HouArt.stats();
  });
  check('预取邻候 9 / 11 后共 3 张', pre.loads, 3);

  const all = await page.evaluate(async () => {
    const bad = [];
    for (let h = 1; h <= 72; h++) {
      const img = await window.HouArt.load(h);
      if (img.naturalWidth !== 512 || img.naturalHeight !== 683) bad.push(h);
    }
    return { bad, stats: window.HouArt.stats() };
  });
  check('72 张全部解码且尺寸 512×683', all.bad.length, 0);
  check('全部取完后缓存 72', all.stats.cached, 72);
  check('全部取完共计 72 次（每候一次）', all.stats.loads, 72);

  const noArt = await page.evaluate(async () => {
    try { await window.HouArt.load(0); return 'resolved'; } catch (e) { return e.message; }
  });
  check('没有图的候号明确报错', noArt, 'no-art:0');

  check('JS 错误数', errors.length, 0);
  if (errors.length) errors.forEach((e) => console.log('  ' + e));

  await browser.close();
  console.log(bad === 0 ? 'ALL ART CHECKS PASS' : `ART CHECKS FAILED: ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
})();

#!/usr/bin/env node
/* 导出带图：起本地 HTTP 站，翻背后保存，验证 PNG 里画作真的在（像素级），
   再验证 file:// 直开时如实降级提示而不是悄悄导出无图版。 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

let bad = 0;
const check = (label, got, want) => {
  const ok = typeof want === 'function' ? want(got) : got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)}${typeof want === 'function' ? '' : ' want=' + JSON.stringify(want)}`);
};

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(APP, rel);
    if (!file.startsWith(APP) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function flipBack(page) {
  await page.click('#pickDark');
  await page.waitForSelector('#gate', { state: 'hidden' });
  await page.fill('#birthDate', '1990-03-22');
  await page.fill('#birthTime', '12:00');
  await page.click('button[type=submit]');
  await page.waitForSelector('#result:not([hidden])');
  await page.waitForTimeout(600);
  await page.click('.leaf.is-mine');
  await page.waitForTimeout(700);
  await page.click('.leaf.is-zoom');
  await page.waitForFunction(() => {
    const s = document.querySelector('.leaf.is-zoom .bk-seal');
    return s && s.classList.contains('is-on');
  }, null, { timeout: 5000, polling: 40 });
  await page.waitForFunction(() => {
    const i = document.querySelector('.leaf.is-zoom .bk-art');
    return i && i.getAttribute('src') && i.complete && i.naturalWidth > 0;
  }, null, { timeout: 5000, polling: 40 });
}

async function save(page) {
  await page.click('#saveBtn');
  await page.waitForSelector('#lightbox:not([hidden])', { timeout: 10000 });
  return page.evaluate(async () => {
    const im = document.getElementById('lbImg');
    const hud = document.getElementById('lbHint').textContent;
    const L = document.querySelector('.leaf.is-zoom');
    const card = L.querySelector('.card');
    const slot = L.querySelector('.art-slot');
    const cr = card.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    const k = 390 / cr.width;
    const box = {
      x: (sr.left - cr.left) * k * 2, y: (sr.top - cr.top) * k * 2,
      w: sr.width * k * 2, h: sr.height * k * 2,
    };
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.src = im.src;
    await img.decode();
    canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const stat = (x, y, w, h) => {
      const d = ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data;
      let n = 0, s = 0, s2 = 0;
      const lum = [];
      for (let i = 0; i < d.length; i += 4) {
        const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        lum.push(v); s += v; s2 += v * v; n++;
      }
      const mean = s / n;
      return { mean: Math.round(mean * 10) / 10, sd: Math.round(Math.sqrt(s2 / n - mean * mean) * 10) / 10,
        p5: Math.round(Math.min(...lum.slice(0, 4000))) };
    };
    return {
      w: im.naturalWidth, h: im.naturalHeight, hud,
      inlined: window.Capture.artInlined(),
      art: stat(box.x + box.w * 0.1, box.y + box.h * 0.1, box.w * 0.8, box.h * 0.8),
      /* 纸底取样放左下角、食签行以下：画片顶到 483 后，旧取样点(30,700)已经落在画里 */
      paper: stat(40, 1450, 260, 140),
      box,
      imgSrc: im.src.slice(0, 24),
    };
  });
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
    await flipBack(page);
    const httpOut = await save(page);
    console.log('INFO  http 导出', JSON.stringify(httpOut));
    check('http 站下导出 780×1688', httpOut.w + 'x' + httpOut.h, '780x1688');
    check('http 站下图已内联进导出', httpOut.inlined, true);
    check('内联成功时提示是「长按图片保存到相册」', httpOut.hud, '长按图片保存到相册');
    check('导出图是 PNG', httpOut.imgSrc.startsWith('data:image/png'), true);
    check('画作区有真实像素起伏（sd > 6）', httpOut.art.sd, (v) => v > 6);
    check('画作区比纸底更花（sd ≥ 纸底 × 2）', httpOut.art.sd, (v) => v >= httpOut.paper.sd * 2);
    check('画作区不是纯纸色（均值与纸底有差）', Math.abs(httpOut.art.mean - httpOut.paper.mean), (v) => v >= 3);

    /* file:// 直开：canvas 被文件图片染污，toDataURL 不可用 —— 应降级并说明 */
    const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    p2.on('pageerror', (e) => errors.push('file pageerror: ' + e.message));
    await p2.goto('file://' + path.join(APP, 'index.html'), { waitUntil: 'load' });
    await flipBack(p2);
    const fileOut = await save(p2);
    console.log('INFO  file 导出', JSON.stringify(fileOut));
    check('file:// 下如实标出不含插画', fileOut.inlined, false);
    check('file:// 下提示说明用站点地址打开', fileOut.hud.indexOf('用站点地址打开即可') !== -1, true);
    check('file:// 下画作区接近纸底（没图）', fileOut.art.sd, (v) => v < httpOut.art.sd / 2);

    /* WebKit（Safari 同引擎）：刚翻背的第一次保存就得带插画。
       旧做法把图内嵌在 SVG 里，WebKit 首次光栅化 foreignObject 赶不上内嵌图解码，
       第一张是空画，取消再存才有——这条专防那个回归。 */
    const wk = await webkit.launch();
    try {
      const p3 = await wk.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      p3.on('pageerror', (e) => errors.push('webkit pageerror: ' + e.message));
      p3.on('console', (m) => { if (m.type() === 'error') errors.push('webkit console: ' + m.text()); });
      await p3.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
      await flipBack(p3);
      const wkOut = await save(p3);
      console.log('INFO  webkit 第一次保存', JSON.stringify(wkOut));
      check('WebKit 第一次保存就有插画（sd > 6）', wkOut.art.sd, (v) => v > 6);
      check('WebKit 第一次保存画作区比纸底更花', wkOut.art.sd, (v) => v >= wkOut.paper.sd * 2);
      check('WebKit 第一次保存画作区不是纯纸色', Math.abs(wkOut.art.mean - wkOut.paper.mean), (v) => v >= 3);
    } finally {
      await wk.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (errors.length) { bad++; console.log('JS 错误：'); errors.forEach((e) => console.log('  ' + e)); }
  console.log(bad === 0 ? 'ALL EXPORT CHECKS PASS' : `EXPORT CHECKS FAILED: ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
})();

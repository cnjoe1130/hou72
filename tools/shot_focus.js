#!/usr/bin/env node
/* 定点截图：诗经条目 / 长诗导出。只读。 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const SHOTS = path.join(__dirname, 'shots', 'audit');
fs.mkdirSync(SHOTS, { recursive: true });

const CASES = {
  5: ['2001-02-25', '08:00'],
  28: ['2001-06-26', '08:00'],
  44: ['2001-09-13', '08:00'],
  70: ['2002-01-25', '08:00'],
  49: ['2001-10-13', '08:00'],
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#pickDark');
  await page.waitForSelector('#gate', { state: 'hidden' });
  await page.evaluate(() => document.fonts.ready);

  for (const [hou, c] of Object.entries(CASES)) {
    await page.fill('#birthDate', c[0]);
    await page.fill('#birthTime', c[1]);
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.waitForTimeout(380);
    const got = await page.evaluate(() => Number(document.querySelector('.leaf.is-mine').dataset.hou));
    if (got !== Number(hou)) { console.log(`SKIP hou ${hou} -> 实际 ${got}`); continue; }
    await page.click('.leaf.is-mine');
    await page.waitForTimeout(420);
    await page.click('.leaf.is-zoom');
    await page.waitForSelector('.leaf.is-zoom .bk-seal.is-on', { timeout: 6000, polling: 40 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `focus_${hou}.png`) });

    if (Number(hou) === 49) {
      await page.click('#saveBtn');
      await page.waitForSelector('#lightbox:not([hidden])', { timeout: 10000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(SHOTS, `export_${hou}.png`) });
      const png = await page.evaluate(() => {
        const im = document.getElementById('lbImg');
        const c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        c.getContext('2d').drawImage(im, 0, 0);
        return c.toDataURL('image/png');
      });
      fs.writeFileSync(path.join(SHOTS, `export_${hou}.png.png`), Buffer.from(png.split(',')[1], 'base64'));
      await page.click('#lbClose');
      await page.waitForTimeout(250);
    }
    console.log('shot', hou);
  }
  await browser.close();
})();

#!/usr/bin/env node
/* 版式预览：在真实 app 上注入 CSS 覆盖，截背面卡片。只读，不改产物。 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const OUT = path.join(__dirname, 'shots', 'layout-previews');
fs.mkdirSync(OUT, { recursive: true });

/* 只给候号，日期进页面后扫描得到（2001-2004 每天一个） */
const CASE_HOUS = {
  '05': '诗经 2×5（最短）',
  '10': '春晓 4×6',
  '19': '陆游 2×8',
  '48': '共创版',
  '53': '2×9（最高）',
};

/* 诗经条目的 src 里「先秦 · 《诗经·小雅·…》」与出处重复，预览按「先秦 · 佚名」收紧，
   否则题跋列会顶到画框（正式改动需你点头）。 */
const VARIANTS = {
  base: { css: `.leaf-badge { display:none !important; }` },
  A: {
    css: `
      .leaf-badge { display:none !important; }
      .art-band { top:22px !important; height:390px !important; }
      .art-slot { width:282px !important; height:390px !important; }
    `,
    apply() {
      const srcEl = document.querySelector('.leaf.is-zoom .bk-poem .src');
      if (srcEl) srcEl.textContent = srcEl.textContent.replace(/《诗经[^》]*》\s*$/, '佚名');
      const leaf = document.querySelector('.leaf.is-zoom');
      const poem = leaf.querySelector('.bk-poem');
      const food = leaf.querySelector('.bk-food');
      const seal = leaf.querySelector('.bk-seal');
      const kicker = leaf.querySelector('.bk-kicker');
      const isAsk = poem.classList.contains('is-ask');
      const lines = [...poem.querySelectorAll('.ln')];
      const maxChars = Math.max(...lines.map((n) => n.textContent.length));
      const ps = isAsk ? 16 : Math.max(18, Math.min(26, 200 / (maxChars * 1.22)));
      lines.forEach((n) => { n.style.fontSize = ps + 'px'; });
      const H = poem.offsetHeight;
      const fh = food.offsetHeight;
      const kH = 16, g1 = 24, g2 = 12, sealH = 72, bottom = 30;
      const top = 844 - bottom - (kH + H + g1 + fh + g2 + sealH);
      kicker.style.top = top + 'px';
      poem.style.top = (top + kH) + 'px'; poem.style.bottom = 'auto';
      food.style.top = (top + kH + H + g1) + 'px'; food.style.bottom = 'auto';
      seal.style.top = (top + kH + H + g1 + fh + g2) + 'px'; seal.style.bottom = 'auto';
    },
  },
  B: {
    css: `
      .leaf-badge { display:none !important; }
      .art-band { top:22px !important; height:390px !important; }
      .art-slot { width:282px !important; height:390px !important; }
      .bk-kicker { top:424px !important; right:40px !important; }
      .bk-poem { top:446px !important; right:40px !important; }
      .bk-food { left:54px !important; top:446px !important; bottom:auto !important;
                 background:none !important; border:0 !important; padding:0 !important;
                 display:flex !important; flex-direction:row-reverse !important;
                 align-items:flex-start !important; gap:10px !important; transform:none !important; }
      .bk-food .t, .bk-food .s { writing-mode:vertical-rl; -webkit-writing-mode:vertical-rl;
                 margin:0 !important; }
      .bk-food .t { font-size:14px !important; letter-spacing:.16em !important; }
      .bk-food .s { font-size:10.5px !important; letter-spacing:.05em !important; color:#7D6F50 !important; }
      .bk-seal { left:54px !important; bottom:30px !important; }
    `,
    apply() {
      const srcEl = document.querySelector('.leaf.is-zoom .bk-poem .src');
      if (srcEl) srcEl.textContent = srcEl.textContent.replace(/《诗经[^》]*》\s*$/, '佚名');
    },
  },
  /* 满幅画（338×451，正好 3:4）+ 底部题跋一行（食左 印右） */
  C: {
    css: `.leaf-badge { display:none !important; }`,
    apply(o) {
      o = o || {};
      const W = o.width || 338, AH = o.height || 451, T = o.top || 22;
      const srcEl = document.querySelector('.leaf.is-zoom .bk-poem .src');
      if (srcEl) srcEl.textContent = srcEl.textContent.replace(/《诗经[^》]*》\s*$/, '佚名');
      const leaf = document.querySelector('.leaf.is-zoom');
      const band = leaf.querySelector('.art-band');
      const slot = leaf.querySelector('.art-slot');
      const img = slot.querySelector('img');
      const poem = leaf.querySelector('.bk-poem');
      const food = leaf.querySelector('.bk-food');
      const seal = leaf.querySelector('.bk-seal');
      const kicker = leaf.querySelector('.bk-kicker');
      const isAsk = poem.classList.contains('is-ask');
      const lines = [...poem.querySelectorAll('.ln')];
      const maxChars = Math.max(...lines.map((n) => n.textContent.length));
      const ps = isAsk ? 16 : Math.max(19, Math.min(26, 200 / (maxChars * 1.22)));
      lines.forEach((n) => { n.style.fontSize = ps + 'px'; });

      band.style.cssText = `position:absolute;left:0;right:0;top:${T}px;height:${AH}px;display:block;`;
      slot.style.cssText = `position:relative;width:${W}px;height:${AH}px;margin:0 auto;border:1px solid rgba(122,96,48,.22);overflow:hidden;`;
      /* 旧图自带白纸边：预览换 /tmp/art-trim 里去掉白边的副本（新图本来就没有），
         正式产物不这样裁，等新图进包时按真实裁切百分比算 */
      img.style.width = '100%'; img.style.height = '100%';
      img.style.left = '0'; img.style.top = '0';
      img.style.objectFit = 'cover'; img.style.objectPosition = 'center';
      img.src = 'file:///tmp/art-trim/' + String(img.dataset.hou).padStart(2, '0') + '.webp';

      food.style.maxWidth = '236px'; food.style.boxSizing = 'border-box';
      const H = poem.offsetHeight;
      const fh = food.offsetHeight;
      const rowH = 72, bottom = 30, gPoem = 16, gapK = 22;
      const rowTop = 844 - bottom - rowH;
      const artBottom = T + AH;
      const mode = o.poemMode || 'bottom';
      let poemTop = rowTop - gPoem - H;                       // bottom：贴住食俗行
      if (mode === 'top') poemTop = artBottom + (o.poemGap || 30);   // 顶接画片下沿
      if (mode === 'center') poemTop = artBottom + (rowTop - gPoem - artBottom - H) / 2;
      if (poemTop + H > rowTop - gPoem) poemTop = rowTop - gPoem - H;  // 长诗兜底
      if (poemTop < artBottom + 20) poemTop = artBottom + 20;
      kicker.style.top = (poemTop - gapK) + 'px';
      poem.style.top = poemTop + 'px'; poem.style.bottom = 'auto';
      food.style.top = (rowTop + (rowH - fh) / 2) + 'px'; food.style.bottom = 'auto';
      seal.style.left = 'auto'; seal.style.right = '32px';
      seal.style.top = rowTop + 'px'; seal.style.bottom = 'auto';
      return img.decode().catch(() => {});
    },
  },
};

/* D/E：在 C 的版式上试去框线 + 去掉「候·之·记」角标
   D 只留最外一道框线，画片收进 330x440，四周留 10px 呼吸；E 框线全去，画片放到 346x461 */
VARIANTS.D = {
  css: `.leaf-badge{display:none!important} .bk::after{display:none!important}
        .art-slot{border:0!important} .bk-kicker{display:none!important}`,
  apply: VARIANTS.C.apply,
  args: { width: 330, height: 440, top: 30 },
};
VARIANTS.E = {
  css: `.leaf-badge{display:none!important} .bk::before,.bk::after{display:none!important}
        .art-slot{border:0!important} .bk-kicker{display:none!important}`,
  apply: VARIANTS.C.apply,
  args: { width: 346, height: 461, top: 22 },
};
/* F/G：D 的框线 + 诗块两种新位置（顶接画片 / 在画片与食俗之间居中） */
VARIANTS.F = {
  css: VARIANTS.D.css,
  apply: VARIANTS.C.apply,
  args: { width: 330, height: 440, top: 30, poemMode: 'top', poemGap: 30 },
};
VARIANTS.G = {
  css: VARIANTS.D.css,
  apply: VARIANTS.C.apply,
  args: { width: 330, height: 440, top: 30, poemMode: 'center' },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
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

  /* 只跑指定组合，例：PREVIEW_FILTER=C_05,D_05 */
  const FILTER = (process.env.PREVIEW_FILTER || '').split(',').filter(Boolean);
  /* 用候选新图顶掉旧图，验证新图贴进卡里的真实观感 */
  const SEED_ART = process.env.SEED_ART || '';
  const SEED_HOU = process.env.SEED_HOU || '05';

  for (const [vname, v] of Object.entries(VARIANTS)) {
    for (const [hou, label] of Object.entries(CASE_HOUS)) {
      if (FILTER.length && !FILTER.includes(`${vname}_${hou}`)) continue;
      const date = dates[Number(hou)];
      await page.fill('#birthDate', date);
      await page.fill('#birthTime', '12:00');
      await page.click('button[type=submit]');
      await page.waitForSelector('#result:not([hidden])');
      await page.waitForTimeout(360);
      await page.click('.leaf.is-mine');
      await page.waitForTimeout(400);
      await page.click('.leaf.is-zoom');
      await page.waitForSelector('.leaf.is-zoom .bk-seal.is-on', { timeout: 6000, polling: 40 });
      await page.waitForTimeout(120);
      if (v.css) await page.addStyleTag({ content: v.css });
      if (v.apply) await page.evaluate(v.apply, v.args || null);
      if (SEED_ART && hou === SEED_HOU) {
        await page.evaluate(async (src) => {
          const img = document.querySelector('.leaf.is-zoom .art-slot img');
          img.style.width = '100%'; img.style.height = '100%';
          img.style.left = '0'; img.style.top = '0';
          img.style.objectFit = 'cover'; img.style.objectPosition = 'center';
          img.src = src;
          await img.decode().catch(() => {});
        }, 'file://' + path.resolve(SEED_ART));
      }
      await page.waitForTimeout(120);
      const leaf = page.locator('.leaf.is-zoom');
      await leaf.screenshot({ path: path.join(OUT, `${vname}_${hou}.png`) });
      console.log('shot', vname, hou, label);
      await page.goto(URL, { waitUntil: 'load' });
      await page.click('#pickDark');
      await page.waitForSelector('#gate', { state: 'hidden' });
    }
  }
  await browser.close();
})();

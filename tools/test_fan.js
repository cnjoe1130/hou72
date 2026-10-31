#!/usr/bin/env node
/* 任务 C 验收：扇面摊牌 / 抽出放大 / 翻背三件套 / 滑动换候 / 跨年环 / null 行 / 保留项。 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'app/index.html');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const MY_10 = ['1990-03-22', '12:00', '玄鸟至'];   // 春分初候，有诗文种子
const MY_48 = ['2023-10-04', '12:00', '水始涸']; // pending：无诗（候 48）
const MY_63 = ['2023-12-18', '12:00', '荔挺出']; // pending：无诗（候 63）
const MY_72 = ['2020-02-01', '12:00', '水泽腹坚'];  // 大寒三候，跨年环

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  let bad = 0;
  const check = (label, got, want) => {
    const ok = typeof want === 'function' ? want(got) : got === want;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(got)}${want === true ? '' : ''}`);
  };
  const info = (label, v) => console.log(`INFO  ${label}  ${JSON.stringify(v)}`);

  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name) });
  const state = () => page.evaluate(() => window.HouFan.state());
  const openFan = async (c) => {
    await page.fill('#birthDate', c[0]);
    await page.fill('#birthTime', c[1]);
    await page.click('button[type=submit]');
    await page.waitForSelector('#result:not([hidden])');
    await page.waitForTimeout(620);
  };
  const strips = () => page.evaluate(() => {
    const zr = document.querySelector('.leaf.is-zoom').getBoundingClientRect();
    const out = [];
    document.querySelectorAll('.leaf:not(.is-zoom)').forEach((el) => {
      const r = el.getBoundingClientRect();
      const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
      const visible = (right - left) * Math.min(r.bottom, innerHeight) > 0 ? Math.round(right - left) : 0;
      out.push({ hou: el.dataset.hou, x: Math.round((left + right) / 2), y: Math.round(Math.min(r.bottom, innerHeight) - 30), visible });
    });
    return { zr: { right: zr.right, left: zr.left }, out };
  });

  /* 点保存 → 灯箱就绪 → 取导出 PNG 尺寸 + 序列化后的 SVG（判断导的是正面还是背面） */
  const saveAndSvg = async () => {
    await page.evaluate(() => {
      const orig = XMLSerializer.prototype.serializeToString;
      window.__origSer = orig;
      window.__svg = '';
      XMLSerializer.prototype.serializeToString = function (n) {
        const s = orig.call(this, n);
        if (!window.__svg && s.indexOf('<svg') === 0) window.__svg = s;
        return s;
      };
    });
    await page.click('#saveBtn');
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 10000 });
    const got = await page.evaluate(() => {
      XMLSerializer.prototype.serializeToString = window.__origSer;
      const im = document.getElementById('lbImg');
      const svg = window.__svg || '';
      return { w: im.naturalWidth, h: im.naturalHeight, svg, text: svg.replace(/<[^>]+>/g, '') };
    });
    await page.click('#lbClose');
    await page.waitForTimeout(200);
    return got;
  };

  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#pickDark');
  await page.waitForSelector('#gate', { state: 'hidden' });

  /* ---------- 1. 扇面是默认结果页 ---------- */
  await openFan(MY_10);
  const fan1 = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('.leaf')];
    const centers = leaves.map((el) => {
      const r = el.getBoundingClientRect();
      return { hou: Number(el.dataset.hou), mine: el.classList.contains('is-mine'), x: r.left + r.width / 2 };
    }).sort((a, b) => a.x - b.x);
    const mine = document.querySelector('.leaf.is-mine');
    const f = mine.querySelector('.face.front');
    return {
      fanVisible: !document.getElementById('fanArea').hidden,
      singleHidden: document.getElementById('singleArea').hidden,
      n: leaves.length,
      midHou: centers[3].hou,
      mineHou: Number(mine.dataset.hou),
      hids: leaves.map((el) => el.dataset.hou).join(','),
      badgeCount: leaves.filter((el) => el.querySelector('.leaf-badge').textContent === '你的候').length,
      badgeVisibleOnMine: getComputedStyle(mine.querySelector('.leaf-badge')).opacity,
      badgeText: mine.querySelector('.leaf-badge').textContent,
      frontEyebrow: f.querySelector('.eyebrow').textContent,
      frontFlag: f.querySelector('.hou-flag').textContent,
      frontKicker: f.querySelector('.kicker').textContent,
      frontJieqi: f.querySelector('.jieqi').textContent,
      frontLayer: f.querySelector('.layer-tag').textContent,
      frontHou: f.querySelector('.hou').textContent,
      status: document.getElementById('fanStatus').textContent,
      statusBold: document.querySelector('#fanStatus b').textContent,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      depth: getComputedStyle(document.getElementById('stage') || document.body).transform,
    };
  });
  check('结果页默认是扇面', fan1.fanVisible && fan1.singleHidden, true);
  check('扇面 7 叶', fan1.n, 7);
  check('叶序 = 你的候 ±3', fan1.hids, '7,8,9,10,11,12,13');
  check('中心叶 = 你的候', fan1.mineHou, 10);
  check('中心卡在中间', fan1.midHou, 10);
  check('「你的候」印章只出现 1 次', fan1.badgeCount, 1);
  check('「你的候」印章可见', fan1.badgeVisibleOnMine, '1');
  check('中心卡正面 = 出生那一候', fan1.frontEyebrow, '你出生的那一候');
  check('中心卡正面带候号', fan1.frontFlag, '你的候 · 10 / 72 · 初候');
  check('中心卡正面带生日', fan1.frontKicker, '1990 年 3 月 22 日 · 12:00');
  check('邻候正面是完整小卡（节气+候名+序号）',
    (await page.evaluate(() => {
      const f = document.querySelectorAll('.leaf')[0].querySelector('.face.front');
      return [f.querySelector('.jieqi').textContent, f.querySelector('.hou').textContent,
        f.querySelector('.hou-flag').textContent, f.querySelector('.layer-tag').textContent].join('|');
    })), '惊蛰|桃始华|候 · 7 / 72 · 初候|节气 · 3 / 24');
  check('状态行标明你的候', fan1.status.startsWith('你的候 · ') && fan1.statusBold === '玄鸟至', true);
  check('390 扇面不横向滚动', fan1.sw <= fan1.cw, true);
  await page.evaluate(() => document.getElementById('fanArea').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  await shot('fan_expanded.png');

  /* ---------- 2. 点叶抽出放大 ---------- */
  await page.click('.leaf.is-mine');
  await page.waitForTimeout(700);
  const zoom1 = await page.evaluate(() => {
    const z = document.querySelector('.leaf.is-zoom');
    const r = z.getBoundingClientRect();
    return {
      mode: window.HouFan.state().mode,
      nZoom: document.querySelectorAll('.leaf.is-zoom').length,
      nDim: document.querySelectorAll('.leaf.is-dim').length,
      tf: z.style.transform,
      w: Math.round(r.width), h: Math.round(r.height),
      stageH: Math.round(document.getElementById('fanStage').getBoundingClientRect().height),
      status: document.getElementById('fanStatus').textContent,
      badge: getComputedStyle(z.querySelector('.leaf-badge')).opacity,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
  });
  check('抽出后进入放大态', zoom1.mode, 'zoom');
  check('只有 1 叶放大', zoom1.nZoom, 1);
  check('其余 6 叶后退变暗', zoom1.nDim, 6);
  check('放大卡宽 ≈ 273（0.70）', Math.abs(zoom1.w - 273) <= 2, true);
  check('放大态舞台高 ≈ 591', Math.abs(zoom1.stageH - 591) <= 2, true);
  check('放大态状态行说「正在看 · 你的候」', zoom1.status.startsWith('正在看 · 你的候 · '), true);
  check('放大后「你的候」仍在', zoom1.badge, '1');
  check('390 放大态不横向滚动', zoom1.sw <= zoom1.cw, true);
  await shot('fan_zoom.png');

  /* ---------- 3. 再点翻背：三件套 ≤ 4s ---------- */
  const t0 = Date.now();
  await page.click('.leaf.is-mine');
  await page.waitForFunction(() => {
    const s = document.querySelector('.leaf.is-zoom .bk-seal');
    return s && s.classList.contains('is-on');
  }, null, { timeout: 5000, polling: 40 });
  const flipMs = Date.now() - t0;
  info('翻背总时长 ms', flipMs);
  check('翻背三件套 ≤ 4000ms', flipMs <= 4000, true);
  check('翻背 ≥ 650ms（翻转本身）', flipMs >= 650, true);
  const back1 = await page.evaluate(() => {
    const L = document.querySelector('.leaf.is-zoom');
    const art = L.querySelector('.art-slot');
    const im = art.querySelector('img');
    return {
      flipped: L.classList.contains('is-flipped'),
      poemOn: !!L.querySelector('.bk-poem.is-on'),
      foodOn: !!L.querySelector('.bk-food.is-on'),
      sealOn: !!L.querySelector('.bk-seal.is-on'),
      poem: [...L.querySelectorAll('.bk-poem .ln')].map((n) => n.textContent).join(''),
      src: L.querySelector('.bk-poem .src') ? L.querySelector('.bk-poem .src').textContent : '',
      foodT: L.querySelector('.bk-food .t').textContent,
      foodS: L.querySelector('.bk-food .s').textContent,
      seal: L.querySelector('.bk-seal').textContent,
      artH: art.offsetHeight,
      artW: art.offsetWidth,
      artText: art.textContent.trim(),
      artKids: art.children.length,
      artReady: L.getAttribute('data-art-ready'),
      artSrc: im ? im.getAttribute('src') : '',
      artNat: im ? im.naturalWidth + 'x' + im.naturalHeight : '',
      artAlt: im ? im.getAttribute('alt') : '',
      artOn: im ? im.classList.contains('is-on') : false,
      box: (window.HOU_ART_BOX || {})['10'],
      badge: L.querySelector('.leaf-badge').textContent,
    };
  });
  check('背面已翻起', back1.flipped, true);
  check('诗出现', back1.poemOn, true);
  check('诗句为《春晓》原文', back1.poem, '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。');
  check('诗注格式《篇名》· 作者', back1.src, '《春晓》· 唐·孟浩然');
  check('食俗签出现', back1.foodOn, true);
  check('食俗主文', back1.foodT, '春分 · 立蛋');
  check('食俗小字', back1.foodS, '民间岁时，竖蛋取昼夜平分之意');
  check('印落下', back1.sealOn && back1.seal === '玄鸟至印', true);
  check('画槽里正好 1 张图', back1.artKids === 1 && back1.artAlt === '', true);
  check('画槽用本候的图（索引驱动）', back1.artSrc, 'assets/art72/hou_10_xuanniaozhi.webp');
  check('图已解码 512×683', back1.artNat, '512x683');
  check('图随翻面亮起', back1.artOn, true);
  check('画槽尺寸取本候实画框', back1.artH === Math.round(back1.box[1]), true);
  check('画槽按实画比例收窄（不裁画）', Math.abs(back1.artW - back1.box[0]) <= 1, true);
  check('画槽里没有文字', back1.artText, '');
  check('背面仍是你的候', back1.badge, '你的候');
  await page.waitForTimeout(900);
  await shot('fan_back_poem.png');

  // 再点回落正面
  await page.click('.leaf.is-zoom');
  await page.waitForTimeout(700);
  check('第三点翻回正面', await page.evaluate(() => !document.querySelector('.leaf.is-zoom').classList.contains('is-flipped')), true);

  /* ---------- 4. 滑动换候（放大态） ---------- */
  const beforeSwipe = await state();
  const box = await page.evaluate(() => {
    const r = document.querySelector('.leaf.is-zoom').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x + 90, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x - 90, box.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(650);
  const afterSwipe = await state();
  check('左滑换到下一候', afterSwipe.sel, beforeSwipe.sel + 1);
  const near = await page.evaluate(() => {
    const L = document.querySelector('.leaf.is-zoom');
    return {
      hou: L.dataset.hou,
      badge: L.querySelector('.leaf-badge').textContent,
      badgeOp: getComputedStyle(L.querySelector('.leaf-badge')).opacity,
      status: document.getElementById('fanStatus').textContent,
      mineDim: getComputedStyle(document.querySelector('.leaf.is-mine')).opacity,
      mineBadge: document.querySelector('.leaf.is-mine .leaf-badge').textContent,
      flag: L.querySelector('.face.front .hou-flag').textContent,
    };
  });
  check('换候后看的是邻候 11', near.hou, '11');
  check('邻候标记为「邻候」', near.badge, '邻候');
  check('邻候章是弱化显示（≠1）', near.badgeOp !== '1', true);
  check('状态行说明你的候没变', near.status.includes('你的候仍是') && near.status.includes('玄鸟至'), true);
  check('你的候仍挂「你的候」章', near.mineBadge, '你的候');
  check('邻候正面候号不带「你的」', near.flag, '候 · 11 / 72 · 二候');
  await page.evaluate(() => document.getElementById('fanArea').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await shot('fan_view_neighbor.png');

  // 右滑滑回
  await page.mouse.move(box.x - 90, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(650);
  check('右滑滑回你的候', (await state()).sel, beforeSwipe.sel);

  // 点空白收扇（舞台左上角无叶区）
  const sr = await page.evaluate(() => {
    const r = document.getElementById('fanStage').getBoundingClientRect();
    return { x: r.left + 10, y: r.top + 10 };
  });
  await page.mouse.click(sr.x, sr.y);
  await page.waitForTimeout(600);
  check('点空白收扇回扇面', (await state()).mode, 'fan');

  /* ---------- 5. 扇面态滑选：抬起被选叶但不抽出 ---------- */
  const sr2 = await page.evaluate(() => {
    const r = document.getElementById('fanStage').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const st0 = await state();
  await page.mouse.move(sr2.x + 90, sr2.y);
  await page.mouse.down();
  await page.mouse.move(sr2.x - 90, sr2.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(550);
  const st1 = await state();
  check('扇面态左滑选中下一候（不抽出）', st1.sel === st0.sel + 1 && st1.mode === 'fan', true);
  check('扇面态状态行提示已选邻候', (await page.textContent('#fanStatus')).startsWith('已选邻候 · '), true);
  check('被选叶抬起（transform 比邻叶高）', await page.evaluate(() => {
    const sel = document.querySelectorAll('.leaf')[4];
    const other = document.querySelectorAll('.leaf')[2];
    const y = (el) => parseFloat(el.style.transform.match(/,\s*(-?[\d.]+)px/)[1]);
    return y(sel) < y(other);
  }), true);

  /* ---------- 6. 跨年环 72→1→2 ---------- */
  await openFan(MY_72);
  const ring = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('.leaf')];
    const txt = leaves.map((el) => el.textContent);
    return {
      hids: leaves.map((el) => el.dataset.hou).join(','),
      nums: leaves.map((el) => el.querySelector('.face.front .hou-flag').textContent.match(/\d+ \/ 72/)[0].split(' ')[0]),
      names: leaves.map((el) => el.querySelector('.face.front .hou').textContent),
      jieqis: leaves.map((el) => el.querySelector('.face.front .jieqi').textContent),
      seasons: leaves.map((el) => el.querySelector('.card').className),
      bad: txt.filter((t) => /NaN|undefined|null/.test(t)).length,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
  });
  check('跨年环 69..72,1..3', ring.hids, '69,70,71,72,1,2,3');
  check('跨年候号连续', ring.nums.join(','), '69,70,71,72,1,2,3');
  check('跨年后 1 候是立春初候', ring.names[4] + ' / ' + ring.jieqis[4], '东风解冻 / 立春');
  check('跨年季节色跟着换（大寒冬→立春春）',
    ring.seasons[3] === 'card season-winter' && ring.seasons[4] === 'card season-spring', true);
  check('跨年无 NaN / undefined', ring.bad, 0);
  check('跨年 390 不横向滚动', ring.sw <= ring.cw, true);
  await page.evaluate(() => document.getElementById('fanArea').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(220);
  await shot('fan_crossyear.png');

  // 跨年在放大态滑到 1 候
  await page.click('.leaf.is-mine');
  await page.waitForTimeout(650);
  await page.mouse.move(280, 300);
  await page.mouse.down();
  await page.mouse.move(150, 300, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(650);
  const cy = await page.evaluate(() => ({
    sel: window.HouFan.state().sel,
    hou: document.querySelector('.leaf.is-zoom').dataset.hou,
    flag: document.querySelector('.leaf.is-zoom .face.front .hou-flag').textContent,
    status: document.getElementById('fanStatus').textContent,
  }));
  check('跨年滑到 1 候（72→1）', cy.hou, '1');
  check('1 候卡片不带 NaN', /NaN|undefined/.test(cy.flag + cy.status), false);

  /* ---------- 7. pending 两候（48/63）：诗位只写共创小字，其余照常 ---------- */
  await openFan(MY_48);
  await page.click('.leaf.is-mine');
  await page.waitForTimeout(650);
  await page.click('.leaf.is-zoom');
  await page.waitForTimeout(3300);
  const nul = await page.evaluate(() => {
    const L = document.querySelector('.leaf.is-zoom');
    const poem = L.querySelector('.bk-poem');
    return {
      ask: !!poem && poem.classList.contains('is-ask'),
      lines: poem ? [...poem.querySelectorAll('.ln')].map((n) => n.textContent) : [],
      txt: poem ? poem.textContent : '',
      note: poem ? (poem.querySelector('.hg-t') || {}).textContent : '',
      noteSrc: poem ? (poem.querySelector('.hg-s') || {}).textContent : '',
      noteBelow: poem ? (() => {
        const a = poem.querySelector('.ask-cols'), n = poem.querySelector('.houge');
        return !!(a && n && n.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1);
      })() : false,
      hasSrc: !!L.querySelector('.bk-poem .src'),
      on: !!poem && poem.classList.contains('is-on'),
      food: !!L.querySelector('.bk-food'),
      seal: !!L.querySelector('.bk-seal.is-on'),
      sealTxt: L.querySelector('.bk-seal').textContent,
      art: !!L.querySelector('.art-slot img'),
      artSrc: L.querySelector('.bk-art').getAttribute('src'),
      text: L.querySelector('.bk').textContent,
      flipped: L.classList.contains('is-flipped'),
    };
  });
  check('pending 诗位换成共创小字', nul.ask, true);
  check('pending 共创小字逐字（两行）', nul.lines.join('|'), '如有合适诗句，|欢迎留言共创');
  check('候 48 候歌小注逐字（繁体原样）', nul.note, '水始涸兮勢向東');
  check('候 48 候歌落款逐字', nul.noteSrc, '《十二月七十二候歌》');
  check('候 48 候歌小注排在共创小字下方', nul.noteBelow, true);
  const hg = await page.evaluate(() => {
    const v = window.HOU_VERSE, out = {};
    Object.keys(v).forEach((k) => {
      if (v[k].houge_text) out[k] = v[k].houge_text + '|' + (v[k].houge_src || '');
    });
    return out;
  });
  check('候歌小注只在 48 / 63 两张卡', Object.keys(hg).join(','), '48,63');
  check('候 63 候歌小注逐字（繁体原样）', hg['63'], '荔挺出時霜滿溪|《十二月七十二候歌》');
  check('pending 不冒充出处（无作者/篇名）', nul.hasSrc, false);
  check('pending 共创小字亮起', nul.on, true);
  check('pending 只空诗，食俗照常', nul.food, true);
  check('pending 印仍在', nul.seal, true);
  check('pending 印文 = 候名+印', nul.sealTxt, '水始涸印');
  check('pending 画作照常', nul.art && nul.artSrc === 'assets/art72/hou_48_shuishihe.webp', true);
  check('pending 背面无 undefined/NaN', /undefined|NaN/.test(nul.text), false);
  await shot('fan_back_null.png');

  /* ---------- 7b. 无诗的背面也能单独保存 ---------- */
  const nulBack = await saveAndSvg();
  check('pending 背面导出 780×1688', nulBack.w === 780 && nulBack.h === 1688, true);
  check('pending 背面导出含印文', nulBack.text.indexOf('水始涸印') !== -1, true);
  check('pending 背面导出带共创小字', nulBack.text.indexOf('欢迎留言共创') !== -1, true);
  check('pending 背面导出带候歌小注', nulBack.text.indexOf('水始涸兮勢向東') !== -1, true);
  check('pending 背面导出带候歌落款', nulBack.text.indexOf('《十二月七十二候歌》') !== -1, true);
  check('pending 背面导出没有诗注行', nulBack.svg.indexOf('class="src"') === -1, true);

  /* ---------- 7c. 锚点：候 59 四件套 / 候 66《小至》 ---------- */
  const ANCHORS = [
    ['2022-11-28', 59, '阴阳依上下，寒暑喜分离。', '咏廿四气诗', '小雪 · 腌菜、糍粑',
      'assets/art72/hou_59_tianqishangshengdiqixiajiang.webp'],
    ['2022-01-02', 66, '天时人事日相催，冬至阳生春又来。', '小至', '冬至 · 北饺南圆',
      'assets/art72/hou_66_shuiquandong.webp'],
  ];
  for (const [date, hou, poem, title, food, art] of ANCHORS) {
    await openFan([date, '12:00', '']);
    await page.click('.leaf.is-mine');
    await page.waitForTimeout(650);
    await page.click('.leaf.is-zoom');
    await page.waitForTimeout(3400);
    const a = await page.evaluate(() => {
      const L = document.querySelector('.leaf.is-zoom');
      const im = L.querySelector('.bk-art');
      return {
        hou: L.dataset.hou,
        poem: [...L.querySelectorAll('.bk-poem .ln')].map((n) => n.textContent).join(''),
        src: L.querySelector('.bk-poem .src').textContent,
        food: L.querySelector('.bk-food .t').textContent,
        seal: L.querySelector('.bk-seal').textContent,
        art: im.getAttribute('src'),
        artOn: im.classList.contains('is-on'),
      };
    });
    check(`候 ${hou} 抽出的是本候`, a.hou, String(hou));
    check(`候 ${hou} 诗原文`, a.poem, poem);
    check(`候 ${hou} 诗注含《${title}》`, a.src.includes(title), true);
    check(`候 ${hou} 食俗`, a.food, food);
    check(`候 ${hou} 印文以「印」收尾`, a.seal.length > 2 && a.seal.slice(-1) === '印', true);
    check(`候 ${hou} 四件套齐（图诗食印）`,
      !!(a.artOn && a.poem && a.food && a.seal), true);
    check(`候 ${hou} 图 = 本候文件名`, a.art, art);
  }

  /* ---------- 8. 你的候章：三个日期都在 ---------- */
  for (const c of [MY_10, MY_63, MY_72]) {
    await openFan(c);
    const b = await page.evaluate(() => {
      const mine = document.querySelector('.leaf.is-mine');
      return {
        txt: mine.querySelector('.leaf-badge').textContent,
        op: getComputedStyle(mine.querySelector('.leaf-badge')).opacity,
        hou: mine.dataset.hou,
      };
    });
    check(`${c[2]} 中心卡挂「你的候」`, b.txt === '你的候' && b.op === '1', true);
  }

  /* ---------- 9. 保留项：导出 / 单卡 / 皮肤 ---------- */
  await openFan(MY_10);
  await page.evaluate(() => {
    const orig = XMLSerializer.prototype.serializeToString;
    window.__origSer = orig;
    window.__svg = '';
    XMLSerializer.prototype.serializeToString = function (n) {
      const s = orig.call(this, n);
      if (!window.__svg && s.indexOf('<svg') === 0) window.__svg = s;
      return s;
    };
  });
  await page.click('#saveBtn');
  await page.waitForSelector('#lightbox:not([hidden])', { timeout: 10000 });
  const exp = await page.evaluate(() => {
    const im = document.getElementById('lbImg');
    return { ok: im.src.startsWith('data:image/png;base64'), w: im.naturalWidth, h: im.naturalHeight,
      fanStill: !document.getElementById('fanArea').hidden };
  });
  const svgChk = await page.evaluate(() => {
    XMLSerializer.prototype.serializeToString = window.__origSer;
    const s = window.__svg || '';
    return { songti: s.indexOf('Songti SC') !== -1, hasFont: s.indexOf('font-family') !== -1,
      w2x: s.indexOf('width="780"') !== -1 && s.indexOf('height="1688"') !== -1,
      vb: s.indexOf('viewBox="0 0 780 1688"') !== -1,
      mine: s.indexOf('你出生的那一候') !== -1,
      back: s.indexOf('孟浩然') !== -1 };
  });
  check('扇面态可直接导出 PNG', exp.ok, true);
  check('导出尺寸 780×1688', exp.w === 780 && exp.h === 1688, true);
  check('导出 SVG 继承卡片字体栈', svgChk.songti && svgChk.hasFont, true);
  /* Safari 的 foreignObject 不跟 viewBox 缩放，viewBox 必须和画布同比，靠内部 scale 放大 */
  check('导出 SVG 内建 2x（780×1688 / viewBox 同比）', svgChk.w2x && svgChk.vb, true);
  check('导出后仍停在扇面', exp.fanStill, true);
  check('扇面中心保存 = 你的候', svgChk.mine, true);
  check('未翻背时导出的仍是正面', svgChk.back, false);
  await shot('fan_export.png');
  await page.click('#lbClose');
  await page.waitForTimeout(200);

  /* ---------- 9a. 扇面切到邻候：保存的必须是邻候那张 ---------- */
  await openFan(MY_10);
  const fb = await page.evaluate(() => {
    const r = document.getElementById('fanStage').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(fb.x + 90, fb.y);
  await page.mouse.down();
  await page.mouse.move(fb.x - 90, fb.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(550);
  const nf = await page.evaluate(() => {
    const st = window.HouFan.state();
    const leaf = document.querySelectorAll('.fan .leaf')[st.sel];
    return { sel: st.sel, mode: st.mode, hou: leaf.dataset.hou,
      flag: leaf.querySelector('.hou-flag').textContent,
      kicker: leaf.querySelector('.kicker').textContent };
  });
  const nbExp = await saveAndSvg();
  check('扇面切邻候后仍停在扇面', nf.mode, 'fan');
  check('切邻候后导出的是那一候（候号条对上）', nbExp.svg.indexOf(nf.flag) !== -1, true);
  check('切邻候后导出的是那一候（日期条换成邻候说明）', nbExp.svg.indexOf(nf.kicker) !== -1, true);
  check('切邻候后不再导「你的候」那张', nbExp.svg.indexOf('你出生的那一候') === -1, true);
  check('切邻候后导的仍是正面', nbExp.svg.indexOf('孟浩然') === -1, true);
  check('切邻候导出 780×1688', nbExp.w === 780 && nbExp.h === 1688, true);

  /* ---------- 9b. 翻背态保存 = 背面 ---------- */
  await openFan(MY_10);
  await page.click('.leaf.is-mine');
  await page.waitForTimeout(450);
  await page.click('.leaf.is-zoom');
  await page.waitForTimeout(2900);
  check('已进入翻背态', await page.evaluate(() => window.HouFan.state().flipped), true);
  const backExp = await saveAndSvg();
  check('翻背态导出 780×1688', backExp.w === 780 && backExp.h === 1688, true);
  check('翻背态导的是背面（有题注）', backExp.svg.indexOf('孟浩然') !== -1, true);
  check('背面导出含诗行', backExp.svg.indexOf('春眠不觉晓') !== -1, true);
  check('背面导出含食签', backExp.svg.indexOf('春分 · 立蛋') !== -1, true);
  check('背面导出含印章', backExp.text.indexOf('玄鸟至印') !== -1, true);
  check('背面导出不带正面内容', backExp.svg.indexOf('你出生的那一候') === -1, true);
  /* Safari 的 foreignObject 里，竖排题注不禁换行会被折成阶梯多列（iPhone 实机导出复现） */
  check('题注竖排禁换行', await page.evaluate(() => getComputedStyle(
    document.querySelector('.leaf.is-zoom .bk-poem .src')).whiteSpace), 'nowrap');
  const afterBack = await page.evaluate(() => ({
    st: window.HouFan.state(),
    shotKids: document.getElementById('backShot').childNodes.length,
    stillFlipped: !!document.querySelector('.leaf.is-zoom.is-flipped'),
  }));
  check('导出后仍停在背面', afterBack.st.flipped === true && afterBack.st.mode === 'zoom', true);
  check('导出后叶子仍是翻背态', afterBack.stillFlipped, true);
  check('导出后离屏容器清空', afterBack.shotKids, 0);
  await shot('fan_back_export.png');
  await page.evaluate(() => window.HouFan.collapse());
  await page.waitForTimeout(450);

  await page.click('#toSingle');
  await page.waitForTimeout(400);
  const single = await page.evaluate(() => ({
    fanHidden: document.getElementById('fanArea').hidden,
    singleShown: !document.getElementById('singleArea').hidden,
    card: document.getElementById('card').getBoundingClientRect().width,
    jieqi: document.getElementById('jieqiName').textContent,
    hou: document.getElementById('houName').textContent,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  check('「只看我的卡」进入单卡', single.fanHidden && single.singleShown, true);
  check('单卡宽 390', Math.round(single.card), 390);
  check('单卡内容 = 你的候', single.jieqi + '/' + single.hou, '春分/玄鸟至');
  check('单卡 390 不横向滚动', single.sw <= single.cw, true);
  await shot('single_card.png');
  await page.click('#toFan');
  await page.waitForTimeout(400);
  check('「回到扇面」可返回', await page.evaluate(() => !document.getElementById('fanArea').hidden), true);

  await page.click('#skinPaper');
  await page.waitForTimeout(500);
  const paper = await page.evaluate(() => {
    const st = document.getElementById('fanStage');
    const card = document.querySelector('.leaf.is-mine .face.front .card');
    const badge = document.querySelector('.leaf.is-mine .leaf-badge');
    return {
      stageCls: st.className,
      cardCls: card.className,
      badgeBg: getComputedStyle(badge).backgroundColor,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
  });
  check('宣纸皮肤作用到扇面', paper.stageCls.includes('paper') && paper.cardCls.includes('skin-paper'), true);
  check('宣纸下印章底色转纸色', paper.badgeBg.replace(/\s/g, ''), 'rgba(243,236,219,0.9)');
  check('宣纸 390 不横向滚动', paper.sw <= paper.cw, true);
  await page.evaluate(() => document.getElementById('fanArea').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(220);
  await shot('fan_skin_paper.png');
  await page.click('#skinInk');
  await page.waitForTimeout(400);

  /* ---------- 10. 减少动态：三件套立刻到位 ---------- */
  const calm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await calm.goto(URL, { waitUntil: 'load' });
  await calm.click('#pickDark');
  await calm.waitForSelector('#gate', { state: 'hidden' });
  await calm.fill('#birthDate', MY_10[0]);
  await calm.fill('#birthTime', MY_10[1]);
  await calm.click('button[type=submit]');
  await calm.waitForSelector('#result:not([hidden])');
  await calm.waitForTimeout(300);
  await calm.click('.leaf.is-mine');
  await calm.waitForTimeout(300);
  await calm.click('.leaf.is-zoom');
  await calm.waitForTimeout(120);
  check('减少动态时三件套即刻出现', await calm.evaluate(() => {
    const L = document.querySelector('.leaf.is-zoom');
    return !!L.querySelector('.bk-poem.is-on') && !!L.querySelector('.bk-food.is-on') &&
      !!L.querySelector('.bk-seal.is-on');
  }), true);
  await calm.close();

  console.log('\nJS 错误数：' + errors.length);
  errors.forEach((e) => console.log('  ' + e));
  if (errors.length) bad++;

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL PASS' : `\nRESULT: FAIL (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

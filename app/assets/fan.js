/*
 * 扇面摊牌 + 翻背三件套（诗 / 食 / 印）。
 * 只读 window.HOU_DATA 与 window.HOU_VERSE，不发请求、不写存储。
 */
(function (root) {
  'use strict';

  var ROWS = root.HOU_DATA.hou72;
  var BY_HOU = {};
  for (var i = 0; i < ROWS.length; i++) BY_HOU[ROWS[i].hou] = ROWS[i];

  var VERSE = root.HOU_VERSE || {};
  var ORDER = ['初候', '二候', '三候'];
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var NEW_FACE = /[，。；]/;

  var HALF = 3;
  var S_FAN = 0.31, S_ZOOM = 0.70, S_BACK = 0.30, CARD_H = 844;
  var DX = 34, ARC = 14, STEP_DEG = 3.8, LIFT = 0, ORIGIN_Y = 0.9;
  var SWIPE_MIN = 40;

  var stageEl = document.getElementById('fanStage');
  var fanEl = document.getElementById('fan');
  var statusEl = document.getElementById('fanStatus');
  var hintEl = document.getElementById('fanHint');

  var state = { center: 0, sel: HALF, mode: 'fan', flipped: false, hou: [] };
  var leaves = [];
  var skin = 'ink';
  var timers = [];
  var suppressUntil = 0;
  var pointer = null;

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function houJieqi(hou) { return Math.floor((hou - 1) / 3) + 1; }
  function houOrder(hou) { return ((hou - 1) % 3) + 1; }
  function seasonOf(jq) { return SEASONS[Math.min(3, Math.floor((jq - 1) / 6))]; }
  function wrapHou(n) { return ((n - 1) % 72 + 72) % 72 + 1; }
  function prefersReduce() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function houFont(n) {
    if (n <= 4) return 40;
    if (n === 5) return 34;
    if (n === 6) return 30;
    if (n === 7) return 26;
    if (n === 8) return 24;
    return 21;
  }

  /* ---------- 正面：与单卡同模板 ---------- */

  function buildFront(row, hou, dateText, mine) {
    var jq = houJieqi(hou), ord = houOrder(hou);
    var card = h('div', 'card season-' + seasonOf(jq) + (skin === 'paper' ? ' skin-paper' : ''));

    var head = h('div', 'head');
    head.appendChild(h('div', 'eyebrow', mine ? '你出生的那一候' : '七十二候 · 候卡'));
    head.appendChild(h('div', 'rule'));
    card.appendChild(head);

    var jw = h('div', 'jieqi-wrap');
    jw.appendChild(h('div', 'layer-tag', '节气 · ' + jq + ' / 24'));
    jw.appendChild(h('div', 'jieqi', row.jieqi));
    card.appendChild(jw);

    var hw = h('div', 'hou-wrap');
    hw.appendChild(h('div', 'hou-flag',
      (mine ? '你的候 · ' : '候 · ') + hou + ' / 72 · ' + ORDER[ord - 1]));
    var hn = h('div', 'hou', row.name_modern);
    hn.style.fontSize = houFont(row.name_modern.length) + 'px';
    hw.appendChild(hn);
    hw.appendChild(h('div', 'kicker', dateText));
    card.appendChild(hw);

    var parts = row.modern.split(NEW_FACE).filter(function (s) { return s.length > 0; });
    if (!parts.length) parts = [row.modern];
    var lines = h('div', 'lines');
    for (var i = 0; i < parts.length; i++) lines.appendChild(h('div', null, parts[i]));
    card.appendChild(lines);

    var mo = h('div', 'motif-row');
    mo.appendChild(document.createTextNode('意象 · '));
    row.motif.all.forEach(function (tag, idx) {
      if (idx) mo.appendChild(document.createTextNode(' · '));
      mo.appendChild(h('span', tag === row.motif.primary ? 'hl' : '', tag));
    });
    card.appendChild(mo);

    var lad = h('div', 'ladder');
    lad.appendChild(h('div', 'cap', row.jieqi + '三候'));
    var base = (jq - 1) * 3;
    for (var k = 0; k < 3; k++) {
      var mate = BY_HOU[base + k + 1];
      var r = h('div', 'row' + (k === ord - 1 ? ' on' : ''));
      r.appendChild(h('span', 'seq', ORDER[k]));
      r.appendChild(h('span', 'nm', mate ? mate.name_modern : ''));
      lad.appendChild(r);
    }
    card.appendChild(lad);

    var fam = ROWS.filter(function (x) {
      return x.hou !== row.hou && x.motif.primary === row.motif.primary;
    });
    var ser = h('div', 'series');
    if (!fam.length) {
      ser.hidden = true;
    } else if (fam.length <= 3) {
      ser.textContent = '同象：' + fam.map(function (x) { return x.name_modern; }).join(' · ');
    } else {
      ser.textContent = '同象：' + row.motif.primary + '系 · 共 ' + (fam.length + 1) + ' 候';
    }
    card.appendChild(ser);

    var foot = h('div', 'foot');
    foot.appendChild(h('div', 'brand', '七十二候 · 历法身份卡'));
    foot.appendChild(h('div', 'caliber', '候界按太阳黄经实算，与历书标注相差一天属分法不同'));
    foot.appendChild(h('div', 'disclaimer', '本工具只讲解历法与物候规则，不构成任何建议'));
    card.appendChild(foot);

    return card;
  }

  /* ---------- 背面：空画槽 + 诗 + 食 + 印 ---------- */

  /* 候 48 / 63 诗库无可靠出处：诗位留给读者，不拿别候的诗凑。
     有候歌可引的，小注排在共创小字下方，出处另起一行更小字。 */
  function buildAsk(v) {
    var ask = h('div', 'bk-poem is-ask');
    var cols = h('div', 'ask-cols');
    cols.appendChild(h('div', 'ln', '如有合适诗句，'));
    cols.appendChild(h('div', 'ln', '欢迎留言共创'));
    ask.appendChild(cols);
    if (v && v.houge_text) {
      ask.classList.add('has-houge');
      var note = h('div', 'houge');
      note.appendChild(h('div', 'hg-t', v.houge_text));
      if (v.houge_src) note.appendChild(h('div', 'hg-s', v.houge_src));
      ask.appendChild(note);
    }
    return ask;
  }

  function buildSeal(name) {
    var box = h('div', 'bk-seal');
    var grid = h('div', 'seal-grid');
    /* 印文 = 候名 + 「印」；短名单列直排，长名分列（右起），字随行数缩，保证不出框 */
    var chars = (name + '印').split('');
    var cols = chars.length <= 5 ? 1 : (chars.length <= 8 ? 2 : 3);
    var rows = Math.ceil(chars.length / cols);
    var fs = Math.min(16, Math.floor(58 / rows));
    var idx = 0;
    for (var c = 0; c < cols; c++) {
      var take = Math.min(rows, chars.length - idx);
      var col = h('div', 'seal-col');
      col.style.width = fs + 'px';
      for (var r = 0; r < take; r++) {
        var t = h('span', null, chars[idx + r]);
        t.style.fontSize = fs + 'px';
        col.appendChild(t);
      }
      idx += take;
      grid.appendChild(col);
    }
    box.appendChild(grid);
    return box;
  }

  function buildBack(row) {
    var bk = h('div', 'bk');
    var band = h('div', 'art-band');
    var slot = h('div', 'art-slot');
    var art = h('img', 'bk-art');
    art.alt = '';
    art.setAttribute('aria-hidden', 'true');
    art.setAttribute('data-hou', String(row.hou));
    slot.appendChild(art);
    band.appendChild(slot);
    bk.appendChild(band);

    var v = VERSE[String(row.hou)] || null;
    if (v && v.poem_text && v.poem_text.length) {
      var poem = h('div', 'bk-poem');
      for (var i = 0; i < v.poem_text.length; i++) {
        poem.appendChild(h('div', 'ln', v.poem_text[i]));
      }
      var src = (v.poem_title ? '《' + v.poem_title + '》' : '') +
        (v.poem_author ? '· ' + v.poem_author : '');
      if (src) poem.appendChild(h('div', 'src', src));
      bk.appendChild(poem);
    } else {
      bk.appendChild(buildAsk(v));
    }
    if (v && v.food_note) {
      var food = h('div', 'bk-food');
      food.appendChild(h('div', 't', v.food_note));
      food.appendChild(h('div', 's', v.food_src || '四时之食俗，依地域有异'));
      bk.appendChild(food);
    }
    bk.appendChild(buildSeal(row.name_modern));
    return bk;
  }

  /* 画片占满 346×461 顶到 22，剩下一段留给诗：诗块在画片下沿与食俗行之间居中。
     放不下就按比例缩字号，最多收敛四轮；题注、候歌小注一起缩——长标题（如《六月二十七日望湖楼醉书五首》）
     竖排折成两列后，块高由题注决定，只缩诗行没有用。 */
  function layoutBack(bk) {
    var poem = bk.querySelector('.bk-poem');
    var food = bk.querySelector('.bk-food');
    var seal = bk.querySelector('.bk-seal');
    if (!poem) return;
    var lines = poem.querySelectorAll('.ln');
    if (!lines.length) return;

    var isAsk = poem.classList.contains('is-ask');
    var maxChars = 0;
    for (var i = 0; i < lines.length; i++) {
      maxChars = Math.max(maxChars, lines[i].textContent.length);
    }
    var ps = isAsk ? 16 : Math.max(19, Math.min(26, 200 / (maxChars * 1.22)));
    for (i = 0; i < lines.length; i++) lines[i].style.fontSize = ps + 'px';

    var rowH = 72, bottom = 30, artBottom = 483;
    var rowTop = 844 - bottom - rowH;
    var fh = food ? food.offsetHeight : 0;
    var foodTop = rowTop + (rowH - fh) / 2;
    if (food) food.style.top = foodTop + 'px';
    if (seal) seal.style.top = rowTop + 'px';

    var safeTop = artBottom + 20;
    var safeBottom = Math.min(foodTop, rowTop) - 10;
    var avail = safeBottom - safeTop;

    var src = poem.querySelector('.src');
    var srcPs0 = src ? parseFloat(getComputedStyle(src).fontSize) : 0;
    var hgT = poem.querySelector('.hg-t');
    var hgS = poem.querySelector('.hg-s');
    /* 先清掉上一轮的行内字号，免得重复落位时按已缩小的值再缩一次 */
    if (hgT) { hgT.style.fontSize = ''; }
    if (hgS) { hgS.style.fontSize = ''; }
    var hgT0 = hgT ? parseFloat(getComputedStyle(hgT).fontSize) : 0;
    var hgS0 = hgS ? parseFloat(getComputedStyle(hgS).fontSize) : 0;
    var ps2 = ps;
    for (i = 0; i < 4; i++) {
      var k = ps2 / ps;
      for (var j = 0; j < lines.length; j++) lines[j].style.fontSize = ps2 + 'px';
      if (src) src.style.fontSize = Math.max(8.5, srcPs0 * k) + 'px';
      if (hgT) hgT.style.fontSize = Math.max(12, hgT0 * k) + 'px';
      if (hgS) hgS.style.fontSize = Math.max(8, hgS0 * k) + 'px';
      var hh = poem.offsetHeight;
      if (hh <= avail) break;
      ps2 = Math.max(15, Math.floor(ps2 * avail / hh * 10) / 10);
    }

    var H = poem.offsetHeight;
    poem.style.top = (safeTop + Math.max(0, (avail - H) / 2)) + 'px';
  }

  /* ---------- 扇叶 ---------- */

  function buildLeaf(hou, mine, dateText) {
    var row = BY_HOU[hou];
    var leaf = h('button', 'leaf' + (mine ? ' is-mine' : ''));
    leaf.type = 'button';
    leaf.setAttribute('data-hou', String(hou));
    leaf.setAttribute('aria-label',
      row.name_modern + ' · 第 ' + hou + ' 候' + (mine ? ' · 你的候' : ''));

    var box = h('div', 'leaf-3d');
    var front = h('div', 'face front');
    front.appendChild(buildFront(row, hou, dateText, mine));
    var back = h('div', 'face back');
    back.appendChild(buildBack(row));
    box.appendChild(front);
    box.appendChild(back);
    leaf.appendChild(box);
    leaf.appendChild(h('div', 'leaf-badge', mine ? '你的候' : '邻候'));
    return leaf;
  }

  function buildRing(centerHou, dateText) {
    fanEl.textContent = '';
    leaves = [];
    state.hou = [];
    for (var k = -HALF; k <= HALF; k++) {
      var hou = wrapHou(centerHou + k);
      var mine = hou === centerHou;
      var txt = mine ? dateText : '邻候 · 与你相距 ' + Math.abs(k) + ' 候';
      var el = buildLeaf(hou, mine, txt);
      var idx = k + HALF;
      el.addEventListener('click', (function (i) {
        return function () { onClick(i); };
      })(idx));
      leaves.push({ el: el, hou: hou, mine: mine, k: k });
      state.hou.push(hou);
      fanEl.appendChild(el);
    }
    for (var i = 0; i < leaves.length; i++) layoutBack(leaves[i].el.querySelector('.bk'));
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        for (var j = 0; j < leaves.length; j++) layoutBack(leaves[j].el.querySelector('.bk'));
      });
    }
  }

  /* ---------- 几何 ---------- */

  function baseY(s) { return -ORIGIN_Y * CARD_H * (1 - s); }

  function fanT(k, lift) {
    var dx = k * DX;
    var dy = Math.abs(k) * ARC + (k === 0 ? LIFT : 0) + (lift || 0);
    return 'translate(' + dx + 'px,' + (baseY(S_FAN) + dy) + 'px) rotate(' +
      (k * STEP_DEG) + 'deg) scale(' + S_FAN + ')';
  }

  function zoomT() {
    return 'translate(0px,' + baseY(S_ZOOM) + 'px) rotate(0deg) scale(' + S_ZOOM + ')';
  }

  function recedeT(k) {
    var dir = k < 0 ? -1 : 1;
    var dx = k * DX + dir * 86;
    var dy = 46 + Math.abs(k) * 20;
    return 'translate(' + dx + 'px,' + (baseY(S_BACK) + dy) + 'px) rotate(' +
      (k * 7) + 'deg) scale(' + S_BACK + ')';
  }

  /* 旋转 + 缩放后卡片相对舞台顶的上下边界（解析算，不等过渡结束再量） */
  function boundsY(k, s, dy) {
    var th = k * STEP_DEG * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
    var oy = ORIGIN_Y * CARD_H;
    var pts = [[0, 0], [390, 0], [390, CARD_H], [0, CARD_H]];
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < 4; i++) {
      var x = pts[i][0] - 195, y = pts[i][1] - oy;
      var Y = s * (x * sn + y * c) + oy + dy;
      if (Y < lo) lo = Y;
      if (Y > hi) hi = Y;
    }
    return { top: lo, bottom: hi };
  }

  function layout() {
    if (!leaves.length) return;
    var zoomed = state.mode === 'zoom';
    var s = zoomed ? S_ZOOM : S_FAN;
    stageEl.style.setProperty('--inv', (1 / s).toFixed(4));
    stageEl.style.height = Math.round(CARD_H * s) + 'px';
    if (!zoomed) {
      var hMax = 0;
      for (var j = 0; j < leaves.length; j++) {
        var kj = leaves[j].k;
        var bh = boundsY(kj, S_FAN, baseY(S_FAN) + Math.abs(kj) * ARC + (kj === 0 ? LIFT : 0)).bottom;
        if (bh > hMax) hMax = bh;
      }
      stageEl.style.height = Math.ceil(hMax + 6) + 'px';
    }
    stageEl.className = 'fan-stage' + (skin === 'paper' ? ' paper' : '') +
      (zoomed ? ' is-zoom' : '');

    for (var i = 0; i < leaves.length; i++) {
      var L = leaves[i], el = L.el;
      el.classList.remove('is-dim', 'is-zoom', 'is-near');
      if (zoomed) {
        if (i === state.sel) {
          el.style.transform = zoomT();
          el.style.zIndex = '40';
          el.classList.add('is-zoom');
          if (!L.mine) el.classList.add('is-near');
        } else {
          el.style.transform = recedeT(L.k);
          el.style.zIndex = String(1 + (HALF - Math.abs(L.k)));
          el.classList.add('is-dim');
        }
      } else {
        el.style.transform = fanT(L.k, i === state.sel && !L.mine ? -12 : 0);
        el.style.zIndex = String(10 + (i === state.sel ? 6 : 0) + (HALF - Math.abs(L.k)));
      }
    }
    fillArt(leaves[state.sel]);
    updateStatus();
    updateHint();
  }

  /* 图按候懒加载：只为当前选中的叶子取，其余扇叶等被选中再取 */
  function fillArt(L) {
    if (!L || !root.HouArt) return Promise.resolve(null);
    var img = L.el.querySelector('.bk-art');
    if (!img) return Promise.resolve(null);
    if (img.getAttribute('src')) return Promise.resolve(img);
    return root.HouArt.load(L.hou).then(function (loaded) {
      if (img.isConnected && !img.getAttribute('src')) {
        var box = (root.HOU_ART_BOX || {})[String(L.hou)];
        var slot = img.parentNode;
        if (box && slot) {
          slot.style.setProperty('--aw', box[0] + 'px');
          slot.style.setProperty('--ah', box[1] + 'px');
          img.style.setProperty('--iw', box[2] + '%');
          img.style.setProperty('--ih', box[3] + '%');
          img.style.setProperty('--il', box[4] + '%');
          img.style.setProperty('--it', box[5] + '%');
        }
        img.src = loaded.getAttribute('src');
        L.el.setAttribute('data-art-ready', '1');
      }
      return img;
    })['catch'](function () { return null; });
  }

  /* ---------- 文案 ---------- */

  function clearChildren(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function updateStatus() {
    var mine = BY_HOU[state.center];
    var mineText = mine.jieqi + ORDER[houOrder(state.center) - 1] + ' · ' + mine.name_modern;
    var cur = leaves[state.sel];
    var curRow = BY_HOU[cur.hou];
    var curText = curRow.jieqi + ORDER[houOrder(cur.hou) - 1] + ' · ' + curRow.name_modern;

    clearChildren(statusEl);
    if (state.mode === 'fan') {
      if (state.sel === HALF) {
        statusEl.appendChild(document.createTextNode('你的候 · ' + mineText.split(' · ')[0] + ' · '));
      } else {
        statusEl.appendChild(document.createTextNode('已选邻候 · ' + curText + '（点它抽出）'));
        return;
      }
    } else if (state.sel === HALF) {
      statusEl.appendChild(document.createTextNode('正在看 · 你的候 · ' + mineText.split(' · ')[0] + ' · '));
    } else {
      statusEl.appendChild(document.createTextNode('正在看 · 邻候 · ' + curText + ' · 你的候仍是 '));
      statusEl.appendChild(h('b', null, mine.name_modern));
      return;
    }
    statusEl.appendChild(h('b', null, mine.name_modern));
  }

  function updateHint() {
    hintEl.textContent = state.mode === 'zoom'
      ? '再点卡片翻背 · 左右滑换候 · 点空白收扇'
      : '点扇叶抽出 · 左右滑换候';
  }

  /* ---------- 翻背 ---------- */

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }

  function resetFlip(el) {
    clearTimers();
    if (el) {
      el.classList.remove('is-flipped');
      var on = el.querySelectorAll('.is-on');
      for (var i = 0; i < on.length; i++) on[i].classList.remove('is-on');
    }
    state.flipped = false;
  }

  function flip(L) {
    var el = L.el;
    clearTimers();
    el.classList.add('is-flipped');
    var art = el.querySelector('.bk-art');
    var poem = el.querySelector('.bk-poem');
    var food = el.querySelector('.bk-food');
    var seal = el.querySelector('.bk-seal');
    fillArt(L);

    if (prefersReduce()) {
      if (art) art.classList.add('is-on');
      if (poem) poem.classList.add('is-on');
      if (food) food.classList.add('is-on');
      if (seal) seal.classList.add('is-on');
      return;
    }

    /* 图先随卡面转出来（此刻正好转过 90°），诗随后一行行落，最后吃与印 */
    if (art) {
      (function (a) {
        timers.push(setTimeout(function () { a.classList.add('is-on'); }, 260));
      })(art);
    }
    var t = 700;
    if (poem) {
      var lines = poem.querySelectorAll('.ln');
      for (var i = 0; i < lines.length; i++) {
        lines[i].style.transitionDelay = (i * 0.26) + 's';
      }
      var src = poem.querySelector('.src');
      if (src) src.style.transitionDelay = (lines.length * 0.26) + 's';
      (function (p) {
        timers.push(setTimeout(function () { p.classList.add('is-on'); }, t));
      })(poem);
      t += lines.length * 260 + 60 + (src ? 240 : 0);
    }
    if (food) {
      (function (f) {
        timers.push(setTimeout(function () { f.classList.add('is-on'); }, t));
      })(food);
      t += 420;
    }
    if (seal) {
      (function (s) {
        timers.push(setTimeout(function () { s.classList.add('is-on'); }, t));
      })(seal);
      t += 440;
    }
    timers.push(setTimeout(updateStatus, t));
  }

  /* ---------- 交互 ---------- */

  function onClick(i) {
    if (Date.now() < suppressUntil) return;
    if (state.mode === 'fan') {
      state.sel = i;
      state.mode = 'zoom';
      resetFlip(leaves[i].el);
      layout();
      return;
    }
    if (i !== state.sel) {
      resetFlip(leaves[state.sel].el);
      state.sel = i;
      layout();
      return;
    }
    state.flipped = !state.flipped;
    if (state.flipped) flip(leaves[i]);
    else resetFlip(leaves[i].el);
  }

  function step(dir) {
    var next = state.sel + dir;
    if (next < 0 || next >= leaves.length) return;
    var cur = leaves[state.sel];
    if (cur) resetFlip(cur.el);
    state.sel = next;
    layout();
  }

  function collapse() {
    if (state.mode !== 'zoom') return;
    var cur = leaves[state.sel];
    if (cur) resetFlip(cur.el);
    state.mode = 'fan';
    state.sel = HALF;
    layout();
  }

  stageEl.addEventListener('pointerdown', function (e) {
    if (!leaves.length) return;
    pointer = { x: e.clientX, y: e.clientY };
  });
  stageEl.addEventListener('pointerup', function (e) {
    if (!pointer) return;
    var dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer = null;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    suppressUntil = Date.now() + 400;
    step(dx < 0 ? 1 : -1);
  });
  stageEl.addEventListener('pointercancel', function () { pointer = null; });
  stageEl.addEventListener('click', function (e) {
    if (e.target === stageEl || e.target === fanEl) collapse();
  });
  stageEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Escape') { collapse(); }
  });

  /* ---------- 对外 ---------- */

  function show(row, loc, dateText) {
    clearTimers();
    state.center = row.hou;
    state.sel = HALF;
    state.mode = 'fan';
    state.flipped = false;
    buildRing(row.hou, dateText);
    layout();
  }

  function paint(name) {
    skin = name === 'paper' ? 'paper' : 'ink';
    for (var i = 0; i < leaves.length; i++) {
      var L = leaves[i];
      var card = L.el.querySelector('.face.front .card');
      if (!card) continue;
      card.className = 'card season-' + seasonOf(houJieqi(L.hou)) +
        (skin === 'paper' ? ' skin-paper' : '');
    }
    layout();
  }

  /* 当前停在背面时，导出的是这张背面而不是正面 */
  function isFlipped() {
    return state.mode === 'zoom' && state.flipped;
  }

  /* 正面导出跟着当前选中的叶子走：扇面滑到邻候后存的就该是邻候那张 */
  function frontNode() {
    var L = leaves[state.sel];
    return L ? L.el.querySelector('.face.front .card') : null;
  }

  /* 返回 .bk 而不是 .face：.face 的绝对定位写在 `.leaf .face` 下，
     脱离 .leaf 后这层会塌成 0 高，导出时整张空白。 */
  function backNode() {
    var L = leaves[state.sel];
    return L ? L.el.querySelector('.face.back .bk') : null;
  }

  /* 导出前确保当前叶的卡背图已解码（未翻过背时也要有图） */
  function ensureArt() {
    return fillArt(leaves[state.sel]);
  }

  root.HouFan = {
    show: show,
    paint: paint,
    collapse: collapse,
    isFlipped: isFlipped,
    frontNode: frontNode,
    backNode: backNode,
    ensureArt: ensureArt,
    state: function () {
      return {
        mode: state.mode, sel: state.sel, flipped: state.flipped,
        center: state.center, hou: state.hou.slice()
      };
    }
  };
})(window);

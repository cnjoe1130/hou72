(function () {
  'use strict';

  var TERMS = window.HOU_TERMS;
  var ROWS = window.HOU_DATA.hou72;
  var BY_HOU = {};
  for (var i = 0; i < ROWS.length; i++) BY_HOU[ROWS[i].hou] = ROWS[i];

  var ORDER_LABEL = ['初候', '二候', '三候'];
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var NEW_FACE = /[，。；]/;
  var season = '';
  var skin = 'ink';

  function $(id) { return document.getElementById(id); }
  var form = $('form'), dateEl = $('birthDate'), timeEl = $('birthTime');
  var msgEl = $('msg'), result = $('result'), stage = $('stage'), scaler = $('scaler');
  var card = $('card'), saveBtn = $('saveBtn');
  var lightbox = $('lightbox'), lbImg = $('lbImg'), lbClose = $('lbClose');

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function setMsg(text) { msgEl.textContent = text || ''; }

  function fit() {
    var wrap = document.querySelector('.stage-wrap');
    var avail = wrap.clientWidth;
    if (!avail) return;
    var s = Math.min(1, avail / 390);
    scaler.style.transform = 'scale(' + s + ')';
    stage.style.width = Math.round(390 * s) + 'px';
    stage.style.height = Math.round(844 * s) + 'px';
  }

  function houFontSize(n) {
    if (n <= 4) return 40;
    if (n === 5) return 34;
    if (n === 6) return 30;
    if (n === 7) return 26;
    if (n === 8) return 24;
    return 21;
  }

  function renderModern(text) {
    var box = $('modern');
    box.textContent = '';
    var parts = text.split(NEW_FACE).filter(function (s) { return s.length > 0; });
    if (!parts.length) parts = [text];
    parts.forEach(function (line) {
      var div = document.createElement('div');
      div.textContent = line;
      box.appendChild(div);
    });
  }

  function renderMotifs(row) {
    var box = $('motifRow');
    box.textContent = '';
    box.appendChild(document.createTextNode('意象 · '));
    row.motif.all.forEach(function (tag, idx) {
      if (idx) box.appendChild(document.createTextNode(' · '));
      var span = document.createElement('span');
      span.textContent = tag;
      if (tag === row.motif.primary) span.className = 'hl';
      box.appendChild(span);
    });
  }

  function renderLadder(row, loc) {
    var base = (loc.jieqiIndex - 1) * 3;
    $('ladderCap').textContent = row.jieqi + '三候';
    var rows = $('ladder').querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) {
      var mate = BY_HOU[base + i + 1];
      rows[i].className = 'row' + (i === loc.order - 1 ? ' on' : '');
      rows[i].querySelector('.nm').textContent = mate ? mate.name_modern : '';
    }
  }

  function renderSeries(row) {
    var box = $('series');
    var fam = ROWS.filter(function (r) {
      return r.hou !== row.hou && r.motif.primary === row.motif.primary;
    }).sort(function (a, b) { return a.hou - b.hou; });

    if (!fam.length) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    if (fam.length <= 3) {
      box.textContent = '同象：' + fam.map(function (r) { return r.name_modern; }).join(' · ');
    } else {
      box.textContent = '同象：' + row.motif.primary + '系 · 共 ' + (fam.length + 1) + ' 候';
    }
  }

  function paintCard() {
    card.className = 'card' + (season ? ' season-' + season : '') +
      (skin === 'paper' ? ' skin-paper' : '');
  }

  function showFor(y, m, d, hh, mi) {
    var loc = window.HouLookup.locate(TERMS, y, m, d, hh, mi);
    if (!loc.ok) {
      result.hidden = true;
      setMsg(loc.reason === 'range'
        ? '表覆盖 1900-2050，其他年份暂不支持'
        : '该日期无法定位候');
      return false;
    }

    var row = BY_HOU[loc.hou];
    if (!row) {
      result.hidden = true;
      setMsg('该日期无法定位候');
      return false;
    }

    setMsg('');
    render(row, loc, y, m, d, hh, mi);
    showResult();
    return true;
  }

  function render(row, loc, y, m, d, hh, mi) {
    season = SEASONS[Math.min(3, Math.floor((loc.jieqiIndex - 1) / 6))];
    paintCard();
    $('jieqiTag').textContent = '节气 · ' + loc.jieqiIndex + ' / 24';
    $('jieqiName').textContent = row.jieqi;
    $('houFlag').textContent = '你的候 · ' + row.hou + ' / 72 · ' + ORDER_LABEL[loc.order - 1];

    var nameEl = $('houName');
    nameEl.textContent = row.name_modern;
    nameEl.style.fontSize = houFontSize(row.name_modern.length) + 'px';

    $('kicker').textContent = y + ' 年 ' + m + ' 月 ' + d + ' 日 · ' + pad(hh) + ':' + pad(mi);

    renderModern(row.modern);
    renderMotifs(row);
    renderLadder(row, loc);
    renderSeries(row);
  }

  function showResult() {
    result.hidden = false;
    fit();
    result.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var dv = dateEl.value;
    var tv = timeEl.value || '12:00';
    if (!dv) {
      result.hidden = true;
      setMsg('请先选择生日');
      return;
    }
    var p = dv.split('-'), t = tv.split(':');
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
    var hh = parseInt(t[0], 10), mi = parseInt(t[1], 10);
    if (!y || !m || !d || isNaN(hh) || isNaN(mi)) {
      result.hidden = true;
      setMsg('日期格式无法识别');
      return;
    }

    setMsg('');
    showFor(y, m, d, hh, mi);
  });

  function beijingNow() {
    var now = new Date();
    var t = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 8 * 3600000);
    return {
      y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(),
      hh: t.getHours(), mi: t.getMinutes()
    };
  }

  $('todayBtn').addEventListener('click', function () {
    var t = beijingNow();
    dateEl.value = t.y + '-' + pad(t.m) + '-' + pad(t.d);
    timeEl.value = pad(t.hh) + ':' + pad(t.mi);
    if (showFor(t.y, t.m, t.d, t.hh, t.mi)) {
      setMsg('今天 · ' + t.y + '-' + pad(t.m) + '-' + pad(t.d) + ' ' +
        pad(t.hh) + ':' + pad(t.mi) + ' · 按北京时间');
    }
  });

  saveBtn.addEventListener('click', function () {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    setMsg('');
    window.Capture.toPng(card, 2).then(function (url) {
      lbImg.src = url;
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
    })['catch'](function () {
      setMsg('当前环境不支持导出图片，请用系统截图');
    }).then(function () {
      saveBtn.disabled = false;
    });
  });

  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.removeAttribute('src');
    document.body.style.overflow = '';
  }
  lbClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  var skinInk = $('skinInk'), skinPaper = $('skinPaper');
  function setSkin(name) {
    skin = name === 'paper' ? 'paper' : 'ink';
    paintCard();
    var ink = skin === 'ink';
    skinInk.className = 'skin-btn' + (ink ? ' is-on' : '');
    skinPaper.className = 'skin-btn' + (ink ? '' : ' is-on');
    skinInk.setAttribute('aria-pressed', ink ? 'true' : 'false');
    skinPaper.setAttribute('aria-pressed', ink ? 'false' : 'true');
  }
  skinInk.addEventListener('click', function () { setSkin('ink'); });
  skinPaper.addEventListener('click', function () { setSkin('paper'); });

  var theme = 'dark';
  var themeBtn = $('themeToggle');
  var gate = $('gate'), pickDark = $('pickDark'), pickLight = $('pickLight');

  function setTheme(name) {
    theme = name === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    setSkin(theme === 'light' ? 'paper' : 'ink');
    themeBtn.textContent = theme === 'light' ? '墨底' : '宣纸';
    themeBtn.setAttribute('aria-label', theme === 'light' ? '切换为墨底' : '切换为宣纸');
  }

  var gateBusy = false;
  function closeGate() {
    if (gateBusy) return;
    gateBusy = true;
    gate.classList.add('is-out');
    var reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () {
      gate.hidden = true;
      document.body.style.overflow = '';
      var shell = $('shell');
      shell.removeAttribute('inert');
      shell.focus({ preventScroll: true });
    }, reduce ? 0 : 380);
  }

  pickDark.addEventListener('click', function () { setTheme('dark'); closeGate(); });
  pickLight.addEventListener('click', function () { setTheme('light'); closeGate(); });
  themeBtn.addEventListener('click', function () {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  });

  document.body.style.overflow = 'hidden';
  $('shell').setAttribute('inert', '');
  pickDark.focus();

  var methodToggle = $('methodToggle'), methodBody = $('methodBody'), methodMark = $('methodMark');
  methodToggle.addEventListener('click', function () {
    var open = methodBody.hidden;
    methodBody.hidden = !open;
    methodToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    methodMark.textContent = open ? '－' : '＋';
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 120);
  });
})();

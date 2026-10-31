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
  var backArea = $('backArea'), backShot = $('backShot');
  var lightbox = $('lightbox'), lbImg = $('lbImg'), lbClose = $('lbClose'), lbHint = $('lbHint');

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
    if (window.HouFan) window.HouFan.paint(skin);
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

    if (window.HouFan) {
      window.HouFan.show(row, loc,
        y + ' 年 ' + m + ' 月 ' + d + ' 日 · ' + pad(hh) + ':' + pad(mi));
      showView('fan');
    }
  }

  var fanArea = $('fanArea'), singleArea = $('singleArea');
  function showView(which) {
    var single = which === 'single';
    fanArea.hidden = single;
    singleArea.hidden = !single;
    if (!single && window.HouFan) window.HouFan.paint(skin);
    fit();
  }
  $('toSingle').addEventListener('click', function () { showView('single'); });
  $('toFan').addEventListener('click', function () { showView('fan'); });

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

  /* 背面：克隆当前抽出叶子的 .face.back 到离屏 390×844 容器再截。
     翻面靠 CSS 3D，克隆体要清掉 rotateY 才是正面朝上；诗/食/印统一补 is-on，
     免得在翻背动画没走完时点保存截到半张。 */
  function captureBack(src) {
    var clone = src.cloneNode(true);
    var on = clone.querySelectorAll('.bk-poem, .bk-food, .bk-seal, .bk-art');
    for (var i = 0; i < on.length; i++) on[i].classList.add('is-on');
    return shotOffscreen(clone);
  }

  /* 正面：克隆当前选中叶的 .card，扇面滑到邻候后存的就是那一张 */
  function captureFront(src) {
    return shotOffscreen(src.cloneNode(true));
  }

  function shotOffscreen(clone) {
    backShot.textContent = '';
    backShot.appendChild(clone);
    function done(url, err) {
      backShot.textContent = '';
      if (err) throw err;
      return url;
    }
    return window.Capture.toPng(backShot, 2).then(function (url) { return done(url); },
      function (err) { return done(null, err); });
  }

  /* 正面：单卡视图导单卡；扇面/抽出态导当前选中叶的正面。翻背态改导背面。 */
  function captureCard() {
    var art = window.HouFan && window.HouFan.ensureArt
      ? window.HouFan.ensureArt() : Promise.resolve(null);
    return art.then(function () {
      if (window.HouFan && window.HouFan.isFlipped()) {
        var back = window.HouFan.backNode();
        if (back) return captureBack(back);
      }
      if (!singleArea.hidden) return window.Capture.toPng(card, 2);
      var front = window.HouFan && window.HouFan.frontNode
        ? window.HouFan.frontNode() : null;
      if (front) return captureFront(front);
      /* 兜底（没有扇面时）：把单卡挪到屏幕外量出尺寸再截，截完复位 */
      singleArea.hidden = false;
      singleArea.className = 'single-area is-offscreen';
      var out = window.Capture.toPng(card, 2);
      function restore() {
        singleArea.className = 'single-area';
        singleArea.hidden = true;
      }
      return out.then(function (url) { restore(); return url; },
        function (err) { restore(); throw err; });
    });
  }

  saveBtn.addEventListener('click', function () {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    setMsg('');
    playSfx('save');
    captureCard().then(function (url) {
      lbImg.src = url;
      lbHint.textContent = window.Capture.artInlined()
        ? '长按图片保存到相册'
        : '长按保存 · 本地直接打开时导出不含插画，用站点地址打开即可';
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
    lbHint.textContent = '长按图片保存到相册';
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
  skinInk.addEventListener('click', function () { setSkin('ink'); playSfx('tap'); });
  skinPaper.addEventListener('click', function () { setSkin('paper'); playSfx('tap'); });

  var theme = 'dark';
  var themeBtn = $('themeToggle');
  var gate = $('gate'), pickDark = $('pickDark'), pickLight = $('pickLight');

  /* ---------- 背景乐：开场问一次，页头小喇叭随时改 ---------- */
  var SOUND_KEY = 'hou72.sound';
  var VOLUME = 0.45;
  var TRACKS = { dark: 'assets/audio/ink.m4a', light: 'assets/audio/paper.m4a' };
  var soundToggle = $('soundToggle');
  var pickMute = $('pickMute'), pickSound = $('pickSound'), rememberEl = $('rememberSound');
  var soundWanted = false;   // 用户选的：要不要声
  var soundOn = false;       // 实际在放没有（被系统拦下会退回 false）
  var soundKeep = false;     // 记住这个选择
  var players = {};
  var hiddenPause = false;

  function playerFor(name) {
    if (!players[name]) {
      var a = new Audio(TRACKS[name]);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      /* 解码不出来（少数引擎不带 AAC）就别假装在放：图标退回静音 */
      a.addEventListener('error', function () {
        if (!soundOn || players[theme] !== a) return;
        soundOn = false;
        paintSound();
      });
      players[name] = a;
    }
    return players[name];
  }

  function fade(el, to, ms, done) {
    if (el.fadeTimer) clearInterval(el.fadeTimer);
    var from = el.volume, t0 = Date.now();
    el.fadeTimer = setInterval(function () {
      var p = Math.min(1, (Date.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * p));
      if (p >= 1) {
        clearInterval(el.fadeTimer);
        el.fadeTimer = null;
        if (done) done();
      }
    }, 30);
  }

  function paintSound() {
    soundToggle.className = 'sound-toggle' + (soundOn ? ' is-on' : '');
    soundToggle.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    soundToggle.setAttribute('aria-label', soundOn ? '关闭背景乐' : '打开背景乐');
    pickMute.className = 'gs-opt' + (soundWanted ? '' : ' is-on');
    pickSound.className = 'gs-opt' + (soundWanted ? ' is-on' : '');
    pickMute.setAttribute('aria-pressed', soundWanted ? 'false' : 'true');
    pickSound.setAttribute('aria-pressed', soundWanted ? 'true' : 'false');
  }

  function writeSoundPref() {
    try {
      if (soundKeep) localStorage.setItem(SOUND_KEY, soundWanted ? 'on' : 'off');
      else localStorage.removeItem(SOUND_KEY);
    } catch (e) { /* 隐私模式/本地文件可能禁写，忽略 */ }
  }

  /* 起播必须落在点击手势里（iOS 只认手势力），所以调用点都在 click 里。
     音量等真的出声（playing）再淡入，免得文件还没缓冲、淡入先跑完，
     一开声就是满音量的一声硬起。 */
  function playTrack(name) {
    var el = playerFor(name);
    var live = !el.paused && el.readyState >= 3;
    Object.keys(players).forEach(function (k) {
      if (k === name) return;
      var old = players[k];
      if (old.paused) return;
      fade(old, 0, 560, function () { old.pause(); old.currentTime = 0; });
    });
    if (!live) el.volume = 0;
    var p = el.play();
    if (live) {
      fade(el, VOLUME, 900);
    } else {
      var kick = function () {
        el.removeEventListener('playing', kick);
        fade(el, VOLUME, 900);
      };
      el.addEventListener('playing', kick);
    }
    if (p && p['catch']) {
      p['catch'](function () { soundOn = false; paintSound(); });
    }
  }

  function startSound() {
    if (!soundWanted || soundOn) return;
    soundOn = true;
    paintSound();
    playTrack(theme);
  }

  function stopSound() {
    if (!soundOn) return;
    soundOn = false;
    paintSound();
    Object.keys(players).forEach(function (k) {
      var el = players[k];
      if (el.paused) return;
      fade(el, 0, 420, function () { el.pause(); });
    });
  }

  /* ---------- 交互音效：纸声家族，跟背景乐一起受同一个静音开关管 ---------- */
  var SFX = {
    pick: 'assets/audio/fx-pick.m4a',
    spread: 'assets/audio/fx-spread.m4a',
    draw: 'assets/audio/fx-draw.m4a',
    flip: 'assets/audio/fx-flip.m4a',
    swipe: 'assets/audio/fx-swipe.m4a',
    fold: 'assets/audio/fx-fold.m4a',
    save: 'assets/audio/fx-save.m4a',
    tap: 'assets/audio/fx-tap.m4a'
  };
  var SFX_GAIN = {
    pick: 0.34, spread: 0.34, draw: 0.36, flip: 0.38,
    swipe: 0.22, fold: 0.32, save: 0.3, tap: 0.2
  };
  var sfxPool = {}, sfxAt = {}, sfxWarm = false;

  function sfxMake(name) {
    var el = new Audio(SFX[name]);
    el.preload = 'auto';
    el.volume = SFX_GAIN[name];
    return el;
  }

  /* 进站前一个请求都不发；第一次点按才把 8 个小文件排进下载，等真要点时已在缓存里 */
  function warmSfx() {
    if (sfxWarm) return;
    sfxWarm = true;
    Object.keys(SFX).forEach(function (k) { sfxPool[k] = [sfxMake(k)]; });
  }

  /* force：开场点「打开声音」的试听，此时背景乐还没起 */
  function playSfx(name, force) {
    if (!SFX[name] || !(soundOn || force)) return;
    var now = Date.now();
    if (!force && sfxAt[name] && now - sfxAt[name] < 70) return;
    sfxAt[name] = now;
    if (!sfxWarm) warmSfx();
    var list = sfxPool[name], el = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].paused) { el = list[i]; break; }
    }
    if (!el) {
      if (list.length < 2) { el = sfxMake(name); list.push(el); }
      else { el = list[0]; }
    }
    try { el.currentTime = 0; } catch (e) { /* 还没元数据就先放着 */ }
    el.volume = SFX_GAIN[name];
    var p = el.play();
    if (p && p['catch']) p['catch'](function () { /* 被拦就静默跳过 */ });
  }
  window.HouSfx = { play: playSfx };

  document.addEventListener('pointerdown', warmSfx, { once: true, passive: true });
  document.addEventListener('keydown', warmSfx, { once: true });

  pickMute.addEventListener('click', function () { soundWanted = false; paintSound(); });
  pickSound.addEventListener('click', function () {
    soundWanted = true;
    paintSound();
    playSfx('tap', true);   // 试听一声，确认设备真的出声
  });
  rememberEl.addEventListener('change', function () {
    soundKeep = rememberEl.checked;
    writeSoundPref();
  });
  soundToggle.addEventListener('click', function () {
    if (soundOn) { soundWanted = false; stopSound(); }
    else { soundWanted = true; startSound(); playSfx('tap'); }
    paintSound();
    writeSoundPref();
  });

  document.addEventListener('visibilitychange', function () {
    if (!soundOn) return;
    var el = players[theme];
    if (!el) return;
    if (document.hidden) {
      if (!el.paused) { el.pause(); hiddenPause = true; }
    } else if (hiddenPause) {
      hiddenPause = false;
      var p = el.play();
      if (p && p['catch']) p['catch'](function () { soundOn = false; paintSound(); });
    }
  });

  (function initSound() {
    try {
      var v = localStorage.getItem(SOUND_KEY);
      if (v === 'on' || v === 'off') { soundKeep = true; soundWanted = v === 'on'; }
    } catch (e) { /* 读不到就按默认静音 */ }
    rememberEl.checked = soundKeep;
    paintSound();
  })();

  function setTheme(name) {
    theme = name === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    setSkin(theme === 'light' ? 'paper' : 'ink');
    themeBtn.textContent = theme === 'light' ? '墨底' : '宣纸';
    themeBtn.setAttribute('aria-label', theme === 'light' ? '切换为墨底' : '切换为宣纸');
    if (soundOn) playTrack(theme);
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

  function enterSite(name) {
    setTheme(name);
    soundKeep = rememberEl.checked;
    writeSoundPref();
    closeGate();
    startSound();
    playSfx('pick');
  }

  pickDark.addEventListener('click', function () { enterSite('dark'); });
  pickLight.addEventListener('click', function () { enterSite('light'); });
  themeBtn.addEventListener('click', function () {
    setTheme(theme === 'dark' ? 'light' : 'dark');
    playSfx('tap');
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

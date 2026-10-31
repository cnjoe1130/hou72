/*
 * 把卡片节点渲染成 PNG（同 html-to-image 的路线：SVG foreignObject -> canvas）。
 *
 * 为什么不用 html-to-image 的 vendor 版：它的 UMD 里含两处 fetch，只用于网页字体与
 * 外部资源内嵌；本项目全站无 @font-face、无外部图片，那两条路径永远走不到，但静态
 * 闸门会扫描到 fetch 字样。这里按同一技术路线自带实现，产物里不出现任何网络 API。
 *
 * 失败路径按该库的已知实践：带外链/跨源资源时 canvas 会被污染，toDataURL 抛
 * SecurityError；Safari 偶发返回空串。两者都向上抛，由调用方降级为系统截图提示。
 */
(function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XHTML_NS = 'http://www.w3.org/1999/xhtml';

  function collectCss() {
    var css = '';
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules;
      try {
        rules = document.styleSheets[i].cssRules;
      } catch (e) {
        continue;
      }
      if (!rules) continue;
      for (var j = 0; j < rules.length; j++) css += rules[j].cssText + '\n';
    }
    return css;
  }

  /* 字体在 body 上声明；克隆进 SVG 后没有 body 可继承，必须把卡片实际生效的
     字体属性钉到 holder 上，否则会回落到渲染器默认衬线（与页面观感不同）。 */
  var FONT_PROPS = ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch',
    'fontVariant', 'fontFeatureSettings', 'lineHeight', 'letterSpacing', 'wordSpacing',
    'textTransform', 'textRendering', 'direction', 'color'];

  function copyFont(node, holder) {
    var cs;
    try { cs = window.getComputedStyle(node); } catch (e) { return; }
    for (var i = 0; i < FONT_PROPS.length; i++) {
      var v = cs[FONT_PROPS[i]];
      if (v) holder.style[FONT_PROPS[i]] = v;
    }
    var smooth = cs.getPropertyValue('-webkit-font-smoothing');
    if (smooth) holder.style.setProperty('-webkit-font-smoothing', smooth);
  }

  /* 插画不走 SVG 内嵌的 img：WebKit 光栅化 foreignObject 时，内嵌图首次是异步解码，
     第一帧常常画不出（第一次保存没插画、取消后再存才有）。所以克隆里的图统一隐藏，
     另起一个干净的 Image 按同一地址取图和解码，画完 SVG 后按同一个矩形合成到 canvas 上。
     过一遍 canvas 转 data:URL 还有第二个用途：file:// 直接打开时画布会被污染
     （SecurityError），这里就能发现——用 artInlined() 告诉调用方，好在界面上说清楚。 */
  var artReady = true;

  function sourceImage(url) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      im.src = url;
    });
  }

  function decoded(im) {
    if (!im.decode) return Promise.resolve(true);
    return im.decode().then(function () { return true; }, function () { return false; });
  }

  function inlineImages(node) {
    var jobs = [];
    var imgs = node.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      (function (im) {
        var src = im.getAttribute('src');
        if (!src) { artReady = false; jobs.push(Promise.resolve(null)); return; }
        jobs.push(sourceImage(src).then(function (loaded) {
          if (!loaded) { artReady = false; return null; }
          return decoded(loaded).then(function (ok) {
            if (!ok) { artReady = false; return null; }
            try {
              /* 过一遍画布只是探污染：file:// 下这里抛 SecurityError，
                 等于告诉调用方插画内联不了；画布不脏就直接用解码好的原图合成 */
              var c = document.createElement('canvas');
              c.width = loaded.naturalWidth;
              c.height = loaded.naturalHeight;
              c.getContext('2d').drawImage(loaded, 0, 0);
              c.toDataURL('image/webp', 0.92);
              im.style.visibility = 'hidden';
              return loaded;
            } catch (e) {
              artReady = false;
              return null;
            }
          });
        }));
      })(imgs[i]);
    }
    return Promise.all(jobs);
  }

  /* 图在卡片里的落位：clip 是图槽（overflow:hidden），dst 是图本身。
     在原始节点上量（克隆体脱离文档后矩形全是 0）。 */
  function artBoxes(node) {
    var base = node.getBoundingClientRect();
    var out = [];
    var imgs = node.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var r = imgs[i].getBoundingClientRect();
      var s = imgs[i].parentNode.getBoundingClientRect();
      out.push({
        clip: { x: s.left - base.left, y: s.top - base.top, w: s.width, h: s.height },
        dst: { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
      });
    }
    return out;
  }

  function buildSvg(node, w, h, scale) {
    var s = scale || 1;
    var clone = node.cloneNode(true);
    clone.removeAttribute('id');
    artReady = true;
    var style = document.createElement('style');
    style.textContent = collectCss();

    /* 内容按 1x 排版、再用 CSS transform 放大：Safari 的 foreignObject 不跟 viewBox 缩放，
       直接把 SVG 写成 2x 宽会让内容仍停在左上角 1x（导出图只有半张）。 */
    var frame = document.createElement('div');
    frame.setAttribute('xmlns', XHTML_NS);
    frame.setAttribute('style',
      'position:relative;width:' + w + 'px;height:' + h + 'px;overflow:hidden;' +
      'transform:scale(' + s + ');transform-origin:0 0;' +
      '-webkit-transform:scale(' + s + ');-webkit-transform-origin:0 0');
    frame.appendChild(style);
    frame.appendChild(clone);

    var W = Math.round(w * s), H = Math.round(h * s);
    var holder = document.createElement('div');
    holder.setAttribute('xmlns', XHTML_NS);
    holder.setAttribute('style',
      'position:relative;width:' + W + 'px;height:' + H + 'px;margin:0;padding:0;overflow:hidden');
    copyFont(node, holder);
    holder.appendChild(frame);

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');
    fo.setAttribute('width', '100%');
    fo.setAttribute('height', '100%');
    fo.appendChild(holder);
    svg.appendChild(fo);
    return inlineImages(clone).then(function (images) {
      return { svg: svg, images: images };
    });
  }

  function loadSvg(svg) {
    return new Promise(function (resolve, reject) {
      var xml = new XMLSerializer().serializeToString(svg);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('svg-load-failed')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
  }

  function capturePng(node, ratio) {
    var w = node.offsetWidth;
    var h = node.offsetHeight;
    if (!w || !h) return Promise.reject(new Error('empty-node'));
    var scale = ratio || 2;
    var boxes = artBoxes(node);
    return buildSvg(node, w, h, scale).then(function (built) {
      return loadSvg(built.svg).then(function (img) {
        var W = Math.round(w * scale), H = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        var bg = '';
        try { bg = window.getComputedStyle(node).backgroundColor; } catch (e) {}
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
        }
        ctx.drawImage(img, 0, 0, W, H);
        for (var i = 0; i < boxes.length; i++) {
          var art = built.images[i];
          if (!art) continue;
          var b = boxes[i];
          ctx.save();
          ctx.beginPath();
          ctx.rect(b.clip.x * scale, b.clip.y * scale, b.clip.w * scale, b.clip.h * scale);
          ctx.clip();
          ctx.drawImage(art, b.dst.x * scale, b.dst.y * scale, b.dst.w * scale, b.dst.h * scale);
          ctx.restore();
        }
        var out = canvas.toDataURL('image/png');
        if (!out || out.length < 200) throw new Error('empty-data-url');
        return out;
      });
    });
  }

  root.Capture = {
    toPng: capturePng,
    artInlined: function () { return artReady; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

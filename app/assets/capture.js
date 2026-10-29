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

  function buildSvg(node, w, h) {
    var clone = node.cloneNode(true);
    clone.removeAttribute('id');
    var holder = document.createElement('div');
    holder.setAttribute('xmlns', XHTML_NS);
    holder.setAttribute('style', 'width:' + w + 'px;height:' + h + 'px;margin:0;padding:0');
    var style = document.createElement('style');
    style.textContent = collectCss();
    holder.appendChild(style);
    holder.appendChild(clone);

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    var fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');
    fo.setAttribute('width', '100%');
    fo.setAttribute('height', '100%');
    fo.appendChild(holder);
    svg.appendChild(fo);
    return svg;
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
    var svg = buildSvg(node, w, h);
    return loadSvg(svg).then(function (img) {
      var scale = ratio || 2;
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      var ctx = canvas.getContext('2d');
      var bg = '';
      try { bg = window.getComputedStyle(node).backgroundColor; } catch (e) {}
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, w, h);
      var out = canvas.toDataURL('image/png');
      if (!out || out.length < 200) throw new Error('empty-data-url');
      return out;
    });
  }

  root.Capture = { toPng: capturePng };
})(typeof window !== 'undefined' ? window : globalThis);

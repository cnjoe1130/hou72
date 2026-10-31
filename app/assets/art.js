/* 卡背图按候号懒加载：启动时一张不取，谁翻到哪一候才取哪一候；
   相邻候在扇面换选中时预取。解码后留在内存，同一候不重复请求。 */
(function (root) {
  'use strict';

  var cache = {};
  var pending = {};
  var stats = { loads: 0, failed: [] };

  function src(hou) {
    var map = root.HOU_ART || {};
    return map[String(hou)] || null;
  }

  function get(hou) {
    return cache[String(hou)] || null;
  }

  function load(hou) {
    var key = String(hou);
    if (cache[key]) return Promise.resolve(cache[key]);
    if (pending[key]) return pending[key];
    var path = src(key);
    if (!path) return Promise.reject(new Error('no-art:' + key));

    var img = new Image();
    img.decoding = 'async';
    pending[key] = new Promise(function (resolve, reject) {
      img.onload = function () {
        stats.loads++;
        cache[key] = img;
        delete pending[key];
        resolve(img);
      };
      img.onerror = function () {
        stats.failed.push(key);
        delete pending[key];
        reject(new Error('art-failed:' + key));
      };
      img.src = path;
    });
    return pending[key];
  }

  function preload(hous) {
    for (var i = 0; i < (hous || []).length; i++) {
      load(hous[i])['catch'](function () {});
    }
  }

  root.HouArt = {
    src: src,
    get: get,
    load: load,
    preload: preload,
    stats: function () {
      return {
        loads: stats.loads,
        cached: Object.keys(cache).length,
        failed: stats.failed.slice()
      };
    }
  };
})(window);

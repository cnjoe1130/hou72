#!/usr/bin/env bash
# 打包 ziwei-hou-v3.zip；任何一道闸门不过就不出包。
set -uo pipefail
cd "$(dirname "$0")"

PY=../.venv/bin/python
if [ ! -x "$PY" ]; then PY=$(command -v python3 || true); fi
[ -n "$PY" ] || { echo "找不到 python3"; exit 1; }
APP=app
ZIP=ziwei-hou-v3.zip
FAILED=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=$((FAILED+1)); }

echo "== 0. 重新生成数据 =="
$PY build_app_data.py || { echo "build_app_data.py 失败"; exit 1; }
$PY build_verse.py || { echo "build_verse.py 失败"; exit 1; }
$PY build_art.py || { echo "build_art.py 失败"; exit 1; }
$PY build_terms.py || { echo "build_terms.py 失败"; exit 1; }
cp hou_terms.js "$APP/assets/hou_terms.js" || exit 1
echo "PASS  hou_terms.js 生成并复制"

echo
echo "== 1. 查表逻辑单测 =="
if node tools/test_lookup.js > /tmp/hou72-lookup.log 2>&1; then
  pass "test_lookup.js（$(grep -c '^PASS' /tmp/hou72-lookup.log) 项）"
else
  fail "test_lookup.js"; tail -20 /tmp/hou72-lookup.log
fi

echo
echo "== 2. 文件类型白名单 =="
BAD_EXT=$(find "$APP" -type f ! -name '.DS_Store' | sed 's/.*\.//' | sort -u | grep -vE '^(html|css|js|png|svg|woff2|json|jpg|gif|webp)$' || true)
if [ -z "$BAD_EXT" ]; then pass "扩展名全部在白名单内（$(find "$APP" -type f | wc -l | tr -d ' ') 个文件）"; else fail "非法扩展名: $BAD_EXT"; fi
if [ -f "$APP/index.html" ]; then pass "index.html 在包根"; else fail "index.html 不在包根"; fi

echo
echo "== 2b. 图资产（72 张 / 文件名驱动 / 不写死映射） =="
ART_N=$(find "$APP/assets/art72" -maxdepth 1 -type f -name '*.webp' | wc -l | tr -d ' ')
[ "$ART_N" = "72" ] && pass "art72/ 72 张" || fail "art72/ $ART_N 张（期望 72）"
ART_KB=$(du -sk "$APP/assets/art72" | awk '{print $1}')
# 旧水墨图单张约 13 KB（940 KB / 72）；AI 墨骨淡彩细节多，按目标体积 21 KB 编码，
# 72 张约 1.42 MB。这条子闸门随之抬到 1600 KB，整体 2 MB 的硬闸门不变。
[ "$ART_KB" -lt 1600 ] && pass "art72/ ${ART_KB} KB < 1600 KB" || fail "art72/ ${ART_KB} KB 偏大"
MAP_N=$(grep -c 'assets/art72/' "$APP/assets/art-manifest.js" || true)
[ "$MAP_N" = "72" ] && pass "art-manifest.js 72 条" || fail "art-manifest.js $MAP_N 条（期望 72）"
MISS=$(cd "$APP" && grep -o '"assets/art72/[^"]*"' assets/art-manifest.js | tr -d '"' | while read -r p; do [ -f "$p" ] || echo "$p"; done)
[ -z "$MISS" ] && pass "manifest 每条都能落到文件" || fail "manifest 指向不存在的文件：$MISS"
HARD=$(grep -RIn 'art72/' "$APP" | grep -v 'art-manifest.js' || true)
[ -z "$HARD" ] && pass "art72 路径只出现在生成的 manifest 里" || fail "有硬编码图路径："; [ -n "$HARD" ] && echo "$HARD"

echo
echo "== 2c. 诗数据（72 条 / 2 条 pending 空诗） =="
V_N=$(node -e "global.window={};require('./app/assets/hou72-verse.js');console.log(Object.keys(window.HOU_VERSE).length)")
[ "$V_N" = "72" ] && pass "hou72-verse.js 72 条" || fail "hou72-verse.js $V_N 条（期望 72）"
V_NULL=$(node -e "global.window={};require('./app/assets/hou72-verse.js');const v=window.HOU_VERSE;console.log(Object.keys(v).filter(k=>!v[k].poem_text).sort((a,b)=>a-b).join(','))")
[ "$V_NULL" = "48,63" ] && pass "唯二空诗 = 候 48 / 63" || fail "空诗候号 $V_NULL（期望 48,63）"
V_FOOD=$(node -e "global.window={};require('./app/assets/hou72-verse.js');const v=window.HOU_VERSE;console.log(Object.keys(v).filter(k=>!v[k].food_note).length)")
[ "$V_FOOD" = "0" ] && pass "72 条食俗齐全" || fail "缺食俗 $V_FOOD 条"

echo
echo "== 3. 禁词（全量扫 index.html + assets） =="
HITS=$(grep -RInE '吉|凶|运|福|灾|宜|忌' "$APP" || true)
if [ -z "$HITS" ]; then pass "禁词 0 命中"; else fail "禁词命中："; echo "$HITS"; fi

echo
echo "== 4. 内联 script =="
INLINE=$(grep -nE '<script[^>]*>' "$APP/index.html" | grep -v 'src=' || true)
if [ -z "$INLINE" ]; then pass "无内联 script"; else fail "内联 script：$INLINE"; fi

echo
echo "== 5. 网络 / 交互 API =="
API=$(grep -RInE 'fetch\(|XMLHttpRequest|WebSocket|eval\(|window\.open|clipboard|onclick=|onerror=|target="_blank"|<iframe' "$APP" || true)
if [ -z "$API" ]; then pass "fetch/XHR/WS/eval/window.open/clipboard/内联事件/iframe = 0"; else fail "命中："; echo "$API"; fi

echo
echo "== 6. 外部资源 =="
URLS=$(grep -RInE 'https?://' "$APP" | grep -vE 'www\.w3\.org/(2000/svg|1999/xhtml)' || true)
if [ -z "$URLS" ]; then pass "无外部 URL（仅保留 SVG/XHTML 命名空间常量 2 处）"; else fail "外部 URL："; echo "$URLS"; fi
NS=$(grep -RIcE 'www\.w3\.org/(2000/svg|1999/xhtml)' "$APP" | awk -F: '{s+=$2} END {print s+0}')
if [ "$NS" = "2" ]; then pass "命名空间常量恰为 2"; else fail "命名空间常量 $NS（期望 2）"; fi

echo
echo "== 7. 必带项 =="
grep -q 'viewport-fit=cover' "$APP/index.html" && pass "viewport-fit=cover" || fail "缺 viewport-fit=cover"
grep -q 'touch-action:manipulation' "$APP/index.html" && pass "touch-action:manipulation" || fail "缺 touch-action"
grep -q '本工具只讲解历法与物候规则，不构成任何建议' "$APP/index.html" && pass "免责声明逐字" || fail "免责声明不符"
grep -q '候界按太阳黄经实算，与历书标注相差一天属分法不同' "$APP/index.html" && pass "口径小字逐字" || fail "口径小字不符"

echo
echo "== 8. 体积 =="
APP_KB=$(du -sk "$APP" | awk '{print $1}')
if [ "$APP_KB" -lt 2048 ]; then pass "app/ ${APP_KB} KB < 2 MB"; else fail "app/ ${APP_KB} KB 超 2 MB"; fi

echo
echo "== 9. 打包 =="
if [ "$FAILED" -ne 0 ]; then
  echo "有闸门未过，不出包。"
  exit 1
fi
rm -f "$ZIP"
( cd "$APP" && zip -qr "../$ZIP" index.html assets ) || { echo "zip 失败"; exit 1; }
ZIP_KB=$(du -sk "$ZIP" | awk '{print $1}')
[ "$ZIP_KB" -lt 2048 ] && pass "$ZIP ${ZIP_KB} KB < 2 MB" || fail "$ZIP ${ZIP_KB} KB 超 2 MB"
ROOT_OK=$(unzip -Z1 "$ZIP" | grep -cx 'index.html' || true)
[ "$ROOT_OK" = "1" ] && pass "zip 根目录含 index.html" || fail "zip 根目录无 index.html"
ZIP_EXT=$(unzip -Z1 "$ZIP" | grep -v '/$' | sed 's/.*\.//' | sort -u | grep -vE '^(html|css|js|png|svg|woff2|json|jpg|gif|webp)$' || true)
[ -z "$ZIP_EXT" ] && pass "zip 内扩展名合规" || fail "zip 内非法扩展名: $ZIP_EXT"

echo
echo "== zip 清单 =="
unzip -l "$ZIP"
echo
if [ "$FAILED" -ne 0 ]; then
  rm -f "$ZIP"
  echo "GATES FAILED: $FAILED（zip 已撤回）"
  exit 1
fi

echo
echo "== 10. 解压冒烟（从 zip 解压产物起页） =="
if node tools/test_zip.js > /tmp/hou72-zip.log 2>&1; then
  pass "test_zip.js（$(grep -c '^PASS' /tmp/hou72-zip.log) 项）"
else
  fail "test_zip.js"; tail -20 /tmp/hou72-zip.log
  rm -f "$ZIP"
  echo "解压冒烟未过，zip 已撤回。"
  exit 1
fi

echo
echo "== 11. 季节色温 =="
if node tools/test_season.js > /tmp/hou72-season.log 2>&1; then
  pass "test_season.js（$(grep -c '^PASS' /tmp/hou72-season.log) 项）"
else
  fail "test_season.js"; tail -20 /tmp/hou72-season.log
  rm -f "$ZIP"
  echo "季节测试未过，zip 已撤回。"
  exit 1
fi

echo
echo "== 12. 墨 / 纸双版 =="
if node tools/test_skin.js > /tmp/hou72-skin.log 2>&1; then
  pass "test_skin.js（$(grep -c '^PASS' /tmp/hou72-skin.log) 项）"
else
  fail "test_skin.js"; tail -20 /tmp/hou72-skin.log
  rm -f "$ZIP"
  echo "纸墨测试未过，zip 已撤回。"
  exit 1
fi

echo
echo "== 13. 开场选纸 / 整页亮暗 / 今日 =="
if node tools/test_entry.js > /tmp/hou72-entry.log 2>&1; then
  pass "test_entry.js（$(grep -c '^PASS' /tmp/hou72-entry.log) 项）"
else
  fail "test_entry.js"; tail -20 /tmp/hou72-entry.log
  rm -f "$ZIP"
  echo "开场/主题测试未过，zip 已撤回。"
  exit 1
fi

echo
echo "== 14. 扇面摊牌 / 抽出 / 翻背 / 跨年环 =="
if node tools/test_fan.js > /tmp/hou72-fan.log 2>&1; then
  pass "test_fan.js（$(grep -c '^PASS' /tmp/hou72-fan.log) 项）"
else
  fail "test_fan.js"; tail -30 /tmp/hou72-fan.log
  rm -f "$ZIP"
  echo "扇面测试未过，zip 已撤回。"
  exit 1
fi

echo
echo "== 15. 卡背图：72 张 / 零预载 / 按候懒加载 =="
if node tools/test_art.js > /tmp/hou72-art.log 2>&1; then
  pass "test_art.js（$(grep -c '^PASS' /tmp/hou72-art.log) 项）"
else
  fail "test_art.js"; tail -30 /tmp/hou72-art.log
  rm -f "$ZIP"
  echo "图资产测试未过，zip 已撤回。"
  exit 1
fi

echo
echo "== 16. 导出带图（本地 http 站 / file:// 降级提示） =="
if node tools/test_export.js > /tmp/hou72-export.log 2>&1; then
  pass "test_export.js（$(grep -c '^PASS' /tmp/hou72-export.log) 项）"
else
  fail "test_export.js"; tail -30 /tmp/hou72-export.log
  rm -f "$ZIP"
  echo "导出带图测试未过，zip 已撤回。"
  exit 1
fi

echo
echo "ALL GATES PASS"

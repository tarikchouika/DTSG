#!/usr/bin/env bash
# =============================================================================
# تجهيز متصفح Chromium لاختبارات Playwright في بيئة الساندبوكس (بدون تثبيت نظام).
#
# لماذا هذا موجود؟
#   - شبكة الساندبوكس لا تسمح سوى بـ github.com و registry.npmjs.org، لذا تنزيل
#     متصفحات Playwright الرسمية (CDN) محجوب دائماً (ECONNRESET / 000).
#   - الحل: حزمة @sparticuz/chromium من npm تحوي كروميوم حقيقياً (مضغوط brotli)
#     داخل التاربول نفسه، ويُفك ضغطه محلياً.
#   - المتصفح يعمل (CDP/Playwright) لكنه يحتاج مكتبات NSS المرافقة عبر
#     LD_LIBRARY_PATH (مجلد al2023/lib)، ووضع --dump-dom لا يعمل في هذه البيئة،
#     أما القيادة عبر Playwright/CDP فتعمل بشكل كامل (تحقّق: ملاحة + تقييم + لقطة).
#
# الاستعمال (من جذر المستودع):
#   bash scripts/prepare-browser.sh
#   LD_LIBRARY_PATH="$PWD/node_modules/.chromium-143/al2023/lib" node <test>.js
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="143.0.4"                    # Chromium 143.0.7499.0 — متوافق مع Playwright 1.40.x
SRC="$ROOT/node_modules/.chromium-src"
DEST="$ROOT/node_modules/.chromium-143"

command -v npm >/dev/null || { echo "npm غير موجود"; exit 1; }
[ -d "$ROOT/node_modules/playwright" ] || { echo "شغّل npm install أولاً"; exit 1; }

# 1) نزّل تاربول الحزمة (مرة واحدة) من سجل npm (مسموح)
mkdir -p "$SRC"
cd "$SRC"
if [ ! -f "sparticuz-chromium-$VER.tgz" ]; then
  echo "[1/4] تنزيل @sparticuz/chromium@$VER من npm ..."
  npm pack "@sparticuz/chromium@$VER" >/dev/null
fi

# 2) فك الحزمة وفك ضغط brotli (chromium + swiftshader + al2023/fonts)
echo "[2/4] فك ضغط الكروميوم ..."
rm -rf "$DEST"
mkdir -p "$DEST"
tar xzf "sparticuz-chromium-$VER.tgz" -C "$DEST"          # → package/
(
  cd "$DEST/package/bin"
  node -e '
    const fs = require("fs"), z = require("zlib");
    const out = "../..";
    for (const f of fs.readdirSync(".")) {
      if (!f.endsWith(".br")) continue;
      const b = z.brotliDecompressSync(fs.readFileSync(f));
      if (f === "chromium.br") fs.writeFileSync(out + "/chromium", b, { mode: 0o755 });
      else fs.writeFileSync(out + "/" + f.replace(/\.tar\.br$/, "") + ".tar", b);
    }'
)
rm -rf "$DEST/package"

# 3) استخرج مكتبات swiftshader بجانب الملف التنفيذي ومكتبات al2023 (NSS) في مجلدها
(
  cd "$DEST"
  for t in swiftshader al2023; do
    mkdir -p "$t"
    tar xf "$t.tar" -C "$t"
    rm -f "$t.tar"
  done
  mv swiftshader/libEGL.so swiftshader/libGLESv2.so swiftshader/libvulkan.so.1 \
     swiftshader/libvk_swiftshader.so swiftshader/vk_swiftshader_icd.json . 2>/dev/null || true
  rm -rf swiftshader
)

# 4) سجّل الملف التنفيذي في المسار الذي يتوقعه Playwright 1.40.x (chromium-1091)
echo "[3/4] ربط chromium-1091/chrome-linux/chrome ..."
PDIR="$HOME/.cache/ms-playwright/chromium-1091/chrome-linux"
mkdir -p "$PDIR"
ln -sf "$DEST/chromium" "$PDIR/chrome"

echo "[4/4] تم."
"$DEST/chromium" --version 2>/dev/null || true
echo
echo "شغّل اختبارات المتصفح هكذا (من جذر المستودع):"
echo "  LD_LIBRARY_PATH=\"$DEST/al2023/lib\" node _layout_test.js"
echo
echo "ملاحظات:"
echo "  - وضع --dump-dom/--headless لا يُنهي الصفحة في هذه البيئة؛ Playwright يعمل بدلاً عنه."
echo "  - اختبارات E2E التي تُنشئ حسابات عبر api/register تحتاج فتح التسجيل أو جلسة مشرف"
echo "    (الخادم الحالي يسمح بإنشاء الحسابات للمشرفين فقط)."

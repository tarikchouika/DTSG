#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — تهيئة بيئة الاختبار (QA) في سطر واحد
#  لماذا؟ لأن /tmp يُمحى عند كل إعادة تشغيل للحاوية، فكانت الأجنحة الحيّة
#  (Playwright) وnode:sqlite تفشل بعد كل استئناف. هذا السكربت يعيد بناء كل شيء:
#      1) Node 24  → /tmp/node24        (يوفّر وحدة node:sqlite)
#      2) Playwright + Chromium → /tmp/pw
#      3) خادم اختبار كامل على المنفذ 3971 بنسخة من الريبو + قاعدة نظيفة + مستخدمو QA
#
#  ملاحظة مهمة: /tmp عندنا tmpfs بحجم ~1GB فقط ⇒ نُثبّت ما هو ثقيل على القرص
#  في ~/.cache (وهو مستثنى من لقطة الورك‑سبيس فلا يُثقلها) ونترك وصلات رمزية في /tmp
#  كي تبقى المسارات الافتراضية في الأجنحة (/tmp/pw · /tmp/node24) صالحة.
#
#  الاستعمال:
#      bash scripts/qa-env.sh              # تهيئة + تشغيل الخادم
#      bash scripts/qa-env.sh --no-server  # تهيئة فقط
#  ثم لتشغيل الأجنحة:
#      export PATH=/tmp/node24/bin:$PATH
#      export NODE_PATH=/tmp/pw/node_modules
#      export PLAYWRIGHT_BROWSERS_PATH=/tmp/pw/browsers
#      node tests/_dama_v244_test.js        # مثال
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

NODE_VER="${NODE_VER:-24.10.0}"
NODE_DIR="$HOME/.cache/node24"      # على القرص — /tmp صغير (tmpfs)
PW_DIR="$HOME/.cache/pw"
BROWSERS="$HOME/.cache/ms-playwright"
FULL=/tmp/full                      # خادم الاختبار يبقى في /tmp (خفيف)
PORT="${QA_PORT:-3971}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
START_SERVER=1
[ "${1:-}" = "--no-server" ] && START_SERVER=0

echo "── 1) Node $NODE_VER → $NODE_DIR"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  curl -fsSL "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-linux-x64.tar.xz" -o /tmp/node.tar.xz
  mkdir -p "$NODE_DIR"
  tar -xJf /tmp/node.tar.xz -C "$NODE_DIR" --strip-components=1
  rm -f /tmp/node.tar.xz
fi
ln -sfn "$NODE_DIR" /tmp/node24            # مسار متوافق مع الأجنحة القديمة
export PATH="$NODE_DIR/bin:$PATH"
echo "   node $(node -v)"

echo "── 2) Playwright → $PW_DIR"
if [ ! -d "$PW_DIR/node_modules/playwright" ]; then
  mkdir -p "$PW_DIR"
  (cd "$PW_DIR" && npm init -y >/dev/null 2>&1 && npm i playwright --no-audit --no-fund >/dev/null 2>&1)
fi
ln -sfn "$PW_DIR" /tmp/pw                  # مسار متوافق مع الأجنحة القديمة
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS"
if [ ! -d "$BROWSERS/chromium-"* ] 2>/dev/null && ! ls -d "$BROWSERS"/chromium-* >/dev/null 2>&1; then
  (cd "$PW_DIR" && PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" npx playwright install chromium >/dev/null 2>&1)
fi
echo "   chromium: $(ls -d "$BROWSERS"/chromium-* 2>/dev/null | xargs -n1 basename | tr '\n' ' ' || echo 'غير مثبّت')"
# مكتبات النظام (libnss3/libnspr4…) تُفقد عند إعادة بناء الحاوية ⇒ نثبّتها إن نقصت
if ldd "$BROWSERS"/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | grep -q "not found"; then
  echo "   مكتبات ناقصة — تثبيت (sudo)"
  (cd "$PW_DIR" && PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" sudo -n npx playwright install-deps chromium >/dev/null 2>&1) || echo "   ⚠ تعذّر — شغّل يدوياً: sudo npx playwright install-deps chromium"
fi

if [ "$START_SERVER" = "0" ]; then
  echo "✔ البيئة جاهزة (بلا خادم) — صدِّر: PATH=$NODE_DIR/bin:\$PATH NODE_PATH=$PW_DIR/node_modules PLAYWRIGHT_BROWSERS_PATH=$BROWSERS"
  exit 0
fi

echo "── 3) خادم اختبار على $PORT (نسخة من $REPO → $FULL)"
# أوقف أي خادم قديم يشغل المنفذ (وإلا يفشل التشغيل الجديد بـEADDRINUSE ويبقى القديم يخدم قاعدة محذوفة)
kill_port() {
  local pids
  pids=$( (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true )
  if [ -n "$pids" ]; then
    echo "   إيقاف خادم قديم على $PORT: $pids"
    for pid in $pids; do kill -TERM "$pid" 2>/dev/null || true; done
    sleep 1
    for pid in $pids; do kill -9 "$pid" 2>/dev/null || true; done
    sleep 1
  fi
  return 0
}
kill_port
rm -rf "$FULL"
mkdir -p "$FULL"
# نسخ شجرة العمل بلا ما لا يلزم للخادم
tar -C "$REPO" --exclude=.git --exclude=node_modules --exclude=uploads -cf - . | tar -xf - -C "$FULL"
mkdir -p "$FULL/data"

echo "── 4) تشغيل أولي لإنشاء المخطط ثم إيقافه"
cd "$FULL"
env_qa() { PORT="$PORT" ADMIN_API_SECRET=qa-admin-secret PAYMENTS_SHARED_SECRET=qa-shared-secret \
  USD_GOLD_RATE=100 DM_TEST_MODE=1 DM_SEED_SUPER_PW=QaTest12345 "$@"; }
env_qa node server.js > "$FULL/boot.log" 2>&1 &
BOOT_PID=$!
for i in $(seq 1 20); do
  if (ss -ltn 2>/dev/null | grep -q ":$PORT ") || grep -qi "listening\|$PORT" "$FULL/boot.log" 2>/dev/null; then break; fi
  sleep 0.5
done
sleep 1
kill -TERM $BOOT_PID 2>/dev/null || true
for i in 1 2 3 4 5 6; do kill -0 $BOOT_PID 2>/dev/null || break; sleep 0.5; done
kill -9 $BOOT_PID 2>/dev/null || true
kill_port   # ضمان تحرير المنفذ قبل تشغيل الخادم النهائي

echo "── 5) بذر مستخدمو QA (qa_player=18 · qa_admin=19 · qa_super=20)"
node tests/_mkusers.js 2>&1 | grep -E 'أُنشئ|محدَّث' || echo "   ⚠ فشل البذر — راجع الرسالة أعلاه"

echo "── 6) تشغيل الخادم النهائي (خلفية) → $FULL/server.log"
cd "$FULL"
env_qa nohup node server.js > "$FULL/server.log" 2>&1 &
sleep 3
if grep -qi "listen\|يعمل\|running\|$PORT" "$FULL/server.log" 2>/dev/null || (ss -ltn 2>/dev/null | grep -q ":$PORT "); then
  echo "✔ الخادم يعمل على http://127.0.0.1:$PORT"
else
  echo "⚠ راجع السجل:"; tail -5 "$FULL/server.log"
fi
echo
echo "بيئة جاهزة. للتشغيل:"
echo "  export PATH=$NODE_DIR/bin:\$PATH NODE_PATH=$PW_DIR/node_modules PLAYWRIGHT_BROWSERS_PATH=$BROWSERS"

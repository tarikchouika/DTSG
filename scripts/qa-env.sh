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
# [v2.77.0] كان الحرف x64 مكتوباً ثابتاً ⇒ على هذا الهاتف (aarch64) كان السكربت
# يُنزّل نسخة Intel غير قابلة للتنفيذ («cannot execute: required file not found»)
# فتفشل كل أجنحة الاختبار بصمت شبه صامت. المعمارية تُشتق الآن من uname.
case "$(uname -m)" in
  x86_64|amd64)  NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "   ⚠ معمارية غير معروفة: $(uname -m) — أوقف"; exit 1 ;;
esac
NODE_TAR="node-v$NODE_VER-linux-$NODE_ARCH.tar.xz"
if [ ! -x "$NODE_DIR/bin/node" ] || ! "$NODE_DIR/bin/node" -v >/dev/null 2>&1; then
  [ -d "$NODE_DIR" ] && rm -rf "$NODE_DIR"      # نسخة تالفة/بمعمارية أخرى
  curl -fsSL "https://nodejs.org/dist/v$NODE_VER/$NODE_TAR" -o /tmp/node.tar.xz
  mkdir -p "$NODE_DIR"
  tar -xJf /tmp/node.tar.xz -C "$NODE_DIR" --strip-components=1
  rm -f /tmp/node.tar.xz
  "$NODE_DIR/bin/node" -v >/dev/null 2>&1 || { echo "   ✗ $NODE_TAR غير قابل للتنفيذ على $(uname -m)"; exit 1; }
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
  # [v2.77] ss/netstat معطّلان في حاوية هذه telephony (يعيدان قائمة فارغة بلا خطأ)
  # ⇒ كان kill_port يعتبر المنفذ حراً، فيبقى الخادم القديم حيّاً على 3971
  # ويخدم /tmp/full المحذوف (قاعدة بملف inode محذوف) ⇒ كل تسجيل دخول يفشل 401
  # والأباجنحة كلها تسقط بلا سبب حقيقي. نضيف مساراً احتياطياً عبر /proc.
  pids=$( (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true )
  if [ -z "${pids// /}" ]; then
    pids=$( { for e in /proc/[0-9]*/environ; do
                tr '\0' '\n' < "$e" 2>/dev/null | grep -qx "PORT=$PORT" && basename "$(dirname "$e")"
              done | sort -u; } 2>/dev/null || true )
  fi
  if [ -n "${pids// /}" ]; then
    echo "   إيقاف خادم قديم على $PORT: $pids"
    for pid in $pids; do kill -TERM "$pid" 2>/dev/null || true; done
    sleep 1
    for pid in $pids; do kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true; done
    sleep 1
  fi
  return 0
}
kill_port
rm -rf "$FULL"
mkdir -p "$FULL"
# نسخ شجرة العمل بلا ما لا يلزم للخادم
# [ما بعد v2.80.0-ISOLATION] `data/` كان يُنسخ ضمناً: فهو مستثنى في .gitignore لا من
# الأمر، فكانت «البيئة المعزولة» (القاعدة 13) تنهض على **نسخة من قاعدة الإنتاج
# المالية** — أرصدة حقيقية + تذاكر + سجل معاملات. أثران مؤكَّدان:
#   (1) خطر: الاختبارات تكتب داخل بيانات المال الحقيقية المنسوخة، وأي فحص
#       يفتح 'data/royalcoin.db' أثناء تشغيله من جذر المستودع يقرأ الإنتاج.
#   (2) أثر وظيفي: seedIfEmpty() في server.js يتخطّى الزرع عند قاعدة غير فارغة
#       ⇒ لا حساب super ⇒ اختبارات الصلاحيات المرتفعة تسقط بلا سبب في المنتج
#       ([v2.80] حراس الأمن: 13/15 بدل 15/15 على قاعدة نظيفة).
# القاعدة 13 قائمة أصلاً («خادم اختبار كامل بنسخة … وقاعدة نظيفة») — هذا التطبيق
# هو ما كان ناقصاً.
# [v2.81] مخرجات بناء Capacitor/Android تُبنى محلياً بالوثائق (scripts/prepare-www.sh)
# ⇒ www/ و android/ و .gradle/ تظهر في جذر المستودع، ونسخها إلى صندوق QA ثقيل بلا فائدة.
tar -C "$REPO" --exclude=.git --exclude=node_modules --exclude=uploads --exclude=.env.local --exclude=.env --exclude=data \
    --exclude=www --exclude=android --exclude=.gradle -cf - . | tar -xf - -C "$FULL"
mkdir -p "$FULL/data"

echo "── 4) تشغيل أولي لإنشاء المخطط ثم إيقافه"
cd "$FULL"
# [v2.45.1] TELEGRAM_ADMIN_CHAT_ID/SUPPORT_SUPER_TG كانا ناقصين ⇒ اختبار الكوبونات
# (_pay_v243 §د) يسقط بـ403 لأن صلاحية السوبر أدمن تُقرأ من هذين المتغيّرين.
env_qa() { PORT="$PORT" ADMIN_API_SECRET=qa-admin-secret PAYMENTS_SHARED_SECRET=qa-shared-secret \
  USD_GOLD_RATE=100 DM_TEST_MODE=1 DM_SEED_SUPER_PW=QaTest12345 \
  TELEGRAM_ADMIN_CHAT_ID="${TELEGRAM_ADMIN_CHAT_ID:-999000001}" \
  SUPPORT_SUPER_TG="${SUPPORT_SUPER_TG:-999000001}" \
  FINANCIALS_WEBHOOK_SECRET=whsec-news-test \
  "$@"; }
# [ما بعد v2.80.0] FINANCIALS_WEBHOOK_SECRET أعلاه ليس للتجربة: [v2.80] جعل ويب هوك المالية
# **فشلاً مغلقاً** (`!secret || got !== secret` ⇒ 403)، وقسم «حيّ» في
# tests/_news_banner_v273_test.js يرسل الترويسة الصحيحة — بلا سرّ على خادم QA
# كان القسم يُسقط 403 ويُحسب فشلاً على المنتج. القيمة نفسها التي يضعها ذلك الملف.
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
# [v2.77] الفحص القديم كان يمرّ على presence الكلمة «listen» أو رقم المنفذ داخل
# السجل — وسجل EADDRINUSE يحوي الرقم 3971 ⇒ يُعلن نجاحاً والخادم ميّت. الآن
# نطلب من الخادم نفسه أن يردّ فعلاً.
if curl -sf -m 5 "http://127.0.0.1:$PORT/api/promotions" >/dev/null 2>&1; then
  echo "✔ الخادم يعمل على http://127.0.0.1:$PORT (تحقّق حقيقي بطلب HTTP)"
else
  echo "⚠ الخادم لا يردّ — راجع السجل:"; tail -8 "$FULL/server.log"; exit 1
fi
echo
echo "بيئة جاهزة. للتشغيل:"
echo "  export PATH=$NODE_DIR/bin:\$PATH NODE_PATH=$PW_DIR/node_modules PLAYWRIGHT_BROWSERS_PATH=$BROWSERS"

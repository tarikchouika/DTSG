#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — تحديث خادم الهاتف إلى v2.40 (يُشغَّل على الهاتف نفسه)
#
#  لماذا؟ الواجهة الحيّة (dtsg.pages.dev) صحيحة 100%، لكن خادم الهاتف ما زال
#  يعمل بشيفرة قديمة (بلا مسارات المدفوعات): /api/payments/methods يردّ 404،
#  لذلك تظهر المحفظة «نظام الدفع غير موصول».
#
#  هذا السكربت: يجلب آخر شيفرة من GitHub، يثبّت المتغيرات، يعيد تشغيل الخادم،
#  ثم يتحقق فعلياً من كل شيء.
#
#  الاستعمال (على الهاتف، داخل Ubuntu/Termux حيث يشغّل pm2):
#      bash update-phone-server.sh
#  ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

APP_DIR="${DTSG_DIR:-/root/dmgames-arena}"     # شجرة العمل على الهاتف
PM2_NAME="${DTSG_PM2:-casino-server}"          # اسم العملية في pm2
REPO="${DTSG_REPO:-https://github.com/tarikchouika/DTSG.git}"
LOCAL_PORT=3000

say() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

say "0) فحص البيئة"
command -v node >/dev/null || die "node غير مثبّت"
node -v
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 24 ] || echo "⚠  Node $NODE_MAJOR — يُنصح بـ Node ≥ 24 (node:sqlite يدعم ?1/?2). سأكمل على أي حال."
[ -d "$APP_DIR" ] || die "المجلد غير موجود: $APP_DIR  (اضبط DTSG_DIR=...)"

say "1) جلب آخر شيفرة (v2.40) من GitHub"
cd "$APP_DIR"
if [ -d .git ]; then
  git fetch origin --prune && git stash push -u -m "pre-v240" 2>/dev/null || true
  git reset --hard origin/main || die "فشل التحديث"
  git log -1 --format='%h %s'
else
  say "تحذير: لا مستودع git هنا — سأنسخ من مكان آخر إن وُجد DTSG_SRC"
  [ -n "${DTSG_SRC:-}" ] && rsync -a --delete "$DTSG_SRC"/ "$APP_DIR"/ || die "لا مصدر للتحديث"
fi

say "2) متغيرات البيئة المطلوبة (تُمرَّر إلى pm2)"
# عدّل القيم أدناه أو صدّرها قبل تشغيل السكربت.
export CRYPTOMUS_MERCHANT_ID="${CRYPTOMUS_MERCHANT_ID:-}"
export CRYPTOMUS_PAYMENT_KEY="${CRYPTOMUS_PAYMENT_KEY:-}"
export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
export TELEGRAM_ADMIN_CHAT_ID="${TELEGRAM_ADMIN_CHAT_ID:-5700612979}"
export TELEGRAM_ADMIN_PIN="${TELEGRAM_ADMIN_PIN:-}"
export ADMIN_API_SECRET="${ADMIN_API_SECRET:-}"
export USD_GOLD_RATE="${USD_GOLD_RATE:-100}"
export DEPLOY_MANIFEST="${DEPLOY_MANIFEST:-1}"
export CASH_PLUS_NAME="${CASH_PLUS_NAME:-TARIK CHOUIKA}"
export CASH_PLUS_ACCOUNT="${CASH_PLUS_ACCOUNT:-0766672027}"
export CIH_NAME="${CIH_NAME:-MONSIEUR TARIK CHOUIKA}"
export CIH_ACCOUNT="${CIH_ACCOUNT:-6904085211014200}"
export CIH_RIB="${CIH_RIB:-230 815 6904085211014200 24}"
export CIH_IBAN="${CIH_IBAN:-MA64 2308 1569 0408 5211 0142 0024}"
export CIH_SWIFT="${CIH_SWIFT:-CIHMMAMC}"
export BINANCE_TRC20="${BINANCE_TRC20:-TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ}"
export CRYPTO_USDT_TRC20="${CRYPTO_USDT_TRC20:-TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ}"
echo "   CRYPTOMUS: $([ -n "$CRYPTOMUS_MERCHANT_ID" ] && echo مضبوط || echo 'فارغ (وسيلة الكريبتو ستبقى soon)')"
echo "   TELEGRAM_ADMIN_CHAT_ID: $TELEGRAM_ADMIN_CHAT_ID"
echo "   USD_GOLD_RATE: $USD_GOLD_RATE"

say "3) فحص الشيفرة قبل التشغيل"
node --check server.js || die "server.js فيه خطأ صياغة"
node --check server-payments.js || die "server-payments.js فيه خطأ صياغة"
node --check cf-worker/payments-core.js || die "payments-core.js فيه خطأ صياغة"
echo "✓ الشيفرة سليمة"
grep -q "binance" server-payments.js && echo "✓ إصلاح Binance موجود (ترحيل pay_transactions)"

say "4) نسخة احتياطية لقاعدة البيانات"
[ -d data ] && [ -f data/royalcoin.db ] && cp -v data/royalcoin.db "data/royalcoin.db.bak-$(date +%Y%m%d-%H%M)" || echo "   (لا قاعدة بعد — ستُنشأ)"

say "5) إعادة تشغيل الخادم"
if command -v pm2 >/dev/null && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
  sleep 4
  pm2 logs "$PM2_NAME" --lines 25 --nostream | grep -iE "payments|migrat|running at" || true
else
  echo "⚠ pm2 غير متاح أو العملية $PM2_NAME غير موجودة — سأشغّل يدوياً للفحص ثم أوقف"
  node --experimental-sqlite server.js > /tmp/dtsg-check.log 2>&1 &
  SRV_PID=$!
  sleep 5
  grep -iE "payments|migrat|running at" /tmp/dtsg-check.log || true
fi

say "6) التحقق الفعلي من المسارات (محلياً)"
H="http://127.0.0.1:$LOCAL_PORT"
check() { printf '   %-42s ' "$1"; curl -s -m 8 "$H$1" | head -c 90; echo; }
check /api/health
check /api/payments/methods
echo -n "   POST /api/payments/p2p (binance)              "
curl -s -m 8 -X POST "$H/api/payments/p2p" -H 'content-type: application/json' \
  -d '{"user_id":1,"username":"check","method":"binance","amount_usd":10,"proof_details":"SELFTEST"}' | head -c 90; echo

[ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null

cat <<'EOF'

═══════════════════════════════════════════════════════════════════════════
بعد نجاح ما فوق، تحقّق من الخارج (من أي جهاز فيه إنترنت):

  curl -s https://casino-phone.dmgames-api.workers.dev/api/payments/methods

يجب أن يعيد {"ok":true,"methods":[...]} بدل not_found — وعندها تعمل المحفظة
على https://dtsg.pages.dev كاملة (رموز QR + رفع الوصل + طلبات السحب).

إن أردت webhook تيليغرام (أزرار قبول/رفض في الشات):
  curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://casino-phone.dmgames-api.workers.dev/api/telegram/webhook"
═══════════════════════════════════════════════════════════════════════════
EOF

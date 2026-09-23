#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — تحديث خادم الهاتف إلى v2.40.4 (يُشغَّل على الهاتف نفسه)
#
#  لماذا؟ الواجهة الحيّة (dtsg.pages.dev) صحيحة 100%، لكن خادم الهاتف قد يعمل
#  بشجرة قديمة (بلا طبقة المدفوعات): /api/payments/methods يردّ 404 فتظهر
#  المحفظة «نظام الدفع غير موصول».
#
#  [v2.40.4] أهم ما أُضيف بعد فشل جولة 17/09 22:4x:
#    1) يكتشف تلقائياً المجلد الذي يشغّله pm2 فعلاً (pm_cwd) — لأن التحديث كان
#       يُطبَّق على /root/dmgames-arena بينما العملية تخدم شجرة أخرى فتضيع التغييرات.
#    2) يتحقق من وجود الملفات الحاسمة بعد الجلب (server-payments.js, js/wallet.js,
#       payments-url.json) ويفشل بصوت عالٍ إن كانت ناقصة، ويتحقق من بوابة Binance Pay.
#    3) يتحقق بعد إعادة التشغيل أن النسخة المشغَّلة فعلًا هي الجديدة (/api/health
#       يعيد build) محلياً وعبر الرابط العام — لا «نجاح شكلي».
#    4) فحص أمني: قاعدة البيانات وملفات الخادم يجب أن تردّ 404 عمومياً.
#
#  الاستعمال (على الهاتف، داخل Ubuntu/Termux حيث يشغّل pm2):
#      bash scripts/update-phone-server.sh
#  خيارات: DTSG_DIR=...  DTSG_PM2=...  DTSG_PUBLIC=https://...  SKIP_PULL=1
#  ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

# [2026-09-22] مصدر البيئة الوحيد: .env.local بجوار المستودع — يمنع تكرار حادثة
# «pm2 restart --update-env» من صدفة ناقصة (مُسحت كل متغيرات الدفع والبوتات).
ENV_FILE="${DTSG_ENV_FILE:-/root/DTSG/.env.local}"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
  echo "ℹ️  حُمّلت البيئة من $ENV_FILE"
else
  echo "⚠  لا يوجد $ENV_FILE — ستُستعمل القيم الموجودة في صدفتك فقط."
fi

APP_DIR="${DTSG_DIR:-/root/DTSG}"     # شجرة العمل على الهاتف
PM2_NAME="${DTSG_PM2:-casino-server}"          # اسم العملية في pm2
REPO="${DTSG_REPO:-https://github.com/tarikchouika/DTSG.git}"
LOCAL_PORT="${DTSG_PORT:-3000}"
PUBLIC="${DTSG_PUBLIC:-https://casino-phone.dmgames-api.workers.dev}"
EXPECT_FILES=(server.js server-payments.js server-support.js server-private-chat.js cf-worker/payments-core.js js/wallet.js payments-url.json support.html)

say() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok()  { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[1;31m✗\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
# [v2.58-GUARD] -L إلزامية في كل فحص حالة: بلاها يعيد redirect فارغاً ⇒ نتيجة «0» زائفة
# (الدرس الموثّق من حادثة cat: v2.48.1). المحلية لا تتأثر (لا redirect على 127.0.0.1).
jget() { curl -sL -m 10 "$1" 2>/dev/null; }
code() { curl -sL -m 10 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null; }

say "0) فحص البيئة"
have node || die "node غير مثبّت"
node -v
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 24 ] || echo "⚠  Node $NODE_MAJOR — يُنصح بـ Node ≥ 24 (node:sqlite يدعم ?1/?2). سأكمل على أي حال."

say "0.b) اكتشاف المجلد الذي يشغّله pm2 فعلاً  ⬅ الأهم"
PM2_DIR=""
if have pm2; then
  PM2_DIR="$(pm2 jlist 2>/dev/null | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      let a=[];try{a=JSON.parse(s||"[]")}catch(e){}
      const want=process.env.DTSG_PM2||"casino-server";
      const hit=a.find(x=>(x.name===want))||a.find(x=>String((x.pm2_env||{}).pm_cwd||"").includes("dmgames"));
      if(hit)process.stdout.write(String((hit.pm2_env||{}).pm_cwd||""));
    });' 2>/dev/null)"
  if [ -n "$PM2_DIR" ] && [ -d "$PM2_DIR" ]; then
    if [ "$PM2_DIR" != "$APP_DIR" ]; then
      echo "   ⚠ pm2 يشغّل: $PM2_DIR"
      echo "     وأنت تحدّث: $APP_DIR"
      echo "     ⇒ سأحدّث المجلد الذي يشغّله pm2 فعلاً (هذا سبب ضياع التحديث السابق)."
      echo "     (لتثبيت مجلد آخر: DTSG_DIR=... DTSG_FORCE_DIR=1)"
      [ "${DTSG_FORCE_DIR:-0}" = "1" ] || APP_DIR="$PM2_DIR"
    else
      ok "pm2 يشغّل نفس المجلد: $APP_DIR"
    fi
  else
    echo "   (لم أستطع قراءة pm_cwd من pm2 — سأكمل على $APP_DIR)"
  fi
else
  echo "   ⚠ pm2 غير مثبّت في هذه البيئة"
fi
[ -d "$APP_DIR" ] || die "المجلد غير موجود: $APP_DIR  (اضبط DTSG_DIR=...)"
echo "   المجلد المعتمد: $APP_DIR"

say "0.c) نسخة احتياطية كاملة للشجرة قبل أي تعديل  ⬅ شبكة أمان"
BK="/root/dtsg-tree-backup-$(date +%Y%m%d-%H%M).tgz"
if tar czf "$BK" --exclude=node_modules --exclude=.git --exclude='*.db-wal' --exclude='*.db-shm' -C "$APP_DIR" . 2>/dev/null; then
  ok "نسخة احتياطية: $BK ($(du -h "$BK" | cut -f1))"
else
  warn "فشل إنشاء النسخة الاحتياطية (سأكمل — لكن انتبه)"
fi
echo "   قاعدة البيانات تُنسخ أيضاً في الخطوة 4."

say "1) جلب آخر شيفرة (v2.40.4) من GitHub"
cd "$APP_DIR" || die "لا يمكن الدخول إلى $APP_DIR"
if [ "${SKIP_PULL:-0}" != "1" ]; then
  if [ -d .git ]; then
    git fetch origin --prune || die "فشل git fetch (شبكة/توثيق)"
    git stash push -u -m "pre-v240-update" 2>/dev/null || true
    git reset --hard origin/main || die "فشل git reset --hard origin/main"
    git log -1 --format='%h %s'
  else
    say "تحذير: لا مستودع git هنا — أنسخ من DTSG_SRC"
    if [ -n "${DTSG_SRC:-}" ]; then rsync -a --delete "$DTSG_SRC"/ "$APP_DIR"/ || die "فشل النسخ"; else die "لا مصدر للتحديث (DTSG_SRC غير مضبوط)"; fi
  fi
fi

say "1.b) التحقق من وجود ملفات المدفوعات  ⬅ كان يفشل بصمت سابقاً"
MISS=0
for f in "${EXPECT_FILES[@]}"; do
  if [ -f "$f" ]; then ok "$f"; else bad "مفقود: $f"; MISS=1; fi
done
grep -q 'binancepay/openapi/v2/order' cf-worker/payments-core.js 2>/dev/null && ok "بوابة Binance Pay موجودة في payments-core.js" || bad "payments-core.js بلا بوابة Binance Pay (شجرة قديمة)"
[ "$MISS" = "0" ] || die "الشجرة غير مكتملة بعد الجلب — التحديث لم يُطبَّق على المجلد الصحيح. أوقف هنا ولا تعِد التشغيل."
echo "   إصدار package.json: $(node -p "require('./package.json').version" 2>/dev/null)"
echo "   (المتوقع ≥ 2.40.4)"

say "2) متغيرات البيئة (تُمرَّر إلى pm2)"
# [v2.45] بوابة الشحن التلقائي (بديل Cryptomus الذي أُزيل) — من البيئة فقط، لا تُكتب في المستودع
export BINANCE_PAY_MERCHANT_ID="${BINANCE_PAY_MERCHANT_ID:-}"
export BINANCE_PAY_API_KEY="${BINANCE_PAY_API_KEY:-}"
export BINANCE_PAY_SECRET_KEY="${BINANCE_PAY_SECRET_KEY:-}"
export BINANCE_PAY_CURRENCY="${BINANCE_PAY_CURRENCY:-USDT}"
export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
export TELEGRAM_ADMIN_CHAT_ID="${TELEGRAM_ADMIN_CHAT_ID:-}"
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
# [v2.41] بوت دعم العملاء @dtsgsupports_bot — التوكن والسرّ متطابقان مع setWebhook في Telegram
export SUPPORT_BOT_TOKEN="${SUPPORT_BOT_TOKEN:-}"   # [v2.44-أمن] من البيئة فقط — لا يُكتب في المستودع
export SUPPORT_WEBHOOK_SECRET="${SUPPORT_WEBHOOK_SECRET:-}"
export SUPPORT_BOT_USERNAME="${SUPPORT_BOT_USERNAME:-dtsgsupports_bot}"
export SUPPORT_SUPER_TG="${SUPPORT_SUPER_TG:-${TELEGRAM_ADMIN_CHAT_ID:-}}"
# [v2.56] بوت الدردشة الخاصة: لا يُقبل أي حساب تيليغرام بلا رابط صادر من جلسة المنصة
export PRIVATE_CHAT_BOT_TOKEN="${PRIVATE_CHAT_BOT_TOKEN:-}"
export PRIVATE_CHAT_BOT_USERNAME="${PRIVATE_CHAT_BOT_USERNAME:-}"
export PRIVATE_CHAT_WEBHOOK_SECRET="${PRIVATE_CHAT_WEBHOOK_SECRET:-}"
export PRIVATE_CHAT_TG_API="${PRIVATE_CHAT_TG_API:-https://api.telegram.org}"
echo "   BINANCE_PAY: $([ -n "$BINANCE_PAY_API_KEY" ] && [ -n "$BINANCE_PAY_SECRET_KEY" ] && echo مضبوط || echo 'فارغ (الشحن التلقائي سيبقى soon)') · العملة: $BINANCE_PAY_CURRENCY"
echo "   TELEGRAM_ADMIN_CHAT_ID: $TELEGRAM_ADMIN_CHAT_ID · USD_GOLD_RATE: $USD_GOLD_RATE"
echo "   SUPPORT_BOT_TOKEN: $([ -n "$SUPPORT_BOT_TOKEN" ] && echo مضبوط || echo فارغ) · السرّ: $([ -n "$SUPPORT_WEBHOOK_SECRET" ] && echo مضبوط || echo فارغ)"
echo "   PRIVATE_CHAT_BOT_TOKEN: $([ -n "$PRIVATE_CHAT_BOT_TOKEN" ] && echo مضبوط || echo فارغ) · username: ${PRIVATE_CHAT_BOT_USERNAME:-غير مضبوط} · السرّ: $([ -n "$PRIVATE_CHAT_WEBHOOK_SECRET" ] && echo مضبوط || echo فارغ)"
echo "   TELEGRAM_BOT_TOKEN: $([ -n "$TELEGRAM_BOT_TOKEN" ] && echo مضبوط || echo 'فارغ (بوت المدفوعات معطّل)')"
[ -n "${SUPPORT_BOT_TOKEN:-}" ] && {
  SM="$(curl -s -m 12 "https://api.telegram.org/bot$SUPPORT_BOT_TOKEN/getMe" | "$(command -v node || echo node)" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write("@"+(JSON.parse(s).result.username||"?"))}catch(e){process.stdout.write("تعذّر التحقق")}})')"
  echo "   بوت الدعم المُتحقَّق: $SM"
}

say "3) فحص الشيفرة قبل التشغيل"
node --check server.js || die "server.js فيه خطأ صياغة"
node --check server-payments.js || die "server-payments.js فيه خطأ صياغة"
node --check cf-worker/payments-core.js || die "payments-core.js فيه خطأ صياغة"
json_ok() { node -e "const fs=require('fs');JSON.parse(fs.readFileSync('$1','utf8'))" 2>/dev/null; }
for j in payments-url.json api-url2.json package.json; do [ -f "$j" ] && { json_ok "$j" && ok "$j صالح" || die "$j JSON تالف"; }; done
ok "الشيفرة سليمة"
grep -q "binance" server-payments.js && ok "إصلاح Binance موجود (ترحيل pay_transactions)"
grep -q "isDeniedStatic" server.js && ok "حماية ملفات الخادم/القاعدة موجودة (v2.40.4)"
grep -q "sup_tickets" server-support.js && ok "محرّك بوت الدعم موجود (v2.41)"
node --check server-support.js || die "server-support.js فيه خطأ صياغة"

say "4) نسخة احتياطية لقاعدة البيانات"
[ -f data/royalcoin.db ] && cp -v data/royalcoin.db "data/royalcoin.db.bak-$(date +%Y%m%d-%H%M)" || echo "   (لا قاعدة بعد — ستُنشأ)"

say "5) إعادة تشغيل الخادم"
# [2026-09-22] حارس إلزامي: لا نعيد التشغيل ببيئة ناقصة — كان هذا سبب مسح متغيرات
# الدفع والبوتات (pm2 restart --update-env) ثم حفظ الحالة المكسورة.
MISSING_KEYS=""
for k in TELEGRAM_BOT_TOKEN ADMIN_API_SECRET SUPPORT_BOT_TOKEN SUPPORT_WEBHOOK_SECRET \
         PRIVATE_CHAT_BOT_TOKEN PRIVATE_CHAT_WEBHOOK_SECRET BINANCE_PAY_API_KEY BINANCE_PAY_SECRET_KEY \
         BINANCE_PAY_MERCHANT_ID CASH_PLUS_ACCOUNT CIH_ACCOUNT BINANCE_TRC20; do
  [ -n "$(eval "printf '%s' \"\${$k:-}\"")" ] || MISSING_KEYS="$MISSING_KEYS $k"
done
[ -z "$MISSING_KEYS" ] || die "بيئة ناقصة:$MISSING_KEYS — اضبط $ENV_FILE ثم أعد المحاولة (أُوقف التشغيل لحماية المنصة)."
ok "البيئة مكتملة (12 مفتاحاً حرجاً)"
if have pm2 && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  # [v2.58-GUARD] إعادة التشغيل حصراً عبر المسار المعتمد: phone-env-restart.sh
  # (بيئة كاملة من .env.local + تحقق حيّ من متغيرات العملية) — لا --update-env حرّ أبداً
  # (حادثة 2026-09-22: --update-env من صدفة ناقصة مسح كل متغيرات الدفع والبوتات).
  bash "$APP_DIR/scripts/phone-env-restart.sh" || die "phone-env-restart.sh فشل — راجع $ENV_FILE (لا نستمر ببيئة مكسورة)"
  sleep 5
  pm2 logs "$PM2_NAME" --lines 30 --nostream 2>/dev/null | grep -iE "payments|migrat|running at" || true
  echo "   حالة pm2: $(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let a=[];try{a=JSON.parse(s||"[]")}catch(e){};const w=process.env.DTSG_PM2||"casino-server";const h=a.find(x=>x.name===w);process.stdout.write(h?((h.pm2_env.status||"?")+" · إعادات="+(h.pm2_env.restart_time||0)):"غير موجودة")})')"
else
  echo "   ⚠ pm2 غير متاح أو العملية $PM2_NAME غير موجودة — تشغيل يدوي للفحص فقط"
  node server.js > /tmp/dtsg-check.log 2>&1 &
  SRV_PID=$!; sleep 6
  grep -iE "payments|migrat|running at" /tmp/dtsg-check.log || true
fi

say "6) التحقق من النسخة المشغَّلة فعلاً (محلياً)"
H="http://127.0.0.1:$LOCAL_PORT"
BUILD_LOCAL="$(jget "$H/api/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).build||""))}catch(e){}})')"
echo "   /api/health build = ${BUILD_LOCAL:-<فارغ>}   (v2.40.4 تعني الخادم الجديد)"
[ -n "$BUILD_LOCAL" ] || bad "الخادم لا يعيد بصمة build — ما زال يشغّل الشيفرة القديمة"
printf '   %-34s ' "/api/payments/methods"; M="$(jget "$H/api/payments/methods")"; echo "${M:0:110}"
echo "$M" | grep -q '"methods"' && ok "طبقة المدفوعات تعمل محلياً" || bad "المدفوعات ما زالت معطّلة محلياً"
printf '   %-34s ' "/api/deploy/manifest"; echo "$(jget "$H/api/deploy/manifest" | head -c 90)"

say "5.b) فحوص بوت الدعم (v2.41)"
printf '   %-40s ' "POST /api/support/webhook (بحث السرّ)"; WC="$(curl -s -m 15 -o /dev/null -w '%{http_code}' -X POST "$H/api/support/webhook" -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: $SUPPORT_WEBHOOK_SECRET" -d '{"update_id":900001}')"
[ "$WC" = "200" ] && ok "يعمل (200)" || bad "code=$WC (توقّع 200)"
printf '   %-40s ' "GET /api/support/status (بلا جلسة)"; SC="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/api/support/status")"
[ "$SC" = "401" ] && ok "محمي (401)" || bad "code=$SC (توقّع 401)"
printf '   %-40s ' "صفحة support.html"; PC="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/support.html")"
[ "$PC" = "200" ] && ok "منشورة (200)" || bad "code=$PC"
printf '   %-40s ' "طابور الأدمن (بلا جلسة)"; AC="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/api/support/admin/queue")"
[ "$AC" = "401" ] && ok "محمي (401)" || bad "code=$AC (توقّع 401)"

say "6.b) فحص أمني (يجب أن تردّ 404)"
for f in /data/royalcoin.db /server.js /package.json; do
  c="$(code "$H$f")"
  [ "$c" = "404" ] && ok "$f → 404" || bad "$f → $c (مكشوف! شغّل شيفرة v2.40.4)"
done

[ -n "${SRV_PID:-}" ] && { kill "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null; }

say "7) التحقق من الخارج عبر الرابط العام"
printf '   %-46s ' "$PUBLIC/api/health"; PH="$(jget "$PUBLIC/api/health")"; echo "${PH:0:110}"
BUILD_PUB="$(printf '%s' "$PH" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).build||""))}catch(e){}})')"
printf '   %-46s ' "$PUBLIC/api/payments/methods"; PM="$(jget "$PUBLIC/api/payments/methods")"; echo "${PM:0:110}"
printf '   %-46s ' "$PUBLIC/data/royalcoin.db (يجب 404)"; echo "$(code "$PUBLIC/data/royalcoin.db")"
printf '   %-46s ' "$PUBLIC/api/support/webhook (بوت الدعم)"; SWC="$(curl -sL -m 20 -o /dev/null -w '%{http_code}' -X POST "$PUBLIC/api/support/webhook" -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: $SUPPORT_WEBHOOK_SECRET" -d '{"update_id":900002}')"; echo "$SWC"
printf '   %-46s ' "$PUBLIC/support.html"; echo "$(code "$PUBLIC/support.html")"

RC=0
echo "$PM" | grep -q '"methods"' || { bad "المدفوعات لا تعمل عبر الرابط العام"; RC=1; }
[ "$BUILD_PUB" = "$(node -p "require('./package.json').version" 2>/dev/null)" ] || { bad "نسخة الرابط العام ($BUILD_PUB) لا تطابق الشجرة ($(node -p "require('./package.json').version"))"; RC=1; }
[ "$(code "$PUBLIC/data/royalcoin.db")" = "404" ] || { bad "قاعدة البيانات ما زالت مكشوفة عمومياً"; RC=1; }
[ "$SWC" = "200" ] || { bad "بوت الدعم لا يستقبل التحديثات عمومياً (code=$SWC) — راجع SUPPORT_WEBHOOK_SECRET"; RC=1; }

printf '\n═══════════════════════════════════════════════════════════════════════════\n'
if [ "$RC" = "0" ]; then
  printf '\033[1;32m✅ نجح التحديث: المدفوعات تعمل والأمن مغلق. المحفظة على dtsg.pages.dev شغّالة الآن.\033[0m\n'
else
  printf '\033[1;31m✗ فشل التحقق — أرسل مخرجات هذا السكربت كما هي.\033[0m\n'
  printf '   تشخيص سريع: bash scripts/phone-doctor.sh\n'
fi
printf '   webhook تيليغرام (اختياري):\n     curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook?url=%s/api/telegram/webhook"\n' "$PUBLIC"
printf '═══════════════════════════════════════════════════════════════════════════\n'
exit "$RC"

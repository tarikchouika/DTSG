#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — إعادة تشغيل خادم الهاتف/البوتات بالبيئة الكاملة (المصدر الوحيد: .env.local)
#
#  لماذا هذا السكربت؟
#    حادثة 2026-09-22: نُفِّذ `pm2 restart casino-server --update-env` من صدفة
#    لا تحمل إلا متغيراً واحداً ⇒ مُسحت كل متغيرات الدفع والبوتات من العملية
#    (Binance Pay · SUPPORT_WEBHOOK_SECRET · ADMIN_API_SECRET · TELEGRAM_BOT_TOKEN…)
#    ثم حُفظت الحالة المكسورة بـ `pm2 save`. هذا السكربت يجعل ذلك مستحيلاً:
#      • يقرأ الأسرار من ملف واحد (‎/root/DTSG/.env.local‎ غير المتعقَّب في git)
#      • يرفض العمل إن كان الملف ناقصاً أو إن كان المجلد هو المستودع القديم
#      • يتحقق بعد التشغيل أن كل مفتاح إلزامي حاضر فعلاً في العملية (pm2 jlist)
#
#  الاستعمال:  bash scripts/phone-env-restart.sh
#  خيارات:     DTSG_ENV_FILE=...   DTSG_PM2=serv1,serv2   DTSG_PORT=3000
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DTSG_ENV_FILE:-$REPO/.env.local}"
PM2_APPS="${DTSG_PM2:-casino-server,dtsg-voucher-bot}"
PORT="${DTSG_PORT:-3000}"

say() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok()  { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[1;31m✗\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

# ── 0) حُرّاس الهوية: لا عمل من المستودع القديم أبداً ──
case "$REPO" in
  *dmgames-arena*|*digital-moroccan-casino*)
    die "هذا المجلد مستودع قديم ($REPO) — المنصة الحيّة في /root/DTSG حصراً." ;;
esac
if git -C "$REPO" remote get-url origin 2>/dev/null | grep -q 'digital-moroccan-casino'; then
  die "remote يشير إلى المستودع القديم — أوقفنا العمل."
fi

# ── 1) الملف الإلزامي ──
say "1) ملف البيئة"
[ -f "$ENV_FILE" ] || die "المفقود: $ENV_FILE — أنشئه من /root/.secrets ثم أعد المحاولة."
chmod 600 "$ENV_FILE" 2>/dev/null || true
( set -a; . "$ENV_FILE"; set +a
  NEEDED="TELEGRAM_BOT_TOKEN ADMIN_API_SECRET BINANCE_PAY_API_KEY BINANCE_PAY_SECRET_KEY
          SUPPORT_BOT_TOKEN SUPPORT_WEBHOOK_SECRET PRIVATE_CHAT_BOT_TOKEN PRIVATE_CHAT_WEBHOOK_SECRET
          CASH_PLUS_ACCOUNT CIH_ACCOUNT BINANCE_TRC20 VOUCHER_BOT_TOKEN BOT_API_SECRET"
  MISS=0
  for k in $NEEDED; do
    v="$(eval "printf '%s' \"\${$k:-}\"")"
    if [ -n "$v" ]; then printf '   \033[1;32m✓\033[0m %s مضبوط\n' "$k"; else printf '   \033[1;31m✗\033[0m %s فارغ\n' "$k"; MISS=1; fi
  done
  [ "$MISS" = "0" ] || { echo; echo "✗ البيئة ناقصة — لن نعيد التشغيل (منعاً لتكرار حادثة المسح)."; exit 3; }
) || die "البيئة غير مكتملة — لم يُمَس أي شيء."

# ── 2) الإيقاف/التشغيل مع البيئة الكاملة ──
say "2) إعادة تشغيل pm2 بالبيئة الكاملة"
command -v pm2 >/dev/null 2>&1 || die "pm2 غير متاح."
set -a; . "$ENV_FILE"; set +a
IFS=',' read -r -a APPS <<< "$PM2_APPS"
RUNNING="$(pm2 jlist 2>/dev/null || echo '[]')"
for app in "${APPS[@]}"; do
  [ -n "$app" ] || continue
  if printf '%s' "$RUNNING" | grep -q "\"name\":\"$app\""; then
    pm2 restart "$app" --update-env >/dev/null 2>&1 && ok "أُعيد تشغيل $app"
  else
    printf '   ⚠ %s غير موجودة في pm2 — تخطٍّ\n' "$app"
  fi
done
sleep 4

# ── 3) التحقق من العملية الحيّة (لا من الصدفة) ──
say "3) تحقق من بيئة العمليات الحيّة"
pm2 jlist 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let a=[];try{a=JSON.parse(s||"[]")}catch(e){}
  const need={ "casino-server":["TELEGRAM_BOT_TOKEN","TELEGRAM_ADMIN_CHAT_ID","ADMIN_API_SECRET","BOT_API_SECRET","BINANCE_PAY_API_KEY","BINANCE_PAY_SECRET_KEY","BINANCE_PAY_MERCHANT_ID","SUPPORT_BOT_TOKEN","SUPPORT_WEBHOOK_SECRET","SUPPORT_BOT_USERNAME","PRIVATE_CHAT_BOT_TOKEN","PRIVATE_CHAT_WEBHOOK_SECRET","CASH_PLUS_ACCOUNT","CIH_ACCOUNT","BINANCE_TRC20","CRYPTO_USDT_TRC20"],
    "dtsg-voucher-bot":["VOUCHER_BOT_TOKEN","BOT_API_SECRET","API_BASE","SUPER_TG","PLATFORM_URL"] };
  let fail=0;
  Object.keys(need).forEach(n=>{
    const p=a.find(x=>x.name===n);
    if(!p){console.log("   ⚠ "+n+" غير مشغّل");return;}
    const e=p.pm2_env||{};
    const miss=need[n].filter(k=>!e[k]);
    if(miss.length){fail++;console.log("   ✗ "+n+" ينقصه: "+miss.join(", "));}
    else console.log("   ✓ "+n+" مكتمل ("+need[n].length+" مفتاحاً) · status="+e.status);
  });
  if(fail) { console.log("\n✗ فشل التحقق — لا تحفظ الحالة. راجع .env.local"); process.exit(9); }
})' || die "بيئة إحدى العمليات ناقصة."

say "4) حفظ الحالة في pm2 (لتعود بعد إعادة تشغيل الهاتف)"
pm2 save >/dev/null 2>&1 && ok "pm2 save تمّ (البيئة سليمة محفوظة)"

say "5) فحص سريع للخادم"
CODE="$(curl -s -m 10 -o /tmp/_dtsg_health.json -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || true)"
if [ "$CODE" = "200" ]; then ok "الصحة 200: $(head -c 120 /tmp/_dtsg_health.json)"; else bad "الصحة code=$CODE"; fi
M="$(curl -s -m 10 "http://127.0.0.1:$PORT/api/payments/methods" || true)"
printf '%s' "$M" | grep -q '"binance_pay_id":"[0-9]' && ok "Binance Pay ظاهر بمعرّف Pay" || bad "Binance Pay بلا معرّف (راجع BINANCE_PAY_MERCHANT_ID)"
printf '%s' "$M" | grep -q '"status":"live"' && ok "وسائل الدفع تعمل" || bad "لا وسيلة دفع live"
echo

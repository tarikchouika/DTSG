#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — تطبيق طبقة بوت الدعم + ودجت المساعدة + إصلاحات v2.43.1  ·  يُشغَّل على الهاتف
#
#  لماذا؟ لو تعذّر `git fetch` (شبكة/توثيق/تعديلات محلية) ننزّل الملفات
#  المطلوبة مباشرة من GitHub (المستودع عام) ونستبدلها بعد نسخة احتياطية.
#
#  الاستعمال:  bash scripts/apply-support-now.sh
#  خيارات:  DTSG_DIR=...  DTSG_PM2=...  SKIP_RESTART=1
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

APP_DIR="${DTSG_DIR:-/root/dmgames-arena}"
PM2_NAME="${DTSG_PM2:-casino-server}"
RAW="${DTSG_RAW:-https://raw.githubusercontent.com/tarikchouika/DTSG/main}"
STAMP="$(date +%Y%m%d-%H%M)"
BK="/root/dtsg-v241-backup-$STAMP"

say() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok()  { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[1;31m✗\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }
have(){ command -v "$1" >/dev/null 2>&1; }

# اكتشاف مجلد pm2 الحقيقي
if have pm2; then
  PM2_DIR="$(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let a=[];try{a=JSON.parse(s||"[]")}catch(e){}const w=process.env.DTSG_PM2||"casino-server";const h=a.find(x=>x.name===w)||a.find(x=>String((x.pm2_env||{}).pm_cwd||"").includes("dmgames"));if(h)process.stdout.write(String((h.pm2_env||{}).pm_cwd||""))})' 2>/dev/null)"
  if [ -n "$PM2_DIR" ] && [ -d "$PM2_DIR" ] && [ "$PM2_DIR" != "$APP_DIR" ] && [ "${DTSG_FORCE_DIR:-0}" != "1" ]; then
    echo "   ⚠ pm2 يشغّل: $PM2_DIR  (سأطبّق هناك — لا على $APP_DIR)"
    APP_DIR="$PM2_DIR"
  fi
fi
[ -d "$APP_DIR" ] || die "المجلد غير موجود: $APP_DIR"
cd "$APP_DIR" || die "لا يمكن الدخول إلى $APP_DIR"
echo "   المجلد: $APP_DIR"

say "1) نسخة احتياطية"
mkdir -p "$BK"/{js/ui,js/i18n,js/core,js/games,css,cf-worker}
cp -a server.js server-payments.js server-support.js support.html package.json "$BK/" 2>/dev/null
cp -a js/ui/bot-chat.js js/ui/legal-ui.js js/i18n/translations.js js/main.js js/core/api.js js/core/auth.js js/core/live.js js/core/live-ws-bridge.js js/wallet.js "$BK"/js/ 2>/dev/null
cp -a js/games/rami.js js/games/ronda.js js/games/dama.js js/games/parchisi.js js/games/engines.js "$BK"/js/games/ 2>/dev/null
cp -a css/09-chrome.css css/06-parchisi.css "$BK"/css/ 2>/dev/null
cp -a cf-worker/payments-core.js "$BK"/cf-worker/ 2>/dev/null
[ -f data/royalcoin.db ] && cp -a data/royalcoin.db "$BK/royalcoin.db" 2>/dev/null
ok "احتياط: $BK"

say "2) تنزيل ملفات v2.43.1 من GitHub"
FILES=(server-support.js server.js server-payments.js support.html package.json \
       cf-worker/payments-core.js \
       js/ui/bot-chat.js js/ui/legal-ui.js js/i18n/translations.js js/main.js \
       js/core/api.js js/core/auth.js js/core/live.js js/core/live-ws-bridge.js js/wallet.js \
       js/games/rami.js js/games/ronda.js js/games/dama.js js/games/parchisi.js js/games/engines.js \
       css/09-chrome.css css/06-parchisi.css \
       index.html CHANGELOG.md)
for f in "${FILES[@]}"; do
  printf '   %-28s ' "$f"
  TMPF="/tmp/.dtsg-dl-$(printf '%s' "$f" | tr '/' '_').tmp"
  mkdir -p "$(dirname "./$f")"
  if curl -fsS -m 40 "$RAW/$f" -o "$TMPF"; then
    sz="$(wc -c < "$TMPF")"
    if [ "$sz" -gt 100 ]; then mv "$TMPF" "./$f"; ok "$sz بايت"; else bad "ملف صغير غير متوقع ($sz)"; fi
  else
    bad "فشل التنزيل (تحقّق من الإنترنت)"
  fi
done
have node && { node --check server-support.js || die "server-support.js تالف"; node --check server.js || die "server.js تالف"; node --check server-payments.js || die "server-payments.js تالف"; node --check cf-worker/payments-core.js || die "payments-core.js تالف"; } 
ok "الشيفرة سليمة (node --check)"

say "3) تفعيل طبقة الدعم في server.js (إن لم تكن مربوطة)"
if grep -q "server-support.js" server.js; then ok "مربوطة سلفاً"; else
  node -e '
   const fs=require("fs"); let s=fs.readFileSync("server.js","utf8");
   if(!s.includes("server-support.js")){
     s=s.replace("pay.setContext(db, users, sessions);",
       "pay.setContext(db, users, sessions);\n/* [Support] بوت دعم العملاء */\nconst sup = require(\u0027./server-support.js\u0027);\nsup.initSupport(db);\nsup.setCtx(db, users, sessions);");
     s=s.replace("if (pay.isPaymentsPath(pathname)) { pay.handlePayments(req, res, body); return; }",
       "if (sup.isSupportPath(pathname)) { sup.handleHttp(req, res, pathname, body, parsedUrl); return; }\n      if (pay.isPaymentsPath(pathname)) { pay.handlePayments(req, res, body); return; }");
     fs.writeFileSync("server.js",s); console.log("   رُبطت");
   }' && ok "تم الربط" || bad "تعذّر الربط التلقائي"
  node --check server.js || die "server.js تالف بعد الربط"
fi

say "4) إعادة التشغيل + التحقق"
if [ "${SKIP_RESTART:-0}" != "1" ] && have pm2 && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env >/dev/null 2>&1 && sleep 5 && ok "أُعيد التشغيل"
else
  echo "   (تخطّي إعادة التشغيل)"
fi
H="http://127.0.0.1:${DTSG_PORT:-3000}"
printf '   %-40s ' "/api/support/webhook"; C="$(curl -s -m 15 -o /dev/null -w '%{http_code}' -X POST "$H/api/support/webhook" -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: ${SUPPORT_WEBHOOK_SECRET:-dtsgsup_k9Qz7mW3xR5tB1nY}" -d '{"update_id":9}')"
[ "$C" = "200" ] && ok "يعمل (200)" || bad "code=$C"
printf '   %-40s ' "/api/support/status"; C2="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/api/support/status")"
[ "$C2" = "401" ] && ok "محمي (401)" || bad "code=$C2"
printf '   %-40s ' "/support.html"; C3="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/support.html")"
[ "$C3" = "200" ] && ok "منشورة" || bad "code=$C3"
printf '   %-40s ' "/api/health build"; curl -s -m 15 "$H/api/health" | head -c 80; echo
printf '   %-40s ' "/api/payments/methods"; C4="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/api/payments/methods")"
[ "$C4" = "200" ] && ok "يعمل (200)" || bad "code=$C4"
printf '   %-40s ' "/api/admin/payments/pending"; C5="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/api/admin/payments/pending")"
[ "$C5" = "403" ] && ok "محمي (403 بلا جلسة)" || bad "code=$C5"

cat <<EOF

═══════════════════════════════════════════════════════════════════════════
إن كانت النتائج أعلاه ✓ فالطبقة جاهزة. للتأكيد الخارجي (من هذا الجهاز أو أي جهاز):

  curl -s -o /dev/null -w '%{http_code}\n' -X POST \\
    https://casino-phone.dmgames-api.workers.dev/api/support/webhook \\
    -H 'content-type: application/json' \\
    -H 'x-telegram-bot-api-secret-token: dtsgsup_k9Qz7mW3xR5tB1nY' -d '{"update_id":1}'
  # المتوقع: 200

ثم جرّب البوت: https://t.me/dtsgsupports_bot  ←  /whoami  ←  /start
للاسترجاع عند أي مشكلة:  cp $BK/server.js $APP_DIR/ && pm2 restart $PM2_NAME
═══════════════════════════════════════════════════════════════════════════
EOF

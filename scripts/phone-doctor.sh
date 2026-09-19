#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — طبيب خادم الهاتف 🩺   (تشخيص فقط: لا يغيّر أي ملف ولا يعيد التشغيل)
#
#  يكتشف تلقائياً:
#    • أي مجلد/عملية تخدم فعلاً على المنفذ (pm2 pm_cwd ≠ المجلد الذي تحدّثه؟)
#    • هل الشجرة المشغَّلة تحتوي طبقة المدفوعات (server-payments.js/js/wallet.js)؟
#    • هل الخادم يعيد build الجديد في /api/health؟
#    • هل مسارات المدفوعات تعمل محلياً وعبر الرابط العام؟
#    • هل قاعدة البيانات/ملفات الخادم مكشوفة للإنترنت؟ (ثغرة v2.40.3 وما قبلها)
#
#  الاستعمال على الهاتف:   bash scripts/phone-doctor.sh
#  خيارات: DTSG_DIR=... DTSG_PM2=... DTSG_PORT=... DTSG_PUBLIC=...
#  ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

APP_DIR="${DTSG_DIR:-/root/dmgames-arena}"
PM2_NAME="${DTSG_PM2:-casino-server}"
PORT="${DTSG_PORT:-3000}"
PUBLIC="${DTSG_PUBLIC:-https://casino-phone.dmgames-api.workers.dev}"
H="http://127.0.0.1:$PORT"

say()  { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok()   { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
bad()  { printf '   \033[1;31m✗\033[0m %s\n' "$*"; }
warn() { printf '   \033[1;33m⚠\033[0m %s\n' "$*"; }
jget() { curl -s -m 12 "$1" 2>/dev/null; }
code() { curl -s -m 12 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null; }
have() { command -v "$1" >/dev/null 2>&1; }
jfield() { printf '%s' "$1" | ${NODE_BIN:-node} -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s)$2||''))}catch(e){}})"; }

NODE_BIN="$(command -v node || echo node)"
printf '\033[1mDTSG phone-server doctor · %s · مجلد مرشّح: %s\033[0m\n' "$(date '+%Y-%m-%d %H:%M')" "$APP_DIR"

say "1) عمليات pm2 (المجلد + الحالة + إعادات)"
if have pm2; then
  pm2 jlist 2>/dev/null | "$NODE_BIN" -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      let a=[];try{a=JSON.parse(s||"[]")}catch(e){}
      if(!a.length){console.log("   (لا عمليات)");return;}
      for(const x of a){
        const e=x.pm2_env||{};
        console.log("   • "+(e.name||x.name)+"  ["+(e.status||"?")+"]  إعادات="+(e.restart_time||0)+"\n       cwd: "+(e.pm_cwd||"?")+"\n       script: "+(e.pm_exec_path||"?")+"\n       uptime: "+new Date(e.pm_uptime||0).toISOString());
      }
      const want=process.env.DTSG_PM2||"casino-server";
      const h=a.find(x=>x.name===want);
      if(h)console.log("   ⮕ العملية المطلوبة ("+want+") تعمل من: "+((h.pm2_env||{}).pm_cwd||"?"));
    });' 2>/dev/null || warn "فشل قراءة pm2 jlist"
else
  warn "pm2 غير مثبّت"
fi

say "2) من يخدم المنفذ $PORT؟"
if have ss; then ss -ltnp 2>/dev/null | grep -E ":$PORT\b" || warn "لا شيء يستمع على $PORT (أو يحتاج root)"
elif have netstat; then netstat -ltnp 2>/dev/null | grep -E ":$PORT\b" || warn "لا شيء يستمع على $PORT"
elif have lsof; then lsof -i ":$PORT" 2>/dev/null || warn "لا شيء يستمع على $PORT"
else warn "لا ss/netstat/lsof"; fi

say "3) الشجرة على القرص ($APP_DIR)"
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR" || true
  [ -d .git ] && echo "   git: $(git log -1 --format='%h %ci %s' 2>/dev/null)" || warn "لا مستودع git في هذا المجلد"
  echo "   إصدار package.json: $("$NODE_BIN" -p "require('./package.json').version" 2>/dev/null || echo '؟')"
  for f in server.js server-payments.js cf-worker/payments-core.js js/wallet.js payments-url.json; do
    [ -f "$f" ] && ok "$f" || bad "مفقود: $f"
  done
  ls cryptomus_*.html >/dev/null 2>&1 && ok "ملف إثبات Cryptomus" || bad "لا ملف cryptomus_*.html"
  grep -q "isDeniedStatic" server.js 2>/dev/null && ok "حماية v2.40.4 موجودة في server.js" || bad "server.js بلا حماية v2.40.4 (الملفات مكشوفة)"
  echo "   بصمة index.html على القرص: $(md5sum index.html 2>/dev/null | cut -c1-12) · $(grep -o -E 'js/wallet\.js\?v=[a-z0-9]+' index.html 2>/dev/null | head -1 || echo 'بلا وسم wallet.js')"
else
  bad "المجلد غير موجود: $APP_DIR"
fi

say "4) ماذا يخدم الخادم فعلاً (المطابقة مع القرص)"
curl -s -m 12 -o /tmp/_doctor_idx.html "$H/index.html" 2>/dev/null
if [ -s /tmp/_doctor_idx.html ]; then
  echo "   بصمة index.html المُخدَم: $(md5sum /tmp/_doctor_idx.html | cut -c1-12) ($(wc -c < /tmp/_doctor_idx.html) بايت) · $(grep -o -E 'js/wallet\.js\?v=[a-z0-9]+' /tmp/_doctor_idx.html | head -1 || echo 'بلا وسم wallet.js')"
  if [ -f "$APP_DIR/index.html" ]; then
    if cmp -s /tmp/_doctor_idx.html "$APP_DIR/index.html"; then ok "الخادم يخدم حرفياً ملفات المجلد المذكور أعلاه (متطابق)"
    else bad "الخادم يخدم ملفات مختلفة عن القرص في $APP_DIR ⇒ العملية تعمل من مجلد آخر (أو لم تُعَد التشغيل)"; fi
  fi
else
  warn "لا استجابة لـ $H/index.html — هل الخادم يعمل؟"
fi

say "5) نقاط الخادم محلياً"
HL="$(jget "$H/api/health")"; echo "   /api/health        → ${HL:0:120}"
if printf '%s' "$HL" | grep -q '"build"'; then ok "يعيد build (v2.40.4 أو أحدث)"; else bad "لا يعيد build ⇒ الشيفرة القديمة تُشغَّل"; fi
M="$(jget "$H/api/payments/methods")"; echo "   /api/payments/methods → ${M:0:140}"
printf '%s' "$M" | grep -q '"methods"' && ok "طبقة المدفوعات تعمل محلياً" || bad "طبقة المدفوعات مفقودة محلياً (شجرة قديمة)"
echo "   /api/deploy/manifest → $(jget "$H/api/deploy/manifest" | head -c 100)"

say "5.b) بوت خدمة العملاء (v2.41)"
printf '   %-40s ' "POST /api/support/webhook"; SC="$(curl -s -m 15 -o /tmp/_dwh.txt -w '%{http_code}' -X POST "$H/api/support/webhook" -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: ${SUPPORT_WEBHOOK_SECRET:-${SUPPORT_WEBHOOK_SECRET_MISSING}}" -d '{"update_id":900100}')"
if [ "$SC" = "200" ]; then ok "يعمل (200)"; elif [ "$SC" = "403" ]; then bad "403 — السرّ مختلف عن setWebhook (اضبط SUPPORT_WEBHOOK_SECRET)"; elif [ "$SC" = "404" ]; then bad "404 — الشجرة بلا v2.41: نفّذ scripts/apply-support-now.sh"; else bad "code=$SC"; fi
printf '   %-40s ' "GET /api/support/status"; SC2="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/api/support/status")"
[ "$SC2" = "401" ] && ok "محمي (401)" || bad "code=$SC2"
printf '   %-40s ' "/support.html"; SC3="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$H/support.html")"
[ "$SC3" = "200" ] && ok "منشورة (200)" || bad "code=$SC3"
[ -f server-support.js ] && ok "server-support.js موجود ($(wc -c < server-support.js) بايت)" || bad "server-support.js مفقود"

say "6) فحص أمني محلي (يجب أن تردّ 404)"
for f in /data/royalcoin.db /server.js /package.json /cf-worker/payments-core.js /scripts/update-phone-server.sh; do
  c="$(code "$H$f")"
  [ "$c" = "404" ] && ok "$f → 404" || bad "$f → $c  ⟵ مكشوف على الشبكة المحلية/النفق"
done

say "7) الرابط العام (ما يراه اللاعبون) $PUBLIC"
PH="$(jget "$PUBLIC/api/health")"; echo "   /api/health           → ${PH:0:120}"
PM="$(jget "$PUBLIC/api/payments/methods")"; echo "   /api/payments/methods → ${PM:0:140}"
SW="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$PUBLIC/api/support/webhook" -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: ${SUPPORT_WEBHOOK_SECRET:-${SUPPORT_WEBHOOK_SECRET_MISSING}}" -d '{"update_id":900101}')"
printf '   %-46s %s\n' "$PUBLIC/api/support/webhook (بوت الدعم)" "$SW"
printf '   %-46s %s\n' "$PUBLIC/support.html" "$(code "$PUBLIC/support.html")"
DBC="$(code "$PUBLIC/data/royalcoin.db")"; printf '   /data/royalcoin.db     → %s' "$DBC"; [ "$DBC" = "404" ] && echo '  ✓' || echo '  ✗ مكشوف عمومياً! (قاعدة بيانات المستخدمين)'

say "8) الحكم النهائي"
VERDICT="ok"
printf '%s' "$PM" | grep -q '"methods"' || VERDICT="payments"
[ "$DBC" = "404" ] || VERDICT="leak"
[ "$SW" = "200" ] || { [ "$VERDICT" = "ok" ] && VERDICT="support"; }
case "$VERDICT" in
  support)
    bad "بوت الدعم لا يستقبل التحديثات عمومياً (code=$SW)."
    printf '       نفّذ على الهاتف: bash scripts/apply-support-now.sh\n'
    ;;
  ok)
    ok "كل شيء سليم: المدفوعات تعمل والأمن مغلق."
    ;;
  leak)
    bad "قاعدة البيانات مكشوفة للإنترنت — أصلح فوراً: شغّل نسخة v2.40.4 (تحتوي حماية الملفات)."
    printf '       cd %s && git fetch origin && git reset --hard origin/main && pm2 restart %s --update-env\n' "$APP_DIR" "$PM2_NAME"
    ;;
  payments)
    bad "المدفوعات لا تعمل: الشجرة المشغَّلة قديمة (بلا /api/payments/methods)."
    printf '       السبب الشائع: pm2 يشغّل مجلداً غير الذي تحدّثه، أو لم يُنفَّذ التحديث في هذا المجلد.\n'
    printf '       الإصلاح: bash scripts/update-phone-server.sh   (يكتشف مجلد pm2 تلقائياً)\n'
    ;;
esac
printf '\n'

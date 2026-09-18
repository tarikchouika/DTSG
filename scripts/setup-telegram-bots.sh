#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — تهيئة وربط بوتات تيليغرام (v2.41)
#    بوت الدعم  : @dtsgsupports_bot      ← خدمة العملاء/التذاكر
#    بوت المنصة : (TELEGRAM_BOT_TOKEN)   ← المدفوعات والمالية
#
#  ما يفعله:
#    1) يتحقق من صلاحية التوكنين (getMe)
#    2) يضبط الويب هوك لبوت الدعم على الووركر الدائم + السرّي
#    3) يضبط قائمة الأوامر والوصف والصورة التعريفية
#    4) يفحص أن المسار يصل للخادم فعلاً (200) ويطبع getWebhookInfo
#
#  الاستعمال:  bash scripts/setup-telegram-bots.sh
#  متغيّرات: SUPPORT_BOT_TOKEN · TELEGRAM_BOT_TOKEN · DTSG_PUBLIC_BASE
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

SUPPORT_BOT_TOKEN="${SUPPORT_BOT_TOKEN:-8993467901:AAEUXgLqDB_-UKqnw8OGU-4OQNbQbuXhxlM}"
PLATFORM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
WEBHOOK_SECRET="${SUPPORT_WEBHOOK_SECRET:-dtsgsup_k9Qz7mW3xR5tB1nY}"
BASE="${DTSG_PUBLIC_BASE:-https://casino-phone.dmgames-api.workers.dev}"
TG="https://api.telegram.org"

say() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok()  { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[1;31m✗\033[0m %s\n' "$*"; }
warn(){ printf '   \033[1;33m⚠\033[0m %s\n' "$*"; }
jq1() { python3 -c "import json,sys;d=json.load(sys.stdin);print(eval(\"d$1\"))" 2>/dev/null; }

say "1) التحقق من البوتين (getMe)"
SUP_ME="$(curl -s -m 20 "$TG/bot$SUPPORT_BOT_TOKEN/getMe")"
SUP_NAME="$(printf '%s' "$SUP_ME" | jq1 "['result']['username']")"
if [ -n "$SUP_NAME" ]; then ok "بوت الدعم: @$SUP_NAME (id $(printf '%s' "$SUP_ME" | jq1 "['result']['id']"))"; else bad "توكن بوت الدعم غير صالح: $SUP_ME"; exit 1; fi
if [ -n "$PLATFORM_BOT_TOKEN" ]; then
  PL_ME="$(curl -s -m 20 "$TG/bot$PLATFORM_BOT_TOKEN/getMe")"
  PL_NAME="$(printf '%s' "$PL_ME" | jq1 "['result']['username']")"
  [ -n "$PL_NAME" ] && ok "بوت المنصة: @$PL_NAME" || warn "توكن بوت المنصة غير صالح (أو غير مضبوط) — أكمل بدونه"
else
  warn "TELEGRAM_BOT_TOKEN غير مضبوط — سأهيّئ بوت الدعم فقط (بوت المنصة يعمل حالياً على الهاتف)"
fi

say "2) ضبط الويب هوك لبوت الدعم"
WH_URL="$BASE/api/support/webhook"
R="$(curl -s -m 25 "$TG/bot$SUPPORT_BOT_TOKEN/setWebhook" -H 'content-type: application/json' -d "$(python3 - "$WH_URL" "$WEBHOOK_SECRET" <<'PY'
import json,sys
print(json.dumps({"url":sys.argv[1],"secret_token":sys.argv[2],"allowed_updates":["message","callback_query","edited_message"],"drop_pending_updates":True,"max_connections":40}))
PY
)")"
printf '%s' "$R" | grep -q '"ok":true' && ok "الويب هوك مضبوط: $WH_URL" || bad "فشل ضبط الويب هوك: $R"

say "3) قائمة الأوامر + الوصف"
curl -s -m 20 "$TG/bot$SUPPORT_BOT_TOKEN/setMyCommands" -H 'content-type: application/json' -d '{
 "commands":[
  {"command":"start","description":"بدء الدعم / ربط الحساب"},
  {"command":"status","description":"تذاكري وردودها"},
  {"command":"account","description":"حسابي ورصيدي"},
  {"command":"close","description":"إغلاق تذكرتي"},
  {"command":"help","description":"مساعدة"},
  {"command":"privacy","description":"سياسة الخصوصية"}
 ]}' | grep -q '"ok":true' && ok "أوامر المستخدم" || warn "تعذّر ضبط أوامر المستخدم"
curl -s -m 20 "$TG/bot$SUPPORT_BOT_TOKEN/setMyDescription" -H 'content-type: application/json' -d '{"description":"🛟 دعم DTSG — خدمة عملاء 24/7.\nاكتب مشكلتك وسيجيبك فريق الدعم في هذه المحادثة.\nالخصوصية: لا تُكشف أرقامك أو هويتك."}' | grep -q '"ok":true' && ok "وصف البوت" || warn "تعذّر ضبط الوصف"
curl -s -m 20 "$TG/bot$SUPPORT_BOT_TOKEN/setMyShortDescription" -H 'content-type: application/json' -d '{"short_description":"دعم فني وخدمة عملاء DTSG — تذاكر وردود فورية"}' >/dev/null && ok "الوصف المختصر"

say "3.b) الاسم والصورة التعريفية"
curl -s -m 20 "$TG/bot$SUPPORT_BOT_TOKEN/setMyName" -H 'content-type: application/json' -d '{"name":"دعم DTSG | Support"}' | grep -q '"ok":true' && ok "اسم البوت: دعم DTSG | Support" || warn "تعذّر تغيير الاسم"
AV="${DTSG_AVATAR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/assets/dtsg/support-bot-avatar.jpg}"
if [ -f "$AV" ]; then
  curl -s -m 40 "$TG/bot$SUPPORT_BOT_TOKEN/setMyProfilePhoto" -F 'photo={"type":"static","photo":"attach://f"}' -F "f=@$AV;type=image/jpeg" | grep -q '"ok":true' && ok "الصورة التعريفية مضبوطة" || warn "تعذّر ضبط الصورة"
else warn "لا توجد صورة في $AV (تخطّي)"; fi

say "4) هل يصل الويب هوك للخادم فعلاً؟"
CODE="$(curl -s -m 25 -o /tmp/_wh.txt -w '%{http_code}' -X POST "$WH_URL" -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: $WEBHOOK_SECRET" -d '{"update_id":1}')"
echo "   POST $WH_URL → $CODE  $(head -c 120 /tmp/_wh.txt)"
case "$CODE" in
  200) ok "الخادم يعالج تحديثات الدعم ✅ (البوت جاهز تماماً)" ;;
  403) bad "السرّ غير مطابق على الخادم — اضبط SUPPORT_WEBHOOK_SECRET=$WEBHOOK_SECRET في بيئة الهاتف ثم أعد التشغيل" ;;
  404) warn "المسار غير موجود على الخادم بعد — نفّذ على الهاتف: git fetch && git reset --hard origin/main && pm2 restart casino-server --update-env" ;;
  *)   warn "استجابة غير متوقعة ($CODE) — راجع سجل الخادم" ;;
esac

say "5) معلومات الويب هوك (تشخيص)"
curl -s -m 20 "$TG/bot$SUPPORT_BOT_TOKEN/getWebhookInfo" | python3 -c "
import json,sys
d=json.load(sys.stdin).get('result',{})
print('   url:', d.get('url') or '(فارغ)')
print('   pending_update_count:', d.get('pending_update_count'))
print('   last_error:', d.get('last_error_message') or '—', '·', d.get('last_error_date') or '')
print('   allowed_updates:', d.get('allowed_updates'))
"
if [ -n "${PL_NAME:-}" ]; then
  say "6) بوت المنصة (المالي)"
  curl -s -m 20 "$TG/bot$PLATFORM_BOT_TOKEN/setWebhook" -H 'content-type: application/json' -d "$(python3 - "$BASE" <<'PY'
import json,sys
print(json.dumps({"url":sys.argv[1]+"/api/telegram/webhook","allowed_updates":["message","callback_query"],"drop_pending_updates":False}))
PY
)" | grep -q '"ok":true' && ok "ويب هوك بوت المنصة: $BASE/api/telegram/webhook" || warn "تعذّر ضبط ويب هوك بوت المنصة"
fi

cat <<'EOF'

═══════════════════════════════════════════════════════════════════════════
الخطوات المتبقية على الهاتف (مرة واحدة):
  cd /root/dmgames-arena && git fetch origin && git reset --hard origin/main
  bash scripts/update-phone-server.sh
(السكربت يضبط SUPPORT_BOT_TOKEN و SUPPORT_WEBHOOK_SECRET تلقائياً)

للتجربة: افتح https://t.me/dtsgsupports_bot واكتب /start، أو جرّب
  /start <كود-الربط>     (من صفحة https://dtsg.pages.dev/support.html)
وللسوبر أدمن (5700612979): /queue · /open 1 · /r نص · /stats · /addadmin
═══════════════════════════════════════════════════════════════════════════
EOF

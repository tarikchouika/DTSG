#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — تهيئة وربط بوتات تيليغرام (v2.56)
#    بوت الدعم       : @dtsgsupports_bot      ← خدمة العملاء/التذاكر
#    بوت المنصة      : (TELEGRAM_BOT_TOKEN)   ← المدفوعات والمالية
#    بوت الدردشة الخاص: (PRIVATE_CHAT_BOT_TOKEN) ← حسابات المنصة المرتبطة فقط
#
#  ما يفعله:
#    1) يتحقق من صلاحية التوكنات (getMe)
#    2) يضبط الويب هوك لبوت الدعم وبوت الدردشة الخاص بسرّين منفصلين
#    3) يضبط قائمة الأوامر والوصف لكل بوت
#    4) يفحص أن المسارات تصل للخادم فعلاً (200) ويطبع getWebhookInfo
#
#  الاستعمال:  bash scripts/setup-telegram-bots.sh
#  متغيّرات: SUPPORT_BOT_TOKEN · PRIVATE_CHAT_BOT_TOKEN · TELEGRAM_BOT_TOKEN
#             SUPPORT_WEBHOOK_SECRET · PRIVATE_CHAT_WEBHOOK_SECRET · DTSG_PUBLIC_BASE
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

SUPPORT_BOT_TOKEN="${SUPPORT_BOT_TOKEN:-}"
# [v2.44-أمن] لا تُكتب التوكنات في المستودع (المستودع عام) — تُقرأ من البيئة فقط:
#   export SUPPORT_BOT_TOKEN="<توكن @BotFather للبوت>"  ثم أعد تشغيل السكربت.
if [ -z "$SUPPORT_BOT_TOKEN" ]; then
  echo "✖ SUPPORT_BOT_TOKEN غير مضبوط. صدّره من البيئة (BotFather → API Token) ثم أعد المحاولة."
  echo "  مثال:  export SUPPORT_BOT_TOKEN='<TOKEN>'; bash $0"
  exit 1
fi
PLATFORM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
PRIVATE_CHAT_BOT_TOKEN="${PRIVATE_CHAT_BOT_TOKEN:-}"
PRIVATE_CHAT_BOT_USERNAME="${PRIVATE_CHAT_BOT_USERNAME:-}"
WEBHOOK_SECRET="${SUPPORT_WEBHOOK_SECRET:-}"
if [ -z "$WEBHOOK_SECRET" ]; then
  # سرّ الويبهوك يمكن توليده محلياً بلا أي خدمة خارجية
  WEBHOOK_SECRET="dtsgsup_$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
  echo "ℹ️  وُلّد سرّ ويبهوك جديد (صدّره للهاتف): SUPPORT_WEBHOOK_SECRET=$WEBHOOK_SECRET"
fi
PRIVATE_WEBHOOK_SECRET="${PRIVATE_CHAT_WEBHOOK_SECRET:-}"
if [ -n "$PRIVATE_CHAT_BOT_TOKEN" ] && [ -z "$PRIVATE_WEBHOOK_SECRET" ]; then
  PRIVATE_WEBHOOK_SECRET="dtsgpriv_$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
  echo "ℹ️  وُلّد سرّ بوت الدردشة الخاص (صدّره للخادم): PRIVATE_CHAT_WEBHOOK_SECRET=$PRIVATE_WEBHOOK_SECRET"
fi
BASE="${DTSG_PUBLIC_BASE:-https://casino-phone.dmgames-api.workers.dev}"
TG="https://api.telegram.org"

say() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok()  { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[1;31m✗\033[0m %s\n' "$*"; }
warn(){ printf '   \033[1;33m⚠\033[0m %s\n' "$*"; }
jq1() { python3 -c "import json,sys;d=json.load(sys.stdin);print(eval(\"d$1\"))" 2>/dev/null; }

say "1) التحقق من البوتات (getMe)"
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
if [ -n "$PRIVATE_CHAT_BOT_TOKEN" ]; then
  PRIV_ME="$(curl -s -m 20 "$TG/bot$PRIVATE_CHAT_BOT_TOKEN/getMe")"
  PRIV_NAME="$(printf '%s' "$PRIV_ME" | jq1 "['result']['username']")"
  if [ -n "$PRIV_NAME" ]; then
    ok "بوت الدردشة الخاص: @$PRIV_NAME"
    if [ -n "$PRIVATE_CHAT_BOT_USERNAME" ] && [ "$PRIVATE_CHAT_BOT_USERNAME" != "$PRIV_NAME" ]; then
      warn "PRIVATE_CHAT_BOT_USERNAME لا يطابق getMe؛ سيُستخدم الاسم الحقيقي: @$PRIV_NAME"
    fi
    PRIVATE_CHAT_BOT_USERNAME="$PRIV_NAME"
  else
    bad "توكن بوت الدردشة الخاص غير صالح: $PRIV_ME"
    exit 1
  fi
else
  warn "PRIVATE_CHAT_BOT_TOKEN غير مضبوط — تخطّي بوت الدردشة الخاص (لن تظهر روابطه حتى يُضبط)."
fi

say "2) ضبط الويب هوك لبوت الدعم"
WH_URL="$BASE/api/support/webhook"
R="$(curl -s -m 25 "$TG/bot$SUPPORT_BOT_TOKEN/setWebhook" -H 'content-type: application/json' -d "$(python3 - "$WH_URL" "$WEBHOOK_SECRET" <<'PY'
import json,sys
print(json.dumps({"url":sys.argv[1],"secret_token":sys.argv[2],"allowed_updates":["message","callback_query","edited_message"],"drop_pending_updates":True,"max_connections":40}))
PY
)")"
printf '%s' "$R" | grep -q '"ok":true' && ok "الويب هوك مضبوط: $WH_URL" || bad "فشل ضبط الويب هوك: $R"

if [ -n "$PRIVATE_CHAT_BOT_TOKEN" ]; then
  say "2.b) ضبط ويب هوك بوت الدردشة الخاص"
  PRIV_WH_URL="$BASE/api/private-chat/webhook"
  PR="$(curl -s -m 25 "$TG/bot$PRIVATE_CHAT_BOT_TOKEN/setWebhook" -H 'content-type: application/json' -d "$(python3 - "$PRIV_WH_URL" "$PRIVATE_WEBHOOK_SECRET" <<'PY'
import json,sys
print(json.dumps({"url":sys.argv[1],"secret_token":sys.argv[2],"allowed_updates":["message"],"drop_pending_updates":True,"max_connections":40}))
PY
)")"
  printf '%s' "$PR" | grep -q '"ok":true' && ok "الويب هوك مضبوط: $PRIV_WH_URL" || bad "فشل ضبط ويب هوك بوت الدردشة الخاص: $PR"
  curl -s -m 20 "$TG/bot$PRIVATE_CHAT_BOT_TOKEN/setMyCommands" -H 'content-type: application/json' -d '{
   "commands":[
    {"command":"start","description":"ربط حساب DTSG"},
    {"command":"friends","description":"أصدقائي المسموحون"},
    {"command":"admins","description":"الأدمنز المسموحون"},
    {"command":"chat","description":"اختيار محادثة خاصة"},
    {"command":"inbox","description":"الرسائل الأخيرة"},
    {"command":"privacy","description":"الخصوصية"},
    {"command":"help","description":"المساعدة"}
   ]}' | grep -q '"ok":true' && ok "أوامر بوت الدردشة الخاص" || warn "تعذّر ضبط أوامر بوت الدردشة الخاص"
  curl -s -m 20 "$TG/bot$PRIVATE_CHAT_BOT_TOKEN/setMyDescription" -H 'content-type: application/json' -d '{"description":"🔒 دردشة DTSG الخاصة. للمستخدمين المرتبطين بالمنصة فقط. لا نكشف معرّفات تيليغرام للطرف الآخر."}' | grep -q '"ok":true' && ok "وصف بوت الدردشة الخاص" || warn "تعذّر ضبط وصف بوت الدردشة الخاص"
fi

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

if [ -n "$PRIVATE_CHAT_BOT_TOKEN" ]; then
  say "4.b) فحص وصول بوت الدردشة الخاص للخادم"
  P_CODE="$(curl -s -m 25 -o /tmp/_private_wh.txt -w '%{http_code}' -X POST "$BASE/api/private-chat/webhook" -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: $PRIVATE_WEBHOOK_SECRET" -d '{"update_id":2}')"
  echo "   POST $BASE/api/private-chat/webhook → $P_CODE  $(head -c 120 /tmp/_private_wh.txt)"
  case "$P_CODE" in
    200) ok "الخادم يعالج تحديثات بوت الدردشة الخاص ✅" ;;
    403) bad "PRIVATE_CHAT_WEBHOOK_SECRET غير مطابق على الخادم" ;;
    404) warn "مسار البوت الخاص غير موجود على الخادم بعد — حدّث الشجرة وأعد تشغيلها" ;;
    *)   warn "استجابة غير متوقعة ($P_CODE) — راجع سجل الخادم" ;;
  esac
fi

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
if [ -n "${PRIVATE_CHAT_BOT_TOKEN:-}" ]; then
  say "7) معلومات ويب هوك بوت الدردشة الخاص"
  curl -s -m 20 "$TG/bot$PRIVATE_CHAT_BOT_TOKEN/getWebhookInfo" | python3 -c "
import json,sys
d=json.load(sys.stdin).get('result',{})
print('   url:', d.get('url') or '(فارغ)')
print('   pending_update_count:', d.get('pending_update_count'))
print('   last_error:', d.get('last_error_message') or '—', '·', d.get('last_error_date') or '')
print('   allowed_updates:', d.get('allowed_updates'))
"
  echo "   لخادم المنصة: PRIVATE_CHAT_BOT_USERNAME=$PRIVATE_CHAT_BOT_USERNAME"
fi

cat <<'EOF'

═══════════════════════════════════════════════════════════════════════════
الخطوات المتبقية على الهاتف (مرة واحدة):
  cd /root/DTSG && git fetch origin && git reset --hard origin/main
  bash scripts/phone-env-restart.sh        # يقرأ .env.local ثم يعيد تشغيل pm2 بالبيئة الكاملة
(السكربت يضبط SUPPORT_BOT_TOKEN و SUPPORT_WEBHOOK_SECRET وPRIVATE_CHAT_BOT_TOKEN وPRIVATE_CHAT_WEBHOOK_SECRET من البيئة)
⚠️ لا تستعمل `pm2 restart casino-server --update-env` من صدفة ناقصة — يمسح كل متغيرات المنصة (حادثة 2026-09-22).

للتجربة: افتح https://t.me/dtsgsupports_bot واكتب /start، أو أنشئ رابط البوت الخاص من نافذة مركز المساعدة في المنصة.
  رابط /start الخاص يُستهلك مرة واحدة فقط ولا تشاركه مع أي شخص.
وللسوبر أدمن (المعرّف الموجود في TELEGRAM_ADMIN_CHAT_ID): /queue · /open 1 · /r نص · /stats · /addadmin
═══════════════════════════════════════════════════════════════════════════
EOF

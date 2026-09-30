#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — تحقق آلي من خادم الهاتف بعد التحديث (أُصلح لـv2.59)
#  شغّله على الهاتف/الخادم بعد: git pull + إعادة تشغيل الخادم
#      BOT_API_SECRET=*** bash scripts/verify-phone-v244.sh              # localhost:3000
#      BOT_API_SECRET=*** bash scripts/verify-phone-v244.sh http://127.0.0.1:3971
#  لا يحتاج أي مكتبة — curl فقط.
#  [v2.59] مسارات /api/bot/* تتطلب الآن سِرّ البوت (R3-001/2): مرّر BOT_API_SECRET
#  (أو ADMIN_API_SECRET) في البيئة وإلا فشل قسم البوت بـ401.
# ═══════════════════════════════════════════════════════════════════════════
BASE="${1:-http://127.0.0.1:${PORT:-3000}}"
TG_ID="${2:-999000001}"          # هوية تُستعمل في المعاينة (السوبر أدمن افتراضاً — موجود في قاعدة الهاتف)
BOT_SEC="${BOT_API_SECRET:-${ADMIN_API_SECRET:-}}"   # [v2.59] سِرّ بوابة البوت (x-bot-secret)
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✅ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ❌ %s\n' "$1"; }

j() { curl -s --max-time 15 -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; }
jv() { curl -s --max-time 15 -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; }
jb() { # [v2.59] POST لمسار /api/bot/* مع سِرّ البوت (R3-001/2)
  if [ -n "$BOT_SEC" ]; then
    curl -s --max-time 15 -X POST "$BASE$1" -H 'content-type: application/json' -H "x-bot-secret: $BOT_SEC" -d "$2"
  else
    curl -s --max-time 15 -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"
  fi
}
g() { curl -s --max-time 15 "$BASE$1"; }
code() { curl -s --max-time 15 -o /dev/null -w '%{http_code}' -X POST "$BASE$1" -H 'content-type: application/json' -d "${2:-{}}"; }

echo "── فحص خادم الهاتف: $BASE"
H=$(g /api/health)
echo "   الصحة: $H"
echo "$H" | grep -q '"ok":true' && ok "الخادم يستجيب (/api/health)" || bad "الخادم لا يستجيب — تأكد من تشغيله والمنفذ"
BUILD=$(echo "$H" | grep -o '"build":"[^"]*"' | cut -d'"' -f4)
case "$BUILD" in
  2.44*|2.45*|2.5*|3.*) ok "إصدار الخادم محدَّث ($BUILD)" ;;
  *) bad "الخادم على إصدار قديم ($BUILD) — نفّذ: git fetch origin main && git reset --hard origin main ثم أعِد التشغيل" ;;
esac

echo "── 1) مسار بوت الشحن (/api/bot/request)"
CG=$(code /api/bot/request '{}')
[ "$CG" = "401" ] && ok "[v2.59] بوابة البوت مغلقة بلا سِرّ (HTTP 401)" || bad "[v2.59] بوابة البوت بلا 401؟ (HTTP $CG) — راجع BOT_API_SECRET/ADMIN_API_SECRET"
R=$(jb /api/bot/request "{\"tg_id\":\"$TG_ID\",\"kind\":\"topup\",\"amount_usd\":100,\"method\":\"cash_plus\",\"details\":\"VERIFY\"}")
if echo "$R" | grep -q '"bonus_pct":5'; then
  ok "معاينة الشحن 100\$ لمستخدم عادي: بونص 5% — $R"
else
  bad "معاينة الشحن لم تُرجع بونص 5% (المتوقع {\"bonus_pct\":5,\"coins_on_approve\":10500}) — الردّ: $R"
fi
echo "$R" | grep -q '"coins_on_approve":10500' && ok "الكوينز المتوقعة 10,500 (100\$×100×1.05)" || bad "coins_on_approve غير مطابق — $R"

R2=$(jb /api/bot/request "{\"tg_id\":\"$TG_ID\",\"kind\":\"withdrawal\",\"amount_usd\":9,\"method\":\"binance\",\"details\":\"VERIFY-WD\"}")
echo "$R2" | grep -q '"ok":true' && ok "معاينة السحب تعمل: $R2" || bad "مسار السحب رفض الطلب: $R2"

TX1=$(echo "$R"  | grep -o '"tx":"[^"]*"' | cut -d'"' -f4)
TX2=$(echo "$R2" | grep -o '"tx":"[^"]*"' | cut -d'"' -f4)
C=$(code /api/bot/admin-act "{\"tx\":\"$TX1\",\"act\":\"drej\"}")
[ "$C" = "403" ] || [ "$C" = "401" ] && ok "admin-act محميّ بسرّ الإدارة (HTTP $C بلا سرّ)" || bad "admin-act غير محميّ (HTTP $C) — راجع ADMIN_API_SECRET"

echo "── 2) مسارات الدفع"
C=$(code /api/vouchers/create '{}')
[ "$C" = "403" ] && ok "إنشاء الفوتشير يتطلب صلاحية (403)" || bad "ردّ /api/vouchers/create غير متوقع: HTTP $C"
R=$(j /api/payments/p2p '{}')
echo "$R" | grep -q 'missing' && ok "مسارات الدفع الحيّة (/api/payments/p2p يتحقق من الحقول)" || bad "ردّ /api/payments/p2p غير متوقع: $R"
C=$(code /api/bot/request '{}')
[ "$C" != "404" ] && ok "مسار البوت موجود (ليس 404)" || bad "مسار /api/bot/request غير موجود (404) ⇒ الخادم لم يُحدَّث لـv2.44"

echo "── 3) تنظيف طلبات التحقق (لا تبقى معلّقة في الداشبورد)"
if [ -n "${ADMIN_API_SECRET:-}" ] && [ -n "${TX1:-}" ]; then
  C1=$(j /api/bot/admin-act "{\"tx\":\"$TX1\",\"act\":\"drej\",\"admin_secret\":\"$ADMIN_API_SECRET\"}")
  C2=$(j /api/bot/admin-act "{\"tx\":\"$TX2\",\"act\":\"wrej\",\"admin_secret\":\"$ADMIN_API_SECRET\"}")
  echo "$C1$C2" | grep -q '"ok":true' && ok "رُفض طلبا التحقق من الداشبورد (نفس مسار السوبر أدمن)" || bad "تعذّر رفض طلبات التحقق: $C1 / $C2"
else
  echo "   ℹ️  ADMIN_API_SECRET غير مضبوط — سيظهر طلبا تحقق معلّقان في الداشبورد (ارفضهما يدوياً)."
fi

echo "── 4) ملخص"
if [ "$FAIL" = "0" ]; then
  echo "✔ كل الفحوص نجحت ($PASS) — خادم الهاتف محدَّث."
  echo "  شغّل البوت: BOT_API_SECRET=*** VOUCHER_BOT_TOKEN=*** API_BASE=$BASE node scripts/voucher-bot.js"
else
  echo "✖ $FAIL فحص/فحوص فشلت من $((PASS+FAIL)) — راجع الأعلى ثم راجع docs/PHONE_UPDATE_v244.md"
fi
exit $([ "$FAIL" = "0" ] && echo 0 || echo 1)

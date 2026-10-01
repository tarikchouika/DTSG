#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG → Cloudflare Pages  (dtsg.pages.dev)
#  ينشر الملفات الثابتة فقط (html/css/js/assets) — واجهة المنصة تتصل تلقائياً
#  بالـ Worker (casino-api.dmgames-api.workers.dev) عند استضافة dtsg.pages.dev
#
#  المتطلبات:
#    * Node ≥ 18 (يستعمل npx لتحميل wrangler مؤقتاً)
#    * متغيرات البيئة:
#        CLOUDFLARE_ACCOUNT_ID=<Account ID>
#        CLOUDFLARE_API_TOKEN=<API Token>     # يكفي Token من نوع
#                                             # "Cloudflare Pages:Edit" إن وُجد
#    (مفاتيح R2/S3 ليست ضرورية لنشر Pages — هي فقط لحاوية R2 إن استُعملت)
#
#  الاستعمال:
#    export CLOUDFLARE_ACCOUNT_ID=758fcc827f3338772847c28391b6c6c3
#    export CLOUDFLARE_API_TOKEN=cfat_...
#    bash scripts/deploy-pages.sh
#
#  اختياري: DMG_STAGE_ONLY=1 لبناء مجلد النشر فقط بدون رفع.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# [v2.71-gate-account] Never publish to the wrong account. Incident 2026-09-30: a full
# publish went to a *different* Cloudflare account and wrangler reported SUCCESS while
# the live site (dtsg.pages.dev) had not changed a single byte. The script trusted
# wrangler's success line and never asked: which account? which live domain?
# Now: the account is pinned below (EXPECT_ACCOUNT); the env var, `wrangler whoami`
# and the LIVE site content are each verified before/after the upload.

# [PhoneLink] تحديث من GitHub أولاً: يضمن أن أي نشر يحمل أحدث إصلاحات الفريق
# (منع تكرار مشكلة «نشر نسخة قديمة»). BRANCH_SOURCE قابل للتغيير.
# [v2.48.2-GUARD 2026-09-21] كان الافتراضي فرعاً في المستودع **القديم**
# (arena/01a081af-digital-moroccan-casino) ⇒ لبس بين المستودعين. الصحيح: main في DTSG.
BRANCH_SOURCE="${DMG_SOURCE_BRANCH:-origin/main}"
case "$BRANCH_SOURCE" in
  *digital-moroccan-casino*)
    echo "✗ BRANCH_SOURCE يشير إلى المستودع القديم ($BRANCH_SOURCE)"
    echo "  راجع docs/ASSISTANT_GUARDRAILS.md — الإلغاء: unset DMG_SOURCE_BRANCH"
    exit 1 ;;
esac
if git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  REMOTE_URL="$(git -C "$REPO" remote get-url origin 2>/dev/null || true)"
  case "$REMOTE_URL" in
    *digital-moroccan-casino*)
      echo "✗ ريموت origin يشير إلى المستودع القديم — توقّف (راجع docs/ASSISTANT_GUARDRAILS.md)"; exit 1 ;;
    *tarikchouika/DTSG*) : ;;
    "") : ;;
    *) echo "⚠ ريموت غير متوقّع: $REMOTE_URL — تأكد أنه DTSG" ;;
  esac
  echo "── جلب أحدث التغييرات من GitHub ($BRANCH_SOURCE)"
  git -C "$REPO" fetch origin --prune 2>/dev/null || echo "   تحذير: فشل الجلب — سأبني من النسخة المحلية"
  # ملفات تكامل النفق معدلة محلياً فوق الفرع — تُستخدم كما هي بعد الجلب
  # (api.js، live-ws-bridge.js، _headers، api-url2.json)
  echo "── سأبني من شجرة العمل المحلية (المبنية على $BRANCH_SOURCE مع تعديلات النفق)"
fi
# [v2.71-gate-account] the platform's Cloudflare account — do not change silently
EXPECT_ACCOUNT="758fcc827f3338772847c28391b6c6c3"
OUT="${DMG_DEPLOY_DIR:-/tmp/dmc-deploy}"
PROJECT="dtsg"                    # [Rebrand] يعطي النطاق https://dtsg.pages.dev (dmgames قديم)
BRANCH="main"                     # فرع الإنتاج في Pages (تعديل لإنتاج مباشر)

echo "── تجهيز مجلد النشر من $REPO → $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"
cd "$REPO"

# الملفات والمجلدات العامة فقط (نفس قاعدة deploy-clean.sh المعتمدة)
# ronda-game: محرك روندا الكلاسيكية (index.html يحمل سكربتاته من ronda-game/js/*)
# backgammon-game / dominoes-game: [BGDO] مشروعا الطاولة والضومنة المستقلان
# uno-game / baloot-game: [UN/BL] مشروعا أونو والبلوت المستقلان
# [v2.65.1-HOTFIX 2026-09-28] أونو والبلوت كانا غائبين من هنا: النشر عبر هذا
# السكربت كان يرفع الواجهة بلا المجلدين، فتخدم Pages صفحة index.html بدل
# ملفات JS (200 + text/html + etag المطابق لـ index.html) → اللعبتان معطلتان
# على dtsg.pages.dev بينما Vercel (نشر المستودع كاملاً) يعمل. القاعدة الجديدة
# المعمّمة: كل مجلد لعبة مستقلة يُشار إليه من index.html يجب أن يظهر هنا —
# يتحقق آلياً عبر tests/_deploy_coverage_test.js.
cp -r js css assets ronda-game backgammon-game dominoes-game uno-game baloot-game "$OUT/"

for f in index.html admins.html about.html contact.html 2fa.html \
         fairness.html privacy.html terms.html \
         refund-policy.html support.html 404.html \
         _headers _redirects api-url2.json payments-url.json tunnel-live.json; do
  [ -e "$f" ] && cp "$f" "$OUT/"
done

# أيقونات وصور جذرية إن وُجدت
for g in favicon*.png *.webp favicon.ico manifest.json robots.txt sitemap.xml; do
  for f in $g; do
    [ -e "$f" ] && cp "$f" "$OUT/"
  done
done

# [v2.40→v2.45] صفحة الاسترداد + payments-url.json
# (كانت refund-policy.html غائبة عن النشر رغم أنها مرتبطة من المحفظة والقوائم)
# [v2.45] أُزيلت ملفات إثبات ملكية Cryptomus بعد الاستغناء عن بوابتها.
# لا اختبارات ولا وثائق ولا قواعد بيانات ولا configs في النشر
rm -rf "$OUT"/data 2>/dev/null || true
rm -rf "$OUT"/ronda-game/tests "$OUT"/ronda-game/README.md 2>/dev/null || true
# [BGDO] تنظيف احتياطي لمجلدات tests داخل المشروعين + حذف ملفات تدقيق الدمج من النشر
rm -rf "$OUT"/backgammon-game/tests "$OUT"/dominoes-game/tests 2>/dev/null || true
rm -f "$OUT"/backgammon-game/INTEGRATION.md "$OUT"/dominoes-game/INTEGRATION.md 2>/dev/null || true
# [UN/BL v2.65.1] نفس القاعدة لأونو والبلوت: tests + وثائق + صفحة QA المستقلة
# (index.html — وثيقتا الدمج تنصّان: «صفحة مستقلة للاختبار، غير مطلوبة للنشر»)
# + baloot-game/integration (مقتطف ترجمات تطويري) + baloot-game/assets (أيقونات
# النسخة المستقلة فقط — أيقونات الكتالوج تعيش في assets/games/<un|baloot> المرفوعة)
rm -rf "$OUT"/uno-game/tests "$OUT"/baloot-game/tests 2>/dev/null || true
rm -f "$OUT"/uno-game/README.md "$OUT"/uno-game/INTEGRATION.md \
      "$OUT"/baloot-game/README.md "$OUT"/baloot-game/INTEGRATION.md 2>/dev/null || true
rm -f "$OUT"/uno-game/index.html "$OUT"/baloot-game/index.html 2>/dev/null || true
rm -rf "$OUT"/baloot-game/integration "$OUT"/baloot-game/assets 2>/dev/null || true
find "$OUT" -name "*.db*" -delete 2>/dev/null || true

N_FILES="$(find "$OUT" -type f | wc -l)"
SIZE="$(du -sh "$OUT" | cut -f1)"
echo "✔ مجلد النشر جاهز: $N_FILES ملفاً ($SIZE) → $OUT"

if [ "${DMG_STAGE_ONLY:-0}" = "1" ]; then
  echo "── DMG_STAGE_ONLY=1 : تم التوقف قبل الرفع."
  exit 0
fi

: "${CLOUDFLARE_ACCOUNT_ID:?لم يُضبط CLOUDFLARE_ACCOUNT_ID}"
: "${CLOUDFLARE_API_TOKEN:?لم يُضبط CLOUDFLARE_API_TOKEN}"
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN

# ── account gate: env var + wrangler's own answer (no publish on doubt) ──
if [ "$CLOUDFLARE_ACCOUNT_ID" != "$EXPECT_ACCOUNT" ]; then
  echo "STOP: CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID is not the platform account."
  echo "      expected: $EXPECT_ACCOUNT"
  echo "      fix /root/.secrets/cloudflare.txt and rerun — do not force."
  exit 4
fi
WHOAMI="$(npx -y wrangler@4 whoami 2>/dev/null || true)"
if ! printf '%s' "$WHOAMI" | grep -q "$EXPECT_ACCOUNT"; then
  echo "STOP: wrangler did not confirm account $EXPECT_ACCOUNT (token/account mismatch)."
  printf '%s\n' "$WHOAMI" | sed 's/^/      /' | head -12
  exit 4
fi
echo "OK: Cloudflare account confirmed: $EXPECT_ACCOUNT"

echo "── التأكد من وجود مشروع Pages «$PROJECT»"
if ! npx -y wrangler@4 pages project list 2>/dev/null | grep -q "$PROJECT"; then
  echo "── إنشاء المشروع $PROJECT (فرع الإنتاج: $BRANCH)"
  npx -y wrangler@4 pages project create "$PROJECT" --production-branch "$BRANCH"
fi

echo "── رفع إلى Cloudflare Pages ($PROJECT / $BRANCH)"
npx -y wrangler@4 pages deploy "$OUT" --project-name "$PROJECT" --branch "$BRANCH"

# ── post-upload gate: the LIVE domain must serve THIS build ──
# [v2.71-gate-account] wrangler's "Deployment complete" says nothing about which
# domain serves it. Compare the live build tag with package.json, else report failure.
LIVE_URL="${DMG_LIVE_URL:-https://dtsg.pages.dev}"
WANT_BUILD="$(node -p "require('$REPO/package.json').version" 2>/dev/null || echo '?')"
echo "-- verifying $LIVE_URL (expect build v$WANT_BUILD)"
LIVE_BUILD=""
for i in 1 2 3 4 5 6; do
  LIVE_BUILD="$(curl -sL -m 20 "$LIVE_URL/js/main.js" 2>/dev/null | grep -o "DTSG_BUILD = 'v[^']*'" | head -1 | sed "s/.*'v\\([^']*\\)'.*/\\1/")"
  [ -n "$LIVE_BUILD" ] && [ "$LIVE_BUILD" = "$WANT_BUILD" ] && break
  echo "   try $i: live serves '${LIVE_BUILD:-?}' — waiting for cache/propagation"
  sleep 6
done
if [ "${LIVE_BUILD:-}" = "$WANT_BUILD" ]; then
  echo "OK: live $LIVE_URL serves v$WANT_BUILD"
else
  echo "FAILED: live $LIVE_URL serves '${LIVE_BUILD:-?}', expected '$WANT_BUILD'."
  echo "   The upload reached a non-live project/account. Do NOT retry blindly:"
  echo "   npx wrangler@4 pages project list   # find the real production domain"
  exit 5
fi

echo "DEPLOYED -> $LIVE_URL"
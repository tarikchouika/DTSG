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

# [PhoneLink] تحديث من GitHub أولاً: يضمن أن أي نشر يحمل أحدث إصلاحات الفريق
# (منع تكرار مشكلة «نشر نسخة قديمة»). BRANCH_SOURCE قابل للتغيير.
BRANCH_SOURCE="${DMG_SOURCE_BRANCH:-origin/arena/01a081af-digital-moroccan-casino}"
if git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "── جلب أحدث التغييرات من GitHub ($BRANCH_SOURCE)"
  git -C "$REPO" fetch origin --prune 2>/dev/null || echo "   تحذير: فشل الجلب — سأبني من النسخة المحلية"
  # ملفات تكامل النفق معدلة محلياً فوق الفرع — تُستخدم كما هي بعد الجلب
  # (api.js، live-ws-bridge.js، _headers، api-url2.json)
  echo "── سأبني من شجرة العمل المحلية (المبنية على $BRANCH_SOURCE مع تعديلات النفق)"
fi
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
cp -r js css assets ronda-game backgammon-game dominoes-game "$OUT/"

for f in index.html admins.html about.html contact.html 2fa.html \
         provably-fair.html fairness.html privacy.html terms.html \
         refund-policy.html support.html \
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

echo "── التأكد من وجود مشروع Pages «$PROJECT»"
if ! npx -y wrangler@4 pages project list 2>/dev/null | grep -q "$PROJECT"; then
  echo "── إنشاء المشروع $PROJECT (فرع الإنتاج: $BRANCH)"
  npx -y wrangler@4 pages project create "$PROJECT" --production-branch "$BRANCH"
fi

echo "── رفع إلى Cloudflare Pages ($PROJECT / $BRANCH)"
npx -y wrangler@4 pages deploy "$OUT" --project-name "$PROJECT" --branch "$BRANCH"

echo "✔ تم النشر → https://$PROJECT.pages.dev"

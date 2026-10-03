#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# [v2.81] تجهيز مجلد www لتطبيق Capacitor Android (بناء APK الآلي)
# ───────────────────────────────────────────────────────────────────────────
# يجمّع الواجهة الثابتة للمنصة في مجلد واحد (www/) تحزمه Capacitor داخل
# تطبيق الأندرويد — نفس قائمة النشر في scripts/deploy-pages.sh حرفياً
# (قاعدة 11 في AGENTS.md: أي مجلد لعبة مستقل جديد يُضاف هنا وهناك معاً).
#
# الاستعمال:
#   bash scripts/prepare-www.sh [OUT]     # الافتراضي: www بجوار المستودع
#
# ملاحظة نظافة: www/ مُدرَج في .gitignore — يُبنى محلياً وفي GitHub Actions
# ولا يُرفع إلى المستودع أبداً (المستند: «لا يرفع ملفات البناء الثقيلة»).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$REPO/www}"

rm -rf "$OUT"
mkdir -p "$OUT"
cd "$REPO"

# المجلدات العامة — مطابقة حرفياً لسطر cp -r في deploy-pages.sh:
# ronda-game (روندا) · backgammon-game/dominoes-game (BGDO) · uno-game/baloot-game (UN/BL)
cp -r js css assets ronda-game backgammon-game dominoes-game uno-game baloot-game "$OUT/"

# صفحات HTML المنشورة + ملفات الإعداد التي تحتاجها الواجهة
for f in index.html admins.html about.html contact.html 2fa.html \
         fairness.html privacy.html terms.html \
         refund-policy.html support.html 404.html \
         _headers _redirects api-url2.json payments-url.json tunnel-live.json; do
  [ -e "$f" ] && cp "$f" "$OUT/"
done

# أيقونات وصور جذرية إن وُجدت (نفس حلقات deploy-pages.sh)
for g in favicon*.png *.webp favicon.ico manifest.json robots.txt sitemap.xml; do
  for f in $g; do
    [ -e "$f" ] && cp "$f" "$OUT/"
  done
done

# تقليم مطابق للنشر: بلا اختبارات ولا وثائق دمج ولا صفحات QA مستقلة ولا قواعد بيانات
rm -rf "$OUT"/ronda-game/tests "$OUT"/backgammon-game/tests "$OUT"/dominoes-game/tests 2>/dev/null || true
rm -rf "$OUT"/uno-game/tests "$OUT"/baloot-game/tests "$OUT"/baloot-game/integration "$OUT"/baloot-game/assets 2>/dev/null || true
rm -f "$OUT"/backgammon-game/INTEGRATION.md "$OUT"/dominoes-game/INTEGRATION.md \
      "$OUT"/uno-game/README.md "$OUT"/uno-game/INTEGRATION.md "$OUT"/uno-game/index.html \
      "$OUT"/baloot-game/README.md "$OUT"/baloot-game/INTEGRATION.md "$OUT"/baloot-game/index.html 2>/dev/null || true
find "$OUT" -name "*.db*" -delete 2>/dev/null || true

echo "✔ www جاهز: $(find "$OUT" -type f | wc -l) ملفاً ($(du -sh "$OUT" | cut -f1)) → $OUT"

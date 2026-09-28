#!/bin/bash
set -e
SRC=/tmp/wtfix
DST=/tmp/deploy
rm -rf $DST && mkdir -p $DST
cd $SRC
# الملفات والمجلدات العامة فقط
# [v2.65.1-HOTFIX 2026-09-28] أُضيفت مجلدات الألعاب المستقلة الخمسة — كانت
# غائبة كلها من هذا السكربت (نفس فئة خلل deploy-pages.sh الذي عطّل أونو
# والبلوت على Cloudflare Pages). القاعدة: كل مجلد يُشار إليه من index.html
# يجب أن يُنسخ هنا — تحقق آلي: tests/_deploy_coverage_test.js
cp -r js css assets ronda-game backgammon-game dominoes-game uno-game baloot-game $DST/ 2>/dev/null
# لا اختبارات ولا وثائق ولا تكوينات في النشر
cleanup_game () {
  rm -rf "$DST/$1/tests" "$DST/$1/README.md" "$DST/$1/INTEGRATION.md" \
         "$DST/$1/index.html" 2>/dev/null || true
}
cleanup_game ronda-game; cleanup_game backgammon-game; cleanup_game dominoes-game
cleanup_game uno-game; cleanup_game baloot-game
rm -rf "$DST"/baloot-game/integration "$DST"/baloot-game/assets 2>/dev/null || true
for f in index.html admins.html about.html contact.html 2fa.html fairness.html \
         manifest.json robots.txt sitemap.xml favicon.ico _headers _redirects; do
  [ -e "$f" ] && cp "$f" $DST/
done
ls $SRC/favicon*.png >/dev/null 2>&1 && cp $SRC/favicon*.png $DST/
ls $SRC/*.webp >/dev/null 2>&1 && cp $SRC/*.webp $DST/
echo "deploy dir: $(find $DST -type f | wc -l) files"

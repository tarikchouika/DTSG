#!/bin/bash
set -e
SRC=/tmp/wtfix
DST=/tmp/deploy
rm -rf $DST && mkdir -p $DST
cd $SRC
# الملفات والمجلدات العامة فقط
cp -r js css assets $DST/ 2>/dev/null
for f in index.html admins.html about.html contact.html 2fa.html provably-fair.html fairness.html \
         manifest.json robots.txt sitemap.xml favicon.ico _headers _redirects; do
  [ -e "$f" ] && cp "$f" $DST/
done
ls $SRC/favicon*.png >/dev/null 2>&1 && cp $SRC/favicon*.png $DST/
ls $SRC/*.webp >/dev/null 2>&1 && cp $SRC/*.webp $DST/
# لا اختبارات ولا وثائق ولا تكوينات في النشر
echo "deploy dir: $(find $DST -type f | wc -l) files"

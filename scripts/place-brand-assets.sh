#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# تركيب صور الهوية الرسمية في مواضعها (تحويل PNG→webp عبر ImageMagick)
# الاستخدام:  bash scripts/place-brand-assets.sh [مسار_المرفقات]
# المسار الافتراضي: /home/user/uploads
# ════════════════════════════════════════════════════════════════
set -e
U="${1:-/home/user/uploads}"
R="$(cd "$(dirname "$0")/.." && pwd)"
A="$R/assets"
test -f "$U/game-card-dominoes.png" || { echo "❌ الصور غير موجودة في $U — أعد إرفاقها فتُنسخ تلقائياً"; exit 1; }

W() { convert "$U/$1" -quality 82 "$2"; echo "✔ $1 → ${2#$R/}"; }

# بطاقات الألعاب (الضومنة + الطاولة)
W game-card-dominoes.png   "$A/games/dominoes/icon.webp"
W game-card-backgammon.png "$A/games/backgammon/icon.webp"

# وجها العملة
W coin-obverse-black2.png "$A/dtsg/coin-obverse.webp"
W coin-reverse-black.png  "$A/dtsg/coin-reverse.webp"

# الشعارات
W dtsg-logo-main.png  "$A/dtsg/dtsg-logo-main.webp"
W dtsg-logo-black.png "$A/dtsg/dtsg-logo-black.webp"

# البانرات
W dtsg-banner-hero-dark.png  "$A/dtsg/dtsg-banner-hero-dark.webp"
W dtsg-banner-hero-light.png "$A/dtsg/dtsg-banner-hero-light.webp"
W dtsg-banner-scene-dark.png  "$A/dtsg/dtsg-banner-scene-dark.webp"
W dtsg-banner-scene-light.png "$A/dtsg/dtsg-banner-scene-light.webp"

# خلفيات الصفحات والبلاطات (داكن/فاتح)
W dtsg-bg-page-dark.png  "$A/dtsg/dtsg-bg-page-dark.webp"
W dtsg-bg-page-light.png "$A/dtsg/dtsg-bg-page-light.webp"
W dtsg-bg-tile-dark.png  "$A/dtsg/dtsg-bg-tile-dark.webp"
W dtsg-bg-tile-light.png "$A/dtsg/dtsg-bg-tile-light.webp"

# الأيقونة المفضلة بكل المقاسات
for S in 16 32 48 64 128 192 256 512; do
  convert "$U/dtsg-favicon-black2.png" -resize ${S}x${S} "$A/dtsg/favicon/dtsg-$S.png"
done
convert "$U/dtsg-favicon-black2.png" -resize 180x180 "$A/dtsg/favicon/dtsg-180.png"
convert "$U/dtsg-favicon-black2.png" -resize 32x32  "$A/dtsg/favicon/dtsg.ico"
cp "$A/dtsg/favicon/dtsg-32.png"  "$A/favicon-32.png"
cp "$A/dtsg/favicon/dtsg-16.png"  "$A/favicon-16.png"
cp "$A/dtsg/favicon/dtsg-180.png" "$A/favicon-180.png"
cp "$A/dtsg/favicon/dtsg-192.png" "$A/favicon-192.png"
cp "$A/dtsg/favicon/dtsg-48.png"  "$A/favicon-48.png"
echo "✅ اكتمل تركيب صور الهوية."

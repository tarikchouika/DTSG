#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — توليد شهادة التوقيع الإنتاجية للتطبيق (Custom Production Keystore)
#  [v2.82] توجيه المالك 2026-10-05: «تأكد من عدم استخدام شهادة التوقيع
#  الافتراضية (Debug Keystore)، بل أنشئ شهادة جديدة ذات صلاحية طويلة (30 سنة)
#  وقم بفك ترميزها إلى ANDROID_KEYSTORE_BASE64».
#
#  ▸ الشهادة **لا تُرفع للمستودع أبداً** (المستودع عام — قاعدة 5): سكربت
#    التوليد هنا للتوثيق والطوارئ فقط (إعادة توليد بمواصفات مطابقة ممكنة،
#    لكن **الاستعادة الحقيقية تكون من النسخة الاحتياطية للمالك** — الشهادة
#    الجديدة ≠ القديمة وتعني «تطبيق جديد» لا تحديثاً له).
#  ▸ المخرجات (المجلد الافتراضي خارج المستودع): dtsg-production.keystore
#    + ANDROID_KEYSTORE_BASE64.txt (محتوى سرّ GitHub) + تعليمات.
#  ▸ كلمة السر تُؤخذ من STOREPASS (أو تُولَّد عشوائياً إن لم تمرَّر) ولا تُكتب
#    في هذا السكربت ولا في المستودع — تُسلَّم في ملف التعليمات خارج المستودع.
#
#  الاستعمال:
#    bash scripts/make-production-keystore.sh [OUT_DIR]        # كلمة سر عشوائية
#    STOREPASS='...' bash scripts/make-production-keystore.sh [OUT_DIR]
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-/home/z/my-project/download/dtsg-keystore}"
ALIAS="dtsg-production"
VALIDITY_DAYS=10950          # 30 سنة × 365 يوم
KEYSTORE="$OUT_DIR/dtsg-production.keystore"
B64="$OUT_DIR/ANDROID_KEYSTORE_BASE64.txt"

[ -f "$KEYSTORE" ] && { echo "✗ الشهادة موجودة أصلاً: $KEYSTORE — لا تُستبدل"; exit 1; }
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

if [ -z "${STOREPASS:-}" ]; then
  STOREPASS="$(openssl rand -hex 16)"   # أبجدية رقمية فقط — آمنة في YAML والواجهة
  GENERATED_PASS="$STOREPASS"
  echo "ℹ وُلّدت كلمة سر عشوائية (ستُسلَّم في $OUT_DIR/keystore-password.txt)"
fi

keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 \
  -validity "$VALIDITY_DAYS" \
  -storetype PKCS12 \
  -storepass "$STOREPASS" -keypass "$STOREPASS" \
  -dname "CN=DTSG Gaming Platform, OU=Mobile, O=DTSG Gaming, L=Casablanca, ST=Casablanca-Settat, C=MA"

# فك الترميز إلى Base64 سطر واحد (محتوى سرّ ANDROID_KEYSTORE_BASE64 حرفياً)
base64 -w0 "$KEYSTORE" > "$B64"

# كلمة السر تُسلَّم في ملف محمي خارج المستودع (فقط إن وُلّدت عشوائياً هنا)
if [ -n "${GENERATED_PASS:-}" ]; then
  umask 177
  { echo "ANDROID_KEYSTORE_PASSWORD (وهي نفسها ANDROID_KEY_PASSWORD — عقد PKCS12):"
    echo "$GENERATED_PASS"
  } > "$OUT_DIR/keystore-password.txt"
  umask 022
fi

# تحقق مستقل: الشهادة تُفتح بكلمة السر والاسم المستعار موجود و30 سنة صالحة
keytool -list -v -keystore "$KEYSTORE" -storepass "$STOREPASS" -alias "$ALIAS" \
  > "$OUT_DIR/certificate-details.txt"
grep -E 'Alias name|Owner:|Valid until|Signature algorithm' "$OUT_DIR/certificate-details.txt" | head -4

chmod 600 "$KEYSTORE" "$B64"
echo ""
echo "✓ الشهادة الإنتاجية جاهزة: $KEYSTORE (PKCS12 · RSA-4096 · $VALIDITY_DAYS يوماً)"
echo "✓ محتوى سرّ ANDROID_KEYSTORE_BASE64: $B64"
echo "⚠ انقل الشهادة وكلمة السر إلى مكان آمن واحتفظ بنسخة احتياطية — فقدانها = عجز دائم عن تحديث التطبيق"

#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — التحقق الذاتي الكامل لحزمة شهادة الإنتاج والأسرار (VERIFY-BUNDLE)
#  [v2.82 · 2026-10-05] فحوص وكيل التحقق التشفيري (10/10 PASS) حُوّلت إلى أمر
#  واحد قابل للتكرار — يُشغَّل قبل أي عمل يتعلق بالتوقيع أو البناء أو الأسرار.
#
#  ▸ ما يفحصه: الملفات الستة · roundtrip Base64↔keystore بالاتجاهين (cmp
#    بايت-بايت) · كلمة السر 32-hex من السطر الثاني (لا تُطبع أبداً — أول 4
#    أحرف + ***) · keytool يفتح dtsg-production (PrivateKeyEntry/PKCS12
#    بإدخال وحيد) · المالك CN=DTSG Gaming Platform · البصمة SHA256 مطابقة
#    للثابت الموثق · الصلاحية 10950 يوماً (حساب من تاريخي keytool) ·
#    مطابقة certificate-details.txt مع مخرجات keytool -list -v عبر diff
#    بعد تنظيف الأسطر غير الثابتة.
#  ▸ أي فشل ⇒ رسالة عربية واضحة وخروج 1 — لا تُكمل ضبط الأسرار قبل 10/10.
#  ▸ قراءة-فحص فقط: لا يعدّل شيئاً، وملفاته المؤقتة (mktemp) تُمسح بtrap.
#  ▸ المتطلبات: JDK (keytool) + GNU coreutils (base64/date/cmp).
#
#  الاستعمال:
#    bash scripts/VERIFY-BUNDLE.sh                 # المسار الموثق افتراضياً
#    bash scripts/VERIFY-BUNDLE.sh <BUNDLE_DIR>    # أو مسار الحزمة وسيطاً
#    BUNDLE_DIR=<...> bash scripts/VERIFY-BUNDLE.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEFAULT_BUNDLE="/home/z/my-project/download/dtsg-keystore"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="${1:-${BUNDLE_DIR:-$DEFAULT_BUNDLE}}"
# النسخة المقيمة داخل الحزمة نفسها (بيئة المالك المستنسخة): مجلد السكربت هو الحزمة
if [ ! -d "$BUNDLE_DIR" ] && [ -f "$SCRIPT_DIR/dtsg-production.keystore" ]; then
  BUNDLE_DIR="$SCRIPT_DIR"
fi

# ── الثوابت الموثقة (قيم مُجمَّدة متحقَّق منها 2026-10-05 — لا تُعدَّل) ──
EXPECTED_ALIAS="dtsg-production"
EXPECTED_OWNER="CN=DTSG Gaming Platform"
EXPECTED_SHA256="41:21:9A:28:FD:80:7B:51:88:1F:38:3D:41:E0:CB:E7:1A:16:E6:12:6E:D0:64:A9:E6:FD:09:EF:1A:80:9E:C3"
EXPECTED_DAYS=10950

KEYSTORE="$BUNDLE_DIR/dtsg-production.keystore"
B64="$BUNDLE_DIR/ANDROID_KEYSTORE_BASE64.txt"
PWFILE="$BUNDLE_DIR/keystore-password.txt"
DETAILS="$BUNDLE_DIR/certificate-details.txt"

if ! command -v keytool >/dev/null 2>&1; then
  echo "✗ keytool غير متوفر في PATH — ثبّت JDK أولاً (التحقق التشفيري يتطلبه)." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS_N=0
FAIL_N=0
pass() { PASS_N=$((PASS_N+1)); echo "  ✓ PASS — $1"; }
fail() { FAIL_N=$((FAIL_N+1)); echo "  ✗ FAIL — $1" >&2; }

echo "═══ VERIFY-BUNDLE — التحقق الذاتي لحزمة شهادة الإنتاج (v2.82) ═══"
echo "المجلد: $BUNDLE_DIR"
echo ""

# ── 1/10 الملفات الستة ──
echo "── 1/10 الملفات الستة ──"
MISSING=0
for F in dtsg-production.keystore ANDROID_KEYSTORE_BASE64.txt keystore-password.txt certificate-details.txt README.md SECRETS-SETUP.md; do
  if [ -f "$BUNDLE_DIR/$F" ]; then
    echo "    • $F موجود"
  else
    echo "    • $F — مفقود!"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 0 ]; then
  pass "الملفات الستة كاملة في الحزمة"
else
  fail "ملفات ناقصة في الحزمة — استعِد النسخة الاحتياطية للمالك ولا تُرقّع"
fi
echo ""

# ── 2/10 roundtrip: فك ترميز الـBase64 ويطابق المخزن بايت-بايت ──
echo "── 2/10 roundtrip Base64 → keystore (فك الترميز + cmp) ──"
RT_OK=no
if [ -f "$KEYSTORE" ] && [ -f "$B64" ]; then
  # الصيغة الصحيحة الموثقة: tr -d '\r\n' ثم base64 -d (ترميز الملف سطر واحد بلا سطر جديد زائد)
  if tr -d '\r\n' < "$B64" | base64 -d > "$TMP/decoded.keystore" 2>/dev/null \
     && cmp -s "$TMP/decoded.keystore" "$KEYSTORE"; then
    pass "فك الترميز مطابق للمخزن بايت-بايت ($(wc -c < "$KEYSTORE") بايت)"
    RT_OK=yes
  else
    fail "ANDROID_KEYSTORE_BASE64.txt لا يفكّ ترميزه إلى المخزن نفسه (cmp ≠ 0)"
  fi
else
  fail "المخزن أو ملف الـBase64 مفقود — لا يمكن فحص الـroundtrip"
fi
echo ""

# ── 3/10 الاتجاه العكسي: ترميز المخزن يساوي محتوى الـtxt ──
echo "── 3/10 roundtrip keystore → Base64 (الاتجاه العكسي) ──"
if [ "$RT_OK" = yes ]; then
  base64 -w0 "$KEYSTORE" > "$TMP/reencoded.txt" 2>/dev/null
  # مقارنة المحتوى بعد تجاهل أي سطر جديد زائد (الملف الموثق بلا سطر جديد إطلاقاً)
  if tr -d '\r\n' < "$TMP/reencoded.txt" | cmp -s - <(tr -d '\r\n' < "$B64"); then
    pass "ترميز المخزن من جديد يطابق محتوى الـtxt حرفياً"
  else
    fail "إعادة ترميز المخزن لا تطابق ANDROID_KEYSTORE_BASE64.txt"
  fi
else
  fail "تخطّي الفحص العكسي (فشل فك الترميز في الفحص 2)"
fi
echo ""

# ── 4/10 كلمة السر: السطر الثاني بنمط 32-hex (لا تُطبع أبداً) ──
echo "── 4/10 كلمة السر (السطر الثاني — نمط 32-hex) ──"
STOREPASS=""
HAVE_SECRET=no
if [ -f "$PWFILE" ]; then
  STOREPASS="$(sed -n '2p' "$PWFILE" || true)"
  if [[ "$STOREPASS" =~ ^[0-9a-f]{32}$ ]]; then
    pass "كلمة السر 32 خانة hex صالحة (أول 4: ${STOREPASS:0:4}***) — لا تُطبع كاملة أبداً"
    HAVE_SECRET=yes
  else
    fail "كلمة السر لا تطابق ^[0-9a-f]{32}\$ (طول السطر الثاني: ${#STOREPASS})"
  fi
else
  fail "keystore-password.txt مفقود — لا يمكن التحقق من كلمة السر"
fi
echo ""

# ── 5/10 و6/10 keytool يفتح المخزن: الاسم المستعار + النوع ──
echo "── 5/10 keytool يفتح المخزن بكلمة السر ──"
C5=no
C6=no
if [ "$HAVE_SECRET" = yes ] && [ -f "$KEYSTORE" ]; then
  if LC_ALL=C keytool -list -keystore "$KEYSTORE" -storepass "$STOREPASS" > "$TMP/list.txt" 2> "$TMP/list.err"; then
    if grep -q "^${EXPECTED_ALIAS}," "$TMP/list.txt" && grep -q 'PrivateKeyEntry' "$TMP/list.txt"; then
      C5=yes
    fi
    if grep -q '^Keystore type: PKCS12' "$TMP/list.txt" && grep -q 'contains 1 entry' "$TMP/list.txt"; then
      C6=yes
    fi
  else
    echo "    رسالة keytool: $(head -1 "$TMP/list.err" || true)"
  fi
fi
if [ "$C5" = yes ]; then
  pass "المخزن يُفتح: ${EXPECTED_ALIAS} (PrivateKeyEntry)"
else
  fail "keytool لم يفتح المخزن على ${EXPECTED_ALIAS}/PrivateKeyEntry (كلمة سر خاطئة أو مخزن تالف)"
fi
echo ""

echo "── 6/10 نوع المخزن والإدخالات ──"
if [ "$C6" = yes ]; then
  pass "PKCS12 بإدخال وحيد (كلمة سر المخزن = كلمة سر المفتاح بعقد PKCS12)"
else
  fail "النوع ليس PKCS12 أو الإدخالات ليست وحيدة"
fi
echo ""

# ── المخرجات التفصيلية (أساس الفحوص 7-10) ──
C_V=no
if [ "$HAVE_SECRET" = yes ] && [ -f "$KEYSTORE" ]; then
  if LC_ALL=C keytool -list -v -keystore "$KEYSTORE" -storepass "$STOREPASS" -alias "$EXPECTED_ALIAS" \
     > "$TMP/detail.txt" 2> "$TMP/detail.err"; then
    C_V=yes
  fi
fi

# ── 7/10 المالك CN=DTSG Gaming Platform ──
echo "── 7/10 المالك (Owner) ──"
OWNER_LINE="$(grep '^Owner:' "$TMP/detail.txt" 2>/dev/null | head -1 || true)"
if [ "$C_V" = yes ] && [[ "$OWNER_LINE" == *"$EXPECTED_OWNER"* ]]; then
  pass "المالك يطابق الثابت: $OWNER_LINE"
else
  fail "المالك لا يطابق ${EXPECTED_OWNER} (الظاهر: ${OWNER_LINE:-لا شيء})"
fi
echo ""

# ── 8/10 البصمة SHA256 تطابق الثابت الموثق ──
echo "── 8/10 البصمة SHA256 ──"
FP="$(awk '/SHA256:/ {print $2; exit}' "$TMP/detail.txt" 2>/dev/null || true)"
if [ "$C_V" = yes ] && [ -n "$FP" ]; then
  echo "    البصمة الظاهرة: $FP"
fi
if [ "$C_V" = yes ] && [ "$FP" = "$EXPECTED_SHA256" ]; then
  pass "البصمة SHA256 مطابقة للثابت الموثق"
else
  fail "البصمة SHA256 غير مطابقة (الموثق: $EXPECTED_SHA256)"
fi
echo ""

# ── 9/10 الصلاحية 10950 يوماً (حساب من تاريخي keytool) ──
echo "── 9/10 الصلاحية (حساب الأيام من تاريخي keytool) ──"
VLINE="$(grep '^Valid from:' "$TMP/detail.txt" 2>/dev/null | head -1 || true)"
DAYS=-1
D1=""
D2=""
if [ "$C_V" = yes ] && [ -n "$VLINE" ]; then
  D1="${VLINE#Valid from: }"; D1="${D1%% until:*}"
  D2="${VLINE#* until: }"
  E1="$(date -d "$D1" +%s 2>/dev/null || echo 0)"
  E2="$(date -d "$D2" +%s 2>/dev/null || echo 0)"
  if [ "$E1" -gt 0 ] && [ "$E2" -gt 0 ]; then
    DAYS=$(( (E2 - E1) / 86400 ))
  fi
fi
if [ "$DAYS" -eq "$EXPECTED_DAYS" ]; then
  pass "الصلاحية $DAYS يوماً بالضبط (30 سنة): $D1 ← $D2"
else
  fail "الصلاحية المحسوبة $DAYS يوماً ≠ $EXPECTED_DAYS الموثقة (السطر: ${VLINE:-لا شيء})"
fi
echo ""

# ── 10/10 مطابقة certificate-details.txt بالمخرجات الحية (diff بعد التنظيف) ──
echo "── 10/10 مطابقة certificate-details.txt مع keytool -list -v ──"
NORM='^(Alias name:|Creation date:|Entry type:|Owner:|Issuer:|Serial number:|Valid from:|Signature algorithm name:|Subject Public Key Algorithm:)|^[[:space:]]+SHA(1|256): '
if [ "$C_V" = yes ] && [ -f "$DETAILS" ]; then
  grep -E "$NORM" "$TMP/detail.txt" > "$TMP/live.norm" 2>/dev/null || true
  grep -E "$NORM" "$DETAILS" > "$TMP/doc.norm" 2>/dev/null || true
  if cmp -s "$TMP/live.norm" "$TMP/doc.norm"; then
    pass "certificate-details.txt مطابق للمخرجات الحية بعد تنظيف الأسطر غير الثابتة (diff = 0)"
  else
    fail "اختلاف بين certificate-details.txt والمخرجات الحية (أول الفروق):"
    diff "$TMP/doc.norm" "$TMP/live.norm" | head -10 >&2 || true
  fi
else
  fail "لا يمكن المقارنة (المخرجات الحية غير متاحة أو certificate-details.txt مفقود)"
fi
echo ""

# ── الخلاصة ──
echo "════════════════════════════════════════════════════════════"
echo "الخلاصة: PASS=$PASS_N · FAIL=$FAIL_N (المطلوب 10/10)"
if [ "$FAIL_N" -eq 0 ] && [ "$PASS_N" -eq 10 ]; then
  echo "✓ الحزمة سليمة بالكامل — جاهزة لضبط الأسرار الأربعة: bash set-github-secrets.sh"
  exit 0
fi
echo "✗ فشل التحقق — لا تُكمل أي عمل توقيع أو أسرار قبل معالجة الأسباب (استعِد نسخة المالك الاحتياطية)"
exit 1

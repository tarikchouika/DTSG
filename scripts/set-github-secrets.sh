#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — ضبط أسرار GitHub الأربعة لتوقيع الإنتاج بضغطة واحدة (set-github-secrets)
#  [v2.82 · 2026-10-05] الخطوة الوحيدة المعلَّقة على المالك بعد توثيق v2.82:
#  ضبط ANDROID_KEYSTORE_BASE64 · ANDROID_KEYSTORE_PASSWORD · ANDROID_KEY_ALIAS
#  · ANDROID_KEY_PASSWORD في المستودع — بأمر واحد بدل أربع خطوات يدوية.
#
#  ▸ تحقق مسبق إلزامي: يستدعي VERIFY-BUNDLE.sh من مجلده نفسه (النسختان معاً
#    دائماً) ويتوقف بلا ضبط أي سر إن لم يمر كاملاً (10/10).
#  ▸ يشترط gh CLI مثبتاً ومصادقاً (`gh auth login`) بصلاحية push على المستودع.
#  ▸ لا يطبع كلمة السر إطلاقاً — يقرأها من السطر الثاني لkeystore-password.txt
#    (السطر الأول ترويسة)، ويعرض الأسماء لا القيم في التحقق البعدي.
#  ▸ الإعادة تعيد ضبط القيم الأربع (استبدال) — يطلب تأكيداً تفاعلياً، أو
#    ASSUME_YES=1 للتنفيذ الآلي.
#
#  الاستعمال:
#    bash scripts/set-github-secrets.sh [BUNDLE_DIR]
#    REPO=<owner/name> bash scripts/set-github-secrets.sh   # الافتراضي tarikchouika/DTSG
#    ASSUME_YES=1 bash scripts/set-github-secrets.sh        # آلي بلا سؤال
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="${REPO:-tarikchouika/DTSG}"
DEFAULT_BUNDLE="/home/z/my-project/download/dtsg-keystore"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="${1:-${BUNDLE_DIR:-$DEFAULT_BUNDLE}}"
# النسخة المقيمة داخل الحزمة نفسها (بيئة المالك المستنسخة): مجلد السكربت هو الحزمة
if [ ! -d "$BUNDLE_DIR" ] && [ -f "$SCRIPT_DIR/dtsg-production.keystore" ]; then
  BUNDLE_DIR="$SCRIPT_DIR"
fi

VERIFY="$SCRIPT_DIR/VERIFY-BUNDLE.sh"
PWFILE="$BUNDLE_DIR/keystore-password.txt"

echo "═══ set-github-secrets — ضبط أسرار التوقيع الأربعة على $REPO ═══"
echo ""

# ── 1/5 التحقق المسبق من الحزمة (إلزامي — من نفس دليل هذا السكربت) ──
echo "── 1/5 التحقق المسبق من الحزمة (إلزامي) ──"
if [ ! -f "$VERIFY" ]; then
  echo "✗ VERIFY-BUNDLE.sh غير موجود بجوار هذا السكربت في: $SCRIPT_DIR" >&2
  echo "  النسختان مجموعة واحدة — انسخهما معاً (إلى scripts/ المستودع أو إلى مجلد الحزمة)." >&2
  exit 1
fi
if ! bash "$VERIFY" "$BUNDLE_DIR"; then
  echo "" >&2
  echo "✗ فشل التحقق المسبق للحزمة — توقف بلا ضبط أي سر." >&2
  exit 1
fi
echo ""

# ── 2/5 فحص gh CLI والمصادقة والصلاحيات ──
echo "── 2/5 فحص gh CLI والمصادقة والصلاحيات ──"
if ! command -v gh >/dev/null 2>&1; then
  echo "✗ gh غير مثبت على هذه الآلة — ثبّته أولاً ثم أعد هذا السكربت:" >&2
  echo "    دليل التثبيت: https://cli.github.com/   (أو: sudo apt install gh)" >&2
  echo "    بعدها صادق الحساب: gh auth login" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "✗ gh مثبت لكنه غير مصادق — نفّذ: gh auth login  ثم أعد هذا السكربت." >&2
  exit 1
fi
PUSH_OK="$(gh api "repos/$REPO" --jq '.permissions.push' 2>/dev/null || echo false)"
if [ "$PUSH_OK" != "true" ]; then
  echo "✗ الحساب المصادق لا يملك صلاحية push على $REPO (أو المستودع غير متاح له)." >&2
  echo "    هذا سكربت المالك — على بيئة عمل المساعدين بلا توكن تتوقف هنا بشكل طبيعي." >&2
  exit 1
fi
echo "  ✓ gh مصادق ويملك صلاحية push على $REPO"
echo ""

# ── 3/5 ملخص قبل التنفيذ + تأكيد ──
echo "── 3/5 ملخص قبل التنفيذ ──"
if [ ! -f "$PWFILE" ]; then
  echo "✗ ملف كلمة السر مفقود: $PWFILE — التحقق المسبق كان يجب أن يوقفه قبل هذا." >&2
  exit 1
fi
STOREPASS="$(sed -n '2p' "$PWFILE" || true)"
echo "  المستودع: $REPO"
echo "  الأسرار الأربعة ومصادر قيمها:"
echo "    1) ANDROID_KEYSTORE_BASE64   ← محتوى ANDROID_KEYSTORE_BASE64.txt (سطر واحد)"
echo "    2) ANDROID_KEYSTORE_PASSWORD ← السطر الثاني من keystore-password.txt (لن يُطبع)"
echo "    3) ANDROID_KEY_ALIAS         ← الثابت: dtsg-production"
echo "    4) ANDROID_KEY_PASSWORD      ← نفس كلمة السر (عقد PKCS12: مفتاح = مخزن)"
echo "  ⚠ التنفيذ يستبدل القيم الحالية للأسرار الأربعة إن كانت مضبوطة سابقاً."
echo "  ⚠ القيم تُقرأ من ملفات الحزمة مباشرة ولا تُطبع في أي مخرج."
if [ "${ASSUME_YES:-0}" != "1" ]; then
  printf '  للمتابعة اكتب yes (أي شيء آخر يلغي): '
  read -r ANSWER || ANSWER=""
  if [ "$ANSWER" != "yes" ] && [ "$ANSWER" != "y" ]; then
    echo "أُلغي — لم يُضبط أي سر."
    exit 1
  fi
else
  echo "  (ASSUME_YES=1 — تنفيذ آلي بلا سؤال)"
fi
echo ""

# ── 4/5 التنفيذ: الأسرار الأربعة ──
echo "── 4/5 ضبط الأسرار الأربعة ──"
gh secret set ANDROID_KEYSTORE_BASE64 < "$BUNDLE_DIR/ANDROID_KEYSTORE_BASE64.txt" -R "$REPO"
gh secret set ANDROID_KEYSTORE_PASSWORD --body "$STOREPASS" -R "$REPO"
gh secret set ANDROID_KEY_ALIAS --body "dtsg-production" -R "$REPO"
gh secret set ANDROID_KEY_PASSWORD --body "$STOREPASS" -R "$REPO"
echo ""

# ── 5/5 التحقق البعدي: الأسماء الأربعة (لا القيم) ──
echo "── 5/5 التحقق البعدي (gh secret list — الأسماء لا القيم) ──"
SECRETS_LIST="$(gh secret list -R "$REPO" 2>/dev/null || true)"
ALL_OK=yes
for S in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  if printf '%s\n' "$SECRETS_LIST" | grep -Eq "^${S}([[:space:]]|$)"; then
    echo "  ✓ $S مضبوط"
  else
    echo "  ✗ $S غير ظاهر في gh secret list"
    ALL_OK=no
  fi
done
if [ "$ALL_OK" != yes ]; then
  echo "✗ الأسرار الأربعة غير مكتملة — راجع رسائل الخطأ أعلاه ثم أعد السكربت." >&2
  exit 1
fi
echo ""
echo "✓ تم ضبط الأسرار الأربعة على $REPO — البناء القادم سيوقَّع بشهادة الإنتاج وينشر Release تلقائياً."
echo ""
echo "الرابط الدائم للتحميل بعد أول بناء ناجح:"
echo "  https://github.com/$REPO/releases/latest/download/DTSG-Gaming-App.apk"
echo ""
echo "الخطوة التالية (للمالك): ادفع كود سير العمل v2.82 (أو Actions ⇒ Build Android APK ⇒ Run workflow) —"
echo "تذكير: احذف نسخة Debug القديمة من الهاتف قبل تثبيت أول إصدار إنتاجي (توقيعان مختلفان)."

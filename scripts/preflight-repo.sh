#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — فحص ما قبل العمل (Preflight)  🛡️
#  يمنع أخطر خطأ في هذا المشروع: العمل/الدفع من المستودع القديم
#  (digital-moroccan-casino) أو من فرع غير main.
#
#  الاستعمال:   bash scripts/preflight-repo.sh [--strict]
#     --strict : يفشل أيضاً عند وجود فروع محلية غريبة أو شجرة غير نظيفة
#  الخروج: 0 = سليم · 1 = خطر (توقّف ولا تدفع)
#  المرجع: docs/ASSISTANT_GUARDRAILS.md · AGENTS.md
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail
STRICT=0; [ "${1:-}" = "--strict" ] && STRICT=1

EXPECTED_REPO="tarikchouika/DTSG"
FORBIDDEN_REMOTE="digital-moroccan-casino"
FORBIDDEN_PATHS="dmgames-arena|digital-moroccan-casino"

ok()  { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[1;31m✗\033[0m %s\n' "$*"; FAILED=1; }
warn(){ printf '   \033[1;33m!\033[0m %s\n' "$*"; }
say() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
FAILED=0

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || { bad "تعذّر دخول جذر المستودع"; exit 1; }
printf '\n\033[1mDTSG preflight\033[0m — المجلد: %s\n' "$ROOT"

# ── 1) هل هذا مستودع git؟ ──
say "1) مستودع git"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ok "مستودع git صالح ($(git rev-parse --show-toplevel))"
else
  bad "ليس مستودع git — لا تدفع من هنا"
  exit 1
fi

# ── 2) هوية الريموت (الأهم) ──
say "2) هوية الريموت (يجب أن تكون $EXPECTED_REPO)"
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$REMOTE_URL" ]; then
  warn "لا ريموت origin — (مقبول في نسخ نُسخِها بلا git)"
else
  HOSTPATH="$(printf '%s' "$REMOTE_URL" | sed -E 's#^[a-z]+://([^@/]*@)?##; s#^git@[^:]+:##; s#\.git$##')"
  case "$HOSTPATH" in
    *"$EXPECTED_REPO"*) ok "origin = $EXPECTED_REPO" ;;
    *) bad "origin = $HOSTPATH — ليس $EXPECTED_REPO!" ;;
  esac
  case "$REMOTE_URL" in
    *"$FORBIDDEN_REMOTE"*) bad "الريموت يشير إلى المستودع القديم ($FORBIDDEN_REMOTE) — توقّف فوراً" ;;
  esac
fi

# ── 3) المسار: علامات المجلد القديم ──
say "3) مسار المجلد"
if printf '%s' "$ROOT" | grep -Eq "$FORBIDDEN_PATHS"; then
  bad "المسار يشبه مجلد المستودع/الـworktree القديم ⇒ لا git pull ولا دفع من هنا"
else
  ok "المسار لا يحمل علامات المجلد القديم"
fi

# ── 4) علامات محتوى DTSG ──
say "4) علامات محتوى DTSG"
MISSING=""
for f in index.html cf-worker/payments-core.js css/22-look.css docs/PHONE_DB_TUNNEL_GUIDE.md AGENTS.md; do
  [ -e "$f" ] || MISSING="$MISSING $f"
done
if [ -z "$MISSING" ]; then ok "الملفات المميّزة موجودة (index.html · cf-worker · css/22-look.css · الوثائق · AGENTS.md)"
else bad "ملفات DTSG ناقصة:$MISSING ⇒ قد تكون في شجرة خاطئة"; fi

# ── 5) الفرع الحالي ──
say "5) الفرع الحالي (يجب main)"
BR="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ "$BR" = "main" ]; then ok "على main"
elif [ "$BR" = "HEAD" ]; then warn "رأس منفصل (detached) — لا تدفع قبل الرجوع إلى main"
else bad "أنت على «$BR» وليس main ⇒ لا تدفع"; fi

# ── 6) الفروع المحلية الغريبة ──
say "6) الفروع المحلية"
LOCAL="$(git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null || true)"
EXTRA="$(printf '%s\n' "$LOCAL" | grep -Ev '^main$' | grep -v '^$' || true)"
if [ -z "$EXTRA" ]; then ok "لا فروع محلية غير main"
else
  warn "فروع محلية إضافية: $(printf '%s' "$EXTRA" | tr '\n' ' ')"
  [ "$STRICT" = "1" ] && bad "--strict: نظّفها أو احذفها بعد إثبات behind_by=0"
fi

# ── 7) نظافة الشجرة ──
say "7) حالة الشجرة"
DIRTY="$(git status --porcelain 2>/dev/null | head -5)"
if [ -z "$DIRTY" ]; then ok "شجرة نظيفة"
else
  warn "تغييرات غير مودعة:"; printf '%s\n' "$DIRTY" | sed 's/^/       /'
  [ "$STRICT" = "1" ] && bad "--strict: أودع أو أرجِع التغييرات قبل الدفع"
fi

# ── 8) مصدر فرع النشر (لا يعود للقديم) ──
say "8) مصادر git في السكربتات (لا تعمل على المستودع القديم)"
# نبحث عن استعمال *فعلي* (لا تعليق ولا تعريف حارس): BRANCH_SOURCE= أو أمر git يذكر القديم/فرعه
SRC_HITS="$(grep -rnE '^[[:space:]]*[^#]*(BRANCH_SOURCE=|FEED_BRANCH=)' scripts/*.sh 2>/dev/null | grep --exclude=preflight-repo.sh -E 'digital-moroccan-casino|arena/01a0' | grep -v 'preflight-repo.sh:' || true)"
GIT_HITS="$(grep -rnE '^[[:space:]]*[^#]*git[[:space:]]+(fetch|clone|pull|push|checkout|switch|reset|remote add)[^\n]*(digital-moroccan-casino|arena/01a0)' scripts/*.sh tests/*.js 2>/dev/null | grep -vE 'preflight-repo\.sh:|_repo_origin_test\.js:' || true)"
if [ -n "$SRC_HITS$GIT_HITS" ]; then
  bad "استعمال فعلي للمستودع/الفرع القديم:"
  printf '%s\n%s\n' "$SRC_HITS" "$GIT_HITS" | grep -v '^$' | sed 's/^/       /'
else ok "لا استعمال فعلي للمستودع القديم أو فروعه"; fi
if grep -qE 'BRANCH_SOURCE=.*origin/main' scripts/deploy-pages.sh 2>/dev/null; then
  ok "deploy-pages.sh يبني من origin/main"
else warn "راجع BRANCH_SOURCE في scripts/deploy-pages.sh"; fi

# ── 9) صيغ دفع خطِرة في السكربتات ──
say "9) صيغ دفع خطِرة"
RISKY="$(grep -rnE "^[[:space:]]*[^#]*git[[:space:]]+push[^\n]*--(all|mirror)" scripts/*.sh tests/*.js 2>/dev/null | grep -vE "preflight-repo\.sh:|_repo_origin_test\.js:" || true)"
if [ -n "$RISKY" ]; then
  bad "توجد صيغة دفع خطِرة (--all/--mirror):"; printf '%s\n' "$RISKY" | sed 's/^/       /'
else ok "لا --all ولا --mirror في سكربت أو اختبار"; fi

printf '\n════════════════════════════════════════════\n'
if [ "$FAILED" = "0" ]; then
  printf '\033[1;32m✔ preflight سليم — يمكنك العمل والدفع إلى main\033[0m\n'
  exit 0
else
  printf '\033[1;31m✘ preflight فاشل — توقّف فوراً وراجع docs/ASSISTANT_GUARDRAILS.md\033[0m\n'
  exit 1
fi

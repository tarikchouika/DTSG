#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — إعادة ربط git بالمستودع بلا استهلاك مساحة مساحة العمل
#  يجلب أحدث main (depth=1) إلى مجلد خارج اللقطة (/tmp) ويربطه بشجرة العمل.
#  السبب: حزمة git تخزّن صور الأصول (51MB) مرة ثانية ⇒ تتجاوز سقف مساحة العمل.
#  التاريخ الكامل محفوظ على GitHub؛ للتاريخ الكامل محلياً: git fetch --unshallow
#  الاستعمال:  bash scripts/relink-git.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITDIR="${DTSG_GITDIR:-/tmp/dtsg-git}"
URL="${DTSG_REPO:-https://github.com/tarikchouika/DTSG.git}"
BRANCH="${DTSG_BRANCH:-main}"
[ -e "$REPO/.git" ] && { echo "✗ .git موجود مسبقاً — احذفه أو انقل الوجهة"; exit 1; }
rm -rf "$GITDIR"; mkdir -p "$GITDIR"
git init --bare -q "$GITDIR"
git --git-dir="$GITDIR" remote add origin "$URL"
git --git-dir="$GITDIR" fetch -q --depth=1 origin "$BRANCH:refs/heads/$BRANCH"
git --git-dir="$GITDIR" symbolic-ref HEAD "refs/heads/$BRANCH"
printf 'gitdir: %s\n' "$GITDIR" > "$REPO/.git"
git --git-dir="$GITDIR" config core.bare false
git --git-dir="$GITDIR" config core.worktree "$REPO"
git --git-dir="$GITDIR" --work-tree="$REPO" reset -q --mixed HEAD
echo "✓ أُعيد الربط: $(git -C "$REPO" log --oneline -1)"
git -C "$REPO" status --short | head -5

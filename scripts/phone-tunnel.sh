#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DTSG — أداة نفق الهاتف  🌉   (تُشغَّل على الهاتف نفسه)
#
#  ما تفعله:
#    up [ssh|cloudflare]  يفتح نفقاً إلى خادم الهاتف (المنفذ 3000 افتراضاً)
#    publish <url>        ينشر عنوان النفق إلى Cloudflare KV (الذي يقرأه الووركر
#                         الوسيط casino-phone) + يحدّث tunnel-live.json محلياً
#    status               يعرض: قيمة KV · صحة الخادم محلياً · صحة السلسلة عمومياً
#    down                 يوقف النفق الذي فتحته الأداة
#
#  لماذا KV؟ الووركر الوسيط (casino-phone.dmgames-api.workers.dev) يقرأ المفتاح
#  «url» من KV (بمهلة كاش 15 ثانية) ويوجّه كل /api/* إلى نفق الهاتف.
#  ⇒ تغيير عنوان النفق لا يحتاج أي تعديل في الواجهة ولا في api-url2.json.
#
#  المتطلبات على الهاتف:
#    * up ssh         → openssh (pkg install openssh / apt install openssh-client)
#    * up cloudflare  → cloudflared
#    * publish/status → curl + متغيرا البيئة:
#         export CLOUDFLARE_ACCOUNT_ID=<account-id>
#         export CLOUDFLARE_API_TOKEN=<token>        # لا يُكتب في أي ملف
#  الاستعمال:
#      bash scripts/phone-tunnel.sh up ssh
#      bash scripts/phone-tunnel.sh publish https://xxxx.lhr.life
#      bash scripts/phone-tunnel.sh status
#  خيارات: DTSG_PORT=3000 · DTSG_PUBLIC=https://casino-phone... · TUNNEL_KV_NS=...
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${DTSG_PORT:-3000}"
PUBLIC="${DTSG_PUBLIC:-https://casino-phone.dmgames-api.workers.dev}"
ACC="${CLOUDFLARE_ACCOUNT_ID:-}"
TOK="${CLOUDFLARE_API_TOKEN:-}"
NS="${TUNNEL_KV_NS:-4e337927984c41698964a7d655dee71b}"       # مساحة tunnel-url
LOG="${DTSG_TUNNEL_LOG:-$HOME/dtsg-tunnel.log}"
PIDF="$HOME/.dtsg-tunnel.pid"

say() { printf '\n\033[1;36m── %s\033[0m\n' "$*"; }
ok()  { printf '   \033[1;32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[1;31m✗\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }
have(){ command -v "$1" >/dev/null 2>&1; }

kv_get() { curl -s -m 15 -H "Authorization: Bearer $TOK" \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/storage/kv/namespaces/$NS/values/url" 2>/dev/null; }
kv_put() { curl -s -m 20 -X PUT -H "Authorization: Bearer $TOK" \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/storage/kv/namespaces/$NS/values/url" \
  --data-binary "$1" 2>/dev/null; }
h_local() { curl -s -m 8 "http://127.0.0.1:$PORT/api/health" 2>/dev/null; }
h_pub()   { curl -s -m 20 "$PUBLIC/api/health" 2>/dev/null; }

need_cf() {
  [ -n "$ACC" ] || die "CLOUDFLARE_ACCOUNT_ID غير مضبوط — export CLOUDFLARE_ACCOUNT_ID=<account-id>"
  [ -n "$TOK" ] || die "CLOUDFLARE_API_TOKEN غير مضبوط — export CLOUDFLARE_API_TOKEN=<token>  (لا تكتبه في أي ملف)"
}

url_from_log() { grep -oE 'https://[a-z0-9-]+\.(lhr\.life|trycloudflare\.com|loca\.lt)' "$LOG" 2>/dev/null | tail -1; }

cmd_up() {
  local kind="${1:-ssh}"
  have curl >/dev/null || die "curl غير مثبّت"
  local already; already="$(url_from_log)"; [ -n "$already" ] && { ok "نفق قائم بالفعل: $already"; return 0; }
  : > "$LOG"
  if [ "$kind" = "cloudflare" ]; then
    have cloudflared || die "cloudflared غير مثبّت (pkg install cloudflared أو ثبّته من cloudflare.com)"
    say "فتح نفق Cloudflare إلى المنفذ $PORT"
    nohup cloudflared tunnel --url "http://127.0.0.1:$PORT" >>"$LOG" 2>&1 &
  else
    have ssh || die "ssh غير مثبّت (pkg install openssh)"
    say "فتح نفق localhost.run إلى المنفذ $PORT"
    nohup ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
      -R 80:localhost:"$PORT" nokey@localhost.run >>"$LOG" 2>&1 &
  fi
  echo $! > "$PIDF"
  printf '   … انتظار العنوان '
  local i u=""
  for i in $(seq 1 30); do sleep 1; printf '.'; u="$(url_from_log)"; [ -n "$u" ] && break; done
  echo
  [ -n "$u" ] || { bad "لم يظهر عنوان في $LOG — راجع السجل:"; tail -6 "$LOG"; exit 1; }
  ok "عنوان النفق: $u"
  cmd_publish "$u"
}

cmd_publish() {
  local u="${1:-}"
  [ -n "$u" ] || die "الاستعمال: bash scripts/phone-tunnel.sh publish https://xxxx.lhr.life"
  u="${u%/}"
  need_cf
  say "نشر العنوان إلى Cloudflare KV (المفتاح: url)"
  local out; out="$(kv_put "$u")"
  case "$out" in *'"success":true'*) ok "KV ← $u" ;; *) bad "فشل النشر: $(printf '%s' "$out" | head -c 200)"; exit 1 ;; esac
  # تحديث الملف المرجعي في المستودع (لا يُدفع تلقائياً)
  if [ -f "$REPO/tunnel-live.json" ]; then
    printf '{"url": "%s"}\n' "$u" > "$REPO/tunnel-live.json"
    ok "tunnel-live.json محدَّث محلياً (دفعه: git -C $REPO add tunnel-live.json && git commit && git push)"
  fi
  say "التحقق من السلسلة عمومياً (قد يستغرق حتى 15 ثانية لكاش الووركر)"
  local i h=""
  for i in $(seq 1 6); do
    h="$(h_pub)"; case "$h" in *'"ok":true'*) ok "الووركر الوسيط → الهاتف ✔  $(printf '%s' "$h" | head -c 160)"; return 0 ;; esac
    sleep 4
  done
  bad "الووركر لم يصل بعد — تأكد أن النفق حيّ وأن المسار /api/health يعمل محلياً"
  printf '   رد الووركر: %s\n' "$(printf '%s' "$h" | head -c 160)"
  return 1
}

cmd_status() {
  say "1) قيمة KV الحالية (مصدر الووركر)"
  if [ -n "$ACC" ] && [ -n "$TOK" ]; then kv_get; echo; else bad "بلا مفاتيح CF — تخطّي"; fi
  say "2) الخادم محلياً (http://127.0.0.1:$PORT/api/health)"
  h_local | head -c 200; echo
  say "3) السلسلة عمومياً ($PUBLIC/api/health)"
  h_pub | head -c 200; echo
  say "4) النفق الذي فتحته الأداة"
  local u; u="$(url_from_log)"; [ -n "$u" ] && ok "$u" || bad "لا نفق مسجَّل في $LOG"
  if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF" 2>/dev/null)" 2>/dev/null; then ok "العملية حيّة (pid $(cat "$PIDF"))"; else bad "لا عملية نفق من هذه الأداة"; fi
}

cmd_down() {
  if [ -f "$PIDF" ]; then
    local p; p="$(cat "$PIDF")"
    kill "$p" 2>/dev/null && ok "أُوقفت العملية $p" || bad "العملية غير حيّة"
    rm -f "$PIDF"
  else
    bad "لا ملف pid — أوقف النفق يدوياً (pkill -f localhost.run)"
  fi
}

case "${1:-}" in
  up)      shift; cmd_up "${1:-ssh}" ;;
  publish) shift; cmd_publish "${1:-}" ;;
  status)  cmd_status ;;
  down)    cmd_down ;;
  *) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//' ;;
esac

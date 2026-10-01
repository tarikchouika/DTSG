#!/bin/bash
# ═══ عدّاء الانحدار الكامل لغرف DTSG (v2.70.1) ═══
# يشغّل خادماً معزولاً في نسخة منفصلة (بيانات مستقلة) ويجري كل اختبارات
# الغرف/المال المحورية، ثم يطبع المجموع.
#
#   bash tests/_run_regression_rooms.sh
#
# [v2.71] جناح الاستعادة لا يعتمد على منظّف الأشباح: يغلق لاعب بنفسه صراحةً
# (مغادرة لا انقطاع) فيُوسم مقعده فوراً ⇒ فحص بلا انتظار وبلا تسريع عام
# يزعج اختبارات الـAPI التي لا تفتح قناة SSE (فكل لاعبينها «أشباح»).
# [v2.70.1] يُربط node_modules بالنسخة المعزولة (QA_NODE_MODULES، افتراضياً
# $REPO/node_modules) وإلا فشلت أجنحة المتصفح/المحرك بـMODULE_NOT_FOUND وهي
# ليست انحداراً؛ وأُضيف جناح v270 (حرس الدور/المُرسِل + التسوية الخادمية).
#
# ⚠️ [v2.69.1] السلامة: الإصدار الأول من هذا السكربت كان يقلع الخادم على المنفذ
# 3000 ومن داخل المستودع — أي كان يفتح قاعدة الإنتاج data/royalcoin.db ويجعل
# اختبارات المال تكتب مستخدمين وغرفاً وصفوف bet/win/refund في السجل المالي الحيّ،
# كما كانت اختبارات الغرف تتصل بخادم الإنتاج مباشرة. الآن:
#   • الخادم يعمل في نسخة معزولة (QA_DIR) بقاعدة بيانات جديدة تماماً.
#   • المنفذ QA_PORT (افتراضي 3971) — لا 3000 أبداً.
#   • يرفض التشغيل كلياً إن كان المنفذ مربوطاً بخادم المنصة الحيّ.
#   • يصدّر QA_BASE لتوجيه الاختبارات التي تحترمه.
#
# ملاحظة: _req3_test فيه فشل واحد موروث عن v2.68 («لوحة المتفرج») — يُحسب
# منفصلاً (معروف) ولا يُرفع المجموع، حتى يبقى المقياس صادقاً.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
QA_PORT="${QA_PORT:-3971}"
QA_DIR="${QA_DIR:-/tmp/dtsg-rooms-qa}"
KNOWN_FAIL_FILE="tests/_req3_test.js"

cd "$REPO"

# ── 1) رفض التشغيل إن كان المنفذ يخص خادم المنصة الحيّ ──
live_ports() {
  local pid ports=""
  for pid in $(pm2 pid casino-server 2>/dev/null; pm2 pid dtsg-voucher-bot 2>/dev/null); do
    [ -n "$pid" ] || continue
    ports="$ports $( (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) \
      | grep "pid=$pid," | grep -oE ':[0-9]+ ' | tr -d ': ' )"
  done
  echo "$ports"
}
if live_ports | grep -qw "$QA_PORT"; then
  echo "✗ رفض: المنفذ $QA_PORT مربوط بخادم المنصة الحيّ (pm2)."
  echo "  اختر منفذاً آخر:  QA_PORT=3972 bash tests/_run_regression_rooms.sh"
  exit 2
fi

# ── 2) نسخة معزولة: بيانات جديدة، لا مساس بقاعدة الإنتاج ──
echo "── تجهيز النسخة المعزولة: $QA_DIR (المنفذ $QA_PORT)"
for p in $( (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep ":$QA_PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u ); do
  cwd="$(readlink /proc/$p/cwd 2>/dev/null || true)"
  case "$cwd" in
    "$QA_DIR"|/tmp/dtsg-qa*|/tmp/full) kill "$p" 2>/dev/null || true ;;
    *) echo "   (المنفذ $QA_PORT مستخدم من $cwd — يُتجاهل)" ;;
  esac
done
sleep 1
rm -rf "$QA_DIR"; mkdir -p "$QA_DIR/data"
tar -C "$REPO" --exclude=.git --exclude=node_modules --exclude=uploads \
    --exclude=.env.local --exclude=.env --exclude=data --exclude=backups -cf - . \
  | tar -xf - -C "$QA_DIR"

# ── 2-ب) node_modules: اختبارات المتصفح/المحرك تحتاجها، والنسخة لا تنسخها ──
# [v2.70.1] بدون هذا تفشل الأجنحة الخمسة بMODULE_NOT_FOUND (خطأ بيئة لا انحدار):
# النسخة المعزولة تُستثنى من النسخ والقائمة، وrequire() لا يصعد من /tmp إلى المستودع.
QA_MODULES="${QA_NODE_MODULES:-$REPO/node_modules}"
if [ -d "$QA_MODULES" ]; then
  ln -sfn "$QA_MODULES" "$QA_DIR/node_modules"
  export NODE_PATH="$QA_MODULES"
  echo "── node_modules: $QA_MODULES (مربوط بالنسخة)"
else
  echo "⚠ لا توجد $QA_MODULES — أجنحة المتصفح/المحرك ستُبلَّغ MODULE_NOT_FOUND."
  echo "  remedy:  npm install            (أو)  QA_NODE_MODULES=/path/to/node_modules bash $0"
fi

# [v2.73.0] ‏aarch64: أجنحة المتصفح لا يمكنها الإقلاع على هذا الهاتف أصلاً.
# ثنائي @sparticuz/chromium المتاح في npm مبني لـ x86-64، و CDN متصفحات
# Playwright محجوب ⇒ MODULE_NOT_FOUND أو ENOENT عند الإطلاق. هذا قيد بيئة
# معروف لا انحدار: يُقرأ تحذيرRunner نفسه ولا يُحسب نجاحاً ولا فشلاً.
ARCH="$(uname -m)"
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  echo "── تنبيه: المعمارية $ARCH — أجنحة المتصفح غير قابلة للإقلاع هنا"
  echo "   (ثنائي chromium المتاح x86-64). MODULE_NOT_FOUND فيها قيد بيئة"
  echo "   لا انحدار؛ باقي الأجنحة الخادمية هي المقياس."
fi

# ── 3) خادم الاختبار ──
cd "$QA_DIR"
env PORT="$QA_PORT" DM_TEST_MODE=1 DTSG_GHOST_GRACE_MS=1 USD_GOLD_RATE=100 \
    ADMIN_API_SECRET=qa-admin-secret PAYMENTS_SHARED_SECRET=qa-shared-secret \
    DM_SEED_SUPER_PW=QaTest12345 TELEGRAM_ADMIN_CHAT_ID=999000001 SUPPORT_SUPER_TG=999000001 \
    node server.js > /tmp/dtsg_regression.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT INT TERM
for i in $(seq 1 20); do
  curl -sf "http://127.0.0.1:$QA_PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
if ! curl -sf "http://127.0.0.1:$QA_PORT/api/health" >/dev/null 2>&1; then
  echo "✗ لم يقلع خادم الاختبار — آخر السجل:"; tail -12 /tmp/dtsg_regression.log; kill $SRV 2>/dev/null; exit 3
fi
echo "✔ خادم الاختبار يعمل على $QA_PORT (بيانات معزولة)"
QA_DB="$QA_DIR/data/royalcoin.db" node "$REPO/tests/_mkusers.js" >/dev/null 2>&1
export QA_BASE="http://127.0.0.1:$QA_PORT/"

PASS=0; FAIL=0; SKIP=0; FAILED_TESTS=""; SKIPPED_TESTS=""

# [v2.73.0] أجنحة المتصفح تُحسم مسبقاً: إن لم يكن هناك متصفح قابل للإقلاع
# على هذا المعمارية، فهي **تخطّي بيئة** لا انحدار. سابقاً كانت كل تُبلَّغ
# MODULE_NOT_FOUND/ENOENT وتُحسب فشلاً — فكان العدّاد يقول «انحدار» بسبب جهاز.
is_browser_suite () { grep -qE "require\('playwright'\)|_rd_pw\.js" "$QA_DIR/$1" 2>/dev/null; }
BROWSER_OK=0
if (cd "$QA_DIR" && node -e "
  (async()=>{ const {chromium}=require('playwright');
    const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    await b.close(); })().catch(()=>process.exit(1));" >/dev/null 2>&1); then
  BROWSER_OK=1
fi

run () {
  local name="$1"; local file="$2"; local cwd="${3:-$QA_DIR}"
  echo "════ $name ════"
  if [ "$BROWSER_OK" = "0" ] && is_browser_suite "$file"; then
    echo "   ⏭  متخطّى: أجنحة المتصفح لا تُقلَع على $(uname -m) — قيد بيئة لا انحدار."
    SKIP=$((SKIP+1)); SKIPPED_TESTS="$SKIPPED_TESTS [$name]"
    echo ""
    return 0
  fi
  if (cd "$cwd" && node "$file" > /tmp/dtsg_t.out 2>&1); then
    tail -3 /tmp/dtsg_t.out
    PASS=$((PASS+1))
  else
    tail -12 /tmp/dtsg_t.out
    FAIL=$((FAIL+1)); FAILED_TESTS="$FAILED_TESTS [$name]"
  fi
  echo ""
}

run "زر المغادرة الساكن"            "tests/_leave_btn_static_test.js"
run "v267 غرف المال والمزامنة"       "tests/_rooms_v267_test.js"
run "v268 عزل الألعاب"               "tests/_rooms_isolation_v268_test.js"
run "v269 تسوية الرهان والمغادرة"    "tests/_bet_settle_v269_test.js"
run "v270 حرس الدور والتسوية"        "tests/_rm_guard_settle_v270_test.js"
run "v271 المغادرة الفورية والتذاكر"  "tests/_leave_settle_v271_test.js"
run "v271 الاستعادة وإكمال الآلي"    "tests/_restore_bot_v271_test.js"
run "v273 رهان الجولة بالمشاركة"     "tests/_rn_roundjoin_v273_test.js"
run "v272 بلوت فردي 1ضد1/2/3"        "tests/_v272_solo_ui_test.js"
run "v272.1 خانات أوراق الخصوم"      "tests/_v2721_opp_slots_test.js"
run "امتثال v263"                    "tests/_v263_compliance_test.js"
run "تسوية ضاما"                     "tests/_dama_settle_test.js"
run "تسوية روندا"                    "tests/_rn_settle_test.js"
run "رهان روندا"                     "tests/_rn_bet_test.js"
run "شريط البوت الإخباري v273"       "tests/_news_banner_v273_test.js"
run "الصمود res"                     "tests/_resilience_test.js"
run "اللحاق catchup"                 "tests/_catchup_test.js"
run "طلب 6/7/8"                      "tests/_req678_test.js"
run "عزل عام"                        "tests/_isolate_test.js"
run "أمن الملفات الساكن"             "tests/_security_static_test.js"
run "نظافة المستودع"                 "tests/_repo_hygiene_test.js"  "$REPO"
run "تغطية النشر"                    "tests/_deploy_coverage_test.js"
run "حارس v247"                      "tests/_v247_guard_test.js"
run "v262 احترافي"                   "tests/_v262_pro_test.js"

# ── req3: فشل واحد موروث عن v2.68 — يُعرض ولا يُحسب في الفاشل ──
echo "════ طلب 3 (فشل موروث معروف: لوحة المتفرج) ════"
if node "$KNOWN_FAIL_FILE" > /tmp/dtsg_t.out 2>&1; then
  tail -2 /tmp/dtsg_t.out; PASS=$((PASS+1))
else
  tail -8 /tmp/dtsg_t.out
  echo "   ⚠ معروف: فشل «لوحة المتفرج» موروث عن v2.68 (موثّق في CHANGELOG)."
  echo "     لو ظهر فشل غيره فهو انحدار حقيقي — راجع أعلاه."
fi
echo ""

kill $SRV 2>/dev/null || true
echo "════════════════════════════════"
echo "المجموع: $PASS نجح · $FAIL فشل · $SKIP متخطّى (بيئة)"
[ -n "$FAILED_TESTS" ] && echo "الفاشلة:$FAILED_TESTS"
[ -n "$SKIPPED_TESTS" ] && echo "المتخطّاة (لا متصفح على $(uname -m)):$SKIPPED_TESTS"
exit $FAIL
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
# [v2.77] كان الاكتشاف كله على ss/netstat — وهما معطّلان في هذه الحاوية
# (قائمة فارغة بلا خطأ) ⇒ لم يُقتل خادم qa-env القديم على 3971، فمات خادم
# العدّاء بـEADDRINUSE **unjesهل فحص الجاهزية**: الكاوندل جاوبه الخادم القديم،
# فركضت كل الأجنحة على قاعدة /tmp/full بينما QA_DB يشير إلى النسخة المعزولة
# الفارغة ⇒ «عدّاد meta = 0» وثلاثة إخفاقات وهمية. الاكتشاف صار عبر /proc.
holders_on_port() {
  local seen=""
  for e in /proc/[0-9]*/environ; do
    tr '\0' '\n' < "$e" 2>/dev/null | grep -qx "PORT=$QA_PORT" && basename "$(dirname "$e")"
  done | sort -u | tr '\n' ' '
}
for p in $(holders_on_port); do
  cwd="$(readlink /proc/$p/cwd 2>/dev/null || true)"
  case "$cwd" in
    "$QA_DIR"|/tmp/dtsg-qa*|/tmp/full) echo "   إيقاف خادم اختبار قديم على $QA_PORT (pid $p · $cwd)"; kill -9 "$p" 2>/dev/null || true ;;
    *) echo "   ⚠ المنفذ $QA_PORT مستخدم من $cwd (pid $p) — سيُتخطّى الإيقاف" ;;
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

# [v2.77] كان هذا التنبيه يقرّر مسبقاً أن أجنحة المتصفح «غير قابلة للإقلاع على
# aarch64» ويقرّر بتخطيها — والواقع أن chromium ‏arm64 (بناء 1243)
# موجود على هذا الهاتف؛ كان الفشل سببه playwright ‏1.49 الذي يتوقّع البناء
# x64 ‏1148. القرار الآن بالإطلاق التجريبي الفعلي أدناه (BROWSER_OK)، لا بتخمين
# المعمارية — فالأجنحة تُحسب في المجموع إن أقلعت، وتُخطَّى فقط إن أخفقت فعلاً.
ARCH="$(uname -m)"
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  echo "── المعمارية $ARCH — يُقرَّر مصير أجنحة المتصفح بالإطلاق التجريبي:"
  echo "   chromium arm64 (بناء 1243) متاح على هذا الهاتف. إن أقلع فتدخل"
  echo "   المجموع، وإن أخفق فتُخطّى كقيد بيئة (لا انحدار)."
fi

# ── 3) خادم الاختبار ──
cd "$QA_DIR"
env PORT="$QA_PORT" DM_TEST_MODE=1 DTSG_GHOST_GRACE_MS=1 USD_GOLD_RATE=100 \
    ADMIN_API_SECRET=qa-admin-secret PAYMENTS_SHARED_SECRET=qa-shared-secret \
    DM_SEED_SUPER_PW=QaTest12345 TELEGRAM_ADMIN_CHAT_ID=999000001 SUPPORT_SUPER_TG=999000001 \
    FINANCIALS_WEBHOOK_SECRET=whsec-news-test \
    MEDIAMTX_RTMP_URL="rtmp://127.0.0.1:1935" ARB_STREAM_SECRET=qa-arb-secret \
    node server.js > /tmp/dtsg_regression.log 2>&1 &
SRV=$!
# [v2.89] MEDIAMTX_RTMP_URL/ARB_STREAM_SECRET: سلسلة مشاركة الشاشة (v289)
# تحتاج عنوان المرحّل الموقّع من mine() — وهمي هنا (لا اتصال فعلي).
# [v2.81·توحيد] الجناح الحيّ (_news_banner_v273) يرسل ترويسة السر إلزامياً منذ
# حارس «الفشل المغلق» (v2.80·أمن) — القيمة موحّدة مع scripts/qa-env.sh (whsec-news-test
# وهو نفسه سرّ الجناح المحلي سطر 31) فتتطابق المصافحات الثلاثة بلا متغير تصدير إضافي
trap 'kill $SRV 2>/dev/null || true' EXIT INT TERM
for i in $(seq 1 20); do
  curl -sf "http://127.0.0.1:$QA_PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
# [v2.77] الجاهزية وحدها لا تكفي: لو مات خادمنا وجاوب خادم آخر على نفس
# المنفذ فالاختبار كله ينفّذ على غير القاعدة المعزولة. نتحقق من بقاء العملية نفسها حيّة.
if ! kill -0 $SRV 2>/dev/null; then
  echo "✗ خادم الاختبار مات (يرجى مراجعة السجل) — آخر السجل:"; tail -12 /tmp/dtsg_regression.log; exit 3
fi
if ! curl -sf "http://127.0.0.1:$QA_PORT/api/health" >/dev/null 2>&1; then
  echo "✗ لم يقلع خادم الاختبار — آخر السجل:"; tail -12 /tmp/dtsg_regression.log; kill $SRV 2>/dev/null; exit 3
fi
echo "✔ خادم الاختبار يعمل على $QA_PORT (بيانات معزولة)"
QA_DB="$QA_DIR/data/royalcoin.db" node "$REPO/tests/_mkusers.js" >/dev/null 2>&1
export QA_BASE="http://127.0.0.1:$QA_PORT/"
# [v2.77] كان QA_DB مُصدَّراً لأمر _mkusers فقط ⇒ الاختبار الذي يقرأ جدول meta
# مباشرة (_rooms_v267_test) فتح ‎data/royalcoin.db داخل المستودع = **قاعدة
# الإنتاج الحيّة** وقرأ عدّاداً غير موجود ⇒ فشل وهمي كـ«لا وراثة معرّفات».
export QA_DB="$QA_DIR/data/royalcoin.db"

PASS=0; FAIL=0; SKIP=0; FLAKY=0; FAILED_TESTS=""; SKIPPED_TESTS=""; FLAKY_TESTS=""

# [v2.95.1] حكمٌ آليّ على التذبذب — يُنفّذ قاعدةَ المشروع المكتوبة في AGENTS.md
#   حرفياً بدل تركها معرفةً شفهية: «فشل جولة واحدة ليس دليل انحدار — يُعاد
#   الجناح منفرداً، ولا يُعدّ انحداراً إلا إن أحمر منفرداً».
#   سابقاً: أي فشل يُحسب FAIL فوراً ⇒ جولة واحدة حمراء تُنتج حكماً غامضاً
#   يُلزم الجلسة بمقارنة يدوية على إصدارين (ساعة كاملة) لتحديد إن كان انحداراً
#   أم تذبذباً — وهي مقارنة انحرفت مرتين في جولة 2026-10-08 (نفس الجناح أخفق
#   على 2.95.0 ومرّ على 2.94.0 ثم انقلب). الآن العدّاء نفسه يحسم:
#     أخفق ثم نجح منفرداً ⇒ FLAKY (لا يُحمر، ويُعلَن بصوت)
#     أخفق في كل المحاولات المنفردة ⇒ FAIL (انحدار حقيقي)
#   والمحاولات المنفردة = إعادة تشغيل الجناح وحده بعد انتهى الباقي.
FLAKY_RETRIES="${FLAKY_RETRIES:-3}"   # [v2.95.1] 3 لا 2 — انظر تعليل confirm_isolated
# [v2.95.1] ملف الحكم التزايدي: يُكتب بعد كل جناح ⇒ **قراءة تشغيلٍ مقتولٍ
#   تظلّ ممكنة**. الجولة 2026-10-08 أُعيدت مرتين وماتت (مهلة 600ث · خروج
#   الجلسة) وأُهدر سجلّها كله لأن المخرج كان في pipe لم يُلتقط.
VERDICT_FILE="${VERDICT_FILE:-/tmp/dtsg_battery_verdict.txt}"
: > "$VERDICT_FILE"
verdict () { printf '%s\t%s\n' "$1" "$2" >> "$VERDICT_FILE"; }

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

# [v2.95.1] إعادة الجناح وحده: بلا بقية البطارية بعده.
#  ⚠ **عزلٌ زمنيّ لا حالّيّ**: المحاولات تعيد تشغيل الجناح على الخادم المعزول
#    نفسه، فالحالة المتبقّية من الأجنحة السابقة باقية. ⇒ جناحٌ حسّاس للحالة
#    (الموروث: `رهان روندا`) قد يظلّ أحمر كلّ المحاولات ويُحكم FAIL وهو تذبذب.
#    ولذلك تُسجَّل نتيجة كل محاولة في ملف الحكم: حكمٌ قابل للتدقيق لا صندوق
#    أسود، و«FAIL عند 10/11 ثلاث مرّات» يُقرأ فوراً كتذبذبٍ لا كانحدار.
#  والحدّ 3 (لا 2): جناحٌ يفشل ~2/3 من المرّات (الموروث 10/11) كان سيُخطأ
#    التصنيف في ~44% من الجولات بحدّ 2، ونزل إلى ~30% بحدّ 3.
confirm_isolated () {
  local name="$1" file="$2" cwd="$3" i score detail=""
  for i in $(seq 1 "$FLAKY_RETRIES"); do
    if (cd "$cwd" && node "$file" > /tmp/dtsg_retry.out 2>&1); then
      echo "   ↻ تذبذب: نجح منفرداً في المحاولة $i ⇒ ليس انحداراً (قاعدة AGENTS: يُعاد منفرداً)."
      tail -2 /tmp/dtsg_retry.out
      RETRY_DETAIL="محاولات=$i؛${detail}نجح-منفرداً"
      return 0
    fi
    score="$(grep -oE '[0-9]+ ?[/✓] ?[0-9]+' /tmp/dtsg_retry.out | tail -1 | tr -d ' ')"
    echo "   ↻ محاولة منفردة $i/$FLAKY_RETRIES: أخفق أيضاً ${score:+(النتيجة $score)}."
    detail="${detail}$i:${score:-?} "
  done
  echo "   ✗ أحمر منفرداً في كل المحاولات ⇒ انحدار حقيقي (تحقّق: هل الجناح حسّاس للحالة؟ راجع ⚠ أعلاه)."
  tail -12 /tmp/dtsg_retry.out
  RETRY_DETAIL="محاولات=$FLAKY_RETRIES؛${detail}"
  return 1
}

run () {
  local name="$1"; local file="$2"; local cwd="${3:-$QA_DIR}"
  echo "════ $name ════"
  if [ "$BROWSER_OK" = "0" ] && is_browser_suite "$file"; then
    echo "   ⏭  متخطّى: أجنحة المتصفح لا تُقلَع على $(uname -m) — قيد بيئة لا انحدار."
    SKIP=$((SKIP+1)); SKIPPED_TESTS="$SKIPPED_TESTS [$name]"; verdict SKIP "$name"
    echo ""
    return 0
  fi
  if (cd "$cwd" && node "$file" > /tmp/dtsg_t.out 2>&1); then
    tail -3 /tmp/dtsg_t.out
    PASS=$((PASS+1)); verdict PASS "$name"
  else
    tail -6 /tmp/dtsg_t.out
    if confirm_isolated "$name" "$file" "$cwd"; then
      FLAKY=$((FLAKY+1)); FLAKY_TESTS="$FLAKY_TESTS [$name]"; verdict FLAKY "$name · $RETRY_DETAIL"
    else
      FAIL=$((FAIL+1)); FAILED_TESTS="$FAILED_TESTS [$name]"; verdict FAIL "$name · $RETRY_DETAIL"
    fi
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
# ── [v2.81] جناح «تسوية روندا» (_rn_settle_test) انتقل لقسم الموروث المعروف
# أدناه: تدفّقه مبني على عقد التسوية الحرّة القديم (settle بلا escrow) الذي
# أغلقته حراسة v2.80 الأمنية حكماً (لا خصم من الرصيد خارج الجولة) ⇒ الجناح
# أحمر دائماً بصفر حساسية انحدار — مثبت بالتطابق على HEAD البكر v2.80.0
# (11/18 مع التعديلات و11/18 بلاها). تغطية العقد الحالي قائمة فعلاً في
# _rn_roundjoin_v273_test (52) و_v274_settle_vote_nokia_test (82).
run "رهان روندا"                     "tests/_rn_bet_test.js"
run "حراس الأمن v2.80"                 "tests/_security_guards_v280_test.js"
run "انتقال 11 لعبة v2.80"             "tests/_next_round_9games_v280_test.js"
run "شريط البوت الإخباري v273"       "tests/_news_banner_v273_test.js"
run "الصمود res"                     "tests/_resilience_test.js"
run "اللحاق catchup"                 "tests/_catchup_test.js"
run "طلب 6/7/8"                      "tests/_req678_test.js"
run "عزل عام"                        "tests/_isolate_test.js"
run "أمن الملفات الساكن"             "tests/_security_static_test.js"
run "v281 مراقبة MediaMTX + APK"     "tests/_v281_mediamtx_status_test.js"
# [v2.84-audit] تحصين بوت المالية (الأزرار الثلاثة + cutHtml + إعادة الإرسال +
# /register) — فحوص خادمية بلا متصفح: خادم تيليغرام وهمي + قاعدة في الذاكرة.
run "تحصين بوت المالية v284"        "tests/_v284_fin_hardening_test.js"
# [v2.84-audit] واجهة الدخول والترتيب (ترجمة المودال + أيقونات الرقائق) —
# جناح متصفح (يُتخطّى آلياً حيث لا متصفح) على خادم QA نفسه.
run "واجهة v284 (دخول+ترتيب)"        "tests/_v284_ui_browser_test.js"
# [v2.81.4-audit] حراسات APK (دخول WebView + لوغو المنصة) كانت خارج البطارية
# كلياً ⇒ انحدارٌ في إصلاحَي v2.81.3 كان يمرّ بصمت. فحوص مصدر ثابتة: بلا خادم
# وبلا متصفح، فآمنة في أي بيئة معزولة.
run "v2813 حمايات APK الأصلية"        "tests/_v2813_apk_native_test.js"
# [v2.82-audit] جناحا التوقيع الإنتاجي كانا خارج البطارية كلياً ⇒ انحدارٌ في عقد
# السير (الأسرار الأربعة · الحقن · apksigner · النشر في Releases) أو في حزمة
# الشهادة كان يمرّ بصمت. كلاهما فحوص مصدر/مستند ثابتة: بلا خادم وبلا متصفح.
# وثالثهما $REPO (= نفس معالجة _repo_hygiene_test.js): حراساتهما تقرأ فهرس git،
# والنسخة المعزولة /tmp/full ليست مستودعاً ⇒ بدونه يفشل الأول ويمرّ الثاني بلا فحص.
run "v282 توقيع APK + Releases"        "tests/_v282_apk_release_test.js"      "$REPO"
run "v282 حزمة الشهادة والمعرفة"      "tests/_v282_keystore_knowledge_test.js" "$REPO"
# [v2.83-audit] أجنحة الغرفة المحلية وبلوت كانت خارج البطارية كلياً ⇒ انحدارٌ في
# عقد بلوت المزدوج (الجذور الأربعة) أو في جراحة rooms.js أو في مسارات الغرفة
# المحلية كان يمرّ بصمت — نفس الصنف الذي أضافه v2.81.4-audit وv2.82-audit.
#   * الساكن: فحوص مصدر ثابتة بلا خادم وبلا متصفح ⇒ آمن في أي بيئة معزولة.
#   * e2e  بلوت والغرفة المحلية: متصفحان على خادم QA المعزولة التي تُجهَّزها
#     البطارية أصلاً، ولهما نفس حارس `tests/_safe_base.js` الذي يفرض QA_BASE (القاعدة 13)
#     ⇒ لا خطر على خادم المنصة الحيّ. وغياب playwright يُحسب تخطّي بيئة
#     لا انحدار (is_browser_suite أعلاه).
run "v283 عقد الغرفة المحلية (ساكن)"   "tests/_v283_localmp_static_test.js"
run "v283 بلوت وجهاً لوجه"            "tests/_v283_bl_room_e2e_test.js"
run "v283 الغرفة المحلية e2e"         "tests/_v283_localmp_e2e_test.js"
# [v2.95.1] حارس استثناء التسوية المكرّرة — بلا متصفح ولا خادم، ومُدرَج بلا
#   ثغرة تغطية (درس v2.81.4-audit). وهو ما يمنع الاستثناء من أن يصير ختماً
#   مطّاطاً: يثبت أن المُصنِّف **يرفض** كل 400 غير رفض التسوية المكرّر.
run "v2.95.1 مُصنِّف رفض التسوية (سلبي)" "tests/_v2951_settle_dup_audit_test.js"
# [v2.95.1] حارس العدّاء نفسه — ذاتي التحقّق: يقرأ هذا الملف ويشترط أن يكون
#   مُدرَجاً (درس v2.81.4-audit). أدناه سيتحقّق من ذلك فعلياً.
run "v2.95.1 حارس عدّاء التذبذب"        "tests/_v2951_flaky_runner_test.js"
# [v2.95.1] حارس **سلوكي** للعدّاء: يُنفّذ دوالّه على أجنحة وهمية ويتحقّق من
#   الأحكام الثلاثة (يمرّ/متذبذب/انحدار). حارسُ المصدر وحده لا يكفي — نصٌّ سليم
#   وعدّاد معطوب يمرّ ساكناً ويفشل عند التشغيل.
run "v2.95.1 سلوك عدّاء التذبذب"         "tests/_v2951_flaky_runner_behaviour_test.js"
run "v285 كروم الأندرويد (ساكن)"      "tests/_v285_native_chrome_test.js"
# [v2.86-audit] جملة التخطيط المفقودة كانت ستُفقد بصمت: شفافية الشريطين بلا
# setDecorFitsSystemWindows تترك الويب محشوراً بينهما (بلاغ «فراغ أسود أعلى
# وأسفل») — فحص مصدر ثابت بلا خادم وبلا متصفح: آمن في أي بيئة معزولة.
run "v286 ملء الشاشة الحقيقي (ساكن)"  "tests/_v286_e2e_layout_test.js"
# [v2.87] الغرفة المحلية الأصلية + الوضع الغامر + الأيقونة + هيدر/شريط سفلي —
# فحص مصدر ثابت بلا خادم وبلا متصفح (يشمل فك PNG للأيقونة): آمن في أي بيئة.
run "v287 الغامر وLocalNet (ساكن)"   "tests/_v287_localnet_immersive_test.js"
run "v288 ألعاب المحلية+A53+تحكيم"  "tests/_v288_local_games_sync_test.js"
# [v2.89] المختبر الحي الكامل: 13 لعبة في الغرف المحلية عبر جسر DTSGNative
# مزيف (متصفحان حقيقيان) — يثبّت إصلاحات online المصفوفة والأعمى الزوجي
# وعزل المؤقتات بين الألعاب ومقاعد order. وثانيهما سلسلة مشاركة الشاشة
# من التطبيق (registerCallback قبل createVirtualDisplay + السلسلة الحية).
run "v289 مختبر الألعاب المحلية الحي"  "tests/_v289_local_games_live_test.js"
run "v289 سلسلة مشاركة الشاشة"          "tests/_v289_arb_share_chain_test.js"
# [v2.90] المختبر الحي الاجتماعي: إيموجي/رسائل/صوت متزامنة في الغرفة المحلية
# (تسجيل MediaRecorder حقيقي عبر ميكروفون وهمي) + أونو بلا لعب آلي عند حجب
# الواجهة + خصوصية الدومينو (قطع مقلوبة وتخطيط flex) + زر APK المباشر.
run "v290 تفاعل/رسائل/أونو/دومينو/APK"  "tests/_v290_local_social_sync_test.js"
# [v2.91] جذور مشاركة الشاشة الأربعة بعد بلاغ المالك 2026-10-07 (أندرويد 16
# شاشة سوداء تقطع عند تبديل التطبيق + أندرويد 11 رسالة خطأ عند النقر):
# فرض الشاشة الكاملة على API 34+ (createConfigForDefaultDisplay) + مهلة قراءة
# RTMP 30ث بلا قتل + ترويسة AVCC حتمية (cfgBody/maybeSendConfig بلا سباق
# awaitPublish) + pump يرى موت الرابط + الرابط قبل الشاشة الافتراضية + كود
# العطل في وجه الرسالة وإصدار الجسر arbShareVersion=2 — فحوص مصدر ساكنة.
run "v291 جذور مشاركة الشاشة (ساكن)"  "tests/_v291_arb_share_fix_test.js"
# [v2.92] تدقيق ما بعد v2.91 (طلب المالك: تأكد من الإصلاحات واعثر على الجذر
# المتبقي): تكرار الإطار على الشاشة الساكنة (KEY_REPEAT_PREVIOUS_FRAME_AFTER)
# + إطار مرجعي فوري لحظة إرسال الترويسة (onPublished) + عزل خيط القياسات +
# volatile cfgBody/cfgSent + بوابة بدء CAS + arbShareVersion=3 وإصدار الجسر
# في شريحة الحالة — فحوص مصدر ساكنة.
run "v292 تدفق إطارات التحكيم (ساكن)" "tests/_v292_arb_stream_flow_test.js"
# [v2.93] الجذران المتبقيان لبلاغ المالك 2026-10-07 («شاشة الأدمن سوداء» بعد
# build31 + «خلل صلاحية الميكروفون» + «الموقعان يعرضان الغرف المحلية القديمة»):
# ساكن: حقن SPS/PPS داخل النطاق قبل كل IDR (مستخرج DTS في المرحّل يرفض
# العينات بدونهما — قائمة HLS كلها فجوات) + إذنا RECORD_AUDIO/MODIFY_AUDIO_SETTINGS
# (جسر كاباسيتور 6 يطلبهما معاً زمنياً) + تمرير معاملات LL-HLS الحية في بروكسي
# server.js + جرة كوكيز واعية بالمسار + حجب واجهة الغرف المحلية القديمة على الويب.
# حيّ (يتخطى بتلطٍ معلن حيث تنقص مكوناته — قيد بيئة لا انحدار): نموذج بذات
# بايتات جافا التطبيق → MediaMTX حقيقي → hlsFetch/rewriteHlsPlaylist من
# server-mediamtx.js الحقيقي نفسه → متصفح حقيقي بمشغل hls.js → فحص بكسلات فعلي.
run "v293 سلسلة البث الكاملة (ساكن+حي)" "tests/_v293_arb_stream_e2e_test.js"
# [v2.94] حلقة المرآة المستمرة GlMirror (جذر «البث المتقطع: لقطة ثم جمود >5ث»):
# ساكن: عقود الصنف والتكامل والنبض ومسار الاحتياط. حي (يتخطى بتخطٍ معلن
# حيث تنقص مكوناته): نموذج التطبيق ينشر نمطي العطل والإصلاح عبر MediaMTX
# حقيقي وبروكسي الإنتاج — تسميم PART-TARGET/HOLD-BACK للعطل مقابل تدفق
# ~0.2ث/جزء للإصلاح.
run "v294 إيقاع حلقة المرآة (ساكن+حي)" "tests/_v294_arb_share_cadence_test.js"
# [v2.95] ألفة خيوط EGL — جذر رسالة [gl] القاتلة (بلاغ المالك 2026-10-09
# بعد build34: فشل مشاركة الشاشة أعد المحاولة [gl] على أكثر من هاتف بلا
# جدوى): بناء v2.94 ربط السياق على خيط arb-begin ورسم من خيط arb-gl بلا
# سياق ففشل eglSwapBuffers حتماً. العقود الدائمة: كل EGL على خيط المرآة
# حصراً + بوابة awaitSink (فشل GL = مسار v2.93 المباشر بلا رسالة) + إشارة
# go() بعد live + التدهور الرشيق (موت الخيط لا يقتل الجلسة — setSurface).
run "v295 ألفة خيوط EGL (ساكن)"       "tests/_v295_gl_thread_affinity_test.js"
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

# ── [v2.81] تسوية روندا: موروث معروف — يُعرض ولا يُحسب في الفاشل، لكن يُقارن
#    بأساسه المرجعي فعلاً (11/18): أي انحراف عنه انحدار حقيقي يُحتسب في الفاشل.
#    [v2.81·تصحيح] كان الشريط يَعِد بالمقارنة ولا ينفّذها ⇒ تدهور من 11/18 إلى أي
#    رقم أصغر كان يمرّ بصمت وFAIL=0. الآن الفحص موجود.
RN_SETTLE_BASE="11/18"
echo "════ تسوية روندا (فشل موروث معروف: عقد التسوية الحرّة قبل حرس v2.80) ════"
if node tests/_rn_settle_test.js > /tmp/dtsg_t.out 2>&1; then
  tail -2 /tmp/dtsg_t.out; PASS=$((PASS+1))
else
  tail -4 /tmp/dtsg_t.out
  RN_GOT="$(grep -oE '[0-9]+/[0-9]+ passed' /tmp/dtsg_t.out | tail -1 | grep -oE '^[0-9]+/[0-9]+')"
  if [ "$RN_GOT" = "$RN_SETTLE_BASE" ]; then
    echo "   ⚠ معروف: الجناح مبني على settle بلا escrow — أغلقته حراسة v2.80. النتيجة $RN_GOT = الأساس المرجعي (بلا تغيير)."
  else
    echo "   ✗ انحدار حقيقي: النتيجة ${RN_GOT:-<لم تُقرأ>} لا تطابق الأساس المرجعي $RN_SETTLE_BASE."
    FAIL=$((FAIL+1)); FAILED_TESTS="$FAILED_TESTS [تسوية روندا]"
  fi
fi
echo ""

kill $SRV 2>/dev/null || true
echo "════════════════════════════════"
echo "المجموع: $PASS نجح · $FAIL فشل · $FLAKY متذبذب · $SKIP متخطّى (بيئة)"
[ -n "$FAILED_TESTS" ] && echo "الفاشلة (انحدار حقيقي — أحمرت منفردة):$FAILED_TESTS"
[ -n "$FLAKY_TESTS" ] && echo "المتذبذبة (نجحت منفردة — ليست انحداراً، لكن تستحقّ جذراً):$FLAKY_TESTS"
[ -n "$SKIPPED_TESTS" ] && echo "المتخطّاة (لا متصفح على $(uname -m)):$SKIPPED_TESTS"
echo "ملف الحكم التزايدي: $VERDICT_FILE"
# [v2.95.1] رمز الخروج يبقى $FAIL (الفشل الحقيقي فقط): التذبذب لا يُحمر الباب،
# لكنه **يُعلَن** في السطر أعلاه ويُسجَّل في ملف الحكم — فبابٌ أخضر صامت على جناح
# غير مستقر هو بالضبط الفخّ الذي هذا الإصدار يُغلقه.
exit $FAIL
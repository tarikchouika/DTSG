#!/bin/bash
# ═══ عدّاء الانحدار الكامل لغرف DTSG (v2.69) ═══
# يشغّل الخادم مرة واحدة (DM_TEST_MODE) ويجري كل اختبارات الغرف/المال المحورية
# الاستخدام: bash tests/_run_regression_rooms.sh
cd "$(dirname "$0")/.."
export DM_TEST_MODE=1 DTSG_GHOST_GRACE_MS=1 PORT=3000
pkill -f "node --experimental-sqlite server.js" 2>/dev/null
sleep 1
node --experimental-sqlite server.js > /tmp/dtsg_regression.log 2>&1 &
SRV=$!
sleep 3

PASS=0; FAIL=0; FAILED_TESTS=""

run () {
  local name="$1"; local file="$2"
  echo "════ $name ════"
  if node "$file" > /tmp/dtsg_t.out 2>&1; then
    tail -3 /tmp/dtsg_t.out
    PASS=$((PASS+1))
  else
    tail -12 /tmp/dtsg_t.out
    FAIL=$((FAIL+1)); FAILED_TESTS="$FAILED_TESTS $name"
  fi
  echo ""
}

run "زر المغادرة الساكن"            "tests/_leave_btn_static_test.js"
run "v267 غرف المال والمزامنة"       "tests/_rooms_v267_test.js"
run "v268 عزل الألعاب"               "tests/_rooms_isolation_v268_test.js"
run "v269 تسوية الرهان والمغادرة"    "tests/_bet_settle_v269_test.js"
run "امتثال v263"                    "tests/_v263_compliance_test.js"
run "تسوية ضاما"                     "tests/_dama_settle_test.js"
run "تسوية روندا"                    "tests/_rn_settle_test.js"
run "رهان روندا"                     "tests/_rn_bet_test.js"
run "الصمود res"                     "tests/_resilience_test.js"
run "اللحاق catchup"                 "tests/_catchup_test.js"
run "طلب 6/7/8"                      "tests/_req678_test.js"
run "طلب 3"                          "tests/_req3_test.js"
run "عزل عام"                        "tests/_isolate_test.js"
run "أمن الملفات الساكن"             "tests/_security_static_test.js"
run "نظافة المستودع"                 "tests/_repo_hygiene_test.js"
run "تغطية النشر"                    "tests/_deploy_coverage_test.js"
run "حارس v247"                      "tests/_v247_guard_test.js"
run "v262 احترافي"                   "tests/_v262_pro_test.js"
run "req678 متصفح (مغادرة=خسارة)"    "tests/_req678_test.js"

kill $SRV 2>/dev/null
echo "════════════════════════════════"
echo "المجموع: $PASS نجح · $FAIL فشل"
[ -n "$FAILED_TESTS" ] && echo "الفاشلة:$FAILED_TESTS"
exit $FAIL

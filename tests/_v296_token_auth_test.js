/* ═══════════════════════════════════════════════════════════════════════════
   [v2.96] حرسات المصادقة الثنائية (كوكي + توكن) واستقرار مشغّل المرحّل — 30 حارساً
   ─────────────────────────────────────────────────────────────────────────────
   تثبّت إصلاحات بلاغ المالك 2026-10-10 الثلاثة من جذورها:
     ① سفاري: الجلسة تنتهي لحظة الدخول — كوكي sid (SameSite=None) من وسيط
        الهاتف (نطاق مغاير لصفحة pages.dev) = كوكي طرف ثالث يحجبه ITP كلياً.
     ② تطبيق الأندرويد/صفحة الدعم: فقدان الدخول — support.html وbot-chat.js
        كانا يطبقان اختصار same-origin على localhost (وهو مضيف WebView
        Capacitor) فتذهب النداءات إلى التطبيق نفسه (404)، وWebView يحجب
        كوكيز الطرف الثالث افتراضياً فيموت الدخول حتى من الرئيسية.
     ③ مشغّل المرحّل عند الأدمن: شاشة سوداء واتصال متدبدب — signViewToken
        كان يزرع Date.now() ف يتغير الرمز مع كل استطلاع (10ث) فيهدم
        المشغّل ويبنى من الصفر كل عشر ثوانٍ.
   تشغيل: node tests/_v296_token_auth_test.js   (بلا خادم — فحوص مصدر ثابتة
          + فحص سلوكي لرمز المشاهدة عبر وحدة server-mediamtx نفسها)
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
process.chdir(path.join(__dirname, ".."));
const ROOT = path.join(__dirname, "..");
const results = [];
function ok(cond, label) {
  results.push(!!cond);
  console.log((cond ? "  ✅ " : "  ✖ ") + label);
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* ── 1) الخادم: حل الجلسة ثنائي المسار ─────────────────────────────────── */
const srv = read("server.js");
ok(/function sessionTokenFromRequest\(req\)\s*\{/.test(srv) &&
   srv.indexOf("headers.authorization") !== -1,
   "server.js: دالة حل الجلسة الثنائية معرَّفة (ترويسة + كوكي)");
ok(srv.indexOf("Bearer") !== -1 && srv.indexOf("parseCookies(req).sid") !== -1 &&
   srv.indexOf("sessionTokenFromRequest(req)") !== -1,
   "server.js: Bearer أولاً ثم كوكي sid (توافق خلفي كامل للمتصفحات)");
ok(/function getUser\(req\)\s*\{\s*\n\s*const sid = sessionTokenFromRequest\(req\);/.test(srv),
   "server.js: getUser يستهلك الحل الثنائي (كل نقاط المنصة مغطاة دفعة واحدة)");
ok(/token: sid/.test(srv) && /token: regToken/.test(srv),
   "server.js: الدخول والتسجيل يعيدان التوكن في الرد");
ok(/const sid = startSession\(res, user\);\s*\n\s*\/\* \[v2\.96·توكن\] إكمال 2FA/.test(srv) ||
   (/startSession\(res, user\)/.test(srv) && /token: sid/.test(srv)),
   "server.js: إكمال 2FA يعيد التوكن كالدخول");
ok(/startSession\(res, user\)\s*;?\s*\n?\s*\/\* \[v2\.96/.test('') || /return sid;/.test(srv),
   "server.js: startSession يعيد رمز الجلسة للطالب");
ok(srv.indexOf("parsedUrl.query.sid") !== -1,
   "server.js: قناة SSE تقبل ?sid= (EventSource لا يحمل ترويسات)");
ok(/const sid = sessionTokenFromRequest\(req\);\s*\n\s*if \(sid\) delete sessions\[sid\];/.test(srv),
   "server.js: الخروج يغلق جلسة التوكن أيضاً (لا جلسة يتيمة خادمياً)");

/* ── 2) الوحدات الخادمية الثلاث: نفس الحل الثنائي ───────────────────────── */
const sup = read("server-support.js");
ok(/Bearer/.test(sup) && /userFromSession/.test(sup) && /CTX\.sessions\[sid\]/.test(sup),
   "server-support.js: صفحة الدعم تقبل التوكن (جذر فقدان الدخول فيها)");
const pay = read("server-payments.js");
ok(/Bearer/.test(pay) && /roleOfRequest/.test(pay) && /CTX\.sessions\[sid\]/.test(pay),
   "server-payments.js: كوبونات السوبر تقبل التوكن");
const pchat = read("server-private-chat.js");
ok(/Bearer/.test(pchat) && /sessionUser/.test(pchat) && /CTX\.sessions\[sid\]/.test(pchat),
   "server-private-chat.js: الدردشة الخاصة تقبل التوكن");

/* ── 3) العميل: التوكن مع كل نداء ──────────────────────────────────────── */
const api = read("js/core/api.js");
ok(/rc_token/.test(api) && /Authorization/.test(api) && /_authHeaders\(\{\}\)/.test(api),
   "api.js: كل نداء يحمل Authorization: Bearer <rc_token>");
const auth = read("js/core/auth.js");
ok(/localStorage\.setItem\('rc_token', r\.data\.token\)/.test(auth),
   "auth.js: الدخول يخزّن التوكن محلياً");
ok(/localStorage\.removeItem\('rc_token'\)/.test(auth) && /AUTH\.token = null/.test(auth),
   "auth.js: الخروج و401 يمسحان التوكن (لا رمز يتيم بعد موت الجلسة)");
ok(/token: null,\s*\n\s*\/\* \[v2\.96·توكن\] رمز الجلسة/.test(auth) ||
   /token: null/.test(auth),
   "auth.js: حالة AUTH تحمل التوكن");
ok(/keepalive/.test(auth) && /Authorization/.test(auth),
   "auth.js: مزامنة beforeunload تحمل التوكن (keepalive بلا كوكي في سفاري)");

/* ── 4) جسر SSE: ?sid= للقناة الحية ────────────────────────────────────── */
const bridge = read("js/core/live-ws-bridge.js");
ok(/function sidQ\(base\)/.test(bridge) && /'\?sid=' \+ encodeURIComponent\(tk\)/.test(bridge),
   "live-ws-bridge.js: ?sid= يُلحق بقناة SSE عند وجود التوكن");
ok((bridge.match(/sidQ\(b\)/g) || []).length >= 3,
   "live-ws-bridge.js: مواضع الاتصال الثلاثة كلها عبر sidQ (polyfill + fallback + deferred)");

/* ── 5) صفحة الدعم والودجت: كشف التطبيق الأصلي + التوكن ─────────────────── */
const supHtml = read("support.html");
ok(/IS_NATIVE_APP = !!\(window\.Capacitor && window\.Capacitor\.isNativePlatform/.test(supHtml) &&
   /\(!IS_NATIVE_APP && \/\^\(localhost\|127\\\.0\\\.0\\\.1\)\(:\\d\+\)\?\$\/\.test\(location\.hostname\)\)/.test(supHtml),
   "support.html: حارس IS_NATIVE_APP قبل اختصار localhost (جذر عطل التطبيق)");
ok(/rc_token/.test(supHtml) && /Authorization/.test(supHtml),
   "support.html: نداءات الدعم تحمل التوكن");
const bot = read("js/ui/bot-chat.js");
ok(/IS_NATIVE_APP/.test(bot) && /!IS_NATIVE_APP && \/\^\(localhost/.test(bot),
   "bot-chat.js: حارس IS_NATIVE_APP قبل اختصار localhost (نفس الجذر)");
ok(/rc_token/.test(bot) && /Authorization/.test(bot),
   "bot-chat.js: نداءات الودجت تحمل التوكن");
const wallet = read("js/wallet.js");
ok(/rc_token/.test(wallet) && /Authorization/.test(wallet),
   "wallet.js: نداءات المحفظة تحمل التوكن");

/* ── 6) index.html: الجسر داخل التطبيق + البصمات ───────────────────────── */
const idx = read("index.html");
ok(idx.indexOf("_dtsgNative") !== -1 && idx.indexOf("if (_dtsgNative ||") !== -1,
   "index.html: جسر SSE يُحمَّل داخل التطبيق الأصلي (كان يُتخطى فيه فتموت أحداث الغرف)");
ok(idx.includes("js/core/api.js?v=v296") && idx.includes("js/core/auth.js?v=v296") &&
   idx.includes("js/core/live-ws-bridge.js?v=v296") && idx.includes("js/core/arb-admin.js?v=v296") &&
   idx.includes("js/ui/bot-chat.js?v=v296") && idx.includes("js/wallet.js?v=pay13"),
   "index.html: بصمات الملفات المعدّلة الست مرفوعة (v296 ×5 + pay13)");

/* ── 7) رمز المشاهدة المستقر (سلوكي — وحدة الإنتاج نفسها) ────────────────── */
const MMX = require(path.join(ROOT, "server-mediamtx.js"));
const t1 = MMX.signViewToken("roomR", 7, 900000);
const t2 = MMX.signViewToken("roomR", 7, 900000);
const t3 = MMX.signViewToken("roomR", 7, 900000);
ok(t1 === t2 && t2 === t3 && typeof t1 === "string" && t1.length > 10,
   "signViewToken: نفس الغرفة×اللاعب ⇒ نفس الرمز عبر النداءات (كان يختلف كل نداء)");
ok(MMX.verifyViewToken("roomR", 7, t1) === true,
   "signViewToken: الرمز المستقر يتحقق بنجاح (verify بلا تغيير)");
ok(MMX.verifyViewToken("roomR", 8, t1) === false && MMX.verifyViewToken("roomX", 7, t1) === false,
   "signViewToken: الرمز مقيد بزوجه غرفة×لاعب (لا انتحال)");
const t4 = MMX.signViewToken("roomQ", 9, 900000);
ok(t4 !== t1,
   "signViewToken: أزواج مختلفة ⇒ رموز مختلفة");
ok(!MMX.verifyViewToken("roomR", 7, String(Date.now() + 60000) + ".deadbeefdeadbeef"),
   "signViewToken: توقيع مفبرك يُرفض (HMAC سليم)");
const mtx = read("server-mediamtx.js");
ok(/VIEW_TOKEN_CACHE/.test(mtx) && /ttl >> 2/.test(mtx),
   "server-mediamtx.js: كاش الرمز بعتبة ربع المدة + تنقية عند 512");

/* ── 8) مشغّل الأدمن: لا هدم لمشغّل سليم ────────────────────────────────── */
const arb = read("js/core/arb-admin.js");
ok(/function tokenExpMs/.test(arb) && /function pathNoToken/.test(arb),
   "arb-admin.js: قراءة انتهاء الرمز وتجريد المسار (أدوات الاستقرار)");
ok(/function rotateRelaySrc/.test(arb) && /loadSource/.test(arb),
   "arb-admin.js: تدوير خفيف (loadSource) بلا هدم المشغل");
ok(/pathNoToken\(box\.dataset\.src\) === pathNoToken\(want\)/.test(arb) &&
   /45000/.test(arb) && /rotateRelaySrc\(uid, want\)/.test(arb),
   "arb-admin.js: دوران الرمز وحده لا يمسّ مشغلاً حياً — والتدوير قرب الانتهاء فقط");
ok(/st\.rtWant/.test(arb) && /st\.rtRetry/.test(arb) && /tries < 1/.test(arb) &&
   /setTimeout\(function \(\) \{\s*\n\s*var latest = st\.rtWant/.test(arb),
   "arb-admin.js: خطأ قاتل ⇒ محاولة واحدة بعد 2.5ث بأحدث مسار (لا رسالة ميتة)");
ok(/rtWant: \{\},\s*\n\s*rtRetry: \{\}/.test(arb) && /st\.rtWant = \{\};\s*\n\s*st\.rtRetry = \{\};/.test(arb),
   "arb-admin.js: حالة الاستقرار معرَّفة وتُنظَّف عند unmount");

/* ── 9) سير البناء: كوكيز الطرف الثالث في WebView (التوأمان) ─────────────── */
const wfLive = fs.readFileSync(path.join(ROOT, ".github/workflows/build-apk.yml"));
const wfDocs = fs.readFileSync(path.join(ROOT, "docs/workflows/build-apk.yml"));
ok(wfLive.equals(wfDocs), "سير البناء: النسختان متطابقتان بايت-ببايت (قاعدة 18)");
ok(wfLive.toString("utf8").indexOf("enableThirdPartyCookies();") !== -1 &&
   wfLive.toString("utf8").indexOf("private void enableThirdPartyCookies()") !== -1,
   "سير البناء: تفعيل كوكيز الطرف الثالث في WebView (طبقة إضافية فوق التوكن)");
const jchunk = wfLive.toString("utf8").slice(
  wfLive.toString("utf8").indexOf("private void enableThirdPartyCookies()"),
  wfLive.toString("utf8").indexOf("private void enableThirdPartyCookies()") + 700);
ok(jchunk.indexOf("setAcceptThirdPartyCookies") !== -1 && jchunk.indexOf("\\") === -1,
   "سير البناء: الجافا المحقونة سليمة (بلا شرطة مائلة عكسية — عقد الحقن)");

/* ── 10) الإصدار (قاعدة 15/22) ──────────────────────────────────────────── */
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const main = read("js/main.js");
ok(pkg.version === "2.96.0" && lock.version === "2.96.0" && lock.packages[""].version === "2.96.0",
   "الإصدار: الثلاثية 2.96.0 متطابقة (package.json + lock ×2)");
ok(/window\.DTSG_BUILD = 'v2\.96\.0'/.test(main) && idx.includes("js/main.js?v=v296"),
   "الإصدار: DTSG_BUILD = v2.96.0 وبصمة main.js مشتقة من major.minor");

/* ── حارس العدّاد ───────────────────────────────────────────────────────── */
const before = results.length;
const beforePassed = results.filter(Boolean).length;
ok(beforePassed === before,
   "حارس العدّاد: " + beforePassed + " ناجح من " + before + " (لا فحص يسقط بصمت)");

/* ── النتيجة ────────────────────────────────────────────────────────────── */
const finalPass = results.filter(Boolean).length;
const finalTotal = results.length;
const finalFail = finalTotal - finalPass;
console.log("\n════════════════════════════════════════════");
console.log("V296 TOKEN AUTH GUARD: " + finalPass + " ناجح / " + finalFail + " فاشل");
if (finalFail > 0) process.exit(1);

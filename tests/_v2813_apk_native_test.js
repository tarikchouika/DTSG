/* ═══════════════════════════════════════════════════════════════════════════
   [v2.81.3-APK] حرسات تطبيق الأندرويد — 15 حارساً
   تُثبِّت إصلاحَي تقرير المالك الميداني (2026-10-04):
     1) تعذُّر تسجيل الدخول داخل WebView Capacitor — الجذر: اعتِبار
        «localhost» بلا منفذ بيئةَ تطوير same-origin فتُرسَل نداءات /api إلى
        التطبيق نفسه بدل وسيط الهاتف. الإصلاح: منفذ إلزامي + حارس IS_NATIVE_APP
        في المواضع الأربعة (api · live-ws-bridge · auth · wallet).
     2) غياب لوغو المنصة — الجذر: لا توليد أيقونات في خط البناء إطلاقاً.
        الإصلاح: resources/icon.png + resources/splash.png من لوغو المنصة
        وخطوة Generate app icons في النسختين المتطابقتين لسير البناء.
   تشغيل: node tests/_v2813_apk_native_test.js   (بلا خادم — فحوص مصدر ثابتة)
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const results = [];
function ok(cond, label) {
  results.push(!!cond);
  console.log((cond ? "  ✅ " : "  ✖ ") + label);
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const LB = String.fromCharCode(91), RB = String.fromCharCode(93);   /* [ ] */

/* ── 1) المواضع الأربعة لحلّ عنوان الـAPI ─────────────────────────────────── */
const api = read("js/core/api.js");
ok(/IS_NATIVE_APP\s*=\s*\(typeof window !== .undefined. && !!\(window\.Capacitor/.test(api),
   "api.js: حارس IS_NATIVE_APP مع window.Capacitor معرَّف");
ok(!/\(localhost\|127\\\.0\\\.0\\\.1\)\(:\\d\+\)\?\$/.test(api) &&
   /\(localhost\|127\\\.0\\\.0\\\.1\):\\d\+\$\//.test(api),
   "api.js: المنفذ إلزامي والاختصار القديم بالمنفذ الاختياري أُزيل كلياً");

const ws = read("js/core/live-ws-bridge.js");
ok(ws.includes("IS_NATIVE_APP") &&
   /!IS_NATIVE_APP && \/\^\(localhost\|127\\\.0\\\.0\\\.1\):\\d\+\$\//.test(ws),
   "live-ws-bridge.js: حارس أصلي + منفذ إلزامي (SSE/WS لا يذهب إلى localhost)");

const auth = read("js/core/auth.js");
ok(auth.includes("IS_NATIVE_APP") && auth.includes("rc_api_base") &&
   auth.includes("casino-phone.dmgames-api.workers.dev"),
   "auth.js: مزامنة beforeunload تقرأ rc_api_base ثم وسيط الهاتف في التطبيق الأصلي");

const wallet = read("js/wallet.js");
ok(/location\.origin && !IS_NATIVE_APP\) cands\.push/.test(wallet),
   "wallet.js: مرشّح «نفس الأصل» مستبعد في التطبيق الأصلي");

/* ── 2) بصمات التخزين المؤقت في index.html ───────────────────────────────── */
const idx = read("index.html");
ok(idx.includes("live-ws-bridge.js?v=dtsg13") && idx.includes("api.js?v=dtsg11") &&
   idx.includes("auth.js?v=dtsg11") && idx.includes("wallet.js?v=pay12"),
   "index.html: بصمات الملفات الأربعة المُصلَحة مرفوعة (dtsg13/dtsg11/pay12)");

/* ── 3) خط بناء APK: أيقونات من لوغو المنصة ──────────────────────────────── */
const wfLive = fs.readFileSync(path.join(ROOT, ".github/workflows/build-apk.yml"));
const wfDocs = fs.readFileSync(path.join(ROOT, "docs/workflows/build-apk.yml"));
const wfTxt = wfLive.toString("utf8");
ok(wfTxt.includes("@capacitor/assets@3") && wfTxt.includes("--assetPath resources") &&
   wfTxt.includes("Generate app icons + splash from platform logo") &&
   wfTxt.indexOf("Generate app icons") < wfTxt.indexOf("Setup Java 17") &&
   wfTxt.indexOf("Generate app icons") > wfTxt.indexOf("cap sync android"),
   "سير البناء: خطوة الأيقونات موجودة بين cap sync وGradle");
ok(wfLive.equals(wfDocs),
   "سير البناء: النسختان (.github وdocs) متطابقتان بايت-ببايت بعد إضافة الخطوة");

/* ── 4) أصول الشعار المشتقة (أبعاد IHDR حقيقية) ──────────────────────────── */
function pngSize(p) {
  const b = fs.readFileSync(p);
  return b.readUInt32BE(16) + "x" + b.readUInt32BE(20);
}
ok(pngSize("resources/icon.png") === "1024x1024", "resources/icon.png بأبعاد 1024×1024");
ok(pngSize("resources/splash.png") === "2732x2732", "resources/splash.png بأبعاد 2732×2732");

/* ── 5) عقود الحزمة لم تتغيّر ─────────────────────────────────────────────── */
const apiUrl = JSON.parse(read("api-url2.json"));
ok(apiUrl.url === "https://casino-phone.dmgames-api.workers.dev",
   "api-url2.json: عقد وسيط الهاتف كما هو (مصدر الأساس داخل التطبيق)");
const prep = read("scripts/prepare-www.sh");
ok(prep.includes("api-url2.json") && prep.includes("cp -r js css assets"),
   "prepare-www.sh: الحزمة تضم الإعداد وملفات الأصول (اللوغو ضمنها)");

/* ── 6) التوثيق والسجل ────────────────────────────────────────────────────── */
const chlog = read("CHANGELOG.md");
ok(chlog.includes(LB + "v2.81.3-APK" + RB) && chlog.includes("إصلاح خللَي تطبيق الأندرويد"),
   "CHANGELOG: قسم إصلاح APK موثَّق بعلامة v2.81.3-APK");
const apkDoc = read("docs/APK_BUILD.md");
ok(apkDoc.includes("### 2.3 الشعار وشاشة البدء وإصلاح الدخول") &&
   apkDoc.includes("IS_NATIVE_APP") && apkDoc.includes("resources/icon.png"),
   "docs/APK_BUILD.md: §2.3 يشرح الشعار وإصلاح الدخول");

/* ── حارس العدّاد ─────────────────────────────────────────────────────────── */
const EXPECTED = 15;
ok(results.length === EXPECTED - 1,
   "حارس العدّاد: عدد النتائج = عدد الحرسات المكتوبة (" + EXPECTED + ")");

const pass = results.filter(Boolean).length, fail = results.length - pass;
console.log("═══ النتيجة: " + pass + " ناجح / " + fail + " فاشل (حرسات APK الأصلية " + results.length + ") ═══");
process.exit(fail ? 1 : 0);

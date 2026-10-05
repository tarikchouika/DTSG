/* ═══════════════════════════════════════════════════════════════════════════
   [v2.81.3-APK] حرسات تطبيق الأندرويد — 17 حارساً
   تُثبِّت إصلاحَي تقرير المالك الميداني (2026-10-04):
     1) تعذُّر تسجيل الدخول داخل WebView Capacitor — الجذر: اعتِبار
        «localhost» بلا منفذ بيئةَ تطوير same-origin فتُرسَل نداءات /api إلى
        التطبيق نفسه بدل وسيط الهاتف. الإصلاح: منفذ إلزامي + حارس IS_NATIVE_APP
        في المواضع الأربعة (api · live-ws-bridge · auth · wallet).
     2) غياب لوغو المنصة — الجذر: لا توليد أيقونات في خط البناء إطلاقاً.
        الإصلاح: resources/icon.png + resources/splash.png من لوغو المنصة
        وخطوة Generate app icons في النسختين المتطابقتين لسير البناء
        (بتثبيت أداة معزول في /tmp/capassets — بناء #2 الفاشل: التثبيت في
        الجذر عبث بحزم Capacitor بعد cap add فانكسر تكوين :capacitor-android).
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
/* [v2.81.4] نفس المصدر صار على location.host (بالمنفذ) والنمط الجديد يقبل
   [::1] — الاختصار القديم على location.hostname بنمط «:\d+» إلزامي كان لا
   يطابق 127.0.0.1:PORT قط (كشفه e2e الحيّ: AUTH.user بقي null). الحرس
   يُحدَّث للعقد الجديد: الفحص على host حصراً + بقاء حارس IS_NATIVE_APP قبلَه. */
ok(!/location\.hostname\s*&&\s*\/\^\(localhost/.test(api) &&
   !/\(localhost\|127\\\.0\\\.0\\\.1\):\\d\+\$\/\.test\(location\.hostname\)/.test(api) &&
   /\(\/\^\(localhost\|127\\\.0\\\.0\\\.1\|\\\[::1\\\]\)\(\:\\d\+\)\?\$\/\.test\(location\.host\)/.test(api) &&
   /!IS_NATIVE_APP &&\s*\(\/\^\(localhost/.test(api),
   "api.js: نفس المصدر على location.host (بالمنفذ) مع حارس IS_NATIVE_APP — اختصار hostname القديم أُزيل");

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
/* [v2.81.4] api.js تغيّر (إصلاح same-origin) فبصمته صارت v2814 — والملفات
   غير المماسة تبقى على بصماتها (dtsg13/pay12).
   [v2.83] auth.js تغيّر (حرس الهوية المحلية للغرفة المحلية) فبصمته صارت v283.
   [v2.84] auth.js تغيّ مجدداً (ترجمة مودال الدخول + مزامنة العودة) ⇒ v284. */
ok(idx.includes("live-ws-bridge.js?v=dtsg13") && idx.includes("api.js?v=v2814") &&
   idx.includes("auth.js?v=v284") && idx.includes("wallet.js?v=pay12"),
   "index.html: بصمات الملفات الأربعة محدَّثة (dtsg13/v2814/v284/pay12) — auth.js رُفعت إلى v284 (ترجمة الدخول + مزامنة العودة)");

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
const iconStep = wfTxt.slice(wfTxt.indexOf("Generate app icons"), wfTxt.indexOf("Setup Java 17"));
ok(iconStep.includes("/tmp/capassets") && iconStep.includes("npm install @capacitor/assets@3") &&
   !iconStep.includes("npm install --no-save"),
   "سير البناء: تثبيت أداة الأيقونات معزول في /tmp/capassets — لا عبث بnode_modules بعد cap add");
ok(!iconStep.includes("npx capacitor-assets") && iconStep.includes("node_modules/.bin/capacitor-assets"),
   "سير البناء: الأداة تُستدعى من .bin المعزول لا npx من جذر المساحة");
/* [v2.83·إصلاح ميداني] عقد الأيقونة بلا حاوية: لا لون خلفية للأيقونة بعد الآن —
   الطبقات الشفافة في resources/ هي مصدر الحقيقة، وعلم --iconBackgroundColor
   يعيدها مربعاً ملوّناً فيرجع بلاغ «لوغو صغير بحاوية سوداء». */
ok(!iconStep.includes("--iconBackgroundColor") && iconStep.includes("--splashBackgroundColor"),
   "سير البناء: لا لون خلفية للأيقونة (ألوان شاشة البدء فقط) — عقد v2.83 بلا حاوية");

/* ── 4) أصول الشعار المشتقة (أبعاد IHDR حقيقية) ──────────────────────────── */
function pngSize(p) {
  const b = fs.readFileSync(p);
  return b.readUInt32BE(16) + "x" + b.readUInt32BE(20);
}
function pngHasAlpha(p) {
  /* فكّ PNG حقيقي (IHDR color type 6 = RGBA) مع دعم كل مرشحات الصفوف،
     ثم التحقق أن أركان القماش شفافة بالكامل (ألفا ≤ 8) — لوغو عائم بلا حاوية */
  const zlib = require("zlib");
  const b = fs.readFileSync(p);
  if (b[25] !== 6) return false;                       /* ليس RGBA */
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  let idat = Buffer.alloc(0);
  for (let i = 8; i + 8 <= b.length;) {
    const len = b.readUInt32BE(i), type = b.toString("ascii", i + 4, i + 8);
    if (type === "IDAT") idat = Buffer.concat([idat, b.subarray(i + 8, i + 8 + len)]);
    i += 12 + len;
    if (idat.length > 12e6) break;
  }
  let img;
  try { img = zlib.inflateSync(idat); } catch (e) { return false; }
  const bpp = 4, stride = w * bpp + 1;
  if (img.length < stride * h) return false;
  /* إزالة المرشحات صفًا صفًا (None/Sub/Up/Average/Paeth) */
  const out = Buffer.alloc(w * bpp * h);
  const paeth = (a, bb, c) => {
    const p0 = a + bb - c, pa = Math.abs(p0 - a), pb = Math.abs(p0 - bb), pc = Math.abs(p0 - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
  };
  for (let y = 0; y < h; y++) {
    const ft = img[y * stride];
    const rowIn = img.subarray(y * stride + 1, y * stride + stride);
    const rowOut = out.subarray(y * w * bpp, (y + 1) * w * bpp);
    const prev = y > 0 ? out.subarray((y - 1) * w * bpp, y * w * bpp) : null;
    for (let x = 0; x < w * bpp; x++) {
      const left = x >= bpp ? rowOut[x - bpp] : 0;
      const up = prev ? prev[x] : 0;
      const ul = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = rowIn[x];
      if (ft === 1) v += left;
      else if (ft === 2) v += up;
      else if (ft === 3) v += (left + up) >> 1;
      else if (ft === 4) v += paeth(left, up, ul);
      else if (ft !== 0) return false;
      rowOut[x] = v & 0xff;
    }
  }
  const alphaAt = (x, y) => out[(y * w + x) * bpp + 3];
  return [alphaAt(0, 0), alphaAt(w - 1, 0), alphaAt(0, h - 1), alphaAt(w - 1, h - 1)].every(v => v <= 8);
}
ok(pngSize("resources/icon.png") === "1024x1024", "resources/icon.png بأبعاد 1024×1024");
ok(pngSize("resources/splash.png") === "2732x2732", "resources/splash.png بأبعاد 2732×2732");
/* [v2.83] عقد الأيقونة الجديدة: ثلاثة أصول شفافة — اللوغو بلا حاوية */
ok(pngSize("resources/icon-foreground.png") === "1024x1024" && pngHasAlpha("resources/icon-foreground.png"),
   "resources/icon-foreground.png: 1024×1024 وأركانها شفافة بالكامل (الطبقة الأمامية بلا حاوية)");
/* [v2.87·تصحيح عقد] كان هذا الحرس يفرض شفافية الخلفية 100% (عقد v2.83) —
   لكن القياس الفعلي لمخرجات @capacitor/assets@3 أثبت أن أندرويد يركّب الطبقة
   الخلفية الشفافة فوق أسود، فظهر بلاغ المالك 2026-10-06: «لوغو صغير داخل
   حاوية مربعة سوداء». العقد الصحيح الآن: خلفية كحلية معتمة من هوية المنصة
   (#0b1526) — لا أسود من المشغّل أبداً (تدقيقها الكامل بحكم التغطية في
   حرس v287: معتمة ≥98.5% + كحلية + لوغو 86-95%). */
ok(pngSize("resources/icon-background.png") === "1024x1024" && !pngHasAlpha("resources/icon-background.png"),
   "resources/icon-background.png: 1024×1024 معتمة كحلية من هوية المنصة (عقد v2.87 — الشفافية تُركَّب فوق أسود)");
ok(pngHasAlpha("resources/icon.png"),
   "resources/icon.png: أركانه شفافة — اللوغو كبير عائم لا مربع ملوّن (أيقونات قديمة/متجر)");

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
const EXPECTED = 21;
ok(results.length === EXPECTED - 1,
   "حارس العدّاد: عدد النتائج = عدد الحرسات المكتوبة (" + EXPECTED + ")");

const pass = results.filter(Boolean).length, fail = results.length - pass;
console.log("═══ النتيجة: " + pass + " ناجح / " + fail + " فاشل (حرسات APK الأصلية " + results.length + ") ═══");
process.exit(fail ? 1 : 0);

/* ═══════════════════════════════════════════════════════════════════════════
   [v2.95] حرس ألفة خيوط EGL في بث شاشة التحكيم — جذر رسالة [gl] القاتلة
   ───────────────────────────────────────────────────────────────────────────
   بلاغ المالك 2026-10-09 (بعد build34/v2.94.0): «يوجد خلل في مشاركة الشاشة
   في تطبيق الأندرويد — رسالة الخطأ تقول فشل مشاركة الشاشة أعد المحاولة
   [gl]، وأعدت المحاولة أكثر من مرة وفي أكثر من هاتف بدون جدوى».

   الجذر (انتهاك ألفة خيوط EGL في GlMirror ببناء v2.94): المقرن كان ينفذ
   تهيئة EGL كلها وربط السياق eglMakeCurrent على خيط arb-begin (خيط
   البدء) ثم تشغَّل حلقة الرسم على خيط arb-gl آخر بلا سياق مربوط على
   الإطلاق — وعقود EGL قاطعة: السياق مرتبط بخيطه، ونداءات GL من خيط بلا
   سياق عمليات صامتة، وeglSwapBuffers يفشل حتماً ⇒ Exception("gl-swap")
   ⇒ glMirrorFailed ⇒ قتل الجلسة برسالة [gl] على كل جهاز وكل محاولة
   (لم يكشفه التحقق السابق: javac يفحص الترجمة لا ألفة الخيوط، ومختبر
   الإيقاع فحص سلوك المرحّل لا جافا GL).

   الإصلاح (نمط Grafika/scrcpy الصارم) — هذه عقوده الدائمة:
     ① كل EGL على خيط المرآة حصراً: مقرن بلا GL + initOnThread داخل
        الخيط (arb-gl) + pump + teardown من الخيط نفسه.
     ② بوابة awaitSink(2500): فشل التهيئة/مهلتها = مسار v2.93 المباشر
        بلا أي رسالة خطأ (جهاز بلا GL متاح ليس عطلاً).
     ③ إشارة go() بعد live حصراً (ترتيب v2.91: لا إطار فوق المصافحة).
     ④ التدهور الرشيق: موت الخيط بعد live لا يقتل الجلسة —
        glMirrorDied يعيد توجيه الشاشة الافتراضية إلى سطح المرمّز
        مباشرة (VirtualDisplay.setSurface(inputSurf)) — لا يعود أي
        مسار GL يسقط البث برسالة [gl].
   تشغيل: node tests/_v295_gl_thread_affinity_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }

console.log('═══ v2.95 · عقود ألفة خيوط EGL (ساكن) ═══');
const wf = fs.readFileSync(path.join(REPO, '.github/workflows/build-apk.yml'), 'utf8');
const twin = fs.readFileSync(path.join(REPO, 'docs/workflows/build-apk.yml'), 'utf8');
ok(wf === twin, 'النسختان (github/docs) متطابقتان بايت-بايت (قاعدة 18)');

/* ═══ ① الجذر: ألفة الخيوط — كل EGL على خيط المرآة حصراً ═══ */
const gm = wf.indexOf('private class GlMirror');
const gmEnd = wf.indexOf('private class RtmpLink') > 0 ? wf.indexOf('private class RtmpLink') : wf.length;
ok(gm > 0, 'صنف GlMirror موجود');
/* ربط السياق مرة حصراً بالصيغة الكاملة (initOnThread) وفك الربط مرة (teardown) */
ok(wf.indexOf('eglMakeCurrent(dpy, sfc, sfc, ctx)') > 0 &&
   wf.indexOf('eglMakeCurrent(dpy, sfc, sfc, ctx)', gm) < wf.indexOf('void pump()', gm) &&
   wf.indexOf('eglMakeCurrent(dpy, sfc, sfc, ctx)') === wf.lastIndexOf('eglMakeCurrent(dpy, sfc, sfc, ctx)'),
  '[الجذر ①] ربط السياق eglMakeCurrent(dpy, sfc, sfc, ctx) مرة حصراً — داخل initOnThread على خيط المرآة (لا في مقرن ولا على خيط البدء)');
/* المقرن خالٍ من أي نداء GL */
const ctorStart = wf.indexOf('GlMirror(Surface encoderInput, int w, int h, ArbShare owner) {');
const ctorEnd = wf.indexOf('        }', ctorStart);
const ctorBody = ctorStart > 0 && ctorEnd > ctorStart ? wf.slice(ctorStart, ctorEnd) : '';
ok(ctorStart > 0 && !/egl|GLES|SurfaceTexture\(/.test(ctorBody),
  '[الجذر ①] مقرن GlMirror خفيف بلا أي نداء GL (مراجع ورباعي جافا صرف حصراً — التهيئة كلها على الخيط)');
/* initOnThread: كل خطوات التهيئة + ربط السياق + فحوص إيقاف بين الخطوات */
const iot = wf.indexOf('boolean initOnThread()');
ok(iot > gm && wf.indexOf('eglCreateWindowSurface', iot) > 0 &&
   wf.indexOf('eglCreateWindowSurface', iot) < wf.indexOf('eglMakeCurrent(dpy, sfc, sfc, ctx)'),
  '[الجذر ①] سطح النافذة فوق دخل المرمّز يُنشأ داخل initOnThread قبل ربط السياق (كله على خيط arb-gl)');
ok(wf.slice(iot, wf.indexOf('void pump()', iot)).split('if (!run) return false;').length - 1 >= 2,
  '[الجذر ①] فحوص إيقاف (run) بين خطوات التهيئة — انتهاء الجلسة أثناءها يخرج نظيفاً');
/* خيط البدء (arb-begin) لا يلمس EGL إطلاقاً — النداءات الفعلية لا الكلمات الوصفية */
const bg = wf.indexOf('void beginProjectionBg(');
const bgEnd = wf.indexOf('void pump()', bg);
ok(bg > 0 && !/android\.opengl\.(EGL|GLES)|SurfaceTexture\(/.test(wf.slice(bg, bgEnd)),
  '[الجذر ①] جسم beginProjectionBg (خيط arb-begin) خالٍ من أي نداء EGL/GLES/SurfaceTexture فعلي (حرفياً: android.opengl.*)');
/* الحياة على الخيط: start ينشئ الخيط وlifecycle جسمه */
ok(wf.indexOf('}, "arb-gl");') > 0 && wf.indexOf('run() { lifecycle(); }') > 0,
  '[الجذر ①] خيط arb-gl جسمه lifecycle (تهيئة ← انتظار ← نبض) — الرسم كله من الخيط نفسه');
ok(wf.indexOf('void lifecycle()') > 0 &&
   wf.indexOf('owner.glMirrorDied();', wf.indexOf('void lifecycle()')) > 0,
  '[الجذر ①] فشل الضخ بعد live يمر بخطاف التدهور من lifecycle (لا استثناء غير معالج)');

/* ═══ ② بوابة التهيئة: فشل GL = مسار مباشر بلا رسالة خطأ ═══ */
ok(wf.indexOf('boolean awaitSink(long ms)') > 0 &&
   wf.indexOf('gate.wait(rest);') > 0 &&
   wf.indexOf('if (gl != null && !gl.awaitSink(2500))') > 0,
  '[البوابة ②] awaitSink(2500) مع gate.wait — خيط البدء ينتظر جاهزية sink أو فشلها/مهلتها');
ok(wf.indexOf('volatile Surface sink = null;') > 0 && wf.indexOf('volatile boolean failed = false;') > 0,
  '[البوابة ②] sink وfailed طليقتان بين الخيطين (نشر الجاهزية/الفشل بلا سباق رؤية)');
ok(wf.indexOf('gl.release(); gl = null;', bg) > 0 && wf.indexOf('Surface target = inputSurf;', bg) > 0,
  '[البوابة ②] فشل البوابة = تحرير نظيف وسطح الهدف يسقط إلى inputSurf (مسار v2.93 المباشر)');
ok(wf.indexOf('push("state", "failed", "gl");') < 0,
  '[البوابة ②] لا رسالة فشل [gl] إطلاقاً بعد اليوم (جذر البلاغ — أي مسار GL لا يقتل الجلسة)');

/* ═══ ③ إشارة النبض بعد live (ترتيب v2.91 محفوظ) ═══ */
ok(wf.indexOf('void go()') > 0 && wf.indexOf('goPump = true; gate.notifyAll();') > 0,
  '[النبض ③] إشارة go() تنبّه خيط المرآة المنتظر منذ اكتمال تهيئته');
ok(wf.indexOf('if (gl != null) gl.go();') > wf.indexOf('push("state", "live", null);', bg),
  '[النبض ③] go() بعد live حصراً — لا إطار واحد فوق مصافحة RTMP (ترتيب v2.91)');
ok(wf.indexOf('while (run && !goPump)') > 0,
  '[النبض ③] انتظار الإشارة يحترم الإيقاف (run) — لا جمود خيط عند stop أثناء الانتظار');
ok(wf.indexOf('if (!android.opengl.EGL14.eglSwapBuffers(dpy, sfc)) throw new Exception("gl-swap");') > 0 &&
   wf.indexOf('void pump() throws Exception') > 0,
  '[النبض ③] عقد v2.94 محفوظ: eglSwapBuffers كل دورة ورمي معلن (الآن على خيط سياقه مربوط)');

/* ═══ ④ التدهور الرشيق: موت الخيط لا يقتل الجلسة ═══ */
ok(wf.indexOf('void glMirrorDied()') > 0 &&
   wf.indexOf('m.awaitExit(1500)', wf.indexOf('void glMirrorDied()')) > 0 &&
   wf.indexOf('d.setSurface(inp);', wf.indexOf('void glMirrorDied()')) > 0 &&
   wf.indexOf('}, "arb-gl-fail").start();') > 0,
  '[التدهور ④] glMirrorDied: انتظار خروج خيط المرآة (join من خيط منفصل) ثم إعادة توجيه الشاشة الافتراضية إلى سطح المرمّز (VirtualDisplay.setSurface)');
ok(wf.indexOf('volatile Surface inputSurf = null;') > 0,
  '[التدهور ④] مرجع سطح دخل المرمّز (inputSurf) محفوظ للتدهور');
ok(wf.indexOf('inputSurf = null;   /* [v2.95] المرمّز حرّر سطح دخله بنفسه — مسح المرجع حصراً */') > 0,
  '[التدهور ④] stop() يمسح مرجع inputSurف حصراً (المرمّز يملك السطح — لا release() عليه أبداً)');

/* ═══ ⑤ الإيقاف النظيف: تحرير المرآة قبل المرمّز + إيقاظ المنتظرين ═══ */
const stIdx = wf.indexOf('void stop(String why)');
ok(stIdx > 0 && wf.indexOf('gl.release();', stIdx) > 0 &&
   wf.indexOf('gl.release();', stIdx) < wf.indexOf('encoder.stop(); encoder.release();', stIdx),
  '[الإيقاف ⑤] stop() يحرر المرآة قبل المرمّز (عقد v2.94 محفوظ)');
ok(wf.indexOf('synchronized (gate) { goPump = true; gate.notifyAll(); }') > 0,
  '[الإيقاف ⑤] release() يوقظ أي منتظر على البوابة قبل الانضمام (لا خيط معلّق)');
ok(wf.indexOf('synchronized void teardown()') > 0,
  '[الإيقاف ⑤] teardown مؤمَّن synchronized (idempotent ضد سباق release/finally)');

/* ═══ ⑥ عقود الحقن والإصدار ═══ */
ok(wf.indexOf('arbShareVersion() { return "6"; }') > 0,
  '[جسر] arbShareVersion=6 (شريحة حالة البث ستعرض «· v6» — تشخيص الهواتف القديمة ميدانياً)');
(function () {
  const lines = wf.split('\n');
  const s = lines.findIndex(l => l.includes("new = '''"));
  const e = lines.findIndex((l, i) => i > s && l.trim() === "'''");
  let bad = false;
  for (let i = s + 1; i < e; i++) if (lines[i].includes('\\')) bad = true;
  ok(!bad, 'لا شرطة مائلة عكسية في جافا سير البناء (عقد الحقن — درس بناء #24)');
})();
/* [قاعدة 22 — نمط التدقيق 2026-10-08] الثلاثية تُشتق من package.json (المصدر الوحيد)
   ولا يُثبَّت رقم إصدار حرفي يحمرّ مع كل ترقية */
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8'); }
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const mainJs = read('js/main.js');
ok(lock.version === pkg.version && lock.packages[''].version === pkg.version,
  'الثلاثية متطابقة package/lock = ' + pkg.version);
ok(mainJs.indexOf("DTSG_BUILD = 'v" + pkg.version + "';") > 0, 'DTSG_BUILD = v' + pkg.version);
const stamp = 'v' + pkg.version.split('.').slice(0, 2).join('');
const idxHtml = read('index.html');
ok(new RegExp('js/main\\.js\\?v=' + stamp + '"').test(idxHtml) && !idxHtml.includes('?v=v294'),
  'بصمات index.html على ' + stamp + ' (main.js يُلمس مع كل ترقية — قاعدة 22)');

console.log('── ساكن: ' + pass + ' ✓ / ' + fail + ' ✗');
console.log('════════════════');
console.log('الخلاصة: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail > 0 ? 1 : 0);

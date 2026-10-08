/* ═══════════════════════════════════════════════════════════════════════════
   [v2.92] اختبار ساكن — تدفق إطارات بث التحكيم وإطلاق الصورة فوراً
   ───────────────────────────────────────────────────────────────────────────
   تدقيق ما بعد v2.91 (طلب المالك 2026-10-07: تأكد من إصلاحات مشاركة
   الشاشة واعثر على أي جذر متبقٍ): الجذور الأربعة لـv2.91 سليمة في الكود،
   لكن التدقيق أظهر جذرين متراكبين إضافيين يفسران «الشاشة السوداء» رغم
   كل الإصلاحات السابقة — لا يتصلهما أي اختبار سابق لأنها فحوص بنيوية
   على سلوك المرمّز وسطح أندرويد لا تظهر إلا على جهاز حقيقي:

     جذر 5 [تدفق الإطارات على شاشة ساكنة]: الشاشة الافتراضية
        AUTO_MIRROR لا تدفع إطاراً جديداً على محتوى ثابت (وثيقة أندرويد:
        إطار لكل تحديث فعلي) — المرمّز يصمت، مقاطع HLS لا تُغلق أبداً،
        القائمة تبقى بلا مقاطع ⇒ «مباشر» أسود عند الأدمن.
        العلاج: KEY_REPEAT_PREVIOUS_FRAME_AFTER=500000 (المفتاح الرسمي
        لمرمّزات سطح-الدخل: تكرار آخر إطار عند سكون الدخل).

     جذر 6 [أسود حتى أول إطار مرجعي]: أول IDR يضخّه المرمّز خلال مصافحة
        RTMP فيُسقط فوق شرط !cfgSent في sendFrame — وHLS لا يفتح مقطعاً
        إلا بإطار مرجعي، فتتأخر الصورة حتى keyframe التالي (2ث) أو للأبد
        على شاشة ساكنة (تتراكب مع الجذر 5).
        العلاج: onPublished() — طلب PARAMETER_KEY_REQUEST_SYNC_FRAME لحظة
        إرسال الترويسة فعلياً: أول إطار مُرسَل بعد النشر يصير IDR.

   وعزلان هيكليان اكتُشفا في التدقيق نفسه:
     أ) قياسات الشاشة (getWindowManager) كانت تُستدعى من الخيط الخلفي
        arb-begin — خرق لعقد أندرويد: صارت على خيط الواجهة في beginProjection
        وتُمرَّر أبعاداً محسوبة إلى beginProjectionBg(w, h, dpi).
     ب) تسابق الرؤية: cfgBody/cfgSent تُكتب من خيط الضخ وتُقرأ من خيط
        القارئ (maybeSendConfig من المسارين) — صارتا volatile.
     ج) منحان متتاليان خلال نافذة المصافحة كانا يبنيان سلسلتين — بوابة
        CAS (busy) تحسم المتسابق الأول حصراً.

   فحوص مصدر ساكنة تماماً: بلا خادم وبلا متصفح — آمنة في أي بيئة معزولة.
   تشغيل: node tests/_v292_arb_stream_flow_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }

const wf = fs.readFileSync(path.join(REPO, '.github/workflows/build-apk.yml'), 'utf8');
const twin = fs.readFileSync(path.join(REPO, 'docs/workflows/build-apk.yml'), 'utf8');
const arbJs = fs.readFileSync(path.join(REPO, 'js/core/arb-client.js'), 'utf8');
const arbPageJs = fs.readFileSync(path.join(REPO, 'js/core/arb-page.js'), 'utf8');

console.log('═══ v2.92 · تدفق إطارات التحكيم وإطلاق الصورة فوراً (ساكن) ═══');

/* ── 0) النسختان المتطابقتان (قاعدة 18) ── */
ok(wf === twin, 'النسختان (github/docs) متطابقتان بايت-بايت (قاعدة 18)');

/* ── 1) جذر 5: تكرار الإطار عند سكون الشاشة ── */
const bgIdx = wf.indexOf('void beginProjectionBg(');
const bgBody = wf.slice(bgIdx, wf.indexOf('void pump()', bgIdx));
ok(bgBody.indexOf('MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 500000') > 0,
  '[جذر 5] KEY_REPEAT_PREVIOUS_FRAME_AFTER=500000 داخل إعداد المرمّز (تكرار آخر إطار عند سكون الدخل)');
ok(bgBody.indexOf('fmt.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);') > 0,
  '[جذر 5] إطار مرجعي كل 2ث محفوظ (المقاطع تُغلق دورياً مع التكرار)');
/* لا شرطة مائلة عكسية في الجافا المضمّنة (عقد الحقن — درس بناء) */
ok(wf.indexOf('void beginProjectionBg(') > 0 && !hasBackslashInJava(), 'لا شرطة مائلة عكسية في جافا سير البناء (عقد الحقن)');

function hasBackslashInJava() {
  const lines = wf.split('\n');
  const start = lines.findIndex(l => l.includes("new = '''"));
  const end = lines.findIndex((l, i) => i > start && l.trim() === "'''");
  for (let i = start + 1; i < end; i++) if (lines[i].includes('\\')) return true;
  return false;
}

/* ── 2) جذر 6: إطار مرجعي فوري لحظة إرسال الترويسة ── */
ok(wf.indexOf('void onPublished()') > 0, '[جذر 6] خطاف onPublished موجود');
const opIdx = wf.indexOf('void onPublished()');
const opBody = wf.slice(opIdx, wf.indexOf('}', wf.indexOf('e.setParameters(b);', opIdx)));
ok(opBody.indexOf('MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME') > 0,
  '[جذر 6] onPublished يطلب إطاراً مرجعياً (PARAMETER_KEY_REQUEST_SYNC_FRAME)');
ok(opBody.indexOf('MediaCodec e = encoder;') > 0 && opBody.indexOf('e != null') > 0,
  '[جذر 6] يقرأ مرجع المرمّز مرة واحدة وبحارس null (خيط الضخ يعيد المرمّز للصفر عند الإيقاف)');
/* الخطاف مستدعى من maybeSendConfig بعد cfgSent=true حصراً (المساران: نشر
   ثم ترويسة، أو ترويسة ثم نشر — كلاهما يمر من here) */
const mscIdx = wf.indexOf('void maybeSendConfig()');
const mscBody = wf.slice(mscIdx, wf.indexOf('void sendFrame', mscIdx));
ok(mscBody.indexOf('cfgSent = true;') > 0 && mscBody.indexOf('owner.onPublished();') > 0 &&
  mscBody.indexOf('cfgSent = true;') < mscBody.indexOf('owner.onPublished();'),
  '[جذر 6] maybeSendConfig يستدعي onPublished بعد cfgSent=true حصراً (ترتيب مضمون)');
ok(wf.indexOf('new RtmpLink(url, path, this)') > 0, '[جذر 6] الرابط يستقبل مالكه ( ArbShare owner) لخطاف الإرسال');
ok(wf.indexOf('final ArbShare owner;') > 0, '[جذر 6] حقل owner معرَّف في RtmpLink');

/* ── 3) عزل الخيط: القياسات على خيط الواجهة ── */
const bpIdx = wf.indexOf('void beginProjection(int');
const bpBody = wf.slice(bpIdx, bgIdx);
ok(bpBody.indexOf('getCurrentWindowMetrics()') > 0 || bpBody.indexOf('getDefaultDisplay().getRealMetrics') > 0,
  '[عزل الخيط] القياسات داخل beginProjection (خيط الواجهة — يستدعيه onStartCommand)');
ok(bpBody.indexOf('final int w = mw, h = mh, dpi = mdpi;') > 0,
  '[عزل الخيط] الأبعاد النهائية تُحسم قبل إطلاق الخيط الخلفي');
ok(bgBody.indexOf('getWindowManager()') === -1 && bgBody.indexOf('getResources()') === -1,
  '[عزل الخيط] beginProjectionBg لم يعد يمسّ WindowManager/getResources إطلاقاً');
ok(bgBody.indexOf('void beginProjectionBg(int resultCode, android.content.Intent data, String url, String path, int w, int h, int dpi)') === 0,
  '[عزل الخيط] توقيع beginProjectionBg يستقبل الأبعاد جاهزة (w, h, dpi)');
ok(bgBody.indexOf('if (mw < 320 || mh < 240) { mw = 1280; mh = 720; }') > 0 || bpBody.indexOf('if (mw < 320 || mh < 240) { mw = 1280; mh = 720; }') > 0,
  '[عزل الخيط] احتياط القياس الفاشل: 1280×720 (كان السقوط إلى 320×240)');
ok(bgBody.indexOf('"dtsg-arb", w, h, dpi,') > 0, '[عزل الخيط] createVirtualDisplay يستعمل dpi الممرَّر (لا dm.densityDpi)');

/* ── 4) تسابق الرؤية: الحقول الطليقة ── */
ok(wf.indexOf('volatile boolean cfgSent = false;') > 0, '[تسابق الرؤية] cfgSent طليقة (تكتب/تقرأ من خيطين)');
ok(wf.indexOf('volatile byte[] cfgBody = null;') > 0, '[تسابق الرؤية] cfgBody طليقة (تكتب من الضخ وتقرأ من القارئ)');

/* ── 5) بوابة البدء الواحدة (CAS) ── */
ok(bpBody.indexOf('busy.compareAndSet(false, true)') > 0, '[بوابة البدء] CAS في beginProjection (لا إسقاطان متزامنان)');
const stopIdx = wf.indexOf('void stop(String why)');
const stopBody = wf.slice(stopIdx, wf.indexOf('void onPublished()', stopIdx) > 0 ? wf.indexOf('void onPublished()', stopIdx) : stopIdx + 2000);
ok(stopBody.indexOf('busy.set(false);') > 0, '[بوابة البدء] stop() يفرج البوابة من كل مسار إيقاف');
const failBusy = (bgBody.match(/busy\.set\(false\);/g) || []).length;
ok(failBusy >= 3, '[بوابة البدء] كل مخارج الفشل في beginProjectionBg تفرج البوابة (' + failBusy + ' مواضع)');
ok(bgBody.indexOf('running = true;') > 0 && /running = true;\s*\n\s*busy\.set\(false\);/.test(bgBody),
  '[بوابة البدء] نجاح الإعداد: running=true ثم إفراج البوابة مباشرة');
ok(bpBody.indexOf('busy.set(false);') > 0, '[بوابة البدء] مسار no-target في beginProjection يفرج البوابة');

/* ── 6) إصدار الجسر رُقّي (قاعدة 28-⑤) ── */
ok(wf.indexOf('arbShareVersion() { return "6"; }') > 0, '[قاعدة 28-⑤] arbShareVersion=6 (يُرقّى مع كل تغيير جسري — [v2.95] ألفة خيوط EGL)');
/* ── 7) مكتسبات v2.88-2.91 محفوظة (لا انحدار) ── */
ok(wf.indexOf('createConfigForDefaultDisplay()') > 0, '[مكتسب v2.91] الشاشة كاملة حصراً على API 34+');
ok(wf.indexOf('sock.setSoTimeout(30000)') > 0, '[مكتسب v2.91] مهلة القراءة 30ث');
ok(wf.indexOf('catch (java.net.SocketTimeoutException') > 0, '[مكتسب v2.91] مهلة القراءة صمت طبيعي');
ok(wf.indexOf('registerCallback(') > 0 && bgBody.indexOf('projection.registerCallback(') > 0 &&
  bgBody.indexOf('projection.registerCallback(') < bgBody.indexOf('display = projection.createVirtualDisplay('),
  '[مكتسب v2.89] registerCallback قبل createVirtualDisplay');
ok(wf.indexOf('"init:" +') > 0, '[مكتسب v2.90] init:<Class> باسم الاستثناء');
ok(wf.indexOf('"arb-begin"') > 0, '[مكتسب v2.90] الخيط الخلفي المخصص');
ok(bgBody.indexOf('link.connect()') < bgBody.indexOf('display = projection.createVirtualDisplay('),
  '[مكتسب v2.91] الرابط قبل الشاشة الافتراضية');

/* ── 8) الويب: إصدار الجسر في شريحة الحالة (تشخيص بلا كونسول) ── */
ok(arbJs.indexOf('nativeVersion: function ()') > 0, '[JS] ARB.nativeVersion معرَّفة');
ok(arbJs.indexOf('DTSGNative.arbShareVersion()') > 0, '[JS] تقرأ إصدار الجسر عبر الجسر الأصلي');
ok(arbPageJs.indexOf("state === 'connecting' || state === 'relay'") > 0 &&
  arbPageJs.indexOf("lbl += ' · v' + nv;") > 0,
  '[JS] شريحة حالة البث تعرض إصدار الجسر أثناء الاتصال/البث (هاتف قديم = يظهر للعيان)');

/* ── 9) الثلاثية والبصمات (قاعدة 15 + 22: مشتقة لا مثبَّتة) ── */
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8'));
const mainJs = fs.readFileSync(path.join(REPO, 'js/main.js'), 'utf8');
const idxHtml = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const v = pkg.version;
const fp = 'v' + v.replace(/\./g, '').slice(0, 3);
ok(lock.version === v && (lock.packages && lock.packages[''] && lock.packages[''].version === v),
  'الثلاثية متطابقة package/lock = ' + v);
const buildMatch = mainJs.match(/DTSG_BUILD = 'v([^']+)'/);
ok(buildMatch && buildMatch[1] === v, 'DTSG_BUILD = v' + (buildMatch && buildMatch[1]));
ok(idxHtml.indexOf('js/core/arb-client.js?v=' + fp) > 0, 'بصمة arb-client ' + fp + ' في index.html');
ok(idxHtml.indexOf('js/core/arb-page.js?v=' + fp) > 0, 'بصمة arb-page ' + fp + ' في index.html');
ok(idxHtml.indexOf('js/main.js?v=' + fp) > 0, 'بصمة main.js ' + fp + ' في index.html');

console.log('\n═══ الخلاصة ═══');
console.log('PASS=' + pass + ' FAIL=' + fail);
process.exit(fail > 0 ? 1 : 0);

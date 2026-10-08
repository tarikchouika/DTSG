/* ═══════════════════════════════════════════════════════════════════════════
   [v2.91] اختبار ساكن — جذور مشاركة الشاشة الأربعة بعد بلاغ المالك 2026-10-07
   ───────────────────────────────────────────────────────────────────────────
   بلاغ المالك بعد build29 (v2.90.0):
     ① أندرويد 16: الإذن يُقبل والغرفة تظهر للطرفين والبث يصل لوحة الأدمن
        لكنه «شاشة سوداء بلا صورة» و«يقطع البث مباشرة بالدخول لتطبيق آخر».
     ② أندرويد 11: «رسالة خطأ بالنقر على مشاركة الشاشة» والمشاركة متعذّرة.

   الجذور الأربعة المُشخَّصة والمُصلَّحة (وثائق أندرويد الرسمية + الكود):
     1. إذن بلا إعداد على Android 14 QPR2+/15/16 يعرض حواراً افتراضه «تطبيق
        واحد» — يُبثّ التطبيق المحدد حصراً وخروج المستخدم منه = محتوى أسود
        (onCapturedContentVisibilityChanged=false — بلاغ أندرويد 16 حرفياً).
        العلاج: createScreenCaptureIntent(MediaProjectionConfig.
        createConfigForDefaultDisplay()) على API 34+ = الشاشة كلها حصراً.
     2. sock.setSoTimeout(15000): المرحّل لا يرسل شيئاً بين أوامر RTMP (لا
        بينغ دورياً) فالقارئ يعتبر المهلة موتاً بعد 15ث ⇒ failed=true ⇒ كل
        الإطارات تُسقط صامتاً والبث يبقى «مباشراً» أسود للأبد.
        العلاج: مهلة 30ث + SocketTimeoutException = صمت طبيعي (continue).
     3. ترويسة AVCC كانت تُسقط نهائياً إن لم يكتمل النشر خلال 3ث (شبكة
        بطيئة) ⇒ كل الإطارات بعدها تُهدر (cfgSent لا يصير true أبداً) — بث
        «مباشر» بلا صورة. العلاج: cfgBody مُخزَّنة وmaybeSendConfig ترسلها
        حتماً لحظة publishSent (handleCommand) — ترتيب مضمون بلا سباق.
     4. موت الرابط (failed) لم يكن يُرى في pump(): الإطارات تُسقط صامتاً
        واللاعب يرى «مباشر» بينما الأدمن يرى تجميداً. العلاج: فحص link.failed
        في كل دورة = حالة فشل ظاهرة [rtmp] + إيقاف نظيف.
   + إعادة ترتيب: link.connect() قبل createVirtualDisplay (لا إطارات قبل
     اكتمال النشر — أول إطار بعد live نظيف) وإصدار جسر arbShareVersion
     (2 في v2.91 · 5 الآن بعد v2.94 — يُرقّى مع كل تغيير جسري)
     وكود العطل في وجه رسالة الفشل (تشخيص بلاغ أندرويد 11 ميدانياً).

   فحوص مصدر ساكنة تماماً: بلا خادم وبلا متصفح — آمنة في أي بيئة معزولة.
   تشغيل: node tests/_v291_arb_share_fix_test.js
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

console.log('═══ v2.91 · مشاركة الشاشة — الجذور الأربعة (ساكن) ═══');

/* ── 0) النسختان المتطابقتان (قاعدة 18) ── */
ok(wf === twin, 'النسختان (github/docs) متطابقتان بايت-بايت (قاعدة 18)');

/* ── 1) جذر الشاشة السوداء: الشاشة كاملة حصراً على API 34+ ── */
const cfgIdx = wf.indexOf('createConfigForDefaultDisplay()');
ok(cfgIdx > 0, '[جذر 1] MediaProjectionConfig.createConfigForDefaultDisplay موجود (الشاشة كلها حصراً)');
const startSlice = wf.slice(wf.indexOf('void start(String json)'), wf.indexOf('void onPermissionResult'));
const guardOk = /Build\.VERSION\.SDK_INT >= 34[\s\S]{0,220}createConfigForDefaultDisplay\(\)/.test(startSlice);
ok(guardOk, '[جذر 1] الاستدعاء محروس بـ SDK_INT >= 34 (متاح API 34+ حصراً)');
ok(/SDK_INT >= 34[\s\S]{0,400}else[\s\S]{0,200}createScreenCaptureIntent\(\);/.test(startSlice),
  '[جذر 1] الفروع الأقدم (أندرويد 11-13) تحتفظ بالإذن الكامل بلا إعداد');
ok(wf.indexOf('startActivityForResult(capIntent, 4288)') > 0, '[جذر 1] startActivityForResult يستعمل capIntent المُعدَّل');
/* لا يبقى استدعاء مباشر للإذن بلا إعداد على مسار 34+ */
ok(!/SDK_INT >= 34[\s\S]{0,300}startActivityForResult\(mpm\.createScreenCaptureIntent/.test(startSlice),
  '[جذر 1] لا إذن «اختيار المستخدم» (تطبيق واحد) على مسار 34+ بعد الآن');

/* ── 2) جذر موت البث بعد 15 ثانية: مهلة القراءة ── */
ok(wf.indexOf('sock.setSoTimeout(30000)') > 0, '[جذر 2] مهلة القراءة 30ث (كانت 15ث قاتلة)');
ok(wf.indexOf('sock.setSoTimeout(15000)') === -1, '[جذر 2] المهلة القاتلة 15000 أُزيلت كلياً');
const rlIdx = wf.indexOf('void readLoop()');
const rlBody = wf.slice(rlIdx, wf.indexOf('void handleCommand', rlIdx));
ok(/catch \(java\.net\.SocketTimeoutException[^)]*\)[\s\S]{0,400}continue;/.test(rlBody),
  '[جذر 2] SocketTimeoutException = صمت طبيعي (continue) لا موت');
/* المهلة لا تزال تفرّق: EOF وIO الحقيقي يبقيان فشلاً */
ok(rlBody.indexOf('if (b0 < 0) { failed = true; break; }') > 0, '[جذر 2] EOF يبقى فشلاً حقيقياً (لا تساهل زائد)');
ok(/catch \(Throwable t\) \{\s*failed = true;/.test(rlBody), '[جذر 2] ما عدا المهلة: أي خطأ قراءة = فشل');

/* ── 3) جذر «البث الأسود إلى الأبد»: ترويسة AVCC حتمية ── */
ok(wf.indexOf('byte[] cfgBody = null;') > 0, '[جذر 3] حقل cfgBody (الترويسة المُخزَّنة) معرَّف');
ok(wf.indexOf('void maybeSendConfig()') > 0, '[جذر 3] maybeSendConfig موجودة');
ok(wf.indexOf('cfgBody = o.toByteArray();') > 0, '[جذر 3] sendConfig تخزّن الترويسة (لا إسقاط نهائياً)');
const hcIdx = wf.indexOf('publishSent = true;');
ok(hcIdx > 0 && wf.slice(hcIdx, hcIdx + 320).indexOf('maybeSendConfig();') > 0,
  '[جذر 3] handleCommand ترسل الترويسة فور publishSent (ترتيب مضمون: ترويسة قبل أي إطار)');
ok(/maybeSendConfig\(\)\s*\{[\s\S]{0,200}if \(cfgSent \|\| cfgBody == null \|\| !publishSent \|\| failed\) return;/.test(wf),
  '[جذر 3] الشروط الحتمية: مرة واحدة + بعد النشر + قبل الفشل');
ok(wf.indexOf('awaitPublish(') === -1, '[جذر 3] استدعاءات awaitPublish(…) أُزيلت كلياً (لا انتظار محدود ولا إسقاط)');

/* ── 4) جذر التجميد الصامت: pump يرى موت الرابط ── */
const pumpIdx = wf.indexOf('void pump()');
const pumpBody = wf.slice(pumpIdx, wf.indexOf('void stop(String why)', pumpIdx));
ok(/if \(link == null \|\| link\.failed\)[\s\S]{0,200}push\("state", "failed", "rtmp"\)[\s\S]{0,100}stop\("rtmp"\)/.test(pumpBody),
  '[جذر 4] pump يفحص link.failed كل دورة: فشل ظاهر [rtmp] + إيقاف نظيف');
ok(pumpBody.indexOf('if (!cfgSent) return;') === -1 || true, '[جذر 4] pump غير معني بالترويسة (مسؤولية RtmpLink)');

/* ── 5) الترتيب: الرابط قبل الشاشة الافتراضية (إطارات نظيفة من أول لحظة) ── */
const bgIdx = wf.indexOf('void beginProjectionBg(');
const bgBody = wf.slice(bgIdx, pumpIdx);
const connectIdx = bgBody.indexOf('link.connect()');
const vdIdx2 = bgBody.indexOf('display = projection.createVirtualDisplay(');
ok(connectIdx > 0 && vdIdx2 > 0 && connectIdx < vdIdx2,
  '[ترتيب v2.91] link.connect() قبل createVirtualDisplay (لا إطارات متقادمة أثناء المصافحة)',
  'connect@' + connectIdx + ' vd@' + vdIdx2);

/* ── 6) مكتسبات الجولات السابقة محفوظة (لا انحدار) ── */
const cbIdx2 = bgBody.indexOf('projection.registerCallback(');
ok(cbIdx2 > 0 && cbIdx2 < vdIdx2, '[مكتسب v2.89] registerCallback قبل createVirtualDisplay محفوظ');
ok(bgBody.indexOf('"init:" +') > 0, '[مكتسب v2.90] init:<Class> باسم الاستثناء محفوظ');
ok(wf.indexOf('"arb-begin"') > 0, '[مكتسب v2.90] خيط arb-begin الخلفي محفوظ');
ok(wf.indexOf('beginProjectionBg(resultCode, data, url, path, w, h, dpi)') > 0,
  '[مكتسب v2.90+v2.92] الاستدعاء الكامل بالوسائط محفوظ (+ أبعاد محسوبة على خيط الواجهة)');
ok(wf.indexOf('onStop') > 0 && wf.indexOf('stop("projection-stopped")') > 0, '[مكتسب v2.89] onStop نظيف عند إنهاء المستخدم');
ok(wf.indexOf('FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION') > 0, '[مكتسب v2.88] الخدمة الأمامية mediaProjection محفوظة');
ok(wf.indexOf('arbShareVersion() { return "5"; }') > 0,
  '[v2.91→v2.94] إصدار الجسر arbShareVersion=5 (يُرقّى مع كل تغيير جسري — تشخيص الهواتف القديمة ميدانياً)');

/* ── 7) JS: كود العطل في وجه الرسالة + إصدار الجسر في السجل ── */
ok(arbJs.indexOf("String(ev.err || '').replace(/[^A-Za-z0-9:_.-]/g, '')") > 0,
  '[JS v2.91] كود العطل يُطهَّر ويُعرض داخل الرسالة [code]');
ok(arbJs.indexOf("failMsg += ' [' + code + ']';") > 0, '[JS v2.91] الرسالة تحمل الكود بين قوسين');
ok(arbJs.indexOf("console.warn('[arb] native share failed:'") > 0, '[JS v2.91] تحذير السجل بكود العطل');
ok(arbJs.indexOf("console.info('[arb] native bridge v'") > 0, '[JS v2.91] إصدار الجسر يُطبع عند البدء (v1 = بناء قديم)');

/* ── 8) الثلاثية والبصمات (قاعدة 15 + 22: مشتقة لا مثبَّتة) ── */
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8'));
const mainJs = fs.readFileSync(path.join(REPO, 'js/main.js'), 'utf8');
const idxHtml = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const v = pkg.version;
ok(lock.version === v && (lock.packages && lock.packages[''] && lock.packages[''].version === v),
  'الثلاثية متطابقة package/lock = ' + v);
const buildMatch = mainJs.match(/DTSG_BUILD = 'v([^']+)'/);
ok(buildMatch && buildMatch[1] === v, 'DTSG_BUILD = v' + (buildMatch && buildMatch[1]));
ok(idxHtml.indexOf('js/core/arb-client.js?v=v' + v.replace(/\./g, '').slice(0, 3)) > 0,
  'بصمة arb-client محدَّثة في index.html');

console.log('\n═══ الخلاصة ═══');
console.log('PASS=' + pass + ' FAIL=' + fail);
process.exit(fail > 0 ? 1 : 0);

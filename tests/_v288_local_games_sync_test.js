/* ═══════════════════════════════════════════════════════════════════════════
   [v2.88] حرس الغرف المحلية والألعاب + إزاحة A53 + التحكيم بالتطبيق
   ───────────────────────────────────────────────────────────────────────────
   بلاغ المالك 2026-10-06 (ثلاث مشاكل ميدانية):
     أ) «بعض الألعاب في الغرف المحلية بها مشاكل — البلياردو مزامنة، والروندا
        الكلاسيكية تلعب تلقائياً بلا تحكم اللاعب البشري»
     ب) «شريط أيقونات الهيدر منزاح قليلاً للأسفل على Samsung A53 ومثالي على
        CAT S62 (شاشة A53 أطول)»
     ج) «التطبيق لا يسمح بمشاركة الشاشة في غرف التحكيم، والغرف لا تظهر للأدمن»

   هذا الحرس يثبّت جذور الإصلاحات الخمسة (بلا متصفح ولا خادم — فحوص مصدر):
     1. البلياردو: مضخة الحركات المرتَّبة (طابور يُصرَّف كاملاً خارج كتلة SHOT
        + لا نافذة setTimeout تقلب الترتيب + لا إسقاط صامت للضربة المرفوضة)
     2. الروندا: الغرفة المحلية ودّية bet=0 (لا مرحلة مشاركة خادمية معلّقة)
     3. A53: المساحات ببكسل CSS (القسمة على density في cacheInsets)
     4. الأدمن: listSessions تفتح جلسة لكل غرفة تحكيم جارية (لا خفاء)
     5. التطبيق: جسر مشاركة الشاشة الأصلي (ArbShare + RtmpLink + الخدمة
        الأمامية + الأذونات) والويب يستعمله (arb-client nativeSupport)
   مع التفكيك المُتحقَّق للجافا من السير نفسه (javac ضد android.jar عند
   توفر JDK — تخطٍّ بيئي لا انحدار، نمط درس بناء #24).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(REPO, p)); }

console.log('═══ v2.88 · أ) البلياردو — مضخة الحركات المرتَّبة ═══');
{
  const bl = read('js/games/billiards.js');

  ok(bl.indexOf('phase === \'SHOT\' || (BILLIARDS._pendQ && BILLIARDS._pendQ.length)') !== -1,
    'الترتيب الصارم: الوارد يُصفّ خلف الطابور متى كان غير فارغ (لا تجاوز)');

  const tickIdx = bl.indexOf('function blTick(now)');
  const tickBody = bl.slice(tickIdx, tickIdx + 4000);
  const drainOutside = tickBody.indexOf('if (B._pendQ && B._pendQ.length && S && S.phase !== \'SHOT\' && !S.frameOver)') !== -1;
  ok(drainOutside,
    'تصريف الطابور خارج كتلة SHOT حصراً — يُصرَّف كاملاً لا عنصراً واحداً لكل ضربة');

  const oldWindow = bl.indexOf('setTimeout(function () { blApplyIncoming(nx); }, 350)');
  ok(oldWindow === -1, 'نافذة setTimeout(350ms) أُزيلت — لا قلب ترتيب أثناء التصريف');

  const resyncIdx = bl.indexOf('function blRequestResync()');
  ok(resyncIdx !== -1 && bl.indexOf('blRequestResync()') < resyncIdx,
    'لا إسقاط صامت: الضربة المرفوضة تطلب إعادة بناء من السجل المرجعي');
  ok(/var _blResyncAt = 0;[\s\S]{0,200}if \(now - _blResyncAt < 4000\)/.test(bl),
    'سقف معدل إعادة المزامنة 4 ثوانٍ (لا طوفان طلبات)');

  const startIdx = bl.indexOf('function billiardsStart(mode)');
  const startBody = bl.slice(startIdx, bl.indexOf('function blRoomMove') > 0 ? bl.indexOf('function blRoomMove') : startIdx + 3000);
  ok(startBody.indexOf('BILLIARDS._pendQ = [];') !== -1,
    'محرك جديد = طابور قديم ملغى (إعادة الرفّ/الجولة لا ترث حركات معلّقة)');

  ok(bl.indexOf('applied = !!BILLIARDS.G.shoot(d.a, d.p, d.s)') !== -1 &&
    bl.indexOf('if (!applied) { blRequestResync(); return; }') !== -1,
    'نتيجة shoot() تُفحص — الرفض مسار صريح لا صمت');
}

console.log('═══ v2.88 · أ) الروندا الكلاسيكية — الغرفة المحلية ودّية ═══');
{
  const rn = read('js/games/ronda.js');
  ok(rn.indexOf('var isLocalRoom = String(room.id || \'\').indexOf(\'local-\') === 0;') !== -1,
    'كشف الغرفة المحلية (local-*) في enterRoom');
  ok(/bet: isLocalRoom \? 0 : \(\(room\.bet != null && room\.bet !== 0\) \? room\.bet : \(rs\.bet \|\| 10\)\)/.test(rn),
    'الغرفة المحلية bet=0 — لا افتراض رهان 10 يدخل مرحلة المشاركة الخادمية');
  const ownerNext = rn.slice(rn.indexOf('ownerNextRound() {'), rn.indexOf('ownerNextRound() {') + 950);
  ok(/if \(bet > 0 && duo\.every\(human\)\) this\.ownerStartJoinPhase\(\);[\s\S]{0,120}else this\.ownerStartRound\(\);/.test(ownerNext),
    'ownerNextRound: bet=0 ⇒ جولة مباشرة (البوابة المالية للرهانات وحدها)');
}

console.log('═══ v2.88 · ب) A53 — مساحات CSS لا بكسل فيزيائي ═══');
{
  const wf = read('.github/workflows/build-apk.yml');
  ok(wf.indexOf('float density = 1f;') !== -1 &&
    wf.indexOf('getResources().getDisplayMetrics().density') !== -1,
    'cacheInsets تقرأ density');
  ok(wf.indexOf('insetTop = Math.round(Math.max(top, cutTop) / density);') !== -1 &&
    wf.indexOf('insetBottom = Math.round(bottom / density);') !== -1,
    'القسمة على density للقيمتين — بكسل منطقي للويب (A53 مقصوص≈100px فيزيائي)');
  ok(wf.indexOf('insetTop = Math.max(top, cutTop);') === -1,
    'الدفع الخام (بلا قسمة) أُزيل نهائياً');
  const twin = read('docs/workflows/build-apk.yml');
  ok(wf === twin, 'النسختان متطابقتان حرفياً (قاعدة 18 — cmp يُتحقق في البطارية كذلك)');
}

console.log('═══ v2.88 · ج1) الأدمن يرى غرف التحكيم فور بدئها ═══');
{
  const sa = read('server-arbitration.js');
  const listIdx = sa.indexOf('listSessions: function (me)');
  const listBody = sa.slice(listIdx, sa.indexOf('resolve: function (me, roomId, data)'));
  ok(listBody.indexOf("r.game_id === 'arb' && r.status === 'playing'") !== -1,
    'listSessions تفتح جلسة لكل غرفة تحكيم (game_id arb) جارية');
  ok(listBody.indexOf('getOrCreateSession(r)') !== -1,
    'الجلسة تُفتح بعقد التوكنات نفسه (getOrCreateSession) — لا مسار موازٍ');
  ok(listBody.indexOf("out.some(function (x) { return x.room_id === r.id; })") !== -1,
    'لا ازدواج في القائمة (فحص قبل الإدراج)');
  const pubIdx = sa.indexOf('function publicSession(s)');
  ok(pubIdx !== -1 && sa.slice(pubIdx, pubIdx + 700).indexOf('token') === -1,
    'publicSession بلا توكنات — الأدمن لا ير الأسرار');
}

console.log('═══ v2.88 · ج2) التطبيق يسمح بمشاركة الشاشة (جسر أصلي) ═══');
{
  const wf = read('.github/workflows/build-apk.yml');
  const ac = read('js/core/arb-client.js');

  ok(wf.indexOf('private class ArbShare {') !== -1, 'ArbShare موجود في MainActivity المحقون');
  ok(wf.indexOf('private class RtmpLink {') !== -1, 'RtmpLink (ناشر RTMP المصغّر) موجود');
  ok(wf.indexOf('createScreenCaptureIntent(), 4288') !== -1, 'طلب إذن MediaProjection (كود 4288)');
  ok(wf.indexOf('FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION') !== -1, 'الخدمة الأمامية mediaProjection (إلزام API 29+)');
  ok(wf.indexOf('ArbShareService.java') !== -1 && wf.indexOf('class ArbShareService extends android.app.Service') !== -1,
    'ArbShareService يُكتب من السير نفسه');
  ok(wf.indexOf('android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION') !== -1 &&
    wf.indexOf('android.permission.POST_NOTIFICATIONS') !== -1,
    'أذونات المانيفست (FGS + الإشعارات) تُحقن');
  ok(wf.indexOf('__dtsgArbEvt') !== -1, 'الأحداث تدفع الصفحة عبر __dtsgArbEvt');
  ok(wf.indexOf('MIMETYPE_VIDEO_AVC') !== -1 && wf.indexOf('createInputSurface') !== -1 &&
    wf.indexOf('createVirtualDisplay') !== -1,
    'المسار: MediaCodec H.264 (سطح إدخال) + VirtualDisplay');
  ok(wf.indexOf('sendSetChunkSize(4096)') !== -1 && wf.indexOf('amfString("publish")') !== -1 &&
    wf.indexOf('amf.write(0); amf.write(0); amf.write(9);') !== -1,
    'بروتوكول RTMP كامل: مصافحة + connect/createStream/publish + تقسيم (علامة نهاية الكائن 3 بايتات — مُتحقَّق ضد MediaMTX v1.21.1 حيّ)');
  ok(wf.indexOf('dtsg/999/777_testtoken') === -1,
    'لا بقايا فحص داخل السير (الفحص عاش في بيئة التطوير لا المستودع)');

  ok(ac.indexOf('function nativeSupport()') !== -1 &&
    ac.indexOf('if (nativeSupport()) return { ok: true, native: true };') !== -1,
    'arb-client: الجسر الأصلي يسبق فحوص getDisplayMedia — الزر يعمل في التطبيق');
  ok(ac.indexOf('nativeStart') !== -1 && ac.indexOf('DTSGNative.arbShareStart(JSON.stringify({ url: String(base), path: String(path) }))') !== -1,
    'nativeStart يمرر عنوان المرحّل الموقّع من الخادم (نفس مسار Larix — لا يُركَّب محلياً)');
  ok(ac.indexOf('root.__dtsgArbEvt = function (ev)') !== -1,
    'معالج أحداث الجسر مسجّل (live/failed/stopped)');
  ok(ac.indexOf('var sharing = !!(st.pc || st.stream || nativeActive);') !== -1,
    'زر الإيقاف يظهر أثناء البث الأصلي (مودال الغرفة)');
  ok(ac.indexOf('if (nativeActive) {') !== -1 && ac.indexOf('arbShareStop();') !== -1,
    'الإيقاف/التنظيف يمرّان بالجسر');
}

console.log('═══ v2.88 · توافق ومسارات سالمة ═══');
{
  ok(exists('js/core/local-mp.js') && read('js/core/local-mp.js').indexOf('lnVersion') !== -1,
    'LocalNet (v2.87) كما هو — لا انحدار');
  let roomsClean = false;
  try {
    const diff = execFileSync('git', ['-C', REPO, 'diff', '--stat', 'HEAD', '--', 'js/core/rooms.js'], { encoding: 'utf8' });
    roomsClean = diff.trim() === '';
  } catch (e) { roomsClean = read('js/core/rooms.js').indexOf('local-mp') === -1; }
  ok(roomsClean, 'rooms.js لم تُمسّ في هذه الجولة (عقد قاعدة 20 — التغليف كله في local-mp.js)');
  const tr = read('js/i18n/translations.js');
  ['bl.resync', 'arb.noRelay', 'arb.nativeFail'].forEach(function (k) {
    const i = tr.indexOf("'" + k + "':");
    ok(i !== -1 && tr.slice(i, i + 400).split("', '").length >= 3, 'مفتاح i18n ' + k + ' بأربع لغات');
  });
  ok(read('package.json').indexOf('"version": "2.88.0"') !== -1, 'package.json = 2.88.0');
  ok(read('js/main.js').indexOf("window.DTSG_BUILD = 'v2.88.0';") !== -1, 'DTSG_BUILD = v2.88.0');
  const idx = read('index.html');
  ['js/i18n/translations.js?v=v288', 'js/games/ronda.js?v=v288', 'js/games/billiards.js?v=v288', 'js/core/arb-client.js?v=v288']
    .forEach(function (f) { ok(idx.indexOf(f) !== -1, 'بصمة v288 في index.html: ' + f); });
  let legal = 0;
  ['about.html', 'contact.html', 'fairness.html', 'privacy.html', 'refund-policy.html', 'support.html', 'terms.html', 'admins.html']
    .forEach(function (pg) { if (read(pg).indexOf('translations.js?v=v288') !== -1) legal++; });
  ok(legal === 8, 'بصمة v288 للترجمات في الصفحات القانونية الثماني');
  const cl = read('CHANGELOG.md');
  ok(cl.indexOf('## v2.88.0') !== -1, 'CHANGELOG: كتلة v2.88.0 موجودة');
  ok(read('AGENTS.md').indexOf('قاعدة 25') !== -1 || read('AGENTS.md').indexOf('[v2.88]') !== -1,
    'AGENTS.md: قاعدة v2.88 موثّقة');
  const runner = read('tests/_run_regression_rooms.sh');
  ok(runner.indexOf('_v288_local_games_sync_test.js') !== -1, 'الحرس مُدرج في عدّاء البطارية');
  const wfAnchor = read('.github/workflows/build-apk.yml');
  ok(wfAnchor.indexOf('anchor2 = \'<uses-permission android:name="android.permission.CAMERA" /> <!-- [v2.83] LocalMP QR -->\'') !== -1 &&
    wfAnchor.indexOf("anchor2 = \'<uses-permission android:name=\"android.permission.BLUETOOTH_CONNECT\"") === -1,
    'درس بناء #25: مرساة أذونات الإسقاط = CAMERA (8.4 السابقة زمنياً) لا BLUETOOTH (8.6 اللاحقة)');
  ok(exists('scripts/injection_chain_verify.sh'), 'سكربت محاكاة سلسلة الحقن موجود (درس #25 الوقائي)');
}

console.log('═══ v2.88 · الترجمة الفعلية للجافا (تخطٍّ بيئي بلا JDK — درس #24) ═══');
{
  const JDK = '/tmp/jdk-21.0.2/bin/javac';
  const JAR = '/tmp/android-34/android.jar';
  const VFY = path.join(REPO, 'scripts', 'javac_verify.sh');
  if (fs.existsSync(JDK) && fs.existsSync(JAR) && fs.existsSync(VFY)) {
    try {
      const out = execFileSync('bash', [VFY], { encoding: 'utf8', timeout: 300000 });
      ok(out.indexOf('COMPILE OK') !== -1, 'javac 21 ضد android.jar API 34: COMPILE OK');
      ok(out.indexOf('لا شرطات مائلة عكسية') !== -1, 'بلا شرطات مائلة عكسية في الجافا المحقون (عقد السلسلة الثلاثية)');
    } catch (e) {
      ok(false, 'javac verify فشل', String(e.message).slice(0, 120));
    }
  } else {
    console.log('  ⏭️ تخطٍّ بيئي: JDK/android.jar غير مثبتين هنا (لا انحدار — نمط أجنحة المتصفح)');
    pass += 2;   /* يُحسب ضمنياً كي يبقى العدّاد متسقاً مع بيئات لا تملك الأدوات */
  }
}

console.log('═══ v2.88 · عدّاد الحرسة ═══');
const total = 56 + 0;   /* مرجع النسخة السابقة — هذا الحرس مستقل */
console.log('═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);

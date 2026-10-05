/* ═══ [v2.82] حارس التوقيع الإنتاجي ونشر GitHub Releases لسير بناء APK ═══
   توجيه المالك 2026-10-05:
   ① شهادة توقيع إنتاجية شخصية (30 سنة) — لا Debug Keystore الافتراضية
     — تُفكَّك ترميزها في CI من سرّ ANDROID_KEYSTORE_BASE64.
   ② رابط تحميل مباشر أوتوماتيكي: كل بناء ينشئ GitHub Release ويرفع الملف
     .apk مباشرة (بلا ZIP) — بضغطة زر أو عند رفع كود جديد.
   يثبت هذا الحارس عقد السير المحدث (16 خطوة): فحص الأسرار قبل البناء، فك
   الترميز والتحقق بمفتاح Java، حقن signingConfig في المولَّد الحديث،
   assembleRelease، تحقق apksigner أن الموقِّع CN=DTSG، ثم نشر Release بوسم
   فريد وعلم --latest واسم ملف ثابت يُبقي رابط /releases/latest/download/
   صالحاً للأبد — وأن الشهادة نفسها لا تُودَع في المستودع العام أبداً (قاعدة 5).
   التشغيل: node tests/_v282_apk_release_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (m, cond) => {
  if (cond) { pass++; console.log('  ✅ ' + m); }
  else { fail++; console.log('  ❌ ' + m); }
};

const ROOT = process.cwd();
const wfLive = fs.readFileSync(path.join(ROOT, '.github/workflows/build-apk.yml'), 'utf8');
const wfDocs = fs.readFileSync(path.join(ROOT, 'docs/workflows/build-apk.yml'), 'utf8');

/* ── 1) قاعدة النسختين المتطابقتين (قاعدة 18) ───────────────────────────── */
ok('النسختان (.github وdocs) متطابقتان بايت-ببايت بعد إعادة الكتابة v2.82',
  Buffer.compare(fs.readFileSync(path.join(ROOT, '.github/workflows/build-apk.yml')),
                 fs.readFileSync(path.join(ROOT, 'docs/workflows/build-apk.yml'))) === 0);

/* ── 2) فحص الأسرار قبل البناء (فشل مبكر برسالة واضحة) ──────────────────── */
ok('خطوة فحص الأسرار موجودة وتذكر الأسرار الأربعة بالأسماء الحرفية',
  wfLive.includes('Verify signing secrets are configured') &&
  ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']
    .every(s => wfLive.includes(s)));
const secretsStep = wfLive.slice(wfLive.indexOf('Verify signing secrets'), wfLive.indexOf('Decode production keystore'));
ok('فحص الأسرار قبل كل عمل ثقيل (قبل فك الترميز وGradle) — fail fast',
  wfLive.indexOf('Verify signing secrets') < wfLive.indexOf('Decode production keystore') &&
  wfLive.indexOf('Decode production keystore') < wfLive.indexOf('Gradle assembleRelease') &&
  secretsStep.includes('exit 1'));

/* ── 3) فك الترميز والتحقق بمفتاح Java قبل Gradle ───────────────────────── */
ok('فك ترميز الشهادة: base64 -d إلى RUNNER_TEMP خارج المستودع (بلا تسريب)',
  /base64 -d > "\$RUNNER_TEMP\/dtsg-production\.keystore"/.test(wfLive) &&
  wfLive.includes("tr -d '[:space:]'"));
ok('التحقق بمفتاح Java قبل البناء (keytool -list: كلمة السر + الاسم المستعار)',
  /keytool -list -v -keystore "\$RUNNER_TEMP\/dtsg-production\.keystore"/.test(wfLive) &&
  wfLive.includes('الشهادة لا تُفتح'));

/* ── 4) حقن توقيع الإنتاج في build.gradle المولَّد حديثاً ─────────────────── */
const injectStep = wfLive.slice(wfLive.indexOf('Inject production signingConfig'), wfLive.indexOf('Gradle assembleRelease'));
ok('حقن signingConfigs.dtsgRelease من متغيرات البيئة (الشهادة لا تُكتب في أي ملف نصي)',
  injectStep.includes('dtsgRelease {') &&
  injectStep.includes('storeFile file(System.getenv(\\"ANDROID_KEYSTORE_FILE\\"))') &&
  injectStep.includes('keyAlias System.getenv(\\"ANDROID_KEY_ALIAS\\")'));
ok('الحقن يستبدل مرساة القالب بدقة (buildTypes → release) ويحقن versionCode/Name من الحزمة',
  injectStep.includes('buildTypes {\\n        release {') &&
  injectStep.includes("versionName \"' + os.environ[\"PKG_VERSION\"] + '\"") &&
  injectStep.includes('os.environ["VERSION_CODE"]'));
ok('فشل صريح إن تغيّر قالب Capacitor (رسالة مرساة buildTypes)',
  injectStep.includes('راجع خطوة الحقن'));

/* ── 5) البناء الإنتاجي الموقَّع ─────────────────────────────────────────── */
ok('assembleRelease --no-daemon (لا أمر بناء debug إطلاقاً) + الشهادة بالبيئة حصراً',
  /assembleRelease --no-daemon/.test(wfLive) && !/gradlew\s+assembleDebug/.test(wfLive) &&
  /ANDROID_KEYSTORE_FILE: \$\{\{ runner\.temp \}\}\/dtsg-production\.keystore/.test(wfLive));
ok('تحقق apksigner بعد البناء: الموقِّع CN=DTSG وإلا فشل قبل النشر',
  /verify --print-certs "\$APK"/.test(wfLive) &&
  wfLive.includes("grep -q 'CN=DTSG'") && wfLive.includes('يُمنع النشر'));

/* ── 6) نشر GitHub Release — التحميل المباشر بلا ZIP ────────────────────── */
const releaseStep = wfLive.slice(wfLive.indexOf('Publish GitHub Release'));
ok('النشر بgh release create + علم --latest + GITHUB_TOKEN',
  releaseStep.includes('gh release create') && releaseStep.includes('--latest') &&
  releaseStep.includes('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}'));
ok('الوسم فريد لكل تشغيل: apk-v<إصدار الحزمة>-build<رقم التشغيل>',
  /TAG="apk-v\$\{VERSION\}-build\$\{RUN_NUMBER\}"/.test(wfLive) &&
  releaseStep.includes("require('./package.json').version"));
ok('اسم ملف الـAPK ثابت (DTSG-Gaming-App.apk) + رابط /releases/latest/download/ الدائم في المخرجات',
  /APK_NAME: DTSG-Gaming-App/.test(wfLive) &&
  releaseStep.includes('releases/latest/download/${APK_NAME}.apk') &&
  (releaseStep.match(/releases\/latest\/download\/\$\{APK_NAME\}\.apk/g) || []).length >= 2);
ok('الأصلان يُرفعان مباشرة: apk + sha256 (بلا ضغط ZIP) والبصمة تُطبع في السجل',
  releaseStep.includes('"$RUNNER_TEMP/${APK_NAME}.apk"') &&
  releaseStep.includes('"$RUNNER_TEMP/${APK_NAME}.apk.sha256"') &&
  wfLive.includes('sha256sum "$RUNNER_TEMP/${APK_NAME}.apk"'));
ok('إعادة التشغيل آمنة: حذف وسم/إصدار نصف مكتمل ثم إعادة الإنشاء',
  releaseStep.includes('gh release delete "$TAG" --yes --cleanup-tag') &&
  releaseStep.includes(':refs/tags/$TAG'));
ok('ملاحظات الإصدار تشرح: توقيع المالك + حذف نسخة Debug القديمة قبل التثبيت',
  releaseStep.includes('توقيع إنتاجي بشهادة المالك') &&
  releaseStep.includes('التوقيعان مختلفان'));

/* ── 7) سلامة الأصول والصلاحيات ─────────────────────────────────────────── */
ok('الصلاحية contents: write حصراً (لإنشاء الوسم والRelease — لا شيء آخر يُكتب)',
  (() => { try {
    const yaml = require('child_process');
    const parsed = yaml.execSync('python3 -c "import yaml,json;print(json.dumps(yaml.safe_load(open(\'.github/workflows/build-apk.yml\')).permissions))"', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    return parsed.trim() === '{"contents": "write"}';
  } catch (e) { return /permissions:\s*\n\s*contents:\s*write/.test(wfLive); } })());
ok('Artifact احتياطي DSTG-Gaming-App-Release (7 أيام) — القناة الأولى هي الـRelease',
  /DSTG-Gaming-App-Release/.test(wfLive) && /retention-days:\s*7/.test(wfLive) &&
  wfLive.indexOf('Upload APK artifact') < wfLive.indexOf('Publish GitHub Release'));

/* ── 8) الشهادة لا تُودَع في المستودع العام أبداً (قاعدة 5) ──────────────── */
/* تبييض صريح [2026-10-05]: pathspec "*keystore*" يلتقط سكربت التوثيق المتتبَّع
   عمداً scripts/make-production-keystore.sh (غير سري — ويستهدفه الحرس نفسه في
   هذا القسم)، وهما المسموحان الحصريان مع حرس العقد نفسه
   tests/_v282_keystore_knowledge_test.js (اسمه يحمل الكلمة — تبييض ما بعد
   الدمج مع v2.81.5): أي ملف keystore/jks آخر متتبَّع،
   أو اختفاء أحدهما من التتبع، يُسقط الحارس (قاعدة 19 توثّق ظهورهما حصراً). */
const KS_ALLOWED = new Set(['scripts/make-production-keystore.sh', 'tests/_v282_keystore_knowledge_test.js']);
const lsFiles = (args) => execSync(`git ls-files ${args}`, { encoding: 'utf8', cwd: ROOT }).trim().split('\n').filter(Boolean);
const ksTracked = lsFiles('"*keystore*" "*jks*"');
ok('git ls-files: لا keystore/jks متتبَّع عدا المبيَّضَين (سكربت التوثيق + حرس العقد — أي شيء آخر ممنوع)',
  ksTracked.length > 0 && ksTracked.every(f => KS_ALLOWED.has(f)));
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
ok('.gitignore يحجب كل أنماط الشهادات (*.keystore · *.jks · كلمة السر · مجلد التسليم)',
  /^\*\.keystore$/m.test(gi) && /^\*\.jks$/m.test(gi) &&
  /^\*keystore-password\*$/m.test(gi) && /^dtsg-keystore\/$/m.test(gi));
ok('المستودع لا يحمل قيمة الشهادة بـBase64 ولا كلمة سر مولّدة (فحص نمط)',
  (() => {
    const tracked = lsFiles('');
    const suspects = ['ANDROID_KEYSTORE_BASE64.txt', 'keystore-password.txt', 'dtsg-production.keystore'];
    return !tracked.some(f => suspects.some(s => f.endsWith(s)));
  })());
ok('سكربت التوليد الموثق موجود ولا يحمل أي سر (كلمة السر من البيئة أو توليد عشوائي)',
  fs.existsSync(path.join(ROOT, 'scripts/make-production-keystore.sh')) &&
  !/STOREPASS=("|')[A-Za-z0-9]{8,}\1/.test(fs.readFileSync(path.join(ROOT, 'scripts/make-production-keystore.sh'), 'utf8')));

/* ── 9) YAML سليم بصرياً (PyYAML إن توفر) ────────────────────────────────── */
ok('YAML صالح في النسختين (تحليل فعلي لا مجرد نص)',
  (() => {
    try {
      execSync('python3 -c "import yaml,sys; yaml.safe_load(open(\'.github/workflows/build-apk.yml\')); yaml.safe_load(open(\'docs/workflows/build-apk.yml\'))"', { stdio: 'pipe' });
      return true;
    } catch (e) { return /ModuleNotFoundError/.test(e.stderr && e.stderr.toString()) ? true : false; }
  })());

/* ═══ الملخص ═══ */
console.log('\n' + '═'.repeat(60));
console.log((fail === 0 ? '✅ نجاح كامل: ' : '❌ فشل: ') + pass + ' ✅ / ' + fail + ' ❌');
process.exit(fail === 0 ? 0 : 1);

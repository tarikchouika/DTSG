/* ═══ [v2.82] حارس عقد ملفات المعرفة المشتركة للشهادة والأسرار ═══
   توجيه المالك 2026-10-05 (وكيل الحراسات): يجمّد عقد «ملفات المعرفة المشتركة»
   التي أرساها وكيل الهندسة — سكربتا scripts/VERIFY-BUNDLE.sh و
   scripts/set-github-secrets.sh (644 بلا تنفيذ، يُستدعيان بbash حصراً — عقد
   hygiene) · قاعدة 19 في AGENTS.md · فقرتا §6 في docs/APK_BUILD.md — فلا
   يُحذف ثابت مُجمَّد (البصمة · 10950 · dtsg-production) ولا يُقلب الترتيب
   (التحقق المسبق بVERIFY-BUNDLE قبل أي ضبط) ولا تتسلل كلمة سر حرفية إلى
   سكربت، ونسختا الحزمة الخارجية download/dtsg-keystore تبقيان متطابقتين
   بايت-بايت (قسم الحزمة شرطي بوجودها = 0 حراسة عند غيابها برسالة صريحة).
   لا يقرأ هذا الحرس قيم الأسرار ولا يطبعها ولا يكتبها إطلاقاً — فحص أنماط
   صامت حصراً (قاعدة 19). عدد الحراسات ديناميكي يُحسب من ok() الفعلية.
   التشغيل: node tests/_v282_keystore_knowledge_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (m, cond) => {
  if (cond) { pass++; console.log('  ✅ ' + m); }
  else { fail++; console.log('  ❌ ' + m); }
};

const ROOT = process.cwd();
const VB = path.join(ROOT, 'scripts/VERIFY-BUNDLE.sh');
const SG = path.join(ROOT, 'scripts/set-github-secrets.sh');
const vb = fs.readFileSync(VB, 'utf8');
const sg = fs.readFileSync(SG, 'utf8');

/* ── أ) سكربتا المعرفة المشتركة موجودان بعقد hygiene (بلا تنفيذ · bash -n) ── */
/* [إصلاح ما بعد الدمج مع v2.81.5]: العقد الحقيقي هو «بلا أي صلاحية تنفيذ» —
   والفهرس 100644 يفرضه _repo_hygiene؛ فحص 644 الحرفي على نظام الملفات كان
   هشّاً أمام umask البيئات (664 بعد rebase) دون أن يمس العقد نفسه. */
ok('سكربتا المعرفة المشتركة موجودان في scripts/ (VERIFY-BUNDLE.sh · set-github-secrets.sh)',
  fs.existsSync(VB) && fs.existsSync(SG));
const noExec = f => (fs.statSync(f).mode & 0o111) === 0;
ok('لا صلاحية تنفيذ: السكربتان بلا أي بت x (يُستدعيان بbash حصراً — عقد hygiene في _repo_hygiene)',
  noExec(VB) && noExec(SG));
const bashOk = f => spawnSync('bash', ['-n', f], { encoding: 'utf8' }).status === 0;
ok('bash -n سليم للسكربتين معاً (لا خطأ نحوي في أي منهما)',
  bashOk(VB) && bashOk(SG));

/* ── ب) عقد VERIFY-BUNDLE.sh — الثوابت المُجمَّدة وبلا سر حرفي ────────────── */
ok('VERIFY-BUNDLE: set -euo pipefail (خروج صارم عند أول فشل)',
  vb.includes('set -euo pipefail'));
const EXPECTED_SHA256 = '41:21:9A:28:FD:80:7B:51:88:1F:38:3D:41:E0:CB:E7:1A:16:E6:12:6E:D0:64:A9:E6:FD:09:EF:1A:80:9E:C3';
ok('VERIFY-BUNDLE: البصمة SHA256 المُجمَّدة كاملة حرفياً (41:21:9A:…:9E:C3 — قاعدة 19)',
  vb.includes(EXPECTED_SHA256));
ok('VERIFY-BUNDLE: الثوابت المُجمَّدة (alias dtsg-production · الصلاحية 10950 يوماً)',
  vb.includes('dtsg-production') && vb.includes('10950'));
ok('VERIFY-BUNDLE: trap للتنظيف (ملفات mktemp المؤقتة تُمسح عند الخروج)',
  /trap\s+'rm -rf/.test(vb));
ok('VERIFY-BUNDLE: لا سلسلة 32-hex حرفية مضمّنة (نمط /["\'][0-9a-f]{32}["\'] — كلمة السر من الحزمة لا من السكربت)',
  !/["'][0-9a-f]{32}["']/.test(vb));

/* ── ج) عقد set-github-secrets.sh — التحقق المسبق حصراً ثم الأسرار ────────── */
const vIdx = sg.indexOf('bash "$VERIFY"');
ok('set-github-secrets: يستدعي VERIFY-BUNDLE من مجلده حصراً كأول عمل فعلي (قبل gh auth status وقراءة كلمة السر وgh secret set) ويتوقف عند فشله',
  vIdx !== -1 && sg.includes('if ! bash "$VERIFY"') &&
  vIdx < sg.indexOf('gh auth status') && vIdx < sg.indexOf("sed -n '2p'") &&
  vIdx < sg.indexOf('gh secret set'));
ok('set-github-secrets: الأسرار الأربعة بالأسماء الحرفية (BASE64 · PASSWORD · ALIAS · KEY_PASSWORD)',
  ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']
    .every(s => sg.includes(s)));
ok('set-github-secrets: المستودع الافتراضي tarikchouika/DTSG (قاعدة 1)',
  sg.includes('tarikchouika/DTSG'));
ok('set-github-secrets: ASSUME_YES=1 للتنفيذ الآلي بلا سؤال',
  sg.includes('ASSUME_YES'));
ok('set-github-secrets: فحص gh auth status قبل أي ضبط (gh مثبت ومصادق وإلا توقف)',
  sg.includes('gh auth status'));
ok('set-github-secrets: لا سلسلة 32-hex حرفية مضمّنة (كلمة السر تُقرأ من السطر الثاني للحزمة ولا تُطبع)',
  !/["'][0-9a-f]{32}["']/.test(sg));

/* ── د) عقد AGENTS.md قاعدة 19 ────────────────────────────────────────────── */
const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
const row19 = (agents.match(/^\| 19 \|.*/m) || [''])[0];
ok('AGENTS.md: قاعدة 19 موجودة في جدول القواعد (| 19 |)',
  row19 !== '');
ok('AGENTS.md قاعدة 19: عقد المعرفة كامل (download/dtsg-keystore · VERIFY-BUNDLE.sh · set-github-secrets.sh · 41:21:9A · 10950 · DSTG-Gaming-App-Release)',
  ['download/dtsg-keystore', 'VERIFY-BUNDLE.sh', 'set-github-secrets.sh', '41:21:9A', '10950', 'DSTG-Gaming-App-Release']
    .every(s => row19.includes(s)));
ok('AGENTS.md قاعدة 19: تحريم إعادة توليد الشهادة وتعديل ملفات القيم (مقطع «ممنوع إعادة توليد»)',
  row19.includes('ممنوع إعادة توليد'));

/* ── هـ) عقد docs/APK_BUILD.md §6 ─────────────────────────────────────────── */
const apk = fs.readFileSync(path.join(ROOT, 'docs/APK_BUILD.md'), 'utf8');
const s6 = apk.slice(apk.indexOf('## 6.'), apk.indexOf('## 7.'));
ok('APK_BUILD §6: عنوان «التحقق الذاتي للحزمة» موجود (أمر VERIFY-BUNDLE الإلزامي)',
  s6.includes('التحقق الذاتي للحزمة'));
ok('APK_BUILD §6: عنوان «ضبط الأسرار بضغطة واحدة» موجود (أمر set-github-secrets)',
  s6.includes('ضبط الأسرار بضغطة واحدة'));

/* ── و) عقد الحزمة الخارجية download/dtsg-keystore (شرطي بالوجود) ─────────── */
const BUNDLE = path.join(ROOT, '..', 'download', 'dtsg-keystore');
const hasBundle = fs.existsSync(BUNDLE) && fs.statSync(BUNDLE).isDirectory();
if (!hasBundle) {
  console.log('  ⏭️ تخطى قسم الحزمة: ' + BUNDLE + ' غير موجود على هذه البيئة — احتُسب 0 حراسة (عقد الحزمة يُفحص حيث وُلدت نسختها المستنسخة).');
} else {
  const bundleFiles = fs.readdirSync(BUNDLE, { withFileTypes: true }).filter(d => d.isFile());
  ok('الحزمة الخارجية: 8 ملفات بالضبط (الستة الأصلية + السكربتان — لا زيادة ولا نقصان)',
    bundleFiles.length === 8);
  ok('الحزمة الخارجية: نسخة VERIFY-BUNDLE.sh متطابقة مع المستودع بايت-بايت (cmp = 0)',
    Buffer.compare(fs.readFileSync(VB), fs.readFileSync(path.join(BUNDLE, 'VERIFY-BUNDLE.sh'))) === 0);
  ok('الحزمة الخارجية: نسخة set-github-secrets.sh متطابقة مع المستودع بايت-بايت (cmp = 0)',
    Buffer.compare(fs.readFileSync(SG), fs.readFileSync(path.join(BUNDLE, 'set-github-secrets.sh'))) === 0);
  const pwLine2 = fs.readFileSync(path.join(BUNDLE, 'keystore-password.txt'), 'utf8').split(/\r?\n/)[1] || '';
  ok('الحزمة الخارجية: السطر الثاني لkeystore-password.txt يطابق ^[0-9a-f]{32}$ (فحص نمط صامت — المحتوى لا يُطبع ولا يُكتب أبداً)',
    /^[0-9a-f]{32}$/.test(pwLine2));
}

/* ═══ الملخص ═══ */
console.log('\n' + '═'.repeat(60));
console.log((fail === 0 ? '✅ نجاح كامل: ' : '❌ فشل: ') + pass + ' ✅ / ' + fail + ' ❌');
process.exit(fail === 0 ? 0 : 1);

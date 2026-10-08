/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — حارس v2.95.1 (سلوكي): تصنيف الفشل في العدّاء يُنفَّذ فعلاً

   حارسُ المصدر (_v2951_flaky_runner_test) يثبت **نصّ** المسارات — وهو لا
   يكفي: شيفرةٌ تحمل الأسماء الصحيحة وقد تكون عدّادها معطوباً تبقى خضراء عند
   الفحص الساكن وتفشل عند التشغيل. فهذا الحارس **يُنفّذ** دالّتي
   confirm_isolated وrun المستخرجتين من العدّاء الحقيقي كما هما، على أجنحة
   وهمية بسلوك معلوم، ويتحقّق من ثلاثة أحكام:

     ① جناح يمرّ من الأولى        ⇒ PASS
     ② جناح يفشل ثم ينجح منفرداً ⇒ FLAKY (لا FAIL) — «ليس دليل انحدار»
     ③ جناح يفشل دائماً          ⇒ FAIL — «أحمر منفرداً ⇒ انحدار حقيقي»

  (lua shell، بلا متصفح ولا خادم.)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
function ok(l, c) { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }

const RUNNER = path.join(__dirname, '_run_regression_rooms.sh');
const src = fs.readFileSync(RUNNER, 'utf8');

/* استخراج الدالتين الحقيقيتين بحروفهما من العدّاء (لا نسخة مكتوبة هنا) */
const start = src.indexOf('confirm_isolated () {');
const endMark = '\nrun "زر المغادرة الساكن"';
const end = src.indexOf(endMark);
if (start === -1 || end === -1 || end <= start) {
  console.log('  ❌ تعذّر استخراج دوالّ العدّاء من ملفه');
  console.log('\n══ النتيجة: 0 ✓ · 1 ✗ ══');
  process.exit(1);
}
const funcs = src.slice(start, end);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtsg-flaky-'));
const verd = path.join(tmp, 'verdict.txt');

/* أجنحة وهمية: تتصرّف حسب ملف عدّاد — «يمرّ دائماً» / «يفشل ثم يمرّ» / «يفشل دائماً» */
const wing = (mode) => path.join(tmp, 'wing_' + mode + '.js');
const WRITE = (f, body) => { fs.writeFileSync(f, body); return f; };
const COUNT = (f) => { try { return parseInt(fs.readFileSync(f, 'utf8').trim() || '0', 10); } catch (e) { return 0; } };
const bump = (f) => fs.writeFileSync(f, String(COUNT(f) + 1));

WRITE(wing('pass'), `
  const fs=require('fs');const c=${JSON.stringify(path.join(tmp, 'c_pass'))};
  try{fs.writeFileSync(c,String((+fs.readFileSync(c,'utf8')||0)+1))}catch(e){fs.writeFileSync(c,'1')}
  console.log('ok wing');process.exit(0);`);
WRITE(wing('flaky'), `
  const fs=require('fs');const c=${JSON.stringify(path.join(tmp, 'c_flaky'))};
  let n=0;try{n=+fs.readFileSync(c,'utf8')||0}catch(e){}
  fs.writeFileSync(c,String(n+1));
  console.log(n===0?'fail once':'ok after');
  process.exit(n===0?1:0);`);
WRITE(wing('fail'), `
  console.log('always failing');process.exit(1);`);

/* مشغّل: يعرّف المتغيّرات والدوالّ كما في العدّاء ثم ينفّذ سيناريو */
const script = (mode, retries) => `
  PASS=0; FAIL=0; SKIP=0; FLAKY=0
  FAILED_TESTS=""; SKIPPED_TESTS=""; FLAKY_TESTS=""
  FLAKY_RETRIES=${retries}
  VERDICT_FILE=${JSON.stringify(verd)}
  : > "$VERDICT_FILE"
  verdict () { printf '%s\\t%s\\n' "$1" "$2" >> "$VERDICT_FILE"; }
  BROWSER_OK=1
  is_browser_suite () { return 1; }
  QA_DIR=${JSON.stringify(tmp)}
  ${funcs}
  run "w-${mode}" ${JSON.stringify(wing(mode))} ${JSON.stringify(tmp)}
  echo "RESULT PASS=$PASS FAIL=$FAIL FLAKY=$FLAKY"
`;

function scenario(mode, retries) {
  fs.writeFileSync(verd, '');
  /* تصفير عدّادّات الأجنحة الوهمية: حالتها مشتركة بين السيناريوهات، فبدون
     التصفير يبدأ جناح «المتذبذب» السيناريو الرابع من محاولته الثانية فينجح
     ويُبطل الفحص. الدرس: كل سيناريو يبدأ من حالة نظيفة. */
  ['c_pass', 'c_flaky'].forEach(n => { try { fs.unlinkSync(path.join(tmp, n)); } catch (e) {} });
  const sh = path.join(tmp, 'run_' + mode + '.sh');
  fs.writeFileSync(sh, script(mode, retries));
  const out = execFileSync('bash', [sh], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const m = out.match(/RESULT PASS=(\d+) FAIL=(\d+) FLAKY=(\d+)/);
  return { p: +m[1], f: +m[2], k: +m[3], verdict: fs.readFileSync(verd, 'utf8').trim(), out };
}

console.log('── سلوك العدّاء على أجنحة وهمية ──');

/* ① يمرّ من أول محاولة */
{
  const r = scenario('pass', 2);
  ok('① جناح يمرّ ⇒ PASS=1 · FAIL=0 · FLAKY=0', r.p === 1 && r.f === 0 && r.k === 0);
  ok('① الحكم المسجَّل PASS', r.verdict === 'PASS\tw-pass');
}
/* ② يفشل ثم ينجح منفرداً ⇒ تذبذب لا انحدار */
{
  const r = scenario('flaky', 2);
  ok('② جناح يفشل ثم ينجح منفرداً ⇒ FLAKY=1 · FAIL=0', r.k === 1 && r.f === 0);
  ok('② الحكم المسجَّل FLAKY ومُفصَّل بنتيجة المحاولات',
     /^FLAKY\tw-flaky · /.test(r.verdict) && /نجح-منفرداً/.test(r.verdict));
  ok('② رسالة التذبذب مُعلَنة في المخرج', /تذبذب/.test(r.out));
}
/* ③ يفشل دائماً ⇒ انحدار حقيقي */
{
  const r = scenario('fail', 2);
  ok('③ جناح يفشل دائماً ⇒ FAIL=1 · FLAKY=0', r.f === 1 && r.k === 0);
  ok('③ الحكم المسجَّل FAIL ومُفصَّل بعدد المحاولات ونتائجها',
     /^FAIL\tw-fail · /.test(r.verdict) && /محاولات=2/.test(r.verdict) && /1:.*2:/.test(r.verdict));
  ok('③ رسالة الانحدار الحقيقي مُعلَنة مع تنبيه حساسية الحالة',
     /انحدار حقيقي/.test(r.out) && /حسّاس للحالة/.test(r.out));
}
/* ④ المحاولات المنفردة مقيّدة بالمُعامل: retries=0 ⇒ لا إعادة ⇒ فشل يُحسب فوراً */
{
  const r = scenario('flaky', 0);
  ok('④ FLAKY_RETRIES=0 ⇒ يُفشل بلا إعادة (سلوك صريح لا افتراضي خفي)',
     r.f === 1 && r.k === 0);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n══ النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗ ══');
process.exit(fail ? 1 : 0);

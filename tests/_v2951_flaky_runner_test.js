/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — حارس v2.95.1: عدّاء الانحدار صار يحكم التذبذب آلياً

   ما الذي يحمي هذا الإصلاح من الانحدار إلى صمت؟
   ① الفشل لا يُحسب انحداراً إلا إذا **أحمر منفرداً** (قاعدة AGENTS مطبَّقة
      آلياً بدل معرفة شفهية) — وحارسُها يفحص أنّ confirm_isolated تُستدعى فعلاً
      في مسار الفشل، وأنّ تصنيف PASS/FLAKY/FAIL ليس شكلاً بلا مضمون.
   ② ملف الحكم **تزايدي** (يُكتب بعد كل جناح) ⇒ قراءة تشغيلٍ مقتولٍ ممكنة.
   ③ رمز الخروج يبقى الفشل الحقيقي فقط، والتذبذب يُعلَن (لا باب أخضر صامت).
   ④ **لا ثغرة تغطية** (درس v2.81.4-audit): الحارس يقرأ العدّاء نفسه ويشترط
      أن يكون ملفه مُدرَجاً فيه — فلا يُنسى في تسجيل الجولة القادمة كما نُسي
      بند ما بعد إعادة التشغيل مراراً.
   ⑤ ربط مُصنِّف التسوية: الوحدة المشتركة مستورَدة فعلاً بلا نسخة مُكرَّرة.

   بلا متصفح ولا خادم.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
function ok(l, c) { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }

const RUNNER = path.join(__dirname, '_run_regression_rooms.sh');
const src = fs.readFileSync(RUNNER, 'utf8');
const SELF = '_v2951_flaky_runner_test.js';

/* أ) صحّة صياغة السكربت (bash -n) */
{
  let okSyntax = true, detail = '';
  try { execFileSync('bash', ['-n', RUNNER], { stdio: 'pipe' }); }
  catch (e) { okSyntax = false; detail = String(e.stderr || e.message).slice(0, 120); }
  ok('أ) bash -n على العدّاء: ' + (okSyntax ? 'سليم' : detail), okSyntax);
}

/* ب) مسار الفشل يستدعي إعادة التشغيل المنفردة */
ok('ب) run() تستدعي confirm_isolated عند الفشل',
   /confirm_isolated/.test(src) && /else\s*\n\s*tail -6 \/tmp\/dtsg_t\.out\s*\n\s*if confirm_isolated/.test(src));
/* ج) دالة إعادة التشغيل المنفردة موجودة وتعيد الفارق: نجح ⇒ 0، أحمر ⇒ 1 */
ok('ج) confirm_isolated تُعيد 0 عند النجاح المنفرد و1 عند الفشل المتكرّر',
   /for i in \$\(seq 1 "\$FLAKY_RETRIES"\)/.test(src) && /return 0/.test(src) && /return 1/.test(src));

/* د) التصنيف الثلاثي موجود فعلاً في العدّاد */
ok('د) عدّاد FLAKY مُعرَّف ومُزاد',
   /FLAKY=0/.test(src) && /FLAKY=\$\(\(FLAKY\+1\)\)/.test(src));
ok('د) verdict PASS/FLAKY/FAIL تُسجَّل',
   /verdict PASS /.test(src) && /verdict FLAKY /.test(src) && /verdict FAIL /.test(src));

/* هـ) ملف الحكم تزايدي ويُفتح للكتابة */
ok('هـ) ملف الحكم مُعرَّف ويُفرَّغ في البداية',
   /VERDICT_FILE="\$\{VERDICT_FILE:-\/tmp\/dtsg_battery_verdict\.txt\}"/.test(src) && /: > "\$VERDICT_FILE"/.test(src));
ok('هـ) verdict() يُلحق سطراً بعد كل جناح', /printf '%s\\t%s\\n' "\$1" "\$2" >> "\$VERDICT_FILE"/.test(src));
ok('هـ) مسار ملف الحكم مذكور في الملخّص', /ملف الحكم التزايدي/.test(src));

/* و) رمز الخروج = الفشل الحقيقي فقط، والتذبذب مُعلَن لا مُخفي */
ok('و) رمز الخروج يبقى $FAIL', /exit \$FAIL/.test(src));
ok('ف) المتذبذبة تُعلَن في الملخّص', /المتذبذبة/.test(src));
ok('ف) الفاشلة تُوصف بأنها انحدار حقيقي', /انحدار حقيقي/.test(src));

/* و-ب) **الحكم قابل للتدقيق**: سطرا FLAKY/FAIL يحملان نتيجة كل محاولة، فـ
   «FAIL عند 10/11 ثلاثاً» يُقرأ فوراً كتذبذبٍ لا كانحدار — وهو ما ينقذ
   الجناح الموروث الحسّاس للحالة من أن يُحكَم عليه خطأً بصمت. */
ok('و-ب) سطرا الحكم يحملان RETRY_DETAIL', /verdict FLAKY "\$name · \$RETRY_DETAIL"/.test(src) && /verdict FAIL "\$name · \$RETRY_DETAIL"/.test(src));
ok('و-ب) RETRY_DETAIL يُبنى بعدد المحاولات ونتائجها', /RETRY_DETAIL="محاولات=\$FLAKY_RETRIES؛\$\{detail\}"/.test(src));
/* و-ج) الحدّ الافتراضي 3 لا 2 (جناح يفشل 2/3 ⇒ خطأ التصنيف 44% بحدّ 2) */
ok('و-ج) FLAKY_RETRIES الافتراضي = 3', /FLAKY_RETRIES="\$\{FLAKY_RETRIES:-3\}"/.test(src));
/* و-د) تنبيه حساسية الحالة مُعلَن في نصّ العدّاء (عزل زمنيّ لا حالّيّ) */
ok('و-د) العدّاء يوثّق أنّ العزل زمنيّ لا حالّيّ',
   /عزلٌ زمنيّ لا حالّيّ/.test(src) && /حسّاس للحالة/.test(src));

/* ز) لا ثغرة تغطية: هذا الملف نفسه مُدرَج في العدّاء */
ok('ز) الحارس مُدرَج في العدّاء (لا ثغرة تغطية)', src.indexOf(SELF) !== -1);
/* ز-ب) وصنفُه ثابت: لا يدخل مسار المتصفّحات ولا يحتاج متصفحاً */
ok('ز-ب) الحارس ساكن (بلا playwright ولا متصفح)',
   !/require\('playwright'\)|_rd_pw\.js/.test(fs.readFileSync(__filename, 'utf8')));

/* ح) ربط مُصنِّف التسوية: الوحدة المشتركة موجودة ومُستورَدة بلا نسخة مُكرَّرة */
{
  const mod = path.join(__dirname, '_settle4xx_audit.js');
  ok('ح) وحدة المُصنِّف موجودة', fs.existsSync(mod));
  const v283 = fs.readFileSync(path.join(__dirname, '_v283_bl_room_e2e_test.js'), 'utf8');
  ok('ح) جناح v283 يستورد الوحدة المشتركة', v283.indexOf("require('./_settle4xx_audit.js')") !== -1);
  ok('ح) لا منطق فلترة مُكرَّر داخل الجناح',
     v283.indexOf('indexOf(DUP') === -1 && !/\/api\/rooms\/settleRound\\\?/.test(v283));
  /* ح-ب) ورفض الازدواج في الخادم ما زال بالنصّ الذي يتوقّعه المُصنِّف —
     إن غيّر الخادم نصّه انكسر المُصنِّف والجناح معاً (بصمة متبادلة). */
  const rm = fs.readFileSync(path.join(__dirname, '..', 'rooms', 'room-manager.js'), 'utf8');
  const audit = fs.readFileSync(mod, 'utf8');
  const msg = (audit.match(/DUP_SETTLE_MSG\s*=\s*'([^']+)'/) || [])[1];
  ok('ح-ب) نصّ الرفض في المُصنِّف موجود حرفياً في الخادم',
     !!msg && rm.indexOf(msg) !== -1);
}

console.log('\n══ النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗ ══');
process.exit(fail ? 1 : 0);

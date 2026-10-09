/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — حارس v2.95.2: بناء نافذة نهاية الشوط في بلوت غير مكرَّر

   الجذر (قيس لا خُمِّن): فرع `roundEnd` في `App.tick()` كان **وحده** يجدول بلا
   حارس `_schedKey` — يُصفّره ثم يعيد `later()` في كل tick، وtick يمرّ عند كل
   تغيّر حالة ⇒ نافذة نهاية الشوط تُبنى بقدر تغيّرات الحالة (شوهدت
   1·3·4·6·32 مرّة) ومع كل بناء **يُعاد تسليح** مؤقّت التقدّم الاحتياطي 20ث
   فلا ينطلق ما دامت التغيّرات واردة — والطرف الذي لا يوارد تغيّراً لا يبني
   النافذة أصلاً فيصمت عن التصويت وتتعطّل الجولة (نقاط [0,0]).

   قياس بعد الإصلاح: 21✓·0✗ في خمس جوالٍ متتالية، وعدد البنى ثابت 1–2
   (بناءٌ لكل شوط) بدل 1–32، ولم تعد هناك جولة منهارة.

   العقد الذي يحرسه هذا الحارس:
     ① فرع roundEnd يستخدم حارس الجدولة نفسه كبقية الأطوار.
     ② showRoundEnd نفسه غير قابل للتكرار (خطّ دفاع ثانٍ: لا نداء — مهما
        جاء من أين — يعيد كتابة النافذة ولا يعيد تسليح مؤقّت 20ث).
     ③ _roundEndShown مُصرَّح ومصفَّر عند كل موضع يُصفَّر فيه _overlayKind.
     ④ لا ثغرة تغطية (درس v2.81.4-audit): الحارس يقرأ العدّاء ويشترط أن
        يكون ملفه مُدرَجاً فيه.

   ساكن — بلا متصفح ولا خادم.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(l, c) { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }

const APP = path.join(__dirname, '..', 'baloot-game', 'js', 'ui', 'baloot-app.js');
const src = fs.readFileSync(APP, 'utf8');

/* جسم فرع roundEnd داخل tick */
const br = src.indexOf("if (s.phase === 'roundEnd') {");
const brEnd = src.indexOf("if (s.phase === 'matchEnd') {", br);
ok('أ) فرع roundEnd داخل tick موجود', br !== -1 && brEnd > br);
const branch = src.slice(br, brEnd);

/* ① حارس الجدولة: لا يُصفَّر _schedKey ثم يعيد الجدولة بلا شرط */
ok('ب) فرع roundEnd محميّ بعلم صريح _roundEndScheduled (لا إعادة استعمال _schedKey)',
   /if \(!this\._roundEndScheduled\) \{/.test(branch) && /this\._roundEndScheduled = true;/.test(branch));
ok('ب) العلم مُصرَّح مبدئياً false', /_roundEndScheduled: false,/.test(src));
ok('ب) لا إعادة جدولة غير مشروطة: صفر `this._schedKey = null` في الفرع',
   !/this\._schedKey = null;/.test(branch));
ok('ب) لم يبقَ الجدول الفارغ `this._schedKey = null;` متبوعاً بجدولة مباشرة',
   !/this\._schedKey = null;\s*\n\s*this\.later\(\(\) => this\.showRoundEnd\(\)/.test(src));
ok('ب) التأخير 650ms محفوظ (لم يُمسّ التوقيت)', /this\.later\(\(\) => this\.showRoundEnd\(\), 650\)/.test(branch));

/* ② عدم التكرار داخل showRoundEnd نفسه */
const fn = src.indexOf('showRoundEnd: function ()');
const fnEnd = src.indexOf('showMatchEnd', fn + 10);
ok('ج) دالة showRoundEnd موجودة', fn !== -1 && fnEnd > fn);
const body = src.slice(fn, fnEnd);
ok('ج) حارس عدم التكرار: يعيد الحفظ قبل البناء',
   /if \(this\._roundEndShown === s\.roundNo\) return;/.test(body)
   && /this\._roundEndShown = s\.roundNo;/.test(body));
ok('ج) الحارس **قبل** بناء النافذة وتسليح المؤقّت (ترتيب مهم)',
   body.indexOf('_roundEndShown = s.roundNo') < body.indexOf('_overlayKind = \'roundEnd\''));
ok('ج) حارس الطور الأصلي محفوظ (لا يكسر الحالة الناقصة)',
   /if \(!s \|\| s\.phase !== 'roundEnd' \|\| !s\.roundResult\) return;/.test(body));

/* ③ تصريح الحقل وتصفيره مع _overlayKind في كل موضع */
ok('د) _roundEndShown مُصرَّح في كائن الحالة', /_roundEndShown: null,/.test(src));
{
  const clears = (src.match(/this\._overlayKind = null;/g) || []).length;
  const clearsNew = (src.match(/this\._roundEndShown = null;/g) || []).length;
  ok('د) التصفير عند كل موضع يُصفَّر فيه _overlayKind (' + clears + ' ⟵ ' + clearsNew + ')',
     clears === clearsNew && clears >= 5 &&
     (src.match(/this\._roundEndScheduled = false;/g) || []).length === clearsNew);
  /* التصفير **داخل** شرط المغادرة لا في كل tick: تصفيرٌ غير مشروط يُبطل
     حارس عدم التكرار بنفسه (يُصفَّر قبل كل نداء فيمرّ كلّه). */
  ok('د) تصفير roundEnd مربوطاً بالمغادرة لا مُطلقاً',
     /this\._overlayKind === 'roundEnd' && s\.phase !== 'roundEnd'\) \{[^}]*_roundEndShown = null;/.test(src));
  ok('د) تصفير matchEnd مربوطاً بالمغادرة لا مُطلقاً',
     /this\._overlayKind === 'matchEnd' && s\.phase !== 'matchEnd'\) \{[^}]*_roundEndShown = null;/.test(src));
  /* التصفير غير المشروط داخل tick يُبطل حارس عدم التكرار بنفسه: يُصفَّر قبل
     كل نداء فيمرّ كلّه. فالمطلوب: داخل tick تصفيران فقط، كلاهما سطرّ شرط. */
  const tk = src.indexOf('tick: function () {');
  const tkEnd = src.indexOf("s.phase === 'matchEnd'", tk);
  const tickBody = src.slice(tk, tkEnd);
  const inTick = (tickBody.match(/_roundEndShown = null;/g) || []).length;
  ok('د) داخل tick تصفيران فقط (كلاهما داخل شرط مغادرة)',
     inTick === 2 && !/^\s*this\._roundEndShown = null;\s*$/m.test(tickBody));
}

/* ④ لا ثغرة تغطية */
const RUNNER = path.join(__dirname, '_run_regression_rooms.sh');
const runner = fs.readFileSync(RUNNER, 'utf8');
ok('هـ) الحارس مُدرَج في العدّاء (لا ثغرة تغطية)', runner.indexOf('_v2952_round_end_idempotency_test.js') !== -1);
ok('هـ) الحارس ساكن (بلا playwright ولا متصفح)',
   !/require\('playwright'\)|_rd_pw\.js/.test(fs.readFileSync(__filename, 'utf8')));

/* ⑤ توأمان: نسخة البناء تعكس نسخة المستودع (قاعدة 18 — نفس المبدأ على البناء) */
{
  const wf = path.join(__dirname, '..', '.github', 'workflows', 'build-apk.yml');
  const wfDoc = path.join(__dirname, '..', 'docs', 'workflows', 'build-apk.yml');
  ok('و) نسختا سير البناء متطابقتان', fs.existsSync(wf) && fs.existsSync(wfDoc)
     && fs.readFileSync(wf, 'utf8') === fs.readFileSync(wfDoc, 'utf8'));
}

console.log('\n══ النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗ ══');
process.exit(fail ? 1 : 0);

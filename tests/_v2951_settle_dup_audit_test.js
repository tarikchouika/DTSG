/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — حارس v2.95.1: مُصنِّف رفض التسوية المكرّر (سلبيّ لا موجِب)

   لماذا حارس مستقل؟ لأنّ v2.95.1 أدخل استثناءً في جناح بلوت: صار يُسمح
   بـ400 على settleRound **شرط** أن يكون حصراً رفضَ منع الازدواج الموصوف
   (القاعدة 12). الاستثناء الذي لا يُختبر ← ختمٌ مطّاط (rubber stamp) يُخفي
   أيّ 400 آخر. فهذا الحارس يثبت بالمدخلات السلبية أنّ المُصنِّف **يرفض**
   غير المسموح — وهو ما لا يستطيع إثباته تشغيلٌ واحد على الجولة الحقيقية.

   الفحوص (بلا متصفح ولا خادم):
     أ) الرفض الموصوف وحده (POST settleRound · 400 · نصّه) ⇒ مقبول.
     ب) 400 على مسار آخر ⇒ مرفوض (.endpoint آخر لا يجوز ابتلاعه).
     ج) settleRound بـ400 لكن بجسم مختلف (رصيد غير كافٍ) ⇒ مرفوض.
     د) settleRound بـ200 أو 500 ⇒ مرفوض (الطريقة/الرمز جزء من العقد).
     هـ) GET على settleRound ⇒ مرفوض (الطريقة POST حصراً).
     و) خادم يرسل النصّ بلا JSON ⇒ يُحتسب رفضاً (الجسم الفارغ لا يُطابق).
     ز) قائمة فارغة ⇒ لا رفض غير متوقّع و0 مكرّرات.
     ح) الربط: جناح v283 يستعمل هذا المُصنِّف بعينه (لا نسخة مُكرَّرة).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(l, c) { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }

const A = require('./_settle4xx_audit.js');
const BASE = 'http://127.0.0.1:3971';
const DUP = A.DUP_SETTLE_MSG;

const dup = (over) => Object.assign({ status: 400, method: 'POST', url: BASE + '/api/rooms/settleRound', body: JSON.stringify({ ok: false, message: DUP }) }, over || {});

/* أ) المسموح الوحيد */
{
  const r = A.audit4xx([dup()]);
  ok('أ) رفض التسوية المكرّر مقبول (غير متوقّع=0 · مكرّر=1)', r.unexpected.length === 0 && r.dupCount === 1);
}
/* ب) 400 على مسار آخر — لا يجوز ابتلاعه */
{
  const r = A.audit4xx([dup(), dup({ url: BASE + '/api/rooms/createRoom' })]);
  ok('ب) 400 على مسار آخر مرفوض (غير متوقّع=1)', r.unexpected.length === 1 && r.dupCount === 1);
}
/* ج) settleRound بجسم مختلف — رفضٌ آخر في نفس المسار */
{
  const r = A.audit4xx([dup({ body: JSON.stringify({ ok: false, message: 'رصيدك لا يكفي' }) })]);
  ok('ج) settleRound بجسم مختلف مرفوض (غير متوقّع=1)', r.unexpected.length === 1 && r.dupCount === 0);
}
/* د) رمز حالة آخر على نفس المسار */
{
  ok('د) settleRound بـ500 مرفوض', A.audit4xx([dup({ status: 500 })]).unexpected.length === 1);
  ok('د) settleRound بـ403 مرفوض', A.audit4xx([dup({ status: 403 })]).unexpected.length === 1);
  ok('د) settleRound بـ200 لا يُعدّ استثناءً (ليس خطأ أصلاً)', A.audit4xx([dup({ status: 200 })]).unexpected.length === 1);
}
/* هـ) الطريقة جزء من العقد — POST حصراً */
{
  ok('هـ) GET على settleRound مرفوض', A.audit4xx([dup({ method: 'GET' })]).unexpected.length === 1);
}
/* و) جسم فارغ/مقطوع لا يُطابق النصّ */
{
  ok('و) جسم فارغ مرفوض', A.audit4xx([dup({ body: '' })]).unexpected.length === 1);
  ok('و) جسم بلا JSON فيه النصّ؟ — يُطابق النصّ حرفياً فقط', A.audit4xx([dup({ body: DUP })]).unexpected.length === 0);
}
/* ز) قائمة فارغة */
{
  const r = A.audit4xx([]);
  ok('ز) قائمة فارغة ⇒ لا رفض + 0 مكرّرات', r.unexpected.length === 0 && r.dupCount === 0);
  ok('ز) مدخل غير مصفوفة لا يرمي', A.audit4xx(undefined).unexpected.length === 0);
}
/* أخطاء الكونسول: كل خطأ 400 يجب أن له سند */
{
  const list = [dup()];
  ok('ح) خطأ كونسول واحد له سند ⇒ غير مفسَّر=0', A.unexplainedConsoleErrors(['Failed to load resource: 400'], list).unexplained === 0);
  ok('ح) خطآن بلا سند ⇒ غير مفسَّر=1 (يُفشل الجناح)', A.unexplainedConsoleErrors(['[pageerror] boom', 'other'], list).unexplained === 1);
}
/* ط) الربط: جناح v283 يستعمل هذه الوحدة بعينها — لا نسخة مُكرَّرة تنحرف */
{
  const src = fs.readFileSync(path.join(__dirname, '_v283_bl_room_e2e_test.js'), 'utf8');
  ok('ط) جناح v283 يستورد _settle4xx_audit.js', src.indexOf("require('./_settle4xx_audit.js')") !== -1);
  ok('ط) لا نسخة مُكرَّرة من منطق الفلترة داخل الجناح',
     src.indexOf('indexOf(DUP') === -1 && src.indexOf('/\\/api\\/rooms\\/settleRound(\\?|$)/.test(') === -1);
}

console.log('\n══ النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗ ══');
process.exit(fail ? 1 : 0);

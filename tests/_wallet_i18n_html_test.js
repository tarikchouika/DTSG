/* ═══════════════════════════════════════════════════════════════════════
   tests/_wallet_i18n_html_test.js — حارس تسرّب وسوم HTML كنص خام في الواجهة
   [v2.46.1] العطل المبلَّغ عنه من المالك: ظهور رموز مثل <b> حرفياً في نافذة
   المحفظة وشروحات طرق الدفع داخلها.
   السبب الجذري: مفاتيح القاموس (wl.noteCrypto · wl.noteCash · wl.noteVoucher ·
   wl.noteWd) تحمل وسوم <b>…</b>، وكانت مربوطة بـ data-i18n — و translateStatic()
   في js/core/utils.js يضبط data-i18n عبر el.textContent ⇒ تُعرض الوسوم كنص.

   القاعدة المُحقَّقة:
     • مفتاح ترجمته تحوي وسماً ⇒ مربوط بـ data-i18n-html أو data-k (innerHTML)،
       لا بـ data-i18n / data-i18n-placeholder / data-i18n-title (textContent).
     • كل مفتاح مربوط موجود في القاموس (لا مفتاح مفقود يعرض اسمه الخام).
     • شروحات المحفظة الأربعة ما زالت تحمل <b> أي أن الإصلاح لم يُفقِد التنسيق.

   التشغيل:  node tests/_wallet_i18n_html_test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TR = require(path.join(ROOT, 'js', 'i18n', 'translations.js'));

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}

/* مسار textContent: يُمنع فيه أي وسم HTML */
const TEXT_ATTR = /data-i18n(?!-)="([A-Za-z0-9_.]+)"|data-i18n-(?:placeholder|title)="([A-Za-z0-9_.]+)"/g;
/* مسار innerHTML: مسموح فيه الوسوم */
const HTML_ATTR = /data-(?:i18n-html|k)="([A-Za-z0-9_.]+)"/g;
const HAS_TAG = /<[a-zA-Z/]/;
const WALLET_NOTES = ['wl.noteCrypto', 'wl.noteCash', 'wl.noteVoucher', 'wl.noteWd'];

function uiFiles() {
  const out = [path.join(ROOT, 'index.html')];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  })(path.join(ROOT, 'js'));
  return out;
}

console.log('═══ اختبار حارس: تسرّب وسوم HTML في نصوص الواجهة (v2.46.1) ═══');

const leaks = [];      /* مُفتاح نصّي ترجمته تحوي وسماً */
const missing = [];    /* مفتاح مربوط غير موجود في القاموس */
const htmlBound = new Set();
let checked = 0;

for (const f of uiFiles()) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  let m;
  TEXT_ATTR.lastIndex = 0;
  while ((m = TEXT_ATTR.exec(src))) {
    const k = m[1] || m[2];
    checked++;
    const v = TR[k];
    if (!v) { missing.push(rel + ' → ' + k); continue; }
    if (v.some(x => HAS_TAG.test(String(x)))) leaks.push(rel + ' → ' + k);
  }
  HTML_ATTR.lastIndex = 0;
  while ((m = HTML_ATTR.exec(src))) { if (TR[m[1]]) htmlBound.add(m[1]); }
}

ok('فُحصت المفاتيح المعروضة كنص (' + checked + ' ربط)', checked > 0);
ok('لا وسوم HTML في مفتاح معروض كنص (سبب تسرّب <b> حرفياً)',
  leaks.length === 0, leaks.length ? 'المخالف: ' + leaks.join(' · ') : '');
ok('لا مفتاح مربوط مفقود من القاموس', missing.length === 0,
  missing.length ? missing.join(' · ') : '');

/* التثبيت الإيجابي للإصلاح: الشروحات الأربعة تُعرض كـ HTML وتبقى منسّقة بـ <b> */
const notHtmlBound = WALLET_NOTES.filter(k => !htmlBound.has(k));
ok('شروحات المحفظة الأربعة مربوطة بـ data-i18n-html',
  notHtmlBound.length === 0, notHtmlBound.length ? 'ناقص: ' + notHtmlBound.join(' · ') : '');

const lostBold = WALLET_NOTES.filter(k => !(TR[k] || []).some(x => /<b>/.test(String(x))));
ok('شروحات المحفظة ما زالت تحمل <b> (لم يُفقَد التنسيق)',
  lostBold.length === 0, lostBold.length ? 'بلا <b>: ' + lostBold.join(' · ') : '');

/* عرض بصري مختصر للقيمة العربية بعد الإصلاح */
console.log('  ℹ️  wl.noteCrypto (ar): ' + String((TR['wl.noteCrypto'] || [])[0] || ''));

console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
process.exit(fail ? 1 : 0);

/* [i18n-2026-09-23] حارس ترجمة لوحة السوبر أدمن — مشكلة 5 من CURRENT_TASK
 * يضمن: (1) كل مفاتيح T() المستخدمة في main.js موجودة في translations.js بـ4 لغات
 *       (2) لا نصوص عربية متبقية hardcoded في دوال الأدمن
 *       (3) مفاتيح التصنيفات السبعة مغطاة */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mainSrc = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const trSrc = fs.readFileSync(path.join(root, 'js/i18n/translations.js'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(root, 'js/games/catalog.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; fails.push(name); }
}

/* ── 1) كل مفاتيح T() المذكورة موجودة بترجمات صحيحة ── */
const keyRe = /T\('([^']+)'\)/g;
const usedKeys = new Set();
for (const m of mainSrc.matchAll(keyRe)) usedKeys.add(m[1]);
ok(usedKeys.size > 200, 'T() keys referenced in main.js (>200)');

// كل مفتاح مذكور يجب أن يظهر كتعريف 'key': في ملف الترجمات (أي مساحة تسمية)
const missingKeys = [];
for (const k of usedKeys) {
  if (!trSrc.includes("'" + k + "':")) missingKeys.push(k);
}
ok(missingKeys.length === 0, 'all referenced keys exist (missing: ' + (missingKeys.join(',') || 'none') + ')');

// مفاتيح admin.* / cat.* الجديدة (كتلة [i18n-2026-09-23]): 4 لغات غير فارغة لكل مفتاح
let badArity = 0;
const newBlock = trSrc.includes('/* [i18n-2026-09-23]')
  ? trSrc.slice(trSrc.indexOf('/* [i18n-2026-09-23]'))
  : trSrc;
for (const m of newBlock.matchAll(/'((?:admin|cat)\.[^']+)':\s*\[([^\]]+)\]/g)) {
  const inner = m[2];
  const items = [];
  let cur = '', q = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '\\' && i + 1 < inner.length) { cur += c + inner[i + 1]; i++; continue; }
    if (c === "'") { q = !q; cur += c; }
    else if (c === ',' && !q) { items.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  if (cur.trim()) items.push(cur.trim());
  if (items.length !== 4 || items.some(s => s.replace(/\\?'/g, '').trim().length < 2)) {
    badArity++;
    console.log('  bad entry:', m[1], '→', items.length, 'items');
  }
}
ok(badArity === 0, 'every NEW admin./cat. key has 4 non-empty translations');

/* ── 2) لا بقايا نصوص عربية hardcoded في منطقة الأدمن ── */
const adminStart = mainSrc.indexOf('function renderAdmin');
const adminEnd = mainSrc.indexOf('function loadAdminCoordinationMessages');
ok(adminStart > 0 && adminEnd > adminStart, 'admin function region located');
// نزّل التعليقات قبل فحص البقايا (العربية في تعليقات المطور مقبولة)
const adminRaw = mainSrc.slice(adminStart, adminStart + 45000);
const adminRegion = adminRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const banned = [
  '🎟️ أكواد الشحن</button>',
  'أنشئ أكواد شحن بالكوينز',
  '>أدمنز (بونص)</option>',
  '<label>النوع<br>',
  '<label>العملة<br>',
  '<label>الشريحة<br>',
  '>إنشاء الكود</button>',
  '>نسخ</button>',
  'شريحة غير صالحة',
  'الشرائح المتاحة',
  'تعذّر الاتصال بالخادم',
  "bet: 'رهان'",
  "win: 'فوز'",
  'تصفية بالمستخدم',
  'تصفية بالنوع',
  'لا يمكنك تغيير دورك',
  'سجل المعاملات',
  'لا توجد بطولات بعد',
  '<th>الوقت</th>',
  '<th>الرصيد بعدها</th>',
  '<th>الطرف الآخر</th>',
  '<th>المنشئ</th>',
  'لا حركات مالية بعد',
  'إيداعات مكتملة',
  'سحوبات منفَّذة',
  'كوينز داخلة / خارجة',
  'تُحدَّث لحظياً',
  "completed: '✅ مكتمل'",
  "deposit: '📥 إيداع'",
  '<th>Net</th>',
  '<th>التاريخ</th>',
  '<th>المرجع</th>',
  'تصفية',
  'MAD (درهم)'
];
for (const s of banned) {
  ok(!adminRegion.includes(s), 'no hardcoded remnant: ' + s.slice(0, 28));
}

/* ── 3) moneyFootnote {n} + التصنيفات السبعة ── */
for (const line of trSrc.split('\n')) {
  if (line.trim().startsWith("'admin.moneyFootnote':")) {
    const parts = line.split('{n}').length - 1;
    ok(parts === 4, 'admin.moneyFootnote has {n} placeholder ×4 langs (got ' + parts + ')');
    ok((line.match(/',/g) || []).length >= 3, 'moneyFootnote has 4 lang entries');
  }
}
const cats = [...catalogSrc.matchAll(/cat:\s*'([a-z]+)'/g)].map(m => m[1]);
const catSet = [...new Set(cats)];
ok(catSet.length === 7, 'catalog has 7 categories (got ' + catSet.length + ': ' + catSet.join(',') + ')');
for (const c of catSet) {
  const key = 'admin.cat' + c.charAt(0).toUpperCase() + c.slice(1);
  ok(trSrc.includes("'" + key + "':"), 'category key exists: ' + key);
}

/* ── 4) الأزرار والوسوم الجديدة مستخدمة فعلاً ── */
ok(mainSrc.includes("T('admin.codesTab')"), 'codesTab used in renderAdmin');
ok(mainSrc.includes("T('admin.cat' + g.cat.charAt(0).toUpperCase()"), 'dynamic category translation in adminLoadGames');
ok(mainSrc.includes("T('admin.moneyFootnote').replace('{n}'"), 'moneyFootnote {n} interpolated');
ok(mainSrc.includes("toLocaleString(ST.lang === 'fr'"), 'coordination dates locale-aware (no hardcoded toLocaleString(\'ar\'))');
ok(mainSrc.includes("roleLabel(u.role)") && !mainSrc.includes("toLocaleString('ar')"), "no toLocaleString('ar') remains in main.js");

console.log('[admin-i18n] ' + pass + '/' + (pass + fail) + ' PASS');
if (fail) {
  console.log('FAILURES:', fails.slice(0, 20));
  process.exit(1);
}

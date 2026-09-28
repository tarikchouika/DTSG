/* ═══════════════════════════════════════════════════════════════════════
   tests/_vouchers_ui_test.js — اختبار انحدار: إنشاء أكواد التعبئة من لوحة الأدمن
   [v2.40.5] يُصلح المشكلة التي منعت المالك من إنشاء كود تعبئة:
     كان الزر يستدعي fetch('/api/vouchers/create') بمسار نسبي ⇒ يذهب إلى
     dtsg.pages.dev (واجهة Pages) فتأتي 405 وتفشل العملية دائماً.

   يتحقق من:
     أ) الواجهة تستعمل عميل API الصحيح (لا مسارات نسبية للباكأند)
     ب) المعالج في الخادم يعمل فعلاً: سوبر أدمن ⇒ كود، لاعب عادي ⇒ 403،
        شريحة غير صالحة ⇒ 400، والكود يُحفظ ويُسترجَع ويشحن الرصيد
   التشغيل: node tests/_vouchers_ui_test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (l, c, x) => { c ? (pass++, console.log('  ✅ ' + l + (x ? '  ' + x : ''))) : (fail++, console.log('  ❌ ' + l + (x ? '  ' + x : ''))); };

console.log('═══ أ) الواجهة — لا مسارات نسبية للباكأند ═══');
const mainJs = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
ok('js/main.js: إنشاء الكود عبر API.post', /API\.post\('\/api\/vouchers\/create'/.test(mainJs));
ok('js/main.js: لا fetch نسبي لـ /api/vouchers/create', !/fetch\('\/api\/vouchers\/create'/.test(mainJs));
ok('js/main.js: رسالة واضحة عند 403', /status === 403/.test(mainJs) && /للسوبر أدمن/.test(mainJs));

const contactHtml = fs.readFileSync(path.join(ROOT, 'contact.html'), 'utf8');
ok('contact.html: API.post للاتصال', /API\.post\('\/api\/contact'/.test(contactHtml));
ok('contact.html: لا fetch نسبي لـ /api/contact', !/fetch\('\/api\/contact'/.test(contactHtml));

const deployHtml = fs.readFileSync(path.join(ROOT, 'deploy.html'), 'utf8');
ok('deploy.html: يحلّ عنوان الباكأند (__API_BASE)', /__API_BASE/.test(deployHtml) && /api-url2\.json/.test(deployHtml));
ok('deploy.html: لا fetch نسبي لـ manifest', !/fetch\('\/api\/deploy\/manifest/.test(deployHtml));

/* مسح شامل: أي fetch نسبي متبقٍّ لمسار API (عدا العنوانين المسموحين) = فشل */
const uiFiles = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!/node_modules|\.git|tests|cf-worker|scripts/.test(p)) walk(p); }
    else if (/\.(js|html)$/.test(f)) uiFiles.push(p);
  }
})(ROOT);
const offenders = [];
for (const f of uiFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /fetch\(\s*['"](\/api-[a-z0-9-]+\.json|\/api\/[^'"]*)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] === '/api-url2.json') continue;             /* ملف اكتشاف العنوان — نسبي بطبيعته */
    offenders.push(path.relative(ROOT, f) + ' → ' + m[1]);
  }
}
ok('لا نداءات API نسبية متبقية في الواجهة', offenders.length === 0, offenders.join(' | '));

console.log('\n═══ ب) الخادم — مسار إنشاء الأكواد فعلياً ═══');
const pay = require(path.join(ROOT, 'server-payments.js'));
const db = new DatabaseSync(':memory:');
db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, gold INTEGER DEFAULT 0, telegram_id TEXT)");
db.exec("INSERT INTO users (id,username,gold) VALUES (1,'owner',5000),(2,'player',100)");
const users = { 1: { id: 1, username: 'owner', role: 'super', gold: 5000 }, 2: { id: 2, username: 'player', role: 'user', gold: 100 } };
const sessions = { supersid: 1 };
process.env.ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || 'test-secret';
pay.initPaymentsTables(db);
pay.setContext(db, users, sessions);

function fakeRes() { return { code: 0, body: '', writeHead(c) { this.code = c; }, end(t) { this.body = t; } }; }
function fakeReq(cookie, url, method) {
  return { method: method || 'POST', url: url || '/api/vouchers/create', headers: { host: '127.0.0.1:1', cookie: cookie || '', 'content-type': 'application/json' } };
}
const J = t => { try { return JSON.parse(t); } catch (e) { return {}; } };

(async () => {
  /* سوبر أدمن ينشئ كوداً */
  let res = fakeRes();
  await pay.handlePayments(fakeReq('sid=supersid'), res, JSON.stringify({ kind: 'admin', tier: 1000, currency: 'usd' }));
  let j = J(res.body);
  ok('سوبر أدمن ينشئ كوداً (200)', res.code === 200 && j.ok === true && /^DTSG-/.test((j.codes || [])[0] || ''), JSON.stringify(j).slice(0, 90));
  ok('الحساب صحيح (1000$ ×100 كوين + بونص أدمنز 30% = 130,000)', j.coins === 130000, 'coins=' + j.coins);
  const saved = db.prepare('SELECT code, kind, coins, bonus_pct FROM pay_vouchers WHERE code = ?').get(j.codes[0]);
  ok('الكود محفوظ في pay_vouchers', !!saved, JSON.stringify(saved));

  /* لاعب عادي (لا جلسة سوبر) */
  res = fakeRes();
  await pay.handlePayments(fakeReq('sid=playersid'), res, JSON.stringify({ kind: 'admin', tier: 100, currency: 'usd' }));
  ok('لاعب عادي يُرفض 403', res.code === 403, res.body.slice(0, 60));

  /* بلا جلسة إطلاقاً */
  res = fakeRes();
  await pay.handlePayments(fakeReq(''), res, JSON.stringify({ kind: 'admin', tier: 100, currency: 'usd' }));
  ok('بلا جلسة يُرفض 403', res.code === 403, res.body.slice(0, 60));

  /* شريحة غير صالحة */
  res = fakeRes();
  await pay.handlePayments(fakeReq('sid=supersid'), res, JSON.stringify({ kind: 'admin', tier: 777, currency: 'usd' }));
  let j4 = J(res.body);
  ok('شريحة غير صالحة ⇒ 400 + قائمة الشرائح', res.code === 400 && j4.error === 'bad-tier' && Array.isArray(j4.tiers), JSON.stringify(j4).slice(0, 90));

  /* استرجاع الكود يشحن رصيد اللاعب */
  const code = j.codes ? j.codes[0] : null;
  if (code) {
    res = fakeRes();
    await pay.handlePayments(fakeReq('sid=playersid', '/api/vouchers/redeem'), res, JSON.stringify({ user_id: 2, code: code }));
    const j5 = J(res.body);
    ok('اللاعب يسترجع الكود فيُشحن رصيده (200)', res.code === 200 && j5.ok === true, JSON.stringify(j5).slice(0, 90));
    const g = db.prepare('SELECT gold FROM users WHERE id = 2').get();
    ok('الذهب زاد في القاعدة فعلاً', g.gold === 100 + j.coins, 'gold=' + g.gold);
    /* لا يُستعمل الكود مرتين */
    res = fakeRes();
    await pay.handlePayments(fakeReq('sid=playersid', '/api/vouchers/redeem'), res, JSON.stringify({ user_id: 2, code: code }));
    ok('الكود لا يُستعمل مرتين', res.code >= 400, 'code=' + res.code + ' ' + res.body.slice(0, 60));
  }

  console.log(`\n═══ النتيجة: ${pass} نجح / ${fail} فشل ═══`);
  process.exit(fail ? 1 : 0);
})();

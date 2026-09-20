/* ═══════════════════════════════════════════════════════════════════════
   tests/_security_static_test.js — اختبار انحدار أمني + صحة طبقة المدفوعات
   [v2.40.4] يكشف التسريبات التي رُصدت حيّاً على خادم الهاتف:
       data/royalcoin.db (قاعدة المستخدمين) · server.js · package.json ...
   يشغّل الخادم بنفسه على منفذ مؤقت ثم يتحقق ويعيد الإغلاق.

   التشغيل:  node tests/_security_static_test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}
async function get(p) {
  try { const r = await fetch(BASE + p, { redirect: 'manual' }); return { code: r.status, body: await r.text() }; }
  catch (e) { return { code: 0, body: String(e && e.message) }; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('═══ اختبار أمن الملفات الثابتة + المدفوعات (v2.40.4) ═══');
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), DEPLOY_MANIFEST: '' }), stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  srv.stdout.on('data', d => { log += d; });
  srv.stderr.on('data', d => { log += d; });

  let up = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const h = await get('/api/health');
    if (h.code === 200) { up = true; break; }
  }
  if (!up) { console.log('  ❌ الخادم لم يقلع على المنفذ ' + PORT + '\n' + log.slice(-800)); srv.kill('SIGKILL'); process.exit(1); }

  /* ── 1) الهوية عن بُعد ── */
  const h = await get('/api/health');
  let hj = {};
  try { hj = JSON.parse(h.body); } catch (e) {}
  ok('/api/health يعيد build (للتحقق عن بُعد)', !!hj.build, 'build=' + hj.build);
  ok('/api/health يعلن طبقة المدفوعات', hj.payments === true);

  /* ── 2) المدفوعات تعمل ── */
  const m = await get('/api/payments/methods');
  let mj = {};
  try { mj = JSON.parse(m.body); } catch (e) {}
  ok('/api/payments/methods → 200', m.code === 200, 'code=' + m.code);
  ok('قائمة الوسائل بها 5+ وسائل', Array.isArray(mj.methods) && mj.methods.length >= 5, 'عدد=' + (mj.methods ? mj.methods.length : 0));
  ok('وسيلة binance موجودة', Array.isArray(mj.methods) && mj.methods.some(x => x.id === 'binance'));
  const dep = await get('/api/deploy/manifest');
  ok('/api/deploy/manifest لا يردّ not_found', !/not_found/.test(dep.body), 'code=' + dep.code);

  /* ── 3) الملفات الحساسة يجب أن تكون 404 ── */
  const denied = ['/server.js', '/server-payments.js', '/package.json', '/package-lock.json',
    '/data/royalcoin.db', '/data/royalcoin.db-wal', '/cf-worker/payments-core.js',
    '/cf-worker/schema.sql', '/scripts/update-phone-server.sh', '/scripts/phone-doctor.sh',
    '/.env', '/.git/config', '/tunnel-live.json', '/tests/_security_static_test.js'];
  for (const p of denied) {
    const r = await get(p);
    ok('محجوب ' + p, r.code === 404, 'code=' + r.code);
  }

  /* ── 4) الملفات المشروعة يجب ألا تتأثر ── */
  const allowed = [['/', '<!DOCTYPE html'], ['/index.html', '<!DOCTYPE html'], ['/js/wallet.js', "'use strict'"],
    ['/js/main.js', ''], ['/css/20-wallet.css', ''], ['/payments-url.json', '"url"'],
    ['/api-url2.json', '"url"']];
  for (const [p, needle] of allowed) {
    const r = await get(p);
    ok('مسموح ' + p, r.code === 200 && (!needle || r.body.includes(needle)), 'code=' + r.code + ' bytes=' + Buffer.byteLength(r.body));
  }
  /* [v2.45] ملفات إثبات ملكية Cryptomus أُزيلت — يجب أن ترد 404 */
  for (const p of ['/cryptomus_696df86d.html', '/cryptomus_5bf79cae.html']) {
    const r = await get(p);
    ok('أُزيل ' + p + ' (404)', r.code === 404, 'code=' + r.code);
  }

  /* ── 4.b) نموذج «اتصل بنا» يعمل (كان 405 من Pages بسبب مسار نسبي) ── */
  const cpost = async (payload) => {
    try { const r = await fetch(BASE + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); return { code: r.status, body: await r.text() }; }
    catch (e) { return { code: 0, body: String(e) }; }
  };
  const c1 = await cpost({ name: 'اختبار', email: 'a@b.c', subject: 's', message: 'رسالة اختبارية طويلة بما يكفي' });
  ok('POST /api/contact → 200', c1.code === 200 && /"ok":true/.test(c1.body), 'code=' + c1.code);
  const c2 = await cpost({ name: 'x', message: '' });
  ok('POST /api/contact مدخل ناقص → 400', c2.code === 400, 'code=' + c2.code);
  const c3 = await get('/api/admin/contact-messages');
  ok('قائمة رسائل الاتصال محمية (403 بلا جلسة)', c3.code === 403, 'code=' + c3.code);

  /* ── 5) محاولات تجاوز المسار ── */
  for (const p of ['/../server.js', '/%2e%2e/server.js', '/data/../server.js', '/DATA/royalcoin.db', '/Server.js']) {
    const r = await get(p);
    ok('تجاوز محجوب ' + p, r.code === 404 || r.code === 403, 'code=' + r.code);
  }

  srv.kill('SIGKILL');
  console.log(`\n═══ النتيجة: ${pass} نجح / ${fail} فشل ═══`);
  process.exit(fail ? 1 : 0);
})();

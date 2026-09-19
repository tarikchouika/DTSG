'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — اختبار م3 (v2.44): مصدر واحد للحقيقة + السجل المالي الموحّد (pay_audit)
   يُشغّل مسار المنصة الحقيقي (server-payments.js + cf-worker/payments-core.js)
   فوق SQLite حقيقية (node:sqlite) — بلا متصفح.
   يُثبت:
     1) الشحن بالبونص حسب الشريحة آلياً (100$ → 5%).
     2) الدولار = gold/rate دائماً: لا يتغيّر بلا كوينز ولا «يعود» بعد التحديث.
     3) كل حركة (طلب/موافقة/رفض/كوبون/شحن أدمن) لها سطر في pay_audit مع الفاعل.
     4) السجل المالي يعمل بالفلاتر (نوع/حالة/بحث) ويُلخّص المجاميع.
   التشغيل: node tests/_pay_audit_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const { DatabaseSync } = require('node:sqlite');
const core = require('../cf-worker/payments-core.js');
const pay = require('../server-payments.js');

let pass = 0, fail = 0;
const ok = (m, c) => { if (c === undefined) c = true; if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const eq = (m, a, b) => ok(m + '  (' + a + ' = ' + b + ')', Number(a) === Number(b));

process.env.USD_GOLD_RATE = '100';
process.env.ADMIN_API_SECRET = 'test-secret';
process.env.PAY_DEBUG_LOG = '0';

/* ── قاعدة SQLite حقيقية بجدول users المنصة ── */
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users (
  id INTEGER PRIMARY KEY, username TEXT, gold INTEGER DEFAULT 0, role TEXT DEFAULT 'user',
  telegram_id TEXT, first_topup_done INTEGER DEFAULT 0, banned INTEGER DEFAULT 0,
  admin_id INTEGER, last_seen INTEGER, pass_hash TEXT, pass_salt TEXT, ref_code TEXT, referred_by INTEGER
);`);
db.exec("INSERT INTO users (id, username, gold, role) VALUES (1,'qa_player',1000,'user'), (2,'qa_super',0,'super'), (3,'qa_admin',0,'admin')");
const users = {
  1: { id: 1, username: 'qa_player', gold: 1000, role: 'user' },
  2: { id: 2, username: 'qa_super', gold: 0, role: 'super' },
  3: { id: 3, username: 'qa_admin', gold: 0, role: 'admin', admin_id: null }
};
pay.initPaymentsTables(db);
pay.setContext(db, users, {});

const envAs = (actor) => pay.buildEnv({ headers: { host: 'localhost' }, method: 'POST' }, { actor: actor });
const call = async (method, path, body, actor) => {
  const opts = { method: method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await core.handleFetch(new Request('http://localhost' + path, opts), envAs(actor || 'system'));
  return await r.json();
};
const goldOf = (id) => Number(db.prepare('SELECT gold FROM users WHERE id = ?').get(id).gold);
const mirrorOf = (id) => Number(db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(id).balance_usd);
const auditRows = (where, args) => db.prepare('SELECT * FROM pay_audit' + (where ? ' WHERE ' + where : '') + ' ORDER BY ts ASC, rowid ASC').all(...(args || []));

(async () => {
  /* ═══ 1) شرائح البونص ═══ */
  console.log('\n[1] بونص الشريحة الآلي');
  eq('10$ ⇒ 0%', core.depositBonusPct(10), 0);
  eq('100$ ⇒ 5%', core.depositBonusPct(100), 5);
  eq('1000$ ⇒ 10%', core.depositBonusPct(1000), 10);
  eq('10000$ ⇒ 15%', core.depositBonusPct(10000), 15);
  eq('77$ (غير شريحة) ⇒ 0%', core.depositBonusPct(77), 0);

  /* ═══ 2) طلب إيداع P2P ثم موافقة السوبر أدمن ═══ */
  console.log('\n[2] إيداع: طلب ← موافقة (بونص آلي + تدقيق)');
  const before = goldOf(1), beforeUsd = mirrorOf(1);
  const req = await call('POST', '/api/payments/p2p', { user_id: 1, amount_usd: 100, method: 'cash_plus', proof_details: 'CP-TEST-1' }, 'user');
  ok('الطلب أُنشئ بحالة pending', req.ok && req.status === 'pending');
  const reqRow = auditRows("action='request' AND kind='deposit'")[0];
  ok('سطر تدقيق الطلب موجود', !!reqRow && Number(reqRow.amount_usd) === 100 && reqRow.status === 'pending');
  eq('الرصيد لم يتغيّر قبل الموافقة', goldOf(1), before);

  const appr = await pay.adminActOnPlatformTx(req.tx, 'approve', 'qa_super');
  ok('الموافقة نجحت', appr && appr.ok);
  const afterGold = goldOf(1);
  eq('الكوينز: +10000 أساس +500 بونص 5%', afterGold - before, 10500);
  eq('الدولار المشتق تغيّر بنفس النسبة', mirrorOf(1) - beforeUsd, 105);
  const apRow = auditRows("action='approve' AND kind='deposit'")[0];
  ok('سطر تدقيق الموافقة ببونص 5% وفاعل qa_super', !!apRow && Number(apRow.bonus_pct) === 5 && Number(apRow.bonus_coins) === 500 && apRow.actor === 'qa_super');
  eq('قبل/بعد الكوينز مسجّلان', Number(apRow.after_coins) - Number(apRow.before_coins), 10500);

  /* ═══ 3) الدولار لا يتغيّر بلا كوينز ولا «يعود» بعد التحديث ═══ */
  console.log('\n[3] مصدر واحد للحقيقة (gold) — لا ارتداد بعد التحديث');
  const b1 = await call('GET', '/api/wallet/balance?user_id=1', undefined, 'user');
  const b2 = await call('GET', '/api/wallet/balance?user_id=1', undefined, 'user');   /* محاكاة إعادة تحميل الصفحة */
  eq('balance_usd = 115', Number(b1.balance_usd), 115);
  eq('coins = 11500', Number(b1.coins), 11500);
  eq('إعادة القراءة تعطي نفس القيمة (لا ارتداد)', Number(b2.balance_usd), Number(b1.balance_usd));
  eq('مرآة القاعدة = gold/100', mirrorOf(1), Math.round((afterGold / 100) * 100) / 100);

  /* ═══ 4) كوبون كوينز: إنشاء (سوبر) ← استرداد (لاعب) ═══ */
  console.log('\n[4] الكوبونات: إنشاء + استرداد + تدقيق');
  const vc = await call('POST', '/api/vouchers/create', { kind: 'direct', tier: 10, admin_secret: 'test-secret' }, 'qa_super');
  ok('إنشاء كوبون مباشر 10$ (1000 كوين، بونص 0)', vc.ok && vc.coins === 1000);
  const g0 = goldOf(1);
  const rd = await call('POST', '/api/vouchers/redeem', { user_id: 1, code: vc.codes[0] }, 'user');
  ok('استرداد الكوبون نجح', rd.ok && Number(rd.coins) === 1000);
  eq('الكوينز أُضيفت فعلاً', goldOf(1) - g0, 1000);
  ok('سطر تدقيق الاسترداد موجود', !!auditRows("action='redeem' AND kind='voucher'")[0]);
  const dup = await call('POST', '/api/vouchers/redeem', { user_id: 1, code: vc.codes[0] }, 'user');
  ok('الاسترداد المزدوج مرفوض', !dup.ok && dup.error === 'already-used');

  /* ═══ 5) السحب: طلب ← رفض (إعادة الرصيد) ثم طلب ← موافقة ═══ */
  console.log('\n[5] السحب: خصم ذرّي + رفض يعيد الرصيد + تدقيق');
  const g1 = goldOf(1);
  const w1 = await call('POST', '/api/withdrawals/request', { user_id: 1, amount_usd: 20, method: 'cash_plus', details: '0612345678' }, 'user');
  ok('طلب السحب أُنشئ', w1.ok && w1.status === 'pending');
  eq('خُصم 2000 كوين عند الطلب', g1 - goldOf(1), 2000);
  const w1r = await pay.adminActOnPlatformTx(w1.tx, 'reject', 'qa_super');
  ok('الرفض نجح', w1r && w1r.ok);
  eq('أُعيد الرصيد كاملاً', goldOf(1), g1);
  const wRej = auditRows("kind='withdrawal' AND action='reject'")[0];
  /* [e0c11d6] الملاحظة تُبنى كـ '0612345678 · refunded' لأن الطلب يحمل details ⇒ التوكيد الجزئي */
  ok('تدقيق الرفض يعرض refunded', !!wRej && wRej.status === 'rejected' && String(wRej.note).includes('refunded') && wRej.actor === 'qa_super');

  const w2 = await call('POST', '/api/withdrawals/request', { user_id: 1, amount_usd: 10, method: 'binance', details: 'TADDR' }, 'user');
  const w2a = await pay.adminActOnPlatformTx(w2.tx, 'approve', 'qa_admin');
  ok('تنفيذ السحب نجح', w2a && w2a.ok);
  const wApp = auditRows("kind='withdrawal' AND action='approve'")[0];
  ok('تدقيق التنفيذ بفاعل qa_admin', !!wApp && wApp.status === 'completed' && wApp.actor === 'qa_admin' && Number(wApp.coins) === 1000);
  const w2row = db.prepare('SELECT status, reviewed_by FROM pay_transactions WHERE id = ?').get(w2.tx);
  ok('حالة المعاملة completed وتوقيع المراجع محفوظ', w2row.status === 'completed' && String(w2row.reviewed_by) === 'qa_admin');

  /* ═══ 6) حركات الأدمن اليدوية ═══ */
  console.log('\n[6] السجل المالي: شحن/خصم إداري');
  pay.auditAdminOp('qa_super', users[1], 'admin_op', 5, 500, 'شحن إداري اختباري');
  const adminRow = auditRows("kind='admin_op'")[0];
  ok('سطر الشحن الإداري مسجّل', !!adminRow && adminRow.actor === 'qa_super' && Number(adminRow.coins) === 500);

  /* ═══ 7) القراءة والفلاتر والتلخيص ═══ */
  console.log('\n[7] السجل المالي: قراءة + فلاتر + ملخّص');
  const all = pay.listAudit({ limit: 100 });
  ok('السجل يعرض كل الحركات (>= 8)', (all.entries || []).length >= 8);
  const depOnly = pay.listAudit({ kind: 'deposit' });
  ok('فلتر النوع (deposit) يعمل', depOnly.entries.length >= 2 && depOnly.entries.every(e => e.kind === 'deposit'));
  const q1 = pay.listAudit({ q: 'qa_player' });
  ok('البحث باسم المستخدم يعمل', q1.entries.length >= 3 && q1.entries.every(e => String(e.username || '').indexOf('qa_player') >= 0 || String(e.user_id) === '1'));
  const q2 = pay.listAudit({ q: 'qa_super' });
  ok('البحث بالفاعل (المُنفِّذ) يعمل', q2.entries.length >= 3 && q2.entries.some(e => e.actor === 'qa_super'));
  const sum = pay.listAudit({ kind: 'deposit' }).summary || [];
  const completed = sum.filter(s => s.status === 'completed')[0];
  ok('الملخّص يجمع الدولار والكوينز المكتملة', !!completed && Number(completed.usd) >= 100 && Number(completed.coins) >= 10500);
  ok('كل الأسطر تحمل اسم المستخدم (وضوح للوحة)', all.entries.filter(e => e.user_id).every(e => !!e.username));

  /* ═══ 8) سلامة المسار القديم (لا كسر لواجهات البوت) ═══ */
  console.log('\n[8] توافق البوت/الواجهة');
  const alt = await call('POST', '/api/payments/p2p', { username: 'qa_player', amount: 10, method: 'Cash Plus', details: 'CP-ALT' }, 'user');
  ok('الطلب بالاسم البديل والوسيلة بأي كتابة يعمل', alt.ok && alt.status === 'pending');
  ok('الشريحة 10$ بلا بونص (0%)', core.depositBonusPct(10) === 0);

  console.log('\n════════════════════════════════════════');
  console.log('PAY AUDIT m3: ' + pass + ' passed, ' + fail + ' failed');
  console.log('════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('\nFATAL ' + (e && e.stack || e)); process.exit(1); });

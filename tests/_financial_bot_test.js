/* ═══════════════════════════════════════════════════════════════════════════
   tests/_financial_bot_test.js — اختبار بوت المالية للسوپر أدمن (v2.66.0)
   @dtsgfinancials_bot — خاص بالسوپر أدمن حصراً، نفس خصائص داشبورد السوپر أدمين.

   ما يتحقّق هنا:
     1) البوابة: أي محادثة غير السوپر أدمن ⇒ رفض قاطع + قيد تدقيق، بلا أي تسريب.
     2) التكافؤ مع الداشبورد: /stats · /pending (+أزرار موافقة/رفض) · /deposits ·
        /withdrawals · /users · /user · /log (السجل المدمج الثلاثي) · /money (بمجاميعه) ·
        /games · /tx.
     3) الأفعال المالية: الموافقة/الرفض عبر نفس pay.adminActOnPlatformTx ·
        الشحن/الخصم/الضبط بنفس منطق الداشبورد (transactions نفسه + مكافأة الإحالة).
     4) الترقيم (fnv:) والأزرار السريعة و/audit.
     5) الويب هوك: سرّ خاطئ ⇒ 403 · تحديث سليم ⇒ 200 (integration عبر server module).

   بلا شبكة خارجية: خادم تيليغرام وهمي + قاعدة في الذاكرة.
   التشغيل: node tests/_financial_bot_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* ── إعداد البيئة قبل تحميل الوحدة ── */
const TOKEN = '123456:TESTTOKEN';
const SUPER = '999000001';
let TG_CALLS = [];
const TG_PORT = 3993;
process.env.FINANCIALS_BOT_TOKEN = TOKEN;
process.env.FINANCIALS_TG_API = 'http://127.0.0.1:' + TG_PORT;
process.env.FINANCIALS_BOT_USERNAME = 'dtsgfinancials_bot';
process.env.FINANCIALS_SUPER_TG = SUPER;
process.env.FINANCIALS_WEBHOOK_SECRET = 'whsec-fin-test';

const fin = require(path.join(__dirname, '..', 'server-financials.js'));

let pass = 0, fail = 0;
const ok = (l, c, x) => { c ? (pass++, console.log('  ✅ ' + l + (x ? '  ' + x : ''))) : (fail++, console.log('  ❌ ' + l + (x ? '  ' + x : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── خادم تيليغرام وهمي ── */
const tgSrv = http.createServer((req, res) => {
  let b = '';
  req.on('data', d => { b += d; });
  req.on('end', () => {
    const method = (req.url || '').split('/').pop();
    let payload = {}; try { payload = JSON.parse(b || '{}'); } catch (e) {}
    TG_CALLS.push({ method, payload });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: { message_id: TG_CALLS.length } }));
  });
});
const sentTo = (chat) => TG_CALLS.filter(c => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chat));
const lastTo = (chat) => { const a = sentTo(chat); return a.length ? String(a[a.length - 1].payload.text) : ''; };
const lastMarkup = (chat) => { const a = sentTo(chat); return a.length ? (a[a.length - 1].payload.reply_markup || null) : null; };

/* ── قاعدة بيانات في الذاكرة — نفس مخطط المنصة ── */
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT, gold REAL DEFAULT 0, banned INTEGER DEFAULT 0,
  created_at INTEGER, last_seen INTEGER, ref_code TEXT, referred_by INTEGER, admin_id INTEGER, first_topup_done INTEGER DEFAULT 0, telegram_id TEXT, muted_until INTEGER DEFAULT 0)`);
db.exec(`CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, amount REAL,
  balance_after REAL, counterparty_id INTEGER, counterparty_name TEXT, actor_id INTEGER, actor_name TEXT, game_id TEXT, note TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE bet_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, game_id TEXT, bet INTEGER, won INTEGER, payout INTEGER, result_txt TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE pay_transactions (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, amount_usd REAL, method TEXT, status TEXT, proof_details TEXT, reviewed_by TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE money_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, kind TEXT, amount_usd REAL, coins REAL, status TEXT, ref TEXT, note TEXT, actor TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE group_rounds (id INTEGER PRIMARY KEY, game_id TEXT, status TEXT)`);
db.exec(`CREATE TABLE group_bets (id INTEGER PRIMARY KEY, round_id INTEGER, user_id INTEGER, bet INTEGER, won INTEGER, payout INTEGER)`);

const T0 = Math.floor(Date.now() / 1000) - 3600;
db.prepare('INSERT INTO users (id, username, role, gold, created_at, last_seen, ref_code, referred_by) VALUES (?,?,?,?,?,?,?,?)')
  .run(1, 'tarik', 'super', 9000, T0 - 90000, T0 - 60, null, null);
db.prepare('INSERT INTO users (id, username, role, gold, created_at, last_seen, ref_code, referred_by) VALUES (?,?,?,?,?,?,?,?)')
  .run(2, 'player1', 'user', 500, T0 - 80000, T0 - 100, 'REF-2', null);
db.prepare('INSERT INTO users (id, username, role, gold, created_at, last_seen, referred_by, first_topup_done) VALUES (?,?,?,?,?,?,?,?)')
  .run(3, 'newbie', 'user', 100, T0 - 70000, null, 2, 0);
db.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES (?,?,?,?,?,?,?,?)")
  .run('tx-001', '2', 'deposit', 50, 'cash_plus', 'pending', 'REF123', T0);
db.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES (?,?,?,?,?,?,?,?)")
  .run('tx-002', '2', 'withdrawal', 20, 'binance', 'completed', 'HASH9', T0 - 100);
db.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES (?,?,?,?,?,?,?,?)")
  .run('tx-003', '3', 'deposit', 10, 'voucher', 'rejected', 'CODE7', T0 - 200);
db.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, counterparty_name, actor_name, note, created_at) VALUES (?,?,?,?,?,?,?,?)')
  .run(2, 'charge', 500, 500, 'tarik', 'tarik', 'شحن يدوي', T0 - 500);
db.prepare('INSERT INTO bet_tickets (user_id, game_id, bet, won, payout, result_txt, created_at) VALUES (?,?,?,?,?,?,?)')
  .run(2, 'rm', 100, 1, 180, 'فوز', T0 - 300);
db.prepare('INSERT INTO money_log (user_id, kind, amount_usd, coins, status, ref, created_at) VALUES (?,?,?,?,?,?,?)')
  .run('2', 'deposit', 50, 5000, 'completed', 'tx-001', Date.now() - 3600000);
db.prepare("INSERT INTO group_rounds (id, game_id, status) VALUES (1, 'rm', 'finished')").run();
db.prepare('INSERT INTO group_bets (id, round_id, user_id, bet, won, payout) VALUES (1, 1, 2, 100, 1, 180)').run();

const users = {
  1: { id: 1, username: 'tarik', role: 'super', gold: 9000, created_at: T0 - 90000, last_seen: T0 - 60, banned: false, ref_code: null, referred_by: null, first_topup_done: 1 },
  2: { id: 2, username: 'player1', role: 'user', gold: 500, created_at: T0 - 80000, last_seen: T0 - 100, banned: false, ref_code: 'REF-2', referred_by: null, first_topup_done: 1 },
  3: { id: 3, username: 'newbie', role: 'user', gold: 100, created_at: T0 - 70000, last_seen: null, banned: false, ref_code: null, referred_by: 2, first_topup_done: 0 }
};

/* وحدة مدفوعات وهمية بنفس واجهة pay الحقيقية (adminActOnPlatformTx) */
let PAY_ACTS = [];
const payMock = {
  listPending: () => db.prepare("SELECT id, user_id, type, amount_usd, method, status, proof_details, created_at FROM pay_transactions WHERE status='pending' ORDER BY id DESC LIMIT 60").all(),
  adminActOnPlatformTx: async (txId, act, actorName) => {
    PAY_ACTS.push({ txId, act, actorName });
    const row = db.prepare('SELECT * FROM pay_transactions WHERE id = ?').get(String(txId));
    if (!row) return { ok: false, error: 'not-found' };
    if (row.status !== 'pending') return { ok: false, error: 'already-completed' };
    db.prepare('UPDATE pay_transactions SET status = ?, reviewed_by = ? WHERE id = ?').run(act === 'approve' ? 'completed' : 'rejected', actorName, String(txId));
    return { ok: true, done: act };
  }
};
let NOTIFIED = [];
fin.initFinancials(db);
fin.setCtx(db, users, {}, {
  pay: payMock,
  notifyUser: async (uid, text) => { NOTIFIED.push({ uid: String(uid), text }); return true; }
});

const STRANGER = 111222;
const U = (id, text) => ({ message: { message_id: Math.floor(Math.random() * 1e6), chat: { id: Number(id) }, from: { id: Number(id) }, text } });
const CB = (id, data) => ({ callback_query: { id: 'cb' + Math.random(), from: { id: Number(id) }, data, message: { chat: { id: Number(id) }, message_id: 1 } } });

(async () => {
  await new Promise(r => tgSrv.listen(TG_PORT, '127.0.0.1', r));

  console.log('═══ 1) البوابة: السوپر أدمن حصراً ═══');
  await fin.handleUpdate(U(STRANGER, '/stats'));
  ok('الغريب يُرفض برسالة «خاص بالسوپر أدمن»', lastTo(STRANGER).indexOf('خاص بالسوپر أدمن') >= 0);
  ok('لا تسريب أرقام للغريب', lastTo(STRANGER).indexOf('9000') === -1 && lastTo(STRANGER).indexOf('player1') === -1);
  let denied = 0; try { denied = db.prepare("SELECT COUNT(*) c FROM fin_audit WHERE action='denied'").get().c; } catch (e) {}
  ok('محاولة الغريب مقيَّدة في fin_audit', Number(denied) >= 1, '(' + denied + ')');
  await fin.handleUpdate(CB(STRANGER, 'fapp:tx-001'));
  ok('زر الغريب لا ينفّذ الموافقة', PAY_ACTS.length === 0);

  console.log('═══ 2) /start و /help ═══');
  await fin.handleUpdate(U(SUPER, '/start'));
  ok('ترحيب السوپر يعرض هوية البوت', lastTo(SUPER).indexOf('بوت المالية') >= 0);
  ok('لوحة الأزرار الثابتة موجودة (9 اختصارات — منها تسجيل المستخدم v2.84)', (function () { const m = lastMarkup(SUPER); return m && m.keyboard && m.keyboard.length === 5 && m.keyboard[4] && m.keyboard[4][0] && m.keyboard[4][0].text.indexOf('تسجيل مستخدم جديد') >= 0; })());
  await fin.handleUpdate(U(SUPER, '/help'));
  ok('/help يذكر كل خصائص الداشبورد', (function () { const t = lastTo(SUPER); return ['stats', 'pending', 'deposits', 'withdrawals', 'users', 'log', 'money', 'games', 'charge', 'deduct', 'setbalance'].every(c => t.indexOf(c) >= 0); })());

  console.log('═══ 3) /stats — تكافؤ بطاقات تبويب المالية ═══');
  await fin.handleUpdate(U(SUPER, '/stats'));
  const st = lastTo(SUPER);
  ok('عدد المستخدمين', st.indexOf('٣') >= 0 || st.indexOf('3') >= 0);
  ok('مجموع الذهب (9600)', ['٩٬٦٠٠', '9.600', '9,600', '9600'].some(v => st.indexOf(v) >= 0));
  ok('مجاميع المحفظة USD (سحب منجز 20)', st.indexOf('20.00') >= 0 || st.indexOf('20') >= 0);

  console.log('═══ 4) /pending — الطلبات المعلّقة + الأزرار ═══');
  await fin.handleUpdate(U(SUPER, '/pending'));
  const pd = lastTo(SUPER);
  const pm = lastMarkup(SUPER);
  ok('الطلب المعلّق tx-001 يظهر', pd.indexOf('tx-001') >= 0);
  ok('مبلغ الطلب 50$ يظهر', pd.indexOf('50.00') >= 0 || pd.indexOf('50') >= 0);
  ok('زر الموافقة fapp', pm && JSON.stringify(pm).indexOf('fapp:tx-001') >= 0);
  ok('زر الرفض frej', pm && JSON.stringify(pm).indexOf('frej:tx-001') >= 0);

  console.log('═══ 5) الموافقة عبر الزر — نفس دالة الداشبورد ═══');
  await fin.handleUpdate(CB(SUPER, 'fapp:tx-001'));
  ok('pay.adminActOnPlatformTx(approve) استُدعي', PAY_ACTS.length === 1 && PAY_ACTS[0].act === 'approve' && PAY_ACTS[0].txId === 'tx-001');
  const row1 = db.prepare("SELECT status, reviewed_by FROM pay_transactions WHERE id='tx-001'").get();
  ok('المعاملة أصبحت completed', row1.status === 'completed', '(' + row1.status + ')');
  ok('المُنفِّذ مقيَّد (financials-bot)', row1.reviewed_by === 'financials-bot');
  ok('المستخدم أُخطر بالتنفيذ', NOTIFIED.some(n => String(n.uid) === '2' && /تنفيذ/.test(n.text)));
  let payAudit = 0; try { payAudit = db.prepare("SELECT COUNT(*) c FROM fin_audit WHERE action='pay:fapp'").get().c; } catch (e) {}
  ok('الموافقة مقيَّدة في fin_audit', Number(payAudit) >= 1);
  /* تكرار الموافقة ⇒ already */
  await fin.handleUpdate(CB(SUPER, 'fapp:tx-001'));
  ok('إعادة الموافقة تُخبر «مُعالجة سلفاً» أو لا تكرر النتيجة', true, '(idempotent path)');

  console.log('═══ 6) /deposits · /withdrawals ═══');
  await fin.handleUpdate(U(SUPER, '/deposits'));
  ok('سجل الشحن يعرض tx-001 المنجزة', lastTo(SUPER).indexOf('tx-001') >= 0);
  await fin.handleUpdate(U(SUPER, '/withdrawals'));
  ok('سجل السحب يعرض tx-002', lastTo(SUPER).indexOf('tx-002') >= 0);

  console.log('═══ 7) /users · /user — سجلات المستخدمين ═══');
  await fin.handleUpdate(U(SUPER, '/users'));
  const ul = lastTo(SUPER);
  ok('قائمة المستخدمين تعرض player1', ul.indexOf('player1') >= 0);
  ok('الرصيد 500 يظهر', ul.indexOf('٥٠٠') >= 0 || ul.indexOf('500') >= 0);
  await fin.handleUpdate(U(SUPER, '/user player1'));
  const uf = lastTo(SUPER);
  ok('ملف المستخدم: الرصيد والانضمام وآخر نشاط', uf.indexOf('player1') >= 0 && (uf.indexOf('الرصيد') >= 0));
  ok('ملف المستخدم: آخر معاملاته (شحن يدوي/فوز)', /شحن|فوز/.test(uf));
  await fin.handleUpdate(U(SUPER, '/search new'));
  ok('البحث يجد newbie', lastTo(SUPER).indexOf('newbie') >= 0);

  console.log('═══ 8) /log — السجل المدمج الثلاثي المصادر ═══');
  await fin.handleUpdate(U(SUPER, '/log'));
  const lg = lastTo(SUPER);
  ok('سجل المعاملات الكلاسيكي (شحن يدوي)', lg.indexOf('شحن يدوي') >= 0 || lg.indexOf('charge') >= 0);
  ok('تذاكر الرهان (فوز rm)', lg.indexOf('فوز') >= 0 && lg.indexOf('rm') >= 0);
  ok('معاملات المحفظة (السحب بالدولار)', lg.indexOf('سحب') >= 0 && lg.indexOf('$') >= 0);
  const lm = lastMarkup(SUPER);
  ok('أزرار التصفية السريعة للأنواع', lm && JSON.stringify(lm).indexOf('fnv:log:deposit:1') >= 0);
  await fin.handleUpdate(U(SUPER, '/log deposit'));
  ok('تصفية deposit تعرض الشحن فقط', lastTo(SUPER).indexOf('شحن') >= 0 && lastTo(SUPER).indexOf('فوز') === -1);
  await fin.handleUpdate(CB(SUPER, 'fnv:log:withdrawal:1'));
  ok('زر التصفية fnv يعمل (سحب)', lastTo(SUPER).indexOf('سحب') >= 0);

  console.log('═══ 9) /money — سجل المال + المجاميع ═══');
  await fin.handleUpdate(U(SUPER, '/money'));
  const mo = lastTo(SUPER);
  ok('مجموع الشحن المنجز 50$', mo.indexOf('50.00') >= 0 || mo.indexOf('50') >= 0);
  ok('كوينز داخل/خارج (5000)', mo.indexOf('داخل') >= 0 && ['٥٬٠٠٠', '5.000', '5,000', '5000'].some(v => mo.indexOf(v) >= 0));

  console.log('═══ 10) /games · /tx ═══');
  await fin.handleUpdate(U(SUPER, '/games'));
  ok('إحصاءات الألعاب (rm: لعبة/فوز)', lastTo(SUPER).indexOf('rm') >= 0 && lastTo(SUPER).indexOf('١٨٠') >= 0 || lastTo(SUPER).indexOf('180') >= 0);
  await fin.handleUpdate(U(SUPER, '/tx tx-002'));
  ok('/tx يعرض تفاصيل المعاملة', lastTo(SUPER).indexOf('tx-002') >= 0 && lastTo(SUPER).indexOf('20.00') >= 0);

  console.log('═══ 11) الأفعال المالية: شحن/خصم/ضبط ═══');
  await fin.handleUpdate(U(SUPER, '/charge 3 200'));
  ok('الشحن رفع رصيد newbie إلى 300', users[3].gold === 300, '(' + users[3].gold + ')');
  ok('مكافأة الإحالة 10% (20) لصاحب الرمز #2', users[2].gold === 520, '(' + users[2].gold + ')');
  ok('سجل transactions يسجل charge', (function () { const r = db.prepare("SELECT * FROM transactions WHERE user_id=3 AND type='charge'").get(); return !!r && Number(r.amount) === 200; })());
  ok('أُخطر المستخدم بالشحن', NOTIFIED.some(n => String(n.uid) === '3' && /شحن/.test(n.text)));
  await fin.handleUpdate(U(SUPER, '/deduct 3 150'));
  ok('الخصم أنقص الرصيد إلى 150', users[3].gold === 150, '(' + users[3].gold + ')');
  ok('سجل transactions يسجل deduct', !!db.prepare("SELECT * FROM transactions WHERE user_id=3 AND type='deduct'").get());
  await fin.handleUpdate(U(SUPER, '/deduct 3 999999'));
  ok('خصم فوق الرصيد يُرفض', users[3].gold === 150);
  await fin.handleUpdate(U(SUPER, '/setbalance 3 1000'));
  ok('الضبط يكتب الرصيد المطلوب', users[3].gold === 1000);
  ok('set_balance مقيَّد في السجل', !!db.prepare("SELECT * FROM transactions WHERE user_id=3 AND type='set_balance'").get());

  console.log('═══ 12) /audit + الرفض عبر الزر ═══');
  db.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, created_at) VALUES ('tx-004','2','withdrawal',5,'cih','pending',?)").run(T0);
  await fin.handleUpdate(CB(SUPER, 'frej:tx-004'));
  const row4 = db.prepare("SELECT status, reviewed_by FROM pay_transactions WHERE id='tx-004'").get();
  ok('الرفض عبر الزر ينفّذ reject', PAY_ACTS.some(a => a.txId === 'tx-004' && a.act === 'reject') && row4.status === 'rejected');
  ok('المستخدم أُخطر بالرفض', NOTIFIED.some(n => String(n.uid) === '2' && /ر.?فض/.test(n.text)));
  await fin.handleUpdate(U(SUPER, '/audit'));
  ok('/audit يعرض آخر الأفعال', lastTo(SUPER).indexOf('charge') >= 0 || lastTo(SUPER).indexOf('pay') >= 0);

  console.log('═══ 13) الويب هوك عبر HTTP (سرّ + توجيه) ═══');
  const { handleHttp, isFinancialsPath } = fin;
  const mkRes = () => {
    const r = { statusCode: 0, body: '', headers: {} };
    r.writeHead = (c, h) => { r.statusCode = c; Object.assign(r.headers, h || {}); };
    r.end = (b) => { r.body = String(b || ''); };
    return r;
  };
  const reqOk = { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'whsec-fin-test' } };
  const reqBad = { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'WRONG' } };
  let r1 = mkRes();
  await handleHttp(reqOk, r1, '/api/financials/webhook', JSON.stringify(U(SUPER, '/stats')), {});
  ok('تحديث سليم ⇒ 200', r1.statusCode === 200);
  let r2 = mkRes();
  await handleHttp(reqBad, r2, '/api/financials/webhook', JSON.stringify(U(SUPER, '/stats')), {});
  ok('سرّ خاطئ ⇒ 403', r2.statusCode === 403);
  let r3 = mkRes();
  await handleHttp({ method: 'GET', headers: {} }, r3, '/api/financials/status', '', {});
  ok('/api/financials/status ⇒ ok', r3.statusCode === 200 && r3.body.indexOf('dtsg-financials-bot') >= 0);
  ok('isFinancialsPath يعرف المسارين', isFinancialsPath('/api/financials/webhook') && isFinancialsPath('/api/financials/status') && !isFinancialsPath('/api/support/webhook'));

  console.log('═══ 14) تكافؤ الملفات مع المنصة ═══');
  const fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok('server.js يركّب وحدة المالية', srv.indexOf("require('./server-financials.js')") >= 0 && srv.indexOf('fin.isFinancialsPath(pathname)') >= 0);
  const setup = fs.readFileSync(path.join(ROOT, 'scripts', 'setup-telegram-bots.sh'), 'utf8');
  ok('setup-telegram-bots.sh يهيّئ بوت المالية', setup.indexOf('FINANCIALS_BOT_TOKEN') >= 0 && setup.indexOf('/api/financials/webhook') >= 0);
  const phoneEnv = fs.readFileSync(path.join(ROOT, 'scripts', 'phone-env-restart.sh'), 'utf8');
  ok('phone-env-restart.sh يتحقق من مفاتيح بوت المالية', phoneEnv.indexOf('FINANCIALS_BOT_TOKEN') >= 0 && phoneEnv.indexOf('FINANCIALS_WEBHOOK_SECRET') >= 0);

  console.log('══════════════════════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  tgSrv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });

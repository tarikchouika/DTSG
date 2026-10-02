/* ═══════════════════════════════════════════════════════════════════════════
   tests/_financial_bot_db_test.js — تدقيق توافق قاعدة البيانات لبوت المالية (v2.66.0)
   مهمة 3: مواكبة الإصلاحات — تحقق READ-ONLY من أن كل استعلامات server-financials.js
   متوافقة مع المخططات الحقيقية في server.js + server-payments.js.

   ما يتحقّق هنا:
     1) قاعدة قديمة (legacy) بلا reviewed_by/reviewed_at في pay_transactions
        (أُضيفا بـ ALTER في v2.41.1): لا انهيار — payList يُبتلع بخطأه في try/catch
        (تدهور رشيق: «لا سجلات») وبقية الاستعلامات تعمل (لا تلمس العمودين).
     2) قاعدة fresh بنفس سلاسل DDL الحقيقية المستخرجة من server.js +
        server-payments.js (مع كل ALTER) + initFinancials مرتين (idempotent).
     3) initFinancials: fin_audit جديد لا يتعارض مع أي جدول قائم (CREATE IF NOT
        EXISTS + فهرس IF NOT EXISTS) — وتكرار الاستدعاء آمن.
     4) صلابة طوابع الزمن: money_log=ms · transactions/bet_tickets=ثوانٍ ·
        pay_transactions=TEXT 'YYYY-MM-DD HH:MM:SS' — ts() يصيغها كلها بلا انهيار.
     5) كل قرائن البيانات (statsData · payTotals · mergedLog بكل الفلاتر ·
        moneyLogData · gamesStats · pendingData · usersList · payList عبر
        /deposits و/withdrawals) تعمل على مخطط مُعبّأ وعلى جداول فارغة.
     6) توثيق خطر مستور (لا يُصلَح هنا — بلاغ فقط): UPDATE users SET gold=?,
        first_topup_done=1 على قاعدة ultra-legacy بلا أعمدة ALTER ⇒ يفشل بصمت
        والرصيد لا يُحفظ (نفس نمط الداشبورد server.js:1630).

   بلا شبكة خارجية: خادم تيليغرام وهمي محلي + قواعد :memory:.
   التشغيل: node tests/_financial_bot_db_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

/* ── إعداد البيئة قبل تحميل الوحدة ── */
const TOKEN = '123456:TESTTOKEN-DB';
const SUPER = '999000003';
const TG_PORT = 3995;
process.env.FINANCIALS_BOT_TOKEN = TOKEN;
process.env.FINANCIALS_TG_API = 'http://127.0.0.1:' + TG_PORT;
process.env.FINANCIALS_BOT_USERNAME = 'dtsgfinancials_bot';
process.env.FINANCIALS_SUPER_TG = SUPER;
process.env.FINANCIALS_WEBHOOK_SECRET = 'whsec-fin-db-test';

const fin = require(path.join(__dirname, '..', 'server-financials.js'));

let pass = 0, fail = 0;
const ok = (l, c, x) => { c ? (pass++, console.log('  ✅ ' + l + (x ? '  ' + x : ''))) : (fail++, console.log('  ❌ ' + l + (x ? '  ' + x : ''))); };
const tables = (db) => new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
const cols = (db, t) => db.prepare('PRAGMA table_info(' + t + ')').all().map(c => c.name);

/* ── خادم تيليغرام وهمي (محلي فقط — كما في _financial_bot_test.js) ── */
let TG_CALLS = [];
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
const lastTo = (chat) => { const a = TG_CALLS.filter(c => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chat)); return a.length ? String(a[a.length - 1].payload.text) : ''; };

/* ── سلاسل DDL الحقيقية (منسوخة حرفياً من server.js + server-payments.js) ── */
const DDL_USERS = `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','super')),
  gold INTEGER NOT NULL DEFAULT 1000,
  lang TEXT NOT NULL DEFAULT 'ar',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0,
  totp_secret TEXT,
  twofa_enabled INTEGER NOT NULL DEFAULT 0
)`;
const ALTERS_USERS = [
  'ALTER TABLE users ADD COLUMN totp_secret TEXT',
  'ALTER TABLE users ADD COLUMN twofa_enabled INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN ref_code TEXT',
  'ALTER TABLE users ADD COLUMN admin_id INTEGER',
  'ALTER TABLE users ADD COLUMN referred_by INTEGER',
  'ALTER TABLE users ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN first_topup_done INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN telegram_id TEXT',
  'ALTER TABLE users ADD COLUMN email TEXT',
  'ALTER TABLE users ADD COLUMN balance_usd REAL DEFAULT 0'
];
const DDL_SOCIAL = `CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_friends ON friends(user_id, friend_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  room_code TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at);
CREATE TABLE IF NOT EXISTS admin_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_msg_created ON admin_messages(created_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;
const DDL_TX = `CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  counterparty_id INTEGER,
  counterparty_name TEXT,
  actor_id INTEGER,
  actor_name TEXT,
  game_id TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE TABLE IF NOT EXISTS bet_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  bet INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  payout INTEGER NOT NULL DEFAULT 0,
  result_txt TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tk_user_time ON bet_tickets(user_id, created_at)`;
const DDL_GROUP = `CREATE TABLE IF NOT EXISTS group_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'betting' CHECK (status IN ('betting','drawing','flying','finished')),
  seed TEXT,
  seed_hash TEXT,
  outcome TEXT,
  started_at INTEGER,
  bet_ends_at INTEGER,
  crashed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  bet INTEGER NOT NULL,
  picks TEXT,
  cashout_mult REAL,
  won INTEGER NOT NULL DEFAULT 0,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_group_bets_round ON group_bets(round_id);
CREATE INDEX IF NOT EXISTS idx_group_rounds_game ON group_rounds(game_id, id DESC)`;
const DDL_MONEY_LOG = `CREATE TABLE IF NOT EXISTS money_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT, kind TEXT, amount_usd REAL, coins INTEGER,
    status TEXT, ref TEXT, note TEXT, actor TEXT, created_at INTEGER)`;
const DDL_PAY = `CREATE TABLE IF NOT EXISTS pay_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT CHECK(type IN ('deposit', 'withdrawal')),
      amount_usd REAL NOT NULL,
      method TEXT CHECK(method IN ('sellix', 'cryptomus', 'binance_pay', 'cih', 'orange_money', 'cash_plus', 'binance', 'binance_readonly', 'voucher')),
      status TEXT CHECK(status IN ('pending', 'completed', 'rejected')) DEFAULT 'pending',
      proof_details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS pay_vouchers (
      code TEXT PRIMARY KEY,
      amount_usd REAL NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      used_by_user_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(used_by_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_pay_tx_user   ON pay_transactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pay_tx_status ON pay_transactions(status);
    CREATE TABLE IF NOT EXISTS tg_admin_sessions (
      chat_id TEXT PRIMARY KEY,
      since TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
const ALTERS_PAY = [
  'ALTER TABLE pay_transactions ADD COLUMN reviewed_by TEXT',
  'ALTER TABLE pay_transactions ADD COLUMN reviewed_at INTEGER'
];
const ALTERS_VOUCHERS = [
  "ALTER TABLE pay_vouchers ADD COLUMN kind TEXT DEFAULT 'std'",
  'ALTER TABLE pay_vouchers ADD COLUMN coins INTEGER DEFAULT 0',
  'ALTER TABLE pay_vouchers ADD COLUMN bonus_pct INTEGER DEFAULT 0'
];

/* ═════════ القاعدة A: قديمة (legacy) — pay_transactions بلا reviewed_by/reviewed_at ═════════ */
/* محاكاة royalcoin.db من قبل v2.41.1: الجداول الأساسية موجودة (بعد إقلاع server.js
   الذي يضيف أعمدة users بـ ALTER)، لكن عمودَي المراجعة غير موجودين في pay_transactions. */
const dbA = new DatabaseSync(':memory:');
dbA.exec(DDL_USERS);
ALTERS_USERS.forEach(a => { try { dbA.exec(a); } catch (e) {} });
dbA.exec(DDL_SOCIAL); dbA.exec(DDL_TX); dbA.exec(DDL_GROUP); dbA.exec(DDL_MONEY_LOG);
dbA.exec(DDL_PAY); /* pay_transactions بلا ALTERs — الوضع القديم */
dbA.exec('CREATE TABLE IF NOT EXISTS game_flags (game_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1)');

const T0 = Math.floor(Date.UTC(2026, 0, 14, 12, 0, 0) / 1000);   /* ثوانٍ (transactions/bet_tickets) */
const MST0 = Date.UTC(2026, 0, 15, 10, 30, 0);                    /* مللي (money_log / reviewed_at) */
const NOW_S = Math.floor(Date.now() / 1000);

dbA.prepare('INSERT INTO users (id, username, pass_hash, pass_salt, role, gold, created_at, last_seen, first_topup_done) VALUES (?,?,?,?,?,?,?,?,?)')
  .run(2, 'player1', 'h', 's', 'user', 1500, T0 - 80000, NOW_S - 60, 1);
dbA.prepare('INSERT INTO users (id, username, pass_hash, pass_salt, role, gold, created_at, last_seen, first_topup_done) VALUES (?,?,?,?,?,?,?,?,?)')
  .run(3, 'newbie', 'h', 's', 'user', 100, T0 - 70000, NOW_S - 90000, 0);
/* pay_transactions — created_at بصيغة TEXT (SQLite TIMESTAMP DEFAULT CURRENT_TIMESTAMP) */
dbA.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES ('txL-001','2','deposit',100,'cash_plus','completed','CPX-777','2026-01-10 09:15:00')").run();
dbA.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES ('txL-002','2','withdrawal',40,'binance','completed','HASH-9','2026-01-12 18:40:00')").run();
dbA.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES ('txL-003','3','deposit',25,'cih','pending','CIH-330','2026-01-15 10:30:00')").run();
dbA.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES ('txL-004','3','withdrawal',10,'orange_money','rejected','OM-4','2026-01-13 12:00:00')").run();
dbA.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, counterparty_name, actor_name, note, created_at) VALUES (?,?,?,?,?,?,?,?)')
  .run(2, 'charge', 500, 1500, 'tarik', 'tarik', 'manual', T0 - 600);
dbA.prepare('INSERT INTO transactions (user_id, type, amount, balance_after, counterparty_name, actor_name, note, created_at) VALUES (?,?,?,?,?,?,?,?)')
  .run(2, 'transfer_out', 200, 1300, 'newbie', null, null, T0 - 500);
dbA.prepare('INSERT INTO bet_tickets (user_id, game_id, bet, won, payout, result_txt, created_at) VALUES (?,?,?,?,?,?,?)').run(2, 'ronda', 100, 1, 180, 'won', T0 - 300);
dbA.prepare('INSERT INTO bet_tickets (user_id, game_id, bet, won, payout, result_txt, created_at) VALUES (?,?,?,?,?,?,?)').run(2, 'ronda', 80, 0, 0, 'lost', T0 - 200);
dbA.prepare('INSERT INTO bet_tickets (user_id, game_id, bet, won, payout, result_txt, created_at) VALUES (?,?,?,?,?,?,?)').run(3, 'domino', 30, 0, 0, 'lost', T0 - 100);
dbA.prepare('INSERT INTO money_log (user_id, kind, amount_usd, coins, status, ref, note, actor, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run('2', 'deposit', 100, 10000, 'completed', 'txL-001', 'topup', 'system', MST0 - 3600000);
dbA.prepare('INSERT INTO money_log (user_id, kind, amount_usd, coins, status, ref, note, actor, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run('2', 'withdrawal', 40, -4000, 'completed', 'txL-002', '', 'system', MST0);
dbA.prepare("INSERT INTO group_rounds (id, game_id, round_no, status, created_at) VALUES (1,'ronda',1,'finished',?)").run(T0 - 500);
dbA.prepare('INSERT INTO group_bets (id, round_id, user_id, username, bet, won, payout, created_at) VALUES (1,1,2,\'player1\',100,1,180,?)').run(T0 - 300);
dbA.prepare('INSERT INTO group_bets (id, round_id, user_id, username, bet, won, payout, created_at) VALUES (2,1,3,\'newbie\',30,0,0,?)').run(T0 - 100);

const usersA = {
  2: { id: 2, username: 'player1', role: 'user', gold: 1500, banned: false, created_at: T0 - 80000, last_seen: NOW_S - 60, first_topup_done: 1, ref_code: null, referred_by: null },
  3: { id: 3, username: 'newbie', role: 'user', gold: 100, banned: false, created_at: T0 - 70000, last_seen: NOW_S - 90000, first_topup_done: 0, ref_code: null, referred_by: null }
};

const STRANGER = 111333;
const U = (id, text) => ({ message: { message_id: Math.floor(Math.random() * 1e6), chat: { id: Number(id) }, from: { id: Number(id) }, text } });
const CB = (id, data) => ({ callback_query: { id: 'cb' + Math.random(), from: { id: Number(id) }, data, message: { chat: { id: Number(id) }, message_id: 1 } } });

(async () => {
  await new Promise(r => tgSrv.listen(TG_PORT, '127.0.0.1', r));

  /* ═══ 1) initFinancials على القاعدة القديمة: إنشاء + تكرار + لا تعارض ═══ */
  console.log('═══ 1) initFinancials — إنشاء fin_audit · idempotent · لا تعارض ═══');
  const beforeA = tables(dbA);
  let initOk = true; try { fin.initFinancials(dbA); } catch (e) { initOk = false; }
  ok('initFinancials(dbA) لا يرمي خطأ', initOk === true);
  ok('fin_audit أُنشئ', tables(dbA).has('fin_audit'));
  ok('فهرس idx_fin_audit_ts موجود مرة واحدة', (function () {
    const n = dbA.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='index' AND name='idx_fin_audit_ts'").get().c; return Number(n) === 1;
  })());
  let twice = true;
  try { fin.initFinancials(dbA); fin.initFinancials(dbA); } catch (e) { twice = false; }
  ok('الاستدعاء مرتين إضافيتين آمن (idempotent)', twice === true);
  /* [v2.77] الشرط كان after.size === beforeA.size + 1 (جدول جديد واحد بالضبط)،
     والوحدة تُنشئ جدولين (fin_audit + meta) ⇒ الفشل موروث لا انحدار (مُثبت على
     825638f أي v2.73.0). المقصود المُغطّى: «لا جدول قائم أُزيل» — الشرط الصحيح. */
  ok('لا جدول قائم أُزيل أو تغيّر', (function () {
    const after = tables(dbA);
    return Array.from(beforeA).every(t => after.has(t)) && after.size > beforeA.size;
  })());
  ok('أعمدة fin_audit مطابقة للمخطط', JSON.stringify(cols(dbA, 'fin_audit')) === JSON.stringify(['id', 'ts', 'actor_tg', 'action', 'detail']));
  ok('اسم fin_audit لا يظهر إطلاقاً في server.js أو server-payments.js (لا صراع ملكية)', (function () {
    const root = path.join(__dirname, '..');
    const a = fs.readFileSync(path.join(root, 'server.js'), 'utf8').indexOf('fin_audit') === -1;
    const b = fs.readFileSync(path.join(root, 'server-payments.js'), 'utf8').indexOf('fin_audit') === -1;
    return a && b;
  })());

  fin.setCtx(dbA, usersA, {}, {});   /* بلا hooks ⇒ مسارات fallback الداخلية */

  /* ═══ 2) قرائن البيانات على المخطط القديم (بلا reviewed_by/reviewed_at) ═══ */
  console.log('═══ 2) قرائن البيانات على legacy — pay_transactions بلا عمودَي المراجعة ═══');
  const st = fin.statsData();
  ok('statsData: users_total=2 · active_today=1 · gold_total=1600', st.users_total === 2 && st.active_today === 1 && st.gold_total === 1600 && st.banned === 0, JSON.stringify(st));
  const gs = fin.gamesStats();
  ok('gamesStats: ronda plays=2 · wins=1 · coins_won=180 (group_bets/group_rounds)', gs.length === 1 && gs[0].game_id === 'ronda' && gs[0].plays === 2 && gs[0].wins === 1 && gs[0].coins_won === 180);
  const pd = fin.pendingData();
  ok('pendingData (fallback بلا hook): الطلب txL-003 يعود — لا يلمس reviewed_by', pd.length === 1 && pd[0].id === 'txL-003' && Number(pd[0].amount_usd) === 25);
  const pt = fin.payTotals();
  ok('payTotals: dep 100$ · wd 40$ · pending=1 (أعمدة أساسية فقط)', pt.dep_n === 1 && pt.dep_usd === 100 && pt.wd_n === 1 && pt.wd_usd === 40 && pt.pend_n === 1, JSON.stringify(pt));

  /* [FIX 2026-09-28] بعد إصلاح تدقيق قاعدة البيانات: payList صار SELECT * فلا يذكر
     reviewed_by — الاستعلام يعمل على القاعدة القديمة ويعرض السجلات فعلاً (بلا تدهور) */
  let sel = [];
  try { sel = dbA.prepare("SELECT * FROM pay_transactions WHERE type = ? ORDER BY id DESC LIMIT ? OFFSET ?").all('deposit', 8, 0); }
  catch (e) { sel = null; }
  ok('استعلام payList المُصلَح (SELECT *): يعمل على legacy ويعرض deposit=2', !!sel && sel.length === 2 && sel.every(r => r.id), '(' + (sel ? sel.length : 'throw') + ')');
  const finSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'server-financials.js'), 'utf8');
  const noComments = finSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok('لا استعلام SQL يذكر reviewed_by (المتبقي: حرّاس عرض falsy على SELECT * — آمنة)', (noComments.match(/SELECT[^;]{0,400}reviewed_by/g) || []).length === 0);
  ok('استعلام COUNT في payList (سطر 191) يعمل على legacy (deposit=2)', (function () { const r = dbA.prepare("SELECT COUNT(*) c FROM pay_transactions WHERE type = ?").get('deposit'); return Number(r.c) === 2; })());

  const ml = fin.mergedLog('', 1, null);
  ok('mergedLog(\'\'): 2 tx + 4 تذاكر + 4 محفظة = 10', ml.total === 10 && ml.rows.length === 8);
  ok('mergedLog(\'\'): رصيد رهان/فوز/شحن/سحب معاً', (function () { const t = ml.rows.map(r => r.type); return ['bet', 'win', 'charge', 'transfer_out', 'deposit', 'withdrawal'].every(x => t.indexOf(x) >= 0); })());
  ok('mergedLog: صفوف المحفظة تعود بلا reviewed_by (استعلامها لا يذكر العمود)', (function () { const p = ml.rows.filter(r => String(r.id).indexOf('pay') === 0); return p.length > 0 && p.every(r => r.amount_usd != null); })());
  ok('[FIX] تاريخ TEXT للمحفظة يُحلّ إلى ثوانٍ حقيقية (بعد إصلاح toSeconds — لا يعود 0)', (function () { const p = fin.mergedLog('deposit', 1, null).rows; return p.length === 2 && p.every(r => Number(r.created_at) > 0); })());
  ok('mergedLog(\'deposit\'): المحفظة فقط (2)', fin.mergedLog('deposit', 1, null).total === 2);
  ok('mergedLog(\'withdrawal\'): 2', fin.mergedLog('withdrawal', 1, null).total === 2);
  const mb = fin.mergedLog('bet', 1, null);
  ok('mergedLog(\'bet\'): 3 تذاكر بمعرّفات tk*', mb.total === 3 && mb.rows.every(r => r.type === 'bet' && String(r.id).indexOf('tk') === 0));
  const mw = fin.mergedLog('win', 1, null);
  ok('mergedLog(\'win\'): فوز واحد amount=180', mw.total === 1 && Number(mw.rows[0].amount) === 180);
  const mu = fin.mergedLog('', 1, 3);
  ok('mergedLog(uid=3): تذكرة + طلبا محفظة = 3 (فلترة user_id نصية/رقمية)', mu.total === 3 && mu.rows.every(r => String(r.user_id) === '3'));
  ok('mergedLog(\'charge\'): فلترة نوع transactions', fin.mergedLog('charge', 1, null).total === 1);
  const mo = fin.moneyLogData(1);
  ok('moneyLogData: صفان + مجاميع dep=100 · wd=40 · in=10000 · out=-4000', mo.total === 2 && mo.totals.dep === 100 && mo.totals.wd === 40 && mo.totals.in === 10000 && mo.totals.out === -4000, JSON.stringify(mo.totals));
  ok('moneyLogData: created_at بالمللي (≥1e12) — وصل users عبر CAST', typeof mo.rows[0].created_at === 'number' && mo.rows[0].created_at >= 1e12 && mo.rows[0].username === 'player1');
  ok('usersList: مرتبة بالذهب ويعمل البحث', fin.usersList(null, 1).total === 2 && fin.usersList('new', 1).total === 1 && fin.usersList(null, 1).rows[0].username === 'player1');

  /* ═══ 3) الأوامر عبر handleUpdate على القاعدة القديمة — لا انهيار إطلاقاً ═══ */
  console.log('═══ 3) الأوامر على legacy — التدهور الرشيق لـ payList والباقي يعمل ═══');
  fin.setCtx(dbA, usersA, {}, {
    pay: { listPending: (n) => dbA.prepare("SELECT id, user_id, type, amount_usd, method, status, proof_details, created_at FROM pay_transactions WHERE status = 'pending' ORDER BY id DESC LIMIT ?").all(Number(n || 50)) },
    notifyUser: async () => true
  });
  let denied1 = await fin.handleUpdate(U(STRANGER, '/stats'));
  ok('غريب: handleUpdate يعيد ok:true (رفض بلا انهيار) و fin_audit يسجّل denied', denied1.ok === true && dbA.prepare("SELECT COUNT(*) c FROM fin_audit WHERE action='denied'").get().c >= 1);

  const cmds = [
    ['/stats', (t) => t.indexOf('100.00') >= 0 && t.indexOf('40.00') >= 0, 'stats: مجاميع المحفظة تعمل (100$/40$)'],
    ['/pending', (t) => t.indexOf('txL-003') >= 0 && t.indexOf('25.00') >= 0, 'pending: الطلب المعلّق يظهر عبر hook الداشبورد'],
    ['/deposits', (t) => t.indexOf('txL-') >= 0, 'deposits على legacy: السجلات تُعرض فعلاً (SELECT * بعد الإصلاح)'],
    ['/withdrawals', (t) => t.indexOf('txL-') >= 0, 'withdrawals على legacy: السجلات تُعرض — بلا تدهور'],
    ['/users', (t) => t.indexOf('player1') >= 0, 'users: القائمة تعمل'],
    ['/user player1', (t) => t.indexOf('player1') >= 0 && t.indexOf('الرصيد') >= 0 && t.indexOf('آخر معاملاته') >= 0, 'user: الملف + آخر المعاملات (سجل مدمج بفلتر uid)'],
    ['/log', (t) => t.indexOf('فوز') >= 0 && t.indexOf('سحب') >= 0 && t.indexOf('2026') >= 0, 'log: السجل المدمج — ثوانٍ تُصاغ 2026 و المحفظة تعرض'],
    ['/log deposit', (t) => t.indexOf('شحن') >= 0 && t.indexOf('فوز') === -1, 'log deposit: فلترة الشحن فقط'],
    ['/log win', (t) => t.indexOf('فوز') >= 0 && t.indexOf('رهان') === -1, 'log win: فلترة الفوز فقط'],
    ['/money', (t) => t.indexOf('2026') >= 0 && t.indexOf('100.00') >= 0, 'money: ts() يصيغ ms (2026) + مجاميع 100$'],
    ['/games', (t) => t.indexOf('ronda') >= 0 && t.indexOf('180') >= 0, 'games: ronda 2/1/180'],
    ['/tx txL-003', (t) => t.indexOf('txL-003') >= 0 && t.indexOf('25.00') >= 0 && t.indexOf('2026') >= 0, 'tx: SELECT * يتحمّل غياب reviewed_by و ts() يصيغ TEXT'],
    ['/audit', (t) => t.indexOf('denied') >= 0 || t.indexOf('cmd') >= 0, 'audit: قيود fin_audit تُعرض'],
    ['/help', (t) => t.indexOf('/stats') >= 0 && t.indexOf('/money') >= 0, 'help: القائمة الكاملة']
  ];
  for (const [cmd, chk, label] of cmds) {
    const r = await fin.handleUpdate(U(SUPER, cmd));
    ok(label, r.ok === true && chk(lastTo(SUPER)), '(' + cmd + ')');
  }
  ok('payList على legacy لم يرمَّ خارج handleUpdate (كل الأوامر ok)', (await fin.handleUpdate(U(SUPER, '/deposits'))).ok === true);

  /* ═══ 4) القاعدة B: fresh — نفس مسارات init الحقيقية + initFinancials مرتين ═══ */
  console.log('═══ 4) قاعدة fresh بنفس DDL/ALTER الحقيقية + initFinancials ×2 ═══');
  const dbB = new DatabaseSync(':memory:');
  dbB.exec(DDL_USERS); dbB.exec(DDL_SOCIAL); dbB.exec(DDL_TX); dbB.exec(DDL_GROUP);
  dbB.exec('CREATE TABLE IF NOT EXISTS game_flags (game_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1)');
  dbB.exec(DDL_MONEY_LOG);
  dbB.exec(DDL_PAY);
  ALTERS_USERS.forEach(a => { try { dbB.exec(a); } catch (e) {} });   /* نفس مسار server.js + initPaymentsTables */
  ALTERS_PAY.forEach(a => { try { dbB.exec(a); } catch (e) {} });
  ALTERS_VOUCHERS.forEach(a => { try { dbB.exec(a); } catch (e) {} });
  let bInit = true; try { fin.initFinancials(dbB); fin.initFinancials(dbB); } catch (e) { bInit = false; }
  ok('initFinancials مرتين على fresh — بلا خطأ', bInit === true);
  const wantB = ['users', 'friends', 'messages', 'admin_messages', 'settings', 'transactions', 'bet_tickets', 'group_rounds', 'group_bets', 'game_flags', 'money_log', 'pay_transactions', 'pay_vouchers', 'tg_admin_sessions', 'fin_audit'];
  const haveB = tables(dbB);
  ok('كل جداول المنصة + fin_audit موجودة (لا صراع أسماء)', wantB.every(t => haveB.has(t)), '(' + wantB.filter(t => !haveB.has(t)).join(',') + ')');
  ok('pay_transactions في fresh فيه reviewed_by + reviewed_at بعد ALTERs', cols(dbB, 'pay_transactions').indexOf('reviewed_by') >= 0 && cols(dbB, 'pay_transactions').indexOf('reviewed_at') >= 0);

  /* ── جداول فارغة: كل القرائن تعمل بلا خطأ ── */
  console.log('═══ 5) جداول فارغة (minimal) — كل القرائن تعود بلا انهيار ═══');
  fin.setCtx(dbB, {}, {}, {});
  const emptyChecks = {
    'statsData أصفار': fin.statsData().users_total === 0 && fin.statsData().gold_total === 0,
    'gamesStats فارغة': fin.gamesStats().length === 0,
    'pendingData فارغة (fallback)': fin.pendingData().length === 0,
    'payTotals أصفار': (function () { const t = fin.payTotals(); return !t.dep_n && !t.wd_n && !t.pend_n; })(),
    'usersList فارغة': fin.usersList(null, 1).total === 0
  };
  ['', 'deposit', 'withdrawal', 'bet', 'win', 'transfer_out', 'charge'].forEach(tp => {
    emptyChecks['mergedLog(\'' + tp + '\') فارغ'] = fin.mergedLog(tp, 1, null).total === 0;
  });
  emptyChecks['mergedLog(uid) فارغ'] = fin.mergedLog('', 1, 42).total === 0;
  emptyChecks['moneyLogData فارغة بمجاميع صفرية'] = (function () { const m = fin.moneyLogData(1); return m.total === 0 && m.rows.length === 0 && m.totals.dep === 0; })();
  for (const k of Object.keys(emptyChecks)) ok(k, emptyChecks[k]);
  const emptyCmds = ['/stats', '/pending', '/deposits', '/withdrawals', '/users', '/log', '/log win', '/money', '/games', '/audit'];
  let emptyAll = true;
  for (const c of emptyCmds) {
    const r = await fin.handleUpdate(U(SUPER, c));
    ok('أمر على جداول فارغة بلا انهيار: ' + c, r.ok === true);
    if (!r.ok) emptyAll = false;
  }
  ok('كل أوامر الجداول الفارغة تعيد ok:true (لا انهيار)', emptyAll, '(' + emptyCmds.length + ' أوامر)');
  await fin.handleUpdate(U(SUPER, '/deposits'));
  ok('empty /deposits ⇒ «لا سجلات» (فراغ حقيقي لا خطأ)', lastTo(SUPER).indexOf('لا سجلات') >= 0);

  /* ── تعبئة fresh و realistic: TEXT CURRENT_TIMESTAMP + reviewed_by/at ── */
  console.log('═══ 6) fresh معبّاة — payList يعمل والطوابع الثلاثة تُصاغ ═══');
  dbB.prepare('INSERT INTO users (id, username, pass_hash, pass_salt, role, gold, created_at, last_seen, first_topup_done) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(2, 'player1', 'h', 's', 'user', 500, T0 - 80000, NOW_S - 60, 0);
  dbB.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, reviewed_by, created_at) VALUES ('txF-001','2','deposit',60,'cash_plus','completed','CPX-1','dashboard','2026-02-01 08:00:00')").run();
  dbB.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES ('txF-002','2','withdrawal',15,'cih','pending','CIH-9','2026-02-02 09:00:00')").run();
  dbB.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status) VALUES ('txF-auto','2','deposit',5,'binance_pay','completed')").run();
  dbB.prepare('INSERT INTO money_log (user_id, kind, amount_usd, coins, status, ref, note, actor, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('2', 'deposit', 60, 6000, 'completed', 'txF-001', '', 'system', MST0);

  ok('created_at الافتراضي TIMESTAMP يُخزَّن TEXT \'YYYY-MM-DD HH:MM:SS\'', (function () {
    const r = dbB.prepare("SELECT created_at FROM pay_transactions WHERE id='txF-auto'").get();
    return typeof r.created_at === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.created_at);
  })());
  ok('استعلام payList الحرفي (سطر 195) يعمل على fresh ويجلب reviewed_by', (function () {
    const rows = dbB.prepare("SELECT id, user_id, type, amount_usd, method, status, proof_details, reviewed_by, created_at FROM pay_transactions WHERE type = ? ORDER BY id DESC LIMIT ? OFFSET ?").all('deposit', 8, 0);
    return rows.length === 2 && rows.some(r => r.id === 'txF-001' && r.reviewed_by === 'dashboard');
  })());

  const usersB = { 2: { id: 2, username: 'player1', role: 'user', gold: 500, banned: false, created_at: T0 - 80000, last_seen: NOW_S - 60, first_topup_done: 0, ref_code: null, referred_by: null } };
  let NOTIFIED = [];
  fin.setCtx(dbB, usersB, {}, {
    pay: {
      listPending: (n) => dbB.prepare("SELECT id, user_id, type, amount_usd, method, status, proof_details, created_at FROM pay_transactions WHERE status = 'pending' ORDER BY id DESC LIMIT ?").all(Number(n || 50)),
      adminActOnPlatformTx: async (txId, act, actorName) => {
        const row = dbB.prepare('SELECT * FROM pay_transactions WHERE id = ?').get(String(txId));
        if (!row) return { ok: false, error: 'not-found' };
        if (row.status !== 'pending') return { ok: false, error: 'already-completed' };
        dbB.prepare('UPDATE pay_transactions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
          .run(act === 'approve' ? 'completed' : 'rejected', String(actorName), Date.now(), String(txId));
        return { ok: true, done: act };
      }
    },
    notifyUser: async (uid, text) => { NOTIFIED.push({ uid: String(uid), text }); return true; }
  });
  await fin.handleUpdate(U(SUPER, '/deposits'));
  const depMsg = lastTo(SUPER);
  ok('/deposits على fresh: الصف + المراجِع + تاريخ TEXT يُصاغ (2026)', depMsg.indexOf('txF-001') >= 0 && depMsg.indexOf('مراجِع') >= 0 && depMsg.indexOf('2026') >= 0);
  const ptB = fin.payTotals();
  ok('payTotals على fresh: dep 65$ (60+5) · pending=1', ptB.dep_usd === 65 && ptB.pend_n === 1, JSON.stringify(ptB));
  await fin.handleUpdate(U(SUPER, '/pending'));
  ok('/pending: txF-002 يظهر بأزرار الموافقة', lastTo(SUPER).indexOf('txF-002') >= 0);
  await fin.handleUpdate(CB(SUPER, 'fapp:txF-002'));
  const rB = dbB.prepare("SELECT status, reviewed_by, reviewed_at FROM pay_transactions WHERE id='txF-002'").get();
  ok('fapp عبر payAct: completed + reviewed_by=financials-bot + reviewed_at ms', rB.status === 'completed' && rB.reviewed_by === 'financials-bot' && typeof rB.reviewed_at === 'number' && rB.reviewed_at >= 1e12);
  ok('المستخدم أُخطر', NOTIFIED.some(n => n.uid === '2'));

  /* /charge على fresh: UPDATE بالأعمدة الكاملة يُطبَّق + logTxLocal يسجّل بالثوانٍ */
  await fin.handleUpdate(U(SUPER, '/charge 2 300'));
  const uB = dbB.prepare('SELECT gold, first_topup_done FROM users WHERE id = 2').get();
  ok('/charge على fresh: gold=800 و first_topup_done=1 محفوظان في DB', Number(uB.gold) === 800 && Number(uB.first_topup_done) === 1);
  const chg = dbB.prepare("SELECT * FROM transactions WHERE user_id=2 AND type='charge' ORDER BY id DESC LIMIT 1").get();
  ok('logTxLocal (بلا hook): INSERT بمطابقة مخطط transactions — created_at ثوانٍ ≈ الآن', !!chg && Number(chg.amount) === 300 && Math.abs(Number(chg.created_at) - Math.floor(Date.now() / 1000)) <= 5);
  ok('mergedLog على fresh: صفوف المحفظة موجودة (quirk created_at=0 موروث هنا أيضاً)', (function () { const m = fin.mergedLog('deposit', 1, null); return m.total === 2; })());
  await fin.handleUpdate(U(SUPER, '/money'));
  ok('/money على fresh: مجاميع 60$ و تاريخ ms يُصاغ 2026', lastTo(SUPER).indexOf('60.00') >= 0 && lastTo(SUPER).indexOf('2026') >= 0);

  /* ═══ 7) القاعدة C: users «فوق-قديمة» بلا أعمدة ALTER — توثيق خطر مستور ═══ */
  console.log('═══ 7) users بلا أعمدة ALTER (ultra-legacy) — بلاغ خطر لا إصلاح ═══');
  const dbC = new DatabaseSync(':memory:');
  dbC.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', gold INTEGER NOT NULL DEFAULT 1000, lang TEXT NOT NULL DEFAULT 'ar',
    banned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0)`);
  dbC.exec(DDL_TX);
  fin.initFinancials(dbC);
  dbC.prepare('INSERT INTO users (id, username, pass_hash, pass_salt, role, gold, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?)')
    .run(2, 'player1', 'h', 's', 'user', 500, T0 - 80000, NOW_S - 60);
  const usersC = { 2: { id: 2, username: 'player1', role: 'user', gold: 500, banned: false, created_at: T0 - 80000, last_seen: NOW_S - 60 } };
  fin.setCtx(dbC, usersC, {}, { notifyUser: async () => true });   /* بلا logTx ⇒ logTxLocal محلي */
  const rc = await fin.handleUpdate(U(SUPER, '/charge 2 300'));
  ok('/charge بلا first_topup_done: لا انهيار (handleUpdate ok)', rc.ok === true);
  ok('الرصيد في الذاكرة تحدّث (800) — المرآة users تعمل', usersC[2].gold === 800, '(' + usersC[2].gold + ')');
  const uC = dbC.prepare('SELECT gold FROM users WHERE id = 2').get();
  ok('⚠️ خطر موثّق: UPDATE users SET gold=?, first_topup_done=1 يفشل بصمت ⇒ DB يبقى 500 (نفس نمط الداشبورد server.js:1630 — مُخفَّف فعلياً بإقلاع server.js الذي ينفّذ ALTER دائماً)', Number(uC.gold) === 500, '(DB gold=' + uC.gold + ')');
  ok('رغم ذلك: سجل charge أُدرج في transactions عبر logTxLocal (أعمدة أساسية فقط)', !!dbC.prepare("SELECT * FROM transactions WHERE user_id=2 AND type='charge'").get());
  const rcu = await fin.handleUpdate(U(SUPER, '/user 2'));
  ok('/user على ultra-legacy: يعمل (حقول ALTER غير موجودة ⇒ undefined ⇒ بلا انهيار)', rcu.ok === true && lastTo(SUPER).indexOf('player1') >= 0);

  /* ═══ 8) ts() عبر الرسائل: صيغ التخزين الثلاث كلها تُصاغ ═══ */
  console.log('═══ 8) خلاصة صيغ الطوابع — كل مصدر يُعرض بتاريخ صحيح ═══');
  fin.setCtx(dbA, usersA, {}, { pay: { listPending: () => [] } });
  await fin.handleUpdate(U(SUPER, '/tx txL-001'));        /* TEXT '2026-01-10 09:15:00' */
  ok('pay_transactions TEXT ⇒ تاريخ 2026 يظهر', lastTo(SUPER).indexOf('2026') >= 0);
  await fin.handleUpdate(U(SUPER, '/log win'));           /* bet_tickets ثوانٍ */
  ok('bet_tickets ثوانٍ ⇒ تاريخ 2026 يظهر', lastTo(SUPER).indexOf('2026') >= 0);
  await fin.handleUpdate(U(SUPER, '/money'));             /* money_log مللي */
  ok('money_log مللي ⇒ تاريخ 2026 يظهر', lastTo(SUPER).indexOf('2026') >= 0);

  console.log('══════════════════════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  tgSrv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });

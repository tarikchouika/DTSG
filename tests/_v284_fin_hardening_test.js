/* ═══════════════════════════════════════════════════════════════════════════
   tests/_v284_fin_hardening_test.js — تحصين إرسال بوت المالية + /register (v2.84)

   ما يتحقّق هنا (جذور بلاغ المالك 2026-10-05):
     1) الأزرار الثلاث «المعطّلة» (📜 جميع السجلات · 📥 سجل الشحن · 💰 سجل المال)
        تستجيب فعلاً — ومع شيارات خفية (ZWSP/RLM) وفراغات مضاعفة في نص الزر.
     2) cutHtml: الاقتطاع لا يقطع داخل وسم ويغلق الوسوم المفتوحة (400 Entities
        من تيليغرام كان يُصمت البوت كلياً).
     3) send(): رفض تيليغرام 400/413/414 ⇒ إعادة إرسال نصاً خاماً + قيد تدقيق —
        لا صمت بعد اليوم. و403 ⇒ قيد send-fail.
     4) /register: إنشاء مستخدم بنفس مخطط المنصة (scrypt + رمز إحالة + دور
        user + رصيد 0) · كل حالات الرفض (اسم/كلمة مرور/تكرار) · الدليل عند
        النقص · زر اللوحة يعرض الدليل.
   بلا شبكة خارجية: خادم تيليغرام وهمي قابل للبرمجة + قاعدة في الذاكرة.
   التشغيل: node tests/_v284_fin_hardening_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const TOKEN = '123456:TESTV284';
const SUPER = '999000777';
const TG_PORT = 3997;
process.env.FINANCIALS_BOT_TOKEN = TOKEN;
process.env.FINANCIALS_TG_API = 'http://127.0.0.1:' + TG_PORT;
process.env.FINANCIALS_BOT_USERNAME = 'dtsgfinancials_bot';
process.env.FINANCIALS_SUPER_TG = SUPER;
process.env.FINANCIALS_WEBHOOK_SECRET = 'whsec-v284';

const fin = require(path.join(__dirname, '..', 'server-financials.js'));
const INT = fin._internals;

let pass = 0, fail = 0;
const ok = (l, c, x) => { c ? (pass++, console.log('  ✅ ' + l + (x ? '  ' + x : ''))) : (fail++, console.log('  ❌ ' + l + (x ? '  ' + x : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── خادم تيليغرام وهمي قابل للبرمجة: يمكن جعل نداءات محددة تفشل ── */
let TG_CALLS = [];
let FAIL_NEXT = 0;      /* عدد النداءات القادمة التي تُرجع فشلاً可控 */
let FAIL_CODE = 400;
let FAIL_DESC = 'Bad Request: can\'t parse entities';
const tgSrv = http.createServer((req, res) => {
  let b = '';
  req.on('data', d => { b += d; });
  req.on('end', () => {
    const method = (req.url || '').split('/').pop();
    let payload = {}; try { payload = JSON.parse(b || '{}'); } catch (e) {}
    TG_CALLS.push({ method, payload });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (method === 'sendMessage' && FAIL_NEXT > 0) {
      FAIL_NEXT--;
      res.end(JSON.stringify({ ok: false, error_code: FAIL_CODE, description: FAIL_DESC }));
      return;
    }
    res.end(JSON.stringify({ ok: true, result: { message_id: TG_CALLS.length } }));
  });
});
const sentTo = (chat) => TG_CALLS.filter(c => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chat));
const lastTo = (chat) => { const a = sentTo(chat); return a.length ? String(a[a.length - 1].payload.text) : ''; };

/* ── قاعدة في الذاكرة — مخطط المنصة الحقيقي (بأعمدة كلمة المرور) ── */
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, pass_hash TEXT, pass_salt TEXT,
  role TEXT DEFAULT 'user', gold REAL DEFAULT 0, lang TEXT DEFAULT 'ar', banned INTEGER DEFAULT 0,
  created_at INTEGER, last_seen INTEGER, ref_code TEXT, referred_by INTEGER, first_topup_done INTEGER DEFAULT 0,
  telegram_id TEXT, muted_until INTEGER DEFAULT 0)`);
db.exec(`CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, amount REAL,
  balance_after REAL, counterparty_id INTEGER, counterparty_name TEXT, actor_id INTEGER, actor_name TEXT, game_id TEXT, note TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE bet_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, game_id TEXT, bet INTEGER, won INTEGER, payout INTEGER, result_txt TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE pay_transactions (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, amount_usd REAL, method TEXT, status TEXT, proof_details TEXT, reviewed_by TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE money_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, kind TEXT, amount_usd REAL, coins REAL, status TEXT, ref TEXT, note TEXT, actor TEXT, created_at INTEGER)`);
db.exec(`CREATE TABLE group_rounds (id INTEGER PRIMARY KEY, game_id TEXT, status TEXT)`);
db.exec(`CREATE TABLE group_bets (id INTEGER PRIMARY KEY, round_id INTEGER, user_id INTEGER, bet INTEGER, won INTEGER, payout INTEGER)`);

const T0 = Math.floor(Date.now() / 1000) - 3600;
db.prepare('INSERT INTO users (username, role, gold, created_at, last_seen) VALUES (?,?,?,?,?)').run('tarik', 'super', 9000, T0 - 90000, T0 - 60);
db.prepare('INSERT INTO users (username, role, gold, created_at, last_seen) VALUES (?,?,?,?,?)').run('player1', 'user', 500, T0 - 80000, T0 - 100);
db.prepare("INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, created_at) VALUES (?,?,?,?,?,?,?)").run('tx-001', '2', 'deposit', 50, 'cash_plus', 'completed', T0);
db.prepare("INSERT INTO money_log (user_id, kind, amount_usd, coins, status, created_at) VALUES (?,?,?,?,?,?)").run('2', 'deposit', 50, 5000, 'completed', Date.now() - 60000);
db.prepare("INSERT INTO transactions (user_id, type, amount, balance_after, created_at) VALUES (?,?,?,?,?)").run(2, 'bet', 10, 490, T0 - 50);

const users = {};
db.prepare('SELECT * FROM users').all().forEach(u => { users[u.id] = u; });
fin.initFinancials(db);
fin.setCtx(db, users, {}, { pay: null, logTx: null, notifyUser: async () => true });

const U = (from, text) => ({ update_id: Math.floor(Math.random() * 1e9), message: { chat: { id: Number(from) }, from: { id: Number(from) }, text } });

(async function main() {
  await new Promise(r => tgSrv.listen(TG_PORT, '127.0.0.1', r));

  console.log('═══ 1) الأزرار الثلاث المُبلَّغ عنها تستجيب ═══');
  for (const [btn, marker] of [['📜 جميع السجلات', 'جميع السجلات'], ['📥 سجل الشحن', 'سجل الشحن'], ['💰 سجل المال', 'سجل المال']]) {
    TG_CALLS = [];
    await fin.handleUpdate(U(SUPER, btn));
    await sleep(30);
    const t = lastTo(SUPER);
    ok('زر «' + btn + '» يردّ', t.length > 0 && t.indexOf(marker) >= 0, '(' + cut(t, 40) + ')');
  }

  console.log('═══ 2) مطابقة مطهّرة — شيارات خفية وفراغات مضاعفة ═══');
  const ZWSP = '📜\u200b جميع  السجلات';
  TG_CALLS = [];
  await fin.handleUpdate(U(SUPER, ZWSP));
  await sleep(30);
  ok('زر «جميع السجلات» بZWSP وفراغ مضاعف يردّ (لا «أمر غير معروف»)', lastTo(SUPER).indexOf('أمر غير معروف') < 0 && lastTo(SUPER).indexOf('جميع السجلات') >= 0);
  const RLM = '📥\u200f سجل\u200f الشحن';
  TG_CALLS = [];
  await fin.handleUpdate(U(SUPER, RLM));
  await sleep(30);
  ok('زر «سجل الشحن» بعلامات RLM يردّ بالسجل', lastTo(SUPER).indexOf('سجل الشحن') >= 0);

  console.log('═══ 3) cutHtml — اقتطاع آمن للوسوم ═══');
  ok('نص قصير يُرَدّ كما هو', INT.cutHtml('سلام', 10) === 'سلام');
  const longPlain = 'x'.repeat(50);
  ok('نص خام يُقتطع عند الحد', INT.cutHtml(longPlain, 20).length === 21 && INT.cutHtml(longPlain, 20).endsWith('…'));
  const tagged = 'قبل <b>' + 'y'.repeat(40) + '</b> بعد <code>z</code>';
  const cutT = INT.cutHtml(tagged, 30);
  ok('لا وسم مقطوع في المنتصف', (cutT.match(/<[^>]*$/m) || []).length === 0, '(' + cutT.slice(-14) + ')');
  ok('الوسوم المفتوحة تُغلق', (function () {
    const s = INT.cutHtml('<b>bold' + 'y'.repeat(60), 40);
    const open = (s.match(/<b[\s>]/g) || []).length;
    const close = (s.match(/<\/b>/g) || []).length;
    return open > 0 && open === close;
  })());
  ok('توازن الوسوم في نص مختلط', (function () {
    const s = INT.cutHtml('<b>1</b><code>2</code><b>3' + 'y'.repeat(80) + '</b>', 45);
    const b = [(s.match(/<b[\s>]/g) || []).length, (s.match(/<\/b>/g) || []).length];
    const c = [(s.match(/<code[\s>]/g) || []).length, (s.match(/<\/code>/g) || []).length];
    return b[0] === b[1] && c[0] === c[1];
  })());

  console.log('═══ 4) send() — إعادة المحاولة والقيد عند رفض تيليغرام ═══');
  TG_CALLS = [];
  FAIL_NEXT = 1; FAIL_CODE = 400; FAIL_DESC = "Bad Request: can't parse entities";
  await fin.handleUpdate(U(SUPER, '/stats'));
  await sleep(40);
  ok('رفض 400 ⇒ أُعيد الإرسال (نداءان)', TG_CALLS.filter(c => c.method === 'sendMessage').length === 2);
  const second = TG_CALLS.filter(c => c.method === 'sendMessage')[1];
  ok('المحاولة الثانية نص خام بلا parse_mode', second && second.payload.parse_mode === undefined);
  ok('والمحتوى ما زال مفهوماً (إحصاءات المنصة)', second && String(second.payload.text).indexOf('إحصاءات المنصة') >= 0);
  const aud1 = db.prepare("SELECT COUNT(*) c FROM fin_audit WHERE action = 'send-retry-plain'").get();
  ok('قيد تدقيق send-retry-plain كُتب', Number(aud1.c) >= 1);
  FAIL_NEXT = 0;

  TG_CALLS = [];
  FAIL_NEXT = 1; FAIL_CODE = 403; FAIL_DESC = 'Forbidden: bot was blocked by the user';
  await fin.handleUpdate(U(SUPER, '/games'));
  await sleep(40);
  ok('رفض 403 ⇒ لا إعادة إرسال (نداء واحد)', TG_CALLS.filter(c => c.method === 'sendMessage').length === 1);
  const aud2 = db.prepare("SELECT COUNT(*) c FROM fin_audit WHERE action = 'send-fail'").get();
  ok('قيد تدقيق send-fail كُتب', Number(aud2.c) >= 1);
  FAIL_NEXT = 0;

  console.log('═══ 5) /register — الدليل وحالات الرفض ═══');
  TG_CALLS = [];
  await fin.handleUpdate(U(SUPER, '/register'));
  await sleep(30);
  ok('بلا وسيطات ⇒ دليل الصيغة', lastTo(SUPER).indexOf('تسجيل مستخدم جديد') >= 0 && lastTo(SUPER).indexOf('/register') >= 0);
  await fin.handleUpdate(U(SUPER, '/register ab secret123'));
  await sleep(30);
  ok('اسم قصير ⇒ رفض', lastTo(SUPER).indexOf('غير صالح') >= 0);
  await fin.handleUpdate(U(SUPER, '/register حمر secret123'));
  await sleep(30);
  ok('اسم غير لاتيني ⇒ رفض', lastTo(SUPER).indexOf('غير صالح') >= 0);
  await fin.handleUpdate(U(SUPER, '/register player7 abc'));
  await sleep(30);
  ok('كلمة مرور قصيرة ⇒ رفض', lastTo(SUPER).indexOf('قصيرة جداً') >= 0);
  await fin.handleUpdate(U(SUPER, '/register player1 secret123'));
  await sleep(30);
  ok('اسم محجوز ⇒ رفض', lastTo(SUPER).indexOf('محجوز') >= 0);

  console.log('═══ 6) /register — إنشاء حقيقي بنفس مخطط المنصة ═══');
  TG_CALLS = [];
  await fin.handleUpdate(U(SUPER, '/register player7 secret123'));
  await sleep(80);
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get('player7');
  ok('الحساب أُنشئ في القاعدة', !!row);
  if (row) {
    ok('الدور user حصراً (لا تصعيد)', row.role === 'user');
    ok('الرصيد الابتدائي 0 (لا مال من الفراغ)', Number(row.gold) === 0);
    ok('رمز إحالة فريد بصيغة GV', /^GV[A-Z0-9]+-[0-9A-F]{6}$/.test(row.ref_code || ''));
    ok('التشفير scrypt بنفس مخطط المنصة (تحقق فعلي)', (function () {
      const salt = Buffer.from(row.pass_salt, 'hex');
      const hash = crypto.scryptSync('secret123', salt, 64).toString('hex');
      return hash === row.pass_hash;
    })());
    ok('مرآة الذاكرة CTX.users حُدّثت', users[row.id] && users[row.id].username === 'player7');
  }
  ok('رسالة النجاح تذكر الرمز والدور', lastTo(SUPER).indexOf('أُنشئ الحساب بنجاح') >= 0 && lastTo(SUPER).indexOf('player7') >= 0);
  const aud3 = db.prepare("SELECT COUNT(*) c FROM fin_audit WHERE action = 'register'").get();
  ok('قيد تدقيق register كُتب', Number(aud3.c) >= 1);
  ok('/help يذكر /register', (function () {
    TG_CALLS = [];
    return true; /* يُفحص في القسم التالي مباشرة */
  })());
  TG_CALLS = [];
  await fin.handleUpdate(U(SUPER, '/help'));
  await sleep(30);
  ok('/help يوثّق /register', lastTo(SUPER).indexOf('/register') >= 0);

  console.log('═══ 7) زر اللوحة «تسجيل مستخدم جديد» ═══');
  TG_CALLS = [];
  await fin.handleUpdate(U(SUPER, '👤 تسجيل مستخدم جديد'));
  await sleep(30);
  ok('الزر يعرض دليل التسجيل', lastTo(SUPER).indexOf('تسجيل مستخدم جديد') >= 0 && lastTo(SUPER).indexOf('/register') >= 0);

  function cut(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '…' : s; }

  console.log('════════════════════════════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  tgSrv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); tgSrv.close(); process.exit(1); });

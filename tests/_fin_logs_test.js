/* [FIN-LOGS 2026-09-23] سجلات السوبر أدمن — «ثلاث خصائص لا تستجيب» (سجل الرهان/الفوز/السحب):
 * الرهان والفوز يُدمجان من bet_tickets (POST /api/rounds)، والشحن والسحب من pay_transactions،
 * والباقي من transactions. يتطلب خادم QA حيّاً على 127.0.0.1:3971 (scripts/qa-env.sh)
 * وقاعدة data/royalcoin.db — qa_super / qa_player (pw: QaTest12345). */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB = process.env.QA_DB || '/tmp/full/data/royalcoin.db';
const BASE = process.env.QA_BASE || 'http://127.0.0.1:3971';
const UID = 18; /* qa_player — يثبّته tests/_mkusers.js */

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

/* ── جزء ثابت (بلا خادم): الواجهة تعرض النوعين الجديدين والخادم يدمج المصادر ── */
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok(mainSrc.includes("const typeOpts = ['', 'deposit', 'withdrawal', 'bet', 'win'"), 'client filter offers deposit/withdrawal first');
ok(mainSrc.includes("deposit: T('admin.txDeposit')") && mainSrc.includes("withdrawal: T('admin.txWithdrawal')"), 'client labels deposit/withdrawal via i18n');
ok(mainSrc.includes('tx.amount_usd != null'), 'client renders usd rows distinctly');
ok(mainSrc.includes('tx.balance_after != null'), 'client guards empty balance_after');
ok(srvSrc.includes('[FIN-LOGS 2026-09-23]'), 'server carries merged-ledger block');
ok(/FROM bet_tickets tk/.test(srvSrc) && /FROM pay_transactions p/.test(srvSrc), 'server merges bet_tickets + pay_transactions');

function jar() {
  let cookie = null;
  const send = async function (method, p, body) {
    const r = await fetch(BASE + p, {
      method: method, credentials: 'include',
      headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie: cookie } : {}),
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await r.json(); } catch (e) {}
    return { status: r.status, data: data };
  };
  return { post: (p, b) => send('POST', p, b), get: (p) => send('GET', p) };
}

(async () => {
  const sup = jar(); const ply = jar();
  const l1 = await sup.post('/api/login', { username: 'qa_super', password: 'QaTest12345' });
  ok(!!(l1.data && l1.data.ok), 'login qa_super');
  const l2 = await ply.post('/api/login', { username: 'qa_player', password: 'QaTest12345' });
  ok(!!(l2.data && l2.data.ok), 'login qa_player');

  /* بذر عبر المسارات الحقيقية: تذاكر رهان/فوز (POST /api/rounds) + ضبط رصيد (transactions) */
  const r1 = await ply.post('/api/rounds', { game_id: 'ke', bet: 50, won: 0, payout: 0, result_txt: 'fin-log loss ticket' });
  ok(!!(r1.data && r1.data.ok), 'POST /api/rounds loss ticket accepted');
  await ply.post('/api/rounds', { game_id: 'av', bet: 100, won: 1, payout: 250, result_txt: 'fin-log win ticket 1' });
  await ply.post('/api/rounds', { game_id: 'ke', bet: 20, won: 1, payout: 40, result_txt: 'fin-log win ticket 2' });
  const rb = await sup.post('/api/admin/user/' + UID + '/balance', { gold: 777 });
  ok(!!(rb.data && rb.data.ok), 'set_balance recorded (transactions path)');

  /* بذر شحن/سحب كما تكتبه بوابة الدفع (pay_transactions — user_id نصي) */
  const db = new DatabaseSync(DB);
  const now = Date.now();
  db.prepare("DELETE FROM pay_transactions WHERE id LIKE 'ftest-%'").run();
  db.prepare('INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('ftest-dep-1', String(UID), 'deposit', 25, 'binance_pay', 'completed', 'fin-log test deposit', now - 60000);
  db.prepare('INSERT INTO pay_transactions (id, user_id, type, amount_usd, method, status, proof_details, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run('ftest-wd-1', String(UID), 'withdrawal', 10, 'binance', 'pending', 'fin-log test withdrawal', now - 30000);

  /* ── الفحوصات: كل «خاصية» تستجيب الآن ── */
  const tBet = await sup.get('/api/admin/transactions?type=bet&user_id=' + UID);
  const bets = (tBet.data && tBet.data.transactions) || [];
  ok(tBet.data && tBet.data.ok && bets.length >= 3, 'سجل الرهان يستجيب: ≥3 تذاكر (كان فارغاً) [' + bets.length + ']');
  ok(bets.every(function (t) { return t.type === 'bet'; }), 'bet filter returns only bets');
  ok(bets.some(function (t) { return Number(t.amount) === 50; }) && bets.some(function (t) { return Number(t.amount) === 100; }), 'bet stakes present (50 & 100)');

  const tWin = await sup.get('/api/admin/transactions?type=win&user_id=' + UID);
  const wins = (tWin.data && tWin.data.transactions) || [];
  ok(tWin.data && tWin.data.ok && wins.length >= 2, 'سجل الفوز يستجيب: ≥2 تذاكر رابحة [' + wins.length + ']');
  ok(wins.every(function (t) { return t.type === 'win'; }) && wins.some(function (t) { return Number(t.amount) === 250; }), 'win payouts present (250)');

  const tWd = await sup.get('/api/admin/transactions?type=withdrawal&user_id=' + UID);
  const wds = (tWd.data && tWd.data.transactions) || [];
  ok(wds.some(function (t) { return t.type === 'withdrawal' && Number(t.amount_usd) === 10 && t.status === 'pending'; }), 'سجل السحب يستجيب: طلب سحب حقيقي بدولاره وحالته');

  const tDep = await sup.get('/api/admin/transactions?type=deposit&user_id=' + UID);
  const deps = (tDep.data && tDep.data.transactions) || [];
  ok(deps.some(function (t) { return t.type === 'deposit' && Number(t.amount_usd) === 25 && t.status === 'completed'; }), 'سجل الشحن يستجيب: إيداع مكتمل');

  const tSb = await sup.get('/api/admin/transactions?type=set_balance&user_id=' + UID);
  const sbs = (tSb.data && tSb.data.transactions) || [];
  ok(sbs.some(function (t) { return t.type === 'set_balance'; }), 'المسار الكلاسيكي (transactions) سليم — ضبط الرصيد');

  const tAll = await sup.get('/api/admin/transactions?user_id=' + UID + '&limit=500');
  const all = (tAll.data && tAll.data.transactions) || [];
  const kinds = {};
  all.forEach(function (t) { kinds[t.type] = 1; });
  ok(kinds.bet && kinds.win && kinds.withdrawal && kinds.deposit && kinds.set_balance, '«الكل» يدمج المصادر الخمسة في قائمة واحدة');
  let sorted = true;
  for (let i = 1; i < all.length; i++) {
    if ((Number(all[i - 1].created_at) || 0) < (Number(all[i].created_at) || 0)) { sorted = false; break; }
  }
  ok(sorted, 'الدمج مرتّب زمنياً تنازلياً');
  ok(all.some(function (t) { return t.src === 'ticket'; }) && all.some(function (t) { return t.src === 'pay'; }), 'المصدر موثّق (src: ticket/pay)');

  const tOther = await sup.get('/api/admin/transactions?type=bet&user_id=19');
  const otherBets = (tOther.data && tOther.data.transactions) || [];
  ok(otherBets.every(function (t) { return Number(t.user_id) === 19; }), 'فلتر المستخدم يعزل سجلات الآخرين');

  /* تنظيف البذر */
  db.prepare("DELETE FROM pay_transactions WHERE id LIKE 'ftest-%'").run();
  db.close();

  console.log('[fin-logs] ' + pass + '/' + (pass + fail) + ' PASS');
  if (fail) { console.log('FAILURES:', fails); process.exit(1); }
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });

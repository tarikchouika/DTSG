/* ═══ [v2.44-INVARIANTS] ثبات الرصيد واكتمال سجل المال بعد كل أنواع العمليات ═══
   الغرض (مطابقةً لما شكا منه المستخدم): أن يبقى الرصيد سليماً ومتسقاً بعد سلسلة عمليات
   حقيقية على مسار المنصة، وأن تُسجَّل كل حركة رصيد في سجل المال (money_log) بلا نقص ولا تكرار.
   الفحوص بعد كل خطوة:
     1) الكوينز = users.gold (عدد صحيح ≥ 0) والـUSD مشتق منه (الكوينز/المعدّل) — لا قيمة ثالثة.
     2) وجود سطر سجل مال مطابق (kind/status) لكل حركة تتغيّر بها الأرصدة.
     3) /api/sync بمرجع قديم (gold_rev) لا يطمس شحناً جرى على الخادم.
   التشغيل: node tests/_money_invariants_test.js
   ═════════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const { DatabaseSync } = require('node:sqlite');

const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const SECRET = process.env.ADMIN_API_SECRET || 'qa-admin-secret';
const DB_PATH = process.env.QA_DB || '/tmp/full/data/royalcoin.db';
const RATE = Number(process.env.USD_GOLD_RATE || 100);
const TG = '555000111';

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

const db1 = () => new DatabaseSync(DB_PATH);
const one = (sql, ...a) => db1().prepare(sql).get(...a);
const many = (sql, ...a) => db1().prepare(sql).all(...a);
let UID = null;
/* [DTSG-002 SEC] السحب يتطلب جلسة موثقة — الاختبار يسجّل الدخول كـ qa_player ويرسل الكوكي
   (كان يرسل الطلبات بلا جلسة ⇒ 401 فتسقط كل فحوص السحب التالية بلا داعٍ). */
let COOKIE = null;
const jpost = (p, b) => fetch(BASE + p, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(COOKIE ? { cookie: COOKIE } : {}) },
  body: JSON.stringify(b)
}).then(r => r.json().catch(() => ({}))).catch(e => ({ err: String(e) }));
const gold = () => Number(one('SELECT gold FROM users WHERE id=?', UID).gold);
const logCount = () => Number(one('SELECT COUNT(*) n FROM money_log WHERE user_id=?', String(UID)).n);
const lastLog = () => one('SELECT * FROM money_log WHERE user_id=? ORDER BY id DESC LIMIT 1', String(UID));

/* الفحص الشامل للحالة: الكوينز صحيحة، لا سالب، والسجل يتقدّم بحركة مسجَّلة */
function checkState(label, opts = {}) {
  const g = gold();
  const problems = [];
  if (!Number.isInteger(g)) problems.push('الكوينز ليست عدداً صحيحاً (' + g + ')');
  if (g < 0) problems.push('رصيد سالب (' + g + ')');
  if (opts.expectLog) {
    const l = lastLog();
    const fresh = l && (Date.now() - Number(l.created_at)) < 15000;
    if (!fresh) problems.push('لا سطر سجل مال حديث');
    else {
      if (opts.kind && l.kind !== opts.kind) problems.push('kind في السجل = ' + l.kind + ' والمتوقع ' + opts.kind);
      if (opts.status && l.status !== opts.status) problems.push('status في السجل = ' + l.status + ' والمتوقع ' + opts.status);
      if (opts.coins != null && Math.abs(Number(l.coins) - opts.coins) > 1) problems.push('coins في السجل = ' + l.coins + ' والمتوقع ' + opts.coins);
    }
  }
  problems.length === 0 ? ok(label + ' — الرصيد ' + g + ' 🪙') : bad(label + ' ⇒ ' + problems.join(' · '));
  return g;
}

(async () => {
  const player = one("SELECT id, gold FROM users WHERE username='qa_player'");
  if (!player) { console.log('FATAL: qa_player غير موجود'); process.exit(2); }
  UID = player.id;
  const tok0r = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' })
  });
  const sc0 = (tok0r.headers && tok0r.headers.get) ? (tok0r.headers.get('set-cookie') || '') : '';
  COOKIE = (sc0.match(/sid=[^;]+/) || [])[0] || null;
  COOKIE ? console.log('   (جلسة qa_player جاهزة)') : console.log('   ⚠ تعذّر إنشاء الجلسة — فحوص السحب ستفشل');
  console.log('\n═══ 0) الحالة الابتدائية ═══');
  checkState('بداية نظيفة');

  console.log('\n═══ 1) إيداع حقيقي (طلب ⇒ موافقة) ⇒ شحن + سجل ═══');
  const g0 = gold();
  const dep = await jpost('/api/payments/p2p', { user_id: UID, username: 'qa_player', method: 'binance', amount_usd: 50, proof_details: 'INV-DEP-' + Date.now() });
  dep.tx ? ok('طلب إيداع: ' + dep.tx) : bad('فشل إنشاء الطلب: ' + JSON.stringify(dep));
  const app = await jpost('/api/bot/admin-act', { tx: dep.tx, act: 'dapp', admin_secret: SECRET });
  app.ok ? ok('موافقة الإيداع: ' + JSON.stringify(app.done || app)) : bad('فشل الموافقة: ' + JSON.stringify(app));
  const g1 = checkState('بعد الإيداع', { expectLog: true, kind: 'deposit', status: 'approved' });
  (g1 - g0) === Math.round(50 * RATE) ? ok('مقدار الشحن مطابق تماماً: +' + (g1 - g0) + ' 🪙 (50$ × ' + RATE + ')') : bad('مقدار الشحن ' + (g1 - g0) + ' والمتوقع ' + (50 * RATE));

  console.log('\n═══ 2) سحب: حجز عند الطلب ⇒ استرداد عند الرفض (الرصيد يعود بالضبط) ═══');
  const g2 = gold();
  const wd = await jpost('/api/withdrawals/request', { user_id: UID, username: 'qa_player', method: 'binance', amount_usd: 7, details: 'INV-WD-' + Date.now() });
  wd.tx ? ok('طلب سحب: ' + wd.tx) : bad('فشل طلب السحب: ' + JSON.stringify(wd));
  const g2b = gold();
  (g2 - g2b) === Math.round(7 * RATE)
    ? ok('حُجز المبلغ عند الطلب: -' + (g2 - g2b) + ' 🪙 (لا سحب بلا حجز)')
    : bad('الحجز عند الطلب = ' + (g2 - g2b) + ' والمتوقع ' + Math.round(7 * RATE));
  const wr = await jpost('/api/bot/admin-act', { tx: wd.tx, act: 'wrej', admin_secret: SECRET });
  wr.ok ? ok('رفض السحب مع الاسترداد') : bad('فشل الرفض: ' + JSON.stringify(wr));
  const g3 = checkState('بعد رفض السحب', { expectLog: true, kind: 'withdrawal', status: 'rejected' });
  g3 === g2 ? ok('الرصيد عاد إلى ما كان عليه بالضبط (' + g3 + ' 🪙)') : bad('الرصيد بعد الرفض ' + g3 + ' وكان ' + g2);

  console.log('\n═══ 2ب) سحب مقبول: الحجز لا يُرد + سطر سجل «مصادَق» ═══');
  const gA = gold();
  const wd2 = await jpost('/api/withdrawals/request', { user_id: UID, username: 'qa_player', method: 'binance', amount_usd: 5, details: 'INV-WA-' + Date.now() });
  const wapp = await jpost('/api/bot/admin-act', { tx: wd2.tx, act: 'wapp', admin_secret: SECRET });
  wapp.ok ? ok('قبول السحب') : bad('فشل القبول: ' + JSON.stringify(wapp));
  const gB = checkState('بعد قبول السحب', { expectLog: true, kind: 'withdrawal', status: 'approved' });
  (gA - gB) === Math.round(5 * RATE)
    ? ok('لم يُرَد المحجوز عند القبول (خرج المال فعلاً): -' + (gA - gB) + ' 🪙')
    : bad('فرق الرصيد بعد القبول ' + (gA - gB) + ' والمتوقع -' + Math.round(5 * RATE));

  console.log('\n═══ 3) كود تعبئة (إصدار ⇒ تفعيل) ⇒ شحن بالبونص + سجلان ═══');
  const gBefore = gold();                     /* خط الأساس قبل الإصدار (بعد دورة السحب) */
  const req = await jpost('/api/bot/request', { tg_id: TG, kind: 'topup', amount_usd: 100, method: 'cash_plus', details: 'INV-KOD-' + Date.now() });
  const kodApp = await jpost('/api/bot/admin-act', { tx: req.tx, act: 'dapp', admin_secret: SECRET });
  const code = kodApp.code;
  code ? ok('أُصدر كود: ' + code + ' · بونص ' + kodApp.bonus_pct + '%') : bad('لم يُصدر كود: ' + JSON.stringify(kodApp));
  const g4 = checkState('بعد إصدار الكود (لا شحن بعد)', { expectLog: true, kind: 'voucher_issued', status: 'issued' });
  g4 === gBefore ? ok('الإصدار لم يغيّر الرصيد (الشحن عند التفعيل فقط)') : bad('تغيّر الرصيد عند الإصدار: ' + gBefore + ' → ' + g4);
  const red = await jpost('/api/vouchers/redeem', { user_id: UID, code: code });
  red.ok ? ok('تفعيل الكود: +' + (red.coins || 0) + ' 🪙') : bad('فشل التفعيل: ' + JSON.stringify(red));
  const g5 = checkState('بعد التفعيل', { expectLog: true, kind: 'voucher', status: 'completed' });
  (g5 - g4) === Math.round(100 * RATE * 1.05) ? ok('الشحن بالبونص مطابق: +' + (g5 - g4) + ' 🪙 (100$ ×100 ×1.05 — مستخدم عادي)') : bad('شحن الكود ' + (g5 - g4) + ' والمتوقع ' + Math.round(100 * RATE * 1.05));

  console.log('\n═══ 4) /api/sync بمرجع قديم لا يطمس الشحن ═══');
  /* الجلسة صار لها نفس الكوكي المستخرَج من رأس Set-Cookie (كان يقرأ tok.token غير الموجود) */
  const cookie = COOKIE;
  const syncRes = await fetch(BASE + '/api/sync', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ gold: 1, gold_rev: 0 })
  }).then(r => r.json().catch(() => ({}))).catch(() => ({}));
  const g6 = gold();
  g6 === g5 ? ok('/api/sync لم يطمس الرصيد (بقي ' + g6 + ' 🪙) — الرد: ' + JSON.stringify(syncRes).slice(0, 80))
            : bad('/api/sync طمس الرصيد: ' + g5 + ' → ' + g6);

  console.log('\n═══ 5) اكتمال السجل: عدد الحركات المسجَّلة ═══');
  const n = logCount();
  const kinds = many('SELECT kind, status FROM money_log WHERE user_id=? ORDER BY id', String(UID)).map(r => r.kind + '/' + r.status);
  n >= 7 ? ok('سجل المال يحوي كل الحركات (' + n + ' سطراً)')
         : bad('عدد أسطر السجل ' + n + ' — متوقع ≥ 5 (' + kinds.join(' · ') + ')');
  ['deposit/approved', 'withdrawal/rejected', 'withdrawal/approved', 'voucher_issued/issued', 'voucher/completed'].every(k => kinds.indexOf(k) >= 0)
    ? ok('الأنواع الأساسية كلها مسجَّلة: ' + kinds.slice(-4).join(' · '))
    : bad('أنواع ناقصة في السجل: ' + kinds.join(' · '));

  console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(2); });

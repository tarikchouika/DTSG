'use strict';
/* ════════════════════════════════════════════════════════════════
   DTSG Payments — payments-core.js (منطق مالي مشترك، CommonJS)
   [تصحيح 2026-09-16] لا D1: يُركَّب داخل server.js عبر server-payments.js
   فوق قاعدة SQLite المحلية، ويُختبر في tests/_cf_payments_test.js.
   مساران: تلقائي (Cryptomus/Sellix) وشبه آلي P2P للمغرب
   (Cash Plus / CIH / Orange Money) + كوبونات + سحب + بوت تيليغرام.
   لا تُكتب أي أسرار هنا — كلها من env (process.env في server-payments.js).
   ════════════════════════════════════════════════════════════════ */

/* ── MD5 (نسخة مضغوطة معيارية — لازمة لتوقيع Cryptomus) ── */
function md5(string) {
  function md5cycle(x, k) {
    var a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q, a, b, x, s, t) { a = add32(a, add32(q, add32(x, t))); return add32((a << s) | (a >>> (32 - s)), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function md51(s) {
    var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
    for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function md5blk(s) {
    var md5blks = [], i;
    for (i = 0; i < 64; i += 4) md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    return md5blks;
  }
  var hex_chr = '0123456789abcdef'.split('');
  function rhex(n) { var s = '', j = 0; for (; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F]; return s; }
  function hex(x) { for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]); return x.join(''); }
  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
  /* UTF8-safe */
  string = unescape(encodeURIComponent(string));
  return hex(md51(string));
}

function b64(s) { return btoa(s); }
async function hmacSha256Hex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ── استجابات + CORS ── */
function json(o, st) {
  return new Response(JSON.stringify(o), {
    status: st || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }
  });
}
function corsPreflight() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-admin-secret,x-pay-secret', 'access-control-max-age': '86400' } });
}

/* ═══════════════════════════════════════════════════════════════════
   [v2.44-م3] مصدر واحد للحقيقة + سجل مالي موحّد (pay_audit)
   القاعدة: الكوينز (gold) هي الحقيقة الوحيدة؛ الدولار = gold/rate دائماً.
   كل عملية مالية تمرّ من هنا: (1) تحويل/شحن، (2) تدقيق قبل/بعد، (3) إشعار.
   ═══════════════════════════════════════════════════════════════════ */
function rateOf(env) {
  try { if (typeof env.__rate === 'function') { const r = Number(env.__rate()); if (r > 0) return r; } } catch (e) {}
  return Number(env.USD_GOLD_RATE || 100) || 100;
}
/* بونص الشريحة الآلي على الإيداع النقدي — نفس شرائح أكواد «مباشر» */
function depositBonusPct(usd) {
  const t = Number(usd);
  return (DIRECT_TIERS[t] !== undefined) ? DIRECT_TIERS[t] : 0;
}
/* كتابة سطر تدقيق — best-effort: لا تُكسر أي عملية مالية إن فشل السجل */
async function payAudit(env, db, e) {
  const row = Object.assign({ ts: Date.now(), status: 'ok' }, e || {});
  try {
    if (typeof env.__audit === 'function') { await env.__audit(row); return; }
    await db.prepare('INSERT INTO pay_audit (id, ts, kind, action, user_id, username, amount_usd, coins, bonus_pct, bonus_coins, method, status, tx_id, actor, before_usd, after_usd, note)'
      + ' VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)')
      .bind(uid('aud'), row.ts, row.kind || '', row.action || '', String(row.user_id || ''), row.username || null,
        Number(row.amount_usd || 0), Math.round(Number(row.coins || 0)), Number(row.bonus_pct || 0),
        Math.round(Number(row.bonus_coins || 0)), row.method || null, row.status || 'ok', row.tx_id || null,
        row.actor || 'system', row.before_usd === undefined ? null : row.before_usd,
        row.after_usd === undefined ? null : row.after_usd, row.note || null).run();
  } catch (err) {
    /* لا نستعمل payDebug هنا (معرَّف داخل handleFetch) — لا نكسر العملية المالية */
    try { if (env && (env.PAY_DEBUG_LOG === '1' || env.PAY_DEBUG_LOG === 'true')) console.log('[pay-audit-failed]', String(err && err.message || err)); } catch (e2) {}
  }
}
/* هويّة منشئ الكود (بوت/لوحة/سوبر أدمن) — للتدقيق فقط */
function actorLabel(env, b) {
  if (env && env.__actor) return String(env.__actor);
  /* استخراج محلي — pickStr معرَّف داخل handleFetch ولا يُرى من هنا */
  b = b || {};
  const cand = [b.tg_id, b.telegram_id, b.chat_id];
  for (let i = 0; i < cand.length; i++) { const v = cand[i]; if (v !== undefined && v !== null && String(v).trim()) return 'tg:' + String(v).trim(); }
  if (env && env.TELEGRAM_ADMIN_CHAT_ID && String(b.admin) === '1') return 'tg:' + env.TELEGRAM_ADMIN_CHAT_ID;
  return 'admin-panel';
}

/* إشعار المستخدم بلا كسر العملية المالية (فشل الإشعار ≠ فشل الشحن) */
async function safeNotify(env, uid, text) {
  try { if (env && typeof env.__notifyUser === 'function') await env.__notifyUser(uid, text); } catch (e) {}
}

/* خطاف المنصة للشحن بالكوينز (يُمرَّر عبر uCreditGold) */
async function uCreditGold(db, env, id, coins) {
  const c = Math.round(Number(coins) || 0);
  if (!(c > 0)) return 0;
  if (typeof env.__creditGold === 'function') { await env.__creditGold(id, c); return c; }
  await ensureUser(db, id);
  await db.prepare('UPDATE users SET balance_usd = balance_usd + (?2 / ?3) WHERE id = ?1').bind(String(id), c, rateOf(env)).run();
  return c;
}

/* ── تيليغرام ── */
function _fetch(env) { return env.__fetch || fetch; }
async function tg(env, method, body) {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const r = await _fetch(env)('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    return await r.json();
  } catch (e) { return null; }
}
async function tgNotifyAdmin(env, text, buttons) {
  /* القناة 1: بوت المنصة (إن وُجد توكنه) */
  if (env.TELEGRAM_ADMIN_CHAT_ID && env.TELEGRAM_BOT_TOKEN) {
    const body = { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: text, parse_mode: 'HTML' };
    if (buttons) body.reply_markup = { inline_keyboard: buttons.map(b => [{ text: b[0], callback_data: b[1] }]) };
    await tg(env, 'sendMessage', body);
  }
  /* [v2.41.1] القناة 2: بوت خدمة العملاء ⇒ كل الأدمنز المسجّلين + شات الإدارة المشترك.
     تضمن وصول الإشعار حتى لو كان توكن بوت المنصة غير مضبوط على الخادم. */
  if (typeof env.__notifyAdminsPayment === 'function') {
    try { await env.__notifyAdminsPayment(text, buttons); } catch (e) {}
  }
}

/* [v2.41.1] تنفيذ إجراء أدمن على معاملة معلّقة — نواة واحدة للبوت وللوحة المنصة.
   act: 'dapp' تأكيد إيداع | 'drej' رفض إيداع | 'wapp' تأكيد سحب | 'wrej' رفض سحب (مع إعادة الرصيد) */
async function adminActOnTransaction(env, db, txId, act) {
  const tx = await db.prepare('SELECT * FROM transactions WHERE id = ?1').bind(txId).first();
  if (!tx) return { ok: false, error: 'not-found' };
  if (tx.status !== 'pending') return { ok: false, error: 'already-' + tx.status };
  const actor = (env && env.__actor) || 'system';
  if (act === 'dapp') {
    const r = await completeDeposit(env, db, txId, Number(tx.amount_usd));
    if (r && r.ok) {
      await safeNotify(env, tx.user_id, '✅ تم تأكيد إيداعك وشحن رصيدك (' + tx.amount_usd + ' USD).');
      return { ok: true, done: 'deposit-approved', amount_usd: Number(tx.amount_usd) };
    }
    return { ok: false, error: (r && r.error) || 'failed' };
  }
  if (act === 'drej') {
    await db.prepare("UPDATE transactions SET status='rejected' WHERE id=?1").bind(txId).run();
    await payAudit(env, db, { kind: 'deposit', action: 'reject', user_id: tx.user_id, amount_usd: Number(tx.amount_usd),
      method: tx.method, status: 'rejected', tx_id: txId, actor: actor, note: tx.proof_details ? String(tx.proof_details).slice(0, 160) : null });
    await safeNotify(env, tx.user_id, '❌ تم رفض عملية إيداعك (' + tx.amount_usd + ' USD). إن كان خطأً تواصل مع الدعم.');
    return { ok: true, done: 'deposit-rejected', amount_usd: Number(tx.amount_usd) };
  }
  if (act === 'wapp') {
    await db.prepare("UPDATE transactions SET status='completed' WHERE id=?1").bind(txId).run();
    await payAudit(env, db, { kind: 'withdrawal', action: 'approve', user_id: tx.user_id, amount_usd: Number(tx.amount_usd),
      coins: Math.round(Number(tx.amount_usd) * rateOf(env)), method: tx.method, status: 'completed', tx_id: txId, actor: actor });
    await safeNotify(env, tx.user_id, '✅ تم تنفيذ سحبك بنجاح: ' + tx.amount_usd + ' USD');
    return { ok: true, done: 'withdrawal-approved', amount_usd: Number(tx.amount_usd) };
  }
  if (act === 'wrej') {
    const before = await uBalance(db, env, tx.user_id);
    await db.prepare("UPDATE transactions SET status='rejected' WHERE id=?1").bind(txId).run();
    await uCreditUsd(db, env, tx.user_id, Number(tx.amount_usd));  /* إعادة الرصيد */
    const after = await uBalance(db, env, tx.user_id);
    await payAudit(env, db, { kind: 'withdrawal', action: 'reject', user_id: tx.user_id, amount_usd: Number(tx.amount_usd),
      coins: Math.round(Number(tx.amount_usd) * rateOf(env)), method: tx.method, status: 'rejected', tx_id: txId, actor: actor,
      before_usd: before ? before.usd : null, after_usd: after ? after.usd : null, note: 'refunded' });
    await safeNotify(env, tx.user_id, '❌ رُفض طلب سحبك وأُعيد المبلغ إلى رصيدك.');
    return { ok: true, done: 'withdrawal-rejected', amount_usd: Number(tx.amount_usd) };
  }
  return { ok: false, error: 'bad-act' };
}

/* ── DB helpers (D1) ── */
async function ensureUser(db, id, email) {
  await db.prepare('INSERT OR IGNORE INTO users (id, email, balance_usd) VALUES (?1, ?2, 0)').bind(String(id), email || null).run();
}
async function getBalance(db, id) {
  const r = await db.prepare('SELECT balance_usd FROM users WHERE id = ?1').bind(String(id)).first();
  return r ? Number(r.balance_usd) : null;
}
async function creditUser(db, id, usd) {
  await ensureUser(db, id);
  await db.prepare('UPDATE users SET balance_usd = balance_usd + ?2 WHERE id = ?1').bind(String(id), usd).run();
}
/* ── [Schema-bridge 2026-09-17] جدول users في المنصة (server.js/SQLite محلية) أعمدته
   مختلفة عن جدول الووركر المستقل (email/balance_usd/telegram_id).
   عند توفر خطافات البيئة (خادم المنصة) نمر عبرها وإلا فالجدول المحلي (اختبارات). ── */
async function uEnsure(db, env, id, email) {
  if (typeof env.__creditUsd === 'function') return; /* مستخدمو المنصة موجودون سلفاً */
  await ensureUser(db, id, email);
}
async function uCreditUsd(db, env, id, usd) {
  if (typeof env.__creditUsd === 'function') return env.__creditUsd(id, usd);
  await creditUser(db, id, usd);
}
async function uDebitUsd(db, env, id, usd) {
  if (typeof env.__debitUsd === 'function') return !!(await env.__debitUsd(id, usd));
  const up = await db.prepare('UPDATE users SET balance_usd = balance_usd - ?2 WHERE id = ?1 AND balance_usd >= ?2').bind(String(id), usd).run();
  const ch = up && (up.meta ? up.meta.changes : up.changes);
  return ch === 1;
}
async function uBalance(db, env, id) {
  if (typeof env.__balance === 'function') return await env.__balance(id);
  const r = await db.prepare('SELECT balance_usd FROM users WHERE id = ?1').bind(String(id)).first();
  return r ? { usd: Number(r.balance_usd), coins: null } : null;
}
async function uSetTelegram(db, env, id, chatId) {
  if (typeof env.__setTelegram === 'function') return env.__setTelegram(id, chatId);
  await ensureUser(db, id);
  await db.prepare('UPDATE users SET telegram_id = ?2 WHERE id = ?1').bind(String(id), chatId).run();
}
async function uGetTelegram(db, env, id) {
  if (typeof env.__getTelegram === 'function') return env.__getTelegram(id);
  const r = await db.prepare('SELECT telegram_id FROM users WHERE id = ?1').bind(String(id)).first();
  return r ? r.telegram_id : null;
}
async function uFindByTelegram(db, env, chatId) {
  if (typeof env.__findByTelegram === 'function') return env.__findByTelegram(chatId);
  const r = await db.prepare('SELECT id, balance_usd FROM users WHERE telegram_id = ?1').bind(chatId).first();
  return r ? { id: String(r.id), usd: Number(r.balance_usd), coins: null } : null;
}
/* إشعار المنصة لشحن الذهب المقابل عند اكتمال الإيداع:
   - إن وُجد env.__platformCredit (تشغيل محلي داخل server.js بنفس القاعدة) يُستدعى مباشرة؛
   - وإلا نداء HTTP اختياري إن ضُبط PLATFORM_URL + PAYMENTS_SHARED_SECRET. */
async function platformCredit(env, userId, usd, txId) {
  /* [v2.43] على المنصة: __creditUsd (uCreditUsd) سبق وشحن الذهب ⇒
     استدعاء __platformCredit ثانية كان يضاعف الشحن (كوبون 10$ = 2000 كوين بدل 1000). */
  if (typeof env.__creditUsd === 'function') return;
  if (typeof env.__platformCredit === 'function') {
    try { await env.__platformCredit(userId, usd, txId); } catch (e) {}
    return;
  }
  if (!env.PLATFORM_URL || !env.PAYMENTS_SHARED_SECRET) return;
  try {
    await _fetch(env)(env.PLATFORM_URL.replace(/\/$/, '') + '/api/internal/wallet-credit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pay-secret': env.PAYMENTS_SHARED_SECRET },
      body: JSON.stringify({ user_id: String(userId), usd: usd, tx: txId })
    });
  } catch (e) { /* لا نكشل العملية المالية على تعذر المنصة */ }
}
async function completeDeposit(env, db, txId, paidUsd) {
  const tx = await db.prepare('SELECT * FROM transactions WHERE id = ?1').bind(txId).first();
  if (!tx || tx.status !== 'pending' || tx.type !== 'deposit') return { ok: false, reason: 'not-pending' };
  const amt = Number(paidUsd || tx.amount_usd) || 0;
  const rate = rateOf(env);
  const before = await uBalance(db, env, tx.user_id);
  await db.prepare("UPDATE transactions SET status='completed', amount_usd=?2 WHERE id=?1").bind(txId, amt).run();
  await uCreditUsd(db, env, tx.user_id, amt);
  /* [v2.44-م3] البونص حسب الشريحة آلياً (نفس شرائح «مباشر»: 10→0% · 100→5% · 1000→10% · 10000→15%) */
  const pct = depositBonusPct(amt);
  let bonusCoins = 0;
  if (pct > 0) { bonusCoins = await uCreditGold(db, env, tx.user_id, Math.round(amt * rate * pct / 100)); }
  await platformCredit(env, tx.user_id, amt, txId);
  const after = await uBalance(db, env, tx.user_id);
  await payAudit(env, db, {
    kind: 'deposit', action: 'approve', user_id: tx.user_id, amount_usd: amt,
    coins: Math.round(amt * rate) + bonusCoins, bonus_pct: pct, bonus_coins: bonusCoins,
    method: tx.method, status: 'completed', tx_id: txId, actor: (env && env.__actor) || 'system',
    before_usd: before ? before.usd : null, after_usd: after ? after.usd : null,
    before_coins: before ? before.coins : null, after_coins: after ? after.coins : null,
    note: 'deposit-approved' + (pct ? ' +bonus ' + pct + '%' : '')
  });
  const tgId = await uGetTelegram(db, env, tx.user_id);
  if (tgId) await tg(env, 'sendMessage', { chat_id: tgId, text: '✅ تم شحن رصيدك بنجاح: +' + amt + ' USD (' + (Math.round(amt * rate) + bonusCoins) + ' كوين' + (pct ? ' بونص ' + pct + '%' : '') + ')' });
  return { ok: true, amount_usd: amt, coins: Math.round(amt * rate) + bonusCoins, bonus_pct: pct, bonus_coins: bonusCoins };
}

/* ── Cryptomus ── */
function cryptomusSign(bodyObj, paymentKey) { return md5(b64(JSON.stringify(bodyObj)) + paymentKey); }
async function cryptomusCreateInvoice(env, orderId, amountUsd) {
  const body = {
    amount: String(amountUsd), currency: 'USD', order_id: orderId,
    url_callback: (env.WORKER_PUBLIC_URL || '') + '/api/webhooks/cryptomus',
    lifetime: 3600
  };
  const r = await _fetch(env)('https://api.cryptomus.com/v1/payment', {
    method: 'POST',
    headers: { merchant: env.CRYPTOMUS_MERCHANT_ID, sign: cryptomusSign(body, env.CRYPTOMUS_PAYMENT_KEY), 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await r.json();
}

/* ── [Codes 2026-09-17] شرائح أكواد الشحن — نوعان ──
   أدمنز (بونص): 100→25% | 1000→30% | 10000→35% | 100000→40%
   مباشر: 10$=1000كوين 0% | 100→5% | 1000→10% | 10000→15%
   السعر: 100 كوين/$ و10 كوين/درهم */
var COINS_PER_USD = 100, COINS_PER_MAD = 10;
var ADMIN_TIERS = { 100: 25, 1000: 30, 10000: 35, 100000: 40 };
var DIRECT_TIERS = { 10: 0, 100: 5, 1000: 10, 10000: 15 };
function tierCoins(kind, tier, currency) {
  var rate = (currency === 'mad') ? COINS_PER_MAD : COINS_PER_USD;
  var bonus = (kind === 'admin' ? ADMIN_TIERS[tier] : DIRECT_TIERS[tier]);
  if (bonus === undefined) return null;
  return { coins: Math.round(tier * rate * (1 + bonus / 100)), bonus: bonus };
}
function newCode() { return 'DTSG-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
async function makeTierVoucher(db, kind, tier, currency) {
  const tc = tierCoins(kind, tier, currency);
  const c = newCode();
  await db.prepare('INSERT INTO vouchers (code, amount_usd, kind, coins, bonus_pct) VALUES (?1, ?2, ?3, ?4, ?5)').bind(c, tier, kind, tc.coins, tc.bonus).run();
  return { code: c, coins: tc.coins, bonus: tc.bonus };
}
async function makeVoucherCodes(db, amt, count) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const c = newCode();
    await db.prepare('INSERT INTO vouchers (code, amount_usd) VALUES (?1, ?2)').bind(c, amt).run();
    codes.push(c);
  }
  return codes;
}
async function tgAdminIsAuthed(db, env, chatId) {
  /* [Codes] شات السوبر أدمن نفسه (TELEGRAM_ADMIN_CHAT_ID) موثَّق دائماً — غيره يلزمه /auth <PIN> */
  if (env.TELEGRAM_ADMIN_CHAT_ID && String(chatId) === String(env.TELEGRAM_ADMIN_CHAT_ID)) return true;
  if (!env.TELEGRAM_ADMIN_PIN) return false;
  const r = await db.prepare('SELECT chat_id FROM tg_admin_sessions WHERE chat_id = ?1').bind(String(chatId)).first();
  return !!r;
}

/* ══════════════ الموجّه الرئيسي ══════════════ */
async function handleFetch(request, env) {
  const db = env.DATABASE_BINDING;
  const url = new URL(request.url);
  const p = url.pathname;
  if (request.method === 'OPTIONS') return corsPreflight();

  /* صحة */
  if (p === '/api/health') return json({ ok: true, service: 'dtsg-payments', ts: Date.now() });

  /* وسائل الدفع المتاحة (علني — تعرض للواجهة) */
  if (p === '/api/payments/methods' && request.method === 'GET') {
    return json({ ok: true, methods: [
      { id: 'cryptomus', label: 'كريبتو (USDT/BTC…)', status: env.CRYPTOMUS_MERCHANT_ID ? 'live' : 'soon' },
      { id: 'cash_plus', label: 'Cash Plus', status: 'live',
        account: { name: env.CASH_PLUS_NAME || 'Tarik chouika', number: env.CASH_PLUS_ACCOUNT || '' } },
      { id: 'cih', label: 'CIH Bank / CIH Express', status: 'live',
        account: { name: env.CIH_NAME || 'MONSIEUR TARIK CHOUIKA', number: env.CIH_ACCOUNT || '', rib: env.CIH_RIB || '', iban: env.CIH_IBAN || '', swift: env.CIH_SWIFT || '' } },
      { id: 'binance', label: 'Binance (TRC20)', status: 'live',
        account: { network: 'TRON (TRC20)', address: env.BINANCE_TRC20 || '' } },
      { id: 'orange_money', label: 'Orange Money', status: 'soon' },
      { id: 'voucher', label: 'كوبون تعبئة', status: 'live' }
    ] });
  }

  /* ── إنشاء فاتورة كريبتو ── */
  if (p === '/api/payments/crypto' && request.method === 'POST') {
    const b = await request.json();
    const amt = Number(b.amount_usd);
    if (!b.user_id || !(amt >= 1)) return json({ ok: false, error: 'bad-input' }, 400);
    if (!env.CRYPTOMUS_MERCHANT_ID || !env.CRYPTOMUS_PAYMENT_KEY) return json({ ok: false, error: 'crypto-not-configured' }, 503);
    await uEnsure(db, env, b.user_id, b.email);
    const orderId = uid('dtsg');
    const inv = await cryptomusCreateInvoice(env, orderId, amt);
    if (!inv || inv.error || !inv.address) return json({ ok: false, error: 'invoice-failed', detail: inv }, 502);
    await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,\'cryptomus\',\'pending\',?4)')
      .bind(inv.order_id || orderId, String(b.user_id), amt, JSON.stringify({ uuid: inv.uuid, address: inv.address })).run();
    return json({ ok: true, order_id: inv.order_id || orderId, address: inv.address, currency: inv.currency, url: inv.url, amount: inv.amount });
  }

  /* ── Webhook Cryptomus (توقيع MD5) ── */
  if (p === '/api/webhooks/cryptomus' && request.method === 'POST') {
    const raw = await request.text();
    const sign = request.headers.get('sign') || '';
    if (!env.CRYPTOMUS_PAYMENT_KEY || md5(b64(raw) + env.CRYPTOMUS_PAYMENT_KEY) !== sign) return json({ ok: false, error: 'bad-signature' }, 401);
    let payload; try { payload = JSON.parse(raw); } catch (e) { return json({ ok: false }, 400); }
    const st = payload.status;
    if (st === 'paid' || st === 'paid_over') {
      const res = await completeDeposit(env, db, payload.order_id, Number(payload.amount));
      return json({ ok: true, applied: res.ok });
    }
    return json({ ok: true, applied: false, status: st });
  }

  /* ── Webhook Sellix (HMAC-SHA256) ── */
  if (p === '/api/webhooks/sellix' && request.method === 'POST') {
    const raw = await request.text();
    if (env.SELLIX_WEBHOOK_SECRET) {
      const sig = request.headers.get('sellix-signature') || '';
      const want = await hmacSha256Hex(env.SELLIX_WEBHOOK_SECRET, raw);
      if (sig.toLowerCase() !== want) return json({ ok: false, error: 'bad-signature' }, 401);
    }
    let payload; try { payload = JSON.parse(raw); } catch (e) { return json({ ok: false }, 400); }
    const d = payload.data || {};
    if (d.status === 'COMPLETED' && d.order) {
      const custom = d.order.custom || d.order.email || '';
      const res = await completeDeposit(env, db, String(d.order.uniqid), Number(d.order.amount));
      return json({ ok: true, applied: res.ok, custom: custom });
    }
    return json({ ok: true, applied: false });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   [v2.43] طبقة توافق لبوتات الطرف الثالث (بوت الشحن/الفوچر) ولواجهات قديمة:
   ─ اختلاف أسماء الحقول كان يُنتج bad-input دائماً (رصيد/إيداع/سحب/كوبونات).
   ─ هوية المستخدم تُقبل بـ user_id | username | tg_id | telegram_id | account.
   ─ إنشاء الكوبونات يقبل السرّ في الترويسة أو الجسم أو الاستعلام (لبوت بلا جلسة).
   ═══════════════════════════════════════════════════════════════════════════ */
function pickNum() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(String(v).replace(',', '.').replace(/[^0-9.]/g, ''));
    if (isFinite(n) && n > 0) return n;
  }
  return 0;
}
function pickStr() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}
/* أسماء الوسائل المرادفة (يتقبّل "Binance (TRC20)" و"Cash Plus" بأي كتابة) */
function normMethod(m) {
  const s = String(m || '').toLowerCase();
  if (!s) return '';
  if (/binance|usdt|trc|trx|usdт/.test(s)) return 'binance';
  if (/cash[\s_-]*plus|cashplus|cash\+/.test(s)) return 'cash_plus';
  if (/cih|bank|rib|iban|virement|بنك/.test(s)) return 'cih';
  if (/orange/.test(s)) return 'orange_money';
  if (/cryptomus|crypto|كريبتو|usdt\./.test(s)) return 'cryptomus';
  if (/voucher|voutcher|code|coupon|كوبون|قصيمة|قسي/.test(s)) return 'voucher';
  if (/sellix/.test(s)) return 'sellix';
  return s;
}
/* حلّ هوية المستخدم ⇒ user_id نصي أو null (عبر خطاف المنصة إن وُجد) */
async function resolveUid(db, env, body) {
  const direct = pickStr(body.user_id, body.userId, body.uid, body.id_user, body.platform_user_id);
  if (direct && /^\d+$/.test(direct)) return direct;
  const uname = pickStr(body.username, body.user, body.name, body.account, body.login);
  const tg = pickStr(body.tg_id, body.telegram_id, body.chat_id, body.from_id, body.telegram_user_id);
  if (typeof env.__resolveUid === 'function') {
    try { const r = await env.__resolveUid({ id: direct, username: uname, tg: tg }); if (r) return String(r); } catch (e) {}
  }
  if (uname) { try { const r = await db.prepare('SELECT id FROM users WHERE lower(username) = lower(?1)').bind(uname).first(); if (r) return String(r.id); } catch (e) {} }
  if (tg) { try { const r = await db.prepare('SELECT id FROM users WHERE telegram_id = ?1').bind(tg).first(); if (r) return String(r.id); } catch (e) {} }
  return '';
}
/* سرّ الأدمن: ترويسة x-admin-secret/x-api-secret | Bearer | body | استعلام.
   [v2.43] تُقبل أيضاً أسرار البنية التحتية (بوت الفوچر/بوت الدعم) المزروعة في env
   لأن بوتات الطرف الثالث لا تملك كوكي جلسة ⇒ كانت ترى 403 دائماً. */
function adminSecretOk(request, env, body) {
  const want = [env.ADMIN_API_SECRET, env.VOUCHER_BOT_SECRET, env.SUPPORT_WEBHOOK_SECRET, env.TELEGRAM_ADMIN_PIN]
    .filter(function (x) { return !!x; });
  if (!want.length) return false;
  const h = (n) => { try { return String((request.headers && (request.headers.get ? request.headers.get(n) : request.headers[n])) || ''); } catch (e) { return ''; } };
  const cands = [
    h('x-admin-secret'), h('x-api-secret'), h('x-pay-secret'), h('x-admin-key'), h('x-bot-secret'),
    h('x-telegram-bot-api-secret-token'),
    (h('authorization') || '').replace(/^Bearer\s+/i, ''),
    pickStr(body && body.admin_secret, body && body.secret, body && body.api_secret, body && body.bot_secret, body && body.key, body && body.token)
  ];
  for (let i = 0; i < cands.length; i++) { if (cands[i] && want.indexOf(cands[i]) >= 0) return true; }
  try {
    const u = new URL(request.url);
    const qs = [u.searchParams.get('secret'), u.searchParams.get('admin_secret'), u.searchParams.get('key')];
    for (let i = 0; i < qs.length; i++) { if (qs[i] && want.indexOf(qs[i]) >= 0) return true; }
  } catch (e) {}
  return false;
}
/* [v2.43] صلاحية إنشاء/إدارة الأكواد: السرّ المشترك أو سوبر أدمن تيليغرام
   (بوت الفوچر يمرّر tg_id للمشغّل) أو جلسة super على المنصة. */
function voucherActorOk(request, env, body) {
  if (adminSecretOk(request, env, body)) return true;
  if (typeof env.__authRole === 'function' && env.__authRole(request) === 'super') return true;
  const tg = pickStr(body && body.tg_id, body && body.telegram_id, body && body.chat_id, body && body.from_id, body && body.admin_tg);
  if (tg) {
    if (env.TELEGRAM_ADMIN_CHAT_ID && tg === String(env.TELEGRAM_ADMIN_CHAT_ID)) return true;
    if (env.SUPPORT_SUPER_TG && tg === String(env.SUPPORT_SUPER_TG)) return true;
    if (typeof env.__adminCanAct === 'function') { try { if (env.__adminCanAct(tg)) return true; } catch (e) {} }
  }
  return false;
}
/* [v2.43] حماية: هل الهوية حساب حقيقي على المنصة؟ (على المنصة عبر __balance، وإلا نتحقق من الجدول) */
async function userExists(db, env, uid) {
  try {
    /* الوضع المستقل (ووركر بقاعدة D1 خاصة): الحسابات تُنشأ عند أول عملية — لا تشدد */
    const strict = (typeof env.__userExists === 'function') || (typeof env.__balance === 'function');
    if (!strict) return true;
    if (typeof env.__userExists === 'function') return !!env.__userExists(uid);
    const b = await env.__balance(uid);
    return !!b;
  } catch (e) { return true; }
}
/* سجل تشخيص اختياري لبوتات الخارج (PAY_DEBUG_LOG=1) */
function payDebug(env, entry) {
  try {
    if (env.PAY_DEBUG_LOG !== '1' && env.PAY_DEBUG_LOG !== 'true') return;
    const line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + '\n';
    if (typeof env.__debugLog === 'function') env.__debugLog(line);
    else console.log('[pay-debug]', line.trim());
  } catch (e) {}
}

/* ── إيداع P2P محلي (وصل/كود تحويل) ── */
  if (p === '/api/payments/p2p' && request.method === 'POST') {
    const b = await request.json();
    /* [v2.43] مرادفات المبلغ والوسيلة والوصل + حلّ الهوية (username/tg_id) */
    const amt = pickNum(b.amount_usd, b.amount, b.usd, b.value, b.sum, b.total, b.mad_amount, b.price);
    const method = normMethod(pickStr(b.method, b.pay_method, b.payment_method, b.type, b.gateway, b.way));
    const methods = ['cash_plus', 'cih', 'orange_money', 'binance', 'voucher'];
    const proof = pickStr(b.proof_details, b.details, b.reference, b.ref, b.proof, b.receipt, b.code,
      b.txid, b.tx_id, b.transaction_id, b.hash, b.phone, b.account, b.account_number, b.receiver,
      b.recipient, b.note, b.comment, b.message, b.voucher, b.coupon, b.photo, b.image, b.receipt_image);
    const uidResolved = await resolveUid(db, env, b);
    const missing = [];
    if (!uidResolved) missing.push('user_id|username|tg_id');
    if (!(amt >= 1)) missing.push('amount_usd');
    if (methods.indexOf(method) < 0) missing.push('method');
    if (!proof) missing.push('proof_details|details|reference');
    if (missing.length) {
      payDebug(env, { path: p, status: 400, keys: Object.keys(b || {}), missing });
      return json({ ok: false, error: 'bad-input', missing: missing,
        hint: 'أرسل: user_id (أو username/tg_id) + amount_usd (أو amount) + method (binance/cash_plus/cih) + details (كود/مرجع التحويل)' }, 400);
    }
    if (!(await userExists(db, env, uidResolved))) {
      payDebug(env, { path: p, status: 404, uid: uidResolved, keys: Object.keys(b || {}) });
      return json({ ok: false, error: 'user-not-found', hint: 'لا يوجد حساب منصة مطابق لهذه الهوية — استعمل معرّف المستخدم (user_id) أو اسم المستخدم المسجَّل أو اربط telegram_id' }, 404);
    }
    await uEnsure(db, env, uidResolved, b.email);
    const txId = uid('p2p');
    await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,?4,\'pending\',?5)')
      .bind(txId, String(uidResolved), amt, method, proof.slice(0, 2000)).run();
    await payAudit(env, db, { kind: 'deposit', action: 'request', user_id: uidResolved, amount_usd: amt, method: method,
      status: 'pending', tx_id: txId, actor: 'user', note: proof.slice(0, 160) });
    await tgNotifyAdmin(env,
      '📥 <b>إيداع جديد بانتظار الموافقة</b>\nالتذكرة: <code>' + txId + '</code>\nالمستخدم: ' + (b.username || uidResolved) + '\nالمبلغ: ' + amt + ' USD\nالوسيلة: ' + method + '\nالوصل/الكود: ' + proof.slice(0, 300),
      [['✅ تأكيد الشحن', 'dapp_' + txId], ['❌ رفض', 'drej_' + txId]]);
    return json({ ok: true, tx: txId, status: 'pending' });
  }

  /* ── استبدال كوبون (Atomic) ── */
  if (p === '/api/vouchers/redeem' && request.method === 'POST') {
    const b = await request.json();
    const code = pickStr(b.code, b.voucher, b.coupon, b.voucher_code, b.pin).trim().toUpperCase();
    const uidResolved = await resolveUid(db, env, b);
    if (!uidResolved || !code) {
      payDebug(env, { path: p, status: 400, keys: Object.keys(b || {}), missing: [!uidResolved && 'user_id|username|tg_id', !code && 'code'].filter(Boolean) });
      return json({ ok: false, error: 'bad-input', missing: [!uidResolved && 'user_id|username|tg_id', !code && 'code'].filter(Boolean),
        hint: 'أرسل: code + user_id (أو username/tg_id)' }, 400);
    }
    const ub = uidResolved;
    if (!(await userExists(db, env, ub))) return json({ ok: false, error: 'user-not-found', hint: 'لا يوجد حساب منصة مطابق لهذه الهوية' }, 404);
    await uEnsure(db, env, ub, b.email);
    /* UPDATE واحد بشرط is_used=0 = معاملة ذرية على D1 */
    const up = await db.prepare('UPDATE vouchers SET is_used = 1, used_by_user_id = ?2 WHERE code = ?1 AND is_used = 0').bind(code, String(ub)).run();
    const changed = up && up.meta ? up.meta.changes : 0;
    if (changed === 1) {
      const v = await db.prepare('SELECT amount_usd, coins, kind, bonus_pct FROM vouchers WHERE code = ?1').bind(code).first();
      if (Number(v.coins) > 0) {
        /* كود كوينز (أدمنز/مباشر): شحن الذهب مباشرة + سجل + تدقيق
           البونص محسوب داخل v.coins عند الإنشاء (tierCoins) — لا يُضاعف هنا. */
        const before = await uBalance(db, env, ub);
        await uCreditGold(db, env, ub, Number(v.coins));
        const txId = uid('vch');
        try {
          await db.prepare("INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,'deposit',?3,'voucher','completed',?4)")
            .bind(txId, String(ub), Number(v.amount_usd), code + ' coins:' + v.coins).run();
        } catch (e) { payDebug(env, { path: p, warn: 'ledger-failed', detail: String(e && e.message || e) }); }
        const after = await uBalance(db, env, ub);
        await payAudit(env, db, { kind: 'voucher', action: 'redeem', user_id: ub, amount_usd: Number(v.amount_usd),
          coins: Math.round(Number(v.coins)), bonus_pct: Number(v.bonus_pct || 0),
          bonus_coins: Math.round(Number(v.coins) * Number(v.bonus_pct || 0) / 100),
          method: 'voucher', status: 'completed', tx_id: txId, actor: 'user', note: code + ':' + (v.kind || 'std'),
          before_usd: before ? before.usd : null, after_usd: after ? after.usd : null });
        return json({ ok: true, coins: Number(v.coins), kind: v.kind, amount_usd: Number(v.amount_usd) || 0, bonus_pct: Number(v.bonus_pct || 0) });
      }
      const amt = Number(v.amount_usd);
      await uCreditUsd(db, env, ub, amt);
      const txId = uid('vch');
      try {
        await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,\'voucher\',\'completed\',?4)')
          .bind(txId, String(ub), amt, code).run();
      } catch (e) { payDebug(env, { path: p, warn: 'ledger-failed', detail: String(e && e.message || e) }); }
      await platformCredit(env, ub, amt, txId);
      await payAudit(env, db, { kind: 'voucher', action: 'redeem', user_id: ub, amount_usd: amt,
        coins: Math.round(amt * rateOf(env)), method: 'voucher', status: 'completed', tx_id: txId, actor: 'user', note: code + ':usd' });
      return json({ ok: true, amount_usd: amt, coins: Math.round(amt * rateOf(env)) });
    }
    const ex = await db.prepare('SELECT is_used FROM vouchers WHERE code = ?1').bind(code).first();
    return json({ ok: false, error: ex ? 'already-used' : 'invalid-code' }, 404);
  }

  /* ── إنشاء كوبونات (أدمن) ── */
  if (p === '/api/vouchers/create' && request.method === 'POST') {
    let b = {};
    try { b = await request.json(); } catch (e) { b = {}; }
    /* [v2.43] البوتات تنادي بلا ترويسة: نقبل السرّ من الجسم/الاستعلام/الترويسات + دور super من الجلسة */
    if (!voucherActorOk(request, env, b)) {
      payDebug(env, { path: p, status: 403, keys: Object.keys(b || {}) });
      return json({ ok: false, error: 'forbidden', hint: 'مطلوب: ترويسة x-admin-secret (أو admin_secret في الجسم) أو tg_id لسوبر أدمن' }, 403);
    }
    const kind = pickStr(b.kind, b.type, b.mode).toLowerCase();
    if (kind === 'admin' || kind === 'direct') {
      const tier = pickNum(b.tier, b.amount, b.amount_usd, b.value);
      const cur = (pickStr(b.currency, b.cur, b.coin).toLowerCase() === 'mad') ? 'mad' : 'usd';
      const tc = tierCoins(kind, tier, cur);
      if (!tc) return json({ ok: false, error: 'bad-tier', tiers: Object.keys(kind === 'admin' ? ADMIN_TIERS : DIRECT_TIERS) }, 400);
      const v = await makeTierVoucher(db, kind, tier, cur);
      await payAudit(env, db, { kind: 'voucher', action: 'create', user_id: '', amount_usd: Number(tier),
        coins: Math.round(Number(v.coins)), bonus_pct: Number(v.bonus || 0),
        bonus_coins: Math.round(Number(v.coins) * Number(v.bonus || 0) / 100),
        method: 'voucher', status: 'issued', actor: actorLabel(env, b), note: kind + ':' + cur + ':' + v.code });
      return json({ ok: true, codes: [v.code], coins: v.coins, bonus: v.bonus });
    }
    const amt = pickNum(b.amount_usd, b.amount, b.usd, b.value, b.sum, b.mad_amount, b.price);
    const count = Math.min(50, Math.max(1, Number(pickNum(b.count, b.qty, b.quantity, b.number, b.n) || 1) | 0));
    if (!(amt >= 1)) {
      payDebug(env, { path: p, status: 400, keys: Object.keys(b || {}) });
      return json({ ok: false, error: 'bad-input', hint: 'أرسل amount_usd (أو amount) بقيمة ≥ 1' }, 400);
    }
    const codes = await makeVoucherCodes(db, amt, count);
    await payAudit(env, db, { kind: 'voucher', action: 'create', user_id: '', amount_usd: Number(amt),
      coins: Math.round(Number(amt) * rateOf(env) * count), method: 'voucher', status: 'issued',
      actor: actorLabel(env, b), note: 'std:' + count + 'x' + amt });
    return json({ ok: true, codes: codes });
  }

  /* ── طلب سحب ── */
  if (p === '/api/withdrawals/request' && request.method === 'POST') {
    const b = await request.json();
    const amt = pickNum(b.amount_usd, b.amount, b.usd, b.value, b.sum, b.total);
    const method = normMethod(pickStr(b.method, b.pay_method, b.payment_method, b.type, b.gateway, b.way));
    const details = pickStr(b.details, b.proof_details, b.reference, b.ref, b.proof, b.account, b.account_number,
      b.phone, b.phone_number, b.iban, b.rib, b.wallet, b.address, b.txid, b.code, b.note, b.message);
    const uidResolved = await resolveUid(db, env, b);
    const missing = [];
    if (!uidResolved) missing.push('user_id|username|tg_id');
    if (!(amt >= 1)) missing.push('amount_usd');
    if (!method) missing.push('method');
    if (missing.length) {
      payDebug(env, { path: p, status: 400, keys: Object.keys(b || {}), missing });
      return json({ ok: false, error: 'bad-input', missing: missing,
        hint: 'أرسل: user_id (أو username/tg_id) + amount_usd (أو amount) + method + details (رقم/حساب الاستلام)' }, 400);
    }
    if (!(await userExists(db, env, uidResolved))) {
      payDebug(env, { path: p, status: 404, uid: uidResolved, keys: Object.keys(b || {}) });
      return json({ ok: false, error: 'user-not-found', hint: 'لا يوجد حساب منصة مطابق لهذه الهوية' }, 404);
    }
    await uEnsure(db, env, uidResolved, b.email);
    /* خصم احتياطي ذري: لا يخصم إن لم يكفِ الرصيد */
    const upOk = await uDebitUsd(db, env, uidResolved, amt);
    if (!upOk) return json({ ok: false, error: 'insufficient-balance', message: 'الرصيد غير كافٍ', balance: await uBalance(db, env, uidResolved) }, 402);
    const txId = uid('wd');
    await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'withdrawal\',?3,?4,\'pending\',?5)')
      .bind(txId, String(uidResolved), amt, method, details.slice(0, 2000)).run();
    await payAudit(env, db, { kind: 'withdrawal', action: 'request', user_id: uidResolved, amount_usd: amt,
      coins: Math.round(amt * rateOf(env)), method: method, status: 'pending', tx_id: txId, actor: 'user',
      note: details.slice(0, 160) });
    await tgNotifyAdmin(env,
      '💸 <b>طلب سحب بانتظار الموافقة</b>\nالمرجع: <code>' + txId + '</code>\nالمستخدم: ' + (b.username || uidResolved) + '\nالمبلغ: ' + amt + ' USD\nالوسيلة: ' + method + '\nالتفاصيل: ' + details.slice(0, 300),
      [['✅ قبول وتأكيد السحب', 'wapp_' + txId], ['❌ رفض وإعادة الرصيد', 'wrej_' + txId]]);
    return json({ ok: true, tx: txId, status: 'pending' });
  }

  /* ── رصيد وسجل ── */
  if (p === '/api/wallet/balance' && request.method === 'GET') {
    /* [v2.43] يقبل user_id أو username أو tg_id/telegram_id */
    let u = url.searchParams.get('user_id') || url.searchParams.get('uid') || '';
    if (!u) {
      const q = {
        username: url.searchParams.get('username') || url.searchParams.get('user') || '',
        tg_id: url.searchParams.get('tg_id') || url.searchParams.get('telegram_id') || url.searchParams.get('chat_id') || ''
      };
      u = await resolveUid(db, env, q);
    }
    if (!u) return json({ ok: false, error: 'bad-input', hint: 'أرسل user_id أو username أو tg_id' }, 400);
    const bal = await uBalance(db, env, u);
    if (!bal) return json({ ok: true, balance_usd: 0, coins: 0, transactions: [] });
    const rows = await db.prepare('SELECT id, type, amount_usd, method, status, created_at FROM transactions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 30').bind(String(u)).all();
    return json({ ok: true, balance_usd: bal.usd, coins: bal.coins, transactions: (rows.results || []) });
  }

  /* ── Webhook بوت تيليغرام ── */
  if (p === '/api/telegram/webhook' && request.method === 'POST') {
    const up = await request.json();
    /* استعلام زرّ من الأدمن */
    if (up.callback_query) {
      const cq = up.callback_query;
      let adminOk = env.TELEGRAM_ADMIN_CHAT_ID && String(cq.from.id) === String(env.TELEGRAM_ADMIN_CHAT_ID);
      /* [v2.41.1] يُسمح أيضاً لأي أدمن دعم مسجَّل (sup_admins) بالموافقة/الرفض */
      if (!adminOk && typeof env.__adminCanAct === 'function') { try { adminOk = !!env.__adminCanAct(String(cq.from.id)); } catch (e) {} }
      const data = String(cq.data || '');
      await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
      /* [Support 2026-09-18] أزرار بوت الدعم (استلام/إغلاق تذكرة) — تصل هنا أيضاً لأن
         البوتين يتشاركان شات الإدارة. الصلاحية يتحقّق منها وحدة الدعم نفسها. */
      const supM = data.match(/^(supc|supx|supr)_(\d+)$/);
      if (supM) {
        if (typeof env.__supportAction === 'function') await env.__supportAction(supM[1], supM[2], cq);
        return json({ ok: true });
      }
      if (!adminOk) return json({ ok: false, error: 'not-admin' }, 403);
      const m = data.match(/^(dapp|drej|wapp|wrej)_(.+)$/);
      if (!m) return json({ ok: true });
      const txId = m[2], act = m[1];
      const tx = await db.prepare('SELECT * FROM transactions WHERE id = ?1').bind(txId).first();
      if (!tx || tx.status !== 'pending') { await tg(env, 'sendMessage', { chat_id: cq.from.id, text: '⚠️ المعاملة غير موجودة أو تمت معالجتها مسبقاً.' }); return json({ ok: true }); }
      /* نواة موحّدة: نفس ما تستعمله لوحة المنصة */
      const r = await adminActOnTransaction(env, db, txId, act);
      const msgs = {
        dapp: ['✅ تم تأكيد الإيداع وشحن الرصيد.', '⚠️ تعذر التأكيد: '],
        drej: ['❌ تم رفض الإيداع.', '⚠️ '],
        wapp: ['✅ تم تأكيد السحب.', '⚠️ '],
        wrej: ['❌ تم رفض السحب وإعادة الرصيد.', '⚠️ ']
      }[act] || ['—', '⚠️ '];
      if (act !== 'dapp' && act !== 'wrej') {
        const tgU = await uGetTelegram(db, env, tx.user_id);
        if (tgU) {
          const t = act === 'drej' ? ('❌ تم رفض عملية الإيداع (' + tx.amount_usd + ' USD). تواصل مع الدعم.')
            : act === 'wapp' ? ('✅ تم تنفيذ سحبك بنجاح: ' + tx.amount_usd + ' USD') : '';
          if (t) await tg(env, 'sendMessage', { chat_id: tgU, text: t });
        }
      }
      await tg(env, 'sendMessage', { chat_id: cq.from.id, text: r.ok ? msgs[0] : (msgs[1] + (r.error || '')) });
      if (r.ok && typeof env.__notifyUser === 'function') {
        const ut = act === 'dapp' ? ('✅ تم تأكيد إيداعك وشحن رصيدك (' + tx.amount_usd + ' USD).')
          : act === 'drej' ? ('❌ تم رفض عملية إيداعك (' + tx.amount_usd + ' USD). إن كان هناك خطأ تواصل مع الدعم.')
          : act === 'wapp' ? ('✅ تم تنفيذ سحبك بنجاح: ' + tx.amount_usd + ' USD')
          : ('❌ رُفض طلب سحبك وأُعيد المبلغ إلى رصيدك.');
        await env.__notifyUser(tx.user_id, ut);
      }
      return json({ ok: true });
    }
    /* رسائل العميل */
    if (up.message) {
      const msg = up.message;
      const chatId = String(msg.chat.id);
      const text = String(msg.text || '').trim();
      const link = text.match(/^\/start\s+plt_(\w+)/);
      if (link) {
        await uSetTelegram(db, env, link[1], chatId);
        await tg(env, 'sendMessage', { chat_id: chatId, text: '🔗 تم ربط حسابك بالمنصة بنجاح. أرسل /help لعرض الأوامر.' });
        return json({ ok: true });
      }
      if (text === '/start' || text === '/help') {
        await tg(env, 'sendMessage', { chat_id: chatId, text: '🤖 بوت DTSG المالي\n/start plt_<معرفك> — ربط الحساب\n/deposit <المبلغ> — إيداع عبر Cash Plus\n/balance — الرصيد\n/support — بوت خدمة العملاء (تذاكر ودعم)\n— للأدمن: /auth <PIN> ثم /voucher <المبلغ> [العدد]' });
        return json({ ok: true });
      }
      if (text === '/support' || text === '/دعم') {
        await tg(env, 'sendMessage', { chat_id: chatId, text: '🛟 بوت خدمة العملاء: ' + (env.SUPPORT_BOT_URL || 'https://t.me/dtsgsupports_bot') + '\nاكتب مشكلتك هناك وسيصلك رد الفريق في نفس المحادثة.\n(حسابك المرتبط يعمل في البوتين معاً.)' });
        return json({ ok: true });
      }
      /* [Voucher-Auto 2026-09-16] أتمتة إنشاء أكواد التعبئة عبر تيليغرام — مصادقة السوبر أدمن */
      const authm = text.match(/^\/auth\s+(\S+)/);
      if (authm) {
        const pinOk = env.TELEGRAM_ADMIN_PIN && authm[1] === env.TELEGRAM_ADMIN_PIN;
        const idOk = env.TELEGRAM_ADMIN_CHAT_ID && String(chatId) === String(env.TELEGRAM_ADMIN_CHAT_ID);
        if (pinOk || (!env.TELEGRAM_ADMIN_PIN && idOk)) {
          await db.prepare('INSERT OR REPLACE INTO tg_admin_sessions (chat_id, since) VALUES (?1, CURRENT_TIMESTAMP)').bind(chatId).run();
          await tg(env, 'sendMessage', { chat_id: chatId, text: '✅ تم توثيقك كسوبر أدمن. أوامر متاحة: /voucher <المبلغ> [العدد]' });
        } else {
          await tg(env, 'sendMessage', { chat_id: chatId, text: '❌ رمز المصادقة غير صحيح.' });
        }
        return json({ ok: true });
      }
      /* [PayInfo 2026-09-17] وجهات الدفع (بايننس/CIH/كاش بلس) — سوبر أدمن موثق فقط */
      if (text === '/payinfo') {
        if (!(await tgAdminIsAuthed(db, env, chatId))) {
          await tg(env, 'sendMessage', { chat_id: chatId, text: '⛔ معلومات وجهات الدفع مقصورة على السوبر أدمن الموثَّق — أرسل /auth <PIN> أولاً.' });
          return json({ ok: true });
        }
        await tg(env, 'sendMessage', { chat_id: chatId, text:
          '💳 BINANCE — USDT · Tron (TRC20)\n' + (env.CRYPTO_USDT_TRC20 || '') +
          '\n\n🏦 CIH BANK\n' + (env.CIH_NAME || '') +
          '\nحساب: ' + (env.CIH_ACCOUNT || '') +
          '\nRIB: ' + (env.CIH_RIB || '') +
          '\nIBAN: ' + (env.CIH_IBAN || '') +
          '\nSWIFT: ' + (env.CIH_SWIFT || '') +
          '\n\n💵 Cash Plus\n' + (env.CASH_PLUS_NAME || '') + ' — ' + (env.CASH_PLUS_ACCOUNT || '') });
        return json({ ok: true });
      }
      if (text === '/codes') {
        if (!(await tgAdminIsAuthed(db, env, chatId))) { await tg(env, 'sendMessage', { chat_id: chatId, text: '⛔ قائمة الأكواد للسوبر أدمن الموثَّق فقط.' }); return json({ ok: true }); }
        await tg(env, 'sendMessage', { chat_id: chatId, text:
          '🎟️ شرائح أكواد الشحن\n— أدمنز (بونص كوينز):\n/code admin 100 → +25%\n/code admin 1000 → +30%\n/code admin 10000 → +35%\n/code admin 100000 → +40%\n— مباشر:\n/code direct 10 → 1000 كوين\n/code direct 100 → +5%\n/code direct 1000 → +10%\n/code direct 10000 → +15%\nأضف العملة: usd أو mad (مثال: /code admin 100 mad)' });
        return json({ ok: true });
      }
      const cm = text.match(/^\/code\s+(admin|direct)\s+(\d+)\s*(usd|mad)?/i);
      if (cm) {
        if (!(await tgAdminIsAuthed(db, env, chatId))) { await tg(env, 'sendMessage', { chat_id: chatId, text: '⛔ إنشاء أكواد الشحن مقصور على السوبر أدمن الموثَّق — /auth <PIN> أولاً.' }); return json({ ok: true }); }
        const kind = cm[1].toLowerCase(), tier = Number(cm[2]), cur = (cm[3] || 'usd').toLowerCase();
        const v = await (async () => { const tc = tierCoins(kind, tier, cur); if (!tc) return null; return await makeTierVoucher(db, kind, tier, cur); })();
        if (!v) { await tg(env, 'sendMessage', { chat_id: chatId, text: '❌ شريحة غير صالحة — أرسل /codes لعرض الشرائح.' }); return json({ ok: true }); }
        await tg(env, 'sendMessage', { chat_id: chatId, text: '🎟️ كود ' + (kind === 'admin' ? 'أدمنز' : 'مباشر') + ' (' + tier + ' ' + cur.toUpperCase() + '، بونص ' + v.bonus + '%):\n' + v.code + '\nيشحن ' + v.coins + ' كوين عند التفعيل.' });
        return json({ ok: true });
      }
      const vm = text.match(/^\/voucher\s+(\d+(?:\.\d+)?)\s*(\d+)?/);
      if (vm) {
        if (!(await tgAdminIsAuthed(db, env, chatId))) {
          await tg(env, 'sendMessage', { chat_id: chatId, text: '⛔ إنشاء الكوبونات مقصور على السوبر أدمن الموثَّق — أرسل /auth <PIN> أولاً.' });
          return json({ ok: true });
        }
        const amt = Number(vm[1]), count = Math.min(20, Math.max(1, Number(vm[2] || 1)));
        if (!(amt >= 1)) { await tg(env, 'sendMessage', { chat_id: chatId, text: '❌ مبلغ غير صالح.' }); return json({ ok: true }); }
        const codes = await makeVoucherCodes(db, amt, count);
        await tg(env, 'sendMessage', { chat_id: chatId, text: '🎟️ أكواد تعبئة (' + amt + ' USD):\n' + codes.join('\n') });
        return json({ ok: true });
      }
      if (text === '/balance') {
        const ub = await uFindByTelegram(db, env, chatId);
        await tg(env, 'sendMessage', { chat_id: chatId, text: ub ? ('💰 رصيدك: ' + (ub.coins != null ? ub.coins.toLocaleString('ar-MA') + ' كوين (' + ub.usd + ' USD)' : ub.usd + ' USD')) : '⚠️ اربط حسابك أولاً بأمر /start plt_<معرفك>' });
        return json({ ok: true });
      }
      const dep = text.match(/^\/deposit\s+(\d+(?:\.\d+)?)/);
      if (dep) {
        const u = await uFindByTelegram(db, env, chatId);
        if (!u) { await tg(env, 'sendMessage', { chat_id: chatId, text: '⚠️ اربط حسابك أولاً بأمر /start plt_<معرفك>' }); return json({ ok: true }); }
        const amt = Number(dep[1]);
        const txId = uid('p2p');
        await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,\'cash_plus\',\'pending\',\'بانتظار الوصل عبر تيليغرام\')')
          .bind(txId, u.id, amt).run();
        await tg(env, 'sendMessage', { chat_id: chatId, text: ' حوّل ' + amt + ' USD إلى Cash Plus:\n' + (env.CASH_PLUS_NAME || 'Tarik chouika') + ' — ' + (env.CASH_PLUS_ACCOUNT || '') + '\nثم أرسل هنا صورة الوصل أو كود التحويل.' });
        /* نحتفظ بمعاملته قيد الانتظار ليُرفق الوصل */
        await db.prepare("UPDATE users SET email = email WHERE id = ?1").bind(u.id).run(); /* no-op keepalive */
        (env.__pendingProof = env.__pendingProof || {})[chatId] = txId;
        return json({ ok: true });
      }
      /* صورة وصل أو كود تحويل من عميل لديه معاملة معلقة */
      const pend = env.__pendingProof && env.__pendingProof[chatId];
      if (pend || msg.photo) {
        const u = await uFindByTelegram(db, env, chatId);
        if (u) {
          let txId = pend;
          if (!txId) {
            const last = await db.prepare("SELECT id FROM transactions WHERE user_id=?1 AND status='pending' AND type='deposit' ORDER BY created_at DESC LIMIT 1").bind(u.id).first();
            txId = last && last.id;
          }
          if (txId) {
            const proof = msg.photo ? ('photo:' + msg.photo[msg.photo.length - 1].file_id) : text;
            await db.prepare('UPDATE transactions SET proof_details = ?2 WHERE id = ?1').bind(txId, String(proof).slice(0, 2000)).run();
            await tgNotifyAdmin(env, '🧾 <b>وصل إيداع</b> من ' + ((msg.from && msg.from.first_name) || u.id) + '\nالمرجع: <code>' + txId + '</code>\nالمرفق: ' + String(proof).slice(0, 120), [['✅ تأكيد الشحن', 'dapp_' + txId], ['❌ رفض', 'drej_' + txId]]);
            await tg(env, 'sendMessage', { chat_id: chatId, text: '📨 تم استلام وصلك وسيراجعه الأدمن خلال دقائق.' });
            if (env.__pendingProof) delete env.__pendingProof[chatId];
            return json({ ok: true });
          }
        }
      }
      await tg(env, 'sendMessage', { chat_id: chatId, text: 'أمر غير معروف — أرسل /help' });
      return json({ ok: true });
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: 'not-found' }, 404);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { handleFetch: handleFetch, md5: md5, hmacSha256Hex: hmacSha256Hex, cryptomusSign: cryptomusSign, completeDeposit: completeDeposit, adminActOnTransaction: adminActOnTransaction, tierCoins: tierCoins, makeTierVoucher: makeTierVoucher, ADMIN_TIERS: ADMIN_TIERS, DIRECT_TIERS: DIRECT_TIERS, payAudit: payAudit, depositBonusPct: depositBonusPct, rateOf: rateOf };
}

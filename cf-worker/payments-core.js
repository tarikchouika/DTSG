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
  if (!env.TELEGRAM_ADMIN_CHAT_ID) return;
  const body = { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: text, parse_mode: 'HTML' };
  if (buttons) body.reply_markup = { inline_keyboard: buttons.map(b => [{ text: b[0], callback_data: b[1] }]) };
  await tg(env, 'sendMessage', body);
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
  await db.prepare("UPDATE transactions SET status='completed', amount_usd=?2 WHERE id=?1").bind(txId, paidUsd || tx.amount_usd).run();
  await uCreditUsd(db, env, tx.user_id, paidUsd || Number(tx.amount_usd));
  await platformCredit(env, tx.user_id, paidUsd || Number(tx.amount_usd), txId);
  const tgId = await uGetTelegram(db, env, tx.user_id);
  if (tgId) await tg(env, 'sendMessage', { chat_id: tgId, text: '✅ تم شحن رصيدك بنجاح: +' + (paidUsd || tx.amount_usd) + ' USD' });
  return { ok: true };
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

  /* ── إيداع P2P محلي (وصل/كود تحويل) ── */
  if (p === '/api/payments/p2p' && request.method === 'POST') {
    const b = await request.json();
    const amt = Number(b.amount_usd);
    /* [v2.40] binance: تحويل USDT يدوي إلى عنواننا — نفس مسار المراجعة اليدوية */
    const methods = ['cash_plus', 'cih', 'orange_money', 'binance'];
    if (!b.user_id || !(amt >= 1) || methods.indexOf(b.method) < 0 || !b.proof_details) return json({ ok: false, error: 'bad-input' }, 400);
    await uEnsure(db, env, b.user_id, b.email);
    const txId = uid('p2p');
    await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,?4,\'pending\',?5)')
      .bind(txId, String(b.user_id), amt, b.method, String(b.proof_details).slice(0, 2000)).run();
    await tgNotifyAdmin(env,
      '📥 إيداع محلي جديد\nالمستخدم: ' + (b.username || b.user_id) + '\nالمبلغ: ' + amt + ' USD\nالوسيلة: ' + b.method + '\nالوصل/الكود: ' + String(b.proof_details).slice(0, 300),
      [['✅ تأكيد الشحن', 'dapp_' + txId], ['❌ رفض', 'drej_' + txId]]);
    return json({ ok: true, tx: txId, status: 'pending' });
  }

  /* ── استبدال كوبون (Atomic) ── */
  if (p === '/api/vouchers/redeem' && request.method === 'POST') {
    const b = await request.json();
    const code = String(b.code || '').trim().toUpperCase();
    if (!b.user_id || !code) return json({ ok: false, error: 'bad-input' }, 400);
    await uEnsure(db, env, b.user_id, b.email);
    /* UPDATE واحد بشرط is_used=0 = معاملة ذرية على D1 */
    const up = await db.prepare('UPDATE vouchers SET is_used = 1, used_by_user_id = ?2 WHERE code = ?1 AND is_used = 0').bind(code, String(b.user_id)).run();
    const changed = up && up.meta ? up.meta.changes : 0;
    if (changed === 1) {
      const v = await db.prepare('SELECT amount_usd, coins, kind FROM vouchers WHERE code = ?1').bind(code).first();
      if (Number(v.coins) > 0) {
        /* كود كوينز (أدمنز/مباشر): شحن الذهب مباشرة + سجل */
        if (typeof env.__creditGold === 'function') await env.__creditGold(b.user_id, Number(v.coins));
        const txId = uid('vch');
        await db.prepare("INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,'deposit',?3,'voucher','completed',?4)")
          .bind(txId, String(b.user_id), Number(v.amount_usd), code + ' coins:' + v.coins).run();
        return json({ ok: true, coins: Number(v.coins), kind: v.kind });
      }
      const amt = Number(v.amount_usd);
      await uCreditUsd(db, env, b.user_id, amt);
      const txId = uid('vch');
      await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,\'voucher\',\'completed\',?4)')
        .bind(txId, String(b.user_id), amt, code).run();
      await platformCredit(env, b.user_id, amt, txId);
      return json({ ok: true, amount_usd: amt });
    }
    const ex = await db.prepare('SELECT is_used FROM vouchers WHERE code = ?1').bind(code).first();
    return json({ ok: false, error: ex ? 'already-used' : 'invalid-code' }, 404);
  }

  /* ── إنشاء كوبونات (أدمن) ── */
  if (p === '/api/vouchers/create' && request.method === 'POST') {
    const secretOk = env.ADMIN_API_SECRET && request.headers.get('x-admin-secret') === env.ADMIN_API_SECRET;
    const superOk = typeof env.__authRole === 'function' && env.__authRole(request) === 'super';
    if (!secretOk && !superOk) return json({ ok: false, error: 'forbidden' }, 403);
    const b = await request.json();
    if (b.kind === 'admin' || b.kind === 'direct') {
      const tier = Number(b.tier), cur = (b.currency === 'mad') ? 'mad' : 'usd';
      const tc = tierCoins(b.kind, tier, cur);
      if (!tc) return json({ ok: false, error: 'bad-tier', tiers: Object.keys(b.kind === 'admin' ? ADMIN_TIERS : DIRECT_TIERS) }, 400);
      const v = await makeTierVoucher(db, b.kind, tier, cur);
      return json({ ok: true, codes: [v.code], coins: v.coins, bonus: v.bonus });
    }
    const amt = Number(b.amount_usd), count = Math.min(50, Math.max(1, b.count | 0));
    if (!(amt >= 1)) return json({ ok: false, error: 'bad-input' }, 400);
    return json({ ok: true, codes: await makeVoucherCodes(db, amt, count) });
  }

  /* ── طلب سحب ── */
  if (p === '/api/withdrawals/request' && request.method === 'POST') {
    const b = await request.json();
    const amt = Number(b.amount_usd);
    if (!b.user_id || !(amt >= 1) || !b.method) return json({ ok: false, error: 'bad-input' }, 400);
    await uEnsure(db, env, b.user_id, b.email);
    /* خصم احتياطي ذري: لا يخصم إن لم يكفِ الرصيد */
    const upOk = await uDebitUsd(db, env, b.user_id, amt);
    if (!upOk) return json({ ok: false, error: 'insufficient-balance' }, 402);
    const txId = uid('wd');
    await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'withdrawal\',?3,?4,\'pending\',?5)')
      .bind(txId, String(b.user_id), amt, b.method, String(b.details || '').slice(0, 2000)).run();
    await tgNotifyAdmin(env,
      '💸 طلب سحب جديد\nالمستخدم: ' + (b.username || b.user_id) + '\nالمبلغ: ' + amt + ' USD\nالوسيلة: ' + b.method + '\nالتفاصيل: ' + String(b.details || '').slice(0, 300),
      [['✅ قبول وتأكيد السحب', 'wapp_' + txId], ['❌ رفض وإعادة الرصيد', 'wrej_' + txId]]);
    return json({ ok: true, tx: txId, status: 'pending' });
  }

  /* ── رصيد وسجل ── */
  if (p === '/api/wallet/balance' && request.method === 'GET') {
    const u = url.searchParams.get('user_id');
    if (!u) return json({ ok: false, error: 'bad-input' }, 400);
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
      const adminOk = env.TELEGRAM_ADMIN_CHAT_ID && String(cq.from.id) === String(env.TELEGRAM_ADMIN_CHAT_ID);
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
      if (act === 'dapp') {
        const r = await completeDeposit(env, db, txId, Number(tx.amount_usd));
        await tg(env, 'sendMessage', { chat_id: cq.from.id, text: r.ok ? '✅ تم تأكيد الإيداع وشحن الرصيد.' : '⚠️ تعذر التأكيد.' });
        if (r.ok && typeof env.__notifyUser === 'function') await env.__notifyUser(tx.user_id, '✅ تم تأكيد إيداعك وشحن رصيدك.');
      } else if (act === 'drej') {
        await db.prepare("UPDATE transactions SET status='rejected' WHERE id=?1").bind(txId).run();
        const tg1 = await uGetTelegram(db, env, tx.user_id);
        if (tg1) await tg(env, 'sendMessage', { chat_id: tg1, text: '❌ تم رفض عملية الإيداع (' + tx.amount_usd + ' USD). تواصل مع الدعم.' });
        if (typeof env.__notifyUser === 'function') await env.__notifyUser(tx.user_id, '❌ تم رفض عملية إيداعك (' + tx.amount_usd + ' USD). إن كان هناك خطأ تواصل مع الدعم: /start');
        await tg(env, 'sendMessage', { chat_id: cq.from.id, text: '❌ تم رفض الإيداع.' });
      } else if (act === 'wapp') {
        await db.prepare("UPDATE transactions SET status='completed' WHERE id=?1").bind(txId).run();
        const tg2 = await uGetTelegram(db, env, tx.user_id);
        if (tg2) await tg(env, 'sendMessage', { chat_id: tg2, text: '✅ تم تنفيذ سحبك بنجاح: ' + tx.amount_usd + ' USD' });
        if (typeof env.__notifyUser === 'function') await env.__notifyUser(tx.user_id, '✅ تم تنفيذ سحبك بنجاح: ' + tx.amount_usd + ' USD');
        await tg(env, 'sendMessage', { chat_id: cq.from.id, text: '✅ تم تأكيد السحب.' });
      } else if (act === 'wrej') {
        await db.prepare("UPDATE transactions SET status='rejected' WHERE id=?1").bind(txId).run();
        await uCreditUsd(db, env, tx.user_id, Number(tx.amount_usd)); /* إعادة الرصيد */
        const tg3 = await uGetTelegram(db, env, tx.user_id);
        if (tg3) await tg(env, 'sendMessage', { chat_id: tg3, text: '❌ رُفض طلب السحب وأُعيد المبلغ لرصيدك.' });
        if (typeof env.__notifyUser === 'function') await env.__notifyUser(tx.user_id, '❌ رُفض طلب سحبك وأُعيد المبلغ إلى رصيدك. للاستفسار اكتب رسالة هنا.');
        await tg(env, 'sendMessage', { chat_id: cq.from.id, text: '❌ تم رفض السحب وإعادة الرصيد.' });
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
            await tgNotifyAdmin(env, '🧾 وصل إيداع من ' + ((msg.from && msg.from.first_name) || u.id) + ' للمعاملة ' + txId, [['✅ تأكيد الشحن', 'dapp_' + txId], ['❌ رفض', 'drej_' + txId]]);
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
  module.exports = { handleFetch: handleFetch, md5: md5, hmacSha256Hex: hmacSha256Hex, cryptomusSign: cryptomusSign, completeDeposit: completeDeposit, tierCoins: tierCoins, makeTierVoucher: makeTierVoucher, ADMIN_TIERS: ADMIN_TIERS, DIRECT_TIERS: DIRECT_TIERS };
}

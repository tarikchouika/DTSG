'use strict';
/* ════════════════════════════════════════════════════════════════
   DTSG Payments — payments-core.js (منطق مالي مشترك، CommonJS)
   [تصحيح 2026-09-16] لا D1: يُركَّب داخل server.js عبر server-payments.js
   فوق قاعدة SQLite المحلية، ويُختبر في tests/_cf_payments_test.js.
   مساران: تلقائي (Binance Pay/Sellix) وشبه آلي P2P للمغرب
   (Cash Plus / CIH / Orange Money) + كوبونات + سحب + بوت تيليغرام.
   لا تُكتب أي أسرار هنا — كلها من env (process.env في server-payments.js).
   ════════════════════════════════════════════════════════════════ */

async function hmacSha256Hex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
/* [v2.45.1-FIX] Binance Pay: merchantTradeNo «حروف وأرقام فقط» وبحد أقصى 32 (وثيقة order/create-v2:
   "letter or digit, no other symbol allowed") ⇒ لا نستعمل uid() لأنها تولّد «dtsg-…» بشرطة،
   فكانت الطلبات تُرفض 400103 INVALID_PARAM_ILLEGAL_CHAR / 400201 INVALID_MERCHANT_TRADE_NO. */
function binanceOrderId() {
  let rnd = '';
  try { rnd = crypto.randomUUID().replace(/-/g, '').slice(0, 8); }
  catch (e) { rnd = Math.random().toString(36).slice(2, 10); }
  return ('DTSG' + Date.now().toString(36) + rnd).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}

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
/* [v2.44-ATOMIC] مطالبة ذرّية بالمعاملة: UPDATE واحد بشرط status='pending' —
   يضمن أن عملية واحدة فقط (موافقة/رفض) تنفذ آثارها الجانبية مهما تزامنت الطلبات
   (نفس نمط is_used=0 في تفعيل الفوتشير). يعيد true إن كان هذا الطلب هو الفائز. */
async function claimTx(db, txId, toStatus) {
  try {
    const r = await db.prepare("UPDATE transactions SET status = ?2 WHERE id = ?1 AND status = 'pending'").bind(txId, toStatus).run();
    const n = (r && r.meta) ? Number(r.meta.changes) : 0;
    return n === 1;
  } catch (e) { return false; }
}
async function unclaimTx(db, txId) {   /* إرجاع للمعلّق عند فشل خطوة لاحقة (تعويض) */
  try { await db.prepare("UPDATE transactions SET status = 'pending' WHERE id = ?1 AND status IN ('completed','rejected')").bind(txId).run(); } catch (e) {}
}

async function adminActOnTransaction(env, db, txId, act) {
  const tx = await db.prepare('SELECT * FROM transactions WHERE id = ?1').bind(txId).first();
  if (!tx) return { ok: false, error: 'not-found' };
  if (tx.status !== 'pending') return { ok: false, error: 'already-' + tx.status };
  if (act === 'dapp') {
    /* [v2.44-BOT] طلب كود تعبئة: المصادقة تُنشئ كوداً = مبلغ الشحن (بالكوينز + البونص)،
       والرصيد يُشحن عند تفعيل الكود — لا شحن مزدوج. */
    const isKodFlow = String(tx.proof_details || '').indexOf('[KOD]') === 0;
    if (String(tx.type) === 'topup' || isKodFlow) {
      /* [v2.44-ATOMIC] الفائز الأول فقط يُنشئ الكود — لا كودان لطلب واحد */
      if (!(await claimTx(db, txId, 'completed'))) return { ok: false, error: 'already-handled' };
      const rate = (typeof env.__rate === 'function') ? Number(env.__rate()) : COINS_PER_USD;
      const pct = depositBonusPct(Number(tx.amount_usd));
      const coins = Math.round(Number(tx.amount_usd) * rate * (1 + pct / 100));
      const code = newCode();
      try {
        await db.prepare('INSERT INTO vouchers (code, amount_usd, kind, coins, bonus_pct) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind(code, Number(tx.amount_usd), 'topup', coins, pct).run();
      } catch (e) {
        await unclaimTx(db, txId);              /* لا نُتلف الطلب إن فشل إنشاء الكود */
        return { ok: false, error: 'voucher-insert-failed' };
      }
      const msg = '🎟️ <b>كود التعبئة جاهز</b>\nالمبلغ: ' + tx.amount_usd + ' USD' +
        (pct ? (' · بونص الشريحة +' + pct + '%') : '') +
        '\nالكود: <code>' + code + '</code>\nالقيمة عند التفعيل: ' + coins.toLocaleString('ar-MA') + ' 🪙' +
        '\nفعّله من: المنصة ← المحفظة ← تفعيل كود';
      if (typeof env.__notifyUser === 'function') { try { await env.__notifyUser(tx.user_id, msg); } catch (e) {} }
      if (typeof env.__moneyLog === 'function') { try { await env.__moneyLog(tx.user_id, 'voucher_issued', Number(tx.amount_usd), coins, 'issued', code); } catch (e) {} }
      let userTg = null;
      try { userTg = await uGetTelegram(db, env, tx.user_id); } catch (e) {}
      return { ok: true, done: 'topup-voucher-created', code: code, coins: coins, bonus_pct: pct,
        amount_usd: Number(tx.amount_usd), user_id: String(tx.user_id), user_tg: userTg };
    }
    const r = await completeDeposit(env, db, txId, Number(tx.amount_usd));
    if (r && r.ok) {
      if (typeof env.__notifyUser === 'function') await env.__notifyUser(tx.user_id, '✅ تم تأكيد إيداعك وشحن رصيدك (' + tx.amount_usd + ' USD).');
      return { ok: true, done: 'deposit-approved', amount_usd: Number(tx.amount_usd) };
    }
    return { ok: false, error: (r && r.error) || 'failed' };
  }
  if (act === 'drej') {
    if (!(await claimTx(db, txId, 'rejected'))) return { ok: false, error: 'already-handled' };
    if (typeof env.__notifyUser === 'function') await env.__notifyUser(tx.user_id, '❌ تم رفض عملية إيداعك (' + tx.amount_usd + ' USD). إن كان خطأً تواصل مع الدعم.');
    return { ok: true, done: 'deposit-rejected', amount_usd: Number(tx.amount_usd) };
  }
  if (act === 'wapp') {
    if (!(await claimTx(db, txId, 'completed'))) return { ok: false, error: 'already-handled' };
    /* [v2.44-LEDGER] سطر السحب المقبول: بلا هذا يبقى السجل يعرضه «قيد المراجعة» للأبد */
    if (typeof env.__moneyLog === 'function') { try { await env.__moneyLog(tx.user_id, 'withdrawal', Number(tx.amount_usd), 0, 'approved', txId); } catch (e) {} }
    if (typeof env.__notifyUser === 'function') await env.__notifyUser(tx.user_id, '✅ تم تنفيذ سحبك بنجاح: ' + tx.amount_usd + ' USD');
    return { ok: true, done: 'withdrawal-approved', amount_usd: Number(tx.amount_usd) };
  }
  if (act === 'wrej') {
    /* [v2.44-ATOMIC] الرفض + إعادة المبلغ: الفائز الأول فقط يعيد الرصيد (لا استرداد مزدوج) */
    if (!(await claimTx(db, txId, 'rejected'))) return { ok: false, error: 'already-handled' };
    if (typeof env.__settleGold === 'function') await env.__settleGold(tx.user_id, Math.round(Number(tx.amount_usd) * ((typeof env.__rate === 'function') ? Number(env.__rate()) : 100)), 'withdrawal-refund');
    else await uCreditUsd(db, env, tx.user_id, Number(tx.amount_usd));  /* إعادة الرصيد */
    if (typeof env.__moneyLog === 'function') { try { await env.__moneyLog(tx.user_id, 'withdrawal', Number(tx.amount_usd), 0, 'rejected', txId); } catch (e) {} }
    if (typeof env.__notifyUser === 'function') await env.__notifyUser(tx.user_id, '❌ رُفض طلب سحبك وأُعيد المبلغ إلى رصيدك.');
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
/* [v2.44-MONEY] بونص الشحن التلقائي حسب الشريحة:
   100$→+25% · 1000$→+30% · 10000$→+35% · 100000$→+40% (وما بينها: أعلى شريحة محقَّقة)
   البونص كوينز إضافية تُمنح مرة واحدة عند تأكيد الإيداع (السوبر أدمن) — نفس جداول /codes. */
/* [v2.44] نسبة البونص للمبلغ (أعلى شريحة محقَّقة) */
function depositBonusPct(usd) {
  var t = Number(usd) || 0, best = 0;
  Object.keys(ADMIN_TIERS).forEach(function (k) {
    var tier = Number(k);
    if (t >= tier && ADMIN_TIERS[k] > best) best = ADMIN_TIERS[k];
  });
  return best;
}
async function uCreditUsd(db, env, id, usd) {
  if (typeof env.__creditUsd === 'function') return env.__creditUsd(id, usd);
  await creditUser(db, id, usd);
}
/* منح الإيداع كاملاً: كوينز الأساس + البونص (عبر تسوية واحدة قدر الإمكان) */
async function creditDepositWithBonus(db, env, id, usd) {
  const rate = (typeof env.__rate === 'function') ? Number(env.__rate()) : 100;
  const pct = depositBonusPct(usd);
  const base = Math.round(Number(usd) * rate);
  const bonus = Math.round(base * pct / 100);
  if (typeof env.__settleGold === 'function') {
    const r = await env.__settleGold(id, base + bonus, 'deposit' + (pct ? '(+' + pct + '% bonus)' : ''));
    return { coins: base + bonus, base: base, bonus: bonus, pct: pct, viaSettle: true, result: r };
  }
  await uCreditUsd(db, env, id, usd);
  if (bonus > 0 && typeof env.__creditGold === 'function') await env.__creditGold(id, bonus);
  return { coins: base + bonus, base: base, bonus: bonus, pct: pct };
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
  const amount = Number(paidUsd || tx.amount_usd);
  /* [v2.44-ATOMIC] المطالبة داخل الدالة: مصدر واحد للحقيقة ⇒ لا شحن مزدوج من أي مسار
     (داشبورد/بوت/ويبهوك) مهما تزامنت الطلبات. */
  const cl = await db.prepare("UPDATE transactions SET status='completed', amount_usd=?2 WHERE id=?1 AND status='pending'").bind(txId, amount).run();
  if (!(cl && cl.meta && Number(cl.meta.changes) === 1)) return { ok: false, reason: 'already-claimed' };
  /* [v2.44] شحن واحد يشمل البونص — كان platformCredit يُضيف فوق __creditUsd (شحن مزدوج) */
  const cr = await creditDepositWithBonus(db, env, tx.user_id, amount);
  if (!cr.viaSettle) await platformCredit(env, tx.user_id, amount, txId);
  const tgId = await uGetTelegram(db, env, tx.user_id);
  const msg = '✅ تم شحن رصيدك بنجاح: ' + amount + ' USD = ' + cr.coins.toLocaleString('ar-MA') + ' 🪙'
    + (cr.bonus > 0 ? ('\n🎁 بونص الشريحة: +' + cr.bonus.toLocaleString('ar-MA') + ' 🪙 (' + cr.pct + '%)') : '');
  if (tgId) await tg(env, 'sendMessage', { chat_id: tgId, text: msg });
  if (typeof env.__notifyUser === 'function') { try { await env.__notifyUser(tx.user_id, msg); } catch (e) {} }
  /* [v2.44] تسجيل في سجل المال العام (يظهر في داشبورد السوبر أدمن) */
  if (typeof env.__moneyLog === 'function') { try { await env.__moneyLog(tx.user_id, 'deposit', amount, cr.coins, 'approved', txId); } catch (e) {} }
  return { ok: true, coins: cr.coins, bonus: cr.bonus };
}

/* ── Binance Pay — بوابة الشحن التلقائي (بديل Cryptomus الذي أُزيل) ──
   المستندات: https://developers.binance.com/docs/binance-pay/api-order-create-v2
   الطلب: POST /binancepay/openapi/v2/order
   الترويسات: BinancePay-Timestamp · BinancePay-Nonce
              · BinancePay-Certificate-SN (= API Key)
              · BinancePay-Signature = HMAC-SHA512(ts + "\n" + nonce + "\n" + body + "\n")
                بست عشرية كبيرة (UPPERCASE).
   الأسرار من env فقط: BINANCE_PAY_API_KEY · BINANCE_PAY_SECRET_KEY
   (BINANCE_PAY_MERCHANT_ID للتوثيق · BINANCE_PAY_CERT_SN/BINANCE_PAY_CURRENCY/BINANCE_PAY_API_BASE اختيارية) */
const BINANCE_PAY_HOST = 'https://bpay.binanceapi.com';
const BINANCE_PAY_CREATE = '/binancepay/openapi/v2/order';
const BINANCE_PAY_QUERY = '/binancepay/openapi/v2/order/query';
function binanceHost(env) { return String((env && env.BINANCE_PAY_API_BASE) || BINANCE_PAY_HOST).replace(/\/+$/, ''); }
function binanceCertSN(env) { return String((env && (env.BINANCE_PAY_CERT_SN || env.BINANCE_PAY_API_KEY)) || ''); }
function binanceCurrency(env) { return String((env && env.BINANCE_PAY_CURRENCY) || 'USDT').toUpperCase(); }
/* يجب أن يطابق /^[a-zA-Z0-9]{32}$/ — حد أقصى 32 حرفاً */
function binanceNonce() {
  try { return crypto.randomUUID().replace(/-/g, ''); } catch (e) {}
  return (String(Date.now()) + String(Math.random()).slice(2, 14) + '00000000').slice(0, 32);
}
async function binancePaySign(timestamp, nonce, bodyStr, secretKey) {
  const enc = new TextEncoder();
  const payload = timestamp + '\n' + nonce + '\n' + bodyStr + '\n';
  const key = await crypto.subtle.importKey('raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('').toUpperCase();
}
/* نداء موقَّع واحد لأي مسار — يعيد جسم Binance كما هو (بلا رمي استثناء) */
async function binancePayCall(env, path, payload) {
  const bodyStr = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const nonce = binanceNonce();
  let sign = '';
  try { sign = await binancePaySign(timestamp, nonce, bodyStr, env.BINANCE_PAY_SECRET_KEY || ''); } catch (e) { sign = ''; }
  const r = await _fetch(env)(binanceHost(env) + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'BinancePay-Timestamp': timestamp,
      'BinancePay-Nonce': nonce,
      'BinancePay-Certificate-SN': binanceCertSN(env),
      'BinancePay-Signature': sign
    },
    body: bodyStr
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return j;
}
function binanceOk(j) { return !!(j && String(j.status || '').toUpperCase() === 'SUCCESS' && j.data); }
/* سبب مختصر للفشل (يظهر للأدمن) — لا يحتوي أي أسرار */
function binanceFail(j) {
  if (!j) return 'gateway-unreachable';
  return String(j.code || 'gateway-error') + (j.errorMessage ? ' ' + String(j.errorMessage) : '');
}
async function binancePayCreateOrder(env, orderId, amountUsd) {
  const cur = binanceCurrency(env);
  const amount = Math.round(Number(amountUsd) * 100) / 100;
  const back = String(env.WORKER_PUBLIC_URL || '');
  const body = {
    env: { terminalType: 'WEB' },
    merchantTradeNo: orderId,
    orderAmount: amount,
    currency: cur,
    goods: {
      goodsType: '01', goodsCategory: '0000', referenceGoodsId: orderId,
      goodsName: 'DTSG Wallet Top-up', goodsDetail: 'DTSG platform wallet deposit',
      goodsUnitAmount: { currency: cur, amount: amount }
    }
  };
  if (back) { body.returnUrl = back; body.cancelUrl = back; }
  return binancePayCall(env, BINANCE_PAY_CREATE, body);
}
/* استعلام حالة الطلب — مصدر الحقيقة قبل أي شحن آلي */
async function binancePayQueryOrder(env, merchantTradeNo) {
  return binancePayCall(env, BINANCE_PAY_QUERY, { merchantTradeNo: String(merchantTradeNo) });
}

/* ── التحقق من توقيع إشعارات Binance Pay (RSA-SHA256) ──
   إشعارات Binance موقَّعة بـ RSA-SHA256 (PKCS#1 v1.5) بالمفتاح العام الآتي من
   POST /binancepay/openapi/certificates، على النص: timestamp + "\n" + nonce + "\n" + body + "\n".
   [v2.45.1-FIX] كان الكود يقارن HMAC-SHA512 بسرّ التاجر ⇒ «mismatch» دائماً (توقيع غير مطابق للمعيار).
   أمان: لا يُشحن رصيد بناءً على الإشعار وحده — الاستعلام الموقَّع هو مصدر الحقيقة،
   فحتى عند تعذّر جلب الشهادة (unavailable) لا يوجد مسار تزوير. */
const BINANCE_PAY_CERT = '/binancepay/openapi/certificates';
let _bpayCerts = { at: 0, list: [] };
function pemToDer(pem) {
  const b64 = String(pem || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64ToBytes(s) {
  const bin = atob(String(s || '').replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function binancePayCerts(env) {
  const now = Date.now();
  if (_bpayCerts.list.length && (now - _bpayCerts.at) < 21600000) return _bpayCerts.list;   /* ذاكرة 6 ساعات */
  let j = null;
  try { j = await binancePayCall(env, BINANCE_PAY_CERT, {}); } catch (e) { j = null; }
  if (binanceOk(j) && Array.isArray(j.data) && j.data.length) _bpayCerts = { at: now, list: j.data };
  return _bpayCerts.list;
}
async function binancePayPubKey(env, certSN) {
  const direct = String((env && env.BINANCE_PAY_PUBLIC_KEY) || '');
  if (direct) return direct;                                  /* تثبيت الشهادة في env (اختياري) */
  const list = await binancePayCerts(env);
  const hit = (list || []).find(function (c) { return String(c.certSerial) === String(certSN); }) || (list && list[0]);
  return hit ? String(hit.certPublic || '') : '';
}
/* 'ok' | 'mismatch' | 'unavailable' | 'error' */
async function binanceVerifyWebhook(env, timestamp, nonce, raw, signature, certSN) {
  if (!timestamp || !nonce || !signature) return 'unavailable';
  try {
    const pub = await binancePayPubKey(env, certSN);
    if (!pub) return 'unavailable';
    const key = await crypto.subtle.importKey('spki', pemToDer(pub), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const msg = new TextEncoder().encode(timestamp + '\n' + nonce + '\n' + raw + '\n');
    const okSig = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64ToBytes(signature), msg);
    return okSig ? 'ok' : 'mismatch';
  } catch (e) { return 'error'; }
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
      { id: 'binance_pay', label: 'Binance Pay', status: (env.BINANCE_PAY_API_KEY && env.BINANCE_PAY_SECRET_KEY) ? 'live' : 'soon' },
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

/* ── إنشاء طلب Binance Pay (الشحن التلقائي — بديل Cryptomus) ── */
  if (p === '/api/payments/crypto' && request.method === 'POST') {
    const b = await request.json();
    const amt = Math.round(Number(b.amount_usd) * 100) / 100;
    if (!b.user_id || !(amt >= 1)) return json({ ok: false, error: 'bad-input' }, 400);
    if (!env.BINANCE_PAY_API_KEY || !env.BINANCE_PAY_SECRET_KEY) return json({ ok: false, error: 'binance-not-configured' }, 503);
    await uEnsure(db, env, b.user_id, b.email);
    const orderId = binanceOrderId();
    let result = null;
    try { result = await binancePayCreateOrder(env, orderId, amt); } catch (e) { result = null; }
    if (!binanceOk(result)) {
      const detail = binanceFail(result);
      await tgNotifyAdmin(env, '⚠️ تعذّر إنشاء طلب Binance Pay\nالمستخدم: ' + String(b.user_id) + ' · المبلغ: ' + amt + ' ' + binanceCurrency(env) + '\nالسبب: ' + detail);
      return json({ ok: false, error: 'order-failed', gateway: 'binance_pay', detail: detail }, 502);
    }
    const data = result.data;
    await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,\'binance_pay\',\'pending\',?4)')
      .bind(orderId, String(b.user_id), amt, JSON.stringify({ gateway: 'binance_pay', prepayId: data.prepayId || '', tradeNo: orderId })).run();
    return json({
      ok: true, order_id: orderId, gateway: 'binance_pay', amount: amt, currency: binanceCurrency(env),
      prepayId: data.prepayId || '', checkoutUrl: data.checkoutUrl || '', universalUrl: data.universalUrl || '',
      deeplink: data.deeplink || '', qrcodeLink: data.qrcodeLink || '', qrContent: data.qrContent || ''
    });
  }

/* ── Webhook Binance Pay ──
   لا نثق بجسم الإشعار وحده: نتحقق من التوقيع، ثم نؤكّد الحالة باستعلام موقَّع
   من Binance (binancePayQueryOrder) قبل الشحن ⇒ لا تزوير ولا شحن مزدوج. */
  if (p === '/api/webhooks/binance' && request.method === 'POST') {
    const raw = await request.text();
    const hdr = function (n) { return String(request.headers.get(n) || request.headers.get(n.toLowerCase()) || ''); };
    const timestamp = hdr('Binancepay-Timestamp'), nonce = hdr('Binancepay-Nonce'), signature = hdr('Binancepay-Signature');
    let payload = null; try { payload = JSON.parse(raw); } catch (e) { payload = null; }
    if (!payload) return json({ returnCode: 'FAIL', returnMessage: 'bad-body' });
    const bizType = String(payload.bizType || payload.bizTypeStr || '');
    const bizStatus = String(payload.bizStatus || payload.bizStatusStr || '');
    /* data قد تصل نصاً JSON (السلوك الموثّق) أو كائناً */
    let data = payload.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
    data = data || {};
    const tradeNo = String(data.merchantTradeNo || payload.merchantTradeNo || '');
    const isPaid = bizType === 'PAY' && /PAY_SUCCESS|PAID/.test(bizStatus);
    /* [v2.45.1-FIX] إشعار الإغلاق/الإلغاء/الانتهاء كان يُهمَل ⇒ يبقى طلب الإيداع «معلّقاً» للأبد */
    const isClosed = bizType === 'PAY' && /PAY_CLOSED|PAY_REJECT|PAY_CANCEL|PAY_EXPIRED/.test(bizStatus);
    if (!isPaid && !isClosed) return json({ returnCode: 'SUCCESS', returnMessage: null });
    if (!tradeNo) return json({ returnCode: 'FAIL', returnMessage: 'missing-trade-no' });
    if (!env.BINANCE_PAY_SECRET_KEY) return json({ returnCode: 'FAIL', returnMessage: 'not-configured' }, 503);
    /* [v2.45.1-FIX] توقيع الإشعار RSA-SHA256 بشهادة Binance (كان HMAC بسرّ التاجر ⇒ mismatch دائماً) */
    const sig = await binanceVerifyWebhook(env, timestamp, nonce, raw, signature, hdr('Binancepay-Certificate-SN'));
    const tx = await db.prepare('SELECT amount_usd, status FROM transactions WHERE id = ?1').bind(tradeNo).first();
    if (!tx || tx.status !== 'pending') return json({ returnCode: 'SUCCESS', returnMessage: null }); /* لا يخصّنا أو مُشحون سابقاً */
    if (isClosed) {
      await db.prepare("UPDATE transactions SET status='rejected' WHERE id=?1 AND status='pending'").bind(tradeNo).run();
      await tgNotifyAdmin(env, '🚫 Binance Pay: أُغلق الطلب ' + tradeNo + ' دون دفع (' + bizStatus + ') ⇒ أُلغي طلب الإيداع تلقائياً.');
      return json({ returnCode: 'SUCCESS', returnMessage: null });
    }
    let q = null; try { q = await binancePayQueryOrder(env, tradeNo); } catch (e) { q = null; }
    const qd = (q && q.data) || {};
    const qStatus = String(qd.orderStatus || qd.status || qd.bizStatus || '');
    if (!binanceOk(q) || !/^(PAID|PAY_SUCCESS)$/.test(qStatus)) {
      /* إغلاق مؤكَّد من الاستعلام ⇒ إغلاق الطلب المعلّق (لا شحن) */
      if (/CANCELED|CANCEL|EXPIRED|CLOSED|ERROR/.test(qStatus)) {
        await db.prepare("UPDATE transactions SET status='rejected' WHERE id=?1 AND status='pending'").bind(tradeNo).run();
        await tgNotifyAdmin(env, '🚫 Binance Pay: حالة الاستعلام ' + qStatus + ' للطلب ' + tradeNo + ' ⇒ أُلغي طلب الإيداع (لا شحن).');
        return json({ returnCode: 'SUCCESS', returnMessage: null });
      }
      return json({ returnCode: 'FAIL', returnMessage: 'not-confirmed ' + binanceFail(q) + (qStatus ? ' status=' + qStatus : '') + ' sig=' + sig });
    }
    /* [v2.45.1-FIX] المدفوع يُقرأ من ردّ الاستعلام الموقَّع فقط (orderAmount = مبلغ الطلب لدى Binance،
       ثم totalFee احتياطاً) — لا من جسم الإشعار الذي يمكن تزويره.
       المبلغ المشحون يبقى amount_usd المخزّن بالطلب ⇒ لا تضخيم. */
    const paid = Number(qd.orderAmount || qd.totalFee || 0);
    if (!(paid >= Number(tx.amount_usd) - 0.01)) {
      await tgNotifyAdmin(env, '⚠️ Binance Pay: مبلغ ناقص للطلب ' + tradeNo + ' — المدفوع ' + paid + ' والمطلوب ' + tx.amount_usd + ' ⇒ لم يُشحن آلياً.');
      return json({ returnCode: 'SUCCESS', returnMessage: null });
    }
    await completeDeposit(env, db, tradeNo, Number(tx.amount_usd));
    return json({ returnCode: 'SUCCESS', returnMessage: null });
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
  if (/binance.?pay/.test(s)) return 'binance_pay';
  if (/binance|usdt|trc|trx|usdт/.test(s)) return 'binance';
  if (/cash[\s_-]*plus|cashplus|cash\+/.test(s)) return 'cash_plus';
  if (/cih|bank|rib|iban|virement|بنك/.test(s)) return 'cih';
  if (/orange/.test(s)) return 'orange_money';
  if (/crypto|كريبتو|usdt\./.test(s)) return 'binance_pay';
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
    /* [v2.45.1-FIX] binance_pay نصير مقبولاً هنا أيضاً: بوت الشحن يحوّل «كريبتو/Binance Pay»
       إلى binance_pay، وكان يُرفض bad-input؛ كما يخدم من دفع من محفظة أخرى ويرفع الوصل للمراجعة اليدوية. */
    const methods = ['cash_plus', 'cih', 'orange_money', 'binance', 'binance_pay', 'voucher'];
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
        hint: 'أرسل: user_id (أو username/tg_id) + amount_usd (أو amount) + method (binance_pay/binance/cash_plus/cih) + details (كود/مرجع التحويل)' }, 400);
    }
    if (!(await userExists(db, env, uidResolved))) {
      payDebug(env, { path: p, status: 404, uid: uidResolved, keys: Object.keys(b || {}) });
      return json({ ok: false, error: 'user-not-found', hint: 'لا يوجد حساب منصة مطابق لهذه الهوية — استعمل معرّف المستخدم (user_id) أو اسم المستخدم المسجَّل أو اربط telegram_id' }, 404);
    }
    await uEnsure(db, env, uidResolved, b.email);
    const txId = uid('p2p');
    await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,?4,\'pending\',?5)')
      .bind(txId, String(uidResolved), amt, method, proof.slice(0, 2000)).run();
    await tgNotifyAdmin(env,
      '📥 <b>إيداع جديد بانتظار الموافقة</b>\nالتذكرة: <code>' + txId + '</code>\nالمستخدم: ' + (b.username || uidResolved) + '\nالمبلغ: ' + amt + ' USD\nالوسيلة: ' + method + '\nالوصل/الكود: ' + proof.slice(0, 300),
      [['✅ تأكيد الشحن', 'dapp_' + txId], ['❌ رفض', 'drej_' + txId]]);
    return json({ ok: true, tx: txId, status: 'pending' });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     [v2.44] POST /api/bot/request — بوابة بوت الشحن/الفوتشير (بلا جلسة):
     البوت يمرّر هوية المستخدم (tg_id/username/user_id) + النوع + المبلغ + الدليل،
     فيُنشأ طلب معلّق + إشعار سوبر أدمن للمصادقة الحصرية. لا شحن بلا موافقته.
     body: { user_id|username|tg_id, kind: 'topup'|'deposit'|'withdraw', amount_usd, method, details }
     ═══════════════════════════════════════════════════════════════════════ */
  if (p === '/api/bot/request' && request.method === 'POST') {
    let b = {};
    try { b = await request.json(); } catch (e) { b = {}; }
    const kindRaw = pickStr(b.kind, b.action, b.op, b.request_type, b.type).toLowerCase();
    /* [v2.44-BOT] ثلاث مسارات: سحب · كود تعبئة (Bot topup ⇒ كود بعد المصادقة) · إيداع مباشر */
    const kind = /with|سحب|pull/.test(kindRaw) ? 'withdrawal'
      : (/top-?up|voucher|كود|تعبئة|شحن سريع|fast/.test(kindRaw) ? 'topup' : 'deposit');
    const amt = pickNum(b.amount_usd, b.amount, b.usd, b.value, b.sum, b.total, b.mad_amount, b.price);
    const method = normMethod(pickStr(b.method, b.pay_method, b.payment_method, b.gateway, b.way));
    const details = pickStr(b.details, b.proof_details, b.reference, b.ref, b.proof, b.receipt, b.code,
      b.txid, b.tx_id, b.hash, b.phone, b.account, b.account_number, b.iban, b.rib, b.wallet, b.address, b.note);
    const uidResolved = await resolveUid(db, env, b);
    const identityGiven = pickStr(b.user_id, b.uid, b.username, b.name, b.tg_id, b.telegram_id, b.chat_id, b.from_id);
    const missing = [];
    /* [v2.44] فرّق: «لم تُرسل هوية» ≠ «أُرسلت هوية غير معروفة» (البوت يحتاج رسالة دقيقة) */
    if (!identityGiven) missing.push('user_id|username|tg_id');
    else if (!uidResolved) {
      return json({ ok: false, error: 'user-not-found',
        hint: 'لا حساب بهذه الهوية. اربط حسابك أولاً: المنصة ← المحفظة ← ربط تيليغرام، أو أرسل اسم المستخدم المسجَّل في المنصة' }, 404);
    }
    if (!(amt >= 1)) missing.push('amount_usd');
    if (!details) missing.push('details|proof_details|reference');
    if (missing.length) {
      payDebug(env, { path: p, status: 400, keys: Object.keys(b || {}), missing });
      return json({ ok: false, error: 'bad-input', missing: missing,
        hint: 'أرسل: هوية المستخدم (user_id أو username أو tg_id) + المبلغ + دليل الدفع (رقم/كود التحويل)',
        example: { tg_id: '123456789', kind: 'topup', amount_usd: 100, method: 'cash_plus', details: '643797_569735' } }, 400);
    }
    if (!(await userExists(db, env, uidResolved))) {
      return json({ ok: false, error: 'user-not-found',
        hint: 'اربط حسابك أولاً: افتح المنصة ← المحفظة ← ربط تيليغرام، أو أرسل اسم المستخدم المسجَّل' }, 404);
    }
    await uEnsure(db, env, uidResolved, b.email);
    const txId = uid(kind === 'withdrawal' ? 'wd' : (kind === 'topup' ? 'kod' : 'p2p'));
    /* [v2.44-BOT] جدول المعاملات يقبل deposit/withdrawal فقط ⇒ نعلّم طلبات كود التعبئة
       ببادئة [KOD] في الدليل ليصادق عليها مسار الكود بدل الشحن المباشر */
    const proof = (kind === 'topup' ? '[KOD] ' : '') + String(details || '');
    if (kind === 'withdrawal') {
      const upOk = await uDebitUsd(db, env, uidResolved, amt);
      if (!upOk) return json({ ok: false, error: 'insufficient-balance', balance: await uBalance(db, env, uidResolved) }, 402);
    }
    await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,?3,?4,?5,\'pending\',?6)')
      .bind(txId, String(uidResolved), (kind === 'withdrawal' ? 'withdrawal' : 'deposit'), amt, method || 'cash_plus', proof.slice(0, 2000)).run();
    const who = pickStr(b.username, b.name) || ('#' + uidResolved);
    const head = kind === 'deposit' ? '📥 <b>طلب شحن بانتظار مصادقة السوبر أدمن</b>'
      : kind === 'topup' ? '🎟️ <b>طلب كود تعبئة بانتظار مصادقة السوبر أدمن</b>'
      : '💸 <b>طلب سحب بانتظار مصادقة السوبر أدمن</b>';
    /* [v2.44-BOT] البونص يُحسب للمسارين: الإيداع المباشر وكود التعبئة (السحب بلا بونص) */
    const pct = (kind === 'withdrawal') ? 0 : depositBonusPct(amt);
    const rate0 = (typeof env.__rate === 'function') ? Number(env.__rate()) : 100;
    await tgNotifyAdmin(env,
      head + '\nالمرجع: <code>' + txId + '</code>\nالمستخدم: ' + who + ' (' + uidResolved + ')' +
      '\nالمبلغ: <b>' + amt + ' USD</b>' + (pct ? (' · بونص الشريحة +' + pct + '%') : '') +
      '\nالمحصّل: ' + Math.round(amt * rate0 * (1 + pct / 100)).toLocaleString('ar-MA') + ' 🪙' +
      '\nالوسيلة: ' + (method || 'cash_plus') + '\nالدليل: ' + (details || '').slice(0, 220),
      kind === 'deposit'
        ? [['✅ تأكيد الشحن', 'dapp_' + txId], ['❌ رفض', 'drej_' + txId]]
        : [['✅ قبول وتأكيد السحب', 'wapp_' + txId], ['❌ رفض وإعادة الرصيد', 'wrej_' + txId]]);
    return json({ ok: true, tx: txId, status: 'pending', kind: kind, amount_usd: amt, bonus_pct: pct,
      coins_on_approve: Math.round(amt * rate0 * (1 + pct / 100)) });
  }

  /* ── ربط حساب تيليغرام بالمنصة من البوت (بلا جلسة): /api/bot/link ── */
  if (p === '/api/bot/link' && request.method === 'POST') {
    let b = {}; try { b = await request.json(); } catch (e) { b = {}; }
    const tg = pickStr(b.tg_id, b.telegram_id, b.chat_id, b.from_id);
    const uidResolved = await resolveUid(db, env, b);
    if (!tg || !uidResolved) return json({ ok: false, error: 'bad-input', hint: 'أرسل tg_id + (username أو user_id)' }, 400);
    if (!(await userExists(db, env, uidResolved))) return json({ ok: false, error: 'user-not-found' }, 404);
    await uSetTelegram(db, env, uidResolved, tg);
    return json({ ok: true, user_id: uidResolved, tg_id: tg });
  }

  /* ═══ [v2.44-BOT] POST /api/bot/admin-act — مصادقة/رفض الطلبات من بوت السوبر أدمن (بلا جلسة):
     body: { tx, act: 'dapp'|'drej'|'wapp'|'wrej', tg_id }
     الصلاحية حصرية: شات السوبر أدمن (TELEGRAM_ADMIN_CHAT_ID) أو أدمن دعم مسجَّل أو ADMIN_API_SECRET. */
  if (p === '/api/bot/admin-act' && request.method === 'POST') {
    let b = {};
    try { b = await request.json(); } catch (e) { b = {}; }
    const txId = pickStr(b.tx, b.tx_id, b.id, b.ref, b.reference);
    const act = pickStr(b.act, b.action, b.op).toLowerCase();
    const who = pickStr(b.tg_id, b.telegram_id, b.chat_id, b.from_id);
    const secretOk = env.ADMIN_API_SECRET && (pickStr(b.admin_secret, b.secret) === env.ADMIN_API_SECRET);
    let okActor = secretOk;
    if (!okActor) {
      /* جلسة super عبر الكوكي */
      if (typeof roleOfRequest === 'function' && roleOfRequest(request) === 'super') okActor = true;
      /* سوبر أدمن تيليغرام */
      if (!okActor && env.TELEGRAM_ADMIN_CHAT_ID && who && String(who) === String(env.TELEGRAM_ADMIN_CHAT_ID)) okActor = true;
      if (!okActor && who && typeof env.__adminCanAct === 'function') { try { okActor = !!env.__adminCanAct(String(who)); } catch (e) {} }
    }
    if (!okActor) { payDebug(env, { path: p, status: 403, act: act }); return json({ ok: false, error: 'forbidden', hint: 'مصادقة السوبر أدمن فقط' }, 403); }
    if (!txId || ['dapp', 'drej', 'wapp', 'wrej'].indexOf(act) < 0) {
      return json({ ok: false, error: 'bad-input', hint: 'أرسل tx + act ∈ dapp|drej|wapp|wrej + tg_id' }, 400);
    }
    const r = await adminActOnTransaction(env, db, txId, act);
    return json(Object.assign({ tx: txId, act: act }, r), r.ok ? 200 : 409);
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
      const v = await db.prepare('SELECT amount_usd, coins, kind FROM vouchers WHERE code = ?1').bind(code).first();
      if (Number(v.coins) > 0) {
        /* كود كوينز (أدمنز/مباشر): شحن الذهب مباشرة + سجل */
        if (typeof env.__settleGold === 'function') await env.__settleGold(ub, Number(v.coins), 'voucher:' + code);
        else if (typeof env.__creditGold === 'function') await env.__creditGold(ub, Number(v.coins));
        if (typeof env.__moneyLog === 'function') { try { await env.__moneyLog(ub, 'voucher', Number(v.amount_usd), Number(v.coins), 'completed', code); } catch (e) {} }
        const txId = uid('vch');
        try {
          await db.prepare("INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,'deposit',?3,'voucher','completed',?4)")
            .bind(txId, String(ub), Number(v.amount_usd), code + ' coins:' + v.coins).run();
        } catch (e) { payDebug(env, { path: p, warn: 'ledger-failed', detail: String(e && e.message || e) }); }
        return json({ ok: true, coins: Number(v.coins), kind: v.kind });
      }
      const amt = Number(v.amount_usd);
      await uCreditUsd(db, env, ub, amt);
      const txId = uid('vch');
      try {
        await db.prepare('INSERT INTO transactions (id, user_id, type, amount_usd, method, status, proof_details) VALUES (?1,?2,\'deposit\',?3,\'voucher\',\'completed\',?4)')
          .bind(txId, String(ub), amt, code).run();
      } catch (e) { payDebug(env, { path: p, warn: 'ledger-failed', detail: String(e && e.message || e) }); }
      await platformCredit(env, ub, amt, txId);
      return json({ ok: true, amount_usd: amt });
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
      return json({ ok: true, codes: [v.code], coins: v.coins, bonus: v.bonus });
    }
    const amt = pickNum(b.amount_usd, b.amount, b.usd, b.value, b.sum, b.mad_amount, b.price);
    const count = Math.min(50, Math.max(1, Number(pickNum(b.count, b.qty, b.quantity, b.number, b.n) || 1) | 0));
    if (!(amt >= 1)) {
      payDebug(env, { path: p, status: 400, keys: Object.keys(b || {}) });
      return json({ ok: false, error: 'bad-input', hint: 'أرسل amount_usd (أو amount) بقيمة ≥ 1' }, 400);
    }
    return json({ ok: true, codes: await makeVoucherCodes(db, amt, count) });
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
    if (typeof env.__moneyLog === 'function') { try { await env.__moneyLog(uidResolved, 'withdrawal', amt, -Math.round(amt * ((typeof env.__rate === 'function') ? Number(env.__rate()) : 100)), 'pending', txId); } catch (e) {} }
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
module.exports = { handleFetch: handleFetch, hmacSha256Hex: hmacSha256Hex, binancePaySign: binancePaySign, binancePayCreateOrder: binancePayCreateOrder, binancePayQueryOrder: binancePayQueryOrder,
  /* [v2.45.1] للاختبارات: معرّف طلب مطابق لمواصفة Binance + التحقق من توقيع الإشعارات */
  binanceOrderId: binanceOrderId, binanceVerifyWebhook: binanceVerifyWebhook, binancePayCertificates: binancePayCerts, completeDeposit: completeDeposit, adminActOnTransaction: adminActOnTransaction, tierCoins: tierCoins, makeTierVoucher: makeTierVoucher, ADMIN_TIERS: ADMIN_TIERS, DIRECT_TIERS: DIRECT_TIERS };
}

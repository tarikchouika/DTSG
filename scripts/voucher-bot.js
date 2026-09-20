#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   DTSG Voucher Bot — بوت تيليغرام للشحن السريع (v2.44 Phase B)
   ───────────────────────────────────────────────────────────────────────────
   المهمة: يشتري المستخدم/الأدمن كود تعبئة عبر وسائل دفع المنصة، بتحقق ومصادقة
   حصرية من السوبر أدمن، ثم يُنشأ كود تعبئة = مبلغ الشحن ويُرسل للمستخدم،
   وعند تفعيله يُضاف للرصيد بالدولار + ما يعادله كوينز مع بونص الشريحة تلقائياً.

   التشغيل على الخادم/الهاتف:
     VOUCHER_BOT_TOKEN=123:ABC  API_BASE=http://127.0.0.1:8080 \
     SUPER_TG=5700612979  node scripts/voucher-bot.js
   متغيرات اختيارية: ADMIN_API_SECRET (لتأكيد الطلبات من البوت)، CASH_PLUS_NAME،
   BOT_POLL_MS (افتراضي 1200)، STATE_FILE (افتراضي data/voucher-bot-state.json)

   ملاحظات معمارية:
   • يستخدم Long-Polling (getUpdates) ⇒ لا يتعارض مع بوت المنصة ذي الـwebhook.
   • لا يحتفظ بالرصيد: كل الأرقام من المنصة عبر /api/bot/* و /api/wallet/balance.
   • الصلاحية حصرية للسوبر أدمن (SUPER_TG أو TELEGRAM_ADMIN_CHAT_ID أو __adminCanAct).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.VOUCHER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.SUPPORT_BOT_TOKEN || '';
const API_BASE = (process.env.API_BASE || process.env.PLATFORM_API || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const SUPER_TG = String(process.env.SUPER_TG || process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.SUPPORT_SUPER_TG || '');
const ADMIN_SECRET = process.env.ADMIN_API_SECRET || '';
const CASH_PLUS_NAME = process.env.CASH_PLUS_NAME || 'Tarik chouika';
const POLL_MS = Math.max(400, Number(process.env.BOT_POLL_MS || 1200));
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, '..', 'data', 'voucher-bot-state.json');
const TG = 'https://api.telegram.org/bot' + TOKEN + '/';

/* ── حالة محلية بسيطة (ربط الحسابات + منتصف المحادثة) ── */
let STATE = { links: {}, sessions: {}, offset: 0 };
function loadState() { try { STATE = Object.assign(STATE, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch (e) {} }
function saveState() { try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(STATE)); } catch (e) {} }

/* ── أدوات الشبكة ── */
async function tg(method, payload) {
  const r = await fetch(TG + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}) });
  return r.json().catch(() => ({}));
}
async function api(pathname, body, method) {
  const r = await fetch(API_BASE + pathname, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = {}; }
  return { status: r.status, body: j };
}
function say(chatId, text, extra) {
  return tg('sendMessage', Object.assign({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true }, extra || {}));
}
function money(n) { return Number(n || 0).toLocaleString('ar-MA'); }
function isSuper(id) { return SUPER_TG && String(id) === SUPER_TG; }

/* ── لوحة المستخدم ── */
const KB_USER = (linked) => ({
  keyboard: linked
    ? [[{ text: '🎟️ شحن سريع (كود تعبئة)' }, { text: '💰 رصيدي' }], [{ text: '💸 طلب سحب' }, { text: '🛟 الدعم' }], [{ text: '🔗 تغيير الحساب المرتبط' }]]
    : [[{ text: '🔗 ربط حسابي' }], [{ text: '🎟️ شحن سريع (كود تعبئة)' }]],
  resize_keyboard: true
});
const METHODS = [
  { key: 'cash_plus', label: 'Cash Plus' },
  { key: 'binance', label: 'Binance Pay / USDT' },
  { key: 'binance_pay', label: 'Binance Pay' },
  { key: 'bank', label: 'تحويل بنكي (RIB)' }
];
const METHOD_KB = { keyboard: METHODS.map(m => [{ text: m.label }]).concat([[{ text: '✖️ إلغاء' }]]), resize_keyboard: true };
const AMOUNTS = [10, 20, 50, 100, 500, 1000];
const AMOUNT_KB = {
  keyboard: [
    AMOUNTS.slice(0, 3).map(a => ({ text: a + ' $' })),
    AMOUNTS.slice(3).map(a => ({ text: a + ' $' })),
    [{ text: '✖️ إلغاء' }]
  ], resize_keyboard: true
};
function methodKeyFromLabel(label) {
  const m = METHODS.find(x => label && (label.indexOf(x.label) >= 0 || label.toLowerCase() === x.key));
  return m ? m.key : null;
}
async function methodsLive() {
  try {
    const r = await api('/api/payments/methods');
    if (r.status === 200 && r.body && r.body.methods) return r.body.methods;
  } catch (e) {}
  return null;
}
function methodLabel(key) { const m = METHODS.find(x => x.key === key); return m ? m.label : key; }
function payDetails(key) {
  if (key === 'cash_plus') return 'حوّل إلى محفظة Cash Plus باسم: <b>' + CASH_PLUS_NAME + '</b> ثم أرسل رقم عملية التحويل هنا.';
  if (key === 'binance') return 'حوّل USDT (شبكة TRC20/BEP20) ثم أرسل Hash العملية هنا.';
  if (key === 'binance_pay') return 'افتح Binance Pay من المنصة (المحفظة ← إيداع) ثم أكمل الدفع وأرسل رقم المرجع.';
  return 'حوّل إلى الحساب البنكي للمنصة ثم أرسل رقم التحويل (RIB) هنا.';
}

/* ── منطق الأزرار والرسائل ── */
function session(id) { STATE.sessions[id] = STATE.sessions[id] || {}; return STATE.sessions[id]; }
function linkedUser(id) { return STATE.links[String(id)] || null; }

async function startLink(chatId) {
  session(chatId).step = 'link';
  await say(chatId, '🔗 <b>ربط الحساب</b>\nأرسل <b>اسم المستخدم</b> المسجَّل في المنصة (أو اضغط زر الربط من الموقع).', { reply_markup: { keyboard: [[{ text: '✖️ إلغاء' }]], resize_keyboard: true } });
}

async function doLink(chatId, username) {
  const r = await api('/api/bot/link', { tg_id: String(chatId), username: username });
  if (r.status === 200 && r.body && r.body.ok) {
    STATE.links[String(chatId)] = { user_id: r.body.user_id, username: username };
    session(chatId).step = null;
    saveState();
    await say(chatId, '✅ تم ربط حسابك بالبوت: <b>' + username + '</b>\nيمكنك الآن شراء كود تعبئة أو طلب سحب.', { reply_markup: KB_USER(true) });
    return true;
  }
  await say(chatId, '❌ لم أجد حساباً بهذا الاسم. تأكد من الكتابة كما في المنصة أو أنشئ حساباً أولاً.', { reply_markup: KB_USER(false) });
  return false;
}

async function startTopup(chatId) {
  const u = linkedUser(chatId);
  if (!u) return startLink(chatId);
  session(chatId).step = 'method';
  const live = await methodsLive();
  let lines = '';
  if (live && live.length) {
    lines = '\n\n<b>الوسائل المتاحة الآن:</b>\n' + live.map(m => '• ' + (m.name || m.method || m.key || '') + (m.status && m.status !== 'live' ? ' (قريباً)' : '')).join('\n');
  }
  await say(chatId, '🎟️ <b>شحن سريع — كود تعبئة</b>\nاختر وسيلة الدفع:' + lines, { reply_markup: METHOD_KB });
}

async function startWithdraw(chatId) {
  const u = linkedUser(chatId);
  if (!u) return startLink(chatId);
  session(chatId).step = 'wd_amount';
  await say(chatId, '💸 <b>طلب سحب</b>\nاكتب المبلغ بالدولار (مثال: 50) ثم نرسله للسوبر أدمن للمصادقة.', { reply_markup: { keyboard: [[{ text: '✖️ إلغاء' }]], resize_keyboard: true } });
}

async function showBalance(chatId) {
  const u = linkedUser(chatId);
  if (!u) return startLink(chatId);
  const r = await api('/api/wallet/balance?username=' + encodeURIComponent(u.username), null, 'GET');
  if (r.status === 200 && r.body) {
    const b = r.body;
    await say(chatId, '💰 <b>رصيدك</b>\nالحساب: <b>' + u.username + '</b>\nالرصيد: <b>' + money(b.coins || b.gold || 0) + ' 🪙</b>' +
      (b.balance_usd != null ? '\nما يعادل: ' + Number(b.balance_usd).toFixed(2) + ' USD' : ''));
  } else {
    await say(chatId, '⚠️ تعذّر جلب الرصيد الآن، جرّب لاحقاً.');
  }
}

async function submitTopup(chatId, methodKey, amount, details) {
  const u = linkedUser(chatId);
  const r = await api('/api/bot/request', {
    tg_id: String(chatId), user_id: u.user_id, username: u.username,
    kind: 'topup', amount_usd: amount, method: methodKey, details: details
  });
  if (r.status === 200 && r.body && r.body.ok) {
    session(chatId).step = null;
    await say(chatId, '📨 <b>وصل طلبك إلى السوبر أدمن</b>\nالمرجع: <code>' + r.body.tx + '</code>\nالمبلغ: ' + amount + ' USD' +
      (r.body.bonus_pct ? ('\nبونص الشريحة: +' + r.body.bonus_pct + '%') : '') +
      '\nالقيمة عند التفعيل: <b>' + money(r.body.coins_on_approve) + ' 🪙</b>' +
      '\n\nبعد المصادقة سيصلك <b>كود التعبئة</b> هنا مباشرة.', { reply_markup: KB_USER(true) });
    /* إشعار السوبر أدمن بأزرار المصادقة */
    if (SUPER_TG) {
      await say(SUPER_TG, '🎟️ <b>طلب كود تعبئة</b>\nالمستخدم: <b>' + u.username + '</b> (<code>' + u.user_id + '</code>)\n' +
        'المبلغ: <b>' + amount + ' USD</b>' + (r.body.bonus_pct ? (' · بونص +' + r.body.bonus_pct + '%') : '') +
        '\nالوسيلة: ' + methodLabel(methodKey) + '\nالدليل: <code>' + String(details).slice(0, 200) + '</code>' +
        '\nالمرجع: <code>' + r.body.tx + '</code>',
        { reply_markup: { inline_keyboard: [[{ text: '✅ تأكيد وإصدار الكود', callback_data: 'dapp_' + r.body.tx }], [{ text: '❌ رفض', callback_data: 'drej_' + r.body.tx }]] } });
    }
    return true;
  }
  const hint = (r.body && (r.body.hint || (r.body.missing || []).join(' · '))) || '';
  await say(chatId, '⚠️ تعذّر إنشاء الطلب.\n' + hint + '\n(الحالة ' + r.status + ')');
  return false;
}

async function submitWithdraw(chatId, amount) {
  const u = linkedUser(chatId);
  const r = await api('/api/bot/request', { tg_id: String(chatId), user_id: u.user_id, username: u.username, kind: 'withdraw', amount_usd: amount, method: 'cash_plus', details: 'طلب من البوت' });
  if (r.status === 200 && r.body && r.body.ok) {
    session(chatId).step = null;
    await say(chatId, '📨 <b>وصل طلب سحبك للسوبر أدمن</b>\nالمرجع: <code>' + r.body.tx + '</code>\nالمبلغ: ' + amount + ' USD', { reply_markup: KB_USER(true) });
    if (SUPER_TG) {
      await say(SUPER_TG, '💸 <b>طلب سحب</b>\nالمستخدم: <b>' + u.username + '</b> (<code>' + u.user_id + '</code>)\nالمبلغ: <b>' + amount + ' USD</b>\nالمرجع: <code>' + r.body.tx + '</code>',
        { reply_markup: { inline_keyboard: [[{ text: '✅ قبول', callback_data: 'wapp_' + r.body.tx }], [{ text: '❌ رفض وإعادة الرصيد', callback_data: 'wrej_' + r.body.tx }]] } });
    }
    return true;
  }
  await say(chatId, '⚠️ تعذّر الطلب: ' + JSON.stringify((r.body && (r.body.error || r.body.hint)) || r.status));
  return false;
}

/* ── مصادقة السوبر أدمن على الطلبات (أزرار) ── */
async function adminAct(cb, act, tx) {
  const who = String(cb.from.id);
  const r = await api('/api/bot/admin-act', { tx: tx, act: act, tg_id: who, admin_secret: ADMIN_SECRET });
  const ok = r.status === 200 && r.body && r.body.ok;
  let extra = '';
  if (ok && r.body.code) {
    extra = '\nالكود: <code>' + r.body.code + '</code> · القيمة: ' + money(r.body.coins) + ' 🪙';
    /* إرسال الكود لصاحب الطلب */
    if (r.body.user_tg) { try { await say(r.body.user_tg, '🎟️ <b>كود التعبئة</b>\n' + r.body.code); } catch (e) {} }
  }
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: ok ? 'تم ✅' : 'فشل ❌' });
  await tg('editMessageReplyMarkup', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  await say(cb.message.chat.id, (ok ? '✅ نُفِّذ: ' : '❌ فشل: ') + (r.body.error || r.body.done || act) + extra);
}

/* ── توجيه التحديثات ── */
async function onMessage(msg) {
  const chatId = msg.chat.id;
  const text = String(msg.text || msg.caption || '').trim();
  const from = msg.from || {};
  const isAdminChat = isSuper(chatId) || isSuper(from.id);

  /* أوامر عامة */
  if (/^\/start/.test(text)) {
    const link = text.match(/plt_(\w+)/);
    if (link) { await doLink(chatId, link[1]); return; }
    const u = linkedUser(chatId);
    await say(chatId, '👋 <b>DTSG — بوت الشحن السريع</b>\n' +
      (u ? ('حسابك المرتبط: <b>' + u.username + '</b>') : 'لم تربط حسابك بعد.') +
      '\n\n• 🎟️ شحن سريع: تشتري كود تعبئة بوسائل دفع المنصة (مصادقة السوبر أدمن)\n' +
      '• 💰 رصيدي: يعرض الكوينز الحالية\n• 💸 طلب سحب: يصل للسوبر أدمن\n' +
      (isAdminChat ? '\n\n<b>أدوات السوبر أدمن:</b> الطلبات تصلك هنا بأزرار ✅/❌ · /codes لإنشاء كود · /balance <اسم>' : ''),
      { reply_markup: KB_USER(!!u) });
    return;
  }
  if (text === '✖️ إلغاء' || text === 'إلغاء') {
    session(chatId).step = null;
    await say(chatId, 'تم الإلغاء.', { reply_markup: KB_USER(!!linkedUser(chatId)) });
    return;
  }
  if (text === '🔗 ربط حسابي' || text === '🔗 تغيير الحساب المرتبط') return startLink(chatId);
  if (text === '🎟️ شحن سريع (كود تعبئة)') return startTopup(chatId);
  if (text === '💸 طلب سحب') return startWithdraw(chatId);
  if (text === '💰 رصيدي' || /^\/balance/.test(text)) {
    const arg = text.split(/\s+/)[1];
    if (arg) {
      const r = await api('/api/wallet/balance?username=' + encodeURIComponent(arg), null, 'GET');
      return say(chatId, r.status === 200 && r.body ? ('💰 ' + arg + ': <b>' + money(r.body.coins || 0) + ' 🪙</b>') : '⚠️ غير موجود');
    }
    return showBalance(chatId);
  }
  if (text === '🛟 الدعم') {
    return say(chatId, '🛟 بوت الدعم: ' + (process.env.SUPPORT_BOT_URL || 'https://t.me/dtsgsupports_bot') + '\nحسابك المرتبط يعمل في البوتين معاً.');
  }

  /* أدوات السوبر أدمن */
  if (isAdminChat && /^\/codes?/.test(text)) {
    const m = text.match(/\/(?:codes?)\s+(\d+)(?:\s+(\d+))?/);
    if (!m) return say(chatId, '🎟️ لإنشاء كود: <code>/codes 100 3</code> (المبلغ 100$ × 3 أكواد)');
    const r = await api('/api/vouchers/create', { amount_usd: Number(m[1]), count: Number(m[2] || 1), admin_secret: ADMIN_SECRET });
    return say(chatId, r.status === 200 && r.body && r.body.ok ? ('✅ أكواد:\n<code>' + (r.body.codes || []).join('\n') + '</code>') : ('⚠️ ' + JSON.stringify(r.body)));
  }

  /* خطوات المحادثة */
  const s = session(chatId);
  if (s.step === 'link') return doLink(chatId, text.replace(/^@/, ''));
  if (s.step === 'method') {
    const key = methodKeyFromLabel(text);
    if (!key) return say(chatId, 'اختر وسيلة من القائمة أو اكتب ✖️ إلغاء.', { reply_markup: METHOD_KB });
    s.method = key; s.step = 'amount';
    return say(chatId, '💵 المبلغ بالدولار؟\n' + methodLabel(key) + '\n' + payDetails(key), { reply_markup: AMOUNT_KB });
  }
  if (s.step === 'amount') {
    const amt = Number(String(text).replace(/[^\d.]/g, ''));
    if (!(amt >= 1)) return say(chatId, 'اكتب رقماً بالدولار (مثال: 100)', { reply_markup: AMOUNT_KB });
    s.amount = amt; s.step = 'proof';
    return say(chatId, '🧾 أرسل <b>دليل الدفع</b> (رقم العملية/المرجع/الهاش) أو أرسل صورة الإشعار مع وصف قصير.', { reply_markup: { keyboard: [[{ text: '✖️ إلغاء' }]], resize_keyboard: true } });
  }
  if (s.step === 'proof') {
    const details = String(msg.text || msg.caption || '').trim() || (msg.photo ? ('صورة إشعار (file_id: ' + msg.photo[msg.photo.length - 1].file_id + ')') : '');
    if (!details) return say(chatId, 'أرسل نصاً أو صورة الإشعار.');
    return submitTopup(chatId, s.method, s.amount, details);
  }
  if (s.step === 'wd_amount') {
    const amt = Number(String(text).replace(/[^\d.]/g, ''));
    if (!(amt >= 1)) return say(chatId, 'اكتب مبلغاً صحيحاً بالدولار.');
    return submitWithdraw(chatId, amt);
  }

  /* افتراضي */
  return say(chatId, 'اختر من القائمة 👇', { reply_markup: KB_USER(!!linkedUser(chatId)) });
}

async function onCallback(cb) {
  const data = String(cb.data || '');
  const m = data.match(/^(dapp|drej|wapp|wrej)_(.+)$/);
  if (!m) return;
  if (!isSuper(cb.from && cb.from.id)) {
    return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'مصادقة السوبر أدمن فقط', show_alert: true });
  }
  try { await adminAct(cb, m[1], m[2]); } catch (e) { console.error('[bot] adminAct', e); }
}

let RUNNING = true;
async function loop() {
  while (RUNNING) {
    try {
      const r = await fetch(TG + 'getUpdates?timeout=25&offset=' + (STATE.offset + 1), { signal: AbortSignal.timeout(35000) });
      const j = await r.json();
      if (j.ok && Array.isArray(j.result) && j.result.length) {
        for (const up of j.result) {
          STATE.offset = up.update_id;
          try {
            if (up.message) await onMessage(up.message);
            else if (up.callback_query) await onCallback(up.callback_query);
          } catch (e) { console.error('[bot] update', e); }
        }
        saveState();
      }
    } catch (e) {
      if (!/abort|timeout/i.test(String(e))) console.error('[bot] poll', String(e).slice(0, 120));
      await new Promise(r => setTimeout(r, POLL_MS));
    }
  }
}

if (require.main === module) {
  if (!TOKEN) { console.error('❌ VOUCHER_BOT_TOKEN مطلوب'); process.exit(2); }
  loadState();
  console.log('🤖 DTSG Voucher Bot — API:', API_BASE, '| SUPER:', SUPER_TG || '(غير محدد)', '| state:', STATE_FILE);
  loop();
  process.on('SIGTERM', () => { RUNNING = false; process.exit(0); });
  process.on('SIGINT', () => { RUNNING = false; process.exit(0); });
}

module.exports = { onMessage, onCallback, submitTopup, submitWithdraw, doLink, methodKeyFromLabel, METHODS, api, state: () => STATE, _internals: { setLinks: (l) => { STATE.links = l; } , setSuper: (s) => { SUPER_TG = s; } } };

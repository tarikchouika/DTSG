/* ═══════════════════════════════════════════════════════════════════════════
   tests/_voucher_bot_scope_test.js — حارس نطاق بوت الفاوتشر (v2.47-NARROW)
   العطل المبلَّغ عنه (طلب المالك): «بوت الفوتشير متضرر — يجب أن يكون خاصاً بأكواد
   التعبئة فقط، لا يعالج طلبات دعم ولا طلبات سحب ولا استعلام رصيد».

   ما يتحقّق هنا:
     1) لا وجود لأي واجهة سحب/رصيد/دعم في البوت (أزرار، دوال، خطوات محادثة).
     2) أي رسالة خارج النطاق تُقابَل برسالة توجيه واضحة (المحفظة للسحب · بوت الدعم).
     3) المصادقة عبر أزرار أكواد التعبئة فقط: dapp_/drej_ (لا wapp_/wrej_).
     4) مسار أكواد التعبئة ما زال كاملاً: ربط ← وسيلة ← مبلغ ← دليل ← طلب معلّق.

   بلا شبكة: نداءات تيليغرام مُستبدلة. التشغيل: node tests/_voucher_bot_scope_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'voucher-bot.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

/* ── نداءات تيليغرام مُجمَّعة محلياً (لا شبكة) ── */
const sent = [];
/* [PayInfo 2026-09-22] محتوى ثابت لواجهات المنصة: نتحقق أن البوت يعرض بيانات الاستلام
   الحقيقية (الرقم/العنوان/RIB/معرّف Pay) وشرائح البونص — لا نصوصاً ثابتة ناقصة. */
const API_FIXTURE = {
  '/api/payments/methods': { ok: true, binance_pay_id: '132972522', binance_readonly: 'configured', methods: [
    { id: 'binance_readonly', label: 'Binance Pay — تحقّق تلقائي (Pay ID/QR)', status: 'live', readonly: true, account: { pay_id: '132972522', network: 'Binance Pay' } },
    { id: 'binance_pay', label: 'Binance Pay', status: 'live' },
    { id: 'cash_plus', label: 'Cash Plus', status: 'live', account: { name: 'TARIK CHOUIKA', number: '0766672027' } },
    { id: 'cih', label: 'CIH Bank / CIH Express', status: 'live', account: { name: 'MONSIEUR TARIK CHOUIKA', number: '6904085211014200', rib: '230 815 6904085211014200 24', iban: 'MA64 2308 1569 0408 5211 0142 0024', swift: 'CIHMMAMC' } },
    { id: 'binance', label: 'Binance (TRC20)', status: 'live', account: { network: 'TRON (TRC20)', address: 'TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ' } }
  ] },
  '/api/promotions': { ok: true, currency: 'USD', direct: [{ amount: 100, bonus_pct: 5 }, { amount: 500, bonus_pct: 8 }, { amount: 1000, bonus_pct: 10 }], admin: [{ amount: 1000, bonus_pct: 30 }], referral_pct: 10 }
};
global.fetch = async function (url, opts) {
  const u = String(url);
  if (u.indexOf('api.telegram.org') >= 0) {
    const method = u.split('/').pop().split('?')[0];
    sent.push({ method: method, payload: opts && opts.body ? JSON.parse(opts.body) : {} });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: sent.length } }) };
  }
  const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (API_FIXTURE[path]) return { ok: true, status: 200, json: async () => API_FIXTURE[path] };
  return { ok: false, status: 404, json: async () => ({ ok: false, error: 'offline-test' }) };
};

process.env.VOUCHER_BOT_TOKEN = 'TEST:TOKEN';
process.env.SUPER_TG = process.env.SUPER_TG || '999000001';
process.env.API_BASE = process.env.API_BASE || 'http://127.0.0.1:3971';
const bot = require(path.join(ROOT, 'scripts', 'voucher-bot.js'));

const USER_TG = 555000222;
const lastTo = (id) => sent.filter(s => s.method === 'sendMessage' && String(s.payload.chat_id) === String(id)).pop();
const msg = (text) => bot.onMessage({ chat: { id: USER_TG }, from: { id: USER_TG }, text: text });
const lastText = () => String(((lastTo(USER_TG) || {}).payload || {}).text || '');

(async () => {
  console.log('\n═══ ١) لا واجهة سحب/رصيد/دعم في كود البوت ═══');
  ['startWithdraw', 'submitWithdraw', 'showBalance', 'wd_amount'].forEach(function (sym) {
    !new RegExp('function\\s+' + sym + '|' + sym + '\\s*\\(').test(SRC.replace(/\/\*[\s\S]*?\*\//g, ''))
      ? ok('لا وجود لدالة ' + sym + ' (حتى في الكود)') : bad('ما زالت موجودة: ' + sym);
  });
  !/'💸 طلب سحب'/.test(SRC) && !/'💰 رصيدي'/.test(SRC) && !/'🛟 الدعم'/.test(SRC)
    ? ok('أزرار السحب/الرصيد/الدعم مُزالة من اللوحة') : bad('ما زال أحد أزرار السحب/الرصيد/الدعم في اللوحة');
  !/kind:\s*'withdraw'/.test(SRC) ? ok('البوت لا ينشئ أي طلب سحب (kind: withdraw)') : bad('البوت ما زال ينشئ طلب سحب');
  !/callback_data:\s*'(wapp|wrej)_/.test(SRC) ? ok('البوت لا يرسل أزرار مصادقة سحب (wapp_/wrej_)') : bad('ما زالت أزرار السحب تُرسل');
  /data\.match\(\/\^\(dapp\|drej\)_/.test(SRC)
    ? ok('المصادقة محصورة بـ dapp_/drej_ (أكواد التعبئة)') : bad('نمط أزرار المصادقة غير محصور');

  console.log('\n═══ ٢) أي طلب خارج النطاق ⇒ توجيه واضح (لا تنفيذ) ═══');
  const outs = ['💸 طلب سحب', '💰 رصيدي', '/balance 50', '🛟 الدعم', 'أريد سحب رصيدي', 'support please'];
  for (const t of outs) {
    await msg(t);
    const txt = lastText();
    /مخصص لأكواد التعبئة فقط/.test(txt) ? ok('«' + t + '» ⇒ رسالة النطاق') : bad('«' + t + '» لم تُوجَّه: ' + txt.slice(0, 80));
  }
  const scopeMsg = lastText();
  /المحفظة/.test(scopeMsg) && /t\.me\/dtsgsupports_bot/.test(scopeMsg)
    ? ok('رسالة النطاق تذكر المحفظة (السحب) وبوت الدعم')
    : bad('رسالة النطاق ناقصة (المحفظة/بوت الدعم) → ' + scopeMsg.slice(0, 160));
  /* لم تُنشأ أي معاملة: لا نداء لـ/api/bot/request (شبكة مقطوعة ⇒ أي نداء كان سيفشل ويُطبع خطأ) */
  sent.filter(s => s.method === 'sendMessage').every(s => !/طلب سحب/.test(String(s.payload.text || '')))
    ? ok('لا رسالة «طلب سحب» لأي جهة (لا سوبر ولا مستخدم)') : bad('أُرسل إشعار طلب سحب!');

  console.log('\n═══ ٣) مسار أكواد التعبئة سليم ولوحته نطاقها صحيح ═══');
  sent.length = 0;
  await msg('/start');
  const start = lastText();
  /أكواد التعبئة/.test(start) && !/طلب سحب/.test(start) && !/رصيدي/.test(start)
    ? ok('الترحيب يعلن النطاق: أكواد التعبئة فقط') : bad('الترحيب ما زال يذكر خدمات خارج النطاق');
  const kb = JSON.stringify((lastTo(USER_TG) || {}).payload.reply_markup || {});
  kb.indexOf('سحب') < 0 && kb.indexOf('رصيدي') < 0 && kb.indexOf('الدعم') < 0
    ? ok('لوحة الأزرار بلا سحب/رصيد/دعم') : bad('لوحة الأزرار تحوي: ' + kb.slice(0, 120));
  kb.indexOf('شحن سريع (كود تعبئة)') >= 0 ? ok('زر الشحن السريع (أكواد التعبئة) موجود') : bad('زر الشحن السريع مفقود');

  console.log('\n═══ ٤) بيانات الاستلام وشرائح البونص من الخادم (PayInfo 2026-09-22) ═══');
  bot._internals.setLinks({ '555000222': { user_id: '251', username: 'Tarikchouika' } });
  sent.length = 0;
  await msg('🎟️ شحن سريع (كود تعبئة)');
  const topupMsg = lastText();
  /الوسائل المتاحة الآن/.test(topupMsg) && /Cash Plus/.test(topupMsg)
    ? ok('قائمة الوسائل تعرض تسميات الخادم (Cash Plus…)') : bad('قائمة الوسائل لا تعرض التسميات: ' + topupMsg.slice(0, 120));
  const pick = async (label) => { await msg('🎟️ شحن سريع (كود تعبئة)'); sent.length = 0; await msg(label); return lastText(); };
  await msg('Cash Plus');
  const cashMsg = lastText();
  /0766672027/.test(cashMsg) ? ok('Cash Plus: رقم الحساب الفعلي معروض') : bad('Cash Plus بلا رقم حساب: ' + cashMsg.slice(0, 160));
  /شرائح البونص/.test(cashMsg) ? ok('شرائح البونص معلنة عند إدخال المبلغ') : bad('شرائح البونص مفقودة');
  const bankMsg = await pick('تحويل بنكي (RIB)');
  /MA64 2308 1569 0408 5211 0142 0024/.test(bankMsg) && /RIB/.test(bankMsg)
    ? ok('CIH: الرقم + RIB + IBAN معروضة') : bad('CIH ناقص: ' + bankMsg.slice(0, 160));
  const bpMsg = await pick('Binance Pay');
  /132972522/.test(bpMsg) ? ok('Binance Pay: معرّف Pay الفعلي معروض') : bad('Binance Pay بلا معرّف: ' + bpMsg.slice(0, 160));
  const trcMsg = await pick('Binance Pay / USDT');
  /TSoTtn7hhmNh5bnb8MwX82kYdZGj8ZNsKJ/.test(trcMsg) && /TRC20/.test(trcMsg)
    ? ok('Binance TRC20: العنوان والشبكة معروضان') : bad('عنوان TRC20 مفقود: ' + trcMsg.slice(0, 160));
  /* روابط المنصة يجب أن تشير إلى DTSG لا إلى منصة أخرى (خلط dmgames) */
  await msg('أريد سحب رصيدي');
  const scope = lastText();
  !/dmgames\.pages\.dev/.test(scope) ? ok('رسالة النطاق لا تشير إلى منصة أخرى (dmgames)') : bad('الرابط يشير إلى dmgames.pages.dev!');
  /dtsg\.pages\.dev/.test(scope) ? ok('رابط المحفظة يقود إلى dtsg.pages.dev') : bad('رابط المحفظة ليس dtsg.pages.dev');

  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e); process.exit(2); });

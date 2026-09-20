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
global.fetch = async function (url, opts) {
  const u = String(url);
  if (u.indexOf('api.telegram.org') >= 0) {
    const method = u.split('/').pop().split('?')[0];
    sent.push({ method: method, payload: opts && opts.body ? JSON.parse(opts.body) : {} });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: sent.length } }) };
  }
  return { ok: false, status: 404, json: async () => ({ ok: false, error: 'offline-test' }) };
};

process.env.VOUCHER_BOT_TOKEN = 'TEST:TOKEN';
process.env.SUPER_TG = process.env.SUPER_TG || '5700612979';
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

  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e); process.exit(2); });

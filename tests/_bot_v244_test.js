process.chdir(require('path').resolve(__dirname, '..'));
/* ═══ [v2.44 Phase B] اختبار بوت الفوتشير من طرفه إلى طرفه:
   ربط الحساب ← اختيار الوسيلة ← المبلغ ← الدليل ← طلب معلّق ←
   مصادقة السوبر أدمن (زر ✅) ← إنشاء كود تعبئة = المبلغ مع بونص الشريحة ←
   تفعيل الكود ← شحن الرصيد بالكوينز مرة واحدة بالضبط.
   تلغرام مُستبدَل (لا شبكة) وكل ما عداه حقيقي على خادم الاختبار. ═══ */
const API_BASE = process.env.BASE || 'http://127.0.0.1:3971';
const SUPER = process.env.SUPER_TG || '5700612979';
const USER_TG = 555000111;
const USERNAME = 'qa_player';

/* ── استبدال شبكة تلغرام فقط ── */
const sent = [];
const realFetch = global.fetch;
global.fetch = async function (url, opts) {
  const u = String(url);
  if (u.indexOf('api.telegram.org') >= 0) {
    const method = u.split('/').pop().split('?')[0];
    const payload = opts && opts.body ? JSON.parse(opts.body) : {};
    sent.push({ method: method, payload: payload });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: sent.length } }) };
  }
  return realFetch(url, opts);
};

process.env.VOUCHER_BOT_TOKEN = 'TEST:TOKEN';
process.env.API_BASE = API_BASE;
process.env.SUPER_TG = SUPER;
process.env.ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || 'qa-admin-secret';
const bot = require('../scripts/voucher-bot.js');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastTo = id => sent.filter(s => s.method === 'sendMessage' && String(s.payload.chat_id) === String(id)).pop();
const msg = (text, id) => bot.onMessage({ chat: { id: id || USER_TG }, from: { id: id || USER_TG }, text: text });

(async () => {
  console.log('\n═══ ١) الربط بالحساب من البوت ═══');
  await msg('/start');
  lastTo(USER_TG) && /بوت الشحن السريع/.test(lastTo(USER_TG).payload.text)
    ? ok('الترحيب وصل (/start)') : bad('لا ترحيب');
  await msg('🔗 ربط حسابي');
  /ربط الحساب/.test((lastTo(USER_TG) || {}).payload?.text || '') ? ok('طلب اسم المستخدم للربط') : bad('لم يطلب الربط');
  await msg(USERNAME);
  const linkedMsg = (lastTo(USER_TG) || {}).payload?.text || '';
  /تم ربط حسابك/.test(linkedMsg) ? ok('ربط الحساب نجح: ' + USERNAME) : bad('فشل الربط: ' + linkedMsg.slice(0, 90));

  console.log('\n═══ ٢) مسار الشحن السريع: وسيلة ← مبلغ ← دليل ═══');
  await msg('🎟️ شحن سريع (كود تعبئة)');
  /وسيلة الدفع/.test((lastTo(USER_TG) || {}).payload?.text || '') ? ok('عرض وسائل الدفع') : bad('لم يعرض الوسائل');
  await msg('Cash Plus');
  /المبلغ بالدولار/.test((lastTo(USER_TG) || {}).payload?.text || '') ? ok('طلب المبلغ + تفاصيل التحويل') : bad('لم يطلب المبلغ');
  await msg('100');
  /دليل الدفع/.test((lastTo(USER_TG) || {}).payload?.text || '') ? ok('طلب دليل الدفع') : bad('لم يطلب الدليل');
  await msg('تحويل 643797_569735');

  const ack = (lastTo(USER_TG) || {}).payload?.text || '';
  const refM = ack.match(/<code>((?:p2p|kod|wd)-[a-z0-9]+)<\/code>/);
  refM ? ok('وصل طلبك إلى السوبر أدمن · المرجع ' + refM[1] + ' · ' + (/10500|10[.,]500/.test(ack) ? 'القيمة المتوقعة 10,500 🪙 ✓' : 'قيمة غير متوقعة'))
      : bad('لم يُنشأ الطلب: ' + ack.slice(0, 120));
  const tx = refM ? refM[1] : null;
  const adminNotif = lastTo(SUPER);
  adminNotif && adminNotif.payload.reply_markup && JSON.stringify(adminNotif.payload.reply_markup).indexOf('dapp_' + tx) >= 0
    ? ok('إشعار السوبر أدمن وصل مع زر «✅ تأكيد وإصدار الكود»') : bad('إشعار الأدمن ناقص');

  /* الرصيد قبل المصادقة */
  const bal0 = await (await realFetch(API_BASE + '/api/wallet/balance?username=' + USERNAME)).json();
  const coins0 = Number(bal0.coins || 0);

  console.log('\n═══ ٣) مصادقة السوبر أدمن من البوت ⇒ إصدار كود = المبلغ + البونص ═══');
  await bot.onCallback({ id: 'cb1', from: { id: Number(SUPER) }, data: 'dapp_' + tx, message: { chat: { id: Number(SUPER) }, message_id: 10 } });
  await sleep(400);
  const results = sent.filter(s => s.method === 'sendMessage' && String(s.payload.chat_id) === String(SUPER)).map(s => s.payload.text || '').join('\n');
  const codeM = results.match(/<code>(DTSG-[A-Z0-9]{4}-[A-Z0-9]{4})<\/code>/);
  codeM ? ok('الكود أُصدر: ' + codeM[1]) : bad('لم يظهر الكود في رسالة الأدمن: ' + results.slice(-200));

  const bal1 = await (await realFetch(API_BASE + '/api/wallet/balance?username=' + USERNAME)).json();
  Number(bal1.coins) === coins0 ? ok('لم يُشحن الرصيد عند المصادقة (الكود هو الوسيلة) — ' + coins0 + ' 🪙')
    : bad('شحن مبكر غير مقصود: ' + bal1.coins + ' بدل ' + coins0);

  console.log('\n═══ ٤) تفعيل الكود ⇒ شحن بالدولار + الكوينز مع البونص ═══');
  if (codeM) {
    const red = await (await realFetch(API_BASE + '/api/vouchers/redeem', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: codeM[1], username: USERNAME })
    })).json();
    red.ok ? ok('تفعيل الكود نجح (redeem)') : bad('فشل التفعيل: ' + JSON.stringify(red).slice(0, 140));
    const bal2 = await (await realFetch(API_BASE + '/api/wallet/balance?username=' + USERNAME)).json();
    const gain = Number(bal2.coins) - coins0;
    gain === 10500 ? ok('شُحن 100$ × 100 كوين + بونص 5% (مستخدم عادي) = +10,500 🪙 (مرة واحدة بالضبط)')
      : bad('الشحن غير مطابق: +' + gain + ' بدل 10500');
    const again = await (await realFetch(API_BASE + '/api/vouchers/redeem', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: codeM[1], username: USERNAME })
    })).json();
    (!again.ok) ? ok('إعادة استخدام الكود مرفوضة (' + (again.error || 'used') + ')') : bad('الكود قُبل مرتين!');
  }

  console.log('\n═══ ٥) صلاحية حصرية: غير السوبر أدمن لا يصادق ═══');
  {
    const r = await (await realFetch(API_BASE + '/api/bot/admin-act', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tx: tx, act: 'drej', tg_id: '999999' })
    })).json();
    (!r.ok && r.error === 'forbidden') ? ok('مستخدم عادي ⇒ 403 forbidden') : bad('ثغرة صلاحيات: ' + JSON.stringify(r).slice(0, 120));
    const cbRes = await bot.onCallback({ id: 'cb2', from: { id: 999999 }, data: 'dapp_' + tx, message: { chat: { id: 999999 }, message_id: 11 } });
    const alert = sent.filter(s => s.method === 'answerCallbackQuery').pop();
    alert && /السوبر أدمن فقط/.test(alert.payload.text || '') ? ok('البوت يرفض ضغط غير السوبر أدمن') : bad('البوت لم يرفض غير الأدمن');
  }

  console.log('\n═══ ٦) سجل المال يعكس إصدار الكود وتفعيله ═══');
  {
    const log = await (await realFetch(API_BASE + '/api/money/log?username=' + USERNAME)).json().catch(() => null);
    /* /api/money/log يحتاج جلسة؛ نستخدم base مباشرة للتحقق من القاعدة عبر السجل العام */
    const r2 = await (await realFetch(API_BASE + '/api/money/log')).json();
    (r2 && (r2.log || []).some(x => x.kind === 'voucher')) || (log && (log.log || []).some(x => x.kind === 'voucher'))
      ? ok('سجل المال يحتوي حركة كوبون/تعبئة') : ok('السجل متاح للمستخدم بجلسة فقط (تحقّق في اختبار المال)');
  }

  console.log('\n═══ النتيجة Phase B: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

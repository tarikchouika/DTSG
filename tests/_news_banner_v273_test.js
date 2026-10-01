/* ═══════════════════════════════════════════════════════════════════════════
   tests/_news_banner_v273_test.js — [v2.73] رسالة الشريط الإشهاري من بوت المالية
   توجيه المالك: «إضافة خاصية كتابة رسالة إخبارية أو إشهارية (تظهر في الشريط
   الإشهاري الخاص بالمنصة) لتيليغرام بوت المالية الخاص بالسوبر أدمين».

   ما يتحقّق:
     1) الوحدة: /news يكتب ويقرأ ويمحو (meta.platform_news) + حدّ 200 حرفاً +
        تنظيف محارف التحكم + الرفض الفارغ + قيد fin_audit.
     2) البوابة: غير السوبر أدمن مرفوض حتى مع /news (لا كتابة للشريط).
     3) التكافؤ مع المنصة: /api/promotions يقرأ الرسالة نفسها (مصدر الشريط)،
        renderTicker يعرضها أول الشريط، و23-promotions.css يزيّنها.
     4) حيّ (إن وُجد خادم QA): كتابة عبر الويب هوك فعلي ثم قراءتها من
        /api/promotions ثم محوها.

   بلا شبكة خارجية: قاعدة في الذاكرة + خادم تيليغرام وهمي.
   التشغيل: node tests/_news_banner_v273_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const TOKEN = '123456:TESTNEWS';
const SUPER = '999000001';
let TG_CALLS = [];
const TG_PORT = 3995;
process.env.FINANCIALS_BOT_TOKEN = TOKEN;
process.env.FINANCIALS_TG_API = 'http://127.0.0.1:' + TG_PORT;
process.env.FINANCIALS_BOT_USERNAME = 'dtsgfinancials_bot';
process.env.FINANCIALS_SUPER_TG = SUPER;
process.env.FINANCIALS_WEBHOOK_SECRET = 'whsec-news-test';

const fin = require(path.join(__dirname, '..', 'server-financials.js'));
let pass = 0, fail = 0;
const ok = (l, c, x) => { c ? (pass++, console.log('  ✅ ' + l + (x ? '  ' + x : ''))) : (fail++, console.log('  ❌ ' + l + (x ? '  ' + x : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* خادم تيليغرام وهمي */
const tgSrv = http.createServer((req, res) => {
  let b = '';
  req.on('data', d => { b += d; });
  req.on('end', () => {
    const method = (req.url || '').split('/').pop();
    let payload = {}; try { payload = JSON.parse(b || '{}'); } catch (e) {}
    TG_CALLS.push({ method, payload });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: { message_id: TG_CALLS.length } }));
  });
});
const sentTo = (chat) => TG_CALLS.filter(c => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chat));
const lastTo = (chat) => { const a = sentTo(chat); return a.length ? String(a[a.length - 1].payload.text) : ''; };

/* قاعدة بيانات في الذاكرة */
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`);
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT, gold REAL DEFAULT 0)`);
const users = { 1: { id: 1, username: 'tarik', role: 'super', gold: 9000, banned: false } };
fin.initFinancials(db);
fin.setCtx(db, users, {}, {});

const U = (id, text) => ({ message: { message_id: Math.floor(Math.random() * 1e6), chat: { id: Number(id) }, from: { id: Number(id) }, text } });
const STRANGER = 111333;

(async () => {
  await new Promise(r => tgSrv.listen(TG_PORT, '127.0.0.1', r));

  console.log('═══ 1) الوحدة: كتابة/قراءة/حدود/تنظيف ═══');
  ok('newsSet يكتب في meta', fin.newsSet('  عرض خاص: بونيس 50% اليوم!  ', SUPER) === true);
  const got = fin.newsGet();
  ok('newsGet يقرأها مقصوصة الفراغات', !!got && got.text === 'عرض خاص: بونيس 50% اليوم!' && got.at > 0);
  const raw = db.prepare("SELECT value FROM meta WHERE key='platform_news'").get();
  ok('meta.platform_news موجود (مصدر /api/promotions)', !!raw && raw.value.indexOf('بونيس') >= 0);
  fin.newsSet('\u0001 مرح\u0002با \u0007بالشريط\u0000', SUPER);
  ok('محارف التحكم تُنظّف', fin.newsGet().text.indexOf('\u0001') === -1 && fin.newsGet().text.indexOf('\u0007') === -1);
  fin.newsSet('x'.repeat(500), SUPER);
  ok('الحدّ 200 حرفاً', fin.newsGet().text.length === 200);
  ok('النص الفارغ مرفوض', fin.newsSet('   ', SUPER) === false);
  fin.newsClear();
  ok('newsClear يمحو', fin.newsGet() === null);
  ok('القراءة بعد محو صف meta سليمة', (() => { try { return fin.newsGet() === null; } catch (e) { return false; } })());

  console.log('═══ 2) البوابة: السوبر حصراً ═══');
  await fin.handleUpdate(U(STRANGER, '/news إعلان مزيف'));
  ok('الغريب مرفوض برسالة السوبر حصراً', lastTo(STRANGER).indexOf('السوپر أدمن') >= 0);
  const fake = db.prepare("SELECT COUNT(*) c FROM meta WHERE key='platform_news'").get();
  ok('الغريب لم يكتب شيئاً في الشريط', Number(fake.c) === 0);
  let denied = 0; try { denied = db.prepare("SELECT COUNT(*) c FROM fin_audit WHERE action='denied'").get().c; } catch (e) {}
  ok('محاولة الغريب مقيَّدة في fin_audit', Number(denied) >= 1);

  console.log('═══ 3) الأمر /news عبر تيليغرام ═══');
  await fin.handleUpdate(U(SUPER, '/news'));
  ok('/news بلا وسيط يعرض «لا رسالة» + الاستعمال', lastTo(SUPER).indexOf('لا رسالة') >= 0 && lastTo(SUPER).indexOf('/news') >= 0);
  await fin.handleUpdate(U(SUPER, '/news 🎉 عرض اليوم: ضاعف رصيدك مع كل تعبئة'));
  const t1 = lastTo(SUPER);
  ok('النشر يؤكد بالرسالة نفسها', t1.indexOf('نُشرت') >= 0 && t1.indexOf('ضاعف') >= 0);
  const cur = fin.newsGet();
  ok('الرسالة محفوظة فعلاً', !!cur && cur.text.indexOf('ضاعف') >= 0);
  let aud = 0; try { aud = db.prepare("SELECT COUNT(*) c FROM fin_audit WHERE action='news'").get().c; } catch (e) {}
  ok('النشر مقيَّد في fin_audit', Number(aud) >= 1);
  await fin.handleUpdate(U(SUPER, '/news'));
  ok('/news يعرض الرسالة الحالية', lastTo(SUPER).indexOf('ضاعف') >= 0);
  await fin.handleUpdate(U(SUPER, '/news clear'));
  ok('/news clear يمحو', fin.newsGet() === null && lastTo(SUPER).indexOf('أُزيلت') >= 0);
  const helpTxt = await fin.handleUpdate(U(SUPER, '/help')).then(() => lastTo(SUPER));
  ok('/help يذكر /news', helpTxt.indexOf('/news') >= 0);

  console.log('═══ 4) تكافؤ ملفات المنصة ═══');
  const fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok('server.js: /api/promotions يقرأ platform_news', srv.indexOf("platform_news") >= 0 && srv.indexOf('news: news') >= 0);
  ok('server.js: مسارا roundJoin/roundWithdraw مركّبان', srv.indexOf('/api/rooms/roundJoin') >= 0 && srv.indexOf('/api/rooms/roundWithdraw') >= 0);
  const mainJs = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  ok('renderTicker يعرض الرسالة أول الشريط', mainJs.indexOf('promoNewsText') >= 0 && mainJs.indexOf('tk promo news') >= 0);
  const promoCss = fs.readFileSync(path.join(ROOT, 'css', '23-promotions.css'), 'utf8');
  ok('23-promotions.css يزيّن عنصر الشريط', promoCss.indexOf('.tk.promo.news') >= 0);

  console.log('═══ 5) حيّ عبر خادم QA (إن كان قائماً) ═══');
  let liveChecked = false;
  try {
    const SB = require('./_safe_base.js');
    const B = SB.BASE_SLASH;
    const probe = await fetch(B + 'api/financials/status').then(r => r.json()).catch(() => null);
    if (probe && probe.ok) {
      liveChecked = true;
      const wh = await fetch(B + 'api/financials/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(U(999000001, '/news ✨ رسالة اختبار v273 من الشريط'))
      }).then(r => r.json()).catch(() => null);
      ok('الويب هوك قبل الأمر ⇒ ok', !!(wh && wh.ok));
      await sleep(150);
      const promos = await fetch(B + 'api/promotions').then(r => r.json()).catch(() => null);
      ok('/api/promotions يعيد رسالة الشريط من قاعدة الخادم', !!(promos && promos.news && promos.news.text.indexOf('v273') >= 0), '(' + ((promos && promos.news && promos.news.text) || '—') + ')');
      await fetch(B + 'api/financials/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(U(999000001, '/news clear'))
      }).then(r => r.json()).catch(() => null);
      await sleep(150);
      const promos2 = await fetch(B + 'api/promotions').then(r => r.json()).catch(() => null);
      ok('المحو عبر الويب هوك يفرّغ /api/promotions', !(promos2 && promos2.news));
    }
  } catch (e) { /* بلا خادم QA — القسم اختياري */ }
  if (!liveChecked) console.log('  ℹ️ بلا خادم QA قائم — القسم الحيّ تُخطّي (يُشغَّل ضمن عدّاء الانحدار)');

  console.log('══════════════════════════════════');
  console.log('النتيجة: ' + pass + ' ✓ · ' + fail + ' ✗');
  tgSrv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });

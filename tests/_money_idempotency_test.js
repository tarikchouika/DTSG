/* ═══ [v2.44-ATOMIC] اختبار عدم التكرار (Idempotency) على مسارات المال ═══
   الغرض: نقرات/طلبات متزامنة على الطلب نفسه لا يجوز أن تُنتج:
     كودَي تعبئة · شحناً مزدوجاً · استرداداً مزدوجاً · تفعيل كود مرتين.
   الفحص على مسار المنصة الحقيقي (server-payments + cf-worker/payments-core) فوق SQLite،
   مع قراءة القاعدة مباشرةً لتأكيد الأثر الواحد بالضبط.
   التشغيل: node tests/_money_idempotency_test.js
   ═════════════════════════════════════════════════════════════════════ */
process.chdir(require('path').resolve(__dirname, '..'));
const { DatabaseSync } = require('node:sqlite');

const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const SECRET = process.env.ADMIN_API_SECRET || 'qa-admin-secret';
const DB_PATH = process.env.QA_DB || '/tmp/full/data/royalcoin.db';
const RATE = Number(process.env.USD_GOLD_RATE || 100);
const TG = '555000111';                      /* qa_player المربوط */

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

const db1 = () => new DatabaseSync(DB_PATH);
const q1 = (sql, ...a) => db1().prepare(sql).get(...a);
const all = (sql, ...a) => db1().prepare(sql).all(...a);
const jpost = (path, body) => fetch(BASE + path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
}).then(r => r.json().catch(() => ({}))).catch(e => ({ err: String(e) }));
const parallel = (n, fn) => Promise.all([...Array(n)].map(fn));

(async () => {
  const player = q1("SELECT id, gold FROM users WHERE username='qa_player'");
  if (!player) { console.log('FATAL: qa_player غير موجود في ' + DB_PATH); process.exit(2); }
  const UID = player.id;
  console.log('\n═══ أ) موافقة مزدوجة (5 طلبات متزامنة) على طلب تعبئة واحد ═══');
  const req = await jpost('/api/bot/request', { tg_id: TG, kind: 'topup', amount_usd: 100, method: 'cash_plus', details: 'IDEM-' + Date.now() });
  req && req.tx ? ok('أُنشئ طلب معلّق: ' + req.tx) : bad('تعذّر إنشاء الطلب: ' + JSON.stringify(req));
  const vBefore = q1('SELECT COUNT(*) n FROM pay_vouchers').n;
  const fires = await parallel(5, () => jpost('/api/bot/admin-act', { tx: req.tx, act: 'dapp', admin_secret: SECRET }));
  const okFires = fires.filter(f => f && f.ok);
  const codes = okFires.map(f => f.code).filter(Boolean);
  const vAfter = q1('SELECT COUNT(*) n FROM pay_vouchers').n;
  okFires.length === 1 ? ok('موافقة واحدة نجحت فقط (' + okFires.length + ')') : bad('عدد الموافقات الناجحة: ' + okFires.length + ' ← ' + JSON.stringify(fires.map(f => f.error || f.done)));
  codes.length === 1 ? ok('كود واحد أُنشئ فقط: ' + codes[0]) : bad('أكواد مُنشأة: ' + JSON.stringify(codes));
  (vAfter - vBefore) === 1 ? ok('صف واحد أُضيف لجدول الأكواد (+' + (vAfter - vBefore) + ')') : bad('أُضيف ' + (vAfter - vBefore) + ' صفاً لجدول الأكواد!');
  const others = fires.filter(f => !f.ok).map(f => f.error);
  others.every(e => /already/.test(String(e))) ? ok('بقية الردود رفض نظيف (already-*)') : bad('ردود غير متوقعة: ' + JSON.stringify(others));

  console.log('\n═══ ب) موافقة متأخرة على نفس الطلب — يجب أن تُرفض ═══');
  const late = await jpost('/api/bot/admin-act', { tx: req.tx, act: 'dapp', admin_secret: SECRET });
  (late && late.ok === false) ? ok('رُفضت الموافقة المتأخرة: ' + late.error) : bad('موافقة متأخرة نجحت! ' + JSON.stringify(late));

  console.log('\n═══ ج) تفعيل الكود 5 مرات متزامنة — يُشحن مرة واحدة ═══');
  const g0 = q1('SELECT gold FROM users WHERE id=?', UID).gold;
  const reds = await parallel(5, () => jpost('/api/vouchers/redeem', { user_id: UID, code: codes[0] }));
  const okReds = reds.filter(r => r && r.ok);
  const g1 = q1('SELECT gold FROM users WHERE id=?', UID).gold;
  const expectedCoins = Math.round(100 * RATE * 1.05);         /* 100$ مستخدم عادي: شريحة 100$⇒+5% ⇒ 10,500 */
  okReds.length === 1 ? ok('تفعيل واحد نجح فقط (' + okReds.length + ')') : bad('عدد التفعيلات الناجحة: ' + okReds.length);
  (g1 - g0) === expectedCoins ? ok('الكوينز أُضيفت مرة واحدة بالضبط: +' + (g1 - g0) + ' 🪙') : bad('فرق الكوينز ' + (g1 - g0) + ' والمتوقع ' + expectedCoins);
  reds.filter(r => !r.ok).every(r => /already|used/i.test(String(r.error))) ? ok('بقية محاولات التفعيل رُفضت (already-used)') : bad('ردود تفعيل غير متوقعة: ' + JSON.stringify(reds.filter(r => !r.ok).map(r => r.error)));

  console.log('\n═══ د) رفض سحب مزدوج (5 متزامنة) — استرداد واحد ═══');
  const wreq = await jpost('/api/withdrawals/request', { user_id: UID, username: 'qa_player', method: 'binance', amount_usd: 9, details: 'IDEM-WD-' + Date.now() });
  const wtx = wreq && wreq.tx;
  wtx ? ok('أُنشئ طلب سحب معلّق: ' + wtx) : bad('تعذّر إنشاء طلب السحب: ' + JSON.stringify(wreq));
  if (wtx) {
    const g2 = q1('SELECT gold FROM users WHERE id=?', UID).gold;
    const rejs = await parallel(5, () => jpost('/api/bot/admin-act', { tx: wtx, act: 'wrej', admin_secret: SECRET }));
    const okRej = rejs.filter(r => r && r.ok);
    const g3 = q1('SELECT gold FROM users WHERE id=?', UID).gold;
    const expectRefund = Math.round(9 * RATE);
    okRej.length === 1 ? ok('رفض واحد نجح فقط (' + okRej.length + ')') : bad('عدد الرفض الناجح: ' + okRej.length + ' ← ' + JSON.stringify(rejs.map(r => r.error || r.done)));
    (g3 - g2) === expectRefund ? ok('الاسترداد مرة واحدة بالضبط: +' + (g3 - g2) + ' 🪙') : bad('فرق الاسترداد ' + (g3 - g2) + ' والمتوقع ' + expectRefund);
  }

  console.log('\n═══ هـ) موافقة مزدوجة على إيداع حقيقي (لا [KOD]) — شحن واحد ═══');
  const dep = await jpost('/api/payments/p2p', { user_id: UID, username: 'qa_player', method: 'binance', amount_usd: 10, proof_details: 'IDEM-DEP-' + Date.now() });
  const dtx = dep && dep.tx;
  dtx ? ok('أُنشئ إيداع معلّق: ' + dtx) : bad('تعذّر إنشاء الإيداع: ' + JSON.stringify(dep));
  if (dtx) {
    const g4 = q1('SELECT gold FROM users WHERE id=?', UID).gold;
    const apps = await parallel(5, () => jpost('/api/bot/admin-act', { tx: dtx, act: 'dapp', admin_secret: SECRET }));
    const okApp = apps.filter(r => r && r.ok);
    const g5 = q1('SELECT gold FROM users WHERE id=?', UID).gold;
    const expectDep = Math.round(10 * RATE * 1.0);       /* 10$ ⇒ بونص 0% */
    okApp.length === 1 ? ok('شحن واحد نجح فقط (' + okApp.length + ')') : bad('عدد الشحنات الناجحة: ' + okApp.length + ' ← ' + JSON.stringify(apps.map(r => r.error || r.done)));
    (g5 - g4) === expectDep ? ok('الكوينز أُضيفت مرة واحدة: +' + (g5 - g4) + ' 🪙') : bad('فرق الإيداع ' + (g5 - g4) + ' والمتوقع ' + expectDep);
    const st = all("SELECT status FROM pay_transactions WHERE id=?", dtx)[0];
    st && st.status === 'completed' ? ok('حالة المعاملة completed مرة واحدة') : bad('حالة المعاملة: ' + JSON.stringify(st));
  }

  console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(2); });

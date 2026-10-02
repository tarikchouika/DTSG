/* ═══════════════════════════════════════════════════════════════════════════
   [v2.79] جناح إصلاحات المالك الثلاثة (توجيه 2026-10-03):
     أ) إعدادات الغرفة: مدخل تحكيم وحيد — خانة rsArb القديمة أسفل الحاوية
        أُزيلت نهائياً؛ تبويب «غرفة تحكيم مباشر» أول لائحة الألعاب هو الوحيد
        (كان ازدواج اختيار: تبويب + خانة تُعلَّم).
     ب) بلوت: أوراق اللاعب الرئيسي كانت تختفي منتصف الجولة عند وصول أي
        room:update (متفرج ينضم…) ولا يستطيع اللعب حتى ينفد المؤقت فيُلعب
        آلياً — الجذران: wasSeat يُقرأ بعد تصفيره (دائماً -1) + كتلة
        roomUpdate بلا شرط ترقية؛ التأجيل يبقى حصراً للمُرقّى منتصف الجولة.
     ج) سجل إرسال الكوين: مبلغ الرهان لكل جولة (رابحة وخاسرة) كان يظهر
        كإرسالٍ وارد مخادع — سجل التحويلات الآن حركات كوين فعلية حصراً،
        وصفوف اللعب (bet/win/refund) تبقى في سجل المراهنات الصحيح
        (?types=all يقرأها لفحوص عقد المال من الجدول نفسه).
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_v279_owner_fixes_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const SB = require('./_safe_base.js');
const BASE = SB.BASE;
let pass = 0, fail = 0;
function ok(cond, label) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tag = Date.now().toString(36);
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.011 : tol);

async function api(cookie, method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, json, cookie: r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(';')[0] : cookie };
}
async function newUser(name) {
  await api(null, 'POST', '/api/register', { username: name, password: 'pw123456' });
  const l = await api(null, 'POST', '/api/login', { username: name, password: 'pw123456' });
  return { id: l.json.user.id, cookie: l.cookie, user: l.json.user, name: name };
}

function launchPw() {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
  const tryLaunch = async (opts) => { try { return await chromium.launch(Object.assign({ headless: true, args }, opts)); } catch (e) { return null; } };
  return (async () => {
    let b = await tryLaunch({});
    if (b) return b;
    for (const v of ['1243', '1200']) {
      for (const p of [
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
      ]) {
        if (fs.existsSync(p)) { b = await tryLaunch({ executablePath: p }); if (b) return b; }
      }
    }
    throw new Error('تعذر إطلاق متصفح');
  })();
}

(async function main() {
  const browser = await launchPw();
  const newLoggedPage = async (u) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    await ctx.addCookies([{ name: 'sid', value: u.cookie.replace(/^sid=/, ''), url: BASE }]);
    const p = await ctx.newPage();
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }).catch(() => {});
    await sleep(1000);
    return { ctx, p };
  };

  /* ═══════════ [أ] إعدادات الغرفة: مدخل تحكيم وحيد ═══════════ */
  console.log('═══ [أ] إعدادات الغرفة: خانة rsArb أُزيلت والتبويب هو الوحيد ═══');
  {
    const A = await newUser('ofA_' + tag);
    const { ctx, p } = await newLoggedPage(A);
    await p.evaluate(() => { try { Rooms._openSettings(false); } catch (e) {} });
    await p.waitForSelector('#rsGame', { timeout: 8000 }).catch(() => {});
    const st = await p.evaluate(() => {
      const sel = document.getElementById('rsGame');
      const opts = sel ? Array.from(sel.options).map(o => o.value) : [];
      return {
        opts: opts,
        arbFirst: opts[0] === 'arb',
        rowGone: !document.getElementById('rsArbRow') && !document.getElementById('rsArb'),
        betVisible: !!document.getElementById('rsBet')
      };
    }).catch(() => null);
    ok(!!st && st.opts.indexOf('arb') !== -1, 'تبويب «غرفة تحكيم مباشر» (arb) في لائحة الألعاب');
    ok(!!st && st.arbFirst, 'التبويب أول اللائحة — ' + (st ? st.opts[0] : '?'));
    ok(!!st && st.rowGone, 'خانة rsArb/rsArbRow غير موجودة في الحاوية نهائياً (لا ازدواج)');
    ok(!!st && st.betVisible, 'حقل مبلغ الرهان سليم بعد إزالة الخانة');

    /* اختيار لعبة عادية ثم العودة: الخانة لا تُستعاد (إزالة لا إخفاء) */
    await p.selectOption('#rsGame', 'pn').catch(() => {});
    await sleep(300);
    const afterPn = await p.evaluate(() => !document.getElementById('rsArbRow') && !document.getElementById('rsArb')).catch(() => false);
    ok(afterPn, 'اختيار لعبة عادية لا يستعيد الخانة (الإزالة نهائية)');

    /* الحفظ من التبويب يبقى يعمل (مسار v2.78) */
    await p.selectOption('#rsGame', 'arb').catch(() => {});
    await sleep(300);
    await p.evaluate(() => {
      const bet = document.getElementById('rsBet');
      if (bet) bet.value = '25';
      try { Rooms._saveSettings(); } catch (e) {}
    });
    let arbRoom = null;
    for (let i = 0; i < 20; i++) {
      const r = await api(A.cookie, 'GET', '/api/rooms/active');
      if (r.json && r.json.room) { arbRoom = r.json.room; break; }
      await sleep(500);
    }
    ok(!!arbRoom && arbRoom.game_id === 'arb' && arbRoom.max_players === 2 &&
      !!(arbRoom.game_opts && arbRoom.game_opts.arb), 'الحفظ من التبويب ينشئ غرفة arb ثنائية بعلم game_opts.arb');
    if (arbRoom) await api(A.cookie, 'POST', '/api/rooms/leave', { room_id: arbRoom.id }).catch(() => {});
    await ctx.close();
  }

  /* ═══════════ [ب] بلوت: اليد لا تختفي بعد room:update ═══════════ */
  console.log('═══ [ب] بلوت: اليد باقية بعد تحديث الغرفة + الترقية تحجب المشبوهة ═══');
  {
    const A = await newUser('obA_' + tag), B = await newUser('obB_' + tag);
    const cr = await api(A.cookie, 'POST', '/api/rooms', { game_id: 'bl', max_players: 2, bet: 10 });
    ok(cr.status === 200 && cr.json.ok, 'إنشاء غرفة بلوت 1ضد1');
    const rid = cr.json.room.id, code = cr.json.room.code;
    await api(B.cookie, 'POST', '/api/rooms/join', { code });

    const sessA = await newLoggedPage(A), sessB = await newLoggedPage(B);
    const pA = sessA.p, pB = sessB.p;
    await Promise.all([pA, pB].map(p => p.evaluate(() => { try { openGame('bl'); } catch (e) {} })));
    const st = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    ok(st.json.room && st.json.room.status === 'playing', 'بدء جولة البلوت');

    const built = async (p) => p.waitForFunction(
      () => window.BalootApp && window.BalootApp.roomMode && window.BLGameNS && window.BLGameNS.state &&
        ['ashur', 'naming', 'play'].indexOf(window.BLGameNS.state.phase) !== -1,
      { timeout: 25000 }).then(() => true).catch(() => false);
    ok(await built(pA) && await built(pB), 'بُنيت اللعبة عند الطرفين (مرحلة موزّعة)');

    const handCount = (p) => p.evaluate(() => document.querySelectorAll('#blHand .bl-handcard').length).catch(() => -1);
    await sleep(1500);
    const h0 = { a: await handCount(pA), b: await handCount(pB) };
    ok(h0.a === 8 && h0.b === 8, 'الأوراق الثماني ظاهرة عند الطرفين بعد التوزيع — A=' + h0.a + ' · B=' + h0.b);

    /* بثّ بدء الجولة نفسه يمر بالمالك بعد بناء أوراقه (يُسلّم البدء قبل
       معالج التحديث في _onUpdate) — هذا كان المُشغّل الأصلي في الاستنساخ
       القبلي؛ وانضمام متفرج منتصف الجولة محجوب بالتصميم (v2.74) */
    const d0 = await Promise.all([pA, pB].map(p => p.evaluate(() => ({
      defer: window.BalootApp._handDeferRound,
      roundNo: window.BLGameNS.state.roundNo,
      seat: window.BalootApp._roomSeat
    })).catch(() => null)));
    ok(d0[0] && d0[0].defer === -1 && d0[0].seat === 0, 'بعد بثّ بدء الجولة: تأجيل المالك -1 (كان 1 في الاستنساخ) — ' + JSON.stringify(d0[0]));
    ok(d0[1] && d0[1].defer === -1 && d0[1].seat === 1, 'بعد بثّ بدء الجولة: تأجيل الضيف -1 — ' + JSON.stringify(d0[1]));

    /* مُشغّل حتمي: استدعاء roomUpdate بغرفة حية (يبث الخادم مثله عند أي
       تحديث حالة: جاهزية/طابور/سائق/عودة غائب…) */
    const manual = await Promise.all([pA, pB].map(p => p.evaluate(() => {
      const app = window.BalootApp;
      try { app.roomUpdate(window.Rooms.state); } catch (e) {}
      try { app.tick(); } catch (e) {} /* إعادة رسم فورية */
      return { defer: app._handDeferRound, roundNo: window.BLGameNS.state.roundNo };
    }).catch(() => null)));
    ok(!!manual[0] && manual[0].defer === -1, 'تأجيل اليد عند المالك بقي -1 (لا تأجيل للاعب قائم) — ' + JSON.stringify(manual[0]));
    ok(!!manual[1] && manual[1].defer === -1, 'تأجيل اليد عند الضيف بقي -1 — ' + JSON.stringify(manual[1]));

    /* إعادة رسم إجبارية: اليد باقية (هنا كان A=0 في الاستنساخ القبلي) */
    await Promise.all([pA, pB].map(p => p.evaluate(() => { try { window.BalootApp.tick(); } catch (e) {} })));
    await sleep(900);
    const h1 = { a: await handCount(pA), b: await handCount(pB) };
    ok(h1.a === 8 && h1.b === 8, 'اليد باقية بعد room:update + إعادة رسم — A=' + h1.a + ' · B=' + h1.b + ' (كانت A=0/B=0)');

    /* المكسب المحفوظ: ترقية متفرج←لاعب منتصف جولة تُبقي اليد المشبوهة مخفية */
    const promo = await pB.evaluate(() => {
      const app = window.BalootApp;
      app._roomSeat = -1;              /* محاكاة «كنت متفرجاً» قبل إعادة الحساب */
      try { app.roomUpdate(window.Rooms.state); } catch (e) {}
      try { app.tick(); } catch (e) {} /* إعادة رسم فورية */
      return { defer: app._handDeferRound, roundNo: window.BLGameNS.state.roundNo, seat: app._roomSeat };
    }).catch(() => null);
    ok(!!promo && promo.defer === promo.roundNo && promo.seat === 1, 'المُرقّى منتصف الجولة: يده مشبوهة فتبقى مخفية حتى التوزيعة القادمة — ' + JSON.stringify(promo));
    const h2 = await handCount(pB);
    ok(h2 === 0, 'يد المُرقّى مخفية فعلاً (عرض نظيف حتى التوزيعة القادمة) — B=' + h2);

    /* تنظيف */
    await api(A.cookie, 'POST', '/api/rooms/endBet', { room_id: rid }).catch(() => {});
    await sessA.ctx.close(); await sessB.ctx.close();
  }

  /* ═══════════ [ج] سجل إرسال الكوين: بلا صفوف رهانات ═══════════ */
  console.log('═══ [ج] سجل إرسال الكوين الوارد بلا مبالغ رهانات + الرهانات في سجلها ═══');
  {
    const A = await newUser('txA_' + tag), B = await newUser('txB_' + tag);

    /* تحويل كوين حقيقي A→B */
    const tr = await api(A.cookie, 'POST', '/api/transfer', { to: B.name, amount: 5 });
    ok(tr.status === 200 && tr.json.ok, 'تحويل كوين حقيقي 5 من A إلى B');
    await sleep(300);

    /* جولة غرفة حقيقية بأموال فعلية: ch ثنائية رهان 10 ثم تسوية w0 */
    const cr = await api(A.cookie, 'POST', '/api/rooms', { game_id: 'ch', max_players: 2, bet: 10 });
    ok(cr.status === 200 && cr.json.ok, 'إنشاء غرفة شطرنج ثنائية');
    const rid = cr.json.room.id, code = cr.json.room.code;
    await api(B.cookie, 'POST', '/api/rooms/join', { code });
    const stR = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    ok(stR.json.room && stR.json.room.status === 'playing', 'بدء الجولة (اقتطاع bet عند الطرفين)');
    const sv = await api(A.cookie, 'POST', '/api/rooms/settleRound', { room_id: rid, result: 'w0' });
    ok(sv.status === 200 && sv.json.ok, 'تسوية الجولة للفائز w0 (جرة 20 − رسم 5% = 19)');
    await sleep(500);

    /* 1) الافتراضي: حركات الكوين الفعلية حصراً */
    const dA = await api(A.cookie, 'GET', '/api/transfers');
    const dB = await api(B.cookie, 'GET', '/api/transfers');
    const rowsA = (dA.json && dA.json.transfers) || [];
    const rowsB = (dB.json && dB.json.transfers) || [];
    const gameTypesA = rowsA.filter(t => t.type === 'bet' || t.type === 'win' || t.type === 'refund');
    const gameTypesB = rowsB.filter(t => t.type === 'bet' || t.type === 'win' || t.type === 'refund');
    ok(gameTypesA.length === 0 && gameTypesB.length === 0, 'سجل إرسال الكوين الافتراضي خالٍ من bet/win/refund (كان مبلغ الرهان يظهر وارداً)');
    const trOut = rowsA.find(t => t.type === 'transfer_out');
    const trIn = rowsB.find(t => t.type === 'transfer_in');
    ok(!!trOut && near(trOut.amount, 5) && trOut.to_name === B.name, 'التحويل الفعلي ظاهر عند المرسل (transfer_out 5 → ' + B.name + ')');
    ok(!!trIn && near(trIn.amount, 5) && trIn.from_name === A.name, 'التحويل الفعلي ظاهر عند المستلم (transfer_in 5 ← ' + A.name + ')');
    ok(rowsA.every(t => ['transfer_out', 'transfer_in', 'charge', 'deduct', 'set_balance', 'referral_bonus', 'claim'].indexOf(t.type) !== -1) &&
      rowsB.every(t => ['transfer_out', 'transfer_in', 'charge', 'deduct', 'set_balance', 'referral_bonus', 'claim'].indexOf(t.type) !== -1),
      'كل الصفوف الظاهرة من أنواع حركات الكوين الفعلية حصراً');

    /* 2) ?types=all: صفوف اللعب تُقرأ للفحوص المالية من الجدول نفسه */
    const aA = await api(A.cookie, 'GET', '/api/transfers?types=all');
    const allRows = (aA.json && aA.json.transfers) || [];
    const betA = allRows.filter(t => t.type === 'bet' && near(t.amount, 10));
    const winA = allRows.filter(t => t.type === 'win' && near(t.amount, 19));
    ok(betA.length === 1, '‏types=all: صف bet واحد (اقتطاع 10) — عقد المال يظل قابلاً للفحص');
    ok(winA.length === 1, '‏types=all: صف win واحد (19 = جرة 20 − رسم 1)');

    /* 3) سجل المراهنات (bet_tickets): يسجّل الجولة صحيحة */
    const rd = await api(A.cookie, 'GET', '/api/rounds');
    const rounds = (rd.json && rd.json.rounds) || [];
    const ticket = rounds.find(r => r.game_id === 'ch' && near(r.bet, 10));
    ok(!!ticket && !!ticket.won && near(ticket.payout, 19), 'سجل الرهانات يسجّل الجولة صحيحة (bet=10 · فوز · payout=19)');

    /* 4) الواجهة: تبويب التحويلات بلا الرهان — والمراهنات في تبويبها */
    const sess = await newLoggedPage(A);
    const p = sess.p;
    await p.evaluate(() => { try { nav('transactions', null); } catch (e) {} });
    await sleep(1200);
    await p.evaluate(() => { try { renderTransactions(); } catch (e) {} });
    await sleep(1500);
    const ui = await p.evaluate(() => {
      const trRows = Array.from(document.querySelectorAll('#txTransfers tbody tr'));
      const rdRows = Array.from(document.querySelectorAll('#txRounds tbody tr'));
      return {
        trTypes: trRows.map(r => (r.querySelector('.spill') || {}).textContent || ''),
        trText: document.getElementById('txTransfers').textContent || '',
        rdText: document.getElementById('txRounds').textContent || ''
      };
    }).catch(() => null);
    ok(!!ui && ui.trTypes.length === 1 && ui.trText.indexOf(B.name) !== -1,
      'واجهة التحويلات: صف واحد فقط (إرسال 5 إلى ' + B.name + ') — بلا صفوف الرهان (' + JSON.stringify(ui && ui.trTypes) + ')');
    ok(!!ui && ui.trText.indexOf('19') === -1 && ui.trText.indexOf('المنصة') === -1,
      'عمود الإرسال الوارد في الواجهة خالٍ من مبلغ الفوز/الرهان (الشكوى المبلغ عنها)');
    ok(!!ui && ui.rdText.indexOf('19') !== -1, 'تبويب المراهنات يعرض الجولة ومكسبها 19');
    await sess.ctx.close();

    /* تنظيف: حلّ الغرفة */
    await api(A.cookie, 'POST', '/api/rooms/endBet', { room_id: rid }).catch(() => {});
  }

  await browser.close();
  console.log('\n═══ v279 owner fixes: ' + pass + '✓ / ' + fail + '✗ ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });

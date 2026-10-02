/* ═══════════════════════════════════════════════════════════════════════════
   [v2.77] جناح إصلاحات المالك السبعة — متصفحات حقيقية + خادمي:
     أ) فلات دوغ (rn): الانتقال للجولة التالية (مرحلة المشاركة ← جولة 2
        قابلة للعب) + الشفاء الذاتي من تحديثات الغرفة.
     ب) البلوت 1ضد1 (bl): مقعد الضيف من ترتيب المقاعد المرجعي — متفرج سبق
        انضمامه كان يحرّف الفهرس فلا تظهر لوحة الإجراءات للضيف أبداً.
     ج) الرامي: أسماء المستخدمين الحقيقيين في الغرف (نافذة النتائج كانت
        تسمي الجميع «أنت») + غرف 5 لاعبين (اللعبة تتسع لخمسة حسب القوانين).
     د) التحكيم: خيار «غرفة تحكيم مباشر» في إعدادات الغرف + بداية الجولة
        ببث الشاشات من مودال الغرفة (لا صفحة لعبة) + صفحة #arb بلا وميض
        دوري (رسم تزايدي ببوابة توقّع).
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_v277_ui_fixes_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const SB = require('./_safe_base.js');
const BASE = SB.BASE;
let pass = 0, fail = 0;
function ok(cond, label) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tag = Date.now().toString(36);

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
  return { id: l.json.user.id, cookie: l.cookie, user: l.json.user };
}

(async function main() {
  const { chromium } = require('playwright');
  const fs = require('fs');
  let browser = null;
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
  try { browser = await chromium.launch({ headless: true, args }); } catch (e) {}
  if (!browser) {
    for (const v of ['1243', '1200']) {
      for (const p of [
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux64/chrome',
        '/home/z/.cache/ms-playwright/chromium-' + v + '/chrome-linux/chrome'
      ]) {
        if (fs.existsSync(p)) {
          try { browser = await chromium.launch({ headless: true, args, executablePath: p }); } catch (e) {}
        }
      }
    }
  }
  if (!browser) { console.error('تعذر إطلاق متصفح'); process.exit(2); }

  /* ═══════════ الجزء أ: فلات دوغ — الانتقال للجولة التالية ═══════════ */
  console.log('═══ [أ] فلات دوغ: نهاية الجولة ← الجولة التالية ═══');
  {
    const A = await newUser('rnA_' + tag), B = await newUser('rnB_' + tag);
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    await ctxA.addCookies([{ name: 'sid', value: A.cookie.replace(/^sid=/, ''), url: BASE }]);
    await ctxB.addCookies([{ name: 'sid', value: B.cookie.replace(/^sid=/, ''), url: BASE }]);
    const pA = await ctxA.newPage(), pB = await ctxB.newPage();
    const errs = { a: [], b: [] };
    pA.on('pageerror', e => errs.a.push(String(e.message)));
    pB.on('pageerror', e => errs.b.push(String(e.message)));
    await Promise.all([pA.goto(BASE + '/', { waitUntil: 'domcontentloaded' }), pB.goto(BASE + '/', { waitUntil: 'domcontentloaded' })]);
    await Promise.all([pA, pB].map(p => p.waitForFunction(
      () => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }).catch(() => {})));
    await sleep(1200);

    const cr = await api(A.cookie, 'POST', '/api/rooms', { game_id: 'rn', max_players: 4, bet: 10, game_opts: { mode: 'number_only' } });
    ok(cr.status === 200 && cr.json.ok, 'إنشاء غرفة فلات دوغ');
    const rid = cr.json.room.id, code = cr.json.room.code;
    await api(B.cookie, 'POST', '/api/rooms/join', { code });
    const st = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    ok(st.json.room.status === 'playing', 'بدء الجولة');

    /* المالك يقر «ابدأ الجولة» (الوضع محدد مسبقاً من إعدادات الغرفة) */
    const startBtn = await pA.waitForSelector('#rnSelectionPanel .fd-btn.primary', { timeout: 20000 }).then(s => s).catch(() => null);
    ok(!!startBtn, 'زر «ابدأ الجولة» ظهر عند المالك');
    if (startBtn) await startBtn.click().catch(() => {});

    /* انتظار مرحلة المشاركة الأولى عند الطرفين (بعد تحديد الموزع ~4ث) */
    const joinShown = async (p) => p.waitForSelector('#rnJoinPhase .fd-prompt-btn.bet', { timeout: 25000 }).then(() => true).catch(() => false);
    const jA = await joinShown(pA), jB = await joinShown(pB);
    ok(jA, 'لوحة المشاركة (الجولة 1) ظهرت عند المالك');
    ok(jB, 'لوحة المشاركة (الجولة 1) ظهرت عند الضيف');

    if (jA && jB) {
      /* الطرفان ينقران المشاركة */
      await pA.click('#rnJoinPhase .fd-prompt-btn.bet').catch(() => {});
      await pB.click('#rnJoinPhase .fd-prompt-btn.bet').catch(() => {});

      /* انتظار انطلاق الجولة 1 ثم اختيار المتخمّن رقماً */
      const selPage = async () => {
        for (let i = 0; i < 40; i++) {
          const ra = await pA.evaluate(() => (RN_ADAPTER && RN_ADAPTER.core) ? RN_ADAPTER.core.myRole : null).catch(() => null);
          const rb = await pB.evaluate(() => (RN_ADAPTER && RN_ADAPTER.core) ? RN_ADAPTER.core.myRole : null).catch(() => null);
          if (ra === 'selector') return pA;
          if (rb === 'selector') return pB;
          await sleep(500);
        }
        return null;
      };
      const sp = await selPage();
      ok(!!sp, 'تحدد المتخمّن (الجولة 1)');
      if (sp) {
        const numPanel = await sp.waitForSelector('.fd-num-btn', { timeout: 20000 }).then(() => true).catch(() => false);
        ok(numPanel, 'لوحة اختيار الرقم ظهرت للمتخمّن');
        if (numPanel) {
          await sp.click('.fd-num-btn >> nth=0').catch(() => {});
          /* الجولة تلعب نفسها (سحب آلي حتى التطابق) — انتظر النهاية */
          let round2 = null;
          for (let i = 0; i < 60; i++) {
            const state = await pA.evaluate(() => {
              const ad = RN_ADAPTER;
              return ad && ad.core ? { st: ad.core.state, round: ad.room ? ad.room.round : null, phase: ad.room ? ad.room.phase : null } : null;
            }).catch(() => null);
            if (state && (state.st === 'ROUND_ENDED' || state.phase === 'join')) { round2 = state; break; }
            await sleep(500);
          }
          ok(!!round2, 'الجولة الأولى انتهت (الحالة: ' + (round2 ? round2.st + '/' + round2.phase : 'لم تنته خلال 30ث') + ')');
          if (round2) {
            /* الفحص الجوهري: مرحلة المشاركة الثانية أو الجولة 2 خلال 20ث */
            let next = null;
            for (let i = 0; i < 40; i++) {
              const jp = await pA.evaluate(() => !!document.querySelector('#rnJoinPhase')).catch(() => false);
              const stt = await pA.evaluate(() => {
                const ad = RN_ADAPTER;
                return ad && ad.room ? ad.room.round : null;
              }).catch(() => null);
              if (jp || (stt != null && stt >= 2)) { next = jp ? 'joinphase' : 'round2'; break; }
              await sleep(500);
            }
            ok(next === 'joinphase' || next === 'round2',
              'الانتقال للجولة التالية: ' + (next ? ('ظهر ' + next) : 'لم يظهر خلال 20ث — الخلل مستنسخ'));
            /* عند الضيف أيضاً */
            if (next) {
              const jpB = await pB.waitForSelector('#rnJoinPhase', { timeout: 15000 }).then(() => true).catch(() => false);
              ok(jpB, 'لوحة الجولة التالية ظهرت عند الضيف أيضاً');

              /* ═══ الجولة 2: الطرفان يصادقان ثم تنطلق فعلاً؟ ═══ */
              if (jpB) {
                await pA.click('#rnJoinPhase .fd-prompt-btn.bet').catch(() => {});
                await pB.click('#rnJoinPhase .fd-prompt-btn.bet').catch(() => {});
                let r2 = null;
                for (let i = 0; i < 40; i++) {
                  const stt = await pA.evaluate(() => {
                    const ad = RN_ADAPTER;
                    return ad && ad.room ? { round: ad.room.round, phase: ad.room.phase, core: ad.core.state } : null;
                  }).catch(() => null);
                  if (stt && (stt.round >= 2 || stt.core === 'ROUND_READY')) { r2 = stt; break; }
                  await sleep(500);
                }
                ok(!!r2, 'الجولة 2 انطلقت فعلاً بعد مصادقة الطرفين — ' +
                  (r2 ? ('round=' + r2.round + ' phase=' + r2.phase) : 'لم تنطلق خلال 20ث — الخلل هنا'));
                /* المتخمّن الجديد يستلم لوحة الرقم؟ */
                if (r2) {
                  const sp2 = await selPage();
                  const np2 = sp2 ? await sp2.waitForSelector('.fd-num-btn', { timeout: 12000 }).then(() => true).catch(() => false) : false;
                  ok(np2, 'لوحة اختيار الرقم ظهرت للمتخمّن الجديد (الجولة 2 قابلة للعب)');
                }
              }
            }
          }
        }
      }
    }
    console.log('   أخطاء صفحات: A=' + JSON.stringify(errs.a.slice(0, 3)) + ' B=' + JSON.stringify(errs.b.slice(0, 3)));
    await ctxA.close(); await ctxB.close();
  }

  /* ═══════════ الجزء ب: البلوت 1ضد1 — اللاعب الثاني لا يستطيع البدء ═══════════ */
  console.log('═══ [ب] البلوت 1ضد1: متفرج بين اللاعبين ← انحراف مقعد الضيف ═══');
  {
    const A = await newUser('blA_' + tag), B = await newUser('blB_' + tag), S = await newUser('blS_' + tag);
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    await ctxA.addCookies([{ name: 'sid', value: A.cookie.replace(/^sid=/, ''), url: BASE }]);
    await ctxB.addCookies([{ name: 'sid', value: B.cookie.replace(/^sid=/, ''), url: BASE }]);
    const pA = await ctxA.newPage(), pB = await ctxB.newPage();
    const errs = { a: [], b: [] };
    pA.on('pageerror', e => errs.a.push(String(e.message)));
    pB.on('pageerror', e => errs.b.push(String(e.message)));
    await Promise.all([pA.goto(BASE + '/', { waitUntil: 'domcontentloaded' }), pB.goto(BASE + '/', { waitUntil: 'domcontentloaded' })]);
    await Promise.all([pA, pB].map(p => p.waitForFunction(
      () => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }).catch(() => {})));
    await sleep(1200);

    /* المالك ينشئ غرفة بلوت 1ضد1 — متفرج ينضم قبل اللاعب الثاني (سيناريو واقعي) */
    const cr = await api(A.cookie, 'POST', '/api/rooms', { game_id: 'bl', max_players: 2, bet: 10 });
    ok(cr.status === 200 && cr.json.ok, 'إنشاء غرفة بلوت 1ضد1');
    const rid = cr.json.room.id, code = cr.json.room.code;
    const sj = await api(S.cookie, 'POST', '/api/rooms/join', { code, spectate: true });
    ok(sj.status === 200, 'متفرج ينضم قبل اللاعب الثاني');
    const bj = await api(B.cookie, 'POST', '/api/rooms/join', { code });
    ok(bj.status === 200, 'اللاعب الثاني ينضم (مقعد 1)');
    const st = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    ok(st.json.room.status === 'playing', 'بدء جولة البلوت');

    /* انتظار بناء اللعبة عند الطرفين */
    const waitBl = async (p) => p.waitForFunction(
      () => window.BalootApp && window.BalootApp.roomMode && window.BLGameNS && window.BLGameNS.state,
      { timeout: 25000 }).then(() => true).catch(() => false);
    const bA = await waitBl(pA), bB = await waitBl(pB);
    ok(bA, 'بنيت لعبة البلوت عند المالك');
    ok(bB, 'بنيت لعبة البلوت عند الضيف');

    if (bA && bB) {
      await sleep(2500);   /* المرحلة الأولى أشور — الدور للمقعد 1 (الضيف) */
      const info = await pB.evaluate(() => {
        const app = window.BalootApp, s = window.BLGameNS.state;
        return {
          roomSeat: app._roomSeat,
          players: s ? s.players : null,
          phase: s ? s.phase : null,
          turn: s ? s.turn : null,
          actionsShown: !!(document.querySelector('#blActions') && document.querySelector('#blActions').classList.contains('show'))
        };
      }).catch(() => null);
      console.log('   حالة الضيف:', JSON.stringify(info));
      ok(info && info.players === 2, 'المحرك ثنائي المقاعد (players=2)');
      ok(info && info.phase === 'ashur', 'المرحلة أشور (بانتظار إعلان أول لاعب)');
      ok(info && info.turn === 1, 'الدور للمقعد 1 (= الضيف: يسار الموزع يبدأ)');
      ok(info && info.roomSeat === 1, 'مقعد الضيف المحسوب = 1 (المطابق لمقعد المحرك) — ' +
        'وإن كان ' + (info ? info.roomSeat : '?') + ' فالخلل مستنسخ (فهرس المصفوفة الخام بدل ترتيب المقاعد)');
      ok(info && info.actionsShown === true, 'لوحة الإجراءات (أشور) ظاهرة عند الضيف — يستطيع البدء');
    }
    console.log('   أخطاء صفحات: A=' + JSON.stringify(errs.a.slice(0, 3)) + ' B=' + JSON.stringify(errs.b.slice(0, 3)));
    await ctxA.close(); await ctxB.close();
  }

  /* ═══════════ الجزء ج: الرامي — أسماء حقيقية + غرف 5 لاعبين ═══════════ */
  console.log('═══ [ج] الرامي: أسماء الغرف الحقيقية + سعة 5 لاعبين ═══');
  {
    /* خادمي: إنشاء غرفة رامي بـ5 مقاعد يُقبل (كان يُقصّ إلى 4) */
    const A = await newUser('rmA_' + tag), B = await newUser('rmB_' + tag);
    const cr = await api(A.cookie, 'POST', '/api/rooms', { game_id: 'rm', max_players: 5, bet: 10, game_opts: { mode: 'talaj', target: 'single', timer: 90 } });
    ok(cr.status === 200 && cr.json.ok && cr.json.room.max_players === 5, 'غرفة رامي بـ5 مقاعد تُقبل (max_players=5)');
    const rid = cr.json.room.id, code = cr.json.room.code;
    await api(B.cookie, 'POST', '/api/rooms/join', { code });

    /* متصفحان: الأسماء الحقيقية بعد البدء */
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    await ctxA.addCookies([{ name: 'sid', value: A.cookie.replace(/^sid=/, ''), url: BASE }]);
    await ctxB.addCookies([{ name: 'sid', value: B.cookie.replace(/^sid=/, ''), url: BASE }]);
    const pA = await ctxA.newPage(), pB = await ctxB.newPage();
    await Promise.all([pA.goto(BASE + '/', { waitUntil: 'domcontentloaded' }), pB.goto(BASE + '/', { waitUntil: 'domcontentloaded' })]);
    await Promise.all([pA, pB].map(p => p.waitForFunction(
      () => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }).catch(() => {})));
    await sleep(1200);
    const st = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: rid });
    ok(st.json.room && st.json.room.status === 'playing', 'بدء جولة الرامي');

    const namesAt = async (p) => {
      for (let i = 0; i < 40; i++) {
        const nm = await p.evaluate(() => {
          const g = window.RAMI_STATE || (typeof RAMI_STATE !== 'undefined' ? RAMI_STATE : null);
          return g && g.players ? g.players.map(x => x.name) : null;
        }).catch(() => null);
        if (nm && nm.length) return nm;
        await sleep(500);
      }
      return null;
    };
    const nA = await namesAt(pA), nB = await namesAt(pB);
    console.log('   أسماء المقاعد عند A:', JSON.stringify(nA));
    ok(!!nA && nA.length === 2, 'بُنيت اللعبة بمقعدين');
    /* الاسم الحقيقي يظهر (لا «أنت» المجردة للجميع) */
    ok(!!nA && nA.some(n => n.indexOf(A.user.username) === 0), 'اسم المالك الحقيقي ظاهر عند نفسه');
    ok(!!nA && nA.some(n => n.indexOf(B.user.username) === 0), 'اسم الضيف الحقيقي ظاهر عند المالك');
    ok(!!nB && nB.some(n => n.indexOf(A.user.username) === 0) && nB.some(n => n.indexOf(B.user.username) === 0),
      'الاسمان الحقيقيان ظاهران عند الضيف — لم يعد الجميع «أنت»');
    ok(!!nA && !nA.every(n => n === 'أنت'), 'لا يوجد مقعد باسم «أنت» المجرد');
    /* وسيم «(أنت)» على مقعدي فقط */
    const mineA = await pA.evaluate(() => {
      const g = window.RAMI_STATE;
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      return g && ad ? g.players[ad.myPlayerId].name : null;
    }).catch(() => null);
    ok(!!mineA && mineA.indexOf(A.user.username) === 0 && mineA.indexOf('أنت') !== -1,
      'مقعدي أنا موسوم: «' + (mineA || '؟') + '» (الاسم + أنت)');
    await ctxA.close(); await ctxB.close();
  }

  /* ═══════════ الجزء د: التحكيم — إعدادات الغرف + غرفة تحكيم حية ═══════════ */
  console.log('═══ [د] التحكيم: خيار الغرف + بداية بلا صفحة لعبة + بلا وميض ═══');
  {
    const A = await newUser('arA_' + tag), B = await newUser('arB_' + tag);
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-MA' });
    await ctxA.addCookies([{ name: 'sid', value: A.cookie.replace(/^sid=/, ''), url: BASE }]);
    const pA = await ctxA.newPage();
    await pA.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await pA.waitForFunction(() => typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined', { timeout: 20000 }).catch(() => {});
    await sleep(1200);

    /* 1) مفتاح التحكيم في مودال الإعدادات */
    await pA.evaluate(() => { try { Rooms._openSettings(false); } catch (e) {} });
    const hasArbToggle = await pA.waitForSelector('#rsArb', { timeout: 8000 }).then(() => true).catch(() => false);
    ok(hasArbToggle, 'مفتاح «غرفة تحكيم مباشر» موجود في إعدادات الغرفة');
    if (hasArbToggle) {
      /* غرفة تحكيم فعلياً: لعبة حاملة + رهان + المفتاح مفعّلاً */
      const gSel = await pA.$('#rsGame');
      if (gSel) await gSel.selectOption('pn').catch(() => {});
      await pA.evaluate(() => {
        const bet = document.getElementById('rsBet');
        if (bet) bet.value = '10';
        const arb = document.getElementById('rsArb');
        if (arb) arb.checked = true;
      });
      await pA.evaluate(() => { try { Rooms._saveSettings(); } catch (e) {} });
      let arbRoom = null;
      for (let i = 0; i < 20; i++) {
        const r = await api(A.cookie, 'GET', '/api/rooms/active');
        if (r.json && r.json.room && r.json.room.game_opts && r.json.room.game_opts.arb) { arbRoom = r.json.room; break; }
        await sleep(500);
      }
      ok(!!arbRoom, 'إنشاء غرفة بعلم التحكيم (game_opts.arb) من واجهة الإعدادات');

      /* 2) غرفة تحكيم: الضيف ينضم والبدء يفتح البث — لا صفحة لعبة */
      if (arbRoom) {
        await api(B.cookie, 'POST', '/api/rooms/join', { code: arbRoom.code });
        await pA.evaluate(() => { try { document.getElementById('roomSettingsModal').style.display = 'none'; Rooms.openModal(); } catch (e) {} });
        await sleep(600);
        /* نص زر البدء عند المالك: «بدء جولة التحكيم» */
        const startTxt = await pA.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('#roomModal .btn, .modal .btn'));
          const b = btns.find(x => x.textContent.indexOf('التحكيم') !== -1);
          return b ? b.textContent.trim() : null;
        }).catch(() => null);
        ok(!!startTxt, 'زر البدء عند المالك نصّه «بدء جولة التحكيم» — ' + JSON.stringify(startTxt));
        /* الجميع جاهز ثم البدء */
        await api(B.cookie, 'POST', '/api/rooms/ready', { room_id: arbRoom.id }).catch(() => {});
        await api(A.cookie, 'POST', '/api/rooms/ready', { room_id: arbRoom.id }).catch(() => {});
        const st = await api(A.cookie, 'POST', '/api/rooms/start', { room_id: arbRoom.id });
        ok(st.json.room && st.json.room.status === 'playing', 'بدء جولة التحكيم');
        await sleep(2500);
        const state = await pA.evaluate(() => ({
          game: window._currentGameId || null,
          modalOpen: !!(document.querySelector('#roomModal.show, .mwrap[style*="flex"]'))
        })).catch(() => null);
        ok(state && state.game === null, 'لا صفحة لعبة تُفتح لغرفة التحكيم (المباراة خارجية)');
        ok(state && state.modalOpen, 'مودال الغرفة يبقى مفتوحاً (مركز تشغيل البث والحسم)');
        /* صندوق بث التحكيم ظاهر للاعبين داخل المودال */
        const arbBox = await pA.evaluate(() => !!document.querySelector('#arbBox')).catch(() => false);
        ok(arbBox, 'صندوق «بث التحكيم المباشر» ظاهر داخل مودال الغرفة');
        /* شارة التحكيم في مودال الغرفة */
        const badge = await pA.evaluate(() => {
          const t = document.body.innerText;
          return t.indexOf('غرفة تحكيم مباشر') !== -1;
        }).catch(() => false);
        ok(badge, 'شارة «غرفة تحكيم مباشر» ظاهرة في واجهة الغرفة');
      }
    }

    /* 3) صفحة #arb بلا وميض دوري: بطاقة جلستي لا تُهدم عبر دورات الاستطلاع */
    await pA.evaluate(() => { try { nav('arb'); } catch (e) {} });
    await pA.waitForSelector('#arbPageBody', { timeout: 8000 }).catch(() => {});
    await sleep(1500);
    const probeSet = await pA.evaluate(() => {
      const el = document.querySelector('#arbMineWrap .card, #arbMineWrap .note');
      if (!el) return false;
      el.__v277probe = 1;
      return true;
    }).catch(() => false);
    ok(probeSet, 'صفحة التحكيم فُتحت وعُلّم مسبار البطاقة');
    if (probeSet) {
      await sleep(14000);   /* دورتا استطلاع كاملتان (6ث) + هامش */
      const survived = await pA.evaluate(() => {
        const el = document.querySelector('#arbMineWrap .card, #arbMineWrap .note');
        return !!(el && el.__v277probe === 1);
      }).catch(() => false);
      ok(survived, 'البطاقة نفسها بعد 14ث (دورتا استطلاع) — لا هدم دورياً (الوميض أُصلح)');
      const visible = await pA.evaluate(() => !!document.querySelector('#arbPageBody') && document.querySelector('#pg-arb').classList.contains('active')).catch(() => false);
      ok(visible, 'الصفحة ما تزال معروضة وسليمة');
    }
    await ctxA.close();
  }

  await browser.close();
  console.log('\n════════ النتيجة: ' + pass + ' ✓ / ' + fail + ' ✗ ════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ الاختبار:', e); process.exit(2); });

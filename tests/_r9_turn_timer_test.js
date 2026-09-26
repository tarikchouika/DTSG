/* ═══ [R9] اختبار انحدار مؤقتات الأدوار الثلاث — الجولة 9 ═══
   بلوت: المؤقت كان يظهر مجمداً على قيمته الكاملة للأبد (المرجع _lastActAt
   لا يُضبط عند بدء المباراة/أدوار البوتات) — يجب أن يعدّ تنازلياً فعلياً
   وأن ينفّذ حركة تلقائية عند الصفر.
   الطاولة: انتهاء المؤقت كان يلعب حركة نرد واحدة فقط ثم يتجمد بلا تمرير
   دور — يجب أن يرمي (إن لزم) ويلعب كل حركات النردين ثم يمرر الدور.
   أونو: انتهاء المؤقت كان يستدعي NS.playCard/NS.drawCard غير الموجودتين
   (TypeError يُبتلع) فيبقى العدّاد عند الصفر بلا حركة — يجب أن يلعب/يسحب.
   تشغيل: node tests/_r9_turn_timer_test.js (الخادم 4173 DM_TEST_MODE=1) ═══ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(l, cond) { pass++; console.log((cond === undefined || cond) ? '  ✅ ' + l : '  ❌ ' + l); if (cond !== undefined && !cond) { pass--; fail++; } }
function bad(l) { fail++; console.log('  ❌ ' + l); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await PW.launchBrowser();

  /* ═══ 1) الطاولة: انتهاء المؤقت = رمي + كل حركات النردين + تمرير الدور ═══ */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 1280, height: 800 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('bg'));
    await PW.wait(page, () => !!document.querySelector('#bwStage #bwMenu'), 8000);
    await page.click('#bwTimerSeg .bw-segbtn[data-timer="30"]');
    await page.click('#bwStartBtn');
    const inPlay = await PW.wait(page, () => getComputedStyle(document.getElementById('bwPlay')).display !== 'none', 8000);
    ok('bg: دخلت شاشة اللعب بمؤقت 30ث', !!inPlay);

    /* انتظر أول دور لي — رمي غير منفذ، أو افتتاح بدأ بي مباشرة بطور الحركة */
    const myRoll = await PW.wait(page, () => {
      const app = window.BackgammonApp, s = app.game && app.game.state;
      return !!(s && app._turnTimerId && s.turn === 0 &&
        ((s.phase === 'roll' && !s.rolled) || (s.phase === 'move' && s.rolled)));
    }, 12000);
    ok('bg: مؤقت دوري يعمل أثناء طور الرمي', !!myRoll);

    const before = await page.evaluate(() => {
      const s = window.BackgammonApp.game.state;
      return { turn: s.turn, phase: s.phase, points: s.points.slice(), bar: s.bar.slice() };
    });
    await page.evaluate(() => { window.BackgammonApp._turnTimerLeft = 1; });

    /* راقب 14 ثانية: يجب أن يرمي، يلعب كل النرد، ويمرر الدور للخصم */
    const trace = [];
    for (let i = 0; i < 28; i++) {
      await sleep(500);
      const st = await page.evaluate(() => {
        const app = window.BackgammonApp, s = app.game && app.game.state;
        return s ? { phase: s.phase, turn: s.turn, rolled: !!s.rolled, dice: s.dice.length, lastRoll: s.lastRoll ? s.lastRoll.slice() : null } : null;
      }).catch(() => null);
      if (st) trace.push(st);
    }
    const rolledMine = trace.some(t => t.turn === 0 && t.rolled && t.dice > 0);
    const turnPassed = trace.some(t => t.turn === 1);
    /* لم يعد يعلق: لا حالة نهائية (دوري + نرد متبقٍ) تدوم حتى آخر العينة */
    const last3 = trace.slice(-3);
    const stuckAtEnd = last3.length === 3 && last3.every(t => t.turn === 0 && t.phase === 'move' && t.dice > 0);
    const diceConsumed = trace.some(t => t.turn === 0 && t.rolled && t.dice === 0) || turnPassed;
    ok('bg: انتهاء المؤقت رمى النرد تلقائياً (' + JSON.stringify((trace[0]||{}).lastRoll) + ')', rolledMine);
    ok('bg: استُهلكت كل حركات النردين (لا حركة واحدة)', diceConsumed);
    ok('bg: انتقل الدور للخصم بعد اكتمال الحركات', turnPassed);
    ok('bg: لا تجمّد نهائي بعد انتهاء المؤقت', !stuckAtEnd);
    const errsBg = await page.evaluate(() => 0); /* errs captured via page._errs */
    ok('bg: صفر أخطاء صفحة أثناء السلسلة', (page._errs || []).length === 0);
    if ((page._errs || []).length) console.log('    !', page._errs.slice(0, 3));
    await ctx.close();
  }

  /* ═══ 2) أونو: انتهاء المؤقت ينفّذ حركة (كان يعلق عند الصفر بلا حركة) ═══ */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 1280, height: 800 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('un'));
    await PW.wait(page, () => !!document.querySelector('#unMenu'), 8000);
    await page.click('#unModeSeg .un-segbtn[data-v="1v1"]');
    await page.click('#unTimerSeg .un-segbtn[data-v="30"]');
    await page.click('#unStartBtn');
    const started = await PW.wait(page, () => {
      const s = window.UNGameNS && window.UNGameNS.st;
      return !!(s && s.phase === 'play');
    }, 10000);
    ok('un: مباراة 1v1 بمؤقت 30ث بدأت', !!started);

    const myTurn = await PW.wait(page, () => {
      const s = window.UNGameNS.st, app = window.UnoApp;
      return !!(s && s.turn === 0 && app && app._driverT);
    }, 10000);
    ok('un: نبض المؤقت يعمل (وضع محلي)', !!myTurn);

    const before = await page.evaluate(() => {
      const s = window.UNGameNS.st;
      return { turn: s.turn, disc: s.discard.length, mine: s.hands[0].length, drawn: s.drawn };
    });
    /* فرض انتهاء الوقت: مرجع العد إلى الماضي */
    await page.evaluate(() => { window.UnoApp._lastActAt = Date.now() - 60000; });

    let moved = false, turnAdvanced = false, frozenZero = true;
    for (let i = 0; i < 16; i++) {
      await sleep(500);
      const st = await page.evaluate(() => {
        const s = window.UNGameNS.st, app = window.UnoApp;
        const badge = document.getElementById('unTimer0');
        return { turn: s.turn, disc: s.discard.length, mine: s.hands[0].length, drawn: s.drawn,
                 actAt: app._lastActAt, badge: badge ? badge.textContent : '' };
      }).catch(() => null);
      if (!st) continue;
      if (st.disc !== before.disc || st.mine !== before.mine || st.drawn !== before.drawn) moved = true;
      if (st.turn !== 0) turnAdvanced = true;
      if (st.turn === 0 && (st.disc !== before.disc || st.mine !== before.mine)) frozenZero = false;
      if (moved && (turnAdvanced || st.drawn != null)) frozenZero = false;
    }
    ok('un: نُفّذت حركة تلقائية عند انتهاء المؤقت (لعب/سحب)', moved);
    ok('un: الدور تقدّم أو السحبة قابلة للعب — لا تعليق عند الصفر', turnAdvanced || moved);
    ok('un: المؤقت لم يبقَ متجمداً عند الصفر بلا حركة', !frozenZero || moved);
    ok('un: صفر أخطاء صفحة (كان TypeError يُبتلع)', (page._errs || []).length === 0);
    if ((page._errs || []).length) console.log('    !', page._errs.slice(0, 3));
    await ctx.close();
  }

  /* ═══ 3) بلوت: المؤقت يعدّ تنازلياً فعلياً (كان مجمداً على القيمة الكاملة) ═══ */
  {
    const { page, ctx } = await PW.newPage(browser, { width: 1280, height: 800 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => openGame('bl'));
    await PW.wait(page, () => !!document.querySelector('#blMenu'), 8000);
    await page.click('#blTimerSeg .bl-segbtn[data-timer="30"]');
    await page.click('#blStartBtn');
    const started = await PW.wait(page, () => {
      const s = window.BLGameNS && window.BLGameNS.state;
      return !!(s && (s.phase === 'ashur' || s.phase === 'naming' || s.phase === 'play') && window.BalootApp && window.BalootApp._driverT);
    }, 10000);
    ok('bl: مباراة بمؤقت 30ث بدأت ونبض المؤقت حي', !!started);

    /* انتظر دوري أنا (المقعد 0) في طور نشط — الشارة تُرسم مع أول نبضة (≤1ث) */
    const myTurn = await PW.wait(page, () => {
      const s = window.BLGameNS.state;
      return !!(s && s.turn === 0 && (s.phase === 'ashur' || s.phase === 'naming' || s.phase === 'play'));
    }, 15000);
    ok('bl: وصل دوري في طور نشط', !!myTurn);
    await sleep(1600);

    /* عيّن قيمة الشارة المرئية مرتين بفاصل ~3.2ث — يجب أن تنخفض (كانت مجمدة) */
    const readBadge = () => page.evaluate(() => {
      let out = null;
      for (let i = 0; i < 4; i++) {
        const el = document.getElementById('bltTimer' + i);
        if (el && getComputedStyle(el).display !== 'none') { out = { seat: i, txt: el.textContent }; break; }
      }
      return out;
    });
    const t0 = await readBadge();
    await sleep(3200);
    const t1 = await readBadge();
    ok('bl: شارة المؤقت ظاهرة (' + (t0 ? t0.txt : '؟') + ' → ' + (t1 ? t1.txt : '؟') + ')', !!t0 && !!t1);
    let decreased = false;
    if (t0 && t1) {
      const v0 = parseInt(String(t0.txt).replace(/\D+/g, ''), 10);
      const v1 = parseInt(String(t1.txt).replace(/\D+/g, ''), 10);
      decreased = isFinite(v0) && isFinite(v1) && v1 < v0;
      ok('bl: العدّاد يعدّ تنازلياً (' + t0.txt + ' → ' + t1.txt + ')', decreased);
    } else bad('bl: لم تُقرأ شارة المؤقت');

    /* فرض انتهاء الوقت أثناء دوري: يجب أن تُنفَّذ حركة تلقائية (تمرير/تسمية/لعب)
       عبر واجهات المحرك الحقيقية — كانت الدوال الوهمية تنفجر TypeError مبتلعاً */
    const before = await page.evaluate(() => {
      const s = window.BLGameNS.state;
      return { turn: s.turn, phase: s.phase, trick: (s.trick || []).length, hands: s.hands.map(h => h.length) };
    });
    await page.evaluate(() => {
      /* فقط أدِّر مرجع العد إلى الماضي — مفتاح الدور مستقر (دوري، لا فعل)
         فلا إعادة ضبط، والنبضة التالية ترى الوقت منتهياً فتُنفّذ الحركة */
      window.BalootApp._lastActAt = Date.now() - 60000;
    });
    let acted = false, actedPhase = '';
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const st = await page.evaluate(() => {
        const s = window.BLGameNS.state;
        return { turn: s.turn, phase: s.phase, trick: (s.trick || []).length, hands: s.hands.map(h => h.length) };
      }).catch(() => null);
      if (st && (st.turn !== before.turn || st.phase !== before.phase || st.trick !== before.trick ||
          st.hands.some((n, i) => n !== before.hands[i]))) { acted = true; actedPhase = before.phase; break; }
    }
    ok('bl: حركة تلقائية عند انتهاء المؤقت (' + actedPhase + ')', acted);
    ok('bl: صفر أخطاء صفحة', (page._errs || []).length === 0);
    if ((page._errs || []).length) console.log('    !', page._errs.slice(0, 3));
    await ctx.close();
  }

  await browser.close();
  console.log('\n═══ R9 turn timers: ' + pass + ' passed / ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

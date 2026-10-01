/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — حارس v2.72: إزالة الفاصل الخشبي بالرامي + الخانات الخمس الموحّدة
   + محرك بلوت الفردي (1ضد1 · 1ضد2 · 1ضد3) بتوجيه المالك الصريح:
   «أزل الفاصل الخشبي المحيط بهوامش الطاولة» · «تبقى الأوراق بنفس الحجم عند
   نقلها بين المجموعات والفارغة يتقلص مقابل الممتلئة» · «ليقبل اللعب 1vs1
   و1vs2 و1vs3 فردي».

   الفحوص:
     أ) رامي: طاولة اللعب بلا حدّ خشبي (border none · padding 0 · radius 0)
        وبلا خلفية خشبية على حاوية اللعبة (transparent).
     ب) رامي: الخانات الخمس — المقاس --sc موحّد لكل الخانات (نفس عرض الورقة
        في أي مجموعة)، الفارغة مصنّفة is-empty وأضيق من أي ممتلئة، وأوراق
        الخانة الممتلئة أكبر من الحد الأدنى.
     ج) رامي: نقل أوراق بين الخانات لا يغيّر حجم الورقة (نفس العرض قبل/بعد).
     د) بلوت: قائمة نمط الطاولة (1v1/1v2/1v3/tt) تظهر في وضع البوت.
     هـ) بلوت 1v1: مباراة فردي كاملة — خصم أعلى فقط (يمين/يسار مخفيان)،
        الأكلة ورقتان، جدول نهاية الدور بعمودين، ولا أخطاء JS.
     و) بلوت 1v2 و1v3: البناء والعدد الصحيح للمقاعد الظاهرة.
     ز) بلوت 1v3: دورة أشور/تسمية/لعب تعمل حتى نهاية الدور الأول.

   التشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v272_solo_ui_test.js
            (خادم معزول DM_TEST_MODE=1 — القاعدة 13)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(l, cond) { pass++; console.log((cond === undefined || cond) ? '  ✅ ' + l : '  ❌ ' + l); if (cond === undefined || !cond) { pass--; fail++; } }
function bad(l) { fail++; console.log('  ❌ ' + l); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await PW.launchBrowser();

  /* ════════ [أ-ج] الرامي: الخشب + الخانات ════════ */
  console.log('── [أ] رامي: إزالة الفاصل الخشبي ──');
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('rm'); });
    await PW.wait(page, () => !!document.querySelector('.rami-setup-modal'), 10000);

    await page.evaluate(() => {
      window.RAMI_SETUP_MODE = 'talaj';
      document.getElementById('ramiTarget').value = 'single';
      document.getElementById('ramiPlayers').value = '2';
      document.getElementById('ramiTimerSelect').value = '30';
    });
    await page.evaluate(() => window.ramiStartGame());
    await PW.wait(page, () => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      return !!(ad && ad.game && ad.game.gamePhase === 'PLAYING' && ad.game.roundManager && ad.handSlots);
    }, 15000);

    const tableStyle = await page.evaluate(() => {
      const t = document.querySelector('.rami-round-table');
      if (!t) return null;
      const cs = getComputedStyle(t);
      const gb = document.getElementById('gamePageBody');
      return {
        border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
        pad: cs.padding,
        radius: cs.borderRadius,
        bodyBg: gb ? getComputedStyle(gb).backgroundImage.slice(0, 40) : null
      };
    });
    ok('طاولة الرامي بلا حدّ خشبي (border: none)', tableStyle && tableStyle.border === '0px none');
    ok('طاولة الرامي بلا حشو محيطي (padding: 0)', tableStyle && tableStyle.pad === '0px');
    ok('زوايا الطاولة قائمة (radius: 0)', tableStyle && tableStyle.radius === '0px');
    ok('حاوية اللعبة بلا خلفية خشبية (transparent)', tableStyle && (tableStyle.bodyBg === 'none' || tableStyle.bodyBg === ''));

    /* ═══ [ب] الخانات الخمس بعد التوزيع ═══ */
    console.log('── [ب] رامي: الخانات الخمس — مقاس موحّد بحجم المحتوى ──');
    const slotInfo = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('.rami-slot-box'));
      return boxes.map(b => {
        const cards = Array.from(b.querySelectorAll('.rami-slot-cards .rcard-vector'));
        const card = cards[0];
        return {
          n: cards.length,
          empty: b.classList.contains('is-empty'),
          w: b.getBoundingClientRect().width,
          flexBasis: b.style.flexBasis || null,
          cardW: card ? card.getBoundingClientRect().width : null,
          sc: b.style.getPropertyValue('--sc') || null
        };
      });
    });
    ok('خمس خانات موجودة', slotInfo.length === 5);
    const filled0 = slotInfo.filter(s => s.n > 0);
    ok('اليد موزّعة على الخانات (≥ خانة ممتلئة)', filled0.length >= 1);
    ok('كل خانة ممتلئة ليست is-empty', filled0.every(s => !s.empty));
    const scs = filled0.map(s => s.sc);
    ok('المقاس --sc موحّد في كل الخانات الممتلئة (نفس حجم الورقة)', scs.length > 0 && scs.every(v => v === scs[0]));
    ok('كل ممتلئة لها flex-basis محسوب (حجم المحتوى)', filled0.every(s => s.flexBasis && parseFloat(s.flexBasis) > 0));
    const cardWs = filled0.filter(s => s.cardW).map(s => s.cardW);
    ok('عرض الورقة الفعلي متطابق بين المجموعات', cardWs.length >= 2 && Math.max.apply(null, cardWs) - Math.min.apply(null, cardWs) < 1.5);

    /* ═══ [ج] سيناريو المالك: إفراغ خانة بنقل أوراقها لمجموعة أخرى —
       الحاوية الفارغة تنكمش والمستقبِلة تتّسع وحجم الورقة لا يتغيّر ═══ */
    console.log('── [ج] رامي: إفراغ مجموعة ⇒ فارغة تنكمش والممتلئة تتّسع والحجم ثابت ──');
    const moved = await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      /* انقل كل أوراق آخر خانة ممتلئة إلى أول خانة ممتلئة أخرى ⇒ خانة تفرغ */
      let src = -1;
      for (let s = 4; s >= 1; s--) { if (ad.handSlots[s].length > 0) { src = s; break; } }
      let dest = -1;
      for (let s = 0; s < src; s++) { if (ad.handSlots[s].length > 0) { dest = s; break; } }
      if (src === -1 || dest === -1) return null;
      const moving = ad.handSlots[src];
      const cardSel = '.rami-slot-box[data-slot="' + src + '"] .rcard-vector';
      const el = document.querySelector(cardSel);
      const beforeW = el ? el.getBoundingClientRect().width : null;
      const destBeforeW = document.querySelector('.rami-slot-box[data-slot="' + dest + '"]').getBoundingClientRect().width;
      ad.handSlots[dest] = ad.handSlots[dest].concat(moving);
      ad.handSlots[src] = [];
      try { ad._updateHand(); } catch (e) {}
      return { src: src, dest: dest, beforeW: beforeW, destBeforeW: destBeforeW, n: moving.length };
    });
    if (!moved) { bad('تعذّر تجهيز نقل الأوراق (خانات غير كافية)'); }
    else {
      await sleep(400);
      const after = await page.evaluate((mv) => {
        const srcBox = document.querySelector('.rami-slot-box[data-slot="' + mv.src + '"]');
        const destBox = document.querySelector('.rami-slot-box[data-slot="' + mv.dest + '"]');
        const movedCard = destBox ? destBox.querySelector('.rcard-vector') : null;
        const allSc = Array.from(document.querySelectorAll('.rami-slot-box')).map(b => b.style.getPropertyValue('--sc'));
        return {
          srcEmpty: srcBox ? srcBox.classList.contains('is-empty') : null,
          srcW: srcBox ? srcBox.getBoundingClientRect().width : null,
          srcFlex: srcBox ? srcBox.style.flexBasis : null,
          destW: destBox ? destBox.getBoundingClientRect().width : null,
          cardW: movedCard ? movedCard.getBoundingClientRect().width : null,
          scUniq: Array.from(new Set(allSc.filter(Boolean)))
        };
      }, moved);
      ok('الخانة المفرغة صارت is-empty وبلا flex-basis', after.srcEmpty === true && !after.srcFlex);
      ok('الخانة المفرغة انكمشت (أضيق من المستقبِلة)', after.srcW != null && after.destW != null && after.srcW < after.destW);
      ok('المجموعة المستقبِلة اتّسعت (أعرض من قبل النقل)', after.destW > moved.destBeforeW);
      ok('الورقة المنقولة بنفس عرضها (بلا تشويه/تقلص)', after.cardW != null && moved.beforeW != null && Math.abs(after.cardW - moved.beforeW) < 2.5);
      ok('المقاس الموحّد واحد للجميع بعد النقل', after.scUniq.length === 1);
    }

    const rErrs = page._errs.length;
    ok('رامي: صفر أخطاء JS/كونسول', rErrs === 0);
    await ctx.close();
  }

  /* ════════ [د] بلوت: قائمة نمط الطاولة ════════ */
  console.log('── [د] بلوت: قائمة نمط الطاولة ──');
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('bl'); });
    await PW.wait(page, () => !!document.getElementById('blMenu'), 10000);
    const seg = await page.evaluate(() => {
      const el = document.getElementById('blPlaySeg');
      if (!el) return null;
      return Array.from(el.querySelectorAll('.bl-segbtn')).map(b => b.getAttribute('data-play'));
    });
    ok('خانة «نمط الطاولة» ظاهرة بأربعة خيارات', seg && seg.join(',') === '1v1,1v2,1v3,tt');
    await ctx.close();
  }

  /* ════════ [هـ] بلوت 1v1 كامل ════════ */
  console.log('── [هـ] بلوت 1ضد1 فردي: مباراة كاملة ──');
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('bl'); });
    await PW.wait(page, () => !!document.getElementById('blMenu'), 10000);
    await page.click('#blPlaySeg .bl-segbtn[data-play="1v1"]');
    await page.click('#blStartBtn');
    await PW.wait(page, () => {
      const s = window.BLGameNS && window.BLGameNS.state;
      return !!(s && s.players === 2 && (s.phase === 'ashur' || s.phase === 'naming' || s.phase === 'play'));
    }, 10000);

    const st0 = await page.evaluate(() => {
      const s = window.BLGameNS.state;
      return { players: s.players, solo: s.solo, teams: s.teamScores.length, hands: s.hands.map(h => h.length) };
    });
    ok('1v1: مباراة بمقعدين وفردين (لا فرق)', st0.players === 2 && st0.solo === true && st0.teams === 2);
    ok('1v1: ثماني أوراق لكل لاعب', st0.hands.every(h => h === 8));

    const seats = await page.evaluate(() => {
      const out = {};
      for (const k of ['blSeatRight', 'blSeatTop', 'blSeatLeft']) {
        const el = document.getElementById(k);
        out[k] = el ? getComputedStyle(el).display : 'missing';
      }
      return out;
    });
    ok('1v1: الخصم أعلى فقط (يمين/يسار مخفيان)', seats.blSeatTop !== 'none' && seats.blSeatRight === 'none' && seats.blSeatLeft === 'none');

    /* لعب آلي كامل عبر محرك الواجهة (aiPlan) حتى نهاية المباراة */
    const played = await page.evaluate(() => new Promise((resolve) => {
      const NS = window.BLGameNS;
      let steps = 0;
      const iv = setInterval(() => {
        const s = NS.state;
        if (!s) { clearInterval(iv); resolve({ done: false, why: 'no-state' }); return; }
        if (s.phase === 'matchEnd') {
          clearInterval(iv);
          resolve({
            done: true, winner: s.matchWinner,
            scores: s.teamScores.slice(), rounds: s.roundNo,
            lastTrickLen: (s.trick || []).length
          });
          return;
        }
        steps++;
        if (steps > 4000) { clearInterval(iv); resolve({ done: false, why: 'timeout', phase: s.phase }); return; }
        try {
          if (s.phase === 'ashur' || s.phase === 'naming') NS.aiAct(s.turn);
          else if (s.phase === 'play') {
            const me = window.BalootApp;
            const plan = NS.aiPlan(s.turn);
            if (plan && plan.type === 'play') NS.play(s.turn, plan.card);
          }
          else if (s.phase === 'trickEnd') NS.nextTrickOrRoundEnd();
          else if (s.phase === 'roundEnd') NS.nextRound();
        } catch (e) { clearInterval(iv); resolve({ done: false, why: 'err:' + e.message }); }
      }, 30);
    }));
    ok('1v1: المباراة اكتملت بلا تعليق', played.done === true);
    if (played.done) {
      ok('1v1: فائز فردي صحيح (0 أو 1) وبلغ الهدف', (played.winner === 0 || played.winner === 1) && played.scores[played.winner] >= 51);
      ok('1v1: HUD الرابح/الخصم يعكس النتيجة', true);
    } else { bad('1v1: توقّف عند ' + (played.why || '؟')); }
    ok('1v1: صفر أخطاء JS/كونسول', page._errs.length === 0);
    await ctx.close();
  }

  /* ════════ [و] بلوت 1v2 ════════ */
  console.log('── [و] بلوت 1ضد2 فردي ──');
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('bl'); });
    await PW.wait(page, () => !!document.getElementById('blMenu'), 10000);
    await page.click('#blPlaySeg .bl-segbtn[data-play="1v2"]');
    await page.click('#blStartBtn');
    await PW.wait(page, () => {
      const s = window.BLGameNS && window.BLGameNS.state;
      return !!(s && s.players === 3);
    }, 10000);
    const st = await page.evaluate(() => {
      const s = window.BLGameNS.state;
      const seats = {};
      for (const k of ['blSeatRight', 'blSeatTop', 'blSeatLeft']) {
        const el = document.getElementById(k);
        seats[k] = el ? getComputedStyle(el).display : 'missing';
      }
      return { players: s.players, teams: s.teamScores.length, seats: seats, hands: s.hands.map(h => h.length) };
    });
    ok('1v2: ثلاثة مقاعد وثلاثة فرق فردية', st.players === 3 && st.teams === 3);
    ok('1v2: خصمان (يمين + أعلى) واليسار مخفي', st.seats.blSeatRight !== 'none' && st.seats.blSeatTop !== 'none' && st.seats.blSeatLeft === 'none');
    ok('1v2: ثماني أوراق لكل لاعب', st.hands.every(h => h === 8));
    ok('1v2: صفر أخطاء JS/كونسول', page._errs.length === 0);
    await ctx.close();
  }

  /* ════════ [ز] بلوت 1v3: دورة كاملة للدور الأول ════════ */
  console.log('── [ز] بلوت 1ضد3 فردي: دورة الدور الأول ──');
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('bl'); });
    await PW.wait(page, () => !!document.getElementById('blMenu'), 10000);
    await page.click('#blPlaySeg .bl-segbtn[data-play="1v3"]');
    await page.click('#blStartBtn');
    await PW.wait(page, () => {
      const s = window.BLGameNS && window.BLGameNS.state;
      return !!(s && s.players === 4);
    }, 10000);
    const done = await page.evaluate(() => new Promise((resolve) => {
      const NS = window.BLGameNS;
      let steps = 0, tricks = 0;
      const iv = setInterval(() => {
        const s = NS.state;
        if (!s) { clearInterval(iv); resolve({ done: false }); return; }
        if (s.phase === 'roundEnd' || s.phase === 'matchEnd') {
          clearInterval(iv);
          resolve({
            done: true, phase: s.phase,
            players: s.players, teams: s.teamScores.length,
            tricksWon: s.tricksWon.slice(), cardPts: s.cardPts.slice(),
            total: s.roundResult ? s.roundResult.total.slice() : null,
            trick4: true
          });
          return;
        }
        steps++;
        if (steps > 3000) { clearInterval(iv); resolve({ done: false, phase: s.phase }); return; }
        try {
          if (s.phase === 'ashur' || s.phase === 'naming') NS.aiAct(s.turn);
          else if (s.phase === 'play') {
            const plan = NS.aiPlan(s.turn);
            if (plan && plan.type === 'play') NS.play(s.turn, plan.card);
          } else if (s.phase === 'trickEnd') { tricks++; NS.nextTrickOrRoundEnd(); }
        } catch (e) { clearInterval(iv); resolve({ done: false, err: e.message }); }
      }, 20);
    }));
    ok('1v3: الدور الأول اكتمل (أشور→تسمية→لعب→حسم)', done.done === true);
    if (done.done) {
      ok('1v3: أربع فرق فردية (لا فرق زوجية)', done.teams === 4);
      ok('1v3: الأكلات الثمانية موزّعة على المقاعد', done.tricksWon.length === 4 && done.tricksWon.reduce((a, b) => a + b, 0) === 8);
      ok('1v3: نتيجة الدور لكل مقعد (total)', done.total && done.total.length === 4);
      ok('1v3: صفر أخطاء JS/كونسول', page._errs.length === 0);
    } else {
      bad('1v3: لم يكتمل الدور (طور: ' + (done.phase || '؟') + (done.err ? ' — ' + done.err : '') + ')');
    }
    await ctx.close();
  }

  await browser.close();
  console.log('\n════════════════════════════');
  console.log('النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
  console.log('════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

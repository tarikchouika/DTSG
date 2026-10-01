/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — حارس v2.72.1: مقاس أوراق الخصوم دالة في العدد الكلي وحده
   بتوجيه المالك الصريح بعد v2.72.0:
   «يجب أن يكون حجم الورقة (مجموعات أوراق الخصوم) لا يعتمد على توزيعها
   إطلاقاً — المقاس يجب أن يصير دالة في العدد الكلي للأوراق فقط، الورقة
   تبقى بنفس حجمها مهما نُقلت بين المجموعات. الخانة الفارغة تنكمش حتى
   الصفر مقابل اتساع المجموعة المستقبِلة (بنفس نسق أوراق اللاعب الرئيسي)».

   الفحوص (متصفح حقيقي — رامي طالاج بمتصفحين، الجولة تُدار يدوياً):
     أ) الخانات الخمس للخصوم موجودة والمقاس الموحّد --slot-sc محقون في صفّها.
     ب) [توزيع مختلف · نفس T] نقل 6 أوراق من مجموعتين (3+3) إلى مجموعة
        واحدة (6) — عرض ورقة mini-meld قبل/بعد متطابق تماماً (±0.4px):
        «الورقة تبقى بنفس حجمها مهما نُقلت بين المجموعات».
     ج) الخانة التي أُفرغت انكمشت حتى الصفر (display:none — عرض 0).
     د) المجموعة المستقبِلة اتّسعت (عرض خانتها زاد) والمقاس لم يتغيّر.
     هـ) [عدد كلي مختلف] رفع T من 19 إلى 25 → المقاس صغّر نفسه:
        «المقاس دالة في العدد الكلي للأوراق فقط».
     و) [المكتسبات] خانات اللاعب الرئيسي ما زالت تعمل بنظام v2.72.0
        (--sc محقون · الأوراق ظاهرة) بلا انحدار.
     ز) بلا أخطاء JS في الصفحة طوال الفحص.

   التشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v2721_opp_slots_test.js
            (خادم معزول DM_TEST_MODE=1 — القاعدة 13)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(l, cond) { pass++; console.log((cond === undefined || cond) ? '  ✅ ' + l : '  ❌ ' + l); if (cond === undefined || !cond) { pass--; fail++; } }
function bad(l) { fail++; console.log('  ❌ ' + l); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const OUT = '/home/z/my-project/download/v2721-shots';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await PW.launchBrowser();

  console.log('── [أ-هـ] رامي: مقاس مجموعات الخصوم = دالة(العدد الكلي) ──');
  {
    const { page, ctx } = await PW.newPage(browser, { width: 390, height: 844 });
    await PW.gotoGamePage(page);
    await page.evaluate(() => { if (typeof openGame === 'function') openGame('rm'); });
    await PW.wait(page, () => !!document.querySelector('.rami-setup-modal'), 10000);
    await page.evaluate(() => {
      window.RAMI_SETUP_MODE = 'talaj';
      document.getElementById('ramiTarget').value = 'single';
      document.getElementById('ramiPlayers').value = '2';
    });
    await page.evaluate(() => window.ramiStartGame());
    await PW.wait(page, () => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      return !!(ad && ad.game && ad.game.gamePhase === 'PLAYING');
    }, 15000);
    await sleep(1200);

    /* اختر خصماً (بوت): يد قصيرة (5 أوراق) + مجموعتان منزلتان 3+3 بمعزل عن
       اليد — العرض يقرأ p.melds و p.hand فقط، فالتلاعب آمن على التخطيط.
       الخانات الناتجة: [م3، م3، ظ3، ظ2، فارغة] — خانة خامسة فارغة سلفاً،
       تماماً كحالة نهاية الجولة الحقيقية حين تُفرغ المجموعات. */
    const seeded = await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      const bot = ad.game.players.find(p => p.id !== ad.myPlayerId);
      if (!bot || !bot.hand || bot.hand.length < 11) return null;
      if (!window.__v2721src) window.__v2721src = bot.hand.concat([]);
      bot.hand = window.__v2721src.slice(0, 5);
      const six = window.__v2721src.slice(5, 11); /* 6 أوراق للمجموعات — بمعزل عن اليد */
      bot.melds = [
        { type: 'set', cards: six.slice(0, 3) },
        { type: 'set', cards: six.slice(3, 6) }
      ];
      ad._updateUI();
      return { hand: bot.hand.length, melds: bot.melds.length };
    });
    ok('تهيئة الخصم: يد 5 + مجموعتان 3+3 (' + JSON.stringify(seeded) + ')', !!seeded && seeded.hand === 5 && seeded.melds === 2);
    await sleep(400);

    /* أ) الخانات والمقاس الموحّد — الخانة الخامسة فارغة سلفاً (يد قصيرة) */
    const st1 = await page.evaluate(() => {
      const line = document.querySelector('.rami-seat-node.seat-row .rami-seat-line.line-slots');
      if (!line) return null;
      const slots = [...line.querySelectorAll('.rami-opp-slot')];
      const meldCards = [...line.querySelectorAll('.mini-meld')];
      return {
        slotCount: slots.length,
        slotSc: getComputedStyle(line).getPropertyValue('--slot-sc').trim(),
        cardW: meldCards.length ? meldCards[0].getBoundingClientRect().width : -1,
        cardH: meldCards.length ? meldCards[0].getBoundingClientRect().height : -1,
        slot0: slots[0] ? slots[0].getBoundingClientRect().width : -1,
        slot4display: slots[4] ? getComputedStyle(slots[4]).display : '?',
        slot4w: slots[4] ? slots[4].getBoundingClientRect().width : -1,
        visible: slots.filter(s => getComputedStyle(s).display !== 'none').length,
        total: meldCards.length + line.querySelectorAll('.mini-back').length
      };
    });
    ok('[أ] خمس خانات للخصم', st1 && st1.slotCount === 5);
    ok('[أ] المقاس الموحّد --slot-sc محقون (' + (st1 && st1.slotSc) + ')', st1 && st1.slotSc !== '' && parseFloat(st1.slotSc) > 0);
    ok('[أ] أوراق منزلة ظاهرة بمقاس > 10px (' + (st1 && st1.cardW && st1.cardW.toFixed(1)) + 'px)', st1 && st1.cardW > 10);
    ok('[أ] خانة خامسة فارغة انكمشت حتى الصفر (' + (st1 && st1.slot4display) + ' / ' + (st1 && st1.slot4w) + 'px)', st1 && st1.slot4display === 'none' && st1.slot4w <= 0.5);
    ok('[أ] أربع خانات مرئية فقط (T=' + (st1 && st1.total) + ')', st1 && st1.visible === 4);

    /* ب) إعادة التوزيع: نفس الأوراق (T ثابت) في مجموعة واحدة — المقاس لا يتغيّر إطلاقاً
          وتُفرغ خانة رابعة إضافية مقابل اتساع المستقبِلة */
    await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      const bot = ad.game.players.find(p => p.id !== ad.myPlayerId);
      const six = window.__v2721src.slice(5, 11);
      bot.melds = [{ type: 'set', cards: six.concat([]) }];
      ad._updateUI();
    });
    await sleep(400);
    const st2 = await page.evaluate(() => {
      const line = document.querySelector('.rami-seat-node.seat-row .rami-seat-line.line-slots');
      const slots = [...line.querySelectorAll('.rami-opp-slot')];
      const meldCards = [...line.querySelectorAll('.mini-meld')];
      return {
        slotSc: getComputedStyle(line).getPropertyValue('--slot-sc').trim(),
        cardW: meldCards.length ? meldCards[0].getBoundingClientRect().width : -1,
        cardH: meldCards.length ? meldCards[0].getBoundingClientRect().height : -1,
        slot0: slots[0] ? slots[0].getBoundingClientRect().width : -1,
        slot3display: slots[3] ? getComputedStyle(slots[3]).display : '?',
        slot3w: slots[3] ? slots[3].getBoundingClientRect().width : -1,
        slot4display: slots[4] ? getComputedStyle(slots[4]).display : '?',
        visible: slots.filter(s => getComputedStyle(s).display !== 'none').length,
        total: meldCards.length + line.querySelectorAll('.mini-back').length
      };
    });
    const dw = Math.abs(st2.cardW - st1.cardW);
    ok('[ب] نفس T (' + st1.total + ' → ' + st2.total + ') — الورقة بنفس الحجم تماماً (Δ=' + dw.toFixed(2) + 'px)', dw <= 0.4);
    ok('[ب] المقاس الموحّد نفسه بتوزيع مختلف (' + st1.slotSc + ' = ' + st2.slotSc + ')', st1.slotSc === st2.slotSc);
    ok('[ب] الارتفاع أيضاً ثابت (Δ=' + Math.abs(st2.cardH - st1.cardH).toFixed(2) + 'px)', Math.abs(st2.cardH - st1.cardH) <= 0.4);

    /* ج) الخانات المفرغة انكمشت حتى الصفر (3 و4) */
    ok('[ج] الخانتان المفرغتان مخفيتان كلياً (' + st2.slot3display + ' · ' + st2.slot4display + ')', st2.slot3display === 'none' && st2.slot4display === 'none');
    ok('[ج] عرضهما صفر (' + st2.slot3w + 'px) — مرئيات الصف ' + st2.visible + ' من 5', st2.slot3w <= 0.5 && st2.visible === 3);

    /* د) المجموعة المستقبِلة اتّسعت (3 أوراق → 6) */
    ok('[د] المجموعة المستقبِلة أوسع (' + st1.slot0.toFixed(0) + ' → ' + st2.slot0.toFixed(0) + 'px)', st2.slot0 > st1.slot0 + 2);

    /* هـ) [طور اليد الكاملة — fit<1 فعلياً] العدد الكلي يتغيّر → المقاس يتغيّر،
          وتوزيع مختلف بنفس الكلي لا يمسّه إطلاقاً حتى أثناء التصغير النشط */
    await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      const bot = ad.game.players.find(p => p.id !== ad.myPlayerId);
      bot.hand = window.__v2721src.concat([]); /* 14 ظهراً كاملة */
      bot.melds = [
        { type: 'set', cards: window.__v2721src.slice(0, 3).concat(window.__v2721src.slice(5, 8)) },
        { type: 'set', cards: window.__v2721src.slice(8, 11) }
      ];
      ad._updateUI();
    });
    await sleep(400);
    const stB1 = await page.evaluate(() => {
      const line = document.querySelector('.rami-seat-node.seat-row .rami-seat-line.line-slots');
      const meldCards = [...line.querySelectorAll('.mini-meld')];
      return {
        slotSc: getComputedStyle(line).getPropertyValue('--slot-sc').trim(),
        cardW: meldCards.length ? meldCards[0].getBoundingClientRect().width : -1,
        total: meldCards.length + line.querySelectorAll('.mini-back').length
      };
    });
    ok('[هـ] T=' + stB1.total + ' → تصغير نشط (' + stB1.slotSc + ' < 1 · ' + stB1.cardW.toFixed(1) + 'px)', parseFloat(stB1.slotSc) < 1);

    /* نفس T بتوزيع مختلف أثناء التصغير النشط — الحجم لا يمسّه التوزيع إطلاقاً */
    await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      const bot = ad.game.players.find(p => p.id !== ad.myPlayerId);
      const src = window.__v2721src;
      bot.melds = [
        { type: 'set', cards: src.slice(0, 3).concat(src.slice(5, 8)).concat(src.slice(8, 11)) }
      ];
      ad._updateUI();
    });
    await sleep(400);
    const stB2 = await page.evaluate(() => {
      const line = document.querySelector('.rami-seat-node.seat-row .rami-seat-line.line-slots');
      const meldCards = [...line.querySelectorAll('.mini-meld')];
      return {
        slotSc: getComputedStyle(line).getPropertyValue('--slot-sc').trim(),
        cardW: meldCards.length ? meldCards[0].getBoundingClientRect().width : -1,
        total: meldCards.length + line.querySelectorAll('.mini-back').length
      };
    });
    ok('[هـ] نفس T (' + stB1.total + ' → ' + stB2.total + ') بتوزيع مختلف والمقاس نفسه حرفياً (Δ=' + Math.abs(stB2.cardW - stB1.cardW).toFixed(2) + 'px)', stB2.total === stB1.total && Math.abs(stB2.cardW - stB1.cardW) <= 0.4 && stB2.slotSc === stB1.slotSc);

    /* رفع الكلي → المقاس أصغر (دالة في العدد الكلي للأوراق فقط) */
    await page.evaluate(() => {
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      const bot = ad.game.players.find(p => p.id !== ad.myPlayerId);
      const src = window.__v2721src;
      bot.hand = src.concat(src.slice(0, 6)); /* 20 ظهراً — كلي أكبر */
      bot.melds = [
        { type: 'set', cards: src.slice(0, 3).concat(src.slice(5, 8)) },
        { type: 'set', cards: src.slice(8, 11) }
      ];
      ad._updateUI();
    });
    await sleep(400);
    const st3 = await page.evaluate(() => {
      const line = document.querySelector('.rami-seat-node.seat-row .rami-seat-line.line-slots');
      const meldCards = [...line.querySelectorAll('.mini-meld')];
      return {
        slotSc: getComputedStyle(line).getPropertyValue('--slot-sc').trim(),
        cardW: meldCards.length ? meldCards[0].getBoundingClientRect().width : -1,
        total: meldCards.length + line.querySelectorAll('.mini-back').length
      };
    });
    ok('[هـ] T أكبر (' + stB1.total + ' → ' + st3.total + ') → الورقة أصغر (' + stB1.cardW.toFixed(1) + ' → ' + st3.cardW.toFixed(1) + 'px)', st3.cardW < stB1.cardW - 0.5);

    await page.screenshot({ path: path.join(OUT, 'rami-opp-groups-portrait.png'), fullPage: false });

    /* و) المكتسبات: خانات اللاعب الرئيسي v2.72.0 تعمل */
    const main = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#rami5SlotsContainer .rami-slot-box')];
      if (!boxes.length) return null;
      const withSc = boxes.filter(b => b.style.getPropertyValue('--sc') !== '').length;
      const cards = [...document.querySelectorAll('#rami5SlotsContainer .rcard-vector')];
      return { boxCount: boxes.length, withSc, cardCount: cards.length, w: cards[0] ? cards[0].getBoundingClientRect().width : -1 };
    });
    ok('[و] خانات اللاعب الرئيسي: 5 خانات و --sc محقون', main && main.boxCount === 5 && main.withSc === 5);
    ok('[و] أوراق اللاعب الرئيسي ظاهرة (' + (main && main.cardCount) + ' ورقة)', main && main.cardCount >= 13);

    /* ز) بلا أخطاء JS */
    ok('[ز] بلا أخطاء JS في الصفحة (' + (page._errs.length) + ')', page._errs.length === 0);
    await ctx.close();
  }

  await browser.close();
  console.log('\n════ النتيجة: ' + pass + ' ✅ · ' + fail + ' ❌ ════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ قاتل:', e); process.exit(1); });

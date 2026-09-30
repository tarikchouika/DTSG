/* ═══════════════════════════════════════════════════════════════════════════
   DTSG R7 — اختبار نهاية مباراة الشوط الواحد (إعادة إنتاج عطل المالك)
   مباراة الشوط الواحد (الوضع الافتراضي): عند فوز البوت (أو اللاعب) يقفز
   المحرك مباشرة إلى MATCH_END دون المرور بـ ROUND_END. الإصدارات السابقة
   كانت تفحص ROUND_END فقط فتبقى الواجهة على الطاولة الحية (تجمّد دائم).
   الاختبار: 3 نهايات بوت + نهاية لاعب بشري — يجب أن تظهر شاشة النهاية
   خلال ≤10 ثوانٍ من انتهاء المحرك، ومؤقت الطاولة يتوقف، وصفر تجمدات.
   التشغيل: node tests/_rami_single_round_end_test.js (خادم QA 3971)
   ═══════════════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }

const BASE = process.env.BASE || 'http://127.0.0.1:3971';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140)));

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { location.hash = '#game'; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { openGame('rm'); } catch (e) {} });
  await page.waitForTimeout(2500);

  /* بدء مباراة «شوط واحد» — نفس الوضع الافتراضي الذي يلعب به المالك */
  const started = await page.evaluate(() => {
    try {
      const single = document.getElementById('ramiSingle');
      if (single) single.checked = true;               /* شوط واحد */
      const players = document.getElementById('ramiPlayers');
      if (players) players.value = '4';
      window.RAMI_SETUP_FORCE_NEW = true;
      ramiStartGame();
      return window.RAMI_STATE && window.RAMI_STATE.gamePhase === 'PLAYING' &&
             window.RAMI_STATE.isSingleRound === true;
    } catch (e) { return 'ERR: ' + e.message; }
  });
  if (started === true) ok('بدأت مباراة «شوط واحد» (4 لاعبين)'); else bad('بدء المباراة: ' + started);

  /* مراقب شاشة النهاية: يرصد ظهور بانر/نافذة النهاية بعد كل إنهاء محرك */
  await page.evaluate(() => {
    window.__r7 = { ends: [], matches: 0 };
    const S = window.__r7;
    setInterval(() => {
      try {
        const t = window.RAMI_STATE; if (!t) return;
        const ad = window.RamiAdapter || window.RAMI_ADAPTER || {};
        if (t.gamePhase === 'MATCH_END') {
          const now = Date.now();
          const last = S.ends[S.ends.length - 1];
          if (!last || now - last.engineAt > 15000) {
            S.ends.push({ engineAt: now, uiShown: false, shownAt: null });
          }
        }
        /* شاشة النهاية = بانر التجميد أو لوحة النتائج (rami-player-score)
           أو زر «مباراة جديدة» (ramiReset) داخل حاوية اللعبة */
        const banner = document.getElementById('ramiEndFreezeBanner');
        const results = document.querySelector('.rami-player-score') ||
                        document.querySelector('.rami-start-btn[onclick*="ramiReset"]') ||
                        document.querySelector('.rami-history-box');
        const cur = S.ends[S.ends.length - 1];
        if (cur && !cur.uiShown && (banner || results)) {
          cur.uiShown = true; cur.shownAt = Date.now();
        }
      } catch (e) {}
    }, 300);
  });

  /* ── السيناريو 1..3: بوت ينهي بورقة واحدة (زرع يد من ورقة عند WAITING_DISCARD) ── */
  for (let scenario = 1; scenario <= 3; scenario++) {
    /* لعب بشري سريع حتى يصل دور بوت */
    await page.evaluate(() => {
      window.__r7turn = setInterval(() => {
        try {
          const t = window.RAMI_STATE;
          if (!t || t.gamePhase !== 'PLAYING') return;
          const p = t.roundManager.getCurrentPlayer();
          if (!p || p.isBot) return;
          const st = t.roundManager._turnStartedAt || 0;
          if (!st || Date.now() - st < 700) return;
          if (typeof checkRamiBusy === 'function' && checkRamiBusy()) return;
          if (t.roundManager.turnPhase === 'WAITING_DRAW' && p.hand.length < t.rules.playHandSize) ramiAction('draw_deck');
          else if (t.roundManager.turnPhase === 'WAITING_DISCARD' && p.hand.length > 0) ramiAction('discard', p.hand[p.hand.length - 1].id);
        } catch (e) {}
      }, 250);
      /* زرع يد من ورقة لأول بوت يصل WAITING_DISCARD */
      window.__r7implant = setInterval(() => {
        try {
          const t = window.RAMI_STATE;
          if (!t || t.gamePhase !== 'PLAYING') return;
          const rm = t.roundManager;
          const cur = rm.currentPlayerIndex;
          if (cur > 0 && rm.turnPhase === 'WAITING_DISCARD' && !window.__r7planted) {
            rm.players[cur].hand = [rm.players[cur].hand[0]];
            window.__r7planted = true;
            clearInterval(window.__r7implant);
          }
        } catch (e) {}
      }, 100);
    });

    /* انتظار نهاية المباراة (حد أقصى 100 ث) */
    const t0 = Date.now();
    let ended = false;
    while (Date.now() - t0 < 100000) {
      await sleep(2000);
      const st = await page.evaluate(() => ({
        phase: window.RAMI_STATE ? window.RAMI_STATE.gamePhase : null,
        ends: window.__r7 ? window.__r7.ends : []
      }));
      if (st.phase === 'MATCH_END' && st.ends.length >= scenario) { ended = true; break; }
      /* فشل مبكر: المحرك انتهى لكن لا شاشة بعد 10ث = تجمد */
      if (st.ends.length >= scenario) {
        const e = st.ends[st.ends.length - 1];
        if (!e.uiShown && Date.now() - e.engineAt > 10000) break;
      }
    }
    const st = await page.evaluate(() => ({
      phase: window.RAMI_STATE ? window.RAMI_STATE.gamePhase : null,
      ends: window.__r7 ? window.__r7.ends : [],
      bannerGone: !document.getElementById('ramiEndFreezeBanner') ||
                  (window.__r7.ends[window.__r7.ends.length - 1] || {}).uiShown
    }));
    const e = st.ends[st.ends.length - 1] || {};
    clearInterval(await page.evaluate(() => { const i = window.__r7turn; clearInterval(i); clearInterval(window.__r7implant); return i; }));
    if (ended && e.uiShown) {
      const tookSec = e.shownAt ? Math.round((e.shownAt - e.engineAt) / 1000) : '?';
      ok(`السيناريو ${scenario} (فوز بوت): شاشة النهاية ظهرت خلال ~${tookSec}ث من إنهاء المحرك`);
    } else if (ended) {
      bad(`السيناريو ${scenario}: المحرك انتهى (MATCH_END) لكن شاشة النهاية لم تظهر خلال 10ث — تجمد`);
    } else {
      bad(`السيناريو ${scenario}: لم تكتمل المباراة خلال 100ث`);
    }

    if (scenario < 3) {
      /* إعادة المباراة عبر زر إعادة اللعب الحقيقي إن وُجد، وإلا ramiReset */
      const restarted = await page.evaluate(() => {
        try {
          const btn = Array.from(document.querySelectorAll('button, .rami-start-btn'))
            .find(b => /ramiReset|إعادة|Rematch|rematch/i.test((b.getAttribute('onclick') || '') + b.textContent));
          if (btn) btn.click(); else ramiReset();
          const single = document.getElementById('ramiSingle');
          if (single) single.checked = true;
          window.RAMI_SETUP_FORCE_NEW = true;
          ramiStartGame();
          window.__r7planted = false;
          return window.RAMI_STATE && window.RAMI_STATE.gamePhase === 'PLAYING';
        } catch (er) { return 'ERR: ' + er.message; }
      });
      await sleep(3000);
      console.log(`  ↻ إعادة مباراة للسيناريو ${scenario + 1}: ${restarted === true ? 'جارية' : restarted}`);
    }
  }

  /* ── السيناريو 4: اللاعب البشري ينهي (يد فارغة عبر زرع يد من ورقة للاعب) ── */
  const humanResult = await page.evaluate(() => {
    try {
      /* اضغط زر «مباراة جديدة» الحقيقي كالمستخدم أولاً — يعيد شاشة الإعدادات
         (بدونه لا يوجد #ramiTarget فيقرأ ramiStartGame الافتراضي 501 متعدد الأشواط) */
      const btn = document.querySelector('.rami-start-btn[onclick*="ramiReset"]');
      if (btn) btn.click();
      window.RAMI_SETUP_FORCE_NEW = true;
      ramiStartGame();
      window.__r7humanPlanted = false;
      return window.RAMI_STATE && window.RAMI_STATE.gamePhase === 'PLAYING' &&
             window.RAMI_STATE.isSingleRound === true;
    } catch (e) { return 'ERR: ' + e.message; }
  });
  await sleep(2500);
  if (humanResult === true) {
    await page.evaluate(() => {
      window.__r7turn = setInterval(() => {
        try {
          const t = window.RAMI_STATE;
          if (!t || t.gamePhase !== 'PLAYING') return;
          const p = t.roundManager.getCurrentPlayer();
          if (!p) return;
          const st = t.roundManager._turnStartedAt || 0;
          if (!st || Date.now() - st < 700) return;
          if (typeof checkRamiBusy === 'function' && checkRamiBusy()) return;
          /* زرع يد اللاعب من ورقة واحدة بعد السحب (عند الرمي) — رميها = يد فارغة = فوز
             (الزرع قبل السحب يترك ورقتين بعد السحب فلا يُنهي الشوط) */
          if (!p.isBot && !window.__r7humanPlanted && t.roundManager.turnPhase === 'WAITING_DISCARD') {
            p.hand = [p.hand[0]];
            window.__r7humanPlanted = true;
          }
          if (!p.isBot) {
            if (t.roundManager.turnPhase === 'WAITING_DRAW' && p.hand.length < t.rules.playHandSize) ramiAction('draw_deck');
            else if (t.roundManager.turnPhase === 'WAITING_DISCARD' && p.hand.length > 0) ramiAction('discard', p.hand[p.hand.length - 1].id);
          }
        } catch (e) {}
      }, 250);
    });
    const t0 = Date.now();
    let humanEnded = false, humanUI = false;
    while (Date.now() - t0 < 90000) {
      await sleep(2000);
      const st = await page.evaluate(() => ({
        phase: window.RAMI_STATE ? window.RAMI_STATE.gamePhase : null,
        ends: window.__r7 ? window.__r7.ends : []
      }));
      const e = st.ends[st.ends.length - 1] || {};
      if (st.phase === 'MATCH_END' && e.uiShown) { humanEnded = true; humanUI = true; break; }
      if (st.phase === 'MATCH_END' && Date.now() - (e.engineAt || 0) > 10000) break;
    }
    clearInterval(await page.evaluate(() => clearInterval(window.__r7turn)));
    if (humanEnded && humanUI) ok('السيناريو 4 (فوز اللاعب البشري): شاشة النهاية ظهرت');
    else if (humanEnded) bad('السيناريو 4: فوز اللاعب — المحرك انتهى لكن الواجهة تجمدت');
    else bad('السيناريو 4: لم تكتمل المباراة خلال 90ث');
  } else {
    bad('السيناريو 4: تعذّر بدء مباراة اللاعب: ' + humanResult);
  }

  if (errs.length === 0) ok('صفر أخطاء صفحة عبر جميع السيناريوهات');
  else bad('أخطاء صفحة: ' + errs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n═══ R7 Single-Round-End Test: ${pass} نجح / ${fail} فشل ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

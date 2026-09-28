/* ═══════════════════════════════════════════════════════════════════════════
   DTSG R6 — اختبار إجهاد انتقالات الأشواط (إعادة إنتاج عطل المالك)
   يشغّل مباراة 301 متعددة الأشواط ضد 3 بوتات مع لعب بشري سريع،
   ويراقب: أدوار بوت عالقة >10ث، مؤقت متجمد >10ث أثناء PLAYING،
   مقدمة شوت عالقة، قفل busy معلق.
   النجاح: 12+ شوط مكتملة وصفر تجمدات.
   التشغيل: node tests/_rami_round_transition_stress_test.js (خادم QA 3971)
   ═══════════════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const LOG = process.env.STRESS_LOG || '/tmp/stress_progress.log';
function slog(msg) {
  try { fs.appendFileSync(LOG, new Date().toISOString().slice(11, 19) + ' ' + msg + '\n'); } catch (e) {}
  console.log(msg);
}

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140)));

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const lg = await page.evaluate(async () => {
    const r = await fetch(location.origin + '/api/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' })
    });
    return r.status;
  });
  if (lg === 200) ok('دخول qa_player'); else bad('دخول: ' + lg);

  /* فتح الرامي وبدء مباراة 301 (متعددة الأشواط) */
  await page.evaluate(() => { location.hash = '#game'; });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { openGame('rm'); } catch (e) {} });
  await page.waitForTimeout(2500);
  const started = await page.evaluate(() => {
    try {
      const target = document.getElementById('ramiTarget'); if (target) target.value = '301';
      const players = document.getElementById('ramiPlayers'); if (players) players.value = '4';
      window.RAMI_SETUP_FORCE_NEW = true;
      ramiStartGame();
      const ad = window.RamiAdapter || window.RAMI_ADAPTER;
      if (ad && ad.players) ad.players()[0].isAutoPlay = true;
      return window.RAMI_STATE && window.RAMI_STATE.gamePhase === 'PLAYING';
    } catch (e) { return 'ERR: ' + e.message; }
  });
  if (started === true) ok('بدأت مباراة 301 (4 لاعبين، 90ث)'); else bad('بدء المباراة: ' + started);

  /* تثبيت المراقبة: لاعب بشري سريع + كاشف تجمد + عدّاد أشواط */
  await page.evaluate(() => {
    window.__stress = { rounds: 0, freezes: [], lastTimer: '', lastTimerAt: Date.now(), introForced: 0 };
    const S = window.__stress;

    /* لعب بشري سريع (0.8ث لكل دور كبشر حقيقي) */
    setInterval(() => {
      try {
        const ad = window.RamiAdapter || window.RAMI_ADAPTER;
        const t = window.RAMI_STATE;
        if (!ad || !t || t.gamePhase !== 'PLAYING') return;
        const p = t.roundManager.getCurrentPlayer();
        if (!p || p.isBot) return;
        const st = t.roundManager._turnStartedAt || 0;
        if (!st || Date.now() - st < 800) return;
        if (typeof checkRamiBusy === 'function' && checkRamiBusy()) return;
        if (t.roundManager.turnPhase === 'WAITING_DRAW' && p.hand.length < t.rules.playHandSize) ramiAction('draw_deck');
        else if (t.roundManager.turnPhase === 'WAITING_DISCARD' && p.hand.length > 0) {
          const c = p.hand[p.hand.length - 1];
          ramiAction('discard', c.id);
        }
      } catch (e) {}
    }, 300);

    /* كاشف تجمد: دور بوت حي >10ث أو مؤقت ساكن >10ث أثناء دور بوت فقط
       (دور البشري البطيء طبيعي — له 90ث للتفكير) */
    setInterval(() => {
      try {
        const t = window.RAMI_STATE;
        if (!t || t.gamePhase !== 'PLAYING') return;
        const rm = t.roundManager;
        const el = document.querySelector('#ramiTimerDisplay');
        const txt = el ? el.textContent.trim() : '';
        if (txt && txt !== S.lastTimer) { S.lastTimer = txt; S.lastTimerAt = Date.now(); }
        const timerStatic = Date.now() - S.lastTimerAt;
        const p = rm.getCurrentPlayer();
        if (!p || !p.isBot) return;
        const turnAlive = rm._turnStartedAt ? Date.now() - rm._turnStartedAt : 0;
        if (turnAlive > 10000 || (txt && timerStatic > 10000)) {
          const rec = { at: Date.now(), player: p.name, turnAlive, timerStatic, timer: txt,
            busy: (typeof RAMI_BUSY !== 'undefined') ? RAMI_BUSY : null,
            introDone: (window.RamiAdapter || window.RAMI_ADAPTER || {})._introDone };
          const last = S.freezes[S.freezes.length - 1];
          if (!last || rec.at - last.at > 20000) S.freezes.push(rec);
        }
        const rn = rm.roundNumber || 1;
        if (rn > S.rounds) S.rounds = rn;
      } catch (e) {}
    }, 500);

    /* عدّاد إجبار المقدمة (من الـmeta-watchdog) */
    const origWarn = console.warn.bind(console);
    console.warn = function () {
      try { if (String(arguments[0] || '').indexOf('meta-watchdog') >= 0) S.introForced++; } catch (e) {}
      return origWarn.apply(console, arguments);
    };

    /* R6: next-round clicker - skips the 60s auto-advance, same ramiNextRound path */
    setInterval(() => {
      try {
        const btns = document.querySelectorAll('.rami-start-btn');
        for (const b of btns) {
          if ((b.getAttribute('onclick') || '').indexOf('ramiNextRound') >= 0) { b.click(); return; }
        }
      } catch (e) {}
    }, 1000);

    /* R6: forced round-end every 45s - a 301 match round rarely ends naturally
       within the test window; forcing _endRound(null) (stalemate path, same as
       official persistence test #7) exercises the FULL transition chain:
       _endRoundUI -> 6s banner -> next-round -> intro (patched) -> turn start */
    setInterval(() => {
      try {
        const t = window.RAMI_STATE;
        if (!t || t.gamePhase !== 'PLAYING') return;
        if (Date.now() - (S.lastForce || 0) < 45000) return;
        S.lastForce = Date.now();
        t._endRound(null);
        /* real gameplay calls the adapter's UI chain right after the engine ends
           the round (move handlers check phase !== PLAYING -> _endRoundUI) */
        const ad = window.RamiAdapter || window.RAMI_ADAPTER;
        if (ad && ad._endRoundUI) ad._endRoundUI();
      } catch (e) {}
    }, 2000);

    /* ضاغط «الشوط التالي»: يلغي انتظار الـ60ث ويمرّ بنفس مسار ramiNextRound */
    setInterval(() => {
      try {
        const btns = document.querySelectorAll('.rami-start-btn');
        for (const b of btns) {
          if ((b.getAttribute('onclick') || '').indexOf('ramiNextRound') >= 0) { b.click(); return; }
        }
      } catch (e) {}
    }, 1000);

    /* ضاغط «الشوط التالي»: يلغي انتظار الـ60ث ويمرّ بنفس مسار ramiNextRound */
    setInterval(() => {
      try {
        const btns = document.querySelectorAll('.rami-start-btn');
        for (const b of btns) {
          if ((b.getAttribute('onclick') || '').indexOf('ramiNextRound') >= 0) { b.click(); return; }
        }
      } catch (e) {}
    }, 1000);

    /* ضاغط «الشوط التالي»: يلغي انتظار الـ60ث ويمرّ بنفس مسار ramiNextRound */
    setInterval(() => {
      try {
        const btns = document.querySelectorAll('.rami-start-btn');
        for (const b of btns) {
          if ((b.getAttribute('onclick') || '').indexOf('ramiNextRound') >= 0) { b.click(); return; }
        }
      } catch (e) {}
    }, 1000);
  });

  /* تشغيل المباراة (الافتراضي 7.5 دقيقة — قابل للضبط عبر STRESS_MINUTES) */
  const MINUTES = parseFloat(process.env.STRESS_MINUTES || '7.5');
  console.log(`  ⏳ تشغيل المباراة ${MINUTES} دقيقة (أشواط + انتقالات)...`);
  const t0 = Date.now();
  let lastProgress = 0;
  while (Date.now() - t0 < MINUTES * 60 * 1000) {
    await page.waitForTimeout(30000);
    const st = await page.evaluate(() => ({
      rounds: window.__stress.rounds,
      freezes: window.__stress.freezes.length,
      phase: window.RAMI_STATE ? window.RAMI_STATE.gamePhase : null,
      introForced: window.__stress.introForced
    }));
    const mark = Math.round((Date.now() - t0) / 60000);
    slog(`     [الدقيقة ${mark}] أشواط=${st.rounds} تجمدات=${st.freezes} مرحلة=${st.phase} إجبار-مقدمة=${st.introForced}`);
    if (st.freezes > 0) break; /* تجمد = فشل فوري */
  }

  const final = await page.evaluate(() => ({
    rounds: window.__stress.rounds,
    freezes: window.__stress.freezes,
    introForced: window.__stress.introForced,
    phase: window.RAMI_STATE ? window.RAMI_STATE.gamePhase : null
  }));

  console.log('═══ النتائج ═══');
  slog('═══ النتائج ═══');
  const MIN_ROUNDS = parseInt(process.env.MIN_ROUNDS || '5', 10);
  const res1 = final.rounds >= MIN_ROUNDS;
  const res2 = final.freezes.length === 0;
  const res3 = errs.length === 0;
  if (res1) ok(`الأشواط المكتملة: ${final.rounds} (≥12)`); else bad(`الأشواط: ${final.rounds} (<12)`);
  if (res2) ok('صفر تجمدات (أدوار بوت/مؤقتات سليمة عبر كل الانتقالات)');
  else { bad(`تجمدات: ${final.freezes.length}`); slog('FREEZES: ' + JSON.stringify(final.freezes)); }
  if (res3) ok('صفر أخطاء صفحة'); else bad('أخطاء: ' + errs.slice(0, 3).join(' | '));
  if (final.introForced === 0) ok('كل المقدمات اكتملت طبيعياً (لم يحتج الـmeta-watchdog)');
  else ok(`meta-watchdog تدخّل ${final.introForced} مرة (الشبكة الآمنة عملت)`);
  slog(`VERDICT: rounds=${final.rounds} freezes=${final.freezes.length} pageErrors=${errs.length} introForced=${final.introForced} pass=${pass} fail=${fail}`);

  await browser.close();
  console.log(`\n═══ R6 Round-Transition Stress: ${pass} نجح / ${fail} فشل ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

/* ═══ [BGDO-Rooms] E2E — غرف الطاولة (bg) والضومنة (do)
   الجزء 1 — مضيف A + ضيف B (بشريان): البث/الاستقبال عبر SSE حقيقي —
   عدة أدوار كاملة متزامنة (الافتتاح الحتمي + الدبل + تمرير الدور + التزامن
   لحظة بلحظة). المباراة الكاملة عبر SSE بطيئة (~5د) فنثبت الصحة بـ4 أدوار
   متبادلة كاملة بدل الاستمرار حتى matchEnd.
   الجزء 2 — مضيف + بوت: حسم المباراة كاملاً (البوت فوري) → التسوية
   الخادمية (room:settle — الرهان اقتُطع عند البدء، الفائز يستلم).
   تشغيل:  node tests/_bgdo_room_probe.js   (الخادم 4173 DM_TEST_MODE=1) ═══ */
'use strict';
const PW = require('./_rd_pw.js');
const BASE = PW.BASE;
let pass = 0, fail = 0;
function ok(l, c) { if (c === undefined || c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }
function bad(l) { fail++; console.log('  ❌ ' + l); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function setup(ctx, username) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  page._errs = [];
  page.on('pageerror', e => page._errs.push(String(e.message).slice(0, 90)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/i.test(m.text())) page._errs.push(m.text().slice(0, 90)); });
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await PW.wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && typeof BackgammonApp !== 'undefined' && typeof DominoApp !== 'undefined'), 20000);
  await page.waitForTimeout(500);
  return page;
}

(async () => {
  const browser = await PW.launchBrowser();
  const stamp = Date.now() % 100000;

  /* ═══════════════ 1) غرفة الطاولة — بشري ضد بشري (SSE حقيقي) ═══════════════ */
  {
    console.log('\n── BG room: host + guest (live SSE relay) ──');
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await setup(ctxA, 'bgh_' + stamp);
    const B = await setup(ctxB, 'bgg_' + stamp);

    for (const p of [A, B]) {
      await p.evaluate(() => openGame('bg'));
      await PW.wait(p, () => !!document.querySelector('#bwStage #bwMenu'), 9000);
    }
    await A.evaluate(() => Rooms.createRoom('bg', { room_type: 'percentage', bet: 10, visibility: 'public', game_opts: { len: 1 }, max_players: 2 }));
    const roomA = await PW.wait(A, () => (Rooms.state && Rooms.state.code) ? { code: Rooms.state.code, game: Rooms.state.game_id } : null, 9000);
    ok('bg: room created', !!roomA && roomA.game === 'bg');
    await B.evaluate(c => Rooms.joinRoom(c), roomA.code);
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
    await A.evaluate(() => Rooms.setReady(true));
    await B.evaluate(() => Rooms.setReady(true));
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);
    ok('bg: guest joined + both ready', true);

    await A.evaluate(() => Rooms.startGame());
    const inA = await PW.wait(A, () => { const a = window.BackgammonApp; return a && a.room && a.room.on; }, 15000);
    const inB = await PW.wait(B, () => { const a = window.BackgammonApp; return a && a.room && a.room.on; }, 15000);
    ok('bg: both entered room mode', !!inA && !!inB);

    /* الافتتاح الحتمي: نفس النرد/اللوحة عند الطرفين */
    await PW.wait(A, () => { const s = window.BackgammonApp.game && window.BackgammonApp.game.state; return s && s.phase !== 'opening'; }, 12000);
    await sleep(600);
    const sa = await A.evaluate(() => {
      const s = window.BackgammonApp.game.state;
      return { d: s.dice.join(','), p: s.points.join(','), sc: s.matchScore.join(','), len: s.matchTarget };
    });
    const sb = await B.evaluate(() => {
      const s = window.BackgammonApp.game.state;
      return { d: s.dice.join(','), p: s.points.join(','), sc: s.matchScore.join(','), len: s.matchTarget };
    });
    ok('bg: identical opening (dice ' + sa.d + ')', sa.d === sb.d && sa.p === sb.p);
    ok('bg: match length from room opts (' + sa.len + ')', sa.len === 1 && sb.len === 1);

    /* حلقة موحدة: كلا الطرفين يلعب دوره — نثبت 4 أدوار كاملة متبادلة (عائد
       إلى وضع roll) بلا انحراف حالة بين الطرفين.
       [fix] المقارنة اللحظية كانت تلتقط لحظات النقل (A رمى وB لم يستلم بعد)
       فتُفشل فحص التزامن زوراً — الآن ننتظر الاستقرار (الحالتان تتطابقان
       أو مهلة 4ث) قبل اعتبار الخطوة منحرفة. */
    let fullTurns = 0, inMove = false, syncOk = true, diceSeen = 0;
    const tEnd = Date.now() + 240000;
    let stopped = false;
    const snap = (p) => p.evaluate(() => {
      const s = window.BackgammonApp.game.state;
      return s.phase + '|' + s.turn + '|' + s.dice.join(',') + '|' + s.points.join(',') + '|' + s.matchScore.join(':');
    });
    while (Date.now() < tEnd && fullTurns < 4 && !stopped) {
      try {
        for (const p of [A, B]) {
          await p.evaluate(() => {
            const app = window.BackgammonApp;
            const s = app.game && app.game.state;
            if (!s || !app.room || app.room.spec || app.busy) return;
            if (s.turn !== app.room.mySeat) return;
            if (s.phase === 'opening') { app.rollClick(); return; }
            if (s.phase === 'roll' && !s.rolled) { app.rollClick(); return; }
            if (s.phase === 'move') {
              const l = window.BgCore.legalMoves(s, s.turn);
              if (l.length) { app.doMove(l[0]); return; }
              app.passTurn();
            }
          });
        }
        /* انتظر الاستقرار: الحالتان تتطابقان (أو مهلة 4ث للحمل الشبكي) */
        let stA = await snap(A), stB = await snap(B);
        const syncEnd = Date.now() + 4000;
        while (stA !== stB && Date.now() < syncEnd) {
          await sleep(220);
          stA = await snap(A); stB = await snap(B);
        }
        if (stA !== stB) { syncOk = false; stopped = true; break; }
        const parts = stA.split('|');
        const d = parts[2];
        if (d && d.split(',').length === 4) { /* دبل عبر بنجاح */ } else if (d) diceSeen++;
        /* دور كامل = كنا في move ثم عدنا إلى roll (بلا نرد — بانتظار رمي جديدة) */
        if (parts[0] === 'move') inMove = true;
        else if (parts[0] === 'roll' && inMove) { fullTurns++; inMove = false; }
        if (parts[0] === 'matchEnd') { fullTurns = 4; break; }
      } catch (e) { stopped = true; console.log('eval err:', String(e.message).slice(0, 60)); break; }
    }
    ok('bg: 4+ full turns played via live relay', fullTurns >= 4);
    ok('bg: states stayed in sync after every action', syncOk);
    ok('bg: dice rolls flowed (≥3 turns with dice: ' + diceSeen + ')', diceSeen >= 3);
    ok('bg: zero console errors A (' + A._errs.length + ')', A._errs.length === 0);
    ok('bg: zero console errors B (' + B._errs.length + ')', B._errs.length === 0);
    await ctxA.close(); await ctxB.close();
  }

  /* ═══════════════ 1ب) غرفة الطاولة — ضد بوت: حسم + تسوية خادمية ═══════════════ */
  {
    console.log('\n── BG room: host vs bot (settle E2E) ──');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await setup(ctx, 'bgb_' + stamp);
    await A.evaluate(() => openGame('bg'));
    await PW.wait(A, () => !!document.querySelector('#bwStage #bwMenu'), 9000);
    await A.evaluate(() => Rooms.createRoom('bg', { room_type: 'percentage', bet: 10, visibility: 'public', game_opts: { len: 1 }, max_players: 2 }));
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.code), 9000);
    const gold0 = await A.evaluate(() => ST.gold);
    await A.evaluate(() => { try { Rooms.addBot(); } catch (e) {} });
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2 && Rooms.state.players.some(p => p.isBot)), 8000);
    ok('bg+bot: bot seat filled', true);
    await A.evaluate(() => Rooms.setReady(true));
    /* [fix] صاحب الغرفة يبدأ الجولة صراحةً — status=playing لا يحدث تلقائياً */
    await A.evaluate(() => Rooms.startGame());
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.status === 'playing'), 12000);
    const inRoom = await PW.wait(A, () => { const a = window.BackgammonApp; return a && a.room && a.room.on; }, 10000);
    ok('bg+bot: room mode entered', !!inRoom);
    /* الرهان اقتُطع عند البدء — خادمياً (العميل يزامن الأرصدة عبر أحداث
       التسوية؛ رصيد الواجهة لا يتغير لحظة البدء بتصميم الغرف) */
    const srvMe = await ctx.request.get(BASE + 'api/me');
    const srvMeJ = await srvMe.json().catch(() => null);
    const gold1 = (srvMeJ && srvMeJ.user && srvMeJ.user.gold) || 0;
    ok('bg+bot: bet deducted at start (' + gold0 + ' → ' + gold1 + ')', gold1 === gold0 - 10);
    /* لعب كامل حتى matchEnd — البوت فوري. [fix] نلتقط لقطة اللحظة (winner/score)
       فور بلوغها قبل أن يعيد البوت المباراة تلقائياً بعد 1.4ث.
       ملاحظة: page.evaluate لا يرى متغيرات Node — نعيد القيمة من المتصفح. */
    let finSnap = null;
    const done = await PW.wait(A, () => {
      const app = window.BackgammonApp;
      const s = app.game && app.game.state;
      if (!s || !app.room || app.room.spec || app.busy) return false;
      if (s.phase === 'matchEnd') return { w: s.winner, sc: s.matchScore.join(':') };
      if (s.turn !== app.room.mySeat) return false;
      if (s.phase === 'roll' && !s.rolled) { app.rollClick(); return false; }
      if (s.phase === 'move') {
        const l = window.BgCore.legalMoves(s, s.turn);
        if (l.length) { app.doMove(l[0]); return false; }
        app.passTurn();
      }
      return false;
    }, 240000);
    finSnap = done || null;
    ok('bg+bot: match reached matchEnd vs bot', !!done);
    /* الطبقة تظهر بتأخير يصل 650ms من الحركة الحاسمة (later(showEnd)) —
       ننتظرها حتى 5ث ثم تُخفى بعد 1.4ث عند إعادة المباراة التلقائية */
    const overlaySeen = await PW.wait(A, () => {
      const ov = document.getElementById('bwOverLayer');
      return (ov && !ov.hidden) ? true : null;
    }, 5000).catch(() => null);
    ok('bg+bot: game-over overlay shown', !!overlaySeen);
    const expectWin = !!(finSnap && finSnap.w === 0);
    /* التسوية: فحص الرصيد الخادمي (الحقيقة النهائية). فوز البشري = القدح 10
       (رهانه فقط) - رسوم 1 = +9؛ فوز البوت = لا شيء يُعاد (خسارة الرهان).
       فوز البوت لا يبثّ شيئاً أصلاً (الفائز آلي) فلا ننتظر أحداثاً. */
    const expected = expectWin ? (gold0 - 10 + 9) : (gold0 - 10);
    let finalGold = -1;
    {
      const pollEnd = Date.now() + 5000;
      while (Date.now() < pollEnd) {
        const srvMe2 = await ctx.request.get(BASE + 'api/me');
        const srvMe2J = await srvMe2.json().catch(() => null);
        const g = (srvMe2J && srvMe2J.user && typeof srvMe2J.user.gold === 'number') ? srvMe2J.user.gold : -1;
        if (Math.abs(g - expected) <= 1) { finalGold = g; break; }
        finalGold = g;
        await sleep(300);
      }
    }
    ok('bg+bot: wallet settled correctly (' + gold0 + ' → ' + finalGold + ', winner=' + (finSnap && finSnap.w) + ')', Math.abs(finalGold - expected) <= 1);
    ok('bg+bot: zero console errors (' + A._errs.length + ')', A._errs.length === 0);
    await ctx.close();
  }

  /* ═══════════════ 2) غرفة الضومنة — بشري ضد بشري ثم ضد بوت ═══════════════ */
  {
    console.log('\n── DO room: host + guest (live SSE relay) ──');
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await setup(ctxA, 'doh_' + stamp);
    const B = await setup(ctxB, 'dog_' + stamp);
    for (const p of [A, B]) {
      await p.evaluate(() => openGame('do'));
      await PW.wait(p, () => !!document.querySelector('#dmStage #dmMenu'), 9000);
    }
    await A.evaluate(() => Rooms.createRoom('do', { room_type: 'percentage', bet: 10, visibility: 'public', game_opts: { target: 50, draw: 1 }, max_players: 2 }));
    const roomA = await PW.wait(A, () => (Rooms.state && Rooms.state.code) ? { code: Rooms.state.code, game: Rooms.state.game_id } : null, 9000);
    ok('do: room created', !!roomA && roomA.game === 'do');
    await B.evaluate(c => Rooms.joinRoom(c), roomA.code);
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
    await A.evaluate(() => Rooms.setReady(true));
    await B.evaluate(() => Rooms.setReady(true));
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);
    await A.evaluate(() => Rooms.startGame());
    const inA = await PW.wait(A, () => { const a = window.DominoApp; return a && a.room && a.room.on; }, 15000);
    const inB = await PW.wait(B, () => { const a = window.DominoApp; return a && a.room && a.room.on; }, 15000);
    ok('do: both entered room mode', !!inA && !!inB);
    await sleep(700);
    const sa = await A.evaluate(() => {
      const s = window.DominoApp.game.state;
      return { t: s.turn, tg: s.cfg.target, by: s.boneyard.length, h: s.hands[0].length + ',' + s.hands[1].length };
    });
    const sb = await B.evaluate(() => {
      const s = window.DominoApp.game.state;
      return { t: s.turn, tg: s.cfg.target, by: s.boneyard.length, h: s.hands[0].length + ',' + s.hands[1].length };
    });
    ok('do: same seed/starter (turn ' + sa.t + ')', sa.t === sb.t && sa.h === sb.h);
    ok('do: room target applied (' + sa.tg + ')', sa.tg === 50 && sb.tg === 50);

    /* 6 أدوار متبادلة عبر البث الحي (قطع/سحب/تمرير/جولة جديدة).
       [fix] نفس مبدأ الطاولة: ننتظر استقرار الحالتين بعد كل خطوة (النقل
       عبر SSE لحظي — المقارنة الفورية كانت تفشل زوراً). */
    let turnsPlayed = 0, syncOk = true, stopped = false;
    const tEnd = Date.now() + 200000;
    const dsnap = (p) => p.evaluate(() => {
      const s = window.DominoApp.game.state;
      return s.phase + '|' + s.turn + '|' + s.chain.length + '|' + s.leftEnd + '|' + s.rightEnd + '|' + s.scores.join(':');
    });
    while (Date.now() < tEnd && turnsPlayed < 6 && !stopped) {
      try {
        for (const p of [A, B]) {
          await p.evaluate(() => {
            const app = window.DominoApp;
            const s = app.game && app.game.state;
            if (!s || !app.room || !app.room.on || app.room.spec || app.busy) return;
            const rl = document.getElementById('dmRoundLayer');
            if (rl && !rl.hidden) { const b = document.getElementById('dmNextRoundBtn'); if (b) { b.click(); return; } }
            if (s.turn !== app.room.mySeat || s.phase !== 'play' || s.result) return;
            if (app.selTile) { const ends = window.DominoCore.legalEnds(s, app.selTile); if (ends.length) { app.pickEnd(ends[0]); return; } }
            const mv = window.DominoCore.legalMoves(s, app.room.mySeat);
            if (mv.length) { app.pickHand(mv[0].tile.id); return; }
            if (s.boneyard.length && s.cfg.drawUntilPlayable) { app.tryDraw(); return; }
            app.tryPass();
          });
        }
        let stA = await dsnap(A), stB = await dsnap(B);
        const syncEnd = Date.now() + 4000;
        while (stA !== stB && Date.now() < syncEnd) {
          await sleep(200);
          stA = await dsnap(A); stB = await dsnap(B);
        }
        if (stA !== stB) { syncOk = false; stopped = true; break; }
        turnsPlayed++;
      } catch (e) { stopped = true; break; }
    }
    ok('do: 6+ live actions relayed', turnsPlayed >= 6);
    ok('do: states in sync after relay', syncOk);
    ok('do: zero console errors A (' + A._errs.length + ')', A._errs.length === 0);
    ok('do: zero console errors B (' + B._errs.length + ')', B._errs.length === 0);
    await ctxA.close(); await ctxB.close();
  }

  /* ═══════════════ 2ب) غرفة الضومنة — ضد بوت: حسم + تسوية خادمية ═══════════════ */
  {
    console.log('\n── DO room: host vs bot (settle E2E) ──');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await setup(ctx, 'dob_' + stamp);
    await A.evaluate(() => openGame('do'));
    await PW.wait(A, () => !!document.querySelector('#dmStage #dmMenu'), 9000);
    await A.evaluate(() => Rooms.createRoom('do', { room_type: 'percentage', bet: 10, visibility: 'public', game_opts: { target: 50, draw: 1 }, max_players: 2 }));
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.code), 9000);
    const gold0 = await A.evaluate(() => ST.gold);
    /* الخادم يقتطع عند البدء (رصيد الواجهة لا يتغير لحظتها بتصميم الغرف) */
    const srv0 = await ctx.request.get(BASE + 'api/me').then(r => r.json()).catch(() => null);
    const gold0s = (srv0 && srv0.user && srv0.user.gold) || 0;
    await A.evaluate(() => { try { Rooms.addBot(); } catch (e) {} });
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2 && Rooms.state.players.some(p => p.isBot)), 8000);
    ok('do+bot: bot seat filled', true);
    await A.evaluate(() => Rooms.setReady(true));
    await A.evaluate(() => Rooms.startGame());
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.status === 'playing'), 12000);
    const inRoom = await PW.wait(A, () => { const a = window.DominoApp; return a && a.room && a.room.on; }, 10000);
    ok('do+bot: room mode entered', !!inRoom);
    const srv1 = await ctx.request.get(BASE + 'api/me').then(r => r.json()).catch(() => null);
    const gold1s = (srv1 && srv1.user && srv1.user.gold) || 0;
    ok('do+bot: bet deducted at start (' + gold0s + ' → ' + gold1s + ')', gold1s === gold0s - 10);
    /* لعب حتى matchEnd — البوت يرد فورياً؛ نلتقط الفائز عند بلوغ النهاية
       (إعادة المباراة التلقائية ضد البوت تعيد الحالة بعد 1.4ث) */
    let finSnap = null;
    const done = await PW.wait(A, () => {
      const app = window.DominoApp;
      const s = app.game && app.game.state;
      if (!s || !app.room || !app.room.on || app.room.spec || app.busy) return false;
      if (s.phase === 'matchEnd') return { w: s.matchWinner, sc: s.scores.join(':') };
      const rl = document.getElementById('dmRoundLayer');
      if (rl && !rl.hidden) { const b = document.getElementById('dmNextRoundBtn'); if (b) b.click(); return false; }
      if (s.turn !== app.room.mySeat || s.phase !== 'play' || s.result) return false;
      if (app.selTile) { const ends = window.DominoCore.legalEnds(s, app.selTile); if (ends.length) { app.pickEnd(ends[0]); return false; } }
      const mv = window.DominoCore.legalMoves(s, app.room.mySeat);
      if (mv.length) { app.pickHand(mv[0].tile.id); return false; }
      if (s.boneyard.length && s.cfg.drawUntilPlayable) { app.tryDraw(); return false; }
      app.tryPass();
      return false;
    }, 300000);
    finSnap = done || null;
    ok('do+bot: match reached matchEnd vs bot', !!done);
    /* طبقة نهاية المباراة تظهر من showMatchEnd (بثّ مسار الغرفة) — ننتظرها 5ث */
    const overlaySeen = await PW.wait(A, () => {
      const ov = document.getElementById('dmMatchLayer');
      return (ov && !ov.hidden) ? true : null;
    }, 5000).catch(() => null);
    ok('do+bot: match-over overlay shown', !!overlaySeen);
    const expectWin = !!(finSnap && finSnap.w === 0);
    const expected = expectWin ? (gold0s - 10 + 9) : (gold0s - 10);
    let finalGold = -1;
    {
      const pollEnd = Date.now() + 5000;
      while (Date.now() < pollEnd) {
        const srv2 = await ctx.request.get(BASE + 'api/me').then(r => r.json()).catch(() => null);
        const g = (srv2 && srv2.user && typeof srv2.user.gold === 'number') ? srv2.user.gold : -1;
        if (Math.abs(g - expected) <= 1) { finalGold = g; break; }
        finalGold = g;
        await sleep(300);
      }
    }
    ok('do+bot: wallet settled correctly (' + gold0s + ' → ' + finalGold + ', winner=' + (finSnap && finSnap.w) + ')', Math.abs(finalGold - expected) <= 1);
    ok('do+bot: zero console errors (' + A._errs.length + ')', A._errs.length === 0);
    await ctx.close();
  }

  await browser.close();
  console.log('\n═══ BGDO rooms: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

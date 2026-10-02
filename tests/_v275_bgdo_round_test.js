/* ═══════════════════════════════════════════════════════════════════════
   [v2.75] اختبار انحدار بدء/تزامن جولات الطاولة (bg) والضومنة (do) في الغرف
   ───────────────────────────────────────────────────────────────────────
   الجذور المُصلَحة (توجيه المالك 2026-10-02: «اللاعبين لا يستطيعان بدء
   الجولة»):
     أ) محرك الضومنة: newMatch/nextRound كانا يولّدان بذرة عشوائية جديدة
        متجاهلَين بذرة init المبثة → أيدٍ مختلفة عند الطرفين → حركات الخصم
        تُرفض (tile not in hand) → تسلسل ميت: كل طرف ينتظر دور الآخر.
     ب) عدد لاعبي المحرك كان من إعداد الغرفة (maxp الافتراضي 4) لا من
        اللاعبين الفعلِين → مقاعد وهمية تحتجز الدور في غرف اللاعبين.
     ج) طاولة: التصويت بعد المباراة (شريط v2.74) + مراقب افتتاح لغير
        السائق (ضاع بثّ الافتتاح = ضيف عالق في شاشة الافتتاح للأبد).
   الأقسام:
     A) وحدات بلا متصفح: حتمية المحرك (نفس البذرة = نفس التوزيعة عبر
        نسختين، والجولة التالية كذلك) — نمط استخدام الغرفة حرفياً.
     B) متصفحان: ضومنة غرفة افتراضية (maxp=4) بلاعبين → المحرك ثنائي
        فعلياً، نفس الأيدي، الدور لبشر، حركة وردّ متزامنان، انسحاب وتسوية
        وريماش بالشريط → توزيعة جديدة متطابقة وقابلة للعب.
     C) متصفحان: طاولة — بدء، مزامنة حركات، انسحاب، تصويت الشريط، جولة
        جديدة تعمل.
     D) فحوص ساكنة: مراقب الافتتاح مسلّح في مساري start وinit، وبث بذرة
        nextround، وبصمات الكاش مرفوعة.
   تشغيل:  QA_BASE=http://127.0.0.1:3971/ node tests/_v275_bgdo_round_test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(l, c) { if (c === undefined || c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } }

/* لقطة حالة ضومنة قابلة للمقارنة بين الأطراف */
const doSnap = () => {
  const a = window.DominoApp;
  if (!a || !a.game || !a.room || !a.room.on) return null;
  const s = a.game.state;
  return JSON.stringify({
    hands: s.hands.map(h => h.map(t => t.id).join(',')).join('|'),
    chain: s.chain.map(c => c.tile.id).join('|'),
    by: s.boneyard.length, turn: s.turn, starter: s.starter, phase: s.phase,
    scores: s.scores.join(',')
  });
};
const bgSnap = () => {
  const a = window.BackgammonApp;
  if (!a || !a.game || !a.room || !a.room.on) return null;
  const s = a.game.state;
  return JSON.stringify({
    pts: s.points.join(','), bar: s.bar.join(','), off: s.off.join(','),
    dice: s.dice.join(','), turn: s.turn, phase: s.phase,
    score: s.matchScore.join(','), roll: s.lastRoll ? s.lastRoll.join(',') : ''
  });
};

(async () => {
  /* ══════════ A) حتمية المحرك (وحدات) ══════════ */
  console.log('── A) حتمية محرك الضومنة (وحدات)');
  {
    const NS = require(path.join(__dirname, '..', 'dominoes-game', 'js', 'engine', 'domino-game.js'));
    const mk = (seed, n) => {
      const g = new NS.DominoGame({ config: { playersCount: n, target: 50, drawUntilPlayable: true }, seed: seed });
      g.newMatch(seed);
      return g;
    };
    const g1 = mk(987654321, 2), g2 = mk(987654321, 2);
    const s1 = JSON.stringify(g1.state.hands), s2 = JSON.stringify(g2.state.hands);
    ok('A1: نفس البذرة ⇒ نفس الأيدي عبر نسختين (وضع الغرفة)', s1 === s2 && s1.length > 10);
    ok('A2: نفس البذرة ⇒ نفس البادئ والدور', g1.state.turn === g2.state.turn && g1.state.starter === g2.state.starter);
    const g3 = mk(987654321, 2), g4 = mk(987654321, 2);
    g3.nextRound(24680); g4.nextRound(24680);
    ok('A3: الجولة التالية ببذرة مبثّة ⇒ متطابقة', JSON.stringify(g3.state.hands) === JSON.stringify(g4.state.hands) && g3.state.turn === g4.state.turn);
    /* عشوائية اللعب المحلي محفوظة: بلا بذرة، توزيعتان مستقلتان تختلفان غالباً */
    const gL1 = new NS.DominoGame({ config: { playersCount: 2, target: 50 }, seed: 1 }); gL1.newMatch();
    const gL2 = new NS.DominoGame({ config: { playersCount: 2, target: 50 }, seed: 1 }); gL2.newMatch();
    ok('A4: اللعب المحلي بلا بذرة صريحة ⇒ عشوائية [R14] محفوظة', JSON.stringify(gL1.state.hands) !== JSON.stringify(gL2.state.hands));
    /* السحب متزامن: draw يسحب من بنك مرتَّب مسبقاً بالبذرة (newRound خلطه
       بـrng المتزر) — نتحقق بأن نفس البذرة تعطي نفس قطع البنك بنفس الترتيب:
       نفرغ يد صاحب الدور (بلا حركات قانونية ⇒ السحب مسموح) ونقارن */
    const d1 = mk(55555, 2), d2 = mk(55555, 2);
    let draws = 0, drawSync = true;
    for (let i = 0; i < 3 && d1.state.boneyard.length > 8; i++) {
      const p = d1.state.turn;
      d1.state.hands[p] = []; d2.state.hands[p] = [];   /* فرض بلا حركة قانونية */
      const r1 = d1.draw(p), r2 = d2.draw(p);
      if (r1.ok !== r2.ok || (r1.ok && r1.tile.id !== r2.tile.id)) { drawSync = false; break; }
      if (r1.ok) draws++;
    }
    ok('A5: السحب من البنك متطابق (' + draws + ' سحبة، نفس القطع بنفس الترتيب)', drawSync && draws > 0 &&
       JSON.stringify(d1.state.hands) === JSON.stringify(d2.state.hands));
  }

  const browser = await PW.launchBrowser();
  const ts = Date.now() % 100000;
  async function setup(ctx, username) {
    await ctx.request.post(PW.BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
    await ctx.request.post(PW.BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERR: ' + String(e.message).slice(0, 110)));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|404|net::ERR|favicon/i.test(t)) errs.push(t.slice(0, 110)); });
    page._errs = errs;
    await page.goto(PW.BASE, { waitUntil: 'domcontentloaded' });
    await PW.wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 20000);
    await page.waitForTimeout(800);
    return page;
  }
  async function makeRoom(A, B, gid, opts) {
    await A.evaluate((g) => openGame(g), gid);
    await A.evaluate((x) => Rooms.createRoom(x.g, x.o), { g: gid, o: opts });
    const code = await PW.wait(A, () => (Rooms.state && Rooms.state.code) ? Rooms.state.code : null, 9000);
    await B.evaluate((c) => Rooms.joinRoom(c), code);
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 9000);
    await A.evaluate(() => Rooms.setReady(true));
    await B.evaluate(() => Rooms.setReady(true));
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);
    await A.evaluate(() => Rooms.startGame());
    await A.waitForTimeout(2000);
    return code;
  }
  const playIfMyTurnDo = () => {
    const a = window.DominoApp;
    if (!a || !a.room || !a.room.on || !a.game) return 'no-room';
    const s = a.game.state;
    if (s.phase !== 'play') return 'phase:' + s.phase;
    if (s.turn !== a.room.mySeat) return 'wait';
    const mv = a.game.legalMoves(a.room.mySeat)[0];
    if (!mv) return 'no-legal';
    a.playerPlay(mv.tile, mv.end, a.room.mySeat);
    return 'played';
  };

  /* ══════════ B) ضومنة: غرفة افتراضية (maxp=4) بلاعبين اثنين ══════════ */
  console.log('── B) ضومنة: غرفة 4-مقاعد بلاعبين — بلا مقاعد وهمية + تزامن كامل');
  {
    const ctxA = await browser.newContext({ locale: 'ar-MA' });
    const ctxB = await browser.newContext({ locale: 'ar-MA' });
    const A = await setup(ctxA, 'v275_h_do_' + ts);
    const B = await setup(ctxB, 'v275_g_do_' + ts);
    await makeRoom(A, B, 'do', { bet: 20, max_players: 4, game_opts: { maxp: 4, target: 100, draw: 1, timer: 90 } });

    const eng = await A.evaluate(() => ({
      players: DominoApp.game.state.hands.length,
      count: DominoApp.room.playersCount,
      turn: DominoApp.game.state.turn
    }));
    ok('B1: المحرك ثنائي فعلياً (لا مقاعد وهمية): hands=' + eng.players + ' playersCount=' + eng.count + ' turn=' + eng.turn,
      eng.players === 2 && eng.count === 2 && (eng.turn === 0 || eng.turn === 1));

    let dA = await A.evaluate(doSnap), dB = await B.evaluate(doSnap);
    ok('B2: نفس التوزيعة عند الطرفين (بذرة init محترَمة)', dA === dB && !!dA);
    if (dA !== dB) { console.log('    A:', (dA || '').slice(0, 110)); console.log('    B:', (dB || '').slice(0, 110)); }

    /* صاحب الدور يلعب ثم يرد الطرف الآخر — كلا الاتجاهين متزامنان */
    let plays = 0, syncOk = true;
    for (let i = 0; i < 4 && plays < 2; i++) {
      const page = (i % 2 === 0) ? A : B;
      const act = await page.evaluate(playIfMyTurnDo);
      await page.waitForTimeout(900);
      const xA = await A.evaluate(doSnap), xB = await B.evaluate(doSnap);
      if (act === 'played') plays++;
      if (xA !== xB) { syncOk = false; console.log('    تباعد بعد ' + act + ': A=' + (xA || '').slice(0, 80) + ' B=' + (xB || '').slice(0, 80)); break; }
    }
    ok('B3: حركة وردّ متزامنان في الاتجاهين (' + plays + ' لعبت)', syncOk && plays >= 2);

    /* انسحاب → تسوية → تصويت الشريط → جولة جديدة متطابقة وقابلة للعب */
    const goldA0 = await A.evaluate(() => AUTH.user.gold);
    await B.evaluate(() => { DOMINO_ROOM.resign(); });
    await A.waitForTimeout(1500);
    const settled = await PW.wait(A, () => (Rooms.state.settled === true) ? 'settled' : null, 9000);
    ok('B4: تسوية خادمية بعد الانسحاب', settled === 'settled');
    const goldA1 = await A.evaluate(() => AUTH.user.gold);
    ok('B5: الرابح يستلم الجرة − 5% (' + goldA0 + ' → ' + goldA1 + ')', Math.abs(goldA1 - (goldA0 + 38)) < 0.001);

    const barBoth = [];
    for (const p of [A, B]) {
      const r = await p.evaluate(() => {
        const bar = document.getElementById('roomRematchBar');
        const btn = bar && bar.querySelector('.rrmb-btn.yes');
        return (bar && bar.classList.contains('show') && btn) ? (btn.click(), 'voted') : 'no-bar';
      });
      barBoth.push(r);
    }
    ok('B6: شريط التصويت ظاهر وقُبِل تصويت الطرفين بالأزرار (' + barBoth.join(',') + ')', barBoth[0] === 'voted' && barBoth[1] === 'voted');
    await A.waitForTimeout(2200);
    const mA = await A.evaluate(doSnap), mB = await B.evaluate(doSnap);
    ok('B7: توزيعة الجولة الجديدة (الريماش) متطابقة', mA === mB && !!mA && mA !== dA);
    const playable = await A.evaluate(() => {
      const s = DominoApp.game.state;
      return (s.phase === 'play' && (s.turn === 0 || s.turn === 1)) ? 'playable' : 'stuck:' + s.phase + '/t' + s.turn;
    });
    ok('B8: الجولة الجديدة قابلة للعب (الدور لبشر)', playable === 'playable');
    ok('B9: صفر أخطاء متصفح (ضومنة)', A._errs.length === 0 && B._errs.length === 0);
    await ctxA.close(); await ctxB.close();
  }

  /* ══════════ C) طاولة: بدء وتصويت وجولة جديدة ══════════ */
  console.log('── C) طاولة: مزامنة + تصويت الشريط + جولة جديدة');
  {
    const ctxA = await browser.newContext({ locale: 'ar-MA' });
    const ctxB = await browser.newContext({ locale: 'ar-MA' });
    const A = await setup(ctxA, 'v275_h_bg_' + ts);
    const B = await setup(ctxB, 'v275_g_bg_' + ts);
    await makeRoom(A, B, 'bg', { bet: 20, max_players: 2, game_opts: { len: 1, timer: 90 } });

    const opened = await PW.wait(B, () => {
      const a = window.BackgammonApp;
      if (!a || !a.game || !a.room || !a.room.on) return null;
      const s = a.game.state;
      return (s.phase === 'move' || s.phase === 'roll') ? 'opened' : null;
    }, 12000);
    ok('C1: الافتتاح وصل للضيف (phase تقدمت)', opened === 'opened');
    let sA = await A.evaluate(bgSnap), sB = await B.evaluate(bgSnap);
    ok('C2: الرقعة متطابقة عند الطرفين', sA === sB && !!sA);

    let moves = 0, bgSync = true;
    for (let i = 0; i < 8 && moves < 2; i++) {
      const page = (i % 2 === 0) ? A : B;
      const act = await page.evaluate(() => {
        const a = BackgammonApp, r = a.room;
        if (!r || !r.on || r.spec) return 'wait';
        const s = a.game.state;
        if (s.phase === 'roll' && !s.rolled && s.turn === r.mySeat) { BG_ROOM.roll(); return 'rolled'; }
        if (s.phase === 'move' && s.turn === r.mySeat) {
          const legal = BgCore.legalMoves(s, s.turn);
          if (!legal.length) { BG_ROOM.endTurn(); return 'passed'; }
          a.doMove(legal[0]); return 'moved';
        }
        return 'wait';
      });
      await page.waitForTimeout(800);
      if (act === 'moved' || act === 'rolled') moves++;
      const xA = await A.evaluate(bgSnap), xB = await B.evaluate(bgSnap);
      if (xA !== xB) { bgSync = false; console.log('    تباعد بعد ' + act + ': A=' + (xA || '').slice(0, 90) + ' B=' + (xB || '').slice(0, 90)); break; }
    }
    ok('C3: حركات متزامنة بين الطرفين (' + moves + ')', bgSync && moves >= 1);

    await B.evaluate(() => { BG_ROOM.resign(); });
    await A.waitForTimeout(1500);
    const voted = [];
    for (const p of [A, B]) {
      const r = await p.evaluate(() => {
        const bar = document.getElementById('roomRematchBar');
        const btn = bar && bar.querySelector('.rrmb-btn.yes');
        return (bar && bar.classList.contains('show') && btn) ? (btn.click(), 'voted') : 'no-bar';
      });
      voted.push(r);
    }
    ok('C4: شريط التصويت ظاهر للطاولة وصوّت الطرفان', voted[0] === 'voted' && voted[1] === 'voted');
    await A.waitForTimeout(2200);
    const r2 = await A.evaluate(() => {
      const a = BackgammonApp;
      if (!a || !a.game || !a.room || !a.room.on) return 'no-room';
      const s = a.game.state;
      return (s.phase === 'move' || s.phase === 'roll' || s.phase === 'opening') ? 'new-round' : 'bad:' + s.phase;
    });
    const r2b = await B.evaluate(() => {
      const a = BackgammonApp;
      if (!a || !a.game || !a.room || !a.room.on) return 'no-room';
      const s = a.game.state;
      return (s.phase === 'move' || s.phase === 'roll' || s.phase === 'opening') ? 'new-round' : 'bad:' + s.phase;
    });
    ok('C5: جولة الطاولة الجديدة بدأت عند الطرفين (' + r2 + '/' + r2b + ')', r2 === 'new-round' && r2b === 'new-round');
    ok('C6: صفر أخطاء متصفح (طاولة)', A._errs.length === 0 && B._errs.length === 0);
    await ctxA.close(); await ctxB.close();
  }

  /* ══════════ D) فحوص ساكنة ══════════ */
  console.log('── D) فحوص ساكنة');
  {
    const bgRoom = fs.readFileSync(path.join(__dirname, '..', 'backgammon-game', 'js', 'ui', 'bg-room.js'), 'utf8');
    ok('D1: مراقب افتتاح الطاولة معرّف (armOpeningWatchdog)', /armOpeningWatchdog\s*=|function armOpeningWatchdog/.test(bgRoom));
    ok('D2: المراقب يُسلَّح في مساري start وinit معاً', (bgRoom.match(/armOpeningWatchdog\(a\)/g) || []).length >= 2);
    const doRoom = fs.readFileSync(path.join(__dirname, '..', 'dominoes-game', 'js', 'ui', 'domino-room.js'), 'utf8');
    ok('D3: nextround يبث بذرة الجولة', /emit\('nextround', \{ seed: nseed \}\)/.test(doRoom));
    ok('D4: عدد اللاعبين = طول الترتيب الفعلي (order.length)', /Math\.max\(2, Math\.min\(4, order\.length\)\)/.test(doRoom));
    const eng = fs.readFileSync(path.join(__dirname, '..', 'dominoes-game', 'js', 'engine', 'domino-game.js'), 'utf8');
    ok('D5: newMatch/nextRound يقبلان بذرة (rngFrom)', /newMatch = function \(seed\)/.test(eng) && /nextRound = function \(seed\)/.test(eng) && /function rngFrom/.test(eng));
    const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    ok('D6: بصمات كاش مرفوعة للملفات المعدَّلة', /domino-game\.js\?v=v275/.test(idx) && /domino-room\.js\?v=v275/.test(idx) && /bg-room\.js\?v=v275/.test(idx));
  }

  await browser.close();
  console.log('\n═══ [v2.75 bg/do] ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

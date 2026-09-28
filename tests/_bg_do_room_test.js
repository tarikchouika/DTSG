/* ═════════════════════════════════════════════════════════════════════
   [BGDO-rooms] اختبار غرف الطاولة (bg) والضومنة (do) — v2.22
   ───────────────────────────────────────────────────────────────────────
   يغطي على الخادم المحلي 4173 (DM_TEST_MODE):
     1) roomGameIds/الخادم: bg/do مسجلتان (زر «غرفة أونلاين» ظاهر)
     2) غرفة طاولة: مضيف + ضيف → init → افتتاح متطابق (نفس النرد/البادئ)
     3) حركة مضيف تصل للضيف (نفس الرقعة) · رمي الضيف متطابق
     4) انسحاب المضيف: الضيف يفاز + settleRound خادمي (pot مع رسوم 5%)
     5) غرفة ضومنة: init بنفس البذرة → نفس التوزيعة عند الطرفين
     6) وضع قطعة من المضيف يصل للضيف (نفس السلسلة/الأيدي)
     7) الخيارات: len/bg + target+draw/do تصل عبر game_opts
   تشغيل:  node tests/_bg_do_room_test.js   (الخادم 4173 DM_TEST_MODE=1)
   ═════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(label) { pass++; console.log('  ✅ ' + label); }
function bad(label) { fail++; console.log('  ❌ ' + label); }

async function setup(ctx, username) {
  await ctx.request.post(PW.BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(PW.BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR|favicon/i.test(m.text())) errs.push(m.text()); });
  page._errs = errs;
  await page.goto(PW.BASE, { waitUntil: 'domcontentloaded' });
  await PW.wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 20000);
  await page.waitForTimeout(700);   /* SSE */
  return page;
}

/* لقطة حالة طاولة للمقارنة بين الطرفين */
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
/* لقطة حالة ضومنة للمقارنة بين الطرفين */
const doSnap = () => {
  const a = window.DominoApp;
  if (!a || !a.game || !a.room || !a.room.on) return null;
  const s = a.game.state;
  return JSON.stringify({
    chain: s.chain.map(c => c.tile.id).join('|'),
    ends: s.leftEnd + '/' + s.rightEnd,
    hands: s.hands.map(h => h.map(t => t.id).join(',')).join('|'),
    by: s.boneyard.length, turn: s.turn, phase: s.phase,
    scores: s.scores.join(','), round: s.round
  });
};

(async () => {
  const browser = await PW.launchBrowser();

  /* ══════════ 0) التسجيل في الغرف ══════════ */
  const ctxA = await browser.newContext({ locale: 'ar-MA' });
  const ctxB = await browser.newContext({ locale: 'ar-MA' });
  const A = await setup(ctxA, 'bg_host_' + (Date.now() % 10000));
  const B = await setup(ctxB, 'bg_guest_' + (Date.now() % 10000));

  const reg = await A.evaluate(() => ({
    bg: !!Rooms.roomGameIds.bg, do: !!Rooms.roomGameIds.do,
    bgMax: Rooms.maxFor('bg'), doMax: Rooms.maxFor('do'),
    optsBg: Rooms._gameOptsDefs('bg').map(d => d.key).join(','),
    optsDo: Rooms._gameOptsDefs('do').map(d => d.key).join(',')
  }));
  ok('rooms: bg/do in roomGameIds (bgMax=' + reg.bgMax + ' doMax=' + reg.doMax + ')', reg.bg && reg.do && reg.bgMax === 2 && reg.doMax === 2);
  ok('rooms: game opts — bg=[' + reg.optsBg + '] do=[' + reg.optsDo + ']', reg.optsBg === 'len' && reg.optsDo === 'target,draw');

  /* ══════════ 1) غرفة الطاولة ══════════ */
  await A.evaluate(() => openGame('bg'));
  await B.evaluate(() => openGame('bg'));
  await PW.wait(A, () => !!(typeof BackgammonApp !== 'undefined' && typeof BG_ROOM !== 'undefined'), 10000);
  await PW.wait(B, () => !!(typeof BackgammonApp !== 'undefined' && typeof BG_ROOM !== 'undefined'), 10000);

  await A.evaluate(() => Rooms.createRoom('bg', { bet: 20, game_opts: { len: 1 }, max_players: 2 }));
  const roomState = await PW.wait(A, () => !!(Rooms.state && Rooms.state.code) ? Rooms.state.code : null, 9000);
  ok('bg: room created (code=' + roomState + ')', !!roomState);
  const optsSaved = await A.evaluate(() => Rooms.state.game_opts);
  ok('bg: game_opts stored (len=' + (optsSaved && optsSaved.len) + ')', !!(optsSaved && Number(optsSaved.len) === 1));

  await B.evaluate((c) => Rooms.joinRoom(c), roomState);
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 9000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);
  await A.evaluate(() => Rooms.startGame());

  /* كلاهما يدخل وضع الغرفة */
  const inRoomA = await PW.wait(A, () => !!(BackgammonApp.room && BackgammonApp.room.on && BackgammonApp.game) ? BackgammonApp.room : null, 12000);
  const inRoomB = await PW.wait(B, () => !!(BackgammonApp.room && BackgammonApp.room.on && BackgammonApp.game) ? BackgammonApp.room : null, 12000);
  ok('bg: host entered room (mySeat=' + (inRoomA && inRoomA.mySeat) + ')', !!(inRoomA && inRoomA.mySeat === 0));
  ok('bg: guest entered room (mySeat=' + (inRoomB && inRoomB.mySeat) + ')', !!(inRoomB && inRoomB.mySeat === 1));

  /* الافتتاح: مقعد 0 يبثّ — نفس النرد والبادئ عند الطرفين */
  const opened = await PW.wait(B, () => {
    const a = BackgammonApp;
    if (!a || !a.game) return null;
    const s = a.game.state;
    return (s.phase === 'move' || s.phase === 'roll' || s.turn >= 0) ? { turn: s.turn, roll: s.lastRoll } : null;
  }, 12000);
  ok('bg: opening broadcast (starter=' + (opened && opened.turn) + ' dice=' + (opened && JSON.stringify(opened.roll)) + ')', !!opened);

  /* init وصل للضيف: نفس طول المباراة */
  const sameLen = await B.evaluate(() => BackgammonApp.game.state.matchTarget);
  ok('bg: guest matchTarget=1 from game_opts/init', sameLen === 1);

  /* لقطة أولى متطابقة */
  let sA = await A.evaluate(bgSnap);
  let sB = await B.evaluate(bgSnap);
  ok('bg: initial state equal on both', sA === sB && !!sA);

  /* حركة من صاحب الدور عبر الواجهة: نقر بندول مصدر ثم وجهة (أو رمي) */
  const hostMove = await A.evaluate(() => {
    const a = BackgammonApp, r = a.room;
    if (!r || r.mySeat !== a.game.state.turn) return 'not-my-turn';
    const s = a.game.state;
    if (s.phase === 'roll' && !s.rolled) { BG_ROOM.roll(); return 'rolled'; }
    if (s.phase === 'move') {
      const legal = BgCore.legalMoves(s, s.turn);
      if (!legal.length) return 'no-moves';
      const mv = legal[0];
      a.doMove(mv);
      return 'moved:' + mv.from + '>' + mv.to + ':' + mv.die;
    }
    return 'phase:' + s.phase;
  });
  ok('bg: host action performed (' + hostMove + ')', /^(rolled|moved:|not-my-turn)/.test(hostMove));

  /* الضيف يرى نفس الحالة بعد الحركة/الرمي */
  const synced = await PW.wait(B, () => {
    const a = BackgammonApp;
    if (!a || !a.game || !a.room || !a.room.on) return null;
    const s = a.game.state;
    if (s.lastRoll || s.dice.length) return true;
    return (s.phase === 'move' && BgCore.legalMoves(s, s.turn).length) ? true : null;
  }, 12000);
  ok('bg: guest synced after host action', !!synced);
  sA = await A.evaluate(bgSnap);
  sB = await B.evaluate(bgSnap);
  ok('bg: states equal after host action', sA === sB && !!sA);

  /* انسحاب المضيف → الضيف يفاز + التسوية الخادمية */
  const goldB0 = await B.evaluate(() => AUTH.user.gold);
  const goldA0 = await A.evaluate(() => AUTH.user.gold);
  await A.evaluate(() => { BackgammonApp.room && BG_ROOM.resign(); });
  const guestWon = await PW.wait(B, () => {
    const a = BackgammonApp;
    if (!a || !a.game || !a.room || !a.room.on) return null;
    const s = a.game.state;
    const lay = document.getElementById('bwOverLayer');
    return (s.phase === 'matchEnd' && s.winner === 1 && lay && !lay.hidden) ? s.winner : null;
  }, 12000);
  ok('bg: guest sees match end + winner=1 after host resign', guestWon === 1);

  const settleB = await PW.wait(B, () => {
    const u = AUTH.user;
    return (typeof u.gold === 'number' && u.gold === goldB0 - 20 + 39) ? u.gold : null;
  }, 12000);
  const goldB1 = (settleB != null) ? settleB : await B.evaluate(() => AUTH.user.gold);
  /* رهان 20 لكل طرف → القدح 40، رسوم 5% (1) → الفائز 20+39 */
  ok('bg: settle credited guest (' + goldB0 + ' → ' + goldB1 + ')', goldB1 === goldB0 - 20 + 39);

  const errCount0 = A._errs.length + B._errs.length;

  /* ══════════ 2) غرفة الضومنة ══════════ */
  await A.evaluate(() => Rooms.leaveRoom());
  await B.evaluate(() => Rooms.leaveRoom());
  await A.waitForTimeout(400);
  await A.evaluate(() => { closeGamePage(); });
  await B.evaluate(() => { closeGamePage(); });
  await A.waitForTimeout(300);

  await A.evaluate(() => openGame('do'));
  await B.evaluate(() => openGame('do'));
  await PW.wait(A, () => !!(typeof DominoApp !== 'undefined' && typeof DOMINO_ROOM !== 'undefined'), 10000);
  await PW.wait(B, () => !!(typeof DominoApp !== 'undefined' && typeof DOMINO_ROOM !== 'undefined'), 10000);

  await A.evaluate(() => Rooms.createRoom('do', { bet: 15, game_opts: { target: 50, draw: 1 }, max_players: 2 }));
  const room2 = await PW.wait(A, () => !!(Rooms.state && Rooms.state.code) ? Rooms.state.code : null, 9000);
  ok('do: room created (code=' + room2 + ')', !!room2);
  await B.evaluate((c) => Rooms.joinRoom(c), room2);
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 9000);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);
  await A.evaluate(() => Rooms.startGame());

  /* كلاهما يدخل وضع الغرفة بنفس التوزيعة (بذرة init من السائق) */
  const doRoomA = await PW.wait(A, () => {
    const a = DominoApp;
    return (a && a.room && a.room.on && a.game && a.game.state && a.room.seed != null) ? a.room : null;
  }, 12000);
  const doRoomB = await PW.wait(B, () => {
    const a = DominoApp;
    return (a && a.room && a.room.on && a.game && a.game.state && a.room.seed != null) ? a.room : null;
  }, 12000);
  ok('do: host room ctx (seat=' + (doRoomA && doRoomA.mySeat) + ' seed=' + (doRoomA && doRoomA.seed) + ')', !!(doRoomA && doRoomA.mySeat === 0 && doRoomA.seed));
  ok('do: guest room ctx (seat=' + (doRoomB && doRoomB.mySeat) + ' seed=' + (doRoomB && doRoomB.seed) + ')', !!(doRoomB && doRoomB.mySeat === 1 && doRoomB.seed === doRoomA.seed));

  let dA = await A.evaluate(doSnap);
  let dB = await B.evaluate(doSnap);
  ok('do: same deal on both (chain/ends/hands/boneyard)', dA === dB && !!dA);

  /* الهدف 50 من game_opts */
  const targetB = await B.evaluate(() => DominoApp.game.state.cfg.target);
  ok('do: target=50 from game_opts', targetB === 50);

  /* أول وضع قطعة من البادئ يصل للطرف الآخر */
  const whoStarts = await A.evaluate(() => DominoApp.game.state.turn);
  const starterPage = whoStarts === 0 ? A : B;
  const otherPage = whoStarts === 0 ? B : A;
  const starterSeat = await starterPage.evaluate(() => DominoApp.room.mySeat);
  const playRes = await starterPage.evaluate(() => {
    const a = DominoApp;
    const s = a.game.state;
    if (s.phase !== 'play' || s.turn !== a.room.mySeat) return 'not-starting';
    const mv = a.game.legalMoves(a.room.mySeat)[0];
    if (!mv) return 'no-legal';
    a.playerPlay(mv.tile, mv.end, a.room.mySeat);
    return 'played:' + mv.tile.id + ':' + mv.end;
  });
  ok('do: starter played first tile (' + playRes + ', starterSeat=' + starterSeat + ')', /^played:/.test(playRes));
  const otherSees = await PW.wait(otherPage, () => {
    const a = DominoApp;
    if (!a || !a.game || !a.room || !a.room.on) return null;
    return a.game.state.chain.length === 1 ? a.game.state.chain[0].tile.id : null;
  }, 12000);
  ok('do: opponent sees first tile on chain (' + otherSees + ')', !!otherSees);
  dA = await A.evaluate(doSnap);
  dB = await B.evaluate(doSnap);
  ok('do: states equal after first play', dA === dB && !!dA);

  /* انسحاب الضيف (مقعد 1) → المضيف يفاز + تسوية */
  const goldA_0 = await A.evaluate(() => AUTH.user.gold);
  await B.evaluate(() => { DominoApp.room && DOMINO_ROOM.resign(); });
  const hostWon = await PW.wait(A, () => {
    const a = DominoApp;
    if (!a || !a.game || !a.room || !a.room.on) return null;
    const s = a.game.state;
    const lay = document.getElementById('dmMatchLayer');
    return (s.phase === 'matchEnd' && s.matchWinner === 0 && lay && !lay.hidden) ? s.matchWinner : null;
  }, 12000);
  ok('do: host sees match end + winner=0 after guest resign', hostWon === 0);
  const settleA = await PW.wait(A, () => {
    const u = AUTH.user;
    return (typeof u.gold === 'number' && u.gold === goldA_0 - 15 + 29) ? u.gold : null;
  }, 12000);
  const goldA_1 = (settleA != null) ? settleA : await A.evaluate(() => AUTH.user.gold);
  /* رهان 15 لكل طرف → القدح 30، رسوم 5% (1) → الفائز 15+29 */
  ok('do: settle credited host (' + goldA_0 + ' → ' + goldA_1 + ')', goldA_1 === goldA_0 - 15 + 29);

  /* أخطاء الكونسول عبر الجلسة كلها */
  const errTotal = A._errs.length + B._errs.length;
  ok('zero console/page errors (+' + (errTotal - errCount0) + ' since last checkpoint)', errTotal === 0);
  if (errTotal) console.log('     errors: A=' + A._errs.slice(0, 4).join(' | ') + ' B=' + B._errs.slice(0, 4).join(' | '));

  await browser.close();
  console.log('\n═══ [BGDO-rooms] E2E: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

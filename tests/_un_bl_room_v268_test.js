/* ═════════════════════════════════════════════════════════════════════
   [v2.68] اختبار متصفح حقيقي: غرف أونو (un) والبلوت (bl) بعد العزل
   ───────────────────────────────────────────────────────────────────────
   يغطي على الخادم المحلي 4173 (DM_TEST_MODE):
   أونو (لاعبان — والضيف على الصفحة الرئيسية عند البدء!):
     1) غرفة أونو ثنائية تُنشأ (بعد التحقق من سقف المقاعد 4)
     2) البدء: لوحة المضيف تُبنى والضيف تُفتح له اللعبة تلقائياً وتبنى لوحته
        (إصلاح «اللاعب الثاني لا يستطيع فتح اللعبة»)
     3) نفس الحالة عند الطرفين (بذرة واحدة: نفس الأيدي/الترتيب/الدور)
     4) حركة سحب من صاحب الدور تصل الطرفين (بثّ متزامن عبر SSE)
     5) صفر أخطاء JS عند الطرفين
   البلوت (4 متصفحات):
     6) غرفة بلوت بمقاعد 4 بالضبط (طلب 2 ⇒ تصحيح)
     7) البدء بأربعة: المحرك مبني عند الجميع (8×4 أوراق) بنفس البذرة
     8) صفر أخطاء JS عند الأربعة
   ملاحظة منهجية: ok() هنا شرطية (cond, label) — على عكس أجنحة المتصفح
   القديمة التي كانت ok(label) فتطبع ✅ دائماً بلا النظر للشرط.
   تشغيل:  node tests/_un_bl_room_v268_test.js   (الخادم 4173 DM_TEST_MODE=1)
   ═════════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
let pass = 0, fail = 0;
function ok(cond, label) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label); }

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

/* دوال تُقيَّم في سياق الصفحة — مضمّنة ذاتياً بالكامل (لا مراجع لإغلاقات خارجية:
   Playwright يسلّل جسم الدالة فقط فأي مرجع خارجي يصير ReferenceError) */
function unSnap() {
  const NS = window.UNGameNS;
  const app = window.UnoApp;
  if (!NS || !NS.st || !app || !app.roomMode) return null;
  const s = NS.st;
  return JSON.stringify({
    hands: (s.hands || []).map(h => (h || []).map(c => c.id).join(',')).join('|'),
    discard: (s.discard || []).map(c => c.id).join(','),
    turn: s.turn, phase: s.phase, players: s.cfg && s.cfg.players,
    order: (s.order || []).join(','), deck: (s.deck || []).length
  });
}
function unBuilt() {
  try {
    const NS = window.UNGameNS;
    const app = window.UnoApp;
    return !!(NS && NS.st && app && app.roomMode);
  } catch (e) { return false; }
}
function blSnap() {
  const NS = window.BLGameNS;
  const app = window.BalootApp;
  if (!NS || !NS.state || !app || !app.roomMode) return null;
  const s = NS.state;
  return JSON.stringify({
    hands: (s.hands || []).map(h => (h || []).map(c => c.id).join(',')).join('|'),
    phase: s.phase, turn: s.turn,
    order: (s.order || []).join(','), trump: s.trump || null
  });
}
function blBuilt() {
  try {
    const NS = window.BLGameNS;
    const app = window.BalootApp;
    return !!(NS && NS.state && app && app.roomMode);
  } catch (e) { return false; }
}
/* حركة حقيقية من صاحب الدور عبر مسار الواجهة الفعلي (بثّ + تطبيق محلي):
   يلعب أول ورقة قانونية إن وُجدت وإلا يسحب — يعيد وصف الحركة */
function unRealMove() {
  try {
    const NS = window.UNGameNS;
    const app = window.UnoApp;
    if (!NS || !NS.st || !app) return null;
    const s = NS.st;
    const my = s.turn;
    const hand = s.hands[my] || [];
    const top = s.discard[s.discard.length - 1];
    const card = hand.find(c => c.color === top.color || c.value === top.value || c.value === 'X');
    if (card) {
      app._emitPlay(my, card.id, card.value === 'X' ? 'red' : null);
      return 'play:' + card.id;
    }
    app._doDraw();
    return 'draw';
  } catch (e) { return 'ERR:' + (e && e.message); }
}

(async () => {
  const browser = await PW.launchBrowser();
  const tag = Date.now() % 100000;

  /* ═══════════════ 1) أونو: لاعبان — الضيف على الرئيسية عند البدء ═══════════════ */
  console.log('═══ أونو: غرفة ثنائية والضيف خارج صفحة اللعبة ═══');
  {
    const ctxA = await browser.newContext({ locale: 'ar-MA' });
    const ctxB = await browser.newContext({ locale: 'ar-MA' });
    const A = await setup(ctxA, 'un_h_' + tag);
    const B = await setup(ctxB, 'un_g_' + tag);

    const seatInfo = await A.evaluate(() => ({ max: Rooms.maxFor('un'), supported: Rooms.isGameSupported('un') }));
    ok(seatInfo.supported && seatInfo.max === 4, 'un: مدعومة في الغرف (سقف المقاعد 4)');

    await A.evaluate(() => openGame('un'));
    await PW.wait(A, () => !!(typeof UnoApp !== 'undefined' && window.UNGameNS), 10000);
    await A.evaluate(() => Rooms.createRoom('un', { bet: 10, max_players: 2 }));
    const code = await PW.wait(A, () => (Rooms.state && Rooms.state.code) || null, 9000);
    ok(!!code, 'un: غرفة أُنشئت (code=' + code + ')');
    const maxp = await A.evaluate(() => Rooms.state && Rooms.state.max_players);
    ok(maxp === 2, 'un: غرفة ثنائية فعلاً (max_players=' + maxp + ')');

    /* الضيف ينضم بالرمز من الرئيسية — لا يفتح اللعبة بنفسه */
    await B.evaluate((c) => Rooms.joinRoom(c), code);
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 9000);
    await A.evaluate(() => Rooms.setReady(true));
    await B.evaluate(() => Rooms.setReady(true));
    await PW.wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);

    /* المضيف يبدأ — الضيف على الرئيسية */
    await A.evaluate(() => Rooms.startGame());

    const hostBuilt = await PW.wait(A, unBuilt, 12000);
    ok(!!hostBuilt, 'un: لوحة المضيف بُنيت (المحرك roomMode + st)');

    const guestOpened = await PW.wait(B, () => {
      try { return window._currentGameId === 'un' && typeof window.UNGameNS !== 'undefined'; } catch (e) { return false; }
    }, 12000);
    ok(!!guestOpened, 'un: فُتحت لعبة أونو تلقائياً عند الضيف (كانت لا تُفتح)');

    const guestBuilt = await PW.wait(B, unBuilt, 12000);
    ok(!!guestBuilt, 'un: لوحة الضيف بُنيت (init وصل عبر التخزين المؤقت/التسليم الحدثي)');

    const snapA = await A.evaluate(unSnap);
    const snapB = await B.evaluate(unSnap);
    ok(!!snapA && !!snapB && snapA === snapB, 'un: الحالة متطابقة عند الطرفين (نفس الأيدي/الدور/الترتيب)');
    if (!(snapA === snapB)) {
      console.log('     host:', (snapA || 'null').slice(0, 110));
      console.log('     guest:', (snapB || 'null').slice(0, 110));
    }

    /* حركة حقيقية من صاحب الدور عبر مسار الواجهة (بثّ + تطبيق محلي) —
       ثم انتظار تطابق الطرفين مجدداً (وصول الحركة الحيّة للطرف الآخر) */
    const turnSeat = await A.evaluate(() => window.UNGameNS && window.UNGameNS.st ? window.UNGameNS.st.turn : -1);
    const mover = (turnSeat === 0) ? A : B;
    const watcher = (turnSeat === 0) ? B : A;
    const snapBefore = await mover.evaluate(unSnap);
    const moveDesc = await mover.evaluate(unRealMove);
    const snapMover = await PW.wait(mover, (ref) => {
      try {
        const NS = window.UNGameNS;
        const app = window.UnoApp;
        if (!NS || !NS.st || !app || !app.roomMode) return null;
        const s = NS.st;
        const cur = JSON.stringify({
          hands: (s.hands || []).map(h => (h || []).map(c => c.id).join(',')).join('|'),
          discard: (s.discard || []).map(c => c.id).join(','),
          turn: s.turn, phase: s.phase
        });
        return cur !== ref ? cur : null;
      } catch (e) { return null; }
    }, 9000, JSON.parse(snapBefore).hands + '|' + JSON.parse(snapBefore).discard);
    const snapWatcher = await PW.wait(watcher, (ref) => {
      try {
        const NS = window.UNGameNS;
        const app = window.UnoApp;
        if (!NS || !NS.st || !app || !app.roomMode) return null;
        const s = NS.st;
        const cur = JSON.stringify({
          hands: (s.hands || []).map(h => (h || []).map(c => c.id).join(',')).join('|'),
          discard: (s.discard || []).map(c => c.id).join(','),
          turn: s.turn, phase: s.phase
        });
        return cur === ref ? cur : null;
      } catch (e) { return null; }
    }, 9000, snapMover);
    ok(!!moveDesc && !!snapMover && !!snapWatcher && snapMover === snapWatcher,
       'un: حركة حية (' + moveDesc + ') غيّرت الحالة عند الطرفين ووصلت فوراً (متطابقتان)');

    ok(A._errs.length === 0, 'un: صفر أخطاء JS عند المضيف' + (A._errs.length ? ' — ' + A._errs.slice(0, 2).join(' | ') : ''));
    ok(B._errs.length === 0, 'un: صفر أخطاء JS عند الضيف' + (B._errs.length ? ' — ' + B._errs.slice(0, 2).join(' | ') : ''));

    await ctxA.close(); await ctxB.close();
  }

  /* ═══════════════ 2) البلوت: أربعة متصفحات ═══════════════ */
  console.log('═══ البلوت: غرفة رباعية ═══');
  {
    const ctxs = [], pages = [];
    for (let i = 0; i < 4; i++) {
      const ctx = await browser.newContext({ locale: 'ar-MA' });
      ctxs.push(ctx);
      pages.push(await setup(ctx, 'bl_p' + i + '_' + tag));
    }
    const [H, G1, G2, G3] = pages;

    await H.evaluate(() => openGame('bl'));
    await PW.wait(H, () => !!(typeof BalootApp !== 'undefined' && window.BLGameNS), 10000);
    await H.evaluate(() => Rooms.createRoom('bl', { bet: 20, max_players: 2 }));
    const code = await PW.wait(H, () => (Rooms.state && Rooms.state.code) || null, 9000);
    ok(!!code, 'bl: غرفة أُنشئت (code=' + code + ')');
    const maxp = await H.evaluate(() => Rooms.state && Rooms.state.max_players);
    ok(maxp === 4, 'bl: طُلب مقعدان وصُحِّح إلى 4 بالضبط (max_players=' + maxp + ')');

    for (const G of [G1, G2, G3]) {
      await G.evaluate((c) => Rooms.joinRoom(c), code);
      await H.waitForTimeout(300);
    }
    const playersN = await PW.wait(H, () => (Rooms.state && Rooms.state.players.length >= 4) ? Rooms.state.players.length : null, 9000);
    ok(playersN === 4, 'bl: 4 لاعبين في الغرفة (' + playersN + ')');
    /* عدّاد حركات وتحديثات الغرف عند الجميع (تشخيص) */
    for (const P of pages) {
      await P.evaluate(() => {
        window.__blMoves = [];
        window.__blUpdates = [];
        try {
          const origOM = Rooms._onMove;
          Rooms._onMove = function (d) { window.__blMoves.push(String((d && d.action) || '?') + '@' + (Date.now() % 100000)); return origOM.call(Rooms, d); };
        } catch (e) {}
        try {
          const origOU = Rooms._onUpdate;
          Rooms._onUpdate = function (room) {
            window.__blUpdates.push((room ? ('rev' + room.rev + ':' + room.status) : 'null') + '@' + (Date.now() % 100000));
            return origOU.call(Rooms, room);
          };
        } catch (e) {}
      });
    }
    for (const P of pages) await P.evaluate(() => Rooms.setReady(true));
    await PW.wait(H, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 9000);

    /* المضيف يبدأ — الثلاثة الآخرون على الرئيسية */
    await H.evaluate(() => Rooms.startGame());

    const built = [];
    for (const P of pages) {
      const b = await PW.wait(P, blBuilt, 18000);
      built.push(!!b);
    }
    ok(built.every(Boolean), 'bl: المحرك مبني عند الأربعة (roomMode + state)');
    /* تشخيص الفشل: ماذا لدى الصفحة غير المبنية؟ */
    for (let i = 0; i < built.length; i++) {
      if (!built[i]) {
        const diag = await pages[i].evaluate(() => {
          try {
            const app = window.BalootApp;
            const rs = Rooms.state;
            return {
              gid: window._currentGameId,
              roomMode: !!(app && app.roomMode),
              nsState: !!(window.BLGameNS && window.BLGameNS.state),
              room: rs ? { id: rs.id, status: rs.status, rev: rs.rev, n: (rs.players || []).length } : null,
              handler: typeof (window.BL_roomMove),
              movesSeen: (window.__blMoves || []).length,
              moves: (window.__blMoves || []).slice(0, 3),
              updatesSeen: (window.__blUpdates || []).length,
              updates: (window.__blUpdates || []).slice(-6)
            };
          } catch (e) { return { err: String(e && e.message) }; }
        });
        console.log('     p' + i + ' DIAG:', JSON.stringify(diag));
      }
    }
    built.forEach((b, i) => { if (!b) console.log('     p' + i + ' NOT BUILT'); });

    const snaps = [];
    for (const P of pages) snaps.push(await P.evaluate(blSnap));
    const allSame = snaps.every(s => !!s && s === snaps[0]);
    ok(allSame, 'bl: نفس البذرة/الأيدي عند الأربعة');
    if (!allSame) snaps.forEach((s, i) => console.log('     p' + i + ':', (s || 'null').slice(0, 100)));

    const handInfo = await H.evaluate(() => {
      try {
        const s = window.BLGameNS.state;
        if (!s) return null;
        return { n: (s.hands || []).length, each: (s.hands || []).map(h => h.length).join(',') };
      } catch (e) { return null; }
    });
    ok(!!handInfo && handInfo.n === 4 && handInfo.each === '8,8,8,8', 'bl: 4 أيدٍ بـ8 أوراق (' + (handInfo ? handInfo.each : 'null') + ')');

    let errs = 0;
    for (const P of pages) errs += P._errs.length;
    ok(errs === 0, 'bl: صفر أخطاء JS عند الأربعة');
    pages.forEach((P, i) => { if (P._errs.length) console.log('     p' + i + ' errs:', P._errs.slice(0, 2)); });

    for (const c of ctxs) await c.close();
  }

  await browser.close();
  console.log('\n═══ [v2.68 un/bl rooms] E2E: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

/* اختبار الشطرنج الشامل في المتصفح:
   1) الكتالوج + شاشة الإعداد + وجه لوجه (لوحة، حركة، قلب تلقائي، مات الأحمق)
   2) منتقي الترقية + التعادل المحلي + بلا رهان داخل النافذة
   3) غرفة أونلاين برهان 25: خذ الرهانين، مات عبر الطرفين، تسوية الفائز/الخاسر
   4) مباراة جديدة + تعادل بالتوافق (استرجاع) + استسلام — مع 0 أخطاء صفحة */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';

async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(180);
  }
  throw new Error('wait timeout' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}

async function setup(ctx, username, gold) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && Rooms.joinSse), 15000);
  await page.waitForTimeout(600);
  await page.evaluate((g) => { if (typeof ST !== 'undefined') { ST.gold = g; } }, gold == null ? 50000 : gold);
  return page;
}

/* نقرة على خانة بإحداثيات الرقعة (مستقلة عن القلب البصري) */
async function tap(page, r, c) {
  await page.evaluate(([rr, cc]) => chessClick(rr, cc), [r, c]);
  await page.waitForTimeout(160);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? '  ✓ ' : '  ✗ ') + name); };

  /* ══════════ الجزء 1: وجه لوجه (موبايل + سطح مكتب) ══════════ */
  for (const [label, vp] of [['mobile', { width: 390, height: 780, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 800 }]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const u = 'ch' + label + Date.now().toString().slice(-5);
    const page = await setup(ctx, u, 50000);
    try {
      /* 1. الكتالوج */
      const inCat = await page.evaluate(() => Array.isArray(window.GAMES) && window.GAMES.some(g => g.id === 'ch' && g.eng === 'chess'));
      ok(label + ': ch in catalog', inCat);

      /* 2. فتح اللعبة + شاشة الإعداد (الرهان موجود في الإعدادات فقط) */
      await page.evaluate(() => openGame('ch'));
      await wait(page, () => { const el = document.getElementById('chessSetup'); return el && !el.hidden; }, 10000);
      const betChips = await page.evaluate(() => document.querySelectorAll('#chessBet .dama-chip').length);
      ok(label + ': setup renders (bet chips=' + betChips + ')', betChips === 5);

      /* 3. بدء وجه لوجه: 64 خانة + 32 قطعة */
      await page.evaluate(() => chessStartLocal());
      await wait(page, () => { const b = document.getElementById('chessBoard'); return b && b.children.length === 64; }, 10000);
      await page.waitForTimeout(250);
      const counts = await page.evaluate(() => ({
        sq: document.querySelectorAll('#chessBoard .ch-sq').length,
        w: document.querySelectorAll('#chessBoard .ch-pc.w').length,
        b: document.querySelectorAll('#chessBoard .ch-pc.b').length,
        coords: document.querySelectorAll('#chessBoard .ch-co').length
      }));
      ok(label + ': board 64 sq / ' + counts.w + 'w / ' + counts.b + 'b / coords ' + counts.coords,
        counts.sq === 64 && counts.w === 16 && counts.b === 16 && counts.coords === 16);

      /* 4. نقر e2 → تلميحات → e4: البيدق يتحرك والسجل يكتب */
      await tap(page, 6, 4);
      const hints = await page.evaluate(() => document.querySelectorAll('#chessBoard .ch-sq.hint').length);
      ok(label + ': e2 shows hints (' + hints + ')', hints === 2);
      await tap(page, 4, 4);
      const after = await page.evaluate(() => ({
        e4: !!document.querySelector('#chessBoard .ch-sq[data-r="4"][data-c="4"] .ch-pc'),
        e2: !!document.querySelector('#chessBoard .ch-sq[data-r="6"][data-c="4"] .ch-pc'),
        log: (CHESS.state.log || []).join(' '),
        flipped: CHESS.flipped
      }));
      ok(label + ': e2–e4 moved + logged + auto-flip', after.e4 && !after.e2 && /e2–e4/.test(after.log) && after.flipped === true);

      /* 5. مات الأحمر (f3 e5 g4 Qh4#) — الأسود يفاز (مباراة جديدة للتسلسل الصحيح) */
      await page.evaluate(() => chessStartLocal());
      await wait(page, () => { const b = document.getElementById('chessBoard'); return b && CHESS.state && CHESS.state.log.length === 0; }, 8000);
      await tap(page, 6, 5); await tap(page, 5, 5);   /* f3 */
      await tap(page, 1, 4); await tap(page, 3, 4);   /* e5 */
      await tap(page, 6, 6); await tap(page, 4, 6);   /* g4 */
      await tap(page, 0, 3); await tap(page, 4, 7);   /* Qh4# */
      await wait(page, () => { const ov = document.getElementById('chessOver'); return ov && !ov.hidden; }, 8000);
      const over = await page.evaluate(() => ({
        tx: (document.getElementById('chessOverTx') || {}).textContent || '',
        outcome: CHESS.state.outcome, reason: CHESS.state.endReason,
        logLen: (CHESS.state.log || []).length
      }));
      ok(label + ": fool's mate → black wins (" + over.tx.trim() + ')',
        over.outcome === 'b' && over.reason === 'mate' && /الأسود|الكحال|Noirs|Black/.test(over.tx) && over.logLen === 4);

      /* 6. الترقية: وضع مخصص (بيدق أبيض a7) → منتقي → ملكة a8 */
      await page.evaluate(() => {
        CHESS.state = chessNewState();
        CHESS.state.board = CHESS.state.board.map(row => row.slice());
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) CHESS.state.board[r][c] = null;
        CHESS.state.board[7][4] = 'K'; CHESS.state.board[0][7] = 'k'; CHESS.state.board[1][0] = 'P';   /* بيدق أبيض على a7 */
        CHESS.state.turn = 'w'; CHESS.state.log = []; CHESS.flipped = false;
        CHESS.sel = null; CHESS.legal = []; CHESS.lastFrom = null; CHESS.lastTo = null;
        chessRender();
      });
      await tap(page, 1, 0);
      await tap(page, 0, 0);
      const promoOpen = await page.evaluate(() => { const o = document.getElementById('chessPromo'); return o && !o.hidden; });
      ok(label + ': promo picker opens', !!promoOpen);
      await page.evaluate(() => chessPickPromo('q'));
      await page.waitForTimeout(200);
      const promo = await page.evaluate(() => ({
        a8: (document.querySelector('#chessBoard .ch-sq[data-r="0"][data-c="0"] .ch-pc') || {}).textContent || '',
        log: (CHESS.state.log || []).join(' ')
      }));
      const a8txt = promo.a8;
      ok(label + ': promoted ♛ on a8 (' + a8txt + ', ' + promo.log + ')', a8txt === '♛' && /=♕/.test(promo.log));

      /* 7. تعادل محلي: عرض → شريط مصادقة → قبول */
      await page.evaluate(() => {
        CHESS.state = chessNewState(); CHESS.sel = null; CHESS.legal = [];
        CHESS.lastFrom = null; CHESS.lastTo = null; CHESS.flipped = false; CHESS.mode = 'local';
        document.getElementById('chessOver').hidden = true;
        chessRender();
      });
      await page.evaluate(() => chessDrawOffer());
      const barVisible = await page.evaluate(() => { const b = document.getElementById('chessDrawBar'); return b && !b.hidden; });
      ok(label + ': local draw bar shows', !!barVisible);
      await page.evaluate(() => chessDrawAccept(true));
      const drawDone = await page.evaluate(() => ({
        ov: !(document.getElementById('chessOver') || { hidden: true }).hidden,
        outcome: CHESS.state.outcome, reason: CHESS.state.endReason
      }));
      ok(label + ': draw accepted → over draw/agreed', drawDone.ov && drawDone.outcome === 'draw' && drawDone.reason === 'agreed');

      /* 8. لا حقل رهان داخل نافذة اللعب (ودية فقط) */
      const stakeTxt = await page.evaluate(() => {
        CHESS.state.over = false; chessUpdateHUD();
        return (document.getElementById('chessStake') || {}).textContent || '';
      });
      ok(label + ': hot-seat stake = friendly (' + stakeTxt.trim() + ')', !/🪙/.test(stakeTxt) || /ودية|amicale|friendly|ودي/.test(stakeTxt));

      /* 9. ملاءمة الشاشة + 0 أخطاء */
      const fit = await page.evaluate(() => {
        const body = document.getElementById('gamePageBody');
        const stage = body && body.querySelector('.stage');
        if (!stage) return { err: 'no stage' };
        if (typeof fitGameStage === 'function') fitGameStage();
        const b = body.getBoundingClientRect(); const s = stage.getBoundingClientRect();
        return { inV: s.top >= b.top - 2 && s.bottom <= b.bottom + 2, inH: s.left >= b.left - 2 && s.right <= b.right + 2 };
      });
      ok(label + ': stage fits (' + JSON.stringify(fit) + ')', fit.inV && fit.inH);
      ok(label + ': 0 page errors', page._errs.length === 0);
      if (page._errs.length) console.log('   errs:', page._errs.slice(0, 3));
    } catch (e) {
      ok(label + ': EXCEPTION ' + String(e.message).slice(0, 100), false);
    }
    await ctx.close();
  }

  /* ══════════ الجزء 2: غرفة أونلاين برهان 25 ══════════ */
  const ctxA = await browser.newContext(); const ctxB = await browser.newContext();
  const A = await setup(ctxA, 'chess_host' + Date.now().toString().slice(-5), 50000);
  const B = await setup(ctxB, 'chess_guest' + Date.now().toString().slice(-5), 50000);
  try {
    await A.evaluate(() => openGame('ch'));
    await B.evaluate(() => openGame('ch'));
    await wait(A, () => !!(typeof CHESS !== 'undefined' && CHESS && typeof window.chessRoomMove === 'function'), 10000);
    await wait(B, () => !!(typeof CHESS !== 'undefined' && CHESS && typeof window.chessRoomMove === 'function'), 10000);

    /* المضيف يختار رهان 25 ثم ينشئ الغرفة من زر أونلاين */
    await A.evaluate(() => { chessSetBet(25); Rooms.createRoom('ch', 25); });
    await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
    const roomInfo = await A.evaluate(() => ({ code: Rooms.state.code, bet: Rooms.state.bet, game: Rooms.state.game_id }));
    ok('room created ch + bet=25 (server echoed ' + roomInfo.bet + ')', roomInfo.game === 'ch' && roomInfo.bet === 25);

    const code = roomInfo.code;
    await B.evaluate((c) => Rooms.joinRoom(c), code);
    await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
    await wait(B, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);

    await A.evaluate(() => Rooms.setReady(true));
    await B.evaluate(() => Rooms.setReady(true));
    await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);
    await A.evaluate(() => Rooms.startGame());

    await wait(A, () => !!(CHESS && CHESS.mode === 'room' && CHESS.state && !document.getElementById('chessPlay').hidden), 15000);
    await wait(B, () => !!(CHESS && CHESS.mode === 'room' && CHESS.state && !document.getElementById('chessPlay').hidden), 15000);

    const seats = await Promise.all([
      A.evaluate(() => ({ my: CHESS.myColor, flip: CHESS.flipped, spec: CHESS.isSpectator, gold: ST.gold })),
      B.evaluate(() => ({ my: CHESS.myColor, flip: CHESS.flipped, spec: CHESS.isSpectator, gold: ST.gold }))
    ]);
    ok('host=white not flipped', seats[0].my === 'w' && seats[0].flip === false && seats[0].spec === false);
    ok('guest=black flipped view', seats[1].my === 'b' && seats[1].flip === true && seats[1].spec === false);
    ok('bet 25 taken from both (' + seats[0].gold + ' / ' + seats[1].gold + ')', seats[0].gold === 49975 && seats[1].gold === 49975);

    const stake = await A.evaluate(() => (document.getElementById('chessStake') || {}).textContent || '');
    ok('stake label shown in room (' + stake.trim() + ')', /25/.test(stake));

    /* مات الأحمر عبر الشبكة: f3 / e5 / g4 / Qh4# */
    await tap(A, 6, 5); await tap(A, 5, 5);           /* الأبيض: f3 */
    await wait(B, () => CHESS.state && CHESS.state.log.length === 1, 10000);
    await tap(B, 1, 4); await tap(B, 3, 4);           /* الأسود: e5 */
    await wait(A, () => CHESS.state.log.length === 2, 10000);
    await tap(A, 6, 6); await tap(A, 4, 6);           /* الأبيض: g4 */
    await wait(B, () => CHESS.state.log.length === 3, 10000);
    await tap(B, 0, 3); await tap(B, 4, 7);           /* الأسود: Qh4# */
    await wait(A, () => CHESS.state.over === true && !document.getElementById('chessOver').hidden && (document.getElementById('chessOverTx') || {}).textContent, 12000);
    await wait(B, () => CHESS.state.over === true && !document.getElementById('chessOver').hidden && (document.getElementById('chessOverTx') || {}).textContent, 12000);

    const snap = async (p) => p.evaluate(() => JSON.stringify({
      outcome: CHESS.state.outcome, reason: CHESS.state.endReason,
      over: !document.getElementById('chessOver').hidden,
      tx: (document.getElementById('chessOverTx') || {}).textContent,
      amt: (document.getElementById('chessOverAmt') || {}).textContent,
      gold: ST.gold
    }));
    const resA = JSON.parse(await snap(A)); const resB = JSON.parse(await snap(B));
    ok('mate synced both (b/mate)', resA.outcome === 'b' && resA.reason === 'mate' && resB.outcome === 'b' && resB.reason === 'mate');
    ok('loser overlay A (' + resA.tx.trim() + ' ' + resA.amt + ' gold=' + resA.gold + ')', /خسرت|خسارة|perdu|lost/.test(resA.tx) && resA.gold === 49975);
    ok('winner payout B (' + resB.amt + ' gold=' + resB.gold + ')', /\+50|50 🪙/.test(resB.amt) && resB.gold === 50025);

    /* مباراة جديدة (المضيف يطلقها) → لوحة جديدة عند الطرفين */
    await A.evaluate(() => chessNewMatch());
    await wait(A, () => CHESS.state && CHESS.state.log.length === 0 && !CHESS.state.over, 8000);
    await wait(B, () => CHESS.state && CHESS.state.log.length === 0 && !CHESS.state.over, 10000);
    const fresh = await Promise.all([
      A.evaluate(() => JSON.stringify(CHESS.state.board)),
      B.evaluate(() => JSON.stringify(CHESS.state.board))
    ]);
    ok('new match resets both boards', fresh[0] === fresh[1]);
    const goldAfterNew = await Promise.all([A.evaluate(() => ST.gold), B.evaluate(() => ST.gold)]);
    ok('new round re-stakes 25 each (' + goldAfterNew.join('/') + ')', goldAfterNew[0] === 49950 && goldAfterNew[1] === 50000);

    /* تعادل بالتوافق: A يعرض → B يقبل → استرجاع الرهان */
    await A.evaluate(() => { CHESS.state.full = 20; chessDrawOffer(); });
    await wait(B, () => { const b = document.getElementById('chessDrawBar'); return b && !b.hidden; }, 8000);
    await B.evaluate(() => chessDrawAccept(true));
    await wait(A, () => CHESS.state.over === true && CHESS.state.outcome === 'draw', 8000);
    const drawGold = await Promise.all([A.evaluate(() => ST.gold), B.evaluate(() => ST.gold)]);
    ok('agreed draw refunds round-2 stake (' + drawGold.join('/') + ')', drawGold[0] === 49975 && drawGold[1] === 50025);

    /* جولة ثالثة: B يستسلم → A يفوز بالرهانين */
    await Promise.all([A.evaluate(() => { ST.gold = 50000; }), B.evaluate(() => { ST.gold = 50000; })]);
    await A.evaluate(() => chessNewMatch());
    await wait(A, () => CHESS.state && !CHESS.state.over, 8000);
    await wait(B, () => CHESS.state && !CHESS.state.over, 10000);
    await B.evaluate(() => { window.confirm = () => true; chessResign(); });
    await wait(A, () => CHESS.state.over === true, 8000);
    await wait(B, () => CHESS.state.over === true, 8000);
    const resignGold = await Promise.all([A.evaluate(() => ST.gold), B.evaluate(() => ST.gold)]);
    const resignAmt = await A.evaluate(() => (document.getElementById('chessOverAmt') || {}).textContent || '');
    ok('resign → winner takes pot (' + resignGold.join('/') + ' | ' + resignAmt.trim() + ')',
      resignGold[0] === 50025 && resignGold[1] === 49975);

    ok('MP: 0 page errors A', A._errs.length === 0);
    ok('MP: 0 page errors B', B._errs.length === 0);
    if (A._errs.length || B._errs.length) console.log('   errs:', A._errs.slice(0, 3), B._errs.slice(0, 3));
  } catch (e) {
    ok('MP EXCEPTION ' + String(e.message).slice(0, 120), false);
  }
  await ctxA.close(); await ctxB.close();

  /* ═══ النتيجة ═══ */
  const pass = results.filter(r => r[1]).length;
  console.log('\n════════════════════════════════');
  console.log('CHESS BROWSER: ' + pass + ' passed, ' + (results.length - pass) + ' failed');
  console.log('════════════════════════════════');
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

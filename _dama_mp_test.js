/* اختبار الضامة الجماعية: لاعبان أونلاين عبر الخادم بين متصفحين حقيقيين.
   المضيف يفتح غرفة dm + الضيف ينضم بالكود + بدء + حركات متبادلة + مطابقة اللوحة
   + استسلام + مباراة جديدة. يتحقق أيضاً من غرفة (لاعب ضد بوت) عبر practiceVsAi. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';

/* استطلاع موثوق عبر evaluate (waitForFunction يتعثّر في هذه البيئة) */
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(200);
  }
  throw new Error('wait timeout' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}

/* تجميد لوحة DAMA إلى نص للمقارنة بين الطرفين */
function boardSnapFn() {
  return () => {
    if (typeof window === 'undefined' || typeof DAMA === 'undefined' || !DAMA || !DAMA.state) return null;
    const g = DAMA.state.grid;
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let row = '';
      for (let c = 0; c < 8; c++) {
        const p = g[r][c];
        row += p ? (p.owner + (p.king ? 'K' : 'M')) : '.';
      }
      rows.push(row);
    }
    return JSON.stringify({ turn: DAMA.state.turn, moves: DAMA.state.moves, over: DAMA.state.over, board: rows.join('|') });
  };
}

/* ينفّذ حركة (غير آكلة إن أمكن) للاعب الذي عليه الدور — عبر damaHumanMove مباشرة.
   يعيد {from,to,cap} أو null لو لا توجد حركة قانونية. */
function playMoveFn() {
  return () => {
    if (!DAMA || !DAMA.state || DAMA.state.over) return null;
    if (DAMA.isSpectator) return null;
    if (DAMA.state.turn !== DAMA.human) return null;   /* ليس دوري */
    const all = DAMA.eng.legalMoves(DAMA.state, DAMA.state.turn);
    if (!all || !all.length) return null;
    /* فضّل الحركة غير الآكلة لتجنّب استمرار السلسلة في الاختبار */
    const simple = all.filter(m => !m.cap);
    const mv = (simple.length ? simple : all)[0];
    damaHumanMove(mv);
    return JSON.stringify({ from: mv.from, to: mv.to, cap: !!mv.cap });
  };
}

async function setup(ctx, username) {
  const rr = await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } });
  const rj = (await rr.json().catch(() => ({}))) || {};
  if (!rj.ok) {
    await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } });
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && Rooms.joinSse), 15000);
  await page.waitForTimeout(700); // اتصال SSE
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? '  ✓ ' : '  ✗ ') + name); };

  /* ══════════ الجزء 1: لاعبان أونلاين ══════════ */
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const A = await setup(ctxA, 'dama_host');
  const B = await setup(ctxB, 'dama_guest');
  console.log('users:', await A.evaluate(() => AUTH.user.username), '|', await B.evaluate(() => AUTH.user.username));

  await A.evaluate(() => openGame('dm'));
  await B.evaluate(() => openGame('dm'));
  await wait(A, () => !!(typeof DAMA !== 'undefined' && DAMA && typeof window.damaRoomMove === 'function'), 10000);
  await wait(B, () => !!(typeof DAMA !== 'undefined' && DAMA && typeof window.damaRoomMove === 'function'), 10000);

  // المضيف يفتح غرفة ضامة
  await A.evaluate(() => Rooms.createRoom('dm', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  console.log('room code:', code, '| game:', await A.evaluate(() => Rooms.state.game_id));
  ok('room game=dm', await A.evaluate(() => Rooms.state.game_id) === 'dm');

  // الضيف ينضم بالكود
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await wait(B, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  console.log('players:', await A.evaluate(() => Rooms.state.players.map(p => p.username + (p.ready ? '✓' : '⏳')).join(', ')));

  // كلاهما جاهز
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 8000);

  // المضيف يبدأ
  await A.evaluate(() => Rooms.startGame());

  // كلاهما يدخل وضع الغرفة وتبدأ المباراة
  await wait(A, () => !!(DAMA && DAMA.mode === 'room' && DAMA.state && document.getElementById('damaPlay') && !document.getElementById('damaPlay').hidden), 15000);
  await wait(B, () => !!(DAMA && DAMA.mode === 'room' && DAMA.state && document.getElementById('damaPlay') && !document.getElementById('damaPlay').hidden), 15000);

  const humanA = await A.evaluate(() => DAMA.human);
  const humanB = await B.evaluate(() => DAMA.human);
  console.log('colors  host/guest:', humanA, '/', humanB);
  ok('host=WHITE (seat0)', humanA === 'w');
  ok('guest=BLACK (seat1)', humanB === 'b');
  ok('host not spectator', await A.evaluate(() => DAMA.isSpectator === false));
  ok('guest not spectator', await B.evaluate(() => DAMA.isSpectator === false));

  // الرقعة الأولية متطابقة
  let sA = await A.evaluate(boardSnapFn());
  let sB = await B.evaluate(boardSnapFn());
  ok('initial boards equal', sA === sB);
  console.log('  initial sync ✓');

  /* --- حركة 1: المضيف (أبيض) --- */
  const mv1 = await A.evaluate(playMoveFn());
  console.log('  host moves:', mv1);
  await wait(B, () => !!(DAMA && DAMA.state && DAMA.state.moves === 1), 10000);
  sA = await A.evaluate(boardSnapFn());
  sB = await B.evaluate(boardSnapFn());
  ok('after move1 boards equal', sA === sB);
  ok('turn=BLACK after move1', await B.evaluate(() => DAMA.state.turn === 'b'));

  /* --- حركة 2: الضيف (أسود) --- */
  const mv2 = await B.evaluate(playMoveFn());
  console.log('  guest moves:', mv2);
  await wait(A, () => !!(DAMA && DAMA.state && DAMA.state.moves === 2), 10000);
  sA = await A.evaluate(boardSnapFn());
  sB = await B.evaluate(boardSnapFn());
  ok('after move2 boards equal', sA === sB);

  /* --- حركة 3: المضيف (أبيض) مرة أخرى --- */
  const mv3 = await A.evaluate(playMoveFn());
  console.log('  host moves:', mv3);
  await wait(B, () => !!(DAMA && DAMA.state && DAMA.state.moves === 3), 10000);
  sA = await A.evaluate(boardSnapFn());
  sB = await B.evaluate(boardSnapFn());
  ok('after move3 boards equal', sA === sB);

  /* --- استسلام المضيف → الضيف يفوز --- */
  await A.evaluate(() => damaResign());
  await wait(B, () => !!(DAMA && DAMA.state && DAMA.state.over === true), 10000);
  ok('guest sees game over after host resign', await B.evaluate(() => DAMA.state.over === true));
  ok('host sees game over after resign', await A.evaluate(() => DAMA.state.over === true));
  const overModalHiddenA = await A.evaluate(() => document.getElementById('damaOver') ? document.getElementById('damaOver').hidden : true);
  ok('host over modal shown', overModalHiddenA === false);
  // نتيجة الضيف فوز (friendly, لا رهان)
  const overTx = await B.evaluate(() => document.getElementById('damaOverTx') ? document.getElementById('damaOverTx').textContent : '');
  ok('guest declared winner', /فزت|Win|🏆/i.test(overTx));

  /* --- مباراة جديدة (يبدؤها الضيف) --- */
  await B.evaluate(() => damaNewMatch());
  await wait(A, () => !!(DAMA && DAMA.state && DAMA.state.over === false), 10000);
  ok('host board reset after newgame', await A.evaluate(() => DAMA.state.over === false && DAMA.state.moves === 0));
  ok('guest board reset after newgame', await B.evaluate(() => DAMA.state.over === false && DAMA.state.moves === 0));
  sA = await A.evaluate(boardSnapFn());
  sB = await B.evaluate(boardSnapFn());
  ok('newgame boards equal', sA === sB);

  ok('host: no page errors', A._errs.length === 0);
  ok('guest: no page errors', B._errs.length === 0);
  if (A._errs.length) console.log('   host errs:', A._errs);
  if (B._errs.length) console.log('   guest errs:', B._errs);

  await A.close(); await B.close();
  await ctxA.close(); await ctxB.close();

  /* ══════════ الجزء 2: لاعب ضد بوت داخل غرفة (practiceVsAi) ══════════ */
  const ctxC = await browser.newContext();
  const C = await setup(ctxC, 'dama_bot');
  await C.evaluate(() => openGame('dm'));
  await wait(C, () => !!(typeof DAMA !== 'undefined' && DAMA), 10000);
  // افتح غرفة وادخل ضد بوت
  const started = await C.evaluate(async () => {
    try {
      await Rooms.practiceVsAi('dm');
      return true;
    } catch (e) { return 'ERR:' + e.message; }
  }).catch(e => 'THROW:' + e.message);
  console.log('practiceVsAi started:', started);
  // يجب أن ندخل وضع الغرفة ضد بوت وتُلعب لعبة كاملة (البوت يحرّك تلقائياً)
  if (started === true) {
    try {
      await wait(C, () => !!(DAMA && DAMA.mode === 'room' && DAMA.oppBot === true && DAMA.state), 12000);
      ok('practiceVsAi: entered room vs bot', await C.evaluate(() => DAMA.mode === 'room' && DAMA.oppBot === true));
      // ألعب حركة كإنسان ثم أنتظر ردّ البوت
      const meFirst = await C.evaluate(() => DAMA.state.turn === DAMA.human);
      if (meFirst) {
        const mv = await C.evaluate(playMoveFn());
        ok('practiceVsAi: human played move', !!mv);
      }
      // اللعبة قد تنتهي أو تستمر؛ نتأكد فقط ألا توجد أخطاء وأن الوضع ثابت
      await C.waitForTimeout(2500);
      ok('practiceVsAi: no page errors', C._errs.length === 0);
    } catch (e) {
      ok('practiceVsAi: played vs bot', false);
      console.log('   practiceVsAi err:', e.message);
    }
  } else {
    ok('practiceVsAi: entered room vs bot', false);
    console.log('   practiceVsAi start failed:', started);
  }
  await C.close(); await ctxC.close();

  await browser.close();

  // الملخص
  const pass = results.filter(r => r[1]).length;
  const fail = results.filter(r => !r[1]);
  console.log('\n═══ DAMA MP E2E ═══');
  console.log('PASS: ' + pass + '/' + results.length);
  if (fail.length) { console.log('FAILED:'); fail.forEach(r => console.log('  ✗ ' + r[0])); process.exit(1); }
  else console.log('ALL GREEN ✅');
})().catch(e => { console.error('FATAL', e); process.exit(2); });

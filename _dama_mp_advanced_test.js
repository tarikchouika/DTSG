/* اختبار متقدم للضامة الجماعية: سلاسل الأكل المتعددة + ترقية الملك (اللونان)
   + المشاهد (ينضم أثناء الانتظار) + إعادة الاتصال (إعادة بناء من السجل).
   الخادم يرفض انضمام غير الأعضاء لمباراة جارية، لذا ينضم المشاهد قبل البدء. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';

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

function boardSnapFn() {
  return () => {
    if (typeof DAMA === 'undefined' || !DAMA || !DAMA.state) return null;
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
    /* بدون حقل spec حتى يتطابق اللاعب والمشاهد في المقارنة */
    return JSON.stringify({ turn: DAMA.state.turn, moves: DAMA.state.moves, over: DAMA.state.over, board: rows.join('|') });
  };
}

async function softWait(page, fn, timeout, arg) {
  try { return await wait(page, fn, timeout, arg); } catch (e) { return null; }
}

function setBoardFn() {
  return (spec) => {
    if (typeof DAMA === 'undefined' || !DAMA || !DAMA.eng) return false;
    const grid = [];
    for (let r = 0; r < 8; r++) grid.push([null, null, null, null, null, null, null, null]);
    (spec.pieces || []).forEach(function (p) { grid[p.r][p.c] = { owner: p.owner, king: !!p.king, id: p.r * 8 + p.c }; });
    DAMA.state = { grid: grid, turn: spec.turn, cont: null, half: 0, moves: spec.moves || 0, over: false, outcome: null };
    DAMA.sel = null; DAMA.legal = [];
    damaRender();
    return true;
  };
}

function execChainFn() {
  return () => {
    if (!DAMA || !DAMA.state) return -1;
    var caps = DAMA.eng.legalMoves(DAMA.state, DAMA.state.turn).filter(function (m) { return m.cap; });
    if (!caps.length) return 0;
    damaHumanMove(caps[0]); var hops = 1;
    var guard = 0;
    while (DAMA.state.cont && guard++ < 20) {
      var more = DAMA.eng.capturesAt(DAMA.state.grid, DAMA.state.cont[0], DAMA.state.cont[1]);
      if (!more.length) break;
      damaHumanMove(more[0]); hops++;
    }
    return hops;
  };
}

function playQuietFn() {
  return () => {
    if (!DAMA || !DAMA.state || DAMA.state.over || DAMA.isSpectator) return null;
    if (DAMA.state.turn !== DAMA.human) return null;
    const all = DAMA.eng.legalMoves(DAMA.state, DAMA.state.turn);
    const simple = all.filter(m => !m.cap);
    if (!simple.length) return null;
    damaHumanMove(simple[0]);
    return JSON.stringify(simple[0].from);
  };
}

async function setup(ctx, username) {
  const rr = await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } });
  const rj = (await rr.json().catch(() => ({}))) || {};
  if (!rj.ok) await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && Rooms.joinSse), 15000);
  await page.waitForTimeout(700);
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? '  ✓ ' : '  ✗ ') + name); };

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const A = await setup(ctxA, 'dama_adv_host');
  const B = await setup(ctxB, 'dama_adv_guest');
  const C = await setup(ctxC, 'dama_spec');

  for (const p of [A, B, C]) await p.evaluate(() => openGame('dm'));
  await wait(A, () => !!(typeof DAMA !== 'undefined' && typeof window.damaRoomMove === 'function'), 10000);
  await wait(B, () => !!(typeof DAMA !== 'undefined' && typeof window.damaRoomMove === 'function'), 10000);
  await wait(C, () => !!(typeof DAMA !== 'undefined' && typeof window.damaRoomMove === 'function'), 10000);

  await A.evaluate(() => Rooms.createRoom('dm', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((cc) => Rooms.joinRoom(cc), code);                 /* لاعب seat1 */
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 2), 8000);
  await C.evaluate((cc) => Rooms.joinRoom(cc), code);                 /* مشاهد (المقاعد ممتلئة) */
  await wait(A, () => !!(Rooms.state && Rooms.state.players.length >= 3), 8000);
  await wait(C, () => !!(Rooms.state && Rooms.state.players.some(function (p) { return p.spectate; })), 8000);
  console.log('room', code, '| players:', await A.evaluate(() => Rooms.state.players.map(p => p.username + (p.spectate ? '(spec)' : '')).join(', ')));

  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);
  await A.evaluate(() => Rooms.startGame());

  await wait(A, () => !!(DAMA && DAMA.mode === 'room' && DAMA.state), 15000);
  await wait(B, () => !!(DAMA && DAMA.mode === 'room' && DAMA.state), 15000);
  await wait(C, () => !!(DAMA && DAMA.mode === 'room' && DAMA.isSpectator === true && DAMA.state), 15000);
  ok('host in room mode (player)', await A.evaluate(() => DAMA.human === 'w'));
  ok('guest in room mode (player)', await B.evaluate(() => DAMA.human === 'b'));
  ok('spectator in room mode', await C.evaluate(() => DAMA.isSpectator === true && DAMA.human === null));
  console.log('all 3 entered room ✓');

  /* 3 حركات هادئة مُبثّة */
  await A.evaluate(playQuietFn());
  await wait(B, () => !!(DAMA && DAMA.state && DAMA.state.moves === 1), 10000);
  await wait(C, () => !!(DAMA && DAMA.state && DAMA.state.moves === 1), 10000);
  await B.evaluate(playQuietFn());
  await wait(A, () => !!(DAMA && DAMA.state && DAMA.state.moves === 2), 10000);
  await wait(C, () => !!(DAMA && DAMA.state && DAMA.state.moves === 2), 10000);
  await A.evaluate(playQuietFn());
  await wait(B, () => !!(DAMA && DAMA.state && DAMA.state.moves === 3), 10000);
  await wait(C, () => !!(DAMA && DAMA.state && DAMA.state.moves === 3), 10000);

  let sA = await A.evaluate(boardSnapFn());
  let sB = await B.evaluate(boardSnapFn());
  let sC = await C.evaluate(boardSnapFn());
  ok('3-way sync after 3 moves', sA === sB && sB === sC);
  console.log('3-way quiet sync ✓');

  /* ══════ (D) إعادة اتصال المضيف: إعادة بناء من السجل ══════ */
  const beforeSnap = await A.evaluate(boardSnapFn());
  await A.reload({ waitUntil: 'domcontentloaded' });
  await wait(A, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await wait(A, () => !!(Rooms.state && Rooms.state.game_id === 'dm' && Rooms.state.status === 'playing'), 10000);
  await A.evaluate(() => openGame('dm'));
  await wait(A, () => !!(DAMA && DAMA.mode === 'room' && DAMA.state), 15000);
  let reconSnap = null;
  try {
    reconSnap = await wait(A, boardSnapFn(), 10000);
  } catch (e) {}
  const guestSnap = await B.evaluate(boardSnapFn());
  console.log('reconnect: before==', beforeSnap, '| recon==', reconSnap, '| guest==', guestSnap);
  ok('reconnect: board reconstructed === guest', reconSnap !== null && reconSnap === guestSnap);
  ok('reconnect: host is WHITE again', await A.evaluate(() => DAMA && DAMA.human === 'w'));

  /* ══════ (A) سلسلة أكل مزدوجة + ترقية ملك أبيض ══════ */
  const whiteChain = { turn: 'w', pieces: [
    { r: 4, c: 4, owner: 'w' }, { r: 3, c: 3, owner: 'b' },
    { r: 1, c: 1, owner: 'b' }, { r: 2, c: 6, owner: 'b' }
  ]};
  await A.evaluate(setBoardFn(), whiteChain);
  await B.evaluate(setBoardFn(), whiteChain);
  await C.evaluate(setBoardFn(), whiteChain);
  const hops = await A.evaluate(execChainFn());
  console.log('white capture chain hops:', hops);
  ok('white chain = 2 hops', hops === 2);
  await softWait(B, () => { try { return (DAMA && DAMA.state && !DAMA.state.cont && DAMA.state.turn === 'b') ? '1' : null; } catch (e) { return null; } }, 10000);
  await softWait(C, () => { try { return (DAMA && DAMA.state && !DAMA.state.cont && DAMA.state.turn === 'b') ? '1' : null; } catch (e) { return null; } }, 10000);
  const wH = await A.evaluate(boardSnapFn());
  const wG = await B.evaluate(boardSnapFn());
  const wSp = await C.evaluate(boardSnapFn());
  console.log('white chain  H:', wH);
  ok('white chain: host===guest', wH === wG);
  ok('white chain: host===spectator', wH === wSp);
  ok('white king promoted (wK)', wH.indexOf('wK') >= 0);
  ok('white chain: turn→BLACK', await B.evaluate(() => DAMA.state.turn === 'b'));
  ok('white chain: only 1 black remains', await A.evaluate(() => { var n = 0; for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) { var p = DAMA.state.grid[r][c]; if (p && p.owner === 'b') n++; } return n === 1; }));

  /* ══════ (B) أكل أسود + ترقية ملك أسود ══════ */
  const blackCap = { turn: 'b', pieces: [
    { r: 5, c: 2, owner: 'b' }, { r: 6, c: 3, owner: 'w' }, { r: 1, c: 6, owner: 'w' }
  ]};
  await A.evaluate(setBoardFn(), blackCap);
  await B.evaluate(setBoardFn(), blackCap);
  await C.evaluate(setBoardFn(), blackCap);
  const bhops = await B.evaluate(execChainFn());
  console.log('black capture hops:', bhops);
  ok('black cap = 1 hop', bhops === 1);
  await softWait(A, () => { try { return (DAMA && DAMA.state && !DAMA.state.cont && DAMA.state.turn === 'w') ? '1' : null; } catch (e) { return null; } }, 10000);
  await softWait(C, () => { try { return (DAMA && DAMA.state && !DAMA.state.cont && DAMA.state.turn === 'w') ? '1' : null; } catch (e) { return null; } }, 10000);
  const bH = await A.evaluate(boardSnapFn());
  const bG = await B.evaluate(boardSnapFn());
  const bSp = await C.evaluate(boardSnapFn());
  console.log('black cap  G:', bG);
  ok('black cap: guest===host', bG === bH);
  ok('black cap: guest===spectator', bG === bSp);
  ok('black king promoted (bK)', bG.indexOf('bK') >= 0);
  ok('black cap: turn→WHITE', await A.evaluate(() => DAMA.state.turn === 'w'));

  ok('host: no page errors', A._errs.length === 0);
  ok('guest: no page errors', B._errs.length === 0);
  ok('spectator: no page errors', C._errs.length === 0);
  if (A._errs.length) console.log('   host errs:', A._errs);
  if (B._errs.length) console.log('   guest errs:', B._errs);
  if (C._errs.length) console.log('   spec errs:', C._errs);

  await A.close(); await B.close(); await C.close();
  await ctxA.close(); await ctxB.close(); await ctxC.close();
  await browser.close();

  const pass = results.filter(r => r[1]).length;
  const fail = results.filter(r => !r[1]);
  console.log('\n═══ DAMA MP ADVANCED ═══');
  console.log('PASS: ' + pass + '/' + results.length);
  if (fail.length) { console.log('FAILED:'); fail.forEach(r => console.log('  ✗ ' + r[0])); process.exit(1); }
  else console.log('ALL GREEN ✅');
})().catch(e => { console.error('FATAL', e); process.exit(2); });

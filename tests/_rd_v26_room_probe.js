/* ═══════════════════════════════════════════════════════════════════
   RD v2.6 — الغرف: خيارات «جولة» + المؤقت + بوابة نهاية الجولة (تصويت)
   1) خانة إعدادات الغرفة للروندا: الهدف يشمل «جولة(40)» والافتراضي 51؛
      المؤقت 30–300 ث افتراضياً 60؛ المقاعد 2 أو 4.
   2) غرفة 1ضد1 بهدف «جولة» ومؤقت 30 ث: يتطابق الجميع (grace=30000،
      الهدف «جولة»، جولة واحدة) وتنتهي المباراة تلقائياً بعد الـ40 ورقة
      بلا نافذة نتائج معلّقة — الإعلان متطابق بين المضيف والضيف.
   3) غرفة 2ضد2 هدف 41: عند نهاية الجولة تظهر نافذة النتائج، تصويت
      الجالسين البشريين («الجولة التالية») يمرر فوراً للجولة 2 (لا انتظار
      الـ20 ثانية)، والحالة تبقى متطابقة.
   التشغيل:  node tests/_rd_v26_room_probe.js   (الخادم 4173 DM_TEST_MODE=1)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const PW = require('./_rd_pw.js');
const BASE = PW.BASE;
let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + '  ← CONDITION FAILED'); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wait(page, fn, timeout) {
  timeout = timeout || 15000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn); if (r) return r; } catch (e) { /* ignore */ }
    await page.waitForTimeout(180);
  }
  return null;
}

const pubState = () => {
  const app = window.RondaApp;
  if (!app || !app.game) return null;
  const st = app.game.state;
  return {
    mode: st.mode, round: st.roundNumber, deal: st.dealNumber,
    currentSeat: st.currentSeat, deck: st.deck.length,
    scores: st.teams.map(t => t.score),
    phase: st.phase, handCounts: st.players.map(p => p.hand.length)
  };
};

async function setup(ctx, username) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/i.test(m.text())) errs.push(m.text()); });
  page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined' && typeof RondaApp !== 'undefined'), 20000);
  await page.waitForTimeout(700);
  return page;
}

(async () => {
  const browser = await PW.launchBrowser();
  const stamp = Date.now() % 1000000;
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await setup(ctxA, 'rd26a_' + stamp);
  await A.evaluate(() => openGame('rd'));
  await wait(A, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);

  // ── 1) خيارات إعدادات غرفة الروندا ──
  const defs = await A.evaluate(() => {
    Rooms._renderGameOpts('rd');
    const read = function (key) {
      const el = document.getElementById('rsOpt_' + key);
      if (!el) return null;
      return { opts: [...el.options].map(o => ({ v: o.value, t: o.text })), sel: el.value };
    };
    return {
      maxp: read('maxp'), target: read('target'), timer: read('timer')
    };
  });
  ok('rd room: seats option 2/4', defs.maxp && defs.maxp.opts.map(o => o.v).join(',') === '2,4');
  const tv = defs.target ? defs.target.opts.map(o => o.v) : [];
  ok('rd room: target includes round/41/51/61', JSON.stringify(tv) === JSON.stringify(['round', '41', '51', '61']));
  ok('rd room: default target 51, round label mentions 40',
     defs.target && defs.target.sel === '51' && /40/.test(defs.target.opts[0].t));
  const tm = defs.timer ? defs.timer.opts.map(o => Number(o.v)) : [];
  ok('rd room: timer presets 30–300, default 60',
     defs.timer && defs.timer.sel === '60' &&
     JSON.stringify(tm) === JSON.stringify([30, 60, 90, 120, 180, 300]));

  // ── 2) غرفة 1ضد1 بهدف «جولة» + مؤقت 30 ث ──
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const B = await setup(ctxB, 'rd26b_' + stamp);
  await B.evaluate(() => openGame('rd'));
  await wait(B, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
  const opts = { maxp: 2, target: 'round', timer: 30 };
  await A.evaluate((o) => {
    Rooms.createRoom('rd', { room_type: 'percentage', bet: 10, visibility: 'public', game_opts: o, max_players: 2 });
    if (Rooms._applyGameOpts) Rooms._applyGameOpts('rd', o);   /* يضبط window.RD_ROOM_CFG محلياً */
  }, opts);
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  const seated2 = await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).length >= 2), 30000);
  if (!seated2) {
    const dbg = await A.evaluate(() => Rooms.state ? Rooms.state.players.map(p => p.username + (p.spectate ? '^s' : '')).join(',') : 'no-room');
    console.log('     [diag] A did not see 2 seated within 30 s — players: ' + dbg);
  }
  ok('round-target room ready (2 players)', !!seated2);
  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 15000);
  await A.evaluate(() => Rooms.startGame());
  const built = await wait(A, () => !!(window.RondaApp && RondaApp.roomMode && RondaApp.game &&
    RondaApp.game.state.players.length === 2 && window.RD_ROOM_AI_GRACE), 20000);
  await wait(B, () => !!(window.RondaApp && RondaApp.roomMode && RondaApp.game && RondaApp.game.state.players.length === 2), 30000);
  ok('both clients built the 2p room engine', !!built);
  const cfgA = await A.evaluate(() => ({
    grace: window.RD_ROOM_AI_GRACE, mode: RondaApp.game.state.mode,
    target: RondaApp.game.state.targetScore,
    hud: (document.getElementById('hud-target') || {}).textContent || '',
    round: RondaApp.game.state.roundNumber
  }));
  const cfgB = await B.evaluate(() => ({
    grace: window.RD_ROOM_AI_GRACE, hud: (document.getElementById('hud-target') || {}).textContent || ''
  }));
  ok('timer 30 s applied on both (grace 30000): ' + cfgA.grace + ' / ' + cfgB.grace,
     cfgA.grace === 30000 && cfgB.grace === 30000);
  ok('engine single-round (targetScore 9999) + HUD «جولة» on both: ' + cfgA.hud,
     cfgA.mode === 'HeadToHead' && cfgA.target === 9999 &&
     cfgA.hud === cfgB.hud && cfgA.hud !== '51');

  // قيادة ذاتية: يتولى المضيف كل المقاعد بعد مهلة قصيرة (لا نقرات بشرية)
  await A.evaluate(() => { window.RD_ROOM_AI_GRACE = 500; });
  const agree = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ended = await wait(A, () => {
    const m = document.getElementById('overlay-match');
    return (m && !m.classList.contains('rd-hidden')) ? { kind: 'match' } : false;
  }, 180000);
  if (ended) ok('round-target room match ended automatically after the full round', true);
  else { const d = await A.evaluate(pubState); bad('room round-target match did not end — state ' + JSON.stringify(d)); }
  const sAend = await A.evaluate(pubState);
  const sBend = await B.evaluate(pubState);
  ok('identical public state at room end (round ' + (sAend && sAend.round) + ')', agree(sAend, sBend) && sAend && sAend.round === 1);
  const endOver = await wait(B, () => {
    const m = document.getElementById('overlay-match');
    return !!(m && !m.classList.contains('rd-hidden'));
  }, 15000);
  ok('guest shows the winner modal too (no round-results stall)', !!endOver);
  for (const [name, p] of [['host', A], ['guest', B]]) {
    ok(name + ': zero console errors', p._errs.length === 0);
    if (p._errs.length) console.log('     errors: ' + p._errs.slice(0, 3).join(' | '));
  }

  // ── 3) بوابة نهاية الجولة في غرفة 2ضد2 هدف 41: تصويت البشر يمرر فوراً ──
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const C = await setup(ctxC, 'rd26c_' + stamp);
  const D = await setup(ctxD, 'rd26d_' + stamp);
  for (const p of [C, D]) {
    await p.evaluate(() => openGame('rd'));
    await wait(p, () => !!document.querySelector('#rdStage #screen-menu.active'), 8000);
  }
  const opts41 = { maxp: 4, target: 41, timer: 30 };
  await C.evaluate((o) => {
    Rooms.createRoom('rd', { room_type: 'percentage', bet: 10, visibility: 'public', game_opts: o, max_players: 4 });
    if (Rooms._applyGameOpts) Rooms._applyGameOpts('rd', o);
  }, opts41);
  await wait(C, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code2 = await C.evaluate(() => Rooms.state.code);
  await D.evaluate((c) => Rooms.joinRoom(c), code2);
  await wait(C, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).length >= 2), 8000);
  await C.evaluate(() => Rooms.addBot());
  await C.waitForTimeout(500);
  await C.evaluate(() => Rooms.addBot());
  const seated4 = await wait(C, () => !!(Rooms.state && Rooms.state.players.length === 4), 30000);
  if (!seated4) {
    const dbg = await C.evaluate(() => Rooms.state ? Rooms.state.players.map(p => p.username + (p.spectate ? '^s' : '')).join(',') : 'no-room');
    console.log('     [diag] C did not see 4 in room within 30 s — players: ' + dbg);
  }
  ok('2v2 gate room ready (2 humans + 2 bots)', !!seated4);
  await C.evaluate(() => Rooms.setReady(true));
  await D.evaluate(() => Rooms.setReady(true));
  await wait(C, () => !!(Rooms.state && Rooms.state.players.every(p => p.ready)), 15000);
  await C.evaluate(() => Rooms.startGame());
  const builtC = await wait(C, () => !!(window.RondaApp && RondaApp.roomMode && RondaApp.game && RondaApp.game.state.players.length === 4), 30000);
  const builtD = await wait(D, () => !!(window.RondaApp && RondaApp.roomMode && RondaApp.game && RondaApp.game.state.players.length === 4), 30000);
  if (!builtC || !builtD) {
    console.log('     [diag] built C=' + !!builtC + ' D=' + !!builtD);
  }
  ok('2v2 gate room engine built on both', !!builtC && !!builtD);
  await C.evaluate(() => { window.RD_ROOM_AI_GRACE = 500; });

  // الانتظار حتى نافذة نتائج الجولة (لا مباراة — الهدف 41 بعيد بعد جولة أولى)
  const gateShown = await wait(C, () => {
    const r = document.getElementById('overlay-round');
    const m = document.getElementById('overlay-match');
    if (r && !r.classList.contains('rd-hidden')) return { kind: 'round' };
    if (m && !m.classList.contains('rd-hidden')) return { kind: 'match' };
    return false;
  }, 240000);
  if (gateShown && gateShown.kind === 'round') {
    ok('round-results overlay shown after round 1 (gate)', true);
    const hint = await C.$eval('#rdStage #round-auto-hint', el => el.textContent.trim()).catch(() => '');
    ok('round-auto hint visible: ' + hint.slice(0, 60), hint.length > 0);
    await wait(D, () => {
      const r = document.getElementById('overlay-round');
      return !!(r && !r.classList.contains('rd-hidden'));
    }, 15000);
    /* تصويت الجالسين البشريين فقط — بوتات لا تصوّت */
    await C.click('#rdStage #btn-next-round').catch(() => {});
    await D.click('#rdStage #btn-next-round').catch(() => {});
    const round2 = await wait(C, () => {
      const hr = document.getElementById('hud-round');
      const ov = document.getElementById('overlay-round');
      return (hr && hr.textContent.trim() === '2' && ov && ov.classList.contains('rd-hidden')) ? true : false;
    }, 30000);
    ok('round 2 started right after both humans voted', !!round2);
    await C.waitForTimeout(1500);
    const sC = await C.evaluate(pubState);
    const sD = await D.evaluate(pubState);
    ok('state still in sync in round 2', agree(sC, sD));
    for (const [name, p] of [['hostC', C], ['guestD', D]]) {
      ok(name + ': zero console errors', p._errs.length === 0);
      if (p._errs.length) console.log('     errors: ' + p._errs.slice(0, 3).join(' | '));
    }
  } else {
    const d = await C.evaluate(pubState);
    bad('expected round gate but got ' + (gateShown ? gateShown.kind : 'nothing') + ' — state ' + JSON.stringify(d));
  }

  await browser.close();
  console.log('\n═══ RD v2.6 room probe: ' + pass + ' passed, ' + fail + ' failed ═══');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('PROBE CRASH:', e); process.exit(2); });

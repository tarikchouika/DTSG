process.chdir(require('path').resolve(__dirname, '..'));
/* [v2.63 Room E2E] مباراة بينالتي كاملة في غرفة وجهاً لوجه:
   لاعبان + متفرج · رهان 100 يُخصم عند البدء · 3 جولات اختيار أعمى ·
   شريطا النتائج · رقاقة رهان الجولة (200) · أيقونة متفرج ·
   التسوية الختامية: الفائز يأخذ 195 (200 − رسم 5) والخاسر يبقى منزوعاً.
   تشغيل: DM_TEST_MODE=1 · node tests/_v263_room_test.js */
'use strict';
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t, label) {
  const s = Date.now(); let e;
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn); if (r) return r; } catch (x) { e = x; }
    await p.waitForTimeout(200);
  }
  throw new Error('timeout [' + label + '] ' + (e ? e.message : ''));
}
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

(async () => {
  const tag = Date.now().toString().slice(-6);
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  async function mkPlayer(name, vp) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.request.post(BASE + 'api/register', { data: { username: name + tag, password: 'pw123456' } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 90)));
    p._er = errs;
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'), 10000, name + ' auth');
    return p;
  }

  console.log('═══ 1) إنشاء الغرفة والانضمام ═══');
  const A = await mkPlayer('pnrA', { width: 390, height: 780, isMobile: true, hasTouch: true });
  const B = await mkPlayer('pnrB', { width: 390, height: 780, isMobile: true, hasTouch: true });
  await A.evaluate(() => openGame('pn'));
  await wait(A, () => !!(document.getElementById('gamePageBody') && document.querySelector('.pn-fs')), 10000, 'A pn');
  await A.evaluate(() => Rooms.createRoom('pn', { bet: 100, visibility: 'public', game_opts: { rounds: 3 } }));
  await sleep(700);
  const code = await A.evaluate(() => (Rooms.state && Rooms.state.code) || null);
  ok(!!code, 'host created pn room with bet 100 (code ' + code + ')');
  await B.evaluate(() => openGame('pn'));
  await wait(B, () => !!(document.getElementById('gamePageBody') && document.querySelector('.pn-fs')), 10000, 'B pn');
  await B.evaluate((c) => Rooms.joinRoom(c), code);
  await sleep(900);

  /* متفرج ثالث */
  const C = await mkPlayer('pnrC', { width: 390, height: 780, isMobile: true, hasTouch: true });
  await C.evaluate(() => openGame('pn'));
  await wait(C, () => !!(document.getElementById('gamePageBody') && document.querySelector('.pn-fs')), 10000, 'C pn');
  await C.evaluate((c) => Rooms.joinRoom(c), code);
  await sleep(900);

  /* رقاقة رهان الجولة + متفرجون على شاشة المضيف */
  const topA = await A.evaluate(() => {
    const bet = document.getElementById('pnBet');
    const specs = document.getElementById('pnSpecs');
    return { bet: bet ? bet.textContent : '', specN: specs ? specs.textContent.trim() : '' };
  });
  ok(/200/.test(topA.bet), 'round-bet chip shows pot 2×100 = 200: "' + topA.bet + '"');
  ok(/1/.test(topA.specN), 'spectator count visible in top bar: "' + topA.specN + '"');

  console.log('═══ 2) الاستعداد والبدء (خصم الرهان) ═══');
  const goldBefore = await A.evaluate(() => ({ a: ST.gold, id: AUTH.user.id }));
  const goldBeforeB = await B.evaluate(() => ST.gold);
  await A.evaluate(() => API.post('/api/rooms/ready', { room_id: Rooms.state.id, ready: true }));
  await B.evaluate(() => API.post('/api/rooms/ready', { room_id: Rooms.state.id, ready: true }));
  await sleep(500);
  await A.evaluate(() => API.post('/api/rooms/start', { room_id: Rooms.state.id }));
  await wait(A, () => (typeof pnRoom !== 'undefined' && typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.status === 'playing') ? true : false, 10000, 'A playing');
  await wait(B, () => (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.status === 'playing') ? true : false, 10000, 'B playing');
  ok(true, 'match started (both pages playing)');
  await sleep(900);
  const turnA0 = await A.evaluate(() => document.getElementById('pnTurn').textContent);
  ok(/⚽/.test(turnA0), 'A (seat 0) sees attacker turn: "' + turnA0.slice(0, 40) + '..."');

  console.log('═══ 3) ثلاث جولات اختيار أعمى ═══');
  /* الجولة 1: A يهاجم — A يسدد ⬆️ وB يتصدّى ➡️ (مختلف = هدف) */
  await A.evaluate(() => penShoot('⬆️'));
  await sleep(250);
  await B.evaluate(() => penShoot('➡️'));
  const w1 = await wait(A, () => {
    const t = document.getElementById('pnTurn');
    return t && /⚽|⏳/.test(t.textContent) && document.querySelectorAll('#pnSeqMe .pn-tok:not(.empty)').length >= 1 ? true : false;
  }, 15000, 'round1 settle');
  ok(!!w1, 'round 1 settled on A (blind pair revealed)');
  const r1 = await A.evaluate(() => ({
    banner: document.getElementById('pnBanner').textContent,
    seq: document.querySelectorAll('#pnSeqMe .pn-tok:not(.empty)').length,
    sc: document.getElementById('pnScMe').textContent
  }));
  ok(/هدف/.test(r1.banner), 'round 1: GOAL banner (different zones)');
  ok(r1.seq === 1 && r1.sc === '1', 'A result bar: 1 token ✔ + score 1');
  await sleep(2600);

  /* الجولة 2: B يهاجم — B يسدد 🎯 وA يتصدّى 🎯 (نفس المنطقة = تصدي) */
  await B.evaluate(() => penShoot('🎯'));
  await sleep(250);
  await A.evaluate(() => penShoot('🎯'));
  await wait(A, () => {
    const t = document.getElementById('pnTurn');
    return t && /🧤|⚽|⏳/.test(t.textContent) && (window.pnRoom ? pnRoom.round >= 3 : false) ? true : false;
  }, 15000, 'round2 settle');
  const r2 = await B.evaluate(() => ({
    seqB: document.querySelectorAll('#pnSeqOpp .pn-tok:not(.empty)').length,
    banner: document.getElementById('pnBanner').textContent
  }));
  ok(/تصدي/.test(r2.banner), 'round 2: SAVE banner (same zone) on B screen');
  ok(r2.seqB === 1, 'B shot history: 1 token ✕ in bar');
  await sleep(2600);

  /* الجولة 3: A يهاجم — A يسدد ↗️ وB يتصدّى ⬇️ (مختلف = هدف) */
  await A.evaluate(() => penShoot('↗️'));
  await sleep(250);
  await B.evaluate(() => penShoot('⬇️'));
  await wait(A, () => {
    const t = document.getElementById('pnTurn');
    return t && (t.textContent.indexOf('🏆') >= 0 || t.textContent.indexOf('مباراة') >= 0 || t.textContent.indexOf('المباراة') >= 0 || pnRoom.round >= 4) ? true : false;
  }, 20000, 'match end');

  console.log('═══ 4) التسوية: الفائز يأخذ القدح بعد رسم 5% ═══');
  await sleep(2500);
  const goldA = await A.evaluate(() => ST.gold);
  const goldB = await B.evaluate(() => ST.gold);
  const finalA = await A.evaluate(() => document.getElementById('pnTurn').textContent);
  ok(/🏆|فزت/.test(finalA), 'A sees match-win message: "' + finalA.slice(0, 50) + '..."');
  /* A سجل هدفين (ج1+ج3) وB صفر → A فاز: خصم 100 + 195 = +95 صافياً */
  const deltaA = goldA - goldBefore.a;
  const deltaB = goldB - goldBeforeB;
  ok(deltaA === 95, 'host (winner) net +95 (=-100 stake +195 pot after 5% fee): ' + deltaA);
  ok(deltaB === -100, 'opponent (loser) net -100: ' + deltaB);

  console.log('═══ 5) صفر أخطاء JS ═══');
  const erA = A._er.filter(e => !/favicon|net::ERR|404|Failed to load resource/i.test(e));
  const erB = B._er.filter(e => !/favicon|net::ERR|404|Failed to load resource/i.test(e));
  ok(erA.length === 0 && erB.length === 0, 'zero JS errors on both pages (' + (erA.length + erB.length) + ')' + ((erA.length || erB.length) ? ' → ' + erA.concat(erB).slice(0, 2).join(' | ') : ''));

  console.log('\\n═══ النتيجة: ' + pass + ' ✅ / ' + fail + ' ❌ ═══');
  if (fail) console.log('FAILURES:', fails);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

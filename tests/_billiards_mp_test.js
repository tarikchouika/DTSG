/* بلياردو أونلاين (المرحلة 6): غرف Rooms + بث وصف الضربة + تسوية الرهان.
   نمط _parchisi_mp_test.js: أزواج سياقات منفصلة، مزامنة حالة بعد 20 ضربة. */
'use strict';
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';

let pass = 0, fail = 0;
const ok = (m, c) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sec = t => console.log('\n── ' + t + ' ──');

async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) {}
    await page.waitForTimeout(200);
  }
  return null;
}
async function setup(ctx, username) {
  await ctx.request.post(BASE + 'api/register', { data: { username, password: 'pw123456' } }).catch(() => {});
  await ctx.request.post(BASE + 'api/login', { data: { username, password: 'pw123456' } }).catch(() => {});
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page._errs = errs;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'), 15000);
  await page.waitForTimeout(400);
  return page;
}
/* بصمة الحالة للمزامنة بين العملاء */
const HASH = `(() => {
  const G = BILLIARDS && BILLIARDS.G; if (!G) return null;
  const S = G.S;
  return JSON.stringify({
    n: S.history.length, act: S.active, ph: S.phase, sc: S.scores, po: S.pocketOrder,
    op: S.open, gr: S.groups || null,
    balls: S.balls.map(b => [b.id, b.status, Math.round(b.x * 100) / 100, Math.round(b.y * 100) / 100])
  });
})()`;

const SHOTS = [[0.4, 70], [-0.6, 60], [1.2, 55], [2.4, 65], [0.9, 50], [-1.2, 60], [1.8, 70], [0.2, 45],
  [-0.3, 55], [2.9, 60], [0.7, 50], [-2.2, 65], [1.5, 55], [0.1, 40], [-1.7, 60], [2.1, 50], [0.55, 65],
  [-0.9, 55], [1.1, 45], [2.7, 60]];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const uniq = Date.now() % 100000;

  /* ═══ 1) مزامنة 20 ضربة + متفرج (bl8) ═══ */
  sec('1) غرفة 8-بول: مزامنة 20 ضربة');
  const A = await setup(await browser.newContext(), 'bl_h_' + uniq);
  const ctxB = await browser.newContext();
  const B = await setup(ctxB, 'bl_g_' + uniq);
  const C = await setup(await browser.newContext(), 'bl_s_' + uniq);
  for (const p of [A, B, C]) await p.evaluate(() => openGame('bl8'));
  for (const p of [A, B, C]) await wait(p, () => !!(typeof BILLIARDS !== 'undefined' && BILLIARDS), 8000);

  await A.evaluate(() => Rooms.createRoom('bl8', 10));
  await wait(A, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code = await A.evaluate(() => Rooms.state.code);
  ok('أُنشئت الغرفة برمز', !!code);
  await B.evaluate(c => Rooms.joinRoom(c), code);
  await C.evaluate(c => Rooms.joinRoom(c), code);
  await wait(B, () => !!(Rooms.state && Rooms.state.status), 8000);

  await A.evaluate(() => Rooms.setReady(true));
  await B.evaluate(() => Rooms.setReady(true));
  await wait(A, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);
  await A.evaluate(() => Rooms.startGame());

  const started = p => wait(p, () => !!(BILLIARDS && BILLIARDS.G && BILLIARDS.mode === 'room' && BILLIARDS.G.S.phase === 'AIM'), 12000);
  ok('بدأ المحرك عند المُنشئ والضيف والمتفرج', !!(await started(A)) && !!(await started(B)) && !!(await started(C)));

  const seats = await A.evaluate(() => ({ a: BILLIARDS.mySeat, spec: BILLIARDS.isSpectator }));
  const seatsB = await B.evaluate(() => ({ b: BILLIARDS.mySeat, spec: BILLIARDS.isSpectator }));
  const seatsC = await C.evaluate(() => ({ c: BILLIARDS.mySeat, spec: BILLIARDS.isSpectator }));
  ok('مقاعد: A=0 وB=1 وC متفرج', seats.a === 0 && seatsB.b === 1 && !seats.spec && !seatsB.spec && seatsC.spec === true);

  /* المتفرج لا يستطيع الضرب */
  await C.evaluate(() => billiardsShoot());
  ok('المتفرج لا يضرب', (await C.evaluate(() => BILLIARDS.G.S.history.length)) === 0);

  /* الضيف لا يضرب في دور المُنشئ */
  await B.evaluate(() => { BILLIARDS.aim = 0.4; billiardsShoot(); });
  ok('الضيف ممنوع في غير دوره', (await B.evaluate(() => BILLIARDS.G.S.history.length)) === 0);

  /* 20 ضربة متبادلة مع مقارنة البصمة بعد كل ضربة */
  let synced = true, lastErr = '';
  for (let i = 0; i < SHOTS.length; i++) {
    const who = await wait(A, () => {
      const S = BILLIARDS.G.S;
      if (S.frameOver) return 'over';
      return (S.active === BILLIARDS.mySeat) ? 'A' : 'B';
    }, 8000);
    if (!who || who === 'over') break;
    const P = who === 'A' ? A : B;
    /* إن كانت كرة يد (PLACE) ضعها أولاً */
    await P.evaluate(() => {
      if (BILLIARDS.G.S.phase !== 'PLACE') return;
      for (let x = 60; x < 940; x += 25) for (let y = 40; y < 470; y += 25)
        if (BILLIARDS.G.validPlace(x, y)) { billiardsPlace(x, y); return; }
    });
    await P.evaluate(s => { BILLIARDS.aim = s[0]; document.getElementById('blPower').value = s[1]; billiardsPowerUi(); billiardsShoot(); }, SHOTS[i]);
    const got = await wait(A, n => (BILLIARDS.G.S.history.length >= n) ? true : null, 10000, i + 1) &&
                await wait(B, n => (BILLIARDS.G.S.history.length >= n) ? true : null, 10000, i + 1);
    if (!got) { synced = false; lastErr = 'timeout shot ' + (i + 1); break; }
    const [ha, hb] = [await A.evaluate(HASH), await B.evaluate(HASH)];
    if (ha !== hb) { synced = false; lastErr = 'diverge shot ' + (i + 1); break; }
  }
  ok('20 ضربة: وصول وبصمة متطابقة بعد كل ضربة' + (lastErr ? ' [' + lastErr + ']' : ''), synced);
  const hc = await C.evaluate(HASH);
  const ha2 = await A.evaluate(HASH);
  ok('بصمة المتفرج مطابقة أيضاً', hc === ha2);
  ok('سجلّ الضربات = 20 عند الجميع', (await A.evaluate(() => BILLIARDS.G.S.history.length)) === 20);

  /* ═══ 2) تسوية الرهان (غرفة جديدة برهان 10) ═══ */
  sec('2) تسوية الرهان عند الاستسلام');
  const D = await setup(await browser.newContext(), 'bl_h2_' + uniq);
  const E = await setup(await browser.newContext(), 'bl_g2_' + uniq);
  await D.evaluate(() => openGame('bl8'));
  await E.evaluate(() => openGame('bl8'));
  await wait(D, () => !!BILLIARDS, 8000); await wait(E, () => !!BILLIARDS, 8000);
  await D.evaluate(() => Rooms.createRoom('bl8', 10));
  await wait(D, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code2 = await D.evaluate(() => Rooms.state.code);
  await E.evaluate(c => Rooms.joinRoom(c), code2);
  await wait(E, () => !!(Rooms.state && Rooms.state.status), 8000);
  await D.evaluate(() => Rooms.setReady(true));
  await E.evaluate(() => Rooms.setReady(true));
  await wait(D, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);

  const goldD0 = await D.evaluate(() => ST.gold), goldE0 = await E.evaluate(() => ST.gold);
  await D.evaluate(() => Rooms.startGame());
  await started(D); await started(E);
  const goldD1 = await D.evaluate(() => ST.gold), goldE1 = await E.evaluate(() => ST.gold);
  ok('خُصم الرهان 10 من الطرفين عند البدء', goldD0 - goldD1 === 10 && goldE0 - goldE1 === 10);

  await D.evaluate(() => billiardsResign());
  const settled = await wait(E, () => (BILLIARDS.over && BILLIARDS.G.S.frameOver) ? true : null, 10000);
  ok('الاستسلام وصل للخصم وأنهى الإطار', settled === true);
  ok('الخصم هو الفائز عند E', await E.evaluate(() => BILLIARDS.G.S.winner === 1 && BILLIARDS.mySeat === 1));
  await wait(E, () => true, 1200); /* مهلة giveWin */
  const goldE2 = await E.evaluate(() => ST.gold);
  ok('الفائز استلم 2× الرهان (صافي +10)', goldE2 - goldE0 === 10);

  /* ═══ 3) بث إعدادات الكاروم (cfg) ═══ */
  sec('3) كاروم أونلاين: بث الاختصاص والهدف');
  const F = await setup(await browser.newContext(), 'bl_h3_' + uniq);
  const Gg = await setup(await browser.newContext(), 'bl_g3_' + uniq);
  await F.evaluate(() => openGame('blca'));
  await Gg.evaluate(() => openGame('blca'));
  await wait(F, () => !!BILLIARDS, 8000); await wait(Gg, () => !!BILLIARDS, 8000);
  await F.evaluate(() => { billiardsSetDisc('ONE'); billiardsSetTarget(5); });
  await F.evaluate(() => Rooms.createRoom('blca', 10));
  await wait(F, () => !!(Rooms.state && Rooms.state.code), 8000);
  const code3 = await F.evaluate(() => Rooms.state.code);
  await Gg.evaluate(c => Rooms.joinRoom(c), code3);
  await wait(Gg, () => !!(Rooms.state && Rooms.state.status), 8000);
  await F.evaluate(() => Rooms.setReady(true));
  await Gg.evaluate(() => Rooms.setReady(true));
  await wait(F, () => !!(Rooms.state && Rooms.state.players.filter(p => !p.spectate).every(p => p.ready)), 8000);
  await F.evaluate(() => Rooms.startGame());
  await started(F);
  const cfgOk = await wait(Gg, () => (BILLIARDS.G && BILLIARDS.G.S.discipline === 'ONE' && BILLIARDS.G.S.target === 5) ? true : null, 10000);
  ok('الضيف تبنّى ONE/5 من بث cfg', cfgOk === true);
  /* ضربة واحدة متزامنة في الكاروم */
  await F.evaluate(() => { BILLIARDS.aim = -0.10 * Math.PI; document.getElementById('blPower').value = 80; billiardsPowerUi(); billiardsShoot(); });
  const caSync = await wait(Gg, () => (BILLIARDS.G.S.history.length >= 1) ? true : null, 10000);
  ok('ضربة الكاروم وصلت للضيف', caSync === true);
  const [hf, hg] = [await F.evaluate(HASH), await Gg.evaluate(HASH)];
  ok('بصمة الكاروم متطابقة', hf === hg);

  /* ═══ 4) انقطاع وعودة: إعادة بناء من السجل ═══ */
  sec('4) العودة بعد الانقطاع (bl8)');
  const nShots = await A.evaluate(() => BILLIARDS.G.S.history.length);
  await B.close();
  await new Promise(r => setTimeout(r, 1200));
  /* نكمل ضربة واحدة أثناء غياب B ليتحقق أن العائد يبني من السجل */
  const who2 = await A.evaluate(() => (BILLIARDS.G.S.active === BILLIARDS.mySeat) ? 'A' : null);
  if (who2 === 'A') {
    await A.evaluate(() => {
      if (BILLIARDS.G.S.phase === 'PLACE') { for (let x = 60; x < 940; x += 25) for (let y = 40; y < 470; y += 25) if (BILLIARDS.G.validPlace(x, y)) { billiardsPlace(x, y); break; } }
      BILLIARDS.aim = 0.6; document.getElementById('blPower').value = 50; billiardsPowerUi(); billiardsShoot();
    });
  }
  await wait(A, n => BILLIARDS.G.S.history.length >= n, 10000, nShots + 1);
  const B2 = await setup(ctxB, 'bl_g_' + uniq);   /* نفس الجلسة (cookie) → الخادم يعرف العائد */
  await B2.evaluate(() => openGame('bl8'));
  await wait(B2, () => !!BILLIARDS, 8000);
  await B2.evaluate(c => Rooms.joinRoom(c), code);
  const rebuilt = await wait(B2, n => (BILLIARDS.G && BILLIARDS.G.S.history.length >= n) ? true : null, 15000, nShots + 1);
  ok('العائد أعاد بناء الإطار من السجل (' + (nShots + 1) + ' ضربة)', rebuilt === true);
  const [ha3, hb3] = [await A.evaluate(HASH), await B2.evaluate(HASH)];
  ok('بصمة العائد مطابقة للمُنشئ', ha3 === hb3);

  /* ═══ 5) صحة الصفحات ═══ */
  sec('5) صحة الصفحات');
  let errsAll = 0;
  for (const p of [A, B2, C, D, E, F, Gg]) errsAll += p._errs.length;
  if (errsAll) for (const p of [A, B2, C, D, E, F, Gg]) p._errs.slice(0, 3).forEach(e => console.log('    ! ' + e));
  ok('لا أخطاء صفحة (' + errsAll + ')', errsAll === 0);

  await browser.close();
  console.log('\n═══ Billiards MP: ' + pass + '/' + (pass + fail) + ' passed ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

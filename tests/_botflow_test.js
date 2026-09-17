process.chdir(require('path').resolve(__dirname, '..'));
/* [Policy 2026-09-16] تدقيق سياسة التدريب الجديدة:
   (أ) اللعب الفردي ضد الآلي يعمل ومجاني بلا خصم رصيد؛
   (ب) practiceVsAi لم يعد ينشئ غرفة بوت؛
   (ج) لا زر «أضف آلياً» في الغرفة + الخادم يرفض addBot (الغرف للبشر فقط). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(p, fn, t = 15000, a) { const s = Date.now(); let e; while (Date.now() - s < t) { try { const r = await p.evaluate(fn, a); if (r) return r; } catch (x) { e = x; } await p.waitForTimeout(200); } throw new Error('timeout' + (e ? ' ' + e.message : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* التسجيل مقصور على الأدمن — نولج بحسابات البذر (تطوير) */
const SEED_PW = { player: 'RoyalCoin@User1', admin: 'RoyalCoin@Admin1', super: 'RoyalCoin@Super1' };
async function setup(ctx, u) {
  const pw = SEED_PW[u] || 'pw123456';
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 100))); p._errs = errs;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async ([uu, pp]) => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: uu, password: pp }) });
    const d = await r.json().catch(() => ({}));
    if (d && d.token) localStorage.setItem('rc_token', d.token);
  }, [u, pw]);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof Rooms !== 'undefined'));
  await p.waitForTimeout(600);
  return p;
}
const ok = (c, m) => console.log((c ? '  ✓ ' : '  ✗ ') + m);
(async () => {
  const U = Date.now().toString().slice(-5);
  const results = [];

  // (أ) لاعب فردي ضد الآلي — مجاني بلا خصم
  console.log('\n[Flow-A] لاعب فردي ضد الآلي (تدريب مجاني)');
  {
    const b = await chromium.launch(); const ctx = await b.newContext();
    const A = await setup(ctx, 'player');
    await A.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 9000; if (typeof save === 'function') save(); });
    await A.evaluate(() => openGame('rm')); await wait(A, () => !!window.RamiAdapter);
    await A.evaluate(() => ramiStartGame());
    await wait(A, () => !!(RamiAdapter.game && RamiAdapter.game.gamePhase === 'PLAYING'), 12000);
    const bots = await A.evaluate(() => RamiAdapter.game.players.filter(p => p.isBot).length);
    ok(bots >= 1, 'لاعب فردي: بوت واحد على الأقل (' + bots + ')');
    await sleep(1200);
    const gold = await A.evaluate(() => ST.gold);
    ok(gold === 9000, 'التدريب مجاني: الرصيد لم يُمَس (' + gold + ')');
    const trOn = await A.evaluate(() => !!(window.TRAINING && window.TRAINING.on));
    ok(trOn, 'علم التدريب مفعّل في الجولة المحلية');
    results.push(['A: single-player vs AI works', bots >= 1]);
    results.push(['A: training is free (no deduction)', gold === 9000]);
    results.push(['A: TRAINING flag on', trOn]);
    await b.close();
  }

  // (ب) practiceVsAi لم يعد ينشئ غرفة بوت
  console.log('\n[Flow-B] practiceVsAi لا ينشئ غرفة (سياسة جديدة)');
  {
    const b = await chromium.launch(); const ctx = await b.newContext();
    const A = await setup(ctx, 'admin');
    await A.evaluate(() => openGame('rm')); await wait(A, () => !!window.RamiAdapter);
    await A.evaluate(() => Rooms.practiceVsAi('rm'));
    await sleep(1200);
    const st = await A.evaluate(() => !!(Rooms.state && Rooms.state.code));
    ok(!st, 'practiceVsAi لا ينشئ غرفة بعد الآن');
    results.push(['B: practiceVsAi creates no room', !st]);
    await b.close();
  }

  // (ج) لا زر «أضف آلياً» + الخادم يرفض
  console.log('\n[Flow-C] الغرف حصرية للبشر');
  {
    const b = await chromium.launch(); const ctx = await b.newContext();
    const A = await setup(ctx, 'player');
    await A.evaluate(() => openGame('rm')); await wait(A, () => !!window.RamiAdapter);
    await A.evaluate(() => Rooms.createRoom('rm', { bet: 10 })); await wait(A, () => !!(Rooms.state && Rooms.state.code));
    await A.evaluate(() => Rooms.openModal());
    await wait(A, () => { const b2 = document.getElementById('roomBody'); return b2 && b2.innerHTML.indexOf('roomEmpty') === -1; });
    const hasBtn = await A.evaluate(() => { const btns = document.querySelectorAll('#roomBody button'); for (let i = 0; i < btns.length; i++) { const oc = btns[i].getAttribute('onclick') || ''; if (oc.indexOf('Rooms.addBot') !== -1) return true; } return false; });
    ok(!hasBtn, 'لا زر «أضف آلياً» في نافذة الغرفة');
    const resp = await A.evaluate(async () => { const r = await fetch('/api/rooms/addBot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_id: Rooms.state.id }) }); return { s: r.status, j: await r.json() }; });
    ok(resp.s === 403 && resp.j && resp.j.ok === false, 'الخادم يرفض addBot (403)');
    results.push(['C: no addBot button in room', !hasBtn]);
    results.push(['C: server rejects addBot', resp.s === 403 && resp.j && resp.j.ok === false]);
    await b.close();
  }

  console.log('\n═══ النتائج ═══');
  let pass = 0; for (const [m, c] of results) { console.log((c ? '✅ ' : '❌ ') + m); if (c) pass++; }
  console.log('\nالنتيجة: ' + pass + ' نجح / ' + (results.length - pass) + ' فشل');
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

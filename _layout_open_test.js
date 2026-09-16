/* تحقّق من التخطيط المفتوح: حاوية اللعبة ثابتة (لا تتقلّص) + سجل مستقل أسفلها + تمرير + بلا قصّ. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(p, fn, t = 12000) {
  const s = Date.now(); let e;
  while (Date.now() - s < t) {
    try { const r = await p.evaluate(fn); if (r) return r; } catch (x) { e = x; }
    await p.waitForTimeout(150);
  }
  throw new Error('timeout' + (e ? ' ' + e.message : ''));
}
async function probe(p) {
  return await p.evaluate(() => {
    const pg = document.getElementById('pg-game');
    const body = document.getElementById('gamePageBody');
    const stage = body && body.querySelector('.stage');
    const gh = document.getElementById('gameHistory');
    const tickets = gh ? gh.querySelectorAll('.ght-ticket').length : 0;
    const bb = body.getBoundingClientRect();
    const sb = stage ? stage.getBoundingClientRect() : null;
    const ghb = gh ? gh.getBoundingClientRect() : null;
    return {
      appFs: pg.classList.contains('app-fs'),
      bodyH: Math.round(bb.height),
      stageInV: sb ? (sb.top >= bb.top - 2 && sb.bottom <= bb.bottom + 2) : null,
      stageH: sb ? Math.round(sb.height) : null,
      tickets,
      ghBelow: ghb ? (ghb.top >= bb.bottom - 4) : null,   // السجل يبدأ أسفل حاوية اللعبة
      pgScroll: pg.scrollHeight > pg.clientHeight + 2,     // الصفحة قابلة للتمرير
      pgScrollH: pg.scrollHeight, pgClientH: pg.clientHeight,
      headH: document.querySelector('#pg-game .gp-head') ? document.querySelector('#pg-game .gp-head').offsetHeight : 0
    };
  });
}
(async () => {
  let pass = 0, total = 0;
  for (const [label, vp] of [['mobile', { width: 390, height: 780, isMobile: true, hasTouch: true }], ['desktop', { width: 1280, height: 800 }]]) {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: vp, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const u = 'lopen' + label + Date.now().toString().slice(-4);
    await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
    const p = await ctx.newPage();
    const er = []; p.on('pageerror', e => er.push(e.message.slice(0, 70)));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
    await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
    await p.evaluate(() => openGame('pl'));
    await wait(p, () => !!(document.getElementById('gamePageBody') && document.getElementById('gamePageBody').querySelector('.stage')));
    await sleep(600);
    // الخروج من الانغماس → التخطيط المفتوح
    await p.evaluate(() => exitAppFullscreen());
    await sleep(500);
    const m0 = await probe(p);
    // تسجيل 12 جولة (ملء السجل)
    for (let i = 0; i < 12; i++) {
      await p.evaluate((idx) => { if (typeof recordRound === 'function') recordRound(idx % 2 === 0, idx % 2 === 0 ? 200 : 0, 'x'); }, i);
    }
    await sleep(300);
    const m1 = await probe(p);

    total++;
    const checks = {
      notImmersive: !m1.appFs,
      bodyStable: m0.bodyH === m1.bodyH,                 // حاوية اللعبة لم تتقلّص
      stageFits: m1.stageInV === true,                   // اللعبة غير مقصوصة
      ticketsRendered: m1.tickets >= 12,                 // التذاكر مُرسمة
      ghBelowBody: m1.ghBelow === true,                  // السجل أسفل الحاوية (مستقل)
      pageScrolls: m1.pgScroll === true                  // الصفحة قابلة للتمرير لكشف السجل
    };
    const ok = Object.values(checks).every(Boolean) && !er.length;
    if (ok) pass++;
    const tag = k => (checks[k] ? '✓' : '✗') + k;
    console.log((ok ? '✅ ' : '❌ ') + label + '/open-layout ' + Object.keys(checks).map(tag).join(' ') +
      ' | bodyH ' + m0.bodyH + '→' + m1.bodyH + ' tickets=' + m1.tickets + ' scroll=' + m1.pgScrollH + '/' + m1.pgClientH + ' headH=' + m1.headH);
    if (!ok) console.log('   m0:', JSON.stringify(m0), '\n   m1:', JSON.stringify(m1));
    await p.close();
    await b.close();
  }
  console.log('\nالنتيجة: ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

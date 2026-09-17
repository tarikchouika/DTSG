process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext();
  await ctx.request.post(BASE + 'api/register', { data: { username: 'ldg' + Date.now().toString().slice(-5), password: 'pw123456' } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!(typeof AUTH !== 'undefined' && AUTH.user));
  const r = await p.evaluate(async () => {
    openGame('cf');
    await new Promise(r2 => setTimeout(r2, 400));
    const gid0 = window._currentGameId;
    gres('خسارة تجريبية', 0);           /* المنصة تربح الرهان */
    gres('فوز تجريبي', 2 * GB);          /* المنصة تدعي الصافي سالباً */
    gres('استرداد', GB);                 /* دلتا صفر — لا يُسجل */
    const st = window.BotsLedger.stats();
    const row = st.rows.find(x => x.gid === gid0);
    return { gid0, row, rounds: st.rounds };
  });
  console.log(JSON.stringify(r));
  const ok = r.gid0 === 'cf' && r.row && r.row.win === 10 && r.row.lose === 10 && r.row.count === 2;
  console.log(ok ? 'LEDGER HOOK OK' : 'LEDGER HOOK MISMATCH');
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

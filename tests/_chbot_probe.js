process.chdir(require('path').resolve(__dirname));
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext();
  await ctx.request.post(BASE + 'api/register', { data: { username: 'cbq' + Date.now().toString().slice(-5), password: 'pw123456' } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEEXC', String(e.message).slice(0, 160)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!(typeof AUTH !== 'undefined' && AUTH.user));
  const r = await p.evaluate(async () => {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: 'ch' }) });
    const j = await res.json().catch(() => ({}));
    return { status: res.status, j: JSON.stringify(j).slice(0, 200) };
  });
  console.log(JSON.stringify(r));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await (await b.newContext()).newPage();
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(async () => {
    const tag = Date.now() % 100000;
    const r = await fetch('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'diag' + tag, password: 'Diag@12345' }) });
    const j = await r.json().catch(() => ({}));
    const out = { reg: j.ok, hasRooms: typeof Rooms !== 'undefined', hasWS: typeof WS !== 'undefined' };
    if (typeof Rooms !== 'undefined') {
      try { Rooms.createRoom('rn', 10); } catch (e) { out.createErr = String(e); }
    }
    return out;
  });
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => (typeof Rooms !== 'undefined' && Rooms.state) ? { code: Rooms.state.code, players: Rooms.state.players.length } : null);
  console.log('INFO:', JSON.stringify(info), 'STATE:', JSON.stringify(st));
  await b.close();
})();

const { chromium } = require('playwright');
const BASE = 'https://dtsg.pages.dev/';
async function wait(p, fn, t) { t = t || 25000; const s = Date.now(); while (Date.now() - s < t) { try { const r = await p.evaluate(fn); if (r) return r; } catch (e) {} await p.waitForTimeout(250); } return null; }
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newContext({ viewport: { width: 430, height: 900 } }).then(c => c.newPage());
  const errs = [];
  const fails404 = [];
  p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 120)); });
  p.on('response', r => { if (r.status() === 404) fails404.push(r.url()); });

  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  // 1) 404 الخلفيات
  for (const g of ['ch', 'dm', 'bl8', 'rn', 'pr', 'rm']) {
    await p.evaluate((id) => { try { openGame(id); } catch (e) {} }, g);
    await p.waitForTimeout(500);
  }
  console.log('[1] 404 backgrounds:', [...new Set(fails404)].length, [...new Set(fails404)].slice(0, 2).join(' ') || 'NONE');

  // 2) دخول عبر النموذج الحقيقي (authUsername/authPassword)
  await p.evaluate(() => { if (typeof openAuthModal === 'function') { try { openAuthModal(); } catch (e) {} } });
  await p.waitForTimeout(600);
  await p.fill('#authUsername', 'player');
  /* [Sec v2.27] كلمة مرور حساب الإنتاج من البيئة DM_LIVE_PW — لا تُودع في المستودع (عام) */
  await p.fill('#authPassword', process.env.DM_LIVE_PW || '');
  await p.click('#authSubmit');
  const logged = await wait(p, () => window.AUTH && AUTH.user && AUTH.user.username === 'player', 20000);
  console.log('[2] AUTH:', logged ? 'OK — gold=' + AUTH.user.gold : 'FAIL');

  if (logged) {
    // 3) غرفة شطرنج ببوت
    const room = await p.evaluate(async () => {
      const r = await API.post('/api/rooms', { game_id: 'ch', bet: 10, max_players: 2 });
      return r.data && r.data.room;
    });
    console.log('[3] room:', room ? room.id + '/' + room.code : 'FAIL');
    if (room) {
      await p.evaluate(async (rid) => {
        await API.post('/api/rooms/addBot', { room_id: rid });
        await API.post('/api/rooms/ready', { room_id: rid, ready: true });
        await API.post('/api/rooms/start', { room_id: rid });
      }, room.id);
      await p.evaluate(() => { openGame('ch'); });
      const inRoom = await wait(p, () => window.CHESS && CHESS.state && CHESS.mode === 'room' && CHESS.oppBot, 25000);
      const st = await p.evaluate(() => window.CHESS ? ({ myColor: CHESS.myColor, turn: CHESS.state.turn, bet: CHESS.bet }) : null);
      console.log('[3] chess room:', inRoom ? JSON.stringify(st) : 'NOT IN ROOM');
      if (inRoom && st.myColor === 'w') {
        await p.evaluate(() => { chessClick(6, 4); chessClick(4, 4); });
        const t0 = Date.now();
        const reply = await wait(p, () => {
          if (!window.CHESS || !CHESS.state) return null;
          if (CHESS.state.turn === CHESS.myColor && !CHESS.busy) return { log: CHESS.state.log.slice(-2), ms: Date.now() - t0 };
          return null;
        }, 20000);
        console.log('[3] bot reply:', reply ? JSON.stringify(reply) : 'TIMEOUT');
      }
    }
  }
  console.log('[4] errors:', errs.length ? errs.slice(0, 3) : 'NONE');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

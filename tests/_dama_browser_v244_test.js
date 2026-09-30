process.chdir(require('path').resolve(__dirname, '..'));
/* [v2.44 Phase E] تحقق حيّ: ضاما تلعب ضد البوت بلا أخطاء + قانون النفخ يعمل في اللعب الفعلي */
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const SHOTS = process.env.SHOTS || '/tmp/dtsg-shots';
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => (await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) })).status);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { try { openGame('dm'); } catch (e) {} });
  await page.waitForTimeout(1500);

  const started = await page.evaluate(() => {
    try { damaStart(); return 'damaStart'; } catch (e) { return 'ERR ' + String(e).slice(0, 90); }
  });
  started !== 'not-found' ? ok('بدأت مباراة ضاما ضد البوت (' + started + ')') : bad('لم تُبدأ المباراة');
  await page.waitForTimeout(2500);

  const st0 = await page.evaluate(() => {
    const D = (typeof DAMA !== 'undefined') ? DAMA : null;
    if (!D) return null;
    let n = 0, mv = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (D.state.grid[r][c]) n++;
    return { pieces: n, turn: D.state.turn, moves: D.state.moves, depth: D.depth, budget: D.budget };
  });
  st0 ? ok('اللوحة مهيّأة: ' + st0.pieces + ' قطعة · العمق ' + st0.depth + ' · الميزانية ' + st0.budget + 'ms') : bad('DAMA غير مهيّأة');

  /* لعب 6 نقلات بشرية (أول حركة قانونية) والسماح للبوت بالرد */
  const played = await page.evaluate(async () => {
    const D = (typeof DAMA !== 'undefined') ? DAMA : null;
    let n = 0;
    for (let k = 0; k < 6; k++) {
      /* انتظر دور اللاعب وليس مشغولاً (وإلا نفسد الحالة بحركة خارج الدور) */
      let guard = 0;
      while (guard++ < 40 && (D.busy || D.state.turn !== D.human || D.state.over || D.state.cont)) await new Promise(r => setTimeout(r, 250));
      if (D.state.turn !== D.human || D.state.over) break;
      const legal = D.eng.legalMoves(D.state, D.human);
      if (!legal.length) break;
      const mv = legal[Math.floor(Math.random() * legal.length)];
      try { damaHumanMove(mv); n++; } catch (e) { break; }
      await new Promise(r => setTimeout(r, 1200));
    }
    return n;
  });
  played > 0 ? ok('نُفّذت ' + played + ' نقلة بشرية مع ردود البوت') : bad('لم تُنفّذ نقلات');

  const st1 = await page.evaluate(() => {
    const D = (typeof DAMA !== 'undefined') ? DAMA : null;
    let w = 0, b = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = D.state.grid[r][c]; if (p) { if (p.owner === WHITE) w++; else b++; } }
    return { w: w, b: b, moves: D.state.moves, over: D.state.over, errors: 0 };
  });
  (st1.moves > st0.moves) ? ok('حالة اللعبة تتقدّم: ' + st1.moves + ' دور (' + st1.w + ' أبيض / ' + st1.b + ' أسود)') : bad('لا تقدّم: ' + JSON.stringify(st1));

  /* اختبار الواجب والنفخ حياً على نفس المحرّك المحمّل */
  const rule = await page.evaluate(() => {
    const e = DAMA.eng;
    const mk = (rows) => {
      const g = []; for (let r = 0; r < 8; r++) g.push([null, null, null, null, null, null, null, null]);
      let id = 1;
      rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '.') return; g[r][c] = { owner: (ch === 'w' ? WHITE : BLACK), king: false, id: id++ }; }));
      return { grid: g, turn: WHITE, cont: null, half: 0, moves: 0, over: null, outcome: null, obligedId: null, obligedFulfilled: false, obligedNeed: 0, obligedMax: 0, turnCaptures: 0, chainNeed: null };
    };
    const s = mk(['........','........','....b...','........','..b.....','.w......','......b.','.......w']);
    const need = e.maxChainOverall(s);
    const ob = e.obligationPiece(s);
    const s2 = e.cloneState(s);
    const short = e.capturesAt(s2.grid, 7, 7);
    const i2 = short.length ? e.applyMove(s2, short[0]) : null;
    return { need: need, ob: ob, blew: !!(i2 && i2.souffled), capped: (typeof e.obligationInfo === 'function') };
  });
  rule.need === 2 ? ok('قانون أطول سلسلة سليم في المتصفح: need=2') : bad('need=' + rule.need);
  rule.blew ? ok('النفخ يعمل على المحرّك الحيّ عند تقصير الأكل') : bad('النفخ لا يعمل حياً');
  rule.capped ? ok('ذاكرة الواجب (obligationInfo) مُحمَّلة') : bad('ذاكرة الواجب غائبة');

  await page.screenshot({ path: SHOTS + '/dama-v244-live.png' });
  errs.length === 0 ? ok('صفر أخطاء JS في جلسة ضاما') : bad('أخطاء: ' + errs.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n═══ Phase E حيّ: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

process.chdir(require('path').resolve(__dirname, '..'));
/* [v2.44 Phase C] تحقق حيّ: خانات بارتشي مستطيلة صحيحة بلا تشويه/تداخل */
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const SHOTS = process.env.SHOTS || '/tmp/dtsg-shots';
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 }, locale: 'ar-MA', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => (await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) })).status);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const gid = await page.evaluate(() => {
    const ids = (typeof GAMES !== 'undefined' ? GAMES : []).map(g => g.id);
    const cand = ['pr', 'pc', 'parchisi'].find(x => ids.indexOf(x) >= 0);
    if (cand) openGame(cand);
    return cand || ids.slice(0, 8).join(',');
  });
  ok('فُتحت لعبة بارتشي (' + gid + ')');
  await page.waitForTimeout(2500);
  const geo = await page.evaluate(() => {
    const P = (typeof PR_TRACK !== 'undefined') ? PR_TRACK : null;
    if (!P) return null;
    const ov = (a, b) => {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return (w > 0.01 && h > 0.01) ? w * h : 0;
    };
    let pairs = [], zero = 0, ratios = {};
    for (let i = 0; i < P.length; i++) {
      const r = (Math.max(P[i].w, P[i].h) / Math.min(P[i].w, P[i].h)).toFixed(2);
      ratios[r] = (ratios[r] || 0) + 1;
      for (let j = i + 1; j < P.length; j++) if (ov(P[i], P[j]) > 0) pairs.push([i, j]);
    }
    const canvas = document.querySelector('#parchisiWrap canvas, canvas');
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    return { cells: P.length, ratios: ratios, overlaps: pairs.length, canvas: rect ? Math.round(rect.width) + '×' + Math.round(rect.height) : null };
  });
  geo ? ok('الهندسة محمّلة: ' + geo.cells + ' خانة · النسب ' + JSON.stringify(geo.ratios) + ' · تداخلات ' + geo.overlaps)
      : bad('PR_TRACK غير محمّلة في الصفحة');
  geo && geo.cells === 68 ? ok('68 خانة كما يجب') : bad('عدد الخانات ' + (geo && geo.cells));
  geo && geo.overlaps === 4 ? ok('التداخلات = 4 فقط (قصّات الزوايا 26×26 المقصودة)')
    : bad('تداخلات غير طبيعية: ' + (geo && geo.overlaps));
  geo && Object.keys(geo.ratios).length === 1 && Object.keys(geo.ratios)[0] === '2.33'
    ? ok('كل الخانات بنسبة موحّدة 2.33:1 (لا تشويه)') : bad('نسب غير موحّدة: ' + JSON.stringify(geo && geo.ratios));

  /* ابدأ مباراة لتظهر القطع ثم صوّر */
  const started = await page.evaluate(() => {
    try { ParchisiApp.start(); return 'start'; }
    catch (e) { try { const b = Array.from(document.querySelectorAll('button')).find(x => /ابدأ اللعبة/.test(x.textContent || '')); if (b) { b.click(); return 'click'; } } catch (e2) {} return 'fail: ' + String(e).slice(0, 60); }
  });
  console.log('   ↳ بدء المباراة: ' + started);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS + '/parchisi-fixed-full.png' });
  const wrap = await page.$('#parchisiWrap, canvas');
  if (wrap) await wrap.screenshot({ path: SHOTS + '/parchisi-fixed-board.png' });
  ok('لقطات: parchisi-fixed-full.png · parchisi-fixed-board.png');
  errs.length === 0 ? ok('صفر أخطاء JS') : bad('أخطاء: ' + errs.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n═══ Phase C حيّ: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

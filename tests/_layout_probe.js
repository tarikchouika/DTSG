/* ═══ [v2.44-LAYOUT] مسبار التخطيط الحيّ: يقيس ملء الحاويات والحدود والفجوات ═══
   يقارن اللوحة/الحاوية بحدود الشاشة في الوضعين (بورتريه/لاندسكيب) ويطبع سلسلة العناصر
   مع الحدود والحشو والظلال ⇒ يُستعمل للتأكد من «ملء الشاشة بلا فاصل» قبل/بعد الإصلاح.
   التشغيل:
     GAME=pr|ch|dm VP=412x915 node tests/_layout_probe.js
     BASE=http://127.0.0.1:3971 node tests/_layout_probe.js
   ═════════════════════════════════════════════════════════════════════ */
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const GAME = process.env.GAME || 'pr';
const VP = (process.env.VP || '412x915').split('x').map(Number);
const SHOTS = process.env.SHOTS || '/tmp/dtsg-shots';

const SEL = {
  pr: ['#parchisiGame canvas', '#parchisiGame', '.pr-boardarea'],
  ch: ['.ch-board', '.ch-boardbox', '.ch-wrap', '#chessSetup', '.ch-setup'],
  dm: ['.dama-board', '#damaBoard', '.dm-board', '.dama-wrap', '#damaGame']
};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: VP[0], height: VP[1] }, locale: 'ar-MA' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => {
    await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) });
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  await p.evaluate(g => { try { openGame(g); } catch (e) {} }, GAME);
  await p.waitForTimeout(1400);
  const started = await p.evaluate(g => {
    try {
      if (g === 'pr' && typeof ParchisiApp !== 'undefined' && ParchisiApp.start) { ParchisiApp.start(); return 'ParchisiApp.start'; }
      if (g === 'dm' && typeof damaStart === 'function') { damaStart(); return 'damaStart'; }
      if (g === 'ch') {
        const btn = Array.from(document.querySelectorAll('button')).find(x => /بوت تدريبي/.test(x.textContent || ''));
        if (btn) { btn.click(); return 'bot'; }
        return 'no-btn';
      }
    } catch (e) { return 'ERR ' + String(e).slice(0, 60); }
    return 'none';
  }, GAME);
  await p.waitForTimeout(2600);

  const rep = await p.evaluate(arg => {
    const { game, sel } = arg;
    const out = {
      viewport: { w: innerWidth, h: innerHeight },
      docScroll: { x: document.documentElement.scrollWidth, y: document.documentElement.scrollHeight },
      bodyScroll: { x: document.body.scrollWidth, y: document.body.scrollHeight },
      boxes: []
    };
    const seen = new Set();
    for (const s of sel) {
      const el = document.querySelector(s);
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      out.boxes.push({
        sel: s,
        tag: el.tagName + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        gapTop: Math.round(r.top), gapBottom: Math.round(innerHeight - r.bottom),
        gapLeft: Math.round(r.left), gapRight: Math.round(innerWidth - r.right),
        border: cs.borderTopWidth + '/' + cs.borderRightWidth + '/' + cs.borderBottomWidth + '/' + cs.borderLeftWidth,
        borderColors: [cs.borderTopColor, cs.borderLeftColor].join(' | '),
        pad: cs.paddingTop + '/' + cs.paddingRight + '/' + cs.paddingBottom + '/' + cs.paddingLeft,
        overflow: cs.overflowX + '/' + cs.overflowY,
        shadow: (cs.boxShadow || 'none').slice(0, 70),
        bg: (cs.backgroundImage || 'none').slice(0, 45)
      });
    }
    /* أي عنصر يحمل حدًّا ذهبيًّا ظاهراً داخل صفحة اللعبة */
    const golds = [];
    const root = document.querySelector('#pg-game') || document.body;
    for (const el of root.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const bc = cs.borderTopColor || '';
      const isGold = /255,\s*(19[0-9]|2[0-9][0-9])|2[0-9][0-9],\s*1[5-9][0-9]|#(d9b45c|e8c15a|ffd75e|d9a94e)/i.test(bc);
      if (bw >= 1 && isGold) {
        const r2 = el.getBoundingClientRect();
        if (r2.width > 40 && r2.height > 40) golds.push({ el: el.tagName + (el.id ? '#' + el.id : '') + '.' + String(el.className || '').split(/\s+/).slice(0, 2).join('.'), bw: bw, color: bc, rect: [Math.round(r2.x), Math.round(r2.y), Math.round(r2.width), Math.round(r2.height)] });
      }
    }
    out.goldBorders = golds.slice(0, 12);
    /* شرائط تمرير أفقية */
    out.hScroll = [];
    for (const el of root.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
        out.hScroll.push({ el: el.tagName + (el.id ? '#' + el.id : '') + '.' + String(el.className || '').split(/\s+/).slice(0, 2).join('.'), sw: el.scrollWidth, cw: el.clientWidth });
      }
    }
    out.hScroll = out.hScroll.slice(0, 8);
    return out;
  }, { game: GAME, sel: SEL[GAME] });

  if (SHOTS) { try { await p.screenshot({ path: SHOTS + `/layout-${GAME}-${VP[0]}x${VP[1]}.png` }); } catch (e) {} }
  rep.started = started;
  console.log(JSON.stringify(rep, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(2); });

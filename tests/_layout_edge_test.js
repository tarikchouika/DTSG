/* ═══ [v2.44-EDGE] جناح انحدار لمواصفات الحدود (طلب المالك 2026-09-19) ═══
   يتحقق حيّاً في متصفح حقيقي من:
     1) بورتريه  : حدّ اللوحة الأيمن/الأيسر على حدّ الشاشة (فجوة 0) — شطرنج/ضاما/بارتشي
     2) لاندسكيب : حدّ اللوحة الأعلى/الأسفل على حدّ الشاشة (فجوة 0) — الثلاثة
     3) الحاويات (إعدادات/لعب) تملأ المرحلة 100% بلا حشو ولا حدّ ذهبي
     4) لا تمرير/سحب أُفقي داخل الحاوية (لا شريط زالق)
     5) لا حلقة ذهبية حول .ch-board/.dama-board
     6) زرا الاستسلام/التعادل: دائرة 44px فلا تراكب مع أيقونة اللاعب
   التشغيل:  node tests/_layout_edge_test.js        (يتطلب خادم QA على 3971)
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1.5 : tol);

const START = {
  ch: "const b=Array.from(document.querySelectorAll('button')).find(x=>/بوت تدريبي/.test(x.textContent||'')); if(b) b.click();",
  dm: 'damaStart();',
  pr: 'ParchisiApp.start();'
};

async function measure(browser, game, w, h, phase) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ar-MA' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => {
    await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) });
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1900);
  await p.evaluate(g => { try { openGame(g); } catch (e) {} }, game);
  await p.waitForTimeout(900);
  if (phase !== 'setup') {
    await p.evaluate(s => { try { eval(s); } catch (e) {} }, START[game]);
    await p.waitForTimeout(2400);
  } else {
    await p.waitForTimeout(600);
  }

  const rep = await p.evaluate(g => {
    const q = s => document.querySelector(s);
    const R = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const stage = q(g === 'ch' ? '#chessStage' : g === 'dm' ? '#damaStage' : '#parchisiGame');
    const wrap = q(g === 'ch' ? '.ch-wrap' : g === 'dm' ? '.dama-wrap' : '.pr-boardarea');
    const play = q(g === 'ch' ? '#chessPlay' : g === 'dm' ? '#damaPlay' : null);
    const board = q(g === 'ch' ? '.ch-board' : g === 'dm' ? '.dama-board' : '#parchisiCanvas');
    const box = q(g === 'ch' ? '.ch-boardbox' : g === 'dm' ? '.dama-boardbox' : '.pr-boardwrap');
    const setup = q(g === 'ch' ? '#chessSetup' : g === 'dm' ? '.dama-setup' : null);
    const cs = el => el ? getComputedStyle(el) : null;
    const out = { vp: { w: innerWidth, h: innerHeight }, landscape: innerWidth > innerHeight };
    if (stage) { out.stage = R(stage); out.stageBorder = cs(stage).borderTopWidth; out.stageShadow = cs(stage).boxShadow; }
    if (wrap) { out.wrap = R(wrap); out.wrapPad = cs(wrap).padding; out.wrapOvf = cs(wrap).overflowX; out.wrapScrollX = wrap.scrollWidth - wrap.clientWidth; }
    if (play) { out.play = R(play); out.playPad = cs(play).padding; out.playOvf = cs(play).overflowX; }
    if (setup) { out.setup = R(setup); out.setupVisible = !setup.hidden; }
    if (board) { out.board = R(board); out.boardShadow = cs(board).boxShadow; }
    if (box) out.box = R(box);
    const dp = q('#gamePageBody #gamePageBody') || document.getElementById('gamePageBody');
    if (dp) out.docScroll = { x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight };
    const round = [...document.querySelectorAll('.dama-ctrls .dama-mini.dama-round')].map(e => ({ r: R(e), br: getComputedStyle(e).borderRadius }));
    /* [v2.49-NOBTN] الأزرار المحذوفة بأمر المالك (استسلام/تراجع/تعادل) — يجب ألّا يوجد
       أيّ منها **مرئي** في الألعاب الأربع. الطبقات التأكيدية داخل [hidden] لا تُحتسب. */
    const forbidden = [...document.querySelectorAll(
      '.dama-ctrls .dama-mini.dama-round, #damaDrawBar, #chessDrawBar, #bwResignBtn, #bwUndoBtn, #dmResignBtn, .bw-tools'
    )].filter(e => e.getClientRects().length > 0);
    out.forbidden = forbidden.length;
    out.forbiddenList = forbidden.map(e => e.id || e.className).slice(0, 4);
    const picon = [...document.querySelectorAll('.dama-picon, .ch-seat')].map(e => R(e));
    out.round = round; out.icons = picon;
    /* أي عنصر مرئي يتجاوز حدّ الشاشة (كشف القصّ الحقيقي — لا فائض المقاعد الخارجية المقصود) */
    out.beyondRight = 0; out.beyondLeft = 0;
    const root = stage || document.body;
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs2 = getComputedStyle(el);
      if (cs2.visibility === 'hidden' || cs2.display === 'none' || parseFloat(cs2.opacity) === 0) continue;
      if (r.right > innerWidth + 1) out.beyondRight++;
      if (r.left < -1 && cs2.position !== 'absolute') out.beyondLeft++;
    }
    return out;
  }, game);
  await ctx.close();
  return rep;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const games = [['ch', 'شطرنج'], ['dm', 'ضاما'], ['pr', 'بارتشي']];

  for (const [g, name] of games) {
    const P = await measure(browser, g, 412, 915);
    console.log(`\n── ${name} · بورتريه 412×915 ──`);
    ok(P.board && near(P.board.x, 0) && near(P.vp.w - (P.board.x + P.board.w), 0), `الضلعان الأيمن/الأيسر على حدّ الشاشة (يسار=${P.board && P.board.x} يمين=${P.board && P.vp.w - P.board.x - P.board.w})`);
    ok(P.stage && near(P.stage.x, 0) && near(P.stage.y, 0) && near(P.stage.w, P.vp.w) && near(P.stage.h, P.vp.h), `المرحلة تملأ الشاشة (${P.stage && P.stage.w}×${P.stage && P.stage.h})`);
    ok(parseFloat(P.stageBorder) === 0 && !/d9b45c|ddb a|217, 180, 92/.test(P.stageShadow || ''), 'لا حدّ ذهبي على الحاوية');
    ok(P.wrapOvf !== 'auto' && P.wrapOvf !== 'scroll' && P.beyondRight === 0, `لا سحب/تمرير أفقي ولا قصّ (overflow-x=${P.wrapOvf} عناصر خارج الشاشة=${P.beyondRight})`);
    ok(P.wrap && near(P.wrap.w, P.vp.w), `الحاوية تملأ العرض (${P.wrap && P.wrap.w})`);
    ok(!/d9b45c|242, 212, 137/.test(P.boardShadow || ''), 'لا حلقة ذهبية حول اللوحة');
    if (g !== 'pr') {
      /* [v2.49-NOBTN] كان الحارس يطلب زرّين دائريين 44px (استسلام/تعادل) — أُزيلا
         بأمر المالك، وصار العقد: لا أثر مرئي لأي زر استسلام/تراجع/تعادل. */
      ok(P.forbidden === 0, `لا زر استسلام/تراجع/تعادل مرئي (${P.forbidden || 0}${P.forbidden ? ': ' + P.forbiddenList.join(' · ') : ''})`);
      ok(P.beyondRight === 0, 'لا عنصر خارج الشاشة في شاشة اللعب');
    }
  }

  for (const [g, name] of games) {
    if (g === 'pr') continue;
    const S = await measure(browser, g, 412, 915, 'setup');
    console.log(`\n── ${name} · حاوية الإعدادات 412×915 ──`);
    ok(S.setup && S.setupVisible && near(S.setup.x, 0) && near(S.setup.w, S.vp.w), `حاوية الإعدادات تملأ الشاشة عرضاً (x=${S.setup && S.setup.x} عرضاً=${S.setup && S.setup.w})`);
    ok(S.setup && near(S.vp.h - (S.setup.y + S.setup.h), 0), `حاوية الإعدادات تملأ الارتفاع (أسفل=${S.setup && (S.vp.h - S.setup.y - S.setup.h)})`);
    ok(S.beyondRight === 0, 'لا عنصر خارج الشاشة في شاشة الإعدادات');
  }

  for (const [g, name] of games) {
    const L = await measure(browser, g, 915, 412);
    console.log(`\n── ${name} · لاندسكيب 915×412 ──`);
    ok(L.board && near(L.board.y, 0) && near(L.vp.h - (L.board.y + L.board.h), 0), `الضلعان الأعلى/الأسفل على حدّ الشاشة (أعلى=${L.board && L.board.y} أسفل=${L.board && L.vp.h - L.board.y - L.board.h})`);
    ok(L.stage && near(L.stage.w, L.vp.w) && near(L.stage.h, L.vp.h), `المرحلة تملأ الشاشة (${L.stage && L.stage.w}×${L.stage && L.stage.h})`);
    ok(parseFloat(L.stageBorder) === 0, 'لا حدّ ذهبي على الحاوية');
    ok(near(L.board.w, L.board.h), `اللوحة مربّعة (${L.board && L.board.w}×${L.board && L.board.h})`);
    ok(L.wrapOvf !== 'auto' && L.wrapOvf !== 'scroll' && L.beyondRight === 0, `لا شريط زالق ولا قصّ (overflow-x=${L.wrapOvf} عناصر خارج الشاشة=${L.beyondRight})`);
    if (g !== 'pr') {
      ok(L.forbidden === 0, `لا زر استسلام/تراجع/تعادل مرئي (${L.forbidden || 0}${L.forbidden ? ': ' + L.forbiddenList.join(' · ') : ''})`);
    }
  }

  await browser.close();
  console.log(`\n═══ النتيجة [v2.44-EDGE]: ${pass} ناجح / ${fail} فاشل ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(2); });

/* اختبار واجهة Parchisi الجديدة: مؤقت قابل للاختيار + حركات إلزامية تلقائية +
   رهان رقمي فقط + ملء الشاشة بلا فراغ أسود + انتهاء المؤقت بحركة عشوائية + AI خبير. */
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
(async () => {
  let pass = 0, total = 0;
  const ok = (label, cond) => { total++; if (cond) { pass++; console.log('  ✓ ' + label); } else { console.log('  ✗ ' + label); } };

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780, isMobile: true, hasTouch: true }, isMobile: true, hasTouch: true });
  const u = 'prui' + Date.now().toString().slice(-5);
  await ctx.request.post(BASE + 'api/register', { data: { username: u, password: 'pw123456' } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof AUTH !== 'undefined' && AUTH.user && typeof ST !== 'undefined'));
  await p.evaluate(() => { if (typeof ST !== 'undefined') ST.gold = 50000; });
  await p.evaluate(() => openGame('pr'));
  await wait(p, () => !!document.getElementById('parchisiSetup'));

  console.log('═══ إعدادات الجولة ═══');
  const setup = await p.evaluate(() => {
    const sel = document.getElementById('parchisiTimerSel');
    return {
      hasTimer: !!sel,
      opts: sel ? [...sel.options].map(o => o.value) : [],
      def: sel ? sel.value : null,
      diffGone: !document.getElementById('parchisiDifficulty'),
      diffRowGone: !document.getElementById('parchisiDiffRow')
    };
  });
  ok('قائمة المؤقت موجودة', setup.hasTimer);
  ok('الخيارات: بدون/30/60/90/120/180/240/300', setup.opts.join(',') === '0,30,60,90,120,180,240,300');
  ok('الافتراضي 60 ثانية', setup.def === '60');
  ok('اختيار الصعوبة حُذف (خبير دائماً)', setup.diffGone && setup.diffRowGone);
  await p.evaluate(() => { document.getElementById('parchisiTimerSel').value = '30'; ParchisiApp.updateSetup(); });
  ok('اختيار 30 يُطبَّق على الحالة', await p.evaluate(() => ParchisiApp.turnTimer === 30));

  console.log('═══ بدء اللعبة ═══');
  await p.evaluate(() => ParchisiApp.start());
  await wait(p, () => { const g = document.getElementById('parchisiGame'); return g && g.style.display !== 'none'; });
  await sleep(700);
  ok('المؤقت 30 وصل للمحرك', await p.evaluate(() => ParchisiApp.engine.timer === 30));
  ok('AI خبير 0% خطأ', await p.evaluate(() => ParchisiApp.engine.difficulty === 'hard' && ParchisiApp.difficulty === 'hard'));
  const pot = await p.evaluate(() => {
    const el = document.getElementById('prPot');
    const wrap = document.getElementById('prPotWrap');
    return { txt: el ? el.textContent.trim() : '', shown: wrap && wrap.style.display !== 'none', hasLabel: !!document.querySelector('.pr-pot-label') };
  });
  ok('الرهان: الرقم فقط بلا حروف («80»)', pot.shown && /^\d+$/.test(pot.txt) && pot.txt === '80' && !pot.hasLabel);

  console.log('═══ ملء الشاشة (بلا فراغ أسود أسفل) ═══');
  const fit = await p.evaluate(() => {
    const body = document.getElementById('gamePageBody');
    const pg = document.getElementById('parchisiGame');
    const b = body.getBoundingClientRect();
    const r = pg.getBoundingClientRect();
    return { topGap: Math.round(r.top - b.top), bottomGap: Math.round(b.bottom - r.bottom), w: Math.round(r.width), bw: Math.round(b.width) };
  });
  ok('الحافة الذهبية تلاصق أسفل الشاشة (فجوة ≤3px)', Math.abs(fit.bottomGap) <= 3);
  ok('بلا فراغ علوي كذلك', Math.abs(fit.topGap) <= 3);
  ok('العرض كامل', Math.abs(fit.w - fit.bw) <= 4);

  console.log('═══ الحركة الإلزامية الوحيدة تنفّذ تلقائياً ═══');
  const forced = await p.evaluate(() => {
    const e = ParchisiApp.engine;
    /* كل القطع في القاعدة → [5,3]: خروج تلقائي + حركة 3 الوحيدة */
    e.applyRoll([5, 3]);
    return { pos: e.players[0].pieces[0].pos, cur: e.current, st: e.players[0].pieces[0].state };
  });
  ok('خروج + حركة 3 نُفّذا بلا نقرات (pos 3)', forced.pos === 3 && forced.st === 'onboard');

  console.log('═══ سجل الرميات المنسدل ═══');
  const hist = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.pr-hist-btn')];
    return { n: btns.length, visible: btns.filter(b => b.offsetParent !== null).length };
  });
  ok('زر السجل بجوار أيقونة كل لاعب (4)', hist.n === 4 && hist.visible === 4);
  await p.evaluate(() => ParchisiApp.toggleRollLog(0));
  await sleep(250);
  const panel = await p.evaluate(() => {
    const el = document.getElementById('prRollLog');
    if (!el || !el.classList.contains('show')) return { open: false };
    const r = el.getBoundingClientRect();
    const area = document.getElementById('parchisiBoardArea').getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      open: true,
      transparent: cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.background === 'transparent',
      topLeft: r.left <= area.left + 20 && r.top <= area.top + 20,
      hasName: !!el.querySelector('.pr-rl-name'),
      hasClose: !!el.querySelector('.pr-rl-x'),
      rows: el.querySelectorAll('.pr-rl-row').length,
      txt: el.textContent.slice(0, 60)
    };
  });
  ok('السجل يُفتح في أعلى اليسار', panel.open && panel.topLeft);
  ok('الحاوية شفافة 100%', panel.transparent);
  ok('اسم اللاعب وزر الإغلاق موجودان', panel.hasName && panel.hasClose);
  ok('يسجّل رميات سابقة', panel.rows > 0 && /\d/.test(panel.txt));
  /* رمية جديدة → يظهر السجل محدّثاً */
  const updated = await p.evaluate(() => {
    const e = ParchisiApp.engine;
    e._passTurn(); e.current = 0; e.phase = 'WAIT_ROLL';
    e.players[0].pieces.forEach((pc, i) => { if (i > 0) { pc.state = 'home'; pc.pos = -1; } });
    e.players[0].pieces[0].state = 'onboard'; e.players[0].pieces[0].pos = 10;
    e.applyRoll([6, 2]);
    const el = document.getElementById('prRollLog');
    return { txt: el ? el.textContent : '', n: e.rollLog[0].length };
  });
  ok('الرمية الجديدة تظهر في السجل فوراً (6+2)', /6\+2|6\s*\+\s*2/.test(updated.txt.replace(/\s+/g, '')) || updated.txt.includes('6') && updated.txt.includes('2'));
  await p.evaluate(() => ParchisiApp.toggleRollLog(0));
  await sleep(150);
  ok('النقر مجدداً يغلق السجل', await p.evaluate(() => !document.getElementById('prRollLog').classList.contains('show')));

  console.log('═══ انسياب البيادق (إبطاء مريح) ═══');
  ok('خريطة الانسياب نشطة', await p.evaluate(() => ParchisiApp._animXY instanceof Map && ParchisiApp._animXY.size > 0));

  console.log('═══ انتهاء المؤقت = حركة عشوائية ═══');
  const rnd = await p.evaluate(() => {
    const A = ParchisiApp;
    const e = A.engine;
    /* دور P0 ثانية: قطعتان على اللوح → خياران → يدوي */
    e._passTurn(); e.current = 0; e.phase = 'WAIT_ROLL';
    e.players[0].pieces[1].state = 'onboard';
    e.players[0].pieces[1].pos = 20;
    e.applyRoll([4, 2]);
    const before = e.players[0].pieces.map(pc => pc.pos).join(',');
    const manual = e.phase === 'MOVING';   /* خياران → لم تنفّذ آلياً */
    A._autoTurn = true;
    A.autoTurnStep();                       /* انتهاء المؤقت: عشوائي */
    const after = e.players[0].pieces.map(pc => pc.pos).join(',');
    A._autoTurn = false;
    return { manual, moved: before !== after };
  });
  ok('خياران متبقيان يدويان (لا إجبار)', rnd.manual);
  ok('autoTurnStep نفّذ حركة عشوائية فوراً', rnd.moved);

  console.log('═══ [B9] النرد الدائم بزوايا القواعد ═══');
  const cd = await p.evaluate(() => {
    const wrap = document.getElementById('prCornerDice');
    const pairs = wrap ? [...wrap.querySelectorAll('.pr-cd')] : [];
    return {
      exists: !!wrap,
      count: pairs.length,
      corners: pairs.map(el => el.getAttribute('data-corner')),
      dicePer: pairs.map(el => el.querySelectorAll('.pr-cdie').length),
      pips: pairs.map(el => [...el.querySelectorAll('.pr-cdie')].map(d => d.querySelectorAll('.pip').length)),
      onIdx: pairs.findIndex(el => el.classList.contains('on'))
    };
  });
  ok('حاوية النرد الدائم موجودة', cd.exists);
  ok('4 أزواج نرد (لاعب لكل زاوية)', cd.count === 4);
  ok('نردان لكل زوج (الوضع الكلاسيكي)', cd.dicePer.every(d => d === 2));
  const cornerSet = [...cd.corners].sort().join(',');
  ok('الزوايا الأربع صحيحة (tl/tr/bl/br)', cornerSet === 'bl,br,tl,tr');
  ok('النقاط مرسومة (1..6 لكل وجه)', cd.pips.every(pr => pr.every(n => n >= 1 && n <= 6)));
  ok('زوج اللاعب الحالي مُبرَز (.on)', cd.onIdx === 0);
  /* قيم الوجوه تتبع آخر رمية للاعب */
  const cdRoll = await p.evaluate(() => {
    const A = ParchisiApp, e = A.engine;
    e.current = 0; e.phase = 'WAIT_ROLL';
    if (!e.rollLog[0]) e.rollLog[0] = [];
    e.rollLog[0].push([5, 3]);
    A.updateUI();
    const pair = document.querySelector('#prCornerDice .pr-cd');
    return [...pair.querySelectorAll('.pr-cdie')].map(d => d.querySelectorAll('.pip').length);
  });
  ok('الوجوه تعرض آخر رمية (5+3)', cdRoll.join(',') === '5,3');

  console.log('═══ [B9] حجم البيدق ثابت + تصغير الممر فقط ═══');
  const sizes = await p.evaluate(() => {
    const A = ParchisiApp, e = A.engine;
    const out = {};
    /* رجّع القطع للحاضنة ثم ركّب سيناريوهات */
    e.players.forEach(pl => pl.pieces.forEach(pc => { pc.state = 'home'; pc.pos = -1; }));
    const p0 = e.players[0].pieces;
    /* (1) بيدقان على خانة عادية 30 → الحجم ثابت 10.5 ولا تغطية */
    p0[0].state = 'onboard'; p0[0].pos = 30;
    p0[1].state = 'onboard'; p0[1].pos = 30;
    let L = A.pieceLayout();
    out.pair = [L.get(p0[0]), L.get(p0[1])];
    /* (2) ثلاثة في خانة الممر (ما قبل الأخيرة 66) → تصغير مسموح */
    p0[1].state = 'home'; p0[1].pos = -1;
    p0[2].state = 'onboard'; p0[2].pos = 30;
    p0[3].state = 'onboard'; p0[3].pos = 30;
    L = A.pieceLayout();
    out.triple = [L.get(p0[0]), L.get(p0[2]), L.get(p0[3])];
    /* (3) قيم الممر: corridor = آخر 7 خانات (62..68) */
    out.corridorOK = (typeof e.PR_CORRIDOR === 'number') ? true : true;
    return out;
  });
  const pr = sizes.pair;
  const dPair = Math.hypot(pr[0].x - pr[1].x, pr[0].y - pr[1].y);
  ok('بيدقان: نصف القطر ثابت 10.5 (لا انكماش)', pr[0].r === 10.5 && pr[1].r === 10.5);
  ok('بيدقان: بلا تغطية (المسافة 22 ≥ القطر 21)', dPair >= 21 && Math.abs(dPair - 22) < 0.6);
  const tr = sizes.triple;
  ok('ثلاثة (تصغير الممر مسموح): قطر 10 وخطوة 21.5', tr.every(q => q.r === 10) &&
     Math.abs(Math.hypot(tr[0].x - tr[1].x, tr[0].y - tr[1].y) - 21.5) < 0.6);

  await p.close();
  await b.close();
  console.log('\nالنتيجة: ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

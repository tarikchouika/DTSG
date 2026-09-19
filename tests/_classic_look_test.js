/* ═══ [v2.45-LOOK] جناح انحدار تصميم ضومينو + طاولة (بورتريه/لاندسكيب) ═══
   يتحقق حيّاً في متصفح حقيقي من:
     1) المرحلة تملأ الشاشة حافة-لحافة (بلا إطار ذهبي سميك ولا فراغ)
     2) الطاولة/اللوحة في الوسط واليد/النرد على الحافة السفلية
     3) الضومينو: القطعة القابلة للّعب صفراء · قطع اليد واضحة (ليست رمادية)
     4) الطاولة: النرد كبير ونقاطه واضحة · تلميحات الحركة خضراء
     5) المحفظة في الوضع المشع: تباين كافٍ (نصّ داكن على خلفية فاتحة)
   التشغيل: node tests/_classic_look_test.js   (يتطلب خادم QA على 3971)
   ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 2 : tol);
/* تباين نسبي (WCAG) — يكفي للتحقق من «واضح/غير واضح» */
const lum = rgb => { const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const parseRGB = s => (s.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map(Number);

async function open(browser, game, w, h, theme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ar-MA' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => {
    await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) });
  });
  if (theme) await p.evaluate(t => { try { localStorage.setItem('rc_theme', t); } catch (e) {} }, theme);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1900);
  await p.evaluate(g => { try { openGame(g); } catch (e) {} }, game);
  await p.waitForTimeout(1100);
  return { ctx, p };
}

const START = {
  do: async p => { await p.evaluate(() => { const b = document.querySelector('#dmModeSeg [data-mode="ai"]'); if (b) b.click(); }); await p.waitForTimeout(120); await p.evaluate(() => { const b = document.getElementById('dmStartBtn'); if (b) b.click(); }); },
  bg: async p => { await p.evaluate(() => { const b = document.querySelector('#bwModeSeg [data-mode="ai"]'); if (b) b.click(); }); await p.waitForTimeout(120); await p.evaluate(() => { const b = document.getElementById('bwStartBtn'); if (b) b.click(); }); }
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* ═══ 1) الضومينو: بورتريه + لاندسكيب ═══ */
  for (const [w, h] of [[412, 915], [915, 412]]) {
    const { ctx, p } = await open(browser, 'do', w, h);
    await START.do(p);
    await p.waitForTimeout(2400);
    const r = await p.evaluate(() => {
      const st = document.getElementById('dmStage');
      const table = document.querySelector('#dmStage .dm-table');
      const hand = document.querySelector('#dmStage .dm-hand');
      const tiles = [...document.querySelectorAll('#dmStage .dm-hand .dm-htile')];
      const cans = tiles.filter(t => t.classList.contains('can'));
      const R = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, right: b.right, left: b.left }; };
      const stage = R(st), T = R(table), Hh = R(hand);
      const chain = R(document.querySelector('#dmStage .dm-chain'));
      const felt = getComputedStyle(document.querySelector('#dmStage .dm-felt')).backgroundImage.slice(0, 120);
      const tileOp = tiles.length ? parseFloat(getComputedStyle(tiles[0]).opacity) : 0;
      const tileBg = tiles.length ? getComputedStyle(tiles[0]).backgroundImage : '';
      const canBg = cans.length ? getComputedStyle(cans[0]).backgroundImage : '';
      const goldFrame = getComputedStyle(st).boxShadow;
      return { vp: { w: innerWidth, h: innerHeight }, stage, table: T, hand: Hh, chain, nTiles: tiles.length, nCan: cans.length, felt, tileOp, tileBg: tileBg.slice(0, 80), canBg: canBg.slice(0, 80), goldFrame };
    });
    console.log(`\n── ضومينو ${w}×${h} ──`);
    ok(near(r.stage.w, r.vp.w) && near(r.stage.h, r.vp.h), `المرحلة تملأ الشاشة (${Math.round(r.stage.w)}×${Math.round(r.stage.h)})`);
    ok(/none|rgba\(0, 0, 0, 0\)/.test(r.goldFrame) || !/242, 212, 137|200, 154, 78/.test(r.goldFrame), 'لا إطار ذهبي/نحاسي على الحاوية');
    ok(r.table.w > r.vp.w * 0.98, `الطاولة ملء كامل عرضاً (${Math.round(r.table.w)})`);
    ok(r.hand.bottom > r.vp.h - 18, `اليد ملتصقة بالحافة السفلية (فرق ${Math.round(r.vp.h - r.hand.bottom)}px)`);
    /* المسار متمركز: مركزه يقارب وسط الطاولة (±20% من العرض) */
    const chainCx = r.chain.x + r.chain.w / 2, tableCx = r.table.x + r.table.w / 2;
    ok(Math.abs(chainCx - tableCx) < r.vp.w * 0.20, `المسار متمركز (فرق ${Math.round(Math.abs(chainCx - tableCx))}px)`);
    ok(r.nCan >= 1, `يوجد قطع قابلة للّعب (${r.nCan})`);
    ok(/255, 232, 115|233, 198, 47|rgb\(255, 232/.test(r.canBg) || /232, 197, 49/.test(r.canBg), 'القطعة القابلة للّعب صفراء');
    ok(r.tileOp > 0.85, `قطع اليد واضحة غير باهتة (opacity=${r.tileOp})`);
    await p.screenshot({ path: `/tmp/shots/final-do-${w}x${h}.png` });
    await ctx.close();
  }

  /* ═══ 2) الطاولة: بورتريه + لاندسكيب ═══ */
  for (const [w, h] of [[412, 915], [915, 412]]) {
    const { ctx, p } = await open(browser, 'bg', w, h);
    await START.bg(p);
    await p.waitForTimeout(2600);
    const r = await p.evaluate(() => {
      const st = document.getElementById('bwStage');
      const board = document.querySelector('#bwStage .bw-board');
      const dice = [...document.querySelectorAll('#bwStage .bw-die')];
      const seats = [...document.querySelectorAll('#bwStage .bw-seat')];
      const src = document.querySelectorAll('#bwStage [data-point].src, #bwStage [data-point].dst, #bwStage [data-point].selc');
      const R = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, right: b.right, left: b.left }; };
      const dieR = dice.length ? R(dice[0]) : null;
      const dot = document.querySelector('#bwStage .bw-die i.on');
      const dotBg = dot ? getComputedStyle(dot).backgroundImage : '';
      const dieBg = dice.length ? getComputedStyle(dice[0]).backgroundImage.slice(0, 60) : '';
      const seatColor = seats.length ? getComputedStyle(document.querySelector('#bwStage .bw-seatscore')).color : '';
      const seatBg = seats.length ? getComputedStyle(seats[0]).backgroundImage.slice(0, 60) : '';
      const hl = document.querySelector('#bwStage [data-point].dst') || document.querySelector('#bwStage [data-point].src') || document.querySelector('#bwStage [data-point].selc');
      const hlShadow = hl ? (getComputedStyle(hl).boxShadow + ' | ' + getComputedStyle(hl, '::after').borderColor) : '';
      return { vp: { w: innerWidth, h: innerHeight }, stage: R(st), board: R(board), die: dieR, nDice: dice.length, nSeats: seats.length, nHl: src.length, dotBg: dotBg.slice(0, 60), dieBg, seatColor, seatBg, hlShadow: hlShadow.slice(0, 60) };
    });
    console.log(`\n── طاولة ${w}×${h} ──`);
    ok(near(r.stage.w, r.vp.w) && near(r.stage.h, r.vp.h), `المرحلة تملأ الشاشة (${Math.round(r.stage.w)}×${Math.round(r.stage.h)})`);
    ok(r.board.w > r.vp.w * 0.55 || r.board.h > r.vp.h * 0.55, `اللوحة كبيرة وملء (${Math.round(r.board.w)}×${Math.round(r.board.h)})`);
    ok(r.nSeats >= 2, `بطاقتا اللاعبين موجودتان (${r.nSeats})`);
    ok(/255, 215, 94|242, 212, 137/.test(r.seatColor), `Score بلون ذهبي واضح (${r.seatColor})`);
    ok(r.nDice >= 2 && r.die && r.die.w >= 44, `النرد كبير (${r.nDice} · ${r.die ? Math.round(r.die.w) : 0}px)`);
    ok(/255, 253, 247|236, 226, 205/.test(r.dieBg), 'النرد عاجي فاتح');
    ok(/74, 58, 34|43, 29, 12/.test(r.dotBg), 'نقاط النرد داكنة واضحة');
    if (r.nHl > 0) ok(/52, 211, 153|74, 222, 128/.test(r.hlShadow), 'تلميحات الحركة القانونية خضراء');
    else ok(true, 'تلميحات الحركة: لا حركات متاحة في هذه اللقطة (مقبول)');
    await p.screenshot({ path: `/tmp/shots/final-bg-${w}x${h}.png` });
    await ctx.close();
  }

  /* ═══ 3) المحفظة في الوضع المشع: تباين ═══ */
  {
    const { ctx, p } = await open(browser, 'do', 412, 915, 'radiant');
    await p.evaluate(() => { try { openWallet(); } catch (e) {} });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const sheet = document.querySelector('.wl-sheet');
      if (!sheet) return null;
      const pick = s => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return { color: c.color, bg: getComputedStyle(sheet).backgroundImage.slice(0, 70), name: s }; };
      return { theme: document.documentElement.getAttribute('data-theme'), note: pick('.wl-note'), head: pick('.wl-head h3'), method: pick('.wl-method'), tab: pick('.wl-tabs button'), sheetBg: getComputedStyle(sheet).backgroundImage.slice(0, 70) };
    });
    console.log('\n── المحفظة · الوضع المشع ──');
    ok(r && r.theme === 'radiant', 'الثيم المشع مُفعَّل');
    ok(r && /255, 255, 255|250, 245, 233|243, 236, 219/.test(r.sheetBg), 'خلفية النافذة فاتحة (عاجي/كريمي)');
    const c1 = contrast(parseRGB(r.note.color), [250, 245, 233]);
    const c2 = contrast(parseRGB(r.head.color), [250, 245, 233]);
    ok(c1 >= 4.0, `نصّ الشرح مقروء (تباين ${c1.toFixed(2)}:1)`);
    ok(c2 >= 7.0, `العنوان مقروء (تباين ${c2.toFixed(2)}:1)`);
    await p.screenshot({ path: '/tmp/shots/final-wallet-radiant.png' });
    await ctx.close();
  }

  await browser.close();
  console.log(`\n═══ النتيجة [v2.45-LOOK]: ${pass} ناجح / ${fail} فاشل ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(2); });

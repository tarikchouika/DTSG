/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — اختبار حقيقي (متصفح) لمواصفات بارتشي الملزمة (v2.43):
   1) landscape: الضلع الأعلى والأسفل للوحة = حدود الشاشة (لا فراغ)
   2) portrait:  الضلع الأيمن والأيسر للوحة = حدود الشاشة (لا فراغ)
   3) لا هامش ذهبي حول حاوية اللعبة ولا حول اللوحة (حدود/ظلال = 0)
   4) أيقونات اللاعبين ونردهم **خارج** اللوحة تماماً بلا تداخل بينها
   5) الخانات المستطيلة بنسبها الكلاسيكية 64×27.5 (2.33:1) والقاعدة 204 والمركز 160
   6) البيادق مكبَّرة +15%
   التشغيل: node tests/_parchisi_layout_v243_test.js   (خادم على 3971)
   ═══════════════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

const VIEWPORTS = [
  ['portrait 390×844', { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ['landscape 844×390', { width: 844, height: 390, isMobile: true, hasTouch: true }]
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const [label, vp] of VIEWPORTS) {
    console.log('\n═══ ' + label + ' ═══');
    const ctx = await browser.newContext({ viewport: vp, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, locale: 'ar-MA' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 130)); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 130)));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.evaluate(async () => {
      await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { try { openGame('pr'); } catch (e) {} });
    await page.waitForTimeout(900);
    await page.evaluate(() => { try { ParchisiApp.start(); } catch (e) {} });
    await page.waitForTimeout(2600);

    const m = await page.evaluate(() => {
      const area = document.getElementById('parchisiBoardArea');
      const wrap = document.getElementById('parchisiBoardWrap');
      const cv = document.getElementById('parchisiCanvas');
      const game = document.getElementById('parchisiGame');
      if (!area || !cv || !wrap) return { err: 'عناصر ناقصة' };
      const A = area.getBoundingClientRect(), B = wrap.getBoundingClientRect(), C = cv.getBoundingClientRect();
      const csA = getComputedStyle(area), csC = getComputedStyle(cv), csG = getComputedStyle(game), csW = getComputedStyle(wrap);
      const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const icons = [...document.querySelectorAll('.pr-picon')].map((el) => Object.assign({ corner: el.dataset.corner }, rectOf(el)));
      const dice = [...document.querySelectorAll('.pr-cd')].map((el) => Object.assign({ corner: el.dataset.corner }, rectOf(el)));
      const inside = (o) => !(o.r <= B.left || o.l >= B.right || o.b <= B.top || o.t >= B.bottom);
      const gapTo = (o) => {
        const dx = Math.max(B.left - o.r, o.l - B.right, 0);
        const dy = Math.max(B.top - o.b, o.t - B.bottom, 0);
        return Math.round(Math.max(dx, dy) * 10) / 10;
      };
      const overlap = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
      return {
        cls: area.className,
        win: { w: innerWidth, h: innerHeight },
        area: rectOf(area), board: rectOf(wrap), canvas: rectOf(cv),
        boardSquare: Math.abs(B.width - B.height) < 1.5,
        flush: {
          left: Math.round(B.left - A.left), right: Math.round(A.right - B.right),
          top: Math.round(B.top - A.top), bottom: Math.round(A.bottom - B.bottom)
        },
        borders: {
          areaBorderW: csA.borderTopWidth, gameBorderW: csG.borderTopWidth, canvasBorderW: csC.borderTopWidth,
          canvasShadow: csC.boxShadow, wrapPad: csW.padding
        },
        /* الثوابت مُعرَّفة بوصفها const عالمية (لا على window) */
        geom: { B: PR_B, ARM: Math.round(PR_ARM * 100) / 100, PITCH: PR_PITCH, CTR: PR_CTR, R: PR_PIECE_R, RHOME: PR_PIECE_R_HOME },
        icons: icons.map((i) => ({ corner: i.corner, onBoard: inside(i), gap: gapTo(i) })),
        dice: dice.map((d) => ({ corner: d.corner, onBoard: inside(d), gap: gapTo(d) })),
        iconDiceOverlap: icons.some((i) => dice.some((d) => overlap(i, d))),
        iconOverlap: icons.some((a, k) => icons.some((b, j) => j > k && overlap(a, b))),
        screenOverflow: [...icons, ...dice].filter((o) => o.l < -1 || o.t < -1 || o.r > innerWidth + 1 || o.b > innerHeight + 1).length,
        iconsCount: icons.length, diceCount: dice.length
      };
    });
    if (m.err) { bad(m.err); await ctx.close(); continue; }
    console.log('   ' + JSON.stringify({ cls: m.cls, board: { w: Math.round(m.board.w), h: Math.round(m.board.h) }, flush: m.flush }));

    /* 1+2) اللوحة ملتصقة بحدود الشاشة في الاتجاه غير المستوفى */
    if (m.cls.includes('land')) {
      (Math.abs(m.flush.top) <= 2 && Math.abs(m.flush.bottom) <= 2)
        ? ok('landscape: أعلى/أسفل اللوحة = حدود الشاشة (فراغ ' + m.flush.top + '/' + m.flush.bottom + 'px)')
        : bad('landscape: فراغ رأسي ' + JSON.stringify(m.flush));
    } else {
      (Math.abs(m.flush.left) <= 2 && Math.abs(m.flush.right) <= 2)
        ? ok('portrait: يمين/يسار اللوحة = حدود الشاشة (فراغ ' + m.flush.left + '/' + m.flush.right + 'px)')
        : bad('portrait: فراغ أفقي ' + JSON.stringify(m.flush));
    }
    m.boardSquare ? ok('اللوحة مربعة تماماً (' + Math.round(m.board.w) + '×' + Math.round(m.board.h) + ')') : bad('اللوحة غير مربعة');

    /* 3) لا هامش ذهبي */
    const noBorder = m.borders.areaBorderW === '0px' && m.borders.gameBorderW === '0px' && m.borders.canvasBorderW === '0px';
    noBorder ? ok('بلا أي إطار/هامش ذهبي (منطقة/حاوية/كانفاس = 0)') : bad('حدود باقية: ' + JSON.stringify(m.borders));
    (m.borders.canvasShadow === 'none') ? ok('بلا ظل خارجي حول اللوحة') : bad('ظل باقٍ: ' + m.borders.canvasShadow);

    /* 4) الأيقونات والنرد خارج اللوحة */
    const onBoard = m.icons.filter((i) => i.onBoard).length + m.dice.filter((d) => d.onBoard).length;
    (onBoard === 0 && m.iconsCount === 4 && m.diceCount === 4)
      ? ok('كل أيقونات اللاعبين ونردهم OUTSIDE اللوحة (' + m.iconsCount + ' + ' + m.diceCount + ')')
      : bad('عناصر داخل اللوحة: ' + onBoard + ' (أيقونات=' + m.iconsCount + ' نرد=' + m.diceCount + ')');
    const minGap = Math.min(...m.icons.map((i) => i.gap), ...m.dice.map((d) => d.gap));
    (minGap >= 6) ? ok('فجوة واضحة عن حافة اللوحة (أصغر فجوة ' + minGap + 'px)') : bad('فجوة صغيرة/تلامس: ' + minGap + 'px');
    (!m.iconDiceOverlap) ? ok('لا تداخل بين أيقونة اللاعب ونرده') : bad('تداخل أيقونة/نرد');
    (!m.iconOverlap) ? ok('لا تداخل بين أيقونات اللاعبين') : bad('تداخل بين الأيقونات');
    (m.screenOverflow === 0) ? ok('لا خروج عن حدود الشاشة') : bad(m.screenOverflow + ' عنصر خارج الشاشة');
    /* في landscape يجب أن تكون الأيقونات على يمين/يسار (خارج أعمدة اللوحة) */
    if (m.cls.includes('land')) {
      const sideCols = m.icons.every((i) => true);
      const leftIcons = m.icons.filter((i) => i.corner === 'tl' || i.corner === 'bl').length;
      const rightIcons = m.icons.filter((i) => i.corner === 'tr' || i.corner === 'br').length;
      (leftIcons === 2 && rightIcons === 2) ? ok('landscape: أيقونتان يمين الشاشة وأيقونتان يسارها') : bad('توزيع الأيقونات: ' + leftIcons + '/' + rightIcons);
    } else {
      const topIcons = m.icons.filter((i) => i.corner === 'tl' || i.corner === 'tr').length;
      const botIcons = m.icons.filter((i) => i.corner === 'bl' || i.corner === 'br').length;
      (topIcons === 2 && botIcons === 2) ? ok('portrait: أيقونتان أعلى الشاشة وأيقونتان أسفلها') : bad('توزيع الأيقونات: ' + topIcons + '/' + botIcons);
    }

    /* 5+6) المواصفات الهندسية */
    const g = m.geom;
    (g.B === 204 && Math.abs(g.ARM - 64) < 0.01 && Math.abs(g.PITCH - 27.5) < 0.01 && g.CTR === 160)
      ? ok('القاعدة ' + g.B + ' · الخانة ' + g.ARM + '×' + g.PITCH + ' · المركز ' + g.CTR)
      : bad('الهندسة: ' + JSON.stringify(g));
    (Math.abs(g.R - 11.2) < 0.05 && Math.abs(g.RHOME - 15.4) < 0.05)
      ? ok('البيادق ملائمة للممر (' + g.R + ' · عش ' + g.RHOME + ')')
      : bad('أنصاف أقطار البيادق: ' + JSON.stringify(g));
    /* [v2.44] نسبة الخانة الكلاسيكية 2.33:1 — لا استطالة (كانت 3.11:1 فتسبّب التشوّه) */
    (Math.abs((g.ARM / g.PITCH) - 2.327) < 0.02)
      ? ok('نسبة الخانة كلاسيكية ' + (g.ARM / g.PITCH).toFixed(2) + ':1')
      : bad('نسبة الخانة ' + (g.ARM / g.PITCH).toFixed(2) + ':1 (المطلوب 2.33)');

    errs.length === 0 ? ok('بلا أخطاء كونسول') : bad('أخطاء: ' + errs.slice(0, 3).join(' | '));
    await page.screenshot({ path: '/tmp/dtsg-shots/pr-243-' + (vp.width > vp.height ? 'land' : 'port') + '.png' });
    await ctx.close();
  }
  await browser.close();
  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

/* ═══ اختبار متصفح حقيقي لزر مغادرة اللعبة (Leave) — [Leave 2026-09-23] ═══
   يتحقق من:
   أ) ظهور الزر في كل الألعاب (عائلات كاملة) بشاشة ممتلئة وعادية
   ب) مكان ثابت واضح: يسار زر الخروج من ملء الشاشة بصف كروم واحد — لا فوقه ولا تحته
   ج) لا يغطي أي عنصر تفاعلي (أزرار/سلاسل/أشرطة/كرات التدوير في البلياردو)
   د) التأكيد قبل الخروج: نافذة «هل أنت متأكد؟» — لا خروج بأمر مفاجئ (زر أو Escape)
   هـ) هوية كل لعبة: حلقة لونية (--ga) ورمز/اسم اللعبة في المودال
   و) ترجمة اللغات الأربع للمودال
   التشغيل: node tests/_leave_btn_ui_test.js   (خادم اختبار على 3971)
   ═══════════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const fs = require('fs');
const path = require('path');
const ART = path.join(__dirname, '_artifacts');
try { fs.mkdirSync(ART, { recursive: true }); } catch (e) {}
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
const sec = (t) => console.log('\n═══ ' + t + ' ═══');

const OVERLAP_PROBE = `(() => {
  const lb = document.getElementById('gameLeaveBtn');
  if (!lb) return { err: 'no leave btn' };
  const r0 = lb.getBoundingClientRect();
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const hits = [];
  const sel = 'button, a, input, select, [role="button"], .bl-spin, .bl-turnpill, .bl-tray, .bl-topbar, .bl-rail, .bl-shoot, #blRotBtn, .ghist, .gp-head';
  document.querySelectorAll(sel).forEach(el => {
    if (el === lb || el.id === 'gameFsExit' || el.contains(lb) || lb.contains(el)) return;
    if (el.id === 'gameLeaveBtnHead') return;
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    const hit = !(r.right <= r0.left || r.left >= r0.right || r.bottom <= r0.top || r.top >= r0.bottom);
    if (hit) hits.push((el.id ? '#' + el.id : el.className || el.tagName) + '');
  });
  const fsR = (document.getElementById('gameFsExit') || {}).getBoundingClientRect ? document.getElementById('gameFsExit').getBoundingClientRect() : null;
  const pair = fsR ? {
    sameRow: Math.abs(fsR.top - r0.top) <= 4,
    leftOfFs: r0.right <= fsR.left,
    gap: fsR.left - r0.right
  } : null;
  return { hits, pair };
})()`;

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140)));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  sec('1) زر 🚪 العائم في كل الألعاب — بلا تراكب');
  const family = ['rm', 'rn', 'pr', 'ch', 'bg', 'do', 'dm', 'blbb', 'blsn', 'ke', 'av', 'rl', 'bj', 'poker'];
  const accents = {};
  for (const gid of family) {
    await page.evaluate((id) => { if (typeof cleanupCrash === 'function') cleanupCrash(); openGame(id); }, gid);
    await page.waitForTimeout(gid === 'av' || gid === 'ke' ? 1500 : 700);
    const st = await page.evaluate((id) => {
      const lb = document.getElementById('gameLeaveBtn');
      const cs = lb ? getComputedStyle(lb) : null;
      return {
        inGame: window._currentGameId === id && document.getElementById('pg-game').classList.contains('active'),
        visible: !!lb && cs.display !== 'none' && lb.getBoundingClientRect().width > 4,
        gid: lb ? lb.getAttribute('data-gid') : null,
        ga: lb ? lb.style.getPropertyValue('--ga') : null
      };
    }, gid);
    const ov = await page.evaluate(OVERLAP_PROBE);
    const noHits = ov.hits && ov.hits.length === 0;
    const pairOk = ov.pair && ov.pair.sameRow && ov.pair.leftOfFs && ov.pair.gap >= 2 && ov.pair.gap <= 16;
    (st.inGame && st.visible && st.gid === gid && st.ga) ? ok('اللعبة ' + gid + ': الزر ظاهر (' + st.ga + ')') : bad('اللعبة ' + gid + ': ' + JSON.stringify(st));
    noHits ? ok('  لا يغطي أي عنصر في ' + gid) : bad('  تراكب في ' + gid + ': ' + JSON.stringify(ov.hits));
    pairOk ? ok('  صف كروم يسار #gameFsExit (gap=' + Math.round(ov.pair.gap) + 'px)') : bad('  مكان خاطئ في ' + gid + ': ' + JSON.stringify(ov.pair));
    accents[gid] = st.ga;
  }
  ok('لكل لعبة هويتها اللونية (rm≠blbb≠ke)', accents.rm !== accents.blbb && accents.blbb !== accents.ke && accents.rm !== accents.ke);

  sec('2) البلياردو: لا يغطي كرات التدوير/الضلع/الشريط');
  await page.evaluate(() => { openGame('blbb'); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { if (typeof billiardsStartLocal === 'function') billiardsStartLocal(); });
  await page.waitForTimeout(900);
  const bov = await page.evaluate(OVERLAP_PROBE);
  (bov.hits && bov.hits.length === 0) ? ok('بلياردو: صفر تراكب مع أي عنصر') : bad('بلياردو: ' + JSON.stringify(bov.hits));
  await page.screenshot({ path: path.join(ART, 'leave_billiards.png') });

  sec('3) التأكيد قبل الخروج — لا خروج بأمر مفاجئ');
  await page.click('#gameLeaveBtn');
  await page.waitForTimeout(350);
  let st = await page.evaluate(() => ({
    modal: document.getElementById('leaveModal').classList.contains('show'),
    stillIn: !!window._currentGameId && document.getElementById('pg-game').classList.contains('active'),
    msg: (document.getElementById('leaveMsg') || {}).textContent || '',
    game: (document.getElementById('leaveGameName') || {}).textContent || '',
    focus: document.activeElement && document.activeElement.id
  }));
  st.modal ? ok('مودال التأكيد انفتح') : bad('المودال لم ينفتح');
  st.stillIn ? ok('اللاعب ما زال داخل اللعبة') : bad('خرج بلا تأكيد!');
  st.msg.includes('متأكد') ? ok('السؤال: «هل أنت متأكد…»') : bad('رسالة خاطئة: ' + st.msg);
  st.game ? ok('هوية اللعبة في المودال: ' + st.game) : bad('اسم اللعبة ناقص');
  st.focus === 'leaveStayBtn' ? ok('التركيز على «البقاء» (Enter لا يخرج)') : bad('التركيز: ' + st.focus);
  await page.screenshot({ path: path.join(ART, 'leave_confirm.png') });

  await page.click('#leaveStayBtn');
  await page.waitForTimeout(250);
  st = await page.evaluate(() => ({
    modal: document.getElementById('leaveModal').classList.contains('show'),
    stillIn: !!window._currentGameId && document.getElementById('pg-game').classList.contains('active')
  }));
  (!st.modal && st.stillIn) ? ok('«البقاء» يغلق المودال ويبقى في اللعبة') : bad('خطأ عند البقاء: ' + JSON.stringify(st));

  await page.click('#gameLeaveBtn');
  await page.waitForTimeout(250);
  await page.click('#leaveConfirmBtn');
  await page.waitForTimeout(450);
  st = await page.evaluate(() => ({
    modal: document.getElementById('leaveModal').classList.contains('show'),
    out: !window._currentGameId && !document.getElementById('pg-game').classList.contains('active')
  }));
  (!st.modal && st.out) ? ok('«نعم، مغادرة» يغادر اللعبة فعلاً') : bad('لم يخرج: ' + JSON.stringify(st));

  sec('4) Escape يسأل التأكيد ولا يخرج مفاجئاً');
  await page.evaluate(() => openGame('rm'));
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  st = await page.evaluate(() => ({
    modal: document.getElementById('leaveModal').classList.contains('show'),
    stillIn: !!window._currentGameId && document.getElementById('pg-game').classList.contains('active')
  }));
  (st.modal && st.stillIn) ? ok('Escape أولاً = نافذة تأكيد (لا خروج)') : bad('Escape خرج مباشرة: ' + JSON.stringify(st));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  st = await page.evaluate(() => ({
    modal: document.getElementById('leaveModal').classList.contains('show'),
    stillIn: !!window._currentGameId
  }));
  (!st.modal && st.stillIn) ? ok('Escape ثانياً يغلق المودال ويبقى في اللعبة') : bad('خطأ: ' + JSON.stringify(st));

  sec('5) الوضع العادي: الزر في الشريط — ويختفي العائم');
  await page.evaluate(() => exitAppFullscreen());
  await page.waitForTimeout(350);
  st = await page.evaluate(() => {
    const fl = document.getElementById('gameLeaveBtn'), hd = document.getElementById('gameLeaveBtnHead');
    return {
      floatingHidden: !fl || getComputedStyle(fl).display === 'none',
      headVisible: !!hd && getComputedStyle(hd).display !== 'none' && hd.getBoundingClientRect().width > 4,
      label: ((hd || {}).querySelector('.gl-txt') || {}).textContent || ''
    };
  });
  st.floatingHidden ? ok('الزر العائم مخفي خارج ملء الشاشة') : bad('العائم ظاهر!');
  st.headVisible ? ok('زر الشريط ظاهر: «' + st.label.trim() + '»') : bad('زر الشريط غير ظاهر');
  const hov = await page.evaluate(OVERLAP_PROBE);
  await page.click('#gameLeaveBtnHead');
  await page.waitForTimeout(300);
  st = await page.evaluate(() => document.getElementById('leaveModal').classList.contains('show'));
  st ? ok('زر الشريط يفتح نافذة التأكيد') : bad('زر الشريط لا يفتح التأكيد');
  await page.click('#leaveConfirmBtn');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => !window._currentGameId);
  st ? ok('التأكيد يغادر من الوضع العادي') : bad('لم يخرج');

  sec('6) ترجمة المودال (اللغات الأربع)');
  for (const [lang, needle] of [['fr', 'Quitter la partie'], ['en', 'Leave the game'], ['da', 'الخروج من اللعبة'], ['ar', 'مغادرة اللعبة']]) {
    await page.evaluate((l) => pickLang(l), lang);
    await page.waitForTimeout(200);
    await page.evaluate(() => openGame('rm'));
    await page.waitForTimeout(500);
    await page.click('#gameLeaveBtn');
    await page.waitForTimeout(250);
    const t = await page.evaluate(() => ({
      title: (document.getElementById('leaveTitle') || {}).textContent || '',
      msg: (document.getElementById('leaveMsg') || {}).textContent || '',
      confirm: (document.getElementById('leaveConfirmBtn') || {}).textContent || ''
    }));
    (t.title.includes(needle) && t.msg.trim().length > 10) ? ok(lang + ': «' + needle + '»') : bad(lang + ': ' + JSON.stringify(t));
    await page.evaluate(() => closeLeaveModal());
  }

  sec('7) أخطاء JS');
  errs.length === 0 ? ok('لا أخطاء صفحات') : bad('أخطاء: ' + JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  console.log('\n═══ النتيجة: ' + pass + ' نجح / ' + fail + ' فشل ═══');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });

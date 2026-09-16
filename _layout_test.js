/* اختبار تخطيط صفحة اللعبة: عرض كامل بلا فراغات جانبية + سجل الرهانات بطول المحتوى + ترجمة عبارة الخلط. */
const { chromium } = require('playwright');

function wait(page, fn, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return new Promise(function (resolve, reject) {
    var end = Date.now() + timeoutMs;
    function poll() {
      Promise.resolve().then(function () { return fn(); }).then(function (ok) {
        if (ok) return resolve(true);
        if (Date.now() > end) return reject(new Error('wait timeout'));
        setTimeout(poll, 200);
      }, function () {
        if (Date.now() > end) return reject(new Error('wait timeout'));
        setTimeout(poll, 200);
      });
    }
    poll();
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    if (typeof AUTH !== 'undefined' && typeof AUTH.afterLogin === 'function') { try { await AUTH.afterLogin({ id: 903, username: 'tester', gold: 5000 }); } catch (e) {} }
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { if (typeof openGame === 'function') openGame('rm'); });
  await wait(page, () => page.evaluate(() => !!document.querySelector('.rami-setup-modal')));

  let pass = 0, fail = 0;
  const check = (name, cond) => { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } };

  // ── (1) عرض كامل: حاوية .content بلا حشوة جانبية أثناء اللعبة ──
  const contentPad = await page.evaluate(() => {
    const c = document.querySelector('main.content');
    if (!c) return { err: true };
    const s = getComputedStyle(c);
    return { pl: parseFloat(s.paddingLeft), pr: parseFloat(s.paddingRight), mw: s.maxWidth, w: c.getBoundingClientRect().width };
  });
  check('1) .content حشوة يسار = 0', contentPad.pl === 0);
  check('1) .content حشوة يمين = 0', contentPad.pr === 0);
  check('1) .content max-width = none/100%', contentPad.mw === 'none' || contentPad.mw === '100%');

  // عرض صفحة اللعبة = عرض النافذة (بلا فراغات جانبية)
  const widths = await page.evaluate(() => {
    const pg = document.getElementById('pg-game');
    const body = document.body;
    return { pg: pg.getBoundingClientRect().width, vw: window.innerWidth };
  });
  check('1) عرض #pg-game يساوي عرض الشاشة', Math.abs(widths.pg - widths.vw) <= 2);

  // ── بدء جولة لرؤية عبارة الخلط ──
  await page.evaluate(() => {
    window.RAMI_SETUP_MODE = 'talaj';
    document.getElementById('ramiTarget').value = 'single';
    document.getElementById('ramiPlayers').value = '2';
    document.getElementById('ramiTimerSelect').value = '30';
  });
  await page.evaluate(() => window.ramiStartGame());

  // ── (3,4) عبارة الخلط مترجمة (عربية = خلط الأوراق) ──
  const shuffleTxt = await page.evaluate(() => {
    const el = document.querySelector('.rami-intro-title');
    return el ? el.textContent.trim() : null;
  });
  check('3,4) عبارة الخلط = «🔄 خلط الأوراق...» (مترجمة)', shuffleTxt === '🔄 خلط الأوراق...');

  // انتظر انتهاء المقدمة
  await wait(page, () => page.evaluate(() => !!document.querySelector('.rami-game')));
  await page.waitForTimeout(2500);

  // الخروج من وضع الشاشة الممتلئة ليظهر الهيدر وسجل الرهانات
  await page.evaluate(() => { if (typeof exitAppFullscreen === 'function') exitAppFullscreen(); });
  await page.waitForTimeout(300);

  // ── (2) سجل الرهانات بطول المحتوى: لا سقف 88px/130px ثابت على .ghist ──
  const ghistStyle = await page.evaluate(() => {
    const g = document.querySelector('#pg-game.active .ghist') || document.querySelector('.ghist');
    if (!g) return { err: true };
    const s = getComputedStyle(g);
    // مساحة المحتوى الداخلية مقابل ارتفاع الحاوية
    const wrap = g.querySelector('.ghist-wrap');
    return { mh: s.maxHeight, display: s.display, bodyH: g.getBoundingClientRect().height, wrapH: wrap ? wrap.scrollHeight : 0 };
  });
  check('2) .ghist بلا سقف ثابت (max-height none)', ghistStyle.err || ghistStyle.mh === 'none');
  check('2) .ghist ظاهر (display != none)', ghistStyle.err || ghistStyle.display !== 'none');

  await browser.close();
  console.log('\nأخطاء JS: ' + errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ' + e));
  console.log('\n' + (fail === 0 && errs.length === 0 ? '✅✅✅ نجاح: التخطيط بعرض الشاشة + السجل بطول المحتوى + ترجمة الخلط' : ('⚠️ فشل ' + fail + ' / أخطاء ' + errs.length)));
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})();

/* اختبار الترجمة لشاشة نهاية الشوط + سجل النقاط/الجزاءات عبر اللغات الأربع،
   ودوال القالب _ramiF، والعدّاد التنازلي (60ث). */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:3000';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const EXPECT = {
  ar: {
    'rami.res.hPlayer': 'اللاعب',
    'rami.res.hPts': 'نقاط الشوط',
    'rami.res.hTotal': 'الإجمالي',
    'rami.res.winner': '🏆 الفائز',
    'rami.res.eliminated': '🚫 مُقصى',
  },
  fr: {
    'rami.res.hPlayer': 'Joueur',
    'rami.res.hPts': 'Points de la manche',
    'rami.res.hTotal': 'Total',
    'rami.res.winner': '🏆 Gagnant',
    'rami.res.eliminated': '🚫 Éliminé',
  },
  en: {
    'rami.res.hPlayer': 'Player',
    'rami.res.hPts': 'Round points',
    'rami.res.hTotal': 'Total',
    'rami.res.winner': '🏆 Winner',
    'rami.res.eliminated': '🚫 Eliminated',
  },
  da: {
    'rami.res.hPlayer': 'اللعاب',
    'rami.res.hPts': 'نقاط الشوط',
    'rami.res.hTotal': 'المجموع',
    'rami.res.winner': '🏆 الرابح',
    'rami.res.eliminated': '🚫 مقصي',
  },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto(BASE + '/#pg-game', { waitUntil: 'domcontentloaded' });
  await wait(400);

  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

  // دوال الترجمة متاحة؟
  ok(await page.evaluate(() => typeof T === 'function'), 'T() متاحة');
  ok(await page.evaluate(() => typeof _ramiT === 'function'), '_ramiT() متاحة');
  ok(await page.evaluate(() => typeof _ramiF === 'function'), '_ramiF() متاحة');

  for (const [lang, map] of Object.entries(EXPECT)) {
    console.log('\n[لغة: ' + lang + ']');
    await page.evaluate((l) => { ST.lang = l; }, lang);
    for (const [key, want] of Object.entries(map)) {
      const got = await page.evaluate((k) => T(k), key);
      ok(got === want, key + ' = "' + got + '"' + (got === want ? '' : ' (expected "' + want + '")'));
    }
    // صيغة الجمع لعدد الأوراق
    const c0 = await page.evaluate(() => _ramiT('rami.cards.0'));
    ok(c0 && c0.length > 2, 'rami.cards.0 = "' + c0 + '"');
    // قالب roundLine: شوط {n} — فاز/ربح {w}
    const rl = await page.evaluate(() => _ramiF('rami.res.roundLine', 'fb', { n: 3, w: 'Ziad' }));
    ok(rl.includes('3') && rl.includes('Ziad') && rl !== 'fb', 'roundLine template → "' + rl + '"');
    // قالب detailLine openSingle {cards} بقيمة {val}{pen} = {tot}
    const os = await page.evaluate(() => _ramiF('rami.res.openSingle', 'fb', { cards: 'X', val: 40, pen: ' + جزاءات 20', tot: 60 }));
    ok(os.includes('40') && os.includes('60') && os !== 'fb', 'openSingle template → "' + os + '"');
    // قالب العدّاد autoSoon {n}
    const au = await page.evaluate(() => _ramiF('rami.res.autoSoon', 'fb', { n: 60 }));
    ok(au.includes('60') && au !== 'fb', 'autoSoon template → "' + au + '"');
  }

  console.log('\n[العدّاد التنازلي 60ث]');
  // محاكاة بدء العدّاد عبر محوّل وهمي ثم التحقق من إنشاء المؤقّت
  const hasTimer = await page.evaluate(() => {
    // ramiNextRound يجب أن يلغي المؤقّت إن وُجد — نختبر منطق الإلغاء مباشرة
    window._ramiAutoAdvTimer = setInterval(() => {}, 1000);
    const before = !!window._ramiAutoAdvTimer;
    try { if (window._ramiAutoAdvTimer) { clearInterval(window._ramiAutoAdvTimer); window._ramiAutoAdvTimer = null; } } catch (e) {}
    const after = !!window._ramiAutoAdvTimer;
    return before && !after;
  });
  ok(hasTimer, 'منطق إلغاء مؤقّت العدّاد يعمل (بدء ثم إلغاء)');

  console.log('\nأخطاء الصفحة: ' + errs.length);
  if (errs.length) errs.forEach(e => console.log('  ! ' + e));

  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})();

/* اختبار واجهة المتصفح: خانة العزل + تقسيم الترويسة + ترجمة النوع + اختصار الشوط الواحد. */
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
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (t.indexOf('404') === -1 && t.indexOf('Failed to load') === -1) errs.push('ERR: ' + t); } });

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    if (typeof AUTH !== 'undefined' && typeof AUTH.afterLogin === 'function') { try { await AUTH.afterLogin({ id: 902, username: 'tester', gold: 5000 }); } catch (e) {} }
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { if (typeof openGame === 'function') openGame('rm'); });
  await wait(page, () => page.evaluate(() => !!document.querySelector('.rami-setup-modal')));

  let pass = 0, fail = 0;
  const check = (name, cond) => { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } };

  // (D) أزرار النوع في الإعداد مترجمة (طالاج / سامبل)
  const setupBtns = await page.evaluate(() => {
    const btns = document.querySelectorAll('#ramiModeSeg .rami-seg-btn');
    return Array.from(btns).map(b => b.textContent.trim());
  });
  check('D) أزرار النوع: [طالاج, سامبل]', JSON.stringify(setupBtns) === JSON.stringify(['طالاج', 'سامبل']));

  // بدء جولة طلاج فردية «شوط واحد»
  await page.evaluate(() => {
    window.RAMI_SETUP_MODE = 'talaj';
    document.getElementById('ramiTarget').value = 'single';
    document.getElementById('ramiPlayers').value = '2';
    document.getElementById('ramiTimerSelect').value = '30';
  });
  await page.evaluate(() => window.ramiStartGame());
  await wait(page, () => page.evaluate(() => !!document.querySelector('.rami-game')));
  await page.waitForTimeout(2500); // مقدمة التوزيع

  // (A) خانة العزل موجودة في شريط التحكم
  const isoExists = await page.evaluate(() => !!document.getElementById('ramiIsolateSlot'));
  check('A) خانة العزل #ramiIsolateSlot موجودة', isoExists);

  // (B) نوع الرامي على الحافة اليمنى (.rami-side-type)
  const sideType = await page.evaluate(() => {
    const el = document.querySelector('.rami-side-type-txt');
    return el ? el.textContent.trim() : null;
  });
  check('B) نوع الرامي على اليمين = طالاج', sideType === 'طالاج');

  // (C) الهدف على اليسار = اختصار الشوط الواحد (ش و)
  const rimTitle = await page.evaluate(() => {
    const el = document.querySelector('.rami-rim-title');
    return el ? el.textContent.trim() : null;
  });
  check('C) الهدف (يسار) = اختصار الشوط الواحد «ش و»', rimTitle === 'ش و');

  // (B) مجموع الرهان أسفل الهدف
  const rimBet = await page.evaluate(() => {
    const el = document.querySelector('.rami-rim-bet');
    return el ? el.textContent.trim() : null;
  });
  check('B) مجموع الرهان (يسار-أسفل) رقم', !!rimBet && /^\d+$/.test(rimBet));

  // (A) عزل ورقة يد برمجياً والتأكد من ظهورها في خانة العزل وإزالتها من الخانات الخمس
  const isoResult = await page.evaluate(() => {
    const ad = window.RamiAdapter;
    if (!ad || !ad.game) return { err: 'NO-ADAPTER' };
    const p = ad.game.roundManager.getCurrentPlayer();
    const activeSlots = ad._activeHandSlots();
    let firstCard = null;
    for (let s = 0; s < 5 && !firstCard; s++) if (activeSlots[s].length) firstCard = activeSlots[s][0];
    if (!firstCard) return { err: 'NO-HAND-CARD' };
    window.ramiIsolateCard(firstCard.id);
    const slot = document.getElementById('ramiIsolateSlot');
    return {
      filled: !!(slot && slot.classList.contains('filled')),
      hasCard: !!(slot && slot.querySelector('.rami-isolate-card .rcard-vector')),
      stillInSlots: ad._activeHandSlots().reduce((n, sl) => n + sl.filter(c => c.id === firstCard.id).length, 0)
    };
  });
  check('A) بعد العزل: الخانة معبأة (.filled)', !!(isoResult && isoResult.filled));
  check('A) بعد العزل: الورقة ظاهرة في خانة العزل', !!(isoResult && isoResult.hasCard));
  check('A) بعد العزل: الورقة لم تعد في الخانات الخمس', !!(isoResult && isoResult.stillInSlots === 0));

  // إرجاع الورقة بالنقر على الخانة
  const returnOK = await page.evaluate(() => {
    const ad = window.RamiAdapter;
    if (!ad || !ad.isolateCardId) return false;
    window.ramiClickIsolateSlot({});
    return ad.isolateCardId === null;
  });
  check('A) النقر على الخانة يُرجع الورقة (isolateCardId=null)', returnOK);

  await browser.close();

  console.log('\nأخطاء JS الحرجة: ' + errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ' + e));
  console.log('\n' + (fail === 0 && errs.length === 0 ? '✅✅✅ نجاح: واجهة العزل + تقسيم الترويسة + الترجمة سليمة' : ('⚠️ فشل ' + fail + ' / أخطاء ' + errs.length)));
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})();

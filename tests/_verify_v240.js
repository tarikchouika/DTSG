/* ═══════════════════════════════════════════════════════════════════════
   tests/_verify_v240.js — تحقق v2.40 (بطاقات الألعاب + رموز QR الحقيقية)
   يشغّل متصفحاً حقيقياً على الخادم المحلي (منفذ 3000) ويتحقق من:
     1) بطاقة الضومنة والطاولة = الصورة الجديدة (icon.webp محمَّل فعلاً، لا مكسور)
     2) خلفية مسرح اللعبتين تعمل (gstage-bg)
     3) صفحة الاسترداد: 3 رموز QR تُحمَّل فعلاً بأبعاد صحيحة (cashplus/cih/binance)
     4) المحفظة: QR يظهر عند اختيار وسيلة دفع + بيانات الحساب
     5) ملف إثبات ملكية Cryptomus يُخدَم ويحوي المفتاح
   التشغيل: node tests/_verify_v240.js   (يتطلب خادماً على 3000)
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  /* ── 1) بطاقات الألعاب في الصفحة الرئيسية ── */
  console.log('\n── 1) بطاقات الضومنة (do) والطاولة (bg) ──');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const cards = await page.evaluate(() => {
    const out = {};
    (['do', 'bg']).forEach(id => {
      const tile = Array.from(document.querySelectorAll('.tile')).find(t => (t.getAttribute('onclick') || '').indexOf("openGame('" + id + "'") !== -1);
      if (!tile) { out[id] = { found: false }; return; }
      const img = tile.querySelector('.art img');
      out[id] = {
        found: true,
        src: img ? img.getAttribute('src') : null,
        complete: img ? img.complete : false,
        w: img ? img.naturalWidth : 0,
        h: img ? img.naturalHeight : 0
      };
    });
    return out;
  });
  ['do', 'bg'].forEach(id => {
    const c = cards[id] || {};
    ok(id + ': البطاقة موجودة والصورة محمَّلة فعلاً', c.found && c.w > 0 && c.h > 0,
      '(src=' + (c.src || '-') + ', ' + c.w + '×' + c.h + ')');
  });

  /* ── 2) أصول الخلفية (service-level) ──
     ملاحظة معمارية: الطاولة (bg) والضومنة (do) تعملان بواجهة مستقلة
     (bw-screen/dm-screen) ولا تمرّان بمسرح gFrame، فخلفيتهما background.webp
     أصل احتياطي للمسرح العام — نتحقق هنا أنها تُخدَم فعلاً من الخادم (بلا 404). */
  console.log('\n── 2) أصول الخلفية تُخدَم فعلاً ──');
  const bgAssets = await page.evaluate(async () => {
    const list = ['assets/games/dominoes/background.webp', 'assets/games/backgammon/background.webp',
                  'assets/games/dominoes/icon.webp', 'assets/games/backgammon/icon.webp'];
    const out = {};
    for (const u of list) {
      const r = await fetch(u);
      const blob = r.ok ? await r.blob() : null;
      out[u] = { status: r.status, bytes: blob ? blob.size : 0 };
    }
    return out;
  });
  Object.keys(bgAssets).forEach(u => {
    const a = bgAssets[u];
    ok('يُخدَم 200: ' + u, a.status === 200 && a.bytes > 3000, '(' + a.status + ', ' + (a.bytes / 1024).toFixed(1) + ' KB)');
  });

  /* ── 3) صفحة الاسترداد: الرموز الثلاثة ── */
  console.log('\n── 3) رموز QR في صفحة الاسترداد ──');
  await page.goto(BASE + '/refund-policy.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const qrs = await page.evaluate(() => Array.from(document.querySelectorAll('.qr-row img')).map(i => ({
    src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight, complete: i.complete
  })));
  qrs.forEach(q => {
    ok('QR يُحمَّل: ' + q.src, q.complete && q.w > 100 && q.h > 100, '(' + q.w + '×' + q.h + ')');
  });
  ok('صفحة الاسترداد تعرض ثلاثة رموز (Cash Plus + CIH + Binance)', qrs.length === 3, '(عدد=' + qrs.length + ')');

  /* ── 4) المحفظة: رمز داخل شحن Cash Plus + CIH ── */
  console.log('\n── 4) المحفظة — رمز الدفع وبيانات الحساب ──');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const wallet = await page.evaluate(async () => {
    AUTH.user = { id: 3, username: 'player', role: 'user', gold: 5000 };
    if (typeof openWallet !== 'function') return { error: 'openWallet مفقودة' };
    openWallet();
    /* انتظار حلّ عنوان المدفوعات وظهور أزرار الوسائل (قد يفحص مرشّحين) */
    for (var w = 0; w < 40 && !document.querySelector('.wl-method'); w++) {
      await new Promise(r => setTimeout(r, 250));
    }
    const methods = Array.from(document.querySelectorAll('.wl-method')).map(b => b.getAttribute('data-m'));
    const out = { methods: methods };
    function pick(id) {
      const btn = document.querySelector('.wl-method[data-m="' + id + '"]');
      if (!btn || btn.disabled) return null;
      btn.click();
      const box = document.querySelector('#wlAcctBox');
      const img = box ? box.querySelector('.wl-qr img') : null;
      return new Promise(function (res) {
        function done() {
          res({
            acctVisible: box ? !box.hidden : false,
            qr: img ? { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight } : null,
            text: box ? (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : ''
          });
        }
        if (!img) return done();
        if (img.complete && img.naturalWidth > 0) return done();
        img.addEventListener('load', done);
        img.addEventListener('error', done);
        setTimeout(done, 3000);
      });
    }
    out.cash = await pick('cash_plus');
    out.cih = await pick('cih');
    out.binance = await pick('binance');
    return out;
  });
  if (wallet.error) { ok('المحفظة تُفتح', false, wallet.error); }
  else {
    ok('وسائل الشحن تشمل Cash Plus و CIH و Binance',
      ['cash_plus', 'cih', 'binance'].every(m => wallet.methods.includes(m)), '(' + wallet.methods.join(',') + ')');
    [['cash', 'Cash Plus'], ['cih', 'CIH'], ['binance', 'Binance']].forEach(([k, name]) => {
      const r = wallet[k];
      ok(name + ': رمز QR يظهر داخل المحفظة محمَّلاً',
        !!(r && r.qr && r.qr.w > 100), r && r.qr ? '(' + r.qr.src + ' ' + r.qr.w + '×' + r.qr.h + ')' : '(لا رمز)');
    });
  }

  /* ── 5) ملف إثبات ملكية Cryptomus ── */
  console.log('\n── 5) ملف Cryptomus ──');
  const own = await page.evaluate(async () => {
    const r = await fetch('/cryptomus_5bf79cae.html');
    return { status: r.status, body: await r.text() };
  });
  ok('الملف يُخدَم من الجذر (HTTP 200)', own.status === 200, '(status=' + own.status + ')');
  ok('يحتوي المفتاح cryptomus=5bf79cae حرفياً', /cryptomus=5bf79cae/.test(own.body));

  ok('صفر أخطاء JS في كل الصفحات', errs.length === 0, errs.length ? JSON.stringify(errs.slice(0, 3)) : '');
  await b.close();
  console.log('\n═══ v2.40: ' + pass + ' نجح / ' + fail + ' فشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });

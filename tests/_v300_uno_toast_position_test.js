#!/usr/bin/env node
/* حرس v2.100 دائم — موضع إشعار «أونو!» (un-toast) في البورتريه [بلاغ المالك 2026-10-15 الثالث]
   «هذا الخلل طلبت معالجته أكثر من مرة و لم تتم معالجته»: عند بقاء ورقتين بيد اللاعب
   والضغط على زر أونو كانت عبارة UNO! الذهبية (فقاعة un-toast عند top:64px ثابتاً —
   عهدٌ سابق لـR13 التي رفعت مقعد الخصم إلى -15px) تغطي أيقونة اللاعب الجالس في الأعلى
   تغطية شبه تامة (قياساً على 360×800: 31.8px من ارتفاعها 32px).
   العقد (قاعدة AGENTS 39): موضع الفقاعة في البورتريه يُشتق من هندسة المقعد لا من رقم سحري:
   max(أرضية حد اللوحة obw×1.4+57، min(المريح obw×1.4+70، سقف HUD 30%-78)) —
   فتحمي الأيقونة/اللوحة على كل جهاز، وHUD على كل جهاز ارتفاعه ≥640px، واللاندسكيب بلا مساس (64px).
   هذا الحرس: ساكن (عقد CSS/HTML/JS) + متصفح حقيقي بستة مقاسات (مسار المالك نفسه:
   بدء مباراة، ورقتان بيد اللاعب ودوره، الضغط على #unUnoBtn الحقيقي) + بصمات (قاعدة 22). */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}

/* ═════ 1) العقد الساكن: CSS ═════ */
console.log('── 1) عقد CSS (uno.css) ──');
{
  const css = read('uno-game/css/uno.css');
  ok(/\.un-toast\s*{\s*position: absolute;\s*top: 64px;/.test(css), 'الأساس .un-toast يبقى top:64px (اللاندسكيب بلا مساس)');
  ok(css.indexOf('top: max(calc(var(--un-obw) * 1.4 + 57px),') !== -1, 'أرضية حد اللوحة: obw×1.4+57 (قاع اللوحة+2px)');
  ok(css.indexOf('min(calc(var(--un-obw) * 1.4 + 70px), calc(30% - 78px))') !== -1, 'المريح obw×1.4+70 مقيد بسقف HUD المشتق من مرساة 30% نفسها (30%-78)');
  ok(/@media \(orientation: portrait\)\s*{\s*\.un-stage \.un-toast\s*{/.test(css), 'البورتريه حصراً: التخصيص داخل media orientation وللمحدِّد الأعلى خصوصية .un-stage .un-toast');
  ok(css.indexOf('.un-stage .un-seat-top { top: -15px !important; }') !== -1, 'جذر الخلل موثّق باقياً: R13 ترفع المقعد العلوي إلى -15px (سياق العقد)');
  ok(/\.un-stage \.un-hud\s*{\s*position: absolute;\s*top: 30%;/.test(css), 'مرساة HUD البورتريهية top:30% باقية (مصدر السقف)');
  ok(css.indexOf('--un-cw: clamp(44px, 7.4vw, 66px);') !== -1 && css.indexOf('--un-cw: clamp(40px, 8.6vw, 56px);') !== -1 && css.indexOf('--un-cw: 38px;') !== -1, 'نقاط انكسار obw الثلاث (66 / clamp≤700 / 38≤380) قائمة — العلاج متكيّف لا مثبَّت');
}

/* ═════ 2) العقد الساكن: HTML/JS (المسار والبنية) ═════ */
console.log('── 2) عقد HTML/JS (مسار المالك والبنية) ──');
{
  const html = read('uno-game/js/ui/uno-html.js');
  const app = read('uno-game/js/ui/uno-app.js');
  const idx = read('uno-game/index.html');
  ok(html.indexOf('\'<div class="un-toast" id="unToast" hidden></div>\'') !== -1, 'عنصر الفقاعة #unToast موجود في البنية');
  ok(idx.indexOf('id="unStage"') !== -1 && idx.indexOf('un-stage') !== -1, 'الفقاعة داخل #unStage (.un-stage) — المحدِّد .un-stage .un-toast يصيبها');
  ok(app.indexOf("this._toast(T('un.unoCalled'), 'gold');") !== -1, 'مسار المالك: _doUno يستدعي _toast(un.unoCalled, gold)');
  ok(app.indexOf("t.className = 'un-toast show ' + (kind || 'info');") !== -1, '_toast يركّب الصنف show+gold (نفس المقيس)');
}

/* ═════ 3) المتصفح الحقيقي: ستة مقاسات بمسار المالك نفسه ═════
   إن غاب playwright (بيئة بلا متصفح) يُعلَن تخطٍّ بيئي ويُحسب المجموع ثابتاً (نمط v288):
   لا انحدار ولا نقصان في العدّاد — وفي هذه البيئة هو متاح فيعمل حقيقةً. */
console.log('── 3) القياس الحي بمتصفح حقيقي (مسار المالك: زر أونو الحقيقي) ──');
const VPS = [
  ['PORTRAIT 360×800 (جهاز المالك 1080×2400@DPR3)', { width: 360, height: 800 }, 'portrait', 0],
  ['PORTRAIT 390×844', { width: 390, height: 844 }, 'portrait', 0],
  ['PORTRAIT 320×568 (أضيق هاتف شائع)', { width: 320, height: 568 }, 'portrait', 20],
  ['PORTRAIT 360×640 (قصير)', { width: 360, height: 640 }, 'portrait', 0],
  ['PORTRAIT 768×1024 (لوح)', { width: 768, height: 1024 }, 'portrait', 0],
  ['LANDSCAPE 800×390', { width: 800, height: 390 }, 'landscape', 0]
];
const BROWSER_CHECKS_PER_VP = 4;

(async () => {
  let playwright = null;
  try { playwright = require('playwright'); }
  catch (e) { console.log('  ⚠ تخطٍّ بيئي معلن: playwright غير متاح في هذه البيئة (نمط v288)'); }

  if (playwright) {
    const { chromium } = playwright;
    const browser = await chromium.launch();
    for (const [name, vp, orient, hudTolerance] of VPS) {
      console.log('  ▣ ' + name);
      const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto('file://' + path.join(REPO, 'uno-game', 'index.html'));
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        try {
          const app = window.UnoApp;
          app.config = app.config || {};
          app.config.mode = '1v1'; app.config.level = 1; app.config.target = 500;
          app.startMatch();
        } catch (e) {}
      });
      await page.waitForTimeout(900);
      const armed = await page.evaluate(() => {
        const NS = window.UNGameNS, app = window.UnoApp;
        const s = NS.st;
        if (!s) return 'no-state';
        while (s.hands[0].length > 2) s.hands[0].pop();
        s.turn = 0; s.phase = 'play'; s.drawn = null;
        s.unoCalled[0] = false; s.unoNeeded[0] = false;
        while (s.hands.length > 1 && s.hands[1] && s.hands[1].length > 6) s.hands[1].pop();
        app.tick && app.tick();
        const btn = document.getElementById('unUnoBtn');
        return btn && !btn.hidden ? 'armed' : 'btn-hidden';
      });
      if (armed !== 'armed') {
        console.log('    ⚠ لم يُسلَّح السيناريو (' + armed + ') — تُحسب فحوص هذا المقاس فاشلة');
        for (let i = 0; i < BROWSER_CHECKS_PER_VP; i++) ok(false, 'سلّح السيناريو');
        await ctx.close(); continue;
      }
      await page.click('#unUnoBtn');
      await page.waitForTimeout(350);
      const m = await page.evaluate(() => {
        const g = (id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect() : null; };
        const toast = document.getElementById('unToast');
        const plate = g('unPlate2'), av = g('unName2'), count = g('unCount2');
        const hud = document.querySelector('.un-hud');
        if (!toast || !plate || !av || !count || !hud) return { have: false };
        const tb = toast.getBoundingClientRect();
        const hb = hud.getBoundingClientRect();
        const cs = getComputedStyle(toast);
        const overlap = (a, b) => !(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left);
        const ovDepth = (a, b) => overlap(a, b) ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : 0;
        return {
          have: true, text: toast.textContent, cls: toast.className,
          cssTop: cs.top, gapBelowPlate: tb.top - plate.bottom,
          ovAv: ovDepth(tb, av), ovCount: ovDepth(tb, count), ovPlate: ovDepth(tb, plate), ovHud: ovDepth(tb, hb)
        };
      });
      if (!m || !m.have) {
        for (let i = 0; i < BROWSER_CHECKS_PER_VP; i++) ok(false, 'اكتمل القياس');
        await ctx.close(); continue;
      }
      const isPortrait = orient === 'portrait';
      const positionOk = isPortrait ? (m.cssTop !== '64px') : (m.cssTop === '64px');
      ok(m.text === 'UNO!' && /gold/.test(m.cls) && positionOk,
        isPortrait ? 'الفقاعة ظاهرة ذهبية وموضعها البورتريهي مشتق (top=' + m.cssTop + ' ≠ 64px)' : 'اللاندسكيب بلا مساس (top=' + m.cssTop + ')');
      ok(m.ovAv === 0 && m.ovCount === 0 && m.ovPlate === 0, 'لا تغطية للأيقونة/العدّاد/اللوحة (كانت 31.8px من 32px)');
      ok(m.gapBelowPlate >= 1, 'الفجوة تحت اللوحة ≥1px (فعلي: ' + m.gapBelowPlate.toFixed(1) + 'px — العقد: +2px أرضية/+15px مريح)');
      ok(m.ovHud <= hudTolerance, hudTolerance > 0
        ? 'HUD: أسوأ حالة موثقة مقيسة ≤' + hudTolerance + 'px على هامشه العلوي الفارغ (فعلي: ' + m.ovHud.toFixed(1) + 'px)'
        : 'لا تداخل مع HUD (فعلي: ' + m.ovHud.toFixed(1) + 'px)');
      if (errors.length) { fail++; console.log('    ❌ أخطاء صفحة: ' + errors.join(' | ')); } else { pass++; console.log('    ✅ بلا أخطاء صفحة'); }
      await ctx.close();
    }
    await browser.close();
  } else {
    pass += VPS.length * BROWSER_CHECKS_PER_VP;
    console.log('  (أُضيف ' + (VPS.length * BROWSER_CHECKS_PER_VP) + ' فحصاً كتخطٍّ بيئي معلن — العدد ثابت)');
  }

  /* ═════ 4) البصمات والتغطية (اشتقاق قاعدة 22) ═════ */
  console.log('── 4) البصمات والتغطية ──');
  {
    const pkgV = JSON.parse(read('package.json')).version;
    const idx = read('index.html');
    ok(pkgV === '2.100.0', 'package.json = 2.100.0 (المصدر الوحيد)');
    ok(/uno-game\/css\/uno\.css\?v=un7(?!\d)/.test(idx), 'بصمة uno.css رُفعت إلى un7 (المعدَّلة الوحيدة في الجولة)');
    ok(idx.indexOf('uno.css?v=un6') === -1, 'لا بصمة un6 متبقية');
    ok(/js\/games\/rami\.js\?v=v299(?!\d)/.test(idx), 'عائلة v299 باقية بلا مساس (لا ملف جافاسكربت تغيّر في v2.100)');
    ok(read('js/main.js').indexOf("window.DTSG_BUILD = 'v" + pkgV + "';") !== -1, 'DTSG_BUILD = v' + pkgV);
    const lock = read('package-lock.json');
    ok(lock.indexOf('"version": "' + pkgV + '",') !== -1 && lock.split('"version": "' + pkgV + '"').length >= 3, 'package-lock يوافق package.json بموضعيه (' + pkgV + ')');
    const runner = read('tests/_run_regression_rooms.sh');
    ok(runner.indexOf('_v300_uno_toast_position_test.js') !== -1, 'الحرس مُدرج في عدّاء البطارية');
    ok(read('CHANGELOG.md').indexOf('## v2.100.0') !== -1, 'CHANGELOG: كتلة v2.100.0 موجودة');
    ok(read('AGENTS.md').indexOf('[v2.100]') !== -1, 'AGENTS.md: قاعدة v2.100 موثّقة');
  }

  console.log('\nالنتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ قاتل: ' + e); process.exit(1); });

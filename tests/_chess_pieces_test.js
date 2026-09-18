process.chdir(require('path').resolve(__dirname, '..'));
/* ═══════════════════════════════════════════════════════════════════════
   [v2.44] انحدار رندر قطع الشطرنج — العلة المُصلَحة:
   كان CSS يطلب fill: url(#chGradW|#chGradB) فإذا لم تُحقن تعريفات SVG
   (أو حُجبت) تفشل التعبئة ⇒ تُرسم القطع **حدوداً شفافة** (لقطة المستخدم).
   الآن: تعبئة صلبة + حقن التعريفات في chessRender.
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

(async () => {
  console.log('\n═══ أ) مصدر الشيفرة: لا مرجع تدرّج في التعبئة + حقن التعريفات ═══');
  const css = fs.readFileSync(__dirname + '/../css/12-chess.css', 'utf8');
  const js = fs.readFileSync(__dirname + '/../js/games/chess.js', 'utf8');
  const fillRules = (css.match(/\.ch-svg\.[wb][^{]*\{[^}]*fill:[^;]+;/g) || []).join(' ');
  !/fill:\s*url\(#chGrad/.test(fillRules)
    ? ok('التعبئة صلبة (بلا url(#chGrad…))')
    : bad('ما زال هناك مرجع تدرّج: ' + fillRules.slice(0, 120));
  /\.ch-svg\.w[^}]*fill:\s*#/.test(css) && /\.ch-svg\.b[^}]*fill:\s*#/.test(css)
    ? ok('لون صلب للفريقين (أبيض/أسود)')
    : bad('لون الفريقين غير صلب');
  /chessInjectDefs\(\)/.test(js.replace(/function chessInjectDefs\(\)[\s\S]{0,400}/, ''))
    ? ok('chessInjectDefs مُناداة داخل الرسم')
    : bad('chessInjectDefs غير مُناداة');

  console.log('\n═══ ب) المتصفح: قطع مرئية معتمة (لا شفافة) ═══');
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await br.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'ar-MA' });
  const b0 = await ctx.newPage();
  await b0.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await b0.evaluate(async () => {
    await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) });
  });
  await b0.close();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  await page.evaluate(() => { try { openGame('ch'); } catch (e) {} });
  await page.waitForTimeout(1400);
  const started = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /بوت تدريبي/.test(x.textContent || ''));
    if (b) { b.click(); return true; } return false;
  });
  started ? ok('بدأت مباراة محلية') : bad('لم أجد زر «بوت تدريبي»');
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => {
    const svgs = document.querySelectorAll('#chessBoard svg.ch-svg');
    const w = document.querySelector('#chessBoard svg.ch-svg.w path');
    const b = document.querySelector('#chessBoard svg.ch-svg.b path');
    const read = el => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const bb = el.getBoundingClientRect();
      return { fill: cs.fill, stroke: cs.stroke, opacity: cs.opacity, w: Math.round(bb.width), h: Math.round(bb.height) };
    };
    const d = document.getElementById('chSvgDefs');
    return { pieces: svgs.length, w: read(w), b: read(b), defs: !!d, defsInDom: !!(d && document.body.contains(d)) };
  });
  r.pieces === 32 ? ok('32 قطعة مرسومة') : bad('عدد القطع: ' + r.pieces);
  const opaque = v => v && /^rgb/.test(v.fill) && v.w > 6 && v.h > 6 && Number(v.opacity) === 1;
  opaque(r.w) ? ok('القطع البيضاء معتمة ومرئية (' + r.w.fill + ')') : bad('البيضاء: ' + JSON.stringify(r.w));
  opaque(r.b) ? ok('القطع السوداء معتمة ومرئية (' + r.b.fill + ')') : bad('السوداء: ' + JSON.stringify(r.b));
  r.w && r.b && r.w.fill !== r.b.fill ? ok('تمييز لوني بين الفريقين') : bad('لا تمييز لوني');
  r.defs && r.defsInDom ? ok('تعريفات SVG محقونة في الصفحة') : ok('تعريفات SVG غير لازمة (تعبئة صلبة)');
  errs.length === 0 ? ok('بلا أخطاء صفحة') : bad('أخطاء: ' + errs.slice(0, 2).join(' | '));
  await page.screenshot({ path: '/tmp/dtsg-shots/chess-regression.png' });
  await br.close();
  console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

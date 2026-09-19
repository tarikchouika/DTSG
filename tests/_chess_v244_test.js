process.chdir(require('path').resolve(__dirname, '..'));
/* ═══ [v2.44 Phase D] تحقق حيّ من قطع الشطرنج: تدرّج مُحلّ فعلاً (لا قطع شفافة) ═══ */
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
const SHOTS = process.env.SHOTS || '/tmp/dtsg-shots';
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 }, locale: 'ar-MA', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const st = await page.evaluate(async () => (await fetch('/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' }) })).status);
  st === 200 ? ok('دخول اللاعب') : bad('فشل الدخول ' + st);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { try { openGame('ch'); } catch (e) {} });
  await page.waitForTimeout(2000);
  const started = await page.evaluate(() => {
    try { chessStartSolo(); return 'solo'; } catch (e) { return String(e).slice(0, 60); }
  });
  started === 'solo' || started === true ? true : bad('تعذّر بدء المباراة: ' + started);
  started ? ok('بدأت مباراة شطرنج ضد البوت') : bad('لم يُعثر على زر البدء');
  await page.waitForTimeout(3500);

  const probe = await page.evaluate(() => {
    const host = document.getElementById('chSvgDefs');
    const hostBox = host ? host.getBoundingClientRect() : null;
    const grad = host ? host.querySelector('#chGradW') : null;
    const pieces = Array.from(document.querySelectorAll('.ch-pc .ch-svg'));
    const w = pieces.find(p => p.classList.contains('w'));
    const b = pieces.find(p => p.classList.contains('b'));
    const cs = el => el ? getComputedStyle(el) : null;
    const wp = w ? w.querySelector('path, circle') : null;
    const bp = b ? b.querySelector('path, circle') : null;
    return {
      hostExists: !!host,
      hostDisplay: host ? getComputedStyle(host).display : null,
      hostW: hostBox ? Math.round(hostBox.width) : null,
      hostH: hostBox ? Math.round(hostBox.height) : null,
      gradExists: !!grad,
      gradStops: grad ? grad.querySelectorAll('stop').length : 0,
      pieces: pieces.length,
      whiteFill: wp ? cs(wp).fill : null,
      whiteStroke: wp ? cs(wp).stroke : null,
      blackFill: bp ? cs(bp).fill : null,
      blackStroke: bp ? cs(bp).stroke : null,
      whiteBox: w ? Math.round(w.getBoundingClientRect().width) : 0,
      boardSquares: document.querySelectorAll('.ch-sq').length,
    };
  });
  console.log('  ℹ️  ' + JSON.stringify(probe));

  probe.hostExists ? ok('حاوية defs موجودة') : bad('حاوية defs مفقودة');
  probe.hostDisplay !== 'none' ? ok('الحاوية ليست display:none (التدرّج قابل للحل) — display=' + probe.hostDisplay) : bad('الحاوية ما زالت display:none ⇒ التدرّج لن يُحلّ');
  probe.hostW === 0 && probe.hostH === 0 ? ok('الحاوية غير مرئية (0×0)') : bad('الحاوية تأخذ مساحة ' + probe.hostW + '×' + probe.hostH);
  probe.gradExists && probe.gradStops >= 3 ? ok('التدرّج chGradW معرّف بـ' + probe.gradStops + ' وقفات') : bad('التدرّج ناقص');
  probe.pieces >= 32 ? ok('عدد القطع مرسوم: ' + probe.pieces) : bad('عدد القطع ' + probe.pieces);
  /url\(/.test(probe.whiteFill || '') && /url\(/.test(probe.blackFill || '')
    ? ok('التعبئة بالتدرّج مطبَّقة: أبيض=' + probe.whiteFill + ' · أسود=' + probe.blackFill)
    : bad('التعبئة غير تدرّجية: ' + probe.whiteFill + ' / ' + probe.blackFill);
  probe.whiteBox > 20 ? ok('حجم القطعة المرسومة ' + probe.whiteBox + 'px') : bad('القطعة صغيرة/غير مرسومة: ' + probe.whiteBox);

  /* قياس فعلي للبكسل: هل القطعة معتمة (غير شفافة)؟ */
  const el = await page.$('.ch-pc .ch-svg.w');
  let opaque = null;
  if (el) {
    const buf = await el.screenshot();
    const png = buf.toString('base64');
    opaque = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      let solid = 0, total = 0;
      for (let i = 3; i < d.length; i += 4) { total++; if (d[i] > 200) solid++; }
      return { ratio: +(solid / total).toFixed(3), w: c.width, h: c.height };
    }, png);
  }
  opaque && opaque.ratio > 0.35 ? ok('القطعة معتمة فعلاً: ' + (opaque.ratio * 100).toFixed(1) + '% بكسل صلب (كانت شفافة قبل الإصلاح)')
    : bad('نسبة البكسل الصلب ضعيفة: ' + JSON.stringify(opaque));

  await page.screenshot({ path: SHOTS + '/chess-fixed-full.png' });
  const board = await page.$('#chessBoard, .ch-board');
  if (board) await board.screenshot({ path: SHOTS + '/chess-fixed-board.png' });
  ok('لقطات: chess-fixed-full.png · chess-fixed-board.png');
  errs.length === 0 ? ok('صفر أخطاء JS') : bad('أخطاء: ' + errs.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n═══ Phase D: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

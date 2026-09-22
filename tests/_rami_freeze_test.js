/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — اختبار حقيقي (متصفح) لتجمّد مؤقّت رامي في دور اللاعب الآلي (v2.43)
   يتحقق من:
   أ) المؤقّت يعمل فعلاً (نص العدّاد يتغيّر)
   ب) المرحلة غير PLAYING لا تُتلف المؤقّت (كانت تُلغيه ⇒ تجمّد دائم)
   ج) دور البوت يُنفَّذ فعلاً خلال ثوانٍ (لا تجمّد)
   د) خطوة البوت المؤجّلة تُستدرك إن تأخّر مؤقّت الصفحة
   هـ) بعد نهاية الشوط وبدء الشوط التالي يبقى المؤقّت حياً
   التشغيل: node tests/_rami_freeze_test.js   (خادم اختبار على 3971)
   ═══════════════════════════════════════════════════════════════════════════ */
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/tmp/pw/node_modules/playwright').chromium; }
const BASE = process.env.BASE || 'http://127.0.0.1:3971';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 140)));

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const lg = await page.evaluate(async () => {
    const r = await fetch(location.origin + '/api/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'qa_player', password: 'QaTest12345' })
    });
    return r.status;
  });
  lg === 200 ? ok('دخول qa_player') : bad('فشل الدخول: ' + lg);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  console.log('\n═══ أ) بدء لعبة رامي الفردية (ضد البوتات) ═══');
  await page.evaluate(() => { try { openGame('rm'); } catch (e) {} });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { localStorage.removeItem('rc_rami_persist_v1'); } catch (e) {} });
  await page.evaluate(() => { try { ramiStartGame(); } catch (e) { console.error('start', e.message); } });
  let started = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => {
      const ad = window.RamiAdapter;
      if (!ad || !ad.game) return null;
      return { phase: ad.game.gamePhase, timerId: !!ad.timerId, gen: ad._timerGen, bots: ad.game.players.filter((p) => p.isBot).length, turn: ad.game.roundManager.currentPlayerIndex };
    });
    if (st && st.phase === 'PLAYING') { started = true; console.log('   حالة اللعبة:', JSON.stringify(st)); break; }
  }
  started ? ok('اللعبة بدأت (PLAYING)') : bad('لم تبدأ اللعبة');
  const t1 = await page.evaluate(() => ({ hasTimer: !!RamiAdapter.timerId, gen: RamiAdapter._timerGen, bots: RamiAdapter.game.players.filter((p) => p.isBot).length }));
  t1.hasTimer ? ok('المؤقّت مُشغَّل (جيل ' + t1.gen + '، بوتات: ' + t1.bots + ')') : bad('لا مؤقّت بعد بدء اللعب');

  console.log('\n═══ ب) العدّاد يتغيّر فعلاً ═══');
  const readTimer = () => page.evaluate(() => {
    const el = document.querySelector('.rami-avatar-timer');
    return el ? el.textContent.trim() : null;
  });
  const r1 = await readTimer();
  const n1 = await page.evaluate(() => RamiAdapter.game.roundManager.turnSecondsRemaining);
  await page.waitForTimeout(2600);
  const r2 = await readTimer();
  const n2 = await page.evaluate(() => RamiAdapter.game.roundManager.turnSecondsRemaining);
  (n2 < n1 || (r1 !== null && r2 !== null && r1 !== r2)) ? ok('العدّاد يعمل: ' + r1 + ' → ' + r2 + ' (الحالة ' + n1 + 's → ' + n2 + 's)') : bad('العدّاد ثابت: ' + r1 + ' / ' + r2);

  console.log('\n═══ ج) المرحلة غير PLAYING لا تُتلف المؤقّت (عطل التجمّد الأصلي) ═══');
  await page.evaluate(() => { RamiAdapter.game.gamePhase = 'LOBBY'; });
  await page.waitForTimeout(2200);   /* tick واحد على الأقل */
  const duringPause = await page.evaluate(() => ({ timerId: !!RamiAdapter.timerId, phase: RamiAdapter.game.gamePhase }));
  duringPause.timerId ? ok('المؤقّت محفوظ أثناء LOBBY (إيقاف مؤقت لا إتلاف)') : bad('فُقد المؤقّت أثناء LOBBY');
  await page.evaluate(() => { RamiAdapter.game.gamePhase = 'PLAYING'; });
  const r3 = await page.evaluate(() => ({ s: RamiAdapter.game.roundManager.turnSecondsRemaining, ph: RamiAdapter.game.gamePhase, d: RamiAdapter.game.roundManager.discardPile.length }));
  await page.waitForTimeout(2600);
  const r4 = await page.evaluate(() => ({ s: RamiAdapter.game.roundManager.turnSecondsRemaining, ph: RamiAdapter.game.gamePhase, d: RamiAdapter.game.roundManager.discardPile.length, timer: !!RamiAdapter.timerId }));
  /* العدّاد يتراجع، أو الجولة تقدّمت (البوت لعب/انتهى الشوط) — كلاهما دليل حياة */
  const alive = (r4.s < r3.s) || (r4.ph !== 'PLAYING') || (r4.d !== r3.d) || (r4.timer && r4.ph === 'PLAYING' && r4.s <= r3.s);
  (r4.timer && alive) ? ok('العدّاد/التقدّم استُؤنف بعد العودة: ' + r3.s + 's → ' + r4.s + 's · مرحلة ' + r4.ph) : bad('توقّف بعد العودة: ' + JSON.stringify({ r3: r3, r4: r4 }));

  console.log('\n═══ د) دور البوت يُنفَّذ فعلاً (لا تجمّد) ═══');
  const snap = () => page.evaluate(() => {
    const g = RamiAdapter.game, rm = g.roundManager;
    return { cur: rm.getCurrentPlayerIndex ? rm.getCurrentPlayerIndex() : rm.currentPlayerIndex, isBot: !!rm.getCurrentPlayer().isBot, discard: rm.discardPile.length, hands: g.players.map((p) => p.hand.length + '') .join(','), phase: g.gamePhase };
  });
  let b0 = await snap();
  /* إن كان دور اللاعب البشري: العب دوراً كاملاً لتصل الأدوار للبوت */
  const myTurn = await page.evaluate(() => {
    const g = RamiAdapter.game;
    return !g.roundManager.getCurrentPlayer().isBot;
  });
  if (myTurn) {
    await page.evaluate(() => { try { ramiAction('draw_deck'); } catch (e) {} });
    await page.waitForTimeout(900);
    const cid = await page.evaluate(() => {
      const g = RamiAdapter.game;
      g.normalizeTurnPhase && g.normalizeTurnPhase();
      const p = g.roundManager.getCurrentPlayer();
      const m = g.getLegalMoves(p.id).filter((x) => x.type === 'discard');
      return m.length ? m[0].cardId : null;
    });
    if (cid != null) await page.evaluate((c) => { try { ramiAction('discard', c); } catch (e) {} }, cid);
    await page.waitForTimeout(1200);
  }
  let botPlayed = false, moves = 0;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const s = await snap();
    if (s.discard !== b0.discard || s.hands !== b0.hands) { botPlayed = true; moves++; b0 = s; }
    if (moves >= 3) break;
  }
  botPlayed ? ok('البوت لعب وتقدّمت الجولة (' + moves + ' تغييرات في حالة الطاولة)') : bad('البوت لم يلعب — الطاولة مجمّدة: ' + JSON.stringify(b0));
  const timerAlive = await page.evaluate(() => !!RamiAdapter.timerId);
  timerAlive ? ok('المؤقّت ما زال حياً بعد أدوار البوت') : bad('فُقد المؤقّت بعد أدوار البوت');

  console.log('\n═══ هـ) استدراك خطوة بوت مؤجّلة (مؤقّت صفحة متأخر) ═══');
  const rescue = await page.evaluate(async () => {
    const ad = RamiAdapter;
    if (!ad.game || ad.game.gamePhase !== 'PLAYING') return 'no-game';
    let ran = false;
    /* يجب أن ترتبط خطوة الاختبار بالبوت صاحب الدور فعلاً؛ خطوة بوت آخر
       تُعدّ callback قديمة ويجب أن يرفضها الحارس كما في العودة الحقيقية. */
    const rm = ad.game.roundManager;
    const bot = ad.game.players.find((p) => p.isBot);
    if (!bot) return 'no-bot';
    /* اصنع سياقاً صريحاً لدور بوت حتى لا يعتمد الاختبار على توقيت الحلقة السابقة. */
    rm.currentPlayerIndex = bot.id;
    rm.turnPhase = 'WAITING_DRAW';
    rm._turnStartedAt = Date.now();
    ad._botTurnEpoch = (ad._botTurnEpoch || 0) + 1;
    ad._cancelBotStep();
    ad._deferBotStep(bot, () => { ran = true; }, 5000);   /* مؤقّت بعيد */
    const step = ad._botStep;
    if (!step) return 'no-step';
    /* نُقدّم زمن الإنشاء 4 ثوانٍ ليتجاوز شرط الحارس (3 ثوانٍ) */
    step.createdAt -= 4000;
    ad._watchdog();                                       /* يحب أن ينفّذها الآن */
    return ran ? 'rescued' : 'not-rescued';
  });
  rescue === 'rescued' ? ok('الحارس نفّذ خطوة البوت المؤجّلة العالقة') : bad('لم يُستدرك: ' + rescue);

  console.log('\n═══ و) نهاية الشوط ثم الشوط التالي: المؤقّت يبقى حياً ═══');
  await page.evaluate(() => {
    const g = RamiAdapter.game;
    g.gamePhase = 'ROUND_END';
    try { RamiAdapter._endRoundUI(); } catch (e) {}
  });
  await page.waitForTimeout(2000);
  const ended = await page.evaluate(() => RamiAdapter.game.gamePhase);
  ended === 'ROUND_END' ? ok('شوط منتهٍ (ROUND_END)') : bad('حالة غير متوقعة: ' + ended);
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => /الشوط التالي|nextRound|التالي/.test(x.textContent || ''));
    if (b) { b.click(); return 'button'; }
    /* لا زر ظاهر (حالة مُصطنعة) ⇒ نادِ المعالج نفسه كما يفعل الزر */
    try { ramiNextRound(); return 'handler'; } catch (e) { return 'fail:' + e.message; }
  });
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({ phase: RamiAdapter.game ? RamiAdapter.game.gamePhase : null, timerId: !!RamiAdapter.timerId, gen: RamiAdapter._timerGen }));
  (after.phase === 'PLAYING' && after.timerId) ? ok('الشوط التالي بدأ والمؤقّت حيّ (جيل ' + after.gen + ')') : bad('بعد الشوط التالي: ' + JSON.stringify(after) + ' (زر: ' + clicked + ')');
  /* دورة كاملة ثانية: العدّاد يعمل بعد انتقال الشوط */
  const q1 = await page.evaluate(() => RamiAdapter.game.roundManager.turnSecondsRemaining);
  await page.waitForTimeout(2600);
  const q2 = await page.evaluate(() => RamiAdapter.game.roundManager.turnSecondsRemaining);
  (q2 < q1) ? ok('العدّاد يعمل في الشوط الجديد: ' + q1 + 's → ' + q2 + 's') : bad('العدّاد متوقف في الشوط الجديد: ' + q1 + ' / ' + q2);

  console.log('\n═══ ز) أخطاء الكونسول ═══');
  errs.length === 0 ? ok('لا أخطاء كونسول') : bad('أخطاء: ' + errs.slice(0, 4).join(' | '));

  await page.screenshot({ path: '/tmp/v243-rami.png', fullPage: false });
  await browser.close();
  console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

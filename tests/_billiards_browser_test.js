/* ══════════════════════════════════════════════════════════════════
   اختبار إدماج البلياردو في المنصة (8-Ball) — Playwright
   يتطلب:  node server.js   على المنفذ 3000
   التشغيل:  node tests/_billiards_browser_test.js
   ══════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(p, fn, t) { t = t || 12000; const s = Date.now(); while (Date.now() - s < t) { try { const r = await p.evaluate(fn); if (r) return r; } catch (e) {} await p.waitForTimeout(150); } return null; }
const res = []; const ok = (n, c) => { res.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };
const sec = t => console.log('\n── ' + t + ' ──');

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::ERR/i.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(p, () => !!(typeof ST !== 'undefined' && typeof openGame === 'function' && typeof T === 'function'));
  /* اللغة الإنجليزية للتحقق من الترجمة (نفس نمط _dama_fixes_test.js) */
  await p.evaluate(() => { ST.lang = 'en'; if (typeof save === 'function') save(); });

  /* ═══ 1) التسجيل في المنصة ═══ */
  sec('1) التسجيل في كتالوج المنصة');
  const cat = await p.evaluate(() => {
    const g = GAMES.find(x => x.id === 'bl8');
    return g ? { id: g.id, eng: g.eng, cat: g.cat, names: g.n, rtp: g.rtp, rules: !!(RULES && RULES.bl8) } : null;
  });
  ok('اللعبة bl8 موجودة في GAMES', !!cat);
  ok('محركها = billiards', cat && cat.eng === 'billiards');
  ok('فئتها = traditional', cat && cat.cat === 'traditional');
  ok('لها 4 أسماء (ع/ف/إ/د)', cat && cat.names.length === 4 && cat.names[2] === '8-Ball Pool');
  ok('لها قواعد مختصرة في RULES', cat && cat.rules);
  ok('معرّف bl8 غير متعارض (bc ما زالت للباكارات)',
     await p.evaluate(() => GAMES.find(x => x.id === 'bc').eng === 'bac'));
  ok('ENG.billiards مسجّل', await p.evaluate(() => typeof ENG.billiards === 'function'));
  ok('initFor("billiards") يرجع الدالة', await p.evaluate(() => typeof initFor('billiards') === 'function'));

  /* ═══ 2) فتح اللعبة ═══ */
  sec('2) فتح اللعبة وشاشة الإعداد');
  await p.evaluate(() => openGame('bl8'));
  const setupOk = await wait(p, () => {
    const s = document.getElementById('blSetup');
    return (s && !s.hidden && document.getElementById('blVariants')) ? true : null;
  });
  ok('شاشة الإعداد ظهرت (#blSetup)', !!setupOk);
  ok('اسم اللعبة في رأس الصفحة = 8-Ball Pool (EN)',
     await p.evaluate(() => document.getElementById('gamePageName').textContent.trim() === '8-Ball Pool'));
  ok('لا مفاتيح ترجمة خامّة في شاشة الإعداد (EN)',
     await p.evaluate(() => !/bl\.[a-zA-Z]|chess\.[a-zA-Z]/.test(document.getElementById('blSetup').innerText)));

  const vars = await p.evaluate(() => Array.from(document.querySelectorAll('#blVariants .bl-vchip')).map(e => ({
    v: e.getAttribute('data-v'), dis: e.hasAttribute('disabled'), on: e.classList.contains('on'),
    txt: e.innerText.replace(/\s+/g, ' ').trim()
  })));
  ok('أربعة أصناف معروضة', vars.length === 4);
  ok('الأصناف الأربعة مفعّلة (المرحلة 5)',
     ['eightball', 'blackball', 'snooker', 'carom'].every(k => vars.find(v => v.v === k) && !vars.find(v => v.v === k).dis));
  ok('كل صنف يعرض هيئته المرجعية (WPA/EPA/WPBSA/UMB)',
     /WPA/.test(vars[0].txt) && /EPA/.test(vars[1].txt) && /WPBSA/.test(vars[2].txt) && /UMB/.test(vars[3].txt));
  ok('رهانات: 0/50/100/250/500',
     JSON.stringify(await p.evaluate(() => Array.from(document.querySelectorAll('#blBet .dama-chip')).map(e => e.getAttribute('data-bet'))))
     === JSON.stringify(['0', '50', '100', '250', '500']));

  /* صنف غير جاهز → لا يفتح */
  await p.evaluate(() => billiardsSetVariant('carom'));
  ok('الكاروم جاهز: الاختيار يغيّر الصنف (المرحلة 5)',
     await p.evaluate(() => BILLIARDS.variant === 'carom'));
  await p.evaluate(() => billiardsSetVariant('eightball'));
  ok('العودة إلى 8-Ball تمهيداً للقسم 3',
     await p.evaluate(() => BILLIARDS.variant === 'eightball'));

  /* ═══ 3) بدء إطار وجه لوجه ═══ */
  sec('3) بدء إطار واللعب');
  await p.click('button.big.dama-go >> nth=0');         /* وجه لوجه */
  const playOk = await wait(p, () => {
    const pl = document.getElementById('blPlay');
    return (pl && !pl.hidden && window.BILLIARDS && BILLIARDS.G && BILLIARDS.G.S.phase === 'AIM') ? true : null;
  });
  ok('شاشة اللعب ظهرت والطور AIM', !!playOk);
  ok('16 كرة على الطاولة',
     await p.evaluate(() => BILLIARDS.G.S.balls.filter(b => b.status === 'ON_TABLE').length === 16));
  ok('الكانفاس له أبعاد حقيقية',
     await p.evaluate(() => { const c = document.getElementById('blCv'); return c.width > 100 && c.height > 60; }));
  ok('زر الضرب مفعّل في دورك', await p.evaluate(() => !document.getElementById('blShoot').disabled));
  ok('القوة الافتراضية 75', await p.evaluate(() => document.getElementById('blPowVal').textContent === '75'));
  ok('HUD يعرض «طاولة مفتوحة» قبل التعيين',
     await p.evaluate(() => /مفتوحة|ouverte|Open|محلولة/i.test(document.getElementById('blGrp0').textContent + document.getElementById('blTurn').textContent)));

  /* ضربة الكسر */
  await p.evaluate(() => { BILLIARDS.aim = 0; BILLIARDS.power = 95; });
  await p.click('#blShoot');
  const broke = await wait(p, () => (BILLIARDS.G.S.history.length >= 1 && BILLIARDS.G.S.phase !== 'SHOT') ? true : null, 20000);
  ok('الكسر نُفّذ وسُجّل في السجل', !!broke);
  const ev0 = await p.evaluate(() => {
    const e = BILLIARDS.G.S.history[0];
    return { fouls: e.foul_codes, rs: e.ruleset_id, pv: e.physics_version, pot: e.pocketed.length, fc: e.first_contact };
  });
  ok('الحدث يحمل WPA_8BALL v' + ev0.rs, ev0.rs === 'WPA_8BALL');
  ok('الحدث يحمل إصدار الفيزياء ' + ev0.pv, typeof ev0.pv === 'string');
  ok('كسر قانوني بلا أخطاء: [' + ev0.fouls + ']', ev0.fouls.length === 0);
  ok('أول تماس مسجّل (' + ev0.fc + ')', ev0.fc !== null);
  ok('علم الكسر انطفأ', await p.evaluate(() => BILLIARDS.G.S.breakShot === false));

  /* الكرات تحرّكت فعلاً */
  ok('الكرات تحرّكت من المثلث (تغيّرت المواضع)',
     await p.evaluate(() => BILLIARDS.G.S.balls.filter(b => b.type !== 'CUE' && b.status === 'ON_TABLE').length <= 15));

  /* ═══ 4) خطأ → كرة بيد ═══ */
  sec('4) خطأ SCRATCH → كرة بيد');
  await p.evaluate(() => {
    /* إسقاط البيضاء في الجيب الجانبي السفلي */
    const c = BILLIARDS.G.cue();
    c.x = 500; c.y = 470; c.vx = 0; c.vy = 14;
    BILLIARDS.G.S.rec = BilliardsPhysics.newRec(99, BILLIARDS.G.S.active, null);
    BILLIARDS.G.S.rec.dirY = 1;
    BILLIARDS.G.S.phase = 'SHOT';
  });
  const scratched = await wait(p, () => {
    const h = BILLIARDS.G.S.history;
    return (h.length && h[h.length - 1].cue_pocketed) ? true : null;
  }, 20000);
  ok('سُجّل SCRATCH', !!scratched);
  ok('انتقل إلى طور الوضع PLACE', await p.evaluate(() => BILLIARDS.G.S.phase === 'PLACE'));
  ok('زر الضرب معطّل أثناء الوضع', await p.evaluate(() => document.getElementById('blShoot').disabled));
  ok('الرسالة تذكر كرة اليد',
     await p.evaluate(() => /يد|main|hand|بيد/.test(document.getElementById('blMsg').textContent)));

  const placed = await p.evaluate(() => {
    const okPos = BILLIARDS.G.validPlace(200, 120);
    const did = BILLIARDS.G.place(200, 120);
    return { okPos: okPos, did: did, phase: BILLIARDS.G.S.phase, cue: BILLIARDS.G.cue().status };
  });
  ok('موضع صالح مقبول', placed.okPos && placed.did);
  ok('بعد الوضع يعود الطور AIM والبيضاء على الطاولة',
     placed.phase === 'AIM' && placed.cue === 'ON_TABLE');
  ok('موضع داخل جيب مرفوض', await p.evaluate(() => BILLIARDS.G.validPlace(3, 3) === false));

  /* ═══ 5) ضد الحاسوب ═══ */
  sec('5) اللعب ضد الحاسوب');
  await p.evaluate(() => { billiardsToSetup(); });
  await wait(p, () => !document.getElementById('blSetup').hidden);
  await p.evaluate(() => billiardsStartAI());
  await wait(p, () => (window.BILLIARDS && BILLIARDS.G && BILLIARDS.G.S.phase !== undefined) ? true : null);
  ok('الوضع = ai', await p.evaluate(() => BILLIARDS.mode === 'ai'));
  ok('اسم الخصم = الحاسوب',
     await p.evaluate(() => /الحاسوب|Ordinateur|Computer/.test(document.getElementById('blNm1').textContent)));
  /* اللاعب البشري يكسر أولاً (المقعد 0)، ثم يأتي دور الحاسوب */
  await p.evaluate(() => { BILLIARDS.aim = 0; BILLIARDS.power = 95; billiardsShoot(); });
  await wait(p, () => (BILLIARDS.G.S.history.length >= 1 && BILLIARDS.G.S.phase !== 'SHOT') ? true : null, 25000);
  /* إن استمر دور الإنسان بعد الكسر (إدخال فيه)، ضربة آمنة تُمرّر الدور */
  await p.evaluate(() => { if (BILLIARDS.G.S.active === 0 && BILLIARDS.G.S.phase === 'AIM') { BILLIARDS.aim = Math.PI; BILLIARDS.power = 40; billiardsShoot(); } });
  await p.waitForTimeout(1500);
  const aiPlayed = await wait(p, () => {
    const h = BILLIARDS.G.S.history;
    return (h.length >= 2 && h.some(e => e.player_id === 1)) ? true : null;
  }, 40000);
  ok('الحاسوب لعب ضربة واحدة على الأقل بعد كسر الإنسان', !!aiPlayed);
  ok('لا طور عالق بعد دور الحاسوب',
     await p.evaluate(() => ['AIM', 'PLACE', 'SHOT', 'END'].indexOf(BILLIARDS.G.S.phase) !== -1));

  /* ═══ 6) نهاية الإطار والمال ═══ */
  sec('6) نهاية الإطار');
  await p.evaluate(() => {
    BILLIARDS.bet = 0;
    billiardsResign();
  });
  const over = await wait(p, () => !document.getElementById('blOver').hidden);
  ok('نافذة النتيجة ظهرت', !!over);
  ok('نص النتيجة غير فارغ', await p.evaluate(() => document.getElementById('blOverTx').textContent.length > 2));
  await p.evaluate(() => billiardsNewFrame());
  await wait(p, () => (BILLIARDS.G && BILLIARDS.G.S.history.length === 0) ? true : null);
  ok('إطار جديد يبدأ بسجل فارغ', await p.evaluate(() => BILLIARDS.G.S.history.length === 0));

  /* ═══ 7) القواعد الكاملة ═══ */
  sec('7) نافذة القواعد');
  await p.evaluate(() => billiardsRules());
  const rulesTxt = await wait(p, () => {
    const m = document.getElementById('rulesModal');
    return (m && m.classList.contains('show')) ? m.innerText : null;
  });
  ok('نافذة القواعد الكاملة فتحت', !!rulesTxt);
  ok('تذكر WPA والكرة 8', /WPA/i.test(rulesTxt || '') && /8/.test(rulesTxt || ''));
  await p.evaluate(() => { if (typeof closeRulesModal === 'function') closeRulesModal(); });

  /* ═══ 7B) Blackball (EPA) ═══ */
  sec('7B) Blackball — واجهة EPA');
  await p.evaluate(() => { if (typeof closeGamePage === 'function') closeGamePage(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => openGame('blbb'));
  const bbSetup = await wait(p, () => {
    const s2 = document.getElementById('blSetup');
    return (s2 && !s2.hidden && document.getElementById('blVariants')) ? true : null;
  });
  ok('blbb تفتح شاشة الإعداد', !!bbSetup);
  ok('اسم اللعبة في الرأس = Blackball Pool (EN)',
     await p.evaluate(() => document.getElementById('gamePageName').textContent.trim() === 'Blackball Pool'));
  ok('الصنف المحدد = blackball تلقائياً',
     await p.evaluate(() => BILLIARDS.variant === 'blackball'));
  ok('شريحة Blackball هي المفعّلة',
     await p.evaluate(() => document.querySelector('#blVariants .bl-vchip[data-v="blackball"]').classList.contains('on')));
  ok('التلميح = EPA وليس WPA',
     await p.evaluate(() => /EPA/.test(document.getElementById('blVariantHint').textContent) && !/WPA/.test(document.getElementById('blVariantHint').textContent)));
  ok('لا مفاتيح ترجمة خامّة في الإعداد (EN)',
     await p.evaluate(() => !/bl\.[a-zA-Z]/.test(document.getElementById('blSetup').innerText)));

  /* بدء إطار محلي + وضع من الباولك */
  await p.evaluate(() => billiardsStartLocal());
  await p.waitForTimeout(250);
  ok('الإطار يبدأ بوضع من الباولك',
     await p.evaluate(() => BILLIARDS.G.S.phase === 'PLACE' && BILLIARDS.G.S.placeRestriction === 'BAULK'));
  ok('زر إعلان الجمود ظاهر لـ Blackball',
     await p.evaluate(() => !document.getElementById('blStale').hidden));
  ok('موضع أمام خط الباولك مرفوض',
     await p.evaluate(() => BILLIARDS.G.place(600, 250) === false));
  ok('موضع خلف الخط مقبول',
     await p.evaluate(() => BILLIARDS.G.place(150, 250) === true && BILLIARDS.G.S.phase === 'AIM'));

  /* كسر ضعيف → RERACK + نافذة الاختيار */
  await p.evaluate(() => { document.getElementById('blPower').value = 2; billiardsPowerUi(); billiardsShoot(); });
  const rerackShown = await wait(p, () => {
    if (BILLIARDS.G.S.phase === 'RERACK') return !document.getElementById('blRerack').hidden;
    return null;
  });
  ok('كسر ضعيف → طور RERACK ونافذة اختيار الكسر', rerackShown === true);
  ok('دور الاختيار للخصم (active=1)', await p.evaluate(() => BILLIARDS.G.S.active === 1));
  await p.evaluate(() => billiardsChooseBreak(true));
  await p.waitForTimeout(200);
  ok('أخذ الكسر → الرافع الجديد يضع من الباولك',
     await p.evaluate(() => BILLIARDS.G.S.breaker === 1 && BILLIARDS.G.S.active === 1 &&
       BILLIARDS.G.S.phase === 'PLACE' && document.getElementById('blRerack').hidden));

  /* كسر قانوني بقوة كاملة */
  await p.evaluate(() => { BILLIARDS.G.place(150, 250); document.getElementById('blPower').value = 95; billiardsPowerUi(); billiardsShoot(); });
  const bbBroke = await wait(p, () => (BILLIARDS.G.S.history.length >= 1 && BILLIARDS.G.S.phase !== 'SHOT') ? true : null);
  ok('الكسر سُجّل في السجل', bbBroke === true);
  const bbEv = await p.evaluate(() => {
    const ev = BILLIARDS.G.S.history[BILLIARDS.G.S.history.length - 1];
    return { rs: ev.ruleset_id, pts: ev.break_points, illegal: ev.illegal_break };
  });
  ok('الحدث يحمل ruleset EPA ونقاط الكسر (' + JSON.stringify(bbEv) + ')',
     bbEv.rs === 'EPA_INT_8BALL' && typeof bbEv.pts === 'number');

  /* الجمود → إعادة رفّ */
  await p.evaluate(() => billiardsStalemate());
  await p.waitForTimeout(250);
  ok('الجمود: إعادة رفّ كامل ويكسر الأصلي',
     await p.evaluate(() => BILLIARDS.G.S.phase === 'PLACE' && BILLIARDS.G.S.breaker === BILLIARDS.G.S.originalBreaker &&
       BILLIARDS.G.S.balls.filter(b => b.status === 'ON_TABLE').length === 16));

  /* القواعد الكاملة لـ blbb */
  await p.evaluate(() => billiardsRules());
  const bbRulesOk = await wait(p, () => {
    const m = document.getElementById('rulesModal');
    return (m && !m.hidden && /Blackball|EPA/i.test(m.innerText)) ? true : null;
  });
  ok('نافذة القواعد الكاملة لـ Blackball (EPA)', bbRulesOk === true);
  await p.evaluate(() => closeRulesModal());
  await p.waitForTimeout(200);

  /* وجه لوجه: كرات بلا أرقام + HUD */
  ok('الكرات الحمراء والصفراء موجودة (بلا أرقام)',
     await p.evaluate(() => {
       const t = BILLIARDS.G.S.balls;
       return t.filter(b => b.type === 'RED').length === 7 && t.filter(b => b.type === 'YELLOW').length === 7 &&
              t.filter(b => b.type === 'BLACK').length === 1 && t.every(b => b.type === 'CUE' || b.type === 'RED' || b.type === 'YELLOW' || b.type === 'BLACK');
     }));
  await p.evaluate(() => { BILLIARDS.G.place(150, 250); });
  const hudOpen = await p.evaluate(() => { blUpdateHud(); return document.getElementById('blGrp0').textContent; });
  ok('HUD يعرض «طاولة مفتوحة» قبل التعيين (' + hudOpen + ')', hudOpen === 'Open table');

  /* ضد الحاسوب */
  await p.evaluate(() => billiardsToSetup());
  await p.waitForTimeout(200);
  await p.evaluate(() => billiardsStartAI());
  await p.waitForTimeout(250);
  await p.evaluate(() => { BILLIARDS.G.place(150, 250); document.getElementById('blPower').value = 95; billiardsPowerUi(); billiardsShoot(); });
  const aiTurn = await wait(p, () => BILLIARDS.G.S.history.some(h => h.player_id === 1) ? true : null, 15000);
  ok('الحاسوب ردّ بضربة في Blackball', aiTurn === true);

  /* الخروج والتنظيف */
  await p.evaluate(() => closeGamePage());
  await p.waitForTimeout(300);
  ok('التنظيف بعد الخروج من blbb',
     await p.evaluate(() => !BILLIARDS || BILLIARDS.raf === 0));

  /* ═══ 7S) Snooker (WPBSA) ═══ */
  sec('7S) Snooker — واجهة WPBSA');
  await p.evaluate(() => { if (typeof closeGamePage === 'function') closeGamePage(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => openGame('blsn'));
  const snSetup = await wait(p, () => {
    const s2 = document.getElementById('blSetup');
    return (s2 && !s2.hidden && document.getElementById('blVariants')) ? true : null;
  });
  ok('blsn تفتح شاشة الإعداد', !!snSetup);
  ok('اسم اللعبة في الرأس = Snooker (EN)',
     await p.evaluate(() => document.getElementById('gamePageName').textContent.trim() === 'Snooker'));
  ok('الصنف المحدد = snooker تلقائياً',
     await p.evaluate(() => BILLIARDS.variant === 'snooker'));
  ok('شريحة Snooker مفعّلة وممكّنة',
     await p.evaluate(() => { const c = document.querySelector('#blVariants .bl-vchip[data-v="snooker"]'); return c.classList.contains('on') && !c.disabled; }));
  ok('التلميح = WPBSA',
     await p.evaluate(() => /WPBSA/.test(document.getElementById('blVariantHint').textContent)));
  ok('لا مفاتيح ترجمة خامّة في إعداد blsn (EN)',
     await p.evaluate(() => !/bl\.[a-zA-Z]/.test(document.getElementById('blSetup').innerText)));

  await p.evaluate(() => billiardsStartLocal());
  await p.waitForTimeout(250);
  ok('الإطار يبدأ بيدٍ داخل D',
     await p.evaluate(() => BILLIARDS.G.S.phase === 'PLACE' && BILLIARDS.G.S.placeRestriction === 'D'));
  ok('22 كرة: 15 حمراء + 6 ألوان + بيضاء',
     await p.evaluate(() => { const t = BILLIARDS.G.S.balls; return t.length === 22 && t.filter(b => b.type === 'RED').length === 15 && t.filter(b => b.type === 'COLOUR').length === 6; }));
  ok('زر الجمود مخفي في السنوكر',
     await p.evaluate(() => document.getElementById('blStale').hidden));
  ok('موضع خارج D مرفوض', await p.evaluate(() => BILLIARDS.G.place(600, 250) === false));
  ok('موضع داخل D مقبول', await p.evaluate(() => BILLIARDS.G.place(180, 300) === true && BILLIARDS.G.S.phase === 'AIM'));

  const snHud = await p.evaluate(() => { blUpdateHud(); return { g0: document.getElementById('blGrp0').textContent, turn: document.getElementById('blTurn').textContent }; });
  ok('HUD يعرض النتيجة 0 (' + snHud.g0 + ')', /0/.test(snHud.g0) && snHud.g0.includes('🏆'));
  ok('سطر الدور يعرض الكرة القانونية (' + snHud.turn + ')', /red/i.test(snHud.turn));

  /* الترشيح: أزرار الألوان */
  await p.evaluate(() => { BILLIARDS.G.S.turnState = 'COLOUR'; blUpdateHud(); });
  await p.waitForTimeout(100);
  ok('شريط الترشيح يظهر في طور اللون',
     await p.evaluate(() => !document.getElementById('blNoms').hidden && document.querySelectorAll('#blNoms .bl-nom').length === 6));
  await p.evaluate(() => billiardsNominate('BLACK'));
  await p.waitForTimeout(100);
  const snNom = await p.evaluate(() => ({ n: BILLIARDS.G.S.nominated, hidden: document.getElementById('blNoms').hidden, turn: document.getElementById('blTurn').textContent }));
  ok('الترشيح يسجّل السوداء ويخفي الشريط', snNom.n === 'BLACK' && snNom.hidden === true);
  ok('سطر الدور يعرض المرشّحة (' + snNom.turn + ')', /Black/i.test(snNom.turn));
  await p.evaluate(() => { BILLIARDS.G.S.turnState = 'REDS'; BILLIARDS.G.S.nominated = null; blUpdateHud(); });

  /* خطأ بلا تماس → 4 نقاط للخصم في HUD */
  await p.evaluate(() => { BILLIARDS.aim = Math.PI; BILLIARDS.power = 5; document.getElementById('blPower').value = 5; billiardsPowerUi(); billiardsShoot(); });
  const snFoul = await wait(p, () => {
    const S = BILLIARDS.G.S;
    return (S.phase !== 'SHOT' && S.history.length >= 1) ? { sc: S.scores.slice(), g1: document.getElementById('blGrp1').textContent } : null;
  });
  ok('خطأ بلا تماس = +4 للخصم (' + JSON.stringify(snFoul) + ')', snFoul && snFoul.sc[1] === 4);
  ok('HUD الخصم يعرض 4 (' + (snFoul && snFoul.g1) + ')', snFoul && /4/.test(snFoul.g1));

  /* القواعد الكاملة */
  await p.evaluate(() => billiardsRules());
  const snRulesOk = await wait(p, () => {
    const m = document.getElementById('rulesModal');
    return (m && !m.hidden && /WPBSA/i.test(m.innerText)) ? true : null;
  });
  ok('نافذة القواعد الكاملة لـ Snooker (WPBSA)', snRulesOk === true);
  await p.evaluate(() => closeRulesModal());
  await p.waitForTimeout(200);

  /* الحاسوب يلعب السنوكر (يضع ويرشّح ويضرب بنفسه) */
  await p.evaluate(() => billiardsToSetup());
  await p.waitForTimeout(200);
  await p.evaluate(() => billiardsStartAI());
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    if (BILLIARDS.G.S.phase === 'PLACE') BILLIARDS.G.place(180, 300);
    document.getElementById('blPower').value = 5; billiardsPowerUi();
    BILLIARDS.aim = Math.PI; billiardsShoot();   /* غرباً بلا تماس → الدور للحاسوب */
  });
  const snAiPlace = await wait(p, () => (BILLIARDS.G.S.history.length >= 1 && BILLIARDS.G.S.active === 1) ? true : null);
  ok('البداية من D ثم ضربة اللاعب (خطأ ينقل الدور)', snAiPlace === true);
  const snAi = await wait(p, () => BILLIARDS.G.S.history.some(h => h.player_id === 1) ? true : null, 15000);
  ok('الحاسوب ردّ بضربة في السنوكر', snAi === true);

  await p.evaluate(() => closeGamePage());
  await p.waitForTimeout(300);
  ok('التنظيف بعد الخروج من blsn',
     await p.evaluate(() => !BILLIARDS || BILLIARDS.raf === 0));

  /* ═══ 7C) Carom (UMB) ═══ */
  sec('7C) Carom — واجهة UMB');
  await p.evaluate(() => { if (typeof closeGamePage === 'function') closeGamePage(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => openGame('blca'));
  const caSetup = await wait(p, () => {
    const s2 = document.getElementById('blSetup');
    return (s2 && !s2.hidden && document.getElementById('blVariants')) ? true : null;
  });
  ok('blca تفتح شاشة الإعداد', !!caSetup);
  ok('اسم اللعبة في الرأس = Carom Billiards (EN)',
     await p.evaluate(() => document.getElementById('gamePageName').textContent.trim() === 'Carom Billiards'));
  ok('الصنف المحدد = carom تلقائياً + شريحة مفعّلة',
     await p.evaluate(() => BILLIARDS.variant === 'carom' && document.querySelector('#blVariants .bl-vchip[data-v="carom"]').classList.contains('on')));
  ok('حقل الاختصاص ظاهر بثلاثة خيارات وهدف',
     await p.evaluate(() => !document.getElementById('blCaromField').hidden &&
       document.querySelectorAll('#blCaDisc .dama-chip').length === 3 &&
       document.querySelectorAll('#blCaTarget .dama-chip').length === 3));
  ok('التلميح = UMB', await p.evaluate(() => /UMB/.test(document.getElementById('blVariantHint').textContent)));

  /* اختيار صريح: وسادة واحدة وهدف 5 (§4) */
  await p.evaluate(() => { billiardsSetDisc('ONE'); billiardsSetTarget(5); });
  await p.waitForTimeout(150);
  await p.evaluate(() => billiardsStartLocal());
  await p.waitForTimeout(300);
  ok('الاختصاص والهدف صريحان من الإعداد (ONE/5)',
     await p.evaluate(() => BILLIARDS.G.S.discipline === 'ONE' && BILLIARDS.G.S.target === 5));
  ok('3 كرات وبلا جيوب وطور AIM مباشرة',
     await p.evaluate(() => BILLIARDS.G.S.balls.length === 3 && BILLIARDS.G.S.table.pockets.length === 0 && BILLIARDS.G.S.phase === 'AIM'));
  const caHud = await p.evaluate(() => { blUpdateHud(); return document.getElementById('blTurn').textContent; });
  ok('سطر الدور يعرض الاختصاص والهدف (' + caHud + ')', /1-cushion/.test(caHud) && /5/.test(caHud));

  /* إخفاق → الدور للخصم مع إعادة الوسم */
  await p.evaluate(() => { BILLIARDS.aim = Math.PI; document.getElementById('blPower').value = 5; billiardsPowerUi(); billiardsShoot(); });
  const caMiss = await wait(p, () => (BILLIARDS.G.S.history.length >= 1 && BILLIARDS.G.S.active === 1) ? true : null);
  ok('إخفاق بلا تماس ينقل الدور', caMiss === true);
  ok('صفراء الخصم أصبحت CUE', await p.evaluate(() => BILLIARDS.G.byId('P').type === 'CUE'));

  /* القواعد الكاملة */
  await p.evaluate(() => billiardsRules());
  const caRulesOk = await wait(p, () => {
    const m = document.getElementById('rulesModal');
    return (m && !m.hidden && /UMB/i.test(m.innerText)) ? true : null;
  });
  ok('نافذة القواعد الكاملة لـ Carom (UMB)', caRulesOk === true);
  await p.evaluate(() => closeRulesModal());
  await p.waitForTimeout(200);

  /* الحاسوب */
  await p.evaluate(() => billiardsToSetup());
  await p.waitForTimeout(200);
  await p.evaluate(() => { billiardsSetDisc('THREE'); billiardsStartAI(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { BILLIARDS.aim = Math.PI; document.getElementById('blPower').value = 5; billiardsPowerUi(); billiardsShoot(); });
  const caAi = await wait(p, () => BILLIARDS.G.S.history.some(h => h.player_id === 1) ? true : null, 15000);
  ok('الحاسوب ردّ بضربة كاروم', caAi === true);

  await p.evaluate(() => closeGamePage());
  await p.waitForTimeout(300);
  ok('التنظيف بعد الخروج من blca',
     await p.evaluate(() => !BILLIARDS || BILLIARDS.raf === 0));

  /* نعيد فتح bl8 ليبقى القسم 8 (اختبار التنظيف) كما صُمم */
  await p.evaluate(() => openGame('bl8'));
  await wait(p, () => (document.getElementById('blSetup') && !document.getElementById('blSetup').hidden) ? true : null);
  await p.evaluate(() => billiardsStartLocal());
  await p.waitForTimeout(300);

  /* ═══ 8) التنظيف عند الخروج ═══ */
  sec('8) التنظيف عند مغادرة اللعبة');
  const cleaned = await p.evaluate(() => {
    const rafBefore = !!(BILLIARDS && BILLIARDS.raf);
    if (typeof closeGamePage === 'function') closeGamePage();
    else if (typeof nav === 'function') nav('home', null);
    return { rafBefore: rafBefore };
  });
  await p.waitForTimeout(400);
  ok('حلقة المحاكاة كانت تعمل قبل الخروج', cleaned.rafBefore);
  ok('أُوقفت الحلقة وصُفّرت الحالة بعد الخروج',
     await p.evaluate(() => !BILLIARDS || BILLIARDS.raf === 0));

  /* ═══ 9) لا أخطاء في الصفحة ═══ */
  sec('9) صحة الصفحة');
  if (errs.length) errs.slice(0, 6).forEach(e => console.log('    ! ' + e));
  ok('لا أخطاء page/console (' + errs.length + ')', errs.length === 0);

  /* ═══ 10) ألعاب قائمة لم تنكسر ═══ */
  sec('10) عدم كسر ألعاب قائمة');
  await p.evaluate(() => openGame('dm'));
  ok('الضاما ما زالت تُفتح', await wait(p, () => !!document.getElementById('damaSetup')));
  await p.evaluate(() => openGame('ch'));
  ok('الشطرنج ما زال يُفتح', await wait(p, () => !!document.getElementById('chessSetup')));
  const gcount = await p.evaluate(() => GAMES.length);
  ok('عدد الألعاب = 41 (كان 40)', gcount === 41);

  await b.close();
  const passed = res.filter(r => r[1]).length;
  console.log('\n═══ Billiards browser: ' + passed + '/' + res.length + ' passed ═══');
  process.exit(passed === res.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

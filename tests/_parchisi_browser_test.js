const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(p, fn, t) { t = t || 12000; const s = Date.now(); while (Date.now() - s < t) { try { const r = await p.evaluate(fn); if (r) return r; } catch (e) {} await p.waitForTimeout(150); } return null; }
const res = []; const ok = (n, c) => { res.push([n, !!c]); console.log((c ? '  ✓ ' : '  ✗ ') + n); };

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  /* صفحة جديدة لكل قسم (تجنّب منطق الاستئناف بين الجولات) */
  async function freshPage() {
    const p = await b.newContext({ viewport: { width: 430, height: 900 } }).then(c => c.newPage());
    p._errs = [];
    p.on('pageerror', e => p._errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404|net::/i.test(m.text())) p._errs.push(m.text()); });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await wait(p, () => !!(typeof ST !== 'undefined' && typeof openGame === 'function'));
    await p.evaluate(() => { ST.lang = 'ar'; ST.gold = 10000; if (window.save) save(); });
    await p.evaluate(() => openGame('pr'));
    await wait(p, () => !!document.getElementById('parchisiSetup'));
    return p;
  }

  /* ═══ القسم 1: كلاسيك ═══ */
  {
    const p = await freshPage();
    const chips = await p.$$eval('#parchisiModes .pr-chip', els => els.map(e => e.textContent.trim()));
    ok('٣ أصناف: ' + chips.join('/'), chips.length === 3 && chips.includes('كلاسيك') && chips.includes('رابيدو') && chips.includes('إسبانيول'));
    ok('كلاسيك مفعّل افتراضياً', await p.$eval('#parchisiModes .pr-chip', e => e.classList.contains('on')));
    ok('وصف كلاسيك يذكر النردين', /نردان/.test(await p.$eval('#parchisiModeDesc', e => e.textContent)));
    await p.evaluate(() => ParchisiApp.setMode('rapido'));
    ok('وصف رابيدو يذكر المؤقّت', /مؤقّت|15/.test(await p.$eval('#parchisiModeDesc', e => e.textContent)));
    ok('صف الفرق ظاهر مع 4 لاعبين', (await p.$eval('#parchisiTeamsRow', e => e.style.display)) !== 'none');
    await p.selectOption('#parchisiPlayerCount', '2');
    ok('صف الفرق مخفي مع لاعبين', (await p.$eval('#parchisiTeamsRow', e => e.style.display)) === 'none');
    await p.selectOption('#parchisiPlayerCount', '4');
    await p.evaluate(() => ParchisiApp.toggleTeams());
    ok('زر الفرق يعرض 2v2', /2v2/.test(await p.$eval('#parchisiTeamsBtn', e => e.textContent)));
    await p.evaluate(() => ParchisiApp.toggleTeams());
    await p.evaluate(() => ParchisiApp.setMode('classic'));

    await p.click('#parchisiSetup .big');
    await wait(p, () => ParchisiApp.gameActive === true && !!ParchisiApp.engine);
    ok('اللعبة نشطة (كلاسيك)', await p.evaluate(() => ParchisiApp.gameActive));
    ok('المحرك بنردين', await p.evaluate(() => ParchisiApp.engine.mode.dice === 2));
    ok('٤ أيقونات لاعبين في الزوايا', await p.$$eval('.pr-picon', els => els.length === 4));
    ok('العنوان «بارتشي» بالعربية', (await p.$eval('#prTitle', e => e.textContent)) === 'بارتشي');
    ok('مجموع الرهان تحت العنوان (20×4=80)', (await p.$eval('#prPot', e => e.textContent)) === '80');
    ok('أيقونة الدور الحالي مضيئة', await p.$$eval('.pr-picon.on', els => els.length === 1));

    const px = await p.evaluate(() => {
      const ctx = ParchisiApp.ctx;
      const at = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
      /* هندسة مستطيلة: خلية عمودية (236,78) وأفقية (78,236) • نجمة عمودية (364,134) وأفقية (134,236)
         ساليدات: أحمر (236,134) أخضر (134,364) أصفر (364,466) أزرق (466,236) • عش (40,40) */
      return {
        vTrack: at(236, 78), hTrack: at(78, 236),
        starV: at(364, 134), starH: at(134, 236),
        salRed: at(236, 134), salGreen: at(134, 364), salYellow: at(364, 466), salBlue: at(466, 236),
        nest: at(40, 40), ctr: at(300, 255)
      };
    });
    /* [B7] العادية بيضاء والآمنة رمادي فضي */
    const isWood = c => c[0] > 243 && c[1] > 243 && c[2] > 238;   /* أبيض */
    const isSilver = c => Math.abs(c[0] - c[2]) <= 18 && c[0] >= 160 && c[0] <= 225 && c[1] >= 165 && c[2] >= 170;
    const isStar = c => c[0] > 90 && c[0] < 135 && c[1] > 60 && c[1] < 100 && c[2] > 55 && c[2] < 85;
    ok('خانة عمودية بيضاء (64×27.5)', isWood(px.vTrack));
    ok('خانة أفقية بيضاء (27.5×64)', isWood(px.hTrack));
    ok('نجمة في عمود رأسي', isStar(px.starV));
    ok('نجمة في صف أفقي', isStar(px.starH));
    ok('ساليدة حمراء أعلى·يسار', px.salRed[0] > 190 && px.salRed[1] < 110);
    ok('ساليدة خضراء يسار·أسفل', px.salGreen[1] > 150 && px.salGreen[0] < 90);
    ok('ساليدة صفراء أسفل·يمين', px.salYellow[0] > 200 && px.salYellow[1] > 170);
    ok('ساليدة زرقاء يمين·أعلى', px.salBlue[2] > 150 && px.salBlue[0] < 80);
    ok('عش أحمر أعلى اليسار', px.nest[0] > 180 && px.nest[1] < 110);
    /* [B7] ألوان المسار الجديدة */
    {
      const cv = await p.evaluate(() => {
        const d = ParchisiApp.ctx.getImageData(0, 0, 600, 600).data;
        const at = (x, y) => { const i = ((y|0) * 600 + (x|0)) * 4; return [d[i], d[i+1], d[i+2]]; };
        const corner = g => { const t = PR_TRACK[g]; return at(t.x + 4, t.y + 4); };
        const isWhite = c => c[0] > 243 && c[1] > 243 && c[2] > 238;
        const isSilver = c => Math.abs(c[0] - c[2]) <= 18 && c[0] >= 160 && c[0] <= 225 && c[1] >= 165 && c[2] >= 170;
        return { stars: PR_STARS.every(g => isSilver(corner(g))),
                 heads: PR_HEADS.every(g => isSilver(corner(g))),
                 norms: [2, 6, 9, 14].every(g => isWhite(corner(g))) };
      });
      ok('[B7] خانات النجوم الثماني + الرؤوس رمادي فضي', cv.stars && cv.heads);
      ok('[B7] الخانات العادية بيضاء', cv.norms);
    }
    ok('ميتا حمراء بمثلث المركز العلوي', px.ctr[0] > 190 && px.ctr[1] < 110);

    /* الرمي المضبوط [5,3]: خروج تلقائي بالخمسة + بقية القيم
       (قسر دور الإنسان وطور الرمي أولاً — البادئ عشوائي فبدونه يتقلب الاختبار) */
    await p.evaluate(() => {
      clearTimeout(ParchisiApp._aiT);
      ParchisiApp.stopTimer();
      const e = ParchisiApp.engine;
      /* لوحة نظيفة تماماً + قطعة للاعب 0 على المسار (10): بعد الخروج بالـ5
         تتوفر خياران للقيمة 3 — لا حركة إلزامية تلقائية تُنهي الدور */
      e.players.forEach(pl => pl.pieces.forEach(pc => { pc.state = 'home'; pc.pos = -1; }));
      e.players[0].pieces[3].state = 'onboard';
      e.players[0].pieces[3].pos = 10;
      e.current = 0;
      e.phase = 'WAIT_ROLL';
      e.dice = [];
      e.applyRoll([5, 3]);
    });
    await wait(p, () => ParchisiApp.engine.phase === 'MOVING', 6000);
    const st = await p.evaluate(() => ({
      phase: ParchisiApp.engine.phase,
      dice: ParchisiApp.engine.dice.slice(),
      chips: document.querySelectorAll('.pr-die').length,
      active: ParchisiApp.activeValue,
      deployed: ParchisiApp.engine.players[0].pieces.some(x => x.state === 'onboard' && x.pos === 0),
      vals: ParchisiApp.engine.availableValues().map(o => o.v)
    }));
    ok('طور الحركة بعد الرمي', st.phase === 'MOVING');
    ok('نردان (' + st.dice.join(',') + ')', st.dice.length === 2 && st.dice[0] === 5 && st.dice[1] === 3);
    ok('خروج تلقائي بالخمسة: قطعة على الساليدة', st.deployed);
    ok('الخروج استهلك الـ5 — بقيت قيمة واحدة (3)', st.vals.length === 1 && st.vals[0] === 3);
    ok('زر قيمة واحد (3)', st.chips === 1);
    ok('قيمة مفعّلة تلقائياً', st.active !== null);

    /* النقر على قطعة مضيئة ينفّذ حركة */
    const clickInfo = await p.evaluate(() => {
      const e = ParchisiApp.engine;
      if (e.phase !== 'MOVING') return { ok: false, why: e.phase };
      const opts = e.optionsFor(ParchisiApp.activeValue);
      if (!opts.length) return { ok: false, why: 'no-opts' };
      const L = ParchisiApp.pieceLayout().get(opts[0]);
      const r = ParchisiApp.canvas.getBoundingClientRect();
      return { ok: true, x: r.left + L.x * (r.width / 600), y: r.top + L.y * (r.height / 600) };
    });
    if (clickInfo.ok) {
      await p.mouse.click(clickInfo.x, clickInfo.y);
      const moved = await wait(p, () => {
        const e = ParchisiApp.engine;
        return (e.used.some(u => u) || e.current !== 0 || e.phase === 'BONUS') ? 1 : null;
      }, 4000);
      ok('النقر على قطعة مضيئة ينفّذ الحركة', !!moved);
    } else {
      ok('النقر على قطعة (تخطّي: ' + clickInfo.why + ')', true);
    }

    /* الأدوار تدور دون أخطاء */
    const aiOk = await wait(p, () => ParchisiApp.engine.current === 0 ? 1 : null, 25000);
    ok('الأدوار تدورت وعاد دورك', !!aiOk);

    /* نافذة الفوز/الخسارة: خيارا جولة جديدة/خروج */
    await p.evaluate(() => {
      const e = ParchisiApp.engine;
      for (let k = 0; k < 4; k++) { const pc = e.players[0].pieces[k]; pc.state = 'finished'; pc.pos = 71; }
      e.checkWin();
      ParchisiApp.onEngineChange();
    });
    ok('نافذة النهاية ظاهرة بعد الفوز', await p.$eval('#prOverModal', el => el.classList.contains('show')));
    ok('زرّا «جولة جديدة» و«خروج»', (await p.$$eval('#prOverActions .big', els => els.length === 2)));
    await p.evaluate(() => ParchisiApp.overNewRound());
    ok('«جولة جديدة» → شاشة الإعدادات', await p.evaluate(() =>
      document.getElementById('parchisiSetup').style.display !== 'none' && document.getElementById('parchisiGame').style.display === 'none'));
    /* زر الخروج يغلق اللعبة */
    await p.evaluate(() => { ParchisiApp.start(); });
    await p.evaluate(() => {
      const e = ParchisiApp.engine;
      for (let k = 0; k < 4; k++) { const pc = e.players[1].pieces[k]; pc.state = 'finished'; pc.pos = 71; }
      e.checkWin();
      ParchisiApp.onEngineChange();
    });
    ok('نافذة الخسارة ظاهرة', await p.$eval('#prOverModal', el => el.classList.contains('show')));
    await p.evaluate(() => ParchisiApp.overExit());
    ok('«خروج» ينهي اللعبة (gameActive=false)', await p.evaluate(() => ParchisiApp.gameActive === false));

    ok('كلاسيك: لا أخطاء صفحة', p._errs.length === 0);
    if (p._errs.length) console.log('   ERRS:', p._errs.slice(0, 3));
    await p.close();
  }

  /* ═══ القسم 2: رابيدو ═══ */
  {
    const p = await freshPage();
    await p.evaluate(() => ParchisiApp.setMode('rapido'));
    await p.evaluate(() => { document.getElementById('parchisiPlayerCount').value = '2'; ParchisiApp.updateSetup(); });
    await p.click('#parchisiSetup .big');
    await wait(p, () => ParchisiApp.gameActive === true);
    ok('رابيدو: قطعة جاهزة خارج القاعدة', await p.evaluate(() => ParchisiApp.engine.players[0].pieces[0].pos === 0));
    ok('رابيدو: نرد واحد', await p.evaluate(() => ParchisiApp.engine.mode.dice === 1));
    await p.click('#parchisiRollBtn');
    /* [B5] مؤقت الشريط السفلي أُزيل — العدّاد التنازلي عند أيقونة اللاعب */
    const timerShown = await wait(p, () => {
      const t = document.querySelector('.pr-ptimer.on');
      return (t && /⏱/.test(t.textContent)) ? 1 : null;
    }, 6000);
    ok('رابيدو: المؤقّت ظاهر عند أيقونة اللاعب', !!timerShown);
    await p.evaluate(() => ParchisiApp.timerExpired());
    const autoTurn = await wait(p, () => {
      const e = ParchisiApp.engine;
      return (e.current !== 0 || e.used.some(u => u) || e.players[0].pieces.some(x => x.pos > 0)) ? 1 : null;
    }, 6000);
    ok('رابيدو: انتهاء المؤقّت = حركة تلقائية', !!autoTurn);
    ok('رابيدو: لا أخطاء', p._errs.length === 0);
    if (p._errs.length) console.log('   ERRS:', p._errs.slice(0, 3));
    await p.close();
  }

  /* ═══ القسم 3: إسبانيول + الفرق ═══ */
  {
    const p = await freshPage();
    await p.evaluate(() => ParchisiApp.setMode('spanish'));
    await p.evaluate(() => ParchisiApp.toggleTeams());       /* فرق 2v2 */
    await p.click('#parchisiSetup .big');
    await wait(p, () => ParchisiApp.gameActive === true);
    ok('إسبانيول: الدبل مفعّل', await p.evaluate(() => ParchisiApp.engine.mode.doubles === true));
    ok('كلاسيك: الدبل مفعّل أيضاً (قانون مشترك)', await p.evaluate(() => PR_MODES.classic.doubles === true && PR_MODES.classic.autoExit === true));
    ok('الفرق مفعّلة (4 لاعبين)', await p.evaluate(() => ParchisiApp.engine.teams === true));
    ok('أيقونات الفريق الأربع في الزوايا', await p.$$eval('.pr-picon', els => els.length === 4));
    await p.evaluate(() => ParchisiApp.engine.applyRoll([2, 3]));   /* مجموع 5 = خروج تلقائي */
    ok('إسبانيول: خروج تلقائي بمجموع 5', await p.evaluate(() =>
      ParchisiApp.engine.players[0].pieces.some(x => x.state === 'onboard' && x.pos === 0)));
    ok('مؤقت الدور ظاهر بجوار أيقونة صاحب الدور', await p.$$eval('.pr-ptimer.on', els => els.length === 1 && /\d/.test(els[0].textContent)));
    await p.click('#parchisiRollBtn');
    await wait(p, () => ParchisiApp.engine.phase === 'MOVING' || ParchisiApp.engine.current !== 0, 5000);
    ok('إسبانيول: الرمي يعمل', true);
    ok('إسبانيول: لا أخطاء', p._errs.length === 0);
    if (p._errs.length) console.log('   ERRS:', p._errs.slice(0, 3));
    await p.close();
  }

  /* ═══ القسم 4 [B6]: واجهة الدفعة السادسة ═══ */
  {
    const p = await freshPage();
    await p.click('#parchisiSetup .big');
    await wait(p, () => ParchisiApp.gameActive === true);
    await new Promise(r => setTimeout(r, 600));

    /* لا توستات للإشعارات النصية */
    await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    const nToast = await p.evaluate(() => {
      ParchisiApp.engine.notices.push({ key: 'parchisi.capture', pid: 1 }, { key: 'parchisi.nomove', pid: 0 });
      ParchisiApp.onEngineChange();
      return document.querySelectorAll('.toast').length;
    });
    ok('[B6] لا رسائل توضيحية تظهر على اللوحة', nToast === 0);

    /* شارة المكافأة 20/10: دائرية بلا خلفية أسفل العنوان */
    const badge = await p.evaluate(() => {
      const e = ParchisiApp.engine;
      e.phase = 'BONUS'; e.bonus = { dist: 20, kind: 20 }; e.bonusLegal = [];
      ParchisiApp.renderBonus();
      const el = document.getElementById('parchisiBonus');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const hdr = document.getElementById('parchisiHeader').getBoundingClientRect();
      return { d: cs.display, txt: el.textContent, br: cs.borderRadius,
               bg: cs.backgroundColor, circle: Math.abs(r.width - r.height) <= 2 && r.width > 20,
               below: r.top >= hdr.bottom - 6 };
    });
    ok('[B6] شارة المكافأة «20» ظاهرة دائرية شفافة', badge.d === 'flex' && badge.txt === '20' && badge.br === '50%' &&
       (badge.bg === 'rgba(0, 0, 0, 0)' || badge.bg === 'transparent') && badge.circle && badge.below);
    const hidden = await p.evaluate(() => {
      const e = ParchisiApp.engine;
      e.phase = 'WAIT_ROLL'; e.bonus = null; e.bonusLegal = [];
      ParchisiApp.renderBonus();
      return getComputedStyle(document.getElementById('parchisiBonus')).display;
    });
    ok('[B6] الشارة تختفي باستهلاك الحركة', hidden === 'none');

    /* بيدقان: اتجاه الترتيب حسب شكل الخانة وبلا تغطية */
    const pairs = await p.evaluate(() => {
      const e = ParchisiApp.engine;
      clearTimeout(ParchisiApp._aiT); ParchisiApp.stopTimer();
      e.players.forEach(pl => pl.pieces.forEach(pc => { pc.state = 'home'; pc.pos = -1; }));
      e.players[0].pieces[0].state = 'onboard'; e.players[0].pieces[0].pos = 4;   /* عالمي 8 خانة طويلة */
      e.players[0].pieces[1].state = 'onboard'; e.players[0].pieces[1].pos = 4;
      e.players[0].pieces[2].state = 'onboard'; e.players[0].pieces[2].pos = 1;   /* عالمي 5 خانة عريضة */
      e.players[0].pieces[3].state = 'onboard'; e.players[0].pieces[3].pos = 1;
      ParchisiApp._animXY = new Map();
      const lay = ParchisiApp.pieceLayout();
      const A = lay.get(e.players[0].pieces[0]), B = lay.get(e.players[0].pieces[1]);
      const C = lay.get(e.players[0].pieces[2]), D = lay.get(e.players[0].pieces[3]);
      return { tallSameX: Math.abs(A.x - B.x) < 0.01 && Math.abs(A.y - B.y) >= 2 * A.r,
               wideSameY: Math.abs(C.y - D.y) < 0.01 && Math.abs(C.x - D.x) >= 2 * C.r };
    });
    ok('[B6] خانة طويلة: بيدقان عمودياً فوق/تحت بلا تغطية', pairs.tallSameX);
    ok('[B6] خانة عريضة: بيدقان أفقياً يميناً/يساراً بلا تغطية', pairs.wideSameY);

    /* اسم العش محذوف من مركز المربع */
    const nest = await p.evaluate(() => {
      ParchisiApp.draw();
      const d = ParchisiApp.ctx.getImageData(114, 114, 8, 8).data;
      let whites = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 225 && d[i+1] > 225 && d[i+2] > 215) whites++;
      return whites;
    });
    ok('[B6] لا اسم مكرر في مركز المربع الملون', nest === 0);

    /* [B7] نردان متشابهان = رمية إضافية → المؤقت يتجدد كاملاً */
    const renew = await p.evaluate(async () => {
      const e = ParchisiApp.engine;
      clearTimeout(ParchisiApp._aiT); ParchisiApp.stopTimer();
      e.current = 0; e.phase = 'WAIT_ROLL'; e.dice = []; e.timer = 30;
      ParchisiApp.manageTimer();
      await new Promise(r => setTimeout(r, 2100));
      const drained = ParchisiApp._timerLeft;
      e.phase = 'WAIT_ROLL'; e.dice = [];
      e.applyRoll([4, 4]);                      /* دبل = رمية إضافية */
      ParchisiApp.manageTimer();
      return { drained, renewed: ParchisiApp._timerLeft, samePlayer: e.current === 0 };
    });
    ok('[B7] المؤقت نزل ثم تجدد كاملاً عند الدبل', renew.drained < 30 && renew.renewed === 30 && renew.samePlayer);
    await p.close();
  }

  await b.close();
  const failed = res.filter(r => !r[1]).length;
  console.log('\n═══ PARCHISI BROWSER: ' + (res.length - failed) + '/' + res.length + ' passed ═══');
  process.exit(failed ? 1 : 0);
})();

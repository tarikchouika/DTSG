/* ══════════════════════════════════════════════════════════════════
   Billiards Rule Engines — محركات القواعد (مستقلة عن الفيزياء والواجهة)
   ══════════════════════════════════════════════════════════════════
   §10 من مرجع القواعد: «اجعل الفيزياء مستقلة عن قواعد اللعبة:
   Physics Engine يُنتج الأحداث، وRule Engine يقرر قانونيتها وتأثيرها».

   كل Rule Set مُصدَّر ومع إصدار (versioned) لأن الهيئات تنشر تحديثات.
   الأصناف الأربعة تُبنى هنا تباعاً:
     ✅ eightball  — WPA 8-Ball
     ⬜ blackball  — EPA International Rules v2d   (المرحلة 3)
     ⬜ snooker    — WPBSA                          (المرحلة 4)
     ⬜ carom      — UMB                            (المرحلة 5)

   يعمل في Node (اختبارات) وفي المتصفح بنفس الملف.
   ══════════════════════════════════════════════════════════════════ */
"use strict";
(function (root) {

  var BP = root.BilliardsPhysics ||
    (typeof require === 'function' ? require('./billiards-physics.js') : null);
  if (!BP) throw new Error('BilliardsRules: يتطلب billiards-physics.js');

  /* ══════════════════════════════════════════════════════════
     [V19] نواة الخبير المشتركة — محاكاة headless للضربات المرشحة
     البوت لا «يخمّن» هندسياً بعد الآن: كل ضربة مرشحة تُحاكى فعلياً
     بنفس محرك الفيزياء الحتمي، وتُقيَّم نتيجتها (rec) مقابل قواعد
     النمط قبل الاختيار — فلا أخطاء NO_RAIL/ILLEGAL_FIRST_CONTACT
     ولا سكراتش إلا حين لا يوجد بديل قانوني إطلاقاً.
     حتمية 100%: لا عشوائية — نفس الوضعية تعطي نفس الضربة (أونلاين آمن).
     ══════════════════════════════════════════════════════════ */
  var AI_SIM_STEPS = BP.HZ * 18;              /* سقف محاكاة 18 ثانية لكل مرشح */
  var AI_POWERS = [30, 42, 55, 68, 82, 94];   /* [AI-MAX] شبكة قوى أدق — البوت يحاكي كل مرشح ويختار الأمثل */

  function aiCloneBalls(balls) {
    var out = [];
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      out.push({ id: b.id, type: b.type, value: b.value, group: b.group,
        x: b.x, y: b.y, vx: 0, vy: 0, status: b.status,
        phase: 0, dx: 0, dy: 1, pocket: b.pocket || null });
    }
    return out;
  }

  function aiSimulate(table, balls, angle, power) {
    var sim = aiCloneBalls(balls);
    var rec = BP.newRec(-1, -1, null);
    if (!BP.applyShot(sim, angle, BP.powerToSpeed(power), rec)) return null;
    BP.runUntilStopped(table, sim, rec, AI_SIM_STEPS);
    return { balls: sim, rec: rec };
  }

  /* نقطة الشبح لتصويب كرة نحو جيب */
  function aiGhost(c, tb, pk, R) {
    var tp = Math.atan2(pk.y - tb.y, pk.x - tb.x);
    var gx = tb.x - Math.cos(tp) * 2 * R, gy = tb.y - Math.sin(tp) * 2 * R;
    var aim = Math.atan2(gy - c.y, gx - c.x);
    var cut = Math.abs(aim - tp); while (cut > Math.PI) cut = Math.abs(cut - 2 * Math.PI);
    return { aim: aim, cut: cut, gx: gx, gy: gy,
      dist: Math.hypot(gx - c.x, gy - c.y),
      potDist: Math.hypot(pk.x - tb.x, pk.y - tb.y) };
  }

  /* مسار البيضاء إلى نقطة الشبح: أول جسم يلتقيه الشعاع يجب أن يكون الهدف */
  function aiCuePathClear(table, balls, c, g, targetId) {
    var hit = BP.castAim(table, balls, c.x, c.y, g.aim, g.dist + 60);
    return hit.kind === 'ball' && hit.id === targetId;
  }

  /* مسار الهدف إلى الجيب: لا كرة أخرى تسدّه */
  function aiPotPathClear(table, balls, tb, pk, R) {
    var others = [];
    for (var i = 0; i < balls.length; i++) if (balls[i].id !== tb.id) others.push(balls[i]);
    var ang = Math.atan2(pk.y - tb.y, pk.x - tb.x);
    var d = Math.hypot(pk.x - tb.x, pk.y - tb.y);
    var hit = BP.castAim(table, others, tb.x, tb.y, ang, Math.max(10, d - R));
    return hit.kind !== 'ball';
  }

  /* البحث عن أفضل ضربة: مرشحو تسديد (هدف×جيب) + مرشحو أمان، كلٌّ يُحاكى ويُقيَّم.
     scoreFn(sim.rec, sim.balls, ctx) يعيد درجة — الأعلى يفوز. */
  function aiBestShot(table, balls, cueBall, targets, scoreFn, opts) {
    var best = null;
    var i, t, p, g, pw, sim, sc;
    /* 1) مرشحو التسديد نحو الجيوب */
    for (t = 0; t < targets.length; t++) {
      var tb = targets[t];
      for (p = 0; p < table.pockets.length; p++) {
        var pk = table.pockets[p];
        g = aiGhost(cueBall, tb, pk, table.R);
        if (g.cut > 1.45) continue;
        if (!aiCuePathClear(table, balls, cueBall, g, tb.id)) continue;
        if (!aiPotPathClear(table, balls, tb, pk, table.R)) continue;
        for (i = 0; i < AI_POWERS.length; i++) {
          pw = Math.min(100, AI_POWERS[i] + Math.round(g.dist * 0.03) + Math.round(g.potDist * 0.02));
          sim = aiSimulate(table, balls, g.aim, pw);
          if (!sim) continue;
          sc = scoreFn(sim.rec, sim.balls, { pot: true, cut: g.cut, power: pw });
          if (!best || sc > best.sc) best = { sc: sc, angle: g.aim, power: pw };
        }
      }
    }
    /* 2) مرشحو الأمان: ضرب الهدف القانوني مباشرة (بزوايا طفيفة) بقوى مختلفة —
       المحاكاة تتكفل برفض ما يسبب NO_RAIL أو سكراتش */
    var offs = [0, 0.03, -0.03, 0.07, -0.07, 0.12, -0.12, 0.2, -0.2];   /* [AI-MAX] مروحة أمان أوسع */
    for (t = 0; t < targets.length && t < 4; t++) {
      var tb2 = targets[t];
      var base = Math.atan2(tb2.y - cueBall.y, tb2.x - cueBall.x);
      for (i = 0; i < offs.length; i++) {
        var a2 = base + offs[i];
        var pws = [30, 52];
        for (p = 0; p < pws.length; p++) {
          sim = aiSimulate(table, balls, a2, pws[p]);
          if (!sim) continue;
          sc = scoreFn(sim.rec, sim.balls, { pot: false, cut: 0, power: pws[p] });
          if (!best || sc > best.sc) best = { sc: sc, angle: a2, power: pws[p] };
        }
      }
    }
    /* 2أ) [V19.3] لمسة الخبير الناعمة: حين لا توجد ضربة قانونية بعد — مروحة
       زوايا دقيقة حول التصويب المباشر لكل هدف بقوى منخفضة (لمس بلا مخاطرة
       إسقاط في حفرة خاطئة) — هذا ما يفعله المحترف على السوداء المقيدة */
    if (!best || best.sc < 0) {
      var softOffs = [0, 0.02, -0.02, 0.04, -0.04, 0.07, -0.07, 0.1, -0.1, 0.14, -0.14, 0.2, -0.2];
      var softPws = [12, 18, 25, 35, 45];
      for (t = 0; t < targets.length && t < 3; t++) {
        var tbS = targets[t];
        var baseS = Math.atan2(tbS.y - cueBall.y, tbS.x - cueBall.x);
        var softDone = false;
        for (i = 0; i < softOffs.length && !softDone; i++) {
          for (p = 0; p < softPws.length; p++) {
            sim = aiSimulate(table, balls, baseS + softOffs[i], softPws[p]);
            if (!sim) continue;
            sc = scoreFn(sim.rec, sim.balls, { pot: false, cut: 0, power: softPws[p] });
            if (!best || sc > best.sc) best = { sc: sc, angle: baseS + softOffs[i], power: softPws[p] };
            if (best.sc > 0) { softDone = true; break; }
          }
        }
        if (best && best.sc > 0) break;
      }
    }
    /* 2ب) [V19.3] هروب بالوسادة (المرايا): حين يكون المسار المباشر للهدف محجوباً،
       الخبير يلعب على الوسادة أولاً — نعكس الهدف على محاور الوسائد الأربع
       (وانعكاسات مزدوجة للزوايا الصعبة) ونصوّب نحو النقطة المرآتية */
    if (!best || best.sc < 0) {
      for (t = 0; t < targets.length && t < 3; t++) {
        var tm = targets[t];
        var mirrors = [
          { x: -tm.x, y: tm.y }, { x: 2 * table.W - tm.x, y: tm.y },
          { x: tm.x, y: -tm.y }, { x: tm.x, y: 2 * table.H - tm.y },
          { x: -tm.x, y: -tm.y }, { x: 2 * table.W - tm.x, y: 2 * table.H - tm.y },
          { x: -tm.x, y: 2 * table.H - tm.y }, { x: 2 * table.W - tm.x, y: -tm.y }
        ];
        var mOffs = [0, 0.02, -0.02, 0.045, -0.045];
        for (i = 0; i < mirrors.length; i++) {
          var am0 = Math.atan2(mirrors[i].y - cueBall.y, mirrors[i].x - cueBall.x);
          for (var mo = 0; mo < mOffs.length; mo++) {
            var am = am0 + mOffs[mo];
            var pwsM = [18, 30, 45, 65, 88];   /* [V19.3] قوى منخفضة للمسات الارتدادية الناعمة */
            for (p = 0; p < pwsM.length; p++) {
              sim = aiSimulate(table, balls, am, pwsM[p]);
              if (!sim) continue;
              sc = scoreFn(sim.rec, sim.balls, { pot: false, cut: 0, power: pwsM[p] });
              if (!best || sc > best.sc) best = { sc: sc, angle: am, power: pwsM[p] };
            }
            if (best && best.sc > 0) break;
          }
          if (best && best.sc > 0) break;
        }
        if (best && best.sc > 0) break;
      }
    }
    /* 3) هروب من السنوكر: إن كانت كل المرشحات مخالفة، مسح كامل للدائرة
       بحثاً عن أي ضربة قانونية (ارتدادات الوسائد تصل للهدف المحجوب) —
       الخبير الحقيقي لا يرتكب خطأً إلا حين يستحيل البديل */
    if (!best || best.sc < 0) {
      var sweepDone = false;
      for (i = 0; i < 96 && !sweepDone; i++) {
        var a3 = (i / 96) * Math.PI * 2;
        var pws3 = [30, 50, 75, 100];   /* [V19.3] القوة القصوى تفتح مسارات ارتدادية بعيدة */
        for (p = 0; p < pws3.length; p++) {
          sim = aiSimulate(table, balls, a3, pws3[p]);
          if (!sim) continue;
          sc = scoreFn(sim.rec, sim.balls, { pot: false, cut: 0, power: pws3[p] });
          if (!best || sc > best.sc) best = { sc: sc, angle: a3, power: pws3[p] };
          if (best.sc > 0) { sweepDone = true; break; }
        }
      }
      /* 3ب) [V19.3] مسح ناعم عالي الدقة (288 زاوية × 6 قوى حتى 100) قبل الاستسلام
         لضربة مخالفة — يلتقط المسارات الدقيقة بين الكرات الحاجبة والارتدادات
         البعيدة؛ يتوقف فور أول ضربة قانونية */
      if (!best || best.sc < 0) {
        var fineDone = false;
        var pws4 = [14, 22, 35, 50, 70, 85, 100];
        for (i = 0; i < 288 && !fineDone; i++) {
          /* ترتيب متداخل: ثلث الخطوة إزاحة يغطي فراغات المسح الخشن أولاً */
          var a4 = ((i % 96) / 96 + (Math.floor(i / 96) + 1) / (3 * 96)) * Math.PI * 2;
          for (p = 0; p < pws4.length; p++) {
            sim = aiSimulate(table, balls, a4, pws4[p]);
            if (!sim) continue;
            sc = scoreFn(sim.rec, sim.balls, { pot: false, cut: 0, power: pws4[p] });
            if (!best || sc > best.sc) best = { sc: sc, angle: a4, power: pws4[p] };
            if (best.sc > 0) { fineDone = true; break; }
          }
        }
      }
    }
    /* 4) [V19.3] بحث الفوز الإجباري (winSeek): حين تكون أفضل ضربة مجرد أمان
       (أقل من عتبة الفوز) والسياق يسمح بفوز مشروط (بوند/حفرة معلنة/ديرنيي) —
       مسح دائرة كاملة بقوى عالية بحثاً عن ضربة الفوز متعددة الوسائد؛
       يتوقف فور إيجادها ولا يستبدل الأمان إلا بفوز حقيقي */
    if (opts && opts.winSeek && best && best.sc > 0 && best.sc < opts.winSeek) {
      var wBest = null, wDone = false;
      for (i = 0; i < 96 && !wDone; i++) {
        var aw = (i / 96) * Math.PI * 2;
        var pwsW = [40, 65, 90, 100];
        for (p = 0; p < pwsW.length; p++) {
          sim = aiSimulate(table, balls, aw, pwsW[p]);
          if (!sim) continue;
          sc = scoreFn(sim.rec, sim.balls, { pot: false, cut: 0, power: pwsW[p] });
          if (sc >= opts.winSeek) { wBest = { sc: sc, angle: aw, power: pwsW[p] }; wDone = true; break; }
        }
      }
      if (wBest) best = wBest;
    }
    return best;
  }

  /* ══════════════════════════════════════════════════════════
     WPA 8-BALL
     ══════════════════════════════════════════════════════════ */
  var EIGHTBALL_META = {
    ruleset_id: 'WPA_8BALL',
    ruleset_version: '2026-08',
    source_authority: 'WPA',
    effective_date: '2026-08-27',
    physics_version: BP.PHYSICS_VERSION
  };

  var FOULS = {
    ILLEGAL_BREAK: 'ILLEGAL_BREAK',
    SCRATCH: 'SCRATCH',
    NO_CONTACT: 'NO_CONTACT',
    ILLEGAL_FIRST_CONTACT: 'ILLEGAL_FIRST_CONTACT',
    NO_RAIL: 'NO_RAIL',
    BALL_OFF_TABLE: 'BALL_OFF_TABLE'
  };

  function eightball(opts) {
    opts = opts || {};
    var table = BP.table('eightball');
    var built = BP.buildTable('eightball', opts.cuePos || null);

    var S = {
      meta: EIGHTBALL_META,
      table: table,
      balls: built.balls,
      phase: 'AIM',              /* AIM | PLACE | SHOT | END */
      breakShot: true,
      open: true,
      active: opts.firstPlayer || 0,
      groups: [null, null],
      pocketOrder: [],
      history: [],
      frameOver: false,
      winner: null,
      endReason: null,
      rec: null,
      _shotNo: 0,
      _listeners: []
    };

    function on(fn) { S._listeners.push(fn); }
    function emit(ev) { for (var i = 0; i < S._listeners.length; i++) S._listeners[i](ev); }

    function cue() {
      for (var i = 0; i < S.balls.length; i++) if (S.balls[i].type === 'CUE') return S.balls[i];
      return null;
    }
    function byId(id) {
      for (var i = 0; i < S.balls.length; i++) if (S.balls[i].id === id) return S.balls[i];
      return null;
    }
    function groupCleared(g, exclude) {
      for (var i = 0; i < S.balls.length; i++) {
        var b = S.balls[i];
        if (b.type !== g) continue;
        if (exclude && exclude.indexOf(b) !== -1) continue;
        if (b.status === 'ON_TABLE') return false;
      }
      return true;
    }
    /* هل كانت المجموعة مُنظَّفة قبل هذه الضربة؟
       rec.pocketed = الكرات التي سقطت في هذه الضربة (لا نحتسبها «ما زالت على الطاولة») */
    function clearedBeforeShot(g, recPocketed) {
      var inRec = recPocketed || [];
      for (var i = 0; i < S.balls.length; i++) {
        var b = S.balls[i];
        if (b.type !== g) continue;
        if (b.status === 'ON_TABLE' && inRec.indexOf(b) === -1) return false;
      }
      return true;
    }
    function eight() { return byId(8); }

    function spotBall(b) {
      var x = table.footSpot.x, y = table.footSpot.y;
      var guard = 0;
      while (guard++ < 4000) {
        var clash = false;
        for (var i = 0; i < S.balls.length; i++) {
          var o = S.balls[i];
          if (o === b || o.status !== 'ON_TABLE') continue;
          var dx = o.x - x, dy = o.y - y;
          if (dx * dx + dy * dy < (2 * table.R) * (2 * table.R)) { clash = true; break; }
        }
        if (!clash) break;
        x -= table.R;
        if (x < table.R) { x = table.footSpot.x; y -= table.R * 2; }
        if (y < table.R) { y = table.footSpot.y; }
      }
      b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.status = 'SPOTTED';
      /* SPOTTED كرة عائدة للعب — تُعامل مع ON_TABLE في كل الفحوص */
      b.status = 'ON_TABLE';
      return b;
    }

    function enterPlace(behindHeadString) {
      var c = cue();
      S.phase = 'PLACE';
      S.placeRestriction = behindHeadString ? 'HEAD' : 'ANY';
      c.status = 'OFF_TABLE'; c.vx = 0; c.vy = 0;
    }

    function validPlace(x, y) {
      if (!BP.validPlace(table, S.balls, x, y)) return false;
      if (S.placeRestriction === 'HEAD' && x > table.headStringX) return false;
      return true;
    }

    function place(x, y) {
      if (S.phase !== 'PLACE' || S.frameOver) return false;
      if (!validPlace(x, y)) return false;
      var c = cue();
      c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.status = 'ON_TABLE';
      S.placeRestriction = null;
      S.phase = 'AIM';
      return true;
    }

    function shoot(angle, power, spin) {
      if (S.phase !== 'AIM' || S.frameOver) return false;
      var c = cue();
      if (!c || c.status !== 'ON_TABLE') return false;
      var speed = BP.powerToSpeed(power);
      S.rec = BP.newRec(S._shotNo, S.active, spin || null);
      S.rec.breakShot = S.breakShot;
      if (!BP.applyShot(S.balls, angle, speed, S.rec)) { S.rec = null; return false; }
      S.phase = 'SHOT';
      return true;
    }

    /* خطوة محاكاة واحدة (تُناديها الواجهة من حلقة requestAnimationFrame) */
    function stepPhysics() {
      if (S.phase !== 'SHOT') return false;
      BP.step(table, S.balls, BP.FRAME_DT, S.rec);
      return true;
    }
    function shotRunning() { return S.phase === 'SHOT' && !BP.allStopped(S.balls); }

    /* ══ RESOLVE — تطبيق القواعد على أحداث الفيزياء ══ */
    function resolve() {
      var rec = S.rec;
      if (!rec) return null;
      S.rec = null;
      var sh = S.active, op = 1 - sh, fouls = [], notes = [];
      var i, b;

      /* ══ ترتيب الخطوات مهم ══
         كل أحكام «قبل الضربة» تُحسب من الحالة قبل الترقية، والترقية إلى EIGHT
         لا تتم إلا بعد الحكم على الكرة 8 — وإلا تغيّرت الكرة القانونية داخل
         الضربة نفسها (علّة ظهرت في الاختبار: تنظيف المجموعة بآخر كرة كان
         يُحتسب خطأً ILLEGAL_FIRST_CONTACT). */
      /* لقطة «على الطاولة» قبل الضربة — تُستنتج من السجل لأن الفيزياء
         غيّرت الحالات أثناء المحاكاة (لا يمكن قراءتها من الكرات afterwards) */
      var potIds = {}, offIds = {}, i2;
      for (i2 = 0; i2 < rec.pocketed.length; i2++) potIds[rec.pocketed[i2].id] = true;
      for (i2 = 0; i2 < rec.off.length; i2++) offIds[rec.off[i2].id] = true;
      var wasOnTable = {};
      for (i2 = 0; i2 < S.balls.length; i2++) {
        var bb = S.balls[i2];
        wasOnTable[bb.id] = (bb.status === 'ON_TABLE' || potIds[bb.id] || offIds[bb.id]);
      }
      function groupHadBalls(g) {
        for (var k = 0; k < S.balls.length; k++) {
          var x = S.balls[k];
          if (x.type === g && wasOnTable[x.id]) return true;
        }
        return false;
      }
      /* هل كان اللاعب في طور الكرة 8 *قبل* الضربة؟ */
      var myGroupBefore = (S.open || !S.groups[sh]) ? null
        : (S.groups[sh] === 'EIGHT' ? 'EIGHT'
          : (groupHadBalls(S.groups[sh]) ? S.groups[sh] : 'EIGHT'));
      var shootingEight = (myGroupBefore === 'EIGHT');

      /* تسجيل الكرات الساقطة في صينية العرض */
      for (i = 0; i < rec.pocketed.length; i++) {
        b = rec.pocketed[i];
        if (b.type !== 'CUE') S.pocketOrder.push(b.id);
      }
      var pocketedObjs = [];
      for (i = 0; i < rec.pocketed.length; i++) if (rec.pocketed[i].type !== 'CUE') pocketedObjs.push(rec.pocketed[i]);

      /* ── 1) الأخطاء ── */
      if (rec.breakShot) {
        /* WPA: كسر قانوني = دخول كرة أو ملامسة ≥4 كرات للوسائد */
        if (pocketedObjs.length === 0 && Object.keys(rec.railBalls).length < 4) fouls.push(FOULS.ILLEGAL_BREAK);
      }
      if (rec.cuePocketed || rec.cueOff) fouls.push(FOULS.SCRATCH);
      if (!rec.first) fouls.push(FOULS.NO_CONTACT);
      else if (!rec.breakShot) {
        /* الكرة القانونية الأولى (بحسب الحالة قبل الضربة):
           طاولة مفتوحة أو بلا مجموعة → أي كرة ما عدا 8؛ مجموعة → إحداها؛ EIGHT → الثمانية */
        var legalFirst;
        if (S.open || !myGroupBefore) legalFirst = (rec.first.type !== 'EIGHT');
        else if (shootingEight) legalFirst = (rec.first.type === 'EIGHT');
        else legalFirst = (rec.first.type === myGroupBefore);
        if (!legalFirst) fouls.push(FOULS.ILLEGAL_FIRST_CONTACT);
      }
      if (rec.first && pocketedObjs.length === 0 && rec.railsAfter === 0) fouls.push(FOULS.NO_RAIL);
      if (rec.off.length) fouls.push(FOULS.BALL_OFF_TABLE);
      var foul = fouls.length > 0;

      /* ── 2) الكرة 8 (تُحكم قبل أي ترقية للمجموعة) ── */
      var eightP = null;
      for (i = 0; i < rec.pocketed.length; i++) if (rec.pocketed[i].type === 'EIGHT') eightP = rec.pocketed[i];
      if (!eightP) for (i = 0; i < rec.off.length; i++) if (rec.off[i].type === 'EIGHT') eightP = rec.off[i];

      var frameResult = null;
      if (eightP) {
        if (rec.breakShot) {
          /* WPA: دخول 8 في الكسر = تُعاد إلى نقطة القدم والإطار يستمر (بلا خسارة) */
          notes.push('EIGHT_RESPOTTED_ON_BREAK');
        } else if (!shootingEight) {
          frameResult = { winner: op, reason: 'EIGHT_EARLY' };   /* لم تُنظَّف المجموعة بعد */
        } else if (foul) {
          frameResult = { winner: op, reason: 'EIGHT_ON_FOUL' };
        } else {
          frameResult = { winner: sh, reason: 'EIGHT_LEGAL' };
        }
      }

      /* ── 3) إعادة الكرات الخارجة والثمانية ── */
      if (eightP && rec.breakShot) spotBall(eightP);
      for (i = 0; i < rec.off.length; i++) if (rec.off[i].type !== 'EIGHT') spotBall(rec.off[i]);

      /* ── 4) تعيين المجموعات (طاولة مفتوحة) ── */
      if (S.open && !foul && !frameResult) {
        var firstPot = null;
        for (i = 0; i < rec.pocketed.length; i++) {
          var pb = rec.pocketed[i];
          if (pb.type === 'SOLID' || pb.type === 'STRIPE') { firstPot = pb; break; }
        }
        if (firstPot) {
          S.groups[sh] = firstPot.type;
          S.groups[op] = firstPot.type === 'SOLID' ? 'STRIPE' : 'SOLID';
          S.open = false;
        }
      }

      /* ── 5) استمرار الدور (بمجموعة ما قبل الضربة) ── */
      var keep = false;
      if (!foul && !frameResult) {
        for (i = 0; i < rec.pocketed.length; i++) {
          var pb2 = rec.pocketed[i];
          if (pb2.type === 'CUE') continue;
          if (!myGroupBefore || pb2.type === myGroupBefore) { keep = true; break; }
        }
      }

      /* ── 6) تحديث الحالة ── */
      if (frameResult) {
        S.frameOver = true; S.winner = frameResult.winner;
        S.endReason = frameResult.reason; S.phase = 'END';
      } else if (foul) {
        S.active = op;
        /* SCRATCH في الكسر → كرة يد خلف خط الكسر؛ وإلا في أي مكان */
        enterPlace(fouls.indexOf(FOULS.SCRATCH) !== -1 && rec.breakShot);
      } else if (!keep) {
        S.active = op; S.phase = 'AIM';
      } else {
        S.phase = 'AIM';
      }
      S.breakShot = false;

      /* ── 7) الترقية: من نظّف مجموعته تصبح كرته القانونية هي 8 ──
         (تُحسب بعد تعيين المجموعات في §4 — فاللاعب قد يُنظّف مجموعته
          بنفس الضربة التي عُيّنت فيها) */
      var groupsAtAssign = [S.groups[0], S.groups[1]];
      for (i = 0; i < 2; i++) {
        var g = S.groups[i];
        if (!S.open && g && g !== 'EIGHT' && groupCleared(g)) S.groups[i] = 'EIGHT';
      }

      /* ── 8) حدث الضربة (سجلّ كامل لكل ضربة — §10) ── */
      var ev = Object.freeze({
        ruleset_id: EIGHTBALL_META.ruleset_id,
        ruleset_version: EIGHTBALL_META.ruleset_version,
        physics_version: EIGHTBALL_META.physics_version,
        shot_id: rec.shot_id,
        player_id: sh,
        first_contact: rec.first ? rec.first.id : null,
        spin: rec.spin,
        pocketed: rec.pocketed.map(function (x) { return x.id; }),
        off_table: rec.off.map(function (x) { return x.id; }),
        cue_pocketed: !!(rec.cuePocketed || rec.cueOff),
        rail_contacts: rec.rails,
        rail_balls: Object.keys(rec.railBalls).length,
        notes: notes,
        foul_codes: fouls,
        foul: foul,
        frame_effect: frameResult,
        groups: groupsAtAssign,          /* كما عُيّنت في هذه الضربة (قبل الترقية) */
        groups_after: [S.groups[0], S.groups[1]],
        next_player: S.active,
        next_phase: S.phase
      });
      S.history.push(ev);
      S._shotNo++;
      emit(ev);
      return ev;
    }

    /* تنفيذ ضربة كاملة headless (اختبارات + تحقق الخادم) */
    function shootAndResolve(angle, power, spin) {
      if (!shoot(angle, power, spin)) return null;
      BP.runUntilStopped(table, S.balls, S.rec);
      return resolve();
    }

  function fire(a, p, sp) {
    if (S._aiDry) { S._aiPlan = { angle: a, power: p, spin: sp || null }; return null; }
    shoot(a, p, sp);
    BP.runUntilStopped(table, S.balls, S.rec);
    return resolve();
  }
  function aiPlan() { S._aiDry = true; S._aiPlan = null; aiShot(); S._aiDry = false; return S._aiPlan; }
    function aiShot() {
      var c = cue();
      if (!c) return null;
      if (S.breakShot) {
        var apex = null;
        for (var i = 0; i < S.balls.length; i++) {
          var ob = S.balls[i];
          if (ob.type === 'CUE' || ob.status !== 'ON_TABLE') continue;
          if (!apex || ob.x < apex.x) apex = ob;
        }
        var a0 = Math.atan2(apex.y - c.y, apex.x - c.x);
        return fire(a0, 95, null);
      }
      var myG = S.groups[S.active];
      var onEight = (!S.open && myG && (myG === 'EIGHT' || groupCleared(myG)));
      var targets = [];
      for (var j = 0; j < S.balls.length; j++) {
        var b = S.balls[j];
        if (b.type === 'CUE' || b.status !== 'ON_TABLE') continue;
        if (myG && !S.open) {
          if (onEight) { if (b.type === 'EIGHT') targets.push(b); }
          else if (b.type === myG) targets.push(b);
        } else if (b.type !== 'EIGHT') targets.push(b);
      }
      if (!targets.length) for (var k = 0; k < S.balls.length; k++)
        if (S.balls[k].type !== 'CUE' && S.balls[k].status === 'ON_TABLE') targets.push(S.balls[k]);

      /* [V19] خبير: محاكاة كاملة لكل مرشح + تقييم مطابق لقواعد resolve */
      var live = S.balls.filter(function (x) { return x.status === 'ON_TABLE'; });
      var score = function (rec, simBalls, ctx) {
        var s = 0, i2, pb;
        var scratch = !!(rec.cuePocketed || rec.cueOff);
        var pocketedObjs = rec.pocketed.filter(function (x) { return x.type !== 'CUE'; });
        /* حكم الكرة 8 أولاً */
        var eightP = null;
        for (i2 = 0; i2 < pocketedObjs.length; i2++) if (pocketedObjs[i2].type === 'EIGHT') eightP = pocketedObjs[i2];
        if (eightP) {
          if (!onEight || scratch) return -1e6;                 /* خسارة الإطار */
          return 1e6 - ctx.power;                                /* فوز */
        }
        /* الأخطاء القياسية */
        var foul = false;
        if (scratch) { foul = true; s -= 5000; }
        if (!rec.first) { foul = true; s -= 4000; }
        else {
          var lf;
          if (S.open || !myG) lf = (rec.first.type !== 'EIGHT');
          else if (onEight) lf = (rec.first.type === 'EIGHT');
          else lf = (rec.first.type === myG);
          if (!lf) { foul = true; s -= 4500; }
        }
        if (rec.first && pocketedObjs.length === 0 && rec.railsAfter === 0) { foul = true; s -= 3500; }
        if (rec.off.length) { foul = true; s -= 4000; }
        /* الإدخالات */
        for (i2 = 0; i2 < pocketedObjs.length; i2++) {
          pb = pocketedObjs[i2];
          if (S.open || !myG) s += 900;
          else if (pb.type === myG) s += 1000;
          else s -= 700;                                        /* أهديت الخصم كرة */
        }
        if (!foul && pocketedObjs.length === 0) s += 50;         /* أمان نظيف */
        if (!foul) s += 200;
        return s - ctx.power * 0.5;
      };
      var best = aiBestShot(table, live, c, targets, score);
      if (best) return fire(best.angle, best.power, null);
      var fb = targets[0] || S.balls[1];
      return fire(Math.atan2(fb.y - c.y, fb.x - c.x), 32, null);
    }

    /* ── وصف الضربة للبثّ أونلاين (المرحلة 6) — يُعاد تشغيله حتمياً عند الخصم ── */
    function shotPayload(angle, power, spin, placePos) {
      return {
        rs: EIGHTBALL_META.ruleset_id, pv: EIGHTBALL_META.physics_version,
        t: placePos ? 'place' : 'shot',
        x: placePos ? placePos.x : undefined, y: placePos ? placePos.y : undefined,
        a: angle, p: power, s: spin || null
      };
    }
    function applyPayload(pl) {
      if (!pl) return null;
      if (pl.t === 'place') { place(pl.x, pl.y); return { placed: true }; }
      return shootAndResolve(pl.a, pl.p, pl.s);
    }

    return {
      S: S, meta: EIGHTBALL_META,
      on: on, cue: cue, byId: byId, eight: eight,
      groupCleared: groupCleared, clearedBeforeShot: clearedBeforeShot,
      shoot: shoot, stepPhysics: stepPhysics, shotRunning: shotRunning, resolve: resolve,
      shootAndResolve: shootAndResolve, place: place, validPlace: validPlace,
      aiShot: aiShot, aiPlan: aiPlan, spotBall: spotBall,
      shotPayload: shotPayload, applyPayload: applyPayload,
      FOULS: FOULS
    };
  }


  /* ══════════════════════════════════════════════════════════
     EPA INTERNATIONAL EIGHTBALL (BLACKBALL) — v2d
     مرجع التنفيذ: EPA International Rules v2b/v2d (epa.org.uk)
     الفروق الجوهرية عن 8-Ball (§6 من وثيقة المنصة):
       • الكسر بنظام النقاط ≥3 (كرات متجاوزة لخط الوسط + مُدخلة)
       • المجموعة لا تُعيَّن في الكسر أبداً؛ الطاولة مفتوحة بعده دائماً
       • «خسارة دور» (6d) ليست خطأً: كرة الخصم من حيث وقفت
       • خطأ قياسي = كرة يد في أي مكان بزيارة واحدة (6e)
       • 9 حالات منفصلة: foul ≠ loss-of-frame، stalemate، frozen،
         interference، off-table، touching، legal-shot، simultaneous
     ══════════════════════════════════════════════════════════ */
  var BLACKBALL_META = {
    ruleset_id: 'EPA_INT_8BALL',
    ruleset_version: '2d',
    source_authority: 'EPA/IEPF',
    effective_date: '2025-12',
    physics_version: BP.PHYSICS_VERSION
  };

  var BB_FOULS = {
    SCRATCH: 'SCRATCH',
    NO_CONTACT: 'NO_CONTACT',
    ILLEGAL_FIRST_CONTACT: 'ILLEGAL_FIRST_CONTACT',
    NO_LEGAL_SHOT: 'NO_LEGAL_SHOT',          /* 6e(12)+6p */
    FROZEN_BALL: 'FROZEN_BALL',              /* 6h */
    TOUCHING_PLAY_AWAY: 'TOUCHING_PLAY_AWAY',/* 6e(14)+6o */
    BALL_OFF_TABLE: 'BALL_OFF_TABLE',        /* 6e(15)+6l */
    OUTSIDE_BAULK: 'OUTSIDE_BAULK'           /* 6e(2) */
  };

  function blackball(opts) {
    opts = opts || {};
    var table = BP.table('blackball');
    var built = BP.buildTable('blackball', null);

    var S = {
      meta: BLACKBALL_META, table: table, balls: built.balls,
      phase: 'PLACE',               /* يبدأ الإطار بوضع الكرة في الباولك (4e) */
      placeRestriction: 'BAULK',
      breakShot: true, open: true,
      active: opts.firstPlayer || 0,
      breaker: opts.firstPlayer || 0,
      originalBreaker: opts.firstPlayer || 0,
      groups: [null, null],
      pocketOrder: [], history: [],
      frameOver: false, winner: null, endReason: null,
      illegalBreak: false, stalemate: false,
      rec: null, _shotNo: 0, _listeners: [],
      _preShot: null, _touching: [], _frozen: {}
    };

    function on(fn) { S._listeners.push(fn); }
    function emit(ev) { for (var i = 0; i < S._listeners.length; i++) S._listeners[i](ev); }
    function cue() { for (var i = 0; i < S.balls.length; i++) if (S.balls[i].type === 'CUE') return S.balls[i]; return null; }
    function byId(id) { for (var i = 0; i < S.balls.length; i++) if (S.balls[i].id === id) return S.balls[i]; return null; }
    function isColor(b) { return b.type === 'RED' || b.type === 'YELLOW'; }

    /* «على الطاولة» قبل الضربة — من سجلّ الفيزياء بعد المحاكاة */
    function preShotState(rec) {
      var pot = {}, off = {}, i;
      for (i = 0; i < rec.pocketed.length; i++) pot[rec.pocketed[i].id] = true;
      for (i = 0; i < rec.off.length; i++) off[rec.off[i].id] = true;
      var on0 = {};
      for (i = 0; i < S.balls.length; i++) {
        var b = S.balls[i];
        on0[b.id] = (b.status === 'ON_TABLE' || pot[b.id] || off[b.id]);
      }
      return on0;
    }
    function colorOnAt(on0, g) {
      for (var i = 0; i < S.balls.length; i++) {
        var b = S.balls[i];
        if (b.type === g && on0[b.id]) return true;
      }
      return false;
    }

    /* إعادة كرة إلى نقطة السوداء أو نحو الوسادة العليا (6m) */
    function spotBall(b) {
      var x = table.footSpot.x, y = table.footSpot.y, guard = 0;
      while (guard++ < 4000) {
        var clash = false;
        for (var i = 0; i < S.balls.length; i++) {
          var o = S.balls[i];
          if (o === b || o.status !== 'ON_TABLE') continue;
          var dx = o.x - x, dy = o.y - y;
          if (dx * dx + dy * dy < (2 * table.R) * (2 * table.R)) { clash = true; break; }
        }
        if (!clash) break;
        y -= table.R;                       /* نحو الوسادة العليا أولاً (6m) */
        if (y < table.R) { y = table.footSpot.y; x -= table.R; }
        if (x < table.R) x = table.footSpot.x;
      }
      b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.status = 'ON_TABLE';
      return b;
    }

    /* كرات ملتصقة بالوسائد (6h) وبالحاكمة البيضاء (6o) عند بدء الضربة */
    function scanContacts() {
      S._touching = []; S._frozen = {};
      var c = cue(), i, b;
      if (!c || c.status !== 'ON_TABLE') return;
      for (i = 0; i < S.balls.length; i++) {
        b = S.balls[i];
        if (b === c || b.status !== 'ON_TABLE') continue;
        var dx = b.x - c.x, dy = b.y - c.y;
        if (dx * dx + dy * dy <= (2 * table.R + 0.5) * (2 * table.R + 0.5)) S._touching.push(b.id);
      }
      for (i = 0; i < S.balls.length; i++) {
        b = S.balls[i];
        if (b.type === 'CUE' || b.status !== 'ON_TABLE') continue;
        for (var j = 0; j < table.cushions.length; j++) {
          var sd = segDistOf(b.x, b.y, table.cushions[j]);
          if (Math.abs(sd - table.R) < 0.6) { S._frozen[b.id] = j; break; }
        }
      }
    }
    function segDistOf(px, py, s2) {
      var ex = s2.x2 - s2.x1, ey = s2.y2 - s2.y1;
      var len2 = ex * ex + ey * ey;
      var t = len2 === 0 ? 0 : ((px - s2.x1) * ex + (py - s2.y1) * ey) / len2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var cx = s2.x1 + t * ex, cy = s2.y1 + t * ey;
      return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
    }

    function validPlace(x, y) {
      if (!BP.validPlace(table, S.balls, x, y)) return false;
      if (S.placeRestriction === 'BAULK' && x > table.baulkLineX + table.R) return false; /* 4e: ≤50% من القطر خارج الخط */
      return true;
    }
    function place(x, y) {
      if (S.phase !== 'PLACE' || S.frameOver) return false;
      if (!validPlace(x, y)) return false;
      var c = cue();
      c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.status = 'ON_TABLE';
      S.placeRestriction = null;
      S.phase = 'AIM';
      return true;
    }

    function onBalls(sh, on0) {
      /* الكرات القانونية «on» عند بدء الضربة */
      if (S.breakShot) return null;             /* الكسر: أي كرة */
      var g = S.groups[sh];
      if (S.open || !g) return ['RED', 'YELLOW'];
      if (g === 'BLACK') return ['BLACK'];
      return [g];
    }

    function shoot(angle, power, spin) {
      if (S.phase !== 'AIM' || S.frameOver) return false;
      var c = cue();
      if (!c || c.status !== 'ON_TABLE') return false;
      scanContacts();
      S.rec = BP.newRec(S._shotNo, S.active, spin || null);
      S.rec.breakShot = S.breakShot;
      if (!BP.applyShot(S.balls, angle, BP.powerToSpeed(power), S.rec)) { S.rec = null; return false; }
      S.rec.dirX = Math.cos(angle); S.rec.dirY = Math.sin(angle);
      /* لقطة قبل الضربة (تدخل خارجي 6i + حالات ما قبل) */
      S._preShot = S.balls.map(function (b) {
        return { id: b.id, x: b.x, y: b.y, status: b.status };
      });
      S.phase = 'SHOT';
      return true;
    }
    function stepPhysics() { if (S.phase !== 'SHOT') return false; BP.step(table, S.balls, BP.FRAME_DT, S.rec); return true; }
    function shotRunning() { return S.phase === 'SHOT' && !BP.allStopped(S.balls); }

    /* أول تماس (قد يكون متزامناً 6q): كل التماسات في أول خطوة */
    function firstContactSet(rec) {
      var set = [], firstStep = null, i;
      for (i = 0; i < rec.events.length; i++) {
        var e = rec.events[i];
        if (e.t !== 'contact') continue;
        if (e.a !== 0 && e.b !== 0) continue;      /* تماسات بدون البيضاء لاحقة */
        if (firstStep === null) firstStep = e.step;
        if (e.step === firstStep) set.push(e.a === 0 ? e.b : e.a);
        else break;
      }
      return set;
    }

    function resolve() {
      var rec = S.rec;
      if (!rec) return null;
      S.rec = null;
      var sh = S.active, op = 1 - sh, fouls = [], notes = [], i, b;
      var on0 = preShotState(rec);
      var myGroupBefore = S.groups[sh];
      var onBlack = (!S.open && myGroupBefore === 'BLACK');
      var onTypes = onBalls(sh, on0);

      for (i = 0; i < rec.pocketed.length; i++) if (rec.pocketed[i].type !== 'CUE') S.pocketOrder.push(rec.pocketed[i].id);
      var pocketedObjs = rec.pocketed.filter(function (x) { return x.type !== 'CUE'; });
      var pocketedColors = pocketedObjs.filter(isColor);
      var blackP = null;
      for (i = 0; i < rec.pocketed.length; i++) if (rec.pocketed[i].type === 'BLACK') blackP = rec.pocketed[i];
      if (!blackP) for (i = 0; i < rec.off.length; i++) if (rec.off[i].type === 'BLACK') blackP = rec.off[i];

      /* ── الكسر بنظام النقاط (4f): ≥3 = قانوني ── */
      var breakPoints = 0, crossed = 0;
      if (rec.breakShot) {
        breakPoints += pocketedObjs.length;               /* السوداء تُحتسب (4f) */
        for (i = 0; i < S.balls.length; i++) {
          b = S.balls[i];
          if (b.type === 'CUE' || b.status !== 'ON_TABLE') continue;
          if (b.x < table.W / 2 - table.R) { crossed++; breakPoints++; }
        }
      }

      var fcSet = firstContactSet(rec);
      var fcBall = rec.first;

      /* ── 6o كرات ملتصقة: لعبٌ نحوها (<90°) = خطأ قياسي ── */
      for (i = 0; i < S._touching.length; i++) {
        var tb = byId(S._touching[i]);
        if (!tb) continue;
        var tdx = tb.x - (S._preShot ? cueAtPre().x : 0), tdy = tb.y - (S._preShot ? cueAtPre().y : 0);
        function cueAtPre() { for (var k = 0; k < S._preShot.length; k++) if (S._preShot[k].id === 0) return S._preShot[k]; return { x: 0, y: 0 }; }
        var tl = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        var dot = (tdx / tl) * rec.dirX + (tdy / tl) * rec.dirY;
        if (dot > 0.001) { fouls.push(BB_FOULS.TOUCHING_PLAY_AWAY); notes.push('TOUCHING:' + tb.id); break; }
      }
      /* التصاق بكرة «on»: التماس الأول مُنجَز حكماً (6o4) — يُحسب قبل فحص التماس */
      var deemedContact = false;
      if (S._touching.length && !rec.breakShot) {
        for (i = 0; i < S._touching.length; i++) {
          var tbb = byId(S._touching[i]);
          if (tbb && (!onTypes || onTypes.indexOf(tbb.type) !== -1)) { deemedContact = true; break; }
        }
      }

      /* ── الأخطاء القياسية (6e) ── */
      if (!rec.breakShot || rec.cueOff) {
        if (rec.cuePocketed || rec.cueOff) fouls.push(BB_FOULS.SCRATCH);
      } else if (rec.cuePocketed) {
        notes.push('BREAK_IN_OFF');            /* 4j1: خسارة دور + كرة يد من الباولك */
      }
      if (!fcBall && !deemedContact) fouls.push(BB_FOULS.NO_CONTACT);
      else if (fcBall && !deemedContact && !rec.breakShot && onTypes) {
        /* 6o4: عند الالتصاق بكرة «on» التماس الأول مُنجَز حكماً — ما بعده لعب عادي */
        var okFirst = fcSet.some(function (id) {
          var x = byId(id);
          return x && onTypes.indexOf(x.type) !== -1;
        });
        if (!okFirst) fouls.push(BB_FOULS.ILLEGAL_FIRST_CONTACT);
      }
      /* 6p: بعد تماس قانوني — إدخال أو وسادة (بيضاء/هدف) وإلا خطأ */
      var railAfter = rec.railsAfter + (rec.cueRailsAfter || 0);
      if (!rec.breakShot && (fcBall || deemedContact) && pocketedObjs.length === 0 && railAfter === 0) {
        fouls.push(BB_FOULS.NO_LEGAL_SHOT);
      }
      /* 6h كرة ملتصقة بالوسادة لُمست أولاً بلا مخرج */
      if (!rec.breakShot && fcBall && S._frozen[fcBall.id] !== undefined) {
        var frozenSeg = S._frozen[fcBall.id];
        var escape = pocketedObjs.length > 0 || (rec.cueRailsAfter || 0) > 0;
        if (!escape) {
          for (i = 0; i < rec.events.length; i++) {
            var ev2 = rec.events[i];
            if (ev2.t !== 'rail') continue;
            if (ev2.ball === fcBall.id && ev2.seg !== frozenSeg) { escape = true; break; }
            if (ev2.ball !== fcBall.id && S._frozen[ev2.ball] === undefined) { escape = true; break; }
          }
        }
        if (!escape) fouls.push(BB_FOULS.FROZEN_BALL);
      }
      if (rec.off.length) fouls.push(BB_FOULS.BALL_OFF_TABLE);

      var foul = fouls.length > 0;

      /* ── كسر غير قانوني (4g): إعادة رفّ وخيار الخصم ── */
      var illegalBreak = false;
      if (rec.breakShot && breakPoints < 3) { illegalBreak = true; notes.push('ILLEGAL_BREAK_PTS:' + breakPoints); }

      /* ── السوداء (6f3/6f4 + الفوز) — تُحكم قبل تعيين المجموعات ── */
      var frameResult = null;
      if (blackP && !rec.breakShot) {
        var myColorLeft = false;
        if (myGroupBefore && myGroupBefore !== 'BLACK') myColorLeft = colorOnAt(on0, myGroupBefore);
        else if (!myGroupBefore) myColorLeft = true;      /* طاولة مفتوحة = كرات مجموعته ما زالت موجودة حكماً */
        if (myColorLeft) frameResult = { winner: op, reason: 'BLACK_EARLY' };
        else if (foul) frameResult = { winner: op, reason: 'BLACK_ON_FOUL' };
        else frameResult = { winner: sh, reason: 'BLACK_LEGAL' };
      }

      /* ── إعادة الكرات (4i السوداء في الكسر / 6m الخارجة) ── */
      if (blackP && rec.breakShot) { spotBall(blackP); notes.push('BLACK_RESPOTTED_ON_BREAK'); }
      for (i = 0; i < rec.off.length; i++) if (rec.off[i].type !== 'BLACK') spotBall(rec.off[i]);

      /* ── تعيين المجموعات (6a): أول إدخال قانوني؛ كلا اللونين → أول تماس ── */
      var assignedNow = null;
      if (!rec.breakShot && S.open && !foul && !frameResult && pocketedColors.length) {
        var reds = pocketedColors.some(function (x) { return x.type === 'RED'; });
        var yels = pocketedColors.some(function (x) { return x.type === 'YELLOW'; });
        if (reds && yels && fcBall) assignedNow = fcBall.type;          /* 6a4 */
        else if (reds && yels) assignedNow = null;
        else assignedNow = reds ? 'RED' : 'YELLOW';
        if (assignedNow) {
          S.groups[sh] = assignedNow;
          S.groups[op] = assignedNow === 'RED' ? 'YELLOW' : 'RED';
          S.open = false;
        }
      }

      /* ── الاستمرار / خسارة الدور / خسارة الإطار ── */
      var keep = false, lossOfTurn = false;
      if (frameResult) {
        S.frameOver = true; S.winner = frameResult.winner;
        S.endReason = frameResult.reason; S.phase = 'END';
      } else if (illegalBreak) {
        S.illegalBreak = true; S.phase = 'RERACK';
        S.active = op;                /* الخيار للخصم (4g) */
      } else if (foul) {
        S.active = op;
        var baulkOnly = rec.breakShot && rec.cuePocketed && !rec.cueOff;   /* 4j1 */
        S.placeRestriction = baulkOnly ? 'BAULK' : 'ANY';                 /* 6e: أي مكان */
        S.phase = 'PLACE';
      } else if (rec.breakShot) {
        if (rec.cuePocketed && !rec.cueOff) {
          /* 4j1: سقوط البيضاء في كسر قانوني = خسارة دور + كرة يد من الباولك */
          S.active = op; S.placeRestriction = 'BAULK'; S.phase = 'PLACE'; lossOfTurn = true;
        } else {
          var blackOnly = blackP && pocketedObjs.length === 1;
          if (blackOnly) { S.active = op; S.phase = 'AIM'; lossOfTurn = true; }   /* 4i */
          else if (pocketedColors.length) { S.phase = 'AIM'; keep = true; }
          else { S.active = op; S.phase = 'AIM'; lossOfTurn = true; }
        }
      } else if (S.open) {
        if (pocketedColors.length) { S.phase = 'AIM'; keep = true; }
        else { S.active = op; S.phase = 'AIM'; lossOfTurn = true; }
      } else {
        var g0 = S.groups[sh];
        var pottedOwn = pocketedObjs.some(function (x) { return x.type === g0 || (g0 === 'BLACK' && x.type === 'BLACK'); });
        if (pottedOwn) { S.phase = 'AIM'; keep = true; }
        else { S.active = op; S.phase = 'AIM'; lossOfTurn = true; }        /* 6d: من حيث وقفت */
      }
      S.breakShot = false;

      /* ── ترقية إلى السوداء ── */
      var groupsAtAssign = [S.groups[0], S.groups[1]];
      for (i = 0; i < 2; i++) {
        var g = S.groups[i];
        if (!S.open && g && g !== 'BLACK' && !colorOnAt(currentOn(), g)) S.groups[i] = 'BLACK';
      }
      function currentOn() {
        var o = {};
        for (var k = 0; k < S.balls.length; k++) o[S.balls[k].id] = (S.balls[k].status === 'ON_TABLE');
        return o;
      }

      var ev = Object.freeze({
        ruleset_id: BLACKBALL_META.ruleset_id,
        ruleset_version: BLACKBALL_META.ruleset_version,
        physics_version: BLACKBALL_META.physics_version,
        shot_id: rec.shot_id, player_id: sh,
        first_contact: deemedContact ? 'TOUCHING' : (fcBall ? fcBall.id : null),
        simultaneous_contact: fcSet.length > 1,
        spin: rec.spin,
        pocketed: rec.pocketed.map(function (x) { return x.id; }),
        off_table: rec.off.map(function (x) { return x.id; }),
        cue_pocketed: !!(rec.cuePocketed || rec.cueOff),
        rail_contacts: rec.rails,
        break_points: rec.breakShot ? breakPoints : null,
        crossed_line: rec.breakShot ? crossed : null,
        illegal_break: illegalBreak,
        touching_balls: S._touching.slice(),
        frozen_balls: Object.keys(S._frozen),
        notes: notes,
        foul_codes: fouls, foul: foul,
        loss_of_turn: lossOfTurn,
        loss_of_frame: !!frameResult,
        frame_effect: frameResult,
        groups: groupsAtAssign,
        groups_after: [S.groups[0], S.groups[1]],
        next_player: S.active, next_phase: S.phase
      });
      S.history.push(ev);
      S._shotNo++;
      emit(ev);
      return ev;
    }

    /* خيار إعادة الرفّ بعد كسر غير قانوني (4g) */
    function chooseBreak(takeBreak) {
      if (S.phase !== 'RERACK') return false;
      var newBreaker = takeBreak ? (1 - S.breaker) : S.breaker;
      reRack(newBreaker);
      return true;
    }
    function reRack(breaker) {
      var nb = BP.buildTable('blackball', null);
      S.balls = nb.balls;
      S.breaker = breaker;
      S.active = breaker;
      S.breakShot = true; S.open = true;
      S.groups = [null, null];
      S.pocketOrder = [];
      S.illegalBreak = false;
      S.phase = 'PLACE'; S.placeRestriction = 'BAULK';
    }

    /* جمود (6g): إعادة رفّ ويكسر من كسر الإطار الأصلي */
    function declareStalemate() {
      if (S.frameOver) return false;
      S.stalemate = true;
      reRack(S.originalBreaker);
      return true;
    }

    /* تدخل خارجي (6i): إرجاع الكرات لمواضعها قبل الضربة بلا عقوبة */
    function applyOutsideInterference() {
      if (!S._preShot) return false;
      for (var i = 0; i < S._preShot.length; i++) {
        var p = S._preShot[i], b = byId(p.id);
        if (!b) continue;
        b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0; b.status = p.status;
      }
      S.phase = 'AIM';
      S._preShot = null;
      return true;
    }

    function shootAndResolve(angle, power, spin) {
      if (!shoot(angle, power, spin)) return null;
      BP.runUntilStopped(table, S.balls, S.rec);
      return resolve();
    }

    /* ── وكيل AI ── */
  function fire(a, p, sp) {
    if (S._aiDry) { S._aiPlan = { angle: a, power: p, spin: sp || null }; return null; }
    shoot(a, p, sp);
    BP.runUntilStopped(table, S.balls, S.rec);
    return resolve();
  }
  function aiPlan() { S._aiDry = true; S._aiPlan = null; aiShot(); S._aiDry = false; return S._aiPlan; }
    function aiShot() {
      var c = cue();
      if (!c) return null;
      /* [V19] كرة بيد: وضع تلقائي في أول موضع صالح (مسح شبكي حتمي) */
      if (S.phase === 'PLACE') {
        var plX, plY, plDone = false;
        for (plX = 40; plX < table.W - 40 && !plDone; plX += 20)
          for (plY = 30; plY < table.H - 30 && !plDone; plY += 20)
            if (validPlace(plX, plY)) plDone = place(plX, plY);
        c = cue();
        if (!c || S.phase !== 'AIM') return null;
      }
      if (S.breakShot) {
        var apex = null;
        for (var i0 = 0; i0 < S.balls.length; i0++) {
          var ob = S.balls[i0];
          if (ob.type === 'CUE' || ob.status !== 'ON_TABLE') continue;
          if (!apex || ob.x < apex.x) apex = ob;
        }
        return fire(Math.atan2(apex.y - c.y, apex.x - c.x), 95, null);
      }
      var myG = S.groups[S.active];
      var onBlackAI = (myG === 'BLACK');
      var targets = [];
      for (var j0 = 0; j0 < S.balls.length; j0++) {
        var bb = S.balls[j0];
        if (bb.type === 'CUE' || bb.status !== 'ON_TABLE') continue;
        if (!S.open && myG) {
          if (onBlackAI) { if (bb.type === 'BLACK') targets.push(bb); }
          else if (bb.type === myG) targets.push(bb);
        } else if (bb.type !== 'BLACK') targets.push(bb);
      }
      if (!targets.length) for (var k0 = 0; k0 < S.balls.length; k0++)
        if (S.balls[k0].type !== 'CUE' && S.balls[k0].status === 'ON_TABLE') targets.push(S.balls[k0]);

      /* [V19] خبير: محاكاة headless لكل مرشح وتقييم وفق قواعد البلاكبول */
      var live0 = S.balls.filter(function (x) { return x.status === 'ON_TABLE'; });
      var scoreBB = function (rec, simBalls, ctx) {
        var s = 0, i2, pb;
        var scratch = !!(rec.cuePocketed || rec.cueOff);
        var pocketedObjs = rec.pocketed.filter(function (x) { return x.type !== 'CUE'; });
        var blackPot = null;
        for (i2 = 0; i2 < pocketedObjs.length; i2++) if (pocketedObjs[i2].type === 'BLACK') blackPot = pocketedObjs[i2];
        var foul = false;
        if (scratch) { foul = true; s -= 5000; }
        if (!rec.first) { foul = true; s -= 4000; }
        else if (!S.open && myG) {
          var lf0 = onBlackAI ? (rec.first.type === 'BLACK') : (rec.first.type === myG);
          if (!lf0) { foul = true; s -= 4500; }
        }
        if (rec.first && pocketedObjs.length === 0 && rec.railsAfter === 0) { foul = true; s -= 3000; }
        if (rec.off.length) { foul = true; s -= 4000; }
        if (blackPot) {
          /* السوداء بضربة فيها أي خطأ (سكراتش/تماس أول غير قانوني/كرة خارج) = خسارة الإطار */
          if (!onBlackAI || foul) return -1e6;
          return 1e6 - ctx.power;
        }
        for (i2 = 0; i2 < pocketedObjs.length; i2++) {
          pb = pocketedObjs[i2];
          if (S.open || !myG) s += 900;
          else if (pb.type === myG) s += 1000;
          else s -= 700;
        }
        if (!foul) s += 200;
        return s - ctx.power * 0.5;
      };
      var bestBB = aiBestShot(table, live0, c, targets, scoreBB);
      if (bestBB) return fire(bestBB.angle, bestBB.power, null);
      var fb = targets[0] || S.balls[1];
      return fire(Math.atan2(fb.y - c.y, fb.x - c.x), 32, null);
    }

    function shotPayload(angle, power, spin, placePos) {
      return { rs: BLACKBALL_META.ruleset_id, pv: BP.PHYSICS_VERSION,
        t: placePos ? 'place' : 'shot', x: placePos ? placePos.x : undefined,
        y: placePos ? placePos.y : undefined, a: angle, p: power, s: spin || null };
    }
    function applyPayload(pl) {
      if (!pl) return null;
      if (pl.t === 'place') { place(pl.x, pl.y); return { placed: true }; }
      return shootAndResolve(pl.a, pl.p, pl.s);
    }

    return {
      S: S, meta: BLACKBALL_META,
      on: on, cue: cue, byId: byId,
      shoot: shoot, stepPhysics: stepPhysics, shotRunning: shotRunning, resolve: resolve,
      shootAndResolve: shootAndResolve, place: place, validPlace: validPlace,
      scanContacts: scanContacts,
      chooseBreak: chooseBreak, reRack: reRack, declareStalemate: declareStalemate,
      applyOutsideInterference: applyOutsideInterference,
      spotBall: spotBall, aiShot: aiShot, aiPlan: aiPlan,
      shotPayload: shotPayload, applyPayload: applyPayload,
      FOULS: BB_FOULS
    };
  }


  /* ══════════════════════════════════════════════════════════
     GOLVAZOR — غولڤازور (قواعد مغربية على طاولة البلاكبول)
     المرجع: GOLVAZOR_SPEC.md (مستند المواصفات 2026-08-31)
     • الطاولة والكرات: نسخة طبق الأصل عن بلاكبول WEPF
     • 5 أنواع إنهاء: DIRECT | DERNIER (آخر حفرة) | BOUND(2-5 وسائد)
       | ANNONCE (حفرة معلنة) | ANNONCE_BOUND (معلنة + وسائد)
     • أنونص: يجب أن تلمس البيضاء أو السوداء وسادة واحدة على الأقل
       قبل سقوط السوداء — الإسقاط المباشر في المعلنة = انتحار
     • الخطأ القياسي = ضربتان متتاليتان للخصم والبيضاء من مكانها
     • سقوط البيضاء = كرة بيد في الثلث الأسفل + ضربتان
     • الضربة الأولى من الجزاء: يحق لمس/إسقاط كرات الخصم الملونة
       (لا السوداء) — يسقط الحق بعدها والضربتان تبقيان
     • الإسقاط يحفظ عدّاد الضربتين؛ عدم الإسقاط يستهلك ضربة
     • السوداء وحيدة للطرفين → إلغاء الجزاءات (إلا في ديريكت)
       وحدها لطرف واحد → إلغاء جزائه هو فقط (إلا في ديريكت)
     • الانتحار (خسارة مباشرة): السوداء مبكراً / مع البيضاء /
       لمس الخصم قبل إسقاطها / حفرة خاطئة / قبل اكتمال البوند
     ══════════════════════════════════════════════════════════ */
  var GOLVAZOR_META = {
    ruleset_id: 'GOLVAZOR',
    ruleset_version: '1.0',
    source_authority: 'GOLVAZOR_SPEC (MA)',
    effective_date: '2026-08-31',
    physics_version: BP.PHYSICS_VERSION
  };

  var GV_FOULS = {
    SCRATCH: 'SCRATCH',
    NO_CONTACT: 'NO_CONTACT',
    OPP_FIRST: 'OPP_FIRST',
    BLACK_FIRST: 'BLACK_FIRST',
    OPP_POTTED: 'OPP_POTTED',
    BALL_OFF_TABLE: 'BALL_OFF_TABLE'
  };

  var GV_FINISHES = ['DIRECT', 'DERNIER', 'BOUND', 'ANNONCE', 'ANNONCE_BOUND'];

  function golvazor(opts) {
    opts = opts || {};
    var table = BP.table('blackball');
    var built = BP.buildTable('blackball', null);
    var finish = GV_FINISHES.indexOf(opts.finish) !== -1 ? opts.finish : 'DIRECT';
    var boundN = Math.min(5, Math.max(2, opts.bound || 2));
    var wantAnn = (finish === 'ANNONCE' || finish === 'ANNONCE_BOUND');
    var wantBound = (finish === 'BOUND' || finish === 'ANNONCE_BOUND');

    var S = {
      meta: GOLVAZOR_META, table: table, balls: built.balls,
      phase: 'PLACE', placeRestriction: 'GV_BAULK',
      breakShot: true, open: true,
      active: opts.firstPlayer || 0,
      groups: [null, null],
      finish: finish, boundN: boundN,
      lastPocket: [null, null],        /* آخر حفرة لكرة كل لاعب (ديرنيي ترو) */
      annPocket: [null, null],         /* الحفرة المعلنة لكل لاعب (أنونص) */
      extraShots: [0, 0],              /* ضربات الجزاء المتبقية */
      penaltyFree: [false, false],     /* حق الضربة الأولى من الجزاء */
      awaitChoice: false,              /* كسر بلونين: اختيار اللون بالنقر قبل الضربة */
      pocketOrder: [], history: [],
      frameOver: false, winner: null, endReason: null,
      rec: null, _shotNo: 0, _listeners: [], _preShot: null, _aiDry: false, _aiPlan: null
    };

    function on(fn) { S._listeners.push(fn); }
    function emit(ev) { for (var i = 0; i < S._listeners.length; i++) S._listeners[i](ev); }
    function cue() { for (var i = 0; i < S.balls.length; i++) if (S.balls[i].type === 'CUE') return S.balls[i]; return null; }
    function byId(id) { for (var i = 0; i < S.balls.length; i++) if (S.balls[i].id === id) return S.balls[i]; return null; }
    function isColor(b) { return b && (b.type === 'RED' || b.type === 'YELLOW'); }
    function colorOn(g) {
      for (var i = 0; i < S.balls.length; i++) {
        var b = S.balls[i];
        if (b.type === g && b.status === 'ON_TABLE') return true;
      }
      return false;
    }

    function spotBall(b) {
      var x = table.footSpot.x, y = table.footSpot.y, guard = 0;
      while (guard++ < 4000) {
        var clash = false;
        for (var i = 0; i < S.balls.length; i++) {
          var o = S.balls[i];
          if (o === b || o.status !== 'ON_TABLE') continue;
          var dx = o.x - x, dy = o.y - y;
          if (dx * dx + dy * dy < (2 * table.R) * (2 * table.R)) { clash = true; break; }
        }
        if (!clash) break;
        y -= table.R;
        if (y < table.R) { y = table.footSpot.y; x -= table.R; }
        if (x < table.R) x = table.footSpot.x;
      }
      b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.status = 'ON_TABLE';
      return b;
    }

    function validPlace(x, y) {
      if (!BP.validPlace(table, S.balls, x, y)) return false;
      /* منطقة الكرة البيضاء: وراء الخط الأبيض (الباولك) حصراً — لا يجوز تجاوزه بأي جزء من الكرة */
      if (S.placeRestriction === 'GV_BAULK' && x > table.baulkLineX - table.R) return false;
      return true;
    }
    function place(x, y) {
      if (S.phase !== 'PLACE' || S.frameOver) return false;
      if (!validPlace(x, y)) return false;
      var c = cue();
      c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.status = 'ON_TABLE';
      S.placeRestriction = null;
      S.phase = 'AIM';
      return true;
    }

    /* ── اختيار اللون بعد كسر بلونين: نقر على كرة في الطاولة ── */
    function needChoice() { return S.awaitChoice && !S.frameOver; }
    function chooseGroup(g) {
      if (!S.awaitChoice || S.frameOver) return false;
      if (g !== 'RED' && g !== 'YELLOW') return false;
      S.groups[S.active] = g;
      S.groups[1 - S.active] = (g === 'RED') ? 'YELLOW' : 'RED';
      S.open = false;
      S.awaitChoice = false;
      return true;
    }

    /* ── أنونص: إعلان حفرة الإنهاء ── */
    function needAnnounce() {
      return wantAnn && !S.frameOver && S.phase === 'AIM' &&
             S.groups[S.active] === 'BLACK' && !S.annPocket[S.active];
    }
    function nominatePocket(pid) {
      if (!wantAnn || S.frameOver) return false;
      if (S.groups[S.active] !== 'BLACK') return false;
      var okId = false;
      for (var i = 0; i < table.pockets.length; i++) if (table.pockets[i].id === pid) okId = true;
      if (!okId) return false;
      S.annPocket[S.active] = pid;
      return true;
    }

    function shoot(angle, power, spin) {
      if (S.phase !== 'AIM' || S.frameOver) return false;
      if (needChoice()) return false;                      /* يجب اختيار اللون بعد كسر بلونين */
      if (needAnnounce()) return false;                    /* يجب الإعلان قبل ضرب السوداء */
      var c = cue();
      if (!c || c.status !== 'ON_TABLE') return false;
      S.rec = BP.newRec(S._shotNo, S.active, spin || null);
      S.rec.breakShot = S.breakShot;
      if (!BP.applyShot(S.balls, angle, BP.powerToSpeed(power), S.rec)) { S.rec = null; return false; }
      S.rec.dirX = Math.cos(angle); S.rec.dirY = Math.sin(angle);
      S._preShot = S.balls.map(function (b) { return { id: b.id, x: b.x, y: b.y, status: b.status }; });
      S.phase = 'SHOT';
      return true;
    }
    function stepPhysics() { if (S.phase !== 'SHOT') return false; BP.step(table, S.balls, BP.FRAME_DT, S.rec); return true; }
    function shotRunning() { return S.phase === 'SHOT' && !BP.allStopped(S.balls); }

    function resolve() {
      var rec = S.rec;
      if (!rec) return null;
      S.rec = null;
      var sh = S.active, op = 1 - sh, fouls = [], notes = [], i, b;
      var myG = S.groups[sh], opG = S.groups[op];
      var onBlack = (myG === 'BLACK');
      var pFree = S.penaltyFree[sh] && !rec.breakShot;     /* حق الضربة الأولى من الجزاء */
      if (S.penaltyFree[sh]) S.penaltyFree[sh] = false;    /* يُستهلك بهذه الضربة */

      /* ── الساقطات ── */
      var pocketedObjs = [], blackP = null;
      for (i = 0; i < rec.pocketed.length; i++) {
        b = rec.pocketed[i];
        if (b.type === 'CUE') continue;
        pocketedObjs.push(b);
        S.pocketOrder.push(b.id);
        if (b.type === 'BLACK') blackP = b;
      }
      for (i = 0; i < rec.off.length; i++) if (rec.off[i].type === 'BLACK' && !blackP) blackP = rec.off[i];
      var pocketedColors = pocketedObjs.filter(isColor);

      /* ── ملامسات السوداء للوسائد (البوند) ── */
      var blackRails = 0;
      for (i = 0; i < rec.events.length; i++) {
        var e0 = rec.events[i];
        if (e0.t === 'rail') {
          var rb = byId(e0.ball);
          if (rb && rb.type === 'BLACK') blackRails++;
        }
      }

      /* ── أنونص: وسادة إلزامية قبل سقوط السوداء ──
         تصحيح المستخدم: في الإنهاء مع تحديد الحفرة يجب أن تلمس البيضاء
         أو السوداء وسادة مرة أو أكثر قبل دخول السوداء الحفرة —
         الإسقاط المباشر (بيضاء ← سوداء ← حفرة بلا وسادة) = انتحار */
      var annRailOk = false;
      if (wantAnn) {
        for (i = 0; i < rec.events.length; i++) {
          var eA = rec.events[i];
          if (eA.t === 'pocket') {
            var pbA = byId(eA.ball);
            if (pbA && pbA.type === 'BLACK') break;          /* الوسائد بعد السقوط لا تُحتسب */
          } else if (eA.t === 'rail') {
            var rbA = byId(eA.ball);
            if (rbA && (rbA.type === 'CUE' || rbA.type === 'BLACK')) { annRailOk = true; break; }
          }
        }
      }

      /* ── الأخطاء ── */
      var fc = rec.first;
      var scratched = !!(rec.cuePocketed || rec.cueOff);
      if (scratched) fouls.push(GV_FOULS.SCRATCH);
      if (!fc) fouls.push(GV_FOULS.NO_CONTACT);
      else if (!rec.breakShot) {
        var ft = fc.type;
        if (onBlack) {
          /* على السوداء: أول تماس يجب أن يكون السوداء (الحق الحر يسمح بألوان الخصم) */
          if (ft !== 'BLACK' && !(pFree && isColor(fc))) fouls.push(GV_FOULS.OPP_FIRST);
        } else if (ft === 'BLACK') fouls.push(GV_FOULS.BLACK_FIRST);
        else if (!S.open && myG && ft !== myG && !(pFree && ft === opG)) fouls.push(GV_FOULS.OPP_FIRST);
      }
      /* إسقاط كرة الخصم (الحق الحر يسمح به في أول ضربة جزاء) */
      var freePotUsed = false, oppPotFoul = false;
      if (!rec.breakShot && !S.open) {
        for (i = 0; i < pocketedColors.length; i++) {
          b = pocketedColors[i];
          var isOpp = onBlack ? true : (myG && b.type !== myG);
          if (isOpp) { if (pFree) freePotUsed = true; else oppPotFoul = true; }
        }
      }
      if (oppPotFoul) fouls.push(GV_FOULS.OPP_POTTED);
      if (rec.off.length) fouls.push(GV_FOULS.BALL_OFF_TABLE);
      var foul = fouls.length > 0;
      /* قبل تحديد المجموعات (الطاولة مفتوحة): لا جزاء ضربتين إطلاقاً —
         بدون استثناء أي حالة (حتى السكراتش وعدم اللمس) —
         الجزاء يسري فقط بعد أن تتحدد كرات اللاعبين والخصم. */
      var penaltyEligible = !S.open;

      /* ── السوداء في الكسر ── */
      var frameResult = null;
      if (blackP && rec.breakShot) {
        if (scratched || pocketedColors.length) {
          /* السوداء + البيضاء أو + كرة ملونة في الكسر = انتحار */
          frameResult = { winner: op, reason: scratched ? 'GV_SUICIDE_CUEBLACK' : 'GV_SUICIDE_EARLY' };
        } else {
          /* السوداء وحدها في الكسر بلا أي كرة أخرى = فوز ساحق */
          frameResult = { winner: sh, reason: 'GV_WIN_BREAK' };
        }
      }

      /* ── السوداء بعد الكسر: فوز أو انتحار ── */
      if (blackP && !rec.breakShot) {
        if (!onBlack) frameResult = { winner: op, reason: 'GV_SUICIDE_EARLY' };
        else if (scratched) frameResult = { winner: op, reason: 'GV_SUICIDE_CUEBLACK' };
        else if (fc && fc.type !== 'BLACK') frameResult = { winner: op, reason: 'GV_SUICIDE_TOUCH' };
        else if (blackP.status === 'OFF_TABLE') frameResult = { winner: op, reason: 'GV_SUICIDE_EARLY' };
        else {
          var pk = blackP.pocket || null, why = null;
          if (S.finish === 'DERNIER' && S.lastPocket[sh] && pk !== S.lastPocket[sh]) why = 'GV_SUICIDE_POCKET';
          if (wantAnn && pk !== S.annPocket[sh]) why = 'GV_SUICIDE_POCKET';
          if (wantAnn && !why && !annRailOk) why = 'GV_SUICIDE_NORAIL';   /* إسقاط مباشر بلا وسادة */
          if (wantBound && blackRails < S.boundN) why = 'GV_SUICIDE_BOUND';
          if (!why && foul) why = 'GV_SUICIDE_TOUCH';
          frameResult = why ? { winner: op, reason: why } : { winner: sh, reason: 'GV_WIN' };
        }
      }

      /* ── إعادة الكرات الخارجة عن الطاولة ── */
      for (i = 0; i < rec.off.length; i++) if (rec.off[i].type !== 'BLACK' && rec.off[i].type !== 'CUE') spotBall(rec.off[i]);

      /* ── تعيين المجموعات: أول إدخال ──
         الكسر بلونين مختلفين = حق الاختيار (نقر على كرة قبل الضربة التالية) */
      var choiceNow = false;
      if (S.open && !frameResult && pocketedColors.length && !scratched) {
        var reds = pocketedColors.some(function (x) { return x.type === 'RED'; });
        var yels = pocketedColors.some(function (x) { return x.type === 'YELLOW'; });
        var assigned = null;
        if (reds && yels) {
          if (rec.breakShot) { choiceNow = true; notes.push('BREAK_CHOICE'); }  /* اختيار يدوي */
          else assigned = (fc && isColor(fc)) ? fc.type : null;
        } else assigned = reds ? 'RED' : 'YELLOW';
        if (assigned && !foul) {
          S.groups[sh] = assigned;
          S.groups[op] = assigned === 'RED' ? 'YELLOW' : 'RED';
          S.open = false;
          myG = S.groups[sh]; opG = S.groups[op];
        }
      }

      /* ── آخر حفرة لكرة كل لاعب (ديرنيي ترو) ── */
      for (i = 0; i < pocketedColors.length; i++) {
        b = pocketedColors[i];
        for (var w = 0; w < 2; w++) if (S.groups[w] === b.type) S.lastPocket[w] = b.pocket || S.lastPocket[w];
      }

      /* ── الدور والجزاءات ── */
      var keep = false, lossOfTurn = false, awarded = 0;
      if (frameResult) {
        S.frameOver = true; S.winner = frameResult.winner;
        S.endReason = frameResult.reason; S.phase = 'END';
      } else if (choiceNow) {
        /* كسر بلونين: اللاعب الكاسر يواصل ويختار لونه بالنقر قبل الضربة */
        S.awaitChoice = true;
        keep = true;
        S.phase = 'AIM';
      } else if (foul) {
        S.extraShots[sh] = 0; S.penaltyFree[sh] = false;
        S.active = op;
        if (penaltyEligible) {
          /* الجزاء يسري بعد تحديد المجموعات (أو دائماً للسكراتش/عدم اللمس) */
          awarded = 2;
          S.extraShots[op] = 2;
          S.penaltyFree[op] = !S.open;      /* الحق الحر لا معنى له قبل تحديد الألوان */
        } else notes.push('NO_PENALTY_OPEN_TABLE');
        if (scratched) { S.placeRestriction = 'GV_BAULK'; S.phase = 'PLACE'; }  /* كرة بيد: وراء الخط الأبيض */
        else S.phase = 'AIM';                                                    /* البيضاء من مكانها */
      } else {
        /* الإسقاط القانوني يحفظ الدور وعدّاد الضربتين؛ عدم الإسقاط يستهلك ضربة */
        if (pocketedColors.length) { keep = true; S.phase = 'AIM'; }
        else {
          if (S.extraShots[sh] > 0) S.extraShots[sh]--;
          if (S.extraShots[sh] > 0) { keep = true; S.phase = 'AIM'; notes.push('PENALTY_SHOT_LEFT'); }
          else { S.active = op; lossOfTurn = true; S.phase = 'AIM'; }
        }
      }
      S.breakShot = false;

      /* ── ترقية إلى السوداء بعد تنظيف اللون ── */
      for (i = 0; i < 2; i++) {
        var g = S.groups[i];
        if (!S.open && g && g !== 'BLACK' && !colorOn(g)) S.groups[i] = 'BLACK';
      }

      /* ── السوداء وحيدة: إلغاء الجزاءات (إلا في ديريكت) ──
         ديريكت: جزاء الضربتين يبقى قائماً في حالتي عدم اللمس وسقوط
         البيضاء حتى عند بقاء السوداء وحيدة للاعبين — لا إلغاء إطلاقاً */
      if (S.finish !== 'DIRECT' && !S.frameOver) {
        var bothBlack = S.groups[0] === 'BLACK' && S.groups[1] === 'BLACK';
        for (i = 0; i < 2; i++) {
          if (bothBlack || S.groups[i] === 'BLACK') {
            if (S.extraShots[i] > 0) notes.push('PENALTY_CANCELLED_BLACK:' + i);
            S.extraShots[i] = 0; S.penaltyFree[i] = false;
            if (bothBlack) continue;
          }
        }
        if (bothBlack) { S.extraShots = [0, 0]; S.penaltyFree = [false, false]; }
      }

      var ev = Object.freeze({
        ruleset_id: GOLVAZOR_META.ruleset_id,
        ruleset_version: GOLVAZOR_META.ruleset_version,
        physics_version: GOLVAZOR_META.physics_version,
        shot_id: rec.shot_id, player_id: sh,
        finish: S.finish, bound_target: wantBound ? S.boundN : null,
        first_contact: fc ? fc.id : null,
        spin: rec.spin,
        pocketed: rec.pocketed.map(function (x) { return x.id; }),
        off_table: rec.off.map(function (x) { return x.id; }),
        cue_pocketed: scratched,
        black_rails: blackRails,
        black_pocket: blackP ? (blackP.pocket || null) : null,
        last_pocket: S.lastPocket.slice(),
        announced: S.annPocket.slice(),
        penalty_free_used: pFree,
        free_pot: freePotUsed,
        awarded_shots: awarded,
        await_choice: S.awaitChoice,
        extra_shots: [S.extraShots[0], S.extraShots[1]],
        notes: notes,
        foul_codes: fouls, foul: foul,
        loss_of_turn: lossOfTurn,
        loss_of_frame: !!frameResult,
        frame_effect: frameResult,
        groups_after: [S.groups[0], S.groups[1]],
        next_player: S.active, next_phase: S.phase
      });
      /* [V19.3] أنونص/أنونص+بوند: الإعلان صالح لضربة واحدة — يُمسح إعلان الضارب
         بعد كل ضربة، فيعيد اللاعب اختيار الحفرة في كل مرة يأتيه الدور على السوداء */
      if (wantAnn && !S.frameOver) S.annPocket[sh] = null;
      S.history.push(ev);
      S._shotNo++;
      emit(ev);
      return ev;
    }

    function shootAndResolve(angle, power, spin) {
      if (!shoot(angle, power, spin)) return null;
      BP.runUntilStopped(table, S.balls, S.rec);
      return resolve();
    }

    /* ── وكيل AI ── */
    function fire(a, p, sp) {
      if (S._aiDry) { S._aiPlan = { angle: a, power: p, spin: sp || null }; return null; }
      shoot(a, p, sp);
      BP.runUntilStopped(table, S.balls, S.rec);
      return resolve();
    }
    function aiPlan() { S._aiDry = true; S._aiPlan = null; aiShot(); S._aiDry = false; return S._aiPlan; }
    function bestPocketForBlack() {
      var bk = null, i;
      for (i = 0; i < S.balls.length; i++) if (S.balls[i].type === 'BLACK') bk = S.balls[i];
      if (!bk) return table.pockets[0].id;
      var best = null;
      for (i = 0; i < table.pockets.length; i++) {
        var p = table.pockets[i];
        var d = Math.hypot(p.x - bk.x, p.y - bk.y);
        if (!best || d < best.d) best = { d: d, id: p.id };
      }
      return best.id;
    }
    function aiShot() {
      var c = cue();
      if (!c) return null;
      var i;
      /* [V19] كرة بيد: وضع تلقائي حتمي في أول موضع صالح */
      if (S.phase === 'PLACE') {
        var plX, plY, plDone = false;
        for (plX = 40; plX < table.W - 40 && !plDone; plX += 20)
          for (plY = 30; plY < table.H - 30 && !plDone; plY += 20)
            if (validPlace(plX, plY)) plDone = place(plX, plY);
        c = cue();
      }
      if (!c || c.status !== 'ON_TABLE') return null;
      if (needChoice()) {
        /* اختيار اللون الأكثر بقاءً على الطاولة */
        var nR = 0, nY = 0;
        for (i = 0; i < S.balls.length; i++) {
          if (S.balls[i].status !== 'ON_TABLE') continue;
          if (S.balls[i].type === 'RED') nR++;
          else if (S.balls[i].type === 'YELLOW') nY++;
        }
        chooseGroup(nR <= nY ? 'RED' : 'YELLOW');
      }
      if (needAnnounce()) nominatePocket(bestPocketForBlack());
      if (S.breakShot) {
        var apex = null;
        for (i = 0; i < S.balls.length; i++) {
          var ob = S.balls[i];
          if (ob.type === 'CUE' || ob.status !== 'ON_TABLE') continue;
          if (!apex || ob.x < apex.x) apex = ob;
        }
        return fire(Math.atan2(apex.y - c.y, apex.x - c.x), 95, null);
      }
      var myG = S.groups[S.active];
      var onBlackAI = (myG === 'BLACK');
      var liveGV = S.balls.filter(function (x) { return x.status === 'ON_TABLE'; });
      var pFreeAI = S.penaltyFree[S.active];

      /* [V19] خبير غولڤازور: محاكاة headless — التقييم يطبق قواعد الانتحار الخمسة */
      var reqPk = null;
      if (S.finish === 'DERNIER') reqPk = S.lastPocket[S.active];
      else if (wantAnn) reqPk = S.annPocket[S.active];

      var scoreGV = function (rec, simBalls, ctx) {
        var s = 0, i2, pb;
        var scratch = !!(rec.cuePocketed || rec.cueOff);
        var pocketedObjs = rec.pocketed.filter(function (x) { return x.type !== 'CUE'; });
        var blackPot = null;
        for (i2 = 0; i2 < pocketedObjs.length; i2++) if (pocketedObjs[i2].type === 'BLACK') blackPot = pocketedObjs[i2];
        var offBlack = rec.off.some(function (x) { return x.type === 'BLACK'; });
        if (blackPot || offBlack) {
          if (!onBlackAI || scratch || offBlack) return -1e6;                 /* انتحار مبكر/مع البيضاء */
          if (rec.first && rec.first.type !== 'BLACK') return -1e6;           /* لمس الخصم قبلها */
          var pkId = blackPot.pocket || null;
          if (reqPk && pkId !== reqPk) return -1e6;                            /* حفرة خاطئة */
          if (wantAnn) {
            /* وسادة (بيضاء/سوداء) قبل السقوط وإلا NORAIL */
            var railOk = false;
            for (i2 = 0; i2 < rec.events.length; i2++) {
              var eA = rec.events[i2];
              if (eA.t === 'pocket' && blackPot && eA.ball === blackPot.id) break;
              if (eA.t === 'rail') {
                var rb2 = null;
                for (var i3 = 0; i3 < simBalls.length; i3++) if (simBalls[i3].id === eA.ball) rb2 = simBalls[i3];
                if (rb2 && (rb2.type === 'CUE' || rb2.type === 'BLACK')) { railOk = true; break; }
              }
            }
            if (!railOk) return -1e6;                                          /* GV_SUICIDE_NORAIL */
          }
          if (wantBound) {
            var bRails = 0;
            for (i2 = 0; i2 < rec.events.length; i2++) {
              var eB = rec.events[i2];
              if (eB.t === 'rail') {
                for (var i4 = 0; i4 < simBalls.length; i4++)
                  if (simBalls[i4].id === eB.ball && simBalls[i4].type === 'BLACK') bRails++;
              }
            }
            if (bRails < S.boundN) return -1e6;                                /* GV_SUICIDE_BOUND */
          }
          return 1e6 - ctx.power;                                              /* فوز قانوني */
        }
        /* أخطاء قياسية (لا جزاء قبل التحديد لكن يبقى غير مرغوب) */
        var foul = false;
        var openW = S.open ? 0.25 : 1;                                        /* قبل التحديد: بلا جزاء — وزن أخف */
        if (scratch) { foul = true; s -= 5000 * openW; }
        if (!rec.first) { foul = true; s -= 4000 * openW; }
        else {
          var ft = rec.first.type;
          if (onBlackAI) { if (ft !== 'BLACK' && !(pFreeAI && (ft === 'RED' || ft === 'YELLOW'))) { foul = true; s -= 4500; } }
          else if (ft === 'BLACK') { foul = true; s -= 4500 * openW; }
          else if (!S.open && myG && ft !== myG && !pFreeAI) { foul = true; s -= 4500; }
        }
        if (rec.off.length) { foul = true; s -= 4000; }
        for (i2 = 0; i2 < pocketedObjs.length; i2++) {
          pb = pocketedObjs[i2];
          if (pb.type === 'BLACK') continue;
          if (S.open) s += 900;
          else if (myG && pb.type === myG) s += 1000;
          else if (pFreeAI) s += 400;                                          /* الحق الحر */
          else { foul = true; s -= 900; }                                      /* OPP_POTTED */
        }
        if (!foul) s += 200;
        return s - ctx.power * 0.5;
      };

      var targetsGV = [];
      if (onBlackAI) {
        for (i = 0; i < S.balls.length; i++)
          if (S.balls[i].type === 'BLACK' && S.balls[i].status === 'ON_TABLE') targetsGV.push(S.balls[i]);
      } else {
        for (i = 0; i < S.balls.length; i++) {
          var bb = S.balls[i];
          if (bb.type === 'CUE' || bb.type === 'BLACK' || bb.status !== 'ON_TABLE') continue;
          if (!S.open && myG) { if (bb.type === myG) targetsGV.push(bb); }
          else targetsGV.push(bb);
        }
      }
      if (!targetsGV.length) for (i = 0; i < S.balls.length; i++)
        if (S.balls[i].type !== 'CUE' && S.balls[i].status === 'ON_TABLE') targetsGV.push(S.balls[i]);

      /* [V19.3] على السوداء بإنهاء مشروط (بوند/أنونص+بوند/ديرنيي): لا نكتفي
         بضربة أمان — نبحث عن ضربة الفوز متعددة الوسائد في كل دور */
      var gvOpts = null;
      if (onBlackAI && (wantBound || wantAnn || S.finish === 'DERNIER')) gvOpts = { winSeek: 900000 };
      var bestGV = aiBestShot(table, liveGV, c, targetsGV, scoreGV, gvOpts);
      if (bestGV) return fire(bestGV.angle, bestGV.power, null);
      var fbGV = targetsGV[0] || S.balls[1];
      return fire(Math.atan2(fbGV.y - c.y, fbGV.x - c.x), 30, null);
    }

    function shotPayload(angle, power, spin, placePos) {
      return { rs: GOLVAZOR_META.ruleset_id, pv: BP.PHYSICS_VERSION,
        t: placePos ? 'place' : 'shot', x: placePos ? placePos.x : undefined,
        y: placePos ? placePos.y : undefined, a: angle, p: power, s: spin || null };
    }
    function applyPayload(pl) {
      if (!pl) return null;
      if (pl.t === 'place') { place(pl.x, pl.y); return { placed: true }; }
      if (pl.t === 'annp') { nominatePocket(pl.pk); return { announced: pl.pk }; }
      if (pl.t === 'grp') { chooseGroup(pl.g); return { chosen: pl.g }; }
      return shootAndResolve(pl.a, pl.p, pl.s);
    }

    return {
      S: S, meta: GOLVAZOR_META,
      on: on, cue: cue, byId: byId,
      shoot: shoot, stepPhysics: stepPhysics, shotRunning: shotRunning, resolve: resolve,
      shootAndResolve: shootAndResolve, place: place, validPlace: validPlace,
      needAnnounce: needAnnounce, nominatePocket: nominatePocket,
      needChoice: needChoice, chooseGroup: chooseGroup,
      bestPocketForBlack: bestPocketForBlack,
      spotBall: spotBall, aiShot: aiShot, aiPlan: aiPlan,
      shotPayload: shotPayload, applyPayload: applyPayload,
      FOULS: GV_FOULS
    };
  }

  /* ══════════════════════════════════════════════════════════
     WPBSA SNOOKER — القواعد الرسمية (Section 3)
     مرجع التنفيذ: WPBSA Official Rules of Snooker (world-billiards PDF)
     • تناوب أحمر→لون مع إعادة الألوان حتى نفاد الحُمر ثم تصاعدي (3g)
     • أخطاء بنقاط للخصم: 4 كحدّ أدنى أو قيمة الكرة المعنية (10)
     • إعادة الألوان: بقعتها، فأعلى بقعة متاحة، فنحو الوسادة العليا (7d-g)
     • نهاية الإطار: السوداء الأخيرة؛ تعادل → تُعاد السوداء ويد من الباولك (4)
     • تبسيطات رقمية موثقة: بلا قاعدة Miss ولا Play-again ولا Free ball
     ══════════════════════════════════════════════════════════ */
  var SNOOKER_META = {
    ruleset_id: 'WPBSA_SNOOKER',
    ruleset_version: '2024',
    source_authority: 'WPBSA',
    effective_date: '2024-08',
    physics_version: BP.PHYSICS_VERSION,
    simplifications: 'no miss rule / no play-again / no free ball'
  };

  var SN_VALUES = { RED: 1, YELLOW: 2, GREEN: 3, BROWN: 4, BLUE: 5, PINK: 6, BLACK: 7 };
  var SN_ORDER = ['YELLOW', 'GREEN', 'BROWN', 'BLUE', 'PINK', 'BLACK'];
  var SN_SPOTS = ['black', 'pink', 'blue', 'brown', 'green', 'yellow']; /* أولوية البقع عند الازدحام 7d */

  var SN_FOULS = {
    NO_CONTACT: 'NO_CONTACT',           /* 10(a)(vi) قيمة الكرة on (≥4) */
    CUE_POTTED: 'CUE_POTTED',           /* 10(a)(vii) */
    WRONG_FIRST: 'WRONG_FIRST',         /* 10(b)(iv) الأعلى من on/المعنية */
    WRONG_POT: 'WRONG_POT',             /* 10(b)(iii) */
    SIMULTANEOUS: 'SIMULTANEOUS',       /* 10(c) الأعلى من المشار إليهما */
    OFF_TABLE: 'OFF_TABLE'              /* 10(b)(vii) */
  };

  function snooker(opts) {
    opts = opts || {};
    var table = BP.table('snooker');
    var built = BP.buildTable('snooker', null);

    var S = {
      meta: SNOOKER_META, table: table, balls: built.balls,
      phase: 'PLACE', placeRestriction: 'D',      /* 3c: أول ضربة من داخل D */
      turnState: 'REDS',                           /* REDS | COLOUR | CLEAR */
      nominated: null,
      active: opts.firstPlayer || 0,
      breaker: opts.firstPlayer || 0,
      scores: [0, 0],
      pocketOrder: [], history: [],
      frameOver: false, winner: null, endReason: null,
      suddenDeath: false,
      rec: null, _shotNo: 0, _listeners: [], _preShot: null
    };

    function on(fn) { S._listeners.push(fn); }
    function emit(ev) { for (var i = 0; i < S._listeners.length; i++) S._listeners[i](ev); }
    function cue() { for (var i = 0; i < S.balls.length; i++) if (S.balls[i].type === 'CUE') return S.balls[i]; return null; }
    function byId(id) { for (var i = 0; i < S.balls.length; i++) if (S.balls[i].id === id) return S.balls[i]; return null; }
    function colourName(b) { return b.type === 'RED' ? 'RED' : b.group; }
    function val(nm) { return SN_VALUES[nm] || 0; }
    function onTable(b) { return b.status === 'ON_TABLE'; }
    function redsOn() { return S.balls.some(function (b) { return b.type === 'RED' && onTable(b); }); }
    function coloursOn() {
      return S.balls.filter(function (b) { return b.type !== 'RED' && b.type !== 'CUE' && onTable(b); })
        .map(colourName);
    }
    function clearOn() { for (var i = 0; i < SN_ORDER.length; i++) { var nm = SN_ORDER[i]; if (S.balls.some(function (b) { return colourName(b) === nm && onTable(b); })) return nm; } return null; }
    function ballOnTypes() {
      if (S.turnState === 'REDS') return ['RED'];
      if (S.turnState === 'COLOUR') return S.nominated ? [S.nominated] : null;
      var c = clearOn(); return c ? [c] : [];
    }

    /* ── إعادة الألوان (7d–g) ── */
    function freeAt(x, y) {
      for (var i = 0; i < S.balls.length; i++) {
        var b = S.balls[i];
        if (!onTable(b)) continue;
        var dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < (2 * table.R) * (2 * table.R)) return false;
      }
      return true;
    }
    function spotColour(b) {
      var nm = colourName(b), sp = table.spots[nm.toLowerCase()];
      /* بقعتها */
      if (freeAt(sp.x, sp.y)) { b.x = sp.x; b.y = sp.y; }
      else {
        /* أعلى بقعة متاحة (7d) */
        var placed = false;
        for (var i = 0; i < SN_SPOTS.length; i++) {
          var q = table.spots[SN_SPOTS[i]];
          if (freeAt(q.x, q.y)) { b.x = q.x; b.y = q.y; placed = true; break; }
        }
        if (!placed) {
          /* نحو الوسادة العليا (7f)؛ وللوردية/السوداء أسفل البقعة إن لزم (7g) */
          var x, step = table.R * 0.5;
          for (x = sp.x + step; x < table.W - table.R; x += step) if (freeAt(x, sp.y)) { placed = true; break; }
          if (!placed && (nm === 'PINK' || nm === 'BLACK')) {
            for (x = sp.x - step; x > table.R; x -= step) if (freeAt(x, sp.y)) { placed = true; break; }
          }
          if (!placed) for (x = sp.x + step; x < table.W - table.R; x += step) if (freeAt(x, sp.y + table.R)) { placed = true; break; }
          b.x = Math.min(Math.max(x, table.R), table.W - table.R); b.y = sp.y;
        }
      }
      b.vx = 0; b.vy = 0; b.status = 'ON_TABLE';
      return b;
    }

    function validPlace(x, y) {
      if (!BP.validPlace(table, S.balls, x, y)) return false;
      if (S.placeRestriction === 'D') {
        var d = table.baulkD;
        var dx = x - d.cx, dy = y - d.cy;
        if (x > table.baulkLineX + 0.01) return false;
        if (dx * dx + dy * dy > d.r * d.r) return false;
      }
      return true;
    }
    function place(x, y) {
      if (S.phase !== 'PLACE' || S.frameOver) return false;
      if (!validPlace(x, y)) return false;
      var c = cue();
      c.x = x; c.y = y; c.vx = 0; c.vy = 0; c.status = 'ON_TABLE';
      S.placeRestriction = null;
      S.phase = 'AIM';
      return true;
    }
    function nominate(nm) {
      if (S.phase !== 'AIM' || S.turnState !== 'COLOUR') return false;
      if (SN_ORDER.indexOf(nm) === -1) return false;
      if (!S.balls.some(function (b) { return colourName(b) === nm && onTable(b); })) return false;
      S.nominated = nm;
      return true;
    }

    function shoot(angle, power, spin) {
      if (S.phase !== 'AIM' || S.frameOver) return false;
      if (S.turnState === 'COLOUR' && !S.nominated) return false;   /* يجب التصريح 2.12 */
      var c = cue();
      if (!c || c.status !== 'ON_TABLE') return false;
      S.rec = BP.newRec(S._shotNo, S.active, spin || null);
      if (!BP.applyShot(S.balls, angle, BP.powerToSpeed(power), S.rec)) { S.rec = null; return false; }
      S._preShot = S.balls.map(function (b) { return { id: b.id, x: b.x, y: b.y, status: b.status }; });
      S.phase = 'SHOT';
      return true;
    }
    function stepPhysics() { if (S.phase !== 'SHOT') return false; BP.step(table, S.balls, BP.FRAME_DT, S.rec); return true; }
    function shotRunning() { return S.phase === 'SHOT' && !BP.allStopped(S.balls); }

    function firstContactSet(rec) {
      var set = [], firstStep = null, i;
      for (i = 0; i < rec.events.length; i++) {
        var e = rec.events[i];
        if (e.t !== 'contact') continue;
        if (e.a !== 0 && e.b !== 0) continue;
        if (firstStep === null) firstStep = e.step;
        if (e.step === firstStep) set.push(e.a === 0 ? e.b : e.a);
        else break;
      }
      return set;
    }

    function resolve() {
      var rec = S.rec;
      if (!rec) return null;
      S.rec = null;
      var sh = S.active, op = 1 - sh, i, b;
      var stateAtShot = S.turnState, nomAtShot = S.nominated;
      /* الكرة «on» تُحكم من لقطة ما قبل الضربة (لا من الحالة بعد الفيزياء) */
      var on0 = {};
      if (S._preShot) {
        for (i = 0; i < S._preShot.length; i++) on0[S._preShot[i].id] = (S._preShot[i].status === 'ON_TABLE');
      } else {  /* استدعاء resolve يدوياً بلا لقطة */
        for (i = 0; i < S.balls.length; i++) on0[S.balls[i].id] = (S.balls[i].status === 'ON_TABLE');
      }
      var clearOnPre = null, redsOnPre = false;
      for (i = 0; i < SN_ORDER.length; i++) {
        var nm0 = SN_ORDER[i];
        for (var j0 = 0; j0 < S.balls.length; j0++) {
          var bb0 = S.balls[j0];
          if (bb0.type === 'RED' && on0[bb0.id]) redsOnPre = true;
          if (colourName(bb0) === nm0 && on0[bb0.id]) { clearOnPre = nm0; break; }
        }
        if (clearOnPre) break;
      }
      var onTypes = stateAtShot === 'REDS' ? ['RED'] : (stateAtShot === 'COLOUR' ? [nomAtShot] : [clearOnPre]);
      var onValue = 0;
      for (i = 0; i < onTypes.length; i++) onValue = Math.max(onValue, val(onTypes[i]));

      var pocketedObjs = rec.pocketed.filter(function (x) { return x.type !== 'CUE'; });
      var pocketedReds = pocketedObjs.filter(function (x) { return x.type === 'RED'; });
      var pocketedCols = pocketedObjs.filter(function (x) { return x.type !== 'RED'; }).map(colourName);
      var cueOffTable = !!(rec.cuePocketed || rec.cueOff);

      var fouls = [], fvals = [], respotted = [];
      function foul(code, v) { fouls.push(code); fvals.push(Math.max(4, v)); }

      var fcSet = firstContactSet(rec);
      var fcBall = rec.first;

      /* ── التماس الأول (10b-iv / 10c) ── */
      if (!fcBall) {
        foul(SN_FOULS.NO_CONTACT, onValue);                       /* 10(a)(vi) */
      } else if (fcSet.length > 1) {
        var twoReds = stateAtShot === 'REDS' && fcSet.every(function (id) { var x = byId(id); return x && x.type === 'RED'; });
        if (!twoReds) {
          var hi = 0;
          fcSet.forEach(function (id) { var x = byId(id); if (x) hi = Math.max(hi, val(colourName(x)), x.type === 'RED' ? 1 : 0); });
          foul(SN_FOULS.SIMULTANEOUS, Math.max(onValue, hi));     /* 10(c) */
        }
      } else {
        var fc = byId(fcSet[0]);
        var fcNm = fc ? colourName(fc) : null;
        if (onTypes.indexOf(fcNm) === -1) foul(SN_FOULS.WRONG_FIRST, Math.max(onValue, val(fcNm)));
      }

      /* ── إدخال كرة غير on (10b-iii) ── */
      for (i = 0; i < pocketedObjs.length; i++) {
        var pnm = colourName(pocketedObjs[i]);
        var legalPot = false;
        if (stateAtShot === 'REDS') legalPot = pocketedObjs[i].type === 'RED';
        else if (stateAtShot === 'COLOUR') legalPot = (pnm === nomAtShot);
        else legalPot = (pnm === onTypes[0]) && pocketedCols.length === 1;
        if (!legalPot) foul(SN_FOULS.WRONG_POT, Math.max(onValue, val(pnm)));
      }
      if (pocketedCols.length > 1 && stateAtShot !== 'REDS') foul(SN_FOULS.WRONG_POT, Math.max(onValue, 7));

      /* ── البيضاء / خارج الطاولة ── */
      if (cueOffTable) foul(SN_FOULS.CUE_POTTED, onValue);        /* 10(a)(vii) */
      for (i = 0; i < rec.off.length; i++) {
        var onm = colourName(rec.off[i]);
        foul(SN_FOULS.OFF_TABLE, Math.max(onValue, val(onm)));    /* 10(b)(vii) */
      }

      var foulOn = fouls.length > 0;
      var penalty = 0;
      for (i = 0; i < fvals.length; i++) penalty = Math.max(penalty, fvals[i]);  /* 11g الأعلى */

      /* ── التهديف (11e: لا نقاط في ضربة خطأ) ── */
      var gained = 0;
      if (!foulOn) {
        if (stateAtShot === 'REDS') gained = pocketedReds.length;
        else if (stateAtShot === 'COLOUR' && pocketedCols.indexOf(nomAtShot) !== -1) gained = val(nomAtShot);
        else if (stateAtShot === 'CLEAR' && pocketedCols.length === 1 && pocketedCols[0] === onTypes[0]) gained = val(onTypes[0]);
        S.scores[sh] += gained;
        /* الصينية تعرض ما بقي في الجيوب فقط: الحُمر دائماً، والألوان عند تنظيفها (7a) */
        for (i = 0; i < pocketedObjs.length; i++) {
          if (pocketedObjs[i].type === 'RED') S.pocketOrder.push(pocketedObjs[i].id);
          else if (stateAtShot === 'CLEAR' && colourName(pocketedObjs[i]) === onTypes[0]) S.pocketOrder.push(pocketedObjs[i].id);
        }
      }

      /* ── إعادة الألوان (7): كل لون دخل خارج إدخالٍ قانوني في CLEAR ── */
      var coloursStayDown = (!foulOn && stateAtShot === 'CLEAR' && gained > 0);
      for (i = 0; i < rec.pocketed.length; i++) {
        var pb = rec.pocketed[i];
        if (pb.type === 'CUE') continue;
        if (pb.type === 'RED') continue;                          /* الحُمر لا تعود 3h */
        var stay = coloursStayDown && colourName(pb) === onTypes[0];
        if (!stay) { spotColour(pb); respotted.push(colourName(pb)); }
      }
      for (i = 0; i < rec.off.length; i++) {
        var ob = rec.off[i];
        if (ob.type !== 'RED' && ob.type !== 'CUE') { spotColour(ob); if (respotted.indexOf(colourName(ob)) === -1) respotted.push(colourName(ob)); }
      }

      /* ── نهاية الإطار (4) ── */
      var blackWasLast = (stateAtShot === 'CLEAR' && onTypes[0] === 'BLACK' && !redsOnPre);
      var frameResult = null, frameHandled = false;
      if (blackWasLast || S.suddenDeath) {
        var blackPottedNow = pocketedCols.indexOf('BLACK') !== -1;
        var blackOnlyLeft = !redsOn() && coloursOn().length === 0;
        if (blackPottedNow || foulOn || blackOnlyLeft) {
          frameHandled = true;
          /* gained أُضيف أعلاه (1161) في حالة اللاخطأ؛ هنا تُضاف عقوبة الخطأ فقط (في الخطأ لا يُسجَّل شيء 11b) */
          if (foulOn) S.scores[op] += penalty;
          if (S.scores[sh] === S.scores[op] && !S.suddenDeath) {
            /* تعادل → تُعاد السوداء ويد للخصم من D (4b) */
            var bk = S.balls.filter(function (x) { return colourName(x) === 'BLACK'; })[0];
            if (bk) { spotColour(bk); respotted.push('BLACK'); }
            S.suddenDeath = true;
            S.active = op;
            S.turnState = 'CLEAR'; S.nominated = null;
            S.phase = 'PLACE'; S.placeRestriction = 'D';
          } else {
            frameResult = { winner: S.scores[0] >= S.scores[1] ? 0 : 1, reason: 'POINTS' };
          }
        }
      }

      if (frameResult) {
        S.frameOver = true; S.winner = frameResult.winner; S.endReason = frameResult.reason; S.phase = 'END';
      } else if (frameHandled) {
        /* الموت المفاجئ: لا شيء إضافي — الحالة ضُبطت أعلاه */
      } else if (foulOn) {
        S.scores[op] += penalty;                                  /* 1d/10: نقاط العقوبة للخصم */
        S.active = op;
        S.turnState = redsOn() ? 'REDS' : 'CLEAR';
        S.nominated = null;
        if (cueOffTable) { S.phase = 'PLACE'; S.placeRestriction = 'D'; }  /* 11f */
        else S.phase = 'AIM';
      } else if (gained > 0) {
        if (stateAtShot === 'REDS') { S.turnState = 'COLOUR'; S.nominated = null; }
        else if (stateAtShot === 'COLOUR') S.turnState = redsOn() ? 'REDS' : 'CLEAR';
        else S.turnState = 'CLEAR';
        S.phase = 'AIM';
      } else {
        S.active = op;                                            /* بلا إدخال: الدور للخصم 3i/5a */
        S.turnState = redsOn() ? 'REDS' : 'CLEAR';
        S.nominated = null;
        S.phase = 'AIM';
      }

      var ev = Object.freeze({
        ruleset_id: SNOOKER_META.ruleset_id,
        ruleset_version: SNOOKER_META.ruleset_version,
        physics_version: SNOOKER_META.physics_version,
        shot_id: rec.shot_id, player_id: sh,
        ball_on: onTypes, nominated: nomAtShot,
        first_contact: fcBall ? fcBall.id : null,
        simultaneous_contact: fcSet.length > 1,
        pocketed: rec.pocketed.map(function (x) { return x.id; }),
        off_table: rec.off.map(function (x) { return x.id; }),
        cue_pocketed: cueOffTable,
        respotted: respotted,
        foul_codes: fouls, foul: foulOn,
        penalty: foulOn ? penalty : 0,
        scored: gained,
        scores_after: [S.scores[0], S.scores[1]],
        frame_effect: frameResult,
        next_player: S.active, next_phase: S.phase,
        turn_state_after: S.turnState
      });
      S.history.push(ev);
      S._shotNo++;
      emit(ev);
      return ev;
    }

    function shootAndResolve(angle, power, spin) {
      if (!shoot(angle, power, spin)) return null;
      BP.runUntilStopped(table, S.balls, S.rec);
      return resolve();
    }

    /* ── وكيل AI ── */
  function fire(a, p, sp) {
    if (S._aiDry) { S._aiPlan = { angle: a, power: p, spin: sp || null }; return null; }
    shoot(a, p, sp);
    BP.runUntilStopped(table, S.balls, S.rec);
    return resolve();
  }
  function aiPlan() { S._aiDry = true; S._aiPlan = null; aiShot(); S._aiDry = false; return S._aiPlan; }
    function aiShot() {
      var c = cue();
      if (!c) return null;
      if (S.phase === 'PLACE') {
        /* من داخل D نحو الحزم */
        for (var a0 = 0; a0 < 40; a0++) {
          var px = table.baulkD.cx - 20 - (a0 % 5) * 8, py = table.baulkD.cy + ((a0 % 9) - 4) * 18;
          if (validPlace(px, py)) { place(px, py); break; }
        }
      }
      if (S.turnState === 'COLOUR' && !S.nominated) {
        /* [V19] ترشيح اللون: محاكاة سريعة لأفضل لون قابل للإدخال فعلياً وإلا الأسهل هندسياً */
        var bestNm = null, bestSc = 1e9;
        SN_ORDER.forEach(function (nm) {
          S.balls.forEach(function (bb) {
            if (colourName(bb) !== nm || !onTable(bb)) return;
            table.pockets.forEach(function (pk) {
              var g0 = aiGhost(c, bb, pk, table.R);
              if (g0.cut > 1.45) return;
              var clear = aiCuePathClear(table, S.balls.filter(onTable), c, g0, bb.id) &&
                          aiPotPathClear(table, S.balls.filter(onTable), bb, pk, table.R);
              var sc = g0.cut + g0.dist / 700 - (clear ? 0.8 : 0) - val(nm) * 0.015;
              if (sc < bestSc) { bestSc = sc; bestNm = nm; }
            });
          });
        });
        nominate(bestNm || 'YELLOW');
      }
      var targets = [];
      var onT = ballOnTypes() || ['RED'];
      S.balls.forEach(function (bb) {
        if (bb.type === 'CUE' || !onTable(bb)) return;
        if (onT.indexOf(colourName(bb)) !== -1) targets.push(bb);
      });
      if (!targets.length) targets = S.balls.filter(function (bb) { return bb.type === 'RED' && onTable(bb); });

      /* [V19] خبير سنوكر: محاكاة headless — أول تماس وأول إدخال يجب أن يكونا ball-on */
      var liveSN = S.balls.filter(onTable);
      var onSet = {};
      onT.forEach(function (nm) { onSet[nm] = true; });
      var scoreSN = function (rec, simBalls, ctx) {
        var s = 0, i2, pb;
        var scratch = !!(rec.cuePocketed || rec.cueOff);
        var pocketedObjs = rec.pocketed.filter(function (x) { return x.type !== 'CUE'; });
        var foul = false;
        if (scratch) { foul = true; s -= 5000; }
        if (!rec.first) { foul = true; s -= 4500; }
        else {
          var fcNm = rec.first.type === 'RED' ? 'RED' : rec.first.group;
          if (!onSet[fcNm]) { foul = true; s -= 5000; }
        }
        for (i2 = 0; i2 < pocketedObjs.length; i2++) {
          pb = pocketedObjs[i2];
          var nm2 = pb.type === 'RED' ? 'RED' : pb.group;
          if (onSet[nm2]) s += 800 + val(nm2) * 60;
          else { foul = true; s -= 4000; }                       /* إدخال كرة غير قانونية */
        }
        if (rec.off.length) { foul = true; s -= 4000; }
        if (!foul) s += 200;
        if (!foul && pocketedObjs.length === 0) s += 30;         /* أمان */
        return s - ctx.power * 0.5;
      };
      var bestSN = aiBestShot(table, liveSN, c, targets, scoreSN);
      if (bestSN) return fire(bestSN.angle, bestSN.power, null);
      var fbSN = targets[0];
      if (!fbSN) return null;
      return fire(Math.atan2(fbSN.y - c.y, fbSN.x - c.x), 30, null);
    }

    function shotPayload(angle, power, spin, placePos, nom) {
      return { rs: SNOOKER_META.ruleset_id, pv: BP.PHYSICS_VERSION,
        t: placePos ? 'place' : 'shot', x: placePos ? placePos.x : undefined,
        y: placePos ? placePos.y : undefined, a: angle, p: power, s: spin || null, n: nom || undefined };
    }
    function applyPayload(pl) {
      if (!pl) return null;
      if (pl.t === 'place') { place(pl.x, pl.y); return { placed: true }; }
      if (pl.t === 'nom') { nominate(pl.n); return { nominated: pl.n }; }
      if (pl.n) nominate(pl.n);
      return shootAndResolve(pl.a, pl.p, pl.s);
    }

    return {
      S: S, meta: SNOOKER_META,
      on: on, cue: cue, byId: byId,
      shoot: shoot, stepPhysics: stepPhysics, shotRunning: shotRunning, resolve: resolve,
      shootAndResolve: shootAndResolve, place: place, validPlace: validPlace,
      nominate: nominate, ballOnTypes: ballOnTypes, spotColour: spotColour, aiShot: aiShot, aiPlan: aiPlan,
      shotPayload: shotPayload, applyPayload: applyPayload,
      FOULS: SN_FOULS, VALUES: SN_VALUES
    };
  }

  /* ══════════════════════════════════════════════════════════
     سجلّ محركات القواعد — قابل للتبديل والإصدار (§10)
     ══════════════════════════════════════════════════════════ */
/* ═════════════════════════════════════════════════════════════════
   5) كاروم UMB — ثلاثة اختصاصات صريحة (الوثيقة §4):
      FREE (الحرة) · ONE (وسادة) · THREE (ثلاث وسائد)
   كل لاعب بكرته الخاصة (بيضاء/صفراء) + حمراء مشتركة — كاروم صحيح = نقطة
   والاستمرار؛ والإخفاق ينقل الدور. بلا جيوب، فلا «إدخال» إطلاقاً.
   المرجع: تعريفات UMB/ويكيبيديا المجلوبة 2026:
   - الحرة: البيضاء تلمس الكرتين.
   - وسادة: وسادة واحدة على الأقل قبل لمس الكرة الثانية.
   - ثلاث: 3 وسائد على الأقل قبل الثانية (يجوز قبل الأولى أو بعدها وبأي وسادة).
   ═════════════════════════════════════════════════════════════════ */
  var CAROM_META = {
    ruleset_id: 'UMB_CAROM', ruleset_version: '2024', source_authority: 'UMB',
    effective_date: '2024-01',
    simplifications: 'no balkline/crotch limits / no foul-in-hand (miss ends turn) / match to target'
  };
  var CAROM_CUSHIONS = { FREE: 0, ONE: 1, THREE: 3 };

  function carom(opts) {
    opts = opts || {};
    var discipline = CAROM_CUSHIONS.hasOwnProperty(opts.discipline) ? opts.discipline : 'THREE';
    var target = opts.target || 10;
    var table = BP.table('carom');
    var built = BP.buildTable('carom');
    /* البيضاء id=0 للاعب 0 · الصفراء id=P للاعب 1 · الحمراء R — والرابعة O تُحذف */
    var balls = built.balls.filter(function (b) { return b.id !== 'O'; });
    var i;
    for (i = 0; i < balls.length; i++) {
      if (balls[i].id === 0) balls[i].group = 'WHITE';
      else if (balls[i].id === 'P') balls[i].group = 'YELLOW';
      else balls[i].group = 'RED';
    }

    var S = {
      meta: CAROM_META, table: table, balls: balls,
      discipline: discipline, need: CAROM_CUSHIONS[discipline], target: target,
      phase: 'AIM', active: 0, breaker: 0,
      scores: [0, 0], pocketOrder: [],
      history: [], frameOver: false, winner: null, endReason: null,
      rec: null, _shotNo: 0, _listeners: [], _preShot: null
    };

    function on(fn) { S._listeners.push(fn); }
    function emit(ev) { for (var k = 0; k < S._listeners.length; k++) S._listeners[k](ev); }
    function byId(id) { for (var k = 0; k < S.balls.length; k++) if (S.balls[k].id === id) return S.balls[k]; return null; }
    function cueId() { return S.active === 0 ? 0 : 'P'; }
    function cue() { return byId(cueId()); }
    /* إعادة وسم الكرة المضروبة: الفيزياء تعتمد type === 'CUE' */
    function syncCue() {
      var w = byId(0), y = byId('P');
      w.type = (S.active === 0) ? 'CUE' : 'OBJECT';
      y.type = (S.active === 1) ? 'CUE' : 'OBJECT';
    }
    function objectIds() { return [S.active === 0 ? 'P' : 0, 'R']; }

    function shoot(angle, power, spin) {
      if (S.phase !== 'AIM' || S.frameOver) return false;
      var c = cue();
      if (!c || c.status !== 'ON_TABLE') return false;
      syncCue();
      S.rec = BP.newRec(S._shotNo, S.active, spin || null);
      if (!BP.applyShot(S.balls, angle, BP.powerToSpeed(power), S.rec)) { S.rec = null; return false; }
      S.rec.dirX = Math.cos(angle); S.rec.dirY = Math.sin(angle);
      S._preShot = S.balls.map(function (b) { return { id: b.id, x: b.x, y: b.y, status: b.status }; });
      S.phase = 'SHOT';
      return true;
    }
    function stepPhysics() { if (S.phase !== 'SHOT') return false; BP.step(table, S.balls, BP.FRAME_DT, S.rec); return true; }
    function shotRunning() { return S.phase === 'SHOT' && !BP.allStopped(S.balls); }
    function last(G) { return G.S.history[G.S.history.length - 1]; }

    /* تحليل الضربة: الكاروم وعدّاد الوسائد قبل الكرة الثانية */
    function resolve() {
      var rec = S.rec;
      if (!rec) return null;
      S.rec = null;
      var sh = S.active, op = 1 - sh;
      var cId = cueId(), objs = objectIds();
      var firstObj = null, secondObj = null, cushions = 0, i, e;
      for (i = 0; i < rec.events.length; i++) {
        e = rec.events[i];
        if (e.t === 'rail') {
          if (e.ball === cId && secondObj === null) cushions++;
        } else if (e.t === 'contact') {
          if (e.a !== cId && e.b !== cId) continue;
          var other = (e.a === cId) ? e.b : e.a;
          if (objs.indexOf(other) === -1) continue;
          if (firstObj === null) firstObj = other;
          else if (other !== firstObj && secondObj === null) secondObj = other;
        }
      }
      var complete = !!(firstObj && secondObj);
      var valid = complete && (cushions >= S.need);

      var scored = 0, frameResult = null;
      if (valid) {
        scored = 1;
        S.scores[sh] += 1;
        if (S.scores[sh] >= S.target) frameResult = { winner: sh, reason: 'TARGET' };
      }
      if (!frameResult && !valid) { S.active = op; syncCue(); }
      if (frameResult) { S.frameOver = true; S.winner = frameResult.winner; S.endReason = frameResult.reason; S.phase = 'END'; }
      else S.phase = 'AIM';

      S._shotNo++;
      var ev = {
        ruleset_id: CAROM_META.ruleset_id, ruleset_version: CAROM_META.ruleset_version,
        shot_id: rec.shot_id, player_id: rec.player_id,
        discipline: S.discipline,
        first_contact: firstObj, second_contact: secondObj,
        cushions_before_second: cushions, cushions_needed: S.need,
        carom_valid: valid, scored: scored,
        foul: false, foul_codes: [], penalty: 0,
        pocketed: [], off: [], notes: [],
        scores_after: S.scores.slice(),
        turn_continues: valid && !frameResult,
        frame_effect: frameResult ? 'MATCH_END' : null,
        ball_on: null, nominated: null
      };
      S.history.push(ev);
      emit(ev);
      return ev;
    }

    function shootAndResolve(angle, power, spin) {
      if (!shoot(angle, power, spin)) return null;
      BP.runUntilStopped(table, S.balls, S.rec);
      return resolve();
    }

    function place() { return false; }              /* بلا كرة بيد في الكاروم */
    function validPlace() { return false; }

  function fire(a, p, sp) {
    if (S._aiDry) { S._aiPlan = { angle: a, power: p, spin: sp || null }; return null; }
    shoot(a, p, sp);
    BP.runUntilStopped(table, S.balls, S.rec);
    return resolve();
  }
  function aiPlan() { S._aiDry = true; S._aiPlan = null; aiShot(); S._aiDry = false; return S._aiPlan; }
    function aiShot() {
      var c = cue();
      if (!c) return null;
      syncCue();
      var cId = cueId(), objs = objectIds();

      /* [V19] خبير كاروم: مسح كامل للزوايا (72 اتجاهاً × قوى) بمحاكاة headless —
         الكاروم الصحيح = لمس الكرتين + عدد الوسائد المطلوب قبل الثانية */
      var evalRec = function (rec) {
        var firstObj = null, secondObj = null, cushions = 0, i, e;
        for (i = 0; i < rec.events.length; i++) {
          e = rec.events[i];
          if (e.t === 'rail') {
            if (e.ball === cId && secondObj === null) cushions++;
          } else if (e.t === 'contact') {
            if (e.a !== cId && e.b !== cId) continue;
            var other = (e.a === cId) ? e.b : e.a;
            if (objs.indexOf(other) === -1) continue;
            if (firstObj === null) firstObj = other;
            else if (other !== firstObj && secondObj === null) secondObj = other;
          }
        }
        return { complete: !!(firstObj && secondObj), first: !!firstObj, cushions: cushions };
      };

      var best = null, k, p, a;
      var powers = (S.need >= 3) ? [55, 75, 95] : [35, 55, 78];
      for (k = 0; k < 72; k++) {
        a = (k / 72) * Math.PI * 2;
        for (p = 0; p < powers.length; p++) {
          var sim = aiSimulate(table, S.balls, a, powers[p]);
          if (!sim) continue;
          var r = evalRec(sim.rec);
          var sc;
          if (r.complete && r.cushions >= S.need) sc = 1e6 - powers[p];       /* نقطة مؤكدة */
          else if (r.complete) sc = 500 + r.cushions * 40 - powers[p] * 0.5;  /* لمس الكرتين بلا وسائد كافية */
          else if (r.first) sc = 100 + r.cushions * 10 - powers[p] * 0.5;
          else sc = -100 - powers[p];
          if (!best || sc > best.sc) best = { sc: sc, a: a, p: powers[p] };
          if (best.sc >= 1e6 - 100) break;                                    /* وجدنا كاروماً مؤكداً خفيفاً */
        }
        if (best && best.sc >= 1e6 - 100) break;
      }
      if (best) return fire(best.a, best.p, null);
      var red = byId('R');
      var d = Math.hypot(red.x - c.x, red.y - c.y);
      return fire(Math.atan2(red.y - c.y, red.x - c.x), Math.min(100, Math.round(35 + d * 0.12)), null);
    }

    function shotPayload(angle, power, spin) {
      return { rs: CAROM_META.ruleset_id, pv: BP.PHYSICS_VERSION,
        t: 'shot', a: angle, p: power, s: spin || null };
    }
    function applyPayload(pl) {
      if (!pl) return null;
      return shootAndResolve(pl.a, pl.p, pl.s);
    }

    syncCue();
    return {
      S: S, meta: CAROM_META,
      on: on, cue: cue, byId: byId,
      shoot: shoot, stepPhysics: stepPhysics, shotRunning: shotRunning, resolve: resolve,
      shootAndResolve: shootAndResolve, place: place, validPlace: validPlace,
      aiShot: aiShot, aiPlan: aiPlan, shotPayload: shotPayload, applyPayload: applyPayload,
      DISCIPLINES: CAROM_CUSHIONS
    };
  }


  var RULESETS = {
    eightball: { meta: EIGHTBALL_META, create: eightball, table: 'eightball', ready: true },
    blackball: { meta: BLACKBALL_META, create: blackball, table: 'blackball', ready: true },
    golvazor:  { meta: GOLVAZOR_META, create: golvazor, table: 'blackball', ready: true },   /* غولڤازور ✅ */
    snooker:   { meta: SNOOKER_META, create: snooker, table: 'snooker', ready: true },
    carom:     { meta: CAROM_META, create: carom, table: 'carom', ready: true }    /* المرحلة 5 ✅ */
  };

  var BilliardsRules = {
    RULESETS: RULESETS,
    eightball: eightball,
    blackball: blackball,
    golvazor: golvazor,
    snooker: snooker,
    carom: carom,
    EIGHTBALL_META: EIGHTBALL_META,
    BLACKBALL_META: BLACKBALL_META,
    GOLVAZOR_META: GOLVAZOR_META,
    GV_FOULS: GV_FOULS,
    GV_FINISHES: GV_FINISHES,
    SNOOKER_META: SNOOKER_META,
    CAROM_META: CAROM_META,
    CAROM_CUSHIONS: CAROM_CUSHIONS,
    FOULS: FOULS,
    BB_FOULS: BB_FOULS,
    supported: function (id) { return !!(RULESETS[id] && RULESETS[id].ready); }
  };

  root.BilliardsRules = BilliardsRules;
  if (typeof module !== 'undefined' && module.exports) module.exports = BilliardsRules;
})(typeof window !== 'undefined' ? window : globalThis);

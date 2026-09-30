/* ══════════════════════════════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Billiards Physics Engine (نواة مستقلة)
   ══════════════════════════════════════════════════════════════════
   مبدأ §10 من «مرجع مواصفات وقواعد لعبة البلياردو»:
   الفيزياء مستقلة عن قواعد اللعبة — المحرك يُنتج الأحداث، ومحرك القواعد يقرّر.

   • خطوة زمنية ثابتة 240Hz  → حتمية (شرط إعادة التشغيل في اللعب أونلاين)
   • بلا Math.random / Date.now / ترتيب Set  → نفس المدخلات = نفس المخرجات
   • الجيوب اختيارية (pockets: []) فتصلح الطاولة للكاروم الفرنسي بلا جيوب
   • يعمل في Node (اختبارات) وفي المتصفح (لعبة) بنفس الملف

   يُحمَّل قبل engines.js. في Node:  globalThis.BilliardsPhysics
   ══════════════════════════════════════════════════════════════════ */
"use strict";
(function (root) {

  var PHYSICS_VERSION = '3.0';
  var HZ = 240;                       /* خطوات الفيزياء في الثانية */
  var FRAME_DT = (1000 / HZ) / 1000 * 60;   /* = 0.25 وحدة إطار (60Hz) لكل خطوة */

  /* ── ثوابت القماش والوسائد (مطابقة للنموذج الأولي v2.2) ── */
  var FRICTION = 0.9935;   /* تباطؤ أُسّي (تدحرج) */
  var DEC      = 0.018;    /* تباطؤ خطي (احتكاك القماش) */
  var STOP     = 0.04;     /* ما دونها = سكون */
  var REST     = 0.93;     /* معامل ارتداد الوسادة (عمودي) */
  var CUSH_T   = 0.94;     /* معامل الوسادة (مماسي) */
  var BALL_E   = 0.98;     /* معامل ارتداد كرة/كرة */

  var MAX_STEPS = 240 * 90;  /* حد أمان: 90 ثانية محاكاة */

  /* ══════════════════════════════════════════════════════════
     1) ملفات الطاولة — Table Profiles
     الوحدة المنطقية: قطر الكرة = 2R حيث R = 15
     الأبعاد الحقيقية (مرجع WPA/WPBSA) → وحدات منطقية:
       8-Ball  9ft  = 100×50 in   → 1000×500  (WPA: سطح لعب 100×50 بوصة)
       Snooker 12ft = 142×71 in   → 1037×518
       Carom   10ft = 112×56 in   → 1120×560  (بلا جيوب)
     ══════════════════════════════════════════════════════════ */
  function cushionsFor(W, H, cornerGap, sideGap) {
    /* وسائد كمقاطع مستقيمة — عامّة: بلا فجوات حين sideGap = null (كاروم) */
    var seg = [];
    if (sideGap === null || sideGap === undefined) {
      seg.push({ x1: 0, y1: 0, x2: W, y2: 0, nx: 0, ny: 1 });            /* أعلى */
      seg.push({ x1: 0, y1: H, x2: W, y2: H, nx: 0, ny: -1 });           /* أسفل */
      seg.push({ x1: 0, y1: 0, x2: 0, y2: H, nx: 1, ny: 0 });            /* يسار */
      seg.push({ x1: W, y1: 0, x2: W, y2: H, nx: -1, ny: 0 });           /* يمين */
      return seg;
    }
    var cx0 = cornerGap, cx1 = W / 2 - sideGap, cx2 = W / 2 + sideGap, cx3 = W - cornerGap;
    var sy0 = cornerGap, sy1 = H - cornerGap;
    seg.push({ x1: cx0, y1: 0, x2: cx1, y2: 0, nx: 0, ny: 1 });
    seg.push({ x1: cx2, y1: 0, x2: cx3, y2: 0, nx: 0, ny: 1 });
    seg.push({ x1: cx0, y1: H, x2: cx1, y2: H, nx: 0, ny: -1 });
    seg.push({ x1: cx2, y1: H, x2: cx3, y2: H, nx: 0, ny: -1 });
    seg.push({ x1: 0, y1: sy0, x2: 0, y2: sy1, nx: 1, ny: 0 });
    seg.push({ x1: W, y1: sy0, x2: W, y2: sy1, nx: -1, ny: 0 });
    return seg;
  }

  function cornerPockets(W, H, r) {
    return [{ x: 0, y: 0, r: r, id: 'TL' }, { x: W, y: 0, r: r, id: 'TR' },
            { x: 0, y: H, r: r, id: 'BL' }, { x: W, y: H, r: r, id: 'BR' }];
  }
  function sidePockets(W, H, r) {
    /* قرصا الحفرتين الوسطيتين: مركزهما خارج سطح اللعب قليلاً (كالنموذج §المواصفات) */
    return [{ x: W / 2, y: -r * 0.6, r: r, id: 'TC' }, { x: W / 2, y: H + r * 0.6, r: r, id: 'BC' }];
  }

  var TABLES = {
    /* ── أمريكي 8-Ball (WPA) — 6 جيوب واسعة ── */
    eightball: {
      /* WPA: مساحة لعب 2540×1270 مم، كرة 57.15 مم ⇒ R=11.25 بوحداتنا (نفس مساحة الشاشة) */
      id: 'eightball', label: '8-Ball', W: 1000, H: 500, R: 11.25,
      ballCount: 16,
      pockets: cornerPockets(1000, 500, 20.25).concat(sidePockets(1000, 500, 17.25)),
      cornerGap: 34.5, sideGap: 19.5,
      cushions: cushionsFor(1000, 500, 34.5, 19.5),
      headStringX: 250,          /* خط الكسر: ربع الطاولة */
      footSpot: { x: 750, y: 250 },
      cueBreak: { x: 250, y: 250 },
      rack: 'triangle15',
      offTableMargin: 2.4        /* ×R خارج السطح = كرة خارج الطاولة */
    },
    /* ── إنجليزي Blackball (EPA International Rules v2d) — جيوب أصغر ومستديرة ── */
    blackball: {
      /* WEPF/IPA: 1981×991 مم، كرة هدف 50.8 مم ⇒ R=12.8؛ البيضاء 47.6 مم (تُرسم أصغر 6%) */
      id: 'blackball', label: 'Blackball', W: 1000, H: 500, R: 12.8, cueScale: 0.937,
      ballCount: 16,
      pockets: cornerPockets(1000, 500, 20.5).concat(sidePockets(1000, 500, 17.9)),
      cornerGap: 35, sideGap: 19.7,
      cushions: cushionsFor(1000, 500, 35, 19.7),
      baulkLineX: 200,                 /* خط الكسر = خُمس الطول من وسادة الباولك (قاعدة 2) */
      headStringX: 200,
      footSpot: { x: 720, y: 250 },
      cueBreak: { x: 150, y: 250 },
      rack: 'triangle15blackball',
      offTableMargin: 2.4
    },
    /* ── Snooker (WPBSA) — 12 قدماً، 6 جيوب أضيق ── */
    snooker: {
      /* WPBSA: 3569×1778 مم، كرة 52.5 مم ⇒ R=7.65؛ بولك 737مم=215، نصف قطر D ‏292مم=85 */
      id: 'snooker', label: 'Snooker', W: 1037, H: 518, R: 7.65,
      ballCount: 22,
      /* الحفر وأعناقها أصغر 25% بطلب المستخدم (سنوكر فقط) */
      pockets: cornerPockets(1037, 518, 9.95).concat(sidePockets(1037, 518, 9.18)),
      cornerGap: 16.8, sideGap: 9.95,
      cushions: cushionsFor(1037, 518, 16.8, 9.95),
      baulkLineX: 215,           /* 29in = 737مم من وجه وسادة الباولك */
      baulkD: { cx: 215, cy: 259, r: 85 },    /* نصف قطر 11.5in = 292مم */
      spots: {
        yellow: { x: 215, y: 344 }, green: { x: 215, y: 174 }, brown: { x: 215, y: 259 },
        blue:   { x: 518.5, y: 259 }, pink: { x: 777.75, y: 259 }, black: { x: 944, y: 259 }
      },
      rack: 'snooker',
      offTableMargin: 2.4
    },
    /* ── فرنسي Carom (UMB) — طاولة بلا جيوب، 3 كرات ── */
    carom: {
      /* UMB: 2840×1420 مم، كرة 61.5 مم ⇒ R=12.13 */
      id: 'carom', label: 'Carom', W: 1120, H: 560, R: 12.13,
      ballCount: 3,
      pockets: [],                                   /* ← لا حدث «جيب» في هذا النمط */
      cornerGap: 0, sideGap: null,
      cushions: cushionsFor(1120, 560, 0, null),
      spots: { head: { x: 280, y: 280 }, center: { x: 560, y: 280 }, foot: { x: 840, y: 280 } },
      cueBreak: { x: 340, y: 280 },   /* 60 وحدة يمين نقطة الرأس — لا تداخل مع كرات الهدف */
      rack: 'carom3',
      offTableMargin: null                           /* لا توجد كرة خارج طاولة بلا جيوب */
    }
  };

  /* ══════════════════════════════════════════════════════════
     2) الكرات
     ══════════════════════════════════════════════════════════ */
  function makeBall(id, type, value, x, y, group) {
    return {
      id: id, type: type, value: value || 0, group: group || null,
      x: x, y: y, vx: 0, vy: 0,
      status: 'ON_TABLE',      /* ON_TABLE | POCKETED | OFF_TABLE | SPOTTED */
      phase: 0, dx: 0, dy: 1   /* زاوية التدحرج البصرية فقط — لا تدخل في المنطق */
    };
  }

  /* ترتيب مثلث 8-Ball: الكرة 8 في المركز، زاوية ممتلئة وزاوية مخططة (WPA) */
  function rackTriangle15(table, striped) {
    var R = table.R;
    var order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    var fx = table.footSpot.x, fy = table.footSpot.y;
    var dx = R * Math.sqrt(3), dy = 2 * R + 0.6;
    var balls = [], i = 0;
    for (var row = 0; row < 5; row++) {
      for (var k = 0; k <= row; k++) {
        var v = order[i++];
        balls.push(makeBall(v, v === 8 ? 'EIGHT' : (v < 8 ? 'SOLID' : 'STRIPE'), v,
          fx + row * dx, fy + (k - row / 2) * dy, v === 8 ? null : (v < 8 ? 'SOLID' : 'STRIPE')));
      }
    }
    return balls;
  }

  /* Blackball: 7 صفراء + 7 حمراء + السوداء في المركز */
  function rackTriangle15Blackball(table) {
    var R = table.R;
    var order = ['Y', 'R', 'Y', 'R', 'B', 'Y', 'R', 'Y', 'R', 'Y', 'R', 'Y', 'R', 'Y', 'R'];
    var fx = table.footSpot.x, fy = table.footSpot.y;
    var dx = R * Math.sqrt(3), dy = 2 * R + 0.6;
    var balls = [], i = 0, num = { Y: 0, R: 0 };
    for (var row = 0; row < 5; row++) {
      for (var k = 0; k <= row; k++) {
        var c = order[i++];
        var type = c === 'B' ? 'BLACK' : (c === 'Y' ? 'YELLOW' : 'RED');
        var val = c === 'B' ? 8 : (c === 'Y' ? (++num.Y) : (7 + (++num.R)));
        balls.push(makeBall(type + val, type, val,
          fx + row * dx, fy + (k - row / 2) * dy, c === 'B' ? null : type));
      }
    }
    return balls;
  }

  /* Snooker: 15 حمراء في مثلث خلف الوردية + 6 ألوان على نقاطها */
  function rackSnooker(table) {
    var R = table.R, balls = [];
    var s = table.spots;
    balls.push(makeBall('Y', 'COLOUR', 2, s.yellow.x, s.yellow.y, 'YELLOW'));
    balls.push(makeBall('G', 'COLOUR', 3, s.green.x, s.green.y, 'GREEN'));
    balls.push(makeBall('Br', 'COLOUR', 4, s.brown.x, s.brown.y, 'BROWN'));
    balls.push(makeBall('Bl', 'COLOUR', 5, s.blue.x, s.blue.y, 'BLUE'));
    balls.push(makeBall('P', 'COLOUR', 6, s.pink.x, s.pink.y, 'PINK'));
    balls.push(makeBall('Bk', 'COLOUR', 7, s.black.x, s.black.y, 'BLACK'));
    /* المثلث: قمته تلامس الوردية من جهة الكرات السوداء، 5 صفوف */
    var apexX = s.pink.x + 2 * R + 0.4, cy = s.pink.y;
    var dx = R * Math.sqrt(3), dy = 2 * R + 0.6, n = 1;
    for (var row = 0; row < 5; row++) {
      for (var k = 0; k <= row; k++) {
        balls.push(makeBall('R' + n, 'RED', 1, apexX + row * dx, cy + (k - row / 2) * dy, 'RED'));
        n++;
      }
    }
    return balls;
  }

  /* Carom: كرتا الهدف على نقطتَي الوسط والقدم.
     كرة اللاعب تبدأ عند نقطة الرأس لكن موضعها النهائي يحدّده اللاعب في الشاشة
     (في 3-Cushion تُوضع على بعد 28 سم من الحمراء) — لذلك لا نضعها في المثلث
     تفادياً للتداخل مع البيضاء. */
  function rackCarom3(table) {
    var s = table.spots;
    return [
      makeBall('O', 'OBJECT', 0, s.center.x, s.center.y, 'OPPONENT'),  /* بيضاء الخصم */
      makeBall('R', 'OBJECT', 0, s.foot.x, s.foot.y, 'RED'),           /* الحمراء */
      makeBall('P', 'OBJECT', 0, s.head.x, s.head.y, 'PLAYER1')        /* كرة اللاعب */
    ];
  }

  function buildTable(profile, cuePos) {
    var t = TABLES[profile] || TABLES.eightball;
    var balls = [];
    balls.push(makeBall(0, 'CUE', 0,
      cuePos ? cuePos.x : (t.cueBreak ? t.cueBreak.x : t.W * 0.25),
      cuePos ? cuePos.y : (t.cueBreak ? t.cueBreak.y : t.H / 2), 'CUE'));
    if (t.rack === 'triangle15') balls = balls.concat(rackTriangle15(t, true));
    else if (t.rack === 'triangle15blackball') balls = balls.concat(rackTriangle15Blackball(t));
    else if (t.rack === 'snooker') balls = balls.concat(rackSnooker(t));
    else if (t.rack === 'carom3') balls = balls.concat(rackCarom3(t));
    return { profile: t, balls: balls };
  }

  /* ══════════════════════════════════════════════════════════
     3) سجل الضربة — REC (أحداث الفيزياء، بلا أحكام قانونية)
     ══════════════════════════════════════════════════════════ */
  function newRec(shot, playerId, spin) {
    return {
      shot_id: shot, player_id: playerId, spin: spin ? { x: spin.x || 0, y: spin.y || 0 } : null,
      dirX: 0, dirY: 0,
      events: [],            /* {t:'contact'|'rail', ...} بالترتيب الزمني */
      contacts: [],          /* أزواج [idA, idB] */
      first: null,           /* أول كرة لامستها البيضاء */
      pocketed: [], off: [],
      cuePocketed: false, cueOff: false,
      rails: 0, railsAfter: 0,
      railBalls: {},         /* id → true (كرات هدف لمست وسادة) */
      steps: 0
    };
  }

  function logEvent(rec, ev) { if (rec) rec.events.push(ev); }

  /* ── عدد الوسائد قبل الملامسة الثانية (لاختصاصات الكاروم) ── */
  function cushionsBeforeSecondContact(rec) {
    if (!rec) return 0;
    var contacts = 0, cushions = 0;
    for (var i = 0; i < rec.events.length; i++) {
      var e = rec.events[i];
      if (e.t === 'rail') { if (contacts < 2) cushions++; }
      else if (e.t === 'contact') { contacts++; if (contacts >= 2) break; }
    }
    return cushions;
  }

  /* ══════════════════════════════════════════════════════════
     4) الفيزياء — خطوة واحدة (تُنادى 240 مرة/ثانية)
     dt بوحدة «إطار 60Hz» → 0.25 لكل خطوة عند 240Hz
     ══════════════════════════════════════════════════════════ */
  /* [PocketReal v2] نموذج عبور الحافة: سطح اللعب هو كامل المستطيل [0..W]×[0..H]
     بما فيه أعناق الحفر (بين نهايتي الوسادتين) — الكرة تستقر فيها كأي جزء
     من الطاولة. السقوط يحدث حصراً حين يعبر مركز الكرة حافة المستطيل عبر
     فجوة فم حفرة (الوسائد تسدّ باقي الحواف). لا «شفط» في العنق، ولا ارتداد
     بعد الدخول، ولا تجاوز للفوهة — أول عبور = سقوط نهائي فوري. */
  function pocketAt(table, x, y) {
    if (!table.pockets.length) return null;
    var W = table.W, H = table.H;
    if (x >= 0 && x <= W && y >= 0 && y <= H) return null;   /* المركز فوق السطح = لا سقوط أبداً */
    var cg = table.cornerGap, sg = table.sideGap;
    var tol = table.R * 0.6;                                  /* سماحية رأس الفك */
    var outX = (x < 0 || x > W), outY = (y < 0 || y > H);
    var id = null;
    if (outY && !outX) {              /* عبور الحافة العليا/السفلى */
      if (x <= cg + tol) id = (y < 0) ? 'TL' : 'BL';
      else if (x >= W - cg - tol) id = (y < 0) ? 'TR' : 'BR';
      else if (sg !== null && sg !== undefined && Math.abs(x - W / 2) <= sg + tol) id = (y < 0) ? 'TC' : 'BC';
    } else if (outX && !outY) {       /* عبور الحافة اليسرى/اليمنى */
      if (y <= cg + tol) id = (x < 0) ? 'TL' : 'TR';
      else if (y >= H - cg - tol) id = (x < 0) ? 'BL' : 'BR';
    } else {                          /* عبور قطري عند زاوية */
      id = (x < 0) ? ((y < 0) ? 'TL' : 'BL') : ((y < 0) ? 'TR' : 'BR');
    }
    if (!id) return null;             /* اختراق وسادة لحظي (سرعة قصوى) — سيُرجعه حل الوسائد */
    for (var i = 0; i < table.pockets.length; i++)
      if (table.pockets[i].id === id) return table.pockets[i];
    return null;
  }



  function pocketBall(rec, b) {
    b.status = 'POCKETED'; b.vx = 0; b.vy = 0;
    if (rec) {
      rec.pocketed.push(b);
      if (b.type === 'CUE') rec.cuePocketed = true;
    }
  }
  function offTableBall(rec, b) {
    b.status = 'OFF_TABLE'; b.vx = 0; b.vy = 0;
    if (rec) {
      rec.off.push(b);
      if (b.type === 'CUE') rec.cueOff = true;
    }
  }

  /* مسافة نقطة إلى قطعة مستقيمة */
  function segDist(px, py, s) {
    var ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    var len2 = ex * ex + ey * ey;
    var t = len2 === 0 ? 0 : ((px - s.x1) * ex + (py - s.y1) * ey) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var cx = s.x1 + t * ex, cy = s.y1 + t * ey;
    return { d: Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)), cx: cx, cy: cy };
  }

  function step(table, balls, dt, rec) {
    var R = table.R, W = table.W, H = table.H;
    var i, j, b, sp, sp0, dec, nx, ny;

    /* ── 4.1 حركة + تباطؤ ── */
    var fr = Math.pow(FRICTION, dt);
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.status !== 'ON_TABLE') continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vx *= fr; b.vy *= fr;
      sp0 = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp0 > 0) {
        dec = Math.min(sp0, DEC * dt);
        b.vx -= b.vx / sp0 * dec; b.vy -= b.vy / sp0 * dec;
      }
      sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp < STOP) { b.vx = 0; b.vy = 0; }
      else if (sp > 0.3) {
        nx = b.vx / sp; ny = b.vy / sp;
        b.dx = (b.dx || 0) * 0.7 + nx * 0.3; b.dy = (b.dy || 0) * 0.7 + ny * 0.3;
        var dl = Math.sqrt(b.dx * b.dx + b.dy * b.dy) || 1;
        b.dx /= dl; b.dy /= dl;
        b.phase += sp * dt / R;
      }
    }

    /* ── 4.2 الجيوب (إن وُجدت) ثم خارج الطاولة ── */
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.status !== 'ON_TABLE') continue;
      if (table.pockets.length) {
        var pkHit = pocketAt(table, b.x, b.y);
        if (pkHit) {
          pocketBall(rec, b);
          b.pocket = pkHit.id;                              /* هوية الحفرة (غولڤازور) */
          logEvent(rec, { t: 'pocket', ball: b.id, pocket: pkHit.id });
          continue;
        }
      }
      if (table.offTableMargin !== null && table.offTableMargin !== undefined) {
        var m = R * table.offTableMargin;
        if (b.x < -m || b.x > W + m || b.y < -m || b.y > H + m) offTableBall(rec, b);
      }
    }

    /* ── 4.3 الوسائد كمقاطع (عامّة: تعمل مع الجيوب وبلا جيوب) ── */
    var cush = table.cushions;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.status !== 'ON_TABLE') continue;
      for (j = 0; j < cush.length; j++) {
        var s = cush[j];
        var sd = segDist(b.x, b.y, s);
        if (sd.d < R) {
          /* المتجه من أقرب نقطة على الوسادة إلى مركز الكرة = العمودي */
          var ax = b.x - sd.cx, ay = b.y - sd.cy;
          var al = Math.sqrt(ax * ax + ay * ay);
          if (al === 0) { ax = s.nx; ay = s.ny; al = 1; }
          nx = ax / al; ny = ay / al;
          /* إرجاع الكرة لحد التماس */
          b.x = sd.cx + nx * R; b.y = sd.cy + ny * R;
          var vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            /* مركّبة عمودية ترتد بـ REST، والمماسية تتباطأ بـ CUSH_T */
            var tx = -ny, ty = nx;
            var vt = b.vx * tx + b.vy * ty;
            vn = -vn * REST; vt *= CUSH_T;
            b.vx = nx * vn + tx * vt; b.vy = ny * vn + ty * vt;
            if (rec) {
              rec.rails++;
              if (rec.first) rec.railsAfter++;
              if (b.type === 'CUE') rec.cueRailsAfter = (rec.cueRailsAfter || 0) + (rec.first ? 1 : 0);
              if (b.type !== 'CUE') rec.railBalls[b.id] = true;
              logEvent(rec, { t: 'rail', ball: b.id, seg: j });
            }
          }
        }
      }
    }

    /* ── 4.4 تصادم كرة/كرة ── */
    var on = [];
    for (i = 0; i < balls.length; i++) if (balls[i].status === 'ON_TABLE') on.push(balls[i]);
    for (i = 0; i < on.length; i++) {
      for (j = i + 1; j < on.length; j++) {
        var a = on[i], c = on[j];
        var dx = c.x - a.x, dy = c.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d === 0) { d = 0.01; dx = 0.01; }
        if (d < 2 * R) {
          nx = dx / d; ny = dy / d;
          var ov = Math.max(0, (2 * R - d) - 0.05) * 0.42;
          a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
          var p = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (p > 0) {
            var e = p * BALL_E;
            a.vx -= e * nx; a.vy -= e * ny; c.vx += e * nx; c.vy += e * ny;
            if (rec) {
              rec.contacts.push([a.id, c.id]);
              logEvent(rec, { t: 'contact', a: a.id, b: c.id, step: rec.steps });
              var cue = (a.type === 'CUE') ? a : ((c.type === 'CUE') ? c : null);
              if (cue && !rec.first) {
                rec.first = (cue === a) ? c : a;
                /* نقل الدوران (English) عند أول تماس — كالنموذج v2.2 */
                if (rec.spin && Math.abs(rec.spin.y) > 0.02) {
                  cue.vx += rec.dirX * rec.spin.y * 7;
                  cue.vy += rec.dirY * rec.spin.y * 7;
                }
                if (rec.spin) rec.spin.y *= 0.4;
              }
            }
          }
        }
      }
    }
    if (rec) rec.steps++;
  }

  function allStopped(balls) {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.status === 'ON_TABLE' && (b.vx !== 0 || b.vy !== 0)) return false;
    }
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     5) تنفيذ ضربة كاملة (headless) — تُستخدم في الاختبارات
        وفي التحقق الحتمي على الخادم قبل بثّها أونلاين
     ══════════════════════════════════════════════════════════ */
  function applyShot(balls, angle, speed, rec) {
    var cue = null;
    for (var i = 0; i < balls.length; i++) if (balls[i].type === 'CUE') { cue = balls[i]; break; }
    if (!cue || cue.status !== 'ON_TABLE') return false;
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    if (rec) { rec.dirX = Math.cos(angle); rec.dirY = Math.sin(angle); }
    return true;
  }

  function runUntilStopped(table, balls, rec, maxSteps) {
    var n = 0, lim = maxSteps || MAX_STEPS;
    while (!allStopped(balls) && n < lim) { step(table, balls, FRAME_DT, rec); n++; }
    return n;
  }

  /* بصمة حالة — للحتمية (بلا مكتبات خارجية) */
  function hashState(balls) {
    var h = 2166136261;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      var nums = [b.x, b.y, b.vx, b.vy, b.status.length, b.phase];
      for (var k = 0; k < nums.length; k++) {
        var v = Math.round(nums[k] * 1e9);
        h ^= v & 0x7fffffff; h = Math.imul(h, 16777619);
        h ^= (v >>> 16); h = Math.imul(h, 16777619);
      }
    }
    return (h >>> 0).toString(16);
  }

  function powerToSpeed(p) {
    var q = Math.max(0, Math.min(100, p)) / 100;
    return 4 + 34 * Math.pow(q, 1.5);
  }

  /* موضع صالح لوضع الكرة البيضاء (كرة بيد) */
  function validPlace(table, balls, x, y) {
    var R = table.R;
    if (x < R || x > table.W - R || y < R || y > table.H - R) return false;
    for (var i = 0; i < table.pockets.length; i++) {
      var p = table.pockets[i], dx = x - p.x, dy = y - p.y;
      var rr = p.r + R;
      if (dx * dx + dy * dy < rr * rr) return false;
    }
    for (var j = 0; j < balls.length; j++) {
      var b = balls[j];
      if (b.status !== 'ON_TABLE' || b.type === 'CUE') continue;
      var ddx = b.x - x, ddy = b.y - y, rr2 = 2 * R;
      if (ddx * ddx + ddy * ddy < rr2 * rr2) return false;
    }
    return true;
  }

  /* شعاع التصويب: أول تماس (كرة أو وسادة) — للدليل البصري وذكاء الحاسوب */
  function castAim(table, balls, fromX, fromY, angle, maxDist) {
    var R = table.R, dx = Math.cos(angle), dy = Math.sin(angle);
    var best = { dist: maxDist || 2000, kind: 'none', id: null, x: fromX, y: fromY };
    var i, b, ox, oy, t, px, py;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.status !== 'ON_TABLE' || b.type === 'CUE') continue;
      ox = b.x - fromX; oy = b.y - fromY;
      var proj = ox * dx + oy * dy;
      if (proj <= 0) continue;
      var perp2 = (ox * ox + oy * oy) - proj * proj;
      var rr = 2 * R;
      if (perp2 > rr * rr) continue;
      t = proj - Math.sqrt(rr * rr - perp2);
      if (t > 0 && t < best.dist) {
        best = { dist: t, kind: 'ball', id: b.id, x: fromX + dx * t, y: fromY + dy * t };
      }
    }
    var cush = table.cushions;
    for (i = 0; i < cush.length; i++) {
      var s = cush[i];
      /* مسافة الشعاع إلى خط الوسادة (تقاطع مع الخط ثم فحص داخل القطعة) */
      var ex = s.x2 - s.x1, ey = s.y2 - s.y1;
      var den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      var qx = s.x1 - fromX, qy = s.y1 - fromY;
      var tt = (qx * ey - qy * ex) / den;
      var uu = (qx * dy - qy * dx) / den;
      if (tt > 0 && uu >= 0 && uu <= 1 && tt < best.dist) {
        best = { dist: tt, kind: 'rail', id: null, x: fromX + dx * tt, y: fromY + dy * tt };
      }
    }
    return best;
  }

  /* ══════════════════════════════════════════════════════════
     6) الواجهة العامة
     ══════════════════════════════════════════════════════════ */
  var BilliardsPhysics = {
    PHYSICS_VERSION: PHYSICS_VERSION, HZ: HZ, FRAME_DT: FRAME_DT, MAX_STEPS: MAX_STEPS,
    K: { FRICTION: FRICTION, DEC: DEC, STOP: STOP, REST: REST, CUSH_T: CUSH_T, BALL_E: BALL_E },
    TABLES: TABLES,
    table: function (id) { return TABLES[id] || null; },
    makeBall: makeBall, buildTable: buildTable,
    newRec: newRec, step: step, allStopped: allStopped,
    applyShot: applyShot, runUntilStopped: runUntilStopped,
    pocketAt: pocketAt, validPlace: validPlace, castAim: castAim,
    powerToSpeed: powerToSpeed, hashState: hashState,
    cushionsBeforeSecondContact: cushionsBeforeSecondContact
  };

  root.BilliardsPhysics = BilliardsPhysics;
  if (typeof module !== 'undefined' && module.exports) module.exports = BilliardsPhysics;
})(typeof window !== 'undefined' ? window : globalThis);

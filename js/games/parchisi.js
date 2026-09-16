/* ═══════════════════════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Parchisi Engine v2
   الأصناف: كلاسيك (نردان) / رابيدو (نرد + مؤقّت) / إسبانيول (دبل)
   القانون الأساسي المشترك (قوانين المستخدم):
   - كل خانة تستوعب بيدقاً أو بيدقين كأقصى حد (أي لونين)
   - 5 بنرد واحد أو بمجموع النردين = خروج تلقائي (يستهلكها) إن استوعبت خانة البدئ
   - الدبل = فك الاشتراك إجبارياً (بيدقان بخانة): زوج واحد يُفتح تلقائياً،
     وإن تعددت الخانات المشتركة فالاختيار للاعب وهو ملزم بأحدها
   - لا يمكن تجاوز بيدقين يتشاركا نفس الخانة (أي لونين)
   - الدبل = رمية نردين إضافية • 3 دبلات في نفس الدور = موت أبعد بيدق للرامي
   - كلاسيك: لا مشاركة خانة آمنة بين لونين • الخروج بـ5 على خانة بدئي
     يقتل الساكن المختلف • بيدقا خصم على خانة بدئي = يُمنع الخروج حتى تخلو
   - إسبانيول: مشاركة الخانات الآمنة بين الألوان (بيدقان) • الخروج بـ5
     يشارك الساكن المختلف بلا قتل • بيدقي+عدو بالبدء = قتله •
     بيدقان غيريّان (أي لونين) بالبدء = يُمنع الخروج حتى تخلو
   - رابيدو كما هو: نرد واحد، قطعة جاهزة، بلا تكتّل، خروج اختياري بـ5
   - أكل = +20 حركة مجانية بأي قطعة (بلا تسلسل) • وصول الميتا بنرد مضبوط = +10
   - الفرق 2v2: من يُنهي قطعه يواصل اللعب لصالح شريكه
   ═══════════════════════════════════════════════════════════ */
"use strict";

/* ── إعدادات الأصناف ── */
const PR_MODES = {
  /* safeShare: مشاركة الآمنات بين الألوان • autoExit: الخروج تلقائي بـ5
     breakOnDouble: الدبل يُلزم بفك الاشتراك • doubles: رمية إضافية • penalty3: 3 دبلات = أبعد بيدق يموت */
  classic: { dice: 2, safeShare: false, autoExit: true, breakOnDouble: true, doubles: true, penalty3: true, preDeploy: 0, timer: 0, labelKey: 'parchisi.modeClassic', descKey: 'parchisi.mClassicD' },
  rapido: { dice: 1, blockade: 'none', safeShare: true, autoExit: false, breakOnDouble: false, doubles: false, penalty3: false, preDeploy: 1, timer: 15, labelKey: 'parchisi.modeRapido', descKey: 'parchisi.mRapidoD' },
  spanish: { dice: 2, safeShare: true, autoExit: true, breakOnDouble: true, doubles: true, penalty3: true, preDeploy: 0, timer: 0, labelKey: 'parchisi.modeSpanish', descKey: 'parchisi.mSpanishD' }
};

/* ── الألوان (وثيقة التصميم) ── */
const PR_COLORS = {
  main: ['#F0442F', '#16C65A', '#FFD21A', '#08A9D5'],   /* أحمر / أخضر / أصفر / أزرق (كاللوحة المرجعية) */
  dark: ['#B92025', '#078C45', '#D89B00', '#0877AF'],
  wood: { frame: '#8B5537', frameDark: '#4C2A22', cell: '#F0CE98', cellDark: '#B98252', star: '#705044', ivory: '#FFF9E9', bg1: '#5a3a22', bg2: '#241206', gold: '#E8C15A', goldDeep: '#B8892E' },
  /* [B7] خلايا المسار: العادية بيضاء والآمنة (نجوم/رؤوس) رمادي فضي — الساليدات تبقى بلون اللاعب */
  track: { normal: '#FFFFFF', normalBorder: '#C9CED6', safe: '#C2C9D1', safeBorder: '#939DA9' }
};

/* ── هندسة اللوحة (وفق اللوحة المرجعية): خانات مستطيلة ──
   خلية عمودية 64×27.5 وأفقية 27.5×64؛ الذراع 3 أعمدة (192) × 8 صفوف (220)؛ المركز 140×140
   المسار 68 خانة عكس عقارب الساعة؛ الساليدات 5/22/39/56 والآمنات 12/17/29/34/46/51/63/68 */
const PR_CW = 64, PR_CH = 27.5;
const PR_OFF = [4, 21, 38, 55];                     /* ساليدة كل مقعد (خانات 5/22/39/56) */
const PR_STARS = [11, 28, 45, 62];                  /* نجوم آمنة (خانات 12/29/46/63) */
const PR_HEADS = [67, 16, 33, 50];                  /* رؤوس الأذرع (خانات 68/17/34/51) = مداخل الممرات */
const PR_SAFE = PR_OFF.concat(PR_STARS, PR_HEADS);  /* الساليدات + النجوم + الرؤوس = آمن */
const PR_TRACK = [];                                 /* 68 خانة مستطيلة (عكس عقارب الساعة) */
(function () {
  const V = (x, y) => ({ x: x, y: y, w: PR_CW, h: PR_CH });
  const H = (x, y) => ({ x: x, y: y, w: PR_CH, h: PR_CW });
  for (let i = 0; i < 8; i++) PR_TRACK.push(V(204, 10 + PR_CH * i));       /* 0-7   أعلى·يسار نزولاً */
  for (let i = 0; i < 8; i++) PR_TRACK.push(H(202.5 - PR_CH * i, 204));    /* 8-15  يسار·أعلى للخارج */
  PR_TRACK.push(H(10, 268));                                               /* 16    رأس اليسرى */
  for (let i = 0; i < 8; i++) PR_TRACK.push(H(10 + PR_CH * i, 332));       /* 17-24 يسار·أسفل للداخل */
  for (let i = 0; i < 8; i++) PR_TRACK.push(V(204, 370 + PR_CH * i));      /* 25-32 أسفل·يسار نزولاً */
  PR_TRACK.push(V(268, 562.5));                                            /* 33    رأس السفلية */
  for (let i = 0; i < 8; i++) PR_TRACK.push(V(332, 562.5 - PR_CH * i));    /* 34-41 أسفل·يمين صعوداً */
  for (let i = 0; i < 8; i++) PR_TRACK.push(H(370 + PR_CH * i, 332));      /* 42-49 يمين·أسفل للخارج */
  PR_TRACK.push(H(562.5, 268));                                            /* 50    رأس اليمنى */
  for (let i = 0; i < 8; i++) PR_TRACK.push(H(562.5 - PR_CH * i, 204));    /* 51-58 يمين·أعلى للداخل */
  for (let i = 0; i < 8; i++) PR_TRACK.push(V(332, 202.5 - PR_CH * i));    /* 59-66 أعلى·يمين صعوداً */
  PR_TRACK.push(V(268, 10));                                               /* 67    رأس العلوية */
})();
/* ممرات الوصول: 7 خانات لكل مقعد من بعد رأس ذراعه نحو المركز (ثم الميتا بالمثلث) */
const PR_CORRIDOR = [
  Array.from({ length: 7 }, (_, i) => ({ x: 268, y: 37.5 + PR_CH * i, w: PR_CW, h: PR_CH })), /* 0 أحمر: العلوية نزولاً */
  Array.from({ length: 7 }, (_, i) => ({ x: 37.5 + PR_CH * i, y: 268, w: PR_CH, h: PR_CW })), /* 1 أخضر: اليسرى يميناً */
  Array.from({ length: 7 }, (_, i) => ({ x: 268, y: 535 - PR_CH * i, w: PR_CW, h: PR_CH })),  /* 2 أصفر: السفلية صعوداً */
  Array.from({ length: 7 }, (_, i) => ({ x: 535 - PR_CH * i, y: 268, w: PR_CH, h: PR_CW }))   /* 3 أزرق: اليمنى يساراً */
];
/* أعشاش الانتظار: ربع دوائر بزوايا اللوحة + فتحات القطع الأربع */
const PR_NEST = [
  { cx: 204, cy: 204, a0: Math.PI, a1: Math.PI * 1.5, nx: 117, ny: 117 },       /* 0 أحمر: أعلى اليسار */
  { cx: 204, cy: 396, a0: Math.PI * 0.5, a1: Math.PI, nx: 117, ny: 483 },       /* 1 أخضر: أسفل اليسار */
  { cx: 396, cy: 396, a0: 0, a1: Math.PI * 0.5, nx: 483, ny: 483 },             /* 2 أصفر: أسفل اليمين */
  { cx: 396, cy: 204, a0: Math.PI * 1.5, a1: Math.PI * 2, nx: 483, ny: 117 }    /* 3 أزرق: أعلى اليمين */
];
const PR_NEST_R = 192;
const PR_BASE = [
  [[84, 84], [150, 84], [84, 150], [150, 150]],
  [[84, 446], [150, 446], [84, 522], [150, 522]],
  [[446, 446], [522, 446], [446, 522], [522, 522]],
  [[446, 84], [522, 84], [446, 150], [522, 150]]
];
/* قصّات الزوايا الداخلية حيث تلتقي الأذرع */
const PR_CHAMFER = [[204, 204, 230, 230], [396, 204, 370, 230], [204, 396, 230, 370], [396, 396, 370, 370]];

/* ═══════════ المحرك ═══════════ */
class ParchisiEngine {
  constructor(pc, types, diff, modeKey, opts) {
    opts = opts || {};
    this.modeKey = modeKey || 'classic';
    this.mode = PR_MODES[this.modeKey] || PR_MODES.classic;
    /* مؤقت الدور: قابل للاختيار من الإعدادات (محلياً)، وإلا افتراضي النمط */
    this.timer = (opts && typeof opts.timer === 'number') ? opts.timer : (this.mode.timer || 0);
    this.playerCount = pc;
    this.difficulty = diff || 'medium';
    this.teams = !!opts.teams && pc === 4;
    /* المقاعد: لاعبان = متقابلان */
    this.seats = pc === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, pc);
    this.players = [];
    for (let i = 0; i < pc; i++) {
      const pieces = [];
      for (let k = 0; k < 4; k++) pieces.push({ id: k, owner: i, state: 'home', pos: -1 });
      this.players.push({ id: i, type: types[i], pieces: pieces });
    }
    /* رابيدو: قطعة جاهزة خارج القاعدة عند البداية */
    if (this.mode.preDeploy) {
      for (const pl of this.players) { pl.pieces[0].state = 'onboard'; pl.pieces[0].pos = 0; }
    }
    this.current = 0;
    this.dice = [];
    this.used = [];
    this.phase = 'WAIT_ROLL';
    this.bonus = null;        /* {dist, kind, excludeOwner?, excludeId?} */
    this.bonusLegal = [];
    this.doublesStreak = 0;
    this.lastMoved = [];
    for (let i = 0; i < pc; i++) this.lastMoved.push(null);
    this.mustBreak = false;
    this._noReform = null;      /* بعد فك حائط بالدبل: يُمنع رفيقه من مشاركته خانته الجديدة بنفس الرمية */
    this.rollLog = [];          /* آخر خمس رميات لكل لاعب (للسجل المنسدل) */
    this.gameOver = false;
    this.winner = null;
    this.winnerTeam = null;
    this.lastCapture = null;
    this.boardRotation = 0;     /* [Rotate] عدد التدويرات عكس عقارب الساعة (0..3) */
    this.notices = [];
    this.rollCount = [];                              /* [B7] عدّاد رميات تصاعدي لكل لاعب */
    this.onStateChange = null;
  }

  startGame() {
    this.phase = 'WAIT_ROLL';
    this.current = 0;
    this.dice = [];
    this.used = [];
    if (this.onStateChange) this.onStateChange();
  }

  /* [Rotate] تدوير اللوحة عكس عقارب الساعة — اللاعبون يبقون في مناطقهم
     (الأحمر يبقى أحمر ومعه قطعه) لكن الزوايا تتحرك: الأحمر يأخذ مكان الأخضر،
     الأخضر مكان الأصفر، الأصفر مكان الأزرق، الأزرق مكان الأحمر. */
  rotateBoard() {
    if (this.gameOver) return false;
    this.boardRotation = ((this.boardRotation || 0) + 1) % 4;
    /* مسح قيود تعتمد على خانات عالمية محددة (مثل _noReform) لأن الهندسة تغيّرت */
    this._noReform = null;
    this.mustBreak = false;
    return true;
  }

  /* ── أدوات هندسية ── */
  toGlobal(pid, rel) {
    return (PR_OFF[this.seats[pid]] + rel) % 68;
  }
  partnerOf(pid) { return (pid + 2) % 4; }
  teamOf(pid) { return this.teams ? pid % 2 : pid; }
  /* القطع المتحكَّم بها: قطعي، أو قطع شريكي إذا أنهيت قطعي الأربع (فرق) */
  controlledPieces(pid) {
    const own = this.players[pid].pieces;
    if (this.teams && own.every(p => p.state === 'finished')) {
      return this.players[this.partnerOf(pid)].pieces;
    }
    return own;
  }

  roll() {
    const d = [];
    for (let i = 0; i < this.mode.dice; i++) d.push(Math.floor(Math.random() * 6) + 1);
    this.applyRoll(d);
  }

  /* ── تطبيق نرد حرفي (غرف MP) ── */
  applyRoll(diceArr) {
    if (this.gameOver || this.phase !== 'WAIT_ROLL' || !diceArr || !diceArr.length) return;
    if (typeof SND !== 'undefined') { try { (SND.prDice || SND.dice)(); } catch (e) {} }   /* [PR-SND] */
    this.dice = diceArr.slice(0, this.mode.dice).map(d => Math.max(1, Math.min(6, d | 0)));
    this.used = this.dice.map(() => false);
    /* [Gift-priority] لا نمسح الهدية المعلّقة من دور سابق — ستُلعَب قبل النرد. */
    this._noReform = null;
    /* سجل الرميات: آخر خمس رميات لكل لاعب */
    if (!this.rollLog[this.current]) this.rollLog[this.current] = [];
    this.rollLog[this.current].push(this.dice.slice());
    if (this.rollLog[this.current].length > 5) this.rollLog[this.current].shift();
    /* [B7] عدّاد تصاعدي (لا يُقصّ) — تكشف واجهته الرمية الإضافية بنردين متشابهين */
    this.rollCount[this.current] = (this.rollCount[this.current] || 0) + 1;
    const p = this.players[this.current];
    const isDouble = this.mode.dice === 2 && this.dice.length === 2 && this.dice[0] === this.dice[1];
    if (isDouble) this.doublesStreak++; else this.doublesStreak = 0;

    /* 3 دبلات في نفس الدور = موت البيدق الذي قطع أكبر مسافة للرامي */
    if (isDouble && this.mode.penalty3 && this.doublesStreak >= 3) {
      this.doublesStreak = 0;
      let far = null;
      for (const fpc of p.pieces) {
        /* [B10] القطع داخل منطقة اللاعب الآمنة (ممره الملوّن 64..70) معفاة من
           عقوبة 3 متشابهات — لا تُرجَع أبداً. تُزال فقط القطع خارج المنطقة الآمنة،
           وأبعدها (أكبر pos) أي الأقرب للممر الآمن. المربّع الرمادي الآمن على
           المسار (pos < 64) ليس من منطقة اللاعب الآمنة فيظل قابلاً للإزالة. */
        if (fpc.state === 'onboard' && fpc.pos < 64 && (!far || fpc.pos > far.pos)) far = fpc;
      }
      let applied = false;
      if (far) {
        far.state = 'home'; far.pos = -1;
        applied = true;
      }
      this.notices.push({ key: 'parchisi.threeDoubles', pid: p.id, ok: applied });
      this.phase = 'WAIT_ROLL';
      this.dice = []; this.used = [];
      this._passTurn();
      if (this.onStateChange) this.onStateChange();
      return;
    }

    /* [B8] لقطة ما قبل الخروج التلقائي: إلزام الفتح بالدبل لا يسري إلا على
       اشتراكٍ وُجد قبل الرمية — الزوج المتكوّن بالخروج أثناء نفس الرمية (مثال:
       بيدق على الساليدة + دبل 5 يدخل رفيقه) لا يُلزم بالفتح */
    const sharedBeforeRoll = this.sharedCellExists(p.id);

    /* الخروج التلقائي بالخمسة: نرد 5 أو مجموع النردين 5 — إن استوعبت خانة البدئ */
    let autoExits = 0;
    if (this.mode.autoExit) {
      const srcs = [];
      if (this.dice[0] === 5) srcs.push([0]);
      if (this.dice.length > 1 && this.dice[1] === 5) srcs.push([1]);
      if (this.dice.length > 1 && this.dice[0] + this.dice[1] === 5) srcs.push([0, 1]);
      for (const src of srcs) {
        const home = this.controlledPieces(p.id).filter(x => x.state === 'home');
        if (!home.length) break;
        if (!this._tryDeploy(home[0])) break;      /* خانة البدئ لا تستوعبه */
        src.forEach(i => { this.used[i] = true; }); /* الخروج يستهلك الخمسة */
        autoExits++;
      }
      if (autoExits) this.notices.push({ key: 'parchisi.autoExit', pid: p.id, n: autoExits });
    }

    /* الدبل = فك أي خانة مشتركة إجبارياً: زوج من نفس اللون أو مشاركة مع خصم على خانة آمنة —
       [B8] بشرط وجود الاشتراك قبل الرمية (لا ما تكوّن بخروج الدبل نفسه) */
    this.mustBreak = !!(isDouble && this.mode.breakOnDouble && this.used.some(u => !u) && sharedBeforeRoll);
    if (this.mustBreak) this.notices.push({ key: 'parchisi.mustBreak', pid: p.id });

    /* [Gift-priority] هدية القتل/الوصول المعلّقة من دور سابق لها الأولوية على النرد:
       تُلعَب الهدية أولاً (طور BONUS)، وبعد انتهائها تعود اللعبة إلى طور MOVING
       لتُستهلَك بقية قيم النرد. إن لم يكن للهدية خانة قانونية تُلغى وتُكمَل الرمية بالنرد. */
    if (this.bonus && this._setupBonus()) {
      if (this.onStateChange) this.onStateChange();
      return;
    }

    this.phase = 'MOVING';
    if (!this.hasAnyOption()) {
      if (this.mustBreak) {
        this.notices.push({ key: 'parchisi.couldNotBreak', pid: p.id });
      } else if (autoExits === 0 || this.used.some(u => !u)) {
        this.notices.push({ key: 'parchisi.nomove', pid: p.id });
      }
      this.mustBreak = false;
      this.phase = 'WAIT_ROLL';
      this.dice = []; this.used = [];
      if (isDouble && this.mode.doubles) {
        /* دبل غير قابل للعب = رمية إضافية (حتى تنتهي بـ3) */
        this.notices.push({ key: 'parchisi.doubles', pid: p.id });
        if (this.onStateChange) this.onStateChange();
        return;
      }
      /* [B6] مكافأة معلّقة (قتل الخروج بالـ5) تُلعب قبل تسليم الدور */
      if (this._setupBonus()) {
        if (this.onStateChange) this.onStateChange();
        return;
      }
      this._passTurn();
      if (this.onStateChange) this.onStateChange();
      return;
    }
    /* حركة إلزامية بلا بديل — تُنفّذ تلقائياً */
    this._autoForced();
    if (this.onStateChange) this.onStateChange();
  }

  /* ── الحركة الإلزامية: خيار وحيد لا محيد عنه يُنفّذ تلقائياً ── */
  _autoForced() {
    if (this.gameOver || this.phase !== 'MOVING') return;
    const seen = new Set();
    let only = null;
    for (const o of this.availableValues()) {
      for (const pc of this.optionsFor(o.v)) {
        const k = pc.owner + ':' + pc.id + ':' + o.v;
        if (seen.has(k)) continue;
        seen.add(k);
        if (seen.size > 1) return;          /* بديل موجود — الاختيار للاعب */
        only = { piece: pc, value: o.v };
      }
    }
    if (only) this.applyMove(only.piece.id, only.value, only.piece.owner);
  }

  /* ── خيار عشوائي (انتهاء المؤقت): بلا استراتيجية ولا ذكاء ── */
  randomOption() {
    if (this.phase === 'BONUS') {
      if (!this.bonusLegal.length) return null;
      const bp = this.bonusLegal[Math.floor(Math.random() * this.bonusLegal.length)];
      return { piece: bp, value: this.bonus.dist };
    }
    if (this.phase !== 'MOVING') return null;
    const list = [];
    const seen = new Set();
    for (const o of this.availableValues()) {
      for (const pc of this.optionsFor(o.v)) {
        const k = pc.owner + ':' + pc.id + ':' + o.v;
        if (seen.has(k)) continue;
        seen.add(k);
        list.push({ piece: pc, value: o.v });
      }
    }
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  /* القيم المتاحة: نرد1 / نرد2 / المجموع */
  availableValues() {
    const out = [];
    if (this.phase !== 'MOVING' || !this.dice.length) return out;
    if (!this.used[0]) out.push({ v: this.dice[0], src: 0 });
    if (this.dice.length > 1 && !this.used[1]) out.push({ v: this.dice[1], src: 1 });
    if (this.dice.length > 1 && !this.used[0] && !this.used[1]) out.push({ v: this.dice[0] + this.dice[1], src: 'sum' });
    return out;
  }

  hasAnyOption() {
    const vals = this.availableValues();
    for (let i = 0; i < vals.length; i++) {
      if (this.optionsFor(vals[i].v).length) return true;
    }
    return false;
  }

  /* القطع القابلة للتحريك بقيمة معيّنة */
  optionsFor(v) {
    if (this.phase !== 'MOVING') return [];
    const pid = this.current;
    const list = [];
    const ctrl = this.controlledPieces(pid);
    for (let i = 0; i < ctrl.length; i++) {
      const pc = ctrl[i];
      if (pc.state === 'home') {
        if (!this.mode.autoExit && v === 5 && this.canDeploy(pc)) list.push(pc);   /* رابيدو فقط */
      } else if (pc.state === 'onboard') {
        if (this.canMoveDist(pc, v)) list.push(pc);
      }
    }
    if (this.mustBreak) {
      /* قبل فك الخانة المشتركة لا تُحرَّك قطع أخرى */
      return list.filter(pc => pc.owner === pid && pc.state === 'onboard' && this.isInSharedCell(pc));
    }
    return list;
  }

  canDeploy(piece) {
    if (piece.state !== 'home') return false;
    const po = piece.owner;
    const g = this.toGlobal(po, 0);
    let own = 0;
    for (const pc of this.players[po].pieces) {
      if (pc.state === 'onboard' && pc.pos < 64 && this.toGlobal(po, pc.pos) === g) own++;
    }
    if (this.mode.blockade === 'none') return own === 0;  /* رابيدو: لا تكتّل أبداً */
    return own < 2;                                        /* حد قطعتين بالساليدة */
  }

  /* ── الخروج التلقائي على خانة البدئ (وفق قواعد النمط) ── */
  _tryDeploy(piece) {
    const po = piece.owner;
    const g = this.toGlobal(po, 0);
    let own = 0;
    const enemies = [];
    for (const pl of this.players) {
      for (const pc of pl.pieces) {
        if (pc.state !== 'onboard' || pc.pos >= 64) continue;
        if (this.toGlobal(pc.owner, pc.pos) !== g) continue;
        if (pc.owner === po) own++; else enemies.push(pc);
      }
    }
    /* امتلأت بقطعي أو بيدقا خصم يسكنانها = لا خروج حتى تخلو */
    if (own >= 2 || enemies.length >= 2) return false;
    if (enemies.length === 1 && !(this.mode.safeShare && own === 0)) {
      /* كلاسيك: اقتل الساكن المختلف • إسبانيول: أقتله فقط إن كانت الخانة يشاركها بيدقي */
      enemies[0].state = 'home';
      enemies[0].pos = -1;
      this.lastCapture = { victim: enemies[0].owner, by: po, at: g };
      this.notices.push({ key: 'parchisi.capture', pid: enemies[0].owner });
      /* [B6] قتل خانة البدئ عند الخروج = مكافأة 20 مثل أي قتل عادي (كلاسيك وإسبانيول) */
      this.bonus = { dist: 20, kind: 20 };
    }
    /* إسبانيول بلا قطع لي بالخانة: مشاركة بلا قتل */
    piece.state = 'onboard';
    piece.pos = 0;
    this.lastMoved[this.current] = piece;
    return true;
  }

  canMoveDist(piece, dist) {
    if (piece.state !== 'onboard') return false;
    const po = piece.owner;
    const target = piece.pos + dist;
    /* بعد فك حائط بالدبل: لا يعيد الرفيق مشاركة نفس البيادق بنفس الرمية */
    if (this._noReform && piece.owner === this._noReform.owner && piece.id === this._noReform.pieceId) {
      if (target < 64 && this.toGlobal(po, target) === this._noReform.g) return false;
    }
    if (target > 71) return false;             /* الميتا بنرد مضبوط */
    for (let s = 1; s < dist; s++) {
      const c = piece.pos + s;
      if (c < 64 && this.barrierAt(this.toGlobal(po, c))) return false;  /* لا مرور فوق حاجز */
    }
    if (target === 71) return true;
    return this.canLand(po, target);
  }

  canLand(po, targetRel) {
    if (targetRel >= 64) {
      /* الخانات السبع الأخيرة (منطقة اللاعب الآمنة): سعة 4 بيادق ولا يقفل الطريق */
      let own = 0;
      for (const pc of this.players[po].pieces) {
        if (pc.state === 'onboard' && pc.pos === targetRel) own++;
      }
      return own < 4;
    }
    const g = this.toGlobal(po, targetRel);
    let own = 0;
    const opps = [];
    for (const pl of this.players) {
      for (const pc of pl.pieces) {
        if (pc.state !== 'onboard' || pc.pos >= 64) continue;
        if (this.toGlobal(pc.owner, pc.pos) !== g) continue;
        if (pc.owner === po) own++; else opps.push(pc);
      }
    }
    if (PR_SAFE.indexOf(g) !== -1) {
      /* الخانة الآمنة: لا أكل أبداً */
      if (this.mode.blockade === 'none') return own === 0;        /* رابيدو كما هو */
      if (opps.length && !this.mode.safeShare) return false;      /* كلاسيك: لا مشاركة آمنة بين لونين */
      return (own + opps.length) < 2;                             /* سعة بيدقين */
    }
    if (opps.length >= 2) return false;        /* حاجز خصم لا يُكسر */
    if (this.mode.blockade === 'none') return own === 0;
    return own < 2;                            /* قطعتان لي = حصار */
  }

  barrierAt(g) {
    /* أي بيدقين يتشاركان نفس الخانة = حاجز يمنع المرور (ولو لونين مختلفين) */
    let n = 0;
    for (const pl of this.players) {
      for (const pc of pl.pieces) {
        if (pc.state === 'onboard' && pc.pos < 64 && this.toGlobal(pl.id, pc.pos) === g) {
          n++;
          if (n >= 2) return true;
        }
      }
    }
    return false;
  }

  ownBarrierExists(pid) {
    const cells = {};
    for (const pc of this.players[pid].pieces) {
      if (pc.state === 'onboard' && pc.pos < 64) {
        const g = this.toGlobal(pid, pc.pos);
        cells[g] = (cells[g] || 0) + 1;
      }
    }
    return Object.keys(cells).some(k => cells[k] >= 2);
  }

  isInOwnBarrier(piece) {
    if (piece.state !== 'onboard' || piece.pos >= 64) return false;
    const g = this.toGlobal(piece.owner, piece.pos);
    return this.players[piece.owner].pieces.some(pc =>
      pc !== piece && pc.state === 'onboard' && pc.pos < 64 && this.toGlobal(pc.owner, pc.pos) === g);
  }

  /* داخل خانة يتشاركها بيدقان — من أي لونين (زوج خاص أو مشاركة مع خصم) */
  isInSharedCell(piece) {
    if (piece.state !== 'onboard' || piece.pos >= 64) return false;
    const g = this.toGlobal(piece.owner, piece.pos);
    for (const pl of this.players) {
      for (const pc of pl.pieces) {
        if (pc === piece || pc.state !== 'onboard' || pc.pos >= 64) continue;
        if (this.toGlobal(pc.owner, pc.pos) === g) return true;
      }
    }
    return false;
  }

  sharedCellExists(pid) {
    return this.players[pid].pieces.some(pc => this.isInSharedCell(pc));
  }

  /* ── تنفيذ حركة ── */
  applyMove(pieceId, value, owner) {
    if (this.gameOver) return false;
    const pid = this.current;
    const po = (typeof owner === 'number') ? owner : pid;
    if (!this.players[po]) return false;
    const piece = this.players[po].pieces.find(x => x.id === pieceId);
    if (!piece) return false;

    if (this.phase === 'BONUS') {
      if (!this.bonusLegal.includes(piece)) return false;
      const dist = this.bonus.dist;
      const wasBarrier = piece.owner === pid && this.isInOwnBarrier(piece);
      this.bonus = null;
      this.bonusLegal = [];
      this._execMove(piece, dist, true, wasBarrier);
      this._afterMove();
      return true;
    }
    if (this.phase !== 'MOVING') return false;
    const av = this.availableValues();
    if (!av.some(o => o.v === value)) return false;
    if (!this.optionsFor(value).includes(piece)) return false;
    /* استهلاك النرد */
    if (this.dice.length === 2 && !this.used[0] && !this.used[1] && value === this.dice[0] + this.dice[1]) {
      this.used[0] = true; this.used[1] = true;
    } else if (!this.used[0] && this.dice[0] === value) {
      this.used[0] = true;
    } else if (this.dice.length > 1 && !this.used[1] && this.dice[1] === value) {
      this.used[1] = true;
    } else {
      return false;
    }
    const wasBarrier = piece.owner === pid && this.isInSharedCell(piece);
    /* فك حائطي (بيدقان لي) بدبل = يُمنع رفيقه من مشاركة خانته الجديدة بنفس الرمية */
    const ownPair = piece.owner === pid && this.isInOwnBarrier(piece);
    const isDoubleRoll = this.dice.length === 2 && this.dice[0] === this.dice[1];
    const originG = (ownPair && isDoubleRoll && piece.state === 'onboard' && piece.pos < 64)
      ? this.toGlobal(piece.owner, piece.pos) : null;
    this._execMove(piece, value, false, wasBarrier);
    if (originG !== null && piece.state === 'onboard' && piece.pos < 64) {
      const partner = this.players[pid].pieces.find(q =>
        q !== piece && q.state === 'onboard' && q.pos < 64 && this.toGlobal(q.owner, q.pos) === originG);
      if (partner) this._noReform = { pieceId: partner.id, owner: pid, g: this.toGlobal(pid, piece.pos) };
    }
    this._afterMove();
    return true;
  }

  _execMove(piece, dist, isBonus, wasBarrier) {
    if (wasBarrier) this.mustBreak = false;
    this.lastMoved[this.current] = piece;
    if (piece.state === 'home') {
      /* خروج على الساليدة (آمنة — لا أكل عليها إطلاقاً) */
      piece.state = 'onboard';
      piece.pos = 0;
      return;
    }
    if (piece.state !== 'onboard') return;
    const target = piece.pos + dist;
    if (target >= 71) {
      piece.state = 'finished';
      piece.pos = 71;
      /* [B10] هدية الوصول: +10 ببيدق آخر — دائماً، سواء أُكمِلت بالنرد العادي
         أو بطلعة الهدية نفسها (إتمام الدورة بالهدية يمنح هدية أخرى).
         الإشعار يُعرض في كل إكمال (عادي أو هدية) ليُرى اللاعب المِنحة دائماً. */
      this.notices.push({ key: 'parchisi.entry10', pid: this.current });
      this.bonus = { dist: 10, kind: 10, excludeOwner: piece.owner, excludeId: piece.id };
      return;
    }
    piece.pos = target;
    if (target < 64) {
      const capped = this._captureAt(piece.owner, target);
      /* القتل = حركة 20 دوماً — وإن نتج عنها قتل آخر تُضاف 20 أخرى حتى ما لا نهاية،
         والهدية 10 التي تقتل تصبح 20 مثل القتل العادي */
      if (capped) this.bonus = { dist: 20, kind: 20 };
    }
  }

  _captureAt(ownerIdx, targetRel) {
    if (targetRel >= 64) return false;
    const g = this.toGlobal(ownerIdx, targetRel);
    if (PR_SAFE.indexOf(g) !== -1) return false;
    const victims = [];
    for (const pl of this.players) {
      for (const op of pl.pieces) {
        if (op.owner === ownerIdx) continue;
        if (op.state !== 'onboard' || op.pos >= 64) continue;
        if (this.toGlobal(op.owner, op.pos) === g) victims.push(op);
      }
    }
    if (victims.length === 1) {
      victims[0].state = 'home';
      victims[0].pos = -1;
      this.lastCapture = { victim: victims[0].owner, by: ownerIdx, at: g };
      this.notices.push({ key: 'parchisi.capture', pid: victims[0].owner });
      return true;
    }
    return false;
  }

  /* ── [B6] تفعيل مكافأة معلّقة (20 قتل / 10 وصول): طور BONUS أو تُفقد ── */
  _setupBonus() {
    if (!this.bonus) return false;
    this.phase = 'BONUS';
    const pid = this.current;
    const ctrl = this.controlledPieces(pid);
    this.bonusLegal = ctrl.filter(pc =>
      pc.state === 'onboard' &&
      !(pc.owner === this.bonus.excludeOwner && pc.id === this.bonus.excludeId) &&
      this.canMoveDist(pc, this.bonus.dist));
    if (this.bonusLegal.length > 0) {
      if (this.bonusLegal.length === 1) {
        /* مكافأة بلا بديل — تُنفّذ تلقائياً */
        const bp = this.bonusLegal[0];
        this.applyMove(bp.id, this.bonus.dist, bp.owner);
      }
      return true;
    }
    this.notices.push({ key: 'parchisi.bonusLost', pid: pid });
    this.bonus = null;
    this.bonusLegal = [];
    return false;
  }

  _afterMove() {
    if (this.checkWin()) {
      this.phase = 'OVER';
      if (this.onStateChange) this.onStateChange();
      return;
    }
    /* خروج تلقائي مؤجّل: كل 5 غير مستهلَكة تُنفّذ فور اتساع خانة البدئ أثناء الدور */
    if (this.mode.autoExit && this.used.some(u => !u)) {
      for (let i = 0; i < this.dice.length; i++) {
        if (this.used[i] || this.dice[i] !== 5) continue;
        const home = this.controlledPieces(this.current).filter(x => x.state === 'home');
        if (!home.length) break;
        if (!this._tryDeploy(home[0])) break;
        this.used[i] = true;
        this.notices.push({ key: 'parchisi.autoExit', pid: this.current });
      }
    }
    if (this._setupBonus()) {
      if (this.onStateChange) this.onStateChange();
      return;
    }
    if (this.used.some(u => !u)) {
      this.phase = 'MOVING';
      if (this.hasAnyOption()) {
        /* حركة إلزامية وحيدة بعد كل حركة — تُنفّذ تلقائياً */
        this._autoForced();
        if (this.onStateChange) this.onStateChange();
        return;
      }
      /* النرد المتبقّي غير قابل للعب — يضيع */
    }
    this._endTurn();
    if (this.onStateChange) this.onStateChange();
  }

  _endTurn() {
    const isDouble = this.mode.dice === 2 && this.dice.length === 2 && this.dice[0] === this.dice[1];
    this._noReform = null;
    this.phase = 'WAIT_ROLL';
    this.dice = [];
    this.used = [];
    /* [Gift-priority] لا نمسح الهدية المعلّقة — إذا بقيت هدية غير قابلة للعب
       في الدور الحالي، تبقى في الانتظار حتى الرمية التالية وتُلعَب قبل النرد. */
    this.mustBreak = false;
    if (isDouble && this.mode.doubles && this.doublesStreak > 0 && this.doublesStreak < 3) {
      /* إسبانيول: الدبل يمنح رمية إضافية لنفس اللاعب */
      this.notices.push({ key: 'parchisi.doubles', pid: this.current });
      return;
    }
    this.doublesStreak = 0;
    this.current = (this.current + 1) % this.playerCount;
  }

  _passTurn() {
    this._noReform = null;
    this.phase = 'WAIT_ROLL';
    this.dice = [];
    this.used = [];
    /* [Gift-priority] نفس القاعدة — الهدية المعلّقة تبقى للدور التالي. */
    this.mustBreak = false;
    this.doublesStreak = 0;
    this.current = (this.current + 1) % this.playerCount;
  }

  forcePass() {
    if (this.gameOver) return;
    /* [Gift-priority] إذا كان اللاعب يتخلّى عن هدية معلّقة، تُلغى فوراً —
       التمرير القسري أثناء طور BONUS يعني تنازل اللاعب عن حقه في الهدية. */
    if (this.phase === 'BONUS') {
      this.bonus = null;
      this.bonusLegal = [];
    }
    this._passTurn();
    if (this.onStateChange) this.onStateChange();
  }

  checkWin() {
    if (this.gameOver) return true;
    if (this.teams) {
      for (let t = 0; t < 2; t++) {
        const done = [0, 1, 2, 3].filter(i => i % 2 === t).every(i =>
          this.players[i].pieces.every(pc => pc.state === 'finished'));
        if (done) {
          this.gameOver = true;
          this.winnerTeam = t;
          this.winner = null;
          return true;
        }
      }
    } else {
      for (let i = 0; i < this.playerCount; i++) {
        if (this.players[i].pieces.every(pc => pc.state === 'finished')) {
          this.gameOver = true;
          this.winner = i;
          this.winnerTeam = null;
          return true;
        }
      }
    }
    return false;
  }

  /* ── ذكاء اصطناعي: تقييم استراتيجي عادل 100% قانونياً ── */
  aiPickOption() {
    const pid = this.current;
    if (this.phase === 'BONUS') {
      if (!this.bonusLegal.length) return null;
      const list = this.bonusLegal.map(pc => ({ piece: pc, value: this.bonus.dist, score: this._scoreMove(pc, this.bonus.dist) }));
      return this._pick(list);
    }
    if (this.phase !== 'MOVING') return null;
    const list = [];
    for (const o of this.availableValues()) {
      for (const pc of this.optionsFor(o.v)) {
        list.push({ piece: pc, value: o.v, score: this._scoreMove(pc, o.v) });
      }
    }
    if (!list.length) return null;
    return this._pick(list);
  }

  _pick(list) {
    /* خبير دائماً: 0% خطأ — يختار أفضل خيار قانوني؛
       ونرديه عشوائية تماماً كالبشر (رميات عادلة) */
    let best = list[0];
    for (const it of list) if (it.score > best.score) best = it;
    return best;
  }

  _scoreMove(piece, dist) {
    let s = 0;
    const po = piece.owner;
    if (piece.state === 'home') {
      s += 55;
      const out = this.players[po].pieces.filter(pc => pc.state !== 'home').length;
      if (out < 2) s += 25;
      return s;
    }
    const target = piece.pos + dist;
    if (target === 71) return 95;
    if (target < 64) {
      const g = this.toGlobal(po, target);
      let opp = 0, oppPos = 0;
      for (const pl of this.players) {
        for (const pc of pl.pieces) {
          if (pc.owner === po || pc.state !== 'onboard' || pc.pos >= 64) continue;
          if (this.toGlobal(pc.owner, pc.pos) === g) { opp++; oppPos = pc.pos; }
        }
      }
      if (opp === 1) s += 110 + oppPos * 0.4;              /* أكل */
      if (PR_SAFE.indexOf(g) !== -1) s += 22;              /* هبوط آمن */
      let own = 0;
      for (const pc of this.players[po].pieces) {
        if (pc !== piece && pc.state === 'onboard' && pc.pos < 64 && this.toGlobal(po, pc.pos) === g) own++;
      }
      if (own === 1) s += 18;                              /* تشكيل حصار */
      /* [خبير] احتلال خانة خروجنا يخنق دخول الخصوم ما دامت لهم قطع بالعش */
      if (g === this.toGlobal(po, 0)) {
        let foesHome = 0;
        for (const pl of this.players) {
          if (pl.id === po) continue;
          foesHome += pl.pieces.filter(pc => pc.state === 'home').length;
        }
        if (foesHome > 0) s += 8;
      }
    } else {
      s += 8;                                              /* تقدّم بالممر */
    }
    /* [خبير] تعريض ما بعد الحركة: كل قطعي على المسار — كم مهاجماً خلفها
       وما ثمن فقدانها؟ (بديل أدقّ من خطر الوجهة وحدها) */
    s -= this._exposureAfter(piece, dist);
    if (piece.pos < 64) s += this._dangerAt(po, this.toGlobal(po, piece.pos)) * 10;  /* هروب من خطر */
    s += target * 0.12;
    if (this.isInOwnBarrier(piece)) s -= 10;               /* فضّ حصاري */
    return s;
  }

  /* [خبير] مجموع الأخطار على قطعي بعد تنفيذ الحركة — مرجّحاً بتقدّم كل قطعة؛
     الخلايا الآمنة والحواجز الخاصة (قطعتان لي) معفاة */
  _exposureAfter(moved, dist) {
    const po = moved.owner;
    const dest = (moved.state === 'onboard') ? moved.pos + dist : -1;
    if (dest >= 64) return 0;
    let ex = 0;
    for (const pc of this.players[po].pieces) {
      if (pc.state !== 'onboard' || pc.pos >= 64) continue;
      const pp = (pc === moved) ? dest : pc.pos;
      if (pp < 0 || pp >= 64) continue;
      const g = this.toGlobal(po, pp);
      if (PR_SAFE.indexOf(g) !== -1) continue;
      let ownOn = 0;
      for (const q of this.players[po].pieces) {
        if (q.state !== 'onboard' || q.pos >= 64) continue;
        const qp = (q === moved) ? dest : q.pos;
        if (qp >= 0 && qp < 64 && this.toGlobal(po, qp) === g) ownOn++;
      }
      if (ownOn >= 2) continue;                     /* حاجز — لا يُؤكل */
      ex += this._dangerAt(po, g) * (10 + pc.pos * 0.22);
    }
    return ex;
  }

  _dangerAt(po, g) {
    if (PR_SAFE.indexOf(g) !== -1) return 0;
    let n = 0;
    for (const pl of this.players) {
      if (pl.id === po) continue;
      for (const pc of pl.pieces) {
        if (pc.state !== 'onboard' || pc.pos >= 64) continue;
        const gp = this.toGlobal(pc.owner, pc.pos);
        const d = (g - gp + 68) % 68;
        if (d >= 1 && d <= 6) n++;
      }
    }
    return n;
  }
}

/* ═══════════ التطبيق (الواجهة) ═══════════ */
const ParchisiApp = {
  mode: 'classic',
  teams: false,
  bet: 20,
  playerCount: 4,
  opponentType: 'ai',      /* ai = ضد الذكاء الاصطناعي • hotseat = وجهاً لوجه */
  difficulty: 'hard',      /* الخبير 0% خطأ دائماً */
  turnTimer: 60,           /* مؤقت الدور بالثواني: 0=بدون .. 30..300 */
  humanPlayerIndex: 0,
  engine: null,
  gameActive: false,
  roomMode: false,
  activeValue: null,
  activeSrc: null,
  canvas: null,
  ctx: null,
  _clickHandler: null,
  _raf: null,
  _aiT: null,
  _timerIv: null,
  _timerLeft: 0,
  _timerFor: null,
  _autoTurn: false,
  _lastBadges: '',

  /* حجم اللوحة = أصغر بُعد بمنطقتها — يتأقلم مع ملء الشاشة والاتجاهين */
  setupBoardFit() {
    const area = document.getElementById('parchisiBoardArea');
    const wrap = document.getElementById('parchisiBoardWrap');
    if (!area || !wrap) return;
    const apply = () => {
      /* [Owner] القياس على صندوق المحتوى (بلا الهامش): clientHeight يشمل
         الهامش العمودي، فطرحه يُبقي حواف اللوحة داخل المحتوى ويُخصّص الهامش
         للنرد الدائم خارج اللوحة (يمنع الفيضان فوق الترويسة/صف النرد في
         الشاشة الممتلئة القصيرة/الأفقية) */
      const cs = getComputedStyle(area);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pr = parseFloat(cs.paddingRight) || 0;
      const w = area.clientWidth - pl - pr - 4;
      const h = area.clientHeight - pt - pb - 4;
      /* إذا كانت المنطقة بلا ارتفاع فعلي (شاشة ممتلئة/عمودية لم تُعطَ
         ارتفاعاً كاملاً) نعتمد نسبة عرضية بدل الانهيار إلى 150px */
      const effH = (h > 40) ? h : w * 1.3;
      /* [Landscape] الأرضية 280px كانت تُجبر اللوحة على الارتفاع الكامل في
         الشاشات الأفقية القصيرة (الهواتف المُدارة) رغم حجز هوامش النرد
         الدائم أعلى/أسفل اللوحة — فتتجاوز المساحة وتُقصّ. نخفضها إلى 160px
         كي تتأقلم اللوحة مع الارتفاع المتاح بلا فيضان (لا أثر لها في
         البورتريه/سطح المكتب حيث تتجاوز القيمة الفعلية الأرضية دوماً) */
      const size = Math.max(160, Math.min(w, effH, 640));
      wrap.style.width = size + 'px';
    };
    apply();
    if (this._boardRO) this._boardRO.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this._boardRO = new ResizeObserver(apply);
      this._boardRO.observe(area);
    }
  },

  init() {
    this.canvas = document.getElementById('parchisiCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    if (this._clickHandler) this.canvas.removeEventListener('click', this._clickHandler);
    this._clickHandler = (e) => this.handleCanvasClick(e);
    this.canvas.addEventListener('click', this._clickHandler);
    if (typeof Rooms !== 'undefined' && Rooms.setGameHandler) {
      Rooms.setGameHandler((d) => ParchisiApp.prRoomMove(d));
      Rooms.setStartHandler((room) => ParchisiApp.prRoomStart(room));
      if (typeof Rooms.setUpdateHandler === 'function') {
        Rooms.setUpdateHandler(() => ParchisiApp.syncRoomSeats());
      }
    }
    if (typeof window !== 'undefined') window.applyRoomReplay = (d) => ParchisiApp.applyRoomReplay(d);
    /* [SYNC-FIX] العودة من الخلفية: rAF كان متوقفاً والمشي متكدس — قفز فوري للمواضع النهائية */
    if (typeof document !== 'undefined' && !window.__prVisBound) {
      window.__prVisBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || !ParchisiApp.engine || !ParchisiApp.gameActive) return;
        try {
          ParchisiApp._walkFifo = [];
          const layout = ParchisiApp.pieceLayout();
          if (ParchisiApp._animXY) for (const [pc, ap] of ParchisiApp._animXY) {
            const L = layout.get(pc);
            if (L) { ap.x = L.x; ap.y = L.y; }
            ap.q = []; ap._hl = null;
          }
          ParchisiApp.draw();
        } catch (e) {}
      });
    }
    /* [SYNC-FIX] نهاية جولة الغرفة: تعطيل المحرك القديم كي يبدأ التالي نظيفاً */
    if (typeof window !== 'undefined') window.onRoomRoundEnded = () => {
      if (ParchisiApp.roomMode && ParchisiApp.gameActive) {
        ParchisiApp.gameActive = false;
        ParchisiApp._autoTurn = false;
        clearTimeout(ParchisiApp._aiT);
        ParchisiApp.stopTimer();
      }
    };
    /* تصفير حالة فتح سابق */
    this.engine = null;
    this.gameActive = false;
    this.roomMode = false;
    this.mode = 'classic';
    this.teams = false;
    this.activeValue = null;
    this.activeSrc = null;
    this._autoTurn = false;
    clearTimeout(this._aiT);
    this.stopTimer();
    this.stopClock();
    this.hideOverModal();
    this.stopLoop();
    this.renderModeChips();
    this.updateSetup();
    /* [Landscape] وسم طور الإعداد على حاوية اللعبة لتخصيص تخطيط اللاندسكيب */
    var _gb = document.getElementById('gamePageBody');
    if (_gb) { _gb.classList.add('parchisi-setup'); _gb.classList.remove('parchisi-playing'); }
    /* ترجمة نصوص القالب المستنسخ حسب اللغة الحالية */
    if (typeof translateStatic === 'function') { try { translateStatic(); } catch (err) {} }
    /* [Resilience] غرفة جارية عند فتح اللعبة → استئناف + إعادة بناء من السجل */
    if (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'pr' && Rooms.state.status === 'playing' && !this.gameActive) {
      const rp = (typeof Rooms.hasPendingReplay === 'function' && Rooms.hasPendingReplay()) ? Rooms.consumePendingReplay() : null;
      this.start();
      if (rp && rp.history && rp.history.length) this.applyReplay(rp);
      /* [PR-Sync] لا إعادة معلقة → اطلبها من الخادم (إعادة اتصال WS تبث room:replay) */
      else if (typeof Rooms.requestReplay === 'function') Rooms.requestReplay();
      return;
    }
    /* [PR-Resume] جولة محلية محفوظة ضد الآلي → استئناف فوري بلا خصم جديد
       (الرهان خُصم عند البدء الأصلي — الاستئناف لا يعيد خصمه) */
    if (!this.gameActive && this._prRestore()) {
      try { toast(T('parchisi.resumed', '↩️ استؤنفت جولتك السابقة — رهانك محفوظ'), 'ok'); } catch (e) {}
      return;
    }
  },

  /* ── الغرف ── */
  _seq: 0,
  _replaying: false,
  _meId() {
    if (typeof AUTH !== 'undefined' && AUTH.user) return AUTH.user.id;
    if (typeof ST !== 'undefined' && ST.user) return ST.user.id;
    return null;
  },
  inRoomMode() {
    return typeof Rooms !== 'undefined' && Rooms.state &&
      Rooms.state.game_id === 'pr' && Rooms.state.status === 'playing';
  },
  isSpectator() {
    const me = this._meId();
    const room = (typeof Rooms !== 'undefined' && Rooms.state) || null;
    if (!room || !room.players || me == null) return false;
    for (const p of room.players) {
      if (String(p.id) === String(me)) return !!p.spectate;
    }
    return true;
  },
  isMyTurn() {
    if (this.roomMode && this.isSpectator()) return false;
    return !!(this.engine && this.engine.current === this.humanPlayerIndex);
  },
  roomPlayerName(i) {
    const room = (typeof Rooms !== 'undefined' && Rooms.state) || null;
    const myId = this._meId();
    const seatId = (this._roomSeats && this._roomSeats[i] != null)
      ? this._roomSeats[i]
      : (room && room.order ? room.order[i] : null);
    if (seatId != null) {
      if (myId != null && String(seatId) === String(myId)) return T('parchisi.you');
      const p = (room && room.players || []).find(x => String(x.id) === String(seatId));
      if (p) return p.username;
    }
    return 'P' + (i + 1);
  },
  /* بثّ موحّد بغلاف rmove (تسجيل بالسجل + dedup + حارس الصدى) */
  prEmit(action, data) {
    if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.sendMove !== 'function') return;
    this._seq = (this._seq || 0) + 1;
    const payload = {
      action: action,
      data: data || {},
      by: this._meId(),
      seq: this._seq,
      ts: Date.now(),
      dedup: 'pr-' + (this._meId() || 'x') + '-' + this._seq
    };
    /* room_state يوثّق خريطة المقاعد وأنواعها لمن يعود لاحقاً */
    const st = { game_id: 'pr', status: 'playing' };
    if (this._roomSeats) st.seats = this._roomSeats.slice();
    if (this._roomTypes) st.types = this._roomTypes.slice();
    try { Rooms.sendMove('rmove', payload, st); } catch (e) {}
  },
  /* السائق = أول لاعب بشري بالترتيب: يقود مقاعد البوتات/الغائبين */
  isBotDriver() {
    const room = (typeof Rooms !== 'undefined' && Rooms.state) || null;
    if (!room || !room.order || !room.order.length) return false;
    const byId = {};
    (room.players || []).forEach(p => { byId[String(p.id)] = p; });
    const me = this._meId();
    if (me == null) return false;
    for (const id of room.order) {
      const p = byId[String(id)];
      if (p && p.isBot) continue;
      return String(id) === String(me);
    }
    return false;
  },
  prRoomStart(room) {
    if (!room || room.game_id !== 'pr' || this.gameActive) return;
    this.start();
  },
  prRoomMove(d) {
    if (!d) return;
    if (d.action === 'rmove' && d.data) d = d.data;      /* فكّ غلاف rmove */
    const by = d.by;
    if (by != null && this._meId() != null && String(by) === String(this._meId())) return;  /* صدى حركاتي */
    this.prApply(d);
  },
  prApply(msg) {
    if (!msg || !msg.action) return;
    if (!this.gameActive || !this.engine) return;
    if (msg.action === 'roll' && msg.data && msg.data.dice) {
      this.engine.applyRoll(msg.data.dice);
    } else if (msg.action === 'move' && msg.data) {
      this.engine.applyMove(msg.data.pieceId, msg.data.value, msg.data.owner);
    } else if (msg.action === 'pass') {
      this.engine.forcePass();
    }
  },
  /* [Resilience] إعادة بناء الجولة من السجل عند العودة */
  applyRoomReplay(d) {
    if (!d || !d.history || !d.history.length) return;
    if (!(typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'pr')) return;
    if (!document.getElementById('parchisiCanvas')) return;
    this.applyReplay(d);
  },
  applyReplay(d) {
    if (!this.inRoomMode()) return;
    this._replaying = true;
    try {
      this.start();       /* محرك جديد بوضع الغرفة */
      for (const it of d.history) {
        if (!it || !it.action) continue;
        if (this.engine.gameOver) break;
        this.prApply(it);
      }
      if (this.engine && this.engine.notices) this.engine.notices.splice(0);
    } finally {
      this._replaying = false;
    }
    /* [PR-SEQ] لقطة فورية بعد الإعادة: لا مشي تراكمي عبر كل التاريخ */
    this._animXY = new Map();
    this._prLog = new Map();
    this._walkFifo = [];
    this.onEngineChange();
  },
  /* مقعد غادر صاحبه → يُدار آلياً كي لا تتعطل الجولة */
  syncRoomSeats() {
    const room = (typeof Rooms !== 'undefined' && Rooms.state) || null;
    if (!this.gameActive || !this.engine || this.roomMode !== true || !room || !room.players || !this._roomSeats) return;
    const byId = {};
    (room.players || []).forEach(p => { byId[String(p.id)] = p; });
    let changed = false;
    for (let i = 0; i < this.engine.players.length; i++) {
      const seatId = this._roomSeats[i];
      if (seatId == null) continue;
      const p = byId[String(seatId)];
      if ((!p || p.spectate) && this.engine.players[i].type !== 'ai') {
        this.engine.players[i].type = 'ai';
        if (this._roomTypes) this._roomTypes[i] = 'ai';
        changed = true;
      }
    }
    if (changed) {
      this.draw();
      this.updateUI();
      /* يوثّق التحويل في room_state (عبر بثّ خفيف من السائق) ثم يقود الدور */
      if (this.isBotDriver()) this.prEmit('sync', {});
      this.processTurn();
    }
  },

  /* ── شاشة الإعداد ── */
  renderModeChips() {
    const wrap = document.getElementById('parchisiModes');
    if (!wrap) return;
    let html = '';
    for (const key of ['classic', 'rapido', 'spanish']) {
      html += '<button class="pr-chip' + (this.mode === key ? ' on' : '') + '" onclick="ParchisiApp.setMode(\'' + key + '\')">' + T(PR_MODES[key].labelKey) + '</button>';
    }
    wrap.innerHTML = html;
    const desc = document.getElementById('parchisiModeDesc');
    if (desc) desc.textContent = T(PR_MODES[this.mode].descKey);
  },
  setMode(m) {
    if (!PR_MODES[m]) return;
    this.mode = m;
    this.renderModeChips();
  },
  toggleTeams() {
    this.teams = !this.teams;
    this.updateSetup();
  },
  updateSetup() {
    const countEl = document.getElementById('parchisiPlayerCount');
    if (countEl) this.playerCount = parseInt(countEl.value, 10);
    const oppEl = document.getElementById('parchisiOppType');
    if (oppEl) this.opponentType = oppEl.value;
    const tmEl = document.getElementById('parchisiTimerSel');
    if (tmEl) this.turnTimer = parseInt(tmEl.value, 10) || 0;
    const row = document.getElementById('parchisiTeamsRow');
    if (row) row.style.display = (this.playerCount === 4) ? 'flex' : 'none';
    const btn = document.getElementById('parchisiTeamsBtn');
    if (btn) {
      btn.textContent = this.teams ? T('parchisi.teamsOn') : T('parchisi.teamsOff');
      btn.classList.toggle('on', this.teams);
    }
  },
  changeBet(d) {
    this.bet = Math.max(10, Math.min(ST.gold, this.bet + d));
    const el = document.getElementById('parchisiBet');
    if (el) el.textContent = this.bet;
  },

  /* ── بدء اللعبة ── */
  start() {
    const roomMode = this.inRoomMode();
    this.roomMode = roomMode;
    let modeKey = 'classic', teams = false;
    this._roomTypes = null;
    this._roomSeats = null;
    if (roomMode) {
      /* غرفة: خريطة المقاعد تُجمَّد عند البدء (room_state يوثّقها لمن يعود لاحقاً) */
      const room = Rooms.state;
      /* [RS-GameOpts] نمط اللعب المختار في إعدادات الغرفة (يصل للجميع عبر game_opts) */
      const prCfg = (room && room.game_opts) || (typeof window !== 'undefined' && window.PR_ROOM_CFG) || null;
      if (prCfg && prCfg.mode && PR_MODES[prCfg.mode]) { this.mode = prCfg.mode; modeKey = prCfg.mode; }
      if (prCfg && typeof prCfg.timer === 'number') this.turnTimer = prCfg.timer;
      const byId = {};
      (room.players || []).forEach(p => { byId[String(p.id)] = p; });
      const rs = (room && room.room_state) || {};
      let active = null, seatTypes = null;
      if (rs.game_id === 'pr' && Array.isArray(rs.seats) && rs.seats.length) {
        active = rs.seats.slice();
        seatTypes = (Array.isArray(rs.types) ? rs.types.slice() : active.map(() => 'human'));
      } else {
        const order = (room.order || []).slice();
        active = order.length ? order : (room.players || []).filter(p => !p.spectate).map(p => p.id);
      }
      this.playerCount = Math.max(2, Math.min(4, active.length || 2));
      const me = this._meId();
      let myIdx = -1;
      if (me != null) {
        for (let i = 0; i < active.length; i++) {
          if (String(active[i]) === String(me)) { myIdx = i; break; }
        }
      }
      if (myIdx < 0) myIdx = 0;
      this.humanPlayerIndex = myIdx;
      this.bet = 0;
      this._roomSeats = [];
      this._roomTypes = [];
      for (let i = 0; i < this.playerCount; i++) {
        this._roomSeats.push(active[i]);
        if (seatTypes && seatTypes[i]) this._roomTypes.push(seatTypes[i]);
        else {
          const p = byId[String(active[i])];
          this._roomTypes.push(p && p.isBot ? 'ai' : 'human');
        }
      }
    } else {
      this.updateSetup();
      modeKey = this.mode;
      teams = this.teams && this.playerCount === 4;
      if (ST.gold < this.bet) {
        toast(T('ts.noc'), 'err');
        return;
      }
      ST.gold -= this.bet;
      save();
      wallet();
    }
    SND.click();
    document.getElementById('parchisiSetup').style.display = 'none';
    document.getElementById('parchisiGame').style.display = 'flex';
    var _gb = document.getElementById('gamePageBody');
    if (_gb) { _gb.classList.remove('parchisi-setup'); _gb.classList.add('parchisi-playing'); }
    this.gameActive = true;
    this._autoTurn = false;
    this._lastBadges = '';
    if (typeof window.SessionResume !== 'undefined') {
      try { window.SessionResume.markRoundStart({ gameId: 'pr' }); } catch (e) {}
    }
    const types = [];
    if (roomMode && this._roomTypes) {
      for (let i = 0; i < this.playerCount; i++) types.push(this._roomTypes[i] || 'human');
    } else if (this.opponentType === 'hotseat') {
      /* وجهاً لوجه: كل المقاعد بشرية على نفس الجهاز */
      for (let i = 0; i < this.playerCount; i++) types.push('human');
    } else {
      for (let i = 0; i < this.playerCount; i++) {
        types.push(i === this.humanPlayerIndex ? 'human' : 'ai');
      }
    }
    const engOpts = { teams: teams };
    if (!roomMode) engOpts.timer = this.turnTimer;   /* مؤقت الدور المختار */
    this.engine = new ParchisiEngine(this.playerCount, types, this.difficulty, modeKey, engOpts);
    this.engine.onStateChange = () => this.onEngineChange();
    this.engine.startGame();
    this._votes = null;
    this.hideOverModal();
    this._animXY = new Map();      /* انسياب نظيف من البداية */
    this._prLog = new Map();
    this._walkFifo = [];           /* [PR-SEQ] */
    this._logFor = null;
    this.hideRollLog();
    this.setupBoardFit();
    this.startLoop();
    this.startClock();
    this.onEngineChange();
  },

  onEngineChange() {
    if (!this.engine) return;
    this.draw();
    this.updateUI();
    const ns = this.engine.notices.splice(0);
    if (!this._replaying) {
      for (const n of ns) this.toastNotice(n);
    }
    /* [PR-Resume] حفظ الجولة بعد كل تغيّر محرك (محلي ضد الآلي فقط) */
    if (!this.roomMode && this.gameActive) this._prSave();
    if (this.engine.gameOver) {
      this.stopTimer();
      this._prClear();          /* انتهت الجولة → لا استئناف بعدها */
      if (!this._replaying) this.handleGameOver();
      return;
    }
    if (this._replaying) return;
    if (this._autoTurn) {
      this.stopTimer();
      setTimeout(() => this.autoTurnStep(), 380);
      return;
    }
    this.manageTimer();
    this.processTurn();
  },

  toastNotice(n) {
    /* [B6] الإشعارات النصية أُلغيت بطلب صريح — ضجيج بصري يغطي اللوحة بلا فائدة.
       المكافآت صارت تُشار بأيقونة دائرية أعلى الشاشة (renderBonus).
       [PR-SND] تبقى مصدراً لأصوات الأحداث المميزة (قتل / إنهاء الدورة). */
    if (!n || this._replaying || typeof SND === 'undefined') return;
    try {
      if (n.key === 'parchisi.capture' && SND.prCapture) SND.prCapture();
      else if (n.key === 'parchisi.entry10' && SND.prFinish) SND.prFinish();
    } catch (er) {}
  },

  playerName(i) {
    if (!this.engine) return 'P' + (i + 1);
    if (this.roomMode) return this.roomPlayerName(i);
    if (this.opponentType === 'hotseat') {
      if (i === this.humanPlayerIndex) {
        const u = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || '';
        if (u) return u;
      }
      const seatKey = ['Red', 'Green', 'Yellow', 'Blue'][this.engine.seats[i]] || 'Red';
      return T('parchisi.p' + seatKey);
    }
    return this.engine.players[i].type === 'human' ? T('parchisi.you') : 'AI ' + (i + 1);
  },

  /* حرفا البداية من اسم اللاعب (أيقونة الزاوية الدائرية) */
  iconInitials(i) {
    let n = '';
    if (this.roomMode) {
      const room = (typeof Rooms !== 'undefined' && Rooms.state) || null;
      const seatId = (this._roomSeats && this._roomSeats[i] != null) ? this._roomSeats[i] : (room && room.order ? room.order[i] : null);
      const p = seatId != null ? ((room && room.players) || []).find(x => String(x.id) === String(seatId)) : null;
      if (p && p.isBot) n = 'AI';
      else n = (p && (p.name || p.username)) || (seatId != null ? '#' + seatId : '');
    } else if (this.engine && this.engine.players[i]) {
      if (this.engine.players[i].type !== 'human') n = 'AI';
      else if (i === this.humanPlayerIndex) {
        n = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || T('parchisi.you');
      } else {
        n = T('parchisi.ini' + (['Red', 'Green', 'Yellow', 'Blue'][this.engine.seats[i]] || 'Red'));
      }
    }
    return String(n).replace(/\s+/g, ' ').trim().slice(0, 2) || '؟';
  },

  /* ── الترويسة: اسم اللعبة + مجموع الرهان، وأيقونات الزوايا الأربع ── */
  renderIcons() {
    const wrap = document.getElementById('prIcons');
    if (!wrap || !this.engine) return;
    const e = this.engine;
    const titleEl = document.getElementById('prTitle');
    if (titleEl) {
      /* [v23] الإشارة لنمط الجولة (كلاسيك/رابيدو/إسباني) تحت العنوان */
      const mk = PR_MODES[this.mode] ? this.mode : 'classic';
      titleEl.textContent = T('parchisi.gameTitle') + ' · ' + T(PR_MODES[mk].labelKey);
    }
    const potWrap = document.getElementById('prPotWrap');
    const potEl = document.getElementById('prPot');
    const pot = this.roomMode ? 0 : (this.bet * e.players.length);
    if (potEl) potEl.textContent = fmt(pot);
    if (potWrap) potWrap.style.display = pot > 0 ? '' : 'none';
    /* حسب المقعد: أحمر أعلى·يسار / أخضر أسفل·يسار / أصفر أسفل·يمين / أزرق أعلى·يمين */
    const seatPos = [
      { x: '6.5%', y: '6.5%', side: 'right' },
      { x: '6.5%', y: '93.5%', side: 'right' },
      { x: '93.5%', y: '93.5%', side: 'left' },
      { x: '93.5%', y: '6.5%', side: 'left' }
    ];
    /* [Rotate] إزاحة مواقع الأيقونات مع تدوير اللوحة */
    const rot = e.boardRotation || 0;
    let html = '';
    for (let i = 0; i < e.players.length; i++) {
      const seat = e.seats[i];
      const pos = seatPos[(seat + rot) % 4] || seatPos[0];
      const col = PR_COLORS.main[seat];
      const on = (i === e.current && !e.gameOver && this.gameActive) ? ' on' : '';
      const ini = String(this.iconInitials(i)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += '<div class="pr-picon' + on + '" data-side="' + pos.side + '" style="--pc:' + col + ';left:' + pos.x + ';top:' + pos.y + '">'
           + '<span class="pr-pc">' + ini + '</span>'
           + '<span class="pr-ptimer" data-ti="' + i + '"></span>'
           + '<button class="pr-hist-btn" type="button" data-hi="' + i + '" title="' + T('parchisi.rollLogBtn') + '" aria-label="' + T('parchisi.rollLogBtn') + ' ' + String(i + 1) + '" onclick="ParchisiApp.toggleRollLog(' + i + ')">🎲</button>'
           + '</div>';
    }
    wrap.innerHTML = html;
    this.renderIconTimers();
  },

  /* ── سجل الرميات المنسدل: آخر خمس رميات لكل لاعب (أعلى اليسار) ── */
  toggleRollLog(i) {
    if (this._logFor === i) { this._logFor = null; this.hideRollLog(); return; }
    this._logFor = i;
    this.renderRollLog();
  },
  hideRollLog() {
    const el = document.getElementById('prRollLog');
    if (el) el.classList.remove('show');
  },
  _escHtml(x) {
    return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  renderRollLog() {
    const el = document.getElementById('prRollLog');
    const e = this.engine;
    if (!el || !e || this._logFor == null || !e.players[this._logFor]) { this.hideRollLog(); return; }
    const i = this._logFor;
    const rolls = (e.rollLog && e.rollLog[i]) || [];
    const seat = e.seats[i];
    const col = (typeof PR_COLORS !== 'undefined' && PR_COLORS.main) ? PR_COLORS.main[seat] : '#ffd75e';
    const list = rolls.slice(-5).reverse();          /* الأحدث أولاً */
    let chips = '';
    for (let r = 0; r < list.length; r++) {
      chips += '<div class="pr-rl-row' + (r === 0 ? ' new' : '') + '">'
             + '<span class="pr-rl-n">' + (list.length - r) + '</span>'
             + '<span class="pr-rl-dice">' + list[r].map(x => '<i class="pr-rl-die">' + (x | 0) + '</i>').join('<b>+</b>') + '</span>'
             + '</div>';
    }
    if (!list.length) chips = '<div class="pr-rl-empty">' + T('parchisi.rollLogEmpty') + '</div>';
    el.innerHTML = '<div class="pr-rl-head" style="--pc:' + col + '">'
      + '<span class="pr-rl-name">' + this._escHtml(this.playerName(i)) + '</span>'
      + '<span class="pr-rl-t">' + T('parchisi.rollLogTitle') + '</span>'
      + '<button class="pr-rl-x" type="button" onclick="ParchisiApp.toggleRollLog(' + i + ')" aria-label="✕">✕</button>'
      + '</div>' + chips;
    el.classList.add('show');
  },

  /* ── ساعة الدور: بجوار أيقونة صاحب الدور — تظهر وتختفي بمرور الدور ── */
  startClock() {
    this.stopClock();
    this._turnStart = Date.now();
    this._clockIv = setInterval(() => this.renderIconTimers(), 1000);
    this.renderIconTimers();
  },
  stopClock() {
    if (this._clockIv) clearInterval(this._clockIv);
    this._clockIv = null;
  },
  renderIconTimers() {
    const wrap = document.getElementById('prIcons');
    const e = this.engine;
    if (!wrap || !e || !this.gameActive || e.gameOver) return;
    const chips = wrap.querySelectorAll('.pr-ptimer');
    if (!chips.length) return;
    const secs = Math.max(0, Math.floor((Date.now() - (this._turnStart || Date.now())) / 1000));
    for (const c of chips) {
      const i = parseInt(c.getAttribute('data-ti'), 10);
      if (i === e.current) {
        let txt = '⏱' + secs, low = secs >= 60;
        if (e.timer > 0 && this._timerFor === i && this._timerLeft > 0) {
          txt = '⏱' + this._timerLeft;               /* عدّاد رابيدو التنازلي */
          low = this._timerLeft <= 5;
        }
        c.textContent = txt;
        c.classList.add('on');
        c.classList.toggle('low', low);
      } else {
        c.textContent = '';
        c.classList.remove('on', 'low');
      }
    }
  },

  /* ── الواجهة ── */
  updateUI() {
    const e = this.engine;
    if (!e) return;
    if (this._logFor != null) this.renderRollLog();   /* تحديث حيّ للسجل المفتوح */
    const p = e.current;
    const pl = e.players[p];
    const humanTurn = this.roomMode ? this.isMyTurn() : (pl.type === 'human');
    const rollBtn = document.getElementById('parchisiRollBtn');
    if (rollBtn) {
      rollBtn.innerHTML = '<i class="fa-solid fa-dice" aria-hidden="true"></i> ' + T('parchisi.rollBtn');
      rollBtn.disabled = !(this.gameActive && !e.gameOver && e.phase === 'WAIT_ROLL' && humanTurn);
    }
    /* اختيار قيمة النرد تلقائياً إن لزم */
    if (e.phase === 'MOVING') {
      const av = e.availableValues();
      const ok = av.some(o => o.v === this.activeValue && o.src === this.activeSrc);
      if (!ok) {
        this.activeValue = av.length ? av[0].v : null;
        this.activeSrc = av.length ? av[0].src : null;
      }
    } else {
      this.activeValue = null;
      this.activeSrc = null;
    }
    this.renderDice();
    this.renderBonus();
    this.renderHint(humanTurn);
    const rollsNow = (e.rollCount && e.rollCount[p] != null) ? e.rollCount[p] : -1;
    if (this._clockFor !== p || this._clockRolls !== rollsNow) {
      /* [B7] دور جديد أو رمية إضافية بنردين متشابهين — الساعة تتجدد */
      this._clockFor = p; this._clockRolls = rollsNow; this._turnStart = Date.now();
    }
    this.renderIcons();
    this.renderCornerDice();   /* [B9] النرد الدائم بزوايا القواعد */
  },

  renderDice() {
    const row = document.getElementById('parchisiDiceRow');
    if (!row || !this.engine) return;
    const e = this.engine;
    if (e.phase !== 'MOVING' || !e.dice.length) { row.innerHTML = ''; return; }
    let html = '';
    for (const o of e.availableValues()) {
      const on = (this.activeValue === o.v && this.activeSrc === o.src) ? ' on' : '';
      if (o.src === 'sum') {
        html += '<button class="pr-die pr-sum' + on + '" onclick="ParchisiApp.selectValue(' + o.v + ',\'sum\')">' + e.dice[0] + '+' + e.dice[1] + '=' + o.v + '</button>';
      } else {
        html += '<button class="pr-die' + on + '" onclick="ParchisiApp.selectValue(' + o.v + ',' + o.src + ')">🎲 ' + o.v + '</button>';
      }
    }
    row.innerHTML = html;
  },

  selectValue(v, src) {
    this.activeValue = v;
    this.activeSrc = src;
    this.renderDice();
  },

  /* [Rotate] تدوير مقاعد اللاعبين حول اللوحة — تُغيَّر الزوايا مع الحفاظ على
     ترتيب الألوان. ثم يُعاد رسم اللوحة والأيقونات والنرد الدائم. */
  rotateBoard() {
    if (!this.engine || this.engine.gameOver) return;
    if (!this.engine.rotateBoard()) return;
    /* تأثير بصري: تدوير الزر نفسه */
    const btn = document.getElementById('parchisiRotateBtn');
    if (btn) {
      btn.classList.remove('spinning');
      void btn.offsetWidth;
      btn.classList.add('spinning');
    }
    /* إعادة الرسم */
    this.renderIcons();
    this.renderCornerDice();
    this.renderDice();
    this.draw();   /* حلقرة الرسم — تستعمل seats الجديد في رسم القواعد والقطع */
    if (this.engine.onStateChange) this.engine.onStateChange();
  },

  /* ═══ [B9] النرد الدائم لكل لاعب فوق الزاوية الخارجية لقاعدته ═══
     أحمر (0) أعلى·يسار • أخضر (1) أسفل·يسار • أصفر (2) أسفل·يمين • أزرق (3) أعلى·يمين */
  renderCornerDice() {
    const wrap = document.getElementById('prCornerDice');
    if (!wrap || !this.engine) return;
    const e = this.engine;
    const corners = ['tl', 'bl', 'br', 'tr'];
    /* [Rotate] زاوية كل لاعب تتحول مع تدوير اللوحة: مقعد + تدوير = زاوية.
       ركن مقعد i بعد r تدويرات عكس عقارب الساعة = corners[(i + r) % 4]. */
    const rot = e.boardRotation || 0;
    let html = '';
    for (let i = 0; i < e.players.length; i++) {
      const seat = e.seats[i];
      const visualCorner = corners[(seat + rot) % 4] || 'tl';
      const rolls = (e.rollLog && e.rollLog[i]) || [];
      const last = rolls.length ? rolls[rolls.length - 1] : null;
      const vals = last ? last.slice() : [];
      while (vals.length < e.mode.dice) vals.push(1);          /* قبل أول رمية */
      const on = (i === e.current && !e.gameOver && this.gameActive) ? ' on' : '';
      html += '<div class="pr-cd' + on + '" data-corner="' + visualCorner + '"'
            + ' style="--cdc:' + PR_COLORS.main[seat] + '">';
      for (let k = 0; k < e.mode.dice; k++) html += this._dieFaceHTML(vals[k] | 0 || 1);
      html += '</div>';
    }
    wrap.innerHTML = html;
  },

  _dieFaceHTML(v) {
    /* نقاط النرد الكلاسيكية على شبكة 3×3 */
    const P = {
      1: [[50, 50]],
      2: [[26, 26], [74, 74]],
      3: [[26, 26], [50, 50], [74, 74]],
      4: [[26, 26], [74, 26], [26, 74], [74, 74]],
      5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
      6: [[26, 26], [74, 26], [26, 50], [74, 50], [26, 74], [74, 74]]
    };
    const pts = P[v] || P[1];
    let h = '<div class="pr-cdie">';
    for (const q of pts) h += '<span class="pip" style="left:' + (q[0] - 8.5) + '%;top:' + (q[1] - 8.5) + '%"></span>';
    return h + '</div>';
  },

  renderBonus() {
    const el = document.getElementById('parchisiBonus');
    if (!el || !this.engine) return;
    const e = this.engine;
    if (e.phase === 'BONUS' && e.bonus) {
      /* [B6] أيقونة دائرية بلا خلفية أعلى الشاشة: الرقم 20 أو 10 بحلقة بلون صاحب الدور */
      el.textContent = String(e.bonus.dist);
      const seat = e.seats[e.current];
      const col = (typeof PR_COLORS !== 'undefined' && PR_COLORS.main && PR_COLORS.main[seat]) ? PR_COLORS.main[seat] : 'rgba(255,215,94,0.95)';
      el.style.borderColor = col;
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  },

  renderHint(humanTurn) {
    /* [B5] الرسائل التوضيحية أُلغيت بطلب صريح — زحمة بصرية بلا قيمة */
    void humanTurn;
  },



  /* ── النرد ── */
  rollDice() {
    const e = this.engine;
    if (!e || e.phase !== 'WAIT_ROLL' || !this.gameActive || e.gameOver) return;
    if (this.roomMode) {
      if (!this.isMyTurn()) {
        toast(T('parchisi.waitTurn'), 'warn');
        return;
      }
      const dice = [];
      for (let i = 0; i < e.mode.dice; i++) dice.push(Math.floor(Math.random() * 6) + 1);
      this.prEmit('roll', { dice: dice });
      e.applyRoll(dice);
      return;
    }
    if (e.players[e.current].type !== 'human') return;
    e.roll();
  },

  selectDieAuto() {},

  /* ── الحركة البشرية ── */
  handleCanvasClick(ev) {
    if (!this.gameActive || !this.engine || this.engine.gameOver) return;
    const e = this.engine;
    if (e.phase !== 'MOVING' && e.phase !== 'BONUS') return;
    const cur = e.players[e.current];
    if (this.roomMode) {
      if (!this.isMyTurn()) return;
    } else if (cur.type !== 'human') {
      return;
    }
    let opts, value;
    if (e.phase === 'BONUS') {
      opts = e.bonusLegal;
      value = e.bonus.dist;
    } else {
      if (this.activeValue == null) return;
      value = this.activeValue;
      opts = e.optionsFor(value);
    }
    if (!opts || !opts.length) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    let mx = (ev.clientX - rect.left) * (600 / rect.width);
    let my = (ev.clientY - rect.top) * (600 / rect.height);
    /* [Rotate] عكس دوران الرسم للحصول على إحداثيات الخلية الأصلية:
       الرسم يدور -90°*rot حول المركز؛ النقر على النقطة المدارة يجب أن يُحوَّل
       للإطار غير-المدار حيث تُخزَّن مواقع القطع في pieceLayout. */
    const rot = (e.boardRotation || 0);
    if (rot) {
      const cx = 300, cy = 300;
      const dx = mx - cx, dy = my - cy;
      const ang = Math.PI / 2 * rot;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      mx = cx + dx * cs - dy * sn;
      my = cy + dx * sn + dy * cs;
    }
    const layout = this.pieceLayout();
    let best = null, bd = 26;
    for (const pc of opts) {
      const L = layout.get(pc);
      if (!L) continue;
      const d = Math.hypot(mx - L.x, my - L.y);
      if (d < bd) { bd = d; best = pc; }
    }
    if (best) this.humanMove(best, value);
  },

  humanMove(piece, value) {
    const e = this.engine;
    if (!e) return;
    if (this.roomMode) {
      this.prEmit('move', { owner: piece.owner, pieceId: piece.id, value: value });
    }
    e.applyMove(piece.id, value, piece.owner);
  },

  autoMove() {
    const e = this.engine;
    if (!e || !this.gameActive || e.gameOver) return;
    if (e.phase !== 'MOVING' && e.phase !== 'BONUS') return;
    const cur = e.players[e.current];
    if (this.roomMode) { if (!this.isMyTurn()) return; }
    else if (cur.type !== 'human') return;
    const opt = e.aiPickOption();
    if (opt) this.humanMove(opt.piece, opt.value);
    else { if (this.roomMode) this.prEmit('pass', {}); e.forcePass(); }
  },

  /* [PR-SEQ] هل توجد حركة بيدق جارية على اللوحة؟ */
  _animBusy() {
    return !!(this._walkFifo && this._walkFifo.length);
  },

  /* ── الذكاء الاصطناعي ── */
  processTurn() {
    if (!this.gameActive || !this.engine || this.engine.gameOver) return;
    /* [PR-SEQ] لا يبدأ اللاعب التالي (آلي/سائق) حتى يستقر البيدق المتحرك */
    if (this._animBusy()) {
      clearTimeout(this._aiT);
      this._aiT = setTimeout(() => this.processTurn(), 180);
      return;
    }
    const e = this.engine;
    const cur = e.players[e.current];
    if (this.roomMode) {
      /* مقاعد البوتات/الغائبين يقودها السائق (أول لاعب بشري بالترتيب) ويبثّ حركاتها */
      if (cur.type === 'ai' && this.isBotDriver()) {
        clearTimeout(this._aiT);
        this._aiT = setTimeout(() => this.roomBotStep(), 700 + Math.random() * 450);
      }
      return;
    }
    if (cur.type !== 'ai') return;
    clearTimeout(this._aiT);
    this._aiT = setTimeout(() => this.aiStep(), 620 + Math.random() * 480);
  },

  /* دور مقعد آلي داخل الغرفة: يُبَثّ للجميع */
  roomBotStep() {
    if (!this.gameActive || !this.engine || this.engine.gameOver) return;
    if (this._animBusy()) { clearTimeout(this._aiT); this._aiT = setTimeout(() => this.roomBotStep(), 180); return; }   /* [PR-SEQ] */
    const e = this.engine;
    const cur = e.players[e.current];
    if (cur.type !== 'ai') return;
    if (e.phase === 'WAIT_ROLL') {
      const dice = [];
      for (let i = 0; i < e.mode.dice; i++) dice.push(Math.floor(Math.random() * 6) + 1);
      this.prEmit('roll', { dice: dice });
      e.applyRoll(dice);
      return;
    }
    if (e.phase === 'MOVING' || e.phase === 'BONUS') {
      const opt = e.aiPickOption();
      if (opt) this.humanMove(opt.piece, opt.value);
      else { this.prEmit('pass', {}); e.forcePass(); }
    }
  },

  aiStep() {
    if (!this.gameActive || !this.engine || this.engine.gameOver) return;
    if (this._animBusy()) { clearTimeout(this._aiT); this._aiT = setTimeout(() => this.aiStep(), 180); return; }   /* [PR-SEQ] */
    const e = this.engine;
    if (e.players[e.current].type !== 'ai') return;
    if (e.phase === 'WAIT_ROLL') { e.roll(); return; }
    if (e.phase === 'MOVING' || e.phase === 'BONUS') {
      const opt = e.aiPickOption();
      if (opt) e.applyMove(opt.piece.id, opt.value, opt.piece.owner);
      else e.forcePass();
    }
  },

  /* ── مؤقّت رابيدو ── */
  manageTimer() {
    const e = this.engine;
    if (!e || e.timer <= 0 || !this.gameActive || e.gameOver || this._autoTurn) { this.stopTimer(); return; }
    const humanTurn = this.roomMode ? this.isMyTurn() : (e.players[e.current].type === 'human');
    if (!humanTurn) { this.stopTimer(); return; }
    /* [B7] نردان متشابهان = رمية إضافية لنفس اللاعب → يتجدد المؤقت كاملاً */
    const rolls = (e.rollCount && e.rollCount[e.current] != null) ? e.rollCount[e.current] : -1;
    if (this._timerFor === e.current && this._timerIv) {
      if (this._timerRolls !== rolls) { this._timerRolls = rolls; this.startTimer(); }
      return;
    }
    this._timerRolls = rolls;
    this.startTimer();
  },
  startTimer() {
    this.stopTimer();
    const e = this.engine;
    this._timerFor = e.current;
    this._timerLeft = e.timer;
    this._timerIv = setInterval(() => {
      this._timerLeft--;
      this.renderTimer();
      if (this._timerLeft <= 0) {
        this.stopTimer();
        this.timerExpired();
      }
    }, 1000);
    this.renderTimer();
  },
  stopTimer() {
    if (this._timerIv) clearInterval(this._timerIv);
    this._timerIv = null;
    this._timerFor = null;
    this._timerLeft = 0;
    const el = document.getElementById('parchisiTimer');
    if (el) { el.textContent = ''; el.classList.remove('low'); }
  },
  renderTimer() {
    const el = document.getElementById('parchisiTimer');
    if (!el) return;
    el.textContent = '⏱ ' + this._timerLeft + 's';
    el.classList.toggle('low', this._timerLeft <= 5);
  },
  timerExpired() {
    if (!this.gameActive || !this.engine || this.engine.gameOver) return;
    toast(T('parchisi.timeUp'), 'warn');
    this._autoTurn = true;
    this.autoTurnStep();
  },
  autoTurnStep() {
    if (!this.gameActive || !this.engine || this.engine.gameOver) { this._autoTurn = false; return; }
    const e = this.engine;
    const mine = this.roomMode ? this.isMyTurn() : (e.players[e.current].type === 'human');
    if (!mine) { this._autoTurn = false; this.manageTimer(); this.processTurn(); return; }
    if (e.phase === 'WAIT_ROLL') { e.roll(); return; }
    if (e.phase === 'MOVING' || e.phase === 'BONUS') {
      /* عشوائية تماماً — بلا استراتيجية ولا ذكاء اصطناعي */
      const opt = e.randomOption();
      if (opt) {
        if (this.roomMode) this.humanMove(opt.piece, opt.value);   /* تُبثّ للغرفة */
        else e.applyMove(opt.piece.id, opt.value, opt.piece.owner);
      } else e.forcePass();
    }
  },

  /* ── نهاية اللعبة ── */
  handleGameOver() {
    if (!this.gameActive) return;
    this.gameActive = false;
    this._autoTurn = false;
    this.stopTimer();
    const e = this.engine;
    let win = false, label = '';
    if (e.teams) {
      win = (e.winnerTeam === (this.humanPlayerIndex % 2));
      label = win ? T('parchisi.teamWin') : T('parchisi.teamLose');
    } else {
      win = (e.winner === this.humanPlayerIndex);
      label = win ? T('parchisi.win') : T('parchisi.lose');
    }
    let paid = 0;
    if (win && !this.roomMode) {
      /* [Payout 2026-09-14] عقد المنصة ضد الآلي (توضيح المالك 09-14):
         رصيد الآلي = أرباح/خسائر المنصة — المنصة تضع رهاناً معادلاً لكل مقعد
         آلي. الفائز يستلم رهانَه + رهان كل خصم (stake = playerCount × bet)
         ناقص رسوم المنصة 5% — نفس عقد الغرف الرسمي (البرية تدفع للمائدة).
         أمثلة: 1v1 → ×1.9، 1v2 → ×2.85، 1v3 → ×3.8 (كان الكود القديم
         صحيحاً لكن بلا خصم رسوم — جرّدناه من Math.floor وأضفنا العشرية). */
      const seats = Math.max(2, this.playerCount || 2);
      const stake = seats * this.bet;
      const fee = Math.round(stake * 0.05 * 100) / 100;
      paid = Math.round(Math.max(0, stake - fee) * 100) / 100;
      if (typeof giveWin === 'function') giveWin(paid);
      else if (typeof give === 'function') { give(paid); if (typeof window.SessionResume !== 'undefined') { try { window.SessionResume.onResolve(); } catch (e) {} } }
      winFX(paid);
    }
    /* [BotsLedger] المنصة دفعت للفائز البشري (−) أو قبضت رهان الخاسر (+) */
    if (!this.roomMode && this.opponentType !== 'hotseat' && this.bet > 0) {
      const botDelta = win ? -paid : this.bet;
      if (typeof window !== 'undefined' && window.BotsLedger) {
        try { window.BotsLedger.record('pr', botDelta); } catch (e) {}
      }
    }
    if (typeof recordRound === 'function') {
      recordRound(win, paid, win
        ? ('فزت بالـ Parchisi 🏆' + (paid > 0 ? ' +' + paid : ''))
        : 'خسرت الـ Parchisi');
    }
    if (win) { if (typeof celebrate === 'function') celebrate(true); } else { SND.lose(); }
    this.draw();
    setTimeout(() => this.stopLoop(), 1600);
    if (this.roomMode) {
      /* الغرف: إشعار فقط — نظام الغرف يتكفّل بالمباراة الجديدة */
      const msgEl = document.getElementById('parchisiMessage');
      if (msgEl) msgEl.textContent = label;
      toast(label, win ? 'ok' : 'info');
      return;
    }
    if (this.opponentType === 'hotseat') {
      this.showHotseatVote();      /* وجهاً لوجه: تصويت الجولة الجديدة (نظام غرف الرامي) */
      return;
    }
    this.showOverModal(win, label, paid);
  },

  /* ── نافذة الفوز/الخسارة ضد الذكاء الاصطناعي: جولة جديدة أو خروج ── */
  showOverModal(win, label, paid) {
    const m = document.getElementById('prOverModal');
    if (!m) { toast(label, win ? 'ok' : 'info'); return; }
    const icon = document.getElementById('prOverIcon');
    const title = document.getElementById('prOverTitle');
    const sub = document.getElementById('prOverSub');
    const actions = document.getElementById('prOverActions');
    const vote = document.getElementById('prOverVote');
    if (icon) icon.textContent = win ? '🏆' : '💔';
    if (title) { title.textContent = label; title.className = 'pr-over-title ' + (win ? 'win' : 'lose'); }
    if (sub) sub.textContent = paid > 0 ? '+' + fmt(paid) : '';
    if (vote) vote.innerHTML = '';
    if (actions) {
      actions.innerHTML =
        '<button class="big pr-act-new" onclick="ParchisiApp.overNewRound()">🔁 ' + T('parchisi.newRound') + '</button>' +
        '<button class="big pr-act-exit" onclick="ParchisiApp.overExit()">🚪 ' + T('parchisi.exitGame') + '</button>';
    }
    m.classList.add('show');
  },

  /* ── وجهاً لوجه: لوحة تصويت الجولة الجديدة (كما في غرف الرامي) ── */
  showHotseatVote() {
    const m = document.getElementById('prOverModal');
    if (!m) return;
    const e = this.engine;
    let wName = '';
    if (e.teams) wName = T('parchisi.teamN').replace('{n}', String(e.winnerTeam + 1));
    else wName = this.playerName(e.winner);
    const icon = document.getElementById('prOverIcon');
    const title = document.getElementById('prOverTitle');
    const sub = document.getElementById('prOverSub');
    const actions = document.getElementById('prOverActions');
    if (icon) icon.textContent = '🏆';
    if (title) { title.textContent = T('parchisi.roundWonBy').replace('{name}', wName); title.className = 'pr-over-title win'; }
    if (sub) sub.textContent = '';
    if (actions) {
      actions.innerHTML = '<button class="big pr-act-exit" onclick="ParchisiApp.overExit()">🚪 ' + T('parchisi.exitGame') + '</button>';
    }
    this._votes = {};
    this.renderVotePanel();
    m.classList.add('show');
  },

  renderVotePanel() {
    const vote = document.getElementById('prOverVote');
    if (!vote || !this.engine) return;
    const e = this.engine;
    let html = '<div class="pr-vote-title">🗳️ ' + T('parchisi.voteTitle') + '</div><div class="pr-vote-rows">';
    for (let i = 0; i < e.players.length; i++) {
      const v = (this._votes && this._votes[i] !== undefined) ? this._votes[i] : null;
      html += '<div class="pr-vote-row" style="--pc:' + PR_COLORS.main[e.seats[i]] + '">'
           + '<span class="pr-vote-name">' + this.playerName(i) + '</span>'
           + (v === null
              ? '<span class="pr-vote-btns"><button onclick="ParchisiApp.voteNext(' + i + ',true)" title="موافقة">✅</button><button onclick="ParchisiApp.voteNext(' + i + ',false)" title="رفض">❌</button></span>'
              : '<span class="pr-vote-v">' + (v ? '✅' : '❌') + '</span>')
           + '</div>';
    }
    html += '</div>';
    vote.innerHTML = html;
  },

  /* تصويت لاعب وجهاً لوجه: الرفض يُنهي اللعبة، وإجماع الجميع يبدأ جولة جديدة */
  voteNext(i, agree) {
    if (!this._votes) return;
    this._votes[i] = agree;
    if (!agree) {
      this.hideOverModal();
      this.close();
      return;
    }
    const n = this.engine ? this.engine.players.length : 0;
    const agreed = Object.keys(this._votes).filter(k => this._votes[k]).length;
    if (agreed >= n) {
      this.hideOverModal();
      this.start();          /* جولة جديدة مباشرة بنفس الإعدادات (رهان جديد) */
      return;
    }
    this.renderVotePanel();
  },

  overNewRound() {
    this.hideOverModal();
    const g = document.getElementById('parchisiGame');
    const st = document.getElementById('parchisiSetup');
    if (g) g.style.display = 'none';
    if (st) st.style.display = 'block';
    var _gb = document.getElementById('gamePageBody');
    if (_gb) { _gb.classList.add('parchisi-setup'); _gb.classList.remove('parchisi-playing'); }
  },

  overExit() {
    this.hideOverModal();
    this.close();
  },

  hideOverModal() {
    const m = document.getElementById('prOverModal');
    if (m) m.classList.remove('show');
  },

  /* ═══ [PR-Resume 2026-09-14] استمرارية الجولة المحلية ضد الآلي ═══
     بلاغ المالك: الخروج من البارتشي كان = ضياع الرهان بلا تسجيل.
     تسلسل كامل لحالة الجولة (غير roomMode) في localStorage وإعادة بنائها
     عند فتح اللعبة — نفس فلسفة رامي (ramiSerializeGame). الرهان خُصم عند
     البدء فالاستئناف بلا خصم جديد. */
  RESUME_KEY: 'rc_parchisi_active_round',
  _prSerialize() {
    try {
      const e = this.engine;
      if (!e || !this.gameActive || this.roomMode) return null;
      if (this.opponentType === 'hotseat') return null;
      return {
        savedAt: Date.now(),
        playerCount: this.playerCount,
        modeKey: this.mode,
        teams: !!this.teams,
        difficulty: this.difficulty,
        bet: this.bet,
        turnTimer: this.turnTimer,
        humanPlayerIndex: this.humanPlayerIndex,
        eng: {
          players: e.players.map(p => ({
            type: p.type,
            pieces: p.pieces.map(pc => ({ id: pc.id, state: pc.state, pos: pc.pos }))
          })),
          current: e.current,
          dice: e.dice.slice(),
          used: e.used.slice(),
          phase: e.phase,
          bonus: e.bonus ? { dist: e.bonus.dist, kind: e.bonus.kind } : null,
          bonusLegal: e.bonus ? e.bonusLegal.map(pc => ({ id: pc.id, owner: pc.owner })) : [],
          doublesStreak: e.doublesStreak,
          mustBreak: e.mustBreak,
          gameOver: e.gameOver,
          winner: e.winner,
          winnerTeam: e.winnerTeam,
          boardRotation: e.boardRotation,
          rollCount: (e.rollCount || []).slice()
        }
      };
    } catch (er) { return null; }
  },
  _prSave() {
    const d = this._prSerialize();
    try {
      if (d) localStorage.setItem(this.RESUME_KEY, JSON.stringify(d));
      else localStorage.removeItem(this.RESUME_KEY);
    } catch (e) {}
  },
  _prClear() { try { localStorage.removeItem(this.RESUME_KEY); } catch (e) {} },
  _prRestore() {
    /* إعادة بناء المحرك من الحفظ — يعيد true إن استُأنفت جولة حية */
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(this.RESUME_KEY) || 'null'); } catch (e) { return false; }
    if (!raw || !raw.eng || raw.eng.gameOver) { this._prClear(); return false; }
    try {
      const window0 = 2 * 60 * 60 * 1000;
      if (Date.now() - (raw.savedAt || 0) > window0) { this._prClear(); return false; }
      this.playerCount = raw.playerCount || 4;
      this.mode = raw.modeKey || 'classic';
      this.teams = !!raw.teams;
      this.difficulty = raw.difficulty || 'hard';
      this.bet = raw.bet || 0;
      this.turnTimer = (typeof raw.turnTimer === 'number') ? raw.turnTimer : this.turnTimer;
      this.humanPlayerIndex = raw.humanPlayerIndex || 0;
      this.opponentType = 'ai';
      this.roomMode = false;
      const eng = raw.eng;
      const types = eng.players.map(p => p.type);
      const e2 = new ParchisiEngine(this.playerCount, types, this.difficulty, this.mode, { teams: this.teams && this.playerCount === 4, timer: this.turnTimer });
      for (let i = 0; i < this.playerCount && i < eng.players.length; i++) {
        const sp = eng.players[i];
        if (!e2.players[i]) continue;
        e2.players[i].type = sp.type;
        for (let k = 0; k < 4 && k < sp.pieces.length; k++) {
          e2.players[i].pieces[k].state = sp.pieces[k].state;
          e2.players[i].pieces[k].pos = sp.pieces[k].pos;
        }
      }
      e2.current = eng.current || 0;
      e2.dice = (eng.dice || []).slice();
      e2.used = (eng.used || []).slice();
      e2.phase = eng.phase || 'WAIT_ROLL';
      e2.bonus = eng.bonus ? { dist: eng.bonus.dist, kind: eng.bonus.kind } : null;
      e2.bonusLegal = [];
      e2.doublesStreak = eng.doublesStreak || 0;
      e2.mustBreak = !!eng.mustBreak;
      e2.gameOver = false;
      e2.rollCount = (eng.rollCount || []).slice();
      /* مرحلة MOVING مع بيدق مرئي في bonusLegal محفوظ: أعِد ربط الكائنات الفعلية */
      if (e2.phase === 'BONUS' && eng.bonusLegal && eng.bonusLegal.length) {
        const legal = [];
        for (const b of eng.bonusLegal) {
          const pl = e2.players[b.owner];
          const pc = pl && pl.pieces.find(x => x.id === b.id);
          if (pc) legal.push(pc);
        }
        e2.bonusLegal = legal;
      }
      this.engine = e2;
      e2.onStateChange = () => this.onEngineChange();
      this.gameActive = true;
      this._autoTurn = false;
      this._lastBadges = '';
      this._animXY = new Map();
      this._prLog = new Map();
      this._walkFifo = [];
      this._votes = null;
      document.getElementById('parchisiSetup').style.display = 'none';
      document.getElementById('parchisiGame').style.display = 'flex';
      var _gb = document.getElementById('gamePageBody');
      if (_gb) { _gb.classList.remove('parchisi-setup'); _gb.classList.add('parchisi-playing'); }
      this.hideOverModal();
      this.setupBoardFit();
      this.startLoop();
      this.startClock();
      this.onEngineChange();
      /* جلسة الاستئناف + حماية الرهان */
      if (typeof window.SessionResume !== 'undefined') {
        try { window.SessionResume.markRoundStart({ gameId: 'pr', bet: this.bet }); } catch (e) {}
      }
      return true;
    } catch (er) { this._prClear(); return false; }
  },

  close() {
    this.gameActive = false;
    this._autoTurn = false;
    clearTimeout(this._aiT);
    this.stopTimer();
    this.stopClock();
    this.hideOverModal();
    this.stopLoop();
    /* [PR-Resume] الخروج بلا نهاية جولة: الحفظ يبقى (يُستأنف عند العودة) —
       الجولة المنتهية مسحت نفسها في onEngineChange. زر الخروج من نافذة
       النهاية (overExit) يمر هنا بعد gameOver فلا حفظ أصلاً. */
    if (typeof closeGamePage === 'function') {
      closeGamePage();
    }
  },

  /* ═══════════ الرسم ═══════════ */
  startLoop() {
    if (this._raf) return;
    const tick = (t) => {
      if (!this.gameActive) { this._raf = null; return; }
      this.draw(t);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },
  stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  },

  rc(t) { return { x: t.x + t.w / 2, y: t.y + t.h / 2 }; },

  /* [PR-WALK] مسار الخانات بين موقعين منطقيين — البيدق يمشي عليها واحدة واحدة */
  _hopPath(pc, prev, L) {
    const e = this.engine;
    const pts = [];
    try {
      if (prev.state === 'onboard' && pc.state === 'onboard' &&
          pc.pos > prev.pos && pc.pos - prev.pos <= 20) {
        for (let p = prev.pos + 1; p <= pc.pos; p++) {
          let cell = null;
          if (p < 64) cell = PR_TRACK[e.toGlobal(pc.owner, p)];
          else {
            const cor = PR_CORRIDOR[e.seats[pc.owner]];
            cell = cor && cor[p - 64];
          }
          if (cell) { const xy = this.rc(cell); pts.push({ x: xy.x, y: xy.y }); }
        }
      }
    } catch (er) {}
    /* آخر نقطة = الموقع النهائي الدقيق (مع إزاحة التجميع) */
    if (pts.length) pts[pts.length - 1] = { x: L.x, y: L.y };
    else pts.push({ x: L.x, y: L.y });
    return pts;
  },

  /* مواقع القطع (مع إزاحة التكتّل) */
  pieceLayout() {
    const e = this.engine;
    const map = new Map();
    if (!e) return map;
    /* تجميع حسب الخلية */
    const groups = {};
    for (const pl of e.players) {
      for (const pc of pl.pieces) {
        if (pc.state !== 'onboard') continue;
        let key, pos, cell;
        if (pc.pos < 64) {
          const g = e.toGlobal(pc.owner, pc.pos);
          key = 'T' + g;
          cell = PR_TRACK[g];
          pos = this.rc(cell);
        } else {
          const seat = e.seats[pc.owner];
          const rect = PR_CORRIDOR[seat][pc.pos - 64];
          key = 'C' + seat + '-' + pc.pos;
          pos = this.rc(rect);
          cell = rect;
        }
        if (!groups[key]) groups[key] = { pos: pos, cell: cell, list: [] };
        groups[key].list.push(pc);
      }
    }
    for (const k in groups) {
      const g = groups[k];
      const n = g.list.length;
      /* [B6] اتجاه الخانة يحدد محول الترتيب: عمودية = فوق/تحت • أفقية = يمين/يسار
         والمسافات تضمن عدم تغطية أي بيدق لجزء من الآخر (خطوة > قطر) */
      const vertical = !!(g.cell && g.cell.h > g.cell.w);
      for (let i = 0; i < n; i++) {
        let x = g.pos.x, y = g.pos.y;
        if (n === 2) {
          /* [B9] الحجم ثابت دائماً: نفس نصف قطر البيدق المنفرد (10.5) والمركزان
             متباعدان 22 > القطر 21 — بيدقان كاملان بلا أي تغطية */
          const off = 11;
          if (vertical) y += (i === 0 ? -off : off);
          else x += (i === 0 ? -off : off);
          map.set(g.list[i], { x: x, y: y, r: 10.5 });
        } else if (n >= 3) {
          /* [B9] التصغير مسموح فقط عند تجاوز اثنين (خانات الممر السبع الأخيرة)
             كي تتسع الخانة — 3: قطر 20 خطوة 21.5 • 4: قطر 14 خطوة 15 */
          const step = n === 3 ? 21.5 : 15;
          const rr = n === 3 ? 10 : 7;
          const d = (i - (n - 1) / 2) * step;
          if (vertical) y += d; else x += d;
          map.set(g.list[i], { x: x, y: y, r: rr });
        } else {
          map.set(g.list[i], { x: x, y: y, r: 10.5 });
        }
      }
    }
    /* قطع الأعشاش */
    for (const pl of e.players) {
      const seat = e.seats[pl.id];
      for (const pc of pl.pieces) {
        if (pc.state !== 'home') continue;
        const s = PR_BASE[seat][pc.id];
        map.set(pc, { x: s[0], y: s[1], r: 12 });
      }
    }
    return map;
  },

  draw(now) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (now === undefined) now = (typeof performance !== 'undefined' ? performance.now() : 0);
    this._frameDt = Math.max(0, Math.min(64, now - (this._lastT == null ? now : this._lastT)));
    this._lastT = now;
    const W = 600;
    /* [Rotate] تدوير اللوحة عكس عقارب الساعة: اللاعبون ومنازلهم وقطعهم كلها تدور
       كوحدة واحدة حول مركز اللوحة — اللاعب الأحمر يبقى أحمر ومعه قطعه لكن زاويته
       تنتقل لمكان الأخضر، وهكذا. */
    const rot = (this.engine && this.engine.boardRotation) || 0;
    if (rot) {
      ctx.save();
      ctx.translate(W / 2, W / 2);
      ctx.rotate(-Math.PI / 2 * rot);
      ctx.translate(-W / 2, -W / 2);
    }
    /* خلفية بنية دافئة */
    const bg = ctx.createRadialGradient(300, 280, 60, 300, 320, 460);
    bg.addColorStop(0, PR_COLORS.wood.bg1);
    bg.addColorStop(1, PR_COLORS.wood.bg2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, W);
    /* حافة ذهبية خارجية بزوايا قائمة (حدّ الشاشة واللعبة) */
    this.rr(ctx, 3, 3, 594, 594, 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = PR_COLORS.wood.gold;
    ctx.stroke();
    /* اللوحة الخشبية بزوايا قائمة */
    this.rr(ctx, 10, 10, 580, 580, 3);
    const wg = ctx.createLinearGradient(0, 10, 0, 590);
    wg.addColorStop(0, '#98603f');
    wg.addColorStop(0.5, PR_COLORS.wood.frame);
    wg.addColorStop(1, '#6f4128');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = PR_COLORS.wood.frameDark;
    ctx.stroke();
    /* خط ذهبي داخلي يطّر اللوحة */
    this.rr(ctx, 16, 16, 568, 568, 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PR_COLORS.wood.goldDeep;
    ctx.stroke();
    this.rr(ctx, 20, 20, 560, 560, 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,235,200,0.22)';
    ctx.stroke();

    /* قواعد الزوايا */
    this.drawBases(ctx);
    /* خلايا المسار */
    this.drawTrack(ctx);
    /* الممرات الملونة */
    this.drawCorridors(ctx);
    /* المركز */
    this.drawCenter(ctx);
    /* الحواجز */
    this.drawBarriers(ctx);
    /* القطع */
    this.drawPieces(ctx, now);
    /* [Rotate] استرجاع الحالة بعد التدوير */
    if (rot) ctx.restore();
  },

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  },

  drawBases(ctx) {
    const e = this.engine;
    for (let seat = 0; seat < 4; seat++) {
      const n = PR_NEST[seat];
      const col = PR_COLORS.main[seat];
      /* مربع بزوايا مدورة يملأ ركن اللوحة */
      const nx = (n.cx < 300) ? 10 : 396, ny = (n.cy < 300) ? 10 : 396;
      this.rr(ctx, nx, ny, 194, 194, 20);
      const ng = ctx.createLinearGradient(nx, ny, nx + 194, ny + 194);
      ng.addColorStop(0, col);
      ng.addColorStop(1, PR_COLORS.dark[seat]);
      ctx.fillStyle = ng;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PR_COLORS.wood.frameDark;
      ctx.stroke();
      /* فتحات القطع الأربع */
      for (let k = 0; k < 4; k++) {
        const s = PR_BASE[seat][k];
        ctx.beginPath();
        ctx.arc(s[0], s[1], 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.stroke();
      }
      /* [B6] اسم المقعد في مركز المربع أُزيل بطلب صريح (تكرار مع أيقونة اللاعب) —
         الاسم يظهر وحده في وسط أيقونة اللاعب بالزاوية */
    }
  },

  badgeName(pid, seat) {
    const e = this.engine;
    let n = 'P' + (seat + 1);
    if (this.roomMode) n = this.roomPlayerName(pid);
    else if (e.players[pid].type === 'human') n = T('parchisi.you');
    else n = 'AI' + (pid + 1);
    return n.length > 7 ? n.slice(0, 6) + '…' : n;
  },

  drawTrack(ctx) {
    for (let i = 0; i < 68; i++) {
      const t = PR_TRACK[i];
      const x = t.x + 1.5, y = t.y + 1.5, w = t.w - 3, h = t.h - 3;
      const off = PR_OFF.indexOf(i);
      if (off !== -1) {
        /* الساليدة: خلية بلون اللاعب */
        this.rr(ctx, x, y, w, h, 4);
        ctx.fillStyle = PR_COLORS.main[off];
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = PR_COLORS.dark[off];
        ctx.stroke();
      } else {
        /* [B7] العادية بيضاء • الآمنة (نجوم/رؤوس) رمادي فضي */
        const safeCell = PR_STARS.indexOf(i) !== -1 || PR_HEADS.indexOf(i) !== -1;
        this.rr(ctx, x, y, w, h, 4);
        ctx.fillStyle = safeCell ? PR_COLORS.track.safe : PR_COLORS.track.normal;
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = safeCell ? PR_COLORS.track.safeBorder : PR_COLORS.track.normalBorder;
        ctx.stroke();
        if (PR_STARS.indexOf(i) !== -1) {
          this.drawStar(ctx, t.x + t.w / 2, t.y + t.h / 2, Math.min(t.w, t.h) * 0.3);
        } else if (PR_HEADS.indexOf(i) !== -1) {
          /* رأس الذراع: سهم نحو الممر */
          this.drawHeadArrow(ctx, i, t);
        }
      }
    }
    /* قصّات الزوايا الداخلية حيث تلتقي الأذرع */
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = PR_COLORS.wood.cellDark;
    for (const ch of PR_CHAMFER) {
      ctx.beginPath();
      ctx.moveTo(ch[0], ch[1]);
      ctx.lineTo(ch[2], ch[3]);
      ctx.stroke();
    }
    ctx.restore();
  },

  /* سهم مدخل الممر على رأس الذراع */
  drawHeadArrow(ctx, i, t) {
    const dirs = { 67: [0, 1], 16: [1, 0], 33: [0, -1], 50: [-1, 0] };   /* نحو المركز */
    const d = dirs[i];
    if (!d) return;
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const L = Math.min(t.w, t.h) * 0.26;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(d[1], d[0]));
    ctx.beginPath();
    ctx.moveTo(-L * 0.7, 0);
    ctx.lineTo(L * 0.5, 0);
    ctx.moveTo(L * 0.5 - L * 0.55, -L * 0.55);
    ctx.lineTo(L * 0.5, 0);
    ctx.lineTo(L * 0.5 - L * 0.55, L * 0.55);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PR_COLORS.wood.star;
    ctx.stroke();
    ctx.restore();
  },

  drawStar(ctx, cx, cy, R) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rad = (i % 2 === 0) ? R : R * 0.45;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = PR_COLORS.wood.star;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#47332D';
    ctx.stroke();
    ctx.restore();
  },

  drawCorridors(ctx) {
    for (let seat = 0; seat < 4; seat++) {
      const col = PR_COLORS.main[seat];
      for (let i = 0; i < 7; i++) {
        const cell = PR_CORRIDOR[seat][i];
        this.rr(ctx, cell.x + 1.5, cell.y + 1.5, cell.w - 3, cell.h - 3, 4);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.9 - i * 0.06;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = PR_COLORS.dark[seat];
        ctx.stroke();
      }
    }
  },

  drawCenter(ctx) {
    const x0 = 230, y0 = 230, x1 = 370, y1 = 370;
    const cx = 300, cy = 300;
    const e = this.engine;
    /* المثلثات الأربعة (ميتا كل لون) */
    const tri = [
      { seat: 0, pts: [[x0, y0], [x1, y0], [cx, cy]] },   /* أعلى: أحمر */
      { seat: 1, pts: [[x0, y0], [x0, y1], [cx, cy]] },   /* يسار: أخضر */
      { seat: 2, pts: [[x0, y1], [x1, y1], [cx, cy]] },   /* أسفل: أصفر */
      { seat: 3, pts: [[x1, y0], [x1, y1], [cx, cy]] }    /* يمين: أزرق */
    ];
    for (const t of tri) {
      ctx.beginPath();
      ctx.moveTo(t.pts[0][0], t.pts[0][1]);
      ctx.lineTo(t.pts[1][0], t.pts[1][1]);
      ctx.lineTo(t.pts[2][0], t.pts[2][1]);
      ctx.closePath();
      ctx.fillStyle = PR_COLORS.main[t.seat];
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = PR_COLORS.dark[t.seat];
      ctx.stroke();
    }
    this.rr(ctx, x0, y0, 140, 140, 8);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PR_COLORS.wood.cellDark;
    ctx.stroke();
    /* شعار المركز */
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = PR_COLORS.wood.ivory;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#F5C518';
    ctx.stroke();
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2A1715';
    ctx.fillText('🎲', cx, cy + 1);
    /* القطع المنتهية داخل مثلث لونها */
    if (!e) return;
    for (const pl of e.players) {
      const seat = e.seats[pl.id];
      let fin = 0;
      for (const pc of pl.pieces) {
        if (pc.state !== 'finished') continue;
        const k = fin;
        let x, y;
        if (seat === 0) { x = cx; y = y0 + 13 + k * 9; }
        else if (seat === 2) { x = cx; y = y1 - 13 - k * 9; }
        else if (seat === 1) { x = x0 + 13 + k * 9; y = cy; }
        else { x = x1 - 13 - k * 9; y = cy; }
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        const pg = ctx.createRadialGradient(x - 1.5, y - 2, 0.5, x, y, 6);
        pg.addColorStop(0, '#ffffff');
        pg.addColorStop(0.4, PR_COLORS.main[seat]);
        pg.addColorStop(1, PR_COLORS.dark[seat]);
        ctx.fillStyle = pg;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 6.9, 0, Math.PI * 2);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(12,10,8,0.92)';
        ctx.stroke();
        fin++;
      }
    }
  },

  drawBarriers(ctx) {
    const e = this.engine;
    if (!e) return;
    for (let g = 0; g < 68; g++) {
      if (!e.barrierAt(g)) continue;
      const c = this.rc(PR_TRACK[g]);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, 14.5, 0, Math.PI * 2);
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      ctx.restore();
    }
  },

  drawPieces(ctx, now) {
    const e = this.engine;
    if (!e) return;
    /* القطع القابلة للتحريك */
    let hl = null;
    if (!e.gameOver) {
      const humans = this.roomMode ? this.isMyTurn() : (e.players[e.current].type === 'human');
      if (humans && e.phase === 'BONUS') {
        hl = new Set(e.bonusLegal);
      } else if (humans && e.phase === 'MOVING' && this.activeValue != null) {
        hl = new Set(e.optionsFor(this.activeValue));
      }
    }
    const layout = this.pieceLayout();
    if (!this._animXY) this._animXY = new Map();
    if (!this._prLog) this._prLog = new Map();   /* [PR-WALK] آخر موقع منطقي لكل بيدق */
    /* انسياب مريح بصرياً: البيادق تمشي خانةً خانة (مسير واقعي) بدل القفز الفوري */
    const k = this._frameDt ? (1 - Math.exp(-this._frameDt / 190)) : 1;
    const pulse = 0.55 + 0.45 * Math.sin(now / 260);
    for (const pl of e.players) {
      const seat = e.seats[pl.id];
      for (const pc of pl.pieces) {
        if (pc.state === 'finished') { this._prLog.set(pc, { state: 'finished', pos: pc.pos }); continue; }   /* تُرسم في المركز */
        const L = layout.get(pc);
        if (!L) continue;
        let ap = this._animXY.get(pc);
        if (!ap) {
          ap = { x: L.x, y: L.y, q: [] };
          this._animXY.set(pc, ap);
          this._prLog.set(pc, { state: pc.state, pos: pc.pos });
        }
        /* [PR-WALK] تغيّر الموقع المنطقي ⇒ بناء مسار خانة-خانة */
        const prev = this._prLog.get(pc);
        if (!prev || prev.state !== pc.state || prev.pos !== pc.pos) {
          const path = prev ? this._hopPath(pc, prev, L) : null;
          this._prLog.set(pc, { state: pc.state, pos: pc.pos });
          if (path) {
            ap.q = path; ap._hl = null;
            /* [PR-SEQ] طابور المسير: بيدق واحد فقط يتحرك في اللحظة الواحدة —
               التالي لا يبدأ حتى يستقر الأول في خانته (واقعية الحركة) */
            if (!this._walkFifo) this._walkFifo = [];
            if (this._walkFifo.indexOf(pc) === -1) this._walkFifo.push(pc);
            if (!this._replaying && typeof SND !== 'undefined') {
              try {
                if (prev.state === 'home' && pc.state === 'onboard') { if (SND.prEnter) SND.prEnter(); }
                else if (pc.state === 'home') { /* ضحية قتل — الصوت من إشعار القتل */ }
                else if (path.length > 1 && SND.prMove) SND.prMove();
              } catch (er) {}
            }
          }
        }
        if (ap.q && ap.q.length && this._walkFifo && this._walkFifo[0] !== pc) {
          /* [PR-SEQ] بيدق آخر يتحرك الآن — هذا ينتظر دوره في مكانه */
        } else if (ap.q && ap.q.length) {
          /* مسير بسرعة ثابتة: ~150مث لكل خانة — واقعي لا فجائي */
          const wp = ap.q[0];
          if (ap._hl == null) ap._hl = Math.max(1, Math.hypot(wp.x - ap.x, wp.y - ap.y));
          const dtm = this._frameDt || 16;
          const step = ap._hl * dtm / 150;
          const dx = wp.x - ap.x, dy = wp.y - ap.y, dd = Math.hypot(dx, dy);
          if (dd <= step || dd < 0.3) {
            ap.x = wp.x; ap.y = wp.y; ap.q.shift(); ap._hl = null;
            if (!ap.q.length && this._walkFifo) {
              /* [PR-SEQ] استقر البيدق — أخرجه من الطابور ليتحرك التالي */
              const fi = this._walkFifo.indexOf(pc);
              if (fi !== -1) this._walkFifo.splice(fi, 1);
            }
            if (!this._replaying && ap.q.length && typeof SND !== 'undefined' && SND.prStep) { try { SND.prStep(); } catch (er) {} }
          } else { ap.x += dx / dd * step; ap.y += dy / dd * step; }
        } else if (ap.x !== L.x || ap.y !== L.y) {
          /* إزاحة تجميع داخل نفس الخانة: انسياب ناعم قصير */
          ap.x += (L.x - ap.x) * k;
          ap.y += (L.y - ap.y) * k;
          if (Math.abs(L.x - ap.x) < 0.25 && Math.abs(L.y - ap.y) < 0.25) { ap.x = L.x; ap.y = L.y; }
        }
        const PX = ap.x, PY = ap.y, R = L.r;
        if (hl && hl.has(pc)) {
          ctx.save();
          ctx.shadowColor = 'rgba(245,197,24,0.95)';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(PX, PY, R + 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245,197,24,' + (0.55 + 0.45 * pulse) + ')';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        }
        /* ظل */
        ctx.beginPath();
        ctx.ellipse(PX + 1.5, PY + 3, R * 0.95, R * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
        /* الجسم */
        const pg = ctx.createRadialGradient(PX - R * 0.3, PY - R * 0.4, 1, PX, PY, R);
        pg.addColorStop(0, '#ffffff');
        pg.addColorStop(0.32, PR_COLORS.main[seat]);
        pg.addColorStop(1, PR_COLORS.dark[seat]);
        ctx.beginPath();
        ctx.arc(PX, PY, R, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        /* [B5] حلقة سوداء إضافية خارجية — وضوح أعلى على كل الخلفيات */
        ctx.beginPath();
        ctx.arc(PX, PY, R + 2.1, 0, Math.PI * 2);
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = 'rgba(12,10,8,0.92)';
        ctx.stroke();
        /* لمعان */
        ctx.beginPath();
        ctx.arc(PX - R * 0.3, PY - R * 0.42, R * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
      }
    }
  }
};

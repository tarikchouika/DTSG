/* ════════════════════════════════════════════════════════════════════
   Dama Maghribia — Moroccan Checkers
   Ported faithfully from the Unity C# "Dama Maghribia v1.0.0" Core:
     Rules/ (DamaRules, RuleEngine, Movement/Capture/Promotion/Souffler),
     Game/  (DamaGame, TurnManager, WinChecker, GameState),
     AI/    (Minimax = Negamax + Alpha-Beta, Evaluation).
   ── Convention (identical to the C# engine) ──
     row 0 = top = Black home ; row 7 = bottom = White home.
     White advances toward row 0 ; Black advances toward row 7.
     Dark playable squares: (row + col) % 2 === 1.
     White forward dirs: [-1,-1],[-1,+1] ; Black forward dirs: [+1,-1],[+1,+1].
     Promotion: White at row 0, Black at row 7.
   Moroccan competitive ruleset:
     mandatory capture, Man moves & captures FORWARD ONLY, multi-capture (same
     piece keeps jumping), Flying King (slides any empty diagonal + long
     captures), immediate promotion. Only the King travels all diagonals.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var WHITE = 'w', BLACK = 'b';
var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var DAMA_WIN = 1000000, DAMA_LOSE = -1000000;

function damaForwardDirs(owner) { return owner === WHITE ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]; }
function damaInB(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function damaIsDark(r, c) { return ((r + c) & 1) === 0; }

/* ── Pure rule engine operating on a small state object ── */
function DamaEngine(rules) {
  this.rules = rules || {
    mandatoryCapture: true,    /* [Souffler] الالتزام بالأكل موجود لكن اللاعب حر في الرفض */
    souffler: true,            /* [Souffler] القطعة التي رفضت الأكل تُنفخ */
    manBackwardCapture: false,
    multiCapture: true,
    flyingKing: true,
    promoteImmediately: true,
    maxChain: true,
    /* [v2.44-RULES-MODE] قانون الإلزام/النفخ — ثلاثة أوضاع:
         · 'ladder' (الافتراضي — قانون المالك المُعلن 2026-09-19):
             ١) الأولوية في الإلزام للضائم (الملك) عند تساوي طول السلسلتين؛
             ٢) ثم صاحب السلسلة الأكبر؛
             ٣) الضائم المُلزَم يجب أن يأكل **وأن يُتمّ سلسلته** وإلا نُفخ؛
             ٤) وإن كانت السلسلتان لبيدقين عاديين فإتمام إحداهما يُسقط الإلزام عن الأخرى.
         · 'overall' : الواجب = أطول سلسلة في الدور كله، وإتمامها بأي قطعة يُبرّئ (ومنها الضائم).
         · 'piece'   : الواجب على القطعة المُلزَمة نفسها دائماً — بلا استثناء.
       يُبدَّل بسطر واحد: DAMA.eng.rules.obligation = 'overall' | 'piece' */
    obligation: 'ladder'
  };
}
DamaEngine.prototype.opponent = function (p) { return p === WHITE ? BLACK : WHITE; };

/* [v2.44] تفريغ ذاكرة الواجب عند أي حالة جديدة (لا تسرّب بين المباريات) */
function damaClearCaches() { try { DAMA_OBLIG_CACHE.clear(); } catch (e) {} }

function damaNewState() {
  var grid = [];
  for (var r = 0; r < 8; r++) grid.push([null, null, null, null, null, null, null, null]);
  var id = 0;
  for (var row = 0; row < 3; row++)
    for (var col = 0; col < 8; col++)
      if (damaIsDark(row, col)) grid[row][col] = { owner: BLACK, king: false, id: id++ };
  for (var row2 = 5; row2 < 8; row2++)
    for (var col2 = 0; col2 < 8; col2++)
      if (damaIsDark(row2, col2)) grid[row2][col2] = { owner: WHITE, king: false, id: id++ };
  return { grid: grid, turn: WHITE, cont: null, half: 0, moves: 0, over: false, outcome: null, obligedId: null, obligedFulfilled: false };
}
function damaCloneGrid(g) {
  var ng = [];
  for (var r = 0; r < 8; r++) {
    var row = [];
    for (var c = 0; c < 8; c++) {
      var p = g[r][c];
      row.push(p ? { owner: p.owner, king: p.king, pendingKing: !!p.pendingKing, id: p.id } : null);
    }
    ng.push(row);
  }
  return ng;
}
DamaEngine.prototype.cloneState = function (s) {
  return {
    grid: damaCloneGrid(s.grid),
    turn: s.turn,
    cont: s.cont ? [s.cont[0], s.cont[1]] : null,
    half: s.half, moves: s.moves, over: s.over, outcome: s.outcome,
    obligedId: s.obligedId, obligedFulfilled: !!s.obligedFulfilled,
    /* [v2.44-ENGINE-FIX] كان النسخ يُسقط هذه الحقول الثلاثة، فيرى البحث وسط السلسلة
       أن لا واجب عليه وأن عدّاد أكله صفر ⇒ يظنّ أن التقصير بلا عقوبة (نفخ) فيلعب
       خطوطاً خاسرة داخلياً ويقصر السلاسل الواجبة = «الذكاء الاصطناعي غبي». */
    obligedIsKing: !!s.obligedIsKing,
    obligedNeed: (s.obligedNeed != null) ? s.obligedNeed : 0,
    obligedMax: (s.obligedMax != null) ? s.obligedMax : 0,
    turnCaptures: (s.turnCaptures != null) ? s.turnCaptures : 0,
    chainNeed: (s.chainNeed != null) ? s.chainNeed : null
  };
};

/* Single-hop captures for the piece at (r,c). */
DamaEngine.prototype.capturesAt = function (grid, r, c) {
  var piece = grid[r][c];
  if (!piece) return [];
  var out = [];
  if (piece.king && this.rules.flyingKing) {
    for (var d = 0; d < 4; d++) {
      var dr = DIAG[d][0], dc = DIAG[d][1];
      var rr = r + dr, cc = c + dc, enemyFound = false, er = -1, ec = -1;
      while (damaInB(rr, cc)) {
        var cell = grid[rr][cc];
        if (!cell) {
          if (enemyFound) out.push({ from: [r, c], to: [rr, cc], cap: true, captured: [[er, ec]], pieceId: piece.id });
        } else {
          if (cell.owner === piece.owner) break;
          if (enemyFound) break;        /* second piece in the same ray stops the slide */
          enemyFound = true; er = rr; ec = cc;
        }
        rr += dr; cc += dc;
      }
    }
  } else {
    var dirs = this.rules.manBackwardCapture ? DIAG : damaForwardDirs(piece.owner);
    for (var d2 = 0; d2 < dirs.length; d2++) {
      var dr2 = dirs[d2][0], dc2 = dirs[d2][1];
      var er2 = r + dr2, ec2 = c + dc2, lr = r + dr2 * 2, lc = c + dc2 * 2;
      if (!damaInB(er2, ec2) || !damaInB(lr, lc)) continue;
      var en = grid[er2][ec2];
      if (!en || en.owner === piece.owner) continue;
      if (grid[lr][lc]) continue;
      out.push({ from: [r, c], to: [lr, lc], cap: true, captured: [[er2, ec2]], pieceId: piece.id });
    }
  }
  return out;
};

/* Normal (non-capture) moves for the piece at (r,c). */
DamaEngine.prototype.movesAt = function (grid, r, c) {
  var piece = grid[r][c];
  if (!piece) return [];
  var out = [];
  if (piece.king && this.rules.flyingKing) {
    for (var d = 0; d < 4; d++) {
      var dr = DIAG[d][0], dc = DIAG[d][1];
      var rr = r + dr, cc = c + dc;
      while (damaInB(rr, cc)) {
        if (grid[rr][cc]) break;
        out.push({ from: [r, c], to: [rr, cc], cap: false, captured: [], pieceId: piece.id });
        rr += dr; cc += dc;
      }
    }
  } else {
    var dirs = damaForwardDirs(piece.owner);
    for (var d2 = 0; d2 < dirs.length; d2++) {
      var dr2 = dirs[d2][0], dc2 = dirs[d2][1];
      var tr = r + dr2, tc = c + dc2;
      if (damaInB(tr, tc) && !grid[tr][tc])
        out.push({ from: [r, c], to: [tr, tc], cap: false, captured: [], pieceId: piece.id });
    }
  }
  return out;
};

DamaEngine.prototype.allCaptures = function (grid, owner) {
  var out = [];
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = grid[r][c];
    if (p && p.owner === owner) {
      var caps = this.capturesAt(grid, r, c);
      for (var i = 0; i < caps.length; i++) out.push(caps[i]);
    }
  }
  return out;
};

/* [B9] أقصى عمق سلسلة أكل من قطعة (DFS بخطوات القفز) — الترقية توقف السلسلة */
DamaEngine.prototype.chainDepth = function (grid, r, c) {
  var caps = this.capturesAt(grid, r, c);
  if (!caps.length) return 0;
  var best = 0;
  for (var i = 0; i < caps.length; i++) {
    var mv = caps[i];
    var g2 = damaCloneGrid(grid);
    for (var k = 0; k < mv.captured.length; k++) g2[mv.captured[k][0]][mv.captured[k][1]] = null;
    g2[mv.to[0]][mv.to[1]] = g2[mv.from[0]][mv.from[1]];
    g2[mv.from[0]][mv.from[1]] = null;
    var d = 1;
    if (!this.shouldPromote(g2[mv.to[0]][mv.to[1]], mv.to[0])) d += this.chainDepth(g2, mv.to[0], mv.to[1]);
    if (d > best) best = d;
  }
  return best;
};

/* [B9] أفضل سلسلة متاحة للاعب: عدد الضحايا الأقصى */
DamaEngine.prototype.maxChainOfTurn = function (grid, player) {
  var best = 0;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = grid[r][c];
    if (p && p.owner === player) {
      var d = this.chainDepth(grid, r, c);
      if (d > best) best = d;
    }
  }
  return best;
};

/* [B9] جهوزية قفزة أولى: 1 + أقصى استمرارية بعدها (الترقية توقف) */
DamaEngine.prototype.hopPotential = function (grid, mv) {
  var g2 = damaCloneGrid(grid);
  for (var k = 0; k < mv.captured.length; k++) g2[mv.captured[k][0]][mv.captured[k][1]] = null;
  g2[mv.to[0]][mv.to[1]] = g2[mv.from[0]][mv.from[1]];
  g2[mv.from[0]][mv.from[1]] = null;
  if (this.shouldPromote(g2[mv.to[0]][mv.to[1]], mv.to[0])) return 1;
  return 1 + this.chainDepth(g2, mv.to[0], mv.to[1]);
};

/* [B9] قفزات الاستمرارية: المتمِّمة للسلسلة المثلى فقط */
DamaEngine.prototype.continuationMoves = function (s, relaxed) {
  var hops = this.capturesAt(s.grid, s.cont[0], s.cont[1]);
  if (relaxed || !this.rules.maxChain || s.chainNeed == null || s.chainNeed <= 1) return hops;
  var out = [];
  for (var i = 0; i < hops.length; i++) {
    if (this.hopPotential(s.grid, hops[i]) === s.chainNeed) { hops[i].potential = s.chainNeed; out.push(hops[i]); }
  }
  return out.length ? out : hops;
};

DamaEngine.prototype.legalMoves = function (s, player, relaxed) {
  if (s.over) return [];
  if (s.cont) return this.continuationMoves(s, relaxed);
  /* [Souffler Rule] اللاعب حر في تحريك أي قطعة — تُعرض كل الحركات المتاحة
     (أكل + هادئة). الذكاء الاصطناعي يُفضّل الأكل عبر دالة التقييم. */
  var out = this.allCaptures(s.grid, player);
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.grid[r][c];
    if (p && p.owner === player) {
      var m = this.movesAt(s.grid, r, c);
      for (var i = 0; i < m.length; i++) {
        m[i].pieceId = p.id;
        out.push(m[i]);
      }
    }
  }
  return out;
};

/* Legal destinations for a specific piece (for tap highlighting).
   [Souffler Rule] اللاعب حر في تحريك أي قطعة — حتى مع وجود أكل إلزامي.
   عند وجود أكل ممكن، تُعرض الحركات الهادئة أيضاً (مما يسمح باللاعب
   بتجاهل الأكل). القطعة التي توفر لها أكل ولم تأكل تُنفخ في applyMove. */
DamaEngine.prototype.legalMovesForPiece = function (s, r, c) {
  if (s.over) return [];
  var piece = s.grid[r][c];
  if (!piece || piece.owner !== s.turn) return [];
  if (s.cont) {
    if (s.cont[0] !== r || s.cont[1] !== c) return [];
    return this.continuationMoves(s);
  }
  /* اعرض كل الحركات المتاحة: أكل + هادئة — اللاعب يختار */
  var mine = this.capturesAt(s.grid, r, c);
  var nm = this.movesAt(s.grid, r, c);
  for (var i = 0; i < nm.length; i++) mine.push(nm[i]);
  return mine;
};

/* [v2.43 RULES-FIX] أطول سلسلة أكل متاحة للاعب في الدور الحالي على كل قطعه —
   المرجع الصحيح للإلزام: من نفّذ أطول أكل (بأي قطعة) أدّى الواجب. */
DamaEngine.prototype.maxChainOverall = function (s) {
  var m = 0;
  /* [v2.44-ENGINE-FIX] سقف منطقي: لا يمكن أن تتجاوز السلسلة عدد قطع الخصم ⇒ إيقاف مبكر */
  var enemy = 0;
  for (var er = 0; er < 8; er++) for (var ec = 0; ec < 8; ec++) {
    var ep = s.grid[er][ec];
    if (ep && ep.owner !== s.turn) enemy++;
  }
  for (var r = 0; r < 8 && m < enemy; r++) for (var c = 0; c < 8; c++) {
    var p = s.grid[r][c];
    if (!p || p.owner !== s.turn) continue;
    var ch = this.maxChainAt(s.grid, r, c);
    if (ch > m) m = ch;
    if (m >= enemy) break;
  }
  return m;
};

/* [v2.44-ENGINE-FIX] ذاكرة مؤقتة لمعلومات الواجب (قطعة/طول) بمفتاح (الدور + تخطيط اللوح):
   كانت تُحسب لكل عقدة بحث بكلفة أسّية ⇒ تُقصّر العمق فيبدو البوت غبياً.
   التكرار (iterative deepening) يعيد زيارة المواضع نفسها فتستفيد الذاكرة كثيراً. */
var DAMA_OBLIG_CACHE = new Map();
function damaGridKey(grid) {
  var k = '';
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = grid[r][c];
    k += !p ? '.' : (p.owner === WHITE ? (p.king ? 'W' : 'w') : (p.king ? 'B' : 'b'));
  }
  return k;
}
DamaEngine.prototype.obligationInfo = function (s) {
  var key = (s.turn === WHITE ? 'w' : 'b') + damaGridKey(s.grid);
  var hit = DAMA_OBLIG_CACHE.get(key);
  if (hit !== undefined) return hit;
  var ob = (this.rules.souffler) ? this.obligationPiece(s) : null;
  /* [v2.44-FIX2] نخزّن **الموقع** لا المعرّف: المعرّفات تُعاد ترقيمها بين الحالات المختلفة
     (اختبار الرشّ/المباريات الجديدة) وكانت الذاكرة تُعيد معرّفاً بائداً فيُنفخ حجر خاطئ
     أو لا يقع النفخ أصلاً. الموقع + تخطيط اللوح = مفتاح الذاكرة نفسه ⇒ صحيح دائماً. */
  var obPiece = ob ? s.grid[ob[0]][ob[1]] : null;
  var info = {
    pos: ob ? [ob[0], ob[1]] : null,
    need: ob ? this.maxChainAt(s.grid, ob[0], ob[1]) : 0,
    max: this.maxChainOverall(s),
    isKing: !!(obPiece && obPiece.king)     /* [v2.44-LADDER] الضائم له حكم خاص */
  };
  if (DAMA_OBLIG_CACHE.size > 30000) DAMA_OBLIG_CACHE.clear();   /* حماية الذاكرة */
  DAMA_OBLIG_CACHE.set(key, info);
  return info;
};

/* أطول سلسلة أكل متاحة لقطعة عند مربع معيّن (قفزة أولى + أقصى استمرارية). */
DamaEngine.prototype.maxChainAt = function (grid, r, c) {
  var caps = this.capturesAt(grid, r, c);
  var m = 0;
  for (var i = 0; i < caps.length; i++) {
    var h = this.hopPotential(grid, caps[i]);
    if (h > m) m = h;
  }
  return m;
};

/* [Souffler — توضيح المالك 2026-09-16] الحجر «الأكبر إلزاماً» بالأكل للاعب الحالي:
   ١) الضائم (الملك الذي وصل منطقة الخصم) أُلزم بالأكل من البيدق العادي؛
   ٢) صاحب سلسلة الأكل الأكبر يُلزم قبل صاحب السلسلة الأقصر؛
   ٣) يبقى البيدق ملزماً بإتمام سلسلة الأكل وإلا نُفخ.
   تُستعمل لاختيار الحجر الذي يُنفخ إن لم يأكل اللاعب. تُعاد [r,c] أو null. */
DamaEngine.prototype.obligationPiece = function (s) {
  var player = s.turn;
  var best = null, bestKing = -1, bestChain = -1, bestCnt = -1;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.grid[r][c];
    if (!p || p.owner !== player) continue;
    var caps = this.capturesAt(s.grid, r, c);
    if (!caps.length) continue;
    var k = p.king ? 1 : 0;
    var chain = this.maxChainAt(s.grid, r, c);
    /* [v2.43 RULES-FIX] الأولوية للأطول (كما في التعليق والقاعدة): كان الملك
       يتقدّم على سلسلة أطول منه ⇒ لاعب يُنفّذ أطول أكل صحيح ثم تُنفخ قطعة أخرى. */
    if (chain > bestChain || (chain === bestChain && k > bestKing) ||
        (chain === bestChain && k === bestKing && caps.length > bestCnt)) {
      bestKing = k; bestChain = chain; bestCnt = caps.length;
      best = [r, c];
    }
  }
  return best;
};

DamaEngine.prototype.shouldPromote = function (piece, toR) {
  if (piece.king) return false;
  return piece.owner === WHITE ? toR === 0 : toR === 7;
};

/* Apply a move to a state (mutating). Returns {promoted, continued, captured, souffled}. */
DamaEngine.prototype.applyMove = function (s, mv) {
  var fr = mv.from[0], fc = mv.from[1], tr = mv.to[0], tc = mv.to[1];
  var piece = s.grid[fr][fc];
  var info = { promoted: false, continued: false, captured: [], souffled: null, pendingPromotion: false };
  /* [B9] بداية سلسلة أكل: سجّل طول السلسلة المثلى المطلوبة (من القفزة المختارة) */
  if (mv.cap && !s.cont && s.chainNeed == null) {
    s.chainNeed = mv.potential != null ? mv.potential : (this.hopPotential(s.grid, mv) || 1);
  }
  /* [Souffler] عند بداية الدور نُسجّل الحجر المُلزَم بالأكل (الأكبر أولوية) بهويّته
     وطول سلسلة الأكل المطلوبة منه (توضيح المالك: السلسلة الأكبر إلزاماً وإتمامها واجب) */
  if (!s.cont) {
    /* [v2.44-ENGINE-FIX] حساب واحد مُذاكَر لكل موضع بدل تكراره في كل عقدة بحث */
    var oi = this.obligationInfo(s);
    s.obligedId = (oi.pos && s.grid[oi.pos[0]][oi.pos[1]]) ? s.grid[oi.pos[0]][oi.pos[1]].id : null;
    s.obligedNeed = oi.need;
    s.obligedIsKing = !!oi.isKing;      /* [v2.44-LADDER] هل المُلزَم ضائم؟ */
    /* [v2.43 RULES-FIX] المرجع = أطول سلسلة متاحة في الدور كله: إتمامها بأي قطعة
       يُبرّئ الالتزام (كان الالتزام مربوطاً بقطعة واحدة فقط فيُعاقَب لاعب صحيح) */
    s.obligedMax = oi.max;
    s.turnCaptures = 0;
    s.obligedFulfilled = false;
  }
  if (mv.cap) {
    /* الأكل بالمُلزَم نفسه يُبرّئ الالتزام؛ الأكل بقطعة أخرى لا يُبرّئه (الأولوية للمُلزَم) */
    if (s.obligedId != null && piece && piece.id === s.obligedId) s.obligedFulfilled = true;
    s.turnCaptures = (s.turnCaptures || 0) + mv.captured.length;
    for (var i = 0; i < mv.captured.length; i++) {
      var cr = mv.captured[i][0], cc = mv.captured[i][1];
      var en = s.grid[cr][cc];
      if (en) { info.captured.push([cr, cc, en.owner, en.king]); s.grid[cr][cc] = null; }
    }
  }
  s.grid[tr][tc] = piece;
  s.grid[fr][fc] = null;
  /* [B9] الصف الأخير للبيدق: إن وصل بالأكل وتوفرت تتمة سلسلة — يتوقف هنا
     (تُهجر السلسلة) ويُتوَّج ملكاً بعد مرور دور كامل (ترقية مؤجلة) */
  var promoNow = false, promoPending = false;
  if (this.shouldPromote(piece, tr)) {
    if (this.rules.promoteImmediately) {
      /* التتمة تُفحص والقطعة ضائمة (الترقية تتقدم على الاستمرارية) */
      var contAvail = [];
      if (mv.cap && this.rules.multiCapture) {
        piece.king = true;
        contAvail = this.capturesAt(s.grid, tr, tc);
        piece.king = false;
      }
      if (contAvail.length) {
        piece.pendingKing = true; promoPending = true; info.pendingPromotion = true;
      } else {
        piece.king = true; promoNow = true; info.promoted = true;
      }
    }
  }
  /* 50-move clock: capture or Man quiet move resets; King quiet move increments */
  if (mv.cap || !piece.king) s.half = 0; else s.half++;
  if (s.chainNeed != null) s.chainNeed--;          /* [B9] خطوة نحو إتمام السلسلة */
  if (this.rules.multiCapture && mv.cap && !promoNow && !promoPending) {
    var more = this.capturesAt(s.grid, tr, tc);
    if (more.length) { s.cont = [tr, tc]; info.continued = true; return info; }
  }
  /* [Souffler] نهاية الدور: إن لم يأكل بالمُلزَم تحديداً يُنفخ هو (حتى لو أكل بقطعة أخرى)،
     وإن أكل بالمُلزَم لكن لم يُتمّ سلسلة الأكل الكاملة المطلوبة منه يُنفخ كذلك
     (توضيح المالك 2026-09-16: إتمام السلسلة واجب وإلا نفخ). */
  /* [v2.43 RULES-FIX] النفخ فقط عند تقصير الأكل: من نفّذ أطول سلسلة متاحة
     (ولو بقطعة أخرى، أو بأقل من القطعة "الأولى") أدّى الواجب ولا يُعاقب. */
  /* [v2.44-RULES-MODE] المرجع يتبع الوضع المختار (انظر rules.obligation في المُنشئ) */
  var obligMode = (this.rules.obligation === 'piece' || this.rules.obligation === 'ladder') ? this.rules.obligation : 'overall';
  var need, shortCapture, capsDone = (s.turnCaptures || 0);
  if (obligMode === 'piece') {
    need = Math.max(s.obligedNeed || 0, 0);
    /* لم يأكل بالقطعة المُلزَمة أصلاً، أو أكل بها ولم يُتمّ سلسلتها */
    shortCapture = (!s.obligedFulfilled) || (capsDone < need);
  } else if (obligMode === 'ladder') {
    /* [v2.44-LADDER — قانون المالك] الضائم المُلزَم لا يُبرّئه إلا أكلُه هو وإتمامُ سلسلته،
       أما البيدق المُلزَم فيُبرّئه إتمامُ سلسلة مساوية (ولو ببيدق آخر): إتمام واحدة
       يُسقط الإلزام عن الثانية. */
    if (s.obligedIsKing) {
      need = Math.max(s.obligedNeed || 0, 0);
      shortCapture = (!s.obligedFulfilled) || (capsDone < need);
    } else {
      need = Math.max(s.obligedMax || 0, 0);
      shortCapture = capsDone < need;
    }
  } else {
    need = Math.max(s.obligedMax || 0, 0);
    shortCapture = capsDone < need;
  }
  if (this.rules.souffler && s.obligedId != null && shortCapture) {
    for (var r = 0; r < 8 && !info.souffled; r++) {
      for (var c = 0; c < 8; c++) {
        var pp = s.grid[r][c];
        if (pp && pp.id === s.obligedId) { s.grid[r][c] = null; info.souffled = [r, c]; s.half = 0; break; }
      }
    }
  }
  s.obligedId = null; s.obligedFulfilled = false; s.obligedNeed = 0; s.obligedMax = 0; s.turnCaptures = 0; s.obligedIsKing = false;
  s.cont = null; s.chainNeed = null;
  s.turn = this.opponent(s.turn);
  /* [B9] الترقية المؤجلة: تُحسم بعد مرور الدور — يُتوَّج الآن ما استحق من صاحب الدور الجديد */
  var crownedNow = this._resolvePending(s);
  if (crownedNow.length) info.crownedDeferred = crownedNow;
  s.moves++;
  return info;
};

/* [B9] توويج القطعات المؤجلة الملكية التي مُنح لها الدور الآن */
DamaEngine.prototype._resolvePending = function (s) {
  var promoted = [];
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.grid[r][c];
    if (p && p.pendingKing && p.owner === s.turn) {
      p.pendingKing = false; p.king = true;
      promoted.push([r, c]);
    }
  }
  return promoted;
};

/* Win / draw detection (called only after a turn fully ends, cont === null). */
DamaEngine.prototype.detectOutcome = function (s) {
  if (s.over) return s.outcome;
  /* [B9] القطعة المعلّقة ترقيتها ستُتوَّج حتماً قبل أن يُطلب منها التحرك —
     تُقيَّم حركتها كضائمة حتى لا تُحسب خسارة زوراً */
  var s2 = s;
  var hasPending = false;
  for (var pr = 0; pr < 8 && !hasPending; pr++) for (var pc = 0; pc < 8; pc++) {
    var pp = s.grid[pr][pc];
    if (pp && pp.pendingKing) { hasPending = true; break; }
  }
  if (hasPending) {
    s2 = this.cloneState(s);
    for (var r2 = 0; r2 < 8; r2++) for (var c2 = 0; c2 < 8; c2++) {
      var p2 = s2.grid[r2][c2];
      if (p2 && p2.pendingKing) { p2.pendingKing = false; p2.king = true; }
    }
  }
  if (this.legalMoves(s2, WHITE, true).length === 0) return BLACK;   /* White out of pieces or blocked */
  if (this.legalMoves(s2, BLACK, true).length === 0) return WHITE;
  if (s.half >= 100) return 'draw';                            /* 50-move rule */
  if (s.moves >= 300) return 'draw';                           /* safety cap */
  return null;
};

/* ── Evaluation (ported from AI/Evaluation.cs) ── */
DamaEngine.prototype.evaluate = function (s, ai) {
  if (s.over) {
    if (s.outcome === 'draw') return 0;
    if (s.outcome === ai) return DAMA_WIN - s.moves;
    return DAMA_LOSE + s.moves;
  }
  var score = 0;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.grid[r][c];
    if (!p) continue;
    var sign = p.owner === ai ? 1 : -1;
    var val = p.king ? 300 : 100;
    var pos = 0;
    if (c >= 2 && c <= 5) pos += 8;                 /* center files */
    if (p.king) {
      if (c === 0 || c === 7) pos -= 4;             /* king on the edge is weaker */
    } else {
      var adv = p.owner === WHITE ? (7 - r) : r;    /* closer to promotion */
      pos += 6 * adv;
      if ((p.owner === WHITE && r === 7) || (p.owner === BLACK && r === 0)) pos += 4; /* back-rank defense */
    }
    score += sign * (val + pos);
  }
  return score;
};

function damaOrderMoves(moves) {
  return moves.slice().sort(function (a, b) {
    var ca = a.cap ? 1 : 0, cb = b.cap ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return b.captured.length - a.captured.length;
  });
}

/* Negamax with alpha-beta (ported from AI/Minimax.cs).
   القيمة عند الأوراق نسبيةٌ لجهة الدور (rel) كي يتطابق التقليب مع negamax. */
DamaEngine.prototype.search = function (s, ai, depth, alpha, beta) {
  /* [AI-MAX] فحص مهلة كل 64 عقدة (شبكة cloneState ثقيلة نسبياً) — التكرار
     العميق الواحد يُقطع عند الموعد لا بعده؛ القفزة يلتقطها aiPick */
  if ((++DAMA_SEARCH_NODES & 63) === 0 && DAMA_SEARCH_DEADLINE !== Infinity &&
      performance.now() > DAMA_SEARCH_DEADLINE) throw { damaAbort: true };
  var rel = (s.turn === ai) ? 1 : -1;
  if (s.over) return rel * this.evaluate(s, ai);
  if (depth <= 0) return rel * this.evaluate(s, ai);
  var player = s.turn;
  var moves = this.legalMoves(s, player, true);   /* [B9] relaxed داخل البحث — الصرامة عند الجذر فقط */
  if (moves.length === 0) return -DAMA_WIN + s.moves;   /* جهة الدور محبوسة ⇒ تخسر */
  moves = damaOrderMoves(moves);
  var best = -DAMA_WIN - 1;
  for (var i = 0; i < moves.length; i++) {
    var child = this.cloneState(s);
    this.applyMove(child, moves[i]);
    var sc;
    if (child.cont) sc = this.search(child, ai, depth, alpha, beta);   /* same side moves again */
    else sc = -this.search(child, ai, depth - 1, -beta, -alpha);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
};

/* Root search: returns the best move (random among near-equal best for variety). */
DamaEngine.prototype.findBestMove = function (s, ai, depth) {
  var moves = this.legalMoves(s, s.turn);
  if (!moves.length) return null;
  moves = damaOrderMoves(moves);
  var alpha = -DAMA_WIN - 1, beta = DAMA_WIN + 1;
  var bestScore = -DAMA_WIN - 1;
  var scored = [];
  for (var i = 0; i < moves.length; i++) {
    var child = this.cloneState(s);
    this.applyMove(child, moves[i]);
    var sc;
    if (child.cont) sc = this.search(child, ai, depth, alpha, beta);
    else sc = -this.search(child, ai, depth - 1, -beta, -alpha);
    scored.push({ m: moves[i], s: sc });
    if (sc > bestScore) bestScore = sc;
    if (bestScore > alpha) alpha = bestScore;
  }
  /* pick randomly within a tiny window of the best (variety, no weakness) */
  var pool = [];
  for (var j = 0; j < scored.length; j++) if (scored[j].s >= bestScore - 3) pool.push(scored[j].m);
  return pool[Math.floor(Math.random() * pool.length)] || scored[0].m;
};

/* [AI-MAX] عدّاد العقد وموعد المهلة النهائي للبحث الداخلي (Deadline حقيقي) */
var DAMA_SEARCH_NODES = 0;
var DAMA_SEARCH_DEADLINE = Infinity;

/* Iterative-deepening driver with a wall-clock budget (never freezes the UI). */
DamaEngine.prototype.aiPick = function (s, ai, maxDepth, budgetMs) {
  var moves = this.legalMoves(s, s.turn);
  if (!moves.length) return null;
  var start = performance.now();
  var best = moves[Math.floor(Math.random() * moves.length)];
  var have = false;   /* [AI-MAX] هل حصلنا على نتيجة تكرار كاملة واحدة على الأقل؟ */
  for (var d = 1; d <= maxDepth; d++) {
    /* [AI-MAX] مهلة داخلية 92% من الميزانية (هامش أمان لفترة الفحص التالية) */
    DAMA_SEARCH_DEADLINE = start + Math.floor((budgetMs || 800) * 0.92);
    DAMA_SEARCH_NODES = 0;
    try {
      var m = this.findBestMove(s, ai, d);
      if (m) { best = m; have = true; }
    } catch (e) {
      if (!e || !e.damaAbort) { DAMA_SEARCH_DEADLINE = Infinity; throw e; }
      break;   /* الموعد انتهى داخل التكرار — آخر نتيجة كاملة تكفي */
    } finally {
      DAMA_SEARCH_DEADLINE = Infinity;
    }
    if (performance.now() - start > budgetMs) break;
  }
  /* لم تكتمل أي نتيجة (ميزانية شبه صفرية): شملة سطحية فورية بلا مهلة */
  if (!have) { DAMA_SEARCH_DEADLINE = Infinity; best = this.findBestMove(s, ai, 1) || best; }
  return best;
};

/* ════════════════════════════════════════════════════════════════════
   UI / controller
   ════════════════════════════════════════════════════════════════════ */
var DAMA = null;   /* { eng, state, human, ai, depth, budget, sel, legal, busy, lastFrom, lastTo, bet, mult } */

var DAMA_LEVELS = [
  /* [AI 2026-09-16] مستويات أقوى: تعميق تكراري بميزانية زمنية أطول */
  { key: 'med', name: 'متوسط', depth: 8,  budget: 1800, mult: 2.0 },
  { key: 'pro', name: 'محترف', depth: 12, budget: 3500, mult: 2.5 },
  { key: 'exp', name: 'خبير',  depth: 18, budget: 6000, mult: 3.0 }
];

function eDama(g) {
  return gFrame(
    '<div class="dama-wrap" id="damaWrap">' +
      /* ── setup screen ── */
      '<div class="dama-setup" id="damaSetup">' +
        '<div class="dama-logo"><span class="dama-logo-em">ⴷ</span></div>' +
        '<div class="dama-title">' + T('dama.title') + '</div>' +
        '<div class="dama-sub">' + T('dama.sub') + '</div>' +
        '<div class="dama-field"><div class="dama-flab">' + T('dama.difficulty') + '</div>' +
          '<div class="dama-pick" id="damaDiff">' +
            DAMA_LEVELS.map(function (lv, i) {
              return '<button class="dama-chip' + (i === DAMA_LEVELS.length - 1 ? ' on' : '') + '" data-i="' + i + '" onclick="damaSetDiff(' + i + ')">' + damaLevelName(lv) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="dama-field"><div class="dama-flab">' + T('dama.playColor') + '</div>' +
          '<div class="dama-pick">' +
            '<button class="dama-chip on" data-c="w" onclick="damaSetColor(\'w\')"><span class="dama-cd w"></span> ' + T('dama.whiteFirst') + '</button>' +
            '<button class="dama-chip" data-c="b" onclick="damaSetColor(\'b\')"><span class="dama-cd b"></span> ' + T('dama.black') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="dama-field"><div class="dama-flab">' + T('dama.timer') + '</div>' +
          '<div class="dama-timer-row">' +
            '<button class="dama-chip on" data-t="0" onclick="damaSetTimer(0)">' + T('dama.timerOff') + '</button>' +
            '<button class="dama-chip" data-t="30" onclick="damaSetTimer(30)">30 ' + T('dama.seconds') + '</button>' +
            '<button class="dama-chip" data-t="60" onclick="damaSetTimer(60)">60 ' + T('dama.seconds') + '</button>' +
            '<button class="dama-chip" data-t="120" onclick="damaSetTimer(120)">120 ' + T('dama.seconds') + '</button>' +
            '<button class="dama-chip" data-t="180" onclick="damaSetTimer(180)">180 ' + T('dama.seconds') + '</button>' +
            '<button class="dama-chip" data-t="300" onclick="damaSetTimer(300)">300 ' + T('dama.seconds') + '</button>' +
          '</div>' +
        '</div>' +
        /* [Training 2026-09-16] مباراة الآلي تدريبية مجانية — الرهان حصري للغرف */
        '<div class="dama-field"><div class="dama-flab">' + T('dama.yourBet') + '</div>' +
          '<div class="dama-betrow" hidden>' + betRow() + '</div>' +
          '<div class="dama-pay" style="text-align:center;color:var(--t3);font-size:.8rem">🎓 ' + (T('ui.trainingFree') || 'تدريب مجاني بدون رهان — الرهان متاح في الغرف أونلاين فقط') + '</div>' +
        '</div>' +
        '<button class="big dama-go" id="damaGo" onclick="damaStart()"><i class="fa-solid fa-trophy" aria-hidden="true"></i> ' + T('dama.startMatch') + '</button>' +
        '<button class="big ch-online" onclick="damaOnline()"><i class="fa-solid fa-globe" aria-hidden="true"></i> ' + T('chess.onlineRoom') + '</button>' +
      '</div>' +
      /* ── play screen ── */
      '<div class="dama-play" id="damaPlay" hidden>' +
        '<div class="dama-spectators" id="damaSpectators" aria-hidden="true"></div>' +   /* [Owner] شريط متفرجين شفاف 100% — فارغ بلا متفرجين */
        '<div class="dama-timer" id="damaTimer"></div>' +
        '<div class="dama-boardbox" id="damaBoardBox"><div class="dama-board" id="damaBoard"></div>' +
          '<div class="dama-seat dama-seat-top"><div class="dama-picon" id="damaOppIcon"><span class="dama-pface"><i class="fa-solid fa-robot" aria-hidden="true"></i></span><span class="dama-ptimer" id="damaOppTimer" hidden>⏱</span></div></div>' +   /* [Owner] أيقونة الخصم فوق حافة اللوحة + مؤقت الدور بجانبها [Timer-Seat] */
          '<div class="dama-seat dama-seat-bottom"><div class="dama-picon" id="damaMainIcon"><span class="dama-pface"><i class="fa-solid fa-user" aria-hidden="true"></i></span><span class="dama-ptimer" id="damaMainTimer" hidden>⏱</span></div></div>' +   /* [Owner] أيقونة اللاعب الأساسي تحت حافة اللوحة + مؤقت الدور بجانبها [Timer-Seat] */
        '</div>' +
        '<div class="dama-status" id="damaStatus"></div>' +
        '<div class="dama-status dama-stake" id="damaStake" hidden></div>' +   /* [B10 v2.27] رقيقة الرهان الجاري — كانت الدالة ترجع عنصراً غير موجود */
      '</div>' +
      /* ── result overlay ── */
      '<div class="dama-over" id="damaOver" hidden>' +
        '<div class="dama-over-card">' +
          '<div class="dama-over-em" id="damaOverEm">🏆</div>' +
          '<div class="dama-over-tx" id="damaOverTx"></div>' +
          '<div class="dama-over-amt" id="damaOverAmt"></div>' +
          '<button class="big dama-go" onclick="damaNewMatch()">' + T('dama.newMatch') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>',
    g
  ).replace('<div class="stage">', '<div class="stage" id="damaStage">');
}

/* [Layout] نُحجِّم «صندوق اللوحة» (المربّع) لا اللوحة نفسها: الصندوق يلفّ اللوحة
   تماماً (اللوحة width/height:100%) فيلتصق مقعدا اللاعبين (فوق/تحت) بحافتي
   اللوحة في كلا الاتجاهين. وفي اللاندسكيب نترك فراغاً رأسياً كافياً للأيقونات
   كي لا تُقصّ عند حافة الشاشة. نراقب الخلية (.dama-play) لا الصندوق كي لا يحدث
   تغذية راجعة (تقلّص ذاتي) عند تغيّر حجم اللوحة. */
var _damaBoardRO = null;
function damaFitBoard() {
  var box = document.getElementById('damaBoardBox');
  var board = document.getElementById('damaBoard');
  if (!box || !board) return;
  var host = box.parentElement || box;       // خلية .dama-play
  var apply = function () {
    var landscape = (typeof window.matchMedia === 'function')
      ? window.matchMedia('(orientation: landscape)').matches
      : (window.innerWidth > window.innerHeight);
    if (!host.clientWidth || !host.clientHeight) return; // الخلية مخفية — ننتظر الظهور
    /* حجم اللوحة = أصغر بُعد متاح (مربّع) — نحسبه هنا لأن CSS aspect-ratio
       وحده قد يوسّع اللوحة خارج الشاشة في اللاندسكيه إذا كان العمود أعرض من طوله */
    var reserve = landscape ? 10 : 40;  // [P-Seats] بورتريه: 40px لكل جهة — مكان أيقونتي اللاعبين خارج اللوحة
    var w = host.clientWidth, h = host.clientHeight - reserve * 2;
    if (w < 10 || h < 10) return;
    var maxSz = landscape ? 9999 : 560;  // اللاندسكيه: لا حد أقصى
    var sz = Math.max(150, Math.min(w, h, maxSz));
    box.style.width = sz + 'px';
    box.style.height = sz + 'px';
    box.style.maxWidth = sz + 'px';
    box.style.maxHeight = sz + 'px';
    box.style.flex = '0 0 auto';
  };
  apply();
  if (typeof ResizeObserver !== 'undefined') {
    if (_damaBoardRO) _damaBoardRO.disconnect();
    _damaBoardRO = new ResizeObserver(apply);
    _damaBoardRO.observe(host);
  }
}

function damaInit() {
  DAMA = {
    eng: new DamaEngine(), state: null, human: WHITE, ai: BLACK,
    /* [AI-MAX] الافتراضي خبير (طلب المالك: أعلى مستوى في جميع الألعاب) */
    level: DAMA_LEVELS.length - 1, sel: null, legal: [], busy: false, flipped: false,
    lastFrom: null, lastTo: null,
    mode: 'ai', oppBot: false, isSpectator: false, _seq: 0, roomOrder: [],
    timeLimit: 0, _turnTi: null, _turnLeft: 0,
    chainN: 0, _animLock: false   /* [B9] عدّاد السلسلة الصوتي + قفل الطيران */
  };
  var go = document.getElementById('damaGo');
  if (go) damaUpdatePay();
  damaFitBoard();
  damaRegisterRooms();
}
function damaSetDiff(i) {
  if (!DAMA || DAMA.busy) return;
  DAMA.level = i;
  var chips = document.querySelectorAll('#damaDiff .dama-chip');
  chips.forEach(function (c) { c.classList.toggle('on', parseInt(c.getAttribute('data-i'), 10) === i); });
  damaUpdatePay();
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}
function damaSetColor(c) {
  if (!DAMA || DAMA.busy) return;
  document.querySelectorAll('.dama-setup .dama-pick .dama-chip[data-c]').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-c') === c);
  });
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}
function damaSelColor() {
  var on = document.querySelector('.dama-setup .dama-pick .dama-chip.on[data-c]');
  return on ? on.getAttribute('data-c') : WHITE;
}
function damaUpdatePay() {
  
}


function damaLevelName(lv) {
  return lv.key === 'med' ? T('dama.levelMed') : lv.key === 'pro' ? T('dama.levelPro') : T('dama.levelExp');
}
function damaSetTimer(sec) {
  if (!DAMA) return;
  DAMA.timeLimit = parseInt(sec, 10) || 0;
  document.querySelectorAll('.dama-timer-row .dama-chip').forEach(function (b) {
    b.classList.toggle('on', parseInt(b.getAttribute('data-t'), 10) === DAMA.timeLimit);
  });
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}
function damaStartTimer() {
  if (!DAMA || !DAMA.state || DAMA.state.over) return;
  if (!DAMA.timeLimit || DAMA.isSpectator) return;
  if (DAMA.state.turn !== DAMA.human) return;
  damaStopTimer();
  DAMA._turnLeft = DAMA.timeLimit;
  DAMA._turnTi = setInterval(function () {
    if (!DAMA || !DAMA.state || DAMA.state.over) { damaStopTimer(); return; }
    DAMA._turnLeft--;
    damaRenderTimer();
    if (DAMA._turnLeft <= 0) damaAutoMove();
  }, 1000);
  damaRenderTimer();   /* [Timer-Seat] أول رسم بعد تجهيز _turnTi — تظهر الشارة فور البدء */
}
function damaStopTimer() {
  if (!DAMA) return;
  if (DAMA._turnTi) { clearInterval(DAMA._turnTi); DAMA._turnTi = null; }
  DAMA._turnLeft = 0;
  var el = document.getElementById('damaTimer'); if (el) { el.textContent = ''; el.className = 'dama-timer'; }
  /* [Timer-Seat] إخفاء شارتي المؤقت الجانبيتين عند توقف العد */
  damaPaintSeatTimers('', '');
}
/* [Timer-Seat] شارة المؤقت بجانب أيقونة اللاعب صاحب الدور (نمط روندا):
   تظهر بجوار الأيقونة فقط — لا تحت الأزرار ولا خلف أي عنصر. */
function damaPaintSeatTimers(txt, whose) {
  var low = !!(txt && DAMA && DAMA._turnLeft <= 10);
  var opp = document.getElementById('damaOppTimer');
  var main = document.getElementById('damaMainTimer');
  if (opp) {
    opp.hidden = !((whose === 'opp') && !!txt);
    opp.textContent = (whose === 'opp') ? txt : '';
    opp.className = 'dama-ptimer' + ((whose === 'opp' && low) ? ' low' : '');
  }
  if (main) {
    main.hidden = !((whose === 'me') && !!txt);
    main.textContent = (whose === 'me') ? txt : '';
    main.className = 'dama-ptimer' + ((whose === 'me' && low) ? ' low' : '');
  }
}
function damaRenderTimer() {
  if (!DAMA) return;
  var el = document.getElementById('damaTimer');
  var txt = (DAMA._turnTi && DAMA._turnLeft > 0) ? ('\u23f1 ' + DAMA._turnLeft + T('dama.seconds')) : '';
  if (el) {
    el.textContent = txt;
    el.className = 'dama-timer' + (txt && DAMA._turnLeft <= 10 ? ' low' : '');
  }
  /* [Timer-Seat] الشارة الجانبية على أيقونة صاحب الدور الحالي */
  damaPaintSeatTimers(txt, (DAMA.state && DAMA.state.turn === DAMA.ai) ? 'opp' : 'me');
}
function damaAutoMove() {
  if (!DAMA || !DAMA.state || DAMA.state.over) return;
  var lm = DAMA.eng.legalMoves(DAMA.state, DAMA.human);
  if (!lm.length) { damaStopTimer(); return; }
  var quiet = lm.filter(function (m) { return !m.cap; });
  var mv = quiet.length ? quiet[0] : lm[0];
  damaStopTimer();
  damaSetStatus(T('dama.timeUp') + ' \u2014 ' + T('dama.autoMoved'));
  if (typeof SND !== 'undefined' && SND.lose) SND.lose();
  damaHumanMove(mv);
}

/* [MP] فتح الغرف الجماعية من شاشة الإعداد — نفس منهجية البلياردو */
function damaOnline() {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.toggleFromGame !== 'function') {
    toast(T('bl.soon') || 'قريباً', 'warn'); return;
  }
  Rooms.toggleFromGame();
}

function damaStart() {
  damaStopTimer();
  /* [Training 2026-09-16] مباراة الآلي تدريبية مجانية بلا رهان ولا تسجيل */
  window.TRAINING = window.TRAINING || { on: false };
  window.TRAINING.on = true;
  if (!take()) return;
  if (typeof SND !== 'undefined' && SND.click) SND.click();
  var human = damaSelColor();
  DAMA.human = human;
  DAMA.ai = human === WHITE ? BLACK : WHITE;
  DAMA.mode = 'ai';
  DAMA.oppBot = false;
  DAMA.isSpectator = false;
  damaClearCaches(); DAMA.state = damaNewState();
  DAMA.sel = null; DAMA.legal = []; DAMA.busy = false;
  DAMA.flipped = (human === BLACK);
  DAMA.lastFrom = null; DAMA.lastTo = null;
  document.getElementById('damaSetup').hidden = true;
  document.getElementById('damaOver').hidden = true;
  document.getElementById('damaPlay').hidden = false;
  damaFitBoard();          /* [Layout] احسب حجم اللوحة بعد ظهور شاشة اللعب */
  /* [Owner] أيقونات اللاعبين فوق/تحت اللوحة + حلقة الدور الذهبية */
  damaSetupIcons();
  DAMA.drawBanUntil = 0;
  var db = document.getElementById('damaDrawBar'); if (db) db.hidden = true;
  damaRender();
  damaSetStatus('');   /* [UI] مباراة جديدة = شريط حالة نظيف (بلا نصوص دور/إلزامي وبلا رسائل قديمة عالقة) */
  if (DAMA.state.turn === DAMA.ai) setTimeout(damaAiTurn, 600);
  else { damaStartTimer(); damaAutoHint(); }   /* [B10] إبراز القطعة الملزَمة منذ البداية */
}

function damaToSetup() {
  if (!DAMA || DAMA.busy) return;
  /* [MP] في الغرفة لا توجد شاشة إعداد: مغادرة المباراة الحية = استسلام */
  if (DAMA.mode === 'room') {
    if (DAMA.state && !DAMA.state.over && !DAMA.isSpectator) damaResign();
    return;
  }
  var playVisible = !document.getElementById('damaPlay').hidden;
  if (playVisible && DAMA.state && !DAMA.state.over) {
    /* abandoning a live match = forfeit the bet (recorded as a loss) */
    DAMA.state.over = true;
    gres(T('dama.resignedNew') + T('ts.lose'), 0);
    if (typeof winFX === 'function') winFX(0);
  }
  document.getElementById('damaPlay').hidden = true;
  document.getElementById('damaOver').hidden = true;
  document.getElementById('damaSetup').hidden = false;
  damaSetStatus('');
}

function damaNewMatch() {
  if (DAMA && DAMA.mode === 'room') { damaRoomNewGame(); return; }
  document.getElementById('damaOver').hidden = true;
  damaStart();
}

function damaResign() {
  if (!DAMA || DAMA.busy || !DAMA.state || DAMA.state.over) return;
  damaSettle(false);
}

/* ═══ [B10] التعادل بالتوافق — يجب مصادقة اللاعبين عليه ═══ */
var DAMA_DRAW_BAN = 8;   /* عدد أنصاف الحركات قبل السماح بعرض جديد (منع الإزعاج) */
function damaDrawOffer() {
  if (!DAMA || !DAMA.state || DAMA.state.over) return;
  if (DAMA.isSpectator) return;
  if ((DAMA.drawBanUntil | 0) > DAMA.state.moves) {
    damaSetStatus(T('dama.drawWait'));
    if (typeof SND !== 'undefined' && SND.tick) SND.tick();
    return;
  }
  if (DAMA.mode === 'room' && !DAMA.oppBot) {
    /* غرفة ضد بشري: أرسل العرض وانتظر مصادقته */
    damaEmit('drawOffer', {});
    DAMA.drawBanUntil = DAMA.state.moves + DAMA_DRAW_BAN;
    damaSetStatus(T('dama.drawSent'));
    if (typeof SND !== 'undefined' && SND.notify) SND.notify();
    return;
  }
  /* ضد الذكاء (أو بوت الغرفة): الذكاء يقيّم — يقبل إن لم يكن رابحاً بوضوح */
  var s = DAMA.state;
  var sc = DAMA.eng.evaluate(s, DAMA.ai);           /* من منظور الذكاء */
  var myPieces = 0, opPieces = 0;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var pp = s.grid[r][c]; if (!pp) continue;
    if (pp.owner === DAMA.ai) myPieces += pp.king ? 2 : 1; else opPieces += pp.king ? 2 : 1;
  }
  var aiComfort = myPieces - opPieces;
  var early = s.moves < 20;                          /* بداية المباراة — لا تعادل ساذجاً */
  var dry = s.half >= 60;                            /* جمود طويل بلا أكل/حركة رجال ≈ تعادل واقعي */
  if (aiComfort < 0 || dry || (!early && aiComfort <= 1 && sc < 60)) {
    damaDrawAgreed();                                /* الذكاء وافق التعادل */
  } else {
    DAMA.drawBanUntil = DAMA.state.moves + DAMA_DRAW_BAN;
    damaSetStatus(T('dama.drawDeclinedTxt'));
    if (typeof SND !== 'undefined' && SND.mismatch) SND.mismatch();
  }
}

/* قبول/رفض عرض ورد من الخصم البشري */
function damaDrawAccept(yes) {
  var bar = document.getElementById('damaDrawBar');
  if (bar) bar.hidden = true;
  if (!DAMA || !DAMA.state || DAMA.state.over) return;
  if (yes) {
    if (DAMA.mode === 'room' && !DAMA.oppBot && !DAMA.isSpectator) damaEmit('drawAgree', {});
    damaDrawAgreed();
  } else {
    if (DAMA.mode === 'room' && !DAMA.oppBot && !DAMA.isSpectator) damaEmit('drawDecline', {});
    damaSetStatus(T('dama.drawYouDeclined'));
  }
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}

/* الطرفان صادقا: تعادل → استرجاع الرهان + إعادة الجولة */
function damaDrawAgreed() {
  if (!DAMA || !DAMA.state || DAMA.state.over) return;
  if (typeof SND !== 'undefined' && SND.damaKing) { try { SND.damaKing(); } catch (e) {} }
  damaFinalize('draw');
}

function damaShowDrawBar(txt) {
  var bar = document.getElementById('damaDrawBar');
  var t = document.getElementById('damaDrawTxt');
  if (bar) { if (t) t.textContent = txt; bar.hidden = false; }
}

function damaSetStatus(txt) {
  var el = document.getElementById('damaStatus');
  if (el) el.textContent = txt || '';
}

/* Build the board DOM from state + selection/legals. */
var damaRenderQueued = false;   /* [B9] عرض مؤجل أثناء طيران القطعة */

function damaRender() {
  if (!DAMA || !DAMA.state) return;
  if (DAMA._animLock) { damaRenderQueued = true; return; }   /* [B9] أثناء الطيران */
  var board = document.getElementById('damaBoard');
  if (!board) return;
  var s = DAMA.state;
  var html = '';
  var legalSet = {};
  for (var i = 0; i < DAMA.legal.length; i++) legalSet[DAMA.legal[i].to[0] + ',' + DAMA.legal[i].to[1]] = DAMA.legal[i];
  var capSet = {};
  for (var k = 0; k < DAMA.legal.length; k++) if (DAMA.legal[k].cap) capSet[DAMA.legal[k].to[0] + ',' + DAMA.legal[k].to[1]] = true;
  /* [B10] القطع الملزَمة بالأكل: تُبرَز نابضة حتى يعرف اللاعب أيّها يمكنه اللعب */
  var obligedSet = {};
  if (!s.over && s.turn === (DAMA.isSpectator ? s.turn : DAMA.human) && !s.cont
      && DAMA.eng.rules.mandatoryCapture && !DAMA.isSpectator) {
    var anyCap = DAMA.eng.allCaptures(s.grid, s.turn).length > 0;
    if (anyCap) {
      for (var rr2 = 0; rr2 < 8; rr2++) for (var cc2 = 0; cc2 < 8; cc2++) {
        var pq = s.grid[rr2][cc2];
        if (pq && pq.owner === s.turn && !pq.pendingKing
            && DAMA.eng.legalMovesForPiece(s, rr2, cc2).length > 0) obligedSet[rr2 + ',' + cc2] = true;
      }
    }
  }
  for (var di = 0; di < 8; di++) {
    for (var dj = 0; dj < 8; dj++) {
      var r = DAMA.flipped ? (7 - di) : di;
      var c = DAMA.flipped ? (7 - dj) : dj;
      var dark = damaIsDark(r, c);
      var piece = s.grid[r][c];
      var cls = 'dm-sq ' + (dark ? 'dark' : 'light');
      if (DAMA.sel && DAMA.sel[0] === r && DAMA.sel[1] === c) cls += ' sel';
      if (DAMA.lastFrom && DAMA.lastFrom[0] === r && DAMA.lastFrom[1] === c) cls += ' last';
      if (DAMA.lastTo && DAMA.lastTo[0] === r && DAMA.lastTo[1] === c) cls += ' last';
      var key = r + ',' + c;
      var hint = legalSet[key];
      if (hint) cls += ' hint' + (hint.cap ? ' hint-cap' : '');
      html += '<div class="' + cls + '" data-r="' + r + '" data-c="' + c + '" onclick="damaClick(' + r + ',' + c + ')">';
      if (piece) {
        var pc = 'dm-pc ' + piece.owner + (piece.king ? ' king' : '') + (piece.pendingKing ? ' pending' : '');   /* [B9] توقف الترقية المؤجل */
        if (obligedSet[r + ',' + c]) pc += ' obliged';   /* [B10] قطعة ملزَمة بالأكل */
        if (DAMA.lastTo && DAMA.lastTo[0] === r && DAMA.lastTo[1] === c) pc += ' just';
        html += '<div class="' + pc + '"></div>';
      }
      if (hint) html += '<div class="dm-dot' + (hint.cap ? ' cap' : '') + '"></div>';
      html += '</div>';
    }
  }
  board.innerHTML = html;
  damaUpdateTurn();
  damaUpdateStake();
  damaRenderSpectators();
}

/* [B10] عرض الرهان الجاري أثناء المباراة (ساكن — التعديل من الإعدادات فقط) */
function damaUpdateStake() {
  var el = document.getElementById('damaStake');
  if (!el || !DAMA || !DAMA.state) return;
  if (DAMA.state.over || document.getElementById('damaPlay').hidden) { el.hidden = true; return; }
  var txt = (DAMA.mode === 'room')
    ? T('dama.friendly')
    : ((window.TRAINING && window.TRAINING.on) ? (T('ui.trainingFree') || 'تدريب مجاني بدون رهان') : (T('dama.stakeLabel') + ' ' + GB + ' 🪙'));
  el.textContent = txt;
  el.hidden = false;
}

function damaUpdateTurn() {
  if (!DAMA || !DAMA.state) return;
  damaUpdateTurnIcons();
}

/* [Owner] تهيئة أيقونات اللاعبين (فوق/تحت اللوحة) + حلقة الدور + شريط المتفرجين */
function damaSetupIcons() {
  var opp = document.getElementById('damaOppIcon');
  var main = document.getElementById('damaMainIcon');
  if (opp) opp.className = 'dama-picon ' + (DAMA.ai || 'b');
  if (main) main.className = 'dama-picon ' + (DAMA.human || 'w');
  damaUpdateTurnIcons();
  damaRenderSpectators();
}

/* [Owner] حلقة ذهبية حول أيقونة اللاعب صاحب الدور */
function damaUpdateTurnIcons() {
  if (!DAMA || !DAMA.state) return;
  var opp = document.getElementById('damaOppIcon');
  var main = document.getElementById('damaMainIcon');
  if (opp) opp.classList.toggle('turn', DAMA.state.turn === DAMA.ai);
  if (main) main.classList.toggle('turn', DAMA.state.turn === DAMA.human);
}

/* [Owner] شريط متفرجين شفاف — يظهر فقط عند وجود متفرجين غير اللاعب نفسه */
function damaRenderSpectators() {
  var bar = document.getElementById('damaSpectators');
  if (!bar) return;
  bar.innerHTML = '';
  if (typeof Rooms === 'undefined' || !Rooms.state || !Rooms.state.players) return;
  var me = damaMeId();
  for (var i = 0; i < Rooms.state.players.length; i++) {
    var pl = Rooms.state.players[i];
    if (!pl || !pl.spectate) continue;
    if (me != null && String(pl.id) === String(me)) continue;   /* تخطّي اللاعب نفسه */
    var s = document.createElement('span');
    s.className = 'dama-spec';
    s.title = pl.username || (T('dama.spectator') || 'Spectator');
    s.textContent = '👁️';
    bar.appendChild(s);
  }
}

/* ═══ [B9] صوت الحركة بحسب نوعها: هادئة/ضائمة/أكل/سلسلة متتالية/تتويج ═══ */
function damaMoveSound(mv, info, wasCont) {
  if (typeof SND === 'undefined' || !info || typeof SND === 'undefined') return;
  try {
    if (info.captured && info.captured.length) {
      DAMA.chainN = wasCont ? ((DAMA.chainN | 0) + 1) : 0;
      if (DAMA.chainN > 0 && SND.damaChain) SND.damaChain(DAMA.chainN);
      else if (SND.damaCapture) SND.damaCapture();
    } else {
      var p = DAMA.state.grid[mv.to[0]][mv.to[1]];
      if (p && p.king && SND.damaKingMove) SND.damaKingMove();
      else if (SND.damaMove) SND.damaMove();
    }
    if (info.promoted && SND.damaKing) {
      setTimeout(function () { try { SND.damaKing(); } catch (e) {} }, 230);
    } else if (info.pendingPromotion && SND.damaPending) {
      setTimeout(function () { try { SND.damaPending(); } catch (e) {} }, 230);
    }
  } catch (e) {}
}

/* [B9] ملاحظة تتويج مؤجل حُسم بعد مرور الدور */
function damaCrownNote() {
  damaSetStatus(T('dama.crowned'));
  if (typeof SND !== 'undefined' && SND.damaKing) { try { SND.damaKing(); } catch (e) {} }
}

/* ═══ [B9] حركة واقعية: القطعة تنزلق أو تقفز قوساً والضحايا يتلاشون ═══ */
function damaAnimate(mv, info) {
  var board = document.getElementById('damaBoard');
  if (!board || !mv || !DAMA || !DAMA.state) return;
  var cs = board.clientWidth / 8;
  if (!cs) return;
  function pos(r, c) {
    var rr = DAMA.flipped ? 7 - r : r, cc = DAMA.flipped ? 7 - c : c;
    return [cc * cs, rr * cs];
  }
  var s = DAMA.state;
  var p = s.grid[mv.to[0]] && s.grid[mv.to[0]][mv.to[1]];
  if (!p) return;
  var from = pos(mv.from[0], mv.from[1]), to = pos(mv.to[0], mv.to[1]);
  /* إخفاء القطعة الحقيقية في وجهتها حتى تهبط النسخة الطائرة */
  var cell = board.querySelector('.dm-sq[data-r="' + mv.to[0] + '"][data-c="' + mv.to[1] + '"]');
  var realEl = cell ? cell.querySelector('.dm-pc') : null;
  if (realEl) realEl.style.visibility = 'hidden';
  /* الضحايا: تلاشي وتقلّص بعد بدء القفزة */
  var victims = (info && info.captured) || [];
  for (var i = 0; i < victims.length; i++) {
    (function (vr, vc, vown, vking) {
      var vp = pos(vr, vc);
      var gh = document.createElement('div');
      gh.className = 'dm-fly dm-ghost';
      var gp = document.createElement('div');
      gp.className = 'dm-pc ' + vown + (vking ? ' king' : '');
      gh.appendChild(gp);
      gh.style.left = vp[0] + 'px'; gh.style.top = vp[1] + 'px';
      gh.style.width = cs + 'px'; gh.style.height = cs + 'px';
      board.appendChild(gh);
      try {
        gh.animate(
          [{ opacity: 0.95, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.3)' }],
          { duration: 240, delay: 110, fill: 'forwards', easing: 'ease-in' }
        );
      } catch (e) { gh.style.opacity = '0'; }
      setTimeout(function () { if (gh.parentNode) gh.parentNode.removeChild(gh); }, 420);
    })(victims[i][0], victims[i][1], victims[i][2], victims[i][3]);
  }
  /* النسخة الطائرة: انزلاق هادئ أو قوس مرتفع للأكل */
  var fly = document.createElement('div');
  fly.className = 'dm-fly';
  var pc = document.createElement('div');
  pc.className = 'dm-pc ' + p.owner + (p.king ? ' king' : '') + (p.pendingKing ? ' pending' : '');
  fly.appendChild(pc);
  fly.style.left = from[0] + 'px'; fly.style.top = from[1] + 'px';
  fly.style.width = cs + 'px'; fly.style.height = cs + 'px';
  board.appendChild(fly);
  var dist = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) / cs;
  var dur = mv.cap ? Math.min(460, 240 + dist * 55) : Math.min(330, 170 + dist * 40);
  var lift = mv.cap ? Math.min(0.55, 0.24 + dist * 0.08) : 0.08;
  var done = false;
  function finish() {
    if (done) return;
    done = true;
    if (fly.parentNode) fly.parentNode.removeChild(fly);
    if (realEl && realEl.style) realEl.style.visibility = '';
    DAMA._animLock = false;
    if (damaRenderQueued) { damaRenderQueued = false; damaRender(); }
  }
  DAMA._animLock = true;
  try {
    var anim = fly.animate([
      { left: from[0] + 'px', top: from[1] + 'px', transform: 'scale(1)' },
      { left: ((from[0] + to[0]) / 2) + 'px', top: ((from[1] + to[1]) / 2 - lift * cs) + 'px', transform: 'scale(1.16)', offset: 0.5 },
      { left: to[0] + 'px', top: to[1] + 'px', transform: 'scale(1)' }
    ], { duration: dur, easing: 'ease-in-out' });
    if (anim.onfinish !== undefined) { anim.onfinish = finish; anim.oncancel = finish; }
    else anim.finished.then(finish).catch(finish);
  } catch (e) { finish(); return; }
  setTimeout(finish, dur + 300);   /* شبكة أمان */
}

/* Human interaction. */
function damaClick(r, c) {
  if (!DAMA || !DAMA.state || DAMA.busy || DAMA.state.over) return;
  if (DAMA.state.turn !== DAMA.human) return;
  var s = DAMA.state;
  /* clicked a legal destination? */
  for (var i = 0; i < DAMA.legal.length; i++) {
    if (DAMA.legal[i].to[0] === r && DAMA.legal[i].to[1] === c) {
      damaHumanMove(DAMA.legal[i]);
      return;
    }
  }
  /* otherwise try to select a piece */
  var piece = s.grid[r][c];
  if (piece && piece.owner === DAMA.human) {
    if (s.cont && (s.cont[0] !== r || s.cont[1] !== c)) return; /* must continue with the jumping piece */
    var lm = DAMA.eng.legalMovesForPiece(s, r, c);
    /* [Souffler Rule] اللاعب حر في تحريك أي قطعة — حتى مع وجود أكل ممكن.
       إذا تحركت القطعة بلا أكل وكانت قطعة أخرى تستطيع الأكل، تُنفخ القطعة
       التي رفضت الأكل (قاعدة النفخ القانونية). */
    if (!lm.length) {
      if (DAMA.sel) { DAMA.sel = null; DAMA.legal = []; damaRender(); }
      damaSetStatus(T('dama.cantPlay'));
      return;
    }
    DAMA.sel = [r, c];
    DAMA.legal = lm;
    if (typeof SND !== 'undefined' && SND.click) SND.click();
    damaRender();
  } else if (DAMA.sel) {
    DAMA.sel = null; DAMA.legal = []; damaRender();
  }
}

function damaHumanMove(mv) {
  damaStopTimer();
  var s = DAMA.state;
  var wasCont = !!s.cont;
  var info = DAMA.eng.applyMove(s, mv);
  DAMA.lastFrom = mv.from; DAMA.lastTo = mv.to;
  DAMA.sel = null; DAMA.legal = [];
  /* [MP] بثّ الحركة للخصم في الغرفة (لكل قفزة على حدة) */
  if (DAMA.mode === 'room' && !DAMA.oppBot) damaEmitMove(mv);
  damaRender();
  damaAnimate(mv, info);          /* [B9] طيران واقعي */
  damaMoveSound(mv, info, wasCont);  /* [B9] صوت بحسب نوع الحركة */
  if (info.pendingPromotion) damaSetStatus(T('dama.pendingPromo'));
  if (info.crownedDeferred && info.crownedDeferred.length) damaCrownNote();
  if (info.continued) {
    /* same piece must keep capturing — re-select it automatically */
    DAMA.sel = [mv.to[0], mv.to[1]];
    DAMA.legal = DAMA.eng.continuationMoves(s);   /* [B9] متمِّمة للسلسلة المثلى فقط */
    damaRender();
    damaStartTimer();
    return;
  }
  /* turn switched → check outcome */
  var out = DAMA.eng.detectOutcome(s);
  if (out !== null) { damaFinalize(out); return; }
  /* [Souffler v2.27] قطعتك المُلزَمة التي تركت الأكل نُفخت — اشرح القاعدة بدل الحذف الصامت */
  if (info.souffled) damaSetStatus(T('dama.souffle'));
  if (DAMA.mode === 'room' && !DAMA.oppBot) {
    /* غرفة ضد بشري: الدور انتقل للخصم — انتظر حركته */
    if (!info.souffled) damaSetStatus(T('dama.waitOpp'));
    damaUpdateTurn();
    return;
  }
  if (!info.souffled) damaSetStatus('');
  setTimeout(damaAiTurn, info.souffled ? 900 : 480);
}

/* AI turn — may chain multiple captures, animated step by step. */
function damaAiTurn() {
  if (!DAMA || !DAMA.state || DAMA.state.over) return;
  if (DAMA.state.turn !== DAMA.ai) return;
  DAMA.busy = true;
  damaUpdateTurn();
  var lv = DAMA_LEVELS[DAMA.level];
  /* compute best move for the current position */
  var mv;
  if (lv.depth === 0) {
    var lm = DAMA.eng.legalMoves(DAMA.state, DAMA.ai);
    mv = lm.length ? lm[Math.floor(Math.random() * lm.length)] : null;
  } else {
    mv = DAMA.eng.aiPick(DAMA.state, DAMA.ai, lv.depth, lv.budget);
  }
  if (!mv) { DAMA.busy = false; damaFinalize(DAMA.human); return; }   /* AI has no move → human wins */
  damaApplyAi(mv);
}

function damaApplyAi(mv) {
  var wasCont = !!DAMA.state.cont;
  var info = DAMA.eng.applyMove(DAMA.state, mv);
  DAMA.lastFrom = mv.from; DAMA.lastTo = mv.to;
  damaRender();
  damaAnimate(mv, info);          /* [B9] طيران واقعي */
  damaMoveSound(mv, info, wasCont);  /* [B9] صوت بحسب نوع الحركة */
  if (info.pendingPromotion) damaSetStatus(T('dama.pendingPromo'));
  if (info.crownedDeferred && info.crownedDeferred.length) damaCrownNote();
  if (info.continued) {
    /* AI keeps capturing — schedule the next hop after a short pause */
    setTimeout(function () {
      var lv = DAMA_LEVELS[DAMA.level];
      var next;
      if (lv.depth === 0) {
        var lm = DAMA.eng.continuationMoves(DAMA.state);
        next = lm.length ? lm[Math.floor(Math.random() * lm.length)] : null;
      } else {
        next = DAMA.eng.aiPick(DAMA.state, DAMA.ai, Math.min(lv.depth, 6), lv.budget);
      }
      if (next) damaApplyAi(next);
      else { DAMA.busy = false; damaAfterAi(); }
    }, 520);
    return;
  }
  DAMA.busy = false;
  /* [Souffler v2.27] قطعة الخصم (البوت) التي تركت الأكل نُفخت */
  if (info.souffled) damaSetStatus(T('dama.souffleOpp'));
  damaAfterAi();
}

function damaAfterAi() {
  damaStartTimer();
  var out = DAMA.eng.detectOutcome(DAMA.state);
  if (out !== null) { damaFinalize(out); return; }
  damaAutoHint();          /* [B10] إبراز/تحديد القطعة الملزَمة بالأكل فوراً */
  damaUpdateTurn();
  /* auto-select the continuing piece if somehow it's human's chain (defensive) */
}

/* [B10] عند بداية دور البشري: إن كان الأكل إلزامياً حدِّد القطعة الملزَمة
   تلقائياً وأظهر تلميحاتها — يمنع الشعور بأن اللعبة «مجمدة».
   [UI] لا نص في شريط الحالة — التحديد التلقائي + التلميحات البصرية كافية. */
function damaAutoHint() {
  if (!DAMA || !DAMA.state || DAMA.state.over || DAMA.isSpectator) return;
  if (DAMA.state.turn !== DAMA.human) return;
  var s = DAMA.state;
  if (s.cont) return;                     /* استمرارية السلسلة محددة أصلاً */
  if (!DAMA.eng.rules.mandatoryCapture) return;
  var caps = DAMA.eng.allCaptures(s.grid, s.turn);
  if (!caps.length) return;
  /* [v2.43] أبرِز القطعة القادرة على أطول سلسلة (قاعدة الأكل الأكبر) */
  var best = null, bestChain = -1;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.grid[r][c];
    if (!p || p.owner !== s.turn) continue;
    var lm = DAMA.eng.legalMovesForPiece(s, r, c);
    if (!lm.length) continue;
    var ch = DAMA.eng.maxChainAt(s.grid, r, c);
    if (ch > bestChain) { bestChain = ch; best = [r, c]; }
  }
  if (best) {
    DAMA.sel = best;
    DAMA.legal = DAMA.eng.legalMovesForPiece(s, best[0], best[1]);
    damaRender();
  }
}

/* Settle the wager: humanWin boolean. */
function damaSettle(humanWin) {
  damaStopTimer();
  if (!DAMA || !DAMA.state) return;
  if (DAMA.state.over) return;
  DAMA.state.over = true;
  /* [MP] غرفة: بثّ الانسحاب للخصم البشري + تسوية الرهان خادمياً (المضيف) */
  if (DAMA.mode === 'room') {
    if (!DAMA.oppBot) damaEmit('resign', {});
    damaRoomSettleOutcome(humanWin ? DAMA.human : DAMA.eng.opponent(DAMA.human));
    damaShowOverRoom(humanWin ? DAMA.human : DAMA.eng.opponent(DAMA.human));
    return;
  }
  var lv = DAMA_LEVELS[DAMA.level];
  var _tr = damaTraining();
  if (humanWin) {
    if (_tr) {
      /* [v2.43] التدريب: شريط النتيجة بلا مبلغ ولا مضاعف (لا رهان ولا ربح) */
      gres(T('dama.win') + ' — 🎓 ' + damaTrainTxt(), 0, true, true);
      if (typeof winFX === 'function') winFX(0);
    } else {
      var payout = Math.floor(GB * lv.mult);
      give(payout);
      gres(T('dama.win') + ' ×' + lv.mult.toFixed(1) + ' +' + fmt(payout) + ' 🪙', payout);
      if (typeof winFX === 'function') winFX(payout);
    }
  } else {
    gres(T('dama.lose') + ' — ' + T('ts.lose'), 0, _tr);
    if (typeof winFX === 'function') winFX(0);
  }
  damaShowOver(humanWin, null, lv.mult);
}

function damaFinalize(outcome) {
  damaStopTimer();
  if (!DAMA || !DAMA.state) return;
  DAMA.state.over = true;
  DAMA.state.outcome = outcome;
  DAMA.busy = false;
  var dbar = document.getElementById('damaDrawBar'); if (dbar) dbar.hidden = true;   /* [B10] */
  /* [MP] غرفة: النتيجة واحدة عند الطرفين (المحرك حتمي) — المضيف يُسوّي الرهان خادمياً */
  if (DAMA.mode === 'room') {
    damaRoomSettleOutcome(outcome);
    damaShowOverRoom(outcome);
    return;
  }
  var lv = DAMA_LEVELS[DAMA.level];
  if (outcome === 'draw') {
    if (damaTraining()) {
      /* [v2.43] التدريب: لا استرداد وهمي — النتيجة فقط */
      gres(T('dama.draw'), 0, true, true);
    } else {
      give(GB);                 /* refund */
      gres(T('dama.drawRefund'), 0);
    }
    damaShowOver(null, 'draw', lv.mult);
    return;
  }
  var humanWin = (outcome === DAMA.human);
  var _tr = damaTraining();
  if (humanWin) {
    if (_tr) {
      /* [v2.43] التدريب: شريط النتيجة بلا مبلغ ولا مضاعف (لا رهان ولا ربح) */
      gres(T('dama.win') + ' — 🎓 ' + damaTrainTxt(), 0, true, true);
      if (typeof winFX === 'function') winFX(0);
    } else {
      var payout = Math.floor(GB * lv.mult);
      give(payout);
      gres(T('dama.win') + ' ×' + lv.mult.toFixed(1) + ' +' + fmt(payout) + ' 🪙', payout);
      if (typeof winFX === 'function') winFX(payout);
    }
  } else {
    gres(T('dama.lose') + ' — ' + T('ts.lose'), 0, _tr);
    if (typeof winFX === 'function') winFX(0);
  }
  damaShowOver(humanWin, null, lv.mult);
}

/* [v2.43] تدريب مجاني (بلا رهان): لا مبالغ ولا مضاعفات في الشرائط والنتيجة */
function damaTraining() {
  try { return !!(window.TRAINING && window.TRAINING.on); } catch (e) { return false; }
}
function damaTrainTxt() {
  try { if (typeof T === 'function') { var t = T('ui.trainingFreeShort'); if (t && t !== 'ui.trainingFreeShort') return t; } } catch (e) {}
  return 'تدريب مجاني — بلا رهان';
}
function damaShowOver(humanWin, draw, mult) {
  var ov = document.getElementById('damaOver');
  var em = document.getElementById('damaOverEm');
  var tx = document.getElementById('damaOverTx');
  var amt = document.getElementById('damaOverAmt');
  if (!ov) return;
  var _trn = damaTraining();
  if (draw) {
    if (em) em.textContent = '🤝';
    if (tx) tx.textContent = T('dama.draw');
    if (amt) amt.innerHTML = _trn ? ('🎓 ' + damaTrainTxt())
      : (T('dama.refunded') + ' (<i class="fa-solid fa-coins" aria-hidden="true"></i> ' + fmt(GB) + ')');
  } else if (humanWin) {
    if (em) em.textContent = '🏆';
    if (tx) tx.textContent = T('dama.youWin');
    if (amt) {
      if (_trn) amt.innerHTML = '🎓 ' + damaTrainTxt();
      else { var p = Math.floor(GB * mult); amt.innerHTML = '+<i class="fa-solid fa-coins" aria-hidden="true"></i> ' + fmt(p) + ' (×' + mult.toFixed(1) + ')'; }
    }
    if (typeof confetti === 'function') confetti(60);
  } else {
    if (em) em.textContent = '💀';
    if (tx) tx.textContent = T('dama.youLose');
    if (amt) { if (_trn) amt.innerHTML = '🎓 ' + damaTrainTxt(); else innerCoinsLost(amt); }
  }
  ov.hidden = false;
}
function innerCoinsLost(el) {
  el.innerHTML = '−<i class="fa-solid fa-coins" aria-hidden="true"></i> ' + fmt(GB);
}

/* init called by main.js initFor */
function initDama() { damaInit(); }

/* ════════════════════════════════════════════════════════════════════
   وضع الغرفة: لاعبان أونلاين بمزامنة خادمية (SSE room:move)
   الضامة لعبة حتمية تعتمد على الحركة: نفس الحركة → نفس اللوحة عند
   الطرفين. المقعد 0 (المضيف) = أبيض ويبدأ، المقعد 1 = أسود.
   الحركات تُبَثّ عبر rmove فتُخزَّن في moveHistory (إعادة بناء عند العودة/
   للمتفرج المتأخر). مباراة ودية بلا رهان.
   ════════════════════════════════════════════════════════════════════ */

/* تسجيل معالجات الغرفة عند فتح صفحة الضامة */
function damaRegisterRooms() {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.setGameHandler !== 'function') return;
  Rooms.setGameHandler(damaRoomMove);
  Rooms.setStartHandler(damaRoomStart);
  if (typeof Rooms.setUpdateHandler === 'function') Rooms.setUpdateHandler(function () { damaRenderSpectators(); });
  if (typeof window !== 'undefined') window.applyRoomReplay = damaApplyReplay;
  /* [Resilience] استئناف مباراة جارية عند فتح اللعبة (عائد بعد انقطاع/مشاهد متأخر):
     ندخل وضع الغرفة أولاً (mode='room' + لوحة أولية) ثم نطبّق سجل الإعادة المعلّق.
     قد تصل room:update + room:replay قبل فتح اللعبة فيبقى _pendingReplay معلّقاً
     حتى نفتح dm هنا ونستهلكه بالترتيب الصحيح. */
  if (Rooms.state && Rooms.state.game_id === 'dm' && Rooms.state.status === 'playing') {
    var rp = (typeof Rooms.hasPendingReplay === 'function' && Rooms.hasPendingReplay()) ? Rooms.consumePendingReplay() : null;
    damaRoomStart(Rooms.state);   /* يهيّئ وضع الغرفة */
    if (rp && rp.history && rp.history.length) damaApplyReplay(rp);
    /* [Persist] عائد من لعبة أخرى/تجديد: لا replay معلق — اطلبه من الخادم
       (إعادة فتح قناة WS تعيد hello + room:replay فيُبنى سجل الحركات كاملاً) */
    else if (typeof Rooms.requestReplay === 'function') Rooms.requestReplay();
  }
}

function damaMeId() {
  if (typeof AUTH !== 'undefined' && AUTH.user) return AUTH.user.id;
  if (typeof ST !== 'undefined' && ST.user) return ST.user.id;
  return null;
}
function damaMySeat(order) {
  var me = damaMeId();
  if (!order || me == null) return -1;
  for (var i = 0; i < order.length; i++) if (String(order[i]) === String(me)) return i;
  return -1;
}
function damaIsSpectator(room) {
  var me = damaMeId();
  if (!room || !room.players || me == null) return false;
  for (var i = 0; i < room.players.length; i++) {
    if (String(room.players[i].id) === String(me)) return !!room.players[i].spectate;
  }
  return true; /* لست ضمن اللاعبين ⇒ متفرج */
}
function damaOpponentBot(room) {
  var me = damaMeId();
  if (!room || !room.players) return false;
  for (var i = 0; i < room.players.length; i++) {
    var p = room.players[i];
    if (p.spectate || String(p.id) === String(me)) continue;
    return !!p.isBot;
  }
  return false;
}
function damaOpponentName() {
  if (typeof Rooms === 'undefined' || !Rooms.state) return T('dama.opp') || 'الخصم';
  var me = damaMeId();
  var players = Rooms.state.players || [];
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    if (p.spectate || String(p.id) === String(me)) continue;
    return p.username || (T('dama.opp') || 'الخصم');
  }
  return T('dama.opp') || 'الخصم';
}

/* بدء اللعب الجماعي: تستدعيه الغرفة عند status=playing */
function damaRoomStart(room) {
  if (!room || room.game_id !== 'dm' || room.status !== 'playing') return;
  var order = (room.order && room.order.length) ? room.order.slice() : [];
  if (!order.length) return;
  var mySeat = damaMySeat(order);
  var spec = damaIsSpectator(room);
  var oppBot = damaOpponentBot(room);
  var myColor = spec ? null : (mySeat === 0 ? WHITE : BLACK);
  damaStartRoom(myColor, oppBot, spec, false);
  /* الإعادة (replay) تُدار من damaRegisterRooms أو عبر window.applyRoomReplay الحيّ */
}

/* تهيئة مباراة غرفة (بلا رهان) — اللوحة الأولية واحدة عند الجميع */
function damaStartRoom(myColor, oppBot, spec, broadcastNew) {
  /* [Persist] استهلاك علم إعادة الانضمام (الرهان يُدار خادمياً في ضاما — لا خصم محلي) */
  if (typeof Rooms !== 'undefined' && Rooms && Rooms._rejoinLive) Rooms._rejoinLive = false;
  DAMA = DAMA || {};
  /* [RS-GameOpts] مؤقت الدور من إعدادات الغرفة (اختيار المالك) */
  if (typeof window !== 'undefined' && window.DM_ROOM_TIMER != null) DAMA.timeLimit = window.DM_ROOM_TIMER || 0;
  DAMA.eng = new DamaEngine();
  damaClearCaches(); DAMA.state = damaNewState();
  DAMA.human = myColor;                 /* لوني (null للمتفرج) */
  DAMA.ai = myColor === WHITE ? BLACK : WHITE;
  DAMA.mode = 'room';
  DAMA.oppBot = !!oppBot;
  /* [v18] بوت الغرفة يلعب دائماً بمستوى الخبير (عمق 9) — 0% خطأ */
  if (DAMA.oppBot) DAMA.level = DAMA_LEVELS.length - 1;
  DAMA.isSpectator = !!spec;
  DAMA.sel = null; DAMA.legal = []; DAMA.busy = false;
  DAMA.flipped = (myColor === BLACK);
  DAMA.lastFrom = null; DAMA.lastTo = null;
  DAMA.roomOrder = (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.order) ? Rooms.state.order.slice() : [];
  var setup = document.getElementById('damaSetup');
  var over = document.getElementById('damaOver');
  var play = document.getElementById('damaPlay');
  if (setup) setup.hidden = true;
  if (over) over.hidden = true;
  if (play) play.hidden = false;
  /* [Owner] أيقونات اللاعبين فوق/تحت اللوحة + حلقة الدور الذهبية + شريط المتفرجين */
  damaSetupIcons();
  if (broadcastNew) damaEmit('newgame', {});
  damaRender();
  if (spec) { damaSetStatus('👁️ ' + T('dama.spec')); return; }
  if (DAMA.state.turn === DAMA.ai) {
    if (DAMA.oppBot) setTimeout(damaAiTurn, 600);   /* خصم آلي في الغرفة */
    else damaSetStatus(T('dama.waitOpp'));
  }
}

/* بثّ حركة (قفزة واحدة) للخصم — تُخزَّن في moveHistory للسجل */
function damaEmitMove(mv) {
  DAMA._seq = (DAMA._seq || 0) + 1;
  /* [dedup] مفتاح بمعرّف المُرسِل — كلا الطرفين يبدأ seq من 0 (تصادم الرسالة الأولى) */
  damaEmit('move', { mv: mv, dedup: 'dm-' + damaMeId() + '-' + DAMA._seq });
}
function damaEmit(action, data) {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.sendMove !== 'function') return;
  var payload = { action: action, data: data || {}, by: damaMeId(), seq: (DAMA._seq || 0), ts: Date.now() };
  try { Rooms.sendMove('rmove', payload, { game_id: 'dm', status: 'playing' }); } catch (e) {}
}

/* استقبال حدث غرفة (SSE room:move) */
function damaRoomMove(d) {
  try {
    if (!d) return;
    if (d.action === 'rmove' && d.data) d = d.data;   /* فكّ غلاف rmove */
    var by = d.by;
    if (by != null && String(by) === String(damaMeId())) return;   /* تجاهل صدى حركاتي */
    var action = d.action;
    if (action === 'newgame') { damaResetBoardOnly(); return; }
    /* [B10] التعادل بالتوافق — مصادقة الطرفين */
    if (action === 'drawOffer') {
      if (DAMA && DAMA.state && !DAMA.state.over) {
        if (DAMA.isSpectator) { damaSetStatus('🤝 ' + T('dama.drawOffered')); return; }
        if (DAMA.state.turn !== DAMA.human && !DAMA.oppBot) return;   /* ليس طرفاً */
        damaShowDrawBar(T('dama.drawIncoming'));
        if (typeof SND !== 'undefined' && SND.notify) SND.notify();
      }
      return;
    }
    if (action === 'drawAgree') {
      var barEl = document.getElementById('damaDrawBar'); if (barEl) barEl.hidden = true;
      if (DAMA && DAMA.state && !DAMA.state.over) damaDrawAgreed();
      return;
    }
    if (action === 'drawDecline') {
      var barEl2 = document.getElementById('damaDrawBar'); if (barEl2) barEl2.hidden = true;
      damaSetStatus(T('dama.drawDeclinedTxt'));
      return;
    }
    if (action === 'resign') {
      if (DAMA && DAMA.state && !DAMA.state.over) damaFinalize(DAMA.human);  /* خصمي انسحب → فوزي */
      return;
    }
    if (action === 'move') {
      var mv = (d.data && d.data.mv) ? d.data.mv : null;
      if (mv) damaApplyRemoteMove(mv);
    }
  } catch (e) { if (typeof console !== 'undefined') console.error('[Dama MP] roomMove', e && e.message, e); }
}

/* تطبيق حركة وردت من الخصم/للمتفرج (دون إعادة البث) */
function damaApplyRemoteMove(mv) {
  if (!DAMA || !DAMA.state || DAMA.state.over || !mv) return;
  if (!DAMA.isSpectator && DAMA.state.turn === DAMA.human) return;  /* مكرّر/قديم — ليس دور الخصم */
  /* [B9] الحركة الواردة يجب أن تكون ضمن القائمة الصارمة (الأكل الإلزامي والسلسلة الكبرى) */
  try {
    var legal = DAMA.eng.legalMoves(DAMA.state, DAMA.state.turn);
    var valid = legal.some(function (q) {
      return q.from[0] === mv.from[0] && q.from[1] === mv.from[1]
        && q.to[0] === mv.to[0] && q.to[1] === mv.to[1] && !!q.cap === !!mv.cap;
    });
    if (!valid) return;
  } catch (e) { /* عند أي شك نطبّق كما كان */ }
  var wasCont = !!DAMA.state.cont;
  var info = DAMA.eng.applyMove(DAMA.state, mv);
  DAMA.lastFrom = mv.from; DAMA.lastTo = mv.to;
  DAMA.sel = null; DAMA.legal = [];
  damaRender();
  damaAnimate(mv, info);          /* [B9] طيران واقعي */
  damaMoveSound(mv, info, wasCont);  /* [B9] صوت بحسب نوع الحركة */
  if (info.crownedDeferred && info.crownedDeferred.length) damaCrownNote();
  if (info.continued) {
    damaSetStatus((DAMA.isSpectator ? '👁️ ' : '') + T('dama.oppChain'));
    return;
  }
  var out = DAMA.eng.detectOutcome(DAMA.state);
  if (out !== null) { damaFinalize(out); return; }
  /* [Souffler v2.27] قطعة الخصم التي تركت الأكل نُفخت — أوضحها للمشاهد/اللاعب */
  if (info.souffled) {
    damaSetStatus((DAMA.isSpectator ? '👁️ ' : '') + T('dama.souffleOpp'));
    damaUpdateTurn();
    damaStartTimer();
    damaAutoHint();
    return;
  }
  if (DAMA.isSpectator) { damaSetStatus('👁️ ' + T('dama.spec')); damaUpdateTurn(); return; }
  damaUpdateTurn();
  damaStartTimer();
  damaAutoHint();   /* [B10] إبراز القطعة الملزَمة */
}

/* استقبال «مباراة جديدة» من الخصم: إعادة التهيئة محلياً */
function damaResetBoardOnly() {
  if (!DAMA) return;
  damaClearCaches(); DAMA.state = damaNewState();
  DAMA.sel = null; DAMA.legal = []; DAMA.busy = false;
  DAMA.lastFrom = null; DAMA.lastTo = null;
  var over = document.getElementById('damaOver'); if (over) over.hidden = true;
  damaRender();
  damaSetStatus('');   /* [UI] مباراة جديدة = شريط حالة نظيف (حالات الانتظار تُضبط أدناه) */
  if (DAMA.isSpectator) { damaSetStatus('👁️ ' + T('dama.newMatch')); return; }
  if (DAMA.state.turn === DAMA.ai) {
    if (DAMA.oppBot) setTimeout(damaAiTurn, 600);
    else damaSetStatus(T('dama.waitOpp'));
  }
}

/* «مباراة جديدة» في الغرفة: إعادة التهيئة + بثّ (تأثير متماثل عند الطرفين) */
function damaRoomNewGame() {
  if (!DAMA) return;
  /* [MP-Uni] نفس منهجية البلياردو: إعادة المباراة عبر الخادم (تصويت المشاركين)
     كي تبقى حالة الغرفة (waiting/playing) متزامنة عند الجميع؛
     البوت لا يصوت → إعادة محلية مباشرة. */
  if (!DAMA.oppBot && typeof Rooms !== 'undefined' && Rooms && typeof Rooms.startRematch === 'function' && Rooms.state) {
    Rooms.startRematch();
    return;
  }
  damaStartRoom(DAMA.human, DAMA.oppBot, DAMA.isSpectator, false);
}

/* نتيجة المباراة في الغرفة (بلا رهان) */
/* [B-settle] تسوية رهان غرفة ضاما خادمياً: المضيف فقط يُعلن النتيجة للسيرفر
   (result: 'w0' فاز صاحب order[0]=الأبيض | 'w1' فاز الأسود | 'draw').
   السيرفر يقتطع رسومه آلياً حسب نوع الغرفة (ساعة بلا رسوم / نسبة 5%)
   ويبثّ room:settle للجميع — الأرصدة تُزامَن عند الطرفين في _onSettle. */
function damaRoomSettleOutcome(outcome) {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.roomSettle !== 'function') return;
  if (!Rooms.state || Rooms.state.game_id !== 'dm') return;
  var result = (outcome === 'draw') ? 'draw' : (outcome === WHITE ? 'w0' : 'w1');
  try { Rooms.roomSettle(result); } catch (e) {}
}

function damaShowOverRoom(outcome) {
  var ov = document.getElementById('damaOver');
  var em = document.getElementById('damaOverEm');
  var tx = document.getElementById('damaOverTx');
  var amt = document.getElementById('damaOverAmt');
  if (!ov) return;
  var friendly = '<span style="opacity:.78">🤝 ' + (T('dama.friendly') || 'مباراة ودية — لا رهان') + '</span>';
  if (!outcome || outcome === 'draw') {
    if (em) em.textContent = '🤝';
    if (tx) tx.textContent = T('dama.draw') || 'تعادل';
    if (amt) amt.innerHTML = friendly;
  } else if (DAMA.isSpectator) {
    if (em) em.textContent = '🔁';
    if (tx) tx.textContent = (outcome === WHITE ? (T('dama.whiteWon') || 'فاز الأبيض') : (T('dama.blackWon') || 'فاز الأسود'));
    if (amt) amt.innerHTML = '<span style="opacity:.7">' + (T('dama.matchOver') || 'انتهت المباراة') + '</span>';
  } else if (outcome === DAMA.human) {
    if (em) em.textContent = '🏆';
    if (tx) tx.textContent = T('dama.youWin') || 'فزت!';
    if (amt) amt.innerHTML = friendly;
    if (typeof confetti === 'function') confetti(50);
  } else {
    if (em) em.textContent = '💀';
    if (tx) tx.textContent = T('dama.youLose') || 'خسرت';
    if (amt) amt.innerHTML = friendly;
  }
  ov.hidden = false;
}

/* [Resilience] إعادة بناء اللوحة من سجل الحركات (عائد/مشاهد متأخر) */
function damaApplyReplay(d) {
  try {
    if (!d || !d.history || !d.history.length) return;
    if (!DAMA || DAMA.mode !== 'room' || !DAMA.state) return;
    damaClearCaches(); DAMA.state = damaNewState();
    var resignedBy = null;
    for (var i = 0; i < d.history.length; i++) {
      var h = d.history[i];
      if (!h || !h.action) continue;
      if (h.action === 'newgame') { damaClearCaches(); DAMA.state = damaNewState(); resignedBy = null; continue; }
      if (h.action === 'resign') { resignedBy = h.by; continue; }   /* نهاية بالاستسلام */
      if (h.action === 'move' && h.data && h.data.mv) DAMA.eng.applyMove(DAMA.state, h.data.mv);
    }
    DAMA.sel = null; DAMA.legal = [];
    if (resignedBy != null) {
      /* نهاية بالانسحاب: الفائز هو الطرف الآخر لمَن انسحب */
      DAMA.state.over = true;
      var out = damaFinalizeOutcomeOnResign(resignedBy);
      damaRender();
      damaShowOverRoom(out);
      return;
    }
    damaRender();
    damaUpdateTurn();
  } catch (e) { if (typeof console !== 'undefined') console.error('[Dama MP] replay', e && e.message, e); }
}

/* عند انسحاب من تاريخ الإعادة: مقعد 0 = أبيض، مقعد 1 = أسود.
   مَن انسحب خسر ⇒ الفائز لون الخصم. */
function damaFinalizeOutcomeOnResign(resignedBy) {
  var room = (typeof Rooms !== 'undefined') ? Rooms.state : null;
  var order = (room && room.order) ? room.order : (DAMA.roomOrder || []);
  var idx = -1;
  for (var i = 0; i < order.length; i++) if (String(order[i]) === String(resignedBy)) { idx = i; break; }
  var resignerColor = (idx === 0) ? WHITE : BLACK;   /* مقعد 0 = أبيض */
  return DAMA.eng.opponent(resignerColor);
}

/* ── expose to the page (onclick attributes call globals) ── */
window.eDama = eDama;
window.initDama = initDama;
window.damaSetDiff = damaSetDiff;
window.damaSetColor = damaSetColor;
window.damaStart = damaStart;
window.damaClick = damaClick;
window.damaResign = damaResign;
window.damaSetTimer = damaSetTimer;
window.damaLevelName = damaLevelName;
window.damaToSetup = damaToSetup;
window.damaOnline = damaOnline;
window.damaNewMatch = damaNewMatch;
window.damaHumanMove = damaHumanMove;          /* للاختبار/التكامل */
window.damaRoomStart = damaRoomStart;
window.damaRoomMove = damaRoomMove;
window.damaRoomNewGame = damaRoomNewGame;
window.damaApplyReplay = damaApplyReplay;
window.damaRegisterRooms = damaRegisterRooms;

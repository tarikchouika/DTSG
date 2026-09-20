/* ══════════════════════════════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — الشطرنج الدولي (Chess)
   محرك قواعد كامل بالمعايير الدولية (FIDE):
   • التبييت (كلا الجهتين بشروطه) • الأخذ بالتجاوز (en passant)
   • الترقية باختيار القطعة • الكش/كش مات/التعادل بالجمود (stalemate)
   • قاعدة 50 حركة • تكرار الموقع ثلاثاً • نقص المواد
   أنماط اللعب: وجه لوجه محلي • غرفة أونلاين (رهان اختياري) • بوت تدريبي
   الإحداثيات: صف 0 = الرتبة 8 (أعلى، جهة الأسود) • عمود 0 = a
   ══════════════════════════════════════════════════════════════════ */
"use strict";

/* ─────────────── المحرك النقي (بلا DOM) ─────────────── */

function chessNewState() {
  var state = {
    board: [
      ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
      ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
      ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ],
    turn: 'w',
    log: [],                 /* تدوين الحركات */
    captured: { w: [], b: [] },   /* ما أخذه كل طرف */
    castling: { K: true, Q: true, k: true, q: true },
    ep: null,                    /* خانة العبور للأخذ بالتجاوز */
    half: 0, full: 1,
    over: false, outcome: null,  /* outcome: 'w' | 'b' | 'draw' */
    endReason: null,             /* mate/stalemate/50move/rep/material/agreed */
    log: [],                     /* نصوص الحركات */
    rep: {}                      /* عدّاد تكرار الموقع */
  };
  /* [FIDE] الوضع الافتتاحي يُحتسب في التكرار الثلاثي */
  state.rep[chessPosKey(state)] = 1;
  return state;
}

function chessCloneState(s) {
  var b = [];
  for (var r = 0; r < 8; r++) {
    var row = [];
    for (var c = 0; c < 8; c++) row.push(s.board[r][c]);
    b.push(row);
  }
  return {
    board: b, turn: s.turn,
    castling: { K: s.castling.K, Q: s.castling.Q, k: s.castling.k, q: s.castling.q },
    ep: s.ep ? [s.ep[0], s.ep[1]] : null,
    half: s.half, full: s.full,
    over: s.over, outcome: s.outcome, endReason: s.endReason,
    log: s.log.slice(),
    captured: { w: (s.captured ? s.captured.w : []).slice(), b: (s.captured ? s.captured.b : []).slice() },
    rep: Object.assign({}, s.rep)   /* نسخة مستقلة — عدّاد التكرار لا يتسرب بين الفروع */
  };
}

/* [AI-MAX] نسخة بحث خفيفة: البحث يقرأ الرقعة والدور والحقوق فقط — بلا
   نسخ log/captured/rep (وفر مخصصات هائلة في كل عقدة = ضغط GC أقل بكثير).
   تُستعمل حصراً داخل الذكاء؛ الواجهة والفروع الحقيقية تستعمل chessCloneState. */
function chessCloneSearch(s) {
  var b = [s.board[0].slice(), s.board[1].slice(), s.board[2].slice(), s.board[3].slice(),
           s.board[4].slice(), s.board[5].slice(), s.board[6].slice(), s.board[7].slice()];
  return {
    board: b, turn: s.turn,
    castling: { K: s.castling.K, Q: s.castling.Q, k: s.castling.k, q: s.castling.q },
    ep: s.ep ? [s.ep[0], s.ep[1]] : null,
    half: s.half, full: s.full,
    over: s.over, outcome: s.outcome, endReason: s.endReason,
    log: null, captured: null, rep: null
  };
}

function chessInB(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function chessIsWhite(p) { return !!p && p === p.toUpperCase(); }
function chessType(p) { return p ? p.toUpperCase() : null; }
function chessOther(c) { return c === 'w' ? 'b' : 'w'; }

/* مفتاح الموقع (للحكم على التكرار الثلاثي): الرقعة + الدور + حقوق التبييت + التجاوز */
function chessPosKey(s) {
  var k = '';
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) k += (s.board[r][c] || '.');
  k += '|' + s.turn + '|';
  k += (s.castling.K ? 'K' : '') + (s.castling.Q ? 'Q' : '') + (s.castling.k ? 'k' : '') + (s.castling.q ? 'q' : '');
  k += '|' + (s.ep ? s.ep[0] + ',' + s.ep[1] : '-');
  return k;
}

var CHESS_N = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
var CHESS_KD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
var CHESS_DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var CHESS_ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/* هل الخانة (r,c) مهددة من قطع اللون byWhite؟ */
function chessAttacked(board, r, c, byWhite) {
  var rr, cc, i, d, p;
  /* جنود: يهدّدون قطرياً باتجاه تقدمهم */
  var pr = byWhite ? r + 1 : r - 1;   /* الجندي الأبيض في (pr, c±1) يهدّد (r,c) */
  for (i = -1; i <= 1; i += 2) {
    rr = pr; cc = c + i;
    if (chessInB(rr, cc)) {
      p = board[rr][cc];
      if (p && chessType(p) === 'P' && chessIsWhite(p) === byWhite) return true;
    }
  }
  /* فرسان */
  for (i = 0; i < 8; i++) {
    rr = r + CHESS_N[i][0]; cc = c + CHESS_N[i][1];
    if (chessInB(rr, cc)) {
      p = board[rr][cc];
      if (p && chessType(p) === 'N' && chessIsWhite(p) === byWhite) return true;
    }
  }
  /* ملك (لمنع التبييت عبر خانة مهددة) */
  for (i = 0; i < 8; i++) {
    rr = r + CHESS_KD[i][0]; cc = c + CHESS_KD[i][1];
    if (chessInB(rr, cc)) {
      p = board[rr][cc];
      if (p && chessType(p) === 'K' && chessIsWhite(p) === byWhite) return true;
    }
  }
  /* انزلاق قطري: فيلة/ملكات */
  for (i = 0; i < 4; i++) {
    d = CHESS_DIAG[i]; rr = r + d[0]; cc = c + d[1];
    while (chessInB(rr, cc)) {
      p = board[rr][cc];
      if (p) {
        var t = chessType(p);
        if (chessIsWhite(p) === byWhite && (t === 'B' || t === 'Q')) return true;
        break;
      }
      rr += d[0]; cc += d[1];
    }
  }
  /* انزلاق مستقيم: رخاخ/ملكات */
  for (i = 0; i < 4; i++) {
    d = CHESS_ORTH[i]; rr = r + d[0]; cc = c + d[1];
    while (chessInB(rr, cc)) {
      p = board[rr][cc];
      if (p) {
        var t2 = chessType(p);
        if (chessIsWhite(p) === byWhite && (t2 === 'R' || t2 === 'Q')) return true;
        break;
      }
      rr += d[0]; cc += d[1];
    }
  }
  return false;
}

function chessKingPos(board, white) {
  var target = white ? 'K' : 'k';
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    if (board[r][c] === target) return [r, c];
  }
  return null;
}

function chessInCheck(s, white) {
  var kp = chessKingPos(s.board, white);
  if (!kp) return false;
  return chessAttacked(s.board, kp[0], kp[1], !white);
}

/* حركات شبه قانونية لقطعة (بلا فحص أمان الملك) */
function chessPseudoMoves(s, r, c) {
  var p = s.board[r][c];
  if (!p) return [];
  var white = chessIsWhite(p);
  var t = chessType(p);
  var out = [];
  var i, d, rr, cc, q;
  function push(tr, tc, extra) {
    var tp = s.board[tr][tc];
    if (tp && chessIsWhite(tp) === white) return false;
    var mv = { from: [r, c], to: [tr, tc], piece: p, capture: tp || null };
    if (extra) for (var k in extra) mv[k] = extra[k];
    /* ترقية الجندي */
    if (t === 'P' && ((white && tr === 0) || (!white && tr === 7))) {
      var promos = ['q', 'r', 'b', 'n'];
      for (var pi = 0; pi < 4; pi++) {
        out.push(Object.assign({}, mv, { promo: promos[pi] }));
      }
    } else {
      out.push(mv);
    }
    return !tp;   /* يمكن المواصلة إن كانت فارغة */
  }
  if (t === 'P') {
    var dir = white ? -1 : 1;
    var startRow = white ? 6 : 1;
    /* تقدم للأمام (بلا أكل) */
    rr = r + dir;
    if (chessInB(rr, c) && !s.board[rr][c]) {
      push(rr, c);
      var rr2 = r + 2 * dir;
      if (r === startRow && !s.board[rr2][c]) push(rr2, c, { double: true });
    }
    /* أكل قطري + أخذ بالتجاوز */
    for (i = -1; i <= 1; i += 2) {
      rr = r + dir; cc = c + i;
      if (!chessInB(rr, cc)) continue;
      var tp = s.board[rr][cc];
      if (tp && chessIsWhite(tp) !== white) push(rr, cc);
      else if (!tp && s.ep && s.ep[0] === rr && s.ep[1] === cc) {
        out.push({ from: [r, c], to: [rr, cc], piece: p, capture: s.board[r][cc], ep: true });
      }
    }
  } else if (t === 'N') {
    for (i = 0; i < 8; i++) {
      rr = r + CHESS_N[i][0]; cc = c + CHESS_N[i][1];
      if (chessInB(rr, cc)) push(rr, cc);
    }
  } else if (t === 'K') {
    for (i = 0; i < 8; i++) {
      rr = r + CHESS_KD[i][0]; cc = c + CHESS_KD[i][1];
      if (chessInB(rr, cc)) push(rr, cc);
    }
    /* التبييت — يُفحص بالكامل هنا (الشروط القانونية كاملة) */
    var homeRow = white ? 7 : 0;
    if (r === homeRow && c === 4 && !chessInCheck(s, white)) {
      var kRight = white ? s.castling.K : s.castling.k;
      var qRight = white ? s.castling.Q : s.castling.q;
      var rookK = white ? 'R' : 'r', rookQ = rookK;
      /* جهة الملك: f/g فارغتان، الرخ في h، e/f/g غير مهددة */
      if (kRight && s.board[homeRow][5] === null && s.board[homeRow][6] === null
          && s.board[homeRow][7] === rookK
          && !chessAttacked(s.board, homeRow, 5, !white)
          && !chessAttacked(s.board, homeRow, 6, !white)) {
        out.push({ from: [r, c], to: [homeRow, 6], piece: p, capture: null, castle: 'K' });
      }
      /* جهة الملكة: b/c/d فارغات، الرخ في a، e/d/c غير مهددة */
      if (qRight && s.board[homeRow][1] === null && s.board[homeRow][2] === null && s.board[homeRow][3] === null
          && s.board[homeRow][0] === rookQ
          && !chessAttacked(s.board, homeRow, 3, !white)
          && !chessAttacked(s.board, homeRow, 2, !white)) {
        out.push({ from: [r, c], to: [homeRow, 2], piece: p, capture: null, castle: 'Q' });
      }
    }
  } else {
    var dirs = (t === 'B') ? CHESS_DIAG : (t === 'R') ? CHESS_ORTH : CHESS_DIAG.concat(CHESS_ORTH);
    for (i = 0; i < dirs.length; i++) {
      d = dirs[i]; rr = r + d[0]; cc = c + d[1];
      while (chessInB(rr, cc)) {
        if (!push(rr, cc)) break;
        rr += d[0]; cc += d[1];
      }
    }
  }
  return out;
}

/* تطبيق حركة شبه قانونية على نسخة — لفحص أمان الملك */
function chessApplyPseudo(s, mv) {
  var white = chessIsWhite(mv.piece);
  var fr = mv.from[0], fc = mv.from[1], tr = mv.to[0], tc = mv.to[1];
  if (mv.ep) s.board[mv.from[0]][mv.to[1]] = null;          /* الجندي المُتجاوَز */
  s.board[tr][tc] = mv.piece;
  s.board[fr][fc] = null;
  if (mv.promo) s.board[tr][tc] = white ? mv.promo.toUpperCase() : mv.promo;
  if (mv.castle) {
    var homeRow = white ? 7 : 0;
    if (mv.castle === 'K') { s.board[homeRow][5] = s.board[homeRow][7]; s.board[homeRow][7] = null; }
    else { s.board[homeRow][3] = s.board[homeRow][0]; s.board[homeRow][0] = null; }
  }
}

/* كل الحركات القانونية للاعب الدور */
function chessLegalMoves(s) {
  if (s.over) return [];
  var out = [];
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.board[r][c];
    if (!p || chessIsWhite(p) !== (s.turn === 'w')) continue;
    var pseudo = chessPseudoMoves(s, r, c);
    for (var i = 0; i < pseudo.length; i++) {
      var mv = pseudo[i];
      var s2 = chessCloneSearch(s);   /* [AI-MAX] نسخة خفيفة — الفحص يقرأ الرقعة فقط */
      chessApplyPseudo(s2, mv);
      if (!chessInCheck(s2, s.turn === 'w')) out.push(mv);
    }
  }
  return out;
}

/* الحركات القانونية لقطعة محددة (للواجهة) */
function chessMovesForPiece(s, r, c) {
  var p = s.board[r][c];
  if (!p || s.over || chessIsWhite(p) !== (s.turn === 'w')) return [];
  var mine = chessLegalMoves(s).filter(function (m) { return m.from[0] === r && m.from[1] === c; });
  return mine;
}

/* ملاحظة الحركة: رمز + من–إلى + لاحقات */
function chessNotation(mv) {
  var t = chessType(mv.piece);
  var glyph = { P: '', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔' }[t] || '';
  var files = 'abcdefgh';
  var from = files[mv.from[1]] + (8 - mv.from[0]);
  var to = files[mv.to[1]] + (8 - mv.to[0]);
  var txt = (t === 'P' ? '' : glyph + ' ') + from + (mv.capture ? '×' : '–') + to;
  if (mv.promo) txt += '=' + { q: '♕', r: '♖', b: '♗', n: '♘' }[mv.promo];
  if (mv.castle) txt = mv.castle === 'K' ? 'O-O' : 'O-O-O';
  return txt;
}

/* تطبيق حركة قانونية على الحالة (تغيير مباشر) — يعيد معلومات النتيجة */
function chessMakeMove(s, mv) {
  var white = chessIsWhite(mv.piece);
  var info = { captured: null, check: false, mate: false, draw: false, end: null };
  var fr = mv.from[0], fc = mv.from[1], tr = mv.to[0], tc = mv.to[1];
  /* سجل نصي قبل التنفيذ */
  var note = chessNotation(mv);
  /* الأخذ (بما فيه التجاوز) */
  if (mv.ep) {
    info.captured = s.board[fr][tc];
    s.board[fr][tc] = null;
  } else if (s.board[tr][tc]) {
    info.captured = s.board[tr][tc];
  }
  if (info.captured && s.captured) s.captured[white ? 'w' : 'b'].push(info.captured);
  /* نقل */
  s.board[tr][tc] = mv.piece;
  s.board[fr][fc] = null;
  if (mv.promo) s.board[tr][tc] = white ? mv.promo.toUpperCase() : mv.promo;
  /* التبييت: انقل الرخ */
  if (mv.castle) {
    var homeRow = white ? 7 : 0;
    if (mv.castle === 'K') { s.board[homeRow][5] = s.board[homeRow][7]; s.board[homeRow][7] = null; }
    else { s.board[homeRow][3] = s.board[homeRow][0]; s.board[homeRow][0] = null; }
  }
  /* حقوق التبييت */
  if (mv.piece === 'K') { s.castling.K = false; s.castling.Q = false; }
  if (mv.piece === 'k') { s.castling.k = false; s.castling.q = false; }
  if (fr === 7 && fc === 0 || tr === 7 && tc === 0) s.castling.Q = false;
  if (fr === 7 && fc === 7 || tr === 7 && tc === 7) s.castling.K = false;
  if (fr === 0 && fc === 0 || tr === 0 && tc === 0) s.castling.q = false;
  if (fr === 0 && fc === 7 || tr === 0 && tc === 7) s.castling.k = false;
  /* التجاوز: خانة العبور لل doble */
  s.ep = null;
  if (mv.double) s.ep = [(fr + tr) / 2, fc];
  /* الساعات */
  if (chessType(mv.piece) === 'P' || info.captured) s.half = 0; else s.half++;
  if (!white) s.full++;
  /* الدور */
  s.turn = chessOther(s.turn);
  /* كش/نهايات */
  var oppWhite = s.turn === 'w';
  info.check = chessInCheck(s, oppWhite);
  var oppMoves = chessLegalMoves(s).length;
  if (oppMoves === 0) {
    if (info.check) {
      info.mate = true;
      s.over = true; s.outcome = white ? 'w' : 'b'; s.endReason = 'mate';
      note += '#';
    } else {
      info.draw = true;
      s.over = true; s.outcome = 'draw'; s.endReason = 'stalemate';
    }
  } else if (info.check) note += '+';
  /* تعادلات */
  if (!s.over) {
    if (s.half >= 100) { s.over = true; s.outcome = 'draw'; s.endReason = '50move'; info.draw = true; }
    else if (s.rep) {   /* [AI-MAX] نسخة البحث الخفيفة بلا rep — التكرار يُحكم في اللعب الحقيقي فقط */
      var key = chessPosKey(s);
      s.rep[key] = (s.rep[key] || 0) + 1;
      if (s.rep[key] >= 3) { s.over = true; s.outcome = 'draw'; s.endReason = 'rep'; info.draw = true; }
    }
  }
  if (!s.over && chessInsufficient(s)) { s.over = true; s.outcome = 'draw'; s.endReason = 'material'; info.draw = true; }
  if (s.log) s.log.push(note);
  info.note = note;
  return info;
}

/* نقص المواد: ملك ضد ملك / ملك+فارس / ملك+فيل / فيلا نفس اللون */
function chessInsufficient(s) {
  var minors = [];   /* [type, color-square] */
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.board[r][c];
    if (!p) continue;
    var t = chessType(p);
    if (t === 'K') continue;
    if (t === 'P' || t === 'R' || t === 'Q') return false;
    minors.push(t === 'B' ? 'B' + ((r + c) % 2) : 'N');
  }
  if (minors.length === 0) return true;
  if (minors.length === 1) return true;                       /* K+minor ضد K */
  if (minors.length === 2 && minors[0][0] === 'B' && minors[1][0] === 'B'
      && minors[0] === minors[1]) return true;                 /* فيلا نفس اللون */
  return false;
}

/* حالة اللعبة للعرض: null ما دامت جارية */
function chessStatus(s) {
  if (!s.over) return null;
  return { outcome: s.outcome, reason: s.endReason };
}

/* perft — عدّ عقد الشجرة (لاختبار مولّد الحركات) */
function chessPerft(s, depth) {
  if (depth === 0) return 1;
  var moves = chessLegalMoves(s);
  if (depth === 1) return moves.length;
  var n = 0;
  for (var i = 0; i < moves.length; i++) {
    var s2 = chessCloneSearch(s);   /* [AI-MAX] perft بلا نسخ السجل/الأسرى — أسرع بكثير */
    chessMakeMove(s2, moves[i]);
    n += chessPerft(s2, depth - 1);
  }
  return n;
}

/* ─────────────── ذكاء اصطناعي خبير (v19 Master) ───────────────
   نواة بحث سريعة برقعة مسطحة (64) + make/unmake بلا استنساخ حالة:
   • تعميق تدريجي مع تقليم ألفا-بيتا + بحث سكون quiescence (أكلات/ترقيات)
   • جدول transposition عبر Map بمفتاح FEN-like مبسط (مطابق chessPosKey)
   • ترتيب الحركات: TT → أكلات MVV-LVA → ترقيات → كش → killers → history
   • تمديد الكش + كشف مات/جمود بمسافة (100000 - ply)
   • تقييم متقدم: قيم قطع قياسية + piece-square لكل القطع (ملك بطورين)
     + سلامة الملك + بنية البيدق (مزدوج/معزول/متجاوز) + حركية mobility
     + رخاخ على الأعمدة المفتوحة/نصف المفتوحة
   • تفادي التكرار المضيء: تكرار الموقع على مسار البحث أو في سجل اللعبة = 0،
     وكسر عشوائي طفيف (±10 سنتي-بيدق) بين أفضل الحركات المتكافئة فقط */
var CHESS_VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
/* جداول القطعة-المربع (منظور الأبيض: الصف 0 = الرتبة 8) */
var CHESS_PST_P = [0, 0, 0, 0, 0, 0, 0, 0,
                   50, 50, 50, 50, 50, 50, 50, 50,
                   10, 10, 20, 30, 30, 20, 10, 10,
                   5, 5, 10, 25, 25, 10, 5, 5,
                   0, 0, 0, 20, 20, 0, 0, 0,
                   5, -5, -10, 0, 0, -10, -5, 5,
                   5, 10, 10, -20, -20, 10, 10, 5,
                   0, 0, 0, 0, 0, 0, 0, 0];
var CHESS_PST_N = [-50, -40, -30, -30, -30, -30, -40, -50,
                   -40, -20, 0, 0, 0, 0, -20, -40,
                   -30, 0, 10, 15, 15, 10, 0, -30,
                   -30, 5, 15, 20, 20, 15, 5, -30,
                   -30, 0, 15, 20, 20, 15, 0, -30,
                   -30, 5, 10, 15, 15, 10, 5, -30,
                   -40, -20, 0, 5, 5, 0, -20, -40,
                   -50, -40, -30, -30, -30, -30, -40, -50];
var CHESS_PST_B = [-20, -10, -10, -10, -10, -10, -10, -20,
                   -10, 0, 0, 0, 0, 0, 0, -10,
                   -10, 0, 5, 10, 10, 5, 0, -10,
                   -10, 5, 5, 10, 10, 5, 5, -10,
                   -10, 0, 10, 10, 10, 10, 0, -10,
                   -10, 10, 10, 10, 10, 10, 10, -10,
                   -10, 5, 0, 0, 0, 0, 5, -10,
                   -20, -10, -10, -10, -10, -10, -10, -20];
var CHESS_PST_R = [0, 0, 0, 0, 0, 0, 0, 0,
                   5, 10, 10, 10, 10, 10, 10, 5,
                   -5, 0, 0, 0, 0, 0, 0, -5,
                   -5, 0, 0, 0, 0, 0, 0, -5,
                   -5, 0, 0, 0, 0, 0, 0, -5,
                   -5, 0, 0, 0, 0, 0, 0, -5,
                   -5, 0, 0, 0, 0, 0, 0, -5,
                   0, 0, 0, 5, 5, 0, 0, 0];
var CHESS_PST_Q = [-20, -10, -10, -5, -5, -10, -10, -20,
                   -10, 0, 0, 0, 0, 0, 0, -10,
                   -10, 0, 5, 5, 5, 5, 0, -10,
                   -5, 0, 5, 5, 5, 5, 0, -5,
                   0, 0, 5, 5, 5, 5, 0, -5,
                   -10, 5, 5, 5, 5, 5, 0, -10,
                   -10, 0, 5, 0, 0, 0, 0, -10,
                   -20, -10, -10, -5, -5, -10, -10, -20];
var CHESS_PST_K = [-30, -40, -40, -50, -50, -40, -40, -30,
                   -30, -40, -40, -50, -50, -40, -40, -30,
                   -30, -40, -40, -50, -50, -40, -40, -30,
                   -30, -40, -40, -50, -50, -40, -40, -30,
                   -20, -30, -30, -40, -40, -30, -30, -20,
                   -10, -20, -20, -20, -20, -20, -20, -10,
                   20, 20, 0, 0, 0, 0, 20, 20,
                   20, 30, 10, 0, 0, 10, 30, 20];
var CHESS_PST_KE = [-50, -40, -30, -20, -20, -30, -40, -50,
                    -30, -20, -10, 0, 0, -10, -20, -30,
                    -30, -10, 20, 30, 30, 20, -10, -30,
                    -30, -10, 30, 40, 40, 30, -10, -30,
                    -30, -10, 30, 40, 40, 30, -10, -30,
                    -30, -10, 20, 30, 30, 20, -10, -30,
                    -30, -30, 0, 0, 0, 0, -30, -30,
                    -50, -30, -30, -30, -30, -30, -30, -50];

/* ── هياكل مساعدة مسطحة (64 خانة) تُبنى مرة واحدة عند التحميل ── */
var CHESS_AI_TGT_N = [];      /* وجهات الفارس لكل خانة */
var CHESS_AI_TGT_K = [];      /* وجهات الملك */
var CHESS_AI_RAYS = [];       /* 8 أشعة لكل خانة: 0-3 مستقيمة (رخ) / 4-7 قطرية (فيل) */
var CHESS_AI_WPA = [];        /* خانات يهاجم منها جندي أبيض هذه الخانة */
var CHESS_AI_BPA = [];        /* خانات يهاجم منها جندي أسود هذه الخانة */
var CHESS_AI_MIR = new Int32Array(64);    /* انعكاس رأسي (منظور الأسود للجداول) */
var CHESS_AI_CHR = new Array(129);        /* رمز محرف → محرف مفتاح */
var CHESS_AI_VAL = new Int32Array(129);   /* قيمة القطعة حسب رمز المحرف */
var CHESS_AI_PASS = new Int32Array(8);    /* مكافأة البيدق المتجاوز حسب الصف (للأبيض) */
var CHESS_AI_PROMO = [0, 78, 66, 82, 81]; /* ترميز الترقية: 1=N 2=B 3=R 4=Q */
(function chessAiInitTables() {
  var orth = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (var sq = 0; sq < 64; sq++) {
    var r = sq >> 3, c = sq & 7, i, rr, cc;
    var kn = [], kg = [];
    for (i = 0; i < 8; i++) {
      rr = r + CHESS_N[i][0]; cc = c + CHESS_N[i][1];
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) kn.push(rr * 8 + cc);
      rr = r + CHESS_KD[i][0]; cc = c + CHESS_KD[i][1];
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) kg.push(rr * 8 + cc);
    }
    CHESS_AI_TGT_N.push(kn);
    CHESS_AI_TGT_K.push(kg);
    var rays = [];
    for (var d = 0; d < 8; d++) {
      var dd = d < 4 ? orth[d] : diag[d - 4];
      var ray = [];
      rr = r + dd[0]; cc = c + dd[1];
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { ray.push(rr * 8 + cc); rr += dd[0]; cc += dd[1]; }
      rays.push(ray);
    }
    CHESS_AI_RAYS.push(rays);
    var wpa = [];
    if (r + 1 < 8) { if (c > 0) wpa.push((r + 1) * 8 + c - 1); if (c < 7) wpa.push((r + 1) * 8 + c + 1); }
    CHESS_AI_WPA.push(wpa);
    var bpa = [];
    if (r - 1 >= 0) { if (c > 0) bpa.push((r - 1) * 8 + c - 1); if (c < 7) bpa.push((r - 1) * 8 + c + 1); }
    CHESS_AI_BPA.push(bpa);
    CHESS_AI_MIR[sq] = (7 - r) * 8 + c;
  }
  for (var j = 0; j < 129; j++) CHESS_AI_CHR[j] = '.';
  CHESS_AI_CHR[66] = 'B'; CHESS_AI_CHR[75] = 'K'; CHESS_AI_CHR[78] = 'N';
  CHESS_AI_CHR[80] = 'P'; CHESS_AI_CHR[81] = 'Q'; CHESS_AI_CHR[82] = 'R';
  CHESS_AI_CHR[98] = 'b'; CHESS_AI_CHR[107] = 'k'; CHESS_AI_CHR[110] = 'n';
  CHESS_AI_CHR[112] = 'p'; CHESS_AI_CHR[113] = 'q'; CHESS_AI_CHR[114] = 'r';
  CHESS_AI_VAL[80] = 100; CHESS_AI_VAL[78] = 320; CHESS_AI_VAL[66] = 330;
  CHESS_AI_VAL[82] = 500; CHESS_AI_VAL[81] = 900; CHESS_AI_VAL[75] = 0;
  /* الأبيض: الصف 0 = رتبة 8 (ترقية) → الأعلى قيمة كلما تقدّم */
  CHESS_AI_PASS[0] = 90; CHESS_AI_PASS[1] = 90; CHESS_AI_PASS[2] = 60;
  CHESS_AI_PASS[3] = 38; CHESS_AI_PASS[4] = 24; CHESS_AI_PASS[5] = 13;
  CHESS_AI_PASS[6] = 5; CHESS_AI_PASS[7] = 0;
})();

/* ── مخازن البحث المشتركة (بحث واحد متزامن — بلا إعادة دخول) ── */
var CHESS_AI_MV = new Int32Array(128 * 320);    /* الحركات لكل عمق */
var CHESS_AI_SC = new Int32Array(128 * 320);    /* نقاط ترتيب الحركات */
var CHESS_AI_UCAP = new Int32Array(160);        /* ما أُخذ (للتراجع) */
var CHESS_AI_UCAST = new Int32Array(160);
var CHESS_AI_UEP = new Int32Array(160);
var CHESS_AI_UHALF = new Int32Array(160);
var CHESS_AI_UWK = new Int32Array(160);
var CHESS_AI_UBK = new Int32Array(160);
var CHESS_AI_PATH = new Array(160);             /* مفاتيح مواقع مسار البحث */
var CHESS_AI_KILL = new Int32Array(160 * 2);    /* حركات قاتلة (killer) */
var CHESS_AI_HIST = new Int32Array(4096);       /* heuristics تاريخية */
var CHESS_AI_KEY = new Array(64);               /* محارف مفتاح الرقعة (تُحدَّث تزايدياً) */
var CHESS_AI_WPF = new Int32Array(8), CHESS_AI_BPF = new Int32Array(8);
var CHESS_AI_BMIN = new Int32Array(8), CHESS_AI_WMAX = new Int32Array(8);
var CHESS_AI_WPL = new Int32Array(8), CHESS_AI_BPL = new Int32Array(8);
var CHESS_AI_WRL = new Int32Array(10), CHESS_AI_BRL = new Int32Array(10);
var CHESS_AI_NOW = (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now(); }
  : function () { return Date.now(); };
var CHESS_AI_TT = null;          /* Map: مفتاح → {d, s, f, m} */
var CHESS_AI_GREP = null;       /* عدّاد تكرار سجل اللعبة (s.rep) */
var CHESS_AI_NODES = 0, CHESS_AI_DEADLINE = 0;
var CHESS_AI_ABORT = { chessAiAbort: true };

/* هل الخانة sq مهددة من قطع اللون byWhite؟ (نسخة مسطحة سريعة) */
function chessAtk(b, sq, byWhite) {
  var i, k, d, code, arr = byWhite ? CHESS_AI_WPA[sq] : CHESS_AI_BPA[sq];
  for (i = 0; i < arr.length; i++) {
    code = b[arr[i]];
    if (code && (byWhite ? code < 97 : code >= 97) && (code & 0xDF) === 80) return true;
  }
  arr = CHESS_AI_TGT_N[sq];
  for (i = 0; i < arr.length; i++) {
    code = b[arr[i]];
    if (code && (byWhite ? code < 97 : code >= 97) && (code & 0xDF) === 78) return true;
  }
  arr = CHESS_AI_TGT_K[sq];
  for (i = 0; i < arr.length; i++) {
    code = b[arr[i]];
    if (code && (byWhite ? code < 97 : code >= 97) && (code & 0xDF) === 75) return true;
  }
  for (d = 0; d < 8; d++) {
    var ray = CHESS_AI_RAYS[sq][d];
    for (k = 0; k < ray.length; k++) {
      var pc = b[ray[k]];
      if (pc) {
        if (byWhite ? pc < 97 : pc >= 97) {
          var t = pc & 0xDF;
          if (d < 4 ? (t === 82 || t === 81) : (t === 66 || t === 81)) return true;
        }
        break;
      }
    }
  }
  return false;
}

/* مفتاح موقع مبسط (مطابق حرفياً لـ chessPosKey — يُستعمل للـ TT وكشف التكرار) */
function chessAiKey(P) {
  var cast = P.cast;
  return CHESS_AI_KEY.join('') + '|' + (P.turn ? 'w' : 'b') + '|'
    + (cast & 1 ? 'K' : '') + (cast & 2 ? 'Q' : '') + (cast & 4 ? 'k' : '') + (cast & 8 ? 'q' : '')
    + '|' + (P.ep < 0 ? '-' : ((P.ep >> 3) + ',' + (P.ep & 7)));
}

/* بناء موضع البحث من حالة اللعبة (نسخة واحدة ثم make/unmake) */
function chessAiFromState(s) {
  var b = new Array(64), kc = CHESS_AI_KEY, wk = -1, bk = -1;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.board[r][c], sq = r * 8 + c;
    if (p) {
      var code = p.charCodeAt(0);
      b[sq] = code;
      kc[sq] = p;
      if (code === 75) wk = sq; else if (code === 107) bk = sq;
    } else { b[sq] = 0; kc[sq] = '.'; }
  }
  return {
    b: b, turn: s.turn === 'w',
    cast: (s.castling.K ? 1 : 0) | (s.castling.Q ? 2 : 0) | (s.castling.k ? 4 : 0) | (s.castling.q ? 8 : 0),
    ep: s.ep ? s.ep[0] * 8 + s.ep[1] : -1,
    half: s.half, wk: wk, bk: bk
  };
}

/* ترميز كائن حركة قانونية إلى عدد صحيح: from | to<<6 | promo<<12 | flag<<15
   flag: 0 عادي 1 دفع مزدوج 2 تجاوز 3 تبييت ملكي 4 تبييت ملكي الجهة الأخرى */
function chessAiEncode(mv) {
  var flag = 0;
  if (mv.castle === 'K') flag = 3;
  else if (mv.castle === 'Q') flag = 4;
  else if (mv.ep) flag = 2;
  else if (mv.double) flag = 1;
  var promo = 0;
  if (mv.promo === 'n') promo = 1;
  else if (mv.promo === 'b') promo = 2;
  else if (mv.promo === 'r') promo = 3;
  else if (mv.promo === 'q') promo = 4;
  return (mv.from[0] * 8 + mv.from[1]) | ((mv.to[0] * 8 + mv.to[1]) << 6) | (promo << 12) | (flag << 15);
}

/* تنفيذ حركة على موضع البحث (مع حفظ معلومات التراجع على مصفوفات العمق) */
function chessAiMake(P, m, ply) {
  var b = P.b, kc = CHESS_AI_KEY;
  var from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = (m >> 15) & 7;
  var piece = b[from];
  var white = piece < 97;
  var capSq = to, capCode = b[to];
  if (flag === 2) {                                  /* أخذ بالتجاوز: الضحية بجوار المنطلق */
    capSq = (from & 56) | (to & 7);
    capCode = b[capSq];
    b[capSq] = 0; kc[capSq] = '.';
  }
  CHESS_AI_UCAP[ply] = capCode;
  CHESS_AI_UCAST[ply] = P.cast; CHESS_AI_UEP[ply] = P.ep; CHESS_AI_UHALF[ply] = P.half;
  CHESS_AI_UWK[ply] = P.wk; CHESS_AI_UBK[ply] = P.bk;
  b[from] = 0; kc[from] = '.';
  b[to] = promo ? (white ? CHESS_AI_PROMO[promo] : CHESS_AI_PROMO[promo] + 32) : piece;
  kc[to] = CHESS_AI_CHR[b[to]];
  /* حقوق التبييت (كما في chessMakeMove: أي لمس لزوايا الرقعة يُسقط الحق) */
  var cast = P.cast;
  if (piece === 75) { cast &= ~3; P.wk = to; }
  else if (piece === 107) { cast &= ~12; P.bk = to; }
  if (from === 63 || to === 63) cast &= ~1;
  if (from === 56 || to === 56) cast &= ~2;
  if (from === 7 || to === 7) cast &= ~4;
  if (from === 0 || to === 0) cast &= ~8;
  P.cast = cast;
  if (flag === 3) { var hr = white ? 56 : 0; b[hr + 5] = b[hr + 7]; b[hr + 7] = 0; kc[hr + 5] = CHESS_AI_CHR[b[hr + 5]]; kc[hr + 7] = '.'; }
  else if (flag === 4) { var hr2 = white ? 56 : 0; b[hr2 + 3] = b[hr2]; b[hr2] = 0; kc[hr2 + 3] = CHESS_AI_CHR[b[hr2 + 3]]; kc[hr2] = '.'; }
  P.ep = flag === 1 ? ((from + to) >> 1) : -1;
  if ((piece & 0xDF) === 80 || capCode) P.half = 0; else P.half++;
  P.turn = !P.turn;
}

/* التراجع عن حركة (استعادة كاملة للرقعة والحقوق والمفاتيح) */
function chessAiUnmake(P, m, ply) {
  var b = P.b, kc = CHESS_AI_KEY;
  var from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = (m >> 15) & 7;
  P.turn = !P.turn;
  var white = P.turn;
  if (flag === 3) { var hr = white ? 56 : 0; b[hr + 7] = b[hr + 5]; b[hr + 5] = 0; kc[hr + 7] = CHESS_AI_CHR[b[hr + 7]]; kc[hr + 5] = '.'; }
  else if (flag === 4) { var hr2 = white ? 56 : 0; b[hr2] = b[hr2 + 3]; b[hr2 + 3] = 0; kc[hr2] = CHESS_AI_CHR[b[hr2]]; kc[hr2 + 3] = '.'; }
  b[from] = promo ? (white ? 80 : 112) : b[to];
  if (flag === 2) b[(from & 56) | (to & 7)] = CHESS_AI_UCAP[ply];
  else b[to] = CHESS_AI_UCAP[ply];
  P.cast = CHESS_AI_UCAST[ply]; P.ep = CHESS_AI_UEP[ply]; P.half = CHESS_AI_UHALF[ply];
  P.wk = CHESS_AI_UWK[ply]; P.bk = CHESS_AI_UBK[ply];
  kc[from] = CHESS_AI_CHR[b[from]];
  kc[to] = CHESS_AI_CHR[b[to]];
  if (flag === 2) { var vs = (from & 56) | (to & 7); kc[vs] = CHESS_AI_CHR[b[vs]]; }
}

/* توليد الحركات شبه القانونية في مخزن العمود ply
   capsOnly: أكلات + ترقيات ملكة فقط (لبحث السكون). يعيد العدد */
function chessAiGen(P, ply, capsOnly) {
  var base = ply * 320, n = 0;
  var b = P.b, white = P.turn, ep = P.ep;
  var promoRow = white ? 0 : 7, startRow = white ? 6 : 1, dir = white ? -8 : 8;
  var rookCode = white ? 82 : 114;
  for (var sq = 0; sq < 64; sq++) {
    var code = b[sq];
    if (!code) continue;
    if (white ? code >= 97 : code < 97) continue;
    var t = code & 0xDF;
    if (t === 80) {                                        /* بيدق */
      var r = sq >> 3, c = sq & 7;
      var one = sq + dir;
      if (one >= 0 && one < 64 && !b[one]) {
        if ((one >> 3) === promoRow) {
          if (capsOnly) {
            CHESS_AI_MV[base + n++] = sq | (one << 6) | (4 << 12);
          } else {
            CHESS_AI_MV[base + n++] = sq | (one << 6) | (1 << 12);
            CHESS_AI_MV[base + n++] = sq | (one << 6) | (2 << 12);
            CHESS_AI_MV[base + n++] = sq | (one << 6) | (3 << 12);
            CHESS_AI_MV[base + n++] = sq | (one << 6) | (4 << 12);
          }
        } else if (!capsOnly) {
          CHESS_AI_MV[base + n++] = sq | (one << 6);
          var two = sq + dir + dir;
          if (r === startRow && !b[two]) CHESS_AI_MV[base + n++] = sq | (two << 6) | (1 << 15);
        }
      }
      for (var dd = -1; dd <= 1; dd += 2) {
        var cc = c + dd;
        if (cc < 0 || cc > 7) continue;
        var ts = one + dd;
        if (ts < 0 || ts > 63) continue;
        var tc = b[ts];
        if (tc) {
          if (white ? tc >= 97 : tc < 97) {
            if ((ts >> 3) === promoRow) {
              if (capsOnly) {
                CHESS_AI_MV[base + n++] = sq | (ts << 6) | (4 << 12);
              } else {
                CHESS_AI_MV[base + n++] = sq | (ts << 6) | (1 << 12);
                CHESS_AI_MV[base + n++] = sq | (ts << 6) | (2 << 12);
                CHESS_AI_MV[base + n++] = sq | (ts << 6) | (3 << 12);
                CHESS_AI_MV[base + n++] = sq | (ts << 6) | (4 << 12);
              }
            } else CHESS_AI_MV[base + n++] = sq | (ts << 6);
          }
        } else if (ts === ep) {
          CHESS_AI_MV[base + n++] = sq | (ts << 6) | (2 << 15);
        }
      }
    } else if (t === 78) {                                  /* فارس */
      var tg = CHESS_AI_TGT_N[sq];
      for (var k = 0; k < tg.length; k++) {
        var tsq = tg[k], ttc = b[tsq];
        if (!ttc) { if (!capsOnly) CHESS_AI_MV[base + n++] = sq | (tsq << 6); }
        else if (white ? ttc >= 97 : ttc < 97) CHESS_AI_MV[base + n++] = sq | (tsq << 6);
      }
    } else if (t === 75) {                                 /* ملك + تبييت */
      var kg = CHESS_AI_TGT_K[sq];
      for (var k2 = 0; k2 < kg.length; k2++) {
        var tsq2 = kg[k2], ttc2 = b[tsq2];
        if (!ttc2) { if (!capsOnly) CHESS_AI_MV[base + n++] = sq | (tsq2 << 6); }
        else if (white ? ttc2 >= 97 : ttc2 < 97) CHESS_AI_MV[base + n++] = sq | (tsq2 << 6);
      }
      if (!capsOnly) {
        var hr3 = white ? 56 : 0;
        if (sq === hr3 + 4 && !chessAtk(b, sq, !white)) {
          if ((white ? P.cast & 1 : P.cast & 4) && !b[hr3 + 5] && !b[hr3 + 6] && b[hr3 + 7] === rookCode
              && !chessAtk(b, hr3 + 5, !white) && !chessAtk(b, hr3 + 6, !white)) {
            CHESS_AI_MV[base + n++] = sq | ((hr3 + 6) << 6) | (3 << 15);
          }
          if ((white ? P.cast & 2 : P.cast & 8) && !b[hr3 + 1] && !b[hr3 + 2] && !b[hr3 + 3] && b[hr3] === rookCode
              && !chessAtk(b, hr3 + 3, !white) && !chessAtk(b, hr3 + 2, !white)) {
            CHESS_AI_MV[base + n++] = sq | ((hr3 + 2) << 6) | (4 << 15);
          }
        }
      }
    } else {                                               /* فيل / رخ / ملكة */
      var lo, hi;
      if (t === 82) { lo = 0; hi = 3; }
      else if (t === 66) { lo = 4; hi = 7; }
      else { lo = 0; hi = 7; }
      for (var d2 = lo; d2 <= hi; d2++) {
        var ray = CHESS_AI_RAYS[sq][d2];
        for (var k3 = 0; k3 < ray.length; k3++) {
          var ts3 = ray[k3], tc3 = b[ts3];
          if (!tc3) { if (!capsOnly) CHESS_AI_MV[base + n++] = sq | (ts3 << 6); continue; }
          if (white ? tc3 >= 97 : tc3 < 97) CHESS_AI_MV[base + n++] = sq | (ts3 << 6);
          break;
        }
      }
    }
  }
  return n;
}

/* توليد + فرز الشرعية + ترتيب (TT → أكلات MVV-LVA → ترقيات → كش → history/killers).
   يعيد عدد الحركات القانونية المضغوطة في مخزن العمق ply */
function chessAiOrder(P, ply, ttMove, capsOnly) {
  var n = chessAiGen(P, ply, capsOnly);
  var base = ply * 320, b = P.b;
  var w = 0;
  for (var i = 0; i < n; i++) {
    var m = CHESS_AI_MV[base + i];
    var from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = (m >> 15) & 7;
    var capSq = flag === 2 ? ((from & 56) | (to & 7)) : to;
    var capCode = b[capSq];
    var score;
    if (capCode) {
      score = 3000000 + CHESS_AI_VAL[capCode & 0xDF] * 32 - (CHESS_AI_VAL[b[from] & 0xDF] >> 5);
      if (promo === 4) score += 2000000;
      else if (promo) score += 100000;
    } else if (promo === 4) {
      score = 2000000;
    } else if (promo) {
      score = 100000;
    } else {
      score = CHESS_AI_HIST[from * 64 + to];
      if (m === CHESS_AI_KILL[ply * 2] || m === CHESS_AI_KILL[ply * 2 + 1]) score += 80000;
    }
    if (m === ttMove) score = 100000000;
    /* الشرعية + أولوية الكش: تُنفَّذ الحركة ثم يُختبر أمان ملك المهاجم وتهديد ملك الخصم */
    var moverWhite = P.turn;
    chessAiMake(P, m, ply);
    var legal = !chessAtk(P.b, moverWhite ? P.wk : P.bk, !moverWhite);
    if (legal && !capsOnly && score < 100000000
        && chessAtk(P.b, moverWhite ? P.bk : P.wk, moverWhite)) score += 1000000;
    chessAiUnmake(P, m, ply);
    if (!legal) continue;
    CHESS_AI_MV[base + w] = m;
    CHESS_AI_SC[base + w] = score;
    w++;
  }
  return w;
}

/* الحركية mobility: عدد هجمات القطع (وزن حسب النوع) — N/B=4، R=2، Q=1 */
function chessAiMobility(b, white) {
  var s = 0;
  for (var sq = 0; sq < 64; sq++) {
    var code = b[sq];
    if (!code) continue;
    if (white ? code >= 97 : code < 97) continue;
    var t = code & 0xDF;
    if (t === 78) {
      var tg = CHESS_AI_TGT_N[sq];
      for (var i = 0; i < tg.length; i++) {
        var tc = b[tg[i]];
        if (!tc || (white ? tc >= 97 : tc < 97)) s += 4;
      }
    } else if (t === 66 || t === 82 || t === 81) {
      var lo = t === 82 ? 0 : 4, hi = t === 82 ? 3 : 7;
      if (t === 81) { lo = 0; hi = 7; }
      var wgt = t === 66 ? 4 : (t === 82 ? 2 : 1);
      for (var d = lo; d <= hi; d++) {
        var ray = CHESS_AI_RAYS[sq][d];
        for (var k = 0; k < ray.length; k++) {
          var tc2 = b[ray[k]];
          if (!tc2) { s += wgt; continue; }
          if (white ? tc2 >= 97 : tc2 < 97) s += wgt;
          break;
        }
      }
    }
  }
  return s;
}

/* التقييم المتقدم (منظور صاحب الدور — negamax) */
function chessAiEval(P) {
  var b = P.b, score = 0, npm = 0, wb = 0, bb = 0;
  var wPn = 0, bPn = 0, wRn = 0, bRn = 0;
  var wpf = CHESS_AI_WPF, bpf = CHESS_AI_BPF, bmin = CHESS_AI_BMIN, wmax = CHESS_AI_WMAX;
  var wpl = CHESS_AI_WPL, bpl = CHESS_AI_BPL;
  wpf.fill(0); bpf.fill(0); bmin.fill(9); wmax.fill(-1);
  for (var sq = 0; sq < 64; sq++) {
    var code = b[sq];
    if (!code) continue;
    var white = code < 97;
    var t = code & 0xDF;
    if (t === 75) continue;                      /* الملك يُقيَّم أدناه حسب الطور */
    var idx = white ? sq : CHESS_AI_MIR[sq];
    if (t === 80) {
      var pstP = CHESS_PST_P[idx];
      if (white) {
        wpl[wPn++] = sq; wpf[sq & 7]++;
        if (sq > wmax[sq & 7]) wmax[sq & 7] = sq;
        score += 100 + pstP;
      } else {
        bpl[bPn++] = sq; bpf[sq & 7]++;
        if (sq < bmin[sq & 7]) bmin[sq & 7] = sq;
        score -= 100 + pstP;
      }
      continue;
    }
    var v = CHESS_AI_VAL[t];
    npm += v;
    if (t === 66) { if (white) wb++; else bb++; }
    if (t === 82) { if (white) CHESS_AI_WRL[wRn++] = sq; else CHESS_AI_BRL[bRn++] = sq; }
    var pst = t === 78 ? CHESS_PST_N[idx] : t === 66 ? CHESS_PST_B[idx] : t === 82 ? CHESS_PST_R[idx] : CHESS_PST_Q[idx];
    score += white ? (v + pst) : -(v + pst);
  }
  var endgame = npm <= 2400;
  var kTab = endgame ? CHESS_PST_KE : CHESS_PST_K;
  score += kTab[P.wk];
  score -= kTab[CHESS_AI_MIR[P.bk]];
  if (wb >= 2) score += 35;                      /* زوج الفيلة */
  if (bb >= 2) score -= 35;
  /* بنية البيدق: مزدوج / معزول / متجاوز (يتضخف في النهايات) */
  var scale = endgame ? 1.5 : 1;
  var i, f, r, passed, lo, hi;
  for (i = 0; i < wPn; i++) {
    sq = wpl[i]; f = sq & 7; r = sq >> 3;
    if (wpf[f] > 1) score -= 12;
    if ((f === 0 || wpf[f - 1] === 0) && (f === 7 || wpf[f + 1] === 0)) score -= 16;
    passed = true;
    lo = f > 0 ? f - 1 : 0; hi = f < 7 ? f + 1 : 7;
    for (var j2 = lo; j2 <= hi; j2++) if (bmin[j2] < r) { passed = false; break; }
    if (passed) score += CHESS_AI_PASS[r] * scale;
  }
  for (i = 0; i < bPn; i++) {
    sq = bpl[i]; f = sq & 7; r = sq >> 3;
    if (bpf[f] > 1) score += 12;
    if ((f === 0 || bpf[f - 1] === 0) && (f === 7 || bpf[f + 1] === 0)) score += 16;
    passed = true;
    lo = f > 0 ? f - 1 : 0; hi = f < 7 ? f + 1 : 7;
    for (var j3 = lo; j3 <= hi; j3++) if (wmax[j3] > r) { passed = false; break; }
    if (passed) score -= CHESS_AI_PASS[7 - r] * scale;
  }
  /* الرخاخ: أعمدة مفتوحة/نصف مفتوحة + الصف السابع */
  for (i = 0; i < wRn; i++) {
    sq = CHESS_AI_WRL[i]; f = sq & 7; r = sq >> 3;
    if (wpf[f] === 0) score += bpf[f] === 0 ? 25 : 12;
    if (r === 1) score += 18;
  }
  for (i = 0; i < bRn; i++) {
    sq = CHESS_AI_BRL[i]; f = sq & 7; r = sq >> 3;
    if (bpf[f] === 0) score -= wpf[f] === 0 ? 25 : 12;
    if (r === 6) score -= 18;
  }
  /* سلامة الملك: درع البيدق + عمود مفتوح أمامه (طور الوسط فقط) */
  if (!endgame) {
    var kf = P.wk & 7;
    if (wpf[kf] === 0) score -= bpf[kf] === 0 ? 32 : 20;
    var sh = 0;
    if (kf > 0 && wpf[kf - 1] > 0) sh++;
    if (wpf[kf] > 0) sh++;
    if (kf < 7 && wpf[kf + 1] > 0) sh++;
    score += sh * 8;
    kf = P.bk & 7;
    if (bpf[kf] === 0) score += wpf[kf] === 0 ? 32 : 20;
    sh = 0;
    if (kf > 0 && bpf[kf - 1] > 0) sh++;
    if (bpf[kf] > 0) sh++;
    if (kf < 7 && bpf[kf + 1] > 0) sh++;
    score -= sh * 8;
  }
  /* الحركية + تيمبو */
  score += chessAiMobility(b, true) - chessAiMobility(b, false);
  score += P.turn ? 10 : -10;
  return P.turn ? score : -score;
}

/* بحث السكون: أكلات/ترقيات حتى الهدوء (وأثناء الكش: كل مراحل الفرار) */
function chessAiQuiesce(P, alpha, beta, ply) {
  if ((++CHESS_AI_NODES & 1023) === 0 && CHESS_AI_NOW() >= CHESS_AI_DEADLINE) throw CHESS_AI_ABORT;
  if (P.half >= 100) return 0;
  if (ply >= 120) return chessAiEval(P);
  var moverWhite = P.turn;
  var inCheck = chessAtk(P.b, moverWhite ? P.wk : P.bk, !moverWhite);
  var best;
  if (!inCheck) {
    best = chessAiEval(P);
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
  } else best = -200000;
  var cnt = chessAiOrder(P, ply, -1, !inCheck);
  if (inCheck && cnt === 0) return ply - 100000;   /* كش ولا فرار → مات */
  var base = ply * 320, i, j;
  for (i = 0; i < cnt; i++) {
    var bi = i;
    for (j = i + 1; j < cnt; j++) if (CHESS_AI_SC[base + j] > CHESS_AI_SC[base + bi]) bi = j;
    if (bi !== i) {
      var tm = CHESS_AI_MV[base + i]; CHESS_AI_MV[base + i] = CHESS_AI_MV[base + bi]; CHESS_AI_MV[base + bi] = tm;
      var ts = CHESS_AI_SC[base + i]; CHESS_AI_SC[base + i] = CHESS_AI_SC[base + bi]; CHESS_AI_SC[base + bi] = ts;
    }
    var m = CHESS_AI_MV[base + i];
    chessAiMake(P, m, ply);
    var sc = -chessAiQuiesce(P, -beta, -alpha, ply + 1);
    chessAiUnmake(P, m, ply);
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}

/* negamax + ألفا-بيتا + TT + تمديد الكش + كشف التكرار على المسار/السجل */
function chessAiSearch(P, depth, alpha, beta, ply) {
  if ((++CHESS_AI_NODES & 1023) === 0 && CHESS_AI_NOW() >= CHESS_AI_DEADLINE) throw CHESS_AI_ABORT;
  if (ply >= 96) return chessAiEval(P);
  var moverWhite = P.turn;
  var inCheck = chessAtk(P.b, moverWhite ? P.wk : P.bk, !moverWhite);
  if (inCheck && ply < 80) depth++;               /* تمديد الكش (مقيّد) */
  if (depth <= 0) return chessAiQuiesce(P, alpha, beta, ply);
  if (P.half >= 100) return 0;
  var key = CHESS_AI_PATH[ply];                   /* الأب حسب المفتاح بعد تنفيذ الحركة */
  /* التكرار المضيء: نفس الموقع على مسار البحث أو ثالث ظهور في سجل اللعبة = تعادل */
  for (var q = 0; q < ply; q++) if (CHESS_AI_PATH[q] === key) return 0;
  if (CHESS_AI_GREP) {
    var gc = CHESS_AI_GREP[key];
    if (gc != null && gc >= 2) return 0;
  }
  var ent = CHESS_AI_TT.get(key);
  var ttMove = -1;
  if (ent) {
    ttMove = ent.m;
    if (ent.d >= depth) {
      var ts2 = ent.s;
      if (ts2 > 90000) ts2 -= ply; else if (ts2 < -90000) ts2 += ply;
      if (ent.f === 0) return ts2;
      if (ent.f === 1 && ts2 > alpha) alpha = ts2;
      else if (ent.f === 2 && ts2 < beta) beta = ts2;
      if (alpha >= beta) return ts2;
    }
  }
  var cnt = chessAiOrder(P, ply, ttMove, false);
  if (cnt === 0) return inCheck ? (ply - 100000) : 0;   /* مات أو جمود */
  var base = ply * 320;
  var best = -200000, bestMove = -1, a0 = alpha, i, j;
  for (i = 0; i < cnt; i++) {
    var bi = i;
    for (j = i + 1; j < cnt; j++) if (CHESS_AI_SC[base + j] > CHESS_AI_SC[base + bi]) bi = j;
    if (bi !== i) {
      var tm = CHESS_AI_MV[base + i]; CHESS_AI_MV[base + i] = CHESS_AI_MV[base + bi]; CHESS_AI_MV[base + bi] = tm;
      var tsc = CHESS_AI_SC[base + i]; CHESS_AI_SC[base + i] = CHESS_AI_SC[base + bi]; CHESS_AI_SC[base + bi] = tsc;
    }
    var m = CHESS_AI_MV[base + i];
    chessAiMake(P, m, ply);
    CHESS_AI_PATH[ply + 1] = chessAiKey(P);
    var sc = -chessAiSearch(P, depth - 1, -beta, -alpha, ply + 1);
    chessAiUnmake(P, m, ply);
    if (sc > best) { best = sc; bestMove = m; }
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) {
      if (!CHESS_AI_UCAP[ply] && !((m >> 12) & 7)) {      /* هادئة → killers/history */
        if (CHESS_AI_KILL[ply * 2] !== m) {
          CHESS_AI_KILL[ply * 2 + 1] = CHESS_AI_KILL[ply * 2];
          CHESS_AI_KILL[ply * 2] = m;
        }
        var hi = (m & 63) * 64 + ((m >> 6) & 63);
        CHESS_AI_HIST[hi] += depth * depth;
        if (CHESS_AI_HIST[hi] > 150000) CHESS_AI_HIST[hi] = 150000;
      }
      break;
    }
  }
  var flagTT = best <= a0 ? 2 : (best >= beta ? 1 : 0);
  var ss = best;
  if (ss > 90000) ss += ply; else if (ss < -90000) ss -= ply;
  if (!ent || ent.d <= depth) CHESS_AI_TT.set(key, { d: depth, s: ss, f: flagTT, m: bestMove });
  return best;
}

/* اختيار حركة البوت: تعميق تدريجي حتى maxDepth ضمن budgetMs،
   وكسر عشوائي طفيف بين المتكافئين (±10 سنتي-بيدق، أعلى 3) لتفادي التكرار المضيء */
function chessPickMove(s, maxDepth, budgetMs) {
  var legal = chessLegalMoves(s);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];
  maxDepth = maxDepth || 6;
  var budget = budgetMs || 400;
  var t0 = CHESS_AI_NOW();
  CHESS_AI_DEADLINE = t0 + budget;
  CHESS_AI_NODES = 0;
  CHESS_AI_TT = new Map();
  CHESS_AI_GREP = s.rep || null;
  CHESS_AI_KILL.fill(0);
  CHESS_AI_HIST.fill(0);
  var P = chessAiFromState(s);
  var rootN = legal.length, i;
  var rootMv = new Int32Array(rootN);
  for (i = 0; i < rootN; i++) rootMv[i] = chessAiEncode(legal[i]);
  var cur = new Int32Array(rootN);
  var finalScores = new Int32Array(rootN);
  var doneIdx = new Uint8Array(rootN);
  CHESS_AI_PATH[0] = chessAiKey(P);
  var completed = 0, bestIdx = 0;
  for (var d = 1; d <= maxDepth; d++) {
    var alpha = -200000, aborted = false;
    for (i = 0; i < rootN; i++) doneIdx[i] = 0;
    try {
      for (var seq = 0; seq < rootN; seq++) {
        var bi = -1;                               /* أفضل حركة غير مبحوثة (بحسب العمق المكتمل السابق) */
        for (var jj = 0; jj < rootN; jj++) {
          if (!doneIdx[jj] && (bi < 0 || finalScores[jj] > finalScores[bi])) bi = jj;
        }
        doneIdx[bi] = 1;
        chessAiMake(P, rootMv[bi], 0);
        CHESS_AI_PATH[1] = chessAiKey(P);
        var sc = -chessAiSearch(P, d - 1, -200000, -alpha, 1);
        chessAiUnmake(P, rootMv[bi], 0);
        cur[bi] = sc;
        if (sc > alpha) alpha = sc;
      }
    } catch (e) {
      if (e !== CHESS_AI_ABORT) throw e;
      aborted = true;                              /* عمق غير مكتمل → نتجاهل نتائجه الجزئية */
    }
    if (aborted) break;
    for (i = 0; i < rootN; i++) finalScores[i] = cur[i];
    completed = d;
    var bidx = 0;
    for (i = 1; i < rootN; i++) if (finalScores[i] > finalScores[bidx]) bidx = i;
    bestIdx = bidx;
    if (CHESS_AI_NOW() - t0 > budget * 0.55) break; /* الوقت ضاق → لا نبدأ عمقاً أعمق */
  }
  if (completed === 0) {
    /* ميزانية شديدة الضيق (نادر): أفضل أكل متاح أو حركة قانونية عشوائية */
    var capIdx = -1, capBest = -1;
    for (i = 0; i < rootN; i++) {
      var vv = legal[i].capture ? (CHESS_VAL[chessType(legal[i].capture)] || 0) : 0;
      if (vv > capBest) { capBest = vv; capIdx = i; }
    }
    return (capIdx >= 0 && capBest > 0) ? legal[capIdx] : legal[Math.floor(Math.random() * rootN)];
  }
  var bestScore = finalScores[bestIdx];
  if (bestScore > 90000 || bestScore < -90000) return legal[bestIdx];   /* حسم/مات: بلا عشوائية */
  var pool = [];
  for (i = 0; i < rootN; i++) if (finalScores[i] >= bestScore - 10) pool.push(i);
  pool.sort(function (a, b) { return finalScores[b] - finalScores[a]; });
  if (pool.length > 3) pool.length = 3;
  return legal[pool[Math.floor(Math.random() * pool.length)]];
}

/* فحص ذاتي لنواة make/unmake وترميز الحركات: يقارن مفاتيح الموقع والساعات وملوك
   موضع البحث السريع مع المحرك المرجعي (chessMakeMove + chessPosKey) حركةً حركة */
function chessAiSelfTest(plies) {
  var fails = 0, checks = 0;
  var games = [
    chessNewState(),
    (function () {   /* وضعية ترقيات كثيفة (perft 4) */
      var s = chessNewState();
      var rows = ['r3k2r', 'Pppp1ppp', '1b3nbN', 'nP6', 'BBP1P3', 'q4N2', 'Pp1P2PP', 'R2Q1RK1'];
      for (var r = 0; r < 8; r++) {
        var c = 0;
        for (var i = 0; i < rows[r].length; i++) {
          var ch = rows[r][i];
          if (ch >= '1' && ch <= '8') { for (var z = 0; z < +ch; z++) s.board[r][c++] = null; }
          else s.board[r][c++] = ch;
        }
      }
      s.rep = {}; s.rep[chessPosKey(s)] = 1;
      return s;
    })(),
    (function () {   /* وضعية أخذ بالتجاوز (perft 3) */
      var s = chessNewState();
      var rows = ['8', '2p5', '3p4', 'KP5r', '1R3p1k', '8', '4P1P1', '8'];
      for (var r = 0; r < 8; r++) {
        var c = 0;
        for (var i = 0; i < rows[r].length; i++) {
          var ch = rows[r][i];
          if (ch >= '1' && ch <= '8') { for (var z = 0; z < +ch; z++) s.board[r][c++] = null; }
          else s.board[r][c++] = ch;
        }
      }
      s.castling = { K: false, Q: false, k: false, q: false };
      s.rep = {}; s.rep[chessPosKey(s)] = 1;
      return s;
    })()
  ];
  for (var g = 0; g < games.length; g++) {
    var s = games[g];
    var movesMade = 0;
    while (!s.over && movesMade < (plies || 24)) {
      var moves = chessLegalMoves(s);
      if (!moves.length) break;
      /* عدد الحركات التي تعتبرها النواة قانونية = عدد المحرك المرجعي */
      var P0 = chessAiFromState(s);
      var c0 = chessAiOrder(P0, 0, -1, false);
      checks++;
      if (c0 !== moves.length) fails++;
      /* لكل حركة: make → مطابقة المفتاح/الساعة/الملوك مع المرجع → unmake → مطابقة الرقعة */
      for (var i = 0; i < moves.length; i++) {
        var mv = moves[i];
        var s2 = chessCloneState(s);
        chessMakeMove(s2, mv);
        var P = chessAiFromState(s);
        var keyBefore = chessAiKey(P);
        var enc = chessAiEncode(mv);
        chessAiMake(P, enc, 0);
        checks++;
        if (chessAiKey(P) !== chessPosKey(s2)) fails++;
        if (P.half !== s2.half) fails++;
        var wk2 = -1, bk2 = -1;
        for (var sq = 0; sq < 64; sq++) {
          var pc2 = s2.board[sq >> 3][sq & 7];
          if (pc2 === 'K') wk2 = sq; else if (pc2 === 'k') bk2 = sq;
        }
        if (P.wk !== wk2 || P.bk !== bk2) fails++;
        chessAiUnmake(P, enc, 0);
        checks++;
        if (chessAiKey(P) !== keyBefore) fails++;
        for (var sq2 = 0; sq2 < 64; sq2++) {
          var pc3 = s.board[sq2 >> 3][sq2 & 7];
          if (P.b[sq2] !== (pc3 ? pc3.charCodeAt(0) : 0)) { fails++; break; }
        }
      }
      chessMakeMove(s, moves[(movesMade * 7 + g * 3 + 1) % moves.length]);
      movesMade++;
    }
  }
  return { ok: fails === 0, fails: fails, checks: checks };
}

/* Export للنافذة (تُستعمل من الواجهة والاختبارات) */
window.chessNewState = chessNewState;
window.chessCloneState = chessCloneState;
window.chessLegalMoves = chessLegalMoves;
window.chessMovesForPiece = chessMovesForPiece;
window.chessMakeMove = chessMakeMove;
window.chessPerft = chessPerft;
window.chessPickMove = chessPickMove;
window.chessInCheck = chessInCheck;
window.chessNotation = chessNotation;
window.chessPosKey = chessPosKey;
window.chessInsufficient = chessInsufficient;
window.chessAiSelfTest = chessAiSelfTest;   /* [v19] فحص تناسق نواة make/unmake مع المحرك المرجعي */

/* ══════════════════════════════════════════════════════════════════
   واجهة الشطرنج — وجه لوجه • غرفة أونلاين (رهان اختياري) • بوت تدريبي
   ══════════════════════════════════════════════════════════════════ */

var CHESS = null;
var CHESS_BETS = [0, 25, 50, 100, 250];
var CHESS_TIMERS = [0, 60, 120, 300];
var CHESS_GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

/* [UI-Pro 2026-09-16] طقم قطع SVG احترافي (ظلال موحّدة + تدرّج عاجي/فحمي
   بحواف ذهبية) بدل المحارف المسطّحة — يُحقن defs واحد للوثيقة ثم تُرسم القطع. */
var CHESS_SVG_PATHS = {
  P: '<circle cx="22.5" cy="13" r="5.2"/><path class="ch-cut" d="M18.6 19.04a1.5 1.5 0 0 1 0-1.4"/><path d="M18.1 19.4h8.8l-.95 3.1h-6.9l-.95-3.1z"/><path d="M19.7 23.4h5.6l2.5 9.9H17.2l2.5-9.9z"/><path d="M14.9 33.2h15.2l2.3 4.3H12.6l2.3-4.3z"/><path d="M11.9 37.7h21.2c.9 0 1.6.7 1.6 1.6v1.1H10.3v-1.1c0-.9.7-1.6 1.6-1.6z"/>',
  R: '<path d="M13 39.5h19v-3.5h-2.5V25.5l2.5-4.5v-7h-3.5v3h-3.5v-3h-5v3h-3.5v-3H13v7l2.5 4.5V36H13v3.5z"/>',
  N: '<path d="M14.5 39.5h17v-2.5c0-5.5-2.2-8.8-5.2-11.8 3.8 1 7-.2 8-3.2 1.2-3.8-.8-7.8-3.8-10.8l-2.2 2.2-2.8-4.4c-6.5 2.2-10.5 7.5-10.5 13.5 0 2.8.9 5 2.2 6.8-1.6 3-2.7 6.2-2.7 8.7v1.5z"/><circle class="ch-cut" cx="24.5" cy="14.5" r="1.1"/>',
  B: '<circle cx="22.5" cy="8" r="2.6"/><path d="M22.5 12c4.5 4.2 7.5 8.5 7.5 12.5 0 3-1.6 5.6-4.2 7.2h-6.6c-2.6-1.6-4.2-4.2-4.2-7.2 0-4 3-8.3 7.5-12.5z"/><path d="M22.5 15.5v8" class="ch-cut"/><path d="M17.5 33.5h10l1.6 4H15.9l1.6-4z"/><path d="M14.5 39.5h16v2h-16z"/>',
  Q: '<circle cx="10.5" cy="15.5" r="2"/><circle cx="16.5" cy="12.5" r="2"/><circle cx="22.5" cy="10.5" r="2"/><circle cx="28.5" cy="12.5" r="2"/><circle cx="34.5" cy="15.5" r="2"/><path d="M10.5 17.5l2 16h20l2-16-5.5 4.5-3.5-7-3 7.5-3-7.5-3.5 7-5.5-4.5z"/><path d="M11.5 36.5h21l1.5 3.5H10l1.5-3.5z"/>',
  K: '<path d="M22.5 4.5v7M19 8h7" class="ch-cut"/><path d="M22.5 12.5c5 0 9 3.4 9 7.8 0 2.8-1.4 5-3.8 6.4 3.6.8 6.8 3 6.8 6.8 0 2.8-1.9 4.9-4.5 6H15c-2.6-1.1-4.5-3.2-4.5-6 0-3.8 3.2-6 6.8-6.8-2.4-1.4-3.8-3.6-3.8-6.4 0-4.4 4-7.8 9-7.8z"/>'
};
function chessPieceSVG(t, side) {
  return '<svg class="ch-svg ' + side + '" viewBox="0 0 45 45" aria-hidden="true">' + (CHESS_SVG_PATHS[t] || '') + '</svg>';
}
/* [v2.44-FIX] كان الـdefs داخل div بـdisplay:none ⇒ المتصفح لا يحلّ fill:url(#chGradW)
   فتُرسم القطع بحدود فقط (شفافة/غريبة). الحل: حاوية بلا حجم مرئي (width:0;height:0)
   وليست display:none — يبقى التعريف قابلاً للحل ويختفي بصرياً. */
function chessInjectDefs() {
  if (document.getElementById('chSvgDefs')) return;
  var d = document.createElement('div');
  d.id = 'chDefsHost';
  d.setAttribute('aria-hidden', 'true');
  d.style.position = 'absolute';
  d.style.width = '0';
  d.style.height = '0';
  d.style.overflow = 'hidden';
  d.style.opacity = '0';
  d.style.pointerEvents = 'none';
  d.innerHTML = '<svg id="chSvgDefs" xmlns="http://www.w3.org/2000/svg" width="0" height="0" focusable="false"><defs>' +
    '<linearGradient id="chGradW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset="0.45" stop-color="#f2e4c4"/><stop offset="1" stop-color="#c39a54"/></linearGradient>' +
    '<linearGradient id="chGradB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b5b66"/><stop offset="0.45" stop-color="#26262c"/><stop offset="1" stop-color="#08080a"/></linearGradient>' +
    /* ضوء علوي + ظل سفلي (يزيد الحسّ الحجمي ويمنع إحساس الشفافية) */
    '<linearGradient id="chGradShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>' +
    '</defs></svg>';
  document.body.appendChild(d);
}

function chessLevelName() { return T('chess.trainingBot'); }

function eChess(g) {
  var betChips = CHESS_BETS.map(function (b, i) {
    return '<button class="dama-chip' + (i === 0 ? ' on' : '') + '" data-bet="' + b + '" onclick="chessSetBet(' + b + ')">'
      + (b === 0 ? T('chess.friendly') : b + ' 🪙') + '</button>';
  }).join('');
  var timerChips = CHESS_TIMERS.map(function (t, i) {
    return '<button class="dama-chip' + (i === 0 ? ' on' : '') + '" data-t="' + t + '" onclick="chessSetTimer(' + t + ')">'
      + (t === 0 ? T('dama.timerOff') : t + ' ' + T('dama.seconds')) + '</button>';
  }).join('');
  return gFrame(
    '<div class="ch-wrap" id="chessWrap">' +
      /* ── شاشة الإعدادات ── */
      '<div class="dama-setup" id="chessSetup">' +
        '<div class="dama-logo"><span class="ch-logo-em">♞</span></div>' +
        '<div class="dama-title">' + T('chess.title') + '</div>' +
        '<div class="dama-sub">' + T('chess.sub') + '</div>' +
        '<div class="dama-field"><div class="dama-flab">' + T('dama.timer') + ' (' + T('chess.localOnly') + ')</div>' +
          '<div class="dama-timer-row" id="chessTimerRow">' + timerChips + '</div>' +
        '</div>' +
        /* [Training 2026-09-16] اللعب ضد الآلي وجه لوجه تدريبي مجاني بلا رهان —
           الرهان حصري للغرف أونلاين (سياسة المنصة) */
        '<div class="dama-field"><div class="dama-flab">' + T('dama.stakeLabel') + '</div>' +
          '<div class="dama-timer-row" id="chessBet" hidden>' + betChips + '</div>' +
          '<div class="dama-pay ch-hint">🎓 ' + (T('ui.trainingFree') || 'تدريب مجاني بدون رهان — الرهان متاح في الغرف أونلاين فقط') + '</div>' +
        '</div>' +
        '<div class="ch-modes">' +
          '<button class="big dama-go" onclick="chessStartSolo()"><i class="fa-solid fa-robot" aria-hidden="true"></i> ' + chessLevelName() + '</button>' +
          '<button class="big dama-go" onclick="chessStartLocal()"><i class="fa-solid fa-user-group" aria-hidden="true"></i> ' + T('chess.faceToFace') + '</button>' +
          '<button class="big ch-online" onclick="Rooms.toggleFromGame()"><i class="fa-solid fa-globe" aria-hidden="true"></i> ' + T('chess.onlineRoom') + '</button>' +
        '</div>' +
        '<div class="dama-pay ch-hint">' + T('chess.modeHint') + '</div>' +
      '</div>' +
      /* ── شاشة اللعب ── */
      '<div class="dama-play" id="chessPlay" hidden>' +
        '<div class="ch-side">' +
          '<div class="dama-hud">' +
            '<div class="dama-side" id="chessTop"><span class="ch-cap" id="chessCapTop"></span><span class="dama-lab" id="chessTopName">' + T('chess.black') + '</span><b id="chessMatTop">0</b></div>' +
            '<div class="dama-turn" id="chessTurn">' + T('chess.whiteTurn') + '</div>' +
            '<div class="dama-side" id="chessBot"><b id="chessMatBot">0</b><span class="dama-lab" id="chessBotName">' + T('chess.white') + '</span><span class="ch-cap" id="chessCapBot"></span></div>' +
          '</div>' +
          '<div class="dama-timer" id="chessTimer"></div>' +
          '<div class="ch-log" id="chessLog"></div>' +
          '<div class="dama-status" id="chessStatus"></div>' +
          '<div class="dama-ctrls">' +
            '<button class="dama-mini dama-round" id="chessDrawBtn" onclick="chessDrawOffer()" title="' + T('chess.drawBtn') + '" aria-label="' + T('chess.drawBtn') + '"><svg class="dm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.1 12.4 7.2 8.3a2.5 2.5 0 0 1 3.5 0l1.3 1.3 1.3-1.3a2.5 2.5 0 0 1 3.5 0l4.1 4.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="m9.1 12.3 1.7 1.7a1.8 1.8 0 0 0 2.5 0l.5-.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="m6.9 14.5 2.1 2.1M9.5 16.6l1.9 1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>' +
            '<button class="dama-mini dama-round dm-resign" onclick="chessResign()" title="' + T('dama.resignBtn') + '" aria-label="' + T('dama.resignBtn') + '"><svg class="dm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.2 3.1a1.05 1.05 0 0 1 1.05 1.05v15.7a1.05 1.05 0 0 1-2.1 0V4.15A1.05 1.05 0 0 1 6.2 3.1Z" fill="currentColor"/><path d="M8.5 4.4h8.6c1.25 0 1.95 1.45 1.2 2.42l-2.03 2.7 2.03 2.7c.75.97.05 2.42-1.2 2.42H8.5c-.6 0-1.08-.48-1.08-1.08V5.48c0-.6.48-1.08 1.08-1.08Z" fill="currentColor"/></svg></button>' +
          '</div>' +
          '<div class="dama-drawbar" id="chessDrawBar" hidden>' +
            '<span id="chessDrawTxt"></span>' +
            '<button class="dama-mini ok" onclick="chessDrawAccept(true)">' + T('dama.drawAccept') + '</button>' +
            '<button class="dama-mini no" onclick="chessDrawAccept(false)">' + T('dama.drawDecline') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="ch-boardbox" id="chessBoardBox">' +
          /* أيقونتا اللاعبين: فوق/تحت في البورتريه، يمين/يسار في اللاندسكيه — ومؤقت الدور بجانب صاحبه [Timer-Seat] */
          '<div class="ch-seat ch-seat-top"><div class="ch-picon" id="chessTopIcon"><span class="ch-pface">♚</span><span class="ch-ptimer" id="chessTopTimer" hidden>⏱</span></div></div>' +
          '<div class="ch-seat ch-seat-bot"><div class="ch-picon" id="chessBotIcon"><span class="ch-pface">♔</span><span class="ch-ptimer" id="chessBotTimer" hidden>⏱</span></div></div>' +
          '<div class="ch-board" id="chessBoard"></div>' +
        '</div>' +
        /* اختيار الترقية */
        '<div class="ch-promo" id="chessPromo" hidden>' +
          '<div class="ch-promo-card">' +
            '<div class="ch-promo-t">' + T('chess.promoTitle') + '</div>' +
            '<div class="ch-promo-row" id="chessPromoRow"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      /* ── نافذة النتيجة ── */
      '<div class="dama-over" id="chessOver" hidden>' +
        '<div class="dama-over-card">' +
          '<div class="dama-over-em" id="chessOverEm">🏆</div>' +
          '<div class="dama-over-tx" id="chessOverTx"></div>' +
          '<div class="dama-over-amt" id="chessOverAmt"></div>' +
          '<button class="big dama-go" onclick="chessNewMatch()"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> ' + T('dama.newMatch') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  , g).replace('<div class="stage">', '<div class="stage" id="chessStage">');
}

function initChess() {
  CHESS = {
    state: null, mode: 'local', myColor: 'w', sel: null, legal: [],
    flipped: false, autoFlip: true, bet: 0, timer: 0, _turnTi: null, _turnLeft: 0,
    isSpectator: false, oppBot: false, _seq: 0, roomOrder: [], drawBanUntil: 0,
    lastFrom: null, lastTo: null, busy: false, _pendingPromo: null
  };
  chessFitBoard();
  chessRegisterRooms();
}
window.initChess = initChess;
window.eChess = eChess;

/* [Training 2026-09-16] فردي ضد البوت: تدريب مجاني بلا رهان ولا تسجيل */
function chessStartSolo() {
  if (!CHESS) initChess();
  window.TRAINING = window.TRAINING || { on: false };
  window.TRAINING.on = true;
  chessStartRoom('w', true, false, 0);
}

function chessSetBet(b) {
  if (!CHESS) return;
  CHESS.bet = b;
  var chips = document.querySelectorAll('#chessBet .dama-chip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('on', +chips[i].getAttribute('data-bet') === b);
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}
function chessSetTimer(t) {
  if (!CHESS) return;
  CHESS.timer = t;
  var chips = document.querySelectorAll('#chessTimerRow .dama-chip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('on', +chips[i].getAttribute('data-t') === t);
  if (typeof SND !== 'undefined' && SND.click) SND.click();
}

/* حجم اللوحة */
var _chessBoardRO = null;
function chessFitBoard() {
  var box = document.getElementById('chessBoardBox');
  var board = document.getElementById('chessBoard');
  if (!box || !board) return;
  var apply = function () {
    var w = box.clientWidth - 4, h = box.clientHeight - 4;
    var sz = Math.max(150, Math.min(w, h, 440));
    board.style.width = sz + 'px';
    board.style.height = sz + 'px';
  };
  apply();
  if (_chessBoardRO && _chessBoardRO.disconnect) _chessBoardRO.disconnect();
  if (window.ResizeObserver) {
    _chessBoardRO = new ResizeObserver(apply);
    _chessBoardRO.observe(box);
  }
}

/* ── بدء وجه لوجه (شاشة واحدة) ── */
function chessStartLocal() {
  if (typeof SND !== 'undefined' && SND.click) SND.click();
  if (!CHESS) initChess();
  CHESS.mode = 'local';
  CHESS.myColor = 'w';
  CHESS.state = chessNewState();
  CHESS.sel = null; CHESS.legal = []; CHESS.flipped = false;
  CHESS.lastFrom = null; CHESS.lastTo = null; CHESS.drawBanUntil = 0;
  CHESS.isSpectator = false; CHESS.oppBot = false;
  window.TRAINING = window.TRAINING || { on: false };
  window.TRAINING.on = true;   /* [Training] وجه لوجه على نفس الجهاز: بلا رهان ولا تسجيل */
  document.getElementById('chessSetup').hidden = true;
  document.getElementById('chessOver').hidden = true;
  document.getElementById('chessPlay').hidden = false;
  document.getElementById('chessTopName').textContent = T('chess.black');
  document.getElementById('chessBotName').textContent = T('chess.white');
  var db = document.getElementById('chessDrawBar'); if (db) db.hidden = true;
  chessSetStatus(T('chess.whiteTurn'));
  chessRender();
  chessStartTimer();
}

/* ── عرض اللوحة ── */
function chessRender() {
  if (!CHESS || !CHESS.state) return;
  chessInjectDefs();
  var board = document.getElementById('chessBoard');
  if (!board) return;
  var s = CHESS.state;
  var html = '';
  var legalSet = {};
  for (var i = 0; i < CHESS.legal.length; i++) legalSet[CHESS.legal[i].to[0] + ',' + CHESS.legal[i].to[1]] = CHESS.legal[i];
  /* خانة الملك المُشاكَش */
  var checkSq = null;
  if (chessInCheck(s, s.turn === 'w')) {
    var kp = chessKingPos(s.board, s.turn === 'w');
    if (kp) checkSq = kp[0] + ',' + kp[1];
  }
  var files = 'abcdefgh';
  for (var vi = 0; vi < 8; vi++) {
    for (var vj = 0; vj < 8; vj++) {
      var r = CHESS.flipped ? 7 - vi : vi;
      var c = CHESS.flipped ? 7 - vj : vj;
      var dark = ((r + c) % 2) === 1;
      var p = s.board[r][c];
      var cls = 'ch-sq ' + (dark ? 'dark' : 'light');
      if (CHESS.sel && CHESS.sel[0] === r && CHESS.sel[1] === c) cls += ' sel';
      if (CHESS.lastFrom && CHESS.lastFrom[0] === r && CHESS.lastFrom[1] === c) cls += ' last';
      if (CHESS.lastTo && CHESS.lastTo[0] === r && CHESS.lastTo[1] === c) cls += ' last';
      if (checkSq === r + ',' + c) cls += ' check';
      var hint = legalSet[r + ',' + c];
      if (hint) cls += ' hint' + (hint.capture || hint.ep ? ' hint-cap' : '');
      /* إحداثيات الحافة */
      var coord = '';
      if (vj === 0) coord += '<span class="ch-co rank">' + (8 - r) + '</span>';
      if (vi === 7) coord += '<span class="ch-co file">' + files[c] + '</span>';
      html += '<div class="' + cls + '" data-r="' + r + '" data-c="' + c + '" onclick="chessClick(' + r + ',' + c + ')">' + coord;
      if (p) {
        var t = chessType(p);
        var side = chessIsWhite(p) ? 'w' : 'b';
        html += '<span class="ch-pc ' + side + (t === 'K' ? ' king' : '') + '">' + chessPieceSVG(t, side) + '</span>';
      }
      if (hint) html += '<span class="ch-dot' + (hint.capture || hint.ep ? ' cap' : '') + '"></span>';
      html += '</div>';
    }
  }
  board.innerHTML = html;
  chessUpdateHUD();
  chessUpdateLog();
}

function chessUpdateHUD() {
  if (!CHESS || !CHESS.state) return;
  var s = CHESS.state;
  var el = document.getElementById('chessTurn');
  if (el) {
    if (s.over) { el.textContent = T('dama.ended'); el.className = 'dama-turn'; }
    else if (s.turn === 'w') { el.textContent = T('chess.whiteTurn'); el.className = 'dama-turn you'; }
    else { el.textContent = T('chess.blackTurn'); el.className = 'dama-turn bot'; }
  }
  /* [Owner] حلقة ذهبية على أيقونة صاحب الدور: الأبيض ♔ = أسفل، الأسود ♚ = أعلى */
  var topIcon = document.getElementById('chessTopIcon');
  var botIcon = document.getElementById('chessBotIcon');
  if (topIcon) topIcon.classList.toggle('on', !s.over && s.turn === 'b');
  if (botIcon) botIcon.classList.toggle('on', !s.over && s.turn === 'w');
  /* صواني الأسرى (فعلية من الحالة) + فرق المواد */
  var val = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
  var cap = s.captured || { w: [], b: [] };
  var trayW = '', trayB = '', wPts = 0, bPts = 0;   /* wPts = نقاط ما أخذه الأبيض */
  for (var i = 0; i < cap.w.length; i++) {
    var pc = cap.w[i];
    var t = chessType(pc);
    wPts += val[t];
    trayW += '<span class="ch-capp b">' + chessPieceSVG(t, 'b') + '</span>';
  }
  for (var j = 0; j < cap.b.length; j++) {
    var pb = cap.b[j];
    var tb = chessType(pb);
    bPts += val[tb];
    trayB += '<span class="ch-capp w">' + chessPieceSVG(tb, 'w') + '</span>';
  }
  /* الشاشة: الأسود أعلى، الأبيض أسفل (أو معكوسة حسب وجهة نظري) */
  var iAmWhiteView = !CHESS.flipped;   /* الأبيض أسفل ما لم تكن اللوحة مقلوبة */
  var capTop = document.getElementById('chessCapTop');
  var capBot = document.getElementById('chessCapBot');
  var matTop = document.getElementById('chessMatTop');
  var matBot = document.getElementById('chessMatBot');
  if (capTop) capTop.innerHTML = iAmWhiteView ? trayB : trayW;   /* أسرى صاحب الأعلى */
  if (capBot) capBot.innerHTML = iAmWhiteView ? trayW : trayB;
  var topPts = iAmWhiteView ? bPts : wPts;   /* ما جمعه لاعب الأعلى */
  var botPts = iAmWhiteView ? wPts : bPts;
  if (matTop) matTop.textContent = topPts > botPts ? '+' + (topPts - botPts) : '0';
  if (matBot) matBot.textContent = botPts > topPts ? '+' + (botPts - topPts) : '0';
  /* [FreeTraining 2026-09-16 / v2.45.1] لا شريط رهان داخل شاشة الشطرنج — أُزيل تصميمياً:
     ضد الآلي ووجه لوجه تدريب مجاني بلا رهان، والرهان حصري للغرف أونلاين ويُدار بالرصيد
     (خصم عند البدء + تسوية عند النهاية) لا بواجهة. لا تُعِد عنصر #chessStake هنا. */
}

function chessUpdateLog() {
  var el = document.getElementById('chessLog');
  if (!el || !CHESS || !CHESS.state) return;
  var log = CHESS.state.log;
  var html = '';
  for (var i = 0; i < log.length; i += 2) {
    var n = (i / 2) + 1;
    html += '<span class="ch-lg-i"><b>' + n + '.</b> ' + log[i] + (log[i + 1] ? ' ' + log[i + 1] : '') + '</span>';
  }
  el.innerHTML = html;
  el.scrollLeft = el.scrollWidth;
}

function chessSetStatus(txt) {
  var el = document.getElementById('chessStatus');
  if (el) el.textContent = txt || '';
}

/* ── التفاعل ── */
function chessCanInteract() {
  if (!CHESS || !CHESS.state || CHESS.state.over || CHESS._pendingPromo) return false;
  if (CHESS.isSpectator) return false;
  if (CHESS.mode === 'room') return CHESS.state.turn === CHESS.myColor;
  return true;   /* وجه لوجه: الجهاز واحد */
}

function chessClick(r, c) {
  if (!chessCanInteract()) return;
  var s = CHESS.state;
  /* نقر وجهة قانونية؟ */
  for (var i = 0; i < CHESS.legal.length; i++) {
    var mv = CHESS.legal[i];
    if (mv.to[0] === r && mv.to[1] === c) {
      /* ترقية؟ افتح المنتقي */
      var promos = CHESS.legal.filter(function (m) { return m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === r && m.to[1] === c && m.promo; });
      if (promos.length) { chessOpenPromo(promos); return; }
      chessPlayMove(mv);
      return;
    }
  }
  /* اختيار قطعة */
  var p = s.board[r][c];
  if (p && chessIsWhite(p) === (s.turn === 'w')) {
    var lm = chessMovesForPiece(s, r, c);
    if (lm.length) {
      CHESS.sel = [r, c];
      CHESS.legal = lm;
      if (typeof SND !== 'undefined' && SND.click) SND.click();
    } else {
      chessSetStatus(T('chess.cantMove'));
    }
  } else {
    CHESS.sel = null; CHESS.legal = [];
  }
  chessRender();
}

function chessOpenPromo(promos) {
  CHESS._pendingPromo = promos;
  var row = document.getElementById('chessPromoRow');
  var side = CHESS.state.turn === 'w' ? 'w' : 'b';
  var html = '';
  var order = ['q', 'r', 'b', 'n'];
  for (var i = 0; i < order.length; i++) {
    var mv = promos.find(function (m) { return m.promo === order[i]; });
    if (mv) html += '<button class="ch-promo-b ' + side + '" onclick="chessPickPromo(\'' + order[i] + '\')">' + chessPieceSVG(order[i].toUpperCase(), side) + '</button>';
  }
  if (row) row.innerHTML = html;
  var ov = document.getElementById('chessPromo');
  if (ov) ov.hidden = false;
}
function chessPickPromo(code) {
  var ov = document.getElementById('chessPromo');
  if (ov) ov.hidden = true;
  if (!CHESS || !CHESS._pendingPromo) return;
  var mv = CHESS._pendingPromo.find(function (m) { return m.promo === code; });
  CHESS._pendingPromo = null;
  if (mv) chessPlayMove(mv);
}

/* تنفيذ حركة (محلية أو عن بعد) */
function chessPlayMove(mv, remote) {
  var s = CHESS.state;
  var wasCheck = chessInCheck(s, s.turn === 'w');
  var moverWhite = s.turn === 'w';
  var info = chessMakeMove(s, mv);
  CHESS.lastFrom = mv.from; CHESS.lastTo = mv.to;
  CHESS.sel = null; CHESS.legal = [];
  if (!remote && CHESS.mode === 'room') chessEmitMove(mv);
  chessRender();
  chessSound(mv, info);
  if (info.mate) { chessSetStatus(T('chess.mateMsg')); setTimeout(function () { chessFinalize(); }, 900); return; }
  if (info.draw) {
    var why = {
      stalemate: T('chess.stalemate'),
      '50move': T('chess.draw50'),
      rep: T('chess.drawRep'),
      material: T('chess.drawMaterial')
    }[s.endReason] || T('dama.draw');
    chessSetStatus(why);
    setTimeout(function () { chessFinalize(); }, 900);
    return;
  }
  /* وجه لوجه: قلب اللوحة مع الدور */
  if (CHESS.mode === 'local' && CHESS.autoFlip) CHESS.flipped = (s.turn === 'b');
  if (info.check) chessSetStatus(T('chess.checkMsg'));
  else if (CHESS.mode === 'local') chessSetStatus(s.turn === 'w' ? T('chess.whiteTurn') : T('chess.blackTurn'));
  else chessSetStatus(s.turn === CHESS.myColor ? T('dama.yourMove') : T('dama.oppTurn'));
  chessRender();
  chessStartTimer();
  /* غرفة ببوت: حركة البوت */
  if (CHESS.mode === 'room' && CHESS.oppBot && !s.over && s.turn !== CHESS.myColor) {
    CHESS.busy = true;
    setTimeout(chessBotTurn, 550);
  }
}

/* صوت الحركة بحسب نوعها */
function chessSound(mv, info) {
  if (typeof SND === 'undefined') return;
  try {
    if (mv.promo && SND.chessPromote) SND.chessPromote();
    else if (mv.castle && SND.chessCastle) SND.chessCastle();
    else if ((mv.capture || mv.ep) && SND.chessCapture) SND.chessCapture();
    else if (SND.chessMove) SND.chessMove();
    if (info.check && SND.chessCheck) setTimeout(function () { try { SND.chessCheck(); } catch (e) {} }, 140);
  } catch (e) {}
}

/* دور بوت الغرفة */
function chessBotTurn() {
  if (!CHESS || !CHESS.state || CHESS.state.over) { if (CHESS) CHESS.busy = false; return; }
  if (CHESS.state.turn === CHESS.myColor) { CHESS.busy = false; return; }
  /* [AI 2026-09-16] بوت خبير: نواة بحث سريعة (make/unmake + TT + سكون)
     تصل فعلياً لعمق 9-12 بالتعميق التدريجي ضمن ميزانية 3.5ث لكل حركة
     (كان: عمق فعلي ≤3 بسبب استنساخ الحالة في كل عقدة) */
  var mv = chessPickMove(CHESS.state, 14, 3500);
  CHESS.busy = false;
  if (mv) chessPlayMove(mv);
  else chessFinalize();
}

/* ── المؤقت ── */
function chessStopTimer() {
  if (CHESS && CHESS._turnTi) { clearInterval(CHESS._turnTi); CHESS._turnTi = null; }
  var el = document.getElementById('chessTimer');
  if (el) el.textContent = '';
  /* [Timer-Seat] إخفاء شارتي المؤقت الجانبيتين عند توقف العد */
  chessPaintSeatTimers('', '');
}
/* [Timer-Seat] شارة المؤقت بجانب أيقونة اللاعب صاحب الدور (نمط روندا):
   الأيقونات تمثّل الألوان دائماً — أعلى ♚ الأسود، أسفل ♔ الأبيض —
   فالشارة تتبع لون صاحب الدور في النمطين بلا التفات لقلب اللوحة */
function chessPaintSeatTimers(txt, whose) {
  var low = !!(txt && CHESS && CHESS._turnLeft <= 10);
  var top = document.getElementById('chessTopTimer');
  var bot = document.getElementById('chessBotTimer');
  if (top) {
    top.hidden = !((whose === 'top') && !!txt);
    top.textContent = (whose === 'top') ? txt : '';
    top.className = 'ch-ptimer' + ((whose === 'top' && low) ? ' low' : '');
  }
  if (bot) {
    bot.hidden = !((whose === 'bot') && !!txt);
    bot.textContent = (whose === 'bot') ? txt : '';
    bot.className = 'ch-ptimer' + ((whose === 'bot' && low) ? ' low' : '');
  }
}
function chessStartTimer() {
  chessStopTimer();
  if (!CHESS || !CHESS.state || CHESS.state.over) return;
  if (!CHESS.timer) return;
  /* [RS-GameOpts] في الغرفة: المؤقت يعمل على دوري فقط وبحركة آلية متزامنة عند انتهائه
     (لا إنهاء محلي أحادي الجانب يفسد التزامن) */
  if (CHESS.mode === 'room') {
    if (CHESS.isSpectator || CHESS.state.turn !== CHESS.myColor) return;
  } else if (CHESS.mode !== 'local') return;
  CHESS._turnLeft = CHESS.timer;
  CHESS._turnTi = setInterval(function () {
    if (!CHESS || !CHESS.state || CHESS.state.over) { chessStopTimer(); return; }
    CHESS._turnLeft--;
    chessRenderTimer();
    if (CHESS._turnLeft <= 0) {
      if (CHESS.mode === 'room') chessRoomAutoMove();
      else chessTimeout();
    }
  }, 1000);
  chessRenderTimer();   /* [Timer-Seat] أول رسم بعد تجهيز _turnTi — تظهر الشارة فور البدء */
}
/* [RS-GameOpts] انتهاء مؤقت دورك في الغرفة: حركة قانونية آلية تُبث للجميع */
function chessRoomAutoMove() {
  chessStopTimer();
  if (!CHESS || !CHESS.state || CHESS.state.over) return;
  var lm = chessLegalMoves(CHESS.state);
  if (!lm.length) return;
  var quiet = lm.filter(function (m) { return !m.capture; });
  var mv = quiet.length ? quiet[Math.floor(Math.random() * quiet.length)] : lm[0];
  chessSetStatus(T('chess.timeUp') || 'انتهى الوقت');
  if (typeof SND !== 'undefined' && SND.lose) { try { SND.lose(); } catch (e) {} }
  chessPlayMove(mv);
}
function chessRenderTimer() {
  var el = document.getElementById('chessTimer');
  if (!CHESS || !CHESS.state || !el) return;
  var s = CHESS.state;
  var name = s.turn === 'w' ? T('chess.white') : T('chess.black');
  var txt = name + ' · ' + Math.max(0, CHESS._turnLeft) + 's';
  el.textContent = txt;
  /* [Timer-Seat] الشارة على أيقونة صاحب الدور الحالي — الأيقونات تمثّل الألوان
     دائماً (أعلى ♚ الأسود، أسفل ♔ الأبيض) في النمطين وبلا التفات لقلب اللوحة */
  chessPaintSeatTimers('\u23f1 ' + Math.max(0, CHESS._turnLeft), (s.turn === 'w') ? 'bot' : 'top');
}
function chessTimeout() {
  chessStopTimer();
  if (!CHESS || !CHESS.state || CHESS.state.over) return;
  /* انتهاء الوقت = خسارة صاحب الدور (بلا كش مستحيل الحسم يُعد تعادلاً — تبسيط: خسارة) */
  CHESS.state.over = true;
  CHESS.state.outcome = chessOther(CHESS.state.turn);
  CHESS.state.endReason = 'timeout';
  chessSetStatus(T('chess.timeUp'));
  chessRender();
  setTimeout(chessFinalize, 700);
}

/* ── إنهاء وتسوية ── */
function chessFinalize() {
  chessStopTimer();
  if (!CHESS || !CHESS.state) return;
  var s = CHESS.state;
  if (s.over === false) return;
  var dbar = document.getElementById('chessDrawBar'); if (dbar) dbar.hidden = true;
  var ov = document.getElementById('chessOver');
  var em = document.getElementById('chessOverEm');
  var tx = document.getElementById('chessOverTx');
  var amt = document.getElementById('chessOverAmt');
  if (!ov) return;
  var reasonTxt = {
    mate: T('chess.byMate'),
    stalemate: T('chess.stalemate'),
    '50move': T('chess.draw50'),
    rep: T('chess.drawRep'),
    material: T('chess.drawMaterial'),
    agreed: T('chess.byAgreement'),
    resign: T('chess.byResign'),
    timeout: T('chess.byTimeout')
  }[s.endReason] || '';
  if (s.outcome === 'draw') {
    if (em) em.textContent = '🤝';
    if (tx) tx.textContent = T('dama.draw') + (reasonTxt ? ' — ' + reasonTxt : '');
    if (amt) {
      if (CHESS.mode === 'room' && CHESS.bet > 0 && !CHESS.isSpectator) {
        giveWin(CHESS.bet);
        if (typeof gres === 'function') gres(T('dama.drawRefund'), 0, true);
        amt.innerHTML = T('dama.refunded');
      } else if (amt) amt.textContent = reasonTxt || '';
    }
  } else {
    var winnerWhite = s.outcome === 'w';
    var iWon = CHESS.mode === 'local' ? null : (!CHESS.isSpectator && s.outcome === CHESS.myColor);
    if (em) em.textContent = winnerWhite ? '♔' : '♚';
    if (tx) {
      if (CHESS.mode === 'local') tx.textContent = (winnerWhite ? T('chess.whiteWins') : T('chess.blackWins')) + (reasonTxt ? ' — ' + reasonTxt : '');
      else tx.textContent = iWon ? T('dama.win') : T('dama.lose');
    }
    if (amt) {
      if (CHESS.mode === 'room' && CHESS.bet > 0 && !CHESS.isSpectator) {
        if (iWon) {
          var payout = CHESS.bet * 2;
          giveWin(payout);
          if (typeof gres === 'function') gres(T('dama.win') + ' +' + payout + ' 🪙', payout, true);
          if (typeof winFX === 'function') winFX(payout);
          /* [BotsLedger v2.28] فردي بوت: المنصة دفعت صافي (−) */
          if (CHESS.oppBot && !CHESS.isSpectator && typeof window !== 'undefined' && window.BotsLedger) {
            try { window.BotsLedger.record('ch', CHESS.bet - payout); } catch (e) {}
          }
          amt.innerHTML = '+' + payout + ' 🪙';
        } else {
          if (typeof gres === 'function') gres(T('dama.lose') + ' — ' + T('ts.lose'), 0, true);
          if (CHESS.oppBot && !CHESS.isSpectator && typeof window !== 'undefined' && window.BotsLedger) {
            try { window.BotsLedger.record('ch', CHESS.bet); } catch (e) {}
          }
          amt.textContent = '−' + CHESS.bet + ' 🪙';
        }
      } else amt.textContent = reasonTxt || '';
    }
    if (CHESS.mode === 'local' && typeof gres !== 'undefined' && !CHESS.bet) { /* ودية: بلا تسجيل مالي */ }
  }
  ov.hidden = false;
  if (typeof SND !== 'undefined' && SND.chessEnd) { try { SND.chessEnd(); } catch (e) {} }
}

function chessNewMatch() {
  var ov = document.getElementById('chessOver');
  if (ov) ov.hidden = true;
  if (CHESS && CHESS.mode === 'room') {
    /* [MP-Uni] نفس منهجية البلياردو: إعادة المباراة عبر الخادم (تصويت المشاركين) */
    if (!CHESS.oppBot && typeof Rooms !== 'undefined' && Rooms && typeof Rooms.startRematch === 'function' && Rooms.state) {
      Rooms.startRematch();
      return;
    }
    if (!CHESS.isSpectator && !CHESS.oppBot) chessEmit('newgame', {});
    chessResetBoardOnly();
    return;
  }
  chessStartLocal();
}

function chessToSetup() {
  if (!CHESS) return;
  chessStopTimer();
  if (CHESS.mode === 'room') {
    /* الغرفة: مغادرة مباراة حية = استسلام */
    if (CHESS.state && !CHESS.state.over && !CHESS.isSpectator) { chessResign(); return; }
    return;
  }
  if (CHESS.state && !CHESS.state.over) {
    CHESS.state.over = true;
    CHESS.state.outcome = 'draw';
    CHESS.state.endReason = 'agreed';
  }
  document.getElementById('chessPlay').hidden = true;
  document.getElementById('chessOver').hidden = true;
  document.getElementById('chessSetup').hidden = false;
  chessSetStatus('');
}

function chessResign() {
  if (!CHESS || !CHESS.state || CHESS.state.over) return;
  if (!confirm(T('chess.confirmResign'))) return;
  if (CHESS.mode === 'room' && !CHESS.oppBot && !CHESS.isSpectator) chessEmit('resign', {});
  var loser = (CHESS.mode === 'room') ? CHESS.myColor : CHESS.state.turn;
  CHESS.state.over = true;
  CHESS.state.outcome = loser === 'w' ? 'b' : 'w';
  CHESS.state.endReason = 'resign';
  chessRender();
  chessFinalize();
}

/* ── التعادل بالتوافق ── */
function chessDrawOffer() {
  if (!CHESS || !CHESS.state || CHESS.state.over || CHESS.isSpectator) return;
  if ((CHESS.drawBanUntil | 0) > (CHESS.state.full | 0)) {
    chessSetStatus(T('dama.drawWait'));
    return;
  }
  if (CHESS.mode === 'room' && !CHESS.oppBot) {
    chessEmit('drawOffer', {});
    CHESS.drawBanUntil = (CHESS.state.full | 0) + 4;
    chessSetStatus(T('dama.drawSent'));
    if (typeof SND !== 'undefined' && SND.notify) SND.notify();
    return;
  }
  if (CHESS.mode === 'local') {
    /* وجه لوجه: مصادقة الطرف الآخر عبر شريط القبول */
    CHESS._drawBy = CHESS.state.turn;
    chessShowDrawBar(T('chess.drawLocalAsk'));
    return;
  }
  /* ضد بوت الغرفة: يقبل إن كان متأخراً */
  var my = 0, op = 0;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = CHESS.state.board[r][c];
    if (!p) continue;
    var v = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 }[chessType(p)];
    if (chessIsWhite(p)) { if (CHESS.myColor === 'w') my += v; else op += v; }
    else { if (CHESS.myColor === 'b') my += v; else op += v; }
  }
  if (op >= my) {   /* البوت ليس أفضل → يقبل */
    CHESS.state.over = true; CHESS.state.outcome = 'draw'; CHESS.state.endReason = 'agreed';
    chessFinalize();
  } else {
    CHESS.drawBanUntil = (CHESS.state.full | 0) + 4;
    chessSetStatus(T('dama.drawDeclinedTxt'));
  }
}

function chessDrawAccept(yes) {
  var bar = document.getElementById('chessDrawBar');
  if (bar) bar.hidden = true;
  if (!CHESS || !CHESS.state || CHESS.state.over) return;
  if (CHESS.mode === 'local') {
    if (yes) {
      CHESS.state.over = true; CHESS.state.outcome = 'draw'; CHESS.state.endReason = 'agreed';
      chessFinalize();
    } else chessSetStatus(T('dama.drawYouDeclined'));
    return;
  }
  if (yes) {
    if (!CHESS.oppBot && !CHESS.isSpectator) chessEmit('drawAgree', {});
    CHESS.state.over = true; CHESS.state.outcome = 'draw'; CHESS.state.endReason = 'agreed';
    chessFinalize();
  } else {
    if (!CHESS.oppBot && !CHESS.isSpectator) chessEmit('drawDecline', {});
    chessSetStatus(T('dama.drawYouDeclined'));
  }
}

function chessShowDrawBar(txt) {
  var bar = document.getElementById('chessDrawBar');
  var t = document.getElementById('chessDrawTxt');
  if (bar) { if (t) t.textContent = txt; bar.hidden = false; }
}

/* ── الغرف (MP) ── */
function chessMeId() {
  if (typeof AUTH !== 'undefined' && AUTH.user) return AUTH.user.id;
  if (typeof ST !== 'undefined' && ST.user) return ST.user.id;
  return null;
}
function chessEmitMove(mv) {
  CHESS._seq = (CHESS._seq || 0) + 1;
  /* [dedup] مفتاح بمعرّف المُرسِل — كلا الطرفين يبدأ seq من 0 (تصادم الرسالة الأولى) */
  chessEmit('move', { mv: { from: mv.from, to: mv.to, promo: mv.promo || null, piece: mv.piece, capture: mv.capture || null, castle: mv.castle || null, ep: !!mv.ep }, dedup: 'ch-' + chessMeId() + '-' + CHESS._seq });
}
function chessEmit(action, data) {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.sendMove !== 'function') return;
  var payload = { action: action, data: data || {}, by: chessMeId(), seq: (CHESS._seq || 0), ts: Date.now() };
  try { Rooms.sendMove('rmove', payload, { game_id: 'ch', status: 'playing' }); } catch (e) {}
}

function chessRoomMove(d) {
  try {
    if (!d) return;
    if (d.action === 'rmove' && d.data) d = d.data;
    var by = d.by;
    if (by != null && String(by) === String(chessMeId())) return;
    var action = d.action;
    if (action === 'newgame') { chessResetBoardOnly(); return; }
    if (action === 'resign') {
      if (CHESS && CHESS.state && !CHESS.state.over) {
        CHESS.state.over = true;
        CHESS.state.outcome = CHESS.myColor;   /* خصمي انسحب → فوزي */
        CHESS.state.endReason = 'resign';
        chessRender();
        chessFinalize();
      }
      return;
    }
    if (action === 'drawOffer') {
      if (CHESS && CHESS.state && !CHESS.state.over) {
        if (CHESS.isSpectator) { chessSetStatus('🤝 ' + T('dama.drawOffered')); return; }
        chessShowDrawBar(T('dama.drawIncoming'));
        if (typeof SND !== 'undefined' && SND.notify) SND.notify();
      }
      return;
    }
    if (action === 'drawAgree') {
      var barEl = document.getElementById('chessDrawBar'); if (barEl) barEl.hidden = true;
      if (CHESS && CHESS.state && !CHESS.state.over) {
        CHESS.state.over = true; CHESS.state.outcome = 'draw'; CHESS.state.endReason = 'agreed';
        chessFinalize();
      }
      return;
    }
    if (action === 'drawDecline') {
      var barEl2 = document.getElementById('chessDrawBar'); if (barEl2) barEl2.hidden = true;
      chessSetStatus(T('dama.drawDeclinedTxt'));
      return;
    }
    if (action === 'move') {
      var mv = (d.data && d.data.mv) ? d.data.mv : null;
      if (mv) chessApplyRemoteMove(mv);
    }
  } catch (e) { if (typeof console !== 'undefined') console.error('[Chess MP] roomMove', e && e.message, e); }
}

function chessApplyRemoteMove(mv) {
  if (!CHESS || !CHESS.state || CHESS.state.over || !mv || !mv.from || !mv.to) return;
  if (!CHESS.isSpectator && CHESS.state.turn === CHESS.myColor) return;   /* ليس دور الخصم */
  /* [تحقق] الحركة يجب أن تكون ضمن القائمة القانونية (محرك حتمي عند الطرفين) */
  var legal = chessLegalMoves(CHESS.state).filter(function (m) {
    return m.from[0] === mv.from[0] && m.from[1] === mv.from[1]
      && m.to[0] === mv.to[0] && m.to[1] === mv.to[1]
      && (m.promo || null) === (mv.promo || null);
  });
  if (!legal.length) return;
  chessPlayMove(legal[0], true);
}

function chessResetBoardOnly() {
  if (!CHESS) return;
  /* جولة جديدة في غرفة الرهان: كل طرف يعيد حصته (جولة = رهن مستقل)
     [v2.28] الفردي ضد البوت يخصم أيضاً عند كل إعادة مباراة */
  if (CHESS.mode === 'room' && CHESS.bet > 0 && !CHESS.isSpectator) {
    if (typeof takeBet === 'function' && !takeBet(CHESS.bet)) CHESS.bet = 0;   /* لا يكفي الرصيد → تكمل ودية */
  }
  CHESS.state = chessNewState();
  CHESS.sel = null; CHESS.legal = []; CHESS.busy = false;
  CHESS.lastFrom = null; CHESS.lastTo = null;
  CHESS.drawBanUntil = 0;
  var ov = document.getElementById('chessOver'); if (ov) ov.hidden = true;
  var db = document.getElementById('chessDrawBar'); if (db) db.hidden = true;
  CHESS.flipped = (CHESS.mode === 'room' && CHESS.myColor === 'b');
  chessRender();
  chessSetStatus(CHESS.state.turn === CHESS.myColor ? T('dama.yourMove') : T('dama.waitOpp'));
}

function chessRoomStart(room) {
  if (!room || room.game_id !== 'ch' || room.status !== 'playing') return;
  var order = (room.order && room.order.length) ? room.order.slice() : [];
  if (!order.length) return;
  var meId = chessMeId();
  var mySeat = -1;
  for (var i = 0; i < order.length; i++) if (String(order[i]) === String(meId)) mySeat = i;
  var spec = mySeat === -1;
  var oppBot = false;
  try {
    if (room.players) {
      for (var j = 0; j < room.players.length; j++) {
        var pl = room.players[j];
        if (pl.spectate || String(pl.id) === String(meId)) continue;
        oppBot = !!pl.isBot;
        break;
      }
    }
  } catch (e) {}
  var bet = 0;
  try { bet = parseInt(room.bet, 10) || 0; } catch (e) {}
  chessStartRoom(mySeat === 0 ? 'w' : 'b', oppBot, spec, bet);
}

function chessStartRoom(myColor, oppBot, spec, bet) {
  if (!CHESS) initChess();
  CHESS.mode = 'room';
  /* [RS-GameOpts] مؤقت الدور من إعدادات الغرفة (اختيار المالك) */
  if (typeof window !== 'undefined' && window.CH_ROOM_TIMER != null) CHESS.timer = window.CH_ROOM_TIMER || 0;
  CHESS.myColor = myColor;
  CHESS.oppBot = !!oppBot;
  CHESS.isSpectator = !!spec;
  CHESS.bet = spec ? 0 : (bet || 0);
  CHESS.state = chessNewState();
  CHESS.sel = null; CHESS.legal = []; CHESS.busy = false;
  CHESS.lastFrom = null; CHESS.lastTo = null; CHESS.drawBanUntil = 0;
  CHESS.flipped = (myColor === 'b');
  /* رهان الغرفة: كل طرف يخصم حصته
     [Persist] عائد لجولة جارية (تجديد صفحة/انقطاع): حصته خُصمت قبل الانقطاع
     والرصيد المحلي محفوظ — لا خصم مكرر. */
  var _rejoin = (typeof Rooms !== 'undefined' && Rooms && Rooms._rejoinLive);
  if (_rejoin && typeof Rooms !== 'undefined') Rooms._rejoinLive = false;
  if (!spec && CHESS.bet > 0 && !_rejoin) {
    if (typeof takeBet === 'function' && !takeBet(CHESS.bet)) {
      CHESS.bet = 0;
      CHESS.state.over = true;
      chessSetStatus(T('ts.noc'));
      return;
    }
  }
  document.getElementById('chessSetup').hidden = true;
  document.getElementById('chessOver').hidden = true;
  document.getElementById('chessPlay').hidden = false;
  document.getElementById('chessTopName').textContent = spec ? T('chess.spectating') : (myColor === 'w' ? T('chess.oppLabel') : T('chess.youLabel'));
  document.getElementById('chessBotName').textContent = spec ? T('chess.spectating') : (myColor === 'w' ? T('chess.youLabel') : T('chess.oppLabel'));
  var db = document.getElementById('chessDrawBar'); if (db) db.hidden = true;
  chessRender();
  chessSetStatus(spec ? '👁️ ' + T('dama.spec') : (CHESS.state.turn === myColor ? T('dama.yourMove') : T('dama.waitOpp')));
}

function chessApplyReplay(d) {
  try {
    if (!d || !d.history || !d.history.length) return;
    if (!CHESS || CHESS.mode !== 'room' || !CHESS.state) return;
    CHESS.state = chessNewState();
    var resignedBy = null;
    for (var i = 0; i < d.history.length; i++) {
      var h = d.history[i];
      if (!h || !h.action) continue;
      if (h.action === 'newgame') { CHESS.state = chessNewState(); resignedBy = null; continue; }
      if (h.action === 'resign') { resignedBy = h.by; continue; }
      if (h.action === 'drawAgree') { CHESS.state.over = true; CHESS.state.outcome = 'draw'; CHESS.state.endReason = 'agreed'; continue; }
      if (h.action === 'move' && h.data && h.data.mv) {
        var mv = h.data.mv;
        var legal = chessLegalMoves(CHESS.state).filter(function (m) {
          return m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1] && (m.promo || null) === (mv.promo || null);
        });
        if (legal.length) chessMakeMove(CHESS.state, legal[0]);
      }
    }
    CHESS.sel = null; CHESS.legal = [];
    if (resignedBy != null) {
      CHESS.state.over = true;
      CHESS.state.outcome = (String(resignedBy) === String(chessMeId())) ? (CHESS.myColor === 'w' ? 'b' : 'w') : CHESS.myColor;
      CHESS.state.endReason = 'resign';
    }
    chessRender();
  } catch (e) { if (typeof console !== 'undefined') console.error('[Chess MP] replay', e && e.message, e); }
}

function chessRegisterRooms() {
  if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.setGameHandler !== 'function') return;
  Rooms.setGameHandler(chessRoomMove);
  Rooms.setStartHandler(chessRoomStart);
  if (typeof Rooms.setUpdateHandler === 'function') Rooms.setUpdateHandler(function () {});
  if (typeof window !== 'undefined') window.applyRoomReplay = chessApplyReplay;
  if (Rooms.state && Rooms.state.game_id === 'ch' && Rooms.state.status === 'playing') {
    var rp = (typeof Rooms.hasPendingReplay === 'function' && Rooms.hasPendingReplay()) ? Rooms.consumePendingReplay() : null;
    Rooms._rejoinLive = true;   /* [Persist] عودة لجولة جارية — الرهان خُصم عند بدايتها */
    chessRoomStart(Rooms.state);
    if (rp && rp.history && rp.history.length) chessApplyReplay(rp);
    /* [Persist] لا replay معلق → اطلب سجل الحركات من الخادم */
    else if (typeof Rooms.requestReplay === 'function') Rooms.requestReplay();
  }
}

/* تصدير دوال الواجهة */
window.chessStartLocal = chessStartLocal;
window.chessStartSolo = chessStartSolo;
window.chessClick = chessClick;
window.chessSetBet = chessSetBet;
window.chessSetTimer = chessSetTimer;
window.chessPickPromo = chessPickPromo;
window.chessResign = chessResign;
window.chessDrawOffer = chessDrawOffer;
window.chessDrawAccept = chessDrawAccept;
window.chessNewMatch = chessNewMatch;
window.chessToSetup = chessToSetup;

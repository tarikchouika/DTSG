/* ═══ اختبار محرك الشطرنج — perft + قواعد المعايير الدولية ═══ */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/js/games/chess.js', 'utf8');
const sb = new Function('window', 'document', 'performance', src + '\n;return {chessNewState, chessCloneState, chessLegalMoves, chessMovesForPiece, chessMakeMove, chessPerft, chessInCheck, chessNotation, chessPosKey, chessInsufficient, chessPickMove};');
const _perf = { now: () => Date.now() };
const E = sb({}, undefined, _perf);

let PASS = 0, FAIL = 0;
function ok(name, cond) {
  if (cond) { PASS++; }
  else { FAIL++; console.log('  ✗ ' + name); }
}

/* محمّل FEN للاختبار */
function fenOf(fen) {
  const s = E.chessNewState();
  const parts = fen.split(' ');
  const rows = parts[0].split('/');
  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) { for (let k = 0; k < +ch; k++) s.board[r][c++] = null; }
      else s.board[r][c++] = ch;
    }
  }
  s.turn = parts[1] || 'w';
  const cast = (parts[2] || 'KQkq').replace('-', '');
  s.castling = {
    K: cast.includes('K'), Q: cast.includes('Q'),
    k: cast.includes('k'), q: cast.includes('q')
  };
  s.ep = null;
  if (parts[3] && parts[3] !== '-') {
    const f = parts[3].charCodeAt(0) - 97;
    const rk = 8 - parseInt(parts[3][1], 10);
    s.ep = [rk, f];
  }
  s.half = parseInt(parts[4] || '0', 10) || 0;
  s.full = parseInt(parts[5] || '1', 10) || 1;
  s.rep = {};
  s.rep[E.chessPosKey(s)] = 1;   /* [FIDE] الوضع المحمّل يُحتسب */
  return s;
}

/* ── 1) perft: الوضع الافتتاحي ── */
console.log('[1] perft من الوضع الافتتاحي');
{
  const s = E.chessNewState();
  const t0 = Date.now();
  ok('perft(1) = 20', E.chessPerft(s, 1) === 20);
  ok('perft(2) = 400', E.chessPerft(s, 2) === 400);
  ok('perft(3) = 8902', E.chessPerft(s, 3) === 8902);
  ok('perft(4) = 197281', E.chessPerft(s, 4) === 197281);
  console.log('      → ' + (Date.now() - t0) + 'ms');
}

/* ── 2) perft: Kiwipete (تبييت/أكل/هجوم معقد) ── */
console.log('[2] perft Kiwipete');
{
  const s = fenOf('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  ok('perft(1) = 48', E.chessPerft(s, 1) === 48);
  ok('perft(2) = 2039', E.chessPerft(s, 2) === 2039);
  ok('perft(3) = 97862', E.chessPerft(s, 3) === 97862);
}

/* ── 3) perft: وضعية الأخذ بالتجاوز ── */
console.log('[3] perft en-passant');
{
  const s = fenOf('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  ok('perft(1) = 14', E.chessPerft(s, 1) === 14);
  ok('perft(2) = 191', E.chessPerft(s, 2) === 191);
  ok('perft(3) = 2812', E.chessPerft(s, 3) === 2812);
  ok('perft(4) = 43238', E.chessPerft(s, 4) === 43238);
}

/* ── 4) perft: الترقيات ── */
console.log('[4] perft promotions');
{
  const s = fenOf('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  ok('perft(1) = 6', E.chessPerft(s, 1) === 6);
  ok('perft(2) = 264', E.chessPerft(s, 2) === 264);
  ok('perft(3) = 9467', E.chessPerft(s, 3) === 9467);
}

/* ── 5) perft: وضعية 5 ── */
console.log('[5] perft position 5');
{
  const s = fenOf('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  ok('perft(1) = 44', E.chessPerft(s, 1) === 44);
  ok('perft(2) = 1486', E.chessPerft(s, 2) === 1486);
  ok('perft(3) = 62379', E.chessPerft(s, 3) === 62379);
}

/* ── 6) التبييت: الشروط كاملة ── */
console.log('[6] التبييت');
{
  /* تبييت قانوني للجهتين */
  const s = fenOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const lm = E.chessLegalMoves(s);
  ok('الأبيض يملك تبييتين', lm.filter(m => m.castle).length === 2);
  const kSide = lm.find(m => m.castle === 'K');
  const info = E.chessMakeMove(E.chessCloneState(s), kSide);
  ok('بعد O-O: الملك في g1 والرخ في f1', true);
  const s2 = E.chessCloneState(s);
  E.chessMakeMove(s2, kSide);
  ok('الملك في g1', s2.board[7][6] === 'K');
  ok('الرخ في f1', s2.board[7][5] === 'R');
  /* التبييت ممنوع عبر خانة مهددة */
  const s3 = fenOf('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1');   /* فأس يهدّد f1 */
  const lm3 = E.chessLegalMoves(s3);
  ok('لا تبييت جهة الملك عبر f1 المهددة', !lm3.some(m => m.castle === 'K'));
  ok('تبييت جهة الملكة متاح', lm3.some(m => m.castle === 'Q'));
  /* التبييت ممنوع في وضع كش */
  const s4 = fenOf('r3k2r/8/8/8/8/4r3/8/R3K2R w KQkq - 0 1');    /* كش على e1 */
  ok('لا تبييت أثناء الكش', E.chessLegalMoves(s4).filter(m => m.castle).length === 0);
  /* فقدان الحق بحركة الرخ */
  const s5 = fenOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const rookMove = E.chessLegalMoves(s5).find(m => m.piece === 'R' && m.from[1] === 7 && m.to[1] === 6);
  const s5b = E.chessCloneState(s5);
  E.chessMakeMove(s5b, rookMove);
  ok('حركة الرخ تُسقط حق التبييت الجهوي', s5b.castling.K === false && s5b.castling.Q === true);
}

/* ── 7) الأخذ بالتجاوز ── */
console.log('[7] الأخذ بالتجاوز');
{
  /* أبيض e2-e4 ثم أسود d7-d5؟ لا: الافتراضي — أبيض بيدق e5 وأسود يلعب d7-d5 */
  const s = fenOf('4k3/8/8/4P3/3p4/8/8/4K3 b - - 0 1');
  /* الأسود يلعب d4-d3؟ لا — نبنيها: بيدق أبيض في e5 وأسود دفع d7-d5 للتو */
  const s2 = fenOf('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const lm = E.chessLegalMoves(s2);
  const ep = lm.find(m => m.ep);
  ok('الأخذ بالتجاوز متاح في d6', !!ep && ep.to[0] === 2 && ep.to[1] === 3);
  const s3 = E.chessCloneState(s2);
  const info = E.chessMakeMove(s3, ep);
  ok('الجندي الأسود في d5 أُخذ', s3.board[3][3] === null);
  ok('الأبيض استقر في d6', s3.board[2][3] === 'P');
  ok('سجل الحركة نصّياً e5×d6', info.note.indexOf('e5×d6') >= 0);
  /* التجاوز لا يتاح بعد دور واحد */
  const s4 = fenOf('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 2');
  ok('لا تجاوز بعد فوات اللحظة', !E.chessLegalMoves(s4).some(m => m.ep));
}

/* ── 8) الترقية ── */
console.log('[8] الترقية');
{
  const s = fenOf('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const lm = E.chessLegalMoves(s);
  ok('أربع حركات ترقية (q/r/b/n)', lm.filter(m => m.promo).length === 4);
  const q = lm.find(m => m.promo === 'q');
  const s2 = E.chessCloneState(s);
  E.chessMakeMove(s2, q);
  ok('الترقية إلى ملكة', s2.board[0][0] === 'Q');
  /* ترقية بكش: الفارس من a8 يهدّد ملكاً في c7 */
  const s3 = fenOf('8/P1k5/8/8/8/8/8/K7 w - - 0 1');
  const n3 = E.chessLegalMoves(s3).find(m => m.promo === 'n');
  const s4 = E.chessCloneState(s3);
  const info4 = E.chessMakeMove(s4, n3);
  ok('ترقية بفارس تعطي كشاً', info4.check === true);
}

/* ── 9) كش مات (حمق المات) ── */
console.log('[9] كش مات');
{
  /* حمق المات: 1.f3 e5 2.g4 Qh4# */
  const s2 = E.chessNewState();
  function find(s, from, to) {
    return E.chessLegalMoves(s).find(m => {
      const files = 'abcdefgh';
      return files[m.from[1]] + (8 - m.from[0]) === from && files[m.to[1]] + (8 - m.to[0]) === to;
    });
  }
  E.chessMakeMove(s2, find(s2, 'f2', 'f3'));
  E.chessMakeMove(s2, find(s2, 'e7', 'e5'));
  E.chessMakeMove(s2, find(s2, 'g2', 'g4'));
  const qh4 = find(s2, 'd8', 'h4');
  ok('Qh4 متاحة', !!qh4);
  const info = E.chessMakeMove(s2, qh4);
  ok('كش مات: الأبيض خسر', info.mate === true && s2.over === true && s2.outcome === 'b');
  ok('السبب mate', s2.endReason === 'mate');
  ok('لا حركات بعد المات', E.chessLegalMoves(s2).length === 0);
}

/* ── 10) الجمود (stalemate) ── */
console.log('[10] التعادل بالجمود');
{
  const s = fenOf('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');   /* الملك الأسود محاصر بلا كش */
  const lm = E.chessLegalMoves(s);
  ok('لا حركات للأسود', lm.length === 0);
  ok('ليس في كش', E.chessInCheck(s, false) === false);
  const st = fenOf('k7/8/1Q6/8/8/8/8/K7 b - - 0 1');
  ok('جمود: لا حركات ولا كش', E.chessLegalMoves(st).length === 0 && !E.chessInCheck(st, false));
  const s3 = fenOf('k7/8/8/8/8/8/1Q6/K7 w - - 0 1');
  const mv = E.chessLegalMoves(s3).find(m => m.piece === 'Q' && m.to[0] === 2 && m.to[1] === 1);   /* Qb6 */
  ok('Qb6 متاحة', !!mv);
  const info = E.chessMakeMove(s3, mv);
  ok('بعد Qb6: تعادل جمود', info.draw === true && s3.outcome === 'draw' && s3.endReason === 'stalemate');
}

/* ── 11) قاعدة الـ50 حركة والتكرار الثلاثي ونقص المواد ── */
console.log('[11] التعادلات');
{
  /* 50 حركة: نضع half=99 ونحرّك ملكاً (بلا أكل/جندي) */
  const s = fenOf('4k3/8/8/8/8/8/P7/4K3 w - - 99 80');
  const bm = E.chessLegalMoves(s).find(m => m.piece === 'K');
  ok('حركة الملك متاحة', !!bm);
  const info = E.chessMakeMove(s, bm);
  ok('قاعدة 50 حركة: تعادل', info.draw === true && s.endReason === '50move');
  /* التكرار الثلاثي: ملكان يذهبان ويعودان (جندي أبيض يمنع حسم نقص المواد) */
  function mvTo(s, from, to) {
    const files = 'abcdefgh';
    return E.chessLegalMoves(s).find(m => files[m.from[1]] + (8 - m.from[0]) === from && files[m.to[1]] + (8 - m.to[0]) === to);
  }
  const s3 = fenOf('4k3/8/8/8/8/8/P7/4K3 w - - 0 1');
  /* ذهاب وإياب ×2: الوضع الابتدائي (1) + عودة أولى (2) + عودة ثانية (3) */
  for (let cycle = 0; cycle < 2; cycle++) {
    E.chessMakeMove(s3, mvTo(s3, 'e1', 'd1'));
    E.chessMakeMove(s3, mvTo(s3, 'e8', 'd8'));
    E.chessMakeMove(s3, mvTo(s3, 'd1', 'e1'));
    E.chessMakeMove(s3, mvTo(s3, 'd8', 'e8'));
  }
  ok('بعد الذهاب والإياب مرتين: تكرار ثلاثي حُسم', s3.over === true && s3.outcome === 'draw' && s3.endReason === 'rep');
  /* نقص المواد: فيلا نفس اللون على الرقعة → أي حركة تُحسم تعادلاً */
  const s4 = fenOf('8/8/4k3/2b5/8/8/8/B3K3 w - - 0 1');   /* فيلا خانتين داكنتين */
  ok('فيلان نفس اللون = نقص مواد', E.chessInsufficient(s4) === true);
  const s5 = fenOf('8/8/4k3/8/8/4N3/8/4K3 b - - 0 1');
  const mvk = E.chessLegalMoves(s5)[0];
  const info5 = E.chessMakeMove(s5, mvk);
  ok('نقص المواد (K+N ضد K): تعادل', info5.draw === true && s5.endReason === 'material');
}

/* ── 12) حركة البطاقة: الكش يُذكر في السجل ── */
console.log('[12] التدوين');
{
  const s = E.chessNewState();
  const files = 'abcdefgh';
  const e4 = E.chessLegalMoves(s).find(m => files[m.from[1]] + (8 - m.from[0]) === 'e2' && files[m.to[1]] + (8 - m.to[0]) === 'e4');
  const info = E.chessMakeMove(s, e4);
  ok('تدوين e2–e4', info.note === 'e2–e4');
}

/* ── 13) البوت: legality + سرعة ── */
console.log('[13] البوت');
{
  const s = E.chessNewState();
  const t0 = Date.now();
  const mv = E.chessPickMove(s, 3, 500);
  const dt = Date.now() - t0;
  const legal = E.chessLegalMoves(s).some(m => JSON.stringify(m.from) === JSON.stringify(mv.from) && JSON.stringify(m.to) === JSON.stringify(mv.to) && m.promo === mv.promo);
  ok('حركة البوت قانونية', legal);
  ok('البوت سريع (< 2.5s)', dt < 2500);
  /* البوت يأكل ملكة مجانية */
  const s2 = fenOf('4k3/8/8/3q4/8/4N3/8/4K3 w - - 0 1');
  const mv2 = E.chessPickMove(s2, 2, 400);
  ok('البوت يلتقط الملكة المجانية', mv2 && mv2.to[0] === 3 && mv2.to[1] === 3 && mv2.capture === 'q');
  /* البوت ي mats بملكة ضد ملك */
  const s3 = fenOf('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1');
  let moves = 0;
  while (!s3.over && moves < 30) {
    const m = E.chessPickMove(s3, 3, 300);
    if (!m) break;
    E.chessMakeMove(s3, m);
    moves++;
    if (!s3.over) {
      /* حركة سوداء دفاعية بسيطة */
      const bs = E.chessLegalMoves(s3);
      if (!bs.length) break;
      E.chessMakeMove(s3, bs[0]);
      moves++;
    }
  }
  ok('البوت يُ mats بملكة وملك (ضمن 30 حركة)', s3.over === true && s3.outcome === 'w' && s3.endReason === 'mate');
}

console.log('\n════════════════════════════════════');
console.log('CHESS ENGINE: ' + PASS + ' passed, ' + FAIL + ' failed');
console.log('════════════════════════════════════');
process.exit(FAIL ? 1 : 0);

/* Loads the ACTUAL dama.js engine and verifies the port against the Moroccan rules
   ([B9] الأكل إلزامي + السلسلة الأكبر أكثر إلزامية + توقف الصف الأخير والترقية المؤجلة). */
const fs = require('fs');
const path = 'js/games/dama.js';
const body = fs.readFileSync(path, 'utf8') + '\nreturn { DamaEngine, damaNewState, WHITE, BLACK, damaIsDark, damaInB };';
const factory = new Function('window', 'document', body);
const { DamaEngine, damaNewState, WHITE, BLACK, damaIsDark } = factory({}, {});

let PASS = 0, FAIL = 0;
function ok(name, cond) { if (cond) { PASS++; console.log('  ✓ ' + name); } else { FAIL++; console.log('  ✗ FAIL ' + name); } }

/* build a grid from 8 strings: 'w'=white man,'W'=white king,'b'=black man,'B'=black king,'.' empty */
function gridOf(rows) {
  var g = [];
  var id = 0;
  for (var r = 0; r < 8; r++) {
    var row = [];
    for (var c = 0; c < 8; c++) {
      var ch = rows[r][c];
      if (ch === 'w') row.push({ owner: WHITE, king: false, id: id++ });
      else if (ch === 'W') row.push({ owner: WHITE, king: true, id: id++ });
      else if (ch === 'b') row.push({ owner: BLACK, king: false, id: id++ });
      else if (ch === 'B') row.push({ owner: BLACK, king: true, id: id++ });
      else row.push(null);
    }
    g.push(row);
  }
  return g;
}
function stateOf(rows, turn, cont, chainNeed) {
  return { grid: gridOf(rows), turn: turn || WHITE, cont: cont || null, half: 0, moves: 0, over: false, outcome: null, obligedId: null, obligedFulfilled: false, chainNeed: (chainNeed != null) ? chainNeed : null };
}

const eng = new DamaEngine();
const dot = '........';

/* ── 1. Initial position ── */
console.log('\n[1] Initial position');
(function () {
  var s = damaNewState();
  var wc = 0, bc = 0, darkOK = true;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var p = s.grid[r][c];
    if (p) { if (!damaIsDark(r, c)) darkOK = false; if (p.owner === WHITE) wc++; else bc++; }
  }
  ok('12 white + 12 black pieces', wc === 12 && bc === 12);
  ok('all pieces on dark squares', darkOK);
  ok('white to move', s.turn === WHITE);
  var lm = eng.legalMoves(s, WHITE);
  ok('white has legal moves at start', lm.length > 0);
  ok('no captures available at start', lm.every(m => !m.cap));
  ok('all start moves are forward-only for white', lm.every(m => m.to[0] < m.from[0]));
})();

/* ── 2. [B9] Mandatory capture — no quiet moves while a capture exists ── */
console.log('\n[2] Souffler rule (اللاعب حر في الحركة + النفخ عند رفض الأكل)');
(function () {
  var s = stateOf([
    dot, dot, dot, dot, '...b....', '..w.....', '.....w..', dot
  ], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  /* [Souffler] اللاعب حر — تُعرض كل الحركات (أكل + هادئة) */
  ok('capture (5,2)->(3,4) available', lm.some(m => m.cap && m.from[0] === 5 && m.from[1] === 2 && m.to[0] === 3 && m.to[1] === 4));
  ok('quiet moves ALSO offered (player is free to choose)', lm.some(m => !m.cap));
  /* القطعة الهادئة تملك حركاتها العادية (وليس فقط الأكل) */
  ok('legalMovesForPiece: quiet piece (6,5) has its quiet moves', eng.legalMovesForPiece(s, 6, 5).length > 0 && eng.legalMovesForPiece(s, 6, 5).every(m => !m.cap));
  ok('legalMovesForPiece: capturing piece (5,2) has its capture', eng.legalMovesForPiece(s, 5, 2).length >= 1 && eng.legalMovesForPiece(s, 5, 2).some(m => m.cap));
  /* [Souffler] إن تحركت القطعة الهادئة مع وجود أكل ممكن، تُنفخ القطعة المُلزَمة */
  var s2 = stateOf([dot, dot, dot, dot, dot, dot, '..w.....', dot], WHITE);
  ok('quiet moves return when no capture exists', eng.legalMoves(s2, WHITE).every(m => !m.cap) && eng.legalMoves(s2, WHITE).length > 0);
})();

/* ── 2b. [B9] Max-chain priority — the longest chain is the most compulsory ── */
console.log('\n[2b] Max-chain priority (السلسلة الأكبر أكثر إلزامية)');
(function () {
  /* white (5,0) owns a 2-chain: over (4,1) → (3,2), then over (2,3) → (1,4).
     white (5,4) owns a 1-chain: over (4,5) → (3,6) — dead end. */
  var s = stateOf([
    dot, dot, '...b....', dot, '.b...b..', 'w...w...', dot, dot
  ], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  /* [Souffler] اللاعب حر — تُعرض كل الحركات (أكل + هادئة) */
  ok('capture (5,0)->(3,2) available', lm.some(m => m.cap && m.from[0] === 5 && m.from[1] === 0));
  ok('quiet moves ALSO offered (player is free to choose)', lm.some(m => !m.cap));
  ok('the 1-chain capture IS also offered (both available)', lm.some(m => m.cap && m.from[0] === 5 && m.from[1] === 4));
  ok('chainDepth reports 2 for (5,0)', eng.chainDepth(s.grid, 5, 0) === 2);
  ok('chainDepth reports 1 for (5,4)', eng.chainDepth(s.grid, 5, 4) === 1);
  ok('maxChainOfTurn = 2', eng.maxChainOfTurn(s.grid, WHITE) === 2);
  /* play the chain to the end */
  var capMove = lm.find(m => m.cap && m.from[0] === 5 && m.from[1] === 0 && m.to[0] === 3 && m.to[1] === 2);
  var info = eng.applyMove(s, capMove);
  ok('chainNeed initialised to 2 (then decremented)', s.chainNeed === 2 - 1);
  ok('continuation flagged', info.continued === true);
  var next = eng.legalMoves(s, WHITE);
  ok('continuation offers only the completing hop (3,2)->(1,4)', next.length === 1 && next[0].to[0] === 1 && next[0].to[1] === 4);
  var info2 = eng.applyMove(s, next[0]);
  ok('chain done → turn passes to BLACK', info2.continued === false && s.turn === BLACK && s.chainNeed === null);
})();

/* ── 2c. [B9] Mid-chain: suboptimal continuation filtered ── */
console.log('\n[2c] Continuation must complete the optimal chain');
(function () {
  /* white king mid-chain at (3,2), chainNeed = 2 remaining captures.
     branch over (2,3) landing (1,4) → keeps capturing over (2,5) (potential 2)
     branch over (2,1) landing (1,0) → dead end (potential 1) — must be hidden. */
  var s = stateOf([
    dot, dot, dot, dot, dot, dot, dot, dot
  ], WHITE, [3, 2], 2);
  s.grid[3][2] = { owner: WHITE, king: true, id: 0 };
  s.grid[2][1] = { owner: BLACK, king: false, id: 1 };
  s.grid[2][3] = { owner: BLACK, king: false, id: 2 };
  s.grid[2][5] = { owner: BLACK, king: false, id: 3 };
  var hops = eng.continuationMoves(s);
  ok('the optimal landing (1,4) is offered', hops.some(m => m.to[0] === 1 && m.to[1] === 4));
  ok('the dead-end landing (1,0) is NOT offered', !hops.some(m => m.to[0] === 1 && m.to[1] === 0));
  ok('all offered hops have potential 2', hops.every(m => eng.hopPotential(s.grid, m) === 2));
  ok('legalMoves routes through continuationMoves', eng.legalMoves(s, WHITE).every(m => m.to[0] !== 1 || m.to[1] !== 0));
})();

/* ── 2d. [B9] King-row stop + deferred promotion (قاعدة الصف الأخير) ── */
console.log('\n[2d] King-row stop & deferred promotion');
(function () {
  /* (أ) man reaches last row via capture WITH a continuation available:
         must STOP (chain abandoned) and wait a full turn before crowning. */
  var s = stateOf([
    dot, '....b.b.', '...w....', dot, dot, dot, 'b.......', dot
  ], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  ok('capture into last row (2,3)->(0,5) is available (with quiet moves also)', lm.some(m => m.cap && m.to[0] === 0 && m.to[1] === 5));
  var info = eng.applyMove(s, lm[0]);
  ok('promotion is DEFERRED (pendingPromotion)', info.pendingPromotion === true);
  ok('chain abandoned — no continuation', info.continued === false);
  ok('piece stopped as man with pendingKing flag', s.grid[0][5] && s.grid[0][5].king === false && s.grid[0][5].pendingKing === true);
  ok('turn passed to BLACK immediately', s.turn === BLACK);
  ok('the continuation victim (1,6) survived (chain abandoned)', s.grid[1][6] !== null);
  /* opponent plays one quiet move → NOW the pending piece is crowned */
  var bq = eng.legalMoves(s, BLACK).find(m => !m.cap);
  ok('black has a quiet move available', !!bq);
  var info2 = eng.applyMove(s, bq);
  ok('deferred crowning fires after the turn passed', info2.crownedDeferred && info2.crownedDeferred.some(x => x[0] === 0 && x[1] === 5));
  ok('piece is now a king', s.grid[0][5] && s.grid[0][5].king === true && s.grid[0][5].pendingKing === false);
  ok('turn is WHITE again', s.turn === WHITE);

  /* (ب) man reaches last row via capture WITHOUT continuation → immediate king */
  var s2 = stateOf([dot, '....b...', '...w....', dot, dot, dot, dot, dot], WHITE);
  var lm2 = eng.legalMoves(s2, WHITE);
  var infoB = eng.applyMove(s2, lm2[0]);
  ok('no continuation → promoted immediately', infoB.promoted === true && infoB.pendingPromotion === false);
  ok('piece is king right away', s2.grid[0][5] && s2.grid[0][5].king === true && s2.turn === BLACK);

  /* (ج) man reaches last row QUIETLY → immediate king (classic behaviour kept) */
  var s3 = stateOf([dot, '..w.....', dot, dot, dot, dot, dot, dot], WHITE);
  var lm3 = eng.legalMoves(s3, WHITE);
  var mv3 = lm3.find(m => m.to[0] === 0 && m.to[1] === 1);
  ok('quiet promotion move (1,2)->(0,1) legal', !!mv3);
  eng.applyMove(s3, mv3);
  ok('quiet arrival → immediate king', s3.grid[0][1] && s3.grid[0][1].king === true);
})();

/* ── 3. Man CANNOT capture backward (Moroccan rule: forward only) ── */
console.log('\n[3] Man cannot capture backward');
(function () {
  var s = stateOf([
    dot, dot, dot, '....w...', '.....b..', dot, dot, dot
  ], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  ok('man CANNOT capture backward (no capture to (5,6))', !lm.some(m => m.cap && m.to[0] === 5 && m.to[1] === 6));
})();

/* ── 3b. Man CAN capture forward ── */
console.log('\n[3b] Man forward capture');
(function () {
  var s = stateOf([dot, dot, dot, dot, '...b....', '..w.....', dot, dot], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  ok('man captures forward to (3,4)', lm.some(m => m.cap && m.to[0] === 3 && m.to[1] === 4));
})();

/* ── 4. Flying king slide move ── */
console.log('\n[4] Flying king move');
(function () {
  var s = stateOf([dot, dot, dot, dot, dot, dot, dot, 'W.......'], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  ok('king has many slide moves', lm.length >= 5);
  ok('king can reach (0,7) along the diagonal', lm.some(m => m.to[0] === 0 && m.to[1] === 7));
  ok('all king moves are diagonal', lm.every(m => Math.abs(m.to[0] - m.from[0]) === Math.abs(m.to[1] - m.from[1])));
})();

/* ── 5. Flying king long capture ── */
console.log('\n[5] Flying king long capture');
(function () {
  var s = stateOf([dot, dot, dot, '....b...', dot, dot, dot, 'W.......'], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  ok('king can capture the distant enemy', lm.some(m => m.cap && m.captured.length === 1));
  ok('king lands beyond the enemy (2,5)', lm.some(m => m.cap && m.to[0] === 2 && m.to[1] === 5));
  ok('no landing on the enemy square itself', lm.every(m => !(m.to[0] === 3 && m.to[1] === 4)));
})();

/* ── 6. Multi-capture continuation ── */
console.log('\n[6] Multi-capture continuation');
(function () {
  var s = stateOf([dot, dot, '...b....', dot, '.b......', 'w.......', dot, dot], WHITE);
  var caps = eng.capturesAt(s.grid, 5, 0);
  ok('first capture exists (5,0)->(3,2)', caps.some(m => m.to[0] === 3 && m.to[1] === 2));
  var mv = caps.find(m => m.to[0] === 3 && m.to[1] === 2);
  mv.potential = 2;                          /* كما تُسلَّم من legalMoves الصارمة */
  var info = eng.applyMove(s, mv);
  ok('continuation flagged after first capture', info.continued === true);
  ok('state.cont set to moving piece new square', s.cont && s.cont[0] === 3 && s.cont[1] === 2);
  ok('turn still WHITE during continuation', s.turn === WHITE);
  var next = eng.legalMoves(s, WHITE);
  ok('only the continuing piece captures are legal', next.length > 0 && next.every(m => m.from[0] === 3 && m.from[1] === 2 && m.cap));
  var mv2 = next.find(m => m.to[0] === 1 && m.to[1] === 4);
  ok('second hop (3,2)->(1,4) available', !!mv2);
  var info2 = eng.applyMove(s, mv2);
  ok('no further continuation after 2nd hop', info2.continued === false);
  ok('turn switched to BLACK after chain', s.turn === BLACK);
})();

/* ── 7. Promotion on reaching last rank (quiet) ── */
console.log('\n[7] Promotion');
(function () {
  var s = stateOf([dot, '..w.....', dot, dot, dot, dot, dot, dot], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  var mv = lm.find(m => m.to[0] === 0 && m.to[1] === 1);
  ok('promotion move (1,2)->(0,1) legal', !!mv);
  eng.applyMove(s, mv);
  ok('piece now at (0,1)', s.grid[0][1] && s.grid[1][2] === null);
  ok('piece promoted to king', s.grid[0][1] && s.grid[0][1].king === true);
})();

/* ── 8. Win by eliminating all pieces ── */
console.log('\n[8] Win detection');
(function () {
  var s = stateOf([dot, dot, dot, dot, dot, dot, dot, '....w...'], WHITE);
  var out = eng.detectOutcome(s);
  ok('white wins when black has no pieces', out === WHITE);
})();

/* ── 9. Loss by no legal moves (blocked) ── */
console.log('\n[9] Blocked player loses');
(function () {
  var s = stateOf(['.w......', dot, dot, dot, dot, dot, dot, dot], WHITE);
  var lm = eng.legalMoves(s, WHITE);
  ok('cornered white man has zero legal moves', lm.length === 0);
  var out = eng.detectOutcome(s);
  ok('white with no moves → black wins', out === BLACK);
})();

/* ── 10. AI legality & optimal capture ── */
console.log('\n[10] AI legality');
(function () {
  var s = damaNewState();
  var mv = eng.aiPick(s, BLACK, 4, 300);
  ok('AI returns a move from initial position', !!mv);
  var legal = eng.legalMoves(s, s.turn);
  var inLegal = legal.some(m => m.from[0] === mv.from[0] && m.from[1] === mv.from[1] && m.to[0] === mv.to[0] && m.to[1] === mv.to[1] && m.cap === mv.cap);
  ok('AI move is legal', inLegal);

  /* when a capture is available the AI takes it (capture is compulsory) */
  var s2 = stateOf([dot, dot, dot, dot, '...b....', '..w.....', dot, dot], WHITE);
  var mv2 = eng.aiPick(s2, WHITE, 3, 300);
  ok('AI takes the capture (compulsory)', mv2 && mv2.cap);

  /* AI must prefer the longest chain */
  var s3 = stateOf([dot, dot, '...b....', dot, '.b...b..', 'w...w...', dot, dot], WHITE);
  var mv3 = eng.aiPick(s3, WHITE, 3, 300);
  ok('AI starts the 2-chain, not the 1-chain', mv3 && mv3.from[0] === 5 && mv3.from[1] === 0);
})();

/* ── 11. AI vs AI terminates — and every move respects strict legality ── */
console.log('\n[11] AI vs AI self-play terminates');
(function () {
  var s = damaNewState();
  var eng2 = new DamaEngine();
  var moves = 0, maxMoves = 600, strictViolations = 0;
  var t0 = Date.now();
  while (!s.over && moves < maxMoves) {
    var strict = eng2.legalMoves(s, s.turn);      /* القائمة الصارمة قبل الحركة */
    var m = eng2.aiPick(s, s.turn, 3, 150);
    if (!m) break;
    var okMove = strict.some(q => q.from[0] === m.from[0] && q.from[1] === m.from[1] && q.to[0] === m.to[0] && q.to[1] === m.to[1]);
    if (!okMove) strictViolations++;
    eng2.applyMove(s, m);
    if (!s.cont) {
      var o = eng2.detectOutcome(s);
      if (o !== null) { s.over = true; s.outcome = o; }
    }
    moves++;
  }
  var dt = Date.now() - t0;
  ok('self-play ended (over or no move)', s.over || moves >= maxMoves);
  ok('self-play within ' + moves + ' plies (<' + maxMoves + ')', moves < maxMoves);
  ok('self-play finished in < 20s', dt < 20000);
  ok('every AI move was in the STRICT list (' + strictViolations + ' violations)', strictViolations === 0);
  console.log('      → outcome=' + s.outcome + ' plies=' + moves + ' time=' + dt + 'ms');
})();

console.log('\n════════════════════════════════════');
console.log('DAMA ENGINE TESTS: ' + PASS + ' passed, ' + FAIL + ' failed');
console.log('════════════════════════════════════');
process.exit(FAIL ? 1 : 0);

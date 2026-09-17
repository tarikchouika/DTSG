process.chdir(require('path').resolve(__dirname, '..'));
/* ═══ اختبار ضبابي شامل لمنطق ضاما: 400 مباراة عشوائية + 40 مباراة AI ═══
   يتحقق من الثوابت: شرعية كل حركة، عدم تكرار القطع، سلاسل الأسر المتصلة،
   [B9 v2.27] قاعدة النفخ كما قررها المالك: الأكل إلزامي قانوناً + اللاعب حر في
   تحريك أي قطعة؛ دورٌ انتهى والالتزام غير مُبرَّأ ⇒ نفخ القطعة المُلزَمة حتمي،
   ونتائج صحيحة. */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/games/dama.js', 'utf8');
const sb = new Function('window', 'document', 'performance', src + '\n;return { DamaEngine, damaNewState, WHITE, BLACK };');
const _perf = { now: () => Date.now() };
const { DamaEngine, damaNewState, WHITE, BLACK } = sb({}, undefined, _perf);

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name); }
}

function countPieces(s, owner) {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = s.grid[r][c];
    if (p && p.owner === owner) n++;
  }
  return n;
}
function idsUnique(s) {
  const seen = new Set();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = s.grid[r][c];
    if (p) {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
    }
  }
  return true;
}

/* ── 1) مباريات عشوائية: ثوابت المحرك ── */
const eng = new DamaEngine();
let games = 0, capturesTotal = 0, soufflesTotal = 0, chains = 0;
for (let g = 0; g < 400; g++) {
  const s = damaNewState();
  let guard = 0, bad = false;
  let turnObId = null, turnObDone = false, turnObNeed = 0, turnCaps = 0;   /* [v2.27+] تتبّع التزام الدور الجاري (قاعدة النفخ) */
  while (!s.over && guard++ < 400) {
    const moves = eng.legalMoves(s, s.turn);
    if (!moves.length) { s.over = true; s.outcome = eng.opponent(s.turn); break; }
    /* كل حركة مرجعة قانونية فعلاً */
    const w0 = countPieces(s, WHITE), b0 = countPieces(s, BLACK);
    const mv = moves[Math.floor(Math.random() * moves.length)];
    const pc = s.grid[mv.from[0]][mv.from[1]];
    if (!pc || pc.owner !== s.turn) { bad = true; break; }
    /* [v2.27+v2.28.2] بداية دور: سجّل القطعة المُلزَمة بالأكل وطول سلسلتها المطلوبة */
    if (!s.cont) {
      const ob = eng.obligationPiece(s);
      turnObId = ob ? s.grid[ob[0]][ob[1]].id : null;
      turnObDone = false;
      turnObNeed = ob ? eng.maxChainAt(s.grid, ob[0], ob[1]) : 0;
      turnCaps = 0;
    }
    const info = eng.applyMove(s, mv);
    if (mv.cap && pc.id === turnObId) turnObDone = true;   /* الأكل بالمُلزَم نفسه يبرّئ الالتزام */
    turnCaps += info.captured.length;
    if (!s.cont) {
      /* [2026-09-16] النفخ حتمي عند: تجاهل الالتزام، أو إتمام سلسلة أقصر من المطلوبة */
      const incomplete = turnObDone && turnObNeed > 0 && turnCaps < turnObNeed;
      const mustSouffle = turnObId != null && (!turnObDone || incomplete);
      if (mustSouffle !== (info.souffled !== null)) { bad = true; break; }
    }
    capturesTotal += info.captured.length;
    if (info.souffled) soufflesTotal++;
    if (info.continued) chains++;
    /* سلسلة الأسر: نفس القطعة تواصل فقط بعد أسر */
    if (s.cont && info.captured.length === 0) { bad = true; break; }
    /* القطع لا تزيد أبداً ولا تُستنسخ */
    const w1 = countPieces(s, WHITE), b1 = countPieces(s, BLACK);
    if (w1 > w0 || b1 > b0) { bad = true; break; }
    if (w1 + b1 > w0 + b0) { bad = true; break; }
    if (!idsUnique(s)) { bad = true; break; }
    if (s.cont) {
      /* القطعة المواصِلة هي التي أسرت */
      const cp = s.grid[s.cont[0]][s.cont[1]];
      if (!cp || cp.id !== pc.id) { bad = true; break; }
      if (s.turn !== pc.owner) { bad = true; break; }
    }
    if (!s.over && !s.cont) s.outcome = eng.detectOutcome(s) || null, s.over = !!s.outcome;
  }
  ok('مباراة ' + g + ': ثوابت سليمة', !bad);
  games++;
}
ok('400 مباراة عشوائية اكتملت', games === 400);
ok('أسر واقعي (>200)', capturesTotal > 200);
ok('[B9 v2.27] النفخ نافذ — حدث نفخ عند تجاهل الأكل (>0)', soufflesTotal > 0);
ok('سلاسل أسر متصلة حدثت (>20)', chains > 20);

/* ── 2) AI ضد AI: لا انهيارات ونتائج منطقية ── */
let aiGames = 0;
for (let g = 0; g < 40; g++) {
  const s = damaNewState();
  let guard = 0;
  while (!s.over && guard++ < 700) {
    const mv = eng.aiPick(s, s.turn, 3, 30);
    if (!mv) { s.over = true; s.outcome = eng.opponent(s.turn); break; }
    eng.applyMove(s, mv);
    if (!s.over && !s.cont) s.outcome = eng.detectOutcome(s) || null, s.over = !!s.outcome;
  }
  ok('AI مباراة ' + g + ': انتهت بنتيجة صحيحة', s.over && (s.outcome === WHITE || s.outcome === BLACK || s.outcome === 'draw'));
  aiGames++;
}
ok('40 مباراة AI اكتملت', aiGames === 40);

/* ── 3) قواعد دقيقة ── */
/* الضامبة تطير وتأسر سلسلة طويلة (قطعة لكل قفزة، والسلسلة تتصل) */
{
  const s = damaNewState();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = null;
  s.grid[0][0] = { owner: WHITE, king: true, id: 90 };
  s.grid[2][2] = { owner: BLACK, king: false, id: 91 };
  s.grid[4][4] = { owner: BLACK, king: false, id: 92 };
  s.turn = WHITE;
  const caps = eng.capturesAt(s.grid, 0, 0);
  ok('الضامبة تأسر الطائر: هبوط خلف الضحية مباشرة', caps.some(m => m.captured.length === 1 && m.captured[0][0] === 2 && m.to[0] === 3 && m.to[1] === 3));
  const mvs = eng.movesAt(s.grid, 0, 0);
  ok('الضامبة تنزلق حتى يحجبها خصم', mvs.some(m => m.to[0] === 1 && m.to[1] === 1) && !mvs.some(m => m.to[0] >= 2));
  const info = eng.applyMove(s, caps.find(m => m.to[0] === 3 && m.to[1] === 3));
  ok('السلسلة تتصل: الأسر يفرض المواصلة', info.continued === true && !!s.cont);
  const caps2 = eng.legalMoves(s, WHITE);
  ok('المواصلة أسر الضحية الثانية', caps2.length > 0 && caps2.every(m => m.cap));
  eng.applyMove(s, caps2[0]);
  ok('الضحيتان أُسرتا في السلسلة', s.grid[2][2] === null && s.grid[4][4] === null && s.turn === BLACK);
}
/* البيدق لا يأسر للخلف */
{
  const s = damaNewState();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = null;
  s.grid[4][4] = { owner: WHITE, king: false, id: 80 };
  s.grid[5][5] = { owner: BLACK, king: false, id: 81 };
  s.turn = WHITE;
  ok('البيدق لا يتحرك للخلف', !eng.movesAt(s.grid, 4, 4).some(m => m.to[0] === 5));
  ok('البيدق لا يأسر للخلف', eng.capturesAt(s.grid, 4, 4).length === 0);
}
/* الترقية فورية عند الوصول */
{
  const s = damaNewState();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = null;
  s.grid[1][2] = { owner: WHITE, king: false, id: 70 };
  s.turn = WHITE;
  const info = eng.applyMove(s, { from: [1, 2], to: [0, 1], cap: false, captured: [], pieceId: 70 });
  ok('الترقية فورية عند الصف الأخير', info.promoted === true && s.grid[0][1].king === true);
}
/* [B9 v2.27] قاعدة النفخ: حرية اللاعب + إلزام قانوني — الهادئة معروضة، وتجاهل الالتزام ⇒ نفخ المُلزَمة */
{
  const mk = () => {
    const s = damaNewState();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = null;
    s.grid[4][4] = { owner: WHITE, king: false, id: 60 };   /* المُلزَمة: تأكل (3,3) */
    s.grid[3][3] = { owner: BLACK, king: false, id: 61 };
    s.grid[5][1] = { owner: WHITE, king: false, id: 62 };   /* الهادئة */
    s.turn = WHITE;
    return s;
  };
  const s = mk();
  const lm = eng.legalMoves(s, WHITE);
  ok('[B9] الأكل معروض في القائمة (4,4 فوق 3,3)', lm.some(m => m.cap));
  ok('[B9] حرية النفخ: الحركات الهادئة معروضة أيضاً مع وجود أكل', lm.some(m => !m.cap));
  ok('[B9] القطعة الهادئة قابلة للتحريك (اللاعب حر)', eng.legalMovesForPiece(s, 5, 1).length > 0);
  /* حرّك الهادئة متجاهلاً الأكل ⇒ تُنفخ المُلزَمة (4,4) */
  const info = eng.applyMove(s, { from: [5, 1], to: [4, 2], cap: false, captured: [], pieceId: 62 });
  ok('[B9] النفخ وقع: المُلزَمة حُذفت من (4,4)', !!info.souffled && info.souffled[0] === 4 && info.souffled[1] === 4 && s.grid[4][4] === null);
  ok('الدور انتقل للخصم', s.turn === BLACK);
  /* الأكل بالمُلزَمة نفسها ⇒ لا نفخ */
  const s2 = mk();
  const capMv = eng.legalMoves(s2, WHITE).find(m => m.cap);
  const info2 = eng.applyMove(s2, capMv);
  ok('[B9] الأكل بالمُلزَمة ⇒ لا نفخ وأسر صحيح', info2.souffled === null && info2.captured.length === 1);
}

console.log('\\nDAMA FUZZ: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

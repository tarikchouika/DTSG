/* ═══ [v2.44-RULES-MODE] اختبار فارق قانونَي الإلزام/النفخ في ضاما (بلا متصفح) ═══
   الوضعان:
     · ladder (الافتراضي — قانون المالك 2026-09-19):
          ١) الأولوية للضائم (الملك) عند تساوي طول السلسلتين · ٢) ثم صاحب السلسلة الأكبر
          ٣) الضائم المُلزَم يأكل ويُتمّ سلسلته وإلا نُفخ · ٤) بيدقان بسلسلتين متساويتين: إتمام إحداهما يُسقط الإلزام عن الأخرى
     · overall — الواجب = أطول سلسلة متاحة في الدور كله؛ إتمامها بأي قطعة يُبرّئ (ومنها الضائم).
     · piece   — الواجب على القطعة المُلزَمة نفسها دائماً بلا استثناء.
   يُشغّل: node tests/_dama_obligation_mode_test.js
   الغرض: إثبات أن المفتاح rules.obligation **يغيّر السلوك فعلاً** وأن الافتراضي لم يتغيّر. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.resolve(__dirname, '../js/games/dama.js'), 'utf8');
const _ui = src.indexOf('UI / controller');
const engineSrc = src.slice(0, src.lastIndexOf('/*', _ui));
const sandbox = { console, performance, Math, Map, Set, JSON };
vm.createContext(sandbox);
vm.runInContext(engineSrc + '\n;globalThis.__E = DamaEngine; globalThis.__W = WHITE; globalThis.__B = BLACK;', sandbox);
const Engine = sandbox.__E, WHITE = sandbox.__W, BLACK = sandbox.__B;

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

function mk(rows) {
  const g = [];
  for (let r = 0; r < 8; r++) g.push([null, null, null, null, null, null, null, null]);
  let id = 1;
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    g[r][c] = { owner: (ch === 'w' || ch === 'W') ? WHITE : BLACK, king: (ch === 'W' || ch === 'B'), id: id++ };
  }));
  return { grid: g, turn: WHITE, cont: null, half: 0, moves: 0, over: false, outcome: null,
           obligedId: null, obligedFulfilled: false, obligedNeed: 0, obligedMax: 0, turnCaptures: 0, chainNeed: null };
}
/* يلعب سلسلة القطعة (r,c) كاملةً ويعيد الحصيلة النهائية للدور */
function playChain(eng, s, r, c) {
  const st = eng.cloneState(s);
  const first = eng.capturesAt(st.grid, r, c);
  if (!first.length) return { err: 'no-capture' };
  let info = eng.applyMove(st, first[0]);          /* النفخ يُعاد في info لا على الحالة */
  let guard = 0;
  while (st.cont && guard++ < 20) {
    const cont = eng.continuationMoves(st);
    if (!cont.length) break;
    info = eng.applyMove(st, cont[0]);
  }
  return { souffled: !!info.souffled, pos: info.souffled, over: !!st.over };
}

/* لوح الاختبار: قطعتان بيضاوان لهما نفس طول السلسلة (1)، والواجب على الأولى بترتيب المسح (5,3).
   (4,4) و(4,6) خصمان — كل قطعة بيضاء تجاوز جارها إلى بيت فارغ. */
const BOARD = ['........', '........', '........', '........', '....b.b.', '...w...w', '........', '........'];

console.log('\n═══ 1) الافتراضي لم يتغيّر (توافق خلفي) ═══');
const engDefault = new Engine();
engDefault.rules.obligation === 'ladder'
  ? ok("الوضع الافتراضي 'ladder' (قانون المالك: الضائم أولاً)")
  : bad("الافتراضي غير متوقع: " + engDefault.rules.obligation);
const engLegacy = new Engine({ mandatoryCapture: true, souffler: true, multiCapture: true });   /* قواعد قديمة بلا المفتاح */
const legacy = playChain(engLegacy, mk(BOARD), 5, 7);
/* القواعد القديمة (بلا المفتاح) = ladder: الإلزام على (5,3) وهو **بيدق** ⇒ إتمام بيدق آخر مساوٍ يُبرّئ */
legacy.souffled === false || legacy.err
  ? ok('قواعد بلا المفتاح تعمل كـladder (بيدقان متساويان: إتمام أحدهما يُبرّئ)')
  : bad('قواعد بلا المفتاح نفخت بيدقاً بريئاً');

console.log('\n═══ 2) الفارق الفعلي: الإتمام بقطعة أخرى ═══');
const eA = new Engine(); eA.rules.obligation = 'overall';
const eB = new Engine(); eB.rules.obligation = 'piece';
const base = mk(BOARD);
const ob = eA.obligationPiece(base);
ob && ob[0] === 5 && ob[1] === 3 ? ok('القطعة المُلزَمة مُحدَّدة صحيحاً: [' + ob + ']') : bad('الواجب المتوقع [5,3] — جاء [' + ob + ']');
const other = (ob && ob[0] === 5 && ob[1] === 3) ? [5, 7] : [5, 3];
const ra = playChain(eA, base, other[0], other[1]);
const rb = playChain(eB, base, other[0], other[1]);
ra.souffled === false ? ok('overall: الإتمام بالقطعة الأخرى يُبرّئ صاحب الدور (لا نفخ)') : bad('overall نفخ: ' + JSON.stringify(ra));
rb.souffled === true ? ok('piece: الإتمام بالقطعة الأخرى ⇒ نفخ المُلزَمة ' + (rb.pos ? JSON.stringify(rb.pos) : '')) : bad('piece لم ينفخ: ' + JSON.stringify(rb));

console.log('\n═══ 3) الحالة المتوافقة: الإتمام بالمُلزَمة نفسها ═══');
const ca = playChain(eA, base, ob[0], ob[1]);
const cb = playChain(eB, base, ob[0], ob[1]);
(ca.souffled === false && cb.souffled === false)
  ? ok('إتمام السلسلة بالقطعة المُلزَمة لا يُنفخ في الوضعين (لا عقاب على لاعب صحيح)')
  : bad('نفخ خاطئ: overall=' + ca.souffled + ' piece=' + cb.souffled);

console.log('\n═══ 4) الوضعان يعطيان نتائج مختلفة على نفس النقلة (المفتاح غير صوري) ═══');
(ra.souffled !== rb.souffled)
  ? ok('نفس النقلة: overall=' + ra.souffled + ' ⟷ piece=' + rb.souffled + ' ⇒ المفتاح مؤثّر فعلاً')
  : bad('المفتاح بلا أثر (صوري)!');

console.log('\n═══ 5) قانون المالك: الضائم (الملك) له الأولوية عند تساوي السلسلتين ═══');
/* لوح: ملك أبيض (7,7) يأكل (5,5) · بيدق أبيض (5,1) يأكل (4,2) — السلسلتان = 1 */
const KING_BOARD = ['........', '........', '........', '........', '..b.....', '.w...b..', '........', '.......W'];
function analyse(rows) {
  const e = new Engine();
  const st = mk(rows);
  const ob = e.obligationPiece(st);
  const p = ob ? st.grid[ob[0]][ob[1]] : null;
  return { ob: ob, isKing: !!(p && p.king), chainOb: ob ? e.maxChainAt(st.grid, ob[0], ob[1]) : 0, max: e.maxChainOverall(st) };
}
const an = analyse(KING_BOARD);
(an.ob && an.isKing && an.chainOb === an.max)
  ? ok('المُلزَم هو الضائم [' + an.ob + '] رغم تساوي السلسلتين (' + an.max + ')')
  : bad('المُلزَم ' + JSON.stringify(an) + ' — المتوقع ملك بسلسلة مساوية');
function play(eng, rows, r, c) {
  const st = eng.cloneState(mk(rows));
  const caps = eng.capturesAt(st.grid, r, c);
  if (!caps.length) return { err: 'no-capture' };
  let info = eng.applyMove(st, caps[0]), g = 0;
  while (st.cont && g++ < 20) { const cont = eng.continuationMoves(st); if (!cont.length) break; info = eng.applyMove(st, cont[0]); }
  return { souffled: !!info.souffled, took: caps[0] };
}
const eOver = new Engine(); eOver.rules.obligation = 'overall';
const eLad = new Engine();  eLad.rules.obligation = 'ladder';
const ePiece = new Engine(); ePiece.rules.obligation = 'piece';
const pawnTakes_over = play(eOver, KING_BOARD, 5, 1);      /* إتمام سلسلة **البيدق** (مساوية) */
const pawnTakes_lad  = play(eLad,  KING_BOARD, 5, 1);
const pawnTakes_pc   = play(ePiece, KING_BOARD, 5, 1);
(pawnTakes_over.souffled === false && pawnTakes_lad.souffled === true)
  ? ok('البيدق أتمّ سلسلة مساوية: overall لا ينفخ · ladder **ينفخ الضائم** (لا يُبرّئه غيرُه)')
  : bad('سلوك غير مطابق: overall=' + pawnTakes_over.souffled + ' ladder=' + pawnTakes_lad.souffled);
const kingTakes_lad = play(eLad, KING_BOARD, 7, 7);        /* إتمام سلسلة **الضائم** */
const kingTakes_over = play(eOver, KING_BOARD, 7, 7);
(kingTakes_lad.souffled === false && kingTakes_over.souffled === false)
  ? ok('الضائم أتمّ سلسلته ⇒ لا نفخ (في الوضعين)')
  : bad('نفخ خاطئ عند إتمام الضائم: ladder=' + kingTakes_lad.souffled + ' overall=' + kingTakes_over.souffled);

console.log('\n═══ 6) بيدقان عاديان بسلسلتين متساويتين: إتمام إحداهما يُسقط الإلزام عن الأخرى ═══');
/* بيدقان أبيضان (5,1) و(5,5) — لكل واحد أسر واحد ⇒ سلسلتان متساويتان */
const TWO_PAWNS = ['........', '........', '........', '........', '..b.b...', '.w...w..', '........', '........'];
const an2 = analyse(TWO_PAWNS);
(an2.ob && !an2.isKing) ? ok('المُلزَم بيدق عادي [' + an2.ob + '] (بحسب ترتيب المسح)') : bad('المُلزَم ' + JSON.stringify(an2));
const otherPawn = (an2.ob && an2.ob[1] === 1) ? [5, 5] : [5, 1];
const lad2 = play(eLad, TWO_PAWNS, otherPawn[0], otherPawn[1]);
const pc2 = play(ePiece, TWO_PAWNS, otherPawn[0], otherPawn[1]);
const ov2 = play(eOver, TWO_PAWNS, otherPawn[0], otherPawn[1]);
(lad2.souffled === false)
  ? ok('ladder: إتمام سلسلة البيدق الآخر (بنفس الطول) يُبرّئ — لا نفخ')
  : bad('ladder نفخ بيدقاً بريئاً: ' + JSON.stringify(lad2));
(pc2.souffled === true)
  ? ok('piece: كان ينفخ ظلماً في هذه الحالة (يوضّح الفرق)')
  : bad('piece لم ينفخ — راجع الوضع: ' + JSON.stringify(pc2));
(ov2.souffled === false) ? ok('overall: لا نفخ أيضاً (مطابق لـladder هنا)') : bad('overall نفخ: ' + JSON.stringify(ov2));

console.log('\n═══ 7) حصانة الطرفين: قطع صحيحة لا تُنفخ في أي وضع ═══');
const cleanBoards = [
  ['........','........','........','........','..b.b...','.w...w..','........','........'],
  ['........','........','........','........','..b.....','.w...b..','........','.......W']
];
let cleanOk = true;
for (const b of cleanBoards) {
  const st = mk(b);
  const ob = eLad.obligationPiece(st);
  if (!ob) continue;
  const res = play(eLad, b, ob[0], ob[1]);          /* الواجب نفسه يؤدّيه */
  if (res.souffled !== false) cleanOk = false;
}
cleanOk ? ok('من أدّى واجبه (الضائم أو البيدق المُلزَم) لا يُنفخ — في كل الألواح') : bad('نفخ خاطئ لقطعة أدّت واجبها');

console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);

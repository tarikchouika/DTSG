/* ═══ [v2.44-RULES-MODE] اختبار فارق قانونَي الإلزام/النفخ في ضاما (بلا متصفح) ═══
   الوضعان:
     · overall (الافتراضي/المنشور) — الواجب = أطول سلسلة متاحة في الدور كله؛ إتمامها بأي قطعة يُبرّئ.
     · piece  (الأصرم)            — الواجب على القطعة المُلزَمة نفسها: لا بد أن تأكل وتُتمّ سلسلتها.
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
engDefault.rules.obligation === 'overall'
  ? ok("الوضع الافتراضي 'overall' (المنشور)")
  : bad("الافتراضي تغيّر إلى: " + engDefault.rules.obligation);
const engLegacy = new Engine({ mandatoryCapture: true, souffler: true, multiCapture: true });   /* قواعد قديمة بلا المفتاح */
const legacy = playChain(engLegacy, mk(BOARD), 5, 7);
legacy.souffled === false || legacy.err
  ? ok('قواعد بلا المفتاح تعمل كـoverall (لا نفخ عند إتمام سلسلة مساوية)')
  : bad('قواعد بلا المفتاح نفخت ظلماً');

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

console.log('\n═══ النتيجة: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);

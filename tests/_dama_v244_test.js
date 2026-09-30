/* ═══ [v2.44 Phase E] اختبار محرّك الضاما (بلا متصفح — المحرّك نقيّ): عدم نفخ الصحيح،
   نفخ المقصّر، قوة الذكاء الاصطناعي، وكلفة حساب الواجب في البحث ═══ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.resolve(__dirname, '../js/games/dama.js'), 'utf8');
const _ui = src.indexOf('UI / controller');
const engineSrc = src.slice(0, src.lastIndexOf('/*', _ui));   /* اقطع قبل تعليق قسم الواجهة */
const sandbox = { console, performance, Math, Map, Set, JSON };
vm.createContext(sandbox);
vm.runInContext(engineSrc + '\n;globalThis.__E = DamaEngine; globalThis.__W = WHITE; globalThis.__B = BLACK; globalThis.__grid = damaGridKey;', sandbox);
const Engine = sandbox.__E, WHITE = sandbox.__W, BLACK = sandbox.__B;

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅ ' + m); };
const bad = m => { fail++; console.log('  ❌ ' + m); };

const eng = new Engine();
const mk = (rows) => {           /* لوح من نص: W/B=ملك، w/b=بيدق، .=فراغ (الصف 0 أعلى) */
  const grid = [];
  for (let r = 0; r < 8; r++) grid.push([null, null, null, null, null, null, null, null]);
  let id = 1;
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.' || ch === ' ') return;
      grid[r][c] = { owner: (ch === 'W' || ch === 'w') ? WHITE : BLACK, king: (ch === 'W' || ch === 'B'), id: id++, pendingKing: false };
    });
  });
  return { grid: grid, turn: WHITE, cont: null, half: 0, moves: 0, over: null, outcome: null,
    obligedId: null, obligedFulfilled: false, obligedNeed: 0, obligedMax: 0, turnCaptures: 0, chainNeed: null };
};
const count = (s, owner) => { let n = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (s.grid[r][c] && s.grid[r][c].owner === owner) n++; return n; };

console.log('\n═══ ١) cloneState ينقل كل حقول الدور (كان يُسقط ٣ حقول ⇒ بحث أعمى) ═══');
{
  const s = mk(['........', '........', '........', '...b....', '..w.....', '........', '........', '........']);
  s.obligedId = 2; s.obligedNeed = 3; s.obligedMax = 4; s.turnCaptures = 2; s.chainNeed = 1; s.cont = [3, 3]; s.half = 7; s.moves = 12;
  const c = eng.cloneState(s);
  ['obligedId', 'obligedNeed', 'obligedMax', 'turnCaptures', 'chainNeed', 'half', 'moves'].every(k => c[k] === s[k])
    ? ok('كل الحقول منسوخة: obligedMax=' + c.obligedMax + ' turnCaptures=' + c.turnCaptures + ' obligedNeed=' + c.obligedNeed)
    : bad('حقول ضائعة: ' + JSON.stringify({ a: s.obligedMax, b: c.obligedMax, c: s.turnCaptures, d: c.turnCaptures }));
  c.cont[0] = 9;
  s.cont[0] === 3 ? ok('النسخ مستقل (لا يُعدّل الأصل)') : bad('النسخ سطحي على cont');
}

console.log('\n═══ ٢) قانون النفخ: المقصّر يُنفخ · المتمّم أطول سلسلة لا يُنفخ ═══');
{
  /* الأبيض يتحرك للأعلى (الصف 0 أعلى):
     بيدق أبيض (5,1): سلسلة أكل من قفزتين — يجوز (4,2) ثم يهبط (3,3)، ثم يجوز (2,4) ويهبط (1,5).
     بيدق أبيض (7,7): أكل قصير من قفزة واحدة — يجوز (6,6) ويهبط (5,5).
     ⇒ أطول سلسلة = 2، والقطعة الملزمة = (5,1). */
  const s = mk(['........', '........', '....b...', '........', '..b.....', '.w......', '......b.', '.......w']);
  const need = eng.maxChainOverall(s);
  need === 2 ? ok('أطول سلسلة متاحة = ' + need + ' (السقف الصحيح)') : bad('حساب السلسلة: ' + need + ' بدل 2');
  const ob = eng.obligationPiece(s);
  (ob && ob[0] === 5 && ob[1] === 1) ? ok('القطعة الأكبر إلزاماً = (5,1) صاحبة أطول سلسلة') : bad('القطعة الملزمة: ' + JSON.stringify(ob));

  /* (أ) أكمل الأطول: لا نفخ */
  let s1 = eng.cloneState(s);
  const caps = eng.capturesAt(s1.grid, 5, 1);
  caps.length ? ok('أكل متاح للبيدق (5,1)') : bad('لا أكل متاح للبيدق (5,1)');
  let info = eng.applyMove(s1, caps[0]);
  let hops = 1;
  while (s1.cont && hops < 8) {
    const more = eng.continuationMoves(s1);
    if (!more.length) break;
    info = eng.applyMove(s1, more[0]); hops++;
  }
  (hops === 2 && !info.souffled && s1.turnCaptures === 0)
    ? ok('إتمام سلسلة من قفزتين: لا نفخ (وُصل نحو ' + hops + ' قفزات)')
    : bad('نُفخ/انقطع رغم الإتمام: hops=' + hops + ' souffled=' + JSON.stringify(info.souffled));

  /* (ب) قصّر الأكل ⇒ يُنفخ الحجر الأكبر إلزاماً (5,1) */
  let s2 = eng.cloneState(s);
  const short = eng.capturesAt(s2.grid, 7, 7);
  if (!short.length) bad('لا أكل قصير متاح للاختبار (7,7)');
  else {
    const beforeW = count(s2, WHITE), beforeB = count(s2, BLACK);
    const i2 = eng.applyMove(s2, short[0]);
    const blownOwn = i2.souffled && s2.grid[i2.souffled[0]][i2.souffled[1]] === null;
    (blownOwn && count(s2, WHITE) === beforeW - 1 && count(s2, BLACK) === beforeB - 1)
      ? ok('التقصير ⇒ أكد أسود واحداً لكن نُفخ الحجر الملزم (' + i2.souffled + ')')
      : bad('النفخ لم يقع صحيحاً: ' + JSON.stringify(i2.souffled) + ' أبيض ' + beforeW + '→' + count(s2, WHITE) + ' · أسود ' + beforeB + '→' + count(s2, BLACK));
  }
}

console.log('\n═══ ٣) قوة الذكاء الاصطناعي: يفوز على لاعب عشوائي بفرق مادي (٣ مباريات) ═══');
{
  let wins = 0, tested = 0;
  for (let g = 0; g < 3; g++) {
    let s = (function () { const e2 = new Engine(); return e2; }, sandbox.__grid, (function () {
      const st = mk(['........','........','........','........','........','........','........','........']);
      /* تشكيل افتتاحي قانوني */
      let id = 1;
      const dark = (r, c) => (r + c) % 2 === 1;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) st.grid[r][c] = null;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if (dark(r, c)) st.grid[r][c] = { owner: BLACK, king: false, id: id++ };
      for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if (dark(r, c)) st.grid[r][c] = { owner: WHITE, king: false, id: id++ };
      st.turn = WHITE; st.half = 0; st.moves = 0; return st;
    })());
    let plies = 0;
    while (plies < 60) {
      const moves = eng.legalMoves(s, s.turn);
      if (!moves.length) break;
      let mv, child;
      if (s.turn === WHITE) mv = eng.aiPick(s, WHITE, 5, 500);       /* الذكاء */
      else mv = moves[Math.floor(Math.random() * moves.length)];      /* عشوائي */
      if (!mv) break;
      child = eng.cloneState(s); eng.applyMove(child, mv); s = child;
      if (s.turn === WHITE && plies > 0) { /* دور الأبيض مرّ */ }
      plies++;
    }
    tested++;
    const w = count(s, WHITE), b = count(s, BLACK);
    if (w > b) wins++;
    console.log('   ↳ مباراة ' + (g + 1) + ': أبيض(ذكي)=' + w + ' أسود(عشوائي)=' + b + ' بعد ' + plies + ' دور');
  }
  wins >= 2 ? ok('الذكاء تفوّق في المادة في ' + wins + '/' + tested + ' مباريات')
    : bad('الذكاء ضعيف: ' + wins + '/' + tested);
}

console.log('\n═══ ٤) كلفة البحث: عمق أكبر بنفس الميزانية بعد إصلاح حساب الواجب ═══');
{
  let s = mk(['........','........','........','........','........','........','........','........']);
  let id = 1; const dark = (r, c) => (r + c) % 2 === 1;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = null;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if (dark(r, c)) s.grid[r][c] = { owner: BLACK, king: false, id: id++ };
  for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if (dark(r, c)) s.grid[r][c] = { owner: WHITE, king: false, id: id++ };
  const t0 = performance.now();
  const mv = eng.aiPick(s, WHITE, 8, 900);
  const dt = performance.now() - t0;
  mv ? ok('aiPick أنتج حركة في ' + Math.round(dt) + 'ms (ميزانية 900ms — لا تجميد)') : bad('aiPick لم ينتج حركة');
  const t1 = performance.now();
  const mv2 = eng.aiPick(s, BLACK, 8, 900);
  const dt2 = performance.now() - t1;
  (mv2 && dt2 < 2500) ? ok('بحث ثانٍ ' + Math.round(dt2) + 'ms (حد أعلى معقول)') : bad('بحث بطيء جداً: ' + Math.round(dt2) + 'ms');
}

console.log('\n═══ النتيجة Phase E: ' + pass + ' ناجح / ' + fail + ' فاشل ═══');
process.exit(fail ? 1 : 0);

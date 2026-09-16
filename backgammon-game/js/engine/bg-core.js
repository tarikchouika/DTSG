/**
 * ============================================================================
 *  BG CORE — المحرك الأساسي للعبة الطاولة (Backgammon القياسية)
 * ============================================================================
 *  محرك حتمي مستقل تمامًا عن الواجهة والشبكة:
 *  المتصفح (window.BgCore) + Node.js (module.exports) + خادم أونلاين.
 *
 *  القواعد (مدققة: backgammonhit.com · backgammon.com · deluxebackgammon):
 *    • التوزيع القياسي 15 حجرًا (2@24 · 5@13 · 3@8 · 5@6 بمنظور اللاعب).
 *    • الافتتاح بنردَين منفصلين — الأعلى يبدأ بالرقمين، والتعادل يُعاد.
 *    • كل نرد حركة مستقلة — الدبل 4 حركات.
 *    • لا هبوط على نقطة فيها حجاران خصم أو أكثر — المفرد يُضرب للحاجز.
 *    • الحاجز: إدخال إجباري (نقطة 24−نرد / نرد−1).
 *    • الإخراج: 15 حجرًا في البيت — بالرقم المطابق، أو أكبر بلا أحجار أبعد،
 *      ولا إلزام بالإخراج إن أمكن التحريك داخل البيت.
 *    • قاعدة النرد الإجبارية: أقصى استخدام واجب — وإن لم يتاح إلا نرد
 *      واحدة فالأكبر إلزامية.
 *    • الحسم: فوز 1 · مارس 2 · باك جامون 3 — مباراة نقاط بلا مكعب مضاعفة.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BgCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ══════════════ عشوائية حتمية ══════════════ */

  function SeededRng(seed) {
    let s = (seed >>> 0) || 0x1f123bb5;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ══════════════ المجال ══════════════ */

  /** points[i]: +n أحجار اللاعب 0، −n أحجار اللاعب 1
      اللاعب 0: 23→0 بيته 0..5 · اللاعب 1: 0→23 بيته 18..23 */
  function initialPoints() {
    const pts = new Array(24).fill(0);
    pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;      /* اللاعب 0 */
    pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5; /* اللاعب 1 */
    return pts;
  }

  function newState(matchTarget) {
    return {
      points: initialPoints(),
      bar: [0, 0],
      off: [0, 0],
      turn: -1,
      dice: [],
      rolled: false,
      opening: true,
      phase: 'opening',      /* opening | roll | move | gameEnd | matchEnd */
      matchScore: [0, 0],
      matchTarget: matchTarget || 5,
      gameType: null,        /* single | gammon | backgammon */
      lastRoll: null,
      winner: null
    };
  }

  function cloneState(st) {
    return {
      points: st.points.slice(), bar: st.bar.slice(), off: st.off.slice(),
      turn: st.turn, dice: st.dice.slice(), rolled: st.rolled,
      opening: st.opening, phase: st.phase,
      matchScore: st.matchScore.slice(), matchTarget: st.matchTarget,
      gameType: st.gameType, lastRoll: st.lastRoll ? st.lastRoll.slice() : null,
      winner: st.winner
    };
  }

  const direction = (p) => (p === 0 ? -1 : 1);
  const homeMin = (p) => (p === 0 ? 0 : 18);
  const homeMax = (p) => (p === 0 ? 5 : 23);
  const dist = (p, i) => (p === 0 ? i + 1 : 24 - i);
  const entryPoint = (p, die) => (p === 0 ? 24 - die : die - 1);

  function ownCount(st, p, i) {
    const c = st.points[i];
    return p === 0 ? Math.max(0, c) : Math.max(0, -c);
  }

  function pipCount(st, p) {
    let tot = st.bar[p] * 25;
    for (let i = 0; i < 24; i++) {
      const c = st.points[i];
      if (p === 0 && c > 0) tot += c * (i + 1);
      if (p === 1 && c < 0) tot += (-c) * (24 - i);
    }
    return tot;
  }

  function allHome(st, p) {
    if (st.bar[p] > 0) return false;
    if (p === 0) { for (let i = 6; i < 24; i++) if (st.points[i] > 0) return false; }
    else { for (let j = 0; j < 18; j++) if (st.points[j] < 0) return false; }
    return true;
  }

  function hasContact(st) {
    let last0 = -1, first1 = 24;
    for (let i = 0; i < 24; i++) if (st.points[i] > 0) last0 = i;
    for (let j = 0; j < 24; j++) if (st.points[j] < 0) { first1 = j; break; }
    return last0 > first1;
  }

  /* ══════════════ الرمي ══════════════ */

  /** رمي عادي — [a,b] أو دبل [d,d,d,d] */
  function roll(st, p, rng, forced) {
    const r = rng || Math.random;
    const a = forced ? forced[0] : 1 + Math.floor(r() * 6);
    const b = forced ? forced[1] : 1 + Math.floor(r() * 6);
    st.lastRoll = [a, b];
    st.dice = (a === b) ? [a, a, a, a] : [a, b];
    st.turn = p;
    st.rolled = true;
    st.opening = false;
    st.phase = legalMoves(st, p).length ? 'move' : 'roll';
    return st.lastRoll;
  }

  /** رمي الافتتاح: نرد لكل لاعب — الأعلى يبدأ بالرقمين، التعادل يعاد */
  function rollOpening(st, rng, forced) {
    const r = rng || Math.random;
    let a, b, guard = 0;
    do {
      a = forced ? forced[0] : 1 + Math.floor(r() * 6);
      b = forced ? forced[1] : 1 + Math.floor(r() * 6);
    } while (a === b && ++guard < 100);
    st.lastRoll = [a, b];
    st.dice = [a, b];
    st.turn = a > b ? 0 : 1;
    st.rolled = true;
    st.opening = false;
    st.phase = legalMoves(st, st.turn).length ? 'move' : 'roll';
    return { starter: st.turn, dice: [a, b] };
  }

  /* ══════════════ الحركة ══════════════ */

  /** حركات أساسية (متجاهلة قاعدة أقصى الاستخدام) */
  function baseMoves(st, p) {
    const out = [];
    if (st.bar[p] > 0) {
      const done = {};
      for (let d = 0; d < st.dice.length; d++) {
        const die = st.dice[d];
        if (done[die]) continue; done[die] = 1;
        const to = entryPoint(p, die);
        if (ownCount(st, 1 - p, to) <= 1) out.push({ from: -1, to: to, die: die, hit: ownCount(st, 1 - p, to) === 1 });
      }
      return out;
    }
    const dSeen = {};
    for (let f = 0; f < 24; f++) {
      if (ownCount(st, p, f) <= 0) continue;
      for (let k = 0; k < st.dice.length; k++) {
        const die = st.dice[k];
        const key = f + '>' + die;
        if (dSeen[key]) continue; dSeen[key] = 1;
        if (allHome(st, p)) {
          const dd = dist(p, f);
          if (die === dd) { out.push({ from: f, to: -1, die: die, hit: false }); continue; }
          if (die > dd) {
            let farther = false;
            for (let q = 0; q < 24; q++) if (ownCount(st, p, q) > 0 && dist(p, q) > dd) { farther = true; break; }
            if (!farther) { out.push({ from: f, to: -1, die: die, hit: false }); continue; }
          }
        }
        const to = f + direction(p) * die;
        if (to < 0 || to > 23) continue;
        if (ownCount(st, 1 - p, to) <= 1) out.push({ from: f, to: to, die: die, hit: ownCount(st, 1 - p, to) === 1 });
      }
    }
    return out;
  }

  function applyMove(st, p, mv) {
    if (mv.from === -1) st.bar[p]--;
    else st.points[mv.from] += (p === 0 ? -1 : 1);
    if (mv.to === -1) st.off[p]++;
    else {
      if (ownCount(st, 1 - p, mv.to) === 1) { st.points[mv.to] = 0; st.bar[1 - p]++; }
      st.points[mv.to] += (p === 0 ? 1 : -1);
    }
    const di = st.dice.indexOf(mv.die);
    if (di >= 0) st.dice.splice(di, 1);
    return st;
  }

  /** أقصى عدد نردات قابل للاستخدام (DFS + تخزين مؤقت) */
  function maxUsable(st, p) {
    const memo = {};
    function key(s) { return s.points.join(',') + '|' + s.bar.join(',') + '|' + s.dice.slice().sort().join(','); }
    function dfs(s) {
      if (!s.dice.length) return 0;
      const k = key(s);
      if (memo[k] !== undefined) return memo[k];
      const moves = baseMoves(s, p);
      let best = 0;
      for (let i = 0; i < moves.length; i++) {
        const ns = cloneState(s);
        applyMove(ns, p, moves[i]);
        const v = 1 + dfs(ns);
        if (v > best) best = v;
        if (best === s.dice.length) break;
      }
      memo[k] = best;
      return best;
    }
    return dfs(st);
  }

  /** الحركات القانونية — أقصى استخدام واجب + الأكبر إلزامية عند نردٍ واحدة */
  function legalMoves(st, p) {
    const base = baseMoves(st, p);
    if (!base.length) return [];
    const total = maxUsable(st, p);
    if (!total) return [];
    const legal = [];
    for (let i = 0; i < base.length; i++) {
      const ns = cloneState(st);
      applyMove(ns, p, base[i]);
      if (maxUsable(ns, p) + 1 === total) legal.push(base[i]);
    }
    if (total === 1 && st.dice.length > 1) {
      let hi = -1;
      for (const d of st.dice) if (d > hi) hi = d;
      const hiMoves = legal.filter((m) => m.die === hi);
      if (hiMoves.length) return hiMoves;
    }
    return legal;
  }

  /** تعداد كل التتابعات الكاملة — بلا تكرار مواضع (للذكاء الاصطناعي) */
  function enumeratePlays(st, p, caps) {
    const cap = caps || { seq: 2500, nodes: 45000 };
    const results = [], seen = {};
    let nodes = 0;
    function rec(s, seq) {
      if (nodes++ > cap.nodes) return;
      const moves = legalMoves(s, p);
      if (!moves.length || !s.dice.length) {
        if (seq.length) {
          const h = s.points.join(',') + '|' + s.bar.join(',') + '|' + s.off.join(',');
          if (!seen[h]) { seen[h] = 1; results.push({ state: s, moves: seq.slice() }); }
        }
        return;
      }
      for (let i = 0; i < moves.length; i++) {
        if (results.length >= cap.seq) return;
        const ns = cloneState(s);
        applyMove(ns, p, moves[i]);
        seq.push(moves[i]);
        rec(ns, seq);
        seq.pop();
      }
    }
    rec(cloneState(st), []);
    return results;
  }

  /* ══════════════ نهاية اللعبة ══════════════ */

  /** يرجع {winner, type, points} أو null — ويحدّث الحالة والنقاط */
  function checkGameEnd(st) {
    for (let p = 0; p < 2; p++) {
      if (st.off[p] >= 15) {
        const loser = 1 - p;
        let type = 'single';
        if (st.off[loser] === 0) {
          type = 'gammon';
          for (let i = homeMin(p); i <= homeMax(p); i++) {
            if (ownCount(st, loser, i) > 0) { type = 'backgammon'; break; }
          }
          if (st.bar[loser] > 0) type = 'backgammon';
        }
        const pts = type === 'single' ? 1 : (type === 'gammon' ? 2 : 3);
        st.matchScore[p] += pts;
        st.gameType = type;
        st.winner = p;
        st.phase = (st.matchScore[p] >= st.matchTarget) ? 'matchEnd' : 'gameEnd';
        return { winner: p, type: type, points: pts };
      }
    }
    return null;
  }

  return Object.freeze({
    SeededRng: SeededRng,
    initialPoints: initialPoints,
    newState: newState,
    cloneState: cloneState,
    direction: direction,
    homeMin: homeMin, homeMax: homeMax,
    dist: dist, entryPoint: entryPoint,
    ownCount: ownCount,
    pipCount: pipCount,
    allHome: allHome,
    hasContact: hasContact,
    roll: roll,
    rollOpening: rollOpening,
    baseMoves: baseMoves,
    applyMove: applyMove,
    maxUsable: maxUsable,
    legalMoves: legalMoves,
    enumeratePlays: enumeratePlays,
    checkGameEnd: checkGameEnd
  });
});

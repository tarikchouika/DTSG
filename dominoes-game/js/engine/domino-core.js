/**
 * ============================================================================
 *  DOMINO CORE — المحرك الأساسي للعبة الضومنة (Draw Dominoes · Double-Six)
 * ============================================================================
 *  محرك حتمي مستقل تمامًا عن الواجهة والشبكة، قابل للتشغيل في:
 *  المتصفح (window.DominoCore) + Node.js (module.exports) + خادم أونلاين.
 *
 *  المعمارية:
 *    1) Random  : seeded rng (mulberry32) + خلط Fisher–Yates
 *    2) Domain  : Tile {a,b,id} (a≤b) · State · RoundResult
 *    3) Setup   : createSet (28 قطعة) · deal · chooseStarter
 *    4) Rules   : legalEnds · legalMoves · hasAnyMove · play · draw · pass
 *    5) Scoring : handEmpty / blocked (الأقل بالفرق، تعادل بلا نقاط)
 *
 *  القواعد مدققة ضد: pagat.com (Block/Draw) · therulebook.com · jaqueslondon.
 *  لا يعرف هذا الملف شيئًا عن DOM أو الشبكة.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DominoCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ══════════════ 1) عشوائية حتمية ══════════════ */

  /** mulberry32 — بذرة 32 بت */
  function SeededRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ══════════════ 2) المجال ══════════════ */

  /** مجموعة Double-Six: 28 قطعة فريدة [a|b] مع a≤b */
  function createSet() {
    const tiles = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push(freezeTile(a, b));
    return tiles;
  }

  function freezeTile(a, b) {
    return Object.freeze({ a: Math.min(a, b), b: Math.max(a, b), id: Math.min(a, b) + '-' + Math.max(a, b) });
  }

  const DEFAULT_CONFIG = Object.freeze({
    target: 100,             /* نقاط الفوز بالمباراة */
    playersCount: 2,         /* عدد اللاعبين: 2 أو 3 أو 4 */
    handSize: null,          /* قطع اليد (تلقائي حسب عدد اللاعبين: 7 في 2 و 3، و 5/7 في 4) */
    drawUntilPlayable: true, /* سحب حتى صلاح قطعة */
    mustPlayDrawn: true,     /* القطعة المسحوبة الصالحة إلزامية */
    starterMustPlayDouble: true /* إلزام لعب الدبل الافتتاحي */
  });

  function normalizeConfig(cfg) {
    return Object.assign({}, DEFAULT_CONFIG, cfg || {});
  }

  function pipsOf(hand) {
    let s = 0;
    for (let i = 0; i < hand.length; i++) s += hand[i].a + hand[i].b;
    return s;
  }

  /* ══════════════ 3) الإعداد ══════════════ */

  /** البادئ: أعلى دبل (يلعبه إلزاميًا) وإلا صاحب أثقل قطعة (حر الاختيار) */
  function chooseStarter(hands) {
    let bestD = null, p = 0;
    for (let i = 0; i < hands.length; i++) {
      const h = hands[i];
      for (let k = 0; k < h.length; k++) {
        const t = h[k];
        if (t.a === t.b && (bestD === null || t.a > bestD.a)) { bestD = t; p = i; }
      }
    }
    if (bestD) return { player: p, forcedTile: bestD };
    let top = -1, bestT = null;
    for (let i = 0; i < hands.length; i++) {
      const h = hands[i];
      for (let k = 0; k < h.length; k++) {
        const t = h[k], v = t.a + t.b;
        if (v > top || (v === top && Math.max(t.a, t.b) > (bestT ? Math.max(bestT.a, bestT.b) : -1))) {
          top = v; bestT = t; p = i;
        }
      }
    }
    return { player: p, forcedTile: null };
  }

  /** حالة جولة جديدة — خلط كامل كل جولة (تدعم لاعبين و3 و4 لاعبين حسب القواعد الرسمية) */
  function newRound(prev, rng, starterPlayer) {
    const cfg = prev ? prev.cfg : DEFAULT_CONFIG;
    const numPlayers = Math.max(2, Math.min(4, parseInt(cfg.playersCount, 10) || 2));
    /* قواعد التوزيع: 7 قطع لـ 2 و 3 لاعبين؛ لـ 4 لاعبين: 7 قطع (كل الـ28 قطعة / بدون بنك كلاسيكي)
       أو 5 قطع إن كانت قاعدة السحب مفعلة */
    let hSize = cfg.handSize;
    if (!hSize || hSize < 1) {
      hSize = (numPlayers === 4 && cfg.drawUntilPlayable) ? 5 : 7;
    }
    const deck = shuffle(createSet(), rng);
    const hands = [];
    for (let p = 0; p < numPlayers; p++) {
      hands.push([]);
      for (let i = 0; i < hSize; i++) {
        if (deck.length) hands[p].push(deck.pop());
      }
    }
    const ch = chooseStarter(hands);
    const starter = (typeof starterPlayer === 'number' && starterPlayer >= 0 && starterPlayer < numPlayers)
      ? starterPlayer
      : ch.player;
    const scores = (prev && prev.scores && prev.scores.length === numPlayers)
      ? prev.scores.slice()
      : new Array(numPlayers).fill(0);

    return {
      cfg: cfg,
      round: prev ? prev.round + 1 : 1,
      scores: scores,
      hands: hands,
      boneyard: deck.slice(),            /* الباقي في البنك (14 في لاعبين · 7 في 3 · 0/8 في 4) */
      chain: [],                          /* [{tile, dbl}] بالترتيب */
      leftEnd: null, rightEnd: null,
      turn: starter,
      starter: starter,
      passes: 0,
      forcedTile: (ch.player === starter && ch.forcedTile && cfg.starterMustPlayDouble) ? ch.forcedTile : null,
      lastDrawn: null,
      justPlayed: null,                   /* {player, end, tile} */
      phase: 'play',                      /* play | roundEnd | matchEnd */
      result: null,
      matchWinner: null
    };
  }

  /* ══════════════ 4) القواعد ══════════════ */

  function legalEnds(state, tile) {
    if (!state.chain.length) return ['L', 'R'];
    const ends = [];
    if (tile.a === state.leftEnd || tile.b === state.leftEnd) ends.push('L');
    if (tile.a === state.rightEnd || tile.b === state.rightEnd) ends.push('R');
    return ends;
  }

  function tileInHand(state, p, tileId) {
    const h = state.hands[p];
    for (let i = 0; i < h.length; i++) if (h[i].id === tileId) return h[i];
    return null;
  }

  function legalMoves(state, p) {
    if (!state || state.phase !== 'play' || state.turn !== p) return [];
    const out = [];
    const h = state.hands[p];
    for (let i = 0; i < h.length; i++) {
      if (state.forcedTile && h[i].id !== state.forcedTile.id) continue;
      const ends = legalEnds(state, h[i]);
      for (let e = 0; e < ends.length; e++) out.push({ tile: h[i], end: ends[e] });
    }
    return out;
  }

  function hasAnyMove(state, p) {
    if (!state.chain.length) return state.hands[p].length > 0;
    const h = state.hands[p];
    for (let i = 0; i < h.length; i++) {
      const t = h[i];
      if (t.a === state.leftEnd || t.b === state.leftEnd || t.a === state.rightEnd || t.b === state.rightEnd) return true;
    }
    return false;
  }

  /** وضع قطعة — يتحقق من كل الشروط ويرجع {ok, error} أو يعدّل الحالة */
  function play(state, p, tileId, end) {
    if (state.phase !== 'play') return { ok: false, error: 'PHASE' };
    if (state.turn !== p) return { ok: false, error: 'TURN' };
    const tile = tileInHand(state, p, tileId);
    if (!tile) return { ok: false, error: 'NOT_IN_HAND' };
    if (state.forcedTile && tile.id !== state.forcedTile.id) return { ok: false, error: 'MUST_PLAY_DRAWN' };
    if (legalEnds(state, tile).indexOf(end) < 0) return { ok: false, error: 'ILLEGAL_END' };

    const h = state.hands[p];
    h.splice(h.indexOf(tile), 1);
    const dbl = tile.a === tile.b;
    if (!state.chain.length) {
      state.chain.push({ tile: tile, dbl: dbl });
      state.leftEnd = tile.a; state.rightEnd = tile.b;
    } else if (end === 'L') {
      state.chain.unshift({ tile: tile, dbl: dbl });
      state.leftEnd = (tile.a === state.leftEnd) ? tile.b : tile.a;
    } else {
      state.chain.push({ tile: tile, dbl: dbl });
      state.rightEnd = (tile.b === state.rightEnd) ? tile.a : tile.b;
    }
    state.passes = 0;
    state.forcedTile = null;
    state.lastDrawn = null;
    state.justPlayed = { player: p, end: end, tile: tile };

    if (!h.length) { return { ok: true, ended: scoreRound(state, 'handEmpty', p) }; }
    /* [CCW] عكس عقارب الساعة بأمر المالك:
       4 لاعبين: الرئيسي (أسفل=0) → اليمين (3) → الأعلى (2) → اليسار (1) → الرئيسي (0)
       لاعبان: يتبادلان 0 ↔ 1 */
    state.turn = (p - 1 + state.hands.length) % state.hands.length;
    return { ok: true, ended: null };
  }

  /** سحب قطعة واحدة — يرجع القطعة أو null، ويرفض مع وجود حركة */
  function draw(state, p, rng) {
    if (state.phase !== 'play' || state.turn !== p) return { ok: false, error: 'TURN' };
    if (legalMoves(state, p).length) return { ok: false, error: 'HAS_MOVE' };
    if (!state.boneyard.length) return { ok: false, error: 'EMPTY' };
    const t = state.boneyard.pop();
    state.hands[p].push(t);
    state.lastDrawn = t;
    if (state.cfg.mustPlayDrawn && legalEnds(state, t).length) state.forcedTile = t;
    return { ok: true, tile: t };
  }

  /** تمرير — مسموح فقط عند نفاد كل الخيارات */
  function pass(state, p) {
    if (state.phase !== 'play' || state.turn !== p) return { ok: false, error: 'TURN' };
    if (legalMoves(state, p).length) return { ok: false, error: 'HAS_MOVE' };
    if (state.boneyard.length && state.cfg.drawUntilPlayable) return { ok: false, error: 'MUST_DRAW' };
    state.passes++;
    state.forcedTile = null;
    state.lastDrawn = null;
    if (state.passes >= state.hands.length) return { ok: true, ended: scoreRound(state, 'blocked', null) };
    /* [CCW] عكس عقارب الساعة */
    state.turn = (p - 1 + state.hands.length) % state.hands.length;
    return { ok: true, ended: null };
  }

  /* ══════════════ 5) الحساب ══════════════ */

  function scoreRound(state, reason, winner) {
    const numPlayers = state.hands.length;
    const pips = [];
    for (let i = 0; i < numPlayers; i++) pips.push(pipsOf(state.hands[i]));

    let awarded = 0, tie = false;
    if (reason === 'handEmpty') {
      for (let i = 0; i < numPlayers; i++) if (i !== winner) awarded += pips[i];
    } else {
      let minPips = Infinity, minCount = 0, minIdx = -1;
      for (let i = 0; i < numPlayers; i++) {
        if (pips[i] < minPips) { minPips = pips[i]; minIdx = i; minCount = 1; }
        else if (pips[i] === minPips) { minCount++; }
      }
      if (minCount > 1) {
        winner = null;
        tie = true;
        awarded = 0;
      } else {
        winner = minIdx;
        for (let i = 0; i < numPlayers; i++) {
          if (i !== winner) awarded += (pips[i] - minPips);
        }
        if (awarded <= 0) {
          for (let i = 0; i < numPlayers; i++) if (i !== winner) awarded += pips[i];
        }
      }
    }
    if (winner !== null) state.scores[winner] += awarded;
    state.result = { reason: reason, winner: winner, pips: pips, awarded: awarded, tie: tie };
    state.phase = 'matchEnd';
    for (let k = 0; k < state.scores.length; k++) {
      if (state.scores[k] >= state.cfg.target) { state.matchWinner = k; return state.result; }
    }
    state.phase = 'roundEnd';
    return state.result;
  }

  /** الجولة التالية: يبدأ فائز الجولة السابقة (البادئ نفسه عند التعادل) */
  function nextRound(state, rng) {
    const starter = (state.result && state.result.winner !== null) ? state.result.winner : state.starter;
    return newRound(state, rng, starter);
  }

  /* ══════════════ تصدير ══════════════ */

  return Object.freeze({
    SeededRng: SeededRng,
    shuffle: shuffle,
    createSet: createSet,
    freezeTile: freezeTile,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    normalizeConfig: normalizeConfig,
    pipsOf: pipsOf,
    chooseStarter: chooseStarter,
    newRound: newRound,
    legalEnds: legalEnds,
    legalMoves: legalMoves,
    hasAnyMove: hasAnyMove,
    tileInHand: tileInHand,
    play: play,
    draw: draw,
    pass: pass,
    scoreRound: scoreRound,
    nextRound: nextRound
  });
});

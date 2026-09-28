/* ════════════════════════════════════════════════════════════════════
   UNGameNS — سير مباراة أونو + ذكاء اصطناعي 3 مستويات
   phases: deal → play (↻) → roundEnd → play … → matchEnd
   - play(seat, cardId, color?) · draw(seat) · pass(seat) · callUno(seat)
   - aiPlan(seat) قرار نقاء للسائق/البوت: {type:'play',cardId,color}|{type:'draw'}|{type:'pass'}
   - الفرق في وضع الغرف (2×2): المقعدان المتقابلان فريق واحد.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const Core = root.UNCore;

  let state = null;
  let _rand = null;

  /* ── تهيئة مباراة جديدة (بذرة موحّدة = توزيع موحّد) ── */
  function newMatch(cfg) {
    cfg = cfg || {};
    const n = Math.max(2, Math.min(4, cfg.players || 4));
    const rand = Core.rng(cfg.seed >>> 0 || 1);
    _rand = rand;
    const deck = Core.shuffle(Core.buildDeck(), rand);
    const dealt = Core.deal(deck, rand, n);
    state = {
      seed: cfg.seed >>> 0 || 1,
      cfg: {
        mode: cfg.mode || 'ai',
        level: Math.max(0, Math.min(2, cfg.level != null ? cfg.level : 1)),
        target: Math.max(50, cfg.target || 200),
        players: n,
        /* الفرق (فريقا المتقابلين) فقط مع 4 لاعبين خارج الوضع المحلي */
        teams: cfg.teams === true ? true : (cfg.teams === undefined ? ((cfg.mode || 'ai') !== 'local' && n === 4) : !!cfg.teams)
      },
      order: (cfg.order || []).slice(0, n).map(String),
      names: (cfg.names || []).slice(0, n),
      deck: dealt.rest,
      discard: [],
      hands: dealt.hands.map(function (h) { return h.map(Core.cloneCard); }),
      turn: 0,
      dir: 1,
      color: '',
      phase: 'deal',
      roundNo: 1,
      scores: [0, 0, 0, 0].slice(0, n),
      roundWinner: -1,
      roundPoints: [0, 0, 0, 0].slice(0, n),
      matchWinner: -1,
      unoNeeded: [false, false, false, false].slice(0, n),
      unoCalled: [false, false, false, false].slice(0, n),
      unoPen: false,
      drawn: null,          /* بطاقة مرسومة قابلة للعب (مقعد الدور) */
      lastCard: null,       /* آخر بطاقة معروضة على الرمية */
      winner: -1
    };
    /* بطاقة الافتتاح */
    const first = dealt.first;
    state.discard.push(first);
    state.color = first.color === 'K' ? Core.COLORS[Math.floor(rand() * 4)] : first.color;
    state.lastCard = first;
    state.phase = 'play';
    notify();
    return state;
  }

  function notify() {
    if (state && typeof state.onchange === 'function') { try { state.onchange(state); } catch (e) {} }
    if (typeof root.UN_onchange === 'function') { try { root.UN_onchange(state); } catch (e) {} }
  }

  function nextSeat(seat) {
    const n = state.cfg.players;
    return (seat + state.dir + n * 2) % n;
  }

  function skipSeat(seat) { return nextSeat(nextSeat(seat)); }

  function handOf(seat) { return state.hands[seat]; }

  /* سحبة (مع إعادة تدوير حتمية) */
  function drawOne(seat) {
    if (state.deck.length === 0) state.deck = Core.recycle(state.discard, _rand);
    const c = state.deck.pop();
    handOf(seat).push(c);
    return c;
  }

  /* ── لعب بطاقة ── */
  function play(seat, cardId, color) {
    const s = state;
    if (!s || s.phase !== 'play' || s.turn !== seat) return false;
    const hand = handOf(seat);
    let idx = -1;
    for (let i = 0; i < hand.length; i++) if (hand[i].id === cardId) { idx = i; break; }
    if (idx < 0) return false;
    const card = hand[idx];
    const t = Core.top(s.discard);
    const legal = Core.legalMoves(hand, s.color, t.value);
    if (legal.indexOf(cardId) < 0) return false;

    hand.splice(idx, 1);
    s.discard.push(card);
    s.lastCard = card;
    s.drawn = null;

    /* لون اللعبة */
    if (card.color === 'K') {
      const c = (color && Core.COLORS.indexOf(color) >= 0) ? color : Core.COLORS[Math.floor(_rand() * 4)];
      s.color = c;
    } else {
      s.color = card.color;
    }

    /* UNO: بقيت بطاقة واحدة → يجب إعلان */
    if (hand.length === 1) s.unoNeeded[seat] = true;
    else s.unoNeeded[seat] = false;

    /* فوز الجولة */
    if (hand.length === 0) { finishRound(seat); return true; }

    /* التأثيرات */
    if (card.value === 'S') {
      s.turn = skipSeat(seat);
    } else if (card.value === 'R') {
      s.dir *= -1;
      s.turn = nextSeat(seat);
    } else if (card.value === 'D' || card.value === 'X') {
      const v = card.value === 'D' ? 2 : 4;
      const victim = nextSeat(seat);
      for (let i = 0; i < v; i++) drawOne(victim);
      s.turn = skipSeat(seat);
    } else {
      s.turn = nextSeat(seat);
    }
    if (s.phase === 'play') unoCheck(seat);
    notify();
    return true;
  }

  /* ── سحبة عند العجز عن اللعب ── */
  function draw(seat) {
    const s = state;
    if (!s || s.phase !== 'play' || s.turn !== seat) return false;
    const c = drawOne(seat);
    const t = Core.top(s.discard);
    /* القاعدة القياسية: إن كانت السحبة قابلة للعب — لعبها أو التخطي */
    const legal = Core.legalMoves(handOf(seat), s.color, t.value);
    if (legal.indexOf(c.id) >= 0) {
      s.drawn = c.id;
      unoCheck(seat);
      notify();
      return true; /* الدور يستمر عند نفس المقعد (لعب/تخطي) */
    }
    unoCheck(seat);
    s.turn = nextSeat(seat);
    notify();
    return true;
  }

  /* ── تخطي (بعد سحبة قابلة للعب) ── */
  function pass(seat) {
    const s = state;
    if (!s || s.phase !== 'play' || s.turn !== seat) return false;
    if (s.drawn != null) s.drawn = null;
    s.turn = nextSeat(seat);
    notify();
    return true;
  }

  /* ── إعلان UNO (عند بلوغ بطاقة واحدة — أو قبلها من مقعد 2) ── */
  function callUno(seat) {
    const s = state;
    if (!s || s.phase !== 'play') return false;
    if (s.hands[seat].length <= 2) {
      s.unoCalled[seat] = true;
      s.unoNeeded[seat] = false;
      notify();
      return true;
    }
    return false;
  }

  /* عقوبة نسيان UNO (حتمية): لحظة بلوغ اليد بطاقة واحدة دون إعلان → اسحب 2
     (نفس سلوك المرجع — تُفرض تلقائياً ولا تحتاج لاعباً آخر) */
  function unoCheck(seat) {
    const s = state;
    if (s.phase !== 'play') return false;
    if (s.hands[seat].length === 1 && !s.unoCalled[seat]) {
      for (let i = 0; i < 2; i++) drawOne(seat);
      s.unoCalled[seat] = true;
      s.unoPen = true; /* شارة للعرض: حدثت عقوبة */
      return true;
    }
    return false;
  }

  /* ── نهاية الجولة: نقاط الخاسرين للفائز ──
     وضع الفرق (ai/room): فريقا المتقابلين (0,2) مقابل (1,3) —
     فريق الرابح يحصل على مجموع بطاقات الفريق الآخر.
     وضع محلي: 4 أفراد (أول من يبلغ الهدف). ── */
  function teamOf(seat) { return s4(seat) % 2 === 0 ? 0 : 1; }
  function s4(seat) { return seat; }
  function teamScore(team) {
    const s = state;
    if (s.cfg.players === 2) return team === 0 ? s.scores[0] : s.scores[1];
    return s.scores[team * 2] + s.scores[team * 2 + 1];
  }
  function finishRound(winner) {
    const s = state;
    s.roundWinner = winner;
    let pts = 0;
    if (s.cfg.teams) {
      const wt = teamOf(winner);
      for (let i = 0; i < s.cfg.players; i++) {
        if (i === winner) { s.roundPoints[i] = 0; continue; }
        if (teamOf(i) === wt) { s.roundPoints[i] = 0; continue; }
        const sc = Core.handScore(s.hands[i]);
        s.roundPoints[i] = sc;
        pts += sc;
      }
      s.roundPoints[winner] = pts;
      /* يُسجَّل للفائز (يظهر على فريقه في العرض) */
      s.scores[winner] += pts;
    } else {
      for (let i = 0; i < s.cfg.players; i++) {
        if (i === winner) continue;
        const sc = Core.handScore(s.hands[i]);
        s.roundPoints[i] = sc;
        pts += sc;
      }
      s.roundPoints[winner] = pts;
      s.scores[winner] += pts;
    }
    s.winner = winner;
    s.phase = 'roundEnd';
    notify();
  }
  function matchDone() {
    const s = state;
    if (s.cfg.teams) return teamScore(teamOf(s.roundWinner)) >= s.cfg.target;
    return s.scores[s.roundWinner] >= s.cfg.target;
  }

  /* ── الجولة التالية / نهاية المباراة ── */
  function nextRound() {
    const s = state;
    if (!s || s.phase !== 'roundEnd') return false;
    if (matchDone()) {
      s.matchWinner = s.cfg.teams ? teamOf(s.roundWinner) : s.roundWinner;
      s.phase = 'matchEnd';
      notify();
      return true;
    }
    /* إعادة توزيع: نفس البذرة أساس + رقم الجولة (حتمي ومختلف) */
    const sub = Core.rng((s.seed ^ (0x9E3779B9 * s.roundNo)) >>> 0);
    _rand = sub;
    const deck = Core.shuffle(Core.buildDeck(), sub);
    const dealt = Core.deal(deck, sub, s.cfg.players);
    s.deck = dealt.rest;
    s.discard = [];
    s.hands = dealt.hands.map(function (h) { return h.map(Core.cloneCard); });
    s.turn = (s.roundWinner + 1) % s.cfg.players; /* يبدأ التالي بعد الفائز */
    s.dir = 1;
    const first = dealt.first;
    s.discard.push(first);
    s.color = first.color === 'K' ? Core.COLORS[Math.floor(sub() * 4)] : first.color;
    s.lastCard = first;
    s.roundNo++;
    s.roundWinner = -1;
    s.roundPoints = [0, 0, 0, 0].slice(0, s.cfg.players);
    s.unoNeeded = [false, false, false, false].slice(0, s.cfg.players);
    s.unoCalled = [false, false, false, false].slice(0, s.cfg.players);
    s.unoPen = false;
    s.drawn = null;
    s.winner = -1;
    s.phase = 'play';
    notify();
    return true;
  }

  /* ═══════════ الذكاء الاصطناعي ═══════════ */
  function colorCounts(hand) {
    const cc = { R: 0, B: 0, G: 0, Y: 0 };
    for (let i = 0; i < hand.length; i++) if (hand[i].color !== 'K') cc[hand[i].color]++;
    return cc;
  }

  function bestWildColor(hand, s, victimSeat) {
    /* لون يقلل خيارات الخصم التالي */
    const opp = s.hands[victimSeat];
    let best = 'R', bestScore = 1e9;
    for (let ci = 0; ci < 4; ci++) {
      const c = Core.COLORS[ci];
      let score = 0;
      for (let i = 0; i < opp.length; i++) {
        const o = opp[i];
        if (o.color === c || o.color === 'K' || (o.value >= '0' && o.value <= '9' && o.value === c)) score++;
      }
      score -= colorCounts(hand)[c] * 1.5; /* نفضّل لوننا الغالب */
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  /* قرار نقاء: {type:'play',cardId,color} | {type:'draw'} | {type:'pass'} */
  function aiPlan(seat) {
    const s = state;
    if (!s || s.phase !== 'play' || s.turn !== seat) return null;
    const hand = handOf(seat);
    const t = Core.top(s.discard);
    const legal = Core.legalMoves(hand, s.color, t.value);

    /* بعد سحبة: العبها إن كانت مفيدة (خبرة) وإلا تخطَّ */
    if (s.drawn != null) {
      const dc = hand.find(function (c) { return c.id === s.drawn; });
      const lvl = s.cfg.level;
      if (dc && lvl >= 1 && (dc.value === 'S' || dc.value === 'D' || dc.value === 'X' || dc.color === 'K' || dc.value === t.value)) {
        return { type: 'play', cardId: dc.id, color: dc.color === 'K' ? bestWildColor(hand, s, nextSeat(seat)) : undefined };
      }
      return { type: 'pass' };
    }
    if (!legal.length) return { type: 'draw' };

    const lvl = s.cfg.level;
    const byId = {};
    for (let i = 0; i < hand.length; i++) byId[hand[i].id] = hand[i];
    const victim = s.cfg.players === 2 ? seat : nextSeat(seat);
    const oppN = s.hands[victim].length;

    /* المبتدئ: أول بطاقة قانونية (عشوائية بين المتساويات) */
    if (lvl === 0) {
      const c = byId[legal[Math.floor(_rand() * legal.length)]];
      return { type: 'play', cardId: c.id, color: c.color === 'K' ? Core.COLORS[Math.floor(_rand() * 4)] : undefined };
    }

    /* ترتيب الخيارات */
    const scored = [];
    for (let i = 0; i < legal.length; i++) {
      const c = byId[legal[i]];
      let sc = 0;
      const isWild = c.color === 'K';
      if (c.value >= '0' && c.value <= '9') sc += 3; /* أفضلية الأرقام (تخلص) */
      if (c.value === 'S') sc += oppN <= 2 ? 8 : 3;
      if (c.value === 'R') sc += 2;
      if (c.value === 'D') sc += oppN <= 2 ? 9 : (oppN <= 4 ? 5 : 2);
      if (c.value === 'X') sc += oppN <= 2 ? 12 : (oppN <= 5 ? 6 : 0);
      if (isWild) sc -= (lvl === 2 ? 6 : 3); /* تأخير البراغي */
      if (hand.length === 2 && (c.value === 'D' || c.value === 'X')) sc += 6; /* UNO قادم */
      if (lvl === 2) {
        /* الخبرة: تفادي لون الخصم الغالب إن لعبنا رقمًا */
        if (!isWild) {
          const cc = colorCounts(s.hands[victim]);
          if (cc[c.color] >= 3) sc -= 3;
        }
      }
      sc += _rand() * 0.5;
      scored.push({ c: c, sc: sc });
    }
    scored.sort(function (a, b) { return b.sc - a.sc; });
    const pick = scored[0].c;
    return { type: 'play', cardId: pick.id, color: pick.color === 'K' ? bestWildColor(hand, s, victim) : undefined };
  }

  function reset() { state = null; _rand = null; }

  root.UNGameNS = {
    reset: reset,
    newMatch: newMatch,
    play: play,
    draw: draw,
    pass: pass,
    callUno: callUno,
    unoCheck: unoCheck,
    finishRound: finishRound,
    nextRound: nextRound,
    aiPlan: aiPlan,
    nextSeat: nextSeat,
    unoCheck: unoCheck,
    teamOf: teamOf,
    teamScore: teamScore,
    matchDone: matchDone,
    get state() { return state; }
  };
  /* getter خاص لسهولة القراءة في المحاكاة */
  Object.defineProperty(root.UNGameNS, 'st', { get: function () { return state; } });
})(typeof window !== 'undefined' ? window : globalThis);

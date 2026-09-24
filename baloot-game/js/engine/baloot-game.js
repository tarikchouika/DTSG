/* ════════════════════════════════════════════════════════════════════
   BLGameNS — البلوت: سير المباراة + الذكاء الاصطناعي (3 مستويات)
   ────────────────────────────────────────────────────────────────────
   المراحل: deal → ashur (إعلانات) → naming (التسمية) → play (8 أكلات)
            → roundEnd → (الجولة التالية) → matchEnd
   كل تغيير حالة ينادي notify() — الواجهة تقرأ state وتعرض.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const Core = root.BALCore;

  const NS = {
    state: null,
    _listeners: [],
    onChange: function (fn) { this._listeners.push(fn); },
    notify: function () { for (let i = 0; i < this._listeners.length; i++) { try { this._listeners[i](this.state); } catch (e) { if (root.console) console.error(e); } } },

    /* ═══════════ بداية مباراة ═══════════ */
    /* cfg.seed (اختياري): بذرة حتمية لغرف الأونلاين — نفس التوزيع عند كل العملاء */
    newMatch: function (cfg) {
      this._rng = (cfg && cfg.seed) ? Core.rng(cfg.seed) : null;
      this.state = {
        cfg: cfg,                        /* {mode, level, target, firstLead, mustBeat, kabotBonus} */
        dealer: 0,
        roundNo: 0,
        phase: 'idle',
        turn: 0,
        hands: [[], [], [], []],
        trump: null,                     /* 'S'|'H'|'D'|'C' أو null = صن */
        namedBy: -1,
        namedKind: null,                 /* 'suit' | 'sun' */
        trick: [],
        cardPts: [0, 0],
        tricksWon: [0, 0],
        lastTrickTeam: -1,
        ashurDeclared: [null, null],     /* لكل فريق: {value, seat, combo} */
        baloot: [false, false],
        roundResult: null,
        teamScores: [0, 0],
        matchWinner: -1,
        redeals: 0,
        balootAnnounced: [false, false], /* أُعلن بلوت هذا الدور؟ (لواجهة البانر) */
        seatNames: null                  /* تعيّن الواجهة */
      };
      this.startRound();
    },

    /* ═══════════ بداية دور (توزيع) ═══════════ */
    startRound: function () {
      const s = this.state;
      s.roundNo++;
      const deck = Core.shuffle(Core.makeDeck(), this._rng || Math.random);
      s.hands = [[], [], [], []];
      for (let i = 0; i < 32; i++) s.hands[i % 4].push(deck[i]); // نظام 3-2-3 المكافئ
      for (let t = 0; t < 4; t++) s.hands[t] = Core.sortHand(s.hands[t], null);
      s.trick = [];
      s.trump = null;
      s.namedBy = -1;
      s.namedKind = null;
      s.cardPts = [0, 0];
      s.tricksWon = [0, 0];
      s.lastTrickTeam = -1;
      s.ashurDeclared = [null, null];
      s.baloot = [false, false];
      s.balootAnnounced = [false, false];
      s.roundResult = null;
      s.phase = 'ashur';
      s.turn = (s.dealer + 1) % 4; // يسار الموزع يبدأ الإعلان
      this.notify();
    },

    /* ═══════════ مرحلة الأشور ═══════════ */
    declareAshur: function (seat, combo) {
      const s = this.state;
      if (s.phase !== 'ashur' || s.turn !== seat) return false;
      const team = Core.teamOf(seat);
      if (combo) {
        /* تحقق: التشكيلة موجودة فعلاً في اليد */
        const opts = Core.detectAshur(s.hands[seat]);
        const valid = opts.some((o) =>
          (combo.type === 'serial' && o.type === 'serial' && o.suit === combo.suit && o.from === combo.from) ||
          (combo.type === 'quad' && o.type === 'quad' && o.rank === combo.rank)
        );
        if (valid) s.ashurDeclared[team] = { value: combo.value, seat: seat, combo: combo };
      }
      this._advanceFrom(seat, 'ashur');
      this.notify();
      return true;
    },

    /* ═══════════ مرحلة التسمية ═══════════ */
    chooseNaming: function (seat, choice) {
      /* choice: null = بس · {kind:'suit', suit:'S'} · {kind:'sun'} */
      const s = this.state;
      if (s.phase !== 'naming' || s.turn !== seat) return false;
      if (choice && (choice.kind === 'suit' || choice.kind === 'sun')) {
        s.namedBy = seat;
        s.namedKind = choice.kind;
        s.trump = choice.kind === 'suit' ? choice.suit : null;
        for (let t = 0; t < 4; t++) s.hands[t] = Core.sortHand(s.hands[t], s.trump);
        s.phase = 'play';
        s.trick = [];
        s.turn = s.cfg.firstLead === 'namer' ? seat : (s.dealer + 1) % 4;
        this.notify();
        return true;
      }
      /* بس */
      this._advanceFrom(seat, 'naming');
      this.notify();
      return true;
    },

    _advanceFrom: function (seat, phaseName) {
      const s = this.state;
      const next = (seat + 1) % 4;
      if (next === (s.dealer + 1) % 4 && phaseName === 'ashur') {
        /* اكتملت دورة الأشور → التسمية */
        s.phase = 'naming';
        s.turn = (s.dealer + 1) % 4;
        return;
      }
      if (next === (s.dealer + 1) % 4 && phaseName === 'naming') {
        /* الكل قال بس → إعادة توزيع (الدور ينتقل يميناً) */
        s.dealer = (s.dealer + 1) % 4;
        s.redeals++;
        this.startRound();
        return;
      }
      s.turn = next;
    },

    /* ═══════════ اللعب ═══════════ */
    play: function (seat, card) {
      const s = this.state;
      if (s.phase !== 'play' || s.turn !== seat) return false;
      const hand = s.hands[seat];
      let idx = -1;
      for (let i = 0; i < hand.length; i++) if (hand[i].id === card.id) { idx = i; break; }
      if (idx === -1) return false;
      if (!Core.isLegal(hand, s.trick, s.trump, card, s.cfg.mustBeat)) return false;

      const team = Core.teamOf(seat);
      /* بلوت: طرح K أو Q من هوكم مع تملك الاخرى → يُعلن لحظة اللعب (+20، لا يُقطع) */
      if (s.trump && card.suit === s.trump && (card.rank === 13 || card.rank === 12) &&
          !s.baloot[team] && Core.hasBaloot(hand, s.trump)) {
        s.baloot[team] = true;
        s.balootAnnounced[team] = true;
      }

      hand.splice(idx, 1);
      s.trick.push({ seat: seat, card: card });

      if (s.trick.length === 4) {
        const wIdx = Core.trickWinnerIdx(s.trick, s.trump);
        const winner = s.trick[wIdx].seat;
        const wTeam = Core.teamOf(winner);
        for (let i = 0; i < 4; i++) s.cardPts[wTeam] += Core.pointsOf(s.trick[i].card, s.trump);
        s.tricksWon[wTeam]++;
        s.lastTrickTeam = wTeam;
        s.trickWinner = winner;
        const allEmpty = s.hands[0].length === 0;
        s.phase = 'trickEnd';
        s.roundOver = allEmpty;
        this.notify();
        return true;
      }
      s.turn = (seat + 1) % 4;
      this.notify();
      return true;
    },

    /* بعد عرض نهاية الأكلة: أكلة تالية أو حسم الدور */
    nextTrickOrRoundEnd: function () {
      const s = this.state;
      if (s.phase !== 'trickEnd') return;
      if (s.roundOver) { this.finishRound(); return; }
      const winner = s.trickWinner;
      s.trick = [];
      s.trickWinner = -1;
      s.phase = 'play';
      s.turn = (typeof winner === 'number' && winner >= 0) ? winner : s.turn;
      this.notify();
    },

    finishRound: function () {
      const s = this.state;
      const kabotTeam = s.tricksWon[0] === 8 ? 0 : (s.tricksWon[1] === 8 ? 1 : -1);
      s.roundResult = Core.scoreRound(
        s.cardPts, s.tricksWon, s.lastTrickTeam, s.ashurDeclared, s.baloot,
        kabotTeam, s.cfg.kabotBonus || 0
      );
      for (let t = 0; t < 2; t++) s.teamScores[t] += s.roundResult.total[t];
      if (s.teamScores[0] >= s.cfg.target || s.teamScores[1] >= s.cfg.target) {
        s.matchWinner = s.teamScores[0] >= s.teamScores[1] ? 0 : 1;
        /* إن تعادلا على الهدف في نفس الدور (نادر) — يفضّل من بلغ الهدف أولاً بالقيمة */
        s.phase = 'matchEnd';
      } else {
        s.dealer = (s.dealer + 1) % 4;
        s.phase = 'roundEnd';
      }
      this.notify();
    },

    nextRound: function () {
      if (!this.state || this.state.phase !== 'roundEnd') return;
      this.startRound();
    },

    /* ══════════════════════════ الذكاء الاصطناعي ══════════════════════════ */
    /* مستويات: 0 مبتدئ · 1 متوسط · 2 خبير */
    /* كل دالة قرار نقيّة (لا تُطبّق شيئاً): aiPlan تعيد القرار وتُستخدم من
       سائق غرفة الأونلاين (يُطبّق محلياً ثم يبثّه)، و aiAct تطبّق القرار. */

    _ashurDecision: function (seat) {
      const s = this.state;
      if (s.phase !== 'ashur' || s.turn !== seat) return null;
      const level = s.cfg.level;
      const opts = Core.detectAshur(s.hands[seat]);
      if (!opts.length) return null;
      const best = opts[0];
      let p = level === 0 ? 0.5 : level === 1 ? 0.9 : 1;
      if (best.value < 20) p *= 0.3; // رباعية 7/8 بلا قيمة
      return Math.random() < p ? best : null;
    },

    _namingDecision: function (seat) {
      const s = this.state;
      if (s.phase !== 'naming' || s.turn !== seat) return null;
      const level = s.cfg.level;
      const hand = s.hands[seat];
      const bestSuit = Core.strongestSuit(hand);
      const e = Core.handStrengthForSuit(hand, bestSuit);
      const sun = Core.sunStrength(hand);

      if (level === 0) {
        if (Math.random() < 0.55) return null;
        return { kind: 'suit', suit: bestSuit };
      }
      if (level === 1) {
        /* صن نادر جداً ومتوسط: يسمّي إذا كان هوكمه معقولاً */
        if (sun.pts >= 92 && sun.strongSuits >= 3 && Math.random() < 0.35) return { kind: 'sun' };
        if (e.score >= 46) return { kind: 'suit', suit: bestSuit };
        if (e.score >= 38 && Math.random() < 0.6) return { kind: 'suit', suit: bestSuit };
        return null;
      }
      /* خبير: قيمة متوقعة + تحكم */
      if (sun.pts >= 98 && sun.strongSuits >= 3) return { kind: 'sun' };
      if (e.score >= 58) return { kind: 'suit', suit: bestSuit };
      if (e.score >= 50 && e.trumps >= 3) return { kind: 'suit', suit: bestSuit };
      if (e.score >= 44 && Math.random() < 0.45) return { kind: 'suit', suit: bestSuit };
      return null;
    },

    _cardDecision: function (seat) {
      const s = this.state;
      if (s.phase !== 'play' || s.turn !== seat) return null;
      const hand = s.hands[seat];
      const level = s.cfg.level;
      const legal = Core.legalMoves(hand, s.trick, s.trump, s.cfg.mustBeat);
      if (!legal.length) return null;
      if (level === 0) return legal[Math.floor(Math.random() * legal.length)];

      const trickPts = s.trick.reduce((sum, p) => sum + Core.pointsOf(p.card, s.trump), 0);
      const lastTrick = s.hands[0].length === 1; // آخر أوراق الدور
      const partnerSeat = (seat + 2) % 4;

      if (!s.trick.length) {
        /* ── بطّاقة: أبدا بأضعف غير هوكم (احفظ هوكم) ── */
        const nonTrump = legal.filter((c) => c.suit !== s.trump);
        const pool = nonTrump.length ? nonTrump : legal;
        pool.sort((a, b) => Core.pointsOf(a, s.trump) - Core.pointsOf(b, s.trump) || Core.power(a, s.trump) - Core.power(b, s.trump));
        if (level === 2) {
          /* خبير: لا تَبُط بأوراق نقاط (A/10) إذا كانت عندك أطول سلسلة ضعيفة */
          const leadSuit = this._bestLeadSuit(pool, s.trump, hand);
          const fromSuit = pool.filter((c) => c.suit === leadSuit && Core.pointsOf(c, s.trump) === 0);
          if (fromSuit.length) { fromSuit.sort((a, b) => Core.power(a, s.trump) - Core.power(b, s.trump)); return fromSuit[0]; }
          /* آخر أكلة: ابط من أقوى سيت لك لتحاول الفوز باليد */
          if (lastTrick) {
            const strong = pool.slice().sort((a, b) => Core.power(b, s.trump) - Core.power(a, s.trump));
            return strong[0];
          }
        }
        return pool[0];
      }

      const wIdx = Core.trickWinnerIdx(s.trick, s.trump);
      const winPow = Core.power(s.trick[wIdx].card, s.trump);
      const partnerWinning = Core.sameTeam(s.trick[wIdx].seat, seat);
      const beaters = legal.filter((c) => Core.power(c, s.trump) > winPow);
      const ledSuit = s.trick[0].card.suit;
      const trumpLed = s.trump && ledSuit === s.trump;

      if (partnerWinning) {
        /* شريكي يفوز: أفرغ أوراق النقاط عندي (أعلى نقاطاً أولاً) */
        legal.sort((a, b) => Core.pointsOf(b, s.trump) - Core.pointsOf(a, s.trump) || Core.power(a, s.trump) - Core.power(b, s.trump));
        /* لا ترمي هوكم نقاط (J/9) على أكلة خفيفة إذا كان فيها خطر… أبسط: رمي طبيعي */
        return legal[0];
      }

      if (beaters.length) {
        const cheap = beaters.slice().sort((a, b) => Core.power(a, s.trump) - Core.power(b, s.trump));
        const winIt =
          lastTrick ||                                    // اليد +10: خذها
          trickPts >= 20 ||                               // أكلة ثقيلة
          (level === 2 && trickPts >= 10 && cheap[0] && Core.pointsOf(cheap[0], s.trump) <= 4) ||
          (level === 1 && s.trick.length === 3 && trickPts >= 15);
        if (winIt) return cheap[0];
        /* لا تفوز: أرمي أرخص ورقة من السيت المطروح (إن وجد) وإلا أرخص هوكم */
        const dump = legal.filter((c) => Core.power(c, s.trump) <= winPow);
        dump.sort((a, b) => Core.pointsOf(a, s.trump) - Core.pointsOf(b, s.trump) || Core.power(a, s.trump) - Core.power(b, s.trump));
        if (dump.length) return dump[0];
        return legal[0];
      }

      /* لا أقدر أفوز */
      if (trumpLed && level === 2) {
        /* طُرح هوكم ولا أملك أعلى: أرمي أضعف هوكم (احفظ القوي) */
        legal.sort((a, b) => Core.power(a, s.trump) - Core.power(b, s.trump));
        return legal[0];
      }
      legal.sort((a, b) => Core.pointsOf(a, s.trump) - Core.pointsOf(b, s.trump) || Core.power(a, s.trump) - Core.power(b, s.trump));
      return legal[0];
    },

    /* القرار الكامل للمرحلة الحالية (بلا تطبيق) — يعيد:
       {type:'ashur', combo} | {type:'name', choice} | {type:'play', card} | null */
    aiPlan: function (seat) {
      const s = this.state;
      if (!s) return null;
      if (s.phase === 'ashur' && s.turn === seat) return { type: 'ashur', combo: this._ashurDecision(seat) };
      if (s.phase === 'naming' && s.turn === seat) return { type: 'name', choice: this._namingDecision(seat) };
      if (s.phase === 'play' && s.turn === seat) {
        const c = this._cardDecision(seat);
        return c ? { type: 'play', card: c } : null;
      }
      return null;
    },

    aiAshur: function (seat) {
      const s = this.state;
      if (!s || s.phase !== 'ashur' || s.turn !== seat) return;
      this.declareAshur(seat, this._ashurDecision(seat));
    },
    aiNaming: function (seat) {
      const s = this.state;
      if (!s || s.phase !== 'naming' || s.turn !== seat) return;
      this.chooseNaming(seat, this._namingDecision(seat));
    },
    aiCard: function (seat) {
      const s = this.state;
      if (!s || s.phase !== 'play' || s.turn !== seat) return;
      const c = this._cardDecision(seat);
      if (c) this.play(seat, c);
    },

    /* اختياري أفضل سيت للبط (خبير): أطول سيت بلا نقاط، بعيد عن هوكم */
    _bestLeadSuit: function (pool, trump, hand) {
      const bySuit = {};
      for (let i = 0; i < pool.length; i++) (bySuit[pool[i].suit] = bySuit[pool[i].suit] || []).push(pool[i]);
      let best = null, bestScore = -1;
      for (const suit in bySuit) {
        const cards = bySuit[suit];
        let score = cards.length * 10;
        for (let i = 0; i < cards.length; i++) score -= Core.pointsOf(cards[i], trump) * 6;
        if (suit === trump) score -= 12; // لا تبط هوكم
        if (score > bestScore) { bestScore = score; best = suit; }
      }
      return best || pool[0].suit;
    },

    /* فعل الذكاء الموحّد للمرحلة الحالية */
    aiAct: function (seat) {
      const s = this.state;
      if (!s) return;
      if (s.phase === 'ashur') this.aiAshur(seat);
      else if (s.phase === 'naming') this.aiNaming(seat);
      else if (s.phase === 'play') this.aiCard(seat);
    }
  };

  root.BLGameNS = NS;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : globalThis);

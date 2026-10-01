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
    /* cfg.seed (اختياري): بذرة حتمية لغرف الأونلاين — نفس التوزيع عند كل العملاء
       [v2.72·توجيه المالك: «بلوت يقبل 1ضد1 و1ضد2 و1ضد3 فردي»]:
         cfg.players (2..4، الافتراضي 4) · cfg.solo (فردي = كل مقعد فريق مستقل).
         4 لاعبين بلا solo = الفرقان الكلاسيكيان (0,2)/(1,3) — توافق تام مع v2.71.
         التوزيع: 8 أوراق لكل لاعب دائماً (8 أكلات لكل دور مهما كان العدد —
         نفس اقتصاد النقاط؛ ما تبقّى من الحزمة يبقى مغطّى بلا توزيع). */
    newMatch: function (cfg) {
      this._rng = (cfg && cfg.seed) ? Core.rng(cfg.seed) : null;
      const players = Math.max(2, Math.min(4, Math.floor(cfg && cfg.players) || 4));
      const teamFn = Core.makeTeamOf(players, cfg && cfg.solo);
      const T = (players === 4 && !(cfg && cfg.solo)) ? 2 : players;
      this._teamOf = teamFn;
      this._sameTeam = function (a, b) { return teamFn(a) === teamFn(b); };
      this.state = {
        cfg: cfg,                        /* {mode, level, target, firstLead, mustBeat, kabotBonus, players, solo} */
        players: players,                /* عدد المقاعد (2..4) */
        solo: !!(cfg && cfg.solo) || players !== 4,
        dealer: 0,
        roundNo: 0,
        phase: 'idle',
        turn: 0,
        hands: [],
        trump: null,                     /* 'S'|'H'|'D'|'C' أو null = صن */
        namedBy: -1,
        namedKind: null,                 /* 'suit' | 'sun' */
        trick: [],
        cardPts: new Array(T).fill(0),
        tricksWon: new Array(T).fill(0),
        lastTrickTeam: -1,
        ashurDeclared: new Array(T).fill(null), /* لكل فريق: {value, seat, combo} */
        baloot: new Array(T).fill(false),
        roundResult: null,
        teamScores: new Array(T).fill(0),
        matchWinner: -1,
        redeals: 0,
        balootAnnounced: new Array(T).fill(false), /* أُعلن بلوت هذا الدور؟ (لواجهة البانر) */
        seatNames: null                  /* تعيّن الواجهة */
      };
      for (let i = 0; i < players; i++) this.state.hands.push([]);
      this.startRound();
    },

    /* خريطة الفرق الحالية (فردي: كل مقعد فريقه) — للواجهة والذكاء */
    teamOf: function (seat) {
      return this._teamOf ? this._teamOf(seat) : (seat % 2);
    },
    sameTeam: function (a, b) {
      return this._sameTeam ? this._sameTeam(a, b) : (a % 2) === (b % 2);
    },

    /* ═══════════ بداية دور (توزيع) ═══════════ */
    startRound: function () {
      const s = this.state;
      const N = s.players || 4;
      const T = s.cardPts.length;
      s.roundNo++;
      const deck = Core.shuffle(Core.makeDeck(), this._rng || Math.random);
      s.hands = [];
      for (let i = 0; i < N; i++) s.hands.push([]);
      /* 8 أوراق لكل لاعب (نظام 3-2-3 المكافئ) — الباقي من الحزمة مغطّى بلا توزيع */
      for (let i = 0; i < 8 * N; i++) s.hands[i % N].push(deck[i]);
      for (let t = 0; t < N; t++) s.hands[t] = Core.sortHand(s.hands[t], null);
      s.trick = [];
      s.trump = null;
      s.namedBy = -1;
      s.namedKind = null;
      s.cardPts = new Array(T).fill(0);
      s.tricksWon = new Array(T).fill(0);
      s.lastTrickTeam = -1;
      s.ashurDeclared = new Array(T).fill(null);
      s.baloot = new Array(T).fill(false);
      s.balootAnnounced = new Array(T).fill(false);
      s.roundResult = null;
      s.phase = 'ashur';
      s.turn = (s.dealer + 1) % N; // يسار الموزع يبدأ الإعلان
      this.notify();
    },

    /* ═══════════ مرحلة الأشور ═══════════ */
    declareAshur: function (seat, combo) {
      const s = this.state;
      if (s.phase !== 'ashur' || s.turn !== seat) return false;
      const team = this.teamOf(seat);
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
        for (let t = 0; t < s.hands.length; t++) s.hands[t] = Core.sortHand(s.hands[t], s.trump);
        s.phase = 'play';
        s.trick = [];
        s.turn = s.cfg.firstLead === 'namer' ? seat : (s.dealer + 1) % (s.players || 4);
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
      const N = s.players || 4;
      const next = (seat + 1) % N;
      if (next === (s.dealer + 1) % N && phaseName === 'ashur') {
        /* اكتملت دورة الأشور → التسمية */
        s.phase = 'naming';
        s.turn = (s.dealer + 1) % N;
        return;
      }
      if (next === (s.dealer + 1) % N && phaseName === 'naming') {
        /* الكل قال بس → إعادة توزيع (الدور ينتقل يميناً) */
        s.dealer = (s.dealer + 1) % N;
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

      const team = this.teamOf(seat);
      /* بلوت: طرح K أو Q من هوكم مع تملك الاخرى → يُعلن لحظة اللعب (+20، لا يُقطع) */
      if (s.trump && card.suit === s.trump && (card.rank === 13 || card.rank === 12) &&
          !s.baloot[team] && Core.hasBaloot(hand, s.trump)) {
        s.baloot[team] = true;
        s.balootAnnounced[team] = true;
      }

      hand.splice(idx, 1);
      s.trick.push({ seat: seat, card: card });

      const N = s.players || 4;
      if (s.trick.length === N) {
        const wIdx = Core.trickWinnerIdx(s.trick, s.trump);
        const winner = s.trick[wIdx].seat;
        const wTeam = this.teamOf(winner);
        for (let i = 0; i < N; i++) s.cardPts[wTeam] += Core.pointsOf(s.trick[i].card, s.trump);
        s.tricksWon[wTeam]++;
        s.lastTrickTeam = wTeam;
        s.trickWinner = winner;
        const allEmpty = s.hands.every((h) => h.length === 0);
        s.phase = 'trickEnd';
        s.roundOver = allEmpty;
        this.notify();
        return true;
      }
      s.turn = (seat + 1) % N;
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
      /* كابوت: فريق واحد أكل الأكلات الثمانية كلها (مقعد فردي أو فريق زوجي) */
      let kabotTeam = -1;
      for (let t = 0; t < s.tricksWon.length; t++) {
        if (s.tricksWon[t] === 8) { kabotTeam = t; break; }
      }
      s.roundResult = Core.scoreRound(
        s.cardPts, s.tricksWon, s.lastTrickTeam, s.ashurDeclared, s.baloot,
        kabotTeam, s.cfg.kabotBonus || 0
      );
      const T = s.teamScores.length;
      for (let t = 0; t < T; t++) s.teamScores[t] += s.roundResult.total[t];
      /* الفائز: الأعلى قيمة (عند تجاوز الهدف من أكثر من فريق في الدور نفسه) */
      let winner = -1, top = -Infinity;
      for (let t = 0; t < T; t++) {
        if (s.teamScores[t] > top) { top = s.teamScores[t]; winner = t; }
      }
      const reached = s.teamScores.findIndex((x) => x >= s.cfg.target);
      if (reached >= 0) {
        s.matchWinner = (winner >= 0) ? winner : reached;
        s.phase = 'matchEnd';
      } else {
        s.dealer = (s.dealer + 1) % (s.players || 4);
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
      const lastTrick = s.hands[seat].length === 1; // آخر أوراق الدور
      /* [v2.72] لا شريك في الفردي: sameTeam عبر خريطة الفرق الحالية (فردي: مقعدي وحدي) */
      const partnerSeat = this.sameTeam(seat, (seat + 2) % (s.players || 4)) ? (seat + 2) % (s.players || 4) : -1;

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
      const partnerWinning = this.sameTeam(s.trick[wIdx].seat, seat);
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

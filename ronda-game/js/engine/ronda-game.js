/**
 * ============================================================================
 *  RONDA GAME — طبقة سير المباراة + الذكاء الاصطناعي
 * ============================================================================
 *  RondaGame: الواجهة الرئيسية للمحرك (doc2 §27-§30):
 *    - تحقق كامل من صحة كل حركة (Server-Authoritative)
 *    - إصدار أحداث متسلسلة (Events) للواجهة/الشبكة/إعادة المشهد
 *    - Snapshot كامل + View مفلتر لكل لاعب (لا ترسل يد الخصم أبداً — doc2 §44)
 *    - الضربة/الحبل/جوج حبال + الميسا + الإعلانات + قاعا راي/قاعا أص
 *  RondaAI: ذكاء اصطناعي شفاف المعلومات (لا يغش — يرى View اللاعب فقط)
 *
 *  يعمل في المتصفح (window.RondaCore.RondaGame) و Node.js (module.exports).
 * ============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const RondaCore = require('./ronda-core.js');
    module.exports = factory(RondaCore);
  } else {
    const api = factory(root.RondaCore);
    root.RondaCore.RondaGame = api.RondaGame;
    root.RondaCore.RondaAI = api.RondaAI;
  }
})(typeof self !== 'undefined' ? self : this, function (RC) {
  'use strict';

  /* ==========================================================================
   *  RondaGame
   * ========================================================================== */

  /**
   * options:
   *   mode       : GameMode (إلزامي)
   *   playerCount: عدد اللاعبين لوضع FREE_FOR_ALL (3 أو 4 — كل لاعب لنفسه)
   *   seed       : رقم حتمي (اختياري — عشوائي إن لم يُحدد)
   *   dealerSeat : مقعد الموزع الابتدائي (افتراضياً آخر مقعد)
   *   names      : أسماء اللاعبين (اختياري)
   *   rules      : RondaRulesConfig (اختياري)
   */
  class RondaGame {
    constructor(options) {
      const opts = options || {};
      if (!opts.mode) throw new Error('RondaGame requires a GameMode');

      this.rules = opts.rules || new RC.RondaRulesConfig();
      this.seed = (opts.seed >>> 0) || ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0);
      this.rng = new RC.SeededRng(this.seed);
      this.playerCount = opts.playerCount;

      this.state = new RC.RondaGameState(opts.mode);
      this.state.targetScore = this.rules.targetScore;

      this.captureResolver = new RC.CaptureResolver();
      this.declarationResolver = new RC.DeclarationResolver();
      this.scoring = new RC.ScoringEngine(this.rules);
      this.turnManager = new RC.TurnManager(this.state);

      this._listeners = [];
      this._seq = 0;
      this._batch = null;

      this._setupPlayers(opts.mode, opts.names);

      /* [FirstDealer] قرعة الموزع الأول (قاعدة «بينيا»): ورقة واحدة لكل لاعب —
         صاحب أصغر ورقة يوزع. عند غياب dealerSeat صريح تُجرى القرعة في start().
         حتمية بالكامل من نفس seed → كل عميل بنفس البذرة يلتقي على نفس الموزع. */
      this._dealerDrawn = false;
      if (opts.dealerSeat !== undefined) {
        this.state.dealerSeat = opts.dealerSeat;
        this._dealerDrawn = true;             /* صريح → لا قرعة */
      } else {
        this.state.dealerSeat = this.state.players.length - 1;   /* مؤقت حتى start() */
      }

      this._validateSetup();
    }

    /* ---------------- قرعة الموزع الأول ---------------- */

    /** ورقة واحدة لكل لاعب حسب ترتيب المقاعد — أصغر رتبة (RANK_SEQUENCE) توزع.
        التعادل → إعادة سحب للمتعادلين فقط حتى يتفرد الأصغر. حتمي عبر this.rng. */
    _drawFirstDealer() {
      const st = this.state;
      const n = st.players.length;
      let draw = RC.RondaDeckFactory.create();
      RC.shuffle(draw, this.rng);
      let seats = [];
      for (let s = 0; s < n; s++) seats.push(s);
      let cards = [];
      const drawOne = function (seat) {
        const card = draw.pop();
        if (!card) throw new Error('dealer-draw: empty deck');
        return card;
      };
      seats.forEach(function (s) { cards.push({ seat: s, card: drawOne(s) }); });
      /* إعادة سحب للمتعادلين على أصغر رتبة (ورقة لكل متعادل من المجموعة نفسها) */
      for (let guard = 0; guard < 40; guard++) {
        const minIdx = Math.min.apply(null, cards.map(function (c) {
          return RC.rankSequenceIndex(c.card.rank);
        }));
        const tied = cards.filter(function (c) { return RC.rankSequenceIndex(c.card.rank) === minIdx; });
        if (tied.length === 1) break;
        cards = tied.map(function (c) {
          return { seat: c.seat, card: drawOne(c.seat) };
        });
      }
      const minIdx2 = Math.min.apply(null, cards.map(function (c) {
        return RC.rankSequenceIndex(c.card.rank);
      }));
      const winner = cards.find(function (c) { return RC.rankSequenceIndex(c.card.rank) === minIdx2; });
      st.dealerSeat = winner.seat;
      this._dealerDrawn = true;
      this._emit('FirstDealerDrawn', {
        dealerSeat: winner.seat,
        cards: cards.map(function (c) { return { seat: c.seat, rank: c.card.rank, suit: c.card.suit }; })
      });
    }

    /* ---------------- إعداد اللاعبين والفرق ---------------- */

    /** عدد مقاعد الوضع (بدون FREE_FOR_ALL يُحسم تلقائياً) */
    _expectedPlayers(mode) {
      if (mode === RC.GameMode.HEAD_TO_HEAD) return 2;
      if (mode === RC.GameMode.TEAM_VS_TEAM) return 4;
      const n = Number(this.playerCount);
      return (n === 3 || n === 4) ? n : 4;   /* FreeForAll: 3 أو 4 لاعبين */
    }

    _setupPlayers(mode, names) {
      const st = this.state;
      const count = this._expectedPlayers(mode);
      for (let seat = 0; seat < count; seat++) {
        // 1v1 / كلٌّ لنفسه: كل لاعب فريق وحده (teamId = seat)
        // 2v2: الفريق أ = المقاعد 0,2 — الفريق ب = المقاعد 1,3
        const teamId = (mode === RC.GameMode.TEAM_VS_TEAM) ? (seat % 2) : seat;
        const name = (names && names[seat]) ? names[seat] : null;
        const player = new RC.Player(seat, seat, teamId, name);
        st.players.push(player);
        let team = st.teams.find(function (t) { return t.id === teamId; });
        if (!team) {
          team = new RC.Team(teamId);
          st.teams.push(team);
        }
        team.playerIds.push(seat);
      }
      // أسماء الفرق: في 2v2 أسماء افتراضية، وفي الفردي اسم الفريق = اسم اللاعب
      if (mode === RC.GameMode.TEAM_VS_TEAM) {
        st.teams[0].name = 'الفريق أ';
        st.teams[1].name = 'الفريق ب';
      } else {
        for (const t of st.teams) {
          t.name = st.getPlayer(t.playerIds[0]).name;
        }
      }
    }

    _validateSetup() {
      const st = this.state;
      const expected = this._expectedPlayers(st.mode);
      if (st.players.length !== expected) {
        throw new Error('Mode requires ' + expected + ' players');
      }
      if (st.mode === RC.GameMode.TEAM_VS_TEAM) {
        if (st.teams.length !== 2 || st.teams.some(function (t) { return t.playerIds.length !== 2; })) {
          throw new Error('TeamVsTeam requires 2 teams of 2 players');
        }
      }
      if (st.mode === RC.GameMode.FREE_FOR_ALL) {
        /* كل مقعد فريق مستقل من لاعب واحد */
        if (st.teams.length !== expected ||
            st.teams.some(function (t) { return t.playerIds.length !== 1; })) {
          throw new Error('FreeForAll requires one team per player');
        }
      }
      if (!st.players.some(function (p) { return p.seat === st.dealerSeat; })) {
        throw new Error('Dealer seat does not exist');
      }
    }

    /* ---------------- الأحداث (Event Dispatcher) ---------------- */

    /** الاشتراك في الأحداث — الواجهة/الشبكة تعرض الأحداث ولا تقرر شيئاً */
    onEvent(listener) {
      this._listeners.push(listener);
      return this;
    }

    _emit(type, data) {
      const ev = Object.assign({ type: type, seq: ++this._seq }, data || {});
      if (this._batch) this._batch.push(ev);
      for (let i = 0; i < this._listeners.length; i++) {
        try { this._listeners[i](ev); }
        catch (e) { if (typeof console !== 'undefined') console.error('event listener error', e); }
      }
      return ev;
    }

    /* ---------------- البداية ---------------- */

    start() {
      this._batch = [];
      this._emit('GameStarted', {
        seed: this.seed,
        mode: this.state.mode,
        targetScore: this.rules.targetScore,
        dealerSeat: this.state.dealerSeat
      });
      /* [FirstDealer] قبل أول توزيع: قرعة الموزع إن لم يُحدد صراحةً */
      if (!this._dealerDrawn) this._drawFirstDealer();
      this._startRound();
      return this._takeBatch();
    }

    _startRound() {
      const st = this.state;
      st.roundNumber++;
      st.dealNumber = 0;
      st.deck = RC.RondaDeckFactory.create();
      RC.shuffle(st.deck, this.rng);

      for (let i = 0; i < st.players.length; i++) {
        st.players[i].hand.length = 0;
        st.players[i].capturedCards.length = 0;
      }
      st.table.clear();
      st.lastPlayedCard = null;
      st.lastPlayedById = -1;
      st.lastPlayedCardResting = false;
      st.lastPlayerWhoCapturedId = -1;
      st.playedCardsInCurrentDeal = 0;
      st.strike.reset();
      st.roundStats = this._newRoundStats();

      this._dealInitial();
      this.turnManager.setStartingSeat((st.dealerSeat + st.players.length - 1) % st.players.length); /* ضد عقارب الساعة */
      st.phase = RC.GamePhase.PLAYING;
      this._emit('TurnChanged', { playerId: st.currentSeat });
    }

    _newRoundStats() {
      const st = this.state;
      const stats = {
        roundNumber: st.roundNumber,
        strike: {}, rope: {}, doubleRope: {}, mesa: {},
        declarations: [],        // [{dealNumber, winnerTeamId, winnerPlayerId, points}]
        qa3a: { reyTeamId: null, asTeamId: null, noCaptureTeamId: null },
        cards: {}                // {teamId: {cards, points}}
      };
      for (let i = 0; i < st.teams.length; i++) {
        stats.strike[st.teams[i].id] = 0;
        stats.rope[st.teams[i].id] = 0;
        stats.doubleRope[st.teams[i].id] = 0;
        stats.mesa[st.teams[i].id] = 0;
      }
      return stats;
    }

    /* ---------------- التوزيع ---------------- */

    /** ترتيب التوزيع يبدأ دائماً من اللاعب المقابل للموزع (doc1 §1) */
    _dealOrder() {
      const st = this.state;
      const n = st.players.length;
      const start = (st.dealerSeat + n - 1) % n;   /* ضد عقارب الساعة */
      const order = [];
      for (let i = 0; i < n; i++) order.push(st.players[(start + i) % n]);
      return order;
    }

    _dealCards(perPlayer) {
      const st = this.state;
      const order = this._dealOrder();
      for (let i = 0; i < perPlayer; i++) {
        for (let j = 0; j < order.length; j++) {
          if (st.deck.length === 0) return;
          order[j].hand.push(st.deck.pop());
        }
      }
    }

    _dealInitial() {
      const st = this.state;
      st.phase = RC.GamePhase.INITIAL_DEAL;
      st.dealNumber++;
      this._dealCards(this.rules.cardsPerPlayerPerDeal);
      for (let i = 0; i < this.rules.initialTableCards; i++) {
        st.table.add(st.deck.pop());
      }
      this._emit('CardsDealt', {
        dealNumber: st.dealNumber, isRedeal: false,
        deckCount: st.deck.length,
        hands: this._handsPayload(),
        tableCardIds: st.table.cards.map(function (c) { return c.id; })
      });
      this._resolveDeclarations();
    }

    /** إعادة التوزيع عند نفاد أوراق اللاعبين (doc1 §7) */
    _dealNextHands() {
      const st = this.state;
      st.phase = RC.GamePhase.REDEAL;
      st.dealNumber++;
      this._dealCards(this.rules.cardsPerPlayerPerDeal);
      st.playedCardsInCurrentDeal = 0;
      // التوزيعة الجديدة تقطع أي تسلسل ضربة سابق
      st.strike.reset();
      st.lastPlayedCard = null;
      st.lastPlayedById = -1;
      st.lastPlayedCardResting = false;
      this.turnManager.setStartingSeat((st.dealerSeat + st.players.length - 1) % st.players.length); /* ضد عقارب الساعة */
      st.phase = RC.GamePhase.PLAYING;
      this._emit('CardsDealt', {
        dealNumber: st.dealNumber, isRedeal: true,
        deckCount: st.deck.length,
        hands: this._handsPayload(),
        tableCardIds: st.table.cards.map(function (c) { return c.id; })
      });
      this._resolveDeclarations();
      this._emit('TurnChanged', { playerId: st.currentSeat });
    }

    _handsPayload() {
      const st = this.state;
      const hands = {};
      for (let i = 0; i < st.players.length; i++) {
        hands[st.players[i].id] = st.players[i].hand.map(function (c) { return c.id; });
      }
      return hands;
    }

    /* ---------------- إعلانات الروندا/التريندا (doc1) ---------------- */

    _resolveDeclarations() {
      const st = this.state;
      if (!this.rules.declarationsOnEveryDeal && st.dealNumber > 1) return;

      const all = [];
      for (let i = 0; i < st.players.length; i++) {
        const p = st.players[i];
        const decls = this.declarationResolver.evaluate(p.hand, this.rules);
        for (let d = 0; d < decls.length; d++) {
          all.push(Object.assign({ playerId: p.id, teamId: p.teamId }, decls[d]));
        }
      }

      if (all.length === 0) {
        this._emit('DeclarationsResolved', {
          dealNumber: st.dealNumber, declarations: [],
          winnerPlayerId: null, winnerTeamId: null, awardedPoints: 0
        });
        return;
      }

      const winner = RC.DeclarationResolver.resolveFight(all);
      const points = this.rules.declarationWinnerTakesAll
        ? all.reduce(function (s, d) { return s + d.points; }, 0)
        : winner.points;

      const team = st.getTeam(winner.teamId);
      team.score += points;
      st.roundStats.declarations.push({
        dealNumber: st.dealNumber,
        winnerTeamId: winner.teamId,
        winnerPlayerId: winner.playerId,
        points: points
      });

      this._emit('DeclarationsResolved', {
        dealNumber: st.dealNumber,
        declarations: all,
        winnerPlayerId: winner.playerId,
        winnerTeamId: winner.teamId,
        awardedPoints: points
      });
      this._emit('ScoreChanged', {
        teamId: winner.teamId, score: team.score, reason: 'declaration'
      });
    }

    /* ---------------- لعب ورقة (doc2 §28) ---------------- */

    /**
     * تنفيذ أمر لعب ورقة — يتحقق من: المرحلة، الدور، ملكية الورقة.
     * ثم: التقاط + ميسا + ضربة/حبل/جوج حبال + نهاية التوزيعة/الجولة.
     * @param {number|PlayCardCommand} playerIdOrCommand
     * @param {number} [cardId]
     */
    playCard(playerIdOrCommand, cardIdArg) {
      let playerId, cardId;
      if (typeof playerIdOrCommand === 'object' && playerIdOrCommand !== null) {
        playerId = playerIdOrCommand.playerId;
        cardId = playerIdOrCommand.cardId;
      } else {
        playerId = playerIdOrCommand;
        cardId = cardIdArg;
      }

      this._batch = [];
      const st = this.state;
      if (st.phase !== RC.GamePhase.PLAYING && st.phase !== RC.GamePhase.DECLARATION) {
        throw new Error('GAME_NOT_ACCEPTING_PLAYS');
      }
      const player = st.getPlayer(playerId);
      if (player.seat !== st.currentSeat) throw new Error('NOT_PLAYERS_TURN');
      const idx = player.hand.findIndex(function (c) { return c.id === cardId; });
      if (idx < 0) throw new Error('CARD_NOT_IN_HAND');

      const card = player.hand[idx];

      this._emit('CardPlayed', {
        playerId: playerId, teamId: player.teamId,
        cardId: card.id, card: { id: card.id, rank: card.rank, suit: card.suit }
      });

      /* --- 1) تصنيف الحركة الخاصة (ضربة/حبل/جوج حبال) — doc1 الحالات الخاصة --- */
      const isSameAsLast = !!(st.lastPlayedCard && st.lastPlayedCard.rank === card.rank);
      let special = null;
      const strike = st.strike;

      if (isSameAsLast) {
        /* قانون الضربة: لا تُحتسب ضربةً إلا إذا كانت ورقة الخصم الأخيرة ما تزال
           ظاهرة على الطاولة (أي لعبها صاحبها دون التقاط شيء فاستقرّت، والآن
           تُلتقط). مثال التوضيح: إن التقط الخصمُ ورقةً برتبةٍ سبق أن كانت على
           الطاولة ثم رُدَّت بنفس الرتبة — لا تعتبر ضربةً لأن الورقة الأصلية لم
           تبقَ ظاهرة ليُضرب عليها. */
        if (strike.sequence === RC.SpecialSequence.NONE) {
          if (st.lastPlayedCardResting) {
            // ضربة: ورقة مشابهة لآخر ورقة لعبها الخصم مباشرة → +1
            special = 'STRIKE';
          }
        } else if (strike.sequence === RC.SpecialSequence.STRIKE &&
                   player.teamId === strike.preStrikeTeamId) {
          // حبل: صاحب الورقة الأصلية يرد بنفس الرتبة → +5
          special = 'ROPE';
        } else if (strike.sequence === RC.SpecialSequence.ROPE &&
                   player.teamId === strike.strikerTeamId) {
          // جوج حبال: صاحب الضربة يلعب الورقة الرابعة → +10
          special = 'DOUBLE_ROPE';
        }
      }

      /* --- 2) الالتقاط (CaptureResolver) --- */
      player.hand.splice(idx, 1);
      const captured = this.captureResolver.resolve(card, st.table.cards);
      let capturedTableCards = [];
      if (captured.length > 0) {
        capturedTableCards = captured.filter(function (c) { return c.id !== card.id; });
        st.table.removeMany(capturedTableCards);
        player.capturedCards.push(card);
        for (let i = 0; i < capturedTableCards.length; i++) {
          player.capturedCards.push(capturedTableCards[i]);
        }
        st.lastPlayerWhoCapturedId = player.id;
        this._emit('CardsCaptured', {
          playerId: playerId, teamId: player.teamId,
          cardIds: captured.map(function (c) { return c.id; }),
          cards: captured.map(function (c) { return { id: c.id, rank: c.rank, suit: c.suit }; })
        });
      } else {
        // لا يوجد مثلها على الطاولة → تبقى على الطاولة (doc1 §6)
        st.table.add(card);
      }

      /* --- 3) الميسا: التقاط كل أوراق الطاولة → +1 --- */
      if (captured.length > 0 && st.table.cards.length === 0) {
        const team = st.getTeam(player.teamId);
        team.score += this.rules.mesaPoints;
        st.roundStats.mesa[player.teamId]++;
        this._emit('Mesa', {
          playerId: playerId, teamId: player.teamId, points: this.rules.mesaPoints
        });
        this._emit('ScoreChanged', {
          teamId: player.teamId, score: team.score, reason: 'mesa'
        });
      }

      /* --- 4) تنفيذ النقاط الخاصة وآلة الحالات --- */
      if (special === 'STRIKE') {
        strike.sequence = RC.SpecialSequence.STRIKE;
        strike.rank = card.rank;
        strike.strikerTeamId = player.teamId;
        strike.preStrikeTeamId = st.getPlayer(st.lastPlayedById).teamId;
        /* صاحب الضربة يلتقط الورقتين (+ السلسلة إن وُجدت) — الالتقاط تمّ أعلاه
           في resolver، وهنا نتتبّع أوراق السلسلة لتنتقل لصاحب الحبل لاحقاً. */
        strike.holderPlayerId = player.id;
        strike.trickCardIds = captured.map(function (c) { return c.id; });
        this._awardSpecial(player, this.rules.strikePoints, 'strike');
        this._emit('Strike', {
          playerId: playerId, teamId: player.teamId,
          rank: card.rank, points: this.rules.strikePoints
        });
      } else if (special === 'ROPE') {
        /* صاحب الحبل يحصل على ورقتي الضربة + ورقة الحبل + السلسلة إن توفرت:
           ورقة الحبل لا تستقر على الطاولة بل تُضم لأوراق السلسلة، وتنتقل
           أوراق الضربة (+سلسلتها) من كيس الضارب إلى كيس صاحب الحبل. */
        strike.sequence = RC.SpecialSequence.ROPE;
        this._giveCycleCardTo(player, card, captured);
        this._transferCycleTrick(strike, player);
        strike.trickCardIds.push(card.id);
        for (let i = 0; i < capturedTableCards.length; i++) {
          strike.trickCardIds.push(capturedTableCards[i].id);
        }
        strike.holderPlayerId = player.id;
        this._awardSpecial(player, this.rules.ropePoints, 'rope');
        this._emit('Rope', {
          playerId: playerId, teamId: player.teamId,
          rank: card.rank, points: this.rules.ropePoints
        });
      } else if (special === 'DOUBLE_ROPE') {
        /* جوج حبال: صاحب الضربة يستعيد ورقتي الضربة + ورقة الحبل + ورقة الحبلين
           (+ السلسلة) من كيس صاحب الحبل، والورقة الرابعة تنضم إليها. */
        this._giveCycleCardTo(player, card, captured);
        this._transferCycleTrick(strike, player);
        strike.trickCardIds.push(card.id);
        for (let i = 0; i < capturedTableCards.length; i++) {
          strike.trickCardIds.push(capturedTableCards[i].id);
        }
        this._awardSpecial(player, this.rules.doubleRopePoints, 'doubleRope');
        this._emit('DoubleRope', {
          playerId: playerId, teamId: player.teamId,
          rank: card.rank, points: this.rules.doubleRopePoints
        });
        strike.reset(); // انتهاء السلسلة (4 أوراق مستهلكة)
      } else {
        // أي حركة لا تُكمل السلسلة تُصفّرها (تبقى الأوراق مع حاملها كالتقاط عادي)
        strike.reset();
      }

      /* --- 5) تحديث آخر ورقة ملعوبة --- */
      st.lastPlayedCard = { id: card.id, rank: card.rank, suit: card.suit };
      st.lastPlayedById = playerId;
      /* استقرّت الورقة على الطاولة إذا لم يلتقط صاحبها شيئاً (لا مثل لها) */
      st.lastPlayedCardResting = capturedTableCards.length === 0;
      st.playedCardsInCurrentDeal++;

      /* --- 6) قاعا راي / قاعا أص — على الرمية الأخيرة في اللعبة --- */
      const handsEmpty = st.players.every(function (p) { return p.hand.length === 0; });
      const isFinalThrow = handsEmpty && st.deck.length === 0;
      if (isFinalThrow) {
        this._applyFinalCardRules(player, capturedTableCards);
      }

      /* --- 7) نهاية التوزيعة / نهاية الجولة --- */
      if (handsEmpty) {
        if (st.deck.length > 0) {
          this._dealNextHands();
        } else {
          this._finalizeRound();
        }
        return this._takeBatch();
      }

      /* --- 8) تبديل الدور --- */
      this.turnManager.advance();
      this._emit('TurnChanged', { playerId: st.currentSeat });
      return this._takeBatch();
    }

    _awardSpecial(player, points, statKey) {
      const st = this.state;
      const team = st.getTeam(player.teamId);
      team.score += points;
      st.roundStats[statKey][player.teamId]++;
      this._emit('ScoreChanged', {
        teamId: player.teamId, score: team.score, reason: statKey
      });
    }

    /**
     * ورقة دور الحبل/جوج حبال الملعوبة: إذا لم تُلتقط من الطاولة (لا مثل لها
     * لأن أوراق الرتبة كلها في الأكياس) فلا تستقر على الطاولة — يضمّها صاحب
     * آخر ورقة مطابقة إلى كيسه مع بقية أوراق السلسلة.
     */
    _giveCycleCardTo(player, card, captured) {
      if (captured.length > 0) return;   // التُقطت عادياً وهي أصلاً في كيسه
      const st = this.state;
      st.table.removeCard(card);
      player.capturedCards.push(card);
    }

    /**
     * نقل أوراق السلسلة (ورقتا الضربة + السلسلة ثم ورقة الحبل...) من كيس
     * حاملها الحالي إلى كيس صاحب آخر ورقة مطابقة — «صاحب آخر ورقة مطابقة
     * يلتقط الأوراق المعنية جميعها».
     */
    _transferCycleTrick(strike, toPlayer) {
      if (strike.holderPlayerId < 0 || strike.holderPlayerId === toPlayer.id) return;
      const st = this.state;
      const fromPlayer = st.getPlayer(strike.holderPlayerId);
      const wanted = {};
      for (let i = 0; i < strike.trickCardIds.length; i++) wanted[strike.trickCardIds[i]] = true;
      const kept = [];
      for (let i = 0; i < fromPlayer.capturedCards.length; i++) {
        const c = fromPlayer.capturedCards[i];
        if (wanted[c.id]) toPlayer.capturedCards.push(c);
        else kept.push(c);
      }
      fromPlayer.capturedCards = kept;
    }

    /**
     * قاعا راي / قاعا أص (doc1 حساب النقاط + doc2 §35-36):
     *  - الموزع يلتقط 12 برميته الأخيرة → فريقه +5 (قاعا راي)
     *  - الموزع يلتقط 1 برميته الأخيرة → الخصم +5 (قاعا أص)
     *  - الموزع لا يلتقط شيئاً برميته الأخيرة → الخصم +5 (نفس شروط قاعا أص)
     *  - الموزع يلتقط 2-7/10/11 فقط → لا شيء
     *  - وضع «كلٌّ لنفسه» (3/4 لاعبين): إلزامات الموزع تخصّه هو فقط (قاعا راي)،
     *    ولا يوجد «خصم» واحد تُضاف له نقاط قاعا أص / عدم الالتقاط — فتُتجاهل.
     */
    _applyFinalCardRules(finalPlayer, capturedTableCards) {
      const st = this.state;
      const dealer = st.getPlayerBySeat(st.dealerSeat);
      if (dealer.id !== finalPlayer.id) return; // الرمية الأخيرة للموزع بحكم البناء

      const dealerTeam = st.getTeam(dealer.teamId);
      const capturedRanks = capturedTableCards.map(function (c) { return c.rank; });
      const capturedTwelve = capturedRanks.indexOf(12) >= 0;
      const capturedAce = capturedRanks.indexOf(1) >= 0;

      if (capturedTwelve) {
        dealerTeam.score += this.rules.dealerTwelveBonus;
        st.roundStats.qa3a.reyTeamId = dealer.teamId;
        this._emit('Qa3aRey', {
          playerId: dealer.id, teamId: dealer.teamId,
          points: this.rules.dealerTwelveBonus
        });
        this._emit('ScoreChanged', {
          teamId: dealer.teamId, score: dealerTeam.score, reason: 'qa3aRey'
        });
      }

      /* جائزتا «الخصم» (قاعا أص / عدم الالتقاط) لا تنطبقان إلا حين يوجد خصم واحد */
      if (st.teams.length !== 2) return;
      const opponentTeamId = st.teams.find(function (t) { return t.id !== dealer.teamId; }).id;
      const opponentTeam = st.getTeam(opponentTeamId);

      if (capturedAce) {
        opponentTeam.score += this.rules.opponentAceBonus;
        st.roundStats.qa3a.asTeamId = opponentTeamId;
        this._emit('Qa3aAs', {
          playerId: dealer.id, teamId: opponentTeamId,
          points: this.rules.opponentAceBonus, reason: 'ace'
        });
        this._emit('ScoreChanged', {
          teamId: opponentTeamId, score: opponentTeam.score, reason: 'qa3aAs'
        });
      }
      if (capturedTableCards.length === 0 && !capturedTwelve) {
        opponentTeam.score += this.rules.dealerNoCardBonus;
        st.roundStats.qa3a.noCaptureTeamId = opponentTeamId;
        this._emit('Qa3aAs', {
          playerId: dealer.id, teamId: opponentTeamId,
          points: this.rules.dealerNoCardBonus, reason: 'noCapture'
        });
        this._emit('ScoreChanged', {
          teamId: opponentTeamId, score: opponentTeam.score, reason: 'qa3aNoCapture'
        });
      }
    }

    /* ---------------- نهاية الجولة (doc2 §29-31) ---------------- */

    _finalizeRound() {
      const st = this.state;
      st.phase = RC.GamePhase.FINAL_CAPTURE;

      // الأوراق المتبقية على الطاولة → آخر لاعب التقط (doc1)
      if (st.table.cards.length > 0 && st.lastPlayerWhoCapturedId >= 0) {
        const last = st.getPlayer(st.lastPlayerWhoCapturedId);
        const remaining = st.table.cards.slice();
        for (let i = 0; i < remaining.length; i++) {
          last.capturedCards.push(remaining[i]);
        }
        st.table.clear();
        this._emit('FinalCardsAwarded', {
          playerId: last.id, teamId: last.teamId,
          cards: remaining.map(function (c) { return { id: c.id, rank: c.rank, suit: c.suit }; })
        });
      }

      // حساب الأوراق: كل ورقة فوق 20 = نقطة
      st.phase = RC.GamePhase.SCORING;
      for (let i = 0; i < st.teams.length; i++) {
        const team = st.teams[i];
        const res = this.scoring.teamCardPoints(st, team);
        st.roundStats.cards[team.id] = res;
        team.score += res.points;
        this._emit('ScoreChanged', {
          teamId: team.id, score: team.score, reason: 'cards'
        });
      }

      this._emit('RoundEnded', {
        roundNumber: st.roundNumber,
        breakdown: this._roundBreakdown()
      });

      /* «الرهان على جولة» (singleRoundMode): المباراة تنتهي بنهاية جولة كاملة
         للـ40 ورقة — الفائز أعلى النقاط، والتعادل التام يمدّد جولةً إضافية. */
      if (this.rules.singleRoundMode) {
        const ranked = st.teams.slice().sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return a.id - b.id;
        });
        const tie = ranked.length > 1 && ranked[1].score === ranked[0].score;
        if (!tie) {
          st.phase = RC.GamePhase.FINISHED;
          this._emit('GameEnded', {
            winnerTeamId: ranked[0].id,
            breakdown: this._roundBreakdown()
          });
          return;
        }
      } else {
        // الفائز: أول فريق يبلغ الهدف — وعند تعادل الوصول يفوز الأعلى،
        // وإن تساوى تماماً تستمر المباراة بجولة جديدة.
        const reached = st.teams.filter(function (t) { return t.score >= st.targetScore; });
        if (reached.length > 0) {
          reached.sort(function (a, b) { return b.score - a.score; });
          const tie = reached.length > 1 && reached[0].score === reached[1].score;
          if (!tie) {
            st.phase = RC.GamePhase.FINISHED;
            this._emit('GameEnded', {
              winnerTeamId: reached[0].id,
              breakdown: this._roundBreakdown()
            });
            return;
          }
        }
      }

      // جولة جديدة: تناوب الموزع
      st.dealerSeat = (st.dealerSeat + st.players.length - 1) % st.players.length; /* ضد عقارب الساعة */
      this._startRound();
    }

    _roundBreakdown() {
      const st = this.state;
      const rows = [];
      for (let i = 0; i < st.teams.length; i++) {
        const team = st.teams[i];
        const cards = st.roundStats.cards[team.id] || { cards: 0, points: 0 };
        const declPts = st.roundStats.declarations
          .filter(function (d) { return d.winnerTeamId === team.id; })
          .reduce(function (s, d) { return s + d.points; }, 0);
        rows.push({
          teamId: team.id,
          teamName: team.name,
          playerIds: team.playerIds.slice(),
          cardsCaptured: cards.cards,
          cardPoints: cards.points,
          declarationPoints: declPts,
          declarations: st.roundStats.declarations.filter(function (d) { return d.winnerTeamId === team.id; }),
          strikeCount: st.roundStats.strike[team.id] || 0,
          strikePoints: (st.roundStats.strike[team.id] || 0) * this.rules.strikePoints,
          ropeCount: st.roundStats.rope[team.id] || 0,
          ropePoints: (st.roundStats.rope[team.id] || 0) * this.rules.ropePoints,
          doubleRopeCount: st.roundStats.doubleRope[team.id] || 0,
          doubleRopePoints: (st.roundStats.doubleRope[team.id] || 0) * this.rules.doubleRopePoints,
          mesaCount: st.roundStats.mesa[team.id] || 0,
          mesaPoints: (st.roundStats.mesa[team.id] || 0) * this.rules.mesaPoints,
          qa3aRey: st.roundStats.qa3a.reyTeamId === team.id ? this.rules.dealerTwelveBonus : 0,
          qa3aAs: (st.roundStats.qa3a.asTeamId === team.id ? this.rules.opponentAceBonus : 0) +
                  (st.roundStats.qa3a.noCaptureTeamId === team.id ? this.rules.dealerNoCardBonus : 0),
          roundScore: 0,
          totalScore: team.score
        });
      }
      // نقاط الجولة = مجموع النقاط المحسوبة خلال الجولة
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        r.roundScore = r.cardPoints + r.declarationPoints + r.strikePoints +
                       r.ropePoints + r.doubleRopePoints + r.mesaPoints +
                       r.qa3aRey + r.qa3aAs;
      }
      return rows;
    }

    /* ---------------- Snapshot + Views (doc2 §43-44) ---------------- */

    /** لقطة كاملة للخادم (تحتوي يد كل لاعب — لا تُرسل للعميل أبداً) */
    getSnapshot() {
      return JSON.parse(JSON.stringify({
        seed: this.seed,
        rules: this.rules,
        seq: this._seq,
        state: this.state
      }));
    }

    /**
     * View مفلتر للاعب — لا يُظهر يد الخصم ولا محتوى الرزمة (doc2 §44).
     * هذا هو الكائن الوحيد الذي تتلقاه واجهة اللاعب في منصة أونلاين.
     */
    getView(playerId) {
      const st = this.state;
      const me = st.getPlayer(playerId);
      return {
        mode: st.mode,
        phase: st.phase,
        roundNumber: st.roundNumber,
        dealNumber: st.dealNumber,
        targetScore: st.targetScore,
        dealerSeat: st.dealerSeat,
        currentPlayerId: st.currentSeat,
        myPlayerId: playerId,
        deckCount: st.deck.length,
        tableCards: st.table.cards.map(function (c) { return { id: c.id, rank: c.rank, suit: c.suit }; }),
        myHand: me.hand.map(function (c) { return { id: c.id, rank: c.rank, suit: c.suit }; }),
        myCaptured: me.capturedCards.map(function (c) { return { id: c.id, rank: c.rank, suit: c.suit }; }),
        players: st.players.map(function (p) {
          return {
            id: p.id, seat: p.seat, teamId: p.teamId, name: p.name,
            handCount: p.hand.length,
            capturedCount: p.capturedCount,
            capturedRanks: p.capturedCards.map(function (c) { return c.rank; })
          };
        }),
        teams: st.teams.map(function (t) {
          return { id: t.id, name: t.name, score: t.score, playerIds: t.playerIds.slice() };
        }),
        lastPlayedCard: st.lastPlayedCard ? Object.assign({}, st.lastPlayedCard) : null,
        lastPlayedById: st.lastPlayedById,
        lastPlayedCardResting: !!st.lastPlayedCardResting,
        strike: {
          sequence: st.strike.sequence,
          rank: st.strike.rank,
          strikerTeamId: st.strike.strikerTeamId,
          preStrikeTeamId: st.strike.preStrikeTeamId
        }
      };
    }

    _takeBatch() {
      const b = this._batch;
      this._batch = null;
      return b || [];
    }
  }

  /* ==========================================================================
   *  RondaAI — ذكاء اصطناعي عادل (يرى View اللاعب فقط، لا يغش)
   *  (doc2 §45: CaptureEvaluator + StrikeEvaluator + RopeEvaluator + MesaEvaluator)
   * ========================================================================== */

  const RondaAI = {
    /**
     * يختار أفضل ورقة قانونية للاعب.
     * @returns {number|null} cardId
     */
    chooseCard: function (game, playerId) {
      const view = game.getView(playerId);
      if (view.phase !== RC.GamePhase.PLAYING) return null;
      let best = null, bestScore = -Infinity;
      for (let i = 0; i < view.myHand.length; i++) {
        const card = view.myHand[i];
        const s = this.evaluateMove(view, card);
        if (s > bestScore) { bestScore = s; best = card; }
      }
      return best ? best.id : null;
    },

    /** تقييم لعب ورقة معينة (قيمة تقديرية) */
    evaluateMove: function (view, card) {
      const capture = new RC.CaptureResolver().resolve(card, view.tableCards);
      const capturedTable = capture.filter(function (c) { return c.id !== card.id; });
      const myTeam = view.players.find(function (p) { return p.id === view.lastPlayedById; });
      const me = view.players.find(function (p) { return p.id === view.myPlayerId; });

      let score = capturedTable.length * 2;              // التقاط أوراق أكثر
      if (capture.length > 0 && view.tableCards.length === capturedTable.length) {
        score += 4;                                      // فرصة ميسا
      }

      // الضربة/الحبل/جوج حبال
      const lp = view.lastPlayedCard;
      if (lp && lp.rank === card.rank) {
        const seq = view.strike.sequence;
        /* الضربة لا تكون ضربة إلا إذا كانت ورقة الخصم الأخيرة ما تزال ظاهرة */
        const lpResting = view.tableCards.some(function (t) { return lp && t.id === lp.id; });
        if (seq === RC.SpecialSequence.NONE && lpResting) {
          score += 3;                                    // ضربة +1
        } else if (seq === RC.SpecialSequence.STRIKE &&
                   me && view.strike.preStrikeTeamId === me.teamId) {
          score += 15;                                   // حبل +5
        } else if (seq === RC.SpecialSequence.ROPE &&
                   me && view.strike.strikerTeamId === me.teamId) {
          score += 25;                                   // جوج حبال +10
        }
      }

      if (capturedTable.length === 0) {
        // الورقة ستبقى على الطاولة: قياس خطر التقاطها/الضربة عليها من الخصم
        const myCopies = view.myHand.filter(function (c) { return c.rank === card.rank; }).length;
        const tableCopies = view.tableCards.filter(function (c) { return c.rank === card.rank; }).length;
        let capturedCopies = 0;
        for (let i = 0; i < view.players.length; i++) {
          const ranks = view.players[i].capturedRanks;
          for (let j = 0; j < ranks.length; j++) if (ranks[j] === card.rank) capturedCopies++;
        }
        const unseenCopies = Math.max(0, 4 - myCopies - tableCopies - capturedCopies);
        const opponents = view.players.filter(function (p) { return p.teamId !== (me ? me.teamId : -1); });
        const oppHandCards = opponents.reduce(function (s, p) { return s + p.handCount; }, 0);
        const totalUnseen = oppHandCards + view.deckCount;
        const expectedOppCopies = totalUnseen > 0
          ? (unseenCopies / totalUnseen) * oppHandCards
          : 0;
        score -= expectedOppCopies * 2.2;                // خطر الالتقاط/الضربة
        const nx = RC.nextRank(card.rank);
        if (nx && view.tableCards.some(function (c) { return c.rank === nx; })) {
          score -= 1.5;                                  // تعريض بداية سلسلة للخصم
        }
      }

      // كسر التعادل بشكل حتمي
      return score + (card.id % 7) * 0.001;
    }
  };

  /* ==========================================================================
   *  Export
   * ========================================================================== */

  return {
    RondaGame: RondaGame,
    RondaAI: RondaAI
  };
});

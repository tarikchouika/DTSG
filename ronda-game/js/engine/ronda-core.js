/**
 * ============================================================================
 *  RONDA GAME CORE — المحرك الأساسي للعبة الروندا المغربية
 * ============================================================================
 *  محرك حتمي (Deterministic) مستقل تماماً عن الواجهة والشبكة، قابل للتشغيل في:
 *  المتصفح (window.RondaCore) + Node.js (module.exports) + خادم أونلاين.
 *
 *  المعمارية (طبقاً لوثيقة "RONDA GAME CORE — Professional Architecture"):
 *    1. Domain   : Card, CardRank, CardSuit, Player, Team, Table, State
 *    2. Random   : SeededRng حتمي (mulberry32) + خلط Fisher-Yates
 *    3. Deck     : RondaDeckFactory (40 ورقة)
 *    4. Rules    : RondaRulesConfig, CaptureResolver, DeclarationResolver,
 *                  ScoringEngine (كل قاعدة في Resolver مستقل)
 *    5. Flow     : TurnManager
 *    6. Commands : PlayCardCommand
 *
 *  لا يعرف هذا الملف أي شيء عن DOM أو الشبكة — إصدار الأحداث والتحقق من صحة
 *  الحركات يتم داخل RondaGame (انظر ronda-game.js).
 * ============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RondaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==========================================================================
   * 1) DOMAIN — نماذج اللعبة
   * ========================================================================== */

  /** الأنواع الأربعة للأوراق (البطاقة المغربية/الإسبانية) */
  const CardSuit = Object.freeze({
    KHAL:   'KHAL',    // الخال (سيوف)
    KOBBAS: 'KOBBAS',  // الكوباس (كؤوس)
    CHBADA: 'CHBADA',  // شبادا (هراوات)
    DHAB:   'DHAB'     // دهاب (ذهب/دراهم)
  });

  const SUIT_ORDER = Object.freeze([
    CardSuit.KHAL, CardSuit.KOBBAS, CardSuit.CHBADA, CardSuit.DHAB
  ]);

  /** الرتب: لا توجد 8 و 9 في الروندا */
  const CardRank = Object.freeze({
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
    SIX: 6, SEVEN: 7, TEN: 10, ELEVEN: 11, TWELVE: 12
  });

  /**
   * ترتيب التتابع في الالتقاط — نقطة جوهرية:
   * 1 → 2 → 3 → 4 → 5 → 6 → 7 → 10 → 11 → 12
   * (الـ 7 متصلة بالـ 10 مباشرة)
   */
  const RANK_SEQUENCE = Object.freeze([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);

  function rankSequenceIndex(rank) {
    return RANK_SEQUENCE.indexOf(rank);
  }

  /** الرتبة التالية في سلسلة التتابع (12 → null) */
  function nextRank(rank) {
    const i = rankSequenceIndex(rank);
    if (i < 0 || i >= RANK_SEQUENCE.length - 1) return null;
    return RANK_SEQUENCE[i + 1];
  }

  /** ورقة ثابتة (frozen) — id من 0 إلى 39 بترتيب (نوع × رتبة) */
  function makeCard(id, rank, suit) {
    return Object.freeze({ id: id, rank: rank, suit: suit });
  }

  function cardLabel(card) {
    return card.suit + '-' + card.rank;
  }

  /**
   * وضع اللعب:
   *   HEAD_TO_HEAD : 1ضد1 — لاعبان، كل لاعب فريقٌ وحده.
   *   TEAM_VS_TEAM : 2ضد2 — أربعة لاعبين في فريقين (المقعدان 0,2 ضد 1,3).
   *   FREE_FOR_ALL : كل لاعب لنفسه — 3 أو 4 لاعبين (playerCount) وكل مقعد فريقٌ
   *                  مستقل؛ يُستعمل للأنماط «1ضد2» و«1ضد3» (ضد الكمبيوتر أو
   *                  وجهاً لوجه على نفس الجهاز).
   */
  const GameMode = Object.freeze({
    HEAD_TO_HEAD: 'HeadToHead',
    TEAM_VS_TEAM: 'TeamVsTeam',
    FREE_FOR_ALL: 'FreeForAll'
  });

  /** مراحل المباراة (State Machine) */
  const GamePhase = Object.freeze({
    WAITING:        'WaitingForPlayers',
    INITIAL_DEAL:   'InitialDeal',
    DECLARATION:    'Declaration',
    PLAYING:        'Playing',
    REDEAL:         'Redeal',
    FINAL_CAPTURE:  'FinalCapture',
    SCORING:        'Scoring',
    FINISHED:       'Finished'
  });

  /** آلة حالات الضربة: NONE → STRIKE → ROPE → DOUBLE_ROPE */
  const SpecialSequence = Object.freeze({
    NONE:        'None',
    STRIKE:      'Strike',
    ROPE:        'Rope',
    DOUBLE_ROPE: 'DoubleRope'
  });

  /** الإعلانات: روندا (2 متشابهة) / تريندا (3) / كوادرا (4 — قابلة للتعطيل) */
  const DeclarationType = Object.freeze({
    NONE:   'None',
    RONDA:  'Ronda',
    TRENDA: 'Trenda',
    QUADRA: 'Quadra'
  });

  /** لاعب: يد + أوراق ملتقطة (الأوراق تبقى ملكاً للاعب حتى في وضع الزوجين) */
  class Player {
    constructor(id, seat, teamId, name) {
      this.id = id;
      this.seat = seat;
      this.teamId = teamId;
      this.name = name || ('P' + (id + 1));
      this.hand = [];            // List<Card>
      this.capturedCards = [];   // List<Card>
    }
    get capturedCount() { return this.capturedCards.length; }
    cardsOfRank(rank) {
      return this.hand.filter(function (c) { return c.rank === rank; });
    }
  }

  /** فريق: في 1v1 فريق = لاعب واحد، في 2v2 فريق = لاعبان */
  class Team {
    constructor(id, name) {
      this.id = id;
      this.name = name || ('Team ' + id);
      this.playerIds = [];
      this.score = 0;
    }
  }

  /** طاولة اللعب */
  class Table {
    constructor() { this.cards = []; }
    add(card) { this.cards.push(card); }
    removeCard(card) {
      const i = this.cards.findIndex(function (c) { return c.id === card.id; });
      if (i >= 0) this.cards.splice(i, 1);
    }
    removeMany(cards) {
      for (let i = 0; i < cards.length; i++) this.removeCard(cards[i]);
    }
    clear() { this.cards.length = 0; }
    hasRank(rank) {
      return this.cards.some(function (c) { return c.rank === rank; });
    }
  }

  /** سياق الضربة/الحبل — آلة الحالات المتسلسلة (doc2 §21, §23) */
  class StrikeContext {
    constructor() { this.reset(); }
    reset() {
      this.sequence = SpecialSequence.NONE;
      this.rank = null;             // رتبة الورقة المعنية
      this.strikerTeamId = -1;      // الفريق الذي نفّذ "الضربة"
      this.preStrikeTeamId = -1;    // الفريق الذي لعب الورقة قبل الضربة (صاحب الحبل)
      this.holderPlayerId = -1;     // اللاعب الذي يحمل حالياً أوراق السلسلة (الضربة ← الحبل ← جوج حبال)
      this.trickCardIds = [];       // أوراق السلسلة المتنقلة: الورقتان (+السلسلة) ثم تنضم ورقة الحبل...
    }
  }

  /** حالة اللعبة الكاملة — قابلة للحفظ والاستعادة (Authoritative State) */
  class RondaGameState {
    constructor(mode) {
      this.mode = mode;
      this.phase = GamePhase.WAITING;
      this.dealerSeat = -1;
      this.currentSeat = -1;
      this.lastPlayerWhoCapturedId = -1;
      this.lastPlayedCard = null;      // آخر ورقة رُميت فعلياً
      this.lastPlayedById = -1;        // من رمى آخر ورقة
      this.lastPlayedCardResting = false; // هل ورقة آخر لاعب ما تزال على الطاولة؟
                                           // (الضربة تتطلب أن تكون الورقة المراد
                                           //  ضربها ظاهرة على الطاولة — راجع
                                           //  «قانون الضربة» في playCard)
      this.playedCardsInCurrentDeal = 0;
      this.roundNumber = 0;
      this.dealNumber = 0;
      this.deck = [];                  // List<Card>
      this.table = new Table();
      this.players = [];               // List<Player>
      this.teams = [];                 // List<Team>
      this.strike = new StrikeContext();
      this.roundStats = null;          // إحصائيات الجولة الحالية (للنتيجة التفصيلية)
    }
    getPlayer(id) {
      const p = this.players.find(function (x) { return x.id === id; });
      if (!p) throw new Error('Unknown player: ' + id);
      return p;
    }
    getPlayerBySeat(seat) {
      const p = this.players.find(function (x) { return x.seat === seat; });
      if (!p) throw new Error('Unknown seat: ' + seat);
      return p;
    }
    getTeam(id) {
      const t = this.teams.find(function (x) { return x.id === id; });
      if (!t) throw new Error('Unknown team: ' + id);
      return t;
    }
  }

  /* ==========================================================================
   * 2) RANDOM — RNG حتمي بإعادة إنتاج كاملة (أساسي للأونلاين والـ Replay)
   * ========================================================================== */

  /** mulberry32 — PRNG صغير سريع حتمي */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class SeededRng {
    constructor(seed) {
      this.seed = seed >>> 0;
      this._next = mulberry32(this.seed);
    }
    /** عدد صحيح في [minInclusive, maxExclusive) */
    nextInt(minInclusive, maxExclusive) {
      return minInclusive + Math.floor(this._next() * (maxExclusive - minInclusive));
    }
    nextFloat() { return this._next(); }
  }

  /** خلط Fisher-Yates حتمي بناءً على الـ RNG */
  function shuffle(cards, rng) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = rng.nextInt(0, i + 1);
      const tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp;
    }
  }

  /* ==========================================================================
   * 3) DECK — مصنع الـ 40 ورقة
   * ========================================================================== */

  const RondaDeckFactory = {
    /** 4 أنواع × 10 رتب = 40 ورقة، id من 0 إلى 39 */
    create: function () {
      const deck = [];
      let id = 0;
      for (let s = 0; s < SUIT_ORDER.length; s++) {
        for (let r = 0; r < RANK_SEQUENCE.length; r++) {
          deck.push(makeCard(id++, RANK_SEQUENCE[r], SUIT_ORDER[s]));
        }
      }
      return deck;
    }
  };

  /* ==========================================================================
   * 4) RULES — كل قاعدة في Resolver مستقل (doc2 §49: لا Hardcoded إعدادات)
   * ========================================================================== */

  class RondaRulesConfig {
    /**
     * @param {object} [settings] تجاوزات اختيارية (مثال: {targetScore: 51})
     *   تُقبل فقط المفاتيح المعروفة — البقية تُتجاهل.
     */
    constructor(settings) {
      this.cardsPerPlayerPerDeal = 3;   // 3 أوراق لكل لاعب في كل توزيعة
      this.initialTableCards = 4;       // 4 أوراق مكشوفة على الطاولة بدايةً

      this.mesaPoints = 1;              // ميسا: التقاط كل الطاولة
      this.strikePoints = 1;            // ضربة
      this.ropePoints = 5;              // حبل
      this.doubleRopePoints = 10;       // جوج حبال

      this.rondaPoints = 1;             // روندا (ورقتان متشابهتان)
      this.trendaPoints = 3;            // تريندا (3 متشابهات)
      this.quadraPoints = 4;            // كوادرا (4 — تحتاج allowQuadraDeclaration)
      this.allowQuadraDeclaration = false; // اليد 3 أوراق فقط فلا تتحقق عملياً
      this.declarationWinnerTakesAll = true; // الفوز بمجموع نقاط كل الإعلانات (doc1)
      this.declarationsOnEveryDeal = true;   // الإعلان بعد كل توزيعة لا الأولى فقط

      this.cardsScoreThreshold = 20;    // الأوراق فوق 20 تحتسب نقاطاً
      this.targetScore = 41;            // 41 / 51 / 61
      this.singleRoundMode = false;     // «الرهان على جولة»: المباراة = جولة واحدة
                                        // (توزيع كامل للـ40 ورقة)؛ الفائز أعلى
                                        // النقاط عند نهايتها، والتعادل يستمر لجولة
                                        // إضافية حتى ينفرد متصدّر.

      this.dealerTwelveBonus = 5;       // قاعا راي: الموزع يلتقط 12 برميته الأخيرة
      this.opponentAceBonus = 5;        // قاعا أص: الموزع يلتقط 1 برميته الأخيرة
      this.dealerNoCardBonus = 5;       // الموزع لا يلتقط شيئاً برميته الأخيرة → الخصم +5

      if (settings) {
        for (const key of Object.keys(settings)) {
          if (Object.prototype.hasOwnProperty.call(this, key) && settings[key] !== undefined) {
            this[key] = settings[key];
          }
        }
      }
      Object.freeze(this);
    }
  }

  /**
   * CaptureResolver — جوهر الروندا (doc2 §14-16):
   * الورقة الملعوبة تلتقط كل نسخ الطاولة من نفس الرتبة ثم كل السلسلة المتتابعة
   * (1→2→…→7→10→11→12) وتتوقف عند أول رتبة مفقودة. يأخذ "الكل" عند تعدد النسخ.
   * ملاحظة: التتابع مرتبط بالرتب لا بمواقع الأوراق على الطاولة.
   */
  class CaptureResolver {
    resolve(playedCard, tableCards) {
      const hasMatch = tableCards.some(function (c) { return c.rank === playedCard.rank; });
      if (!hasMatch) return [];

      const result = [playedCard];
      let current = playedCard.rank;
      while (true) {
        for (let i = 0; i < tableCards.length; i++) {
          if (tableCards[i].rank === current) result.push(tableCards[i]);
        }
        const nx = nextRank(current);
        if (nx === null) break;
        if (!tableCards.some(function (c) { return c.rank === nx; })) break;
        current = nx;
      }
      // إزالة التكرارات (الورقة الملعوبة مرة واحدة)
      const seen = Object.create(null);
      const distinct = [];
      for (let i = 0; i < result.length; i++) {
        if (!seen[result[i].id]) { seen[result[i].id] = true; distinct.push(result[i]); }
      }
      return distinct;
    }
  }

  /**
   * DeclarationResolver — إعلانات بداية التوزيعة (doc2 §32-34):
   * روندا = 1 نقطة، تريندا = 3 نقاط، كوادرا = 4 (قابلة للتعطيل).
   * القوة: Quadra > Trenda > Ronda، وعند التساوي في النوع تنحسم برتبة أعلى.
   */
  class DeclarationResolver {
    evaluate(hand, config) {
      const groups = Object.create(null);
      for (let i = 0; i < hand.length; i++) {
        const r = hand[i].rank;
        (groups[r] = groups[r] || []).push(hand[i]);
      }
      const declarations = [];
      for (const rankStr of Object.keys(groups)) {
        const rank = Number(rankStr);
        const count = groups[rankStr].length;
        if (count >= 4 && config.allowQuadraDeclaration) {
          declarations.push({
            type: DeclarationType.QUADRA, rank: rank,
            points: config.quadraPoints, typeStrength: 4
          });
        } else if (count === 3) {
          declarations.push({
            type: DeclarationType.TRENDA, rank: rank,
            points: config.trendaPoints, typeStrength: 3
          });
        } else if (count === 2) {
          declarations.push({
            type: DeclarationType.RONDA, rank: rank,
            points: config.rondaPoints, typeStrength: 1
          });
        }
      }
      return declarations;
    }

    /** حسم التنافس على الإعلان: النوع الأقوى ثم الرتبة الأعلى (doc2 Q&A) */
    static resolveFight(allDeclarations) {
      if (!allDeclarations || allDeclarations.length === 0) return null;
      const sorted = allDeclarations.slice().sort(function (a, b) {
        if (b.typeStrength !== a.typeStrength) return b.typeStrength - a.typeStrength;
        return b.rank - a.rank;
      });
      return sorted[0];
    }
  }

  /** ScoringEngine — حساب الأوراق والفائز (doc2 §31, §37) */
  class ScoringEngine {
    constructor(config) { this.config = config; }

    /** أوراق الفريق فوق العتبة (20) = نقاط */
    teamCardPoints(state, team) {
      let cards = 0;
      for (let i = 0; i < team.playerIds.length; i++) {
        cards += state.getPlayer(team.playerIds[i]).capturedCount;
      }
      return { cards: cards, points: Math.max(0, cards - this.config.cardsScoreThreshold) };
    }

    hasWinner(state) {
      return state.teams.some(function (t) { return t.score >= state.targetScore; });
    }
  }

  /* ==========================================================================
   * 5) FLOW — TurnManager (doc2 §24)
   * ========================================================================== */

  class TurnManager {
    constructor(state) { this.state = state; }
    get currentPlayerId() { return this.state.currentSeat; }
    setStartingSeat(seat) { this.state.currentSeat = seat; }
    advance() {
      /* [اتجاه الدور] الروندا المغربية تُلعب عكس اتجاه عقارب الساعة:
         الدور ينتقل إلى الجالس على يسار صاحب الدور (بالنسبة لمشاهد اللوحة:
         من الأسفل-يسار إلى الأعلى-يسار ثم الأعلى-يمين ثم الأسفل-يمين). */
      const n = this.state.players.length;
      this.state.currentSeat = (this.state.currentSeat + n - 1) % n;
    }
    isPlayerTurn(playerId) {
      const p = this.state.getPlayer(playerId);
      return p.seat === this.state.currentSeat;
    }
  }

  /* ==========================================================================
   * 6) COMMANDS — نظام الأوامر (doc2 §25, §42: Client لا يقرر شيئاً)
   * ========================================================================== */

  /** أمر لعب ورقة — الواجهة/الشبكة ترسل هذا فقط، والمحرك يتحقق من كل شيء */
  class PlayCardCommand {
    constructor(playerId, cardId) {
      this.type = 'PlayCard';
      this.playerId = playerId;
      this.cardId = cardId;
    }
  }

  /* ==========================================================================
   * Export
   * ========================================================================== */

  return {
    // Domain
    CardSuit: CardSuit,
    SUIT_ORDER: SUIT_ORDER,
    CardRank: CardRank,
    RANK_SEQUENCE: RANK_SEQUENCE,
    rankSequenceIndex: rankSequenceIndex,
    nextRank: nextRank,
    makeCard: makeCard,
    cardLabel: cardLabel,
    GameMode: GameMode,
    GamePhase: GamePhase,
    SpecialSequence: SpecialSequence,
    DeclarationType: DeclarationType,
    Player: Player,
    Team: Team,
    Table: Table,
    StrikeContext: StrikeContext,
    RondaGameState: RondaGameState,
    // Random
    SeededRng: SeededRng,
    shuffle: shuffle,
    // Deck
    RondaDeckFactory: RondaDeckFactory,
    // Rules
    RondaRulesConfig: RondaRulesConfig,
    CaptureResolver: CaptureResolver,
    DeclarationResolver: DeclarationResolver,
    ScoringEngine: ScoringEngine,
    // Flow
    TurnManager: TurnManager,
    // Commands
    PlayCardCommand: PlayCardCommand
  };
});

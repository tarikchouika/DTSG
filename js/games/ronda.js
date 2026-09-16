/* ═══════════════════════════════════════════
   FLAT DOG · فلات دوغ — Card guessing game
   محرك اللعبة — تخمين الورقة قبل الموزع
   (سابقاً Moroccan Ronda — نفس المنطق، هوية وتصميم جديد)
   ═══════════════════════════════════════════ */
"use strict";
let RN_ADAPTER = null;

/* ── الرموز المغاربية (أوراق اللعب الإسبانية المغربية) ──
   A = الدنانير (ذهب) ◆   B = الكؤوس ♥   C = السيوف ♠   D = الصولجان ♣ */
const RN_SUITS = {
  A: { glyph: '◆', name: 'suitA', dark: '#F5C518', face: '#C27803' },
  B: { glyph: '♥', name: 'suitB', dark: '#EF4444', face: '#DC2626' },
  C: { glyph: '♠', name: 'suitC', dark: '#CBD5E1', face: '#1E293B' },
  D: { glyph: '♣', name: 'suitD', dark: '#34D399', face: '#059669' }
};
/* [ES] أيقونات الرموز الحقيقية من أوراق «1» الإسبانية — تُعرض بدل الرموز النصية */
const RN_SYM_IMG = {
  A: 'assets/cards/es/sym-oros.webp',
  B: 'assets/cards/es/sym-copas.webp',
  C: 'assets/cards/es/sym-espadas.webp',
  D: 'assets/cards/es/sym-bastos.webp'
};
function rnSymHTML(k, size) {
  const s = RN_SUITS[k] || RN_SUITS.A;
  const src = RN_SYM_IMG[k];
  if (src) return '<img class="fd-sym-img" src="' + src + '" alt="' + s.glyph + '" draggable="false"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>';
  return '<span style="color:' + s.dark + '">' + s.glyph + '</span>';
}
const RN_NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/* ── أوراق فلات دوغ الحقيقية: الورق الإسباني التقليدي 40 ورقة (assets/cards/es) ──
   A=الدنانير oros، B=الكؤوس copas، C=السيوف espadas، D=الصولجان bastos
   الأرقام كما هي: 1..7 و10(الشاب)/11(الفارس)/12(الملك) */
const RN_ASSET_SUIT = { A: 'oros', B: 'copas', C: 'espadas', D: 'bastos' };
function rnCardAsset(n, s) {
  return 'assets/cards/es/' + n + '-' + (RN_ASSET_SUIT[s] || 'oros') + '.webp';
}
/* ── الواجهة ── */
function eRonda(g) {
  return '<div class="stage" id="rnContainer"></div>';
}
function initRonda() {
  if (RN_ADAPTER) {
    try { RN_ADAPTER.destroy(); } catch (e) {}
  }
  RN_ADAPTER = new RondaPlatformAdapter();
  RN_ADAPTER.start('rnContainer');
  /* الغرف: وضع جماعي بأدوار دائرية (الموزع/المتخمن/منتظر/مشاهد) */
  if (typeof Rooms !== 'undefined' && Rooms.setGameHandler) {
    Rooms.setGameHandler(RN_roomMove);
    Rooms.setStartHandler(RN_roomStart);
  }
  if (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.game_id === 'rn') {
    RN_ADAPTER.enterRoom(Rooms.state);
  }
}
/* ── أدوات وضع الغرفة ── */
function rnMe() {
  return (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
}
function rnEsc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
/* دوران دائري: فوز المتخمن → يصبح موزعاً والموزع لآخر الترتيب؛ خسارته → يذهب لآخر الترتيب */
function rnRotate(order, selectorWon) {
  if (!order || order.length < 2) return (order || []).slice();
  if (selectorWon) return order.slice(1).concat(order[0]);
  return [order[0]].concat(order.slice(2)).concat([order[1]]);
}
/* ── فئة الورقة ── */
class Card {
  constructor(n, s, i) {
    this.number = n;
    this.symbol = s;
    this.deckIndex = i;
    this.id = n + '-' + s;
  }
  equals(o) {
    return o && this.number === o.number && this.symbol === o.symbol;
  }
  matchNumber(o) {
    return o && this.number === o.number;
  }
}
/* ── مصنع الأوراق (40 ورقة مغاربية) ── */
class CardFactory {
  static buildDeck() {
    const d = [];
    let idx = 0;
    RN_NUMS.forEach(n => {
      Object.keys(RN_SUITS).forEach(s => {
        d.push(new Card(n, s, idx++));
      });
    });
    return d;
  }
}
/* ── مولد عشوائي ── */
/* PRNG حتمي (mulberry32) لمزامنة المجموعة في الغرف عبر بذرة مشتركة */
function mulberry32(a) {
  a |= 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class LocalRandomProvider {
  constructor(seed) {
    this._fn = null;
    if (seed !== undefined && seed !== null) this.setSeed(seed);
  }
  setSeed(seed) {
    this._fn = mulberry32(seed >>> 0);
  }
  next(max) {
    if (this._fn) return Math.floor(this._fn() * max);
    return Math.floor(Math.random() * max);
  }
}
/* ── مدير المجموعة ── */
class DeckManager {
  constructor(rng) {
    this.rng = rng;
    this.deck = [];
    this.shuffleId = '';
  }
  createDeck() {
    this.deck = CardFactory.buildDeck();
    this.shuffle();
    return this;
  }
  shuffle() {
    this.shuffleId = 'S-' + Math.random().toString(36).slice(2, 10);
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = this.rng.next(i + 1);
      const t = this.deck[i];
      this.deck[i] = this.deck[j];
      this.deck[j] = t;
    }
  }
  draw() {
    return this.deck.shift();
  }
  remaining() {
    return this.deck.length;
  }
}
/* ── نظام الأحداث ── */
class EventEmitter {
  constructor() {
    this.handlers = {};
  }
  on(e, f) {
    if (!this.handlers[e]) this.handlers[e] = [];
    this.handlers[e].push(f);
  }
  emit(e, d) {
    (this.handlers[e] || []).forEach(f => f(d));
  }
}
/* ── محرك اللعبة ── */
class RondaGame extends EventEmitter {
  constructor(opts) {
    super();
    this.rng = opts.rng || new LocalRandomProvider();
    this.deck = new DeckManager(this.rng);
    this.state = 'BOOT';
    this.mode = null;
    this.myRole = 'selector';
    this.selection = null;
    this.roundId = 0;
    this.bet = 10;
    this.multiplayer = !!opts.multiplayer;
    this._lastWinner = null;
    this._pendingPick = null;
    this.stats = { selectorWins: 0, dealerWins: 0, totalRounds: 0 };
    this.roundResults = []; /* نتائج الجولات من منظور اللاعب */
  }
  start() {
    this.state = 'IDLE';
    this.emit('STATE_CHANGED', { to: 'IDLE' });
  }
  /* ترتيب الورقة لتحديد الموزع: الرقم ثم الرمز (A<B<C<D) */
  static cardRank(c) {
    const numRank = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 10: 8, 11: 9, 12: 10 };
    const suitRank = { A: 0, B: 1, C: 2, D: 3 };
    return (numRank[c.number] || 0) * 4 + (suitRank[c.symbol] || 0);
  }
  /* توزيع ورقة لكل لاعب لتحديد الموزع (الأعلى). يفترض أن البذرة ضُبطت.
     يُعيد {cards (محاذية للترتيب الأصلي), dealerIdx, order (الموزع أولاً)} */
  dealForDealer(order) {
    const tmp = new DeckManager(this.rng);
    tmp.createDeck();
    const cards = order.map(function () { const c = tmp.draw(); return { num: c.number, sym: c.symbol }; });
    let best = 0;
    for (let i = 1; i < cards.length; i++) {
      const a = { number: cards[i].num, symbol: cards[i].sym };
      const b = { number: cards[best].num, symbol: cards[best].sym };
      if (RondaGame.cardRank(a) > RondaGame.cardRank(b)) best = i;
    }
    return { cards: cards, dealerIdx: best, order: order.slice(best).concat(order.slice(0, best)) };
  }
  /* اختيار الوضع (مفرد): يخصم الرهان فوراً ويُسقط أرقام الاختيار — بلا قوائم سوداء */
  chooseMode(m) {
    if (this.dead) return;
    if (this.multiplayer) { this.mode = m; this.emit('MODE_CHOSEN', { mode: m }); return; }
    this.mode = m;
    if (!this._chargeBet()) return;
    this.roundId++;
    this.selection = null;
    this.deck.createDeck();
    this.state = 'SELECTING';
    this.emit('MODE_CHOSEN', { mode: m });
    this.emit('SELECTION_REQUIRED', {});
  }
  /* بدء جولة جديدة بعد سؤال «راهن/انسحب» — يُبقي الوضع نفسه */
  betAgain() {
    if (this.dead || this.multiplayer) return;
    if (!this._chargeBet()) return;
    this.roundId++;
    this.selection = null;
    this.deck.createDeck();
    this.state = 'SELECTING';
    this.emit('SELECTION_REQUIRED', {});
  }
  /* الانسحاب للقائمة (مفرد) */
  withdraw() {
    if (this.dead || this.multiplayer) return;
    this.state = 'IDLE';
    this.emit('STATE_CHANGED', { to: 'IDLE' });
  }
  /* خصم رهان الجولة مع فحص الرصيد —true إن نجح */
  _chargeBet() {
    if (typeof ST !== 'undefined' && ST.gold < this.bet) {
      toast(T('ts.noc') || '❌ رصيد غير كافٍ', 'err');
      this.state = 'IDLE';
      this.emit('STATE_CHANGED', { to: 'IDLE' });
      return false;
    }
    if (typeof ST !== 'undefined') {
      ST.gold -= this.bet;
      save();
      wallet();
    }
    this.emit('BET_PLACED', { bet: this.bet, gold: typeof ST !== 'undefined' ? ST.gold : 0 });
    return true;
  }
  _enterRoleAssignment() {
    if (this.dead) return;
    this.state = 'ROLE_ASSIGNMENT';
    this.myRole = 'selector';
    this.emit('ROLE_ASSIGNED', { myRole: this.myRole });
    setTimeout(() => this._enterRoundReady(), 900);
  }
  _enterRoundReady() {
    if (this.dead) return;
    /* وضع الغرفة: لا رهان — الأدوار والجولات يديرها صاحب الغرفة */
    if (!this.multiplayer) {
      /* خصم رهان الجولة — مع فحص الرصيد (إصلاح: سابقاً لم يكن يُخصم شيء عند الخسارة) */
      if (typeof ST !== 'undefined' && ST.gold < this.bet) {
        toast(T('ts.noc') || '❌ رصيد غير كافٍ', 'err');
        this.state = 'MAIN_MENU';
        this.emit('STATE_CHANGED', { to: 'MAIN_MENU' });
        return;
      }
      if (typeof ST !== 'undefined') {
        ST.gold -= this.bet;
        save();
        wallet();
      }
      this.emit('BET_PLACED', { bet: this.bet, gold: typeof ST !== 'undefined' ? ST.gold : 0 });
    }
    this.roundId++;
    this.selection = null;
    this.deck.createDeck();
    this.state = 'ROUND_READY';
    this.emit('ROUND_READY', { roundId: this.roundId });
    setTimeout(() => this.startShuffle(), 250);
  }
  startShuffle() {
    if (this.dead) return;
    this.state = 'SHUFFLING';
    SND.shuffle();
    this.emit('SHUFFLING_STARTED', { remaining: this.deck.remaining() });
    setTimeout(() => {
      if (this.dead) return;
      this.state = 'SELECTING';
      this.emit('SELECTION_REQUIRED', {});
      if (this.myRole !== 'selector') {
        if (this.multiplayer) {
          /* الغرفة: الموزع/المنتظر يستقبلون اختيار المتخمن عبر SSE — لا اختيار تلقائي */
          if (this._pendingPick) this._applyPendingPick();
        } else {
          /* المستخدم هو الموزع — الخصم يختار تلقائياً (يمنع تجمد اللعبة) */
          setTimeout(() => this.autoSelectOpponent(), 1100);
        }
      }
    }, 1400);
  }
  selectNumber(n) {
    if (this.dead) return;
    if (this.state !== 'SELECTING' || this.myRole !== 'selector') return;
    this.selection = new Card(n, 'A', -1);
    this.emit('NUMBER_PICKED', { selection: this.selection });
    if (this.mode === 'number_only') {
      this.state = 'NUMBER_PICKED';
      this._finalizeSelection();
    } else {
      this.state = 'SYMBOL_PICKING';
      this.emit('SYMBOL_SELECTION_REQUIRED', { selection: this.selection });
    }
  }
  selectSymbol(s) {
    if (this.dead) return;
    if (this.state !== 'SYMBOL_PICKING' || !this.selection) return;
    this.selection.symbol = s;
    this.emit('SYMBOL_PICKED', { selection: this.selection });
    this.state = 'SYMBOL_PICKED';
    this._finalizeSelection();
  }
  confirmSelection() {
    if (this.dead) return;
    if (this.mode === 'number_only') {
      if (this.state !== 'NUMBER_PICKED') return;
      this._finalizeSelection();
    } else {
      if (this.state === 'NUMBER_PICKED') {
        this.state = 'SYMBOL_PICKING';
        this.emit('SYMBOL_SELECTION_REQUIRED', { selection: this.selection });
      } else if (this.state === 'SYMBOL_PICKED') {
        this._finalizeSelection();
      }
    }
  }
  /* الخصم (AI) يختار تلقائياً عندما يكون المستخدم هو الموزع — يمنع تجمد اللعبة */
  autoSelectOpponent() {
    if (this.dead || this.state !== 'SELECTING') return;
    const num = 1 + this.rng.next(10);
    this.selection = new Card(num, 'A', -1);
    this.state = 'NUMBER_PICKED';
    this.emit('NUMBER_PICKED', { selection: this.selection });
    if (this.mode === 'number_only') {
      this.confirmSelection();
    } else {
      const keys = Object.keys(RN_SUITS);
      const sym = keys[this.rng.next(keys.length)];
      this.selection.symbol = sym;
      this.state = 'SYMBOL_PICKED';
      this.emit('SYMBOL_PICKED', { selection: this.selection });
      this._finalizeSelection();
    }
  }
  _finalizeSelection() {
    this.state = 'SELECTED';
    this.emit('SELECTION_CONFIRMED', { selection: this.selection });
    setTimeout(() => this.startDraw(), 650);
  }
  /* اختيار المتخمن البعيد (الغرفة) — يُطبَّق محلياً بنفس النتيجة الحتمية */
  receivePick(num, sym) {
    if (this.dead || !this.multiplayer) return;
    this._pendingPick = { num: num, sym: sym };
    if (this.state === 'SELECTING') this._applyPendingPick();
  }
  _applyPendingPick() {
    if (!this._pendingPick) return;
    const p = this._pendingPick;
    this._pendingPick = null;
    this.selection = new Card(p.num, p.sym, -1);
    this.state = 'SELECTED';
    this.emit('SELECTION_CONFIRMED', { selection: this.selection, remote: true });
    setTimeout(() => this.startDraw(), 650);
  }
  startDraw() {
    if (!this.deck.remaining()) {
      this._endRound('dealer');
      return;
    }
    this.state = 'PLAYER_DRAW';
    setTimeout(() => this.performDraw(), 350);
  }
  performDraw() {
    const c = this.deck.draw();
    if (!c) {
      this._endRound('dealer');
      return;
    }
    const cond = this.mode === 'number_only'
      ? c.matchNumber(this.selection)
      : c.equals(this.selection);
    if (cond) {
      this.emit('CARD_MATCHED', { card: c, who: 'player' });
      if (typeof SND !== 'undefined' && SND.ronda) SND.ronda();
      setTimeout(() => this._endRound('selector'), 750);
    } else {
      this.emit('CARD_MISSED', { card: c, who: 'player' });
      setTimeout(() => this.dealerDraw(), 850);
    }
  }
  dealerDraw() {
    if (!this.deck.remaining()) {
      this._endRound('selector');
      return;
    }
    setTimeout(() => {
      const c = this.deck.draw();
      if (!c) {
        this._endRound('selector');
        return;
      }
      const cond = this.mode === 'number_only'
        ? c.matchNumber(this.selection)
        : c.equals(this.selection);
      if (cond) {
        this.emit('CARD_MATCHED', { card: c, who: 'dealer' });
        setTimeout(() => this._endRound('dealer'), 750);
      } else {
        this.emit('CARD_MISSED', { card: c, who: 'dealer' });
        this.state = 'PLAYER_DRAW';
        setTimeout(() => this.startDraw(), 550);
      }
    }, 350);
  }
  _endRound(winner) {
    const myRole = this.myRole;
    const playerWon = myRole === 'selector' ? winner === 'selector'
                    : myRole === 'dealer' ? winner === 'dealer' : false;
    this._lastWinner = winner;
    this.stats.totalRounds++;
    if (winner === 'selector') this.stats.selectorWins++;
    else this.stats.dealerWins++;
    this.roundResults.push(playerWon);
    const mult = this.mode === 'number_only' ? 2 : 3;
    this.emit('ROUND_RESULT', {
      won: playerWon,
      winner: winner,
      amount: playerWon ? this.bet * mult : -this.bet,
      payout: playerWon ? this.bet * mult : 0
    });
    const isActive = myRole === 'selector' || myRole === 'dealer';
    if (this.multiplayer) {
      /* وضع الغرفة: لا رهان ولا قلب أدوار محلياً — الدوران يطبّقه صاحب الغرفة */
      if (isActive) this.emit(playerWon ? 'PLAYER_WON' : 'DEALER_WON', {});
      this.state = 'ROUND_ENDED';
      this.emit('ROUND_ENDED', { won: playerWon, winner: winner });
      return;
    }
    /* solo: لا نقلب الأدوار أبداً — اللاعب متخمن دائماً. بعد الجولة نسأل: راهن أم ينسحب؟ */
    this.emit(playerWon ? 'PLAYER_WON' : 'DEALER_WON', {});
    setTimeout(() => {
      this.state = 'AWAIT_BET';
      this.emit('AWAIT_BET', {});
    }, 1700);
  }
}
/* ── الرندر (واجهة FLAT DOG) ── */
class RondaRenderer {
  constructor(core) {
    this.core = core;
    this._logEntries = [];
    this._chips = [];
    this._subscribe();
  }
  _subscribe() {
    this.core.on('STATE_CHANGED', (d) => {
      if (d.to === 'IDLE') { this._sheet(null); this._renderRound(); }
    });
    this.core.on('AWAIT_BET', () => this._showBetPrompt());
    this.core.on('ROLE_ASSIGNED', () => this._renderRound());
    this.core.on('ROUND_READY', () => this._updateRound());
    this.core.on('SHUFFLING_STARTED', (d) => {
      this._addLog('🔄 ' + RL('shuffling'), 'event');
      const badge = document.getElementById('rnDeckBadge');
      if (badge) badge.textContent = d.remaining;
      this._sheet(null);
    });
    this.core.on('SELECTION_REQUIRED', () => this._showSelection());
    this.core.on('NUMBER_PICKED', (d) => this._onNumberPicked(d));
    this.core.on('SYMBOL_SELECTION_REQUIRED', () => this._showSymbol());
    this.core.on('SYMBOL_PICKED', (d) => this._onSymbolPicked(d));
    this.core.on('SELECTION_CONFIRMED', (d) => this._showConfirmed(d));
    this.core.on('BET_PLACED', (d) => {
      this._addLog('🪙 ' + RL('betPlaced') + ' −' + fmt(d.bet), 'event');
      this._refreshBetBar();
      if (typeof window.SessionResume !== 'undefined') {
        try { window.SessionResume.markRoundStart({ bet: d.bet }); } catch (e) {}
      }
    });
    this.core.on('CARD_MATCHED', (d) => this._showCard(d, true));
    this.core.on('CARD_MISSED', (d) => this._showCard(d, false));
    this.core.on('ROUND_RESULT', (d) => {
      if (this.core.multiplayer && (this.core.myRole === 'waiting' || this.core.myRole === 'spectator')) return;
      this._chips.push(d.won);
      if (this._chips.length > 10) this._chips.shift();
      this._renderChips();
      if (this.core.multiplayer) {
        this._addLog((d.won ? '🏆 ' : '💔 ') + (d.won ? RL('youWin') : RL('youLose')), d.won ? 'win' : 'lose');
      } else if (d.won) {
        this._addLog('🏆 ' + RL('youWin') + ' +' + fmt(d.payout) + ' 🪙', 'win');
      } else {
        this._addLog('💔 ' + RL('youLose') + ' −' + fmt(this.core.bet) + ' 🪙', 'lose');
      }
      if (typeof recordRound === 'function') {
        recordRound(!!d.won, (d.won && typeof d.payout === 'number' && d.payout > 0) ? d.payout : 0,
          (d.won ? RL('youWin') : RL('youLose')));
      }
      if (typeof window.SessionResume !== 'undefined') {
        try { window.SessionResume.onResolve(); } catch (e) {}
      }
    });
    this.core.on('PLAYER_WON', () => this._showResult(true, 'selector'));
    this.core.on('DEALER_WON', () => this._showResult(false, 'dealer'));
    this.core.on('ROUND_ENDED', (d) => {
      if (this.core.myRole === 'selector' || this.core.myRole === 'dealer') return;
      this._showNeutralEnd(d.winner);
    });
  }
  _alive() {
    return RN_ADAPTER && RN_ADAPTER.renderer === this && !RN_ADAPTER.core.dead;
  }
  /* وجه الورقة = الأصل الكامل (الرقم والرمز مرسومان داخل الصورة) — بلا نصوص فوقها */
  _cardFaceHTML(c, extra) {
    return '<div class="fd-card face rn-suit-' + c.symbol + (extra ? ' ' + extra : '') + '"' +
      ' style="background-image:url(\'' + rnCardAsset(c.number, c.symbol) + '\')">' +
      '</div>';
  }
  _addLog(text, cls) {
    this._logEntries.push({ cls: cls || 'event', text: text });
    if (this._logEntries.length > 40) this._logEntries.shift();
    const log = document.getElementById('rnLog');
    if (!log) return;
    const row = document.createElement('div');
    row.className = 'fd-log-entry ' + (cls || 'event');
    row.textContent = text;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  _renderLog() {
    const log = document.getElementById('rnLog');
    if (!log) return;
    log.innerHTML = '';
    this._logEntries.forEach(e => {
      const row = document.createElement('div');
      row.className = 'fd-log-entry ' + e.cls;
      row.textContent = e.text;
      log.appendChild(row);
    });
    log.scrollTop = log.scrollHeight;
  }
  _renderChips() {
    const el = document.getElementById('rnChips');
    if (!el) return;
    el.innerHTML = this._chips.map(w =>
      '<span class="fd-chip ' + (w ? 'win' : 'lose') + '" title="' + (w ? RL('youWin') : RL('youLose')) + '">' +
      (w ? '✔' : '✖') + '</span>'
    ).join('');
  }
  _setHint(t) {
    const el = document.getElementById('rnDrawHint');
    if (el) el.textContent = t || '';
  }
  _sheet(html) {
    const p = document.getElementById('rnSelectionPanel');
    if (!p) return;
    if (html === null || html === false || html === '') { p.classList.remove('show'); p.innerHTML = ''; return; }
    p.innerHTML = '<div class="fd-sheet-inner">' + html + '</div>';
    p.classList.add('show');
  }
  _turnLabel() {
    const r = this.core.myRole;
    const st = this.core.state;
    if (r === 'spectator') return { t: RL('spectating'), ic: '👁️', glow: false };
    if (r === 'waiting') return { t: RL('waitingTurn'), ic: '⏳', glow: false };
    if (r === 'dealer') return { t: RL('dealer') + ' · ' + RL('waitDealer'), ic: '🃏', glow: false };
    if (st === 'SELECTING') return { t: RL('you') + ' — ' + RL('chooseNum'), ic: '🎯', glow: true };
    return { t: RL('selector'), ic: '🎯', glow: false };
  }
  _setTurn() {
    const el = document.getElementById('fdTurn');
    if (!el) return;
    const info = this._turnLabel();
    el.classList.toggle('glow', !!info.glow);
    el.innerHTML = '<span class="fd-turn-ic">' + info.ic + '</span><span>' + info.t + '</span>';
  }
  _refreshBetBar() {
    const amt = document.getElementById('rnBetAmt');
    if (amt) amt.textContent = fmt(this.core.bet);
    const minus = document.getElementById('rnBetMinus');
    const plus = document.getElementById('rnBetPlus');
    if (minus) minus.disabled = this.core.bet <= 10;
    if (plus && typeof ST !== 'undefined') plus.disabled = this.core.bet >= ST.gold;
  }
  _refreshModeInfo() {
    const el = document.getElementById('fdModeInfo');
    const m = this.core.mode;
    if (el) {
      if (!m) { el.innerHTML = ''; }
      else {
        const mult = m === 'number_only' ? 2 : 3;
        const name = m === 'number_only' ? RL('mode num') : RL('mode sym');
        el.innerHTML =
          '<div class="fd-mi-row"><span>' + RL('mode') + '</span><b>' + name + '</b></div>' +
          '<div class="fd-mi-row"><span>' + RL('payout') + '</span><b class="gold">×' + mult + '</b></div>';
      }
    }
    /* إبراز زر الوضع المختار في الشريط السفلي */
    const bNum = document.getElementById('rnModeNum');
    const bSym = document.getElementById('rnModeSym');
    if (bNum) bNum.classList.toggle('sel', m === 'number_only');
    if (bSym) bSym.classList.toggle('sel', m === 'number_symbol');
  }
  /* تفعيل/تعطيل أزرار الشريط السفلي حسب الحالة */
  _refreshControls() {
    const st = this.core.state;
    const canStart = (st === 'IDLE' || st === 'AWAIT_BET');
    ['rnBetMinus', 'rnBetPlus', 'rnModeNum', 'rnModeSym'].forEach(id => {
      const e = document.getElementById(id);
      if (e) e.disabled = !canStart;
    });
    /* زر التنازل يظهر أثناء جولة نشطة فقط (للتنازل عن الرهان) */
    const inRound = !canStart && st !== 'BOOT';
    const r = document.getElementById('rnResign');
    if (r) r.style.visibility = inRound ? 'visible' : 'hidden';
  }
  /* سؤال بعد انتهاء الجولة: راهن أم انسحب؟ (بلا خصم تلقائي) */
  _showBetPrompt() {
    if (!this._alive()) return;
    this._refreshControls();
    this._sheet(
      '<div class="fd-bet-prompt">' +
        '<button class="fd-prompt-btn bet" onclick="RN_betAgain()">' + RL('betAgain') + '</button>' +
        '<button class="fd-prompt-btn quit" onclick="RN_withdraw()">' + RL('withdraw') + '</button>' +
      '</div>'
    );
  }
  /* مرحلة تحديد الموزع: ورقة لكل لاعب، الأعلى يُتوّج موزعاً */
  _showDealerDeal(d) {
    if (!this._alive()) return;
    const room = RN_ADAPTER.room;
    const u = rnMe();
    const idx = (d.order || []).indexOf(u && u.id);
    this.core.myRole = idx === 0 ? 'dealer' : idx === 1 ? 'selector' : 'waiting';
    const spect = room && (room.players || []).some(function (p) { return p.id === (u && u.id) && p.spectate; });
    if (spect) this.core.myRole = 'spectator';
    this.core.mode = d.mode;
    this._sheet(null);
    this._renderRound();   /* أعد بناء المقاعد بالترتيب الجديد (الموزع أولاً) */
    /* خريطة اللاعب → ورقته الموزوعة */
    const map = {};
    (d.origOrder || []).forEach(function (pid, i) { map[pid] = d.cards[i]; });
    const dealerId = d.order && d.order[0];
    const dealerPl = room && (room.players || []).find(function (p) { return p.id === dealerId; });
    const dealerName = dealerPl ? dealerPl.username : '';
    const self = this;
    document.querySelectorAll('.fd-seat').forEach(function (seat) {
      const pid = seat.getAttribute('data-pid');
      const card = map[pid];
      const slot = seat.querySelector('.fd-seat-card');
      if (slot && card) slot.innerHTML = self._cardFaceHTML({ number: card.num, symbol: card.sym }, '');
      if (pid && String(pid) === String(dealerId)) seat.classList.add('dealer-pick');
    });
    /* لافتة تتويج الموزع */
    const banner = document.getElementById('rnBanner');
    const inner = document.getElementById('rnBannerInner');
    if (banner && inner) {
      inner.className = 'fd-banner-inner neutral';
      const ic = document.getElementById('rnBannerIc'); if (ic) ic.textContent = '👑';
      const txt = document.getElementById('rnBannerText'); if (txt) txt.textContent = RL('dealerPicked');
      const sub = document.getElementById('rnBannerSub'); if (sub) sub.textContent = dealerName;
      banner.classList.add('show');
      setTimeout(() => { if (self._alive()) banner.classList.remove('show'); }, 2200);
    }
  }
  /* يحسب شاغلي المقاعد الأربعة [main, opp1, opp2, opp3] (عكس عقارب الساعة من اللاعب الرئيسي) */
  _seatPlayers() {
    const me = rnMe();
    const emptySeat = function () { return { empty: true, name: '', initials: '', role: 'empty', me: false, bot: false, id: null }; };
    if (!this.core.multiplayer) {
      const myName = me ? me.username : RL('you');
      return [
        { empty: false, name: myName, initials: rnInitials(myName), role: 'selector', me: true, bot: false, id: me ? me.id : null },
        { empty: false, name: 'DOG', initials: 'AI', role: 'dealer', me: false, bot: true, id: null },
        emptySeat(), emptySeat()
      ];
    }
    const room = RN_ADAPTER.room;
    const order = (room && room.order) ? room.order.slice() : [];
    const n = order.length || 1;
    const myIdx = Math.max(0, order.indexOf(me && me.id));
    const seats = [];
    for (let i = 0; i < 4; i++) {
      if (i >= order.length || order[i] == null) { seats.push(emptySeat()); continue; }
      const idxInOrder = (myIdx + i) % n;
      const pid = order[idxInOrder];
      const pl = (room.players || []).find(function (p) { return p.id === pid; });
      const isSpec = pl && pl.spectate;
      const role = idxInOrder === 0 ? 'dealer' : idxInOrder === 1 ? 'selector' : 'waiting';
      seats.push({
        empty: false,
        name: pl ? pl.username : pid,
        initials: (pl && pl.isBot) ? 'AI' : rnInitials(pl ? pl.username : pid),
        role: isSpec ? 'spectator' : role,
        me: !!(me && pid === me.id),
        bot: !!(pl && pl.isBot),
        id: pid
      });
    }
    return seats;
  }
  _renderRound() {
    if (!this._alive()) return;
    const c = document.getElementById('rnContainer');
    if (!c) return;
    const mp = this.core.multiplayer;
    const seats = this._seatPlayers();
    const seatHTML = function (s, pos) {
      if (s.empty) return '<div class="fd-seat empty pos-' + pos + '" data-pid=""><div class="fd-seat-card"></div><div class="fd-seat-icon"><span class="fd-av">—</span></div></div>';
      return '<div class="fd-seat pos-' + pos + ' ' + s.role + (s.me ? ' me' : '') + (s.bot ? ' bot' : '') + '" data-pid="' + (s.id != null ? s.id : '') + '">' +
        '<div class="fd-seat-card"></div>' +
        '<div class="fd-seat-icon">' +
          '<span class="fd-av' + (s.bot ? ' bot' : '') + '">' + rnEsc(s.initials) + '</span>' +
          '<span class="fd-seat-name">' + rnEsc(s.name) + '</span>' +
        '</div>' +
      '</div>';
    };
    const spectators = mp ? this._spectatorHTML() : '';
    c.innerHTML =
      '<div class="fd-stage">' +
        '<div class="fd-spec-strip" id="rnSpec">' + spectators + '</div>' +
        '<div class="fd-score" id="rnChips" aria-hidden="true"></div>' +
        '<div class="fd-history" id="rnLog" aria-hidden="true"></div>' +
        '<div class="fd-table">' +
          seatHTML(seats[1], 'opp1') +   /* يمين أعلى */
          seatHTML(seats[2], 'opp2') +   /* يسار أعلى */
          seatHTML(seats[3], 'opp3') +   /* يسار أسفل */
          seatHTML(seats[0], 'main') +   /* يمين أسفل (أنا) */
          /* وسط الطاولة: ورقتا فلات ودوغ */
          '<div class="fd-center">' +
            '<div class="fd-zone flat" id="fdZoneFlat">' +
              '<div class="fd-zone-label">' + RL('flatCard') + '</div>' +
              '<div class="fd-zone-card" id="fdFlatCard"><div class="fd-card back"></div></div>' +
            '</div>' +
            '<div class="fd-zone dog" id="fdZoneDog">' +
              '<div class="fd-zone-label">' + RL('dogCard') + '</div>' +
              '<div class="fd-zone-card" id="fdDogCard"><div class="fd-card back"></div></div>' +
            '</div>' +
          '</div>' +
          /* بطاقة اختيار المتخمن تُوضع في مقعد اللاعب الرئيسي */
          '<div class="fd-selhost" id="rnSelectorCard"><div class="fd-card back"></div></div>' +
          /* رزمة الموزع قرب مقعد الخصم 1 */
          '<div class="fd-deckhost" id="rnDeck"><div class="fd-deck-pile"><div class="fd-card back mini"></div><div class="fd-card back mini"></div><div class="fd-card back mini"></div></div><div class="fd-deck-count" id="rnDeckBadge">40</div></div>' +
        '</div>' +
        /* شريط أيقونات سفلي ذهبي شفاف */
        '<div class="fd-bottombar">' +
          (mp ? '' :
          '<div class="fd-bb-left">' +
            '<button class="fd-ic-btn" id="rnBetMinus" onclick="RN_changeBet(-10)" aria-label="−" title="−10">➖</button>' +
            '<div class="fd-bet-amt" id="rnBetAmt">10</div>' +
            '<button class="fd-ic-btn" id="rnBetPlus" onclick="RN_changeBet(10)" aria-label="+" title="+10">➕</button>' +
          '</div>') +
          '<div class="fd-bb-center">' +
            '<button class="fd-ic-btn ghost" id="rnAccept" style="display:none">✔</button>' +
            '<button class="fd-ic-btn ghost" id="rnRefuse" style="display:none">✖</button>' +
            '<button class="fd-ic-btn" id="rnResign" onclick="RN_resign()" title="' + RL('resign') + '">🏳️</button>' +
          '</div>' +
          '<div class="fd-bb-right">' +
            '<button class="fd-ic-btn mode" id="rnModeNum" onclick="RN_chooseMode(\'number_only\')" title="' + RL('mode num') + '">🎯</button>' +
            '<button class="fd-ic-btn mode" id="rnModeSym" onclick="RN_chooseMode(\'number_symbol\')" title="' + RL('mode sym') + '">♦️</button>' +
          '</div>' +
        '</div>' +
        '<div class="fd-sheet" id="rnSelectionPanel"></div>' +
        '<div class="fd-banner" id="rnBanner"><div class="fd-banner-inner" id="rnBannerInner"><div class="fd-banner-ic" id="rnBannerIc"></div><div class="fd-banner-text" id="rnBannerText"></div><div class="fd-banner-sub" id="rnBannerSub"></div></div></div>' +
      '</div>';
    this._renderChips();
    this._renderLog();
    this._refreshBetBar();
    this._refreshModeInfo();
    this._refreshControls();
  }
  /* شريط المتفرجين: أيقونات بأول حرفين لكل متفرج */
  _spectatorHTML() {
    if (!RN_ADAPTER || !RN_ADAPTER.room) return '';
    const specs = (RN_ADAPTER.room.players || []).filter(function (p) { return p.spectate; });
    if (!specs.length) return '';
    return specs.map(function (p) {
      const ini = p.isBot ? 'AI' : rnInitials(p.username || p.id);
      return '<span class="fd-spec-ic" title="' + rnEsc(p.username || p.id) + '">' + rnEsc(ini) + '</span>';
    }).join('');
  }
  /* الـ HTML الأصلي (محفوظ كاحتياط) — غير مستخدم بعد إعادة التصميم */
  _renderRound_LEGACY() {
    if (!this._alive()) return;
    const c = document.getElementById('rnContainer');
    if (!c) return;
    const mp = this.core.multiplayer;
    c.innerHTML =
      '<div class="fd-stage">' +
        '<div class="fd-topbar">' +
          '<div class="fd-brand"><span class="fd-brand-mark">FD</span><span class="fd-brand-txt">FLAT DOG<small> · فلات دوغ</small></span></div>' +
          '<div class="fd-turn" id="fdTurn"></div>' +
          '<div class="fd-round" id="fdRound">' + RL('round') + ' <b>#' + this.core.roundId + '</b></div>' +
        '</div>' +
        '<div class="fd-main">' +
          '<aside class="fd-left">' +
            '<div class="fd-aside-h">🏅 ' + RL('score') + '</div>' +
            '<div class="fd-chips" id="rnChips"></div>' +
            '<div class="fd-aside-h">📜 ' + RL('log') + '</div>' +
            '<div class="fd-log" id="rnLog"></div>' +
          '</aside>' +
          '<div class="fd-felt">' +
            '<div class="fd-felt-ring"></div>' +
            '<div class="fd-dealer">' +
              '<div class="fd-pinfo"><div class="fd-avatar dog">🃏</div><div class="fd-pname">DOG <small>' + RL('dealer') + (mp ? '' : ' · AI') + '</small></div></div>' +
              '<div class="fd-deck" id="rnDeck"><div class="fd-deck-pile"><div class="fd-card back mini"></div><div class="fd-card back mini"></div><div class="fd-card back mini"></div></div><div class="fd-deck-count" id="rnDeckBadge">40</div></div>' +
            '</div>' +
            '<div class="fd-zones">' +
              '<div class="fd-zone flat" id="fdZoneFlat">' +
                '<div class="fd-zone-label">FLAT <small>· فلات</small></div>' +
                '<div class="fd-zone-card" id="fdFlatCard"><div class="fd-card back"></div></div>' +
                '<div class="fd-zone-tag">' + RL('flatTag') + '</div>' +
              '</div>' +
              '<div class="fd-zone dog" id="fdZoneDog">' +
                '<div class="fd-zone-label">DOG <small>· دوغ</small></div>' +
                '<div class="fd-zone-card" id="fdDogCard"><div class="fd-card back"></div></div>' +
                '<div class="fd-zone-tag">' + RL('dogTag') + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="fd-selector">' +
              '<div class="fd-selcard" id="rnSelectorCard"><div class="fd-card back"></div></div>' +
              '<div class="fd-pinfo"><div class="fd-avatar flat">🎯</div><div class="fd-pname">FLAT <small>' + RL('selector') + '</small></div></div>' +
            '</div>' +
            '<div class="fd-hint" id="rnDrawHint"></div>' +
          '</div>' +
          '<aside class="fd-side">' +
            '<div class="fd-mode-info" id="fdModeInfo"></div>' +
            (mp ? '<div class="fd-rotation" id="rnRotation"></div>' :
              '<div class="fd-betbar">' +
                '<span class="fd-bet-label">🪙 ' + RL('bet') + '</span>' +
                '<button class="fd-bet-btn" id="rnBetMinus" onclick="RN_changeBet(-10)" aria-label="−10">−</button>' +
                '<div class="fd-bet-amt" id="rnBetAmt">10</div>' +
                '<button class="fd-bet-btn" id="rnBetPlus" onclick="RN_changeBet(10)" aria-label="+10">+</button>' +
              '</div>') +
          '</aside>' +
        '</div>' +
        '<div class="fd-sheet" id="rnSelectionPanel"></div>' +
        '<div class="fd-banner" id="rnBanner"><div class="fd-banner-inner" id="rnBannerInner"><div class="fd-banner-ic" id="rnBannerIc"></div><div class="fd-banner-text" id="rnBannerText"></div><div class="fd-banner-sub" id="rnBannerSub"></div></div></div>' +
      '</div>';
    this._setTurn();
    if (mp) this._renderRotation();
    this._renderChips();
    this._renderLog();
    this._refreshBetBar();
    this._refreshModeInfo();
  }
  _showModeMenu() {
    if (!this._alive()) return;
    this._sheet(
      '<div class="fd-sheet-h">♦️ ' + RL('chooseMode') + '</div>' +
      '<div class="fd-modes">' +
        '<button class="fd-mode-btn" onclick="RN_chooseMode(\'number_only\')">' +
          '<span class="fd-mode-em">🎯</span>' +
          '<span class="fd-mode-name">' + RL('mode num') + '</span>' +
          '<span class="fd-mode-desc">' + RL('mode numDesc') + '</span>' +
          '<span class="fd-mode-mult">×2</span>' +
        '</button>' +
        '<button class="fd-mode-btn" onclick="RN_chooseMode(\'number_symbol\')">' +
          '<span class="fd-mode-em">♦️♠️</span>' +
          '<span class="fd-mode-name">' + RL('mode sym') + '</span>' +
          '<span class="fd-mode-desc">' + RL('mode symDesc') + '</span>' +
          '<span class="fd-mode-mult">×3</span>' +
        '</button>' +
      '</div>'
    );
    this._setHint(RL('chooseMode'));
    this._setTurn();
  }
  _updateRound() {
    if (!this._alive()) return;
    const label = document.getElementById('fdRound');
    if (label) label.innerHTML = RL('round') + ' <b>#' + this.core.roundId + '</b>';
    const badge = document.getElementById('rnDeckBadge');
    if (badge) badge.textContent = this.core.deck.remaining();
    const f = document.getElementById('fdFlatCard'); if (f) f.innerHTML = '<div class="fd-card back"></div>';
    const d = document.getElementById('fdDogCard'); if (d) d.innerHTML = '<div class="fd-card back"></div>';
    const sc = document.getElementById('rnSelectorCard'); if (sc) sc.innerHTML = '<div class="fd-card back"></div>';
    this._sheet(null);
    this._setHint(RL('roundReady'));
    this._refreshModeInfo();
    this._setTurn();
  }
  _showSelection() {
    if (!this._alive()) return;
    if (this.core.myRole !== 'selector') { this._sheet(null); return; }
    /* أرقام دائرية شفافة في خط أفقي واحد — بلا حاوية/خلفية */
    this._sheet(
      '<div class="fd-nums">' +
        RN_NUMS.map(n =>
          '<button class="fd-num-btn" data-num="' + n + '" onclick="RN_selectNum(' + n + ')">' + n + '</button>'
        ).join('') +
      '</div>'
    );
    this._refreshControls();
  }
  _onNumberPicked(d) {
    if (!this._alive()) return;
    const sel = d.selection;
    this._addLog('🎯 ' + RL('pickedNum') + ': ' + sel.number, 'event');
    const p = document.getElementById('rnSelectionPanel');
    if (p) {
      p.querySelectorAll('.fd-num-btn').forEach(b => {
        const on = parseInt(b.dataset.num, 10) === sel.number;
        b.classList.toggle('sel', on);
        b.disabled = !on;   /* تعطيل البقية — رقم_only يُغلق اللوحة تلقائياً */
      });
    }
  }
  _showSymbol() {
    if (!this._alive()) return;
    const sel = this.core.selection;
    /* رموز دائرية شفافة في خط أفقي واحد — بلا حاوية/خلفية */
    this._sheet(
      '<div class="fd-syms">' +
        Object.keys(RN_SUITS).map(k => {
          return '<button class="fd-sym-btn" data-sym="' + k + '" onclick="RN_selectSym(\'' + k + '\')">' +
            rnSymHTML(k) +
          '</button>';
        }).join('') +
      '</div>'
    );
  }
  _onSymbolPicked(d) {
    if (!this._alive()) return;
    const sel = d.selection;
    const s = RN_SUITS[sel.symbol];
    this._addLog('✦ ' + RL('pickedSym') + ': ' + s.glyph + ' ' + RL(s.name), 'event');
    const p = document.getElementById('rnSelectionPanel');
    if (p) {
      p.querySelectorAll('.fd-sym-btn').forEach(b => {
        const on = b.dataset.sym === sel.symbol;
        b.classList.toggle('sel', on);
        b.disabled = !on;
      });
    }
  }
  _showConfirmed(d) {
    if (!this._alive()) return;
    SND.flip();
    const sel = d.selection;
    const s = RN_SUITS[sel.symbol] || RN_SUITS.A;
    if (d.remote) {
      this._addLog('🎯 ' + RL('pickedNum') + ': ' + sel.number + ' ' + s.glyph + ' (' + RL(s.name) + ')', 'event');
    } else {
      this._addLog('🃏 ' + RL('yourChoice') + ': ' + sel.number + ' ' + s.glyph + ' (' + RL(s.name) + ')', 'event');
    }
    const el = document.getElementById('rnSelectorCard');
    if (el) el.innerHTML = this._cardFaceHTML(sel, 'selected');
    this._sheet(null);
    this._setHint(RL('dealing'));
    this._setTurn();
  }
  _showCard(d, matched) {
    if (!this._alive()) return;
    const c = d.card;
    const s = RN_SUITS[c.symbol] || RN_SUITS.A;
    const slotId = d.who === 'dealer' ? 'fdDogCard' : 'fdFlatCard';
    const zoneId = d.who === 'dealer' ? 'fdZoneDog' : 'fdZoneFlat';
    const slot = document.getElementById(slotId);
    const zone = document.getElementById(zoneId);
    if (zone) { document.querySelectorAll('.fd-zone').forEach(z => z.classList.remove('active')); zone.classList.add('active'); }
    if (slot) slot.innerHTML = '<div class="fd-card back drawn"></div>';
    const reveal = () => {
      if (!this._alive()) return;
      if (slot) slot.innerHTML = this._cardFaceHTML(c, (matched ? 'matched' : 'miss') + ' drawn-card');
      if (matched) {
        this._addLog('🔥 ' + RL('drewMatch') + ': ' + c.number + ' ' + s.glyph, 'win');
        SND.match();
      } else {
        this._addLog('🃏 ' + RL('drewMiss') + ': ' + c.number + ' ' + s.glyph, 'event');
        SND.draw();
      }
      const badge = document.getElementById('rnDeckBadge');
      if (badge) badge.textContent = this.core.deck.remaining();
    };
    setTimeout(reveal, 240);
    setTimeout(() => { if (zone) zone.classList.remove('active'); }, 1100);
    this._setTurn();
  }
  _showResult(isWin, winner) {
    if (!this._alive()) return;
    const banner = document.getElementById('rnBanner');
    const inner = document.getElementById('rnBannerInner');
    if (!banner || !inner) return;
    const mp = this.core.multiplayer;
    const mult = this.core.mode === 'number_only' ? 2 : 3;
    const amt = isWin ? this.core.bet * mult : this.core.bet;
    const ic = document.getElementById('rnBannerIc');
    const txt = document.getElementById('rnBannerText');
    const sub = document.getElementById('rnBannerSub');
    const whoWon = winner === 'dealer' ? RL('dealerWon') : RL('selectorWon');
    if (isWin) {
      if (!mp && typeof ST !== 'undefined') { ST.gold += amt; save(); wallet(); }
      SND.win();
      if (typeof celebrate === 'function' && !mp) celebrate(true);
      inner.className = 'fd-banner-inner win';
      if (ic) ic.textContent = '🏆';
      if (txt) txt.textContent = RL('youWin');
      if (sub) sub.innerHTML = mp ? whoWon : ('+' + fmt(amt) + ' 🪙');
      if (typeof burst === 'function' && !mp) {
        const r = banner.getBoundingClientRect();
        if (r.width) burst(r.left + r.width / 2, r.top + r.height / 2, ['#F5C518', '#FFD93D', '#34D399'], 18, 4.5);
      }
    } else {
      SND.lose();
      inner.className = 'fd-banner-inner lose';
      if (ic) ic.textContent = '💔';
      if (txt) txt.textContent = RL('youLose');
      if (sub) sub.innerHTML = mp ? whoWon : ('−' + fmt(amt) + ' 🪙');
    }
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 1900);
    this._setTurn();
  }
  _renderRotation() {
    const el = document.getElementById('rnRotation');
    if (!el) return;
    const room = RN_ADAPTER.room;
    if (!room || !room.order || !room.order.length) { el.innerHTML = ''; return; }
    const u = rnMe();
    const items = room.order.map(function (pid, i) {
      const pl = (room.players || []).find(function (p) { return p.id === pid; });
      const name = pl ? pl.username : pid;
      const role = i === 0 ? 'dealer' : i === 1 ? 'selector' : 'waiting';
      const meCls = (u && pid === u.id) ? ' me' : '';
      const you = (u && pid === u.id) ? ' <i>(' + RL('you') + ')</i>' : '';
      return '<span class="fd-rot-item ' + role + meCls + '">' + rnEsc(name) + you +
        '<span class="fd-rot-lbl">' + RL(role) + '</span></span>';
    });
    el.innerHTML = '<span class="fd-rot-title">🔁 ' + RL('rotation') + '</span>' +
      items.join('<span class="fd-rot-arrow">→</span>');
  }
  _showWaitingRoom() {
    if (!this._alive()) return;
    this._sheet('<div class="fd-wait"><div class="fd-wait-ic">🛡️</div><div>' + RL('waitingRoomStart') + '</div></div>');
    this._setHint('');
  }
  /* مرحلة الرهان (غرفة): المتخمّن يقترح، الموزّع يقبل/يرفض */
  _showBetPhase(d) {
    if (!this._alive()) return;
    this.core.bet = d.bet;
    const role = this.core.myRole;
    let html = '<div class="fd-bet-phase"><div class="fd-bp-amt"><span>' + RL('bet') + '</span><b id="rnBpAmt">' + fmt(d.bet) + '</b></div>';
    if (role === 'selector') {
      html += '<button class="fd-prompt-btn" onclick="RN_proposeBet(-10)">−</button>' +
              '<button class="fd-prompt-btn" onclick="RN_proposeBet(10)">+</button>' +
              '<button class="fd-prompt-btn bet" onclick="RN_betStart()">' + RL('startRound') + '</button>';
    } else if (role === 'dealer') {
      html += '<button class="fd-prompt-btn bet" id="rnBpAccept" style="display:none" onclick="RN_acceptBet()">' + RL('accept') + '</button>' +
              '<button class="fd-prompt-btn quit" id="rnBpRefuse" style="display:none" onclick="RN_refuseBet()">' + RL('refuse') + '</button>';
    }
    html += '</div>';
    this._sheet(html);
  }
  _onBetPropose(d) {
    const amt = document.getElementById('rnBpAmt');
    if (amt) amt.textContent = fmt(d.bet);
    if (this.core.myRole === 'dealer') {
      const a = document.getElementById('rnBpAccept'), r = document.getElementById('rnBpRefuse');
      if (a) a.style.display = ''; if (r) r.style.display = '';
    } else {
      if (amt) amt.textContent = fmt(d.bet) + ' ⏳';
    }
  }
  _onBetDecide(d) {
    this.core.bet = d.bet;
    const amt = document.getElementById('rnBpAmt');
    if (amt) amt.textContent = fmt(d.bet);
    const a = document.getElementById('rnBpAccept'), r = document.getElementById('rnBpRefuse');
    if (a) a.style.display = 'none'; if (r) r.style.display = 'none';
  }
  _showOwnerRoundStart() {
    if (!this._alive()) return;
    const room = RN_ADAPTER.room;
    const modeName = room && room.mode === 'number_symbol' ? RL('mode sym') : RL('mode num');
    this._sheet(
      '<div class="fd-sheet-h">🃏 ' + RL('you are') + ' <b>' + RL('dealer') + '</b></div>' +
      '<div class="fd-sym-recap">' + RL('chooseMode') + ': <b>' + modeName + '</b></div>' +
      '<button class="fd-btn primary" onclick="RN_startRound()">' + RL('startRound') + '</button>'
    );
    this._setHint(RL('pickMode'));
  }
  _showNeutralEnd(winner) {
    if (!this._alive()) return;
    const banner = document.getElementById('rnBanner');
    const inner = document.getElementById('rnBannerInner');
    if (!banner || !inner) return;
    const isSel = winner === 'selector';
    const ic = document.getElementById('rnBannerIc');
    const txt = document.getElementById('rnBannerText');
    const sub = document.getElementById('rnBannerSub');
    inner.className = 'fd-banner-inner neutral';
    if (ic) ic.textContent = '🔁';
    if (txt) txt.textContent = isSel ? RL('selectorWon') : RL('dealerWon');
    if (sub) sub.innerHTML = RL('waitingRound');
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 1900);
  }
  mount(id) {
    this._renderRound();
  }
}

/* ── المحول ── */
class RondaPlatformAdapter {
  constructor() {
    this.core = new RondaGame({ rng: new LocalRandomProvider() });
    this.renderer = new RondaRenderer(this.core);
    this.room = null;
  }
  start(id) {
    this.renderer.mount(id);
    this.core.start();
  }
  /* وضع الغرفة: المالك يثبّت الوضع ويبدأ الجولات — لا قلب أدوار محلي */
  chooseMode(m) {
    if (this.core.multiplayer) {
      this.core.mode = m;
      if (this.room && this.room.isOwner) {
        this.room.mode = m;
        this.room.phase = 'ready';
        Rooms.sendMove('mode', { mode: m }, this._statePayload());
        this.renderer._showOwnerRoundStart();
      }
      return;
    }
    this.core.chooseMode(m);
  }
  selectNum(n) {
    this.core.selectNumber(n);
  }
  selectSym(s) {
    this.core.selectSymbol(s);
  }
  confirm() {
    this.core.confirmSelection();
  }
  setBet(d) {
    const b = Math.max(10, Math.min(typeof ST !== 'undefined' ? ST.gold : 100, this.core.bet + d));
    this.core.bet = b;
    this.renderer._refreshBetBar();
  }
  /* ═══ وضع الغرفة ═══ */
  _statePayload() {
    const r = this.room;
    return {
      order: r.order,
      round: r.round,
      mode: r.mode,
      seed: r.seed,
      pick: r.pick || null,
      phase: r.phase || 'playing'
    };
  }
  /* دخول الغرفة: يحدد الدور حسب ترتيب الحضور ويعيد بناء حالة الجولة */
  enterRoom(room) {
    const u = rnMe();
    const players = (room.players || []).slice();
    const nonSpect = players.filter(function (p) { return !p.spectate; });
    const rs = room.room_state || {};
    const isOwner = room.owner_id === (u && u.id);
    const order = (rs.order && rs.order.length)
      ? rs.order.slice()
      : nonSpect.slice().sort(function (a, b) { return (a.seat || 0) - (b.seat || 0); }).map(function (p) { return p.id; });
    const myIdx = order.indexOf(u && u.id);
    let myRole = myIdx === 0 ? 'dealer' : myIdx === 1 ? 'selector' : 'waiting';
    const mySpect = players.some(function (p) { return p.id === (u && u.id) && p.spectate; });
    if (mySpect) myRole = 'spectator';

    this.core = new RondaGame({ rng: new LocalRandomProvider(), multiplayer: true });
    this.core.myRole = myRole;
    /* [RS-GameOpts] نمط التخمين من إعدادات الغرفة — يغني عن اختيار يدوي عند البدء */
    try {
      var rnCfg = (room && room.game_opts) || window.RN_ROOM_CFG || null;
      if (rnCfg && rnCfg.mode && !((room.room_state || {}).mode)) this._presetMode = rnCfg.mode;
    } catch (e) {}
    this.renderer = new RondaRenderer(this.core);
    this.renderer.mount('rnContainer');
    this.room = {
      id: room.id,
      code: room.code,
      isOwner: isOwner,
      ownerId: room.owner_id,
      players: players,
      order: order,
      round: rs.round || 0,
      mode: rs.mode || null,
      seed: rs.seed || null,
      pick: rs.pick || null,
      phase: rs.phase || 'mode',
      bet: rs.bet || 10
    };

    /* نهاية الجولة: المالك يدوّر الأدوار ويطلق الجولة التالية تلقائياً */
    this.core.on('ROUND_ENDED', (d) => {
      if (!this.room) return;
      if (this.room.isOwner) {
        this.room.order = rnRotate(this.room.order, d.winner === 'selector');
        setTimeout(() => this.ownerStartRound(), 1600);
      } else {
        this.renderer._setHint(RL('waitingRound'));
      }
    });
    /* المتخمن يبث اختياره بعد التأكيد — الجميع يشغّل نفس البذرة فيرى النتيجة نفسها */
    this.core.on('SELECTION_CONFIRMED', (d) => {
      if (!this.room || !this.core.multiplayer || d.remote) return;
      if (this.core.myRole !== 'selector' || !this.core.selection) return;
      const pick = { num: this.core.selection.number, sym: this.core.selection.symbol };
      this.room.pick = pick;
      Rooms.sendMove('pick', { num: pick.num, sym: pick.sym, mode: this.core.mode }, this._statePayload());
    });
    /* تسوية الكوينز: الخاسر يدفع للفائض (رهان×مضاعف إن فاز المتخمّن، أو الرهان إن فاز الموزّع) */
    this.core.on('ROUND_RESULT', (d) => this._settle(d));

    if (!isOwner && (!rs.mode || rs.round === 0)) {
      /* ضيف: بانتظار اختيار المالك للوضع أو بدء الجولة الأولى */
      this.renderer._showWaitingRoom();
      return;
    }
    if (rs.mode && rs.round > 0) {
      /* إعادة تحميل منتصف اللعب (محدث للجولة الحالية) */
      this.applyRound(rs);
      if (rs.pick) this.core.receivePick(rs.pick.num, rs.pick.sym);
      return;
    }
    /* المالك قبل أول جولة — يختار الوضع عبر أزرار الشريط السفلي */
    if (isOwner && !rs.mode) {
      /* [RS-GameOpts] نمط محدد مسبقاً في إعدادات الغرفة → تطبيق مباشر بلا اختيار يدوي */
      if (this._presetMode) { var pm = this._presetMode; this._presetMode = null; this.chooseMode(pm); return; }
      this.renderer._renderRound();
    } else {
      this.renderer._showOwnerRoundStart();
    }
  }
  /* تطبيق جولة (من المالك أو من حالة الغرفة الرسمية) — بذرة مشتركة = نتيجة حتمية */
  applyRound(d) {
    if (!this.room || !this.core) return;
    this.room.round = d.round;
    this.room.seed = d.seed;
    this.room.order = d.order;
    this.room.mode = d.mode;
    this.room.pick = d.pick || null;
    this.room.phase = d.phase || 'playing';
    const c = this.core;
    c.mode = d.mode;
    c.bet = this.room.bet;
    const u = rnMe();
    const idx = (d.order || []).indexOf(u && u.id);
    c.myRole = idx === 0 ? 'dealer' : idx === 1 ? 'selector' : 'waiting';
    const spect = (this.room.players || []).some(function (p) { return p.id === (u && u.id) && p.spectate; });
    if (spect) c.myRole = 'spectator';
    c.roundId = d.round;
    c.selection = null;
    c._pendingPick = null;
    if (d.seed !== null && d.seed !== undefined) c.rng.setSeed(d.seed);
    c.deck.createDeck();
    c.state = 'ROUND_READY';
    c.emit('ROUND_READY', { roundId: d.round });
    /* إعادة بناء الواجهة (شارة الدور + ترتيب الدوران) — لأن الدور يتغير بعد كل جولة */
    this.renderer._renderRound();
    this.renderer._updateRound();
    setTimeout(() => {
      if (c.dead) return;
      c.startShuffle();
    }, 250);
  }
  /* المالك يطلق جولة جديدة (بذرة عشوائية تُبث للجميع) */
  ownerStartRound() {
    if (!this.room || !this.room.isOwner || !this.room.mode) return;
    if (this._betTimer) { clearTimeout(this._betTimer); this._betTimer = null; }
    if (this._propTimer) { clearTimeout(this._propTimer); this._propTimer = null; }
    this.room.round++;
    this.room.seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    this.room.pick = null;
    const payload = {
      order: this.room.order,
      round: this.room.round,
      mode: this.room.mode,
      seed: this.room.seed,
      pick: null,
      phase: 'playing'
    };
    Rooms.sendMove('round', payload, payload);
    this.applyRound(payload);
  }
  startRound() {
    if (!this.room || !this.room.isOwner) return;
    /* أول جولة: حدّد الموزع بأعلى ورقة قبل البدء */
    if (this.room.round === 0) { this.ownerDetermineDealer(); return; }
    this.ownerStartRound();
  }
  /* تحديد الموزع: توزيع ورقة لكل لاعب، الأعلى يصبح الموزع (ترتيب جديد) */
  ownerDetermineDealer() {
    if (!this.room || !this.room.isOwner || !this.room.mode) return;
    const order = this.room.order.slice();
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    this.core.rng.setSeed(seed);
    const res = this.core.dealForDealer(order);
    this.room.order = res.order;
    this.room.seed = seed;
    this.room.phase = 'dealing';
    const payload = { cards: res.cards, origOrder: order, order: res.order, seed: seed, mode: this.room.mode };
    Rooms.sendMove('deal', payload, this._statePayload());
    this.renderer._showDealerDeal(payload);
    setTimeout(() => this.ownerStartBetPhase(), 2600);
  }
  /* مرحلة الرهان: المتخمّن يقترح، الموزّع يقبل/يرفض الزيادة */
  ownerStartBetPhase() {
    if (!this.room || !this.room.isOwner) return;
    if (this._betTimer) clearTimeout(this._betTimer);
    if (this._propTimer) clearTimeout(this._propTimer);
    this.room.phase = 'bet';
    const d = { bet: this.room.bet, dealer: this.room.order[0], selector: this.room.order[1], mode: this.room.mode };
    Rooms.sendMove('betphase', d, this._statePayload());
    this.renderer._showBetPhase(d);
    /* إن لم يؤكّد المتخمّن خلال 15 ثانية يبدأ المالك الجولة تلقائياً (يمنع الجمود) */
    this._betTimer = setTimeout(() => this._onSelectorTimeout(), 30000);
  }
  /* المتخمّن يقترح رهاناً جديداً (زيادة/نقصان) */
  proposeBet(delta) {
    if (!this.room || this.core.myRole !== 'selector') return;
    const proposed = Math.max(10, this.room.bet + delta);
    if (proposed === this.room.bet) return;
    Rooms.sendMove('betpropose', { bet: proposed }, this._statePayload());
    this.renderer._onBetPropose({ bet: proposed, mine: true });
  }
  /* الموزّع يقرّر: قبول الزيادة أو رفضها */
  decideBet(accept, proposed) {
    if (!this.room || this.core.myRole !== 'dealer') return;
    if (this._propTimer) { clearTimeout(this._propTimer); this._propTimer = null; }
    if (accept) this.room.bet = proposed;
    Rooms.sendMove('betdecide', { accept: accept, bet: this.room.bet }, this._statePayload());
    this.renderer._onBetDecide({ accept: accept, bet: this.room.bet });
  }
  /* المتخمّن يؤكّد الرهان ويبدأ الجولة */
  betStart() {
    if (!this.room || this.core.myRole !== 'selector') return;
    Rooms.sendMove('betstart', { bet: this.room.bet }, this._statePayload());
    if (this.room.isOwner) this.ownerStartRound();
  }
  /* تسوية الكوينز (بوساطة المالك): يُقتطع من الخاسر ويُضاف للرابح ناقص رسم الرهان */
  _onSelectorTimeout() {
    if (!this.room || !this.room.isOwner || this.room.phase !== 'bet') return;
    const selId = this.room.order[1];
    if (selId == null) return;
    const self = this;
    API.post('/api/rooms/timeoutSeat', { room_id: this.room.id, playerId: selId }).then(function (r) {
      if (r && r.ok && r.room) { self.room.players = r.room.players; self._rebuildAfterTimeout(); }
    }).catch(function () {});
  }
  _rebuildAfterTimeout() {
    if (!this.room || !this.room.isOwner) return;
    const dealerId = this.room.order[0];
    const nonSpec = (this.room.players || []).filter(function (p) { return !p.spectate; })
      .sort(function (a, b) { return (a.seat || 0) - (b.seat || 0); }).map(function (p) { return p.id; });
    if (nonSpec.length < 2) { if (this.renderer) this.renderer._showWaitingRoom(); return; }
    const reordered = [dealerId].concat(nonSpec.filter(function (id) { return String(id) !== String(dealerId); }));
    this.room.order = reordered;
    this.room.phase = 'bet';
    const d = { bet: this.room.bet, dealer: reordered[0], selector: reordered[1], mode: this.room.mode };
    Rooms.sendMove('betphase', d, this._statePayload());
    if (this.renderer) this.renderer._showBetPhase(d);
    this._betTimer = setTimeout(() => this._onSelectorTimeout(), 30000);
  }
  _onPropTimeout() {
    if (!this.room || !this.room.isOwner || this.room.phase !== 'bet') return;
    if (this._pendingProposed == null) return;
    this._pendingProposed = null;
    Rooms.sendMove('betdecide', { accept: false, bet: this.room.bet }, this._statePayload());
    if (this.renderer) this.renderer._onBetDecide({ accept: false, bet: this.room.bet });
  }
  _settle(d) {
    /* [RondaBet] تسوية عادلة بين البشر: المتخمن يخاطر بالرهان ×1، الموزع يخاطر ×2 (رقم)
       أو ×3 (رقم+رمز) — الخاسر يدفع رهانه كاملاً للرابح، ورسم المنصة 5% من الرابح
       في غرف النسبة (يحسبه الخادم). لا خلق نقود من العدم. */
    if (!this.room || !this.core.multiplayer || !this.room.isOwner) return;
    const winnerSide = d.winner;
    if (!winnerSide || typeof API === 'undefined') return;
    const mult = this.core.mode === 'number_only' ? 2 : 3;
    const players = this.room.players || [];
    const self = this;
    const dealer = players.find(function (p) { return p.id === self.room.order[0]; });
    const selector = players.find(function (p) { return p.id === self.room.order[1]; });
    if (!dealer || !selector) return;
    /* البوتات بلا أرصدة — التسوية النقدية بين بشريين فقط */
    if (String(dealer.id).indexOf('bot:') === 0 || String(selector.id).indexOf('bot:') === 0) return;
    var winner, loser, wStake, lStake;
    if (winnerSide === 'selector') { winner = selector; loser = dealer; wStake = this.room.bet; lStake = this.room.bet * mult; }
    else { winner = dealer; loser = selector; wStake = this.room.bet * mult; lStake = this.room.bet; }
    API.post('/api/rooms/settle', {
      room_id: this.room.id, mode: 'ronda',
      round_id: this.room.round + ':' + (this.room.seed || 0),
      winner_id: winner.id, loser_id: loser.id,
      winner_stake: wStake, loser_stake: lStake
    }).then(function (r) {
      var rd = (r && r.data) ? r.data : r;
      if (rd && rd.ok && typeof ST !== 'undefined') {
        var u = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
        if (u && rd.winner && rd.winner.id === u.id) { ST.gold = rd.winner.gold; AUTH.user.gold = rd.winner.gold; save(); wallet(); }
        else if (u && rd.loser && rd.loser.id === u.id) { ST.gold = rd.loser.gold; AUTH.user.gold = rd.loser.gold; save(); wallet(); }
      }
    }).catch(function () {});
  }
  destroy() {
    if (this.core) this.core.dead = true;
    this.core = null;
    this.renderer = null;
    this.room = null;
  }
}
/* ── دوال عامة ── */
function RN_selectNum(n) {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.selectNum(n);
}
function RN_selectSym(s) {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.selectSym(s);
}
function RN_confirm() {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.confirm();
}
function RN_chooseMode(m) {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.chooseMode(m);
}
function RN_changeBet(d) {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.setBet(d);
}
/* التنازل (للمفرد فقط): يتخلى المتخمن فتفوز الضاربة (DOG) */
function RN_resign() {
  SND.click();
  if (RN_ADAPTER && RN_ADAPTER.core && !RN_ADAPTER.core.multiplayer) {
    RN_ADAPTER.core._endRound('dealer');
  }
}
/* المراهنة مجدداً بعد سؤال «راهن/انسحب» (مفرد) */
function RN_betAgain() {
  SND.click();
  if (RN_ADAPTER && RN_ADAPTER.core && !RN_ADAPTER.core.multiplayer) {
    RN_ADAPTER.core.betAgain();
  }
}
/* الانسحاب للقائمة (مفرد) */
function RN_withdraw() {
  SND.click();
  if (RN_ADAPTER && RN_ADAPTER.core && !RN_ADAPTER.core.multiplayer) {
    RN_ADAPTER.core.withdraw();
  }
}
/* مرحلة الرهان (غرفة): المتخمّن يقترح، الموزّع يقبل/يرفض */
function RN_proposeBet(delta) {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.proposeBet(delta);
}
function RN_acceptBet() {
  SND.click();
  if (RN_ADAPTER && RN_ADAPTER._pendingProposed != null) RN_ADAPTER.decideBet(true, RN_ADAPTER._pendingProposed);
}
function RN_refuseBet() {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.decideBet(false, RN_ADAPTER._pendingProposed || 0);
}
function RN_betStart() {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.betStart();
}
/* أول حرفين من الاسم كصورة رمزية */
function rnInitials(name) {
  if (!name) return '؟';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const s = parts[0];
  return s.substring(0, Math.min(2, s.length)).toUpperCase();
}
/* ── الغرفة: أحداث وبدء الجولة ── */
function RN_startRound() {
  SND.click();
  if (RN_ADAPTER) RN_ADAPTER.startRound();
}
function RN_roomStart(room) {
  if (RN_ADAPTER) RN_ADAPTER.enterRoom(room);
}
function RN_roomMove(d) {
  if (!RN_ADAPTER || !RN_ADAPTER.room || !d || !d.action) return;
  const ad = RN_ADAPTER;
  if (d.action === 'mode') {
    if (ad.core) ad.core.mode = d.data.mode;
    if (!ad.room.isOwner && ad.renderer) {
      ad.renderer._renderRound();
      ad.renderer._showWaitingRoom();
    }
    return;
  }
  if (d.action === 'deal') {
    /* تحديد الموزع: أظهر ورقة كل لاعب ثم يبدأ المالك الجولة الأولى */
    ad.room.order = d.data.order;
    ad.room.seed = d.data.seed;
    ad.room.mode = d.data.mode;
    ad.room.phase = 'dealing';
    if (ad.renderer) ad.renderer._showDealerDeal(d.data);
    return;
  }
  if (d.action === 'betphase') {
    ad.room.bet = d.data.bet; ad.room.phase = 'bet';
    if (ad.renderer) ad.renderer._showBetPhase(d.data);
    return;
  }
  if (d.action === 'betpropose') {
    ad._pendingProposed = d.data.bet;
    if (ad.room.isOwner) { if (ad._propTimer) clearTimeout(ad._propTimer); ad._propTimer = setTimeout(function () { ad._onPropTimeout(); }, 30000); }
    if (ad.renderer) ad.renderer._onBetPropose({ bet: d.data.bet });
    return;
  }
  if (d.action === 'betdecide') {
    ad.room.bet = d.data.bet; ad._pendingProposed = null;
    if (ad._propTimer) { clearTimeout(ad._propTimer); ad._propTimer = null; }
    if (ad.renderer) ad.renderer._onBetDecide(d.data);
    return;
  }
  if (d.action === 'betstart') {
    if (ad._betTimer) { clearTimeout(ad._betTimer); ad._betTimer = null; }
    if (ad._propTimer) { clearTimeout(ad._propTimer); ad._propTimer = null; }
    if (ad.room.isOwner) ad.ownerStartRound();
    return;
  }
  if (d.action === 'round') {
    /* تجاهل الجولات القديمة (وصلت متأخرة أو مكررة) */
    if (!ad.room.isOwner && ad.room.round > 0 && d.data.round <= ad.room.round) return;
    ad.applyRound(d.data);
    if (d.data.pick) ad.core.receivePick(d.data.pick.num, d.data.pick.sym);
    return;
  }
  if (d.action === 'pick') {
    if (ad.core.myRole !== 'selector') ad.core.receivePick(d.data.num, d.data.sym);
    return;
  }
}
/* ── ترجمات Moroccan Ronda ── */
const RONDA_L = {
  'you are': ['دورك:', 'Votre rôle:', 'Your role:'],
  selector: ['المتخمّن', 'Devineur', 'Guesser'],
  dealer: ['الموزع', 'Donneur', 'Dealer'],
  you: ['أنت', 'Vous', 'You'],
  chooseNum: ['اختر رقماً (1-7, 10-12)', 'Choisissez un numéro', 'Pick a number'],
  chooseSym: ['اختر الرمز', 'Choisissez le symbole', 'Choose the suit'],
  chooseMode: ['اختر وضع اللعب', 'Choisissez le mode', 'Choose game mode'],
  'mode num': ['🎯 رقم فقط', '🎯 Numéro seul', '🎯 Number only'],
  'mode numDesc': ['تخمين رقم الورقة فقط — ربح أسهل', 'Devinez seulement le numéro', 'Guess only the card number'],
  'mode sym': ['♦️♠️ رقم + رمز', '♦️♠️ Numéro + symbole', '♦️♠️ Number + suit'],
  'mode symDesc': ['تخمين الرقم والرمز معاً — ربح أعلى', 'Devinez numéro et symbole', 'Guess number and suit'],
  youWin: ['فوز!', 'Victoire!', 'Win!'],
  youLose: ['خسارة', 'Défaite', 'Loss'],
  round: ['الجولة', 'Tour', 'Round'],
  bet: ['الرهان', 'Mise', 'Bet'],
  betPlaced: ['رهان الجولة:', 'Mise du tour:', 'Round bet:'],
  confirm: ['تأكيد', 'Confirmer', 'Confirm'],
  accept: ['قبول', 'Accepter', 'Accept'],
  refuse: ['رفض', 'Refuser', 'Refuse'],
  remaining: ['المتبقي', 'Restantes', 'Left'],
  score: ['النتيجة', 'Score', 'Score'],
  log: ['السجل', 'Journal', 'Log'],
  openSeat: ['مقعد شاغر', 'Siège libre', 'Open seat'],
  spectator: ['متفرج', 'Spectateur', 'Spectator'],
  waiting: ['في الانتظار', 'En attente', 'Waiting'],
  resign: ['تنازل', 'Abandonner', 'Resign'],
  betAgain: ['راهن', 'Parier', 'Bet'],
  withdraw: ['انسحب', 'Se retirer', 'Withdraw'],
  dealerPicked: ['الموزع:', 'Donneur :', 'Dealer:'],
  mode: ['الوضع', 'Mode', 'Mode'],
  payout: ['المضاعف', 'Gain', 'Payout'],
  flatTag: ['بطاقة المتخمن', 'Carte du devineur', "Guesser's card"],
  dogTag: ['بطاقة الموزع', 'Carte du donneur', "Dealer's card"],
  flatCard: ['فلات', 'FLAT', 'FLAT'],
  dogCard: ['دوغ', 'DOG', 'DOG'],
  shuffling: ['خلط الأوراق…', 'Mélange du paquet…', 'Shuffling…'],
  roundReady: ['الجولة جاهزة…', 'Tour prêt…', 'Round ready…'],
  waitDealer: ['أنت الموزع الآن — انتظر سحب الخصم', 'Vous êtes donneur — attendez', 'You are the dealer — wait'],
  dealing: ['سحب البطاقات…', 'Tirage des cartes…', 'Dealing…'],
  pickedNum: ['اخترت الرقم', 'Numéro choisi', 'Picked number'],
  pickedSym: ['اخترت الرمز', 'Symbole choisi', 'Picked suit'],
  yourNum: ['رقمك', 'Votre numéro', 'Your number'],
  yourChoice: ['اختيارك', 'Votre choix', 'Your pick'],
  drewMatch: ['تطابق!', 'Correspondance !', 'Match!'],
  drewMiss: ['لا تطابق', 'Pas de correspondance', 'No match'],
  rolesSwapped: ['تبديل الأدوار — أنت الآن', 'Rôles inversés — vous êtes', 'Roles swapped — you are now'],
  suitA: ['ذهب', 'Or', 'Gold'],
  suitB: ['كؤوس', 'Coupes', 'Cups'],
  suitC: ['سيوف', 'Épées', 'Swords'],
  suitD: ['صولجان', 'Bâtons', 'Clubs'],
  /* وضع الغرفة */
  waiting: ['منتظر', 'En attente', 'Waiting'],
  spectator: ['مشاهد', 'Spectateur', 'Spectator'],
  waitingTurn: ['دورك سيأتي — أنت في الانتظار', 'Votre tour viendra', 'Your turn comes later'],
  spectating: ['أنت تكتفي بالفرجة', 'Vous regardez', 'You are spectating'],
  rotation: ['ترتيب الأدوار', 'Ordre des rôles', 'Role order'],
  startRound: ['🚀 ابدأ الجولة', '🚀 Lancer le tour', '🚀 Start round'],
  waitingRound: ['بانتظار الجولة التالية…', 'En attente du prochain tour…', 'Waiting for next round…'],
  pickMode: ['اختر وضع اللعب لبدء الغرفة (أنت الموزع)', 'Choisissez le mode (vous êtes donneur)', 'Pick the game mode (you are dealer)'],
  waitingRoomStart: ['بانتظار بدء اللعب…', 'En attente du début…', 'Waiting for the game to start…'],
  dealerWon: ['الموزع ربح الجولة', 'Le donneur gagne', 'Dealer wins the round'],
  selectorWon: ['المتخمن ربح الجولة', 'Le devineur gagne', 'Guesser wins the round']
};
function RL(k) {
  var e = RONDA_L[k];
  if (!e) return k;
  return e[langIndex()] != null ? e[langIndex()] : e[0];
}

/* ── Export to window ── */
window.eRonda = eRonda;
window.initRonda = initRonda;

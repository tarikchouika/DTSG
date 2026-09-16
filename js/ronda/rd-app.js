/**
 * ============================================================================
 *  RondaApp — المتحكم الرئيسي للروندا الكلاسيكية (v2.5)
 *  مقتبس من Ronda-Game/js/ui/app.js مع:
 *    - النصوص عبر RD_T بأربع لغات (rdc.*).
 *    - لا «كشف/إخفاء أوراق الخصوم» إطلاقاً: أيدي غير النشط ظهر مصغّر فقط،
 *      والأوراق لا تُكشف إلا عند رميها على الطاولة.
 *    - تبديل العارض بين اللاعبين البشر يتم لحظياً عند تغيّر الدور (ساخن)،
 *      وفي الغرفة كل عميل يثبّت على مقعده (myPlayerId).
 *    - العرض v2.5: طاولة بزوايا — اللاعبون أيقونات على الزوايا الأربع
 *      (حلقة ذهبية + مؤقّت + ★ النقاط + 🃏 الملتقطة)، الوسط للأوراق
 *      المرمية + الرزمة، وعدادات شفافة حولها (الهدف/الجولة/التوزيعة).
 *    - الفوز الفوري: من يبلغ الهدف وسط الجولة يُعلَن فائزاً فوراً وتنتهي
 *      المباراة (لا انتظار نهاية الجولة).
 *  المبدأ المعماري (كما الأصل): الواجهة ترسل playCard وتعرض الأحداث فقط.
 * ============================================================================
 */
(function () {
  'use strict';

  const RC = window.RondaCore;
  const R = window.RondaRenderer;
  const T = window.RD_T;
  const SFX = window.RondaAudio;

  const App = {
    config: { family: 'ai', shape: '1v1', target: 51, bet: 10, sound: true, timer: 60 },
    game: null,
    aiPlayers: [],
    humanPlayers: [],
    currentViewerId: 0,
    busy: false,
    speed: 1,
    lastRoundLogged: 0,
    _attached: false,
    _matchOver: false,      /* انتهت المباراة (غطاء مفتوح) */
    _handDefer: null,       /* ترقية متفرج وسط توزيعة: لا كشف يد حتى توزيعة جديدة */

    /* ── وضع الغرفة (أونلاين) ── */
    _displayTarget: 51,     /* الهدف المعروض (رقم أو «جولة») */
    roomMode: false,
    room: null,
    myPlayerId: 0,
    isSpectator: false,
    _replaying: false,
    _netSeq: 0,
    _waitTimer: null,
    _roomPulse: null,
    _lastActAt: 0,
    _aiScheduled: 0,

    /* ── مؤقّت الدور ── */
    _clock: null,
    _turnStartedAt: Date.now(),

    /* ── بوابة نهاية الجولة (20 ثانية أو تصويت الجميع للمرور) ── */
    _roundGate: null,

    /* ============================ التهيئة ============================ */

    attach: function () {
      if (this._attached) return;
      this._attached = true;
      this.loadPrefs();
      this.bindMenu();
      this.bindGameControls();
      this.renderRules();
      this.showScreen('menu');
      try { if (typeof translateStatic === 'function') translateStatic(); } catch (e) { /* تجاهل */ }
      /* الصوت مربوط بزر السماعة في هيدر المنصة (ST.mute) — لا خيار في الإعدادات */
      try { if (SFX && SFX.setMuted && typeof ST !== 'undefined') SFX.setMuted(!!ST.mute); } catch (e) { /* تجاهل */ }
      /* زرّا «القواعد الكاملة» و«كتم الصوت» في هيدر المنصة هما مدخلا القواعد
         والصوت لهذه اللعبة (لا زر «؟» على الطاولة ولا مفتاح صوت في الإعدادات) —
         لذا تبقى الروندا خارج ملء الشاشة ليبقى هيدر المنصة ظاهراً فوق الطاولة.
         openGame() يستدعي enterAppFullscreen() بعد التهيئة، فيُلغى هنا فور انتهائه. */
      try {
        if (typeof exitAppFullscreen === 'function') {
          setTimeout(function () { try { exitAppFullscreen(); } catch (e) { /* تجاهل */ } }, 0);
        }
      } catch (e) { /* تجاهل */ }
    },

    detach: function () {
      this._pipeSeq++;
      Pipeline.reset();
      this.stopClock();
      this.game = null;
      this.aiPlayers = [];
      this.humanPlayers = [];
      this.busy = false;
      this._attached = false;
      this.roomMode = false;
      this.room = null;
      this.isSpectator = false;
      this._replaying = false;
      this._matchOver = false;
      this._handDefer = null;
      this._stopPulse();
      if (this._waitTimer) { clearTimeout(this._waitTimer); this._waitTimer = null; }
      try {
        const stage = document.getElementById('rdStage');
        if (stage) stage.classList.remove('rd-spectating');
      } catch (e) { /* تجاهل */ }
      try { App._hideWaiting(); } catch (e) { /* تجاهل */ }
      try {
        const bar = document.getElementById('rd-specbar');
        if (bar) { bar.classList.add('rd-hidden'); bar.innerHTML = ''; }
      } catch (e) { /* تجاهل */ }
      try {
        const ovs = document.querySelectorAll('.rd-overlay');
        for (let i = 0; i < ovs.length; i++) ovs[i].classList.add('rd-hidden');
      } catch (e) { /* تجاهل */ }
      try {
        if (SFX && SFX.ctx && SFX.ctx.state === 'running') SFX.ctx.suspend();
      } catch (e) { /* تجاهل */ }
    },

    /* أدوات أنماط اللعب المحلية (1v1 / 1v2 / 1v3 / 2v2) */
    _shapeSeats: function (shape) {
      if (shape === '1v1') return 2;
      if (shape === '1v2') return 3;
      return 4;                       /* 1v3 فردي 4 مقاعد، و2v2 فريقان */
    },
    _shapeEngine: function (shape) {
      if (shape === '2v2') return RC.GameMode.TEAM_VS_TEAM;
      if (shape === '1v1') return RC.GameMode.HEAD_TO_HEAD;
      return RC.GameMode.FREE_FOR_ALL; /* 1v2 → 3، و1v3 → 4 (كلٌّ لنفسه) */
    },
    _descFor: function (family, shape) {
      const key = 'rdc.shape.' + family + '.' + shape;
      const s = T.msg(key, null);
      return (s && s !== key) ? s : shape;
    },
    _familyName: function (family) {
      const key = family === 'ai' ? 'rdc.mode.ai.fam' : 'rdc.mode.pvp.fam';
      const s = T.msg(key, null);
      return (s && s !== key) ? s : (family === 'ai' ? 'ضد الكمبيوتر' : 'وجهًا لوجه');
    },

    loadPrefs: function () {
      try {
        const saved = JSON.parse(localStorage.getItem('ronda.prefs') || '{}');
        const shapes = ['1v1', '1v2', '1v3', '2v2'];
        /* توافق مع الإصدارات السابقة (mode: ai / 2p / 4p) */
        if (saved.family === 'ai' || saved.family === 'pvp') {
          this.config.family = saved.family;
        } else if (saved.mode) {
          this.config.family = (saved.mode === '2p' || saved.mode === '4p') ? 'pvp' : 'ai';
        }
        if (saved.shape && shapes.indexOf(saved.shape) >= 0) {
          this.config.shape = saved.shape;
        } else if (saved.mode === '2p') this.config.shape = '1v1';
        else if (saved.mode === '4p') this.config.shape = '2v2';
        else if (saved.mode === 'ai') this.config.shape = '1v1';
        if (saved.target === 'round' || [41, 51, 61].indexOf(Number(saved.target)) >= 0) {
          this.config.target = saved.target;
        }
        if (typeof saved.bet === 'number') this.config.bet = saved.bet;
        if (typeof saved.sound === 'boolean') this.config.sound = saved.sound;
        if (typeof saved.timer === 'number' && saved.timer >= 30 && saved.timer <= 300) {
          this.config.timer = saved.timer;
        }
      } catch (e) { /* تجاهل */ }
      this.syncMenuUI();
    },

    savePrefs: function () {
      try { localStorage.setItem('ronda.prefs', JSON.stringify(this.config)); } catch (e) { /* تجاهل */ }
    },

    syncMenuUI: function () {
      const cfg = App.config;
      const fam = cfg.family;
      document.querySelectorAll('#family-options .rd-family-btn').forEach(function (b) {
        b.classList.toggle('selected', b.dataset.family === fam);
        b.setAttribute('aria-selected', String(b.dataset.family === fam));
      });
      document.querySelectorAll('#mode-options .rd-mode-btn').forEach(function (b) {
        b.classList.toggle('selected', b.dataset.shape === cfg.shape);
        const d = b.querySelector('.rd-mode-desc');
        if (d) d.textContent = App._descFor(fam, b.dataset.shape);
      });
      document.querySelectorAll('#target-options .rd-target-pill').forEach(function (b) {
        b.classList.toggle('selected', String(b.dataset.target) === String(cfg.target));
      });
      const tv = document.getElementById('timer-val');
      if (tv) tv.textContent = App.config.timer;
      const bet = document.getElementById('bet-input');
      if (bet) bet.value = App.config.bet;
    },

    _openRules: function () {
      SFX.click();
      this.renderRules();
      this._overlay('rules', true);
    },

    bindMenu: function () {
      document.querySelectorAll('#family-options .rd-family-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          App.config.family = b.dataset.family;
          SFX.click();
          App.syncMenuUI();
        });
      });
      document.querySelectorAll('#mode-options .rd-mode-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          App.config.shape = b.dataset.shape;
          SFX.click();
          App.syncMenuUI();
        });
      });
      document.querySelectorAll('#target-options .rd-target-pill').forEach(function (b) {
        b.addEventListener('click', function () {
          App.config.target = (b.dataset.target === 'round') ? 'round' : Number(b.dataset.target);
          SFX.click();
          App.syncMenuUI();
        });
      });
      const timerDec = document.getElementById('timer-dec');
      const timerInc = document.getElementById('timer-inc');
      if (timerDec) timerDec.addEventListener('click', function () {
        App.config.timer = Math.max(30, Math.min(300, App.config.timer - 10));
        SFX.click();
        App.syncMenuUI();
      });
      if (timerInc) timerInc.addEventListener('click', function () {
        App.config.timer = Math.max(30, Math.min(300, App.config.timer + 10));
        SFX.click();
        App.syncMenuUI();
      });
      const bet = document.getElementById('bet-input');
      if (bet) bet.addEventListener('change', function () {
        const v = Math.max(0, Math.floor(Number(bet.value) || 0));
        bet.value = v;
        App.config.bet = v;
        App.savePrefs();
      });
      bet && bet.addEventListener('input', function () {
        const v = Math.max(0, Math.floor(Number(bet.value) || 0));
        App.config.bet = v;
      });
      const bStart = document.getElementById('btn-start');
      if (bStart) bStart.addEventListener('click', function () {
        if (App._canStartLocal()) { SFX.resume(); SFX.click(); App.savePrefs(); App.startMatch(); }
      });
      /* قواعد اللعبة: تُفتح من أيقونة «؟» الشفافة وسط الطاولة */
      const ovRules = document.getElementById('overlay-rules');
      if (ovRules) ovRules.addEventListener('click', function (e) {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('rd-hidden');
      });
    },

    bindGameControls: function () {
      /* لا زر «؟» على الطاولة — القواعد من كتاب هيدر المنصة (showFullRules) */
      const bRulesClose = document.getElementById('btn-rules-close');
      if (bRulesClose) bRulesClose.addEventListener('click', function () {
        SFX.click();
        App._overlay('rules', false);
      });
      const bNextRound = document.getElementById('btn-next-round');
      if (bNextRound) bNextRound.addEventListener('click', function () {
        SFX.click();
        App._roundNextClick();
      });
      const bNewMatch = document.getElementById('btn-new-match');
      if (bNewMatch) bNewMatch.addEventListener('click', function () {
        SFX.click();
        App._overlay('match', false);
        App._clearRoundGate();
        if (App.roomMode) return;   /* في الغرفة: الجولة التالية عبر التصويت/الغرفة */
        App.startMatch();
      });
      const bBackMenu = document.getElementById('btn-back-menu');
      if (bBackMenu) bBackMenu.addEventListener('click', function () {
        SFX.click();
        App._overlay('match', false);
        App.backToMenu();
      });
      /* سجل الأحداث: مخفي افتراضياً — المقبض النصفي الأصفر أسفل المنتصف
         يفتح/يطوي اللوحة (نقرة على العنوان أو المقبض) */
      const logPanel = document.getElementById('log-panel');
      if (logPanel) {
        const logTitle = logPanel.querySelector('.rd-log-title');
        const logHandle = logPanel.querySelector('.rd-log-handle');
        const toggleLog = function () {
          const open = logPanel.classList.toggle('rd-log-open');
          if (logHandle) logHandle.setAttribute('aria-expanded', open ? 'true' : 'false');
        };
        (logTitle || logPanel).addEventListener('click', function (e) {
          if (e.target.closest('#log-list')) return;
          toggleLog();
        });
        if (logHandle) logHandle.addEventListener('click', toggleLog);
      }
    },

    _overlay: function (name, show) {
      const map = { rules: 'overlay-rules', round: 'overlay-round', match: 'overlay-match' };
      const elm = document.getElementById(map[name]);
      if (elm) elm.classList.toggle('rd-hidden', !show);
    },

    renderRules: function () {
      const body = document.getElementById('rules-body');
      if (body) body.innerHTML = T.rulesHtml();
    },

    showScreen: function (name) {
      const menu = document.getElementById('screen-menu');
      const game = document.getElementById('screen-game');
      if (menu) menu.classList.toggle('active', name === 'menu');
      if (game) game.classList.toggle('active', name === 'game');
    },

    /* هل يمكن بدء مباراة محلية مع هذا الرهان؟ */
    _canStartLocal: function () {
      const bet = this.config.bet;
      if (this.config.family !== 'ai' || bet <= 0) return true;
      const gold = (typeof ST !== 'undefined' && typeof ST.gold === 'number') ? ST.gold : null;
      if (gold == null || gold < bet) {
        try { if (typeof toast === 'function') toast(T.msg('rdc.bet.noGold', null) || '🪙 رصيدك غير كافٍ لهذا الرهان', 'err'); } catch (e) { /* تجاهل */ }
        return false;
      }
      return true;
    },

    /* ============================ بدء مباراة محلية ============================ */

    /** أسماء مقاعد اللعب المحلي (حسب العائلة والشكل) */
    _localNames: function (family, shape) {
      const seats = App._shapeSeats(shape);
      const n4 = (function () {
        try { return T.namesFor('4p'); } catch (e) { return ['اللاعب ١', 'اللاعب ٢', 'اللاعب ٣', 'اللاعب ٤']; }
      })();
      const n2 = (function () {
        try { return T.namesFor('2p'); } catch (e) { return ['اللاعب ١', 'اللاعب ٢']; }
      })();
      const out = [];
      for (let s = 0; s < seats; s++) {
        if (family === 'ai') {
          out.push(s === 0 ? (T.namesFor('ai')[0] || 'أنت') : (T.namesFor('ai')[1] || 'الكمبيوتر') + ' ' + s);
        } else if (seats === 2) {
          out.push(n2[s] || ('اللاعب ' + (s + 1)));
        } else {
          out.push(n4[s] || ('اللاعب ' + (s + 1)));
        }
      }
      return out;
    },

    startMatch: function () {
      const cfg = this.config;
      const seats = this._shapeSeats(cfg.shape);
      const gameMode = this._shapeEngine(cfg.shape);
      const isRoundTarget = cfg.target === 'round';
      const targetScore = isRoundTarget ? 9999 : Math.max(1, Number(cfg.target) || 51);
      const names = this._localNames(cfg.family, cfg.shape);
      const rules = new RC.RondaRulesConfig({
        targetScore: targetScore,
        singleRoundMode: !!isRoundTarget
      });
      this._displayTarget = isRoundTarget ? (T.msg('rdc.target.round', null) || 'جولة') : targetScore;
      const engineOpts = { mode: gameMode, names: names, rules: rules };
      if (gameMode === RC.GameMode.FREE_FOR_ALL) engineOpts.playerCount = seats;

      /* خصم رهان اللعب ضد الكمبيوتر من الرصيد المحلي (مرة واحدة) */
      if (cfg.family === 'ai' && cfg.bet > 0) {
        const gold = (typeof ST !== 'undefined' && typeof ST.gold === 'number') ? ST.gold : 0;
        if (gold >= cfg.bet) {
          try {
            ST.gold = Math.max(0, gold - cfg.bet);
            if (typeof wallet === 'function') { try { wallet(); } catch (e) {} }
            if (typeof save === 'function') { try { save(); } catch (e) {} }
          } catch (e) { /* تجاهل */ }
        }
      }

      this._pipeSeq++;
      Pipeline.reset();
      this.game = new RC.RondaGame(engineOpts);
      if (gameMode === RC.GameMode.TEAM_VS_TEAM) {
        this.game.state.teams[0].name = T.teamName(0);
        this.game.state.teams[1].name = T.teamName(1);
      }
      this.aiPlayers = (cfg.family === 'ai') ? (function (n) { const a = []; for (let i = 1; i < n; i++) a.push(i); return a; })(seats) : [];
      this.humanPlayers = (cfg.family === 'ai') ? [0] : names.map(function (_, i) { return i; });
      this.currentViewerId = 0;
      this.busy = false;
      this._matchOver = false;
      this._handDefer = null;
      this.lastRoundLogged = 0;
      this._turnStartedAt = Date.now();
      this.roomMode = false;
      this.room = null;
      this.isSpectator = false;
      this._replaying = false;
      this._clearRoundGate();
      this._stopPulse();
      this.startClock();

      const list = document.getElementById('log-list');
      if (list) list.innerHTML = '';
      const ht = document.getElementById('hud-target');
      if (ht) ht.textContent = this._displayTarget;

      Pipeline.reset();
      this.game.onEvent(function (ev) { Pipeline.push(ev); });
      this.game.start();
      Pipeline._pump();
      this.showScreen('game');
    },

    backToMenu: function () {
      this._pipeSeq++;
      Pipeline.reset();
      this.stopClock();
      this.game = null;
      this._matchOver = false;
      this._handDefer = null;
      this._clearRoundGate();
      try {
        const stage = document.getElementById('rdStage');
        if (stage) stage.classList.remove('rd-spectating');
      } catch (e) { /* تجاهل */ }
      this._overlay('rules', false);
      this._overlay('round', false);
      this._overlay('match', false);
      this.showScreen('menu');
    },

    /* ============================ مؤقّت الدور ============================ */

    turnSecondsLimit: function () {
      if (this.roomMode) {
        const g = (typeof window !== 'undefined' && Number(window.RD_ROOM_AI_GRACE)) || 60000;
        return Math.max(4, Math.round(g / 1000));
      }
      const t = Math.round(Number(this.config.timer) || 60);
      return Math.max(4, Math.min(300, t));   /* محلي: 30–300 ثانية + لعب آلي تلقائي */
    },

    startClock: function () {
      this.stopClock();
      const self = this;
      this._clock = setInterval(function () {
        try { self._tickClock(); } catch (e) { /* تجاهل */ }
      }, 500);
    },

    stopClock: function () {
      if (this._clock) { clearInterval(this._clock); this._clock = null; }
    },

    _tickClock: function () {
      if (!this.game || this._matchOver) return;
      const st = this.game.state;
      if (!st || (st.phase !== RC.GamePhase.PLAYING && st.phase !== RC.GamePhase.DECLARATION)) return;
      const seat = st.currentSeat;
      if (seat == null) return;
      const limitMs = this.turnSecondsLimit() * 1000;
      const remain = Math.max(0, limitMs - (Date.now() - (this._turnStartedAt || Date.now())));
      const secs = Math.ceil(remain / 1000);
      const timers = document.querySelectorAll('.rd-seat.rd-active-turn .rd-turn-timer');
      for (let i = 0; i < timers.length; i++) timers[i].textContent = secs;
      /* تجاوز المهلة في اللعب المحلي: لعب آلي تلقائي لصاحب الدور البشري */
      if (!this.roomMode && !this.busy && remain <= 0) {
        this._autoPlayIdleHuman(seat);
      }
    },

    _autoPlayIdleHuman: function (seat) {
      if (this.aiPlayers.includes(seat)) return;
      if (!this.humanPlayers.includes(seat)) return;
      this.busy = true;
      try {
        const cardId = RC.RondaAI.chooseCard(this.game, seat);
        if (cardId === null) { this.busy = false; return; }
        this.game.playCard(seat, cardId);
      } catch (e) {
        console.error(e);
        this.busy = false;
      }
    },

    /* ============================ عرض اللقطة ============================ */

    refreshView: function (opts) {
      if (!this.game) return;
      const o = opts || {};
      const spectator = this.roomMode && this.isSpectator;
      /* المتفرج: عرض محايد بلا أي يد إطلاقاً */
      const view = spectator ? this._neutralView() : this.game.getView(this.currentViewerId);
      /* ترقية متفرج وسط توزيعة: يبقى محجوب اليد حتى توزيعة جديدة (لا كشف ليد
         ليست له) */
      let deferHand = false;
      if (!spectator && this._handDefer && this.game) {
        const st = this.game.state;
        if (st.roundNumber === this._handDefer.round && st.dealNumber === this._handDefer.deal) {
          deferHand = true;
        } else {
          this._handDefer = null;
        }
      }
      const common = {
        viewerId: this.currentViewerId,
        aiMode: !this.roomMode && this.config.family === 'ai',
        roomMode: this.roomMode,
        spectator: spectator,
        interactive: !this.busy && !this._matchOver && !deferHand,
        specState: (spectator || deferHand) ? this._specState() : null,
        onRequestSeat: function () { App._requestSeat(); }
      };
      R.renderSeats(view, common);
      R.renderTable(view, { animateNew: o.animateNew });
      R.renderHand(view, {
        viewerId: this.currentViewerId,
        aiMode: !this.roomMode && this.config.family === 'ai',
        roomMode: this.roomMode,
        spectator: spectator || deferHand,
        interactive: !this.busy && !this._matchOver && !deferHand,
        animateDeal: o.animateDeal,
        specState: (spectator || deferHand) ? this._specState() : null,
        onRequestSeat: function () { App._requestSeat(); },
        onPlay: function (cardId) { App.humanPlay(cardId); }
      });
      /* وسم الحالة على المسرح لتقليص المساحات في وضع المشاهدة */
      const stage = document.getElementById('rdStage');
      if (stage) stage.classList.toggle('rd-spectating', spectator || deferHand);
      const hr = document.getElementById('hud-round');
      const hd = document.getElementById('hud-deal');
      if (hr) hr.textContent = view.roundNumber;
      if (hd) hd.textContent = view.dealNumber;
      return view;
    },

    /* عرض محايد للمتفرج: الطاولة العامة فقط */
    _neutralView: function () {
      const v0 = this.game.getView(0);
      return Object.assign({}, v0, { myHand: [], myCaptured: [], myPlayerId: -1 });
    },

    _specState: function () {
      const st = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : null;
      if (!st) return { canRequest: false, pending: false };
      const pending = (typeof Rooms.myJoinPending === 'function') ? !!Rooms.myJoinPending() : false;
      return { canRequest: !pending, pending: pending };
    },

    _requestSeat: function () {
      if (typeof Rooms !== 'undefined' && typeof Rooms.requestJoin === 'function') {
        try { Rooms.requestJoin(); } catch (e) { /* تجاهل */ }
      }
    },

    /* ============================ حركات اللاعبين ============================ */

    humanPlay: function (cardId) {
      if (this.busy || this._matchOver) return;
      if (!this.game) return;
      const view = this.game.getView(this.currentViewerId);
      if (view.currentPlayerId !== this.currentViewerId) return;
      if (view.phase !== 'Playing') return;
      this.busy = true;
      this.refreshView({});
      try {
        this.game.playCard(this.currentViewerId, cardId);
        /* الغرفة: أنفّذ محلياً وبثّ للجميع — صدى حركتي يُتجاهل عند وصوله */
        if (this.roomMode && !this.isSpectator) {
          this._lastActAt = Date.now();
          this._netEmit('play', { playerId: this.currentViewerId, cardId: cardId });
        }
      } catch (e) {
        console.error(e);
        this.busy = false;
      }
    },

    aiPlay: function () {
      if (!this.game || this._matchOver) return;
      if (this.roomMode) return;   /* في الغرفة يقود السائق (roomDriverTick) */
      if (!this.aiPlayers.length) return;
      const seat = this.game.state.currentSeat;
      if (seat == null || this.aiPlayers.indexOf(seat) < 0) return;
      const view = this.game.getView(seat);
      if (view.phase !== 'Playing') return;
      if (view.currentPlayerId !== seat) return;
      const cardId = RC.RondaAI.chooseCard(this.game, seat);
      if (cardId === null) return;
      try {
        this.game.playCard(seat, cardId);
      } catch (e) { console.error(e); }
    },

    /* ============================ نهاية المباراة (فوز فوري + تسوية) ============================ */

    /** الفوز الفوري: بلوغ الهدف وسط الجولة → إعلان + إنهاء فوراً */
    _checkEarlyWin: function () {
      if (!this.game || this._matchOver || this._replaying) return;
      const st = this.game.state;
      if (!st) return;
      if (st.phase !== RC.GamePhase.PLAYING && st.phase !== RC.GamePhase.DECLARATION) return;
      const reached = st.teams.filter(function (t) { return t.score >= st.targetScore; });
      if (!reached.length) return;
      reached.sort(function (a, b) { return b.score - a.score; });
      this._finishMatch(reached[0].id, null);
    },

    /** عرض نهاية المباراة (المحرك أو الفوز الفوري) + تسوية الرهان المحلي */
    _finishMatch: function (winnerTeamId, breakdown) {
      if (this._matchOver) return;
      this._matchOver = true;
      const game = this.game;
      if (!game) return;
      const winnerTeam = game.state.getTeam(winnerTeamId);
      const wname = document.getElementById('match-winner-name');
      if (wname) wname.textContent = winnerTeam.name;
      const t = game.state.teams;
      const ms = document.getElementById('match-final-score');
      if (ms) {
        if (t.length === 2) {
          ms.textContent = T.msg('rdc.match.score', { a: t[0].score, b: t[1].score });
        } else {
          /* كلٌّ لنفسه: «اللاعب ١ (12) — اللاعب ٢ (9) — …» */
          ms.textContent = t.map(function (tm) {
            return tm.name + ' (' + tm.score + ')';
          }).join('  —  ');
        }
      }
      R.renderBreakdown('match-breakdown', breakdown || []);
      App.renderConfetti();
      R.addLog('<b>' + T.msg('rdc.log.matchEnd') + '</b> — ' + winnerTeam.name, 'rd-log-qa3a');
      SFX.win();
      App._overlay('match', true);
      Pipeline.pause();
      this._settleLocalBet(winnerTeamId);
      if (this.roomMode) {
        /* تسوية الغرفة (1ضد1 أو تقسيم فرق 2ضد2) + تصويت مباراة جديدة */
        this._onRoomMatchOver({ winnerTeamId: winnerTeamId });
      }
    },

    /** الرهان المحلي (ضد الكمبيوتر): الفوز يضيف الرهان ×2 للرصيد */
    _settleLocalBet: function (winnerTeamId) {
      if (this.roomMode) return;
      const bet = this.config.bet;
      if (this.config.family !== 'ai' || bet <= 0) return;
      const meTeam = (this.currentViewerId === 0) ? 0 : (this.game.state.getPlayer(this.currentViewerId) || {}).teamId;
      const humanWon = Number(winnerTeamId) === Number(meTeam);
      if (humanWon && typeof ST !== 'undefined' && typeof ST.gold === 'number') {
        /* 1ضد1: ×2 | فرق 2ضد2: ×2 | كلٌّ لنفسه (3/4): × عدد الجالسين */
        const st = this.game.state;
        const pot = bet * ((st && st.mode === RC.GameMode.TEAM_VS_TEAM) ? 2 : (st ? st.players.length : 2));
        ST.gold += pot;
        try {
          if (typeof wallet === 'function') wallet();
          if (typeof save === 'function') save();
          if (typeof toast === 'function') {
            try { toast(T.msg('rdc.bet.winToast', { pot: pot }), 'ok'); }
            catch (e) { toast('🏆 ربحت ' + pot + ' 🪙', 'ok'); }
          }
          if (typeof recordRound === 'function') recordRound(true, pot, T.msg('rdc.title') || 'الروندا', bet);
        } catch (e) { /* تجاهل */ }
      } else if (typeof recordRound === 'function') {
        try { recordRound(false, 0, T.msg('rdc.title') || 'الروندا', bet); } catch (e) { /* تجاهل */ }
      }
    },

    /* ============================ مساعدة ============================ */

    playerName: function (id) {
      if (!this.game) return String(id);
      const p = this.game.state.getPlayer(id);
      return p ? p.name : String(id);
    },

    /** مستطيل مقعد لاعب (زوايا الطاولة) — للحركات الطائرة */
    seatRectFor: function (playerId) {
      const node = document.querySelector('#rdStage .rd-seat[data-player-id="' + playerId + '"]');
      if (node) {
        const r = node.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }
      return { left: innerWidth / 2 - 60, top: innerHeight / 2 - 60, width: 100, height: 70 };
    },

    handCardRect: function (cardId) {
      const cardEl = document.querySelector('#hand .rd-card[data-card-id="' + cardId + '"]');
      return cardEl ? cardEl.getBoundingClientRect() : null;
    },

    tableCenterRect: function () {
      const zone = document.getElementById('table-cards') || document.getElementById('felt');
      const r = zone ? zone.getBoundingClientRect() : { left: 0, top: 0, width: 400, height: 200 };
      return {
        left: r.left + r.width / 2 - 55,
        top: r.top + r.height / 2 - 80,
        width: 110, height: 160
      };
    },

    /* ============================ بوابة نهاية الجولة ============================
       تُعرض نافذة النتائج، وتنتقل للجولة التالية:
         • تلقائياً بعد 20 ثانية؛
         • أو فوراً عند نقر اللاعبين (في الغرفة: عند تصويت كل الجالسين) لزر
           «الجولة التالية» قبل مرور الـ20 ثانية.                         */

    _queueNextIsGameEnded: function () {
      const q = Pipeline.queue;
      return !!(q && q.length && q[0] && q[0].type === 'GameEnded');
    },

    _clearRoundGate: function () {
      const g = this._roundGate;
      if (g && g.timer) { clearInterval(g.timer); g.timer = null; }
      this._roundGate = null;
    },

    _beginRoundGate: function (roundNumber) {
      this._clearRoundGate();
      let needed = 1;
      if (this.roomMode) {
        const room = this._roomState();
        const order = (room && room.order) ? room.order : [];
        needed = order.filter(function (pid) { return String(pid).indexOf('bot:') !== 0; }).length;
        if (!needed) needed = 1;
      }
      const g = { round: roundNumber, votes: {}, needed: needed, done: false, at: Date.now(), timer: null };
      this._roundGate = g;
      this._paintRoundGate();
      const self = this;
      g.timer = setInterval(function () {
        try { self._tickRoundGate(); } catch (e) { /* تجاهل */ }
      }, 250);
    },

    _paintRoundGate: function () {
      const g = this._roundGate;
      const hint = document.getElementById('round-auto-hint');
      if (!g || !hint) return;
      const remain = Math.max(0, Math.ceil(20 - (Date.now() - g.at) / 1000));
      const v = Object.keys(g.votes).length;
      let msg = null;
      if (this.roomMode && g.needed > 1) {
        msg = T.msg('rdc.round.autoVotes', { v: v, n: g.needed, s: remain });
      } else if (this.roomMode) {
        msg = T.msg('rdc.round.autoRoom', { s: remain });
      } else {
        msg = T.msg('rdc.round.autoLocal', { s: remain });
      }
      hint.textContent = (msg && msg.indexOf('rdc.round') !== 0) ? msg :
        (this.roomMode ? ('الانتقال التلقائي خلال ' + remain + ' ث — أو وافق الجميع الآن') : 'انتقال تلقائي خلال ' + remain + ' ث — أو اضغط «الجولة التالية»');
    },

    _tickRoundGate: function () {
      const g = this._roundGate;
      if (!g || g.done) return;
      const elapsed = Date.now() - g.at;
      const voted = Object.keys(g.votes).length;
      if (this.roomMode && voted >= g.needed) { this._finishRoundGate(); return; }
      if (elapsed >= 20000) { this._finishRoundGate(); return; }
      this._paintRoundGate();
    },

    /** نقر زر «الجولة التالية» (محلي: مرور فوري؛ غرفة: تصويت للمرور) */
    _roundNextClick: function () {
      const g = this._roundGate;
      if (!g || g.done) { this._finishRoundGate(); return; }
      if (!this.roomMode) { this._finishRoundGate(); return; }
      const meId = rdMyUserId();
      if (!g.votes[String(meId)]) {
        g.votes[String(meId)] = true;
        try { this._netEmit('rnext', { round: g.round }); } catch (e) { /* تجاهل */ }
        this._paintRoundGate();
      }
      this._tickRoundGate();
    },

    /** صوت «المرور» وارد من لاعب آخر */
    _remoteNextVote: function (by, round) {
      const g = this._roundGate;
      if (!g || g.done) return;
      if (Number(round) !== Number(g.round)) return;
      if (by) g.votes[String(by)] = true;
      this._paintRoundGate();
      this._tickRoundGate();
    },

    _finishRoundGate: function () {
      const g = this._roundGate;
      if (!g || g.done) return;
      g.done = true;
      if (g.timer) clearInterval(g.timer);
      this._roundGate = null;
      this._overlay('round', false);
      Pipeline.resume();
    }
  };

  /* ============================ خط معالجة الأحداث ============================ */

  const sleep = function (ms) {
    const factor = (window.RondaApp && window.RondaApp.speed) ? window.RondaApp.speed : 1;
    return new Promise(function (res) { setTimeout(res, Math.max(1, ms * factor)); });
  };

  const Pipeline = {
    queue: [],
    processing: false,
    paused: false,
    seq: 0,

    reset: function () {
      this.seq++;
      this.queue = [];
      this.processing = false;
      this.paused = false;
    },

    push: function (ev) {
      this.queue.push(ev);
      this._pump();
    },

    pause: function () { this.paused = true; },

    resume: function () {
      this.paused = false;
      this._pump();
    },

    async _pump() {
      if (this.processing || this.paused) return;
      this.processing = true;
      const mySeq = this.seq;
      try {
        while (this.queue.length > 0 && !this.paused && mySeq === this.seq) {
          const ev = this.queue.shift();
          await this.handle(ev);
          if (App._matchOver) { this.queue = []; break; }
          /* الفوز الفوري: بلوغ الهدف في منتصف الجولة → إنهاء فوراً */
          App._checkEarlyWin();
        }
      } catch (e) {
        console.error('pipeline error', e);
      }
      this.processing = false;
      if (mySeq === this.seq && !this.paused) this.onDrained();
    },

    onDrained: function () {
      App.busy = false;
      if (!App.game || App._matchOver) return;
      App.refreshView({});
      if (App.roomMode) {
        /* الغرفة: السائق يتولى مقاعد الآلي والمنقطعين — البقية تنتظر بثّ حركتهم */
        try { App.roomDriverTick(); } catch (e) { console.error('rd driver tick', e); }
        return;
      }
      if (App.aiPlayers.length > 0) {
        const cur = App.game.state.currentSeat;
        const view = App.game.getView(cur == null ? 0 : cur);
        if (view && view.phase === 'Playing' && cur != null && App.aiPlayers.indexOf(cur) >= 0) {
          setTimeout(function () {
            try { App.aiPlay(); } catch (e) { console.error(e); }
          }, 650);
        }
      }
    },

    /* ---------------- معالجة كل حدث ---------------- */

    async handle(ev) {
      switch (ev.type) {
        case 'GameStarted': {
          const shown = (App._displayTarget !== undefined && App._displayTarget !== null)
            ? App._displayTarget : ev.targetScore;
          R.addLog(T.msg('rdc.log.gameStart', { target: shown }));
          break;
        }

        case 'FirstDealerDrawn': {
          /* [FirstDealer] قرعة الموزع الأول: ورقة لكل لاعب — أصغرها توزع (بينيا) */
          if (App.game && ev.dealerSeat != null) {
            const dealer = App.game.state.getPlayerBySeat(ev.dealerSeat);
            const nm = dealer ? App.playerName(dealer.id) : '?';
            const cardsTxt = (ev.cards || []).map(function (c) {
              const p = App.game ? App.game.state.getPlayerBySeat(c.seat) : null;
              return (p ? App.playerName(p.id) : ('seat ' + c.seat)) + ': ' + c.rank + ' ' + c.suit;
            }).join(' · ');
            R.addLog(T.msg('rdc.log.firstDealer', { name: nm }));
            R.addLog('🃏 ' + cardsTxt);
            R.showBanner(T.msg('rdc.ban.firstDealer', { name: nm }), '', 'rd-b-declare', 1.4);
          }
          break;
        }

        case 'CardsDealt': {
          /* بعد الترقية وسط توزيعة: التوزيعة الجديدة تكشف اليد المشروعة */
          if (App._handDefer) {
            const st = App.game ? App.game.state : null;
            if (st && (st.roundNumber !== App._handDefer.round || st.dealNumber !== App._handDefer.deal)) {
              App._handDefer = null;
            }
          }
          if (ev.isRedeal) {
            R.showBanner(T.msg('rdc.ban.redeal'), '', 'rd-b-declare', 1.1);
            R.addLog(T.msg('rdc.log.deal', { n: ev.dealNumber, n2: '3' }), '');
            SFX.deal();
            await sleep(420);
          } else if (App.game && App.game.state.roundNumber !== App.lastRoundLogged) {
            App.lastRoundLogged = App.game.state.roundNumber;
            const dealer = App.game.state.getPlayerBySeat(App.game.state.dealerSeat);
            R.addLog(T.msg('rdc.log.roundStart', { n: App.game.state.roundNumber, name: App.playerName(dealer.id) }));
            SFX.deal();
            await sleep(300);
          } else {
            await sleep(200);
          }
          App.refreshView({ animateDeal: true });
          await sleep(520);
          break;
        }

        case 'DeclarationsResolved': {
          if (!ev.declarations || ev.declarations.length === 0) break;
          for (const d of ev.declarations) {
            const name = App.playerName(d.playerId);
            let typeName;
            if (d.type === 'Quadra') typeName = T.msg('rdc.ban.quadra');
            else if (d.type === 'Trenda') typeName = T.msg('rdc.ban.trenda');
            else typeName = T.msg('rdc.ban.ronda');
            R.showBanner(typeName, d.rank + ' — ' + name, 'rd-b-declare', 1.25);
            R.addLog(T.msg('rdc.log.decl', { name: name, type: typeName, rank: d.rank }), 'rd-log-declare');
            SFX.declare(d.type === 'Trenda' || d.type === 'Quadra');
            await sleep(850);
          }
          if (ev.winnerTeamId !== null && ev.awardedPoints > 0) {
            const winnerName = App.playerName(ev.winnerPlayerId);
            R.showBanner(winnerName, T.msg('rdc.ban.declWinSub', { pts: ev.awardedPoints }), 'rd-b-declare', 1.4);
            R.addLog(T.msg('rdc.log.declWin', { name: winnerName, pts: ev.awardedPoints }), 'rd-log-declare');
            SFX.declare(ev.awardedPoints > 3);
            App.refreshView({});
            await sleep(900);
          }
          break;
        }

        case 'CardPlayed': {
          const isViewerCard = String(ev.playerId) === String(App.currentViewerId);
          SFX.flip();
          if (isViewerCard) App.refreshView({});
          let fromRect = null;
          if (isViewerCard) fromRect = App.handCardRect(ev.cardId);
          else fromRect = App.seatRectFor(ev.playerId);
          if (!fromRect) fromRect = App.tableCenterRect();
          const toRect = App.tableCenterRect();
          R.flyCard(fromRect, toRect, ev.card, { duration: 280, toRotate: (((ev.cardId * 53) % 9) - 4) });
          await sleep(300);
          App.refreshView({ animateNew: true });
          await sleep(120);
          break;
        }

        case 'CardsCaptured': {
          const capturerName = App.playerName(ev.playerId);
          R.addLog(T.msg('rdc.log.captured', { name: capturerName, n: ev.cards.length }));
          const ranks = [];
          for (const c of ev.cards) { if (!ranks.includes(c.rank)) ranks.push(c.rank); }
          if (ranks.length > 1) {
            R.addLog(T.msg('rdc.log.chain', { chain: ranks.join(' → ') }));
          }
          await sleep(150);
          const toRect = App.seatRectFor(ev.playerId);
          document.querySelectorAll('#table-cards .rd-card').forEach(function (cardEl) {
            const id = Number(cardEl.dataset.cardId);
            if (ev.cardIds.includes(id)) cardEl.classList.add('rd-capturing');
          });
          SFX.capture(ev.cards.length);
          await sleep(300);
          const fromRects = [];
          document.querySelectorAll('#table-cards .rd-card').forEach(function (cardEl) {
            const id = Number(cardEl.dataset.cardId);
            if (ev.cardIds.includes(id)) fromRects.push(cardEl.getBoundingClientRect());
          });
          App.refreshView({});
          fromRects.forEach(function (fr, i) {
            R.flyCard(fr, toRect, ev.cards[i] || ev.cards[0], { duration: 380, fadeOut: true });
          });
          await sleep(280);
          break;
        }

        case 'Strike': {
          const name = App.playerName(ev.playerId);
          R.showBanner(T.msg('rdc.ban.strike'), T.msg('rdc.ban.sub', { name: name, pts: ev.points }), 'rd-b-strike', 1.2);
          R.addLog(T.msg('rdc.log.strike', { name: name, pts: ev.points }), 'rd-log-strike');
          SFX.strike();
          App.refreshView({});
          await sleep(650);
          break;
        }

        case 'Rope': {
          const name = App.playerName(ev.playerId);
          R.showBanner(T.msg('rdc.ban.rope'), T.msg('rdc.ban.sub', { name: name, pts: ev.points }), 'rd-b-rope', 1.3);
          R.addLog(T.msg('rdc.log.rope', { name: name, pts: ev.points }), 'rd-log-rope');
          SFX.rope();
          App.refreshView({});
          await sleep(800);
          break;
        }

        case 'DoubleRope': {
          const name = App.playerName(ev.playerId);
          R.showBanner(T.msg('rdc.ban.double'), T.msg('rdc.ban.sub', { name: name, pts: ev.points }), 'rd-b-double', 1.6);
          R.addLog(T.msg('rdc.log.double', { name: name, pts: ev.points }), 'rd-log-double');
          SFX.doubleRope();
          App.refreshView({});
          await sleep(1000);
          break;
        }

        case 'Mesa': {
          const name = App.playerName(ev.playerId);
          R.showBanner(T.msg('rdc.ban.mesa'), T.msg('rdc.ban.sub', { name: name, pts: ev.points }), 'rd-b-mesa', 1.3);
          R.addLog(T.msg('rdc.log.mesa', { name: name, pts: ev.points }), 'rd-log-mesa');
          SFX.mesa();
          App.refreshView({});
          await sleep(700);
          break;
        }

        case 'Qa3aRey': {
          const name = App.playerName(ev.playerId);
          R.showBanner(T.msg('rdc.ban.qa3aRey'), T.msg('rdc.ban.sub', { name: name, pts: ev.points }), 'rd-b-qa3a', 1.5);
          R.addLog(T.msg('rdc.log.qa3aRey', { name: name, pts: ev.points }), 'rd-log-qa3a');
          SFX.qa3a();
          App.refreshView({});
          await sleep(850);
          break;
        }

        case 'Qa3aAs': {
          const teamName = App.game.state.getTeam(ev.teamId).name;
          R.showBanner(T.msg('rdc.ban.qa3aAs'), T.msg('rdc.ban.sub', { name: teamName, pts: ev.points }), 'rd-b-qa3a', 1.5);
          R.addLog(T.msg('rdc.log.qa3aAs', { name: teamName, pts: ev.points }), 'rd-log-qa3a');
          SFX.qa3a();
          App.refreshView({});
          await sleep(850);
          break;
        }

        case 'ScoreChanged': {
          App.refreshView({});
          await sleep(110);
          break;
        }

        case 'FinalCardsAwarded': {
          const name = App.playerName(ev.playerId);
          R.addLog(T.msg('rdc.log.finalCards', { n: ev.cards.length, name: name }));
          await sleep(250);
          break;
        }

        case 'TurnChanged': {
          App._turnStartedAt = Date.now();
          /* تبديل العارض في الوضع متعدد اللاعبين المحلي (ساخن): صاحب الدور
             الجديد يرى يده — لا شاشات خصوصية. في الغرفة كل عميل على مقعده. */
          if (!App.roomMode && App.config.family !== 'ai' && App.humanPlayers.indexOf(ev.playerId) >= 0) {
            App.currentViewerId = ev.playerId;
          }
          App.refreshView({});
          await sleep(120);
          break;
        }

        case 'RoundEnded': {
          R.addLog(T.msg('rdc.log.roundEnd', { n: ev.roundNumber }));
          SFX.mesa();
          App.refreshView({});
          /* نهاية المباراة (الهدف أو «الرهان على جولة») تتبع هذه الجولة مباشرة
             في الطابور → لا نافذة نتائج، بل نافذة الفوز فوراً (القانون ③). */
          if (App._queueNextIsGameEnded()) {
            break;
          }
          R.renderBreakdown('round-breakdown', ev.breakdown);
          const ttl = document.getElementById('round-modal-title');
          if (ttl) {
            ttl.textContent = T.msg('rdc.ban.roundOver') + ' — ' + (T.msg('rdc.round.results', null) || 'نتائج الجولة');
          }
          App._overlay('round', true);
          Pipeline.pause();
          App._beginRoundGate(ev.roundNumber);
          break;
        }

        case 'GameEnded': {
          App._clearRoundGate();
          App._finishMatch(ev.winnerTeamId, ev.breakdown);
          break;
        }

        default:
          break;
      }
    }
  };

  /* ============================ السفافات ============================ */

  App.renderConfetti = function () {
    const box = document.querySelector('#overlay-match .rd-confetti');
    if (!box) return;
    box.innerHTML = '';
    const colors = ['#e2b857', '#e28a5f', '#7fa8e8', '#58c987', '#b78be0', '#f0a64e'];
    for (let i = 0; i < 46; i++) {
      const s = document.createElement('span');
      s.style.left = (Math.random() * 100) + '%';
      s.style.background = colors[i % colors.length];
      s.style.animationDuration = (2.4 + Math.random() * 2.4) + 's';
      s.style.animationDelay = (Math.random() * 2.2) + 's';
      s.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      box.appendChild(s);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     غرف المنصة — روندا أونلاين (نمط رامي/بارتشي)
     • الموزع (السائق) يختار بذرة موحّدة ويبثّ init → كل عميل يبني نفس
       المحرك الحتمي (نفس البذرة) فيتطابق التوزيع وكل الأحداث.
     • كل لعب human يُنفَّذ محلياً ويُبثّ play — يطبّقه البقية فيتطابقون.
     • السائق يتولى مقاعد البوتّات والمنقطعين (RondaAI) ويبثّ أوراقهم.
     • العودة/المتفرج تُعاد عبر سجل الخادم room:replay (لا كشف للأيدي).
     =============================================================== */

  function rdMyUserId() {
    if (typeof AUTH !== 'undefined' && AUTH.user) return AUTH.user.id != null ? AUTH.user.id : AUTH.user.username;
    if (typeof ST !== 'undefined' && ST.user && ST.user.id) return ST.user.id;
    if (typeof ST !== 'undefined' && ST.user && ST.user.username) return ST.user.username;
    if (typeof Session !== 'undefined' && Session.user) return (Session.user.id != null ? Session.user.id : Session.user.username);
    return 'me';
  }

  /* ── أدوات هوية/مقاعد الغرفة ── */

  App._roomState = function () {
    return (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : this.room;
  };

  App._isDriver = function () {
    if (!this.roomMode) return true;
    const room = this._roomState();
    if (!room) return false;
    const driverId = (room.driverId != null) ? room.driverId : room.owner_id;
    return driverId != null && String(driverId) === String(rdMyUserId());
  };

  App._myEntry = function () {
    const meId = rdMyUserId();
    const room = this._roomState();
    if (!room || !room.players) return null;
    for (let i = 0; i < room.players.length; i++) {
      if (String(room.players[i].id) === String(meId)) return room.players[i];
    }
    return null;
  };

  App._roomOrder = function () {
    const room = this._roomState();
    return (room && room.order) ? room.order.slice() : [];
  };

  App._namesForRoom = function (order) {
    const room = this._roomState();
    const names = [];
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      let nm = String(id);
      if (room && room.players) {
        for (let j = 0; j < room.players.length; j++) {
          if (String(room.players[j].id) === String(id)) { nm = room.players[j].username || nm; break; }
        }
      }
      if (String(id).indexOf('bot:') === 0) nm = nm.replace(/^bot:/, '');
      names.push(nm);
    }
    return names;
  };

  /** هل مقعد المحرك seat يحتاج لعباً آلياً من السائق؟ (بوت أو بشري منقطع) */
  App._seatNeedsDriver = function (seat) {
    const room = this._roomState();
    const order = (room && room.order) ? room.order : [];
    if (!order.length || seat == null || seat < 0 || seat >= order.length) return false;
    const pid = String(order[seat]);
    if (pid.indexOf('bot:') === 0) return true;
    /* بشري: إن لم يكن في المتصلين الحيّين → تولٍّ آلي */
    const online = (room && room.online) ? room.online : null;
    if (!online || online.length === 0) return false;
    for (let i = 0; i < online.length; i++) {
      if (String(online[i]) === pid) return false;
    }
    return true;
  };

  App._recomputeIdentity = function () {
    const room = this._roomState();
    if (!room || !room.players) return;
    const meId = rdMyUserId();
    const order = (room.order || []);
    let mySeat = -1;
    for (let i = 0; i < order.length; i++) {
      if (String(order[i]) === String(meId)) { mySeat = i; break; }
    }
    const entry = this._myEntry();
    this.isSpectator = !!(entry && entry.spectate);
    if (this.isSpectator) mySeat = -1;
    if (!this.isSpectator && mySeat === -1) mySeat = 0;
    this.myPlayerId = mySeat;
    this.currentViewerId = this.isSpectator ? -1 : mySeat;
  };

  /* ── عناصر الانتظار/الحالة ── */

  App._showWaiting = function (txt, sub, isErr) {
    const w = document.getElementById('rd-waiting');
    if (!w) return;
    const t = document.getElementById('rd-wait-txt');
    const s = document.getElementById('rd-wait-sub');
    if (t) t.textContent = txt || '';
    if (s) { s.textContent = sub || ''; s.classList.toggle('rd-wait-err', !!isErr); }
    w.classList.remove('rd-hidden');
  };

  App._hideWaiting = function () {
    const w = document.getElementById('rd-waiting');
    if (w) w.classList.add('rd-hidden');
  };

  App._startPulse = function () {
    if (this._roomPulse) return;
    const self = this;
    this._roomPulse = setInterval(function () {
      try { self.roomPulse(); } catch (e) { /* تجاهل */ }
    }, 2500);
  };

  App._stopPulse = function () {
    if (this._roomPulse) { clearInterval(this._roomPulse); this._roomPulse = null; }
  };

  App.roomPulse = function () {
    if (!this.roomMode || this._replaying || this.busy || this._matchOver) return;
    if (this.game) { try { this.roomDriverTick(); } catch (e) { /* تجاهل */ } }
  };

  /* ── دخول الغرفة (بدء / عودة / متفرج) ── */

  /**
   * live=true: فُتحت الصفحة وجولة الغرفة جارية (استئناف) — لا تهيئة جديدة.
   * live=false: إشارة startHandler — بدء/مباراة جديدة.
   */
  App.enterRoom = function (room, opts) {
    if (!room) return;
    const o = opts || {};
    if (!o.live && this.roomMode && this.room &&
        String(this.room.id) === String(room.id) && this.game && !this._matchOver) {
      return;   /* [Dedup] بدء مكرر أثناء جولة مبنية فعلاً */
    }
    this._pipeSeq++;
    Pipeline.reset();
    if (this._waitTimer) { clearTimeout(this._waitTimer); this._waitTimer = null; }
    this.roomMode = true;
    this.room = room;
    this.game = null;
    this.aiPlayers = [];
    this.humanPlayers = [];
    this.busy = false;
    this._matchOver = false;
    this._handDefer = null;
    this._replaying = false;
    this.lastRoundLogged = 0;
    this._lastActAt = Date.now();
    this._turnStartedAt = Date.now();
    this.startClock();
    this._startPulse();

    try {
      ['overlay-rules', 'overlay-round', 'overlay-match'].forEach(function (id) {
        const n = document.getElementById(id);
        if (n) n.classList.add('rd-hidden');
      });
    } catch (e) { /* تجاهل */ }
    try {
      const bar = document.getElementById('rd-specbar');
      if (bar) { bar.classList.add('rd-hidden'); bar.innerHTML = ''; }
    } catch (e) { /* تجاهل */ }
    const list = document.getElementById('log-list');
    if (list) list.innerHTML = '';
    const cfg = this._roomCfg();
    const ht = document.getElementById('hud-target');
    if (ht) ht.textContent = (cfg.target === 'round') ? (T.msg('rdc.target.round', null) || 'جولة') : String(cfg.target);
    this.showScreen('game');

    this._recomputeIdentity();

    const order = this._roomOrder();
    const n = order.length;
    if (n < 2 || n > 4) {
      this._showWaiting(T.msg('rdc.room.badSeats', null) || 'تتطلب الروندا من 2 إلى 4 مقاعد…', '', true);
      return;
    }

    if (this.isSpectator) {
      this._showWaiting(T.msg('rdc.room.waitStart', null) || 'بانتظار بدء الموزع للجولة…',
        T.msg('rdc.room.specSub', null) || 'تشاهد الأفعال العامة فقط — الأيدي لا تُكشف أبداً');
      if (room.hasHistory && typeof Rooms !== 'undefined' && typeof Rooms.requestReplay === 'function') {
        this._waitTimer = setTimeout(function () { try { Rooms.requestReplay(); } catch (e) {} }, 250);
      }
      return;
    }

    /* جولة جارية فعلاً (عودة بعد إغلاق/انقطاع): إعادة بناء من سجل الخادم */
    if (room.hasHistory) {
      this._showWaiting(T.msg('rdc.room.waitReplay', null) || 'جارٍ استرجاع الجولة من السجل…',
        T.msg('rdc.room.waitStart', null) || 'بانتظار بدء الموزع');
      if (typeof Rooms !== 'undefined' && typeof Rooms.requestReplay === 'function') {
        this._waitTimer = setTimeout(function () { try { Rooms.requestReplay(); } catch (e) {} }, 200);
      }
      return;
    }

    if (this._isDriver()) {
      this._hostInitRoom(room, cfg);
      return;
    }
    this._showWaiting(T.msg('rdc.room.waitStart', null) || 'بانتظار بدء الموزع للجولة…',
      String((this.myPlayerId >= 0 ? this.myPlayerId + 1 : '?') + ' / ' + (n || 1)));
  };

  App._roomCfg = function () {
    const rc = (typeof window !== 'undefined' && window.RD_ROOM_CFG) ? window.RD_ROOM_CFG : null;
    const target = (rc && rc.target !== undefined && rc.target !== null && rc.target !== '')
      ? rc.target : 51;
    const timer = Math.max(30, Math.min(300, Math.round(Number((rc && rc.timer) || 60))));
    /* [RDC-mode4] نمط 4 لاعبين من إعدادات الغرفة: 'ffa' (1ضد3 فردي) أو 'tt' (2ضد2 فرق) */
    const mode4 = (rc && rc.mode4) ? String(rc.mode4) : 'tt';
    return { target: (String(target) === 'round') ? 'round' : (Number(target) || 51), timer: timer, mode4: mode4 };
  };

  /** الموزع (السائق): بذرة موحّدة + بناء محلي + بثّ التهيئة */
  App._hostInitRoom = function (room, cfg) {
    const order = this._roomOrder();
    const n = order.length;
    if (n < 2 || n > 4) return;
    const seed = ((Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0) || 1;
    /* [RDC-ffa] 2 = 1ضد1، 3 = 1ضد2 (فردي)، 4 = حسب mode4: ffa → 1ضد3 فردي / tt → 2ضد2 فرق */
    const payload = {
      engine: (n === 4 && cfg.mode4 !== 'ffa') ? 'tt' : 'ht',
      seed: seed,
      target: cfg.target,
      timer: cfg.timer,
      names: this._namesForRoom(order),
      order: order
    };
    this._buildRoomGame(payload);
    this._netEmit('init', payload);
  };

  /** بناء محرك الغرفة (نفس البذرة/الأسماء عند الجميع) */
  App._buildRoomGame = function (data, wasSpectator) {
    if (!data) return;
    const order = data.order || this._roomOrder();
    const n = order.length;
    if (n < 2 || n > 4) return;
    /* [RDC-ffa] 3 لاعبين = 1ضد2 (فردي دائماً) — 4 لاعبين: 'tt' فرق 2ضد2 أو 'ht' فردي 1ضد3
       (engine يرسله الموزع: n=4 مع mode4=ffa يبث 'ht' → 4 مقاعد FreeForAll) */
    const engineMode = (n === 4 && (data.engine === 'tt' || (!data.engine && !this._roomCfg)))
      ? RC.GameMode.TEAM_VS_TEAM
      : ((n === 2) ? RC.GameMode.HEAD_TO_HEAD : RC.GameMode.FREE_FOR_ALL);
    const names = data.names || this._namesForRoom(order);
    const seed = (Number(data.seed) >>> 0) || 1;
    /* «الرهان على جولة» في الغرف: مباراة من جولة واحدة (تُحسم بعد الـ40 ورقة) */
    const roundTarget = String(data.target) === 'round';
    const rules = new RC.RondaRulesConfig({
      targetScore: roundTarget ? 9999 : (Number(data.target) || 51),
      singleRoundMode: roundTarget
    });

    this._pipeSeq++;
    Pipeline.reset();
    const game = new RC.RondaGame({ mode: engineMode, names: names, seed: seed, rules: rules, playerCount: n });
    this.game = game;
    /* مهلة الدور في الغرفة = القيمة المختارة من الإعدادات (30–300 ثانية) */
    if (data.timer) {
      try { window.RD_ROOM_AI_GRACE = Math.max(30000, Math.min(300000, Number(data.timer) * 1000)); } catch (e) { /* تجاهل */ }
    }
    this.aiPlayers = [];
    for (let i = 0; i < order.length; i++) {
      if (String(order[i]).indexOf('bot:') === 0) this.aiPlayers.push(i);
    }
    this.humanPlayers = [];
    this.busy = false;
    this._matchOver = false;
    this.lastRoundLogged = 0;
    this._turnStartedAt = Date.now();
    const list = document.getElementById('log-list');
    if (list) list.innerHTML = '';
    this._hideWaiting();
    try {
      const bar = document.getElementById('rd-specbar');
      if (bar) { bar.classList.add('rd-hidden'); bar.innerHTML = ''; }
    } catch (e) { /* تجاهل */ }
    this._displayTarget = roundTarget ? (T.msg('rdc.target.round', null) || 'جولة') : rules.targetScore;
    const htEl = document.getElementById('hud-target');
    if (htEl) htEl.textContent = this._displayTarget;

    game.onEvent(function (ev) {
      if (!App._replaying) Pipeline.push(ev);
    });
    game.start();
    if (!this._replaying) Pipeline._pump();
    App._hideWaiting();
    App.refreshView({});

    /* متفرج رُقّي أثناء جولة قائمة: لا تكشف له يد التوزيعة الجارية (ليست له)
       حتى تبدأ توزيعة/جولة جديدة بعد انضمامه */
    if (wasSpectator && !this.isSpectator && this.game) {
      const st = this.game.state;
      if (st && st.players[this.myPlayerId >= 0 ? this.myPlayerId : 0].hand.length > 0) {
        this._handDefer = { round: st.roundNumber, deal: st.dealNumber };
      }
    }
  };

  /** بثّ حركة — تُحفظ في سجل الخادم وتصل للجميع */
  App._netEmit = function (action, data, extra) {
    if (!this.roomMode) return false;
    if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.sendMove !== 'function') return false;
    this._netSeq = (this._netSeq || 0) + 1;
    const payload = { action: action, data: data || {}, by: rdMyUserId(), seq: this._netSeq, ts: Date.now() };
    if (extra && extra.dedup) payload.dedup = extra.dedup;
    try {
      Rooms.sendMove('rmove', payload, { game_id: 'rd', status: 'playing' });
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[Ronda MP] emit', e);
    }
    return true;
  };

  /** استقبال حركة من الغرفة (SSE room:move) — يُتجاهل صدى حركاتي */
  App.netApplyMove = function (d) {
    if (!d) return;
    if (!this.roomMode) return;
    if (d.by && String(d.by) === String(rdMyUserId())) return;
    const action = d.action;
    const data = d.data || {};

    if (action === 'init') {
      if (this.game && !this._replaying) { App.refreshView({}); return; }
      this._hideWaiting();
      this._buildRoomGame(data);
      return;
    }

    /* تصويت «المرور للجولة التالية» — لا يحتاج محركاً، فقط البوابة */
    if (action === 'rnext') {
      App._remoteNextVote(d.by, data.round);
      return;
    }

    if (!this.game || this._matchOver) return;

    if (action === 'play') {
      if (this._replaying) return;
      const pid = data.playerId;
      const cid = data.cardId;
      if (pid == null || cid == null) return;
      try {
        this.game.playCard(pid, cid);
        this._lastActAt = Date.now();
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[Ronda MP] apply play', e && e.message);
      }
    }
  };

  /* ── قيادة مقاعد البوتّات والمنقطعين (السائق فقط) ── */

  App.roomDriverTick = function () {
    if (!this.roomMode || !this.game || this.isSpectator || this.busy || this._matchOver) return;
    if (!this._isDriver()) return;
    const st = this.game.state;
    if (!st || (st.phase !== RC.GamePhase.PLAYING && st.phase !== RC.GamePhase.DECLARATION)) return;
    const seat = st.currentSeat;
    if (seat == null || seat < 0) return;

    /* بوت/منقطع → تولٍّ آلي فوري؛ بشري متصل تجاوز مهلة الانتظار → تولٍّ احتياطي */
    const needsDriver = this._seatNeedsDriver(seat);
    if (!needsDriver) {
      const grace = (typeof window !== 'undefined' && Number(window.RD_ROOM_AI_GRACE)) || 60000;
      if (Date.now() - (this._lastActAt || Date.now()) < grace) return;
    }
    const now = Date.now();
    if (this._aiScheduled && now - this._aiScheduled < 1200) return;
    this._aiScheduled = now;

    const roomId = (this.room && this.room.id) || (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.id) || 'rd';
    const dedup = 'rdai:' + roomId + ':' + st.roundNumber + ':' + st.dealNumber + ':' + seat + ':' + st.playedCardsInCurrentDeal + ':' + this._netSeq;
    setTimeout(function () {
      try {
        App._aiScheduled = 0;
        if (!App.roomMode || !App.game || App.busy || App._matchOver) return;
        const st2 = App.game.state;
        if (!st2 || (st2.phase !== RC.GamePhase.PLAYING && st2.phase !== RC.GamePhase.DECLARATION)) return;
        if (st2.currentSeat !== seat) return;
        const cardId = RC.RondaAI.chooseCard(App.game, seat);
        if (cardId === null) return;
        App.game.playCard(seat, cardId);
        App._lastActAt = Date.now();
        App._netEmit('play', { playerId: seat, cardId: cardId }, { dedup: dedup });
      } catch (e) {
        if (typeof console !== 'undefined') console.error('[Ronda MP] AI takeover', e);
      }
    }, needsDriver ? 900 : 600);
  };

  /* ── إعادة البناء من سجل الخادم (room:replay — عودة/متفرج جديد) ── */

  App.applyReplay = function (history, roomId) {
    if (!history || !history.length) return;
    if (this.game && !this._replaying) return;
    const rs = this._roomState();
    if (!this.roomMode && rs && rs.game_id === 'rd') {
      this.roomMode = true;
      this.room = rs;
      this._recomputeIdentity();
    }
    if (!this.roomMode) return;
    const wasSpectator = this.isSpectator;
    this._replaying = true;
    this._matchOver = false;
    try {
      for (let i = 0; i < history.length; i++) {
        const m = history[i];
        const md = m.data || {};
        if (m.action === 'init') {
          this._buildRoomGame(md, wasSpectator);
        } else if (m.action === 'play' && this.game) {
          try { this.game.playCard(md.playerId, md.cardId); } catch (e) { /* أخطاء إعادة فردية تُتجاوز */ }
        }
      }
      this._replaying = false;
      if (!this.game) { this._replaying = false; return; }
      this.busy = false;
      this._hideWaiting();
      Pipeline.reset();
      this.refreshView({});
      if (this._isDriver()) this.roomDriverTick();
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[Ronda MP] applyReplay', e && e.message);
      this._replaying = false;
    }
  };

  /* ── تحديث حالة الغرفة (room:update) ── */

  App.roomUpdate = function (room) {
    if (!this.roomMode) return;
    const wasSpectator = this.isSpectator;
    this.room = room || this.room;
    this._recomputeIdentity();
    /* ترقية متفرج → لاعب في جولة جارية: ينتظر إعادة بناء ثم يحجب اليد الجارية */
    if (wasSpectator && !this.isSpectator && this.game && !this._handDefer) {
      const st = this.game.state;
      if (st && st.players[this.myPlayerId >= 0 ? this.myPlayerId : 0] &&
          st.players[this.myPlayerId >= 0 ? this.myPlayerId : 0].hand.length > 0) {
        this._handDefer = { round: st.roundNumber, deal: st.dealNumber };
        this._showWaiting(
          T.msg('rdc.room.welcomeSeat', null) || '🎮 انضممت كلاعب — ستلعب من التوزيعة القادمة',
          T.msg('rdc.room.specSub', null) || 'التوزيعة الجارية تُستكمل آلياً — لا كشف للأيدي', false);
      }
    }
    const ov = document.getElementById('overlay-match');
    if (ov && !ov.classList.contains('rd-hidden')) this._renderRoomMatchActions();
    if (this.game && !this._replaying) this.refreshView({});
  };

  /* ── نهاية مباراة الغرفة: تسوية (1ضد1 أو تقسيم فرق 2ضد2) + تصويت مباراة جديدة ── */

  App._onRoomMatchOver = function (ev) {
    this._matchOver = true;
    this._renderRoomMatchActions();
    setTimeout(function () {
      try {
        const rs = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : null;
        if (!rs) return;
        const meId = rdMyUserId();
        let entry = null;
        if (rs.players) for (let i = 0; i < rs.players.length; i++) {
          if (String(rs.players[i].id) === String(meId)) { entry = rs.players[i]; break; }
        }
        if (!entry || entry.spectate) return;
        const order = rs.order || [];
        const bet = Number(rs.bet) || 0;
        const isHost = String(rs.owner_id) === String(meId);
        const wTeam = (ev && ev.winnerTeamId != null) ? Number(ev.winnerTeamId) : 0;
        if (bet > 0 && !rs.settled && isHost) {
          const cfg = App._roomCfg();
          /* [RDC-ffa] فردي (2 أو 3 لاعبين، أو 4 بوضع ffa): الفائز يأخذ الكل — 'w0'/'w1'/'w2'/'w3'.
             في FFA كل لاعب فريق مستقل → winnerTeamId = مقعد الفائز مباشرة */
          const isFFA = (order.length === 3) || (order.length === 4 && cfg.mode4 === 'ffa');
          if (typeof Rooms.roomSettle === 'function' && (order.length === 2 || isFFA)) {
            const seat = Math.max(0, Math.min(order.length - 1, wTeam));
            try { Rooms.roomSettle('w' + seat); } catch (e) {}
          } else if (order.length === 4 && typeof Rooms.settleTeam === 'function') {
            /* 2ضد2: تقسيم أرباح الرهان بين الفريق الفائز (خادمياً) — 't0'/'t1' */
            try { Rooms.settleTeam((wTeam === 0) ? 't0' : 't1'); } catch (e) {}
          }
        }
        setTimeout(function () {
          try { if (typeof Rooms.startRematch === 'function') Rooms.startRematch(); } catch (e) {}
        }, 900);
      } catch (e) { /* تجاهل */ }
    }, 500);
  };

  /* منطقة إجراءات نهاية المباراة داخل طبقة الفوز (حسب حالة الغرفة) */
  App._renderRoomMatchActions = function () {
    const box = document.getElementById('match-room-actions');
    if (!box) return;
    const rs = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : null;
    if (!rs) { box.classList.add('rd-hidden'); return; }
    box.classList.remove('rd-hidden');

    const meId = rdMyUserId();
    let entry = null;
    if (rs.players) for (let i = 0; i < rs.players.length; i++) {
      if (String(rs.players[i].id) === String(meId)) { entry = rs.players[i]; break; }
    }
    const isPlayer = !!(entry && !entry.spectate);
    const rem = rs.rematch || null;
    let html = '';

    if (rem && rem.resolved) {
      if (rem.rematch && rs.status === 'playing') {
        html = '<div class="rd-room-act-txt">' + (T.msg('rdc.room.restarting', null) || '✅ وافق اللاعبون — تبدأ مباراة جديدة…') + '</div>';
      } else if (!rem.rematch) {
        html = '<div class="rd-room-act-txt">' + (T.msg('rdc.room.noRematch', null) || 'لا موافقة كافية على مباراة جديدة.') + '</div>' +
          '<button type="button" class="rd-btn-ghost rd-act-btn" id="rd-act-lobby">🛡️ ' + (T.msg('ui.roomTitle', null) || 'الغرفة') + '</button>' +
          '<button type="button" class="rd-btn-ghost rd-act-btn" id="rd-act-menu">' + (T.msg('rdc.match.menu', null) || 'القائمة الرئيسية') + '</button>';
      }
    } else if (rem && !rem.resolved) {
      const votes = rem.votes || {};
      const voted = votes[meId];
      html = '<div class="rd-room-act-txt">' + (T.msg('rdc.room.rematchVote', null) || 'مباراة جديدة؟') + '</div>';
      if (isPlayer) {
        if (voted) {
          html += '<div class="rd-room-act-txt rd-room-act-voted">' + (T.msg('rdc.room.voted', null) || '✅ تم تسجيل صوتك — بانتظار البقية') + '</div>';
        } else {
          html += '<button type="button" class="rd-btn-primary rd-act-btn" id="rd-act-agree">✅ ' + (T.msg('ui.roomRematchYes', null) || 'موافقة') + '</button>' +
                  '<button type="button" class="rd-btn-ghost rd-act-btn" id="rd-act-refuse">❌ ' + (T.msg('ui.roomRematchNo', null) || 'رفض') + '</button>';
        }
      } else {
        html += '<div class="rd-room-act-txt">' + (T.msg('rdc.room.waitVotes', null) || 'بانتظار تصويت اللاعبين…') + '</div>';
      }
    } else {
      if (isPlayer && rs.status !== 'playing') {
        html += '<button type="button" class="rd-btn-primary rd-act-btn" id="rd-act-rematch">🔄 ' + (T.msg('rdc.match.new', null) || 'مباراة جديدة') + '</button>';
      }
      html += '<button type="button" class="rd-btn-ghost rd-act-btn" id="rd-act-lobby">🛡️ ' + (T.msg('ui.roomTitle', null) || 'الغرفة') + '</button>' +
              '<button type="button" class="rd-btn-ghost rd-act-btn" id="rd-act-menu">' + (T.msg('rdc.match.menu', null) || 'القائمة الرئيسية') + '</button>';
    }

    const bNM = document.getElementById('btn-new-match');
    const bBM = document.getElementById('btn-back-menu');
    if (bNM) bNM.classList.add('rd-hidden');
    if (bBM) bBM.classList.add('rd-hidden');
    box.innerHTML = html;

    const wire = function (id, fn) {
      const el2 = document.getElementById(id);
      if (el2) el2.addEventListener('click', fn);
    };
    wire('rd-act-agree', function () { try { Rooms.voteRematch('agree'); } catch (e) {} });
    wire('rd-act-refuse', function () { try { Rooms.voteRematch('refuse'); } catch (e) {} });
    wire('rd-act-rematch', function () { try { Rooms.startRematch(); } catch (e) {} });
    wire('rd-act-lobby', function () {
      try { if (typeof Rooms.openModal === 'function') Rooms.openModal(); } catch (e) {}
    });
    wire('rd-act-menu', function () {
      App._overlay('match', false);
      App.backToMenu();
    });
  };

  /* ============================ معالجات الغرفة (window) ============================ */

  function RD_roomStart(room) {
    const app = window.RondaApp;
    if (app && room) {
      try { app.enterRoom(room, { live: false }); } catch (e) { console.error('[Ronda MP] start', e); }
    }
  }

  function RD_roomMove(d) {
    const app = window.RondaApp;
    if (!app) return;
    try {
      if (d && d.action === 'rmove' && d.data) d = d.data;
      app.netApplyMove(d);
    } catch (e) { console.error('[Ronda MP] move', e && e.message); }
  }

  function RD_roomUpdate(room) {
    const app = window.RondaApp;
    if (app) { try { app.roomUpdate(room); } catch (e) {} }
  }

  function RD_applyReplay(d) {
    const app = window.RondaApp;
    if (!app) return;
    try {
      const rs = (typeof Rooms !== 'undefined' && Rooms.state) ? Rooms.state : null;
      if (rs && rs.game_id !== 'rd') return;
      app.applyReplay((d && d.history) || [], (d && d.room_id) || null);
    } catch (e) { console.error('[Ronda MP] replay', e && e.message); }
  }

  function rdRegisterRooms() {
    if (typeof Rooms === 'undefined' || !Rooms || typeof Rooms.setGameHandler !== 'function') return;
    Rooms.setGameHandler(RD_roomMove);
    Rooms.setStartHandler(RD_roomStart);
    if (typeof Rooms.setUpdateHandler === 'function') Rooms.setUpdateHandler(RD_roomUpdate);
    if (typeof Rooms.hasPendingReplay === 'function' && Rooms.hasPendingReplay()) {
      const rp = Rooms.consumePendingReplay();
      if (rp && rp.history && rp.history.length) { RD_applyReplay(rp); return; }
    }
    if (Rooms.state && Rooms.state.game_id === 'rd' && Rooms.state.status === 'playing') {
      const app = window.RondaApp;
      if (app && typeof app.enterRoom === 'function') {
        try { app.enterRoom(Rooms.state, { live: true }); } catch (e) { console.error('[Ronda MP] resume', e); }
      }
      if (typeof Rooms.requestReplay === 'function') {
        setTimeout(function () { try { Rooms.requestReplay(); } catch (e) {} }, 250);
      }
    }
  }

  window.RondaApp = App;
  window.rdMyUserId = rdMyUserId;
  window.RD_roomStart = RD_roomStart;
  window.RD_roomMove = RD_roomMove;
  window.RD_roomUpdate = RD_roomUpdate;
  window.RD_applyReplay = RD_applyReplay;
  window.rdRegisterRooms = rdRegisterRooms;
})();

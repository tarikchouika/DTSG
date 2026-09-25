/**
 * ============================================================================
 *  DominoApp — المتحكم الرئيسي للضومنة
 * ============================================================================
 *  • دورة حياة attach()/detach() — تُربط عند فتح اللعبة وتُنظّف عند الخروج
 *    (مؤقتات، مستمعون، طبقات) — نفس عقد RondaApp.
 *  • تعمل مستقلة تمامًا (محفظة محلية) وتتكامل داخل المنصة:
 *    الترجمة من قاموس المنصة إن وُجد · الصوت يتبع ST.mute ·
 *    الرهان عبر takeBet()/giveWin() · التذاكر عبر recordRound(…,'do') ·
 *    ملء الشاشة يديره openGame/closeGamePage (app-fs) — لا تدخّل هنا.
 *  • حفظ تلقائي + استئناف · تفضيلات محفوظة · ذكاء بثلاثة مستويات.
 *  المبدأ المعماري: الواجهة ترسل أوامر لـ DominoGame وتعرض أحداثه فقط.
 * ============================================================================
 */
(function (root) {
  'use strict';

  const Core = root.DominoCore;
  const NS = root.DominoGameNS;
  const R = root.DominoRenderer;
  const T = root.DMN_T;
  const FMT = root.DMN_FMT;
  const SFX = root.DominoAudio;

  const PREFS_KEY = 'dominoes.prefs';
  const SAVE_KEY = 'dominoes.save';

  /* [v2.51-DOMINO] أول حرفين من الاسم لشارة اللاعب (آمن لمحارف الـemoji). */
  function initials(name) {
    const cp = Array.from(String(name == null ? '' : name).replace(/^\s+|\s+$/g, '')).slice(0, 2).join('');
    return (cp || '?').toUpperCase();
  }
  function myUserName() {
    try {
      if (root.AUTH && root.AUTH.user && root.AUTH.user.username) return root.AUTH.user.username;
      if (root.ST && root.ST.user && root.ST.user.username) return root.ST.user.username;
    } catch (e) {}
    return null;
  }

  const App = {
    /* ═══════════ الحالة ═══════════ */
    /* [AI-MAX] الافتراضي خبير (المستوى 2) — طلب المالك: أعلى مستوى في جميع الألعاب */
    config: { mode: 'ai', level: 2, target: 100, timer: 0, drawUntilPlayable: true, bet: 25, playersCount: 2 },
    game: null,
    ai: null,
    room: null,               /* [DO-Room] سياق الغرفة (DOMINO_ROOM) — null = محلي */
    betPlaced: 0,
    localWallet: 500,          /* محفظة الوضع المستقل */
    selTile: null,             /* القطعة المختارة (بطرفين) */
    _revealedSeat: 0,          /* مقعد اللاعب المنكشف (للوضع المحلي) */
    _awaitReveal: -1,          /* المقعد المنتظر كشفه (حاجب التمرير) */
    selOwner: 0,
    busy: false,
    finished: false,
    _attached: false,
    _timers: [],
    _turnTimerId: null,
    _turnTimerLeft: 0,
    _lastTurnId: -1,
    _handlers: [],

    /* ═══════════ أدوات منصة اختيارية ═══════════
       المنصة تُصدّر takeBet(amount)→boolean و giveWin(amount) و ST.gold و
       ST.mute — لا يوجد window.take/window.give (تلك لألعاب engines.js). */
    _platform() {
      return {
        lang: typeof root.langIndex === 'function',
        wallet: typeof root.ST === 'object' && root.ST && typeof root.ST.gold === 'number',
        take: typeof root.takeBet === 'function',
        give: typeof root.giveWin === 'function',
        toast: typeof root.toast === 'function',
        winFX: typeof root.winFX === 'function'
      };
    },

    walletBalance() {
      const p = this._platform();
      return p.wallet ? root.ST.gold : this.localWallet;
    },

    _toast(msg, kind) {
      /* [v2.28] توست محلي داخل المسرح دائماً — توست المنصة كان يتكدس فوق الطاولة */
      const t = document.getElementById('dmToast');
      if (t) {
        t.textContent = msg;
        t.className = 'dm-toast show' + (kind === 'err' ? ' err' : '');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(function () { t.className = 'dm-toast'; }, 2000);
      }
    },

    /* ═══════════ دورة الحياة ═══════════ */
    attach: function () {
      if (this._attached) return;
      this._attached = true;
      this.loadPrefs();
      this.renderRulesDoc();
      this.bindMenu();
      this.bindPlay();
      this.showScreen('menu');
      try { root.DMNTranslateStatic(document.getElementById('dmStage') || document); } catch (e) {}
      /* الصوت يتبع كتم المنصة (ST.mute) عند الربط — وأيضًا داخل كل refresh أدناه
         لأن اللاعب قد يبدّل الكتم أثناء اللعب من هيدر المنصة */
      try { if (root.ST && typeof root.ST.mute !== 'undefined') SFX.setMuted(!!root.ST.mute); } catch (e) {}
      this.refreshResumeBtn();
      this.updateBetUI();
      this.on(window, 'resize', () => {
        if (this.game && this.game.state && this.game.state.phase === 'play') {
          const me = this.mySeatNum();
          const myHand = (this.game.state.hands && this.game.state.hands[me]) || [];
          this._updateHandTileScale(myHand.length);
        }
      });
      /* [DO-Room] تسجيل معالجات الغرفة عند فتح اللعبة (نمط damaInit→damaRegisterRooms) */
      if (root.DOMINO_ROOM && typeof root.DOMINO_ROOM.register === 'function') {
        try { root.DOMINO_ROOM.register(); } catch (e) { console.error('ضومنة rooms init error:', e); }
      }
    },

    detach: function () {
      if (!this._attached) return;
      this._attached = false;
      this.clearTimers();
      const h = this._handlers;
      for (let i = 0; i < h.length; i++) {
        try { h[i].el.removeEventListener(h[i].ev, h[i].fn); } catch (e) {}
      }
      this._handlers = [];
      /* لا نمسح حفظ المباراة هنا — «استئناف المباراة» يجب أن يصمد بين الجلسات
         (نفس سلوك الطاولة bg-app)؛ الحفظ يُمسح عند انتهاء/انسحاب المباراة فقط */
      this.game = null; this.ai = null; this.busy = false; this.selTile = null;
      this.room = null;   /* [DO-Room] مغادرة وضع الغرفة — معالجات Rooms تبقى مسجلة */
      this._revealedSeat = 0;
      this._awaitReveal = -1;
    },

    clearTimers: function () {
      for (let i = 0; i < this._timers.length; i++) clearTimeout(this._timers[i]);
      this._timers = [];
      this.stopTurnTimer();
    },
    stopTurnTimer: function () {
      if (this._turnTimerId) { clearInterval(this._turnTimerId); this._turnTimerId = null; }
      this._turnTimerLeft = 0;
      for (let i = 0; i < 4; i++) {
        let el = document.getElementById('dmTimer' + i);
        if (el) el.style.display = 'none';
      }
    },
    startTurnTimer: function () {
      this.stopTurnTimer();
      const s = this.game ? this.game.view() : null;
      if (!s || s.phase !== 'play' || s.turn === undefined) return;
      const tLimit = (this.room && this.room.on) ? ((this.room.settings && this.room.settings.timer) ? parseInt(this.room.settings.timer, 10) : 60) : this.config.timer;
      if (!tLimit) return;
      
      this._turnTimerLeft = tLimit;
      const self = this;
      this._turnTimerId = setInterval(function () {
        const sv = self.game ? self.game.view() : null;
        if (!sv || sv.phase !== 'play') { self.stopTurnTimer(); return; }
        self._turnTimerLeft--;
        self.renderTurnTimer();
        if (self._turnTimerLeft <= 0) {
          self.stopTurnTimer();
          const turn = sv.turn;
          const meSeat = self.mySeatNum();
          if (self.room && self.room.on && !self.room.spec && turn === meSeat) {
            self._autoPlayLocal();
          } else if (!self.room || !self.room.on) {
            if (turn === meSeat) {
              self._autoPlayLocal();
            }
          }
        }
      }, 1000);
      this.renderTurnTimer();
    },
    _autoPlayLocal: function() {
      if (!this.game || !this.game.state || this.game.state.phase !== 'play') return;
      const turn = this.game.state.turn;
      const acts = this.game.legalMoves(turn);
      if (acts && acts.length > 0) {
        const act = acts[Math.floor(Math.random() * acts.length)];
        if (act.type === 'draw') this.tryDraw();
        else if (act.type === 'pass') this.tryPass();
        else this.playerPlay(act.tile, act.end, turn);
      } else {
        this.tryPass();
      }
    },
    renderTurnTimer: function () {
      const s = this.game ? this.game.view() : null;
      if (!s || s.phase !== 'play') return;
      const left = this._turnTimerLeft;
      const meSeat = this.mySeatNum();
      const numPlayers = s.scores ? s.scores.length : 2;
      for (let i = 0; i < 4; i++) {
        let uiIdx = 0;
        if (i === meSeat) {
           uiIdx = 0;
        } else {
           let rel = (i - meSeat + numPlayers) % numPlayers;
           if (numPlayers === 2 && rel === 1) uiIdx = 1;
           else uiIdx = rel;
        }
        const el = document.getElementById('dmTimer' + uiIdx);
        if (el) {
          if (i === s.turn) {
            el.style.display = 'inline-block';
            el.textContent = '⏱ ' + Math.max(0, left);
            el.className = 'dm-ptimer' + (left <= 10 ? ' dm-time-low' : '');
          } else {
            el.style.display = 'none';
          }
        }
      }
    },
    later: function (fn, ms) {
      const t = setTimeout(fn, ms);
      this._timers.push(t);
      return t;
    },
    on: function (el, ev, fn) {
      if (!el) return;
      el.addEventListener(ev, fn);
      this._handlers.push({ el: el, ev: ev, fn: fn });
    },
    $(id) { return document.getElementById(id); },

    /* ═══════════ التفضيلات ═══════════ */
    loadPrefs: function () {
      try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (p.mode) this.config.mode = p.mode;
        /* [AI-MAX] هجرة تفضيل المستوى: الإصدار القديم كان متوسطاً (1) افتراضياً —
           المالك طلب خبيراً افتراضياً في كل الألعاب؛ نرقّي التفضيل القديم مرة واحدة */
        if (typeof p.level === 'number') this.config.level = (p._v === 2) ? p.level : 2;
        if (p.target) this.config.target = p.target;
        if (typeof p.drawUntilPlayable === 'boolean') this.config.drawUntilPlayable = p.drawUntilPlayable;
        if (p.playersCount) this.config.playersCount = parseInt(p.playersCount, 10) || 2;
        if (p.bet) this.config.bet = p.bet;
      } catch (e) {}
      this.applyConfigToMenu();
    },
    savePrefs: function () {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(Object.assign({}, this.config, { _v: 2 }))); } catch (e) {}
    },
    applyConfigToMenu: function () {
      const mark = (segId, attr, val) => {
        const seg = this.$(segId);
        if (!seg) return;
        const btns = seg.querySelectorAll('.dm-segbtn');
        for (let i = 0; i < btns.length; i++) {
          btns[i].classList.toggle('selected', btns[i].getAttribute(attr) === String(val));
        }
      };
      mark('dmModeSeg', 'data-mode', this.config.mode);
      mark('dmPlayersSeg', 'data-players', this.config.playersCount || 2);
      mark('dmLevelSeg', 'data-level', this.config.level);
      mark('dmTargetSeg', 'data-target', this.config.target);
      mark('dmTimerSeg', 'data-timer', this.config.timer);
      mark('dmDrawSeg', 'data-draw', this.config.drawUntilPlayable ? 1 : 0);
    },

    /* ═══════════ القائمة ═══════════ */
    bindMenu: function () {
      const seg = (segId, fn) => {
        const el = this.$(segId);
        if (!el) return;
        this.on(el, 'click', (e) => {
          const btn = e.target.closest('.dm-segbtn');
          if (!btn) return;
          const btns = segId ? this.$(segId).querySelectorAll('.dm-segbtn') : [];
          for (let i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
          btn.classList.add('selected');
          SFX.click();
          fn(btn);
          this.savePrefs();
          this.updateBetUI();
        });
      };
      seg('dmModeSeg', (b) => { this.config.mode = b.getAttribute('data-mode'); });
      seg('dmPlayersSeg', (b) => { this.config.playersCount = parseInt(b.getAttribute('data-players'), 10) || 2; });
      seg('dmLevelSeg', (b) => { this.config.level = parseInt(b.getAttribute('data-level'), 10) || 0; });
      seg('dmTargetSeg', (b) => { this.config.target = parseInt(b.getAttribute('data-target'), 10) || 100; });
      seg('dmTimerSeg', (b) => { this.config.timer = parseInt(b.getAttribute('data-timer'), 10) || 0; });
      seg('dmDrawSeg', (b) => { this.config.drawUntilPlayable = b.getAttribute('data-draw') === '1'; });

      /* الرهان */
      const betInput = this.$('dmBetInput');
      if (betInput) {
        this.on(betInput, 'focus', function () { this.select(); });
        this.on(betInput, 'change', () => {
          const v = parseInt(betInput.value, 10);
          this.config.bet = Math.max(10, Math.min(this.walletBalance(), isNaN(v) ? 10 : v));
          betInput.value = this.config.bet;
          this.savePrefs();
        });
      }
      const betBtns = document.querySelectorAll('#dmBetField [data-betstep]');
      for (let i = 0; i < betBtns.length; i++) {
        this.on(betBtns[i], 'click', () => {
          const step = parseInt(document.activeElement && document.activeElement.getAttribute ? (document.activeElement.getAttribute('data-betstep') || '0') : '0', 10);
          SFX.click();
          this.config.bet = Math.max(10, Math.min(this.walletBalance(), this.config.bet + step));
          const inp = this.$('dmBetInput'); if (inp) inp.value = this.config.bet;
          this.savePrefs();
        });
      }

      this.on(this.$('dmStartBtn'), 'click', () => { SFX.click(); this.startMatch(); });
      this.on(this.$('dmResumeBtn'), 'click', () => { SFX.click(); this.resume(); });
      this.on(this.$('dmRulesBtn'), 'click', () => { SFX.click(); this.showLayer('dmRulesLayer', true); });
      this.on(this.$('dmRulesClose'), 'click', () => { SFX.click(); this.showLayer('dmRulesLayer', false); });
    },

    updateBetUI: function () {
      /* [Training 2026-09-16] التدريب ضد الآلي مجاني — خانة الرهان تظهر للغرف فقط */
      const f = this.$('dmBetField');
      if (f) f.style.display = 'none';
      const inp = this.$('dmBetInput');
      if (inp) inp.value = this.config.bet;
      const hint = this.$('dmBetHint');
      if (hint) hint.textContent = (this.config.mode === 'room')
        ? FMT('dm.bet.hint')
        : ('🎓 ' + (FMT('ui.trainingFree') || 'تدريب مجاني بدون رهان — الرهان متاح في الغرف أونلاين فقط'));
    },

    renderRulesDoc: function () {
      const box = this.$('dmRulesDoc');
      if (!box) return;
      const doc = root.DMN_RULES_DOC;
      let html = '';
      for (let i = 0; i < doc.length; i++) {
        html += '<div class="dm-rule"><b>' + doc[i][0] + ':</b> ' + doc[i][1] + '</div>';
      }
      box.innerHTML = html;
    },

    /* ═══════════ شاشات وطبقات ═══════════ */
    showScreen: function (which) {
      const menu = this.$('dmMenu'), play = this.$('dmPlay');
      if (!menu || !play) return;
      menu.classList.toggle('dm-screen-active', which === 'menu');
      play.classList.toggle('dm-screen-active', which === 'play');
    },
    showLayer: function (id, show) {
      const el = this.$(id);
      if (el) el.hidden = !show;
    },

    /* ═══════════ حفظ / استئناف ═══════════ */
    saveMatch: function () {
      if (!this.game || this.finished) return;
      /* [DO-Room] لا حفظ محلي في وضع الغرفة — الجولة تُستعاد من سجل الخادم */
      if (this.room && this.room.on) return;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          v: 1, cfg: this.game.cfg, s: this.game.state,
          mode: this.config.mode, level: this.config.level, bet: this.betPlaced,
          betLocked: this.config.mode === 'ai' ? 1 : 0   /* الرهان خُصم مرة عند البدء */
        }));
      } catch (e) {}
    },
    loadSave: function () {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || d.v !== 1 || !d.s || d.s.phase === 'matchEnd') return null;
        return d;
      } catch (e) { return null; }
    },
    /* حذف الحفظ عند مغادرة المنصة نهائيًا (cleanupDominoes) — لا داخل detach()
       كي يصمد «استئناف المباراة» بين الجلسات */
    purgeSave: function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },
    clearSave: function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },
    myInitials: function () {
      let uname = '';
      try {
        if (typeof root !== 'undefined' && root.AUTH && root.AUTH.user && root.AUTH.user.username) {
          uname = root.AUTH.user.username;
        } else if (typeof root !== 'undefined' && root.ST && root.ST.user && root.ST.user.username) {
          uname = root.ST.user.username;
        }
      } catch (e) {}
      if (!uname) {
        const nm = R.names(null, this.config.mode === 'ai' ? 'ai' : 'local');
        uname = (nm && nm.me) || 'PL';
      }
      const trimmed = String(uname).trim();
      const cp = Array.from(trimmed).slice(0, 2).join('');
      return (cp || 'PL').toUpperCase();
    },
    refreshResumeBtn: function () {
      const b = this.$('dmResumeBtn');
      if (b) b.hidden = !this.loadSave();
    },
    resume: function () {
      const d = this.loadSave();
      if (!d) return;
      if (this.room && this.room.on) return;   /* [DO-Room] لا استئناف محلي في الغرفة */
      /* استئناف مبرمج: رهان الجولة الموقوفة لا يُعاد خصمه — قد خُصم مرة عند البدء */
      this.config.mode = d.mode; this.config.level = d.level;
      this.makeGame(d.cfg);
      this.game.state = d.s;
      this.betPlaced = (d.betLocked && this.config.mode === 'ai') ? (d.bet || 0) : 0;
      this.finished = false;
      this.enterPlay(false);
      this.refresh();
      this.kickAI();
    },

    /* ═══════════ بدء المباراة ═══════════ */
    makeGame: function (cfgOverride) {
      const self = this;
      const cfg = Core.normalizeConfig(Object.assign({
        target: this.config.target,
        drawUntilPlayable: this.config.drawUntilPlayable,
        playersCount: this.config.playersCount || 2
      }, cfgOverride || {}));
      this.game = new NS.DominoGame({
        config: cfg,
        onEvent: function (ev) { self.onGameEvent(ev); }
      });
      this.ai = this.config.mode === 'ai' ? new NS.DominoAI(this.game, this.config.level) : null;
    },

    startMatch: function () {
      /* [DO-Room] جولة غرفة جارية: زر القائمة محجوب في وضع الغرفة أصلاً — سلامة */
      if (this.room && this.room.on) return;
      /* [Training 2026-09-16] الآلي/المحلي تدريب مجاني بلا رهان ولا تسجيل —
         الرهان حصري للغرف بين البشر */
      window.TRAINING = window.TRAINING || { on: false };
      window.TRAINING.on = (this.config.mode !== 'room');
      this.betPlaced = 0;
      if (this.config.mode === 'ai' && !window.TRAINING.on) {
        const bal = this.walletBalance();
        const bet = Math.max(10, this.config.bet);
        if (bal < 10 || bet > bal) { this._toast(T('dm.bet'), 'err'); SFX.error(); return; }
        const p = this._platform();
        if (p.take && p.wallet) {
          try { if (!root.takeBet(bet)) return; } catch (e) { return; }
        } else {
          this.localWallet -= bet;
        }
        this.betPlaced = bet;
        /* في وضع المحفظة: حجز الجلسة «قيد التقدم» يُدار من recordRound عند التسوية */
      }
      this.finished = false;
      this.makeGame();
      this.game.newMatch();
      SFX.shuffle();
      this.enterPlay(true);
      this.refresh();
      this.saveMatch();
      this.kickAI();
    },

    enterPlay: function (fresh) {
      this.showScreen('play');
      this.busy = false; this.selTile = null; this.selOwner = 0;
      if (fresh) this.clearTimers();
      const isAI = this.config.mode === 'ai';
      const numPlayers = (this.game && this.game.state && this.game.state.hands.length) || (this.config.playersCount || 2);
      const nm = R.names(null, isAI ? 'ai' : 'local');

      this.$('dmOppName').textContent = isAI ? (nm.opp + (numPlayers > 2 ? ' 1' : '') + ' · ' + T('dm.level.' + this.config.level)) : nm.opp;
      this.$('dmMyName').textContent = nm.me;

      const avO = this.$('dmOppAvatar');
      if (avO) avO.innerHTML = '<i class="fa-solid ' + (isAI ? 'fa-robot' : 'fa-user-tie') + '"></i>';
      const avM = this.$('dmMyAvatar');
      if (avM) avM.textContent = this.myInitials();

      const sOpp = this.$('dmSeatOpp');
      if (sOpp) {
        if (numPlayers === 2) {
          sOpp.classList.add('seat-2p-top');
          sOpp.classList.remove('seat-left');
        } else {
          sOpp.classList.remove('seat-2p-top');
          sOpp.classList.add('seat-left');
        }
      }

      const s2 = this.$('dmSeat2');
      if (s2) {
        s2.hidden = (numPlayers < 3);
        const av2 = this.$('dmAvatar2');
        if (av2) av2.innerHTML = '<i class="fa-solid ' + (isAI ? 'fa-robot' : 'fa-user-group') + '"></i>';
        const nm2 = this.$('dmName2');
        if (nm2) nm2.textContent = isAI ? ((T('dm.opp') || 'الخصم') + ' 2') : (T('dm.p3') || 'اللاعب 3');
      }

      const s3 = this.$('dmSeat3');
      if (s3) {
        s3.hidden = (numPlayers < 4);
        const av3 = this.$('dmAvatar3');
        if (av3) av3.innerHTML = '<i class="fa-solid ' + (isAI ? 'fa-robot' : 'fa-user-gear') + '"></i>';
        const nm3 = this.$('dmName3');
        if (nm3) nm3.textContent = isAI ? ((T('dm.opp') || 'الخصم') + ' 3') : (T('dm.p4') || 'اللاعب 4');
      }

      this.showLayer('dmRoundLayer', false);
      this.showLayer('dmMatchLayer', false);
      this.showLayer('dmResignLayer', false);
      this._updateHandTileScale(7);
    },

    /* ═══════════ أحداث المحرك ═══════════ */
    onGameEvent: function (ev) {
      switch (ev.type) {
        case 'played': SFX.place(); break;
        case 'drew': SFX.draw(); if (ev.data.player !== 0) this._toast(T('dm.drew')); break;
        case 'passed': SFX.pass(); if (ev.data.player !== 0) this._toast(T('dm.passed')); break;
        case 'illegal': SFX.error(); break;
        default: break;
      }
    },

    /* ═══════════ الرسم ═══════════ */
    refresh: function () {
      if (!this.game || !this.game.state) return;
      /* الصوت يتبع كتم المنصة لحظيًا (زر السماعة في هيدر المنصة) */
      try { if (root.ST && typeof root.ST.mute !== 'undefined' && SFX.setMuted && SFX.isMuted() !== !!root.ST.mute) SFX.setMuted(!!root.ST.mute); } catch (e) {}
      const view = this.game.view();
      const isAI = this.config.mode === 'ai';
      /* [DO-Room] الغرفة: الحالة مطلقة (0 أسفل/1 أعلى) — أسفل شاشتي يعرض مقعدي */
      const inRoom = !!(this.room && this.room.on);
      const me = this.mySeatNum();
      const opp = this.oppSeatNum();
      const numPlayers = view.scores.length;

      /* النقاط */
      this.$('dmOppScore').textContent = String(view.scores[opp]);
      this.$('dmMyScore').textContent = String(view.scores[me]);
      if (this.$('dmScore2') && view.scores[2] !== undefined) this.$('dmScore2').textContent = String(view.scores[2]);
      if (this.$('dmScore3') && view.scores[3] !== undefined) this.$('dmScore3').textContent = String(view.scores[3]);

      this.$('dmRoundLbl').textContent = R.roundLabel(view);

      /* توهج الدور على الشارات */
      const spec = inRoom && this.room.spec;
      const turnNow = view.phase === 'play' ? view.turn : -1;
      const sOpp = this.$('dmSeatOpp'), sMe = this.$('dmSeatMe'), s2 = this.$('dmSeat2'), s3 = this.$('dmSeat3');
      if (sOpp) sOpp.classList.toggle('myturn', !spec && turnNow === opp);
      if (sMe) sMe.classList.toggle('myturn', !spec && turnNow === me);
      if (s2) s2.classList.toggle('myturn', !spec && turnNow === 2);
      if (s3) s3.classList.toggle('myturn', !spec && turnNow === 3);

      if (view.phase === 'play') {
        if (view.turn !== this._lastTurnId) {
          this._lastTurnId = view.turn;
          this.startTurnTimer();
        }
      } else {
        this.stopTurnTimer();
        this._lastTurnId = -1;
      }

      /* شارات عدد القطع المتبقية للخصوم */
      if (this.$('dmTileBadge1') && view.handsCount[opp] !== undefined) {
        this.$('dmTileBadge1').textContent = String(view.handsCount[opp]);
        this.$('dmTileBadge1').hidden = (numPlayers === 2);
      }
      if (this.$('dmTileBadge2') && view.handsCount[2] !== undefined) {
        this.$('dmTileBadge2').textContent = String(view.handsCount[2]);
        this.$('dmTileBadge2').hidden = (numPlayers < 3);
      }
      if (this.$('dmTileBadge3') && view.handsCount[3] !== undefined) {
        this.$('dmTileBadge3').textContent = String(view.handsCount[3]);
        this.$('dmTileBadge3').hidden = (numPlayers < 4);
      }

      /* مقاعد الخصوم: ظهور القطع المقلوبة لكل خصم في مكانه */
      const oppRow = this.$('dmOppRow');
      const oppTiles1 = this.$('dmOppTiles1');
      const oppTiles3 = this.$('dmOppTiles3');

      if (numPlayers === 2) {
        const html2p = (isAI || (inRoom && me === 0))
          ? R.backsHTML(view.handsCount[opp] || 0)
          : (() => {
              const legalOpp = {};
              const oppLegalList = view['legal' + opp] || [];
              for (let i = 0; i < oppLegalList.length; i++) legalOpp[oppLegalList[i].tile.id] = 1;
              return R.handTilesHTML(view['hand' + opp] || [], legalOpp, view.forcedTile && view.forcedTile.id, 'dmPickP2');
            })();
        if (oppTiles1) oppTiles1.innerHTML = html2p;
        if (oppRow) oppRow.innerHTML = '';
        if (oppTiles3) oppTiles3.innerHTML = '';
      } else {
        /* الخصم 1 (اليسار) */
        if (oppTiles1) oppTiles1.innerHTML = R.backsHTML(view.handsCount[1] || 0);
        /* الخصم 2 (الأعلى) */
        if (oppRow) oppRow.innerHTML = R.backsHTML(view.handsCount[2] || 0);
        /* الخصم 3 (اليمين) */
        if (oppTiles3) {
          if (numPlayers >= 4) oppTiles3.innerHTML = R.backsHTML(view.handsCount[3] || 0);
          else oppTiles3.innerHTML = '';
        }
      }

      /* السلسلة + التلميحات */
      const pos = R.renderChain(this.$('dmChain'), view);
      const sel = this.selTile;
      R.renderEndHints(this.$('dmHintL'), this.$('dmHintR'), view, pos, sel);

      /* اليد — أسفل الشاشة = مقعدي دائماً */
      const hand = this.$('dmHand');
      if (hand) {
        if (this.config.mode === 'local' && !this.room && this._awaitReveal >= 0) {
          hand.innerHTML = '';
        } else {
          const myHand = view['hand' + me] || [];
          const myLegalList = view['legal' + me] || [];
          const myTurn = view.phase === 'play' && !this.busy && (!inRoom || view.turn === me);
          const legalMe = {};
          for (let i = 0; i < myLegalList.length; i++) legalMe[myLegalList[i].tile.id] = 1;
          hand.innerHTML = R.handTilesHTML(myHand, legalMe, view.forcedTile && view.forcedTile.id, 'dmPickHand');
          hand.classList.toggle('myturn', myTurn);
          this._updateHandTileScale(myHand.length);
        }
      }

      /* البنك */
      const by = this.$('dmBoneyard');
      if (by) {
        this.$('dmByCount').textContent = String(view.boneyardCount);
        const iPlay = view.phase === 'play' && !this.busy && (!inRoom || view.turn === me);
        const mustDraw = iPlay && !this.game.hasAnyMove(view.turn) && view.boneyardCount > 0 && view.cfg.drawUntilPlayable;
        by.classList.toggle('pulse', mustDraw);
        by.classList.toggle('dim', !mustDraw);
      }

      /* الحالة + زر التمرير */
      const st = this.$('dmStatus');
      const passBtn = this.$('dmPassBtn');
      if (st) {
        let s = '';
        if (view.phase === 'play') {
          if (inRoom) {
            /* الغرفة: الحالة حسب مقعدي — 0 أسفل · 1 أعلى (ترقيم مطلق) */
            if (this.room.spec) s = T('dm.room.watch') || 'وضع المتفرج — تشاهد المباراة';
            else if (view.turn === me) {
              if (view.forcedTile) s = T('dm.mustPlayDrawn');
              else if (!this.game.hasAnyMove(me) && view.boneyardCount > 0 && view.cfg.drawUntilPlayable) s = T('dm.mustDraw');
              else if (!this.game.hasAnyMove(me)) s = T('dm.mustPass');
              else s = T(me === 0 ? 'dm.turn.p1' : 'dm.turn.p2');
            } else {
              s = T(me === 0 ? 'dm.turn.opp' : 'dm.turn.opp');
            }
          } else {
            const myTurn = view.turn === me && !this.busy;
            if (myTurn) {
              if (view.forcedTile) s = T('dm.mustPlayDrawn');
              else if (!this.game.hasAnyMove(me) && view.boneyardCount > 0 && view.cfg.drawUntilPlayable) s = T('dm.mustDraw');
              else if (!this.game.hasAnyMove(me)) s = T('dm.mustPass');
              else s = T(isAI ? 'dm.turn.you' : (me === 0 ? 'dm.turn.p1' : 'dm.turn.p2'));
            } else {
              s = T(isAI ? 'dm.turn.opp' : 'dm.turn.p2');
            }
          }
        }
        st.textContent = s;
      }
      if (passBtn) {
        const humanTurn = view.phase === 'play' && !this.busy &&
          (inRoom ? (!this.room.spec && view.turn === me)
                  : (view.turn === me));
        passBtn.hidden = !(humanTurn && !this.game.hasAnyMove(view.turn) &&
          (view.boneyardCount === 0 || !view.cfg.drawUntilPlayable));
      }

      /* [v2.28 Self-Heal] شبكة أمان ضد التجمد:
         1) busy علقت أكثر من 4ث (استثناء/سباق غير متوقع) → تُفك.
         2) الدور للبوت ولم يُجدول (فات نداء kickAI/flow في مسار ما) → يُجدول مرة. */
      const shState = this.game && this.game.state;
      if (shState && shState.phase === 'play') {
        if (this.busy) {
          if (!this._busyAt) this._busyAt = Date.now();
          else if (Date.now() - this._busyAt > 4000) { this.busy = false; this._busyAt = 0; }
        } else this._busyAt = 0;

        if (this.config.mode === 'local' && !this.room) {
          if (this._awaitReveal === -1 && this._revealedSeat !== shState.turn && !this.busy) {
            this._awaitReveal = shState.turn;
            this._showHandover(shState.turn);
            return;
          }
          if (this._awaitReveal >= 0) return;
        }

        const botDrive = (!this.room && this.config.mode === 'ai') || (this.room && this.room.on && this.room.oppBot);
        if (botDrive && shState.turn !== me && !this.busy && !this._kickPend) {
          this._kickPend = true;
          this.later(() => {
            this._kickPend = false;
            if (!this.game || !this.game.state || this.game.state.phase !== 'play' || this.game.state.turn === me) return;
            if (this.room && this.room.on && root.DOMINO_ROOM) root.DOMINO_ROOM.flow();
            else this.kickAI();
          }, 900);
        }
      }
    },

    _showHandover: function (seat) {
      let overlay = this.$('dmHandoverOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dmHandoverOverlay';
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.zIndex = '9999';
        overlay.style.background = 'rgba(9, 17, 31, 0.9)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        this.$('dmStage').appendChild(overlay);
      }
      overlay.style.display = 'flex';
      overlay.innerHTML =
        '<div style="text-align:center;">' +
          '<p style="color:var(--dm-gold2);font-size:1.4rem;font-weight:900;margin-bottom:20px;">' + 
            (T('dm.p' + (seat + 1)) || ('اللاعب ' + (seat + 1))) + 
          '</p>' +
          '<button id="dmRevealBtn" style="background:var(--dm-gold);color:#111;border:none;padding:12px 24px;border-radius:12px;font-size:1.1rem;font-weight:bold;cursor:pointer;">' + 
            (T('dm.handoverTap') || 'استلم الهاتف واضغط هنا') + 
          '</button>' +
        '</div>';
        
      const hand = this.$('dmHand');
      if (hand) hand.style.opacity = '0';

      const btn = this.$('dmRevealBtn');
      if (btn) this.on(btn, 'click', () => {
        if (typeof SFX !== 'undefined' && SFX.click) SFX.click();
        this._awaitReveal = -1;
        this._revealedSeat = seat;
        overlay.style.display = 'none';
        if (hand) hand.style.opacity = '1';
        this._renderState(true);
      });
    },

    /* ═══════════ تفاعل اللاعب 1 (أسفل) ═══════════ */
    bindPlay: function () {
      const hand = this.$('dmHand');
      this.on(hand, 'click', (e) => {
        const btn = e.target.closest('[data-act="dmPickHand"]');
        if (btn) this.pickHand(btn.getAttribute('data-tile'));
      });
      const oppRow = this.$('dmOppRow');
      this.on(oppRow, 'click', (e) => {
        const btn = e.target.closest('[data-act="dmPickP2"]');
        if (btn) this.pickP2(btn.getAttribute('data-tile'));
      });
      this.on(this.$('dmBoneyard'), 'click', () => this.tryDraw());
      this.on(this.$('dmHintL'), 'click', () => this.pickEnd('L'));
      this.on(this.$('dmHintR'), 'click', () => this.pickEnd('R'));
      this.on(this.$('dmPassBtn'), 'click', () => this.tryPass());
      this.on(this.$('dmResignBtn'), 'click', () => {
        SFX.click();
        /* [DO-Room] الغرفة: الانسحاب عبر DOMINO_ROOM (بثّ + تسوية خادمية) */
        if (this.room && this.room.on) {
          if (!this.room.spec && this.game && this.game.state) {
            this.$('dmResignText').textContent = T('dm.resignAsk');
            this.showLayer('dmResignLayer', true);
          }
          return;
        }
        if (this.config.mode !== 'ai') { this.toMenu(); return; }
        this.$('dmResignText').textContent = T('dm.resignAsk');
        this.showLayer('dmResignLayer', true);
      });
      this.on(this.$('dmResignYes'), 'click', () => {
        this.showLayer('dmResignLayer', false);
        /* [DO-Room] الغرفة: الانسحاب بثّ + خسارة عند الجميع */
        if (this.room && this.room.on && root.DOMINO_ROOM) { root.DOMINO_ROOM.resign(); return; }
        this.finished = true; this.clearSave();
        if (this.config.mode === 'ai' && this.game && this.game.state) {
          /* خسارة بالانسحاب: الخصم يبلغ الهدف — التذكرة تسجّلها showMatchEnd */
          this.game.state.scores[1] = this.game.cfg.target;
          this.game.state.matchWinner = 1;
          this.game.state.phase = 'matchEnd';
          this.showMatchEnd(true);
        } else this.toMenu();
      });
      this.on(this.$('dmResignNo'), 'click', () => { SFX.click(); this.showLayer('dmResignLayer', false); });
      this.on(this.$('dmNextRoundBtn'), 'click', () => {
        SFX.click();
        /* [DO-Room] الغرفة: الجولة التالية عبر DOMINO_ROOM (بثّ nextround) */
        if (this.room && this.room.on && root.DOMINO_ROOM) { root.DOMINO_ROOM.nextRoundBtn(); return; }
        this.showLayer('dmRoundLayer', false);
        this.game.nextRound();
        this.busy = false; this.selTile = null;
        this.refresh(); this.saveMatch(); this.kickAI();
      });
      this.on(this.$('dmNewMatchBtn'), 'click', () => {
        SFX.click();
        /* [DO-Room] الغرفة: مباراة جديدة = مودال الغرفة (تصويت/خروج هناك) */
        if (this.room && this.room.on && root.DOMINO_ROOM) { root.DOMINO_ROOM.newMatchBtn(); return; }
        this.toMenu();
      });
    },

    /* [DO-Room] مقعد المحرك الذي أديره (الغرفة: مقعدي الغرفي · المحلي: 0)
       الحالة المشتركة مطلقة — هذا ترقيم عرض/تفاعل فقط (نمط flipped في ضاما) */
    _updateHandTileScale: function (count) {
      const stage = this.$('dmStage');
      const hand = this.$('dmHand');
      const n = Math.max(7, Number(count) || 7);
      if (stage) stage.style.setProperty('--dm-hand-count', String(n));
      if (hand) {
        hand.style.setProperty('--dm-hand-count', String(n));
        const gap = (n > 10) ? '2.5px' : ((n > 7) ? '4px' : '5px');
        const padX = (n > 10) ? '2px' : ((n > 7) ? '4px' : '5px');
        hand.style.setProperty('--dm-hand-gap', gap);
        hand.style.setProperty('--dm-hand-pad-x', padX);
      }
    },

    mySeatNum: function () {
      if (this.config.mode === 'local' && !this.room) return this._revealedSeat || 0;
      return (this.room && this.room.on) ? this.room.mySeat : 0;
    },
    oppSeatNum: function () { return 1 - this.mySeatNum(); },

    pickHand: function (tileId) {
      if (this.busy || !this.game) return;
      const s = this.game.state;
      const me = this.mySeatNum();
      if (s.phase !== 'play' || s.turn !== me) return;
      /* [DO-Room] المتفرج لا يلعب */
      if (this.room && this.room.on && this.room.spec) return;
      let tile = null;
      for (let i = 0; i < s.hands[me].length; i++) if (s.hands[me][i].id === tileId) { tile = s.hands[me][i]; break; }
      if (!tile) return;
      const ends = Core.legalEnds(s, tile);
      if (!ends.length) { SFX.error(); return; }
      if (s.chain.length && ends.length === 2) {
        this.selTile = (this.selTile && this.selTile.id === tileId) ? null : tile;
        this.selOwner = me;
        SFX.click();
        this.refresh();
      } else {
        this.playerPlay(tile, ends[0], me);
      }
    },

    pickEnd: function (end) {
      if (!this.selTile || this.busy) return;
      const s = this.game.state;
      const ends = Core.legalEnds(s, this.selTile);
      if (ends.indexOf(end) < 0) return;
      this.playerPlay(this.selTile, end, this.selOwner);
    },

    playerPlay: function (tile, end, owner) {
      /* [DO-Room] الغرفة: وضع القطعة عبر المحرك ثم بثّها (DOMINO_ROOM.emitPlay) */
      const inRoom = !!(this.room && this.room.on && root.DOMINO_ROOM);
      this.busy = true;
      this.selTile = null;
      const r = this.game.play(owner, tile.id, end);
      if (!r.ok) { this.busy = false; this.refresh(); return; }
      if (inRoom) root.DOMINO_ROOM.emitPlay(owner, tile, end);
      this.refresh();
      if (this.game.state.phase !== 'play') {
        /* [DO-Room][fix] نهاية الجولة: تحرير busy هنا — كان يعلق true فتحرس
           نقرات واجهة الجولة التالية (الزر يعمل لكن المسار البرمجي يبقى مقيداً) */
        this.busy = false;
        this.later(() => this.onRoundOver(), 520);
        return;
      }
      this.later(() => {
        this.busy = false;
        this.refresh();
        if (inRoom) root.DOMINO_ROOM.flow();   /* [DO-Room] بوت الخصم/انتظار البثّ */
        else if (owner === 0 || this.game.state.turn !== 0) this.kickAI();
      }, 400);
    },

    pickP2: function (tileId) {
      if (this.busy || !this.game) return;
      const s = this.game.state;
      const opp = this.oppSeatNum();
      if (s.phase !== 'play' || s.turn !== opp) return;
      /* [DO-Room] الغرفة: يد الأعلى ليست يدي أصلاً (كشفتها للعرض فقط إن كانت لي) */
      if (this.room && this.room.on && this.room.mySeat === 0) return;
      let tile = null;
      for (let i = 0; i < s.hands[opp].length; i++) if (s.hands[opp][i].id === tileId) { tile = s.hands[opp][i]; break; }
      if (!tile) return;
      const ends = Core.legalEnds(s, tile);
      if (!ends.length) { SFX.error(); return; }
      if (s.chain.length && ends.length === 2) {
        this.selTile = (this.selTile && this.selTile.id === tileId) ? null : tile;
        this.selOwner = opp;
        SFX.click();
        this.refresh();
      } else {
        this.playerPlay(tile, ends[0], opp);
      }
    },

    tryDraw: function () {
      const s = this.game && this.game.state;
      if (!s || this.busy || s.phase !== 'play') return;
      const t = s.turn;
      const me = this.mySeatNum();
      const opp = this.oppSeatNum();
      if (t !== me && !(this.config.mode === 'local' && !this.room && t !== 0)) return;
      if (this.room && this.room.on && (this.room.spec || t !== me)) return;
      if (this.game.legalMoves(t).length) return;
      if (!s.boneyard.length || !s.cfg.drawUntilPlayable) return;
      const r = this.game.draw(t);
      if (r.ok) {
        this.refresh();
        if (this.room && this.room.on && root.DOMINO_ROOM) root.DOMINO_ROOM.emitDraw();   /* [DO-Room] */
        else this.saveMatch();
        if (s.forcedTile) this._toast(T('dm.mustPlayDrawn'));
      }
    },

    tryPass: function () {
      const s = this.game && this.game.state;
      if (!s || this.busy || s.phase !== 'play') return;
      const t = s.turn;
      const me = this.mySeatNum();
      const opp = this.oppSeatNum();
      if (t !== me && !(this.config.mode === 'local' && !this.room && t !== 0)) return;
      if (this.room && this.room.on) {
        /* [DO-Room] الغرفة: التمرير في دوري فقط ثم بثّه */
        if (this.room.spec || t !== me) return;
        const r = this.game.pass(t);
        if (!r.ok) return;
        this.refresh();
        root.DOMINO_ROOM.emitPass();
        if (s.phase !== 'play') { this.later(() => this.onRoundOver(), 420); return; }
        root.DOMINO_ROOM.flow();
        return;
      }
      const r = this.game.pass(t);
      if (!r.ok) return;
      this.refresh(); this.saveMatch();
      if (s.phase !== 'play') { this.later(() => this.onRoundOver(), 420); return; }
      this.kickAI();
    },

    /* ═══════════ دور الذكاء ═══════════ */
    kickAI: function () {
      if (!this.game || !this.ai || this.finished) return;
      /* [DO-Room] الغرفة: بوت الخصم يُدار من DOMINO_ROOM (بثّ أفعاله) */
      if (this.room && this.room.on && root.DOMINO_ROOM) { root.DOMINO_ROOM.flow(); return; }
      const s = this.game.state;
      if (!s || s.phase !== 'play' || s.turn === 0) return;
      this.busy = true;
      this.refresh();
      this.later(() => this.aiStep(s.turn), 550);
    },

    aiStep: function (p) {
      const s = this.game.state;
      const targetP = (typeof p === 'number') ? p : (s ? s.turn : 1);
      if (!s || s.phase !== 'play' || s.turn !== targetP || targetP === 0) { this.busy = false; return; }
      const mv = this.ai.choose(targetP);
      if (mv) {
        const r = this.game.play(targetP, mv.tile.id, mv.end);
        if (!r.ok) { this.busy = false; this.refresh(); return; }
        this.refresh(); this.saveMatch();
        if (s.phase !== 'play') { this.busy = false; this.later(() => this.onRoundOver(), 520); return; }
        if (s.turn !== 0) {
          this.later(() => this.kickAI(), 420);
        } else {
          this.busy = false;
          this.refresh();
        }
      } else if (s.boneyard.length && s.cfg.drawUntilPlayable) {
        this.game.draw(targetP);
        this.refresh(); this.saveMatch();
        this.later(() => this.aiStep(targetP), 450);
      } else {
        this.game.pass(targetP);
        this.refresh(); this.saveMatch();
        if (s.phase !== 'play') { this.busy = false; this.later(() => this.onRoundOver(), 520); return; }
        if (s.turn !== 0) {
          this.later(() => this.kickAI(), 420);
        } else {
          this.busy = false;
          this.refresh();
        }
      }
    },

    /* ═══════════ نهاية الجولة/المباراة ═══════════ */
    onRoundOver: function () {
      const s = this.game.state;
      if (!s.result) return;
      /* [DO-Room] الغرفة: لوحات النهاية يديرها DOMINO_ROOM (بثّ + تسوية) */
      if (this.room && this.room.on && root.DOMINO_ROOM) { root.DOMINO_ROOM.flow(); return; }
      this.$('dmOppScore').textContent = String(s.scores[1]);
      this.$('dmMyScore').textContent = String(s.scores[0]);
      if (s.phase === 'matchEnd') { this.showMatchEnd(false); return; }
      const r = s.result;
      const nm = R.names(null, this.config.mode === 'ai' ? 'ai' : 'local');
      this.$('dmRoundEm').textContent = r.reason === 'blocked' ? '🚧' : '🁫';
      this.$('dmRoundTitle').textContent = r.tie
        ? T('dm.tie')
        : (r.winner === 0 ? nm.me : nm.opp) + ' — ' + T(r.reason === 'blocked' ? 'dm.end.blocked' : 'dm.end.empty');
      this.$('dmRoundRows').innerHTML = R.scoreRowsHTML(this.game.view(), this.config.mode === 'ai' ? 'ai' : 'local');
      this.showLayer('dmRoundLayer', true);
      if (r.winner === 0) SFX.winRound(); else if (r.winner === 1) SFX.lose(); else SFX.notify();
    },

    showMatchEnd: function (resigned) {
      const s = this.game.state;
      /* [DO-Room] الغرفة: لوحة النهاية والتسوية يديرها DOMINO_ROOM */
      if (this.room && this.room.on && root.DOMINO_ROOM) { root.DOMINO_ROOM.showMatchEnd(); return; }
      this.finished = true;
      this.clearSave();
      const isAI = this.config.mode === 'ai';
      const iWon = s.matchWinner === 0;
      const nm = R.names(null, isAI ? 'ai' : 'local');
      this.$('dmMatchEm').textContent = (iWon || !isAI) ? '🏆' : '💀';
      this.$('dmMatchTitle').textContent = resigned
        ? (isAI ? T('dm.lost') : T('dm.resign'))
        : (isAI ? (iWon ? T('dm.won') : T('dm.lost')) : (s.matchWinner === 0 ? T('dm.p1won') : T('dm.p2won')));
      /* المكافأة — تسوية المحفظة + تذكرة سجل الجولة (win/loss) */
      let payout = 0;
      if (isAI && iWon && this.betPlaced > 0) {
        const mult = [1.5, 2, 3][this.config.level] || 2;
        payout = Math.round(this.betPlaced * mult);
        const p = this._platform();
        if (p.give) { try { root.giveWin(payout); } catch (e) {} }
        else this.localWallet += payout;
        if (p.winFX) { try { root.winFX(payout); } catch (e) {} }
      }
      /* تذكرة السجل: الفوز والخسارة كلاهما (بما فيه الانسحاب) */
      if (isAI && this.betPlaced > 0) {
        try {
          if (typeof root.recordRound === 'function') {
            root.recordRound(!!(iWon && payout > 0), payout, T(iWon ? 'dm.won' : 'dm.lost'), this.betPlaced, 'do');
          }
        } catch (e) {}
        /* [BotsLedger v2.28] مؤشر المنصة: +الرهان عند خسارة بشري، الرهان−المدفوع عند فوزه */
        try { if (root.BotsLedger) root.BotsLedger.record('do', iWon ? this.betPlaced - payout : this.betPlaced); } catch (e) {}
      }
      this.$('dmMatchAmt').innerHTML = '';
      this.$('dmMatchRows').innerHTML =
        '<div class="dm-srow"><span>' + nm.me + '</span><b>' + s.scores[0] + '</b></div>' +
        '<div class="dm-srow"><span>' + nm.opp + '</span><b>' + s.scores[1] + '</b></div>';
      this.showLayer('dmMatchLayer', true);
      if (isAI && iWon) SFX.winMatch(); else SFX.lose();
      this.betPlaced = 0;   /* حُسمت التسوية — مباراة جديدة تحتاج رهانًا جديدًا */
    },

    toMenu: function () {
      this.clearTimers();
      this.finished = true; this.busy = false; this.selTile = null;
      this.showLayer('dmRoundLayer', false);
      this.showLayer('dmMatchLayer', false);
      this.showLayer('dmResignLayer', false);
      /* [DO-Room] الخروج من الغرفة الحية = انسحاب (نمط damaToSetup) */
      if (this.room && this.room.on && root.DOMINO_ROOM) {
        if (this.game && this.game.state && this.game.state.phase === 'play' && !this.room.spec) {
          root.DOMINO_ROOM.resign();
          return;
        }
        this.showScreen('menu');
        this.refreshResumeBtn();
        SFX.click();
        return;
      }
      this.showScreen('menu');
      this.refreshResumeBtn();
      SFX.click();
    }
  };

  root.DominoApp = App;
})(typeof self !== 'undefined' ? self : this);

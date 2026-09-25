/* ════════════════════════════════════════════════════════════════════
   UnoApp — متحكم أونو (نمط BalootApp)
   أوضاع: ai (3 مستويات) · local (4 لاعبين تسليم جهاز) · room (غرف 4 + بطولات)
   عقد المنصة: eUno/initUno/cleanupUno + معالجات الغرف + applyRoomReplay المتسلسل.
   بلا رهان في وضعي البوت/المحلي (تعليمي) — الرهان بين اللاعبين في الغرف فقط.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const NS = root.UNGameNS;
  const Core = root.UNCore;
  const R = root.UNRender;
  const T = root.UN_T;
  const SFX = root.UNAudio;

  const App = {
    _attached: false,
    _timers: [],
    config: { mode: '1v1', level: 1, target: 500, timer: 0 },
    _room: null, roomMode: false,
    _roomSeat: -1, _isDriver: false, _isSpectator: true,
    _roomOrder: null, _roomNames: [], _roundVotes: {},
    _matchSettled: false, _roomTimer: 60,
    _aiNext: 0, _lastActAt: 0, _lastTurnId: -1, _driverT: null, _replayPollT: null,
    _schedKey: null, _overlayKind: null, _awaitReveal: -1, _revealedSeat: -1,
    _colorPick: null,
    _prefsKey: 'uno.prefs',

    /* ═══════════ دورة حياة المنصة ═══════════ */
    attach: function () {
      if (this._attached) return;
      this._attached = true;
      const stage = this.$('unStage');
      if (!stage) { console.error('unStage missing'); return; }
      stage.innerHTML = root.UNHTML.stageHTML();
      const logoImg = stage.querySelector('#unTableLogoImg');
      const ab = root.UNRender && root.UNRender.assetBase ? root.UNRender.assetBase() : null;
      if (logoImg && ab) logoImg.src = ab + '/dtsg/dtsg-logo-main.webp';
      this._bindMenu();
      this._bindGame();
      this.loadPrefs();
      this._syncMute();
      root.UNTranslateStatic(stage);
      this._applyModeUI();
      if (typeof root.UN_resumeRoom === 'function') root.UN_resumeRoom();
    },
    detach: function () {
      this.clearTimers();
      this.exitRoom();
      this._attached = false;
      this.hideOverlay();
    },

    $: function (id) { return root.document.getElementById(id); },
    later: function (fn, ms) { const t = setTimeout(fn, ms); this._timers.push(t); return t; },
    clearTimers: function () { for (let i = 0; i < this._timers.length; i++) clearTimeout(this._timers[i]); this._timers = []; },

    /* ═══════════ تفضيلات ═══════════ */
    loadPrefs: function () {
      try {
        const p = root.localStorage && root.localStorage.getItem(this._prefsKey);
        if (p) {
          const j = JSON.parse(p);
          if (j.level != null) this.config.level = j.level;
          if (j.target) this.config.target = j.target;
        }
      } catch (e) {}
    },
    savePrefs: function () {
      try {
        if (root.localStorage) root.localStorage.setItem(this._prefsKey, JSON.stringify({ level: this.config.level, target: this.config.target }));
      } catch (e) {}
    },
    _syncMute: function () {
      SFX.setMute ? SFX.setMute(!!(root.ST && root.ST.mute)) : null;
      try { if (SFX && SFX.setMuted) SFX.setMuted(!!(root.ST && root.ST.mute)); } catch (e) {}
    },

    /* ═══════════ القائمة ═══════════ */
    _bindMenu: function () {
      const seg = (id, key, cast) => {
        const el = this.$(id);
        if (!el) return;
        const on = (btn) => {
          SFX.click();
          this.config[key] = cast ? cast(btn.getAttribute('data-v')) : btn.getAttribute('data-v');
          for (let i = 0; i < el.children.length; i++) el.children[i].classList.toggle('on', el.children[i] === btn);
          this.savePrefs();
          this._applyModeUI();
        };
        for (let i = 0; i < el.children.length; i++) this.on(el.children[i], 'click', () => on(el.children[i]));
      };
      seg('unLevelSeg', 'level', parseInt);
      seg('unTargetSeg', 'target', parseInt);
      seg('unTimerSeg', 'timer', parseInt);
      const mode = this.$('unModeSeg');
      if (mode) for (let i = 0; i < mode.children.length; i++) this.on(mode.children[i], 'click', (e) => {
        SFX.click();
        this.config.mode = e.target.getAttribute('data-v');
        for (let j = 0; j < mode.children.length; j++) mode.children[j].classList.toggle('on', mode.children[j] === e.target);
        this._applyModeUI();
      });
      const start = this.$('unStartBtn');
      if (start) this.on(start, 'click', () => { SFX.click(); this.startMatch(); });
    },
    _bindGame: function () {
      const dp = this.$('unDeckPile');
      if (dp) this.on(dp, 'click', () => this._doDraw());
      const ub = this.$('unUnoBtn');
      if (ub) this.on(ub, 'click', () => this._doUno());
      /* اختيار لون (فقدان التركيز) */
      const ov = this.$('unOverlay');
      if (ov) this.on(ov, 'click', (e) => {
        if (this._colorPick && e.target === ov) { this._colorPick = null; this.hideOverlay(); }
      });
      const ovl = this.$('unOverlay');
      if (ovl) this.on(ovl, 'click', (e) => {
        const c = e.target && e.target.getAttribute ? e.target.getAttribute('data-c') : null;
        if (c && this._colorPick) this._onColorPick(c);
      });
    },
    _applyModeUI: function () {
      const lv = this.$('unLevelField');
      if (lv) lv.style.display = '';
      const tg = this.$('unTargetField');
      if (tg) tg.style.display = '';
    },

    /* ═══════════ بدء المباراة ═══════════ */
    startMatch: function () {
      if (this.roomMode) return;
      let n = 4;
      let isTeam = false;
      let modeStr = this.config.mode || '2v2';
      if (modeStr === '1v1') n = 2;
      else if (modeStr === '1v2') n = 3;
      else if (modeStr === '1v3') n = 4;
      else if (modeStr === '2v2') { n = 4; isTeam = true; }

      let names = [T('un.you'), T('un.local.1'), T('un.local.2'), T('un.local.3')];
      if (modeStr !== '2v2') {
        names[1] = T('un.local.1');
        names[2] = T('un.local.2');
        names[3] = T('un.local.3');
      }

      NS.newMatch({
        mode: 'ai',
        teams: isTeam,
        level: this.config.level,
        target: this.config.target || 500,
        players: n,
        seed: ((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0) || 1,
        order: [0, 1, 2, 3].map(String),
        names: names
      });
      this._attachOnChange();
      this.showScreen('game');
      this.hideOverlay();
      this._overlayKind = null;
      this._awaitReveal = -1;
      this._revealedSeat = -1;
      this._renderAll(true);
      this.tick();
    },
    _attachOnChange: function () {
      NS.st.onchange = () => this.tick();
    },
    toMenu: function () {
      this._detachState();
      NS.reset();
      this.showScreen('menu');
      this._applyModeUI();
    },
    _detachState: function () {
      if (NS.st) { try { NS.st.onchange = null; } catch (e) {} }
      this._schedKey = null;
      this._overlayKind = null;
      this.hideOverlay();
    },

    /* ═══════════ شاشات ═══════════ */
    showScreen: function (name) {
      for (let i = 0; i < 2; i++) {
        const m = this.$(i === 0 ? 'unMenu' : 'unGame');
        if (m) m.classList.toggle('un-screen-active', (i === 0 && name === 'menu') || (i === 1 && name === 'game'));
      }
    },
    showOverlay: function (html, cls) {
      const o = this.$('unOverlay');
      if (!o) return;
      o.innerHTML = html || '';
      o.className = 'un-overlay show' + (cls ? ' ' + cls : '');
    },
    hideOverlay: function () {
      const o = this.$('unOverlay');
      if (o) { o.className = 'un-overlay'; o.innerHTML = ''; }
    },
    _toast: function (msg, kind) {
      const t = this.$('unToast');
      if (!t) return;
      t.textContent = msg;
      t.className = 'un-toast show ' + (kind || 'info');
      t.hidden = false;
      const self = this;
      this.later(function () { t.hidden = true; t.className = 'un-toast'; }, 1800);
    },

    /* ═══════════ العرض ═══════════ */
    _seatName: function (seat) {
      const s = NS.st;
      if (s && s.names && s.names[seat]) return s.names[seat];
      return T('un.local.' + seat);
    },
    _teamOf: function (seat) { return NS.teamOf(seat); },

    _renderAll: function (fresh) {
      const s = NS.st;
      if (!s) return;
      const n = s.cfg.players;

      /* HUD */
      const us = this.$('unHudUs'), them = this.$('unHudThem');
      const scUs = s.cfg.teams ? NS.teamScore(0) : s.scores[0];
      let scThem = 0;
      if (s.cfg.teams) {
        scThem = NS.teamScore(1);
      } else {
        scThem = Math.max(...s.scores.slice(1));
      }
      const su = this.$('unScoreUs'), st = this.$('unScoreThem');
      if (su) su.textContent = scUs;
      if (st) st.textContent = scThem;
      const subU = this.$('unSubUs'), subT = this.$('unSubThem');
      if (subU) subU.textContent = scUs + '/' + s.cfg.target;
      if (subT) subT.textContent = scThem + '/' + s.cfg.target;
      const rl = this.$('unRoundLbl'); if (rl) rl.textContent = s.roundNo;
      const dot = this.$('unColorDot'); if (dot) dot.style.background = R.colorHex(s.color);
      const ctxt = this.$('unColorTxt'); if (ctxt) ctxt.textContent = T('un.color.' + s.color);
      const dir = this.$('unDirArrow'); if (dir) dir.style.transform = 'rotate(' + (s.dir === 1 ? 0 : 180) + 'deg)';

      /* طاقم + رمية */
      const dp = this.$('unDeckPile');
      if (dp) {
        let h = '';
        for (let i = 0; i < Math.min(3, Math.max(1, s.deck.length)); i++) h += R.cardBack();
        h += '<span class="un-pilecount">' + s.deck.length + '</span>';
        dp.innerHTML = h;
        const myTurn = this._isHumanSeat(s, s.turn);
        dp.classList.toggle('un-can-draw', myTurn && s.phase === 'play' && !Core.legalMoves(s.hands[s.turn], s.color, Core.top(s.discard).value).length);
      }
      const dz = this.$('unDiscard');
      if (dz && s.lastCard) dz.innerHTML = '<div class="un-topcard">' + R.cardFace(s.lastCard) + '</div>';

      /* مقاعد الخصوم */
      const my = Math.max(0, this._mySeat(s));
      const vMap = {};
      if (n === 2) { vMap[1] = 2; }
      else if (n === 3) { vMap[1] = 1; vMap[2] = 3; }
      else { vMap[1] = 1; vMap[2] = 2; vMap[3] = 3; }

      for (let k = 1; k <= 3; k++) {
        let logical = -1;
        for (const [relSt, vk] of Object.entries(vMap)) {
          if (vk === k) logical = (parseInt(relSt, 10) + my) % n;
        }
        
        const stack = this.$('unStack' + k);
        const p = this.$('unPlate' + k);
        
        if (logical === -1 || logical >= n) {
          if (stack) stack.style.display = 'none';
          if (p) p.style.display = 'none';
          continue;
        }

        const hand = s.hands[logical];
        if (stack) {
          /* [Fans-2] سلسلة مقوّسة كاملة بحجم أوراق اللاعب — --i لكل ورقة */
          const show = Math.min(8, hand.length);
          let h = '';
          for (let i = 0; i < show; i++) h += R.cardBack('--i:' + i);
          stack.innerHTML = h;
          stack.style.setProperty('--n', show);
          stack.style.display = hand.length ? '' : 'none';
          stack.classList.toggle('un-turn', s.phase === 'play' && s.turn === logical);
        }
        
        if (p) {
          p.style.display = '';
          const nm = this.$('unName' + k); if (nm) nm.textContent = this._seatName(logical).substring(0, 2).toUpperCase();
          const ct = this.$('unCount' + k); if (ct) ct.textContent = hand.length;
          const bd = this.$('unBadge' + k); if (bd) bd.textContent = logical === this._mySeat(s) ? T('un.you') : '';
          p.classList.toggle('un-turn-seat', s.phase === 'play' && s.turn === logical);
          if (s.cfg.teams) p.classList.toggle('un-team0', this._teamOf(logical) === 0);
        }
      }

      /* يد اللاعب */
      this._renderHand(fresh);

      /* زر UNO */
      const ub = this.$('unUnoBtn');
      if (ub) {
        const my = this._mySeat(s);
        const showUno = s.phase === 'play' && my >= 0 && s.hands[my].length === 2 && !s.unoCalled[my] && this._isHumanSeat(s, s.turn) && s.turn === my;
        ub.hidden = !showUno;
        ub.classList.toggle('armed', showUno);
      }
      this._renderActions();
    },
    _mySeat: function (s) {
      if (!s) return -1;
      if (this.roomMode) return this._roomSeat;
      /* محلي: المقعد النشط هو آخر مقعد كشف لاعبُه يده */
      if (s.cfg.mode === 'local') return this._revealedSeat;
      return 0;
    },
    _isHumanSeat: function (s, seat) {
      if (!s) return false;
      if (s.cfg.mode === 'local') return true;
      if (this.roomMode) return seat === this._roomSeat && this._roomSeat >= 0;
      return seat === 0;
    },

    _renderHand: function (fresh) {
      const s = NS.st;
      const handEl = this.$('unHand');
      const hp = this.$('unHandPlate');
      if (!handEl) return;
      const my = this._mySeat(s);
      const show = this._isHumanSeat(s, my);
      if (!show || my < 0) { handEl.innerHTML = ''; if (hp) hp.style.display = 'none'; return; }
      const hand = s.hands[my];
      const legal = (s.phase === 'play' && s.turn === my && this._isHumanSeat(s, my)) ? Core.legalMoves(hand, s.color, Core.top(s.discard).value) : [];
      let h = '';
      for (let i = 0; i < hand.length; i++) {
        const c = hand[i];
        const cls = 'un-handcard' + (fresh ? ' un-dealin' : '') +
          (legal.length && s.turn === my ? (legal.indexOf(c.id) >= 0 ? ' un-legal' : ' un-dim') : '') +
          (s.drawn === c.id ? ' un-drawn' : '');
        h += '<div class="' + cls + '" data-card="' + c.id + '" style="--i:' + i + ';--n:' + hand.length + (fresh ? ';animation-delay:' + (i * 45) + 'ms' : '') + '">' + R.cardFace(c) + '</div>';
      }
      handEl.innerHTML = h;
      const cards = handEl.querySelectorAll('.un-handcard');
      for (let i = 0; i < cards.length; i++) this.on(cards[i], 'click', (e) => this._onHandCard(e.currentTarget.getAttribute('data-card')));
      if (hp) {
        hp.style.display = '';
        const nm = this.$('unName0'); if (nm) nm.textContent = this._seatName(my).substring(0, 2).toUpperCase();
        const ct = this.$('unCount0'); if (ct) ct.textContent = hand.length;
      }
    },

    /* ═══════════ شريط الأفعال (تخطي/ملاحظة) ═══════════ */
    _renderActions: function () {
      const box = this.$('unActions');
      if (!box) return;
      const s = NS.st;
      let h = '';
      if (s && s.phase === 'play') {
        const my = this._mySeat(s);
        if (this._isHumanSeat(s, s.turn) && s.turn === my) {
          if (s.drawn != null) {
            h += '<p class="un-actions-title un-hint"><b>' + T('un.drawnPlayable') + '</b></p><div class="un-actions-row">' +
              '<button type="button" class="un-abtn un-abtn-gold" id="unPassBtn">' + T('un.pass') + '</button></div>';
            const pb = this.$('unPassBtn');
            if (pb) this.on(pb, 'click', () => this._doPass());
          }
        }
      }
      if (!h) box.classList.remove('show');
      else box.classList.add('show');
      box.innerHTML = h || '';
    },

    /* ═══════════ حركات اللاعب ═══════════ */
    _onHandCard: function (cardId) {
      const s = NS.st;
      if (!s || s.phase !== 'play') return;
      const my = this._mySeat(s);
      if (s.turn !== my || !this._isHumanSeat(s, my)) return;
      const hand = s.hands[my];
      const card = hand.find((c) => c.id === parseInt(cardId, 10));
      if (!card) return;
      const legal = Core.legalMoves(hand, s.color, Core.top(s.discard).value);
      if (legal.indexOf(card.id) < 0) { SFX.error(); this._shakeCard(cardId); return; }
      if (card.color === 'K') {
        /* اختيار لون */
        this._colorPick = card.id;
        this.showOverlay(this._colorPickerHTML(), 'un-colormodal');
        return;
      }
      this._emitPlay(my, card.id, null);
    },
    _colorPickerHTML: function () {
      const T2 = T;
      let h = '<div class="un-modal un-colormodal-box"><p class="un-modal-title">' + T2('un.colorPicker') + '</p><div class="un-colorgrid">';
      for (let i = 0; i < 4; i++) {
        const c = Core.COLORS[i];
        h += '<button type="button" class="un-colorchoice un-c-' + c + '" data-c="' + c + '" title="' + T2('un.color.' + c) + '"></button>';
      }
      h += '</div></div>';
      return h;
    },
    _onColorPick: function (c) {
      if (!this._colorPick) return;
      const cardId = this._colorPick;
      this._colorPick = null;
      this.hideOverlay();
      const my = this._mySeat(NS.st);
      this._emitPlay(my, cardId, c);
    },
    _doPass: function () {
      const s = NS.st;
      if (!s || s.drawn == null) return;
      const my = this._mySeat(s);
      this._netEmit('pass', { seat: my });
      NS.pass(my);
    },
    _doDraw: function () {
      const s = NS.st;
      if (!s || s.phase !== 'play') return;
      const my = this._mySeat(s);
      if (s.turn !== my || !this._isHumanSeat(s, my)) return;
      const legal = Core.legalMoves(s.hands[my], s.color, Core.top(s.discard).value);
      if (legal.length) return; /* يلزم اللعب إن أمكن */
      this._netEmit('draw', { seat: my });
      NS.draw(my);
      SFX.draw();
    },
    _doUno: function () {
      const s = NS.st;
      if (!s) return;
      const my = this._mySeat(s);
      if (s.turn !== my || s.hands[my].length > 2 || s.unoCalled[my]) return;
      this._netEmit('uno', { seat: my });
      NS.callUno(my);
      SFX.uno();
      this._toast(T('un.unoCalled'), 'gold');
    },
    _emitPlay: function (seat, cardId, color) {
      this._netEmit('play', { seat: seat, cardId: cardId, color: color || null });
      const s = NS.st;
      const card = s.hands[seat].find((c) => c.id === cardId);
      NS.play(seat, cardId, color || undefined);
      const st2 = NS.st;
      if (st2 && st2.phase === 'play' && card && (card.value === 'S' || card.value === 'R' || card.value === 'D' || card.value === 'X')) SFX.action();
      else SFX.play();
    },
    _shakeCard: function (cardId) {
      const el = this.$('unHand').querySelector('[data-card="' + cardId + '"]');
      if (el) { el.classList.add('un-shakecard'); const self = this; this.later(function () { el.classList.remove('un-shakecard'); }, 420); }
    },

    /* ═══════════ جدولة التدفق ═══════════ */
    _onChange: function () { if (this._attached) this.tick(); },
    tick: function () {
      const s = NS.st;
      if (!s || !this._attached) return;
      if (this._overlayKind === 'roundEnd' && s.phase !== 'roundEnd') { this.hideOverlay(); this._overlayKind = null; }
      if (this._overlayKind === 'matchEnd' && s.phase !== 'matchEnd') { this.hideOverlay(); this._overlayKind = null; }
      if (this._colorPick && (s.phase !== 'play' || s.turn !== this._mySeat(s))) { this._colorPick = null; this.hideOverlay(); }

      if (s.phase === 'play') {
        const seat = s.turn;
        const key = 'p' + seat + '|' + s.discard.length + '|' + s.drawn;
        const isHuman = this._isHumanSeat(s, seat);
        if (isHuman) {
          this._schedKey = null;
          if (s.cfg.mode === 'local' && this._awaitReveal === -1 && this._revealedSeat !== seat) {
            this._awaitReveal = seat;
            this._showHandover(seat);
            return;
          }
          if (this._awaitReveal >= 0) return;
          this._renderAll(false);
          return;
        }
        if (this.roomMode) {
          /* مقعد بشري بعيد — جهازه يلعب (السائق يتولى المنقطعين) */
          this._renderAll(false);
          return;
        }
        /* بوت */
        if (this._schedKey !== key) {
          this._schedKey = key;
          this.clearTimers();
          const delay = (500 + Math.random() * 500) * (s.cfg.level === 0 ? 0.7 : 1);
          this.later(() => {
            const st2 = NS.st;
            if (!st2 || st2.phase !== 'play' || st2.turn !== seat) return;
            this._aiAct(seat);
          }, delay);
        }
        this._renderAll(false);
        return;
      }

      if (s.phase === 'roundEnd') {
        this._schedKey = null;
        this.later(() => this.showRoundEnd(), 700);
        return;
      }
      if (s.phase === 'matchEnd') {
        this._schedKey = null;
        if (!this._settled) {
          this._settled = true;
          this._settleMatch(s);
        }
        this.later(() => this.showMatchEnd(), 900);
        return;
      }
    },
    _aiAct: function (seat) {
      const s = NS.st;
      if (!s || s.phase !== 'play' || s.turn !== seat) return;
      const plan = NS.aiPlan(seat);
      if (!plan) return;
      if (plan.type === 'play') {
        this._netEmit('play', { seat: seat, cardId: plan.cardId, color: plan.color || null });
        NS.play(seat, plan.cardId, plan.color || undefined);
        const played = s.discard[s.discard.length - 1];
        if (played && (played.value === 'S' || played.value === 'R' || played.value === 'D' || played.value === 'X')) SFX.action(); else SFX.play();
      } else if (plan.type === 'draw') {
        this._netEmit('draw', { seat: seat });
        NS.draw(seat);
        SFX.draw();
      } else if (plan.type === 'pass') {
        this._netEmit('pass', { seat: seat });
        NS.pass(seat);
      } else if (plan.type === 'uno') {
        this._netEmit('uno', { seat: seat });
        NS.callUno(seat);
      }
    },

    /* ═══════════ تسليم الجهاز (محلي) ═══════════ */
    _showHandover: function (seat) {
      const nm = this._seatName(seat);
      this.showOverlay(
        '<div class="un-modal un-handover">' +
        '<h2 class="un-modal-title">' + T('un.handoverTitle', { name: nm }) + '</h2>' +
        '<button type="button" class="un-go" id="unRevealBtn">' + T('un.handoverTap') + '</button>' +
        '</div>'
      );
      const btn = this.$('unRevealBtn');
      if (btn) this.on(btn, 'click', () => {
        SFX.click();
        this._awaitReveal = -1;
        this._revealedSeat = seat;
        this.hideOverlay();
        this._renderAll(true);
        this.tick();
      });
    },

    /* ═══════════ نهاية جولة / مباراة ═══════════ */
    showRoundEnd: function () {
      const s = NS.st;
      if (!s || s.phase !== 'roundEnd') return;
      const winner = s.roundWinner;
      const pts = s.roundPoints[winner] || 0;
      const room = this.roomMode;
      const btnLbl = room ? (this._isDriver ? T('un.nextRound') : T('un.voteNext')) : T('un.continue');
      this._overlayKind = 'roundEnd';
      this.showOverlay(
        '<div class="un-modal un-roundmodal">' +
        '<p class="un-om-eyebrow">' + T('un.roundEnd') + '</p>' +
        '<h2 class="un-om-title">' + T('un.roundWon', { name: this._seatName(winner), v: pts }) + '</h2>' +
        '<div class="un-m-scores"><b>' + (s.cfg.teams ? NS.teamScore(0) : s.scores[0]) + '</b><i>—</i><b>' + (s.cfg.teams ? NS.teamScore(1) : s.scores[1]) + '</b><span class="un-m-target">/ ' + s.cfg.target + '</span></div>' +
        (room && !this._isDriver ? '<p class="un-om-wait">' + T('un.waitPlayers') + '</p>' : '') +
        '<button type="button" class="un-go" id="unNextRoundBtn">' + btnLbl + '</button>' +
        '</div>'
      );
      SFX.roundWin();
      const btn = this.$('unNextRoundBtn');
      if (btn) this.on(btn, 'click', () => this._onNextRoundClick());
      if (room && this._isDriver) {
        const self = this;
        const rn = s.roundNo;
        this.later(function () {
          const s2 = NS.st;
          if (s2 && s2.phase === 'roundEnd' && s2.roundNo === rn) {
            self.hideOverlay();
            self._roundVotes = {};
            self._netEmit('next', { round: rn });
            NS.nextRound();
            self._lastActAt = Date.now();
          }
        }, 20000);
      }
    },
    _onNextRoundClick: function () {
      if (!this.roomMode) {
        this.hideOverlay();
        NS.nextRound();
        return;
      }
      if (this._isDriver) {
        this.hideOverlay();
        this._roundVotes = {};
        this._netEmit('next', { round: NS.st.roundNo });
        NS.nextRound();
        this._lastActAt = Date.now();
        return;
      }
      const meId = root.unMyUserId ? root.unMyUserId() : null;
      if (meId == null) return;
      if (this._roundVotes[meId]) return;
      this._roundVotes[meId] = true;
      this._netEmit('next', { round: NS.st.roundNo, vote: 1 });
      this._toast(T('un.room.voted'), 'info');
    },
    _settleMatch: function (s) {
      if (s.cfg.mode === 'room') { this._onRoomMatchEnd(s); return; }
      /* تعليمي — بلا رهان */
      if (s.cfg.mode === 'local') SFX.matchWin();
      else {
        const myTeam = s.cfg.teams ? NS.teamOf(this._mySeat(s)) : (s.matchWinner === 0 ? 0 : 1);
        const won = s.cfg.teams ? s.matchWinner === myTeam : s.matchWinner === 0;
        if (won) SFX.matchWin(); else SFX.matchLose();
      }
    },
    showMatchEnd: function () {
      const s = NS.st;
      if (!s || s.phase !== 'matchEnd') return;
      this._overlayKind = 'matchEnd';
      const room = this.roomMode;
      const local = s.cfg.mode === 'local';
      const winnerName = s.cfg.teams ? (s.matchWinner === 0 ? T('un.us') : T('un.them')) : this._seatName(s.matchWinner);
      let html = '<div class="un-modal un-matchmodal">' +
        '<p class="un-om-eyebrow">' + T('un.matchOver') + '</p>' +
        '<h2 class="un-om-title">' + T('un.wonBy', { name: winnerName }) + '</h2>' +
        '<div class="un-m-scores un-m-final"><b>' + (s.cfg.teams ? NS.teamScore(0) : s.scores[0]) + '</b><i>—</i><b>' + (s.cfg.teams ? NS.teamScore(1) : s.scores[1]) + '</b></div>';
      if (room) html += '<div class="un-m-roomact" id="unRoomMatchActions"></div>';
      else if (!local) html += '<p class="un-m-note">' + T('un.educational') + '</p>';
      html += '<div class="un-m-btns">' +
        '<button type="button" class="un-go" id="unNewMatchBtn">' + T('un.newMatch') + '</button>' +
        '<button type="button" class="un-go2" id="unMenuBtn">' + T('un.backMenu') + '</button>' +
        '</div></div>';
      this.showOverlay(html);
      if (room) this._renderRoomMatchActions();
      const nm = this.$('unNewMatchBtn');
      if (nm) this.on(nm, 'click', () => {
        SFX.click();
        if (this.roomMode) {
          if (this._isDriver) { this._netEmit('init', null, true); this._hostInitRoom(this._roomState()); }
          else this._toast(T('un.waitPlayers'), 'info');
          return;
        }
        this._settled = false;
        this.startMatch();
      });
      const mb = this.$('unMenuBtn');
      if (mb) this.on(mb, 'click', () => { SFX.click(); if (this.roomMode) this._openRoomModal(); else this.toMenu(); });
    },
    _renderRoomMatchActions: function () {
      const box = this.$('unRoomMatchActions');
      if (!box) return;
      const rs = this._roomState();
      const rem = rs && rs.rematch;
      let h = '';
      if (rem && rem.resolved) {
        h = rem.rematch ? '<p class="un-om-wait">' + T('un.room.restarting') + '</p>'
          : '<p class="un-om-wait">' + T('un.room.noRematch') + '</p>';
      } else if (this._isDriver) {
        h = '<p class="un-om-wait">' + T('un.room.waitVotes') + '</p>';
      } else {
        h = '<div class="un-actions-row">' +
          '<button type="button" class="un-abtn un-abtn-gold" id="unVoteYes">' + T('un.room.rematchYes') + '</button>' +
          '<button type="button" class="un-abtn" id="unVoteNo">' + T('un.room.rematchNo') + '</button>' +
          '</div>';
        const y = this.$('unVoteYes'); if (y) this.on(y, 'click', () => { SFX.click(); this._netEmit('vote', { v: 1 }); try { root.Rooms.voteRematch(1); } catch (e) {} this._toast(T('un.room.voted'), 'info'); });
        const n = this.$('unVoteNo'); if (n) this.on(n, 'click', () => { SFX.click(); try { root.Rooms.voteRematch(0); } catch (e) {} });
      }
      box.innerHTML = h;
    },

    /* ═══════════ عقد الغرف ═══════════ */
    _roomState: function () {
      return (typeof root.Rooms !== 'undefined' && root.Rooms.state) ? root.Rooms.state : this._room;
    },
    unMyId: function () { return (typeof root.unMyUserId === 'function') ? root.unMyUserId() : null; },
    _seatPresent: function (seat) {
      const pid = (this._roomOrder || [])[seat];
      if (pid == null) return true;
      const rs = this._roomState();
      if (!rs || !rs.players) return false;
      return rs.players.some((p) => String(p.id) === String(pid) && !p.spectate);
    },
    _recomputeRoomIdentity: function () {
      const meId = this.unMyId();
      this._roomSeat = -1;
      this._isSpectator = true;
      const rs = this._roomState();
      this._isDriver = !!(rs && meId != null && String(rs.owner_id) === String(meId));
      if (!rs || !rs.players || meId == null) return;
      for (let i = 0; i < rs.players.length; i++) {
        const p = rs.players[i];
        if (String(p.id) === String(meId)) {
          this._isSpectator = !!p.spectate;
          if (!p.spectate) this._roomSeat = i;
          break;
        }
      }
    },
    enterRoom: function (room, opts) {
      opts = opts || {};
      if (!room || room.game_id !== 'un') return;
      const already = this.roomMode && NS.st;
      this._room = room;
      this.roomMode = true;
      this.config.mode = 'room';
      const rc = (root.UN_ROOM_CFG && typeof root.UN_ROOM_CFG === 'object') ? root.UN_ROOM_CFG : {};
      if (rc.target) this.config.target = parseInt(rc.target, 10) || 500;
      if (rc.mode4) this.config.teams = rc.mode4 === 'tt';
      else this.config.teams = false;
      this._roomTimer = Math.max(30, Math.min(300, parseInt(rc.timer, 10) || 60));
      this._recomputeRoomIdentity();
      this.showScreen('game');
      this.hideOverlay();
      this._overlayKind = null;
      if (room.status === 'playing' && !NS.st) {
        if (this._isDriver) this._hostInitRoom(room);
        else {
          this._renderRoomWaiting();
          if (opts.live) { try { if (root.Rooms && root.Rooms.requestReplay) root.Rooms.requestReplay(); } catch (e) {} }
        }
      } else if (room.status !== 'playing' && !NS.st) {
        this._renderRoomWaiting();
      }
      if (already && this._isDriver && room.status === 'playing') this._hostInitRoom(room);
      this._startDriverTick();
      this._startReplayPoll();
      this._renderAll(true);
    },
    _resumeRoom: function () {
      const rs = this._roomState();
      if (!rs || rs.game_id !== 'un') { this.exitRoom(); return; }
      this._room = rs;
      this._recomputeRoomIdentity();
      if (rs.status === 'playing' && !NS.st) {
        this._renderRoomWaiting();
        try { if (root.Rooms && root.Rooms.requestReplay) root.Rooms.requestReplay(); } catch (e) {}
      }
      this.showScreen(rs.status === 'playing' ? 'game' : 'menu');
      this._startDriverTick();
      this._startReplayPoll();
    },
    exitRoom: function () {
      this._stopDriverTick();
      this._stopReplayPoll();
      this.roomMode = false;
      this._room = null;
      this._roomSeat = -1;
      this._isDriver = false;
      this._isSpectator = true;
      this._roomOrder = null;
      this._roomNames = [];
      this._roundVotes = {};
      this._matchSettled = false;
      this._detachState();
      NS.reset();
      this.showScreen('menu');
      this._applyModeUI();
    },
    onRoomRoundEnded: function () {
      if (!this.roomMode) return;
      this.exitRoom();
      this._toast(T('un.room.ended'), 'info');
    },

    /* ── السائق: تهيئة موحدة ── */
    _hostInitRoom: function (room) {
      const players = ((room && room.players) || []).filter((p) => !p.spectate).slice(0, 4);
      if (players.length < 2) { this._renderRoomWaiting(); return; }
      const order = players.map((p) => String(p.id));
      const names = players.map((p) => String(p.username || p.id).slice(0, 14));
      const seed = ((Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0) || 1;
      const data = { seed: seed, target: this.config.target, teams: this.config.teams, order: order, names: names, level: this.config.level };
      this._buildRoomGame(data);
      this._netEmit('init', data);
    },
    _buildRoomGame: function (data) {
      if (!data || !data.order || !data.order.length) return;
      this._roomOrder = data.order.slice(0, 4);
      this._roomNames = data.names || [];
      this._recomputeRoomIdentity();
      NS.newMatch({
        mode: 'room',
        teams: !!data.teams,
        level: data.level || 2,
        target: Number(data.target) || 500,
        players: this._roomOrder.length,
        seed: Number(data.seed) >>> 0,
        order: this._roomOrder,
        names: this._roomNames.length === this._roomOrder.length ? this._roomNames : this._roomOrder.map((id, i) => 'P' + (i + 1))
      });
      /* newMatch أنشأ حالة جديدة — نعيد ربط onchange (نفس نمط startMatch)
         وإلا مات سلك notify→tick وتجمّدت الواجهة بعد أول حركة */
      this._attachOnChange();
      this._settled = false;
      this._matchSettled = false;
      this._roundVotes = {};
      this._lastActAt = Date.now();
      this.hideOverlay();
      this.showScreen('game');
      this._renderAll(true);
      this.tick();
    },
    _renderRoomWaiting: function () {
      const msg = this._isDriver ? T('un.room.waitStartHost') : T('un.room.waitStart');
      this._overlayKind = 'roomWait';
      this.showOverlay(
        '<div class="un-modal un-waitmodal">' +
        '<h2 class="un-modal-title">' + T('un.room.title') + '</h2>' +
        '<p class="un-om-wait">' + msg + '</p>' +
        '<button type="button" class="un-go2" id="unRoomOpenBtn">' + T('un.room.open') + '</button>' +
        '</div>'
      );
      const b = this.$('unRoomOpenBtn');
      if (b) this.on(b, 'click', () => { SFX.click(); this._openRoomModal(); });
    },
    _openRoomModal: function () {
      try { if (root.Rooms && root.Rooms.openModal) root.Rooms.openModal(); } catch (e) {}
    },

    /* ── بث/استقبال ── */
    _netSeq: 0,
    _netEmit: function (action, data, quiet) {
      if (!this.roomMode) return false;
      const Rooms = root.Rooms;
      if (!Rooms || typeof Rooms.sendMove !== 'function') return false;
      this._netSeq++;
      const payload = { action: action, data: data || {}, by: this.unMyId(), seq: this._netSeq, ts: Date.now() };
      try { Rooms.sendMove('unmove', payload, { game_id: 'un', status: 'playing' }); } catch (e) {}
      return true;
    },
    netApplyMove: function (d) {
      if (!d) return;
      if (d.action === 'unmove' && d.data) d = d.data;
      if (!d.action) return;
      const meId = this.unMyId();
      if (d.by != null && meId != null && String(d.by) === String(meId)) return;
      const data = d.data || {};
      if (d.action === 'init') { this._buildRoomGame(data); return; }
      const s = NS.st;
      if (!s) return;
      try {
        if (d.action === 'play') {
          NS.play(data.seat, data.cardId, data.color || undefined);
          const played = NS.st && NS.st.discard[NS.st.discard.length - 1];
          if (played && (played.value === 'S' || played.value === 'R' || played.value === 'D' || played.value === 'X')) SFX.action(); else SFX.play();
        } else if (d.action === 'draw') {
          if (s.phase === 'play' && s.turn === data.seat) { NS.draw(data.seat); SFX.draw(); }
        } else if (d.action === 'pass') {
          if (s.phase === 'play' && s.turn === data.seat) NS.pass(data.seat);
        } else if (d.action === 'uno') {
          NS.callUno(data.seat);
        } else if (d.action === 'next') {
          if (s.phase === 'roundEnd') {
            if (data.vote) {
              const vid = d.by;
              if (vid != null) this._roundVotes[vid] = true;
              if (this._isDriver && this._roundComplete(s)) { this._netEmit('next', { round: s.roundNo }); this._advanceRound(s); }
            } else if (!this._isDriver) {
              this._advanceRound(s);
            }
          }
        }
      } catch (e) { if (root.console) console.warn('[Uno MP]', e && e.message); }
      this._renderAll(false);
      this.tick();
    },
    _roundComplete: function (s) {
      /* يكتمل عند تصويت كل المقاعد البشرية الحاضرة */
      for (let i = 0; i < s.cfg.players; i++) {
        if (this._isHumanSeat(s, i) && i !== this._roomSeat) {
          const pid = (this._roomOrder || [])[i];
          if (pid != null && !this._roundVotes[pid]) return false;
        }
      }
      return true;
    },
    _advanceRound: function (s) {
      this.hideOverlay();
      this._overlayKind = null;
      this._roundVotes = {};
      NS.nextRound();
      this._lastActAt = Date.now();
    },

    /* ── سائق: تولى المنقطعين ── */
    /* ── سائق ومؤقت مرئي ── */
    _startDriverTick: function () {
      this._stopDriverTick();
      const self = this;
      this._driverT = setInterval(function () {
        try { if (self._isDriver) self.roomDriverTick(); } catch (e) {}
        try { self.roomUiTimerTick(); } catch (e) {}
      }, 1000);
    },
    _stopDriverTick: function () { if (this._driverT) { clearInterval(this._driverT); this._driverT = null; } },
    roomUiTimerTick: function () {
      if (!this.roomMode) return;
      const s = NS.st;
      if (!s || s.phase !== 'play') {
        for (let k = 0; k <= 3; k++) {
          const el = this.$('unTimer' + k);
          if (el) el.hidden = true;
        }
        return;
      }
      const grace = this._roomTimer || 60;
      let left = grace - Math.floor((Date.now() - (this._lastActAt || Date.now())) / 1000);
      if (left < 0) left = 0;
      const isLow = left <= 10;
      
      const n = s.cfg.players;
      const my = Math.max(0, this._mySeat(s));
      const vMap = {};
      if (n === 2) { vMap[1] = 2; }
      else if (n === 3) { vMap[1] = 1; vMap[2] = 3; }
      else { vMap[1] = 1; vMap[2] = 2; vMap[3] = 3; }

      const logicToUi = {};
      logicToUi[my] = 0;
      for (let rel = 1; rel < n; rel++) {
        const logical = (rel + my) % n;
        logicToUi[logical] = vMap[rel] || -1;
      }
      
      for (let i = 0; i < n; i++) {
        const uiSeat = logicToUi[i];
        if (uiSeat >= 0 && uiSeat <= 3) {
          const el = this.$('unTimer' + uiSeat);
          if (el) {
            if (i === s.turn) {
              el.hidden = false;
              el.textContent = '⏱ ' + left;
              el.className = 'un-ptimer' + (isLow ? ' un-time-low' : '');
            } else {
              el.hidden = true;
            }
          }
        }
      }
      // auto-play on timeout for local turn in room
      if (left <= 0 && s.turn === my && !this._isSpectator && this.roomMode) {
        if (!this._autoPlayedTurn || this._autoPlayedTurn !== s.turn) {
          this._autoPlayedTurn = s.turn; // prevent spamming
          const legal = Core.legalMoves(s.hands[my], s.color, Core.top(s.discard).value);
          if (legal.length) {
            this._netEmit('play', { card: legal[0] });
            NS.playCard(my, legal[0]);
          } else {
            this._netEmit('draw', {});
            NS.drawCard(my);
          }
          this._lastActAt = Date.now();
        }
      } else if (left > 0) {
        this._autoPlayedTurn = -1;
      }
    },
    roomDriverTick: function () {
      if (!this.roomMode || !this._isDriver) return;
      const s = NS.st;
      if (!s) return;
      if (s.phase !== 'play') return;
      const seat = s.turn;
      const present = this._seatPresent(seat);
      const grace = (this._roomTimer || 60) * 1000;
      const stalled = Date.now() - (this._lastActAt || Date.now()) > grace;
      if (present && !stalled) return;
      if (this._aiNext && Date.now() - this._aiNext < 1500) return;
      this._aiNext = Date.now();
      this._aiAct(seat);
      this._lastActAt = Date.now();
    },

    /* ── Replay ── */
    _startReplayPoll: function () {
      this._stopReplayPoll();
      const self = this;
      this._replayPollT = setInterval(function () {
        try {
          if (!self.roomMode) return;
          const rs = self._roomState();
          if (!rs || rs.game_id !== 'un') return;
          if (root.Rooms && typeof root.Rooms.hasPendingReplay === 'function' && root.Rooms.hasPendingReplay()) {
            const rp = root.Rooms.consumePendingReplay();
            if (rp && rp.history) self.applyReplay(rp.history);
          }
        } catch (e) {}
      }, 700);
    },
    _stopReplayPoll: function () { if (this._replayPollT) { clearInterval(this._replayPollT); this._replayPollT = null; } },
    applyReplay: function (history) {
      if (!history || !history.length) return;
      const rs = this._roomState();
      if (rs && rs.game_id !== 'un') return;
      this.roomMode = true;
      this.config.mode = 'room';
      this._recomputeRoomIdentity();
      this.showScreen('game');
      let built = false;
      for (let i = 0; i < history.length; i++) {
        const m = history[i];
        if (!m) continue;
        let action = m.action, data = m.data || {};
        if (action === 'unmove' && m.data && m.data.action) { action = m.data.action; data = m.data.data || {}; }
        if (action === 'init') { this._buildRoomGame(data); built = true; }
        else if (!built) continue;
        else if (action === 'play') { try { NS.play(data.seat, data.cardId, data.color || undefined); } catch (e) {} }
        else if (action === 'draw') { try { const s = NS.st; if (s && s.phase === 'play' && s.turn === data.seat) NS.draw(data.seat); } catch (e) {} }
        else if (action === 'pass') { try { const s = NS.st; if (s && s.phase === 'play' && s.turn === data.seat) NS.pass(data.seat); } catch (e) {} }
        else if (action === 'uno') { try { NS.callUno(data.seat); } catch (e) {} }
        else if (action === 'next') { try { const s = NS.st; if (s && s.phase === 'roundEnd') NS.nextRound(); } catch (e) {} }
      }
      this._renderAll(true);
      this.tick();
    },

    /* ── نهاية مباراة الغرفة: تسوية + ريماش ── */
    _onRoomMatchEnd: function (s) {
      if (this._matchSettled) return;
      this._matchSettled = true;
      const self = this;
      this.later(function () {
        try {
          const rs = self._roomState();
          if (!rs) return;
          const meId = self.unMyId();
          if (meId == null) return;
          let entry = null;
          for (let i = 0; i < (rs.players || []).length; i++) {
            if (String(rs.players[i].id) === String(meId)) { entry = rs.players[i]; break; }
          }
          if (!entry || entry.spectate) return;
          const bet = Number(rs.bet) || 0;
          const isHost = String(rs.owner_id) === String(meId);
          if (bet > 0 && !rs.settled && isHost && typeof root.Rooms.settleTeam === 'function') {
            /* الفريق الفائز حسب المقعد (فردي: كل لاعب فريقه — فرقي: المقاعد المتقابلة) */
            const winTeam = (typeof NS.teamOf === 'function') ? NS.teamOf(s.matchWinner) : (s.matchWinner === 0 ? 0 : 1);
            try { root.Rooms.settleTeam(winTeam === 0 ? 't0' : 't1'); } catch (e) {}
          }
          self.later(function () { try { if (typeof root.Rooms.startRematch === 'function') root.Rooms.startRematch(); } catch (e) {} }, 900);
        } catch (e) {}
      }, 600);
    },

    /* ═══════════ أدوات ═══════════ */
    on: function (el, ev, fn) { if (el) el.addEventListener(ev, fn); },
    _settled: false
  };

  root.UnoApp = App;
})(typeof window !== 'undefined' ? window : globalThis);

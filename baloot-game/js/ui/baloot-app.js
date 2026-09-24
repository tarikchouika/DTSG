/* ════════════════════════════════════════════════════════════════════
   BalootApp — المتحكم الرئيسي للبلوت
   ────────────────────────────────────────────────────────────────────
   • دورة حياة attach()/detach() — عقد المنصة (نمط الطاولة/الضومنة).
   • ثلاثة أوضاع:
       - ai     : ضد 3 أدمغة اصطناعية (تعليمي — بلا رهان).
       - local  : 4 لاعبين وجهاً لوجه على جهاز واحد (تعليمي — بلا رهان).
       - room   : غرفة أونلاين 4 لاعبين (2 ضد 2) — الرهان خادمياً عبر نظام
                  الغرف/البطولات (السائق = صاحب الغرفة).
   • قواعد اللعبة الكاملة من أيقونة القواعد في هيدر المنصة (showFullRules).
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const Core = root.BALCore;
  const NS = root.BLGameNS;
  const R = root.BLRender;
  const T = root.BL_T;
  const FMT = root.BL_FMT;
  const SFX = root.BLAudio;

  const PREFS_KEY = 'baloot.prefs';

  const App = {
    config: { mode: 'ai', level: 2, target: 152, firstLead: 'left', mustBeat: false, kabotBonus: 30 },
    game: null,
    betPlaced: 0,

    /* حالة دورة الحياة */
    _attached: false,
    _timers: [],
    _handlers: [],
    _schedKey: null,
    _prevBaloot: [false, false],
    _settled: false,
    _revealedSeat: -1,
    _awaitReveal: -1,
    _paused: false,
    _lastHumanSeat: -1,
    _fx: null,
    _handHandlers: null,
    _overlayKind: null,

    /* ── حالة غرفة الأونلاين ── */
    roomMode: false,
    _room: null,
    _roomSeat: -1,
    _isSpectator: true,
    _isDriver: false,
    _roomOrder: null,        /* ids بالمقاعد 0..3 (يبثّها السائق) */
    _roomNames: [],
    _roomTimer: 60,          /* مهلة الدور (ثوانٍ) من إعدادات الغرفة */
    _netSeq: 0,
    _lastActAt: 0,
    _aiNext: 0,
    _driverT: null,
    _roundVotes: {},
    _matchSettled: false,
    _handDeferRound: -1,

    /* ═══════════ منصة اختيارية ═══════════ */
    _platform() {
      return {
        wallet: typeof root.ST === 'object' && root.ST && typeof root.ST.gold === 'number',
        take: typeof root.takeBet === 'function',
        give: typeof root.giveWin === 'function',
        toast: typeof root.toast === 'function',
        winFX: typeof root.winFX === 'function',
        record: typeof root.recordRound === 'function'
      };
    },
    walletBalance() {
      const p = this._platform();
      return p.wallet ? root.ST.gold : 0;
    },
    _syncMute() { try { if (root.ST && typeof root.ST.mute !== 'undefined') SFX.setMuted(!!root.ST.mute); } catch (e) {} },
    _toast(msg, kind) {
      const p = this._platform();
      if (p.toast) { try { root.toast(msg, kind); return; } catch (e) {} }
      const t = root.document.getElementById('blToast');
      if (t) {
        t.textContent = msg;
        t.className = 'bl-toast show' + (kind === 'err' ? ' err' : '');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => { t.className = 'bl-toast'; }, 2200);
      }
    },

    /* ═══════════ دورة الحياة ═══════════ */
    attach: function () {
      if (this._attached) return;
      this._attached = true;
      const stage = this.$('blStage');
      if (!stage) { console.error('blStage missing'); return; }
      stage.innerHTML = root.BLHTML.stageHTML();
      /* لوغو المنصة في منتصف الطاولة (أصول المنصة الموحدة) */
      const logoImg = stage.querySelector('#blTableLogoImg');
      const _ab = root.BLRender && root.BLRender.assetBase();
      if (logoImg && _ab) logoImg.src = _ab + '/dtsg/dtsg-logo-main.webp';
      this._buildFx();
      this._bindMenu();
      this._bindGame();
      this.loadPrefs();
      this._syncMute();
      root.BLTranslateStatic(stage);
      this._refreshBalUI();
      this._applyModeUI();
      /* استئناف غرفة مفتوحة (رجوع من صفحة أخرى/إعادة تهيئة) */
      if (this.roomMode && this._room) {
        this._resumeRoom();
      } else {
        this.showScreen('menu');
        this._renderRoomMenu();
      }
      NS.onChange(App._onChange);
      SFX.prime();
    },
    detach: function () {
      if (!this._attached) return;
      this._attached = false;
      this.clearTimers();
      this._stopDriverTick();
      this._stopReplayPoll();
      for (let i = 0; i < this._handlers.length; i++) {
        try { this._handlers[i].el.removeEventListener(this._handlers[i].ev, this._handlers[i].fn); } catch (e) {}
      }
      this._handlers = [];
      if (this._handHandlers) this._clearHandlers(this._handHandlers);
      if (this._fx) { try { this._fx.dispose(); } catch (e) {} this._fx = null; }
      NS.state = null;
      this._schedKey = null;
      this._settled = false;
      this._overlayKind = null;
    },
    clearTimers: function () { for (let i = 0; i < this._timers.length; i++) clearTimeout(this._timers[i]); this._timers = []; },
    later: function (fn, ms) { const t = setTimeout(fn, ms); this._timers.push(t); return t; },
    on: function (el, ev, fn) { if (!el) return; el.addEventListener(ev, fn); this._handlers.push({ el: el, ev: ev, fn: fn }); },
    _clearHandlers: function (list) {
      for (let i = 0; i < list.length; i++) {
        try { list[i].el.removeEventListener(list[i].ev, list[i].fn); } catch (e) {}
      }
      list.length = 0;
    },
    $(id) { return root.document.getElementById(id); },

    _buildFx() {
      const cv = this.$('blFx');
      if (!cv) {
        const c = root.document.createElement('canvas');
        c.className = 'bl-fxcv';
        c.id = 'blFx';
        const game = this.$('blGame');
        if (game) game.appendChild(c);
      }
      this._fx = new R.Particles(this.$('blFx'));
    },

    showScreen: function (name) {
      const m = this.$('blMenu'), g = this.$('blGame');
      if (m) m.classList.toggle('bl-screen-active', name === 'menu');
      if (g) g.classList.toggle('bl-screen-active', name === 'game');
    },

    /* ═══════════ القائمة ═══════════ */
    _applyModeUI() {
      const mode = this.config.mode;
      const roomish = mode === 'room' || this.roomMode;
      const show = (id, on) => { const el = this.$(id); if (el) el.style.display = on ? '' : 'none'; };
      show('blModeField', !roomish);
      show('blLevelField', mode === 'ai');
      show('blTargetField', !roomish);
      show('blTableRulesField', !roomish);
      show('blStartBtn', !roomish);
      const desc = this.$('blModeDesc');
      if (desc && !roomish) desc.textContent = T(mode === 'ai' ? 'blt.modeDesc.ai' : 'blt.modeDesc.local');
      this._renderRoomMenu();
      this._refreshBalUI();
    },
    loadPrefs: function () {
      try {
        const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
        if (p) {
          if (p.mode && p.mode !== 'room') this.config.mode = p.mode;
          if (typeof p.level === 'number') this.config.level = p.level;
          if (p.target) this.config.target = p.target;
          if (p.firstLead) this.config.firstLead = p.firstLead;
          if (typeof p.mustBeat === 'boolean') this.config.mustBeat = p.mustBeat;
          if (typeof p.kabotBonus === 'number') this.config.kabotBonus = p.kabotBonus;
        }
      } catch (e) {}
    },
    savePrefs: function () {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.config)); } catch (e) {}
    },

    _bindMenu: function () {
      const seg = (segId, attr, apply) => {
        const el = this.$(segId);
        if (!el) return;
        this.on(el, 'click', (e) => {
          const b = e.target.closest('.bl-segbtn');
          if (!b) return;
          const btns = el.querySelectorAll('.bl-segbtn');
          for (let i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
          b.classList.add('selected');
          SFX.click();
          apply(b.getAttribute(attr));
          this.savePrefs();
        });
      };
      seg('blModeSeg', 'data-mode', (v) => { this.config.mode = v; this._applyModeUI(); });
      seg('blLevelSeg', 'data-level', (v) => { this.config.level = parseInt(v, 10) || 0; });
      seg('blTargetSeg', 'data-target', (v) => { this.config.target = parseInt(v, 10) || 152; });
      seg('blLeadSeg', 'data-lead', (v) => { this.config.firstLead = v; });
      seg('blKabotSeg', 'data-kabot', (v) => { this.config.kabotBonus = parseInt(v, 10) || 0; });

      const mb = this.$('blMustBeat');
      if (mb) {
        mb.checked = !!this.config.mustBeat;
        this.on(mb, 'change', () => { this.config.mustBeat = mb.checked; this.savePrefs(); SFX.click(); });
      }
      const fold = this.$('blFoldHead');
      if (fold) this.on(fold, 'click', () => {
        const body = this.$('blFoldBody');
        if (body) { body.hidden = !body.hidden; fold.classList.toggle('open', !body.hidden); SFX.click(); }
      });

      const start = this.$('blStartBtn');
      if (start) this.on(start, 'click', () => { SFX.click(); this.startMatch(); });

      /* مزامنة أزرار القائمة مع الإعدادات المحفوظة */
      const mark = (segId, attr, val) => {
        const el = this.$(segId);
        if (!el) return;
        const btns = el.querySelectorAll('.bl-segbtn');
        for (let i = 0; i < btns.length; i++) btns[i].classList.toggle('selected', btns[i].getAttribute(attr) === String(val));
      };
      mark('blModeSeg', 'data-mode', this.config.mode);
      mark('blLevelSeg', 'data-level', this.config.level);
      mark('blTargetSeg', 'data-target', this.config.target);
      mark('blLeadSeg', 'data-lead', this.config.firstLead);
      mark('blKabotSeg', 'data-kabot', this.config.kabotBonus);
      this._applyModeUI();
    },

    _bindGame: function () {
      const stage = this.$('blStage');
      if (stage) this.on(stage, 'pointerdown', () => SFX.prime(), { once: true });

      this.on(root.document, 'keydown', (e) => {
        if (!NS.state) return;
        const k = e.key;
        const s = NS.state;
        const seat = this._activeSeat();
        if (s.cfg.mode === 'ai' && seat !== 0) return;
        if (s.cfg.mode === 'room' && seat < 0) return;
        if (this._paused || this._awaitReveal >= 0 || !this._isHuman(s, seat)) return;
        if (s.phase === 'naming') {
          const map = { '1': 'S', '2': 'H', '3': 'D', '4': 'C' };
          if (map[k]) { this._humanNaming(seat, { kind: 'suit', suit: map[k] }); return; }
          if (k === '5') { this._humanNaming(seat, { kind: 'sun' }); return; }
          if (k === 'q' || k === 'Q') { this._humanNaming(seat, null); return; }
        }
        if (s.phase === 'ashur' && s.turn === seat) {
          /* مفتاح 0/م: تخطي الأشور */
          if (k === '0' || k === 'm' || k === 'M') { this._onAshurPick(seat, null); return; }
        }
        if (s.phase === 'play' && s.turn === seat) {
          const hand = this._viewHand();
          const n = hand.length;
          if (!n) return;
          if (/^[1-8]$/.test(k)) { const c = hand[parseInt(k, 10) - 1]; if (c) this._tryPlay(seat, c); }
        }
      });
    },

    /* ═══════════ بدء المباراة (ai/local — تعليمي بلا رهان) ═══════════ */
    startMatch: function () {
      this.betPlaced = 0;
      this._settled = false;
      this._paused = false;
      this._awaitReveal = -1;
      this._revealedSeat = -1;
      this._lastHumanSeat = -1;
      this._prevBaloot = [false, false];
      this._overlayKind = null;
      this.clearTimers();
      this.hideOverlay();
      NS.newMatch({
        mode: this.config.mode,
        level: this.config.level,
        target: this.config.target,
        firstLead: this.config.firstLead,
        mustBeat: this.config.mustBeat,
        kabotBonus: this.config.kabotBonus
      });
      this._syncMute();
      this.showScreen('game');
      this._renderAll(true);
      this.tick();
    },

    toMenu: function () {
      /* في الغرفة: نُبقي حالة المباراة (نعود إليها) — خارجها نُصفّر */
      if (this.roomMode) {
        this.showScreen('menu');
        this._renderRoomMenu();
        this.hideOverlay();
        return;
      }
      this.clearTimers();
      NS.state = null;
      this._settled = false;
      this._schedKey = null;
      this._overlayKind = null;
      this.hideOverlay();
      this.showScreen('menu');
      this._applyModeUI();
    },

    /* ═══════════ من هم اللاعبون ═══════════ */
    _isHuman(s, seat) {
      if (!s) return false;
      if (s.cfg.mode === 'local') return true;
      if (s.cfg.mode === 'room') return seat === this._roomSeat && this._roomSeat >= 0;
      return seat === 0;
    },
    _activeSeat() {
      const s = NS.state;
      if (!s) return -1;
      if (s.cfg.mode === 'local') return s.turn;
      if (s.cfg.mode === 'room') return this._roomSeat;
      return 0;
    },
    seatName(seat) {
      const s = NS.state;
      if (s && s.seatNames && s.seatNames[seat]) return s.seatNames[seat];
      const mode = s ? s.cfg.mode : this.config.mode;
      return mode === 'local' ? T('blt.local.' + seat) : T('blt.name.' + seat);
    },
    _viewHand() {
      const s = NS.state;
      const seat = this._activeSeat();
      /* متفرج رُقّي في منتصف الجولة: يد مشبوثة حتى التوزيعة القادمة */
      if (s && s.cfg.mode === 'room' && seat >= 0 && this._handDeferRound === s.roundNo) return [];
      return s && seat >= 0 ? Core.sortHand(s.hands[seat], s.trump) : [];
    },

    /* ═══════════ جدولة التدفق ═══════════ */
    _onChange: function () { App.tick(); },
    tick: function () {
      const s = NS.state;
      if (!s || !this._attached) return;
      /* إغلاق مودالات مَنقضية (تقدمت حالة الغرفة) */
      if (this._overlayKind === 'roundEnd' && s.phase !== 'roundEnd') { this.hideOverlay(); this._overlayKind = null; }
      if (this._overlayKind === 'matchEnd' && s.phase !== 'matchEnd') { this.hideOverlay(); this._overlayKind = null; }
      this._renderAll(false);
      if (this._paused) return;

      const seat = s.turn;
      const key = s.phase + '|' + s.turn + '|' + s.roundNo + '|' + s.trick.length;
      const isHuman = this._isHuman(s, seat);

      if (s.phase === 'ashur' || s.phase === 'naming' || s.phase === 'play') {
        if (isHuman) {
          this._schedKey = null;
          const box = this.$('blActions');
          if (s.cfg.mode === 'local' && this._awaitReveal === -1 && this._revealedSeat !== seat) {
            /* تسليم الجهاز للاعب جديد */
            this._awaitReveal = seat;
            this._showHandover(seat);
            if (box) box.classList.remove('show');
            return;
          }
          if (this._awaitReveal >= 0) return;
          if (s.phase === 'ashur') this._showAshurActions(seat);
          else if (s.phase === 'naming') this._showNamingActions(seat);
          else this._showPlayHint(seat);
          return;
        }
        if (s.cfg.mode === 'room') {
          /* مقعد بشري بعيد — جهازه يلعب (السائق يتولى المنقطعين في roomDriverTick) */
          const box = this.$('blActions');
          if (box) box.classList.remove('show');
          return;
        }
        /* بوت (وضع ai) */
        if (this._schedKey !== key) {
          this._schedKey = key;
          this.clearTimers();
          const delay = (s.phase === 'play' ? 620 : 700) + Math.random() * 520;
          this.later(() => {
            if (this._paused) return; /* لا يتحرك البوت أثناء الإيقاف */
            const st = NS.state;
            if (!st || st.phase !== s.phase || st.turn !== seat) return;
            NS.aiAct(seat);
          }, delay);
        }
        return;
      }

      if (s.phase === 'trickEnd') {
        this._onTrickEnd(s);
        if (this._schedKey !== key) {
          this._schedKey = key;
          this.later(() => {
            const st = NS.state;
            if (!st || st.phase !== 'trickEnd') return;
            NS.nextTrickOrRoundEnd();
          }, s.roundOver ? 1500 : 1300);
        }
        return;
      }

      if (s.phase === 'roundEnd') {
        this._schedKey = null;
        this.later(() => this.showRoundEnd(), 650);
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

    /* ── مؤثرات نهاية الأكلة ── */
    _onTrickEnd: function (s) {
      const winner = s.trickWinner;
      const team = winner % 2;
      const raw = s.trick.reduce((sum, p) => sum + Core.pointsOf(p.card, s.trump), 0);
      const pts = raw + 10;
      const zone = this.$('blTrickZone');
      const rc = zone ? zone.getBoundingClientRect() : null;
      const cx = rc ? rc.left + rc.width / 2 : (root.innerWidth || 400) / 2;
      const cy = rc ? rc.top + rc.height / 2 : (root.innerHeight || 700) * 0.42;
      const myTeam = s.cfg.mode === 'local' ? team : (s.cfg.mode === 'room' ? Core.teamOf(this._roomSeat >= 0 ? this._roomSeat : 0) === team : team === 0);
      const floats = this.$('blFloats');

      if (myTeam) {
        const txt = '+' + FMT(pts);
        R.popup(floats, txt, raw >= 14 ? T('blt.lastTrick') : null, 'gold');
        if (raw >= 24) {
          SFX.trickBig();
          R.shake(this.$('blTable'), 14);
          this._fx && this._fx.burst(cx, cy, { count: 54, power: 460, kinds: ['coin', 'coin', 'spark', 'suit'] });
        } else {
          SFX.coin();
          R.shake(this.$('blTable'), 5);
          this._fx && this._fx.burst(cx, cy, { count: 22, power: 320 });
        }
      } else {
        R.popup(floats, '-' + FMT(pts), T('blt.them'), 'red');
        SFX.roundLose();
        this._fx && this._fx.burst(cx, cy, { count: 12, power: 240, color: 'red', kinds: ['spark', 'suit'] });
      }

      /* بلوت أُعلن للتو */
      for (let t = 0; t < 2; t++) {
        if (s.baloot[t] && !this._prevBaloot[t]) {
          R.banner(this.$('blBanner'), '<b>' + T('blt.baloot') + '</b> <span class="bl-bannerpts">+20</span>', 'gold', 2000);
          SFX.ashur();
        }
      }
      this._prevBaloot = s.baloot.slice();

      /* كابوت */
      if (s.tricksWon[team] === 8) {
        R.banner(this.$('blBanner'), '<b>' + T('blt.kabot') + '</b>', 'kabot', 2200);
        SFX.kabot();
        this._fx && this._fx.burst(cx, cy, { count: 90, power: 560, kinds: ['coin', 'coin', 'spark', 'suit'] });
      } else if (s.roundOver) {
        R.banner(this.$('blBanner'), T('blt.lastTrick') + ' <span class="bl-bannerpts">+10</span>', 'gold', 1500);
      }
    },

    /* ═══════════ العرض ═══════════ */
    _renderAll: function (fresh) {
      const s = NS.state;
      if (!s) return;
      this._renderHUD(s);
      this._renderSeats(s);
      this._renderTrick(s);
      this._renderHand(s, fresh);
      this._renderAshurChip(s);
    },

    _renderHUD: function (s) {
      const us = this.$('blScoreUs'), them = this.$('blScoreThem');
      if (us) us.textContent = FMT(s.teamScores[0]);
      if (them) them.textContent = FMT(s.teamScores[1]);
      const subUs = this.$('blSubUs'), subThem = this.$('blSubThem');
      if (subUs) subUs.textContent = FMT(s.teamScores[0]) + '/' + FMT(s.cfg.target);
      if (subThem) subThem.textContent = FMT(s.teamScores[1]) + '/' + FMT(s.cfg.target);
      const rl = this.$('blRoundLbl');
      if (rl) rl.textContent = T('blt.roundOf', { r: s.roundNo });
      const pip = this.$('blTrumpPip'), txt = this.$('blTrumpTxt');
      if (pip && txt) {
        if (s.trump) {
          pip.setAttribute('href', '#bl-pip-' + s.trump);
          txt.textContent = T('blt.trump') + ': ' + T('blt.suit.' + s.trump);
          pip.parentElement.style.color = (s.trump === 'H' || s.trump === 'D') ? 'var(--bl-red)' : 'var(--bl-gold)';
        } else if (s.phase !== 'ashur') {
          txt.textContent = T('blt.sun');
          pip.parentElement.style.color = 'var(--bl-silver)';
        } else {
          txt.textContent = '\u2014';
        }
      }
    },

    _renderSeats: function (s) {
      const mode = s.cfg.mode;
      const seats = { 1: '1', 2: '2', 3: '3' };
      for (const k in seats) {
        const seat = parseInt(k, 10);
        const name = this.$('blName' + k);
        if (name) {
          const fn = this.seatName(seat);
          name.textContent = fn.substring(0, 2).toUpperCase();
        }
        const count = this.$('blCount' + k);
        if (count) count.textContent = s.hands[seat].length;
        const sub = this.$('blSub' + k);
        if (sub) {
          if (mode === 'ai') {
            sub.textContent = seat === 2 ? T('blt.partner') : T('blt.vsBot');
          } else if (mode === 'room') {
            if (this._roomSeat >= 0) sub.textContent = Core.teamOf(seat) === Core.teamOf(this._roomSeat) ? T('blt.us') : T('blt.them');
            else sub.textContent = T('blt.spectator');
          } else {
            sub.textContent = Core.teamOf(seat) === 0 ? T('blt.us') : T('blt.them');
          }
        }
        const badge = this.$('blBadge' + k);
        if (badge) {
          badge.innerHTML = s.dealer === seat ? '<span class="bl-dchip" data-bl-i18n="blt.dealer"></span>' : '';
          root.BLTranslateStatic(badge);
          badge.classList.toggle('active', s.turn === seat && (s.phase === 'play' || s.phase === 'ashur' || s.phase === 'naming') && !this._isHuman(s, seat));
        }
        const plate = this.$('blPlate' + k);
        if (plate) {
          plate.classList.toggle('bl-turn', s.turn === seat && s.phase !== 'trickEnd' && s.phase !== 'roundEnd' && s.phase !== 'matchEnd');
          plate.classList.toggle('bl-team0', Core.teamOf(seat) === 0);
          plate.classList.toggle('bl-team1', Core.teamOf(seat) === 1);
          plate.classList.toggle('bl-off', mode === 'room' && !this._seatPresent(seat));
        }
        const stack = this.$('blStack' + k);
        if (stack) {
          /* سلسلة مقوّسة كاملة بحجم أوراق اللاعب — كل ورقة تحمل --i لتحويلها */
          let html = '';
          const n = Math.min(8, s.hands[seat].length);
          for (let i = 0; i < n; i++) html += R.cardSVG(null, { back: true, style: '--i:' + i });
          stack.innerHTML = html;
          stack.style.setProperty('--n', n);
          stack.style.display = n ? '' : 'none';
          stack.classList.toggle('bl-turn', s.turn === seat);
        }
      }
      const c0 = this.$('blCount0');
      if (c0) {
        const mySeat = this._activeSeat();
        c0.textContent = mySeat >= 0 ? s.hands[mySeat].length : '—';
      }
      const np = this.$('blName0');
      if (np) {
        let fn = '';
        if (mode === 'room') fn = this._roomSeat >= 0 ? this.seatName(this._roomSeat) : T('blt.spectator');
        else if (mode === 'local') fn = this.seatName(this._activeSeat());
        else fn = T('blt.name.0');
        np.textContent = fn.substring(0, 2).toUpperCase();
      }
    },

    _renderTrick: function (s) {
      const zone = this.$('blTrick');
      if (!zone) return;
      const OFF = [
        { x: 2, y: 42, r: -4 },   /* 0 bottom */
        { x: 36, y: 4, r: 8 },    /* 1 right */
        { x: 2, y: -40, r: 4 },   /* 2 top */
        { x: -36, y: -2, r: -8 }  /* 3 left */
      ];
      let html = '';
      for (let i = 0; i < s.trick.length; i++) {
        const p = s.trick[i];
        const o = OFF[p.seat];
        const win = s.phase === 'trickEnd' && s.trickWinner === p.seat;
        html += '<div class="bl-trickcard bl-snap" data-seat="' + p.seat + '" style="' +
          '--tx:' + o.x + '%; --ty:' + o.y + 'px; --tr:' + o.r + 'deg; z-index:' + (10 + i) + '">' +
          R.cardSVG(p.card, { trump: s.trump && p.card.suit === s.trump }) +
          (win ? '<i class="bl-trickwin" aria-hidden="true"></i>' : '') +
          '</div>';
      }
      zone.innerHTML = html;
      if (s.phase === 'trickEnd') zone.classList.add('bl-resolved');
      else zone.classList.remove('bl-resolved');
    },

    _renderHand: function (s, fresh) {
      const handEl = this.$('blHand');
      if (!handEl) return;
      if (this._handHandlers) this._clearHandlers(this._handHandlers);
      this._handHandlers = [];
      const seat = this._activeSeat();
      const showHuman = this._isHuman(s, seat) &&
        (s.phase === 'play' || s.phase === 'naming' || s.phase === 'ashur') &&
        !(s.cfg.mode === 'local' && this._revealedSeat !== seat) &&
        !this._paused;
      if (!showHuman) {
        handEl.innerHTML = '';
        return;
      }
      const hand = this._viewHand();
      const legal = new Set();
      if (s.phase === 'play' && s.turn === seat) {
        for (const c of Core.legalMoves(s.hands[seat], s.trick, s.trump, s.cfg.mustBeat)) legal.add(c.id);
      }
      const n = hand.length;
      let html = '';
      for (let i = 0; i < n; i++) {
        const c = hand[i];
        const dist = i - (n - 1) / 2;
        html += '<div class="bl-handcard' + (fresh ? ' bl-dealin' : '') + '" data-card="' + c.id + '"' +
          ' style="--i:' + i + ';--n:' + n + (fresh ? ';animation-delay:' + (i * 60) + 'ms' : '') + '">' +
          R.cardSVG(c, { trump: s.trump && c.suit === s.trump }) +
          '</div>';
      }
      handEl.innerHTML = html;
      const cards = handEl.querySelectorAll('.bl-handcard');
      for (let i = 0; i < cards.length; i++) {
        const id = cards[i].getAttribute('data-card');
        if (s.phase === 'play' && s.turn === seat) {
          cards[i].classList.add(legal.has(id) ? 'bl-legal' : 'bl-dim');
        }
        const c = hand[i];
        const el = cards[i];
        const fn = () => this._tryPlay(seat, c);
        el.addEventListener('click', fn);
        this._handHandlers.push({ el: el, ev: 'click', fn: fn });
      }
    },

    _renderAshurChip: function (s) {
      const chip = this.$('blAshurChip');
      if (!chip) return;
      const items = [];
      for (let t = 0; t < 2; t++) {
        const a = s.ashurDeclared[t];
        if (a) items.push((t === 0 ? T('blt.us') : T('blt.them')) + ' +' + a.value);
      }
      if (items.length) {
        chip.hidden = false;
        chip.textContent = T('blt.ashurPts') + ': ' + items.join(' · ');
      } else chip.hidden = true;
    },

    /* ═══════════ إجراءات اللاعب ═══════════ */
    _showAshurActions: function (seat) {
      const s = NS.state;
      const opts = Core.detectAshur(s.hands[seat]);
      const box = this.$('blActions');
      let html = '<p class="bl-actions-title"><b>' + T('blt.ashur') + '</b> <span>' + T('blt.ashurQ') + '</span></p><div class="bl-actions-row">';
      for (let i = 0; i < Math.min(3, opts.length); i++) {
        const o = opts[i];
        const label = o.type === 'serial'
          ? T('blt.ashur.serial', { len: o.len, v: o.value }) + ' \u2007' + T('blt.suit.' + o.suit)
          : T('blt.ashur.quad', { r: Core.rankLabel(o.rank), v: o.value });
        html += '<button class="bl-abtn bl-abtn-gold" data-ashur="' + i + '">' + label + '</button>';
      }
      html += '<button class="bl-abtn" data-ashur="none">' + T('blt.ashurNone') + '</button>';
      html += '</div>';
      box.innerHTML = html;
      box.classList.add('show');
      const btns = box.querySelectorAll('.bl-abtn');
      for (let i = 0; i < btns.length; i++) {
        this.on(btns[i], 'click', () => {
          const v = btns[i].getAttribute('data-ashur');
          const combo = v === 'none' ? null : opts[parseInt(v, 10)];
          this._onAshurPick(seat, combo);
        });
      }
    },

    _onAshurPick: function (seat, combo) {
      SFX.click();
      if (combo) {
        SFX.ashur();
        R.banner(this.$('blBanner'), '<b>' + T('blt.declared', { name: this.seatName(seat), combo: (combo.type === 'quad' ? T('blt.ashur.quad', { r: Core.rankLabel(combo.rank), v: combo.value }) : T('blt.ashur.serial', { len: combo.len, v: combo.value })) }) + '</b>', 'gold', 1700);
      }
      NS.declareAshur(seat, combo);
      if (this.roomMode) {
        this._netEmit('ashur', { seat: seat, combo: combo });
        this._afterHumanAct();
      }
    },

    _showNamingActions: function (seat) {
      const s = NS.state;
      const box = this.$('blActions');
      let html = '<p class="bl-actions-title"><b>' + T('blt.naming') + '</b> <span>' + T('blt.namingQ') + '</span></p><div class="bl-actions-row">';
      for (let i = 0; i < 4; i++) {
        const su = Core.SUITS[i];
        html += '<button class="bl-abtn bl-suitpick" data-suit="' + su + '">' +
          '<svg viewBox="0 0 24 24" class="bl-npip" style="color:' + (su === 'H' || su === 'D' ? 'var(--bl-red)' : 'var(--bl-ivory2)') + '"><use href="#bl-pip-' + su + '" width="24" height="24"/></svg>' +
          '<span>' + T('blt.suit.' + su) + '</span></button>';
      }
      html += '<button class="bl-abtn bl-sunpick" data-sun="1">' + T('blt.sun') + '</button>';
      html += '<button class="bl-abtn bl-passpick" data-pass="1">' + T('blt.pass') + '</button>';
      html += '</div>';
      box.innerHTML = html;
      box.classList.add('show');
      const btns = box.querySelectorAll('.bl-abtn');
      for (let i = 0; i < btns.length; i++) {
        this.on(btns[i], 'click', () => {
          const su = btns[i].getAttribute('data-suit');
          if (su) this._humanNaming(seat, { kind: 'suit', suit: su });
          else if (btns[i].getAttribute('data-sun')) this._humanNaming(seat, { kind: 'sun' });
          else this._humanNaming(seat, null);
        });
      }
    },

    _humanNaming: function (seat, choice) {
      SFX.click();
      if (choice) {
        SFX.naming();
        const label = choice.kind === 'sun' ? T('blt.namedSun', { name: this.seatName(seat) })
          : T('blt.named', { name: this.seatName(seat), trump: T('blt.suit.' + choice.suit) });
        R.banner(this.$('blBanner'), '<b>' + label + '</b>', 'gold', 1900);
      } else {
        R.banner(this.$('blBanner'), T('blt.passed', { name: this.seatName(seat) }), '', 1300);
      }
      NS.chooseNaming(seat, choice);
      if (this.roomMode) {
        this._netEmit('name', { seat: seat, choice: choice });
        this._afterHumanAct();
      }
    },

    _showPlayHint: function (seat) {
      const box = this.$('blActions');
      box.innerHTML = '<p class="bl-actions-title bl-hint"><b>' + this.seatName(seat) + '</b> ' + T('blt.yourTurn') + '</p>';
      box.classList.add('show');
    },

    _tryPlay: function (seat, card) {
      const s = NS.state;
      if (!s || s.phase !== 'play' || s.turn !== seat || this._paused) return;
      if (!this._isHuman(s, seat)) return;
      const hand = s.hands[seat];
      if (!Core.isLegal(hand, s.trick, s.trump, card, s.cfg.mustBeat)) {
        SFX.err();
        const led = s.trick.length ? s.trick[0].card.suit : null;
        const hasFollow = hand.some((c) => c.suit === led);
        R.popup(this.$('blFloats'), hasFollow ? T('blt.wrongCard') : T('blt.mustTrump'), '', 'red');
        const el = this.$('blHand').querySelector('[data-card="' + card.id + '"]');
        if (el) {
          el.classList.remove('bl-shakecard');
          void el.offsetWidth;
          el.classList.add('bl-shakecard');
        }
        return;
      }
      SFX.snap();
      const prevBaloot = s.baloot.slice();
      this._prevBaloot = prevBaloot;
      NS.play(seat, card);
      if (this.roomMode) {
        this._netEmit('play', { seat: seat, cardId: card.id });
        this._afterHumanAct();
      }
    },

    _afterHumanAct: function () { this._lastActAt = Date.now(); },

    /* ═══════════ مودالات ═══════════ */
    _showHandover: function (seat) {
      this._overlayKind = 'handover';
      this.showOverlay(
        '<div class="bl-modal bl-handover">' +
          '<p class="bl-oh-title">' + T('blt.handover', { name: this.seatName(seat) }) + '</p>' +
          '<button class="bl-go" id="blRevealBtn">' + T('blt.handoverTap') + '</button>' +
        '</div>'
      );
      const btn = this.$('blRevealBtn');
      if (btn) this.on(btn, 'click', () => {
        SFX.click();
        this._awaitReveal = -1;
        this._revealedSeat = seat;
        this._lastHumanSeat = seat;
        this.hideOverlay();
        this.tick();
      });
    },

    showRoundEnd: function () {
      const s = NS.state;
      if (!s || s.phase !== 'roundEnd' || !s.roundResult) return;
      const r = s.roundResult;
      const row = (label, v0, v1, cut0, cut1) =>
        '<tr><td class="bl-rt-label">' + label + '</td>' +
        '<td class="bl-rt-us">' + (v0 === '' ? '—' : v0) + (cut0 ? ' <i class="bl-cutx">\u2715</i>' : '') + '</td>' +
        '<td class="bl-rt-them">' + (v1 === '' ? '—' : v1) + (cut1 ? ' <i class="bl-cutx">\u2715</i>' : '') + '</td></tr>';
      const local = s.cfg.mode === 'local';
      const usName = local ? this.seatName(0) : T('blt.us');
      const themName = local ? this.seatName(1) : T('blt.them');
      const trumpTxt = s.trump ? T('blt.trump') + ': ' + T('blt.suit.' + s.trump) : T('blt.sun');
      const room = s.cfg.mode === 'room';
      const nextLbl = room ? (this._isDriver ? T('blt.nextRound') : T('blt.voteNext')) : T('blt.continue');
      this._overlayKind = 'roundEnd';
      this.showOverlay(
        '<div class="bl-modal bl-roundmodal">' +
          '<p class="bl-om-eyebrow">' + T('blt.roundEnd') + ' \u00b7 ' + trumpTxt + '</p>' +
          '<h2 class="bl-oh-title">' + T('blt.roundOf', { r: s.roundNo }) + '</h2>' +
          '<table class="bl-rt"><thead><tr><th></th><th>' + usName + '</th><th>' + themName + '</th></tr></thead><tbody>' +
          row(T('blt.tricks'), r.tricksWon[0], r.tricksWon[1]) +
          row(T('blt.cardPts'), r.cardPts[0], r.cardPts[1]) +
          row(T('blt.lastTrickPts'), r.lastTrickTeam === 0 ? '+10' : '', r.lastTrickTeam === 1 ? '+10' : '') +
          row(T('blt.ashurPts'), r.ashur[0] ? '+' + r.ashur[0] : '', r.ashur[1] ? '+' + r.ashur[1] : '', r.ashur.cut[0], r.ashur.cut[1]) +
          row(T('blt.balootPts'), r.baloot[0] ? '+20' : '', r.baloot[1] ? '+20' : '') +
          (r.kabot >= 0 ? row(T('blt.kabotPts', { n: r.kabotBonus }), r.kabot === 0 ? '+' + FMT(r.kabotBonus) : '', r.kabot === 1 ? '+' + FMT(r.kabotBonus) : '') : '') +
          '<tr class="bl-rt-total"><td>' + T('blt.total') + '</td><td>' + FMT(r.total[0]) + '</td><td>' + FMT(r.total[1]) + '</td></tr>' +
          '</tbody></table>' +
          '<p class="bl-om-team">' + T('blt.teamScore') + ': <b class="bl-gold">' + FMT(s.teamScores[0]) + '</b> \u2014 <b>' + FMT(s.teamScores[1]) + '</b> / ' + FMT(s.cfg.target) + '</p>' +
          (r.kabot >= 0 ? '<p class="bl-om-kabot">' + T('blt.kabot') + ' ' + T('blt.wonBy', { name: this.seatName(r.kabot % 2) }) + '</p>' : '') +
          (room && !this._isDriver ? '<p class="bl-om-wait">' + T('blt.waitPlayers') + '</p>' : '') +
          '<button class="bl-go" id="blNextRoundBtn">' + nextLbl + '</button>' +
        '</div>'
      );
      SFX.roundWin();
      const btn = this.$('blNextRoundBtn');
      if (btn) this.on(btn, 'click', () => { SFX.click(); this._onNextRoundClick(s); });
      if (room && this._isDriver) {
        /* احتياط: تقدّم تلقائي بعد 20 ث إن لم يكتمل التصويت (لاعب منقطع) */
        this.later(() => {
          const s2 = NS.state;
          if (s2 && s2.phase === 'roundEnd' && s2.roundNo === roundNo) {
            this.hideOverlay();
            this._roundVotes = {};
            this._netEmit('next', { round: roundNo });
            NS.nextRound();
            this._lastActAt = Date.now();
          }
        }, 20000);
      }
    },

    /* بوابة الجولة التالية: سائق = يقدّم ويبثّ · بعيد = يصوّت */
    _onNextRoundClick: function (s) {
      const roundNo = s.roundNo;
      if (!this.roomMode) {
        this.hideOverlay();
        NS.nextRound();
        return;
      }
      if (this._isDriver) {
        this.hideOverlay();
        this._roundVotes = {};
        this._netEmit('next', { round: roundNo });
        NS.nextRound();
        this._lastActAt = Date.now();
        return;
      }
      const meId = root.blMyUserId ? root.blMyUserId() : null;
      if (meId == null) return;
      if (this._roundVotes[meId]) return;
      this._roundVotes[meId] = true;
      this._netEmit('next', { round: roundNo, vote: 1 });
      return;
      const btn = this.$('blNextRoundBtn');
      if (btn) { btn.disabled = true; btn.textContent = T('blt.waitPlayers'); }
    },

    _settleMatch: function (s) {
      /* الغرف: التسوية مالية خادمياً عبر room:settle (لا شيء محلياً) */
      if (s.cfg.mode === 'room') {
        this._onRoomMatchEnd(s);
        return;
      }
      /* ai/local: تعليمي — بلا رهان ولا تذاكر */
      if (s.matchWinner === 0) SFX.matchWin();
      else SFX.matchLose();
      this._refreshBalUI();
    },

    showMatchEnd: function () {
      const s = NS.state;
      if (!s || s.phase !== 'matchEnd') return;
      const room = s.cfg.mode === 'room';
      const local = s.cfg.mode === 'local';
      const won = s.matchWinner === 0;
      const title = local ? T('blt.matchOver') : (room ? T('blt.matchOver') : (won ? T('blt.matchWin') : T('blt.matchLose')));
      const winnerName = this.seatName(s.matchWinner);
      let html =
        '<div class="bl-modal bl-matchmodal ' + (won && !local && !room ? 'bl-won' : (room ? 'bl-roomended' : '')) + '">' +
        '<p class="bl-om-eyebrow">' + (room || local ? T('blt.matchOver') : title) + '</p>' +
        '<h2 class="bl-oh-title">' + (local || room ? T('blt.wonBy', { name: this.seatName(s.matchWinner) }) : title) + '</h2>' +
        '<div class="bl-m-final"><b>' + FMT(s.teamScores[0]) + '</b><i>\u2014</i><b>' + FMT(s.teamScores[1]) + '</b></div>' +
        (room ? '<div class="bl-m-roomact" id="blRoomMatchActions"></div>' : '') +
        (local || room ? '' :
          '<p class="bl-m-note">' + T('blt.educational') + '</p>') +
        (room ? '' : '<div class="bl-m-btns">' +
        '<button class="bl-go" id="blNewMatchBtn">' + T('blt.newMatch') + '</button>' +
        '<button class="bl-go2" id="blMenuBtn">' + T('blt.backMenu') + '</button>' +
        '</div></div>');
      this._overlayKind = 'matchEnd';
      this.showOverlay(html);
      if (!local && !room) {
        if (won) {
          const cx = (root.innerWidth || 400) / 2, cy = (root.innerHeight || 700) * 0.4;
          this._fx && this._fx.burst(cx, cy, { count: 110, power: 620, kinds: ['coin', 'coin', 'spark', 'suit'] });
          R.shake(this.$('blTable'), 16);
        }
      }
      if (room) this._renderRoomMatchActions();
      const nm = this.$('blNewMatchBtn');
      if (nm) this.on(nm, 'click', () => { SFX.click(); this.startMatch(); });
      const mb = this.$('blMenuBtn');
      if (mb) this.on(mb, 'click', () => { SFX.click(); this.toMenu(); });
    },

    /* ════════════════════════════════════════════════════════════════════
       غرفة الأونلاين (2 ضد 2) — السائق = صاحب الغرفة
       ════════════════════════════════════════════════════════════════════ */
    _roomState: function () {
      return (typeof root.Rooms !== 'undefined' && root.Rooms.state) ? root.Rooms.state : this._room;
    },
    blMyId: function () { return (typeof root.blMyUserId === 'function') ? root.blMyUserId() : null; },
    _seatPresent: function (seat) {
      const pid = (this._roomOrder || [])[seat];
      if (pid == null) return true;
      const rs = this._roomState();
      if (!rs || !rs.players) return false;
      return rs.players.some((p) => String(p.id) === String(pid) && !p.spectate);
    },

    _recomputeRoomIdentity: function () {
      const meId = this.blMyId();
      this._roomSeat = -1;
      this._isSpectator = true;
      const rs = this._roomState();
      this._isDriver = !!(rs && meId != null && String(rs.owner_id) === String(meId));
      if (!rs || !rs.players || meId == null) return;
      const wasSeat = this._roomSeat;
      for (let i = 0; i < rs.players.length; i++) {
        const p = rs.players[i];
        if (String(p.id) === String(meId)) {
          this._isSpectator = !!p.spectate;
          if (!p.spectate) {
            this._roomSeat = i;
            /* ترقية متفرج→لاعب في منتصف جولة: يد مشبوثة حتى التوزيعة القادمة */
            if (wasSeat === -1 && NS.state && NS.state.phase !== 'matchEnd' && NS.state.hands[i].length > 0) {
              this._handDeferRound = NS.state.roundNo;
            }
          }
          break;
        }
      }
    },

    enterRoom: function (room, opts) {
      opts = opts || {};
      if (!room || room.game_id !== 'bl') return;
      const already = this.roomMode && NS.state;
      this._room = room;
      this.roomMode = true;
      this.config.mode = 'room';
      const rc = (root.BL_ROOM_CFG && typeof root.BL_ROOM_CFG === 'object') ? root.BL_ROOM_CFG : {};
      if (rc.target) this.config.target = parseInt(rc.target, 10) || 51;
      this._roomTimer = Math.max(30, Math.min(300, parseInt(rc.timer, 10) || 60));
      this._recomputeRoomIdentity();
      this.showScreen('game');
      this.hideOverlay();
      this._overlayKind = null;

      if (room.status === 'playing' && !NS.state) {
        if (this._isDriver) this._hostInitRoom(room);
        else {
          this._renderRoomWaiting();
          if (opts.live) { try { if (root.Rooms && root.Rooms.requestReplay) root.Rooms.requestReplay(); } catch (e) {} }
        }
      } else if (room.status !== 'playing' && !NS.state) {
        this._renderRoomWaiting();
      }
      /* ريماتش: رجع الحالت إلى playing والوضع ما زال عندنا — السائق يبادر */
      if (already && this._isDriver && room.status === 'playing') {
        this._hostInitRoom(room);
      }
      this._startDriverTick();
      this._startReplayPoll();
      this._refreshBalUI();
    },

    _resumeRoom: function () {
      const rs = this._roomState();
      if (!rs || rs.game_id !== 'bl') { this.exitRoom(); return; }
      this._room = rs;
      this._recomputeRoomIdentity();
      if (rs.status === 'playing' && !NS.state) {
        this._renderRoomWaiting();
        try { if (root.Rooms && root.Rooms.requestReplay) root.Rooms.requestReplay(); } catch (e) {}
      }
      this.showScreen(rs.status === 'playing' ? 'game' : 'menu');
      if (rs.status !== 'playing') this._renderRoomMenu();
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
      this._handDeferRound = -1;
      NS.state = null;
      this._settled = false;
      this._schedKey = null;
      this._overlayKind = null;
      this.hideOverlay();
      this.showScreen('menu');
      this._applyModeUI();
    },

    onRoomRoundEnded: function () {
      if (!this.roomMode) return;
      this.exitRoom();
      this._toast(T('blt.room.ended'), 'info');
    },

    /* السائق: بذرة موحّدة + بناء محلي + بثّ التهيئة */
    _hostInitRoom: function (room) {
      const players = ((room && room.players) || []).filter((p) => !p.spectate).slice(0, 4);
      if (players.length < 4) {
        /* البلوت يشترط 4 لاعبين — الغرفة ما اكتملت (الواجهة تمنع البدء، وهذا احتياط) */
        this._renderRoomWaiting();
        return;
      }
      const order = players.map((p) => String(p.id));
      const names = players.map((p) => String(p.username || p.id).slice(0, 14));
      const seed = ((Date.now() ^ ((Math.random() * 0xFFFFFFFF) >>> 0)) >>> 0) || 1;
      this._buildRoomGame({
        seed: seed,
        target: this.config.target,
        order: order,
        names: names,
        kabotBonus: this.config.kabotBonus
      });
      this._netEmit('init', {
        seed: seed,
        target: this.config.target,
        order: order,
        names: names,
        kabotBonus: this.config.kabotBonus
      });
    },

    /* بناء مباراة الغرفة من التهيئة (نفس البذرة عند الجميع = نفس التوزيع) */
    _buildRoomGame: function (data) {
      if (!data || !data.order || !data.order.length) return;
      const order = data.order.slice(0, 4);
      const names = (data.names && data.names.length === order.length) ? data.names.slice(0, 4) : order.map((id) => 'P' + (order.indexOf(id) + 1));
      this._roomOrder = order;
      this._roomNames = names;
      this._recomputeRoomIdentity();
      NS.newMatch({
        mode: 'room',
        level: 2,
        target: Number(data.target) || 51,
        firstLead: 'left',
        mustBeat: false,
        kabotBonus: Number(data.kabotBonus) || 30,
        seed: Number(data.seed) >>> 0
      });
      NS.state.seatNames = names;
      this._settled = false;
      this._matchSettled = false;
      this._roundVotes = {};
      this._schedKey = null;
      this._overlayKind = null;
      this._handDeferRound = -1;
      this._lastActAt = Date.now();
      this.hideOverlay();
      this.showScreen('game');
      this._renderAll(true);
      this.tick();
    },

    /* بث حركة — تُحفظ في سجل الخادم وتصل للجميع */
    _netEmit: function (action, data) {
      if (!this.roomMode) return false;
      const Rooms = root.Rooms;
      if (!Rooms || typeof Rooms.sendMove !== 'function') return false;
      this._netSeq++;
      const payload = { action: action, data: data || {}, by: this.blMyId(), seq: this._netSeq, ts: Date.now() };
      try { Rooms.sendMove('blmove', payload, { game_id: 'bl', status: 'playing' }); } catch (e) {}
      return true;
    },

    /* استقبال حركة من الغرفة (SSE room:move) — يُتجاهل صدى حركاتي */
    netApplyMove: function (d) {
      if (!d) return;
      if (d.action === 'blmove' && d.data) d = d.data;
      if (!d.action || d.action === 'rmove') return;
      const meId = this.blMyId();
      if (d.by != null && meId != null && String(d.by) === String(meId)) return;
      const data = d.data || {};

      if (d.action === 'init') {
        this._buildRoomGame(data);
        return;
      }
      const s = NS.state;
      if (!s) return;
      try {
        if (d.action === 'ashur') {
          NS.declareAshur(data.seat, data.combo || null);
        } else if (d.action === 'name') {
          NS.chooseNaming(data.seat, data.choice || null);
        } else if (d.action === 'play') {
          if (s.phase === 'play' && s.turn === data.seat) {
            const hand = s.hands[data.seat];
            const card = hand.find((c) => c.id === data.cardId);
            if (card) NS.play(data.seat, card);
          }
        } else if (d.action === 'next') {
          if (s.phase === 'roundEnd') {
            if (data.vote) {
              /* تصويت لاعب بعيد — السائق يقدّم عند اكتمال الأصوات */
              if (this._isDriver && d.by != null) {
                this._roundVotes[String(d.by)] = true;
                const need = (this._roomOrder || []).length;
                const got = Object.keys(this._roundVotes).filter((k) => k !== String(meId)).length + 1;
                if (got >= need) {
                  this.hideOverlay();
                  this._roundVotes = {};
                  NS.nextRound();
                  this._lastActAt = Date.now();
                }
              }
            } else if (!this._isDriver) {
              /* تقدّم السائق — نتقدم معه */
              this.hideOverlay();
              NS.nextRound();
            }
          }
        }
      } catch (e) { if (root.console) console.warn('[Baloot MP] apply', e && e.message); }
      this._lastActAt = Date.now();
    },

    /* تحديث حالة الغرفة (room:update) — هوية/ترقية متفرج */
    roomUpdate: function (room) {
      if (!this.roomMode) return;
      this._room = room || this._room;
      this._recomputeRoomIdentity();
      if (this._roomSeat >= 0 && NS.state && NS.state.phase !== 'matchEnd') {
        /* ترقية متفرج→لاعب: يد مشبوثة حتى التوزيعة القادمة */
        if (NS.state.hands[this._roomSeat] && NS.state.hands[this._roomSeat].length > 0 && this._handDeferRound === -1) {
          this._handDeferRound = NS.state.roundNo;
        }
      }
      if (this._room && this._room.status !== 'playing' && !NS.state) this._renderRoomWaiting();
    },

    /* قيادة المنقطعين/المتوقفين (السائق فقط) — بذلة آلي تُبثّ للبقية */
    /* مراقبة سجل الحركات المعلق (room:replay يصل والبث الحي قد لا يحوله لنا) */
    _startReplayPoll: function () {
      this._stopReplayPoll();
      const Rooms = root.Rooms;
      if (!Rooms || typeof Rooms.hasPendingReplay !== 'function') return;
      this._replayPollT = setInterval(() => {
        try {
          if (!this.roomMode || !Rooms.hasPendingReplay()) return;
          const rs = this._roomState();
          if (!rs || rs.game_id !== 'bl') return;
          const rp = Rooms.consumePendingReplay();
          if (rp && rp.history && rp.history.length) this.applyReplay(rp.history);
        } catch (e) {}
      }, 700);
    },
    _stopReplayPoll: function () { if (this._replayPollT) { clearInterval(this._replayPollT); this._replayPollT = null; } },

    _startDriverTick: function () {
      this._stopDriverTick();
      if (!this._isDriver) return;
      this._driverT = setInterval(() => { try { this.roomDriverTick(); } catch (e) {} }, 1000);
    },
    _stopDriverTick: function () { if (this._driverT) { clearInterval(this._driverT); this._driverT = null; } },
    roomDriverTick: function () {
      if (!this.roomMode || !this._isDriver) return;
      const s = NS.state;
      if (!s) return;
      if (s.phase !== 'ashur' && s.phase !== 'naming' && s.phase !== 'play') return;
      const seat = s.turn;
      const pid = (this._roomOrder || [])[seat];
      const present = this._seatPresent(seat);
      const grace = (this._roomTimer || 60) * 1000;
      const stalled = Date.now() - (this._lastActAt || Date.now()) > grace;
      if (present && !stalled) return;
      if (this._aiNext && Date.now() - this._aiNext < 1500) return;
      this._aiNext = Date.now();
      const plan = NS.aiPlan(seat);
      if (!plan) return;
      try {
        if (plan.type === 'ashur') { NS.declareAshur(seat, plan.combo); this._netEmit('ashur', { seat: seat, combo: plan.combo }); }
        else if (plan.type === 'name') { NS.chooseNaming(seat, plan.choice); this._netEmit('name', { seat: seat, choice: plan.choice }); }
        else if (plan.type === 'play') { NS.play(seat, plan.card); this._netEmit('play', { seat: seat, cardId: plan.card.id }); }
      } catch (e) { if (root.console) console.warn('[Baloot MP] driver', e && e.message); }
      this._lastActAt = Date.now();
    },

    /* إعادة البناء من سجل الخادم (room:replay — عودة/متفرج جديد) */
    applyReplay: function (history) {
      if (!history || !history.length) return;
      const rs = this._roomState();
      if (rs && rs.game_id !== 'bl') return;
      this.roomMode = true;
      this.config.mode = 'room';
      this._recomputeRoomIdentity();
      this.showScreen('game');
      let built = false;
      for (let i = 0; i < history.length; i++) {
        const m = history[i];
        if (!m) continue;
        let action = m.action, data = m.data || {};
        if (action === 'blmove' && m.data && m.data.action) { action = m.data.action; data = m.data.data || {}; }
        if (action === 'init') { this._buildRoomGame(data); built = true; }
        else if (!built) continue;
        else if (action === 'ashur') { try { NS.declareAshur(data.seat, data.combo || null); } catch (e) {} }
        else if (action === 'name') { try { NS.chooseNaming(data.seat, data.choice || null); } catch (e) {} }
        else if (action === 'play') {
          try {
            const s = NS.state;
            if (s && s.phase === 'play' && s.turn === data.seat) {
              const c = s.hands[data.seat].find((x) => x.id === data.cardId);
              if (c) NS.play(data.seat, c);
            }
          } catch (e) {}
        } else if (action === 'next') { try { if (NS.state && NS.state.phase === 'roundEnd') NS.nextRound(); } catch (e) {} }
      }
      this._renderAll(true);
      this.tick();
    },

    /* نهاية مباراة الغرفة: تسوية الفرق (سائق) + دعوة ريماتش */
    _onRoomMatchEnd: function (s) {
      if (this._matchSettled) return;
      this._matchSettled = true;
      this.later(() => {
        try {
          const rs = this._roomState();
          if (!rs) return;
          const meId = this.blMyId();
          if (meId == null) return;
          let entry = null;
          for (let i = 0; i < (rs.players || []).length; i++) {
            if (String(rs.players[i].id) === String(meId)) { entry = rs.players[i]; break; }
          }
          if (!entry || entry.spectate) return;
          const bet = Number(rs.bet) || 0;
          const isHost = String(rs.owner_id) === String(meId);
          if (bet > 0 && !rs.settled && isHost && typeof root.Rooms.settleTeam === 'function') {
            try { root.Rooms.settleTeam(s.matchWinner === 0 ? 't0' : 't1'); } catch (e) {}
          }
          this.later(() => { try { if (typeof root.Rooms.startRematch === 'function') root.Rooms.startRematch(); } catch (e) {} }, 900);
        } catch (e) {}
      }, 600);
    },

    /* أزرار نهاية المباراة داخل الغرفة (ريماش/تصويت/غرفة) */
    _renderRoomMatchActions: function () {
      const box = this.$('blRoomMatchActions');
      if (!box) return;
      const rs = this._roomState();
      const meId = this.blMyId();
      let entry = null;
      if (rs && rs.players) for (let i = 0; i < rs.players.length; i++) {
        if (meId != null && String(rs.players[i].id) === String(meId)) { entry = rs.players[i]; break; }
      }
      const isPlayer = !!(entry && !entry.spectate);
      const rem = (rs && rs.rematch) || null;
      let html = '';

      if (rem && rem.resolved) {
        if (rem.rematch) html = '<p class="bl-om-wait">' + T('blt.room.restarting') + '</p>';
        else {
          html = '<p class="bl-om-wait">' + T('blt.room.noRematch') + '</p>' +
            '<div class="bl-m-btns">' +
            '<button class="bl-go2" id="blRM_Lobby">' + T('blt.room.open') + '</button>' +
            '<button class="bl-go2" id="blRM_Menu">' + T('blt.backMenu') + '</button>' +
            '</div>';
        }
      } else if (rem && !rem.resolved) {
        const votes = rem.votes || {};
        const voted = meId != null && !!votes[meId];
        html = '<p class="bl-om-wait">' + T('blt.room.rematchQ') + '</p>';
        if (isPlayer) {
          if (voted) html += '<p class="bl-om-wait">' + T('blt.room.voted') + '</p>';
          else html += '<div class="bl-m-btns">' +
            '<button class="bl-go" id="blRM_Agree">' + T('blt.room.rematchYes') + '</button>' +
            '<button class="bl-go2" id="blRM_Refuse">' + T('blt.room.rematchNo') + '</button>' +
            '</div>';
        } else {
          html += '<p class="bl-om-wait">' + T('blt.room.waitVotes') + '</p>';
        }
      } else {
        if (isPlayer && (!rs || rs.status !== 'playing')) {
          html += '<div class="bl-m-btns"><button class="bl-go" id="blRM_New">' + T('blt.room.newMatch') + '</button></div>';
        }
        html += '<div class="bl-m-btns">' +
          '<button class="bl-go2" id="blRM_Lobby">' + T('blt.room.open') + '</button>' +
          '<button class="bl-go2" id="blRM_Menu">' + T('blt.backMenu') + '</button>' +
          '</div>';
      }
      box.innerHTML = html;
      const wire = (id, fn) => { const el = this.$(id); if (el) this.on(el, 'click', fn); };
      wire('blRM_Agree', () => { SFX.click(); try { root.Rooms.voteRematch('agree'); } catch (e) {} });
      wire('blRM_Refuse', () => { SFX.click(); try { root.Rooms.voteRematch('refuse'); } catch (e) {} });
      wire('blRM_New', () => { SFX.click(); try { root.Rooms.startRematch(); } catch (e) {} });
      wire('blRM_Lobby', () => { SFX.click(); this.hideOverlay(); try { root.Rooms.openModal(); } catch (e) {} });
      wire('blRM_Menu', () => { SFX.click(); this.toMenu(); });
    },

    /* شاشة الانتظار داخل الغرفة (قبل البدء) */
    _renderRoomWaiting: function () {
      this.showScreen('game');
      const rs = this._roomState();
      const players = ((rs && rs.players) || []).filter((p) => !p.spectate).slice(0, 4);
      const names = ['\u2026', '\u2026', '\u2026', '\u2026'];
      for (let i = 0; i < players.length; i++) names[i] = String(players[i].username || '').slice(0, 14);
      for (let k = 0; k < 4; k++) {
        const n = this.$('blName' + k);
        if (n) n.textContent = names[k];
        const c = this.$('blCount' + k);
        if (c) c.textContent = k === 0 && this._roomSeat >= 0 ? '—' : '8';
        const sub = this.$('blSub' + k);
        if (sub) sub.textContent = k % 2 === (this._roomSeat >= 0 ? this._roomSeat % 2 : 0) ? T('blt.us') : T('blt.them');
        const st = this.$('blStack' + k);
        if (st) st.innerHTML = '';
      }
      const np = this.$('blName0');
      if (np) np.textContent = this._roomSeat >= 0 ? (names[this._roomSeat] || T('blt.name.0')) : T('blt.spectator');
      const msg = this._isDriver ? T('blt.room.waitStartHost') : T('blt.room.waitStart');
      R.banner(this.$('blBanner'), '<b>' + msg + '</b>', 'gold', 8000);
    },

    /* القائمة في وضع الغرفة (بدل أزرار البداية) */
    _renderRoomMenu: function () {
      const box = this.$('blRoomMenu');
      if (!box) return;
      if (!this.roomMode || !this._room) { box.innerHTML = ''; box.style.display = 'none'; return; }
      const rs = this._room;
      box.style.display = '';
      box.innerHTML =
        '<div class="bl-roommenu">' +
        '<p class="bl-om-eyebrow">' + T('blt.room.title') + '</p>' +
        '<h2 class="bl-oh-title" dir="ltr">' + (rs.code || '') + '</h2>' +
        '<p class="bl-rm-players">' + T('blt.room.players') + ': <b>' + (rs.players ? rs.players.filter((p) => !p.spectate).length : 0) + '/4</b></p>' +
        (Number(rs.bet) > 0 ? '<p class="bl-rm-bet">' + T('blt.room.bet') + ': <b class="bl-gold">' + FMT(rs.bet) + ' \U0001FA99</b></p>' : '') +
        '<div class="bl-m-btns col">' +
        '<button class="bl-go" id="blRM_Game">' + T('blt.room.backGame') + '</button>' +
        '<button class="bl-go2" id="blRM_Lobby2">' + T('blt.room.open') + '</button>' +
        '</div>' +
        '</div>';
      const g = this.$('blRM_Game');
      if (g) this.on(g, 'click', () => {
        SFX.click();
        this.showScreen('game');
        if (NS.state) this.tick();
        else this._renderRoomWaiting();
      });
      const l = this.$('blRM_Lobby2');
      if (l) this.on(l, 'click', () => { SFX.click(); try { root.Rooms.openModal(); } catch (e) {} });
    },

    showOverlay: function (html) {
      const o = this.$('blOverlay');
      if (!o) return;
      o.innerHTML = html;
      o.classList.add('show');
    },
    hideOverlay: function () {
      const o = this.$('blOverlay');
      if (o) { o.innerHTML = ''; o.classList.remove('show'); }
      const box = this.$('blActions');
      if (box) { box.classList.remove('show'); box.innerHTML = ''; }
    },
    _refreshBalUI: function () {
      const v = this.$('blBalVal');
      if (v) v.textContent = FMT(this.walletBalance());
    }
  };

  root.BalootApp = App;
})(typeof window !== 'undefined' ? window : globalThis);

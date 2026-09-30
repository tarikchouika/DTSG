/**
 * ============================================================================
 *  RondaApp — المتحكم الرئيسي للعبة (ربط المحرك بالواجهة)
 * ============================================================================
 *  المبدأ المعماري: الواجهة ترسل أوامر (playCard) فقط، وتعرض الأحداث (Events)
 *  القادمة من المحرك. لا تقرير في الواجهة ولا معلومات خفية تُعرض.
 * ============================================================================
 */
(function () {
  'use strict';

  const RC = window.RondaCore;
  const R = window.RondaRenderer;
  const I18N = window.RondaI18N;
  const SFX = window.RondaAudio;

  /* ============================ حالة التطبيق ============================ */

  const App = {
    config: { mode: 'ai', target: 51, sound: true, privacy: true },
    game: null,
    aiPlayers: [],
    humanPlayers: [],
    currentViewerId: 0,
    busy: false,           // قفل خلال الأنيميشن
    speed: 1,              // مضاعف سرعة الأنيميشن (1 = عادي)
    lastRoundLogged: 0,

    /* ============================ التهيئة ============================ */

    init: function () {
      this.loadPrefs();
      this.bindMenu();
      this.bindGameControls();
      this.renderRules();
      this.showScreen('menu');
    },

    loadPrefs: function () {
      try {
        const saved = JSON.parse(localStorage.getItem('ronda.prefs') || '{}');
        if (saved.mode) this.config.mode = saved.mode;
        if (saved.target) this.config.target = saved.target;
        if (typeof saved.sound === 'boolean') this.config.sound = saved.sound;
        if (typeof saved.privacy === 'boolean') this.config.privacy = saved.privacy;
      } catch (e) { /* تجاهل */ }
      this.syncMenuUI();
    },

    savePrefs: function () {
      try { localStorage.setItem('ronda.prefs', JSON.stringify(this.config)); } catch (e) { /* تجاهل */ }
    },

    syncMenuUI: function () {
      document.querySelectorAll('#mode-options .mode-btn').forEach(function (b) {
        b.classList.toggle('selected', b.dataset.mode === App.config.mode);
      });
      document.querySelectorAll('#target-options .target-pill').forEach(function (b) {
        b.classList.toggle('selected', Number(b.dataset.target) === App.config.target);
      });
      const tSound = document.getElementById('toggle-sound');
      const tPriv = document.getElementById('toggle-privacy');
      tSound.classList.toggle('selected', App.config.sound);
      tSound.setAttribute('aria-checked', String(App.config.sound));
      tPriv.classList.toggle('selected', App.config.privacy);
      tPriv.setAttribute('aria-checked', String(App.config.privacy));
      this.syncSoundIcon();
    },

    syncSoundIcon: function () {
      document.getElementById('icon-sound-on').classList.toggle('hidden', !App.config.sound);
      document.getElementById('icon-sound-off').classList.toggle('hidden', App.config.sound);
    },

    bindMenu: function () {
      document.querySelectorAll('#mode-options .mode-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          App.config.mode = b.dataset.mode;
          SFX.click();
          App.syncMenuUI();
        });
      });
      document.querySelectorAll('#target-options .target-pill').forEach(function (b) {
        b.addEventListener('click', function () {
          App.config.target = Number(b.dataset.target);
          SFX.click();
          App.syncMenuUI();
        });
      });
      document.getElementById('toggle-sound').addEventListener('click', function () {
        App.config.sound = !App.config.sound;
        SFX.setMuted(!App.config.sound);
        SFX.click();
        App.savePrefs();
        App.syncMenuUI();
      });
      document.getElementById('toggle-privacy').addEventListener('click', function () {
        App.config.privacy = !App.config.privacy;
        SFX.click();
        App.savePrefs();
        App.syncMenuUI();
      });
      document.getElementById('btn-start').addEventListener('click', function () {
        SFX.resume(); SFX.click();
        App.startMatch();
      });
      document.getElementById('btn-rules').addEventListener('click', function () {
        SFX.click();
        document.getElementById('overlay-rules').classList.remove('hidden');
      });
      document.getElementById('btn-rules-close').addEventListener('click', function () {
        SFX.click();
        document.getElementById('overlay-rules').classList.add('hidden');
      });
      document.getElementById('overlay-rules').addEventListener('click', function (e) {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
      });
    },

    bindGameControls: function () {
      document.getElementById('btn-home').addEventListener('click', function () {
        SFX.click();
        if (confirm('هل تريد العودة للقائمة الرئيسية؟ ستُفقد المباراة الحالية.')) {
          App.backToMenu();
        }
      });
      document.getElementById('btn-sound').addEventListener('click', function () {
        App.config.sound = !App.config.sound;
        SFX.setMuted(!App.config.sound);
        App.savePrefs();
        App.syncSoundIcon();
      });
      document.getElementById('btn-reveal').addEventListener('click', function () {
        SFX.click();
        App._privacyGate = false;
        document.getElementById('overlay-privacy').classList.add('hidden');
        App.refreshView({ animateDeal: false });
      });
      document.getElementById('btn-next-round').addEventListener('click', function () {
        SFX.click();
        document.getElementById('overlay-round').classList.add('hidden');
        Pipeline.resume();
      });
      document.getElementById('btn-new-match').addEventListener('click', function () {
        SFX.click();
        document.getElementById('overlay-match').classList.add('hidden');
        App.startMatch();
      });
      document.getElementById('btn-back-menu').addEventListener('click', function () {
        SFX.click();
        document.getElementById('overlay-match').classList.add('hidden');
        App.backToMenu();
      });
      document.querySelector('.log-title').addEventListener('click', function () {
        document.getElementById('log-panel').classList.toggle('open');
      });
    },

    renderRules: function () {
      document.getElementById('rules-body').innerHTML = I18N.rules;
    },

    showScreen: function (name) {
      document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
      document.getElementById(name === 'menu' ? 'screen-menu' : 'screen-game').classList.add('active');
    },

    /* ============================ بدء مباراة ============================ */

    startMatch: function () {
      const cfg = this.config;
      const names = I18N.defaultNames[cfg.mode].slice();
      const gameMode = cfg.mode === '4p' ? RC.GameMode.TEAM_VS_TEAM : RC.GameMode.HEAD_TO_HEAD;
      const rules = new RC.RondaRulesConfig({ targetScore: cfg.target });

      this.game = new RC.RondaGame({ mode: gameMode, names: names, rules: rules });
      this.aiPlayers = cfg.mode === 'ai' ? [1] : [];
      this.humanPlayers = cfg.mode === 'ai' ? [0] : names.map(function (_, i) { return i; });
      this.currentViewerId = 0;
      this.busy = false;
      this.lastRoundLogged = 0;

      document.getElementById('log-list').innerHTML = '';
      document.getElementById('hud-target').textContent = cfg.target;

      Pipeline.reset();
      this.game.onEvent(function (ev) { Pipeline.push(ev); });

      this.game.start(); // الأحداث تُدرج في الطابور عبر المستمع أعلاه
      Pipeline._pump();

      this.showScreen('game');
    },

    backToMenu: function () {
      Pipeline.reset();
      this.game = null;
      document.getElementById('overlay-privacy').classList.add('hidden');
      document.getElementById('overlay-round').classList.add('hidden');
      document.getElementById('overlay-match').classList.add('hidden');
      this.showScreen('menu');
    },

    /* ============================ عرض اللقطة الحالية ============================ */

    refreshView: function (opts) {
      if (!this.game) return;
      const o = opts || {};
      const view = this.game.getView(this.currentViewerId);
      const ropts = {
        viewerId: this.currentViewerId,
        aiMode: this.config.mode === 'ai',
        interactive: !this.busy,
        animateDeal: o.animateDeal,
        showHints: true,
        hideHand: !!this._privacyGate, // لا ترسم الأوراق خلف شاشة الخصوصية
        onPlay: function (cardId) { App.humanPlay(cardId); }
      };
      R.renderScoreStrip(view, { aiMode: this.config.mode === 'ai' });
      R.renderOpponents(view, { viewerId: this.currentViewerId });
      R.renderTable(view, { animateNew: o.animateNew });
      R.renderHand(view, ropts);
      document.getElementById('hud-round').textContent = view.roundNumber;
      document.getElementById('hud-deal').textContent = view.dealNumber;
      return view;
    },

    /* ============================ حركات اللاعبين ============================ */

    humanPlay: function (cardId) {
      if (this.busy) return;
      if (!this.game) return;
      const view = this.game.getView(this.currentViewerId);
      if (view.currentPlayerId !== this.currentViewerId) return;
      if (view.phase !== 'Playing') return;
      this.busy = true;
      this.refreshView({}); // إغلاق التفاعل
      try {
        this.game.playCard(this.currentViewerId, cardId);
      } catch (e) {
        console.error(e);
        this.busy = false;
      }
    },

    aiPlay: function () {
      if (!this.game) return;
      const view = this.game.getView(this.aiPlayers[0]);
      if (view.phase !== 'Playing') return;
      if (view.currentPlayerId !== this.aiPlayers[0]) return;
      const cardId = RC.RondaAI.chooseCard(this.game, this.aiPlayers[0]);
      if (cardId === null) return;
      try {
        this.game.playCard(this.aiPlayers[0], cardId);
      } catch (e) { console.error(e); }
    },

    /* ============================ مساعدة ============================ */

    playerName: function (id) {
      if (!this.game) return String(id);
      const p = this.game.state.getPlayer(id);
      return p ? p.name : String(id);
    },

    teamChipRect: function (teamId) {
      const chip = document.querySelector('.team-chip.team-' + teamId);
      return chip ? chip.getBoundingClientRect() : { left: innerWidth / 2 - 40, top: 60, width: 80, height: 60 };
    },

    oppSeatRect: function (playerId) {
      const seat = document.querySelector('.opp-seat[data-player-id="' + playerId + '"]');
      return seat ? seat.getBoundingClientRect() : { left: innerWidth / 2 - 40, top: 90, width: 80, height: 50 };
    },

    handCardRect: function (cardId) {
      const cardEl = document.querySelector('#hand .card[data-card-id="' + cardId + '"]');
      return cardEl ? cardEl.getBoundingClientRect() : null;
    },

    tableCenterRect: function () {
      const felt = document.getElementById('felt');
      const r = felt.getBoundingClientRect();
      return {
        left: r.left + r.width / 2 - R.rectCenter({ left: 0, top: 0, width: 74, height: 110 }).left,
        top: r.top + r.height / 2 - 55,
        width: 74, height: 110
      };
    }
  };

  /* ============================ خط معالجة الأحداث ============================ */

  const sleep = function (ms) {
    const factor = (window.RondaApp && window.RondaApp.speed) ? window.RondaApp.speed : 1;
    return new Promise(function (res) { setTimeout(res, ms * factor); });
  };

  const Pipeline = {
    queue: [],
    processing: false,
    paused: false,

    reset: function () {
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
      try {
        while (this.queue.length > 0 && !this.paused) {
          const ev = this.queue.shift();
          await this.handle(ev);
        }
      } catch (e) {
        console.error('pipeline error', e);
      }
      this.processing = false;
      if (!this.paused) this.onDrained();
    },

    onDrained: function () {
      App.busy = false;
      App.refreshView({});
      // دور الذكاء الاصطناعي
      if (App.game && App.aiPlayers.length > 0) {
        const view = App.game.getView(App.aiPlayers[0]);
        if (view.phase === 'Playing' && view.currentPlayerId === App.aiPlayers[0]) {
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
          R.addLog(I18N.log.gameStart.replace('{target}', ev.targetScore));
          break;
        }

        case 'FirstDealerDrawn': {
          /* [FirstDealer] قرعة الموزع الأول — أصغر ورقة توزع (واجهة ronda-game المنفصلة) */
          if (App.game && ev.dealerSeat != null) {
            const dealer = App.game.state.getPlayerBySeat(ev.dealerSeat);
            const nm = dealer ? App.playerName(dealer.id) : '?';
            const cardsTxt = (ev.cards || []).map(function (c) {
              const p = App.game ? App.game.state.getPlayerBySeat(c.seat) : null;
              return (p ? App.playerName(p.id) : ('seat ' + c.seat)) + ': ' + c.rank + ' ' + c.suit;
            }).join(' · ');
            R.addLog('🎲 قرعة الموزع الأول — أصغر ورقة توزع: ' + nm + ' 👑');
            R.addLog('🃏 ' + cardsTxt);
          }
          break;
        }

        case 'CardsDealt': {
          if (ev.isRedeal) {
            R.showBanner(I18N.banners.redeal, '', 'b-declare', 1.1);
            R.addLog(I18N.log.deal.replace('{n}', ev.dealNumber).replace('{n2}', '3'), '');
            SFX.deal();
            await sleep(500);
          } else if (App.game && App.game.state.roundNumber !== App.lastRoundLogged) {
            App.lastRoundLogged = App.game.state.roundNumber;
            const dealerName = App.playerName(App.game.state.getPlayerBySeat(App.game.state.dealerSeat).id);
            R.addLog(I18N.log.roundStart.replace('{n}', App.game.state.roundNumber).replace('{name}', dealerName));
          }
          // تحديث دور العارض حسب الدور الحالي (للعب الساخن)
          App.currentViewerId = App.game.getView(App.currentViewerId).currentPlayerId ?? App.currentViewerId;
          break;
        }

        case 'DeclarationsResolved': {
          if (!ev.declarations || ev.declarations.length === 0) break;
          for (const d of ev.declarations) {
            const name = App.playerName(d.playerId);
            const isBig = d.type === 'Trenda' || d.type === 'Quadra';
            const typeName = isBig ? I18N.banners.trenda : I18N.banners.ronda;
            R.showBanner(typeName, d.rank + ' — ' + name, 'b-declare', 1.25);
            R.addLog(I18N.log.declare
              .replace('{name}', name)
              .replace('{type}', typeName)
              .replace('{rank}', d.rank), 'log-declare');
            SFX.declare(isBig);
            await sleep(850);
          }
          if (ev.winnerTeamId !== null && ev.awardedPoints > 0) {
            const winnerName = App.playerName(ev.winnerPlayerId);
            R.showBanner(
              winnerName,
              'يفوز بالإعلانات +' + ev.awardedPoints,
              'b-declare', 1.4
            );
            R.addLog(I18N.log.declareWin
              .replace('{name}', winnerName)
              .replace('{pts}', ev.awardedPoints), 'log-declare');
            SFX.declare(ev.awardedPoints > 3);
            App.refreshView({});
            await sleep(900);
          }
          break;
        }

        case 'CardPlayed': {
          const view = App.game.getView(App.currentViewerId);
          const isViewerCard = ev.playerId === App.currentViewerId;
          SFX.flip();
          // حذف الورقة من اليد فوراً للعارض
          if (isViewerCard) App.refreshView({});
          // ورقة طائرة من مقعد اللاعب نحو الطاولة
          let fromRect = null;
          if (isViewerCard) {
            fromRect = App.handCardRect(ev.cardId);
          } else {
            fromRect = App.oppSeatRect(ev.playerId);
          }
          if (!fromRect) fromRect = App.tableCenterRect();
          const toRect = App.tableCenterRect();
          R.flyCard(fromRect, toRect, ev.card, { duration: 300, toRotate: (((ev.cardId * 53) % 9) - 4) });
          await sleep(310);
          App.refreshView({ animateNew: true });
          await sleep(140);
          break;
        }

        case 'CardsCaptured': {
          const view = App.game.getView(App.currentViewerId);
          const capturerName = App.playerName(ev.playerId);
          const isViewer = ev.playerId === App.currentViewerId;
          R.addLog(I18N.log.captured.replace('{name}', capturerName).replace('{n}', ev.cards.length));
          // سلسلة الالتقاط
          const ranks = [];
          for (const c of ev.cards) { if (!ranks.includes(c.rank)) ranks.push(c.rank); }
          if (ranks.length > 1) {
            R.addLog(I18N.log.captureChain.replace('{chain}', ranks.join(' → ')));
          }
          await sleep(180);
          // طيران الأوراق الملتقطة من الطاولة نحو كيس اللاعب
          const toRect = isViewer
            ? App.teamChipRect(view.players.find(function (p) { return p.id === ev.playerId; }).teamId)
            : App.oppSeatRect(ev.playerId);
          document.querySelectorAll('#table-cards .card').forEach(function (cardEl) {
            const id = Number(cardEl.dataset.cardId);
            if (ev.cardIds.includes(id)) {
              cardEl.classList.add('capturing');
            }
          });
          SFX.capture(ev.cards.length);
          await sleep(320);
          const fromRects = [];
          document.querySelectorAll('#table-cards .card').forEach(function (cardEl) {
            const id = Number(cardEl.dataset.cardId);
            if (ev.cardIds.includes(id)) fromRects.push(cardEl.getBoundingClientRect());
          });
          App.refreshView({}); // الطاولة بعد الالتقاط
          fromRects.forEach(function (fr, i) {
            R.flyCard(fr, toRect, ev.cards[i] || ev.cards[0], { duration: 420, fadeOut: true });
          });
          await sleep(300);
          break;
        }

        case 'Strike': {
          const name = App.playerName(ev.playerId);
          R.showBanner(I18N.banners.strike, name + ' +' + ev.points, 'b-strike', 1.2);
          R.addLog(I18N.log.strike.replace('{name}', name), 'log-strike');
          SFX.strike();
          App.refreshView({});
          await sleep(700);
          break;
        }

        case 'Rope': {
          const name = App.playerName(ev.playerId);
          R.showBanner(I18N.banners.rope, name + ' +' + ev.points, 'b-rope', 1.35);
          R.addLog(I18N.log.rope.replace('{name}', name), 'log-rope');
          SFX.rope();
          App.refreshView({});
          await sleep(850);
          break;
        }

        case 'DoubleRope': {
          const name = App.playerName(ev.playerId);
          R.showBanner(I18N.banners.doubleRope, name + ' +' + ev.points, 'b-double', 1.7);
          R.addLog(I18N.log.doubleRope.replace('{name}', name), 'log-double');
          SFX.doubleRope();
          App.refreshView({});
          await sleep(1100);
          break;
        }

        case 'Mesa': {
          const name = App.playerName(ev.playerId);
          R.showBanner(I18N.banners.mesa, name + ' +' + ev.points, 'b-mesa', 1.3);
          R.addLog(I18N.log.mesa.replace('{name}', name), 'log-mesa');
          SFX.mesa();
          App.refreshView({});
          await sleep(750);
          break;
        }

        case 'Qa3aRey': {
          const name = App.playerName(ev.playerId);
          R.showBanner(I18N.banners.qa3aRey, name + ' +' + ev.points, 'b-qa3a', 1.5);
          R.addLog(I18N.log.qa3aRey.replace('{name}', name), 'log-qa3a');
          SFX.qa3a();
          App.refreshView({});
          await sleep(900);
          break;
        }

        case 'Qa3aAs': {
          const teamName = App.game.state.getTeam(ev.teamId).name;
          R.showBanner(I18N.banners.qa3aAs, teamName + ' +' + ev.points, 'b-qa3a', 1.5);
          R.addLog(I18N.log.qa3aAs.replace('{name}', teamName), 'log-qa3a');
          SFX.qa3a();
          App.refreshView({});
          await sleep(900);
          break;
        }

        case 'ScoreChanged': {
          App.refreshView({});
          await sleep(120);
          break;
        }

        case 'FinalCardsAwarded': {
          const name = App.playerName(ev.playerId);
          R.addLog(I18N.log.finalCards.replace('{n}', ev.cards.length).replace('{name}', name));
          await sleep(250);
          break;
        }

        case 'TurnChanged': {
          const view = App.game.getView(App.currentViewerId);
          // تبديل العارض في وضع اللاعبين المتعددين
          if (App.config.mode !== 'ai' && App.humanPlayers.includes(ev.playerId)) {
            App.currentViewerId = ev.playerId;
          }
          const v2 = App.game.getView(App.currentViewerId);
          // حماية الخصوصية: تُمنع رسم اليد قبل الكشف
          const needPrivacy = App.config.privacy && App.config.mode !== 'ai' &&
              v2.phase === 'Playing' && App.humanPlayers.includes(v2.currentPlayerId);
          App._privacyGate = needPrivacy;
          App.refreshView({});
          if (needPrivacy) {
            document.getElementById('privacy-player-name').textContent =
              App.playerName(v2.currentPlayerId);
            document.getElementById('overlay-privacy').classList.remove('hidden');
          }
          await sleep(150);
          break;
        }

        case 'RoundEnded': {
          R.addLog(I18N.log.roundEnd.replace('{n}', ev.roundNumber));
          SFX.mesa();
          App.refreshView({});
          R.renderBreakdown('round-breakdown', ev.breakdown, I18N.breakdown);
          document.getElementById('round-modal-title').textContent =
            I18N.banners.roundOver + ' — ' + I18N.log.cardsScore
              .replace('{a}', ev.breakdown[0] ? ev.breakdown[0].cardPoints : 0)
              .replace('{b}', ev.breakdown[1] ? ev.breakdown[1].cardPoints : 0);
          document.getElementById('overlay-round').classList.remove('hidden');
          Pipeline.pause();
          break;
        }

        case 'GameEnded': {
          const winnerTeam = App.game.state.getTeam(ev.winnerTeamId);
          const viewerTeamId = App.game.state.getPlayer(App.currentViewerId).teamId;
          document.getElementById('match-winner-name').textContent = winnerTeam.name;
          const t = App.game.state.teams;
          document.getElementById('match-final-score').textContent =
            I18N.match.finalScore.replace('{a}', t[0].score).replace('{b}', t[1].score);
          R.renderBreakdown('match-breakdown', ev.breakdown, I18N.breakdown);
          App.renderConfetti();
          document.getElementById('overlay-match').classList.remove('hidden');
          R.addLog('<b>' + I18N.log.matchEnd + '</b> — ' + winnerTeam.name, 'log-qa3a');
          SFX.win();
          Pipeline.pause(); // توقف نهائي
          break;
        }

        default:
          break;
      }
    }
  };

  /* ============================ السفافات ============================ */

  App.renderConfetti = function () {
    const box = document.querySelector('#overlay-match .confetti');
    box.innerHTML = '';
    const colors = ['#d9ae47', '#d0654f', '#5d86c9', '#62c07a', '#b57edc', '#e8c86e'];
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

  /* ============================ انطلاق ============================ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.init(); });
  } else {
    App.init();
  }

  window.RondaApp = App;
})();

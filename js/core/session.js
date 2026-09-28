/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Session Resume Module
   ───────────────────────────────────────────────────────────────────────────
   يتتبّع الجولات النشطة عبر localStorage ليتيح للاعب استئناف جولته بعد
   الخروج بالخطأ من صفحة اللعبة (طالما لم تنتهِ الجولة ولم يتجاوز وقتها).
   يُحمّل قبل باقي النواة؛ كل المراجع دفاعية (typeof checks).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var KEY = 'rc_game_session';
  var DEFAULT_DEADLINE = 2 * 60 * 60 * 1000;   /* نافذة كبيرة: ألعاب الورق المحلية تُجمَّد فلا تنتهي بالغياب */

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (e) { return null; }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }
  function now() { return Date.now(); }
  function gameLabel(id) {
    try {
      if (typeof GAMES !== 'undefined' && GAMES) {
        for (var i = 0; i < GAMES.length; i++) { if (GAMES[i].id === id) return (typeof gname === 'function' ? gname(GAMES[i]) : GAMES[i].n); }
      }
    } catch (e) {}
    return id;
  }
  function say(msg, type) {
    try { if (typeof toast === 'function') toast(msg, type || 'info'); } catch (e) {}
  }
  function tr(key, fallback) {
    try { if (typeof T === 'function') { var v = T(key); if (v && v !== key) return v; } } catch (e) {}
    return fallback;
  }

  var SessionResume = {
    DEFAULT_DEADLINE: DEFAULT_DEADLINE,

    /* بداية جولة/رهان — تُستدعى من takeBet (تغطّي كل ألعاب المراهنة تلقائياً) */
    onBet: function (bet) {
      var gid = (typeof window !== 'undefined') ? window._currentGameId : null;
      if (!gid) return;
      save({
        gameId: gid, label: gameLabel(gid), bet: bet || 0,
        startedAt: now(), deadlineAt: now() + DEFAULT_DEADLINE, inProgress: true
      });
    },

    /* بداية جولة صريحة لألعاب الورق/اللوحة (رامي/روندا) بدون takeBet */
    markRoundStart: function (opts) {
      opts = opts || {};
      var gid = (typeof window !== 'undefined') ? window._currentGameId : null;
      if (!gid) gid = opts.gameId;
      if (!gid) return;
      save({
        gameId: gid, label: gameLabel(gid), bet: opts.bet || 0,
        startedAt: now(), deadlineAt: now() + (opts.deadline || DEFAULT_DEADLINE),
        inProgress: true
      });
    },

    /* انتهاء الجولة (فوز/خسارة) — تُستدعى من recordRound / giveWin */
    onResolve: function () {
      var s = load();
      if (s && s.inProgress) {
        s.inProgress = false;
        s.resolvedAt = now();
        save(s);
      }
    },

    getActive: function () { return load(); },
    isResumable: function () {
      var s = load();
      return !!(s && s.inProgress && now() < s.deadlineAt);
    },
    clear: clear,

    /* عند فتح لعبة: إن انتهت جولتها السابقة أثناء الغياب → تنظيف صامت
       (بدون لافتة — الاستئناف الآن تلقائي عند العودة لنفس اللعبة) */
    onGameOpen: function (gid) {
      var s = load();
      if (!s) return;
      if (s.gameId === gid && s.inProgress && now() >= s.deadlineAt) {
        clear();
      }
    },

    /* على الرئيسية/الألعاب: إظهار لافتة الاستئناف إن وُجدت جولة قابلة للاستئناف */
    maybeShowBanner: function () {
      var banner = (typeof document !== 'undefined') ? document.getElementById('resumeBanner') : null;
      if (!banner) return;
      var s = load();
      if (!s) { banner.classList.remove('show'); return; }
      if (s.inProgress && now() < s.deadlineAt) {
        var titleEl = document.getElementById('resumeTitle');
        var subEl = document.getElementById('resumeSub');
        var btn = document.getElementById('resumeBtn');
        if (titleEl) titleEl.textContent = (tr('resume.title', 'جولة لم تكتمل')) + ' — ' + (s.label || s.gameId);
        if (subEl) subEl.textContent = tr('resume.sub', 'استأنف جولتك قبل انتهاء الوقت');
        if (btn) btn.setAttribute('data-game', s.gameId);
        banner.classList.add('show');
      } else if (s.inProgress && now() >= s.deadlineAt) {
        say(tr('resume.roundEnded', 'انتهت جولتك السابقة'), 'info');
        clear();
        banner.classList.remove('show');
      } else {
        banner.classList.remove('show');
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.SessionResume = SessionResume;

    /* استئناف الجولة: إعادة فتح اللعبة */
    window.resumeGameSession = function () {
      var banner = document.getElementById('resumeBanner');
      var btn = document.getElementById('resumeBtn');
      var gid = btn ? btn.getAttribute('data-game') : null;
      if (banner) banner.classList.remove('show');
      if (gid && typeof openGame === 'function') {
        openGame(gid);
      }
    };

    /* تجاهل لافتة الاستئناف ومسح الجلسة */
    window.dismissResume = function () {
      var banner = document.getElementById('resumeBanner');
      if (banner) banner.classList.remove('show');
      clear();
    };
  }
})();

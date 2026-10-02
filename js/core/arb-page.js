/* ═══════════════════════════════════════════════════════════════════════════
   [v2.76] صفحة التحكيم المباشر — مركز تشغيل موحّد للمستخدمين والأدمنز
   ───────────────────────────────────────────────────────────────────────────
   صفحة SPA مخصّصة (‪#arb‬) متناسقة مع هوية المنصة، تُدار بحسب الدور:
     • اللاعب: «جلستي الحالية» (غرفته الجارية + حالة بث كل لاعب عبر
       /api/matches/mine) + زر مشاركة الشاشة/الإيقاف (نفس عميل ARB —
       البث يعمل من الصفحة ومن مودال الغرفة معاً) + شرح الخطوات والقواعد.
     • الأدمن/السوبر: مركز التحكيم كاملاً — إحصاءات حية + قائمة الجلسات
       + المشاهدة المزدوجة وأزرار الحسم (لوحة ARB_ADMIN نفسها بحاوية
       الصفحة arbConsole — بلا ازدواج استطلاع ولا اتصالات).
   التحديث: استطلاع خفيف (لاعب 6ث / أدمن عبر لوحته 10ث) + أحداث SSE
   (arb:session/arb:resolved) + مراقب حالة عميل البث ARB.onState.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var st = {
    active: false,      /* الصفحة مفتوحة الآن */
    poll: null,         /* مؤقّت التحديث (لاعب) */
    mine: null,         /* آخر /api/matches/mine */
    unb: null,          /* إلغاء اشتراك ARB.onState */
    debounce: null
  };

  /* [مهم] API وAUTH معرّفان بروابط معجمية في نطاق السكربت العام — الوصول
     بالمسمّى المجرّد حصراً (نمط arb-client/arb-admin) */
  function api() { return (typeof API !== 'undefined' && API && typeof API.get === 'function') ? API : null; }
  function me() {
    try {
      if (typeof AUTH !== 'undefined' && AUTH && AUTH.user) return AUTH.user;
      if (typeof ST !== 'undefined' && ST && ST.user) return ST.user;
    } catch (e) {}
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function iAmAdmin() {
    var u = me();
    return !!(u && u.role && u.role !== 'user');
  }
  function gameName(gid) {
    try {
      if (root.GAMES) {
        for (var i = 0; i < root.GAMES.length; i++) {
          if (root.GAMES[i].id === gid) return root.gname ? gname(root.GAMES[i]) : (root.GAMES[i].n && root.GAMES[i].n[0]) || gid;
        }
      }
    } catch (e) {}
    return gid || '—';
  }
  var STATE_LBL = {
    idle: '⬜ بانتظار البث', connecting: '🟡 يتصل…', live: '🟢 مباشر',
    relay: '🟠 عبر المرحّل', failed: '🔴 منقطع'
  };
  function stateLbl(s) { return STATE_LBL[s] || s || ''; }

  /* ═══ دورة الحياة (تناديها nav() من utils.js) ═══ */
  function enter() {
    st.active = true;
    render();
    startPolling();
    /* مزامنة شريحة حالة بثّي مع عميل البث (مودال الغرفة والصفحة معاً) */
    if (st.unb) { try { st.unb(); } catch (e) {} st.unb = null; }
    if (typeof ARB !== 'undefined' && ARB && ARB.onState && !iAmAdmin()) {
      st.unb = ARB.onState(function () { renderMyChip(); });
    }
  }
  function leave() {
    st.active = false;
    stopPolling();
    st.mine = null;
    if (st.debounce) { clearTimeout(st.debounce); st.debounce = null; }
    if (st.unb) { try { st.unb(); } catch (e) {} st.unb = null; }
    /* لوحة الأدمن تفكّك نظيفاً (اتصالات + استطلاع) — التبويب الأصلي يعيد
       تركيبها بنفسه عند فتحه */
    if (iAmAdmin() && typeof ARB_ADMIN !== 'undefined' && ARB_ADMIN && ARB_ADMIN.unmount) {
      try { ARB_ADMIN.unmount(); } catch (e) {}
    }
  }
  function startPolling() {
    stopPolling();
    /* الأدمن: اللوحة تستطلع بنفسها (10ث) — نكتفي بتحديث رأس الإحصاءات */
    st.poll = setInterval(function () {
      if (!st.active) return;
      if (iAmAdmin()) { updateAdminHead(); return; }
      refreshMine();
    }, 6000);
  }
  function stopPolling() {
    if (st.poll) { clearInterval(st.poll); st.poll = null; }
  }

  /* ═══ الجلب ═══ */
  function fetchMine() {
    var a = api();
    var u = me();
    if (!a || !u) return Promise.resolve(null);
    return a.get('/api/matches/mine').then(function (r) {
      return (r && r.ok && r.data) ? r.data : null;
    }).catch(function () { return null; });
  }
  function refreshMine() {
    if (!st.active || iAmAdmin()) return;
    fetchMine().then(function (d) {
      st.mine = d;
      if (st.active) renderUser();
    });
  }

  /* ═══ أحداث SSE (تمريرها live.js) ═══ */
  function onEvent(name, d) {
    if (!st.active || !d) return;
    if (iAmAdmin()) {
      /* اللوحة تعالج الجلسات — نحدّث رأس الإحصاءات فقط */
      if (name === 'arb:session' || name === 'arb:resolved') updateAdminHead();
      return;
    }
    /* اللاعب: أي تغيّر بجلسة الغرفة أو حسمها ⇒ تحديث مهلّل (على الأكثر
       واحداً كل 800ملي حتى لا تزحم إعادة رسم متتالية الأحداث) */
    if (name === 'arb:session' || name === 'arb:resolved') {
      if (st.debounce) clearTimeout(st.debounce);
      st.debounce = setTimeout(refreshMine, 800);
    }
  }

  /* ═══ الرسم ═══ */
  function render() {
    var el = document.getElementById('arbPageBody');
    if (!el || !st.active) return;
    if (iAmAdmin()) { renderAdmin(el); return; }
    renderUser();
  }

  /* ── رأس الأدمن: إحصاءات حية (من حالة اللوحة — بلا استعلام إضافي) ── */
  function updateAdminHead() {
    var el = document.getElementById('arbStatsRow');
    if (!el) return;
    var s = (typeof ARB_ADMIN !== 'undefined' && ARB_ADMIN && ARB_ADMIN.summary) ? ARB_ADMIN.summary() : { total: 0, streaming: 0 };
    el.innerHTML = adminStatsHtml(s);
  }
  function adminStatsHtml(s) {
    return '<div class="stat" role="listitem"><div class="si"><i class="fa-solid fa-satellite-dish" aria-hidden="true"></i></div>' +
      '<div><div class="sv">' + Number(s.total) + '</div><div class="sl">' + esc(T('arb.sessionsActive') || 'جلسات نشطة') + '</div></div></div>' +
      '<div class="stat" role="listitem"><div class="si"><i class="fa-solid fa-video" aria-hidden="true"></i></div>' +
      '<div><div class="sv green">' + Number(s.streaming) + '</div><div class="sl">' + esc(T('arb.nowStreaming') || 'يبث الآن') + '</div></div></div>';
  }

  /* ── واجهة الأدمن: مركز التحكيم الكامل ── */
  function renderAdmin(el) {
    el.innerHTML =
      '<div class="grid g4" id="arbStatsRow" style="margin-bottom:14px" role="list">' + adminStatsHtml({ total: 0, streaming: 0 }) + '</div>' +
      '<div class="card arb-console-head">' +
        '<div class="ctitle"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i> <span>' + esc(T('arb.consoleTitle') || 'مركز التحكيم') + '</span></div>' +
        '<div class="ctext" style="font-size:.85rem">' + esc(T('arb.consoleHint') || 'افتح جلسة لمشاهدة الشاشتين وحسم النتيجة — أول بث يصل يُعرض تلقائياً') + '</div>' +
      '</div>' +
      '<div id="arbConsole"></div>';
    if (typeof ARB_ADMIN !== 'undefined' && ARB_ADMIN && ARB_ADMIN.mount) {
      ARB_ADMIN.mount('arbConsole');
    }
  }

  /* ── واجهة اللاعب ── */
  function renderUser() {
    var el = document.getElementById('arbPageBody');
    if (!el || !st.active || iAmAdmin()) return;
    var u = me();
    var done = function () {
      el.innerHTML = userHtml();
      renderMyChip();
    };
    if (!u) { st.mine = null; done(); return; }
    if (!st.mine) {
      fetchMine().then(function (d) { st.mine = d; if (st.active) { done(); } });
      el.innerHTML = '<div class="note">⏳ ' + esc(T('lb.loading') || 'جارٍ التحميل…') + '</div>';
      return;
    }
    done();
  }

  function userHtml() {
    var u = me();
    var mine = st.mine;
    var room = mine && mine.room;
    var session = mine && mine.session;
    var html = '';

    /* 1) بطاقة جلستي الحالية */
    if (!u) {
      html += '<div class="card arb-guide"><div class="ctitle"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> <span>' +
        esc(T('arb.needLogin') || 'سجل الدخول لاستعمال التحكيم') + '</span></div></div>';
    } else if (room && room.status === 'playing') {
      var states = {};
      if (session && session.players) {
        session.players.forEach(function (p) { states[p.user_id] = p.state; });
      }
      html += '<div class="card arb-mine" id="arbMineCard">' +
        '<div class="ctitle"><i class="fa-solid fa-satellite-dish" aria-hidden="true"></i> <span>' + esc(T('arb.mineTitle') || 'جلستي الحالية') + '</span></div>' +
        '<div class="arb-mine-head">' +
          '<span class="arb-room">🎮 ' + esc(room.code || room.id) + ' · ' + esc(gameName(room.game_id)) + '</span>' +
          '<span class="arb-bet">🪙 ' + fmt(room.bet || 0) + '</span>' +
        '</div>' +
        '<div class="arb-pl-list">' + (room.players || []).map(function (p) {
          var ps = states[p.id] || 'idle';
          return '<div class="arb-pl-item">' +
            '<span class="avatar" style="background:' + lbColor(p.username) + '">' + esc(String(p.username || '?').slice(0, 1)) + '</span>' +
            '<b>' + esc(p.username) + (p.is_bot ? ' 🤖' : '') + '</b>' +
            '<span class="arb-chip arb-' + esc(ps) + '">' + stateLbl(ps) + '</span>' +
          '</div>';
        }).join('') + '</div>' +
        '<div class="arb-row">' +
          '<button type="button" class="btn half gold" id="arbShareBtn" onclick="ARB_PAGE.share()">' + esc(T('arb.start') || '📺 مشاركة الشاشة / بدء البث') + '</button>' +
          '<span id="arbPageChip"></span>' +
        '</div>' +
        '<div class="note arb-privacy">🔒 ' + esc(T('arb.rule2') || 'الفيديو اتصال مباشر مع لوحة التحكيم وحدها — لا يمر بالخوادم ولا يُسجَّل') + '</div>' +
      '</div>';
    } else if (room) {
      html += '<div class="card arb-mine">' +
        '<div class="ctitle"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> <span>' + esc(T('arb.mineTitle') || 'جلستي الحالية') + '</span></div>' +
        '<div class="arb-mine-head">' +
          '<span class="arb-room">🎮 ' + esc(room.code || room.id) + ' · ' + esc(gameName(room.game_id)) + '</span>' +
          '<span class="arb-bet">🪙 ' + fmt(room.bet || 0) + '</span>' +
        '</div>' +
        '<div class="note">⏳ ' + esc(T('arb.waitRoom') || 'الغرفة بانتظار بدء الجولة — زر البث يُفتح تلقائياً عند انطلاقها') + '</div>' +
      '</div>';
    } else {
      html += '<div class="card arb-guide">' +
        '<div class="ctitle"><i class="fa-solid fa-door-open" aria-hidden="true"></i> <span>' + esc(T('arb.noRoomTitle') || 'لست في غرفة لعب حالياً') + '</span></div>' +
        '<div class="ctext" style="font-size:.85rem;line-height:1.8">' + esc(T('arb.noRoomSub') || 'انضم إلى غرفة لعب وجهاً لوجه وابدأ الجولة، ثم شارك شاشتك ليشاهدها الأدمن ويحسم النتيجة') + '</div>' +
        '<button type="button" class="btn gold" onclick="nav(\'rooms\')">🎮 ' + esc(T('arb.goRooms') || 'الذهاب إلى غرف اللعب') + '</button>' +
      '</div>';
    }

    /* 2) كيف يعمل التحكيم؟ — ثلاث خطوات */
    html += '<div class="shead" style="margin-top:18px"><div class="stitle"><span class="bar"></span> <i class="fa-solid fa-circle-question" aria-hidden="true"></i> <span>' +
      esc(T('arb.howTitle') || 'كيف يعمل التحكيم؟') + '</span></div></div>' +
      '<div class="grid g3 arb-steps">' +
        stepHtml('fa-play', T('arb.step1') || '1. ابدأ الجولة وشارك شاشتك', T('arb.step1s') || 'أثناء جولة المراهنة وجهاً لوجه يظهر زر البث — مشاركة الشاشة تصل لوحة التحكيم مباشرة') +
        stepHtml('fa-eye', T('arb.step2') || '2. الأدمن يشاهد المباشرة المزدوجة', T('arb.step2s') || 'شاشتا اللاعبين جنباً إلى جنب بجودة كاملة وبلا تخزين — الاتصال نقطة-إلى-نقطة') +
        stepHtml('fa-sack-dollar', T('arb.step3') || '3. الحسم وتوزيع الأرباح فوراً', T('arb.step3s') || 'الأدمن يؤكد الفائز فتُفرج الإيداعات آلياً (الجرة − 5%)، أو يعلن نزاعاً/إلغاءً فتُسترد الرهانات للجميع') +
      '</div>';

    /* 3) قواعد التحكيم */
    html += '<div class="card arb-rules" style="margin-top:14px">' +
      '<div class="ctitle"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> <span>' + esc(T('arb.rulesTitle') || 'قواعد التحكيم') + '</span></div>' +
      '<div class="ctext"><ul class="arb-rules-list">' +
        '<li>' + esc(T('arb.rule1') || 'البث متاح أثناء الجولات المراهَنة وجهاً لوجه فقط') + '</li>' +
        '<li>' + esc(T('arb.rule2') || 'الفيديو اتصال مباشر مع لوحة التحكيم وحدها — لا يمر بالخوادم ولا يُسجَّل') + '</li>' +
        '<li>' + esc(T('arb.rule3') || 'كل حسم موثق في السجل المالي (تذاكر + معاملات) بلا استثناء') + '</li>' +
      '</ul></div>' +
    '</div>';
    return html;
  }
  function stepHtml(icon, title, sub) {
    return '<div class="card arb-step">' +
      '<div class="arb-step-ico"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></div>' +
      '<div class="arb-step-body">' +
        '<div class="arb-step-title">' + esc(title) + '</div>' +
        '<div class="arb-step-sub">' + esc(sub) + '</div>' +
      '</div>' +
    '</div>';
  }

  /* شريحة حالة بثّي (تعيش خارج إعادة رسم البطاقة — يحدثها ARB.onState) */
  function renderMyChip() {
    var chip = document.getElementById('arbPageChip');
    var btn = document.getElementById('arbShareBtn');
    var state = (typeof ARB !== 'undefined' && ARB && ARB.state) ? ARB.state() : 'idle';
    if (chip) chip.innerHTML = '<span class="arb-chip arb-' + esc(state) + '">' + esc(myStateLbl(state)) + '</span>';
    if (btn) {
      var sharing = (state === 'live' || state === 'connecting' || state === 'relay');
      btn.innerHTML = sharing
        ? '⏹ ' + esc(T('arb.stop') || 'إيقاف البث')
        : esc(T('arb.start') || '📺 مشاركة الشاشة / بدء البث');
      btn.classList.toggle('gold', !sharing);
    }
  }
  function myStateLbl(s) {
    var map = {
      idle: T('arb.stIdle') || '⬜ لم أبدأ البث',
      connecting: T('arb.stConnecting') || '🟡 يتم الاتصال…',
      live: T('arb.stLive') || '🟢 مباشر — الأدمن يشاهد',
      relay: T('arb.stRelay') || '🟠 مباشر عبر المرحّل',
      failed: T('arb.stFailed') || '🔴 منقطع — أعد المحاولة'
    };
    return map[s] || s;
  }

  /* لون أفاتار حتمي من الاسم (نفس لوحة ألوان المتصدرين) */
  function lbColor(name) {
    var palette = ['#1A6CF6', '#7C3AED', '#10B981', '#EF4444', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16'];
    var h = 0;
    var s = String(name || '?');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  /* زر البث/الإيقاف — تفويض لعميل البث نفسه (يعمل من الصفحة والمودال معاً) */
  function share() {
    if (typeof ARB === 'undefined' || !ARB) return;
    var state = ARB.state ? ARB.state() : 'idle';
    if (state === 'live' || state === 'connecting' || state === 'relay') ARB.stopShare();
    else ARB.startShare();
  }

  root.ARB_PAGE = {
    enter: enter,
    leave: leave,
    onEvent: onEvent,
    refresh: refreshMine,
    share: share
  };
})(typeof window !== 'undefined' ? window : this);

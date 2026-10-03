/* ═══════════════════════════════════════════════════════════════════════════
   [v2.76] صفحة التحكيم المباشر — مركز تشغيل موحّد للمستخدمين والأدمنز
   [v2.77·إصلاح الوميض] رسم تزايدي ببوابة توقّع (signature):
     كانت الصفحة تعيد بناء محتواها كاملاً كل 6ث (استطلاع اللاعب) وعلى كل
     حداث SSE — فتومض البطاقات والأزرار دورياً «تظهر وتختفي»، ولوحة الأدمن
     كانت تهدم عنصري الفيديو الحيين مع كل تحديث فتسودّ الشاشتان كل بضع
     ثوانٍ (خلال بث نشط تصل أحداث arb:session كل ثوانٍ فتتضاعف الوتيرة).
     الآن: الهيكل الثابت (الخطوات/القواعد) يُرسم مرة، وبطاقة «جلستي» وحدها
     تُعاد — وفقط عند تغيّر توقّعها النصي؛ شريحة الحالة والزر يُحدَّثان في
     مكانهما؛ ولا وميض «جارٍ التحميل» بعد أول رسم مهما تخلفت الشبكة.
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
    mine: null,         /* آخر /api/matches/mine (نحتفظ بآخر بيانات صالحة) */
    mineSig: '',        /* توقّع HTML لبطاقة جلستي — بوابة إعادة الرسم */
    rendered: false,    /* تم أول رسم (لا وميض تحميل بعده) */
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
    /* [v2.78·تحكيم] غرف المعرّف arb (تبويب القائمة) — تسمية التحكيم الموحدة */
    if (gid === 'arb') return (typeof T === 'function' && T('rs.arbRoomName')) || 'غرفة تحكيم مباشر';
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
    st.rendered = false;
    st.mineSig = '';
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
    st.rendered = false;
    st.mineSig = '';
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
      if (!st.active) return;
      /* [v2.77] نحتفظ بآخر بيانات صالحة — خلل شبكة عابر لا يمحو الجلسة
         المعروضة ولا يعيد وميض «جارٍ التحميل» */
      if (d) st.mine = d;
      renderUser();
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
    var html = adminStatsHtml(s);
    /* [v2.77] تحديث في المكان عند تغيّر الأرقام فقط — لا هدم لإعادة بناء */
    if (el.dataset.sig !== html) {
      el.dataset.sig = html;
      el.innerHTML = html;
    }
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

  /* ── واجهة اللاعب: هيكل ثابت مرة واحدة + بطاقة جلسة تُحدَّث بتوقّعها ── */
  function renderUser() {
    var el = document.getElementById('arbPageBody');
    if (!el || !st.active || iAmAdmin()) return;
    var u = me();
    if (!st.rendered) {
      /* أول رسم: الهيكل الثابت (بطاقة تُملأ لاحقاً + الخطوات + القواعد) */
      el.innerHTML = '<div id="arbMineWrap">' +
          '<div class="note">⏳ ' + esc(T('lb.loading') || 'جارٍ التحميل…') + '</div>' +
        '</div>' +
        stepsHtml() + rulesHtml();
      st.rendered = true;
      if (!u) { st.mine = null; updateMineCard(); return; }
    }
    if (!u) { st.mine = null; updateMineCard(); return; }
    if (!st.mine) {
      fetchMine().then(function (d) { if (d) st.mine = d; if (st.active) updateMineCard(); });
      return;   /* نبقي آخر محتوى (التحميل الأولي) — لا وميض */
    }
    updateMineCard();
  }

  function updateMineCard() {
    var wrap = document.getElementById('arbMineWrap');
    if (!wrap || !st.active) return;
    var html = mineCardHtml();
    /* [v2.77] بوابة التوقّع: لا نمسّ DOM إن لم يتغير شيء — إيقاف الوميض الدوري */
    if (st.mineSig === html) { renderMyChip(); return; }
    st.mineSig = html;
    wrap.innerHTML = html;
    renderMyChip();
  }

  /* هل يدعم هذا السياق مشاركة الشاشة؟ (تفويض لتشخيص عميل البث — v2.78) */
  function shareSupport() {
    return (typeof ARB !== 'undefined' && ARB && ARB.support) ? ARB.support() : { ok: true };
  }
  function shareSupportToast() {
    var s = shareSupport();
    if (s.ok) return null;
    if (s.reason === 'insecure') return T('arb.shareInsecure') || 'مشاركة الشاشة تتطلب اتصالاً مشفرًا HTTPS — افتح المنصة عبر رابطها الرسمي الآمن ثم أعد المحاولة';
    if (s.reason === 'mobile') return T('arb.shareMobile') || 'متصفح الهاتف لا يدعم مشاركة الشاشة — افتح المنصة من حاسوب بكروم أو إيدج أو فايرفوكس';
    return T('arb.shareOld') || 'هذا المتصفح قديم ولا يوفر واجهة البث — حدّثه إلى أحدث إصدار ثم أعد المحاولة';
  }

  /* ═══ [v2.81] مشاركة شاشة الهاتف — البديل التقني (توجيه المالك) ═══
     متصفحات الجوال لا توفّر getDisplayMedia (قيد منصّي) — البديل المعتمد:
     تطبيق بث شاشة RTMP (مثل Larix Screencer) ينشر شاشة الهاتف إلى MediaMTX
     على خادم المنصة عبر MEDIAMTX_RTMP_URL، ومسار النشر — [v2.81.1] لا يُبنى
     هنا إطلاقاً بل يُسلَّم من الخادم جاهزاً في mine().relay.publish_path:
     dtsg/<roomId>/<userId>_<token>
     و<token> هو ما يجعل المرحّل موثوقاً: معرّفا الغرفة واللاعب عدادان
     صغيران متتاليان ⇒ المسار القديم وحده (<roomId>/<userId>) كان مفتوحاً
     لكل ناشر يصل منفذ RTMP — أي أحد كان ينشر في بث الخصم فيقرأه الأدمن «بثّاً
     حقيقياً» ويُبنى عليه قرار مال. الآن الخادم وحده يحسب الرمز (HMAC فوق
     معرّفي الغرفة واللاعب)، ومراقبته تسأل المسار الموقّع وحده ⇒ بثٌ منتحَل
     على مسار غير موقّع لا يُحسب بثّاً لأحد ولا يدخل قرار الأدمن. طريقة
     الحساب تبقى في الخادم (لا تُفصح عنها الواجهة ولا يحتاجها اللاعب).
     الأدمن يشاهد عبر المرحّل وتظهر حالة بثّك في لوحته
     (انقطاع/عودة آلياً عبر مراقبة stream-status). */
  function relayRtmpUrl(room) {
    var relay = st.mine && st.mine.relay;
    var base = relay && relay.rtmp;
    var path = relay && relay.publish_path;
    /* لا مسار من الخادم = لا بثّ — لا بديل محلي ولا مسار مُركَّب هنا */
    if (!base || !room || !path) return null;
    return String(base).replace(/\/+$/, '') + '/' + path;
  }
  function mobileRelayHtml(room) {
    var url = relayRtmpUrl(room);
    if (!url) return '';
    /* مصادر الترجمة موثوقة (تضم <b> المقصود) — نمط arb.mrHint المعتمد */
    return '<div class="arb-mobile-relay" id="arbMobileRelay">' +
      '<div class="arb-mr-title">' + (T('arb.mrTitle') || '📱 مشاركة شاشة الهاتف — عبر تطبيق RTMP') + '</div>' +
      '<ol class="arb-mr-steps">' +
        '<li>' + (T('arb.mrStep1') || 'ثبّت تطبيق بث شاشة مجانياً (مثل <b>Larix Screencer</b> من متجر التطبيقات)') + '</li>' +
        '<li>' + esc(T('arb.mrStep2') || 'في إعدادات البث بالتطبيق: اختر RTMP ثم الصق عنوانك أدناه') + '</li>' +
        '<li>' + esc(T('arb.mrStep3') || 'داخل التطبيق فعّل «بث الشاشة / Screen capture» ثم ابدأ البث') + '</li>' +
        '<li>' + esc(T('arb.mrStep4') || 'الأدمن يشاهد شاشتك عبر المرحّل ويظهر بثّك مباشرة في لوحته') + '</li>' +
      '</ol>' +
      '<div class="arb-mr-url"><code id="arbRtmpUrl">' + esc(url) + '</code>' +
        '<button type="button" class="btn mini" onclick="ARB_PAGE.copyRtmp()">' + esc(T('arb.mrCopy') || '📋 نسخ') + '</button></div>' +
      '<div class="note" style="font-size:.7rem;text-align:start">' + (T('arb.mrNote') || 'ℹ️ هذا البث عبر المرحّل يعمل من الهاتف دون حاسوب — ومشاركة المتصفح من حاسوب تبقى ممكنة كما كانت') + '</div>' +
    '</div>';
  }
  function copyRtmp() {
    var el = document.getElementById('arbRtmpUrl');
    var txt = el ? el.textContent : '';
    if (!txt) return;
    var done = function () { if (root.toast) root.toast(T('arb.mrCopied') || '📋 نُسخ عنوان البث — الصقه في تطبيق RTMP', 'ok'); };
    try {
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
      } else { fallbackCopy(txt); done(); }
    } catch (e) { fallbackCopy(txt); done(); }
  }
  function fallbackCopy(txt) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) {}
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function mineCardHtml() {
    var u = me();
    var mine = st.mine;
    var room = mine && mine.room;
    var session = mine && mine.session;
    if (!u) {
      return '<div class="card arb-guide"><div class="ctitle"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> <span>' +
        esc(T('arb.needLogin') || 'سجل الدخول لاستعمال التحكيم') + '</span></div></div>';
    }
    /* بطاقة جلستي الحالية */
    if (room && room.status === 'playing') {
      var states = {};
      if (session && session.players) {
        session.players.forEach(function (p) { states[p.user_id] = p.state; });
      }
      return '<div class="card arb-mine" id="arbMineCard">' +
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
          (shareSupport().ok
            ? '<button type="button" class="btn half gold" id="arbShareBtn" onclick="ARB_PAGE.share()">' + esc(T('arb.start') || '📺 مشاركة الشاشة / بدء البث') + '</button>'
            : '<button type="button" class="btn half" id="arbShareBtn" title="' + esc(shareSupportToast() || '') + '" onclick="ARB_PAGE.share()">⚠️ ' + esc(T('arb.shareBlocked') || 'مشاركة الشاشة غير متاحة هنا') + '</button>') +
          '<span id="arbPageChip"></span>' +
        '</div>' +
        (shareSupport().ok ? '' : '<div class="note" style="font-size:.72rem;text-align:start">ℹ️ ' + esc(shareSupportToast() || '') + '</div>') +
        /* [v2.81] البديل التقني لمتصفح الهاتف: بث RTMP عبر تطبيق خارجي */
        (!shareSupport().ok && shareSupport().reason === 'mobile' ? mobileRelayHtml(room) : '') +
        '<div class="note arb-privacy">🔒 ' + esc(T('arb.rule2') || 'الفيديو اتصال مباشر مع لوحة التحكيم وحدها — لا يمر بالخوادم ولا يُسجَّل') + '</div>' +
      '</div>';
    }
    if (room) {
      return '<div class="card arb-mine">' +
        '<div class="ctitle"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> <span>' + esc(T('arb.mineTitle') || 'جلستي الحالية') + '</span></div>' +
        '<div class="arb-mine-head">' +
          '<span class="arb-room">🎮 ' + esc(room.code || room.id) + ' · ' + esc(gameName(room.game_id)) + '</span>' +
          '<span class="arb-bet">🪙 ' + fmt(room.bet || 0) + '</span>' +
        '</div>' +
        '<div class="note">⏳ ' + esc(T('arb.waitRoom') || 'الغرفة بانتظار بدء الجولة — زر البث يُفتح تلقائياً عند انطلاقها') + '</div>' +
      '</div>';
    }
    return '<div class="card arb-guide">' +
      '<div class="ctitle"><i class="fa-solid fa-door-open" aria-hidden="true"></i> <span>' + esc(T('arb.noRoomTitle') || 'لست في غرفة لعب حالياً') + '</span></div>' +
      '<div class="ctext" style="font-size:.85rem;line-height:1.8">' + esc(T('arb.noRoomSub') || 'انضم إلى غرفة لعب وجهاً لوجه وابدأ الجولة، ثم شارك شاشتك ليشاهدها الأدمن ويحسم النتيجة') + '</div>' +
      '<button type="button" class="btn gold" onclick="nav(\'rooms\')">🎮 ' + esc(T('arb.goRooms') || 'الذهاب إلى غرف اللعب') + '</button>' +
    '</div>';
  }

  function stepsHtml() {
    return '<div class="shead" style="margin-top:18px"><div class="stitle"><span class="bar"></span> <i class="fa-solid fa-circle-question" aria-hidden="true"></i> <span>' +
      esc(T('arb.howTitle') || 'كيف يعمل التحكيم؟') + '</span></div></div>' +
      '<div class="grid g3 arb-steps">' +
        stepHtml('fa-play', T('arb.step1') || '1. ابدأ الجولة وشارك شاشتك', T('arb.step1s') || 'أثناء جولة المراهنة وجهاً لوجه يظهر زر البث — مشاركة الشاشة تصل لوحة التحكيم مباشرة') +
        stepHtml('fa-eye', T('arb.step2') || '2. الأدمن يشاهد المباشرة المزدوجة', T('arb.step2s') || 'شاشتا اللاعبين جنباً إلى جنب بجودة كاملة وبلا تخزين — الاتصال نقطة-إلى-نقطة') +
        stepHtml('fa-sack-dollar', T('arb.step3') || '3. الحسم وتوزيع الأرباح فوراً', T('arb.step3s') || 'الأدمن يؤكد الفائز فتُفرج الإيداعات آلياً (الجرة − 5%)، أو يعلن نزاعاً/إلغاءً فتُسترد الرهانات للجميع') +
      '</div>';
  }
  function rulesHtml() {
    return '<div class="card arb-rules" style="margin-top:14px">' +
      '<div class="ctitle"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> <span>' + esc(T('arb.rulesTitle') || 'قواعد التحكيم') + '</span></div>' +
      '<div class="ctext"><ul class="arb-rules-list">' +
        '<li>' + esc(T('arb.rule1') || 'البث متاح أثناء الجولات المراهَنة وجهاً لوجه فقط') + '</li>' +
        '<li>' + esc(T('arb.rule2') || 'الفيديو اتصال مباشر مع لوحة التحكيم وحدها — لا يمر بالخوادم ولا يُسجَّل') + '</li>' +
        '<li>' + esc(T('arb.rule3') || 'كل حسم موثق في السجل المالي (تذاكر + معاملات) بلا استثناء') + '</li>' +
      '</ul></div>' +
    '</div>';
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
    if (chip) {
      var chipHtml = '<span class="arb-chip arb-' + esc(state) + '">' + esc(myStateLbl(state)) + '</span>';
      if (chip.dataset.sig !== chipHtml) { chip.dataset.sig = chipHtml; chip.innerHTML = chipHtml; }
    }
    if (btn) {
      var sharing = (state === 'live' || state === 'connecting' || state === 'relay');
      /* [v2.81] الزر يحترم دعم المشاركة: على الهاتف (بلا getDisplayMedia) يبقى
         وضعاً تحذيرياً ⚠️ ولا تعيد شريحة الحالة كتابته فوق التحذير (كشفه
         الفحص المتصفحي: الشريحة كانت تمحو ⚠️ بعد كل رسم) */
      var sup = shareSupport();
      var btnHtml;
      if (sharing) {
        btnHtml = '⏹ ' + esc(T('arb.stop') || 'إيقاف البث');
      } else if (!sup.ok) {
        btnHtml = '⚠️ ' + esc(T('arb.shareBlocked') || 'مشاركة الشاشة غير متاحة هنا');
      } else {
        btnHtml = esc(T('arb.start') || '📺 مشاركة الشاشة / بدء البث');
      }
      if (btn.dataset.sig !== btnHtml) {
        btn.dataset.sig = btnHtml;
        btn.innerHTML = btnHtml;
        btn.title = (!sup.ok && !sharing) ? esc(shareSupportToast() || '') : '';
        btn.classList.toggle('gold', !sharing && sup.ok);
      }
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
    share: share,
    copyRtmp: copyRtmp
  };
})(typeof window !== 'undefined' ? window : this);

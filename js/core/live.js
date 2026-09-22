/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Live (SSE) client
   عدد المتصلين + شريط الفائزين + أحداث الجولات/المال/الغرف
   الدردشة العامة أزيلت؛ بيانات حقيقية من الخادم عبر EventSource (/api/live)
   ═══════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── الحالة المشتركة (تُقرأ من main.js) ──
     الدردشة العامة أزيلت؛ يبقى SSE للأرباح والجولات والمال والإدارة فقط. */
  var RC_ticks = [];        // [username, gameName, payout]
  var _source = null;
  var _started = false;
  var _maxTicks = 24;
  var _palette = ['#F5C518', '#7C3AED', '#10B981', '#3B82F6', '#EF4444', '#F97316', '#06B6D4', '#EC4899'];

  /* ── أدوات ── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function colorFor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return _palette[h % _palette.length];
  }
  function setOnline(n) {
    var a = document.getElementById('onlineN');
    if (a) a.textContent = fmt(n);
  }

  /* ── عرض شريط الفائزين (عبر renderTicker في main.js) ── */
  function renderTickerNow() {
    if (typeof window.renderTicker === 'function') { window.renderTicker(); return; }
    var el = document.getElementById('ticker');
    if (!el) return;
    var items = RC_ticks.map(function (x) {
      var gl = (typeof window.tickGameLabel === 'function') ? window.tickGameLabel(x[1]) : x[1];
      return '<span class="tk"> <span class="p">' + esc(x[0]) + '</span> ' + T('tk.won') +
        ' <span class="w">🪙 ' + fmt(x[2]) + '</span> <span class="g">(' + esc(gl) + ')</span></span>';
    }).join('');
    el.innerHTML = items + items;
  }

  /* ── معالجات الأحداث ── */
  function onHello(d) {
    if (d && d.online !== undefined) setOnline(d.online);
    if (d && Array.isArray(d.winners)) {
      RC_ticks = d.winners.map(function (w) {
        return [w.username, w.game_id, w.payout];
      }).slice(-_maxTicks);
      window.RC_ticks = RC_ticks;
      renderTickerNow();
    }
  }
  function onRound(r) {
    if (!r || !(r.won && r.payout > 0)) return;
    RC_ticks.push([r.username, r.game_id, r.payout]);
    if (RC_ticks.length > _maxTicks) RC_ticks.shift();
    window.RC_ticks = RC_ticks;
    renderTickerNow();
  }

  /* ── الاتصال بالخادم (SSE يعيد الاتصال تلقائياً) ── */
  function ensureSource() {
    if (_source || typeof EventSource === 'undefined') return;
    _source = new EventSource('/api/live');
    _source.addEventListener('hello', function (e) {
      try { onHello(JSON.parse(e.data)); } catch (err) { console.error('[live] hello', err); }
    });
    _source.addEventListener('online', function (e) {
      try { var d = JSON.parse(e.data); if (d && d.online !== undefined) setOnline(d.online); }
      catch (err) { console.error('[live] online', err); }
    });
    _source.addEventListener('round', function (e) {
      try { onRound(JSON.parse(e.data)); } catch (err) { console.error('[live] round', err); }
    });
    /* أحداث الجولات الجماعية (كينو/كراش) → لوحة Group في group.js */
    _source.addEventListener('gr:ke', function (e) {
      try { if (typeof window.RC_groupEvent === 'function') window.RC_groupEvent('ke', JSON.parse(e.data)); }
      catch (err) { console.error('[live] gr:ke', err); }
    });
    _source.addEventListener('gr:av', function (e) {
      try { if (typeof window.RC_groupEvent === 'function') window.RC_groupEvent('av', JSON.parse(e.data)); }
      catch (err) { console.error('[live] gr:av', err); }
    });
    /* [v2.44] حركة مالية جديدة ⇒ للأدمنز/السوبر (تبويب المال لحظياً) */
    _source.addEventListener('adminpay', function (e) {
      try {
        var d = JSON.parse(e.data);
        if (typeof window.RC_adminpay === 'function') window.RC_adminpay(d);
        else window.dispatchEvent(new CustomEvent('RC_adminpay', { detail: d }));
      } catch (err) { console.error('[live] adminpay', err); }
    });
    /* [v2.43] دفعة رصيد لحظية (اعتماد إيداع/سحب/كوبون من الأدمن أو البوت) */
    _source.addEventListener('wallet', function (e) {
      try {
        var d = JSON.parse(e.data);
        if (typeof window.RC_wallet === 'function') window.RC_wallet(d);
        else window.dispatchEvent(new CustomEvent('RC_wallet', { detail: d }));
      } catch (err) { console.error('[live] wallet', err); }
    });
    /* [Auth] رسائل تنسيق المشرفين (admin ⇄ super) */
    _source.addEventListener('admin_msg', function (e) {
      try {
        var d = JSON.parse(e.data);
        if (typeof window.RC_admin_msg === 'function') window.RC_admin_msg(d);
        else window.dispatchEvent(new CustomEvent('RC_admin_msg', { detail: d }));
      } catch (err) { console.error('[live] admin_msg', err); }
    });
    _source.onerror = function () {
      /* EventSource يغلق ويعيد المحاولة — نتركه يعمل */
    };
  }
  function start() {
    if (_started) return;
    _started = true;
    ensureSource();
  }

  /* ── التصدير ── */
  window.RC_ticks = RC_ticks;

  /* ── البدء عند جاهزية DOM ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

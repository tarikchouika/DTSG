'use strict';
/* ════════════════════════════════════════════════════════════════
   DTSG — المحفظة (شحن/سحب/كوبونات/سجل)  [Payments 2026-09-16]
   الواجهة تستدعي ووركر المدفوعات على dstg.pages.dev (عنوانه من
   /payments-url.json). مسار تلقائي Cryptomus + مسار محلي Cash Plus
   (P2P بوصل تحويل) + كوبونات + طلبات سحب يوافق عليها الأدمن من تيليغرام.
   ════════════════════════════════════════════════════════════════ */
window.PWAL = window.PWAL || {};
(function () {
  var BASE = null;         /* عنوان الووركر — يحل مرة واحدة */
  var METHODS = null;
  var overlay = null;

  function base() { return (BASE || '').replace(/\/$/, ''); }
  async function resolveBase() {
    if (BASE !== null) return BASE;
    try {
      const r = await fetch('/payments-url.json', { cache: 'no-store' });
      const j = await r.json();
      BASE = (j && j.url) ? String(j.url) : '';
    } catch (e) { BASE = ''; }
    return BASE;
  }
  async function api(path, body) {
    const r = await fetch(base() + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    return await r.json();
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function msg(el, txt, ok) { el.textContent = txt; el.className = 'wl-msg ' + (ok ? 'ok' : 'err'); }

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'walletOverlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="wl-sheet" role="dialog" aria-modal="true" aria-label="المحفظة">' +
      '  <div class="wl-head"><h3>💳 ' + (typeof T === 'function' ? (T('wl.title') || 'المحفظة') : 'المحفظة') + '</h3>' +
      '    <button class="wl-x" onclick="closeWallet()" aria-label="إغلاق">✕</button></div>' +
      '  <div class="wl-bal"><div><div class="usd" id="wlUsd">0.00 USD</div>' +
      '    <div class="gold" id="wlGold"></div></div>' +
      '    <button class="wl-copy" id="wlTgLink" type="button" data-i18n="wl.tgLink">🔗 ربط تيليغرام</button></div>' +
      '  <div class="wl-tabs">' +
      '    <button id="wlTabDep" class="on" type="button" data-i18n="wl.dep">⬇️ شحن</button>' +
      '    <button id="wlTabWd" type="button" data-i18n="wl.wd">⬆️ سحب</button>' +
      '    <button id="wlTabHis" type="button" data-i18n="wl.his">🧾 السجل</button>' +
      '  </div>' +
      /* ── شحن ── */
      '  <div class="wl-pane" id="wlPaneDep">' +
      '    <div id="wlMethods"></div>' +
      '    <div id="wlDepForm" hidden>' +
      '      <div id="wlAcctBox"></div>' +
      '      <div class="wl-row"><label data-i18n="wl.amount">المبلغ (USD)</label><input id="wlAmt" type="number" min="1" step="1" value="10"></div>' +
      '      <div class="wl-row" id="wlProofRow" hidden><label data-i18n="wl.proof">كود/مرجع التحويل</label><input id="wlProof" type="text" placeholder="مثال: 734545-CP-001234" data-i18n-placeholder="wl.proofPh"></div>' +
      '      <button class="wl-cta" id="wlDepGo" type="button" data-i18n="wl.confirm">تأكيد العملية</button>' +
      '    </div>' +
      '    <div class="wl-row" id="wlVoucherRow" hidden><label data-i18n="wl.voucher">كود كوبون التعبئة</label><input id="wlVCode" type="text" placeholder="DTSG-XXXX-XXXX"></div>' +
      '    <button class="wl-cta" id="wlVGo" type="button" hidden data-i18n="wl.vGo">تفعيل الكوبون</button>' +
      '    <div class="wl-msg" id="wlDepMsg"></div>' +
      '    <div class="wl-note"><b data-i18n="wl.noteTitle">💡 طرق الشحن ببساطة:</b><br>' +
      '      🪙 <span data-i18n="wl.noteCrypto"><b>كريبتو (Cryptomus)</b>: مبلغ ← عنوان دفع ← يُشحن تلقائياً بعد تأكيد الشبكة.</span><br>' +
      '      💵 <span data-i18n="wl.noteCash"><b>Cash Plus</b>: حوِّل للحساب الظاهر أعلاه ← أدخل كود التحويل ← يراجعه الأدمن ويشحنك.</span><br>' +
      '      🎟️ <span data-i18n="wl.noteVoucher"><b>كوبون</b>: أدخل الكود ← يُشحن فوراً (مرة واحدة).</span><br>' +
      '      <span data-i18n="wl.noteWd"><b>⬆️ السحب:</b> طلب من تبويب «سحب» يُخصم فوراً وينفّذه الأدمن خلال 24س؛ إن رُفض عاد المبلغ تلقائياً.</span><br>' +
      '      📄 <a href="refund-policy.html" target="_blank" rel="noopener" data-i18n="wl.policyLink">سياسة الاسترداد وطرق الدفع بالتفصيل</a></div>' +
      '  </div>' +
      /* ── سحب ─ */
      '  <div class="wl-pane" id="wlPaneWd" hidden>' +
      '    <div class="wl-row"><label data-i18n="wl.method">الوسيلة</label><select id="wlWdMethod">' +
      '      <option value="cryptomus" data-i18n="wl.mCrypto">كريبتو (عنوان USDT/TRC20)</option>' +
      '      <option value="cash_plus">Cash Plus</option>' +
      '      <option value="cih" data-i18n="wl.mCih">CIH Express (قريباً)</option>' +
      '      <option value="orange_money" data-i18n="wl.mOm">Orange Money (قريباً)</option>' +
      '    </select></div>' +
      '    <div class="wl-row"><label data-i18n="wl.details">تفاصيل الاستلام (عنوان المحفظة / رقم الهاتف)</label><input id="wlWdDetails" type="text"></div>' +
      '    <div class="wl-row"><label data-i18n="wl.amount">المبلغ (USD)</label><input id="wlWdAmt" type="number" min="1" step="1" value="10"></div>' +
      '    <button class="wl-cta" id="wlWdGo" type="button" data-i18n="wl.wdGo">طلب السحب</button>' +
      '    <div class="wl-msg" id="wlWdMsg"></div>' +
      '    <div class="wl-note" data-i18n="wl.wdNote">يُخصم المبلغ فور الطلب ويحوَّل بعد موافقة الأدمن — تصلك الحالة إشعاراً.</div>' +
      '  </div>' +
      /* ── سجل ─ */
      '  <div class="wl-pane" id="wlPaneHis" hidden><div id="wlTxList"></div></div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeWallet(); });
    /* [i18n v2.39] تُرجم النوافذ المبنية ديناميكياً فور إنشائها */
    if (typeof translateStatic === 'function') translateStatic();

    overlay.querySelector('#wlTabDep').onclick = function () { tab('Dep'); };
    overlay.querySelector('#wlTabWd').onclick = function () { tab('Wd'); wlRefresh(); };
    overlay.querySelector('#wlTabHis').onclick = function () { tab('His'); wlRefresh(); };
    overlay.querySelector('#wlTgLink').onclick = function () {
      var u = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user.id : '?';
      var cmd = '/start plt_' + u;
      if (navigator.clipboard) navigator.clipboard.writeText(cmd).catch(function () {});
      msg(overlay.querySelector('#wlDepMsg'), '📋 نُسخ الأمر — ألصقه في بوت تيليغرام: ' + cmd, true);
    };
    overlay.querySelector('#wlVGo').onclick = wlRedeemVoucher;
    overlay.querySelector('#wlDepGo').onclick = wlSubmitDeposit;
    overlay.querySelector('#wlWdGo').onclick = wlSubmitWithdraw;
    return overlay;
  }
  function tab(which) {
    ['Dep', 'Wd', 'His'].forEach(function (k) {
      overlay.querySelector('#wlPane' + k).hidden = (k !== which);
      overlay.querySelector('#wlTab' + k).classList.toggle('on', k === which);
    });
  }

  var selMethod = null;
  function renderMethods() {
    var box = overlay.querySelector('#wlMethods');
    if (!METHODS) { box.innerHTML = '<div class="wl-note">⏳ نظام الدفع غير موصول بعد — يضبط المشرف عنوان الووركر في payments-url.json.</div>'; return; }
    var icons = { cryptomus: '🪙', cash_plus: '💵', cih: '🏦', orange_money: '🟠', voucher: '🎟️', binance: '🟡' };
    /* [i18n v2.39] أسماء الوسائل تُترجم محلياً بدل نص الخادم العربي */
    var lab = function (m) {
      var k = { cryptomus: 'wl.mCrypto', cih: 'wl.mCihLive', binance: 'wl.mBnb', voucher: 'wl.voucher', orange_money: 'wl.mOm' }[m.id];
      if (k && typeof T === 'function' && T(k) !== k) return T(k);
      return m.label;
    };
    box.innerHTML = METHODS.map(function (m) {
      return '<button class="wl-method" type="button" data-m="' + m.id + '" ' + (m.status !== 'live' ? 'disabled' : '') + '>' +
        '<span class="ic">' + (icons[m.id] || '💳') + '</span><span>' + esc(lab(m)) + '</span>' +
        (m.status !== 'live' ? '<span class="soon">' + (typeof T === 'function' ? T('wl.soon') : 'قريباً') + '</span>' : '') + '</button>';
    }).join('');
    box.querySelectorAll('.wl-method').forEach(function (b) {
      b.onclick = function () { pickMethod(b.getAttribute('data-m')); };
    });
  }
  function pickMethod(id) {
    selMethod = id;
    var m = (METHODS || []).find(function (x) { return x.id === id; });
    var form = overlay.querySelector('#wlDepForm');
    var acct = overlay.querySelector('#wlAcctBox');
    var proof = overlay.querySelector('#wlProofRow');
    var vrow = overlay.querySelector('#wlVoucherRow');
    var vgo = overlay.querySelector('#wlVGo');
    vrow.hidden = true; vgo.hidden = true;
    if (id === 'voucher') {
      form.hidden = true; vrow.hidden = false; vgo.hidden = false;
      return;
    }
    form.hidden = false;
    if (id === 'cash_plus' || id === 'cih' || id === 'orange_money') {
      var acc = (m && m.account) || {};
      acct.innerHTML = '<div class="wl-acct">حوِّل المبلغ إلى:<br><b>' + esc(acc.name || '') + '</b> — <b>' + esc(acc.number || '') + '</b>' +
        (acc.number ? ' <button class="wl-copy" type="button" onclick="navigator.clipboard.writeText(\'' + esc(acc.number) + '\').catch(function(){})">نسخ</button>' : '') + '</div>';
      acct.hidden = false; proof.hidden = false;
    } else {
      acct.hidden = true; proof.hidden = true;
    }
  }

  async function wlRefresh() {
    var u = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user : null;
    if (!u) return;
    overlay.querySelector('#wlGold').textContent = '🪙 ' + (typeof fmt === 'function' ? fmt(ST.gold) : ST.gold);
    /* قاعدة فارغة = نفس الأصل (المنصة تخدم نقاط الدفع محلياً) */
    try {
      const bal = await api('/api/wallet/balance?user_id=' + encodeURIComponent(u.id));
      if (bal && bal.ok) {
        overlay.querySelector('#wlUsd').textContent = Number(bal.balance_usd || 0).toFixed(2) + ' USD';
        var list = overlay.querySelector('#wlTxList');
        list.innerHTML = (bal.transactions || []).map(function (t) {
          return '<div class="wl-tx"><span>' + (t.type === 'deposit' ? '⬇️' : '⬆️') + ' ' + Number(t.amount_usd).toFixed(2) + ' USD · ' + esc(t.method) + '</span>' +
            '<span class="st-' + t.status + '">' + (t.status === 'pending' ? 'قيد المراجعة' : t.status === 'completed' ? 'مكتمل' : 'مرفوض') + '</span></div>';
        }).join('') || '<div class="wl-note">لا معاملات بعد.</div>';
      }
    } catch (e) { /* الووركر غير متاح */ }
  }

  async function wlSubmitDeposit() {
    var btn = overlay.querySelector('#wlDepGo'), mm = overlay.querySelector('#wlDepMsg');
    var u = AUTH.user; var amt = Number(overlay.querySelector('#wlAmt').value);
    btn.disabled = true; msg(mm, '⏳ جارٍ التنفيذ…', true);
    try {
      if (selMethod === 'cryptomus') {
        const r = await api('/api/payments/crypto', { user_id: u.id, username: u.username, amount_usd: amt });
        if (r && r.ok) {
          msg(mm, '🪙 أرسل ' + r.amount + ' ' + (r.currency || '') + ' إلى: ' + r.address + ' — يُشحن رصيدك تلقائياً بعد التأكيد.', true);
          if (r.url) window.open(r.url, '_blank');
        } else msg(mm, '❌ ' + ((r && r.error) || 'تعذر إنشاء الفاتورة'), false);
      } else {
        var proof = overlay.querySelector('#wlProof').value.trim();
        if (!proof) { msg(mm, '❌ أدخل كود/مرجع التحويل بعد إرسال المال', false); btn.disabled = false; return; }
        const r = await api('/api/payments/p2p', { user_id: u.id, username: u.username, method: selMethod, amount_usd: amt, proof_details: proof });
        if (r && r.ok) msg(mm, '📨 سُجل طلبك قيد المراجعة — سيصلك إشعار عند التأكيد.', true);
        else msg(mm, '❌ ' + ((r && r.error) || 'فشل'), false);
      }
      wlRefresh();
    } catch (e) { msg(mm, '❌ تعذر الاتصال بنظام الدفع', false); }
    btn.disabled = false;
  }

  async function wlRedeemVoucher() {
    var mm = overlay.querySelector('#wlDepMsg');
    var code = overlay.querySelector('#wlVCode').value.trim();
    if (!code) { msg(mm, '❌ أدخل الكوبون', false); return; }
    try {
      const r = await api('/api/vouchers/redeem', { user_id: AUTH.user.id, code: code });
      if (r && r.ok) { msg(mm, '✅ تم شحن +' + r.amount_usd + ' USD', true); overlay.querySelector('#wlVCode').value = ''; wlRefresh(); }
      else msg(mm, '❌ ' + (r && r.error === 'already-used' ? 'الكوبون مستعمل مسبقاً' : r && r.error === 'invalid-code' ? 'كوبون غير صالح' : 'فشل'), false);
    } catch (e) { msg(mm, '❌ تعذر الاتصال', false); }
  }

  async function wlSubmitWithdraw() {
    var btn = overlay.querySelector('#wlWdGo'), mm = overlay.querySelector('#wlWdMsg');
    var details = overlay.querySelector('#wlWdDetails').value.trim();
    var amt = Number(overlay.querySelector('#wlWdAmt').value);
    var method = overlay.querySelector('#wlWdMethod').value;
    if (!details) { msg(mm, '❌ أدخل تفاصيل الاستلام', false); return; }
    btn.disabled = true; msg(mm, '⏳ …', true);
    try {
      const r = await api('/api/withdrawals/request', { user_id: AUTH.user.id, username: AUTH.user.username, method: method, amount_usd: amt, details: details });
      if (r && r.ok) msg(mm, '📨 طلب السحب قيد المراجعة — يُخصم المبلغ الآن ويُحوَّل بعد موافقة الأدمن.', true);
      else msg(mm, '❌ ' + (r && r.error === 'insufficient-balance' ? 'الرصيد غير كافٍ' : (r && r.error) || 'فشل'), false);
      wlRefresh();
    } catch (e) { msg(mm, '❌ تعذر الاتصال', false); }
    btn.disabled = false;
  }

  window.openWallet = async function () {
    if (!(typeof AUTH !== 'undefined' && AUTH.user)) { if (typeof toast === 'function') toast('سجّل الدخول أولاً', 'warn'); return; }
    buildOverlay();
    overlay.hidden = false;
    await resolveBase();
    try {
      const r = await api('/api/payments/methods');
      METHODS = (r && r.ok) ? r.methods : null;
    } catch (e) { METHODS = null; }
    selMethod = null;
    renderMethods();
    overlay.querySelector('#wlDepForm').hidden = true;
    overlay.querySelector('#wlVoucherRow').hidden = true;
    overlay.querySelector('#wlVGo').hidden = true;
    wlRefresh();
  };
  window.closeWallet = function () { if (overlay) overlay.hidden = true; };
})();

/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Main Application
   Initialization, Rendering, Navigation
   ═══════════════════════════════════════════ */
"use strict";
/* [v2.28] بصمة البناء: تُطبع في الكونسول ليتحقق المالك لحظياً من أن النشر
   يطابق هذا الالتزام. إن لم تظهر في الكونسول فالنشر من شجرة أقدم. */
window.DTSG_BUILD = 'v2.40.0';
try { console.info('[DTSG] build ' + window.DTSG_BUILD); } catch (e) {}
/* ═══════════ عرض الألعاب ═══════════ */
/* خريطة: معرف اللعبة → مجلد الأصول (assets/games/<folder>/icon.webp) */
const GAME_IMG = {
  rn: 'ronda', rd: 'ronda', pr: 'parchisi', av: 'crash', mn: 'mines', pl: 'plinko',
  dc: 'dice', cf: 'coin-flip', hl: 'hi-lo', wf: 'wheel', sc: 'scratch',
  wg: 'wingo', rp: 'rock-paper', pn: 'football', l7: 'lucky-7', sb: 'sic-bo',
  rl: 'roulette', bj: 'blackjack', bc: 'baccarat', dt: 'dragon', vp: 'poker',
  ke: 'keno', sl: 'slot-spin', ab: 'andar-bahar',
  rm: 'rami',
  ch: 'chess', dm: 'dama',
  bg: 'backgammon', do: 'dominoes',
  bl8: 'billiards', blbb: 'billiards', blgv: 'billiards', blsn: 'billiards', blca: 'billiards',
  crabbin: 'crabbin',
  fishing: 'fishing',
  gates: 'gates',
  lightning: 'lightning',
  lottery: 'lottery',
  mahjong: 'mahjong',
  money: 'money',
  olympus: 'olympus',
  poker: 'poker',
  rose: 'rose',
  'sweet-bonanza': 'sweet-bonanza'
};
function tileHTML(g) {
  const tagClass = { HOT: 'hot', NEW: 'new', LIVE: 'live' }[g.tag] || 'hot';
  const img = GAME_IMG[g.id];
  /* [Brand v2.40] بطاقات الهوية الرسمية للطاولة (bg) والضومنة (do) صارت داخل icon.webp
     نفسه (كان PNG مُجرَّباً أولاً ولا وجود له في المستودع ⇒ طلب 404 ثم سقوط للـwebp).
     الآن webp أولاً (بلا 404) مع إبقاء png كاحتياط لو أُضيف لاحقاً. */
  const ext = 'webp';
  const altExt = (g.id === 'do' || g.id === 'bg') ? 'png' : 'webp';
  const art = img
    ? '<div class="art ' + g.art + ' hasimg" aria-hidden="true">' +
        '<span class="art-emoji">' + (g.em || '') + '</span>' +
        /* [TileImg 2026-09-13] eager (بلا lazy): إعادة بناء innerHTML في filterG/renderGames
           كانت تستبدل البطاقات قبل بدء تحميل lazy (خارج viewport/صفحة مخفية) فتُفقد
           الصور نهائياً — البطاقات صغيرة (4-9KB) فالتحميل الفوري أرخص وأضمن */
        '<img src="assets/games/' + img + '/icon.' + ext + '?v=230" alt="" ' +
        'data-alt="assets/games/' + img + '/icon.' + altExt + '?v=230" ' +
        'onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=\'\';}else{var p=this.parentNode;this.remove();if(p)p.classList.remove(\'hasimg\');}">' +
      '</div>'
    : '<div class="art ' + g.art + '" aria-hidden="true">' + g.em + '</div>';
  const networkIndicator = [ 'rp', 'pn', 'pr', 'rn', 'rm', 'bg', 'do' ].includes(g.id) ? '<span class="net-indicator net-enabled">🔌 ' + (T('g.multi') || 'P2P') + '</span>' : '';
  const playButton = [ 'rp', 'pn', 'pr', 'rn', 'rm', 'bg', 'do' ].includes(g.id)
    ? '<button class="playbtn net-btn" onclick="Rooms.toggleFromGame()" aria-label="' + T('g.play') + ' →">' + T('g.play') + ' →</button>'
    : '<button class="playbtn" onclick="openGame(\'' + g.id + '\')" aria-label="' + T('g.play') + ' →">' + T('g.play') + ' →</button>';
  return '<div class="tile" onclick="openGame(\'' + g.id + '\')" ' +
    'role="button" tabindex="0" aria-label="' + gname(g) + '" ' +
    'onkeypress="if(event.key===\'Enter\') openGame(\'' + g.id + '\')">' +
    '<span class="gtag ' + tagClass + '">' + g.tag + '</span>' +
    '<span class="gpl"><span class="dot" aria-hidden="true"></span>' + fmt(g.pl) + '</span>' +
    art +
    '<div class="tinfo">' +
      '<div class="tname">' + gname(g) + '</div>' +
      '<div class="tmeta">' +
        '<span>' + g.d[langIndex()] + '</span>' +
        '<span class="rtp">' + g.rtp + '%</span>' +
      '</div>' +
      '<div class="tile-meta">' +
        playButton +
        networkIndicator +
      '</div>' +
    '</div>' +
    '</div>';
}
function renderGames() {
  const featured = document.getElementById('rowFeatured');
  const crash = document.getElementById('rowCrash');
  const instant = document.getElementById('rowInstant');
  const all = document.getElementById('allGames');
  const vis = g => !DISABLED[g.id];
  /* [HideEmpty 2026-09-13] عنوان القسم يختفي مع شبكته الفارغة — لا عنوان
     «كراش» ظاهراً بعد تعطيل كل ألعابه (بلاغ المالك) */
  const hideIfEmpty = (gridId, headId) => {
    const g = document.getElementById(gridId);
    const h = document.getElementById(headId);
    if (!g || !h) return;
    const empty = !(g.children && g.children.length);
    h.style.display = empty ? 'none' : '';
    g.style.display = empty ? 'none' : '';
  };
  if (featured) {
    /* [BGDO] فهرس wf ثابت بالمعرف — إدراج الطاولة/الضومنة بعد blca أزاح كل ما بعده */
    const wfIdx = GAMES.findIndex(function (x) { return x.id === 'wf'; });
    featured.innerHTML = [GAMES[0], GAMES[1], GAMES[2], GAMES[wfIdx >= 0 ? wfIdx : 17]]
      .filter(Boolean)
      .filter(vis)
      .map(tileHTML)
      .join('');
  }
  if (crash) {
    crash.innerHTML = GAMES.filter(g => g.cat === 'crash').filter(vis).map(tileHTML).join('');
  }
  if (instant) {
    instant.innerHTML = GAMES.filter(g => g.cat === 'instant').filter(vis).slice(0, 8).map(tileHTML).join('');
  }
  if (all) {
    all.innerHTML = GAMES.filter(vis).map(tileHTML).join('');
  }
  hideIfEmpty('rowFeatured', 'sheFeatured');
  hideIfEmpty('rowCrash', 'sheCrash');
  hideIfEmpty('rowInstant', 'sheInstant');
  if (typeof updateFilterChips === 'function') updateFilterChips();
}
function filterG(c, el) {
  SND.click();
  const chips = document.querySelectorAll('#gameFilters .fchip');
  chips.forEach(chip => chip.classList.remove('active'));
  if (el) {
    el.classList.add('active');
    el.setAttribute('aria-selected', 'true');
  }
  chips.forEach(chip => {
    if (chip !== el) chip.removeAttribute('aria-selected');
  });
  const list = c === 'all' ? GAMES.filter(g => !DISABLED[g.id]) : GAMES.filter(g => g.cat === c && !DISABLED[g.id]);
  const allEl = document.getElementById('allGames');
  if (allEl) allEl.innerHTML = list.map(tileHTML).join('');
}
/* [Chips 2026-09-13] فلاتر التصنيف: يظهر فقط ما فيه ألعاب مفعلة —
   لا أزرار معطلمة تشوه الصفحة (بلاغ المالك) */
function updateFilterChips() {
  const chips = document.querySelectorAll('#gameFilters .fchip');
  chips.forEach(function (chip) {
    const oc = chip.getAttribute('onclick') || '';
    const m = oc.match(/filterG\(['"]([\w-]+)['"]/);
    const cat = m ? m[1] : 'all';
    const list = cat === 'all'
      ? GAMES.filter(function (g) { return !DISABLED[g.id]; })
      : GAMES.filter(function (g) { return g.cat === cat && !DISABLED[g.id]; });
    chip.style.display = list.length ? '' : 'none';
  });
}

/* ═══════════ البطولات ═══════════ */
/* ═══════════ صفحة البطولات (حقيقية — من الـ API) ═══════════ */
function renderTourney() {
  const el = document.getElementById('tourneyList');
  if (!el) return;
  el.innerHTML = '<div class="note">…</div>';
  Promise.all([API.get('/api/tournaments'), API.get('/api/games')]).then(function (rs) {
    const ts = (rs[0].ok && rs[0].data && rs[0].data.tournaments) ? rs[0].data.tournaments : [];
    const me = AUTH.user;
    const gmap = {};
    GAMES.forEach(function (g) { gmap[g.id] = g; });
    const statusLabel = {
      pending: '⏳ ' + T('admin.tPending'),
      approved: '✅ ' + T('admin.tApproved'),
      active: '🔴 ' + T('admin.tActive'),
      finished: '🏁 ' + T('admin.tFinished'),
      rejected: '❌ ' + T('admin.tRejected')
    };
    const createBtn = '<button class="btn" onclick="openTcModal()">' + T('tourney.create') + '</button>';
    if (!ts.length) {
      el.innerHTML = '<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:12px;align-items:center">' +
        createBtn + '<div class="note">' + T('tourney.empty') + '</div></div>';
      return;
    }
    el.innerHTML = '<div style="grid-column:1/-1;display:flex;justify-content:flex-end;margin-bottom:4px">' + createBtn + '</div>' +
      ts.map(function (t) {
        const g = gmap[t.game_id] || { em: '🎮', n: t.game_id };
        const joined = me && t.players.some(function (p) { return p.id === me.id; });
        const statusSpan = '<span class="spill ' + (t.status === 'finished' ? 'bad' : (t.status === 'active' ? 'ok' : '')) + '">' + (statusLabel[t.status] || t.status) + '</span>';
        let actionBtn = '';
        if (t.status === 'approved' || t.status === 'pending') {
          if (joined) {
            actionBtn = '<span class="spill ok">' + T('tourney.joined') + '</span>';
          } else if (t.players_count < t.max_players) {
            actionBtn = '<button class="btn" onclick="joinTourney(\'' + t.id + '\')">' + T('tourney.join') + '</button>';
          } else {
            actionBtn = '<span class="spill bad">' + T('tourney.full') + '</span>';
          }
        } else if (t.status === 'active') {
          actionBtn = '<span class="spill ok">🔴</span>';
        } else {
          actionBtn = '—';
        }
        return '<div class="card">' +
          '<div style="font-size:1.6rem;text-align:center">' + g.em + '</div>' +
          '<b>' + esc(t.name) + '</b>' +
          '<div class="mrow"><span>' + T('tourney.game') + '</span><b>' + esc(gname(g)) + '</b></div>' +
          '<div class="mrow"><span>' + T('tourney.owner') + '</span><b>' + esc(t.owner_name) + '</b></div>' +
          '<div class="mrow"><span>' + T('tourney.prize') + '</span><b class="gold-text">🪙 ' + fmt(t.prize) + '</b></div>' +
          '<div class="mrow"><span>' + T('tourney.players') + '</span><b>' + t.players_count + '/' + t.max_players + '</b></div>' +
          (t.entry_fee > 0 ? '<div class="mrow"><span>' + T('tourney.fee') + '</span><b>🪙 ' + fmt(t.entry_fee) + '</b></div>' : '') +
          '<div class="mrow"><span>' + T('admin.status') + '</span>' + statusSpan + '</div>' +
          '<div style="margin-top:8px;text-align:center">' + actionBtn + '</div>' +
        '</div>';
      }).join('');
  }).catch(function () {
    el.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}

/* ── صفحة غرف اللعب المفتوحة: انضمام أو فرجة ── */
function renderRooms() {
  const el = document.getElementById('roomsList');
  if (!el) return;
  /* [RoomFlow] لا مسح قبل الجلب — التحديث الدوري كان يجعل الغرف تومض وتختفي كل 5 ثوانٍ */
  if (!el.childElementCount) el.innerHTML = '<div class="note">…</div>';
  API.get('/api/rooms').then(function (r) {
    const rooms = (r.ok && r.data && r.data.rooms) ? r.data.rooms : [];
    if (!rooms.length) {
      el.innerHTML = '<div class="note" style="grid-column:1/-1;text-align:center">' + T('rooms.empty') + '</div>';
      return;
    }
    const gmap = {};
    GAMES.forEach(function (g) { gmap[g.id] = g; });
    el.innerHTML = rooms.map(function (rm) {
      const g = gmap[rm.game_id] || { em: '🎮', n: rm.game_id };
      const statusSpan = rm.status === 'playing'
        ? '<span class="spill bad">🔴 ' + T('rooms.playing') + '</span>'
        : '<span class="spill ok">⏳ ' + T('rooms.waiting') + '</span>';
      let action = '';
      /* [RoomFlow] كل غرفة قابلة للدخول: مقعد إن وُجد، وإلا فرجة (حتى أثناء اللعب) */
      if (rm.status === 'waiting' && rm.players_count < rm.max_players) {
        action = '<button class="btn" onclick="joinOpenRoom(\'' + esc(rm.code) + '\')">' + T('rooms.join') + '</button>';
      } else {
        action = '<button class="btn ghost" onclick="joinOpenRoom(\'' + esc(rm.code) + '\')">👁️ ' + (T('rooms.spectate') || 'مشاهدة') + '</button>';
      }
      return '<div class="card">' +
        '<div style="font-size:1.6rem;text-align:center">' + g.em + '</div>' +
        '<b>' + esc(gname(g)) + '</b>' +
        '<div class="mrow"><span>' + T('rooms.host') + '</span><b>' + esc(rm.owner_name) + '</b></div>' +
        '<div class="mrow"><span>' + T('rooms.players') + '</span><b>' + rm.players_count + '/' + rm.max_players + '</b></div>' +
        '<div class="mrow"><span>' + T('rooms.code') + '</span><b dir="ltr">' + esc(rm.code) + '</b></div>' +
        '<div class="mrow"><span>' + T('admin.status') + '</span>' + statusSpan + '</div>' +
        '<div style="margin-top:8px;text-align:center">' + action + '</div>' +
      '</div>';
    }).join('');
  }).catch(function () {
    el.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}
function joinOpenRoom(code) {
  if (typeof Rooms !== 'undefined' && Rooms.joinRoom) Rooms.joinRoom(code);
}
/* ولوج غرفة عبر كود خاص (مدخل من صفحة الغرف) — كلاعب أو متفرج */
function joinRoomByCode() {
  var inp = document.getElementById('roomCodeInput');
  if (!inp) return;
  var code = (inp.value || '').trim();
  if (!code) {
    if (typeof toast === 'function') toast((T('rooms.enterCode') || 'أدخل كود الغرفة') + ' ⚠', 'warn');
    inp.focus();
    return;
  }
  joinOpenRoom(code);
}

/* ── إنشاء بطولة (مودال) ── */
function openTcModal() {
  if (!AUTH.user) { toast(T('auth.sessionExpired'), 'warn'); return; }
  const sel = document.getElementById('tcGame');
  if (sel) {
    /* [Policy 2026-09-16] تُعاد التعبئة عند كل فتح — المعطلة تختفي */
    const allowed = ['rn', 'rp', 'pn', 'pr', 'ke', 'av', 'rl', 'bj', 'bc'];
    sel.innerHTML = GAMES.filter(function (g) { return allowed.indexOf(g.id) >= 0 && !DISABLED[g.id]; })
      .map(function (g) { return '<option value="' + g.id + '">' + g.em + ' ' + esc(gname(g)) + '</option>'; })
      .join('');
  }
  const msg = document.getElementById('tcMsg');
  if (msg) msg.textContent = '';
  const mw = document.getElementById('tcModal');
  if (mw) mw.classList.add('show');
}
function closeTcModal() {
  const mw = document.getElementById('tcModal');
  if (mw) mw.classList.remove('show');
}
function createTourney() {
  const nameEl = document.getElementById('tcName');
  const maxEl = document.getElementById('tcMax');
  const feeEl = document.getElementById('tcFee');
  const name = nameEl ? nameEl.value.trim() : '';
  const game_id = (document.getElementById('tcGame') || {}).value;
  const max_players = parseInt(maxEl ? maxEl.value : '8', 10);
  const entry_fee = parseInt(feeEl ? feeEl.value : '0', 10);
  if (!name) { toast(T('tourney.name') + ' ⚠', 'warn'); return; }
  API.post('/api/tournaments', {
    name: name,
    game_id: game_id,
    max_players: Number.isNaN(max_players) ? 8 : max_players,
    entry_fee: Number.isNaN(entry_fee) ? 0 : entry_fee
  }).then(function (r) {
    if (r.ok) {
      const st = r.data.tournament && r.data.tournament.status;
      toast((st === 'approved' ? T('admin.tApproved') : T('admin.tPending')) + ' ✔', 'ok');
      closeTcModal();
      renderTourney();
      if (typeof wallet === 'function') wallet();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}
function joinTourney(id) {
  API.post('/api/tournaments/join', { id: id }).then(function (r) {
    if (r.ok) {
      toast(T('tourney.join') + ' ✔', 'ok');
      renderTourney();
      if (typeof wallet === 'function') wallet();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

/* ═══════════ تحويل الكوينز بين اللاعبين ═══════════ */
function openTrModal() {
  if (!AUTH.user) { toast(T('tr.needLogin'), 'warn'); return; }
  const msg = document.getElementById('trMsg');
  if (msg) msg.textContent = '';
  const mw = document.getElementById('trModal');
  if (mw) mw.classList.add('show');
  loadTrHistory();
}
function closeTrModal() {
  const mw = document.getElementById('trModal');
  if (mw) mw.classList.remove('show');
}
function sendCoins() {
  const to = ((document.getElementById('trTo') || {}).value || '').trim();
  const amtEl = document.getElementById('trAmt');
  const amount = Math.round(parseFloat(amtEl ? amtEl.value : '0') * 100) / 100;
  if (!to) { toast((T('tr.recipient') || 'يرجى إدخال اسم المستلم') + ' ⚠', 'warn'); return; }
  if (Number.isNaN(amount) || amount < 0.01) { toast(T('tr.badAmount') || 'المبلغ غير صالح', 'err'); return; }
  if (AUTH.user && to === AUTH.user.username) { toast(T('tr.self') || 'لا يمكنك التحويل لنفسك', 'warn'); return; }
  if (ST.gold < amount) {
    toast(T('ts.noc') || 'رصيدك غير كافٍ', 'err');
    if (typeof SND !== 'undefined' && SND.lose) SND.lose();
    return;
  }
  
  // اقتطاع أوتوماتيكي فوري من رصيد اللاعب
  ST.gold -= amount;
  if (AUTH.user) AUTH.user.gold = ST.gold;
  wallet();
  save();
  if (typeof SND !== 'undefined' && SND.coin) SND.coin();

  API.post('/api/transfer', { to: to, amount: amount }).then(function (r) {
    if (r.ok) {
      toast('🪙 ' + fmt(amount) + ' → ' + esc(r.data.to || to) + ' ✔', 'ok');
      if (amtEl) amtEl.value = '100';
      if (typeof r.data === 'object' && typeof r.data.gold === 'number') {
        ST.gold = r.data.gold;
        if (AUTH.user) AUTH.user.gold = r.data.gold;
      }
      wallet();
      save();
      loadTrHistory();
      if (typeof renderTransactions === 'function') renderTransactions();
    } else {
      // استرداد الرصيد في حال رفض الخادم
      ST.gold += amount;
      if (AUTH.user) AUTH.user.gold = ST.gold;
      wallet();
      save();
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  }).catch(function () {
    ST.gold += amount;
    if (AUTH.user) AUTH.user.gold = ST.gold;
    wallet();
    save();
    toast(T('auth.error'), 'err');
  });
}
function loadTrHistory() {
  const list = document.getElementById('trList');
  if (!list) return;
  list.innerHTML = '<div class="note">…</div>';
  API.get('/api/transfers').then(function (r) {
    const trs = (r.ok && r.data && r.data.transfers) ? r.data.transfers : [];
    if (!trs.length) { list.innerHTML = '<div class="note">' + T('tr.noHistory') + '</div>'; return; }
    const meId = AUTH.user ? AUTH.user.id : null;
    list.innerHTML = trs.map(function (tr) {
      const ty = tr.type || (tr.from_id === meId ? 'transfer_out' : 'transfer_in');
      const outgoing = ty === 'transfer_out' || (ty === 'transfer' && tr.from_id === meId);
      const inflow = ty === 'charge' || ty === 'referral_bonus' || ty === 'claim' || ty === 'transfer_in';
      const who = (ty === 'charge' || ty === 'set_balance') ? (tr.note || tr.from_name || '—')
        : (ty === 'deduct') ? (tr.to_name || '—')
        : (outgoing ? tr.to_name : tr.from_name);
      const sign = inflow ? '+' : '−';
      return '<div class="trow"><span>' + (inflow ? '←' : '→') + ' ' + esc(who) + '</span>' +
        '<b class="' + (inflow ? 'gold-text' : '') + '">' + sign + ' 🪙 ' + fmt(tr.amount) + '</b></div>';
    }).join('');
  }).catch(function () {
    list.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}
/* ═══════════ صفحة سجل المعاملات ═══════════ */
function openTransactionHistory() {
  if (!AUTH.user) { toast(T('tr.needLogin'), 'warn'); return; }
  closeAcctMenu();
  nav('transactions', null);
  renderTransactions();
}
function renderTransactions() {
  const pg = document.getElementById('pg-transactions');
  if (!pg || !pg.classList.contains('active')) return;
  const txTransfers = document.getElementById('txTransfers');
  const txRounds = document.getElementById('txRounds');
  if (!txTransfers || !txRounds) return;
  if (!AUTH.user) {
    txTransfers.innerHTML = '<div class="note">' + T('tr.needLogin') + '</div>';
    txRounds.innerHTML = '<div class="note">' + T('tr.needLogin') + '</div>';
    return;
  }
  /* التحويلات والمعاملات متعددة الأنواع (transfer_out/in, charge, deduct, set_balance, referral_bonus, claim) */
  txTransfers.innerHTML = '<div class="note">…</div>';
  API.get('/api/transfers').then(function (r) {
    const trs = (r.ok && r.data && r.data.transfers) ? r.data.transfers : [];
    if (!trs.length) { txTransfers.innerHTML = '<div class="note">' + T('tr.noHistory') + '</div>'; return; }
    const meId = AUTH.user.id;
    /* شارة النوع: ok للواردات والشحن، bad للصادرات والسحب، عادية لضبط الرصيد */
    const badgeFor = function (ty, outgoing) {
      switch (ty) {
        case 'charge': return { cls: 'ok', label: T('tr.charge') };
        case 'deduct': return { cls: 'bad', label: T('tr.deduct') };
        case 'set_balance': return { cls: '', label: T('tr.setBalance') };
        case 'referral_bonus': return { cls: 'ok', label: T('tr.refBonus') };
        case 'claim': return { cls: 'ok', label: T('tr.claimBadge') };
        case 'transfer_out': return { cls: 'bad', label: '→ ' + T('tr.sent') };
        case 'transfer_in': return { cls: 'ok', label: '← ' + T('tr.received') };
        default: return { cls: outgoing ? 'bad' : 'ok', label: (outgoing ? '→ ' : '← ') + (outgoing ? T('tr.sent') : T('tr.received')) };
      }
    };
    txTransfers.innerHTML =
      '<table class="atable tr-t">' +
      '<thead><tr>' +
        '<th>' + T('tr.type') + '</th>' +
        '<th>' + T('tr.counterparty') + '</th>' +
        '<th>' + T('tr.sent') + '</th>' +
        '<th>' + T('tr.received') + '</th>' +
        '<th>' + T('tr.time') + '</th>' +
      '</tr></thead><tbody>' +
      trs.map(function (tr) {
        const ty = tr.type || (tr.from_id === meId ? 'transfer_out' : 'transfer_in');
        const outgoing = ty === 'transfer_out' || (ty === 'transfer' && tr.from_id === meId);
        const badge = badgeFor(ty, outgoing);
        const t = tr.created_at ? new Date(tr.created_at * 1000).toLocaleString() : '—';
        let who = outgoing ? tr.to_name : tr.from_name;
        let sentCell = '<td>—</td>';
        let recvCell = '<td>—</td>';
        if (ty === 'charge') {
          /* شحن من مشرف: المرسل '—' والمستلم '+amount' والطرف = from_name */
          who = tr.from_name;
          recvCell = '<td class="gold-text">+ 🪙 ' + fmt(tr.amount) + '</td>';
        } else if (ty === 'deduct') {
          /* سحب: المرسل '−amount' والمستلم '—' والطرف = to_name */
          who = tr.to_name;
          sentCell = '<td>− 🪙 ' + fmt(tr.amount) + '</td>';
        } else if (ty === 'set_balance') {
          /* ضبط رصيد: المبلغ في ملاحظة إن وُجدت وإلا علامة تساوي */
          who = tr.note || '= 🪙 ' + fmt(tr.amount);
        } else if (ty === 'referral_bonus' || ty === 'claim') {
          /* هدية إحالة / مكافأة: المبلغ في عمود المستلم */
          recvCell = '<td class="gold-text">+ 🪙 ' + fmt(tr.amount) + '</td>';
        } else {
          /* تحويل صادر/وارد كما هو */
          sentCell = outgoing ? '<td>− 🪙 ' + fmt(tr.amount) + '</td>' : '<td>—</td>';
          recvCell = outgoing ? '<td>—</td>' : '<td class="gold-text">+ 🪙 ' + fmt(tr.amount) + '</td>';
        }
        return '<tr>' +
          '<td><span class="spill ' + badge.cls + '">' + badge.label + '</span></td>' +
          '<td>' + esc(who || '—') + '</td>' +
          sentCell + recvCell +
          '<td>' + t + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }).catch(function () {
    txTransfers.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
  /* سجل المراهنات (الألعاب) */
  txRounds.innerHTML = '<div class="note">…</div>';
  API.get('/api/rounds').then(function (r) {
    const rounds = (r.ok && r.data && r.data.rounds) ? r.data.rounds : [];
    if (!rounds.length) { txRounds.innerHTML = '<div class="note">' + T('tr.noHistory') + '</div>'; return; }
    txRounds.innerHTML =
      '<table class="atable tr-t">' +
      '<thead><tr>' +
        '<th>' + T('tr.game') + '</th>' +
        '<th>' + T('tr.bet') + '</th>' +
        '<th>' + T('tr.outcome') + '</th>' +
        '<th>' + T('tr.time') + '</th>' +
      '</tr></thead><tbody>' +
      rounds.map(function (rd) {
        const g = (typeof GAMES !== 'undefined') ? GAMES.find(function (x) { return x.id === rd.game_id; }) : null;
        const label = g ? (g.em + ' ' + esc(gname(g))) : esc(rd.game_id);
        const outcome = rd.won
          ? '<span class="spill ok">+🪙 ' + fmt(rd.payout) + '</span>'
          : '<span class="spill bad">−🪙 ' + fmt(rd.bet) + '</span>';
        const t = rd.created_at ? new Date(rd.created_at * 1000).toLocaleString() : '—';
        return '<tr>' +
          '<td>' + label + '</td>' +
          '<td>🪙 ' + fmt(rd.bet) + '</td>' +
          '<td>' + outcome + '</td>' +
          '<td>' + t + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }).catch(function () {
    txRounds.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}
/* ═══════════ صفحة سجل الحساب ═══════════ */
function openAccountLog() {
  if (!AUTH.user) { toast(T('tr.needLogin'), 'warn'); return; }
  closeAcctMenu();
  nav('account', null);
  if (typeof init2fa === 'function') init2fa();
  renderAccountLog();
}
function renderAccountLog() {
  const pg = document.getElementById('pg-account');
  if (!pg || !pg.classList.contains('active')) return;
  const el = document.getElementById('accountInfo');
  if (!el) return;
  if (!AUTH.user) {
    el.innerHTML = '<div class="note">' + T('tr.needLogin') + '</div>';
    return;
  }
  const u = AUTH.user;
  const joined = u.created_at ? new Date(u.created_at * 1000).toLocaleString() : T('acct.na');
  const lastSeen = u.last_seen ? new Date(u.last_seen * 1000).toLocaleString() : T('acct.na');
  el.innerHTML =
    '<table class="atable">' +
    '<tbody>' +
      '<tr><th>' + T('auth.username') + '</th><td><b>' + esc(u.username) + '</b></td></tr>' +
      '<tr><th>' + T('auth.balance') + '</th><td>🪙 ' + fmt(u.gold) + '</td></tr>' +
      '<tr><th>' + T('admin.role') + '</th><td>' + roleLabel(u.role) + '</td></tr>' +
      '<tr><th>' + T('acct.joined') + '</th><td>' + joined + '</td></tr>' +
      '<tr><th>' + T('acct.lastSeen') + '</th><td>' + lastSeen + '</td></tr>' +
      (u.admin_id ? '<tr><th>' + T('acct.adminRef') + '</th><td>' + esc(String(u.admin_id)) + '</td></tr>' : '') +
      (u.ref_code
        ? '<tr><th>🎁 ' + T('admin.myRefCode') + '</th><td><b dir="ltr" style="font-family:monospace;color:var(--gold);letter-spacing:1px">' + esc(u.ref_code) + '</b>' +
          '<div style="font-size:.75rem;color:var(--t3);margin-top:4px">' + T('admin.refCodeShare') + '</div></td></tr>'
        : '') +
    '</tbody></table>';
}
/* خريطة محرك التهيئة — تُستدعى بعد رسم واجهة اللعبة */
function initFor(eng) {
  const map = {
    ronda: (typeof initRonda === 'function') ? initRonda : null,
    rondacard: (typeof initRondaCard === 'function') ? initRondaCard : null,
    dama: (typeof initDama === 'function') ? initDama : null,
    chess: (typeof initChess === 'function') ? initChess : null,
    billiards: (typeof initBilliards === 'function') ? initBilliards : null,
    rami: (typeof initRami === 'function') ? initRami : null,
    backgammon: (typeof initBackgammon === 'function') ? initBackgammon : null,
    dominoes: (typeof initDominoes === 'function') ? initDominoes : null,
    plinko: (typeof initPlinko === 'function') ? initPlinko : null,
    wheel: (typeof initWheel === 'function') ? initWheel : null,
    hilo: (typeof initHilo === 'function') ? initHilo : null,
    rl: (typeof initRoulette === 'function') ? initRoulette : null,
    crash: (typeof window.initCrash === 'function') ? window.initCrash : null
  };
  return map[eng] || null;
}
function openGame(id) {
  /* لعبة معطلة من قبل الأدمن */
  if (DISABLED[id]) {
    toast(T('admin.gameDisabledMsg') || 'اللعبة معطلة حالياً', 'warn');
    return;
  }
  const g = GAMES.find(x => x.id === id);
  if (!g) {
    toast(T('g.notFound') || 'اللعبة غير موجودة', 'err');
    return;
  }
  SND.click();
  /* إغلاق أي مودال قديم أولاً — cleanupCrash() يجب أن يسبق initCrash()
     وإلا صُفّر scene ثلاثي الأبعاد أثناء await التهيئة فيكسر لعبة Crash */
  closeModal();
  window._currentGameId = id;
  /* [Training 2026-09-16] كل لعبة تبدأ غير تدريبية؛ أوضاع البوت/المحلي فقط تفعّلها */
  window.TRAINING = window.TRAINING || { on: false };
  window.TRAINING.on = false;
  /* فحص جلسة سابقة: إن انتهت جولتها أثناء الغياب → إشعار */
  if (typeof window.SessionResume !== 'undefined') {
    try { window.SessionResume.onGameOpen(id); } catch (e) {}
  }
  /* زر «العب مع صديق» فقط للألعاب المدعومة (rp/pn/pr) */
  if (typeof Rooms !== 'undefined' && Rooms.syncBtn) Rooms.syncBtn();
  /* رأس صفحة اللعبة */
  const iconEl = document.getElementById('gamePageIcon');
  const nameEl = document.getElementById('gamePageName');
  if (iconEl) iconEl.textContent = g.em;
  if (nameEl) nameEl.textContent = gname(g);
  const bodyEl = document.getElementById('gamePageBody');
  if (!bodyEl) return;

  /* استئناف الجولة المفتوحة: لألعاب الورق/اللوحة المحلية (متعددة الأدوار)
     نُجمّد حالة اللعبة عند الخروج ونعيدها كما هي عند العودة — دون بدء جولة جديدة.
     (الألعاب الفورية كالكراش/الكينو لا تُستأنف: تُسجَّل نتائجها في السجل فقط) */
  var RESUMABLE = ['rm', 'rn', 'bj', 'pr'];
  /* [PR-Sync] جولة غرفة جارية لنفس اللعبة: الاستئناف المجمّد يعرض لوحة قديمة متجمدة —
     يجب إعادة البناء الكاملة ليُعاد بناء الجولة من سجل الخادم (room:replay) */
  var roomLive = typeof Rooms !== 'undefined' && Rooms.state &&
    Rooms.state.game_id === id && Rooms.state.status === 'playing';
  if (!roomLive && RESUMABLE.indexOf(id) !== -1 && window._liveGameId === id &&
      bodyEl.children.length > 0 && window.SessionResume && window.SessionResume.isResumable()) {
    window._currentGameId = id;
    nav('game', null);
    window.scrollTo(0, 0);
    startGameHistory(id);
    if (id === 'rm') { try { window.SessionResume.markRoundStart({ gameId: id }); } catch (e) {} }
    enterAppFullscreen();
    var fab0 = document.getElementById('floatingReactionsFab');
    if (fab0) fab0.style.display = 'flex';
    document.body.classList.add('rami-game-open');
    setTimeout(checkRotateHint, 180);
    return; /* لا إعادة رسم — استئناف الجولة كما هي */
  }

  /* Parchisi: يُستنسخ من القالب داخل صفحة اللعبة */
  if (id === 'pr') {
    const tpl = document.getElementById('parchisiTpl');
    if (tpl) {
      bodyEl.innerHTML = tpl.innerHTML;
      ParchisiApp.init();
    }
  } else {
    const engFn = (typeof ENG !== 'undefined' && ENG[g.eng]) || eSlots;
    bodyEl.innerHTML = engFn(g);
    const initFn = initFor(g.eng);
    if (initFn) {
      try { initFn(); } catch (e) { console.error('Init error:', e); }
    }
  }
  /* اللعبة الحالية وفتح الصفحة (closeModal سبق تنفيذه قبل الرسم) */
  window._currentGameId = id;
  window._liveGameId = id;     /* تتبّع آخر لعبة حيّة (DOM) للاستئناف */
  nav('game', null);
  window.scrollTo(0, 0);
  startGameHistory(id);
  /* الرامي: لعبة أشواط متعددة — تُعلَّم جلسة قابلة للاستئناف عند الفتح */
  if (id === 'rm' && typeof window.SessionResume !== 'undefined') {
    try { window.SessionResume.markRoundStart({ gameId: id }); } catch (e) {}
  }
  /* اللعب الجماعي (كينو/كراش): تفعيل لوحة الجولة + السجل الحي */
  if ((id === 'ke' || id === 'av') && typeof Group !== 'undefined') {
    Group.activate(id);
  }
  /* الشاشة الممتلئة افتراضياً عند فتح أي لعبة (على مستوى التطبيق):
     تُخفي هيدر اللعبة وسجل الجولات وتبقي محيط اللعبة وأزرارها + زر الخروج الذهبي العائم.
     نطلب أيضاً ملء شاشة المتصفح إن سُمح (للانغماس الكامل) ونتجاهل الرفض بصمت. */
  enterAppFullscreen();
  /* [F1] اطلب ملء الشاشة على جذر المستند (وليس #pg-game) كي تبقى كل الطبقات ظاهرة */
  if (gameFsSupported()) {
    const rootEl = document.documentElement;
    const fn = rootEl.requestFullscreen || rootEl.webkitRequestFullscreen;
    if (fn) {
      try {
        const p = fn.call(rootEl);
        if (p && typeof p.catch === 'function') p.catch(function () { /* مرفوض — لا مشكلة */ });
      } catch (e) { /* غير مدعوم في هذا السياق */ }
    }
  }
  /* نافذة القواعد لا تُفتح إلا عند الضغط على أيقونة «القواعد» */
  /* إظهار الأيقونة العائمة للتفاعلات داخل الألعاب فقط */
  const fab = document.getElementById('floatingReactionsFab');
  if (fab) fab.style.display = 'flex';

  /* قفل تمرير الصفحة أثناء اللعب: الطاولة تملأ الـ viewport بدون سكرول */
  document.body.classList.add('rami-game-open');

  /* فحص فرض الوضع العرضي بعد رسم المرحلة (للألعاب العريضة على الموبايل) */
  setTimeout(checkRotateHint, 180);
  /* [Layout] تحجيم ديناميكي: اللعبة تملأ الإطار بالكامل وتتوسّع/تتقلّص حسب الشاشة */
  fitGameStageSoon();
}
function closeGamePage() {
  /* الخروج من وضع الشاشة الممتلئة أولاً */
  if (typeof exitAppFullscreen === 'function') exitAppFullscreen();
  document.body.classList.remove('rami-game-open');
  const fab = document.getElementById('floatingReactionsFab');
  if (fab) fab.style.display = 'none';

  stopGameHistory();
  /* إيقاف لوحة الجولات الجماعية إن كانت نشطة */
  if (typeof Group !== 'undefined') Group.deactivate();
  /* مغادرة صامتة لأي غرفة (الانضمام عبر زر الرجوع من صفحة اللعبة)
     [Persist] استثناء: جولة جماعية جارية — تبقى العضوية والجولة حية ليعود إليها
     اللاعب من صفحة اللعبة/الغرف/الرابط؛ الحركات تُعاد من سجل الخادم عند العودة. */
  if (typeof Rooms !== 'undefined') {
    if (!(Rooms.state && Rooms.state.status === 'playing')) Rooms.leaveQuiet();
  }

  /* ألعاب الورق/اللوحة المحلية (متعددة الأدوار): نُجمّد DOMها وحالتها
     لاستئناف الجولة كما هي عند العودة. غيرها يُنظَّف كالمعتاد. */
  var RESUMABLE = ['rm', 'rn', 'bj', 'pr'];
  var curId = window._currentGameId;
  var keepLive = RESUMABLE.indexOf(curId) !== -1 &&
    window.SessionResume && window.SessionResume.isResumable();
  /* [PR-Sync] جولة غرفة جارية: DOM المجمد يفقد المزامنة — التنظيف ثم إعادة البناء من السجل عند العودة */
  if (typeof Rooms !== 'undefined' && Rooms.state && Rooms.state.status === 'playing' &&
      Rooms.state.game_id === curId) keepLive = false;

  window._currentGameId = null;
  /* تنظيف Crash إن كان نشطاً */
  if (typeof cleanupCrash === 'function') {
    cleanupCrash();
  }
  /* تنظيف روندا الكلاسيكية (المحرك المستورد) عند مغادرة الصفحة */
  if (typeof cleanupRondaCard === 'function') {
    try { cleanupRondaCard(); } catch (e) { console.error('cleanupRondaCard error:', e); }
  }
  /* [BGDO] تنظيف الطاولة والضومنة (المشروعان المستقلان) عند مغادرة الصفحة */
  if (typeof cleanupBackgammon === 'function') {
    try { cleanupBackgammon(); } catch (e) { console.error('cleanupBackgammon error:', e); }
  }
  if (typeof cleanupDominoes === 'function') {
    try { cleanupDominoes(); } catch (e) { console.error('cleanupDominoes error:', e); }
  }
  if (!keepLive) {
    window._liveGameId = null;
    var gbEl = document.getElementById('gamePageBody');
    if (gbEl) gbEl.innerHTML = '';
  }
  /* فصل راصد تحجيم المرحلة عند مغادرة اللعبة */
  if (_stageRO) { try { _stageRO.disconnect(); } catch (e) {} _stageRO = null; _stageROEl = null; }
  /* خروج تلقائي من ملء الشاشة إن كنا فيه */
  const doc = document;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    const ex = doc.exitFullscreen || doc.webkitExitFullscreen;
    if (ex) ex.call(doc);
  }
  const gamesNav = document.querySelector('[data-nav=games]');
  nav('games', gamesNav || null);
  window.scrollTo(0, 0);
}
/* ═══════════ ملء الشاشة للعبة ═══════════ */
function gameFsSupported() {
  const d = document;
  return !!(d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen);
}
/* ═══════════ ملء الشاشة للعبة (على مستوى التطبيق) ═══════════ */
/* الوضع الافتراضي للعبة = الشاشة الممتلئة. يُخفي هيدر اللعبة وسجل الجولات،
   ويبقي محيط اللعبة وأزرارها + زر خروج ذهبي عائم في أعلى اليمين. */
function enterAppFullscreen() {
  const pg = document.getElementById('pg-game');
  if (!pg) return;
  /* أوّلاً: صفحة اللعبة إلى أعلى الشاشة — وإلا بقيت إزاحة فوقها تقصّ أسفلها */
  try { window.scrollTo(0, pg.offsetTop); } catch (e) {}
  pg.classList.add('app-fs');
  document.body.classList.add('app-fs-on');
  if (typeof syncGameFsBtn === 'function') syncGameFsBtn();
  setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 60);
}
/* تحجيم ديناميكي للألعاب: تلائم مرحلة اللعبة (.stage) كاملةً داخل إطار الشاشة،
   تتوسّع وتتقلّص حسب أبعاد الشاشة دون قصّ. تُستثنى الرامي (لها تحجيمها الخاص بالأوراق). */
var _fitStageT = 0;
var _stageRO = null;       /* ResizeObserver — يعيد الملاءمة عند تغيّر محتوى المرحلة */
var _stageROEl = null;     /* العنصر المراقَب حالياً */
/* رصد تغيّر حجم المرحلة (توزيع أوراق، كشف شبكة، فتح قواعد…) لإعادة الملاءمة فوراً.
   آمن من الحلقة: transform/marginBottom لا يغيّران صندوق الإطار (border-box) المرصود. */
function _observeStage(stage) {
  if (_stageROEl === stage) return;
  if (typeof ResizeObserver === 'undefined') return;
  if (_stageRO) _stageRO.disconnect();
  _stageRO = new ResizeObserver(function () {
    clearTimeout(_fitStageT);
    _fitStageT = setTimeout(fitGameStage, 80);
  });
  _stageRO.observe(stage);
  _stageROEl = stage;
}
function fitGameStage() {
  var body = document.getElementById('gamePageBody');
  if (!body) return;
  var stage = body.querySelector('.stage');
  if (!stage) return;
  /* الرامي له تحجيمه الخاص عبر --card-w ؛ الرندا (فلات دوغ) وضاما يملأون الشاشة 100% */
  if (stage.id === 'rnContainer' || stage.id === 'damaStage' || stage.id === 'rdStage' || stage.querySelector('#ramiContainer')) return;
  _observeStage(stage);
  var availW = body.clientWidth;
  var availH = body.clientHeight;
  if (availW < 40 || availH < 40) return;
  /* قياس الحجم الطبيعي بصندوق الإطار: offsetWidth/Height لا يتأثر بالـ transform
     ويشمل الإطار (border) والحشو (padding) — فيطابق المستطيل المرئي تماماً.
     (scrollWidth/Height يُسقطان سُمك الإطار فيظهران أصغر فيُكبَّر الخطأ بـ transform.) */
  var natW = stage.offsetWidth;
  var natH = stage.offsetHeight;
  if (natW < 10 || natH < 10) return;
  var scale = Math.min(availW / natW, availH / natH);
  /* اسمح بتكبير محدود على الشاشات الواسعة، ومنع تقلّص مفرط */
  scale = Math.max(0.3, Math.min(scale, 1.5));
  var scaledH = natH * scale;
  var yOff = Math.max(0, (availH - scaledH) / 2);
  stage.style.transformOrigin = 'top center';
  stage.style.transform = 'translateY(' + Math.round(yOff) + 'px) scale(' + (Math.round(scale * 1000) / 1000) + ')';
  stage.style.marginBottom = Math.round(scaledH - natH) + 'px';   /* تعويض الحجز الطباعي لمنع الفجوة والقصّ */
}
function fitGameStageSoon() {
  clearTimeout(_fitStageT);
  _fitStageT = setTimeout(fitGameStage, 60);
  setTimeout(fitGameStage, 320);   /* إعادة قياس بعد اكتمال رسم الكانفاس/الأصول */
}
if (typeof window !== 'undefined') {
  window.fitGameStage = fitGameStage;
  window.fitGameStageSoon = fitGameStageSoon;
}

function exitAppFullscreen() {
  const pg = document.getElementById('pg-game');
  if (pg) pg.classList.remove('app-fs');
  document.body.classList.remove('app-fs-on');
  /* صفحة اللعبة إلى أعلى الشاشة ثم قياس الشريط — الحاوية تملأ حتى أسفل الشاشة بلا قصّ */
  try { window.scrollTo(0, pg ? pg.offsetTop : 0); } catch (e) {}
  if (typeof syncPgTop === 'function') syncPgTop();
  /* الخروج من ملء شاشة المتصفح إن كنا فيه */
  const doc = document;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    const ex = doc.exitFullscreen || doc.webkitExitFullscreen;
    if (ex) { try { ex.call(doc); } catch (e) {} }
  }
  if (typeof syncGameFsBtn === 'function') syncGameFsBtn();
  if (typeof syncPgTop === 'function') syncPgTop();
  /* عند الخروج من الانغماس: إعادة قياس حاوية اللعبة (أصغر الآن لاحتضان الشريط) */
  if (typeof fitGameStageSoon === 'function') fitGameStageSoon();
  setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 60);
}
function toggleGameFullscreen() {
  const pg = document.getElementById('pg-game');
  if (!pg) return;
  if (pg.classList.contains('app-fs')) {
    exitAppFullscreen();
  } else {
    enterAppFullscreen();
    /* [F1] ملء شاشة المتصفح على جذر المستند ليبقى HUD والزر العائم والمودالات ظاهرة */
    if (gameFsSupported()) {
      const rootEl = document.documentElement;
      const fn = rootEl.requestFullscreen || rootEl.webkitRequestFullscreen;
      if (fn) {
        try {
          const p = fn.call(rootEl);
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) {}
      }
    }
  }
}
function syncGameFsBtn() {
  const btn = document.getElementById('gameFsBtn');
  if (!btn) return;
  const pg = document.getElementById('pg-game');
  const on = (pg && pg.classList.contains('app-fs')) || document.fullscreenElement || document.webkitFullscreenElement;
  const label = on ? T('ui.exitFullscreen') : T('ui.fullscreen');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  const ico = btn.querySelector('i');
  if (ico) ico.className = on ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
}
/* مزامنة --vvh مع ارتفاع الشاشة المرئي (visualViewport) — يَعِد bar العنوان
   وتغيّر الاتجاه وفتح لوحة المفاتيح، فتبقى حاوية اللعبة داخل المجال المرئي تماماً */
function syncVisualViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty('--vvh', Math.round(h) + 'px');
}
/* [F8] عند فتح لوحة المفاتيح: وسّط الحقل المركّز عمودياً كي لا يُقطَع (داخل المودال أيضاً) */
function centerFocusedOnKeyboard() {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
  }
}
window.syncVisualViewport = syncVisualViewport;
window.centerFocusedOnKeyboard = centerFocusedOnKeyboard;
syncVisualViewport();
if (typeof window !== 'undefined') {
  window.addEventListener('resize', syncVisualViewport);
  window.addEventListener('orientationchange', function () { setTimeout(syncVisualViewport, 250); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { syncVisualViewport(); centerFocusedOnKeyboard(); }, { passive: true });
    window.visualViewport.addEventListener('scroll', syncVisualViewport, { passive: true });
  }
}

/* مزامنة --pg-top مع الإزاحة الفعلية لصفحة اللعبة كي تملأ الـ viewport بالضبط
   وتتوزّع الحاويات الثلاث (هيدر/لعبة/سجل) بلا قصّ أسفل الشاشة. */
function syncPgTop() {
  const pg = document.getElementById('pg-game');
  if (pg) document.documentElement.style.setProperty('--pg-top', Math.max(0, Math.round(pg.getBoundingClientRect().top)) + 'px');
  /* كل ما فوق جسم اللعبة داخل الصفحة (الشريط + هوامشه) — يُقاس فعلياً كي
     تملأ الحاوية الشاشة حتى أسفلها تماماً بلا قصّ ولا فراغ */
  const pgEl = document.getElementById('pg-game');
  const bodyEl = document.getElementById('gamePageBody');
  const head = document.querySelector('#pg-game .gp-head');
  let above = head ? head.offsetHeight : 0;
  if (pgEl && bodyEl) {
    above = Math.max(0, Math.round(bodyEl.getBoundingClientRect().top - pgEl.getBoundingClientRect().top));
  }
  document.documentElement.style.setProperty('--gp-head-h', above + 'px');
}
window.syncPgTop = syncPgTop;
if (typeof window !== 'undefined') {
  window.enterAppFullscreen = enterAppFullscreen;
  window.exitAppFullscreen = exitAppFullscreen;
  window.toggleGameFullscreen = toggleGameFullscreen;
}
/* ═══════════ فرض الوضع العرضي للألعاب العريضة (عرض > طول) ═══════════ */
function isRotateRelevant() {
  /* جهاز لمس + شاشة عمودية ضيقة + داخل لعبة */
  const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!touch || !window._currentGameId) return false;
  const narrow = window.innerWidth <= 900 && window.innerWidth < window.innerHeight;
  return narrow;
}
function checkRotateHint() {
  const hint = document.getElementById('rotateHint');
  if (!hint) return;
  /* فلات دوغ: لا نجبر اتجاهاً — التخطيط متجاوب ويتكيّف تلقائياً مع قلب الشاشة */
  if (window._currentGameId === 'rn') { hint.hidden = true; return; }
  let wide = false;
  if (isRotateRelevant()) {
    const body = document.getElementById('gamePageBody');
    if (body) {
      /* أعرض عنصر لعب (مرحلة، طاولة، كانفس) — يلتقط الطبيعة العرضية للعبة
         حتى لو كانت أزرار التحكم تحته تطيل المرحلة عمودياً */
      const els = body.querySelectorAll('.stage, .bjt, canvas, .slots-wrap, .reels');
      let best = null;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.height <= 40) continue;
        if (!best || r.width / r.height > best.w / best.h) best = { w: r.width, h: r.height };
      }
      wide = !!best && best.w > best.h * 1.15;
    }
  }
  if (wide) {
    /* لا قفل إجباري للاتجاه: الوضع يتكيّف تلقائياً مع اتجاه الجهاز واختيار المستخدم
       (بورتريه على الهواتف، لاندسكيب على التابليت/الديسكتوب، يتغيّر عند قلب الشاشة).
       التخطيط متجاوب عبر media queries، فلا حاجة لفرض اتجاه. */
    hint.hidden = true;
  } else {
    hint.hidden = true;
  }
}
function closeModal() {
  const gModal = document.getElementById('gModal');
  if (gModal) {
    gModal.classList.remove('show');
  }
  /* إيقاف لوحة الجولات الجماعية إن كانت نشطة */
  if (typeof Group !== 'undefined') Group.deactivate();
  /* تنظيف Crash إن كان نشطاً */
  if (typeof cleanupCrash === 'function') {
    cleanupCrash();
  }
  window._currentGameId = null;
}
/* ═══════════ سجل الجولات الحي ═══════════ */
let _histTimer = null;
let _histGame = null;
let _localRounds = [];
let _serverRounds = [];
/* تسجيل جولة محلية (وإرسالها للخادم إن كان المستخدم مسجلاً) */
function recordRound(won, payout, txt, betOverride, gidOverride) {
  /* [Training 2026-09-16] جولات التدريب (بوت / وجه لوجه بنفس الجهاز) لا تُسجَّل
     في قاعدة البيانات ولا التذاكر ولا سجل المستخدم */
  if (window.TRAINING && window.TRAINING.on) {
    if (typeof window.SessionResume !== 'undefined') {
      try { window.SessionResume.onResolve(); } catch (e) {}
    }
    return;
  }
  /* [Persist] gidOverride: تسجيل تذكرة جولة جماعية حتى لو كان اللاعب في صفحة أخرى */
  const gid = gidOverride || window._currentGameId;
  if (!gid) return;
  /* إنهاء حالة «الجولة قيد التقدم» — تُسجَّل الجولة في كل الألعاب */
  if (typeof window.SessionResume !== 'undefined') {
    try { window.SessionResume.onResolve(); } catch (e) {}
  }
  const me = (AUTH && AUTH.user) ? AUTH.user.username : 'أنت';
  /* [Tickets] betOverride: رهان التذكرة نفسها (كينو متعدد الرهانات) بدل GB العام */
  const bet = (typeof betOverride === 'number') ? betOverride : ((typeof GB === 'number') ? GB : 0);
  const row = {
    username: me,
    game_id: gid,
    bet: bet,
    won: won ? 1 : 0,
    payout: (typeof payout === 'number' && payout > 0) ? payout : 0,
    result_txt: (typeof txt === 'string' && txt) ? String(txt).slice(0, 90) : '',
    created_at: Math.floor(Date.now() / 1000),
    local: true
  };
  _localRounds.unshift(row);
  if (_localRounds.length > 25) _localRounds.pop();
  if (_histGame === gid) renderGameHistory();
  /* إرسال للخادم إن كان المستخدم مسجلاً */
  if (AUTH && AUTH.user && typeof API !== 'undefined') {
    API.post('/api/rounds', { game_id: gid, bet: row.bet, won: row.won, payout: row.payout })
      .catch(function () {});
  }
}
/* بدء تحديث السجل من الخادم كل 4 ثوانٍ */
function startGameHistory(gid) {
  stopGameHistory();
  _histGame = gid;
  _localRounds = [];
  _serverRounds = [];
  fetchHistory();
  _histTimer = setInterval(fetchHistory, 4000);
}
function stopGameHistory() {
  if (_histTimer) {
    clearInterval(_histTimer);
    _histTimer = null;
  }
  _histGame = null;
  /* [Tickets] إغلاق لوحة التذاكر عند مغادرة اللعبة */
  toggleTicketsPanel(false);
}
/* ═══════════ [Tickets] لوحة سجل تيكيتس الرهانات — فتح/إغلاق + سحب ═══════════ */
function toggleTicketsPanel(force) {
  const ov = document.getElementById('ticketsOverlay');
  const btn = document.getElementById('ticketsBtn');
  if (!ov) return;
  const open = (typeof force === 'boolean') ? force : !ov.classList.contains('open');
  ov.classList.toggle('open', open);
  ov.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) renderGameHistory();
}
/* سحب اللوحة من المقبض للإغلاق السلس (لمس + فأرة) */
(function initTicketsDrag() {
  let startY = 0, curY = 0, active = false;
  function onStart(e) {
    const ov = document.getElementById('ticketsOverlay');
    if (!ov || !ov.classList.contains('open')) return;
    active = true;
    startY = (e.touches ? e.touches[0].clientY : e.clientY);
    curY = startY;
    ov.classList.add('dragging');
    e.preventDefault();
  }
  function onMove(e) {
    if (!active) return;
    curY = (e.touches ? e.touches[0].clientY : e.clientY);
    const dy = Math.max(0, curY - startY);
    const sheet = document.getElementById('ticketsSheet');
    if (sheet) sheet.style.transform = 'translateY(' + dy + 'px)';
  }
  function onEnd() {
    if (!active) return;
    active = false;
    const ov = document.getElementById('ticketsOverlay');
    const sheet = document.getElementById('ticketsSheet');
    if (ov) ov.classList.remove('dragging');
    if (sheet) sheet.style.transform = '';
    const dy = curY - startY;
    /* إغلاق إذا سُحبت لأسفل أكثر من ربع الشاشة */
    if (dy > Math.min(180, window.innerHeight / 4)) toggleTicketsPanel(false);
  }
  document.addEventListener('DOMContentLoaded', function () {
    const grip = document.getElementById('ticketsGrip');
    const ov = document.getElementById('ticketsOverlay');
    if (!grip || !ov) return;
    grip.addEventListener('touchstart', onStart, { passive: false });
    grip.addEventListener('mousedown', onStart);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchend', onEnd);
    document.addEventListener('mouseup', onEnd);
    /* نقر خارج اللوحة (الخلفية المعتمة العلوية) يغلقها */
    ov.addEventListener('click', function (e) { if (e.target === ov) toggleTicketsPanel(false); });
    /* Escape يغلق */
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleTicketsPanel(false); });
  });
})();
function fetchHistory() {
  if (!_histGame || typeof API === 'undefined') return;
  API.get('/api/games/' + _histGame + '/history').then(function (r) {
    if (r.ok && r.data && r.data.rounds) {
      _serverRounds = r.data.rounds;
      renderGameHistory();
    }
  }).catch(function () {});
}
function renderGameHistory() {
  const el = document.getElementById('gameHistory');
  if (!el) return;
  /* [Tickets-dedup] حلقة التكرار: تذاكر الخادم أولاً (محفوظة في القاعدة) ثم
     المحلية الأحدث فقط من أحدث صف خادم (created_at أكبر) — أو كلها إن كان السجل الخادمي فارغاً */
  const maxServerAt = _serverRounds.length
    ? Math.max.apply(null, _serverRounds.map(function (r) { return r.created_at || 0; }))
    : 0;
  const freshLocal = _serverRounds.length
    ? _localRounds.filter(function (r) { return (r.created_at || 0) > maxServerAt; })
    : _localRounds.slice();
  const rows = _serverRounds.concat(freshLocal);
  if (!rows.length) {
    el.innerHTML = '<div class="ght-empty">' + (T('ghist.empty') || 'لا توجد جولات بعد') + '</div>';
    return;
  }
  /* [Tickets-search] بحث نصي غير حساس لحالة: اسم اللعبة، username، result_txt، المبالغ */
  const sInp = document.getElementById('ticketsSearch');
  const q = sInp ? (sInp.value || '').trim().toLowerCase() : '';
  const gameLabel = function (r) {
    try {
      const gid = r.game_id || window._currentGameId;
      if (gid && typeof GAMES !== 'undefined') {
        const g = GAMES.find(function (x) { return x.id === gid; });
        if (g && g.n) return (typeof langIndex === 'function' ? (g.n[langIndex()] || g.n[0]) : g.n[0]) + (g.em ? ' ' + g.em : '');
      }
      return gid || '';
    } catch (e) { return ''; }
  };
  const shown = q
    ? rows.filter(function (r) {
        const hay = [
          gameLabel(r), r.username || '', r.result_txt || '',
          String(r.bet || 0), String(r.payout || 0)
        ].join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      })
    : rows;
  /* [Tickets-search] ربط حدث input مرة واحدة فقط (بحد _searchBound) */
  if (sInp && !sInp._searchBound) {
    sInp._searchBound = true;
    sInp.addEventListener('input', function () { renderGameHistory(); });
  }
  if (!shown.length) {
    el.innerHTML = '<div class="ght-empty">' + (T('ghist.empty') || 'لا توجد جولات بعد') + '</div>';
    return;
  }
  /* [Tickets v2] تذاكر مفصلة: لعبة/لاعب/رهان/مكسب/صافي/مضاعف/نتيجة/تاريخ ووقت.
     حد العرض: 50 عند وجود بحث، 25 بدونه */
  el.innerHTML = shown.slice(0, q ? 50 : 25).map(function (r) {
    const d = r.created_at ? new Date(r.created_at * 1000) : null;
    const tTime = d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
    const tDate = d ? d.toLocaleDateString() : '';
    const won = !!r.won;
    const bet = r.bet || 0;
    const pay = (won && r.payout > 0) ? r.payout : 0;
    const net = pay - bet;
    const gname = gameLabel(r);
    const mult = (pay > 0 && bet > 0) ? (Math.round((pay / bet) * 100) / 100) : 0;
    const who = r.local
      ? '<b class="gold-text">' + esc(r.username) + '</b>'
      : '<span class="ght-name">' + esc(r.username) + '</span>';
    const badge = won
      ? '<span class="ght-badge win">' + (T('g.win') || 'فوز') + (mult ? ' ×' + mult : '') + '</span>'
      : '<span class="ght-badge lose">' + (T('g.loss') || 'خسارة') + '</span>';
    const payout = pay > 0
      ? '<span class="ght-payout">+<i class="fa-solid fa-coins" aria-hidden="true"></i> ' + fmt(pay) + '</span>'
      : '<span class="ght-payout muted">—</span>';
    const netHtml = '<span class="ght-net ' + (net >= 0 ? 'pos' : 'neg') + '">' +
      (net >= 0 ? '+' : '−') + fmt(Math.abs(net)) + '</span>';
    const resLine = (r.result_txt && r.local)
      ? '<div class="ght-res">' + esc(r.result_txt) + '</div>'
      : '';
    return '<div class="ght-ticket ' + (won ? 'is-win' : 'is-lose') + '">' +
      '<div class="ght-top">' +
        '<span class="ght-who">' + who + (gname ? ' <span class="ght-game">· ' + esc(gname) + '</span>' : '') + '</span>' +
        badge +
      '</div>' +
      '<div class="ght-mid">' +
        '<span class="ght-bet" title="الرهان"><i class="fa-solid fa-coins" aria-hidden="true"></i> ' + fmt(bet) + '</span>' +
        payout +
        netHtml +
        '<span class="ght-time">' + tTime + (tDate ? ' · ' + tDate : '') + '</span>' +
      '</div>' +
      resLine +
    '</div>';
  }).join('');
}
/* ═══════════ المتصدرون ═══════════ */
function renderLB() {
  const players = [
    ['RondaMaster', 58230, '#F5C518'],
    ['KingPlayer', 45230, '#7C3AED'],
    ['CrashKing', 38900, '#1A6CF6'],
    ['LuckyGirl', 31200, '#10B981'],
    ['ProGamer', 28500, '#EF4444'],
    ['GoldHunter', 24100, '#F59E0B'],
    ['StarPlayer', 19800, '#A78BFA'],
    ['WinMaster', 15400, '#60A5FA'],
    ['CoinCollector', 12300, '#34D399'],
    ['NewChamp', 9800, '#F87171']
  ];
  const el = document.getElementById('lbList');
  if (!el) return;
  el.innerHTML = players.map((p, i) => {
    const rankClass = i < 3 ? ' r' + (i + 1) : '';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    return '<div class="lrow' + rankClass + '" role="listitem">' +
      '<div class="lrank">' + medal + '</div>' +
      '<div class="lpl">' +
        '<div class="avatar" style="background:' + p[2] + '">' + p[0].slice(-1) + '</div>' +
        '<b>' + p[0] + '</b>' +
      '</div>' +
      '<div class="lcoins">🪙 ' + fmt(p[1]) + '</div>' +
      '</div>';
  }).join('');
}
/* ═══════════ Provably Fair ═══════════ */
function renderFair() {
  if (!ST.serverSeed) {
    ST.serverSeed = Math.random().toString(36).slice(2, 18);
  }
  const hSeedEl = document.getElementById('hSeed');
  const nonceEl = document.getElementById('nonceD');
  if (hSeedEl) hSeedEl.textContent = simpleHash(ST.serverSeed);
  if (nonceEl) nonceEl.textContent = ST.nonce;
  /* سجّل معالجات الأداة التفاعلية مرة واحدة فقط */
  if (!window.__pfInAppBound) {
    window.__pfInAppBound = true;
    bindInAppFairTool();
  }
}

/* ── أداة التحقق التفاعلية (داخل التطبيق) — تعتمد على window.Fair (fair.js) ── */
function bindInAppFairTool() {
  var serverEl  = document.getElementById('pf-server');
  var clientEl  = document.getElementById('pf-client');
  var nonceEl   = document.getElementById('pf-nonce');
  var gameEl    = document.getElementById('pf-game');
  var hashEl    = document.getElementById('pf-hash');
  var outEl     = document.getElementById('pf-outcome');
  var verifyBtn = document.getElementById('pf-verify-btn');
  var calcBtn   = document.getElementById('pf-calc');
  var resEl     = document.getElementById('pf-result');
  if (!serverEl || !verifyBtn || !calcBtn) return;
  if (!window.Fair) return;

  function showResult(cls, html) {
    resEl.className = 'pf-result show ' + cls;
    resEl.innerHTML = html;
  }
  function parseOutcome(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }
  function readInputs() {
    return {
      server: (serverEl.value || '').trim(),
      client: (clientEl.value || '').trim(),
      nonce:  (nonceEl.value || '0').trim(),
      game:   gameEl ? gameEl.value : 'ke'
    };
  }

  calcBtn.addEventListener('click', function () {
    var i = readInputs();
    if (!i.server || !i.client) { showResult('bad', (window.T ? T('fair.errMissing') : 'أدخل بذرة الخادم وSeed اللاعب.')); return; }
    var seed = window.Fair.roundSeed(i.server, i.client, i.nonce);
    if (hashEl) hashEl.value = seed;
    var derived = window.Fair.outcome(i.server, i.client, i.nonce, i.game);
    if (!derived) { showResult('bad', (window.T ? T('fair.errGame') : 'تعذّر حساب النتيجة لهذه اللعبة.')); return; }
    if (outEl) outEl.value = JSON.stringify(derived);
    showResult('ok', (window.T ? T('fair.computedOk') : '🧮 تم الحساب: ') + '<br>Hash: <code>' + seed + '</code><br>Outcome: <code>' + JSON.stringify(derived) + '</code>');
  });

  verifyBtn.addEventListener('click', function () {
    var i = readInputs();
    if (!i.server || !i.client) { showResult('bad', (window.T ? T('fair.errMissing') : 'أدخل بذرة الخادم وSeed اللاعب.')); return; }
    var outcome = parseOutcome(outEl ? (outEl.value || '') : '');
    if (outcome === null) {
      showResult('bad', (window.T ? T('fair.errJson') : 'صيغة النتيجة غير صالحة — يجب أن تكون JSON.'));
      return;
    }
    var expected = null;
    try { expected = window.Fair.outcome(i.server, i.client, i.nonce, i.game); } catch (e) { expected = null; }
    if (expected && JSON.stringify(expected) === JSON.stringify(outcome)) {
      var validMsg = (window.T ? T('fair.valid') : '✅ النتيجة عادلة ومطابقة للتشفير بنسبة 100%');
      showResult('ok', validMsg);
    } else {
      var expStr = expected ? '<code>' + JSON.stringify(expected) + '</code>' : '—';
      showResult('bad', (window.T ? T('fair.mismatch') : '❌ النتيجة غير متطابقة.') + '<br>' + expStr);
    }
  });
}
/* ═══════════ لوحة الإدارة (حقيقية — من الـ API) ═══════════ */
let ADMIN_TAB = 'users';
let DISABLED = {};

/* الألعاب المعطلة: تحميل من الخادم عند تسجيل الدخول */
function loadDisabledGames() {
  if (!AUTH.user) {
    DISABLED = {};
    return Promise.resolve();
  }
  return API.get('/api/games').then(function (r) {
    DISABLED = {};
    const g = (r.ok && r.data && r.data.games) ? r.data.games : {};
    Object.keys(g).forEach(function (id) {
      if (!g[id]) DISABLED[id] = true;
    });
  }).catch(function () {
    DISABLED = {};
  });
}

function renderAdmin() {
  const el = document.getElementById('adminBox');
  if (!el) return;
  /* حماية: غير أدمن → رسالة */
  if (!AUTH.user || AUTH.user.role === 'user') {
    el.innerHTML = '<div class="note">' + T('admin.notAuthorized') + '</div>';
    return;
  }
  const isSuper = AUTH.user.role === 'super';
  adminLoadStats();
  const tabs = isSuper
    ? '<button class="atab' + (ADMIN_TAB === 'users' ? ' active' : '') + '" role="tab" onclick="adminTab(\'users\')">' + T('admin.usersTab') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'coord' ? ' active' : '') + '" role="tab" onclick="adminTab(\'coord\')">💬 ' + T('admin.coordTab') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'tourneys' ? ' active' : '') + '" role="tab" onclick="adminTab(\'tourneys\')">🏆 ' + T('ui.tourney') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'games' ? ' active' : '') + '" role="tab" onclick="adminTab(\'games\')">' + T('admin.gamesTab') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'rewards' ? ' active' : '') + '" role="tab" onclick="adminTab(\'rewards\')">' + T('admin.rewardsTab') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'fin' ? ' active' : '') + '" role="tab" onclick="adminTab(\'fin\')">' + T('admin.finTab') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'codes' ? ' active' : '') + '" role="tab" onclick="adminTab(\'codes\')">🎟️ أكواد الشحن</button>' +
      '<button class="atab' + (ADMIN_TAB === 'botpl' ? ' active' : '') + '" role="tab" onclick="adminTab(\'botpl\')">📊 ' + T('admin.botPL') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'logs' ? ' active' : '') + '" role="tab" id="logs" onclick="adminTab(\'logs\')"><i class="fa-solid fa-receipt" aria-hidden="true"></i> ' + T('admin.logsTab') + '</button>'
    : '<button class="atab' + (ADMIN_TAB === 'users' ? ' active' : '') + '" role="tab" onclick="adminTab(\'users\')">👥 ' + T('admin.myPlayers') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'coord' ? ' active' : '') + '" role="tab" onclick="adminTab(\'coord\')">💬 ' + T('admin.coordTab') + '</button>' +
      '<button class="atab' + (ADMIN_TAB === 'tourneys' ? ' active' : '') + '" role="tab" onclick="adminTab(\'tourneys\')">🏆 ' + T('ui.tourney') + '</button>';
  el.innerHTML =
    '<div class="atabs" role="tablist">' + tabs + '</div>' +
    '<div id="adminContent"><div class="note">…</div></div>';
  if (ADMIN_TAB === 'users') adminLoadUsers();
  else if (ADMIN_TAB === 'coord') adminLoadCoordination();
  else if (ADMIN_TAB === 'tourneys') adminLoadTourneys();
  else if (ADMIN_TAB === 'games') adminLoadGames();
  else if (ADMIN_TAB === 'rewards') adminLoadRewards();
  else if (ADMIN_TAB === 'codes') adminLoadCodes();
  else if (ADMIN_TAB === 'botpl') adminLoadBotPL();
  else if (ADMIN_TAB === 'logs') adminLoadTransactions();
  else adminLoadFinance();
}

/* ── [Codes 2026-09-17] أكواد الشحن بالشرائح — سوبر أدمن فقط ── */
const CODE_TIERS = {
  admin:  { 100: 25, 1000: 30, 10000: 35, 100000: 40 },
  direct: { 10: 0,  100: 5,  1000: 10, 10000: 15 }
};
function adminLoadCodes() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  const kind = window._codeKind || 'admin';
  const tierOpts = Object.keys(CODE_TIERS[kind]).map(t =>
    '<option value="' + t + '">' + Number(t).toLocaleString('ar-MA') + ' — بونص ' + CODE_TIERS[kind][t] + '%</option>').join('');
  c.innerHTML =
    '<div class="note">أنشئ أكواد شحن بالكوينز. أدمنز: بونص حسب الشريحة. مباشر: للمستخدمين (تيليغرام/Cryptomus). السعر: 100 كوين/$ و10 كوين/درهم.</div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:10px 0">' +
      '<label>النوع<br><select id="codeKind" onchange="window._codeKind=this.value;adminLoadCodes()">' +
        '<option value="admin"' + (kind === 'admin' ? ' selected' : '') + '>أدمنز (بونص)</option>' +
        '<option value="direct"' + (kind === 'direct' ? ' selected' : '') + '>مباشر</option></select></label>' +
      '<label>العملة<br><select id="codeCur"><option value="usd">USD ($)</option><option value="mad">MAD (درهم)</option></select></label>' +
      '<label>الشريحة<br><select id="codeTier">' + tierOpts + '</select></label>' +
      '<button class="btn" onclick="adminMakeCode()">إنشاء الكود</button>' +
    '</div>' +
    '<div id="codeOut"></div>';
}
async function adminMakeCode() {
  const out = document.getElementById('codeOut');
  const kind = document.getElementById('codeKind').value;
  const currency = document.getElementById('codeCur').value;
  const tier = Number(document.getElementById('codeTier').value);
  out.innerHTML = '<div class="note">…</div>';
  /* [v2.40.5 · إصلاح] كان الزر يستعمل نداء fetch بمسار نسبي إلى مسار إنشاء الأكواد ⇒
     يذهب إلى dtsg.pages.dev (واجهة Pages) لا إلى الباكأند، فيردّ Pages 405 وتفشل
     العملية دائماً. الصحيح: API.post الذي يحلّ عنوان الباكأند من /api-url2.json
     ويرسل كوكي الجلسة (‏sid). */
  try {
    const r = await API.post('/api/vouchers/create', { kind: kind, tier: tier, currency: currency });
    const j = (r && r.data) || {};
    if (r && r.ok && j.ok) {
      out.innerHTML = '<div class="note ok">✅ <b>' + j.codes[0] + '</b> — يشحن ' + Number(j.coins).toLocaleString('ar-MA') + ' كوين (بونص ' + j.bonus + '%) ' +
        '<button class="btn small" onclick="navigator.clipboard.writeText(\'' + j.codes[0] + '\')">نسخ</button></div>';
      return;
    }
    let msg = j.error || ('HTTP ' + (r ? r.status : '?'));
    if (r && r.status === 403) msg = 'غير مصرح — إنشاء الأكواد للسوبر أدمن فقط. سجّل الخروج ثم الدخول بحساب السوبر.';
    else if (r && r.status === 400 && j.error === 'bad-tier') msg = 'شريحة غير صالحة';
    if (j.tiers) msg += ' — الشرائح المتاحة: ' + j.tiers.join(' / ');
    out.innerHTML = '<div class="note err">❌ ' + msg + '</div>';
  } catch (e) { out.innerHTML = '<div class="note err">❌ تعذّر الاتصال بالخادم: ' + e + '</div>'; }
}

function adminTab(tab) {
  SND.click();
  ADMIN_TAB = tab;
  renderAdmin();
}

/* ── البطاقات العلوية ── */
function adminLoadStats() {
  if (!AUTH.user || AUTH.user.role === 'user') return;
  API.get('/api/admin/stats').then(function (r) {
    if (!r.ok || !r.data) return;
    const s = r.data;
    const set = function (id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('adminStatUsers', fmt(s.users_total || 0));
    set('adminStatOnline', fmt(s.active_today || 0));
    set('adminStatPlays', fmt(s.plays_total || 0));
    set('adminStatCoins', fmt((s.gold_total || 0) + (s.coins_won_total || 0)));
  }).catch(function () {});
}

/* ── تبويب المستخدمون ── */
function adminLoadUsers() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  c.innerHTML = '<div class="note">…</div>';
  API.get('/api/admin/users').then(function (r) {
    if (!r.ok) {
      c.innerHTML = '<div class="note">' + ((r.data && r.data.message) || T('auth.error')) + '</div>';
      return;
    }
    const users = r.data.users || [];
    const isSuper = AUTH.user && AUTH.user.role === 'super';
    /* نموذج تسجيل لاعب جديد (للأدمن: لاعبيه؛ للسوبر: أي لاعب) */
    const regForm =
      '<div class="card" style="margin-bottom:14px">' +
        '<div class="ctitle">➕ ' + T('admin.registerNew') + '</div>' +
        '<div class="reg-row">' +
          '<input class="ainp" id="regU" placeholder="' + T('auth.username') + '" maxlength="20" style="width:150px">' +
          '<input class="ainp" id="regP" type="password" placeholder="' + T('auth.password') + '" maxlength="40" style="width:150px">' +
          '<input class="ainp" id="regRef" placeholder="' + T('admin.refCode') + '" maxlength="20" style="width:150px" dir="ltr" title="' + esc(T('admin.refCodeHint')) + '">' +
          '<button class="abtn" onclick="adminRegister()">' + T('admin.registerBtn') + '</button>' +
        '</div>' +
        '<div class="note" style="margin-top:8px;font-size:.78rem">🎁 ' + T('admin.refCodeHint') + '</div>' +
      '</div>' +
      (!isSuper
        ? '<div class="note" style="margin-bottom:14px">💱 ' + T('admin.exchangeNote') +
          ' — <a href="admins.html" target="_blank" style="color:var(--gold)">' + T('admin.rulesLink') + '</a></div>'
        : '');
    if (!users.length) {
      c.innerHTML = regForm + '<div class="note">' + T('admin.noUsers') + '</div>';
      return;
    }
    c.innerHTML = regForm +
      '<div class="atable-wrap"><table class="atable">' +
      '<thead><tr>' +
        '<th>ID</th><th>' + T('auth.username') + '</th><th>' + T('admin.refCode') + '</th><th>' + T('admin.balance') + '</th>' +
        (isSuper ? '<th>' + T('admin.lastSeen') + '</th><th>' + T('admin.status') + '</th><th>' + T('admin.setBalance') + '</th>' : '') +
        '<th>' + T('admin.charge') + '</th>' + (isSuper ? '<th>' + T('admin.deduct') + '</th>' : '') + '<th>' + T('admin.password') + '</th>' +
        '<th>' + T('admin.mute') + '</th>' +
        (isSuper ? '<th></th><th>' + T('admin.role') + '</th><th></th>' : '') +
      '</tr></thead><tbody>' +
      users.map(function (u) {
        const balCell = isSuper
          ? '<td>🪙 ' + fmt(u.gold) + '</td>' +
            '<td>' + (u.last_seen ? new Date(u.last_seen * 1000).toLocaleString() : '—') + '</td>' +
            '<td>' + (u.banned ? '<span class="spill bad">' + T('admin.banned') + '</span>' : '<span class="spill ok">' + T('admin.active') + '</span>') + '</td>' +
            '<td class="abal"><input class="ainp" id="bal-' + u.id + '" type="number" value="' + u.gold + '" min="0" aria-label="رصيد ' + esc(u.username) + '" style="width:90px">' +
            '<button class="abtn" onclick="adminSetBalance(' + u.id + ')">' + T('admin.save') + '</button></td>'
          : '<td>🪙 ' + fmt(u.gold) + '</td>';
        const chargeCell =
          '<input class="ainp" id="ch-' + u.id + '" type="number" value="100" min="1" aria-label="شحن ' + esc(u.username) + '" style="width:80px">' +
          '<button class="abtn ok" onclick="adminChargeDeduct(' + u.id + ',\'charge\')">+' + T('admin.charge') + '</button>';
        const deductCell =
          '<input class="ainp" id="dc-' + u.id + '" type="number" value="100" min="1" aria-label="خصم ' + esc(u.username) + '" style="width:80px">' +
          '<button class="abtn bad" onclick="adminChargeDeduct(' + u.id + ',\'deduct\')">−' + T('admin.deduct') + '</button>';
        const passCell =
          '<input class="ainp" id="pw-' + u.id + '" type="password" placeholder="' + T('admin.newPass') + '" aria-label="كلمة مرور ' + esc(u.username) + '" style="width:110px">' +
          '<button class="abtn" onclick="adminSetPassword(' + u.id + ')">' + T('admin.save') + '</button>';
        /* إسكات عن الصوت والمراسلة: 24 ساعة فأكثر */
        const muteCell = u.muted_until
          ? '<span class="spill bad" title="' + new Date(u.muted_until).toLocaleString() + '">🔇 ' + T('admin.muted') + '</span>' +
            (isSuper ? ' <button class="abtn ok" onclick="adminMute(' + u.id + ',0)">' + T('admin.unmute') + '</button>' : '')
          : '<input class="ainp" id="mt-' + u.id + '" type="number" value="24" min="24" max="720" aria-label="' + esc(T('admin.muteHours')) + '" style="width:60px" title="' + esc(T('admin.muteHours')) + '">' +
            '<button class="abtn bad" onclick="adminMute(' + u.id + ',1)">🔇 ' + T('admin.mute') + '</button>';
        /* [Logs] زر «سجل»: فتح تبويب السجلات مُصفّى على هذا المستخدم (سوبر فقط) */
        const delCell = isSuper
          ? '<td style="white-space:nowrap"><button class="abtn" onclick="adminViewUserTx(' + u.id + ')" title="سجل المعاملات">🧾 سجل</button> ' +
            '<button class="abtn bad" onclick="adminDeleteUser(' + u.id + ',\'' + esc(u.username).replace(/'/g, '') + '\')">🗑 ' + T('admin.deleteUser') + '</button></td>'
          : '';
        const banCell = isSuper
          ? '<td>' + (u.banned
              ? '<button class="abtn ok" onclick="adminToggleBan(' + u.id + ',0)">' + T('admin.unban') + '</button>'
              : '<button class="abtn bad" onclick="adminToggleBan(' + u.id + ',1)">' + T('admin.ban') + '</button>') + '</td>'
          : '';
        const roleCell = isSuper
          ? '<td><select class="ainp" id="role-' + u.id + '" aria-label="دور ' + esc(u.username) + '">' +
              ['user', 'admin', 'super'].map(function (ro) {
                return '<option value="' + ro + '"' + (u.role === ro ? ' selected' : '') + '>' + roleLabel(ro) + '</option>';
              }).join('') +
            '</select><button class="abtn" onclick="adminSetRole(' + u.id + ')">' + T('admin.save') + '</button></td>'
          : '';
        const bannedRow = u.banned && !isSuper ? '<span class="spill bad">' + T('admin.banned') + '</span>' : '';
        return '<tr>' +
          '<td>' + u.id + '</td>' +
          '<td><b>' + esc(u.username) + '</b> ' + bannedRow + '</td>' +
          '<td dir="ltr" style="font-family:monospace;font-size:.78rem;color:var(--gold)">' + esc(u.ref_code || '—') + '</td>' +
          balCell +
          '<td class="abal">' + chargeCell + '</td>' +
          (isSuper ? '<td class="abal">' + deductCell + '</td>' : '') +
          '<td class="abal">' + passCell + '</td>' +
          '<td class="abal">' + muteCell + '</td>' +
          banCell + roleCell + delCell +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }).catch(function () {
    c.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}

/* تسجيل لاعب جديد من طرف الأدمن */
function adminRegister() {
  const uEl = document.getElementById('regU');
  const pEl = document.getElementById('regP');
  const rEl = document.getElementById('regRef');
  if (!uEl || !pEl) return;
  const username = uEl.value.trim();
  const password = pEl.value;
  const refCode = rEl ? rEl.value.trim() : '';
  if (!username || password.length < 6) {
    toast(T('auth.fill'), 'warn');
    return;
  }
  const payload = { username: username, password: password };
  if (refCode) payload.referral_code = refCode;
  API.post('/api/admin/register', payload).then(function (r) {
    if (r.ok) {
      let msg = T('auth.accountCreated') + ' ✔';
      if (r.data && r.data.user && r.data.user.referred_by) msg += ' 🎁';
      toast(msg, 'ok');
      if (rEl) rEl.value = '';
      adminLoadUsers();
      adminLoadStats();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

/* إسكات لاعب عن التعليق الصوتي والمراسلة (24 ساعة فأكثر) / رفع الإسكات */
function adminMute(id, on) {
  if (on) {
    const inp = document.getElementById('mt-' + id);
    const hours = Math.max(24, parseInt(inp ? inp.value : 24, 10) || 24);
    API.post('/api/admin/user/' + id + '/mute', { hours: hours }).then(function (r) {
      if (r.ok) { toast('🔇 ' + T('admin.muteDone') + ' (' + hours + 'h)', 'ok'); adminLoadUsers(); }
      else toast((r.data && r.data.message) || T('auth.error'), 'err');
    });
  } else {
    API.post('/api/admin/user/' + id + '/mute', { unmute: true }).then(function (r) {
      if (r.ok) { toast(T('admin.unmute') + ' ✔', 'ok'); adminLoadUsers(); }
      else toast((r.data && r.data.message) || T('auth.error'), 'err');
    });
  }
}

/* مسح حساب نهائياً (سوبر أدمن فقط) */
function adminDeleteUser(id, uname) {
  if (!confirm(T('admin.deleteConfirm') + '\n(' + uname + ')')) return;
  API.post('/api/admin/user/' + id + '/delete', {}).then(function (r) {
    if (r.ok) { toast(T('admin.deleteUser') + ' ✔', 'ok'); adminLoadUsers(); adminLoadStats(); }
    else toast((r.data && r.data.message) || T('auth.error'), 'err');
  });
}

/* شحن/خصم: للأدمن ينعكس على رصيده تلقائياً في السيرفر */
function adminChargeDeduct(id, action) {
  const inp = document.getElementById(action === 'charge' ? 'ch-' + id : 'dc-' + id);
  if (!inp) return;
  const amount = parseInt(inp.value, 10);
  if (Number.isNaN(amount) || amount <= 0) {
    toast(T('tr.badAmount') || 'المبلغ غير صالح', 'err');
    return;
  }
  const isSuper = AUTH.user && AUTH.user.role === 'super';
  const payload = isSuper
    ? { action: action, amount: amount }
    : { action: action, amount: amount };
  API.post('/api/admin/user/' + id + '/balance', payload).then(function (r) {
    if (r.ok) {
      let msg = (action === 'charge' ? T('admin.charge') + ' ✔' : T('admin.deduct') + ' ✔') + ' ' + fmt(amount);
      if (action === 'charge' && r.data && r.data.commission && r.data.commission > 0) {
        msg += ' | ' + T('admin.commission') + ': ' + fmt(r.data.commission);
      }
      toast(msg, 'ok');
      adminLoadUsers();
      adminLoadStats();
      if (typeof wallet === 'function') wallet();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

/* تغيير كلمة مرور لاعب (للأدمن: لاعبيه فقط) */
function adminSetPassword(id) {
  const inp = document.getElementById('pw-' + id);
  if (!inp) return;
  const password = inp.value;
  if (password.length < 6) {
    toast(T('admin.badPass'), 'warn');
    return;
  }
  API.post('/api/admin/user/' + id + '/password', { password: password }).then(function (r) {
    if (r.ok) {
      toast(T('admin.password') + ' ✔', 'ok');
      inp.value = '';
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

function adminSetBalance(id) {
  const inp = document.getElementById('bal-' + id);
  if (!inp) return;
  const gold = parseInt(inp.value, 10);
  if (Number.isNaN(gold) || gold < 0) {
    toast(T('tr.badAmount') || 'رصيد غير صالح', 'err');
    return;
  }
  API.post('/api/admin/user/' + id + '/balance', { gold: gold }).then(function (r) {
    if (r.ok) {
      toast(T('admin.setBalance') + ' ✔', 'ok');
      adminLoadUsers();
      adminLoadStats();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

function adminToggleBan(id, banned) {
  API.post('/api/admin/user/' + id + '/ban', { banned: !!banned }).then(function (r) {
    if (r.ok) {
      toast(banned ? T('admin.ban') + ' ✔' : T('admin.unban') + ' ✔', 'ok');
      adminLoadUsers();
      adminLoadStats();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

function adminSetRole(id) {
  const sel = document.getElementById('role-' + id);
  if (!sel) return;
  if (AUTH.user && id === AUTH.user.id) {
    toast('لا يمكنك تغيير دورك', 'warn');
    return;
  }
  API.post('/api/admin/user/' + id + '/role', { role: sel.value }).then(function (r) {
    if (r.ok) {
      toast(T('admin.save') + ' ✔', 'ok');
      adminLoadUsers();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

/* ── تبويب السجلات (سوبر فقط): كل معاملات المنصة مع تصفية ── */
/* أسماء الأنواع بالعربية للعرض */
function txTypeLabel(ty) {
  const map = {
    bet: 'رهان',
    win: 'فوز',
    transfer_out: 'تحويل صادر',
    transfer_in: 'تحويل وارد',
    charge: 'شحن',
    deduct: 'سحب',
    set_balance: 'ضبط رصيد',
    referral_bonus: 'هدية إحالة',
    claim: 'مكافأة'
  };
  return map[ty] || ty || '—';
}
/* إشارة المبلغ: + للفوز/الوارد/الشحن/الهدية/المكافأة، − للرهان/الصادر/السحب، = لضبط الرصيد */
function txAmountSign(ty, amount) {
  const pos = { win: 1, transfer_in: 1, charge: 1, referral_bonus: 1, claim: 1 };
  const neg = { bet: 1, transfer_out: 1, deduct: 1 };
  const a = fmt(amount);
  if (pos[ty]) return '<b class="gold-text">+ 🪙 ' + a + '</b>';
  if (neg[ty]) return '<b>− 🪙 ' + a + '</b>';
  if (ty === 'set_balance') return '<b>= 🪙 ' + a + '</b>';
  return '🪙 ' + a;
}
function adminLoadTransactions() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  if (!AUTH.user || AUTH.user.role !== 'super') {
    c.innerHTML = '<div class="note">' + T('admin.notAuthorized') + '</div>';
    return;
  }
  /* القيم الحالية للتصفية تُقرأ قبل إعادة البناء حتى لا تضيع عند onchange */
  const curS = document.getElementById('txUser');
  const curTy = document.getElementById('txType');
  const curUid = curS ? curS.value : '';
  const curType = curTy ? curTy.value : '';
  c.innerHTML = '<div class="note">…</div>';
  /* بناء واجهة التصفية مع جدول المستخدمين (أول خيار «الكل») */
  const typeOpts = ['', 'bet', 'win', 'transfer_out', 'transfer_in', 'charge', 'deduct', 'set_balance', 'referral_bonus', 'claim'];
  const buildFilters = function (users) {
    return '<div class="reg-row" style="flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center">' +
      '<select class="ainp" id="txUser" onchange="adminLoadTransactions()" aria-label="تصفية بالمستخدم" style="width:180px">' +
        '<option value="">' + T('admin.users') + ': ' + 'الكل' + '</option>' +
        users.map(function (u) {
          return '<option value="' + u.id + '"' + (String(u.id) === String(curUid) ? ' selected' : '') + '>' + esc(u.username) + ' (#' + u.id + ')</option>';
        }).join('') +
      '</select>' +
      '<select class="ainp" id="txType" onchange="adminLoadTransactions()" aria-label="تصفية بالنوع" style="width:150px">' +
        typeOpts.map(function (ty) {
          return '<option value="' + ty + '"' + (ty === curType ? ' selected' : '') + '>' + (ty === '' ? 'الكل' : txTypeLabel(ty)) + '</option>';
        }).join('') +
      '</select>' +
      '<button class="abtn" onclick="adminLoadTransactions()">🔄 ' + T('ui.refresh') + '</button>' +
      '</div>';
  };
  API.get('/api/admin/users').then(function (ru) {
    const users = (ru.ok && ru.data && ru.data.users) ? ru.data.users : [];
    c.innerHTML = buildFilters(users) + '<div id="txTableBox"><div class="note">…</div></div>';
    const s = document.getElementById('txUser');
    const ty = document.getElementById('txType');
    const uid = s ? s.value : curUid;
    const type = ty ? ty.value : curType;
    API.get('/api/admin/transactions?user_id=' + uid + '&type=' + type + '&limit=200').then(function (r) {
      const box = document.getElementById('txTableBox');
      if (!box) return;
      if (!r.ok) {
        box.innerHTML = '<div class="note">' + ((r.data && r.data.message) || T('auth.error')) + '</div>';
        return;
      }
      const txs = r.data.transactions || [];
      const total = r.data.total || 0;
      /* عرض total في عنوان فرعي صغير */
      const sub = '<div class="note" style="font-size:.78rem;margin-bottom:8px">' + total + ' معاملة</div>';
      if (!txs.length) {
        box.innerHTML = sub + '<div class="note">' + T('admin.txEmpty') + '</div>';
        return;
      }
      box.innerHTML = sub +
        '<div class="atable-wrap"><table class="atable">' +
        '<thead><tr>' +
          '<th>الوقت</th><th>المستخدم</th><th>النوع</th><th>المبلغ</th><th>الرصيد بعدها</th>' +
          '<th>الطرف الآخر</th><th>اللعبة</th><th>المنفذ</th><th>ملاحظة</th>' +
        '</tr></thead><tbody>' +
        txs.map(function (tx) {
          const t = tx.created_at ? new Date(tx.created_at * 1000).toLocaleString() : '—';
          const note = tx.note ? esc(String(tx.note).slice(0, 40)) : '—';
          return '<tr>' +
            '<td style="white-space:nowrap">' + t + '</td>' +
            '<td>' + (tx.username ? '<b>' + esc(tx.username) + '</b>' : '—') + '</td>' +
            '<td><span class="spill ' + (tx.type === 'bet' || tx.type === 'transfer_out' || tx.type === 'deduct' ? 'bad' : (tx.type === 'set_balance' ? '' : 'ok')) + '">' + txTypeLabel(tx.type) + '</span></td>' +
            '<td>' + txAmountSign(tx.type, tx.amount) + '</td>' +
            '<td>🪙 ' + fmt(tx.balance_after) + '</td>' +
            '<td>' + (tx.counterparty_name ? esc(tx.counterparty_name) : '—') + '</td>' +
            '<td>' + (tx.game_id ? esc(tx.game_id) : '—') + '</td>' +
            '<td>' + (tx.actor_name ? esc(tx.actor_name) : '—') + '</td>' +
            '<td>' + note + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>';
    }).catch(function () {
      const box = document.getElementById('txTableBox');
      if (box) box.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
    });
  }).catch(function () {
    c.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}
/* فتح تبويب السجلات مع تصفية مستخدم بعينه (زر «سجل» في جدول المستخدمين) */
function adminViewUserTx(id) {
  ADMIN_TAB = 'logs';
  renderAdmin();
  /* [Logs] renderAdmin يبني الـ select بشكل غير متزامن (بعد جلب المستخدمين) —
     نعيد المحاولة حتى يظهر العنصر (بحد 20 محاولة × 50ms) قبل ضبط القيمة والجلب */
  var tries = 0;
  (function apply() {
    var s = document.getElementById('txUser');
    if (s) {
      s.value = String(id);
      adminLoadTransactions();
      return;
    }
    if (tries++ < 20) setTimeout(apply, 50);
  })();
}
window.adminViewUserTx = adminViewUserTx;

/* ── تبويب البطولات (الأدمن: موافقة/بدء/إنهاء) ── */
function adminLoadTourneys() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  c.innerHTML = '<div class="note">…</div>';
  Promise.all([API.get('/api/tournaments'), API.get('/api/games')]).then(function (rs) {
    const ts = (rs[0].ok && rs[0].data && rs[0].data.tournaments) ? rs[0].data.tournaments : [];
    if (!ts.length) {
      c.innerHTML = '<div class="note">لا توجد بطولات بعد</div>';
      return;
    }
    const statusLabel = { pending: '⏳ ' + T('admin.tPending'), approved: '✅ ' + T('admin.tApproved'), active: '🔴 ' + T('admin.tActive'), finished: '🏁 ' + T('admin.tFinished'), rejected: '❌ ' + T('admin.tRejected') };
    c.innerHTML = '<div class="atable-wrap"><table class="atable">' +
      '<thead><tr><th>الاسم</th><th>اللعبة</th><th>المنشئ</th><th>الجائزة</th><th>اللاعبون</th><th>الحالة</th><th></th></tr></thead><tbody>' +
      ts.map(function (t) {
        let actions = '';
        if (t.status === 'pending') {
          actions = '<button class="abtn ok" onclick="adminApproveTourney(\'' + t.id + '\',\'approve\')">✔ ' + T('admin.tApprove') + '</button> ' +
                    '<button class="abtn bad" onclick="adminApproveTourney(\'' + t.id + '\',\'reject\')">✖ ' + T('admin.tReject') + '</button>';
        } else if (t.status === 'approved') {
          actions = '<button class="abtn ok" onclick="adminStartTourney(\'' + t.id + '\')">▶ ' + T('admin.tStart') + '</button>';
        } else if (t.status === 'active') {
          const pls = t.players || [];
          const opts = pls.map(function (p) { return '<option value="' + p.id + '">' + esc(p.username) + '</option>'; }).join('');
          actions = '<select class="ainp" id="tw-' + t.id + '" style="width:110px">' + opts + '</select> ' +
                    '<button class="abtn" onclick="adminFinishTourney(\'' + t.id + '\')">🏁 ' + T('admin.tFinish') + '</button>';
        } else {
          actions = '—';
        }
        return '<tr>' +
          '<td><b>' + esc(t.name) + '</b></td>' +
          '<td>' + esc(t.game_id) + '</td>' +
          '<td>' + esc(t.owner_name) + '</td>' +
          '<td class="gold-text">🪙 ' + fmt(t.prize || 0) + '</td>' +
          '<td>' + t.players_count + '/' + t.max_players + '</td>' +
          '<td>' + (statusLabel[t.status] || t.status) + '</td>' +
          '<td class="abal">' + actions + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }).catch(function () {
    c.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}

function adminApproveTourney(id, decision) {
  API.post('/api/admin/tournaments/' + id + '/' + decision).then(function (r) {
    if (r.ok) {
      toast(decision === 'approve' ? T('admin.tApproved') + ' ✔' : T('admin.tRejected') + ' ✔', 'ok');
      adminLoadTourneys();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

function adminStartTourney(id) {
  API.post('/api/admin/tournaments/' + id + '/start').then(function (r) {
    if (r.ok) {
      toast(T('admin.tActive') + ' ✔', 'ok');
      adminLoadTourneys();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

function adminFinishTourney(id) {
  const sel = document.getElementById('tw-' + id);
  if (!sel || !sel.value) {
    toast(T('admin.pickWinner') || 'اختر الفائز أولاً', 'warn');
    return;
  }
  API.post('/api/admin/tournaments/' + id + '/finish', { winner_id: parseInt(sel.value, 10) }).then(function (r) {
    if (r.ok) {
      toast(T('admin.tFinished') + ' ✔ — ' + (r.data.winner || ''), 'ok');
      adminLoadTourneys();
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

/* ── تبويب الألعاب ── */
function adminLoadGames() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  API.get('/api/admin/games').then(function (r) {
    const map = (r.ok && r.data && r.data.games) ? r.data.games : {};
    const rows = GAMES.map(function (g) {
      const enabled = !DISABLED[g.id];
      const st = enabled
        ? '<span class="spill ok">' + T('admin.active') + '</span>'
        : '<span class="spill bad">' + T('admin.banned') + '</span>';
      const btn = enabled
        ? '<button class="abtn bad" onclick="adminToggleGame(\'' + g.id + '\')">' + T('admin.disable') + '</button>'
        : '<button class="abtn ok" onclick="adminToggleGame(\'' + g.id + '\')">' + T('admin.enable') + '</button>';
      return '<tr>' +
        '<td>' + g.em + ' <b>' + esc(gname(g)) + '</b></td>' +
        '<td>' + g.cat + '</td>' +
        '<td>' + g.rtp + '%</td>' +
        '<td>' + st + '</td>' +
        '<td>' + btn + '</td>' +
      '</tr>';
    }).join('');
    c.innerHTML =
      '<div class="note" style="margin-top:0">' + T('admin.gamesDisabled') + '</div>' +
      '<div class="atable-wrap"><table class="atable">' +
        '<thead><tr><th>اللعبة</th><th>التصنيف</th><th>RTP</th><th>' + T('admin.status') + '</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }).catch(function () {
    c.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}

function adminToggleGame(id) {
  const cur = DISABLED[id] ? false : true;
  API.post('/api/admin/games/' + id + '/toggle', { enabled: !cur }).then(function (r) {
    if (r.ok) {
      if (r.data.enabled) {
        delete DISABLED[id];
      } else {
        DISABLED[id] = true;
      }
      adminLoadGames();
      renderAll();
      toast(r.data.enabled ? T('admin.enable') + ' ✔' : T('admin.disable') + ' ✔', 'ok');
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

/* ── تبويب المكافآت ── */
function adminLoadRewards() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  API.get('/api/admin/rewards').then(function (r) {
    const d = (r.ok && r.data) ? r.data : { amount: 100, interval_hours: 24 };
    c.innerHTML =
      '<div class="reward-form">' +
        '<label class="aflabel" for="rwAmount">' + T('admin.rewardAmount') + '</label>' +
        '<input class="afinput" id="rwAmount" type="number" value="' + d.amount + '" min="0">' +
        '<label class="aflabel" for="rwInterval">' + T('admin.rewardInterval') + '</label>' +
        '<input class="afinput" id="rwInterval" type="number" value="' + d.interval_hours + '" min="1" max="720">' +
        '<button class="btn" style="margin-top:14px" onclick="adminSaveRewards()">' + T('admin.save') + '</button>' +
      '</div>';
  }).catch(function () {
    c.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}

function adminSaveRewards() {
  const a = document.getElementById('rwAmount');
  const i = document.getElementById('rwInterval');
  if (!a || !i) return;
  API.post('/api/admin/rewards', {
    amount: parseInt(a.value, 10),
    interval_hours: parseInt(i.value, 10)
  }).then(function (r) {
    if (r.ok) {
      toast(T('admin.save') + ' ✔', 'ok');
    } else {
      toast((r.data && r.data.message) || T('auth.error'), 'err');
    }
  });
}

/* ── تبويب المالية ── */
function adminLoadFinance() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  c.innerHTML = '<div class="note">…</div>';
  Promise.all([API.get('/api/admin/stats'), API.get('/api/admin/stats/games')]).then(function (rs) {
    const s = (rs[0].ok && rs[0].data) ? rs[0].data : {};
    const gs = (rs[1].ok && rs[1].data && rs[1].data.games) ? rs[1].data.games : [];
    const rows = gs.length
      ? '<div class="atable-wrap"><table class="atable">' +
        '<thead><tr><th>اللعبة</th><th>' + T('admin.plays') + '</th><th>' + T('admin.wins') + '</th><th>' + T('admin.coinsWon') + '</th></tr></thead><tbody>' +
        gs.map(function (g) {
          return '<tr><td><b>' + esc(g.game_id) + '</b></td><td>' + fmt(g.plays) + '</td><td>' + fmt(g.wins) + '</td><td>🪙 ' + fmt(g.coins_won) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>'
      : '<div class="note">' + T('admin.noUsers') + '</div>';
    c.innerHTML =
      '<div class="grid g3" style="margin-bottom:14px">' +
        '<div class="stat"><div class="si">👥</div><div><div class="sv">' + fmt(s.users_total || 0) + '</div><div class="sl">' + T('admin.totalUsers') + '</div></div></div>' +
        '<div class="stat"><div class="si">🪙</div><div><div class="sv">' + fmt(s.gold_total || 0) + '</div><div class="sl">' + T('admin.totalCoins') + '</div></div></div>' +
        '<div class="stat"><div class="si">🎮</div><div><div class="sv">' + fmt(s.plays_total || 0) + '</div><div class="sl">' + T('admin.plays') + '</div></div></div>' +
      '</div>' + rows +
      /* ═══ [v2.41.1] طلبات الدفع المعلّقة (إيداع/سحب) — موافقة أو رفض من هنا مباشرة ═══ */
      '<div class="note" style="margin-top:16px">' + T('admin.payHint') + '</div>' +
      '<div id="payPending"><div class="note">…</div></div>';
    adminLoadPendingPayments();
  }).catch(function () {
    c.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}

/* ── [v2.41.1] قائمة طلبات الدفع المعلّقة مع أزرار الموافقة/الرفض ── */
function adminLoadPendingPayments() {
  const box = document.getElementById('payPending');
  if (!box) return;
  API.get('/api/admin/payments/pending').then(function (r) {
    const list = (r.ok && r.data && r.data.pending) ? r.data.pending : (r.ok && r.data && r.data.transactions) ? r.data.transactions : [];
    if (!r.ok) { box.innerHTML = '<div class="note">' + T('auth.error') + '</div>'; return; }
    if (!list.length) { box.innerHTML = '<div class="note" style="color:var(--ok,#22c55e)">' + T('admin.payNone') + '</div>'; return; }
    box.innerHTML = '<div class="atable-wrap"><table class="atable"><thead><tr>' +
      '<th>#</th><th>' + T('admin.txUser') + '</th><th>' + T('admin.txMethod') + '</th><th>' + T('admin.txAmount') + '</th>' +
      '<th>' + T('admin.txRef') + '</th><th>' + T('admin.txAction') + '</th></tr></thead><tbody>' +
      list.map(function (t) {
        const dir = (t.type === 'withdrawal') ? '💸 ' + T('admin.txWithdrawal') : '📥 ' + T('admin.txDeposit');
        return '<tr><td><b>' + esc(t.id) + '</b><div style="opacity:.6;font-size:.72rem">' + esc(t.created_at || '') + '</div></td>' +
          '<td>' + esc(t.user_id || '') + '</td>' +
          '<td>' + dir + '<div style="opacity:.6">' + esc(t.method || '') + '</div></td>' +
          '<td>🪙 ' + fmt(t.amount_usd) + ' $</td>' +
          '<td style="max-width:220px;word-break:break-all">' + esc(t.proof_details || '—') + '</td>' +
          '<td><button class="abtn ok" onclick="adminPayAct(\'' + esc(t.id) + '\',\'approve\')">✅ ' + T('admin.approve') + '</button> ' +
          '<button class="abtn bad" onclick="adminPayAct(\'' + esc(t.id) + '\',\'reject\')">❌ ' + T('admin.reject') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }).catch(function () {
    box.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
  });
}
function adminPayAct(txId, action) {
  if (action === 'reject' && !confirm((T('admin.reject') + ' — ' + txId + ' ?'))) return;
  API.post('/api/admin/payments/act', { tx_id: txId, action: action }).then(function (r) {
    if (r.ok) { toast(T('admin.payDone') + ' ✔', 'ok'); adminLoadPendingPayments(); }
    else toast((r.data && (r.data.error || r.data.message)) || T('auth.error'), 'err');
  }).catch(function () { toast(T('auth.error'), 'err'); });
}
/* ═══ [BotPL 2026-09-14] مؤشر أرباح/خسائر المنصة من اللاعب الآلي (سوبر فقط) ═══
   رصيد الآلي = مؤشر نسبي لأرباح/خسائر المنصة (توضيح المالك): كل دفع للاعب
   الفائز ضد الآلي = خسارة منصة (−)، وكل رهان خاسر = ربح منصة (+).
   المصدر: BotsLedger (state.js) — localStorage rc_bots_pl. */
function adminLoadBotPL() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  if (!window.BotsLedger) {
    c.innerHTML = '<div class="note">' + T('auth.error') + '</div>';
    return;
  }
  const st = window.BotsLedger.stats();
  const cur = function (v) { return '<span style="color:' + (v >= 0 ? 'var(--ok, #22c55e)' : 'var(--err, #ef4444)') + ';font-weight:700">' + (v >= 0 ? '+' : '') + fmt(v) + '</span>'; };
  const rows = st.rows.length
    ? '<div class="atable-wrap"><table class="atable">' +
      '<thead><tr><th>' + T('admin.game') + '</th><th>' + T('admin.platWin') + '</th><th>' + T('admin.platLose') + '</th><th>Net</th><th>' + T('admin.rounds') + '</th></tr></thead><tbody>' +
      st.rows.map(function (r) {
        const name = (typeof gname === 'function' && typeof GAMES !== 'undefined')
          ? (GAMES.filter(function (g) { return g.id === r.gid; }).map(function (g) { return gname(g); })[0] || r.gid)
          : r.gid;
        return '<tr><td><b>' + esc(name) + '</b></td><td>🪙 ' + fmt(r.win) + '</td><td>🪙 ' + fmt(r.lose) + '</td><td>' + cur(r.net) + '</td><td>' + fmt(r.count) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>'
    : '<div class="note">' + T('admin.noData') + '</div>';
  c.innerHTML =
    '<div class="grid g3" style="margin-bottom:14px">' +
      '<div class="stat"><div class="si">📈</div><div><div class="sv">' + cur(st.net) + '</div><div class="sl">' + T('admin.platNet') + '</div></div></div>' +
      '<div class="stat"><div class="si">🪙</div><div><div class="sv">' + fmt(st.winSum) + '</div><div class="sl">' + T('admin.platWinSum') + '</div></div></div>' +
      '<div class="stat"><div class="si">🎮</div><div><div class="sv">' + fmt(st.rounds) + '</div><div class="sl">' + T('admin.rounds') + '</div></div></div>' +
    '</div>' +
    rows +
    '<div style="margin-top:12px;text-align:' + (ST.lang === 'ar' ? 'right' : 'left') + '">' +
      '<button class="abtn" onclick="adminResetBotPL()">🗑️ ' + T('admin.resetPL') + '</button>' +
    '</div>';
}

function adminResetBotPL() {
  if (!window.BotsLedger) return;
  SND.click();
  window.BotsLedger.reset();
  adminLoadBotPL();
}


/* [Auth] قناة مراسلة مباشرة مخصّصة للمشرفين — لا يراها اللاعبون */
function adminLoadCoordination() {
  const c = document.getElementById('adminContent');
  if (!c) return;
  c.innerHTML =
    '<div class="coord-wrap">' +
      '<div class="coord-head"><i class="fa-solid fa-comments" aria-hidden="true"></i> ' + T('admin.coordTitle') + '</div>' +
      '<div class="coord-msgs" id="coordMsgs"><div class="note">…</div></div>' +
      '<div class="coord-input">' +
        '<input class="afinput" id="coordInput" placeholder="' + T('admin.coordPlaceholder') + '" maxlength="4000" onkeydown="if(event.key===\'Enter\')adminSendCoordination()">' +
        '<button class="btn" id="coordSend" onclick="adminSendCoordination()"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>' +
      '</div>' +
    '</div>';
  loadAdminCoordinationMessages();
}
function loadAdminCoordinationMessages() {
  const box = document.getElementById('coordMsgs');
  if (!box) return;
  API.get('/api/admin/messages').then(function (r) {
    if (!r.ok || !r.data) { box.innerHTML = '<div class="note">' + T('auth.error') + '</div>'; return; }
    const msgs = r.data.messages || [];
    if (!msgs.length) { box.innerHTML = '<div class="note">' + T('admin.coordEmpty') + '</div>'; return; }
    box.innerHTML = msgs.map(function (m) {
      const mine = (AUTH.user && m.sender_id === AUTH.user.id);
      return '<div class="coord-msg' + (mine ? ' mine' : '') + '">' +
        '<div class="cm-head"><span class="cm-name">' + esc(m.sender_name || ('user' + m.sender_id)) + '</span>' +
        '<span class="cm-time">' + new Date(m.created_at).toLocaleString('ar') + '</span></div>' +
        '<div class="cm-text">' + esc(m.text) + '</div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }).catch(function () { box.innerHTML = '<div class="note">' + T('auth.error') + '</div>'; });
}
function adminSendCoordination() {
  const inp = document.getElementById('coordInput');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  const btn = document.getElementById('coordSend');
  if (btn) btn.disabled = true;
  API.post('/api/admin/messages', { text: text }).then(function (r) {
    if (r.ok) { inp.value = ''; loadAdminCoordinationMessages(); }
    else toast(r.data && r.data.message ? r.data.message : T('auth.error'), 'err');
  }).catch(function () { toast(T('auth.error'), 'err'); })
    .then(function () { if (btn) btn.disabled = false; });
}
/* بثّ SSE للرسائل المشرفين */
if (typeof window !== 'undefined') {
  window.addEventListener('RC_admin_msg', function (e) {
    if (ADMIN_TAB === 'coord') loadAdminCoordinationMessages();
  });
}
/* ═══════════ Ticker ═══════════ */
/* [B7] اسم اللعبة في شريط الفائزين يُحوَّل لاسمه المحلي (لا إنجليزي بالواجهة العربية) */
function tickGameLabel(raw) {
  try {
    const r = String(raw || '').replace(/[^\w\s-]/g, '').trim().toLowerCase();
    if (r && typeof GAMES !== 'undefined') {
      const g = GAMES.find(function (x) {
        if (x.id === r) return true;
        const eng = String(x.eng || '').toLowerCase();
        return eng.length > 2 && (r === eng || r.indexOf(eng) !== -1 || eng.indexOf(r) !== -1);
      });
      if (g) return gname(g);
    }
  } catch (e) {}
  return raw;
}
window.tickGameLabel = tickGameLabel;
function renderTicker() {
  /* البيانات الحقيقية تأتي من SSE (RC_ticks) — fallback مؤقت قبل الاتصال */
  const src = (window.RC_ticks && window.RC_ticks.length) ? window.RC_ticks : [
    ['RondaMaster', 'Moroccan Ronda', 15240],
    ['KingPlayer', 'Aviator', 5240],
    ['LuckyGirl', 'Mines', 8900],
    ['ProGamer', 'Blackjack', 3200],
    ['GoldHunter', 'Plinko', 12500]
  ];
  const el = document.getElementById('ticker');
  if (!el) return;
  const items = src.map(x =>
    '<span class="tk"> <span class="p">' + x[0] + '</span> ' + T('tk.won') +
    ' <span class="w">🪙 ' + fmt(x[2]) + '</span> <span class="g">(' + tickGameLabel(x[1]) + ')</span></span>'
  ).join('');
  el.innerHTML = items + items;
}
/* ═══════════ الدردشة ═══════════ */
/* الرسائل الحية تُدار من js/core/live.js عبر RC_renderChat — هنا مجرد توجيه */
function renderChat() {
  if (typeof window.RC_renderChat === 'function') { window.RC_renderChat(); return; }
  const el = document.getElementById('chatMsgs');
  if (el) el.innerHTML = '';
}
/* ═══════════ Render All ═══════════ */
/* مزامنة عدد الألعاب المعروض (الشارة + الإحصائية) مع العدد الفعلي في الكتالوج */
function syncGamesCount() {
  /* [UI] عدد الألعاب لم يعد يُعرض — إزالة الشارة إن وُجدت في نسخ قديمة */
  var badge = document.getElementById('gamesCountBadge');
  if (badge) badge.remove();
}

function renderAll() {
  syncGamesCount();
  renderGames();
  renderLB();
  renderTourney();
  renderFair();
  renderAdmin();
  renderTicker();
  renderChat();
  wallet();
}
/* ═══════════ التهيئة عند التحميل ═══════════ */
function initApp() {
  /* تحميل الحالة */
  initState();
  /* ضبط اللغة */
  if (typeof syncLangDrop === 'function') syncLangDrop();
  /* ضبط زر الصوت (قد يوجد أكثر من زر في صفحات مختلفة) */
  if (typeof syncMuteBtns === 'function') {
    syncMuteBtns();
  } else {
    const muteBtns = document.querySelectorAll('#muteBtn');
    muteBtns.forEach(function (btn) {
      btn.setAttribute('aria-pressed', ST.mute ? 'true' : 'false');
    });
  }
  /* تطبيق الاتجاه */
  applyI18n();
  /* ترجمة العناصر الثابتة (لغة محفوظة) */
  translateStatic();
  /* مزامنة عدد الألعاب مع الكتالوج الفعلي */
  syncGamesCount();
  /* تحديث سنة حقوق النشر */
  updateCopyright();
  /* تهيئة التأثيرات */
  fxInit();
  /* تفعيل السحب اليدوي لأيقونة التفاعلات العائمة */
  if (typeof initFabDrag === 'function') initFabDrag();
  /* استعادة جلسة المستخدم (إن وُجدت) */
  if (typeof authRestore === 'function') {
    authRestore().then(function () {
      /* غرف متعددة اللاعبين: SSE + انضمام تلقائي من رابط الدعوة */
      if (typeof Rooms !== 'undefined') {
        Rooms.joinSse();
        Rooms.tryAutoJoin();
      }
    });
  }
  /* مزامنة الرصيد مع الخادم كل 30 ثانية */
  setInterval(function() {
    if (typeof authSync === 'function') authSync();
  }, 30000);
  /* تحديث حي لصفحة غرف اللعب (كل 5 ثوانٍ أثناء فتح الصفحة فقط) */
  setInterval(function() {
    const pg = document.getElementById('pg-rooms');
    if (pg && pg.classList.contains('active') && typeof renderRooms === 'function') renderRooms();
  }, 5000);
  /* رسم كل شيء */
  renderAll();
  /* Hash routing: activate the section matching the URL hash (e.g. index.html#games) */
  navFromHash();
  /* [Legal-Fix] قادم من صفحة قانونية ببند حساب: افتح موداله مباشرة
     (#tr = إرسال الرصيد — البنود الأخرى صفحات spa عالجها navFromHash).
     يُنفَّذ بعد استعادة الجلسة (authRestore غير متزامن) كي لا يرفض
     openTrModal المستخدمَ الذي جلسته كوكي صالح لكنها لم تُطبَّق بعد. */
  if (window.location.hash === '#tr') {
    var openTrWhenReady = function (tries) {
      if (typeof openTrModal !== 'function') return;
      if (AUTH.user) { try { openTrModal(); } catch (e) {} return; }
      if (tries > 20) return;
      setTimeout(function () { openTrWhenReady(tries + 1); }, 300);
    };
    openTrWhenReady(0);
  }
  /* أرقام المتصلين والدردشة الحية تأتي الآن من SSE (js/core/live.js) */
  /* زر ملء الشاشة: نص أولي + تزامن مع تغيير الوضع */
  syncGameFsBtn();
  function onFsChange(){ if (typeof syncGameFsBtn==='function') syncGameFsBtn(); if (typeof syncPgTop==='function') syncPgTop(); }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  /* تلميح التدوير: يُقيَّم عند تغيير الاتجاه أو الحجم أو وضع ملء الشاشة */
  window.addEventListener('resize', function () {
    clearTimeout(window._rotT);
    window._rotT = setTimeout(function(){ if (typeof syncVisualViewport==='function') syncVisualViewport(); if (typeof syncPgTop==='function') syncPgTop(); checkRotateHint(); if (typeof fitGameStage==='function') fitGameStage(); }, 250);
  });
  window.addEventListener('orientationchange', function () {
    setTimeout(checkRotateHint, 400);
    if (typeof fitGameStageSoon==='function') fitGameStageSoon();
  });
  document.addEventListener('fullscreenchange', function () {
    setTimeout(checkRotateHint, 300);
  });
  /* إغلاق بمفتاح Escape */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const gp = document.getElementById('pg-game');
      if (gp && gp.classList.contains('active')) {
        closeGamePage();
        return;
      }
      closeModal();
      closeRulesModal();
    }
  });
  console.log(' DTSG — Digital Traditional Skills Games loaded successfully!');
}
/* ═══════════ معالجة الأخطاء العامة ═══════════ */
/* نتجاهل أخطاء تحميل الموارد (صور/خطوط/أيقونات) وأخطاء السكربتات عبر النطاقات،
   ولا نعرض تنبيهاً مخيفاً إلا للأخطاء البرمجية الحقيقية. */
window.addEventListener('error', function(e) {
  if (!e || !e.error) return;                 // خطأ تحميل مورد (لا يوجد كائن خطأ)
  if (e.message === 'Script error.') return;  // خطأ عبر نطاق مختلف (بدون تفاصيل)
  console.error('DTSG — Digital Traditional Skills Games Error:', e.error);
  if (typeof toast === 'function') toast('حدث خطأ غير متوقع — أعد المحاولة', 'err');
});
window.addEventListener('unhandledrejection', function(e) {
  console.error('Promise Error:', e && e.reason);
});
/* ═══════════ تشغيل التطبيق ═══════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}



/* ═══════════ Tournament Bracket Visualizer ═══════════ */
function toggleTournamentBracket(tId) {
  const bracketEl = document.getElementById('bracket-' + tId);
  if (!bracketEl) return;
  const isHidden = bracketEl.style.display === 'none';
  bracketEl.style.display = isHidden ? 'block' : 'none';
  if (isHidden && typeof SND !== 'undefined' && SND.click) SND.click();
}
window.toggleTournamentBracket = toggleTournamentBracket;

/* ═══════════ Network Status Listeners ═══════════ */
if (typeof window !== 'undefined') {
  window.addEventListener('online', function () {
    toast('🌐 ' + (T('ui.onlineBack') || 'تمت استعادة الاتصال بالإنترنت!'), 'ok');
    if (typeof authRestore === 'function') authRestore();
  });
  window.addEventListener('offline', function () {
    toast('⚠️ ' + (T('ui.offlineWarn') || 'انقطع الاتصال بالإنترنت'), 'warn');
  });
}

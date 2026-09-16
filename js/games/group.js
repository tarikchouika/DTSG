/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — Group Rounds Panel (Keno + Crash)
   لوحة الجولة الجماعية: جولات أوتوماتيكية يتحكم بها الخادم،
   رهان جماعي موحّد، سجل حي جماعي، ومدقق Provably Fair لكل جولة.
   يعتمد على: fair.js (sha256 + المولد الحتمي)، live.js (SSE gr:ke/gr:av)
   ═══════════════════════════════════════════ */
(function () {
  "use strict";

  const Group = {
    active: null,      // 'ke' | 'av' | null
    round: null,       // آخر جولة من السيرفر {round_no,status,bet_ends_at,phase_ends_at,seed_hash,started_at}
    myBets: [],        // رهاناتي في الجولة الحالية (من السيرفر)
    live: [],          // سجل الرهانات الحية (كل اللاعبين)
    lastResult: null,  // نتيجة آخر جولة منتهية {winners, total_paid}
    countTimer: null,
    _avFlying: false,
    _avCrashed: false,
    _keRevealed: false
  };

  /* ── أدوات ── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function me() {
    return (typeof AUTH !== 'undefined' && AUTH && AUTH.user) ? AUTH.user.username : null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtSec(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  function statusText(st) {
    if (st === 'betting') return T('grp.betting');
    if (st === 'drawing') return T('grp.drawing');
    if (st === 'flying') return T('grp.flying');
    return T('grp.finished');
  }
  function chipClass(st) {
    return st === 'betting' ? 'betting' : st === 'drawing' ? 'drawing' : st === 'flying' ? 'flying' : 'finished';
  }
  function isMe(u) { return me() !== null && u === me(); }

  /* ── تحديث الرصيد من السيرفر حصرياً ── */
  Group.setGold = function (g) {
    if (typeof g !== 'number') return;
    ST.gold = g;
    wallet();
    save();
  };

  /* ── جلب الجولة الحالية (المصدر الوحيد للرصيد) ── */
  Group.fetchRound = function () {
    const id = Group.active;
    if (!id) return Promise.resolve();
    return API.get('/api/games/' + id + '/round').then(function (r) {
      if (!r.ok || !r.data || !r.data.round) return;
      const prevNo = Group.round ? Group.round.round_no : null;
      const prevSt = Group.round ? Group.round.status : null;
      Group.round = r.data.round;
      Group.myBets = r.data.my_bets || [];
      Group.live = r.data.live || [];
      if (typeof r.data.gold === 'number') Group.setGold(r.data.gold);
      const st = r.data.round.status;
      const isNew = prevNo !== null && prevNo !== r.data.round.round_no;
      /* فتح الصفحة أثناء الطيران → بدء الطيران من started_at الخادمي */
      if (st === 'flying' && !Group._avFlying && r.data.round.started_at) {
        Group.avOnFly(r.data.round.started_at);
      }
      /* فتح الصفحة أثناء السحب (كينو) → كشف الأرقام فوراً */
      if (id === 'ke' && st === 'drawing' && !Group._keRevealed && Group.round.numbers) {
        Group.keOnDraw(Group.round.numbers);
      }
      if (isNew && prevSt === 'finished') Group.lastResult = null;
      Group.renderPanel();
    }).catch(function () { /* لا شيء */ });
  };

  /* ── تفعيل اللوحة عند فتح لعبة جماعية ── */
  Group.activate = function (gameId) {
    if (Group.active === gameId) return;
    Group.deactivate();
    Group.active = gameId;
    Group.lastResult = null;
    Group._avFlying = false;
    Group._avCrashed = false;
    Group._keRevealed = false;
    Group.fetchRound();
    if (Group.countTimer) clearInterval(Group.countTimer);
    Group.countTimer = setInterval(function () { Group.renderCount(); }, 500);
  };

  /* ── إيقاف اللوحة عند إغلاق اللعبة ── */
  Group.deactivate = function () {
    if (Group.countTimer) { clearInterval(Group.countTimer); Group.countTimer = null; }
    Group.active = null;
    Group.round = null;
    Group.myBets = [];
    Group.live = [];
    Group.lastResult = null;
    Group._avFlying = false;
    Group._avCrashed = false;
    Group._keRevealed = false;
  };

  /* ═══════════ عرض اللوحة ═══════════ */
  Group.renderPanel = function () {
    const el = document.getElementById('gpanel');
    if (!el) return;
    const r = Group.round;
    if (!r) {
      el.innerHTML = '<div class="gpanel"><div class="note">' + T('grp.waiting') + '</div></div>';
      return;
    }
    const st = r.status;
    const seedShort = r.seed_hash ? r.seed_hash.slice(0, 10) + '…' + r.seed_hash.slice(-6) : '—';
    const myCount = Group.myBets.length;

    let feedHtml = Group.live.slice(-18).map(function (b) {
      const cls = isMe(b.username) ? 'me' : '';
      const who = esc(b.username || '؟');
      const amt = fmt(b.amount || 0);
      if (b.payout > 0) {
        return '<div class="gfeed-item ' + cls + '"><span class="gwho">' + who + '</span>' +
          '<span class="gact">🪙 ' + amt + ' → <b class="gwin">' + fmt(b.payout) + '</b> ' + T('grp.cashedOut') + '</span></div>';
      }
      let detail = '🪙 ' + amt;
      if (b.picks && b.picks.length) detail += ' 🎱 ' + b.picks.join(',');
      return '<div class="gfeed-item ' + cls + '"><span class="gwho">' + who + '</span>' +
        '<span class="gact">' + detail + '</span></div>';
    }).join('');
    if (!feedHtml) feedHtml = '<div class="gfeed-empty">' + T('grp.noBets') + '</div>';

    let resultHtml = '';
    if (Group.lastResult) {
      const res = Group.lastResult;
      resultHtml = '<div class="gresult">🏆 ' + T('grp.winners') + ': <b>' + res.winners +
        '</b> · ' + T('grp.totalPaid') + ': <b class="gwin">' + fmt(res.total_paid) + '</b> 🪙</div>';
    }

    el.innerHTML =
      '<div class="gpanel">' +
        '<div class="ghead">' +
          '<span class="gchip ' + chipClass(st) + '">● ' + statusText(st) + '</span>' +
          '<span class="gcount" id="gCount"></span>' +
        '</div>' +
        '<div class="gmeta">' +
          '<span class="gseed">🔒 ' + T('grp.seed') + ': <b title="' + esc(r.seed_hash || '') + '">' + esc(seedShort) + '</b></span>' +
          '<button type="button" class="gverify" onclick="Group.verify()">🛡 ' + T('grp.verify') + '</button>' +
        '</div>' +
        (myCount ? '<div class="gmy">🎯 ' + T('grp.myBet') + ': <b>' + myCount + '</b></div>' : '') +
        '<div class="gfeed" id="gFeed">' + feedHtml + '</div>' +
        resultHtml +
      '</div>';
    /* مزامنة أزرار الرهان مع نافذة الرهان الخادمية */
    if (Group.active === 'ke' && typeof window.kePanelSync === 'function') window.kePanelSync(st);
    if (Group.active === 'av' && typeof window.avPanelSync === 'function') window.avPanelSync(st);
    Group.renderCount();
  };

  Group.renderCount = function () {
    const r = Group.round;
    const el = document.getElementById('gCount');
    if (!el || !r) return;
    let target = r.bet_ends_at || 0;
    if (r.status === 'drawing' || r.status === 'flying') target = r.phase_ends_at || target;
    if (!target) { el.textContent = '—'; return; }
    const left = target - Date.now();
    el.textContent = fmtSec(left);
    if (left < 0) el.textContent = '00:00';
  };

  /* ═══════════ سجل حي — إضافة رهان / سحب ═══════════ */
  Group.pushLive = function (b) {
    const rn = b.round_no;
    if (Group.round && rn !== undefined && rn !== Group.round.round_no) return;
    Group.live.push({ username: b.username, amount: b.amount, picks: b.picks || null, payout: b.payout || 0 });
    if (Group.live.length > 60) Group.live.splice(0, Group.live.length - 60);
    Group.renderPanel();
  };
  Group.pushCashout = function (b) {
    const rn = b.round_no;
    if (Group.round && rn !== undefined && rn !== Group.round.round_no) return;
    for (let i = Group.live.length - 1; i >= 0; i--) {
      if (Group.live[i].username === b.username && !Group.live[i].payout) {
        Group.live[i].payout = b.payout;
        Group.renderPanel();
        return;
      }
    }
    Group.live.push({ username: b.username, amount: b.amount || 0, picks: null, payout: b.payout });
    Group.renderPanel();
  };

  /* ═══════════ المدقق Provably Fair ═══════════ */
  Group.verify = function () {
    const id = Group.active;
    if (!id || typeof Fair === 'undefined') { toast(T('grp.waiting'), 'warn'); return; }
    API.get('/api/games/' + id + '/group-history').then(function (r) {
      if (!r.ok || !r.data || !r.data.rounds || !r.data.rounds.length) {
        toast(T('grp.noRounds'), 'warn');
        return;
      }
      const rows = r.data.rounds.slice(0, 10).map(function (x) {
        let verdict = '';
        let outTxt = '';
        try {
          const ok = Fair.verify(x.seed, id, x.outcome);
          verdict = ok
            ? '<span class="gv-pass">✓ ' + T('grp.pass') + '</span>'
            : '<span class="gv-fail">✗ ' + T('grp.fail') + '</span>';
          const o = x.outcome;
          outTxt = id === 'ke'
            ? (o.numbers ? o.numbers.join(', ') : '—')
            : (o.crash_at !== undefined ? o.crash_at.toFixed(2) + '×' : '—');
        } catch (e) {
          verdict = '<span class="gv-fail">✗ ' + T('grp.fail') + '</span>';
        }
        return '<div class="gv-row">' +
          '<div class="gv-top"><b>#' + x.round_no + '</b> ' +
          '<span class="gseed">' + esc((x.seed || '').slice(0, 14)) + '…</span> ' + verdict + '</div>' +
          '<div class="gv-out">' + T('grp.outcome') + ': <b>' + esc(outTxt) + '</b></div>' +
        '</div>';
      }).join('');
      const overlay = document.createElement('div');
      overlay.className = 'gv-overlay';
      overlay.innerHTML =
        '<div class="gv-box">' +
          '<div class="gv-head">🛡 ' + T('grp.verifyTitle') + ' <span class="gv-game">' + id.toUpperCase() + '</span>' +
          '<button type="button" class="gv-close" onclick="this.parentNode.parentNode.parentNode.remove()">✕</button></div>' +
          '<div class="gv-sub">' + T('grp.verifySub') + '</div>' +
          '<div class="gv-list">' + rows + '</div>' +
        '</div>';
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    });
  };

  /* ═══════════ Hookups — تستدعيها الألعاب (engines.js / crash.js) ═══════════ */
  /* كينو: كشف أرقام الجولة المسحوبة من السيرفر */
  Group.keOnDraw = function (numbers) {
    if (Group._keRevealed) return; /* حارس التكرار: كشف واحد لكل جولة */
    Group._keRevealed = true;
    if (typeof window.keReveal === 'function') window.keReveal(numbers);
  };
  /* كينو: نتيجة الجولة الجماعية */
  Group.keOnResolve = function (result) {
    if (typeof window.keResolveResult === 'function') window.keResolveResult(result);
  };
  /* كراش: بدء الطيران من started_at الخادمي */
  Group.avOnFly = function (startedAt) {
    if (!startedAt || Group._avFlying) return;
    Group._avFlying = true;
    Group._avCrashed = false;
    if (typeof window.avStartFly === 'function') window.avStartFly(startedAt);
  };
  /* كراش: الانفجار عند crash_at الحقيقي من السيرفر */
  Group.avOnCrash = function (crashAt) {
    if (Group._avCrashed) return; /* حارس التكرار: انفجار واحد لكل جولة */
    Group._avCrashed = true;
    if (typeof window.avCrashNow === 'function') window.avCrashNow(crashAt);
  };

  /* ═══════════ معالج أحداث SSE (يستدعيه live.js) ═══════════ */
  window.RC_groupEvent = function (gameId, d) {
    if (!d || !d.type) return;
    const mine = Group.active === gameId;
    /* جولة جديدة للعبة غير المفتوحة حالياً: تجاهل (لا تمسح لوحة اللعبة النشطة) */
    if (d.type === 'new') {
      if (!mine) return;
      Group.round = {
        round_no: d.round_no,
        status: 'betting',
        bet_ends_at: d.bet_ends_at,
        phase_ends_at: d.phase_ends_at,
        seed_hash: d.seed_hash,
        started_at: null
      };
      Group.myBets = [];
      Group.lastResult = null;
      Group._avFlying = false;
      Group._avCrashed = false;
      Group._keRevealed = false;
      /* جولة جديدة: إعادة تعيين الواجهة + جلب الرصيد المحدث من السيرفر */
      if (typeof window.keNewRound === 'function') window.keNewRound();
      if (typeof window.avNewRound === 'function') window.avNewRound();
      Group.renderPanel();
      Group.fetchRound();
      return;
    }
    /* باقي الأحداث: تُطبق فقط على الجولة المفتوحة المطابقة (لا نصوص على null، لا خلط جولات) */
    if (!mine || !Group.round) return;
    if (d.round_no !== undefined && Group.round.round_no !== d.round_no) return;
    switch (d.type) {
      case 'bet':
        Group.pushLive(d);
        break;
      case 'cashout':
        Group.pushCashout(d);
        break;
      case 'draw':
        Group.round.status = 'drawing';
        Group.round.phase_ends_at = d.phase_ends_at;
        Group.renderPanel();
        Group.keOnDraw(d.numbers);
        break;
      case 'fly':
        Group.round.status = 'flying';
        Group.round.started_at = d.started_at;
        Group.renderPanel();
        Group.avOnFly(d.started_at);
        break;
      case 'resolve':
        Group.lastResult = d.result;
        Group.round.status = 'finished';
        Group.renderPanel();
        Group.keOnResolve(d.result);
        Group.fetchRound();
        break;
      case 'crash':
        Group.lastResult = d.result;
        Group.round.status = 'finished';
        Group.renderPanel();
        Group.avOnCrash(d.crash_at);
        Group.fetchRound();
        break;
    }
  };

  window.Group = Group;
})();

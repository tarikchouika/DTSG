/**
 * ============================================================================
 *  RondaRenderer — طبقة العرض للروندا (v2.9 — الطاولة المعتمدة)
 *  • الأوراق إسبانية حقيقية: assets/cards/es/{rank}-{suit}.webp + back.webp.
 *  • بورتريه: أنا أسفل-يسار (bl) ويدّي مكشوفة؛ الدور والاتجاه عكس عقارب
 *    الساعة (التسلسل المرئي bl → br → tr → tl). الخصم أسفل-يمين (br) بصفّ
 *    ورق مقلوب في نفس صف اليد، والخصمان العلويان (tl/tr) بصفّي ورق بحجم
 *    كامل ولوحتاهما تحتهما — لا كشف لأي يد قبل رميها.
 *  • لاندسكيب: أنا أسفل-يمين (br) ويدّي المكشوفة على يمين الصف السفلي،
 *    والخصوم tr ثم tl ثم bl (بصفّ ظهره في نفس صف اليد).
 *  • الموزع (view.dealerSeat) يتوّج بشارة 👑 ذهبية على لوحته تتحدث كل جولة.
 *  • القواعد كاملة من كتاب هيدر المنصة؛ الصوت من زر السماعة في الهيدر —
 *    لا زر «؟» على الطاولة ولا مفتاح صوت في الإعدادات.
 * ============================================================================
 */
(function (root) {
  'use strict';

  const RC = root.RondaCore;
  const T = root.RD_T;

  /* اسم ملف الأصل الإسباني لكل نوع من أنواع المحرك */
  const SUIT_FILE = { KHAL: 'espadas', KOBBAS: 'copas', CHBADA: 'bastos', DHAB: 'oros' };
  function cardAsset(rank, suit) {
    return 'assets/cards/es/' + rank + '-' + (SUIT_FILE[suit] || 'oros') + '.webp';
  }

  /* ============================ بناء الأوراق ============================ */

  /**
   * opts: { back, live, off, canCapture, dealing, entering, badge }
   * وجه حقيقي: الخلفية = صورة الورقة الكاملة (الرقم والرمز داخل الصورة).
   */
  function makeCardEl(card, opts) {
    const o = opts || {};
    const el = document.createElement('div');
    el.className = 'rd-card';
    el.dataset.cardId = card.id;
    el.dataset.rank = card.rank;
    el.dataset.suit = card.suit;
    if (o.back) {
      el.classList.add('rd-back');
    } else {
      el.style.backgroundImage = "url('" + cardAsset(card.rank, card.suit) + "')";
    }
    if (o.live) el.classList.add('rd-live');
    if (o.off) el.classList.add('rd-off');
    if (o.canCapture) el.classList.add('rd-can-capture');
    if (o.dealing) el.classList.add('rd-dealing');
    if (o.entering) el.classList.add('rd-entering');
    if (o.badge) {
      const badge = document.createElement('span');
      badge.className = 'rd-capture-badge';
      badge.textContent = '+' + o.badge;
      el.appendChild(badge);
    }
    return el;
  }

  /** ورقة طائرة (تُلحق بالجسم) */
  function flyCard(fromRect, toRect, card, opts) {
    const o = opts || {};
    const el = makeCardEl(card, { back: o.back });
    el.classList.add('rd-fly-card');
    el.style.position = 'fixed';
    el.style.margin = '0';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '8000';
    const w = fromRect.width || 80, h = fromRect.height || 116;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = fromRect.left + 'px';
    el.style.top = fromRect.top + 'px';
    el.style.transform = 'rotate(' + (o.fromRotate || 0) + 'deg)';
    el.style.transition = 'all ' + (o.duration || 450) + 'ms cubic-bezier(.5,-0.1,.3,1)';
    document.body.appendChild(el);
    void el.offsetWidth; /* إجبار إعادة تدفق */
    const scale = (toRect.width || w) / w;
    el.style.left = toRect.left + 'px';
    el.style.top = toRect.top + 'px';
    el.style.transform = 'rotate(' + (o.toRotate || 0) + 'deg) scale(' + scale + ')';
    el.style.opacity = o.fadeOut ? '0' : '1';
    setTimeout(function () { el.remove(); }, (o.duration || 450) + 80);
    return el;
  }

  function rectCenter(rect) {
    return {
      left: rect.left + rect.width / 2 - 37,
      top: rect.top + rect.height / 2 - 55,
      width: rect.width, height: rect.height
    };
  }

  /* ============================ لوحات الواجهة ============================ */

  function el(id) { return document.getElementById(id); }

  function showBanner(text, subText, cls, life) {
    const layer = el('banner-layer');
    if (!layer) return;
    const b = document.createElement('div');
    b.className = 'rd-banner' + (cls ? ' ' + cls : '');
    b.style.setProperty('--rd-banner-life', ((life || 1.4) - 0.3) + 's');
    b.innerHTML = text + (subText ? '<span class="rd-banner-pts">' + subText + '</span>' : '');
    layer.appendChild(b);
    setTimeout(function () { b.remove(); }, (life || 1.4) * 1000 + 380);
  }

  function addLog(html, cls) {
    const list = el('log-list');
    if (!list) return;
    const li = document.createElement('li');
    if (cls) li.className = cls;
    li.innerHTML = html;
    list.prepend(li);
    while (list.children.length > 80) list.removeChild(list.lastChild);
  }

  function cardName(card) {
    return card.rank + ' ' + (T.msg('rdc.suit.' + card.suit, null) || card.suit);
  }

  /* ============================ مساعدو الهوية ============================ */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** حرفان من أول اسم المستخدم داخل الأيقونة (تجاهل «ال» التعريف والفراغات) */
  function twoLetters(name) {
    let n = String(name || '?').trim().replace(/^(ال|el-|El-)/, '');
    n = n.replace(/[\u200B-\u200F\u061C\u202A-\u202E]/g, '');
    const chars = Array.from(n).filter(function (c) { return c !== ' ' && c !== '_' && c !== '-' && c !== '.'; });
    if (chars.length === 0) return '؟';
    return chars.slice(0, 2).join('').toUpperCase();
  }

  function teamOf(view, player) {
    return view.teams.find(function (t) { return t.id === player.teamId; }) || null;
  }

  /**
   * أي زاوية لكل لاعب (v2.8 — الدوران عكس عقارب الساعة):
   *   المحرّك يتناقص المقعد (d → d-1) أي أن الدور ينتقل عكس عقارب الساعة.
   *   ── بورتريه (الوضع التاريخي) ──
   *   4 لاعبين: أنا «bl»، d1 «tl»، d2 «tr»، d3 «br».
   *   3 لاعبين (FFA): «tl» شاغرة — d1 «tr» و d2 «br».
   *   1ضد1: أنا «bl» والخصم «br» (الصفان السفليان فقط).
   *   ── لاندسكيب (v2.11: نفس عكس عقارب الساعة) ──
   *   اليد المكشوفة أسفل-يمين «br»، والدور يصعد مع عقارب الساعة المعكوسة:
   *   من «br» (أسفل-يمين) إلى «tr» (أعلى-يمين) ثم «tl» (أعلى-يسار) ثم
   *   «bl» (أسفل-يسار) وعودة عبر القاع — أي اللاعب الذي يلي صاحب اليد
   *   مباشرة (d3 في محرك 4 لاعبين) يجلس أعلى-يمين:
   *   4 لاعبين: أنا «br»، d1 «bl»، d2 «tl»، d3 «tr».
   *   3 لاعبين: «bl» شاغرة — d1 «tl» و d2 «tr».
   *   1ضد1: أنا «br» والخصم «tr».
   *   المتفرج (viewer<0): توزيع ثابت — المقعد 0 مركز التوزيع ثم حسب الحالة.
   */
  function isLandscape() {
    try {
      if (window.matchMedia && window.matchMedia('(orientation: landscape)').matches) return true;
    } catch (e) { /* تجاهل */ }
    return (typeof window !== 'undefined') && window.innerWidth > window.innerHeight;
  }

  function cornerForPlayer(view, player, viewerId) {
    const n = view.players.length;
    const anchor = (viewerId != null && viewerId >= 0) ? Number(viewerId) : 0;
    const d = (Number(player.id) - anchor + n) % n;
    if (isLandscape()) {
      if (d === 0) return 'br';                    /* اللاعب الرئيسي أسفل-يمين */
      if (n === 2) return 'tr';                     /* الخصم الوحيد أعلى-يمين */
      if (n === 3) return (d === 1) ? 'tl' : 'tr';  /* أسفل-يسار شاغرة */
      /* n === 4: الدور عكس عقارب الساعة — بعد «br» يصعد إلى «tr» (d3)،
         ثم «tl» (d2)، ثم «bl» (d1)، وعودة عبر القاع إلى «br» */
      if (d === 1) return 'bl';
      if (d === 2) return 'tl';
      return 'tr';
    }
    if (d === 0) return 'bl';
    if (n === 2) return 'br';          /* الخصم الوحيد أسفل-يمين */
    if (n === 3) return (d === 1) ? 'tr' : 'br';  /* أعلى-يسار شاغرة */
    /* n === 4: تسلسل عكس عقارب الساعة يبدأ منّي bl → br → tr → tl */
    if (d === 1) return 'tl';
    if (d === 2) return 'tr';
    return 'br';
  }

  /** هل يشغّل هذا المقعد صف ورق مقلوب؟ كل خصم يعرض صف ظهره في زاويته،
      أياً كانت — باستثناء الزاوية التي تجلس فيها اليد المكشوفة
      (بورتريه: bl — اليد أسفل-يسار؛ لاندسكيب: br — اليد أسفل-يمين). */
  function backrowCorner(corner, isMe) {
    if (isMe) return false;
    const handCorner = isLandscape() ? 'br' : 'bl';
    return corner !== handCorner;
  }

  /* ============================ مقاعد الزوايا ============================ */

  /* إعادة رسم الزوايا عند تبديل الاتجاه (بورتريه ↔ لاندسكيب): الزوايا
     تُحسب لحظة الرسم فقط (cornerForPlayer)، فبدون هذا تظل المقاعد في
     زوايا الاتجاه القديم بعد تدوير الهاتف حتى الحدث التالي في اللعبة */
  let _seatsArgs = null;
  let _orientWatched = false;
  let _orientWasLandscape = null;
  let _orientTimer = null;

  function watchOrientationForSeats() {
    if (_orientWatched) return;
    _orientWatched = true;
    if (typeof window === 'undefined' || !window.addEventListener) return;
    _orientWasLandscape = isLandscape();
    const check = function () {
      const now = isLandscape();
      if (now === _orientWasLandscape || !_seatsArgs) return;
      _orientWasLandscape = now;
      if (_orientTimer) clearTimeout(_orientTimer);
      _orientTimer = setTimeout(function () {
        _orientTimer = null;
        const stage = document.getElementById('rdStage');
        if (!stage || !stage.isConnected) return;   /* المسرح القديم بعد الخروج */
        try { renderSeats(_seatsArgs[0], _seatsArgs[1]); } catch (e) { /* تجاهل */ }
      }, 120);
    };
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
  }

  /**
   * opts: { viewerId, aiMode, roomMode, spectator }
   * يرسم كل الجالسين على زوايا الطاولة:
   *   - اللوحة (أيقونة + ★ النقاط + 🃏 الملتقطة) أسفل صف ورقها (علوياً)
   *     أو على نفس صف اليد (أسفل)؛
   *   - كل مقعد غير العارض يعرض صفّ ورقٍ مقلوب بظهر موحّد مزخرف بحجم كامل:
   *     صفّان ملاصقان للحافة العلوية للخصمين العلويين، وصفّ في نفس صف اليد
   *     للخصم أسفل-يمين (عدد الأوراق = يده الفعلية، بلا أي كشف للوجوه).
   *   - المتفرج: لوحات فقط (لا أيدي تُكشف أبداً) + شريط المشاهدة.
   */
  function renderSeats(view, opts) {
    const o = opts || {};
    const slots = {
      tl: el('rd-corner-tl'), tr: el('rd-corner-tr'),
      br: el('rd-corner-br'), bl: el('rd-corner-bl')
    };
    const any = Object.keys(slots).some(function (k) { return slots[k]; });
    if (!any) return;
    /* آخر لقطة + خيارات — لإعادة رسم الزوايا عند تدوير الشاشة */
    _seatsArgs = [view, o];
    watchOrientationForSeats();
    /* لقطة نظيفة */
    Object.keys(slots).forEach(function (k) { if (slots[k]) slots[k].innerHTML = ''; });

    const viewerId = (o.viewerId == null) ? -1 : o.viewerId;
    const spectator = !!o.spectator;
    const order = ['tl', 'tr', 'br', 'bl'];
    const occupied = {};
    view.players.forEach(function (p) {
      const corner = cornerForPlayer(view, p, viewerId);
      const node = slots[corner];
      if (!node) return;
      const isMe = !spectator && String(p.id) === String(viewerId);
      const active = view.currentPlayerId === p.id && view.phase === 'Playing';
      const tCls = 't' + p.teamId;
      const team = teamOf(view, p);
      const score = team ? team.score : 0;
      const showRow = backrowCorner(corner, isMe) && !spectator;
      occupied[corner] = true;
      /* صف الورق المقلوب — يُبنى قبل اللوحة في الترتيب البصري */
      if (showRow) {
        const row = document.createElement('div');
        row.className = 'rd-backrow';
        const n = Math.min(p.handCount, 3);
        for (let i = 0; i < n; i++) {
          const b = document.createElement('div');
          b.className = 'rd-back-card';
          b.style.zIndex = String(i);
          row.appendChild(b);
        }
        if (p.handCount > 3) {
          const cnt = document.createElement('span');
          cnt.className = 'rd-back-count';
          cnt.textContent = p.handCount;
          row.appendChild(cnt);
        }
        node.appendChild(row);
      }
      const seat = document.createElement('div');
      seat.className = 'rd-seat ' + (isMe ? 'rd-me-seat ' : '') + (active ? 'rd-active-turn' : '');
      seat.dataset.playerId = p.id;
      seat.dataset.corner = corner;
      if (team) seat.dataset.team = p.teamId;
      seat.title = p.name;
      /* تاج الموزع — شارة ذهبية صغيرة على لوحة صاحب المقعد الموزع
         (view.dealerSeat) تُحدَّث تلقائياً كل جولة (renderSeats من refreshView) */
      const isDealer = (p.seat != null) && (view.dealerSeat != null) &&
        Number(p.seat) === Number(view.dealerSeat);
      seat.innerHTML =
        '<div class="rd-av-wrap">' +
          '<div class="rd-av ' + tCls + '">' + esc(twoLetters(p.name)) + '</div>' +
          (isDealer ? '<span class="rd-dealer-crown" title="Dealer">👑</span>' : '') +
          (active ? '<span class="rd-turn-timer" data-player-id="' + p.id + '">⏱</span>' : '') +
        '</div>' +
        '<div class="rd-seat-stats">' +
          '<span class="rd-stat-pts">★<b>' + score + '</b></span>' +
          '<span class="rd-stat-cap">🃏<b>' + p.capturedCount + '</b></span>' +
        '</div>';
      node.appendChild(seat);
    });

    /* وسم المسرح: وجود خصمين علويين يوسّع تباعد القاعة عن الحافة العلوية */
    const stage = document.getElementById('rdStage');
    if (stage) {
      stage.classList.toggle('rd-uppers', !!(occupied.tr || occupied.tl));
      /* [v2.12] وسم عدد اللاعبين — تصغير ورق الطاولة في 1ضد1 (طلب المستخدم) */
      const n = view.players.length;
      stage.classList.toggle('rd-n2', n === 2);
      stage.classList.toggle('rd-n3', n === 3);
      stage.classList.toggle('rd-n4', n === 4);
    }
  }

  /* توافق: أسماء قديمة */
  function renderOthers(view, opts) { renderSeats(view, opts); }
  function renderMePlate(view, opts) { renderSeats(view, opts); }

  /* ============================ القاعة (المرمية + الرزمة) ============================ */

  function renderTable(view, opts) {
    const o = opts || {};
    const wrap = el('table-cards');
    if (!wrap) return;
    wrap.innerHTML = '';
    view.tableCards.forEach(function (card, i) {
      const c = makeCardEl(card, { entering: o.animateNew && i === view.tableCards.length - 1 });
      if (!o.animateNew || i !== view.tableCards.length - 1) {
        c.style.transform = 'rotate(' + (((i * 53) % 7) - 3) + 'deg)';
      }
      wrap.appendChild(c);
    });
    const dc = el('deck-count');
    if (dc) dc.textContent = view.deckCount;
  }

  /* ============================ اليد السفلية ============================ */

  /**
   * opts: { viewerId, aiMode, roomMode, spectator, interactive, onPlay(cardId), animateDeal, specState, onRequestSeat }
   * المتفرج: لا يرى أي يد — شريط مشاهدة فقط.
   */
  function renderSpectatorBar(view, opts) {
    const o = opts || {};
    const bar = el('rd-specbar');
    if (!bar) return;
    if (!o.spectator) { bar.classList.add('rd-hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('rd-hidden');
    const st = o.specState || {};
    let html = '<span class="rd-spec-eyes" aria-hidden="true">👁️</span>' +
      '<span class="rd-spec-txt">' + esc(T.msg('rdc.room.specTitle', null) || 'وضع المتفرج') + '</span>' +
      '<span class="rd-spec-sub">' + esc(T.msg('rdc.room.specSub', null) || 'تشاهد الأوراق المرمية فقط — الأيدي لا تُكشف أبداً') + '</span>';
    if (st.pending) {
      html += '<span class="rd-spec-sub">⏳ ' + esc(T.msg('ui.roomSeatPending', null) || 'في انتظار مقعد شاغر…') + '</span>';
    } else if (st.canRequest) {
      html += '<button type="button" class="rd-spec-btn" id="rd-spec-request">🎮 ' + esc(T.msg('ui.roomRequestSeat', null) || 'اطلب مقعداً للعب') + '</button>';
    }
    bar.innerHTML = html;
    const btn = document.getElementById('rd-spec-request');
    if (btn) btn.addEventListener('click', function () {
      if (typeof o.onRequestSeat === 'function') o.onRequestSeat();
    });
  }

  function renderHand(view, opts) {
    const o = opts || {};
    const hand = el('hand');
    if (!hand) return;
    hand.innerHTML = '';
    if (o.spectator) {
      hand.classList.add('rd-hidden');
      renderSpectatorBar(view, o);
      return;
    }
    hand.classList.remove('rd-hidden');
    renderSpectatorBar(view, o);
    const me = view.players.find(function (p) { return String(p.id) === String(o.viewerId); });
    if (!me) return;

    /* لا حبة «دورك الآن» — التوهّج الذهبي حول لوحة النشط كافٍ (التصميم المرغوب) */
    const isMyTurn = String(view.currentPlayerId) === String(o.viewerId) && view.phase === 'Playing';
    const captureResolver = new RC.CaptureResolver();

    view.myHand.forEach(function (card, i) {
      const capture = captureResolver.resolve(card, view.tableCards);
      const capturedTable = capture.filter(function (c) { return c.id !== card.id; });
      const cardEl = makeCardEl(card, {
        live: isMyTurn && o.interactive,
        off: !isMyTurn || !o.interactive,
        canCapture: capturedTable.length > 0,
        dealing: !!o.animateDeal
      });
      cardEl.style.zIndex = String(10 + i);
      if (o.animateDeal) cardEl.style.animationDelay = (i * 90) + 'ms';
      if (capturedTable.length > 0 && isMyTurn) {
        const badge = document.createElement('span');
        badge.className = 'rd-capture-badge';
        badge.textContent = '+' + capturedTable.length;
        cardEl.appendChild(badge);
      }
      if (isMyTurn && o.interactive) {
        cardEl.addEventListener('click', function () { o.onPlay(card.id); });
      }
      hand.appendChild(cardEl);
    });
  }

  /* ============================ جدول النتيجة التفصيلية ============================ */

  function renderBreakdown(containerId, breakdown) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    if (!breakdown || breakdown.length === 0) { wrap.innerHTML = ''; return; }
    const L = {
      cardsCaptured: T.msg('rdc.brk.cards'),
      cardPoints: T.msg('rdc.brk.cardPts'),
      declarations: T.msg('rdc.brk.decl'),
      strike: T.msg('rdc.brk.strike'),
      rope: T.msg('rdc.brk.rope'),
      doubleRope: T.msg('rdc.brk.double'),
      mesa: T.msg('rdc.brk.mesa'),
      qa3a: T.msg('rdc.brk.qa3a'),
      roundTotal: T.msg('rdc.brk.round'),
      grandTotal: T.msg('rdc.brk.total')
    };
    const col = function (row, key) { return row[key]; };
    const rows = [
      { label: L.cardsCaptured, keys: ['cardsCaptured'] },
      { label: L.cardPoints, keys: ['cardPoints'] },
      { label: L.declarations, keys: ['declarationPoints'] },
      { label: L.strike, keys: ['strikePoints'], sub: ['strikeCount'] },
      { label: L.rope, keys: ['ropePoints'], sub: ['ropeCount'] },
      { label: L.doubleRope, keys: ['doubleRopePoints'], sub: ['doubleRopeCount'] },
      { label: L.mesa, keys: ['mesaPoints'], sub: ['mesaCount'] },
      { label: L.qa3a, keys: ['qa3aBonus'], compute: function (row) { return (row.qa3aRey || 0) + (row.qa3aAs || 0); } },
      { label: L.roundTotal, keys: ['roundScore'], cls: 'rd-total-row' },
      { label: L.grandTotal, keys: ['totalScore'], cls: 'rd-grand-row' }
    ];
    let html = '<table class="rd-breakdown"><thead><tr><th></th>';
    breakdown.forEach(function (row, i) {
      html += '<th class="rd-team-col-head rd-c' + i + '">' + esc(row.teamName) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '><td class="rd-row-label">' + r.label + '</td>';
      breakdown.forEach(function (row) {
        const val = r.compute ? r.compute(row) : col(row, r.keys[0]);
        let cellText = val;
        if (r.sub) cellText = val + ' <small>(' + row[r.sub[0]] + '×)</small>';
        html += '<td>' + cellText + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  root.RondaRenderer = {
    SUIT_FILE: SUIT_FILE,
    cardAsset: cardAsset,
    makeCardEl: makeCardEl,
    flyCard: flyCard,
    rectCenter: rectCenter,
    showBanner: showBanner,
    addLog: addLog,
    cardName: cardName,
    twoLetters: twoLetters,
    renderSeats: renderSeats,
    renderOthers: renderOthers,
    renderMePlate: renderMePlate,
    renderTable: renderTable,
    renderSpectatorBar: renderSpectatorBar,
    renderHand: renderHand,
    renderBreakdown: renderBreakdown,
    escapeHtml: esc
  };
})(typeof self !== 'undefined' ? self : this);

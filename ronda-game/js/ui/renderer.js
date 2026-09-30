/**
 * ============================================================================
 *  RondaRenderer — طبقة العرض (Renderer) للمتصفح
 *  تبني DOM من View اللاعب فقط — لا تلمس حالة المحرك الداخلية أبداً.
 * ============================================================================
 */
(function (root) {
  'use strict';

  const RC = root.RondaCore;
  const I18N = root.RondaI18N;

  /* ============================ رموز الأنواع SVG ============================ */

  const SUIT_SVG = {
    // الخال — سيف
    KHAL: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">'
      + '<path d="M39 9 L18 30" stroke-width="4"/>'
      + '<path d="M39 9 L34 8 L17 29 M39 9 L40 14 L20 32" stroke-width="1.4" fill="currentColor" opacity=".45"/>'
      + '<path d="M20 27 L27 34" stroke-width="4"/>'
      + '<path d="M14 31 L11 34 M11 34 L9 40 L15 37 Z" fill="currentColor" stroke="none"/>'
      + '<path d="M17 29 l4 4" stroke-width="2"/>'
      + '</svg>',
    // الكوباس — كأس
    KOBBAS: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">'
      + '<path d="M13 8 h22 v7 a11 11 0 0 1 -22 0 Z" fill="currentColor" opacity=".3"/>'
      + '<path d="M13 8 h22 v7 a11 11 0 0 1 -22 0 Z"/>'
      + '<path d="M13 11 h-4 a5 5 0 0 0 5 6 M35 11 h4 a5 5 0 0 1 -5 6" stroke-width="2"/>'
      + '<path d="M24 26 v9 M17 41 h14 M19 35 h10" stroke-width="3"/>'
      + '</svg>',
    // شبادا — هراوة
    CHBADA: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">'
      + '<path d="M14 42 L31 12" stroke-width="6"/>'
      + '<path d="M31 12 l6 -5" stroke-width="7"/>'
      + '<circle cx="38" cy="6" r="4" fill="currentColor" stroke="none" opacity=".5"/>'
      + '<path d="M12 36 l6 4 M17 28 l6 4" stroke-width="2" opacity=".6"/>'
      + '</svg>',
    // دهاب — عملة ذهبية
    DHAB: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6">'
      + '<circle cx="24" cy="24" r="17" fill="currentColor" opacity=".28"/>'
      + '<circle cx="24" cy="24" r="17"/>'
      + '<circle cx="24" cy="24" r="11" stroke-width="1.8" opacity=".8"/>'
      + '<path d="M24 15 l2.6 5.6 6.2.7 -4.6 4.2 1.2 6.1 -5.4 -3 -5.4 3 1.2 -6.1 -4.6 -4.2 6.2 -.7 Z" fill="currentColor" stroke="none" opacity=".75"/>'
      + '</svg>'
  };

  /* ============================ بناء الأوراق ============================ */

  function makeCardEl(card, opts) {
    const o = opts || {};
    const el = document.createElement('div');
    el.className = 'card s-' + card.suit;
    el.dataset.cardId = card.id;
    el.dataset.rank = card.rank;

    if (o.back) {
      el.classList.add('back');
      return el;
    }

    const rankStr = String(card.rank);
    el.innerHTML =
      '<span class="corner tr">' + rankStr + '</span>' +
      '<span class="suit-center">' + SUIT_SVG[card.suit] + '</span>' +
      '<span class="corner bl">' + rankStr + '</span>';

    if (o.playable) el.classList.add('playable');
    if (o.canCapture) el.classList.add('can-capture');
    if (o.strikeHint === 'strike') el.classList.add('can-strike');
    if (o.strikeHint === 'rope') el.classList.add('can-rope');
    if (o.strikeHint === 'double') el.classList.add('can-double');
    if (o.disabled) el.classList.add('disabled');
    if (o.entering) el.classList.add('entering');
    if (o.dealing) el.classList.add('dealing');

    if (o.badge) {
      const badge = document.createElement('span');
      badge.className = 'capture-badge';
      badge.textContent = '+' + o.badge;
      el.appendChild(badge);
    }
    return el;
  }

  /** استنساخ ورقة طائرة لتحريكها بين نقطتين */
  function flyCard(fromRect, toRect, card, opts) {
    const o = opts || {};
    const el = makeCardEl(card, { back: o.back });
    el.classList.add('fly-card');
    const w = fromRect.width, h = fromRect.height;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = fromRect.left + 'px';
    el.style.top = fromRect.top + 'px';
    el.style.transform = 'rotate(' + (o.fromRotate || 0) + 'deg)';
    document.body.appendChild(el);
    void el.offsetWidth; // force reflow
    const scale = (toRect.width || w) / w;
    el.style.left = toRect.left + 'px';
    el.style.top = toRect.top + 'px';
    el.style.transform = 'rotate(' + (o.toRotate || 0) + 'deg) scale(' + scale + ')';
    el.style.opacity = o.fadeOut ? '0' : '1';
    el.style.transitionDuration = o.duration ? o.duration + 'ms' : '450ms';
    setTimeout(function () { el.remove(); }, (o.duration || 450) + 60);
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

  /** البانر الكبير في الوسط */
  function showBanner(text, subText, cls, life) {
    const layer = el('banner-layer');
    const b = document.createElement('div');
    b.className = 'banner' + (cls ? ' ' + cls : '');
    b.style.setProperty('--banner-life', ((life || 1.4) - 0.3) + 's');
    b.innerHTML = text + (subText ? '<span class="banner-pts">' + subText + '</span>' : '');
    layer.appendChild(b);
    setTimeout(function () { b.remove(); }, (life || 1.4) * 1000 + 350);
  }

  /** سجل الأحداث */
  function addLog(html, cls) {
    const list = el('log-list');
    const li = document.createElement('li');
    if (cls) li.className = cls;
    li.innerHTML = html;
    list.prepend(li);
    while (list.children.length > 60) list.removeChild(list.lastChild);
  }

  /** تسمية ورقة نصياً: "6 الخال" */
  function cardName(card) {
    return card.rank + ' ' + (I18N.suitNames[card.suit] || card.suit);
  }

  /* -------- شريط النقاط -------- */
  function renderScoreStrip(view, opts) {
    const o = opts || {};
    const strip = el('score-strip');
    strip.innerHTML = '';
    const isAiMode = o.aiMode;
    view.teams.forEach(function (team, idx) {
      const chip = document.createElement('div');
      chip.className = 'team-chip team-' + idx;
      if (view.currentPlayerId !== null && view.currentPlayerId !== undefined) {
        const current = view.players.find(function (p) { return p.id === view.currentPlayerId; });
        if (current && current.teamId === team.id) chip.classList.add('active-turn');
      }
      const members = team.playerIds.map(function (pid) {
        const p = view.players.find(function (x) { return x.id === pid; });
        return p ? p.name : '';
      }).join(' + ');
      const cardsSum = team.playerIds.reduce(function (s, pid) {
        const p = view.players.find(function (x) { return x.id === pid; });
        return s + (p ? p.capturedCount : 0);
      }, 0);
      chip.innerHTML =
        '<div class="team-side">' +
          '<span class="team-name">' + escapeHtml(team.name) + '</span>' +
          '<span class="team-members">' + escapeHtml(members) + '</span>' +
          '<span class="team-cards-count">الملتقطة: <b>' + cardsSum + '</b> ورقة</span>' +
        '</div>' +
        '<div class="team-score">' + team.score + '</div>';
      strip.appendChild(chip);
    });
    if (view.teams.length === 2) {
      const vs = document.createElement('div');
      vs.className = 'vs-divider';
      vs.textContent = 'ضد';
      strip.insertBefore(vs, strip.children[1]); // [فريق أ، ضد، فريق ب]
    }
  }

  /* -------- الخصوم (المقاعد العلوية) -------- */
  function renderOpponents(view, opts) {
    const o = opts || {};
    const row = el('opponents-row');
    row.innerHTML = '';
    const others = view.players.filter(function (p) { return p.id !== o.viewerId; });
    others.forEach(function (p) {
      const seat = document.createElement('div');
      seat.className = 'opp-seat';
      if (view.currentPlayerId === p.id) seat.classList.add('active-turn');
      const backs = [];
      for (let i = 0; i < p.handCount; i++) backs.push('<div class="mini-back"></div>');
      const teamCls = 't' + p.teamId;
      seat.innerHTML =
        '<div class="opp-cards">' + backs.join('') + '</div>' +
        '<div class="opp-info">' +
          '<span class="opp-name"><span class="team-dot ' + teamCls + '"></span>' + escapeHtml(p.name) + '</span>' +
          '<span class="opp-sub">الملتقطة: ' + p.capturedCount + '</span>' +
        '</div>';
      seat.dataset.playerId = p.id;
      row.appendChild(seat);
    });
  }

  /* -------- الطاولة -------- */
  function renderTable(view, opts) {
    const o = opts || {};
    const wrap = el('table-cards');
    wrap.innerHTML = '';
    view.tableCards.forEach(function (card, i) {
      const c = makeCardEl(card, { entering: o.animateNew && i === view.tableCards.length - 1 });
      c.style.transform = 'rotate(' + (((i * 53) % 9) - 4) + 'deg)';
      wrap.appendChild(c);
    });
    el('deck-count').textContent = view.deckCount;
    const cap = el('table-caption');
    if (view.tableCards.length === 0) cap.style.opacity = '.28';
    else cap.style.opacity = '0';
  }

  /* -------- اليد السفلية -------- */
  /**
   * opts: { viewerId, interactive, onPlay(cardId), animateDeal,
   *         showHints, aiMode }
   */
  function renderHand(view, opts) {
    const o = opts || {};
    const hand = el('hand');
    const hintEl = el('turn-hint');
    hand.innerHTML = '';
    const me = view.players.find(function (p) { return p.id === o.viewerId; });
    el('hand-label').textContent =
      (o.aiMode && o.viewerId === 0) ? I18N.hand.yours : me.name + ' — الأوراق';

    const isMyTurn = view.currentPlayerId === o.viewerId && view.phase === 'Playing';
    const captureResolver = new RC.CaptureResolver();
    const lastRank = view.lastPlayedCard ? view.lastPlayedCard.rank : null;

    // وضع الخصوصية: أوراق مقلوبة فقط قبل الكشف
    if (o.hideHand) {
      view.myHand.forEach(function (card, i) {
        const backEl = makeCardEl(card, { back: true, dealing: o.animateDeal });
        backEl.style.zIndex = String(10 + i);
        hand.appendChild(backEl);
      });
      hintEl.textContent = '';
      return;
    }

    view.myHand.forEach(function (card, i) {
      // تحليل قيمة الورقة (تلميحات)
      const capture = o.showHints !== false
        ? captureResolver.resolve(card, view.tableCards)
        : [];
      const capturedTable = capture.filter(function (c) { return c.id !== card.id; });

      const hintOpts = {
        playable: isMyTurn && o.interactive,
        disabled: !isMyTurn || !o.interactive,
        canCapture: capturedTable.length > 0,
        dealing: o.animateDeal
      };
      if (lastRank !== null && card.rank === lastRank && view.strike) {
        const seq = view.strike.sequence;
        const myTeamId = me.teamId;
        if (seq === 'None' && isMyTurn) hintOpts.strikeHint = 'strike';
        else if (seq === 'Strike' && view.strike.preStrikeTeamId === myTeamId && isMyTurn) hintOpts.strikeHint = 'rope';
        else if (seq === 'Rope' && view.strike.strikerTeamId === myTeamId && isMyTurn) hintOpts.strikeHint = 'double';
      }
      const cardEl = makeCardEl(card, hintOpts);
      cardEl.style.zIndex = String(10 + i);
      if (capturedTable.length > 0) {
        const badge = document.createElement('span');
        badge.className = 'capture-badge';
        badge.textContent = '+' + capturedTable.length;
        cardEl.appendChild(badge);
      }
      if (isMyTurn && o.interactive) {
        cardEl.addEventListener('click', function () { o.onPlay(card.id); });
      }
      hand.appendChild(cardEl);
    });

    // تلميح الدور
    if (view.phase === 'Finished') hintEl.textContent = '';
    else if (isMyTurn) hintEl.textContent = o.aiMode ? I18N.hand.yourTurn : 'دورك الآن';
    else {
      const current = view.players.find(function (p) { return p.id === view.currentPlayerId; });
      hintEl.textContent = current
        ? I18N.hand.turnOf.replace('{name}', current.name) + (o.aiMode && current.id !== 0 ? '' : '')
        : '';
    }
  }

  /* -------- جدول النتيجة التفصيلية -------- */
  function renderBreakdown(containerId, breakdown, B) {
    const wrap = document.getElementById(containerId);
    if (!breakdown || breakdown.length === 0) { wrap.innerHTML = ''; return; }
    const labels = B;
    const col = function (row, key) { return row[key]; };

    const rows = [
      { label: labels.cardsCaptured, keys: ['cardsCaptured'] },
      { label: labels.cardPoints, keys: ['cardPoints'] },
      { label: labels.declarations, keys: ['declarationPoints'] },
      { label: labels.strike, keys: ['strikePoints'], sub: ['strikeCount'] },
      { label: labels.rope, keys: ['ropePoints'], sub: ['ropeCount'] },
      { label: labels.doubleRope, keys: ['doubleRopePoints'], sub: ['doubleRopeCount'] },
      { label: labels.mesa, keys: ['mesaPoints'], sub: ['mesaCount'] },
      { label: labels.qa3a, keys: ['qa3aBonus'], compute: function (row) { return (row.qa3aRey || 0) + (row.qa3aAs || 0); } },
      { label: labels.roundTotal, keys: ['roundScore'], cls: 'total-row' },
      { label: labels.grandTotal, keys: ['totalScore'], cls: 'grand-row' }
    ];

    let html = '<table class="breakdown"><thead><tr><th></th>';
    breakdown.forEach(function (row, i) {
      html += '<th class="team-col-head c' + i + '">' + escapeHtml(row.teamName) + '</th>';
    });
    html += '</tr></thead><tbody>';

    rows.forEach(function (r) {
      html += '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '><td class="row-label">' + r.label + '</td>';
      breakdown.forEach(function (row) {
        const val = r.compute ? r.compute(row) : col(row, r.keys[0]);
        let cellText = val;
        if (r.sub) {
          cellText = val + ' <small>(' + row[r.sub[0]] + '×)</small>';
        }
        html += '<td>' + cellText + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  /* -------- أدوات -------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  root.RondaRenderer = {
    SUIT_SVG: SUIT_SVG,
    makeCardEl: makeCardEl,
    flyCard: flyCard,
    rectCenter: rectCenter,
    showBanner: showBanner,
    addLog: addLog,
    cardName: cardName,
    renderScoreStrip: renderScoreStrip,
    renderOpponents: renderOpponents,
    renderTable: renderTable,
    renderHand: renderHand,
    renderBreakdown: renderBreakdown,
    escapeHtml: escapeHtml
  };
})(typeof self !== 'undefined' ? self : this);

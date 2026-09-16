/**
 * ============================================================================
 *  BgRenderer — طبقة العرض للطاولة (بادئة معزولة bw-)
 * ============================================================================
 *  • الرقعة: شبكة 13 عمودًا (6 + أدمن + 6) بمثلثات متناوبة عنبري/فيروزي.
 *    أعلى: 12..17 | 18..23 · أسفل: 11..6 | 5..0 — اللاعب 0 أسفل دائمًا.
 *  • الأحجار: عاجية (لاعب 0) وأبنوس (لاعب 1) بانضغاط تلقائي فوق 5.
 *  • النرد: حمراء تقليدية بنقاط عاجية — المستهلكة باهتة.
 * ============================================================================
 */
(function (root) {
  'use strict';

  const T = root.BWG_T;
  const FMT = root.BWG_FMT;

  /* أعمدة الرقعة من اليسار لليمين (dir=ltr) */
  const TOP = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const BOT = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

  /** بناء الرقعة مرة واحدة بعد الحقن */
  function buildBoard(ptsEl) {
    if (!ptsEl) return;
    let html = '';
    for (let r = 0; r < 2; r++) {
      const arr = r === 0 ? TOP : BOT;
      for (let c = 0; c < 12; c++) {
        const idx = arr[c];
        const gcol = (c < 6) ? (c + 1) : (c + 2); /* العمود 7 للأدمن */
        html += '<div class="bw-col' + (r === 0 ? ' top' : ' bot') + '" style="grid-row:' + (r + 1) + ';grid-column:' + gcol + '" data-point="' + idx + '">' +
          '<div class="bw-tri"></div><div class="bw-chks" data-chks="' + idx + '"></div>' +
          '<span class="bw-colnum">' + (idx + 1) + '</span></div>';
      }
    }
    html += '<div class="bw-bar" id="bwBar" data-bar="1"></div>';
    ptsEl.innerHTML = html;
  }

  /* ══════════════ الأحجار ══════════════ */

  function checkerHTML(owner, squeeze, showCount) {
    return '<div class="bw-chk ' + (owner === 0 ? 'w' : 'b') + (squeeze ? ' sq' : '') + '">' +
      (showCount ? '<span>' + showCount + '</span>' : '') + '</div>';
  }

  function renderChks(st, legal, sel) {
    const froms = {}, dests = {};
    if (sel !== null && sel !== undefined) {
      for (let i = 0; i < legal.length; i++) {
        if (legal[i].from === sel) { if (legal[i].to === -1) dests.off = 1; else dests[legal[i].to] = 1; }
      }
    } else {
      for (let j = 0; j < legal.length; j++) froms[legal[j].from] = 1;
    }
    for (let k = 0; k < 24; k++) {
      const el = document.querySelector('[data-chks="' + k + '"]');
      const col = document.querySelector('[data-point="' + k + '"]');
      if (!el || !col) continue;
      const c = st.points[k];
      const count = Math.abs(c), owner = c > 0 ? 0 : 1;
      const squeeze = count > 5;
      let html = '';
      const show = Math.min(count, 5);
      for (let m = 0; m < show; m++) {
        html += checkerHTML(owner, squeeze && m >= show - 2, squeeze && m === show - 1 ? count : '');
      }
      el.innerHTML = html;
      col.classList.toggle('src', froms[k] === 1);
      col.classList.toggle('dst', dests[k] === 1);
      col.classList.toggle('selc', sel === k);
    }
    /* الأدمن والصواني */
    const bar = document.getElementById('bwBar');
    if (bar) {
      const b1 = st.bar[1], b0 = st.bar[0];
      let html = '';
      for (let i = 0; i < b1; i++) html += checkerHTML(1, false, '');
      if (b1 > 0) html += '<span class="bw-bar-cnt t">' + b1 + '</span>';
      if (b0 > 0) html += '<span class="bw-bar-cnt b">' + b0 + '</span>';
      for (let j = 0; j < b0; j++) html += checkerHTML(0, false, '');
      bar.innerHTML = html;
      bar.classList.toggle('src', froms[-1] === 1);
    }
    const tt = document.getElementById('bwTrayTopPile'), tb = document.getElementById('bwTrayBotPile');
    const trayTop = document.getElementById('bwTrayTop'), trayBot = document.getElementById('bwTrayBot');
    if (tt) {
      let h = '';
      for (let i = 0; i < st.off[1]; i++) h += checkerHTML(1, false, '');
      tt.innerHTML = h;
    }
    if (tb) {
      let h = '';
      for (let i = 0; i < st.off[0]; i++) h += checkerHTML(0, false, '');
      tb.innerHTML = h;
    }
    if (trayBot) trayBot.classList.toggle('dst', dests.off === 1 && st.turn === 0);
    if (trayTop) trayTop.classList.toggle('dst', dests.off === 1 && st.turn === 1);
  }

  /* ══════════════ النرد ══════════════ */

  const DIE_MAP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  function dieHTML(v, used, dbl) {
    const cells = DIE_MAP[v] || [];
    let out = '';
    for (let i = 0; i < 9; i++) out += '<i class="' + (cells.indexOf(i) >= 0 ? 'on' : '') + '"></i>';
    return '<div class="bw-die' + (dbl ? ' dbl' : '') + (used ? ' used' : '') + '">' + out + '</div>';
  }

  function renderDice(el, st) {
    if (!el) return;
    if (!st.rolled || !st.lastRoll) { el.innerHTML = ''; return; }
    const a = st.lastRoll[0], b = st.lastRoll[1];
    const list = (a === b) ? [a, a, a, a] : [a, b];
    const remaining = st.dice.slice();
    let html = '';
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const ri = remaining.indexOf(v);
      const used = ri < 0;
      if (ri >= 0) remaining.splice(ri, 1);
      html += dieHTML(v, used, a === b);
    }
    el.innerHTML = html;
  }

  /* ══════════════ الحالة ══════════════ */

  function statusText(view, mode) {
    if (view.phase === 'opening') return T('bg.opening');
    if (view.phase === 'gameEnd' || view.phase === 'matchEnd') return '';
    /* [BG-Room] وضع الغرفة: المتفرج يشاهد · اللاعب حسب الدور المطلق */
    if (mode === 'spec') return T('bg.room.watch') || 'وضع المتفرج — تشاهد المباراة';
    if (mode === 'room') return view.turn === 0 ? T('bg.turn.p1') : T('bg.turn.p2');
    const iPlay = mode === 'ai' ? view.turn === 0 : true;
    if (!iPlay) return T(mode === 'ai' ? 'bg.turn.opp' : (view.turn === 1 ? 'bg.turn.p2' : 'bg.turn.p1'));
    if (view.bar[view.turn] > 0 && view.phase === 'move') return T('bg.enterBar');
    return T(mode === 'ai' ? 'bg.turn.you' : (view.turn === 0 ? 'bg.turn.p1' : 'bg.turn.p2'));
  }

  function matchLabel(view) {
    return FMT('bg.matchTo', view.matchTarget);
  }

  function scoreRowsHTML(view, mode) {
    const isAI = mode === 'ai';
    return '<div class="bw-srow"><span>' + (isAI ? T('bg.you') : T('bg.p1')) + '</span><b>' + view.matchScore[0] + '</b></div>' +
           '<div class="bw-srow"><span>' + (isAI ? T('bg.opp') : T('bg.p2')) + '</span><b>' + view.matchScore[1] + '</b></div>';
  }

  root.BgRenderer = {
    TOP: TOP, BOT: BOT,
    buildBoard: buildBoard,
    renderChks: renderChks,
    renderDice: renderDice,
    statusText: statusText,
    matchLabel: matchLabel,
    scoreRowsHTML: scoreRowsHTML
  };
})(typeof self !== 'undefined' ? self : this);

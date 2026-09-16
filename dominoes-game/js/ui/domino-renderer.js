/**
 * ============================================================================
 *  DominoRenderer — طبقة العرض للضومنة (بادئة كلاسات معزولة dm-)
 * ============================================================================
 *  • قطع عاجية بنقاط محفورة (شبكة 3×3) — رأسية ثابتة تُدار بالدوران.
 *  • السلسلة: صفوف متعرجة (ذهاب وإياب) بمنعطفات عمودية، تتقلص تلقائيًا
 *    لملء المساحة — القطعة الجديدة تنبض عند الوصول.
 *  • تلميحات الأطراف: كبسولتان نحاسيتان تحملان القيمة المطلوبة.
 * ============================================================================
 */
(function (root) {
  'use strict';

  const T = root.DMN_T;
  const FMT = root.DMN_FMT;

  /* ══════════════ بناء القطعة ══════════════ */

  const PIP_MAP = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  function pipsHTML(v) {
    const cells = PIP_MAP[v] || [];
    let out = '';
    for (let i = 0; i < 9; i++) out += '<i class="dp-cell' + (cells.indexOf(i) >= 0 ? ' on' : '') + '"></i>';
    return out;
  }

  function faceHTML(tile) {
    return '<span class="dm-face"><span class="dm-half">' + pipsHTML(tile.a) + '</span>' +
      '<span class="dm-sep" aria-hidden="true"></span>' +
      '<span class="dm-half">' + pipsHTML(tile.b) + '</span></span>';
  }

  /* ══════════════ تخطيط السلسلة ══════════════
     كل قطعة تُرسم رأسية (w=u, h=2u) ثم تُدار:
     rotate(-90): القيمة a يسارًا · rotate(90): a يمينًا · الدبل يبقى رأسيًا */

  function leftMatchIsA(chain, i) {
    if (i === 0) return true;
    const t = chain[i].tile, prev = chain[i - 1].tile;
    return (t.a === prev.a || t.a === prev.b);
  }

  /**
   * يحسب مواضع كل القطع داخل المستطيل المتاح.
   * يرجع {items, unit, firstPos, lastPos}
   */
  function layoutChain(chain, W, H) {
    if (!chain.length) return { items: [], unit: 26, firstPos: null, lastPos: null };
    const PAD = 18, GAP = 4;
    const n = chain.length;

    /* [v2.28] ثعبان متصل: الرأس يتقدم أفقياً؛ عند ضيق المسافة قطعة رأسية
       (منعطف) عند الرأس نفسه ثم نزول صف — الصف الجديد يبدأ من عمود المنعطف
       لا من الحافة المقابلة، فتبقى السلسلة متصلة بلا فجوات وبلا فيضان. */
    function simulate(u) {
      const rowH = 2 * u + GAP;
      const items = [];
      let headX = PAD, y = 0, dir = 1, rows = 1;
      let firstPos = null, lastPos = null;
      for (let i = 0; i < n; i++) {
        const node = chain[i];
        const isDbl = node.dbl;
        const len = isDbl ? u : 2 * u;
        if (i > 0) {
          const space = dir === 1 ? (W - PAD - headX) : (headX - PAD);
          if (space < len) {
            const tx = headX + (dir === 1 ? u / 2 : -u / 2);
            const ty = y + rowH; /* منتصف عمودي بين الصف الحالي والتالي */
            items.push({ node: node, kind: 'turn', x: tx, y: ty, rot: 0, u: u });
            if (!firstPos) firstPos = { x: tx, y: ty };
            lastPos = { x: tx, y: ty + u };
            y += rowH; rows++;
            dir = -dir;
            headX = tx;
            continue;
          }
        }
        const cx = dir === 1 ? headX + len / 2 : headX - len / 2;
        const cy = y + rowH / 2;
        let rot;
        if (isDbl) rot = 0;
        else rot = (dir === 1) ? (leftMatchIsA(chain, i) ? -90 : 90) : (leftMatchIsA(chain, i) ? 90 : -90);
        items.push({ node: node, kind: isDbl ? 'dbl' : 'flat', x: cx, y: cy, rot: rot, u: u });
        if (!firstPos) firstPos = { x: dir === 1 ? headX : headX - len, y: cy };
        lastPos = { x: dir === 1 ? headX + len : headX - len, y: cy };
        headX = dir === 1 ? headX + len + GAP : headX - len - GAP;
      }
      return { items: items, rows: rows, firstPos: firstPos, lastPos: lastPos };
    }

    let u = 26;
    let sim = simulate(u);
    const maxH = Math.max(H - 8, 2 * u);
    if (sim.rows * (2 * u + GAP) > maxH) {
      u = Math.max(13, Math.floor((maxH / sim.rows - GAP) / 2));
      sim = simulate(u);
    }
    return { items: sim.items, unit: u, firstPos: sim.firstPos, lastPos: sim.lastPos };
  }

  function tileEl(node, it) {
    const t = node.tile;
    const w = it.u - 2, h = 2 * it.u - 2;
    const el = document.createElement('div');
    el.className = 'dm-tile k-' + it.kind;
    el.style.left = Math.round(it.x - w / 2) + 'px';
    el.style.top = Math.round(it.y - h / 2) + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.transform = 'rotate(' + it.rot + 'deg)';
    el.innerHTML = faceHTML(t);
    return el;
  }

  /* ══════════════ دوال العرض ══════════════ */

  /** السلسلة + إرجاع تخطيط الأطراف (للتلميحات) */
  function renderChain(box, view) {
    if (!box) return null;
    if (!view.chain.length) {
      box.innerHTML = '<div class="dm-chain-empty">' + T('dm.pickEnd') + '</div>';
      return null;
    }
    const W = box.clientWidth || 600, H = box.clientHeight || 240;
    const lay = layoutChain(view.chain, W, H);
    /* حساب الإزاحة الرأسية: أول صف يبدأ من 0 — نوسّط بكتلة الصفوف */
    const rowH = 2 * lay.unit + 4;
    let rows = 1;
    for (let i = 0; i < lay.items.length; i++) if (lay.items[i].kind === 'turn') rows++;
    const offsetY = Math.max(0, (H - rows * rowH) / 2);

    box.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < lay.items.length; i++) {
      const el = tileEl(lay.items[i].node, { x: lay.items[i].x, y: lay.items[i].y + offsetY, rot: lay.items[i].rot, u: lay.items[i].u, kind: lay.items[i].kind });
      frag.appendChild(el);
    }
    box.appendChild(frag);

    /* نبضة آخر قطعة */
    const lastEl = box.lastElementChild;
    if (lastEl && view.justPlayed) {
      lastEl.classList.add('dm-pop');
      setTimeout(function () { try { lastEl.classList.remove('dm-pop'); } catch (e) {} }, 460);
    }
    /* التلميحات تُوضع داخل .dm-table بينما إحداثيات القطع نسبة لصندوق السلسلة
       (.dm-chain بـ inset 6px 30px متماثل الجانبين) — نضيف الإزاحة فقط بلا عكس
       RTL لأن القطع نفسها تُرسم بإحداثيات left مطلقة في الاتجاهين. */
    const chainBoxOff = { x: 30, y: 6 }; /* inset للسلسلة داخل الطاولة */
    const mapX = function (x) { return x + chainBoxOff.x; };
    return {
      first: lay.firstPos ? { x: mapX(lay.firstPos.x), y: lay.firstPos.y + offsetY + chainBoxOff.y } : null,
      last: lay.lastPos ? { x: mapX(lay.lastPos.x), y: lay.lastPos.y + offsetY + chainBoxOff.y } : null
    };
  }

  function renderEndHints(hl, hr, view, positions, selTile) {
    if (!hl || !hr) return;
    const show = selTile && positions;
    if (!show) { hl.hidden = true; hr.hidden = true; return; }
    const ends = [];
    /* نعيد استخدام قواعد النواة عبر view.leftEnd/rightEnd */
    if (!view.chain.length) { ends.push('L', 'R'); }
    else {
      if (selTile.a === view.leftEnd || selTile.b === view.leftEnd) ends.push('L');
      if (selTile.a === view.rightEnd || selTile.b === view.rightEnd) ends.push('R');
    }
    if (ends.indexOf('L') >= 0 && positions.first) {
      hl.hidden = false;
      hl.style.left = (positions.first.x - 40) + 'px';
      hl.style.top = (positions.first.y - 15) + 'px';
      hl.textContent = view.chain.length ? String(view.leftEnd) : '●';
    } else hl.hidden = true;
    if (ends.indexOf('R') >= 0 && positions.last) {
      hr.hidden = false;
      hr.style.left = (positions.last.x + 8) + 'px';
      hr.style.top = (positions.last.y - 15) + 'px';
      hr.textContent = view.chain.length ? String(view.rightEnd) : '●';
    } else hr.hidden = true;
  }

  /** يد صانعة عامة — تُستخدم ليد الأسفل ويد الخصم (لاعبان) */
  function handTilesHTML(hand, legalIds, forcedId, onclickName) {
    let html = '';
    for (let i = 0; i < hand.length; i++) {
      const t = hand[i];
      const can = legalIds[t.id];
      const forced = forcedId && forcedId === t.id;
      html += '<button type="button" class="dm-htile' + (can ? ' can' : '') + (forced ? ' forced' : '') + '"' +
        (onclickName ? ' data-act="' + onclickName + '" data-tile="' + t.id + '"' : '') +
        (can || onclickName === 'dmPickP2' ? '' : ' disabled') + '>' + faceHTML(t) + '</button>';
    }
    return html;
  }

  /** ظهر قطع الخصم (نمط AI) */
  function backsHTML(n) {
    let html = '';
    for (let i = 0; i < n; i++) html += '<span class="dm-back"></span>';
    return html;
  }

  function names(view, mode) {
    /* view بلا استخدام الآن — يُبقى للتوافق مع استدعاءات الكلاسيكيات */
    return mode === 'ai'
      ? { me: T('dm.you'), opp: T('dm.opp') }
      : { me: T('dm.p1'), opp: T('dm.p2') };
  }

  function roundLabel(view) {
    return T('dm.round') + ' ' + view.round + ' · ' + FMT('dm.toTarget', view.cfg.target);
  }

  /** صفوف لوحة النتائج */
  function scoreRowsHTML(view, mode) {
    const nm = names(view, mode);
    const r = view.result;
    const awardRow = (r.tie || r.awarded === 0)
      ? '<div class="dm-srow total"><span>' + T('dm.tie') + '</span><b>0</b></div>'
      : '<div class="dm-srow total"><span>' + T('dm.handPips') + '</span><b class="gold">+' + r.awarded + '</b></div>';
    return '<div class="dm-srow"><span>' + nm.me + '</span><b>' + r.pips[0] + '</b></div>' +
           '<div class="dm-srow"><span>' + nm.opp + '</span><b>' + r.pips[1] + '</b></div>' +
           awardRow +
           '<div class="dm-srow"><span>' + T('dm.round') + '</span><b>' + view.scores[0] + ' : ' + view.scores[1] + '</b></div>';
  }

  root.DominoRenderer = {
    faceHTML: faceHTML,
    pipsHTML: pipsHTML,
    layoutChain: layoutChain,
    renderChain: renderChain,
    renderEndHints: renderEndHints,
    handTilesHTML: handTilesHTML,
    backsHTML: backsHTML,
    names: names,
    roundLabel: roundLabel,
    scoreRowsHTML: scoreRowsHTML
  };
})(typeof self !== 'undefined' ? self : this);

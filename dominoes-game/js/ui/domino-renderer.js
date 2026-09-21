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
     [v2.52-DOMINO] اتجاه السلسلة يتبع الاتجاه الأطول دائماً:
     • في وضع البورتريه (العمودي): تتدفق السلسلة طولياً (رأسياً) لاستغلال ارتفاع الشاشة.
     • في وضع اللاندسكيب (الأفقي): تتدفق السلسلة عرضياً (أفقياً) لاستغلال عرض الشاشة.
     • المفاصل هندسية دقيقة: تتلاقى الأرقام المتماثلة وجهاً لوجه بلا فجوات وبلا تراكب.
     • تصحيح اتجاه القطعة الأولى والأخيرة لتكون أطرافها المفتوحة مطابقة تماماً للمحرك.
  */

  function jointFacing(chain) {
    const n = chain.length;
    if (!n) return [];
    const t0 = chain[0].tile;
    if (n === 1) return [{ openVal: t0.a, jointNext: t0.b, aAtOpen: true, dbl: chain[0].dbl }];
    const t1 = chain[1].tile;
    let j01 = (t0.b === t1.a || t0.b === t1.b) ? t0.b : t0.a;
    const res = [];
    res.push({
      openVal: (t0.a === j01) ? t0.b : t0.a,
      jointNext: j01,
      aAtOpen: (t0.a !== j01),
      dbl: chain[0].dbl
    });
    let cur = j01;
    for (let i = 1; i < n; i++) {
      const t = chain[i].tile;
      const touchesPrev = (t.a === cur) ? 'a' : 'b';
      const nextVal = (touchesPrev === 'a') ? t.b : t.a;
      res.push({
        jointPrev: cur,
        touchesPrev: touchesPrev,
        jointNext: (i < n - 1) ? nextVal : null,
        openVal: (i === n - 1) ? nextVal : null,
        dbl: chain[i].dbl
      });
      cur = nextVal;
    }
    return res;
  }

  function layoutChain(chain, W, H) {
    if (!chain.length) return { items: [], unit: 24, firstPos: null, lastPos: null };
    const n = chain.length;
    const facings = jointFacing(chain);
    const isPortrait = H > W;

    function simulate(u) {
      const PAD = Math.max(10, Math.round(u * 0.5));
      const items = [];
      let firstPos = null, lastPos = null;

      if (isPortrait) {
        /* تدفق رأسي (طولي) في البورتريه */
        let dir = 1; /* 1 = نزولاً لأسفل، -1 = صعوداً لأعلى */
        let colX = PAD + u;
        let headY = PAD + u;

        for (let i = 0; i < n; i++) {
          const node = chain[i];
          const isDbl = facings[i].dbl;
          const len = isDbl ? u : 2 * u;

          if (i > 0) {
            const canFit = dir === 1 ? (headY + len + u <= H - PAD) : (headY - len - u >= PAD);
            if (!canFit) {
              /* منعطف 90° أفقي ينتقل للعمود التالي */
              const tx = colX + 1.5 * u;
              const ty = headY;
              const rot = 90;
              items.push({ node: node, kind: 'turn', x: tx, y: ty, rot: rot, u: u });
              if (!firstPos) firstPos = { x: tx, y: ty };
              lastPos = { x: tx, y: ty };
              colX += 2.5 * u;
              dir = -dir;
              headY = dir === 1 ? (ty + u) : (ty - u);
              continue;
            }
          }

          const cx = colX;
          const cy = dir === 1 ? (headY + len / 2) : (headY - len / 2);
          let rot = 0;
          if (isDbl) {
            rot = 90; /* الدبل أفقي في التدفق الرأسي */
          } else {
            if (i === 0) {
              rot = facings[0].aAtOpen ? 0 : 180;
            } else {
              if (dir === 1) rot = (facings[i].touchesPrev === 'a') ? 0 : 180;
              else rot = (facings[i].touchesPrev === 'a') ? 180 : 0;
            }
          }

          items.push({ node: node, kind: isDbl ? 'dbl' : 'flat', x: cx, y: cy, rot: rot, u: u });
          if (!firstPos) firstPos = { x: cx, y: dir === 1 ? headY : headY };
          lastPos = { x: cx, y: dir === 1 ? headY + len : headY - len };
          headY = dir === 1 ? (headY + len) : (headY - len);
        }
      } else {
        /* تدفق أفقي (عرضي) في اللاندسكيب */
        let dir = 1; /* 1 = يميناً، -1 = يساراً */
        let rowY = PAD + u;
        let headX = PAD + u;

        for (let i = 0; i < n; i++) {
          const node = chain[i];
          const isDbl = facings[i].dbl;
          const len = isDbl ? u : 2 * u;

          if (i > 0) {
            const canFit = dir === 1 ? (headX + len + u <= W - PAD) : (headX - len - u >= PAD);
            if (!canFit) {
              /* منعطف 90° رأسي ينتقل للصف التالي */
              const tx = headX;
              const ty = rowY + 1.5 * u;
              const rot = 0;
              items.push({ node: node, kind: 'turn', x: tx, y: ty, rot: rot, u: u });
              if (!firstPos) firstPos = { x: tx, y: ty };
              lastPos = { x: tx, y: ty };
              rowY += 2.5 * u;
              dir = -dir;
              headX = dir === 1 ? (tx + u) : (tx - u);
              continue;
            }
          }

          const cx = dir === 1 ? (headX + len / 2) : (headX - len / 2);
          const cy = rowY;
          let rot = 0;
          if (isDbl) {
            rot = 0; /* الدبل رأسي في التدفق الأفقي */
          } else {
            if (i === 0) {
              rot = facings[0].aAtOpen ? -90 : 90;
            } else {
              if (dir === 1) rot = (facings[i].touchesPrev === 'a') ? -90 : 90;
              else rot = (facings[i].touchesPrev === 'a') ? 90 : -90;
            }
          }

          items.push({ node: node, kind: isDbl ? 'dbl' : 'flat', x: cx, y: cy, rot: rot, u: u });
          if (!firstPos) firstPos = { x: dir === 1 ? headX : headX, y: cy };
          lastPos = { x: dir === 1 ? headX + len : headX - len, y: cy };
          headX = dir === 1 ? (headX + len) : (headX - len);
        }
      }

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      items.forEach(it => {
        const hw = (it.rot === 0 || it.rot === 180) ? it.u / 2 : it.u;
        const hh = (it.rot === 0 || it.rot === 180) ? it.u : it.u / 2;
        minX = Math.min(minX, it.x - hw);
        maxX = Math.max(maxX, it.x + hw);
        minY = Math.min(minY, it.y - hh);
        maxY = Math.max(maxY, it.y + hh);
      });

      return { items, spanW: maxX - minX, spanH: maxY - minY, minX, maxX, minY, maxY, firstPos, lastPos };
    }

    let bestU = isPortrait ? 18 : 22;
    for (let testU = (isPortrait ? 22 : 26); testU >= 10; testU -= 1) {
      const sim = simulate(testU);
      if (sim.spanW <= W - 16 && sim.spanH <= H - 16) {
        bestU = testU;
        break;
      }
    }

    const res = simulate(bestU);
    const offsetX = Math.round((W - (res.maxX - res.minX)) / 2 - res.minX);
    const offsetY = Math.round((H - (res.maxY - res.minY)) / 2 - res.minY);

    res.items.forEach(it => {
      it.x += offsetX;
      it.y += offsetY;
    });
    if (res.firstPos) { res.firstPos.x += offsetX; res.firstPos.y += offsetY; }
    if (res.lastPos) { res.lastPos.x += offsetX; res.lastPos.y += offsetY; }

    return { items: res.items, unit: bestU, firstPos: res.firstPos, lastPos: res.lastPos };
  }

  function tileEl(node, it) {
    const t = node.tile;
    const w = it.u, h = 2 * it.u;
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
      box.innerHTML = '<div class="dm-chain-empty"></div>';
      return null;
    }
    const W = box.clientWidth || 600, H = box.clientHeight || 240;
    const lay = layoutChain(view.chain, W, H);

    box.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < lay.items.length; i++) {
      const el = tileEl(lay.items[i].node, lay.items[i]);
      frag.appendChild(el);
    }
    box.appendChild(frag);

    /* نبضة آخر قطعة */
    const lastEl = box.lastElementChild;
    if (lastEl && view.justPlayed) {
      lastEl.classList.add('dm-pop');
      setTimeout(function () { try { lastEl.classList.remove('dm-pop'); } catch (e) {} }, 460);
    }
    let chainBoxOff = { x: 0, y: 0 };
    try {
      const br = box.getBoundingClientRect();
      const tr = box.parentNode.getBoundingClientRect();
      chainBoxOff = { x: Math.round(br.left - tr.left), y: Math.round(br.top - tr.top) };
    } catch (e) {}
    const mapX = function (x) { return x + chainBoxOff.x; };
    return {
      first: lay.firstPos ? { x: mapX(lay.firstPos.x), y: lay.firstPos.y + chainBoxOff.y } : null,
      last: lay.lastPos ? { x: mapX(lay.lastPos.x), y: lay.lastPos.y + chainBoxOff.y } : null
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

  /* [v2.51-DOMINO] الشوط R والهدف T بلا عبارات: «R1 T100» فوق البنك. */
  function roundLabel(view) {
    return 'R' + view.round + ' T' + view.cfg.target;
  }

  /** صفوف لوحة النتائج (تدعم لاعبين و3 و4 لاعبين) */
  function scoreRowsHTML(view, mode) {
    const r = view.result;
    const num = (r && r.pips) ? r.pips.length : (view.scores ? view.scores.length : 2);
    const nm = names(view, mode);
    let rows = '';
    for (let p = 0; p < num; p++) {
      const pName = (p === 0) ? nm.me : ((p === 1 && num === 2) ? nm.opp : (mode === 'ai' ? ((T('dm.opp') || 'الخصم') + ' ' + p) : (T('dm.p' + (p + 1)) || ('اللاعب ' + (p + 1)))));
      const pPip = (r && r.pips && r.pips[p] !== undefined) ? r.pips[p] : 0;
      rows += '<div class="dm-srow"><span>' + pName + '</span><b>' + pPip + '</b></div>';
    }
    const awardRow = (r && (r.tie || r.awarded === 0))
      ? '<div class="dm-srow total"><span>' + T('dm.tie') + '</span><b>0</b></div>'
      : '<div class="dm-srow total"><span>' + T('dm.handPips') + '</span><b class="gold">+' + (r ? r.awarded : 0) + '</b></div>';
    const scoreStr = view.scores ? view.scores.join(' : ') : '';
    return rows + awardRow + '<div class="dm-srow"><span>' + T('dm.round') + '</span><b>' + scoreStr + '</b></div>';
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
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DominoRenderer;
})(typeof self !== 'undefined' ? self : this);

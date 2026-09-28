/* ════════════════════════════════════════════════════════════════════
   UNRender — عرض أونو: بطاقات SVG بنمط أونو الكلاسيكي (بيضاوي مائل)
   بهوية المنصة (كحلي زليج × ذهب دكاء) + ظهيرة بطاقات بنمط الشفرات.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const T = root.UN_T;

  const COL = {
    R: '#e23b47', B: '#1668b3', G: '#1f9d55', Y: '#f2c230', K: '#151a24'
  };
  const COL_SOFT = {
    R: '#ff6b74', B: '#4d94d6', G: '#43c47a', Y: '#ffd75e', K: '#2a3142'
  };

  /* ── الرمز المركزي لكل نوع قيمة ── */
  function centerArt(card) {
    const v = card.value;
    if (v >= '0' && v <= '9') {
      return '<text x="50" y="93" class="un-num" text-anchor="middle" fill="#fff" stroke="rgba(0,0,0,0.55)" stroke-width="1.2">' + v + '</text>' +
        '<text x="12" y="24" class="un-corner" text-anchor="middle" fill="#fff">' + v + '</text>' +
        '<text x="88" y="124" class="un-corner" text-anchor="middle" fill="#fff" transform="rotate(180 88 117)">' + v + '</text>';
    }
    if (v === 'S') {
      return '<circle cx="50" cy="70" r="26" fill="none" stroke="#fff" stroke-width="7"/>' +
        '<line x1="32" y1="88" x2="68" y2="52" stroke="#fff" stroke-width="7" stroke-linecap="round"/>' +
        '<text x="12" y="24" class="un-corner" text-anchor="middle" fill="#fff">S</text>' +
        '<text x="88" y="124" class="un-corner" text-anchor="middle" fill="#fff" transform="rotate(180 88 117)">S</text>';
    }
    if (v === 'R') {
      return '<path d="M66 52 A22 22 0 1 0 66 88" fill="none" stroke="#fff" stroke-width="7"/>' +
        '<path d="M60 42 L74 52 L60 62 Z" fill="#fff"/>' +
        '<path d="M40 98 L26 88 L40 78 Z" fill="#fff"/>' +
        '<text x="12" y="24" class="un-corner" text-anchor="middle" fill="#fff">R</text>' +
        '<text x="88" y="124" class="un-corner" text-anchor="middle" fill="#fff" transform="rotate(180 88 117)">R</text>';
    }
    if (v === 'D') {
      return '<text x="50" y="88" class="un-num2" text-anchor="middle" fill="#fff" stroke="rgba(0,0,0,0.5)" stroke-width="1">+2</text>' +
        '<text x="12" y="24" class="un-corner" text-anchor="middle" fill="#fff">+2</text>' +
        '<text x="88" y="124" class="un-corner" text-anchor="middle" fill="#fff" transform="rotate(180 88 117)">+2</text>';
    }
    if (v === 'X') {
      return '<text x="50" y="88" class="un-num2" text-anchor="middle" fill="#fff" stroke="rgba(0,0,0,0.5)" stroke-width="1">+4</text>' +
        wildQuads(50, 70, 13) +
        '<text x="12" y="24" class="un-corner" text-anchor="middle" fill="#fff">+4</text>' +
        '<text x="88" y="124" class="un-corner" text-anchor="middle" fill="#fff" transform="rotate(180 88 117)">+4</text>';
    }
    /* W — براغي: أربع أرباع ملونة */
    return '<g transform="rotate(45 50 70)">' + wildQuads(50, 70, 26) + '</g>' +
      '<circle cx="50" cy="70" r="30" fill="none" stroke="#fff" stroke-width="4"/>' +
      '<text x="12" y="24" class="un-corner" text-anchor="middle" fill="#fff">W</text>' +
      '<text x="88" y="124" class="un-corner" text-anchor="middle" fill="#fff" transform="rotate(180 88 117)">W</text>';
  }

  /* أربع أرباع (برتاغلي) */
  function wildQuads(cx, cy, r) {
    return '<g>' +
      '<path d="M' + cx + ' ' + cy + ' L' + (cx + r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 0 ' + cx + ' ' + (cy - r) + ' Z" fill="' + COL.R + '"/>' +
      '<path d="M' + cx + ' ' + cy + ' L' + cx + ' ' + (cy - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + (cx - r) + ' ' + cy + ' Z" fill="' + COL.B + '"/>' +
      '<path d="M' + cx + ' ' + cy + ' L' + (cx - r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 0 ' + cx + ' ' + (cy + r) + ' Z" fill="' + COL.G + '"/>' +
      '<path d="M' + cx + ' ' + cy + ' L' + cx + ' ' + (cy + r) + ' A' + r + ' ' + r + ' 0 0 0 ' + (cx + r) + ' ' + cy + ' Z" fill="' + COL.Y + '"/>' +
      '</g>';
  }

  /* ── ورقة الوجه ── */
  function cardFace(card) {
    const c = COL[card.color] || COL.K;
    const soft = COL_SOFT[card.color] || COL_SOFT.K;
    const isWild = card.color === 'K';
    return '<svg viewBox="0 0 100 140" class="un-csvg" role="img" aria-label="' + T('un.color.' + card.color) + ' ' + card.value + '">' +
      '<rect x="1.5" y="1.5" width="97" height="137" rx="11" fill="' + c + '"/>' +
      '<rect x="1.5" y="1.5" width="97" height="137" rx="11" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2.5"/>' +
      '<rect x="5" y="5" width="90" height="130" rx="8" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>' +
      (isWild
        ? '<ellipse cx="50" cy="70" rx="31" ry="47" transform="rotate(45 50 70)" fill="#10141d"/>'
        : '<ellipse cx="50" cy="70" rx="31" ry="47" transform="rotate(45 50 70)" fill="rgba(255,255,255,0.96)"/>' +
          '<ellipse cx="50" cy="70" rx="38" ry="55" transform="rotate(45 50 70)" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.6"/>') +
      centerArt(card) +
      '</svg>';
  }

  /* ── ظهر البطاقة (مطابق للبلوت حسب طلب المستخدم) ── */
  function cardBack(style) {
    const base = assetBase();
    if (!base) return '';
    return '<img class="un-cimg" src="' + base + '/cards/back.webp" draggable="false" aria-hidden="true"' + (style ? ' style="' + style + '"' : '') + '>';
  }

  /* عنصر DOM */
  function cardEl(card, opts) {
    opts = opts || {};
    const d = root.document.createElement('div');
    const cls = 'un-card' + (opts.back ? ' un-back' : '') +
      (opts.legal ? ' un-legal' : '') +
      (opts.dim ? ' un-dim' : '') +
      (opts.drawn ? ' un-drawn' : '') +
      (opts.small ? ' un-sm' : '');
    d.className = cls;
    if (opts.cardId) d.setAttribute('data-card', opts.cardId);
    d.innerHTML = opts.back ? cardBack() : (card ? cardFace(card) : '');
    return d;
  }

  /* لون لعبة → css */
  function colorHex(code) { return COL[code] || '#222'; }

  /* قاعدة أصول المنصة (يضبطها الجسر/الصفحة المستقلة) */
  function assetBase() {
    const b = root.UN_ASSET_BASE;
    return (b && b !== 'off') ? String(b).replace(/\/+$/, '') : null;
  }

  root.UNRender = {
    cardFace: cardFace,
    cardBack: cardBack,
    cardEl: cardEl,
    colorHex: colorHex,
    assetBase: assetBase,
    COL: COL
  };
})(typeof window !== 'undefined' ? window : globalThis);

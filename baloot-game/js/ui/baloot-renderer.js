/* ════════════════════════════════════════════════════════════════════
   BLRender — عرض البلوت: أوراق SVG · زليج · جزيئات ذهبية · مؤثرات
   كل العناصر مبنية برمجياً — بلا صور خارجية.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const Core = root.BALCore;
  const T = root.BL_T;

  /* ── نجمة زليج الثمانية ── */
  function starPath(cx, cy, rOut, rIn, points, rot) {
    points = points || 8; rot = (rot == null) ? -Math.PI / 2 : rot;
    const step = Math.PI / points;
    let d = '';
    for (let i = 0; i < points * 2; i++) {
      const r = (i % 2 === 0) ? rOut : rIn;
      const a = rot + i * step;
      d += (i === 0 ? 'M' : 'L') + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2) + ' ';
    }
    return d + 'Z';
  }

  const RED = '#b32536', NAVY = '#1d2c4f';
  const suitColor = (s) => (s === 'H' || s === 'D') ? RED : NAVY;

  /* ── SVG العام (معرّفات مشتركة) ── */
  function defsSVG() {
    const star = starPath(22, 22, 9, 3.4);
    return '<svg class="bl-defs" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<linearGradient id="bl-cface" x1="0" y1="0" x2="0.35" y2="1">' +
      '<stop offset="0" stop-color="#fdfaf1"/><stop offset="0.55" stop-color="#f4ecd8"/><stop offset="1" stop-color="#e6d9ba"/>' +
      '</linearGradient>' +
      '<linearGradient id="bl-cback" x1="0" y1="0" x2="0.45" y2="1">' +
      '<stop offset="0" stop-color="#1c3a63"/><stop offset="0.55" stop-color="#122844"/><stop offset="1" stop-color="#0a1830"/>' +
      '</linearGradient>' +
      '<linearGradient id="bl-gold" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#f2d489"/><stop offset="0.5" stop-color="#d9b45c"/><stop offset="1" stop-color="#b8892f"/>' +
      '</linearGradient>' +
      '<radialGradient id="bl-medal" cx="0.38" cy="0.3" r="0.85">' +
      '<stop offset="0" stop-color="#f6dd9a"/><stop offset="0.6" stop-color="#d9b45c"/><stop offset="1" stop-color="#9c7422"/>' +
      '</radialGradient>' +
      '<pattern id="bl-starpat" width="26" height="26" patternUnits="userSpaceOnUse">' +
      '<g fill="none" stroke="#d9b45c" stroke-opacity="0.5" stroke-width="0.9">' +
      '<path d="' + starPath(13, 13, 8, 3.1) + '"/>' +
      '<path d="' + starPath(0, 0, 5, 1.9) + '" transform="translate(26 26)"/>' +
      '</g></pattern>' +
      '<symbol id="bl-pip-S" viewBox="0 0 24 24"><path d="M12 1.8C12 1.8 3.1 8.3 3.1 13.2a4.5 4.5 0 0 0 7.7 3.2v2.2H8.1v2.8h7.8v-2.8h-2.7v-2.2a4.5 4.5 0 0 0 7.7-3.2C20.9 8.3 12 1.8 12 1.8Z"/></symbol>' +
      '<symbol id="bl-pip-H" viewBox="0 0 24 24"><path d="M12 21.2S3.4 15.6 3.4 9.9A4.6 4.6 0 0 1 12 8.1a4.6 4.6 0 0 1 8.6 1.8c0 5.7-8.6 11.3-8.6 11.3Z"/></symbol>' +
      '<symbol id="bl-pip-D" viewBox="0 0 24 24"><path d="M12 1.4 20.6 12 12 22.6 3.4 12Z"/></symbol>' +
      '<symbol id="bl-pip-C" viewBox="0 0 24 24"><path d="M12 1.6a4.3 4.3 0 0 1 3.5 6.8 4.3 4.3 0 1 1 .5 5.9v.6h2.2v2.8H5.8v-2.8H8v-.6a4.3 4.3 0 1 1 .5-5.9A4.3 4.3 0 0 1 12 1.6Z"/></symbol>' +
      '</defs></svg>';
  }

  /* ── مواقع النقاط (Pips) ── */
  const PIP_LAYOUTS = {
    7: [[50, 32], [34, 52], [66, 52], [34, 72], [66, 72], [34, 92], [66, 92]],
    8: [[34, 42], [66, 42], [34, 62], [66, 62], [34, 82], [66, 82], [34, 102], [66, 102]],
    9: [[34, 40], [66, 40], [34, 57], [66, 57], [50, 65], [34, 74], [66, 74], [34, 91], [66, 91]],
    10: [[34, 38], [66, 38], [34, 56], [66, 56], [50, 47], [34, 74], [66, 74], [50, 83], [34, 92], [66, 92]]
  };

  function pip(suit, x, y, size) {
    return '<use href="#bl-pip-' + suit + '" x="' + (x - size / 2) + '" y="' + (y - size / 2) + '" width="' + size + '" height="' + size + '" fill="' + suitColor(suit) + '"/>';
  }

  /* ── أوراق المنصة الموحدة (نفس أصول الرامي/الهاي لو/البلاك جاك) ──
     تُفعَّل عند ضبط window.BL_ASSET_BASE (الجسر: 'assets' · الصفحة المستقلة: '../assets').
     في غيابها يبقى الرسم SVG الاحتياطي. */
  function assetBase() {
    const b = root.BL_ASSET_BASE;
    return (b && b !== 'off') ? String(b).replace(/\/+$/, '') : null;
  }
  const CARD_RANK_FILE = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10', 9: '9', 8: '8', 7: '7' };
  const CARD_SUIT_FILE = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  function cardImg(card, opts) {
    opts = opts || {};
    const base = assetBase();
    if (!base) return null;
    const trumpCls = opts.trump ? ' bl-cimgtrump' : '';
    if (opts.back) {
      return '<img class="bl-cimg' + trumpCls + '" style="' + (opts.style || '') + '" src="' + base + '/cards/back.webp" alt="" draggable="false" aria-hidden="true">';
    }
    if (!card || !CARD_RANK_FILE[card.rank] || !CARD_SUIT_FILE[card.suit]) return null;
    return '<img class="bl-cimg' + trumpCls + '" src="' + base + '/cards/' + CARD_RANK_FILE[card.rank] + '-' + CARD_SUIT_FILE[card.suit] + '.webp" alt="' + Core.rankLabel(card.rank) + ' ' + card.suit + '" draggable="false">';
  }

  /* ── ورقة اللعب (صور المنصة الموحدة مع SVG احتياطي) ── */
  function cardSVG(card, opts) {
    opts = opts || {};
    const img = cardImg(card, opts);
    if (img) return img;
    if (opts.back) {
      return '<svg viewBox="0 0 100 140" class="bl-csvg" aria-hidden="true"' + (opts.style ? ' style="' + opts.style + '"' : '') + '>' +
        '<rect x="1.5" y="1.5" width="97" height="137" rx="9" fill="url(#bl-cback)" stroke="rgba(217,180,92,0.5)" stroke-width="1"/>' +
        '<rect x="6" y="6" width="88" height="128" rx="6" fill="url(#bl-starpat)" opacity="0.5"/>' +
        '<rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="url(#bl-gold)" stroke-width="1.4" opacity="0.9"/>' +
        '<path d="' + starPath(50, 70, 17, 6.6) + '" fill="none" stroke="url(#bl-gold)" stroke-width="1.6" opacity="0.95"/>' +
        '<path d="' + starPath(50, 70, 9, 3.4) + '" fill="url(#bl-gold)" opacity="0.9"/>' +
        '</svg>';
    }
    const r = card.rank, s = card.suit, col = suitColor(s);
    const label = Core.rankLabel(r);
    let center = '';
    if (r === 14) {
      center = '<circle cx="50" cy="70" r="27" fill="none" stroke="' + col + '" stroke-width="1" opacity="0.3"/>' +
        pip(s, 50, 70, 42);
    } else if (r === 11 || r === 12 || r === 13) {
      center = '<circle cx="50" cy="70" r="26.5" fill="url(#bl-medal)" stroke="#8a6a25" stroke-width="1.2"/>' +
        '<circle cx="50" cy="70" r="21.5" fill="none" stroke="rgba(255,252,244,0.4)" stroke-width="1"/>' +
        '<text x="50" y="81" class="bl-facemono" text-anchor="middle" fill="#1b2a4a">' + label + '</text>' +
        pip(s, 50, 30, 14) + pip(s, 50, 110, 14);
    } else if (PIP_LAYOUTS[r]) {
      center = '';
      const pos = PIP_LAYOUTS[r];
      for (let i = 0; i < pos.length; i++) center += pip(s, pos[i][0], pos[i][1], 15);
    }
    const corner =
      '<text x="9" y="16" class="bl-rank" text-anchor="middle" fill="' + col + '">' + label + '</text>' +
      pip(s, 9, 24, 11);
    const trump = opts.trump ?
      '<rect x="3" y="3" width="94" height="134" rx="8" fill="none" stroke="url(#bl-gold)" stroke-width="2"/>' +
      '<rect x="3" y="3" width="94" height="134" rx="8" fill="none" stroke="rgba(242,212,137,0.5)" stroke-width="5" opacity="0.35"/>' :
      '<rect x="2" y="2" width="96" height="136" rx="8.5" fill="none" stroke="rgba(120,100,60,0.35)" stroke-width="1"/>';
    return '<svg viewBox="0 0 100 140" class="bl-csvg" role="img" aria-label="' + label + ' ' + s + '">' +
      '<rect x="1.5" y="1.5" width="97" height="137" rx="9" fill="url(#bl-cface)"/>' +
      '<rect x="4.5" y="4.5" width="91" height="131" rx="7" fill="none" stroke="rgba(184,137,47,0.25)" stroke-width="0.8"/>' +
      corner +
      '<g transform="rotate(180 50 70)">' + corner + '</g>' +
      center +
      trump +
      '</svg>';
  }

  /* ── عنصر ورقة DOM ── */
  function cardEl(card, opts) {
    opts = opts || {};
    const d = root.document.createElement('div');
    const cls = 'bl-card' + (opts.back ? ' bl-cardback' : '') +
      (opts.trump ? ' bl-trump' : '') +
      (opts.dim ? ' bl-dim' : '') +
      (opts.legal ? ' bl-legal' : '') +
      (opts.selected ? ' bl-sel' : '') +
      (opts.win ? ' bl-win' : '') +
      (opts.small ? ' bl-sm' : '');
    d.className = cls;
    if (opts.cardId) d.setAttribute('data-card', opts.cardId);
    d.innerHTML = cardSVG(card, opts);
    return d;
  }

  /* ── جزيئات ذهبية (Canvas) ── */
  function Particles(canvas) {
    this.cv = canvas;
    this.cx = canvas ? canvas.getContext('2d') : null;
    this.parts = [];
    this._raf = 0;
    this._last = 0;
    this._onResize = () => this.resize();
    this.resize();
    if (root.addEventListener) root.addEventListener('resize', this._onResize);
  }
  Particles.prototype.resize = function () {
    if (!this.cv) return;
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const w = this.cv.clientWidth || 300, h = this.cv.clientHeight || 300;
    this.cv.width = Math.floor(w * dpr);
    this.cv.height = Math.floor(h * dpr);
    this.cx && this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  Particles.prototype.burst = function (x, y, opts) {
    opts = opts || {};
    const n = opts.count || 24;
    const power = opts.power || 300;
    const kinds = opts.kinds || ['coin', 'spark'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.35 + Math.random() * 0.65) * power;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      this.parts.push({
        x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.35,
        g: 900, life: 0.7 + Math.random() * 0.7, age: 0,
        size: kind === 'coin' ? 3 + Math.random() * 4 : 1.5 + Math.random() * 2.5,
        kind: kind,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
        hue: kind === 'suit' ? (Math.random() < 0.5 ? 'gold' : 'ivory') : (opts.color || 'gold')
      });
    }
    if (!this._raf) this._loop();
  };
  Particles.prototype._loop = function () {
    const step = (now) => {
      if (!this.cx) { this._raf = 0; this.parts = []; return; }
      const dt = Math.min(0.05, (now - (this._last || now)) / 1000);
      this._last = now;
      this.cx.clearRect(0, 0, this.cv.width, this.cv.height);
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.age += dt;
        if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const k = 1 - p.age / p.life;
        this.cx.save();
        this.cx.globalAlpha = Math.min(1, k * 1.6);
        this.cx.translate(p.x, p.y);
        this.cx.rotate(p.rot);
        if (p.kind === 'coin') {
          const g = this.cx.createRadialGradient(-p.size * 0.3, -p.size * 0.3, p.size * 0.2, 0, 0, p.size);
          g.addColorStop(0, '#f6e3a1');
          g.addColorStop(0.6, '#d9b45c');
          g.addColorStop(1, '#9c7422');
          this.cx.fillStyle = g;
          this.cx.beginPath();
          this.cx.ellipse(0, 0, p.size, p.size * (0.45 + 0.55 * Math.abs(Math.sin(p.rot * 2))), 0, 0, Math.PI * 2);
          this.cx.fill();
        } else if (p.kind === 'spark') {
          this.cx.strokeStyle = p.hue === 'red' ? '#f87171' : '#f2d489';
          this.cx.lineWidth = p.size * 0.8;
          this.cx.beginPath();
          this.cx.moveTo(-p.size * 2, 0);
          this.cx.lineTo(p.size * 2, 0);
          this.cx.stroke();
        } else { // suit glyph
          this.cx.fillStyle = p.hue === 'red' ? '#f87171' : (p.hue === 'ivory' ? '#f4ecd8' : '#d9b45c');
          this.cx.font = Math.floor(p.size * 5) + 'px serif';
          this.cx.textAlign = 'center';
          this.cx.textBaseline = 'middle';
          this.cx.fillText(['\u2660', '\u2665', '\u2666', '\u2663'][Math.floor(Math.abs(p.rot) % 4)], 0, 0);
        }
        this.cx.restore();
      }
      if (this.parts.length) {
        this._raf = root.requestAnimationFrame(step);
      } else {
        this._raf = 0;
        this.cx.clearRect(0, 0, this.cv.width, this.cv.height);
      }
    };
    this._raf = root.requestAnimationFrame(step);
  };
  Particles.prototype.dispose = function () {
    if (this._raf) { try { root.cancelAnimationFrame(this._raf); } catch (e) {} this._raf = 0; }
    if (root.removeEventListener) root.removeEventListener('resize', this._onResize);
  };

  /* ── اهتزاز الطاولة ── */
  function shake(el, power) {
    if (!el) return;
    el.style.setProperty('--bl-shake-px', Math.min(22, power || 8) + 'px');
    el.classList.remove('bl-shake');
    void el.offsetWidth;
    el.classList.add('bl-shake');
    setTimeout(() => el.classList.remove('bl-shake'), 500);
  }

  /* ── أرقام عائمة ── */
  function popup(container, text, sub, tone) {
    if (!container) return;
    const d = root.document.createElement('div');
    d.className = 'bl-float ' + (tone === 'red' ? 'bl-floatred' : tone === 'blue' ? 'bl-floatblue' : '');
    d.innerHTML = '<p class="bl-floatmain">' + text + '</p>' + (sub ? '<p class="bl-floatsub">' + sub + '</p>' : '');
    container.appendChild(d);
    setTimeout(() => { try { d.remove(); } catch (e) {} }, 1150);
  }

  /* ── بانر مركزي (تسمية / أشور / بلوت / كابوت) ── */
  function banner(container, html, cls, ms) {
    if (!container) return;
    container.innerHTML = '<div class="bl-bannerinner ' + (cls || '') + '">' + html + '</div>';
    container.classList.remove('show');
    void container.offsetWidth;
    container.classList.add('show');
    clearTimeout(banner._t);
    banner._t = setTimeout(() => container.classList.remove('show'), ms || 1600);
  }

  root.BLRender = {
    defsSVG: defsSVG,
    starPath: starPath,
    assetBase: assetBase,
    cardImg: cardImg,
    cardSVG: cardSVG,
    cardEl: cardEl,
    Particles: Particles,
    shake: shake,
    popup: popup,
    banner: banner
  };
})(typeof window !== 'undefined' ? window : globalThis);

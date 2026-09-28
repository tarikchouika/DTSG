/* ════════════════════════════════════════════════════════════════════
   UNCore — محرك أونو الحتمي (Detuno)
   - طاقم 108 بطاقة: 4 ألوان × (0 واحدة، 1-9 ×2، Skip/Rev/+2 ×2) + 4 Wild + 4 Wild+4
   - ألوان: R أحمر · B أزرق · G أخضر · Y أصفر · K أسود (براغي)
   - قيم: '0'-'9' · 'S' تخطي · 'R' انعكاس · 'D' اسحب2 · 'W' براغي · 'X' براغي+4
   - عشوائي mulberry32 ببذرة — نفس التوزيع عند كل اللاعبين (نمط البلوت).
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COLORS = ['R', 'B', 'G', 'Y'];
  const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'R', 'D'];

  /* قيمة البطاقة للنقاط (خسارة الجولة): رقم = قيمته · فعل = 20 · براغي = 50 */
  function cardValue(c) {
    if (!c) return 0;
    if (c.color === 'K') return 50;
    if (c.value >= '0' && c.value <= '9') return parseInt(c.value, 10);
    return 20;
  }
  function handScore(hand) {
    let s = 0;
    for (let i = 0; i < hand.length; i++) s += cardValue(hand[i]);
    return s;
  }

  /* بناء الطاقم: 108 بطاقات بمعرّفات فريدة (1-108) */
  function buildDeck() {
    const d = [];
    let id = 1;
    for (let ci = 0; ci < 4; ci++) {
      const color = COLORS[ci];
      d.push({ id: id++, color: color, value: '0' });
      for (let v = 1; v <= 9; v++) {
        const s = String(v);
        d.push({ id: id++, color: color, value: s });
        d.push({ id: id++, color: color, value: s });
      }
      for (let ai = 0; ai < 3; ai++) {
        const v = VALUES[10 + ai]; /* S, R, D */
        d.push({ id: id++, color: color, value: v });
        d.push({ id: id++, color: color, value: v });
      }
    }
    for (let i = 0; i < 4; i++) d.push({ id: id++, color: 'K', value: 'W' });
    for (let i = 0; i < 4; i++) d.push({ id: id++, color: 'K', value: 'X' });
    return d; /* 108 */
  }

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* التوزيع: 7 لكل لاعب + بطاقة أولى غير براغي */
  function deal(deck, rand, nPlayers) {
    const hands = [];
    for (let p = 0; p < nPlayers; p++) {
      const h = [];
      for (let i = 0; i < 7; i++) h.push(deck.pop());
      hands.push(h);
    }
    let first = deck.pop();
    let guard = 0;
    while (first.color === 'K' && guard++ < 50) {
      deck.unshift(first);
      shuffle(deck, rand);
      first = deck.pop();
    }
    return { hands: hands, first: first, rest: deck };
  }

  /* البطاقات القابلة للعب: لون اللعبة أو القيمة نفسها أو براغي */
  function legalMoves(hand, color, topValue) {
    const ok = [];
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      if (c.color === 'K' || c.color === color || c.value === topValue) ok.push(c.id);
    }
    return ok;
  }

  function top(discard) { return discard.length ? discard[discard.length - 1] : null; }

  /* إعادة تدوير رمية (بلا البطاقة العلوية) — حتمية */
  function recycle(discard, rand) {
    const t = discard.pop();
    const d = discard.filter(function (c) { return c.color !== 'K'; });
    discard.length = 0;
    shuffle(d, rand);
    discard.push(t);
    return d;
  }

  function cloneCard(c) { return { id: c.id, color: c.color, value: c.value }; }

  root.UNCORE_VERSION = '2.0';
  root.UNCore = {
    COLORS: COLORS,
    rng: rng,
    buildDeck: buildDeck,
    shuffle: shuffle,
    deal: deal,
    cardValue: cardValue,
    handScore: handScore,
    legalMoves: legalMoves,
    top: top,
    recycle: recycle,
    cloneCard: cloneCard
  };
})(typeof window !== 'undefined' ? window : globalThis);

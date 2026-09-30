/* ════════════════════════════════════════════════════════════════════
   BALCore — البلوت (Baloot): المحرك الحتمي للقواعد
   ────────────────────────────────────────────────────────────────────
   • 32 ورقة (7 → آس) في أربعة أنواع: S بستوني · H كوبة · D دينار · C سباتي
   • 4 لاعبين على فريقين: (0,2) ضد (1,3)
   • التسمية: هوكم (نوع واحد) أو صن (بلا هوكم) أو «بس»
   • الأشور: سرا(20) خمسين(50) مية(100) رباعية(100-200) بلوت(20 عند اللعب)
   • الأعلى يقطع الأدنى · اليد +10 · كابوت = كل نقاط الدور + مكافأة
   بلا DOM ولا مؤثرات — كل دالة هنا حتمية وقابلة للاختبار.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = [7, 8, 9, 10, 11, 12, 13, 14]; // 11=J 12=Q 13=K 14=A

  function cardId(suit, rank) { return suit + rank; }

  function makeDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 0; r < 8; r++) d.push({ id: cardId(SUITS[s], RANKS[r]), suit: SUITS[s], rank: RANKS[r] });
    return d;
  }

  function shuffle(arr, rnd) {
    const f = rnd || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(f() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* مولد أرقام حتمي (mulberry32) — بذرة الغرفة: نفس التوزيع عند كل العملاء */
  function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const RANK_LABEL = { 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const rankLabel = (r) => RANK_LABEL[r] || String(r);

  /* ── النقاط ────────────────────────────────────────────────────────
     صن (وغير هوكم): آس 11 · 10 → 10 · شايب K 4 · بنت Q 3 · ولد J 2
     هوكم:           ولد J 20 · 9 → 14 · آس 11 · 10 → 10 · K 4 · Q 3  */
  const NORMAL_POINTS = { 14: 11, 10: 10, 13: 4, 12: 3, 11: 2, 9: 0, 8: 0, 7: 0 };
  const TRUMP_POINTS = { 11: 20, 9: 14, 14: 11, 10: 10, 13: 4, 12: 3, 8: 0, 7: 0 };

  function pointsOf(card, trump) {
    if (trump && card.suit === trump) return TRUMP_POINTS[card.rank] || 0;
    return NORMAL_POINTS[card.rank] || 0;
  }

  /* ── القوة (من الأعلى) ─────────────────────────────────────────────
     صن:      آس > 10 > K > Q > J > 9 > 8 > 7
     هوكم:    J > 9 > آس > 10 > K > Q > 8 > 7               */
  const NORMAL_ORDER = { 14: 7, 10: 6, 13: 5, 12: 4, 11: 3, 9: 2, 8: 1, 7: 0 };
  const TRUMP_ORDER = { 11: 7, 9: 6, 14: 5, 10: 4, 13: 3, 12: 2, 8: 1, 7: 0 };

  function power(card, trump) {
    if (trump && card.suit === trump) return 1000 + (TRUMP_ORDER[card.rank] || 0);
    return NORMAL_ORDER[card.rank] || 0;
  }

  const teamOf = (seat) => seat % 2; // 0 → (0,2) · 1 → (1,3)
  const sameTeam = (a, b) => (a % 2) === (b % 2);

  /* ── حركات قانونية ─────────────────────────────────────────────────
     1) الزم اللون المطروح — 2) لا يوجد → اضرب هوكم إلزامياً
     3) لا هوكم → أي ورقة.  (mustBeat: إذا طُرح هوكم يلزم تغطيته إن أمكن) */
  function legalMoves(hand, trick, trump, mustBeat) {
    if (!trick.length) return hand.slice();
    const led = trick[0].card.suit;
    const follow = hand.filter((c) => c.suit === led);
    if (follow.length) {
      if (mustBeat && trump && led === trump) {
        const winPow = power(trick[trickWinnerIdx(trick, trump)].card, trump);
        const beaters = follow.filter((c) => power(c, trump) > winPow);
        if (beaters.length) return beaters;
      }
      return follow;
    }
    if (trump) {
      const trumps = hand.filter((c) => c.suit === trump);
      if (trumps.length) return trumps;
    }
    return hand.slice();
  }

  function isLegal(hand, trick, trump, card, mustBeat) {
    return legalMoves(hand, trick, trump, mustBeat).some((c) => c.id === card.id);
  }

  function trickWinnerIdx(trick, trump) {
    let best = 0;
    for (let i = 1; i < trick.length; i++) {
      if (power(trick[i].card, trump) > power(trick[best].card, trump)) best = i;
    }
    return best;
  }

  /* ترتيب اليد: هوكم أولاً (الأقوى أولًا) ثم باقي الأنواع */
  function sortHand(hand, trump) {
    const order = trump ? [trump].concat(SUITS.filter((s) => s !== trump)) : SUITS.slice();
    return hand.slice().sort((a, b) => {
      const sa = order.indexOf(a.suit), sb = order.indexOf(b.suit);
      if (sa !== sb) return sa - sb;
      return power(b, trump) - power(a, trump);
    });
  }

  /* ══════════════════ الأشور ══════════════════ */
  /* سرا 3 متتالية من نوع واحد = 20 · خمسين 4 متتالية = 50 ·
     مية 5+ متتالية = 100 · رباعية: 4J=200 · 4(9)=150 · 4(A/10/K/Q)=100 */
  const QUAD_VALUE = { 11: 200, 9: 150, 14: 100, 10: 100, 13: 100, 12: 100, 8: 0, 7: 0 };

  function serialRuns(hand) {
    const bySuit = {};
    for (let s = 0; s < 4; s++) bySuit[SUITS[s]] = {};
    for (let i = 0; i < hand.length; i++) bySuit[hand[i].suit][hand[i].rank] = hand[i];
    const runs = [];
    for (let s = 0; s < 4; s++) {
      const present = RANKS.filter((r) => bySuit[SUITS[s]][r]);
      let start = -1, prev = -1;
      for (let i = 0; i <= present.length; i++) {
        const r = i < present.length ? present[i] : -1;
        if (start === -1) { if (r !== -1) { start = r; prev = r; } continue; }
        if (r !== prev + 1) {
          if (prev - start + 1 >= 3) runs.push({ suit: SUITS[s], from: start, to: prev, len: prev - start + 1 });
          if (r === -1) { start = -1; } else { start = r; prev = r; }
        } else prev = r;
      }
    }
    return runs.sort((a, b) => b.len - a.len);
  }

  function serialValue(len) { return len >= 5 ? 100 : len === 4 ? 50 : 20; }

  function quadCards(hand) {
    const byRank = {};
    for (let i = 0; i < hand.length; i++) (byRank[hand[i].rank] = byRank[hand[i].rank] || []).push(hand[i]);
    const out = [];
    for (let r = 0; r < 8; r++) {
      const rr = RANKS[r];
      if ((byRank[rr] || []).length === 4) out.push({ rank: rr, value: QUAD_VALUE[rr] || 0 });
    }
    return out;
  }

  /* كل الأشور المعلنة الممكنة من يد (سلاسل + رباعيات) — بلا بلوت (يُعلن عند اللعب) */
  function detectAshur(hand) {
    const out = [];
    const runs = serialRuns(hand);
    if (runs.length) {
      const best = runs[0];
      out.push({ type: 'serial', suit: best.suit, from: best.from, to: best.to, len: best.len, value: serialValue(best.len) });
    }
    const quads = quadCards(hand).sort((a, b) => b.value - a.value);
    for (let i = 0; i < quads.length; i++) out.push({ type: 'quad', rank: quads[i].rank, value: quads[i].value });
    return out.sort((a, b) => b.value - a.value);
  }

  /* يد تملك K وQ من هوكم؟ (للأشور: بلوت — يُعلن عند لحظة اللعب) */
  function hasBaloot(hand, trump) {
    if (!trump) return false;
    let k = false, q = false;
    for (let i = 0; i < hand.length; i++) {
      if (hand[i].suit === trump && hand[i].rank === 13) k = true;
      if (hand[i].suit === trump && hand[i].rank === 12) q = true;
    }
    return k && q;
  }

  /* ══════════════════ تقييم اليد (للتسمية والذكاء) ══════════════════ */
  /* قوة اليد لو كان السيت s هو هوكم — يقدّر نقاط الأوراق + التحكم */
  function handStrengthForSuit(hand, trump) {
    let pts = 0, trumps = 0;
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      pts += pointsOf(c, trump);
      if (c.suit === trump) trumps++;
    }
    return { pts: pts, trumps: trumps, score: pts + trumps * 2.5 };
  }

  function strongestSuit(hand) {
    let best = null, bestScore = -1;
    for (let s = 0; s < 4; s++) {
      const e = handStrengthForSuit(hand, SUITS[s]);
      if (e.score > bestScore) { bestScore = e.score; best = SUITS[s]; }
    }
    return best;
  }

  /* قوة صن: مجموع النقاط في كل الأنواع + توزّع الأقوياء */
  function sunStrength(hand) {
    let pts = 0, strongSuits = 0;
    const perSuit = {};
    for (let s = 0; s < 4; s++) perSuit[SUITS[s]] = 0;
    for (let i = 0; i < hand.length; i++) {
      pts += NORMAL_POINTS[hand[i].rank] || 0;
      perSuit[hand[i].suit] += NORMAL_POINTS[hand[i].rank] || 0;
    }
    for (let s = 0; s < 4; s++) if (perSuit[SUITS[s]] >= 13) strongSuits++;
    return { pts: pts, strongSuits: strongSuits, score: pts + strongSuits * 4 };
  }

  /* ══════════════════ حساب نتيجة الدور ══════════════════ */
  /* cardPts [فريق0، فريق1] نقاط الأوراق · lastTrickTeam · ashur:
     {team0: {value, seat} , team1: {...}} · baloot [bool, bool] ·
     cfg: {kabotBonus, firstLead, mustBeat}                     */
  function scoreRound(cardPts, tricksWon, lastTrickTeam, ashur, baloot, kabotTeam, kabotBonus) {
    const total = [0, 0];
    const detail = {
      cardPts: cardPts.slice(), tricksWon: tricksWon.slice(),
      lastTrickTeam: lastTrickTeam,
      ashur: { 0: 0, 1: 0, cut: [false, false] },
      baloot: { 0: baloot[0] ? 20 : 0, 1: baloot[1] ? 20 : 0 },
      kabot: kabotTeam, kabotBonus: kabotTeam >= 0 ? (kabotBonus || 0) : 0,
      total: total
    };
    if (kabotTeam >= 0) {
      /* كابوت: الفائز يأخذ كل نقاط الدور (أوراق + يد + أشور الجميع) + المكافأة */
      const allAshur = (ashur[0] ? ashur[0].value : 0) + (ashur[1] ? ashur[1].value : 0);
      const cardAll = cardPts[0] + cardPts[1];
      const allBaloot = (baloot[0] ? 20 : 0) + (baloot[1] ? 20 : 0);
      total[kabotTeam] = cardAll + 10 + allAshur + allBaloot + (kabotBonus || 0);
      detail.ashur[0] = ashur[0] ? ashur[0].value : 0;
      detail.ashur[1] = ashur[1] ? ashur[1].value : 0;
      return detail;
    }
    /* الأشور: الأعلى يقطع الأدنى — يتبقى أشور فريق واحد فقط */
    const a0 = ashur[0] ? ashur[0].value : 0;
    const a1 = ashur[1] ? ashur[1].value : 0;
    if (a0 > a1) { detail.ashur[0] = a0; detail.ashur.cut[1] = a1 > 0; }
    else if (a1 > a0) { detail.ashur[1] = a1; detail.ashur.cut[0] = a0 > 0; }
    for (let t = 0; t < 2; t++) {
      total[t] = cardPts[t] + (lastTrickTeam === t ? 10 : 0) + detail.ashur[t] + detail.baloot[t];
    }
    return detail;
  }

  /* مجموع نقاط الدور (للتحقق): صن 120 · هوكم 152 (+10 يد = 130/162) */
  function roundCardTotal(trump) { return trump ? 152 : 120; }

  const Core = {
    SUITS: SUITS, RANKS: RANKS, cardId: cardId, makeDeck: makeDeck, shuffle: shuffle, rng: rng,
    rankLabel: rankLabel, pointsOf: pointsOf, power: power,
    teamOf: teamOf, sameTeam: sameTeam,
    legalMoves: legalMoves, isLegal: isLegal, trickWinnerIdx: trickWinnerIdx, sortHand: sortHand,
    serialRuns: serialRuns, serialValue: serialValue, quadCards: quadCards, detectAshur: detectAshur, hasBaloot: hasBaloot,
    handStrengthForSuit: handStrengthForSuit, strongestSuit: strongestSuit, sunStrength: sunStrength,
    scoreRound: scoreRound, roundCardTotal: roundCardTotal
  };

  root.BALCore = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof window !== 'undefined' ? window : globalThis);

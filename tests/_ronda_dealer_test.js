/* ═══ اختبار قرعة الموزع الأول (أصغر ورقة توزع + إعادة تعادل + حتمية seed) ═══ */
'use strict';
const path = require('path');
const RC = require(path.join(__dirname, '..', 'ronda-game', 'js', 'engine', 'ronda-core.js'));
const { RondaGame } = require(path.join(__dirname, '..', 'ronda-game', 'js', 'engine', 'ronda-game.js'));

const GameMode = RC.GameMode;
let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg); }
}

/* 1) غياب dealerSeat → قرعة تلقائية + حدث بأوراق لكل لاعب */
{
  const events = [];
  const g = new RondaGame({ mode: GameMode.FREE_FOR_ALL, playerCount: 3, seed: 42, names: ['أ','ب','ج'] });
  g.onEvent(function (ev) { events.push(ev); });
  g.start();
  const drawn = events.find(e => e.type === 'FirstDealerDrawn');
  check(!!drawn, 'بلا dealerSeat → حدث FirstDealerDrawn يُبث');
  check(drawn && drawn.cards.length === 3, 'ثلاث ورقات مسحوبة (واحدة لكل لاعب)');
  check(g.state.dealerSeat >= 0 && g.state.dealerSeat < 3, 'dealerSeat محدد بين 0-2');
  const minIdx = drawn ? Math.min(...drawn.cards.map(c => RC.rankSequenceIndex(c.rank))) : -1;
  const winner = drawn ? drawn.cards.find(c => RC.rankSequenceIndex(c.rank) === minIdx) : null;
  check(!!winner && winner.seat === g.state.dealerSeat, 'الفائز = صاحب أصغر ورقة (seat ' + g.state.dealerSeat + ')');
  check(g._dealerDrawn === true, '_dealerDrawn مضبوط');
}

/* 2) حتمية: نفس seed → نفس القرعة بالكامل */
{
  const g1 = new RondaGame({ mode: GameMode.HEAD_TO_HEAD, seed: 77, names: ['أ','ب'] });
  const g2 = new RondaGame({ mode: GameMode.HEAD_TO_HEAD, seed: 77, names: ['أ','ب'] });
  const e1 = [], e2 = [];
  g1.onEvent(e => e1.push(e)); g2.onEvent(e => e2.push(e));
  g1.start(); g2.start();
  const d1 = e1.find(e => e.type === 'FirstDealerDrawn');
  const d2 = e2.find(e => e.type === 'FirstDealerDrawn');
  check(JSON.stringify(d1.cards) === JSON.stringify(d2.cards) && d1.dealerSeat === d2.dealerSeat,
    'نفس seed → نفس القرعة (seed 77 → seat ' + d1.dealerSeat + ')');
}

/* 3) بذور مختلفة → توزيع متنوع عبر 100 لعبة (لا انحياز مقعد) */
{
  const counts = [0, 0, 0, 0];
  for (let s = 1; s <= 100; s++) {
    const g = new RondaGame({ mode: GameMode.FREE_FOR_ALL, playerCount: 4, seed: s * 1337, names: ['أ','ب','ج','د'] });
    g.start();
    counts[g.state.dealerSeat]++;
  }
  const spread = Math.max(...counts) - Math.min(...counts);
  check(spread <= 40, 'توزيع القرعة متوازن على 100 بذرة (عدّادات: ' + counts.join(',') + ')');
}

/* 4) dealerSeat صريح → لا قرعة ولا حدث */
{
  const events = [];
  const g = new RondaGame({ mode: GameMode.HEAD_TO_HEAD, seed: 5, dealerSeat: 1, names: ['أ','ب'] });
  g.onEvent(e => events.push(e));
  g.start();
  check(!events.find(e => e.type === 'FirstDealerDrawn'), 'dealerSeat صريح → لا حدث قرعة');
  check(g.state.dealerSeat === 1, 'dealerSeat الصريح محترم');
}

/* 5) جولة كاملة 4 لاعبين بعد القرعة تعمل بلا أخطاء */
{
  const g = new RondaGame({ mode: GameMode.FREE_FOR_ALL, playerCount: 4, seed: 99, names: ['أ','ب','ج','د'] });
  g.start();
  let roundsSeen = 0, lastRound = 0, plays = 0;
  while (plays < 400) {
    const st = g.state;
    if (st.phase !== RC.GamePhase.PLAYING) break;
    if (st.roundNumber > lastRound) { lastRound = st.roundNumber; roundsSeen++; if (roundsSeen >= 2) break; }
    const p = st.getPlayerBySeat(st.currentSeat);
    if (!p || !p.hand.length) break;
    try { g.playCard(p.id, p.hand[0].id); plays++; } catch (e) { break; }
  }
  check(roundsSeen >= 2 && plays >= 24, 'توزيعتان كاملتان+ لعبتا بلا أخطاء (' + plays + ' حركة، ' + roundsSeen + ' جولة)');
}

/* 6) حلقة إعادة التعادل: تسريب صناديق متعادية بالقوة عبر rng مُعدَّل */
{
  /* نجعل shuffle ينتج أعلى الورق متطابق الرتب دائماً: نعترض pop لسحبين متساويين
     في المرة الأولى فقط ثم نطلق السير الطبيعي — التحقق أن الحلقة لا تتجمد */
  const g = new RondaGame({ mode: GameMode.HEAD_TO_HEAD, seed: 31, names: ['أ','ب'] });
  let intercept = true;
  const origShuffle = RC.shuffle;
  const drawDeck = RC.RondaDeckFactory.create();
  let popped = 0;
  const origPop = Array.prototype.pop;
  /* تعديل سلوك pop داخل الاستدعاء الأول فقط: أول ورقتين بنفس الرتبة */
  g._drawFirstDealer = g._drawFirstDealer; /* نسخة مرجعية */
  const realDraw = g._drawFirstDealer.bind(g);
  Array.prototype.pop = function () {
    if (intercept && this.length && this[0].rank !== undefined && popped < 2) {
      popped++;
      if (popped === 2) intercept = false;
      /* ورقة اصطناعية بنفس رتبة الأولى — يفرض تعادلاً في السحب الأول */
      const firstRank = RANK_PEEK || this[this.length - 1].rank;
      return { id: -1, rank: firstRank, suit: this[this.length - 1].suit };
    }
    return origPop.apply(this, arguments);
  };
  let RANK_PEEK = null;
  try {
    /* التقط رتبة أول pop لتكرارها في الثانية */
    Array.prototype.pop = function () {
      const c = origPop.apply(this, arguments);
      if (intercept && popped === 0) { RANK_PEEK = c.rank; popped = 1; return c; }
      if (intercept && popped === 1 && RANK_PEEK) { popped = 2; intercept = false; return { id: -1, rank: RANK_PEEK, suit: c.suit }; }
      return c;
    };
    const ev = [];
    g.onEvent(e => ev.push(e));
    realDraw();
    const drawn = ev.find(e => e.type === 'FirstDealerDrawn');
    check(!!drawn, 'التعادل القسري: القرعة اكتملت (حلقة إعادة السحب لم تتجمد)');
    check(g.state.dealerSeat >= 0 && g.state.dealerSeat <= 1, 'موزع صالح بعد حل التعادل');
  } finally {
    Array.prototype.pop = origPop;
  }
}

/* 7) توقيع الواجهة: القرعة تُبث قبل أول CardsDealt */
{
  const g = new RondaGame({ mode: GameMode.FREE_FOR_ALL, playerCount: 3, seed: 2024, names: ['أ','ب','ج'] });
  const order = [];
  g.onEvent(e => order.push(e.type));
  g.start();
  const di = order.indexOf('FirstDealerDrawn');
  const dc = order.indexOf('CardsDealt');
  check(di !== -1 && (dc === -1 || di < dc), 'FirstDealerDrawn يسبق أول CardsDealt');
}

console.log('\n═══ روندا قرعة الموزع: ' + pass + '/' + (pass + fail) + ' نجح ═══');
process.exit(fail ? 1 : 0);

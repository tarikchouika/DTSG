/* ═══ [EXPERT-AI] اختبار محرّك الخبير لرامي في نود ═══
   1) سلامة: ألعاب كاملة بلا أخطاء/جزاءات للبوت الخبير
   2) هيمنة: خبير ضد الذكاء القديم (عشوائي) — نسبة الفوز
   3) سرعة: متوسط عدد الأدوار حتى الفوز */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'rami.js'), 'utf8');
const ctx = { console, Date, Math, JSON, Set, Map, Array, Object, Number, String, setTimeout: (fn) => fn(), window: {} };
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__X = { RamiGame, RamiExpertAI, partitionSelectedCards, MELD_TYPE };', ctx);
const { RamiGame, RamiExpertAI, partitionSelectedCards, MELD_TYPE } = ctx.__X;

/* ── سائق دور الخبير (نفس تسلسل _runBotTurn المتزامن) ──
   [Driver-Parity 2026-09-14] كان السائق يختلف عن البوت الحقيقي في 3 نقاط
   فتعلق ألعاب نادرة (1/12) بينما البوت الحقيقي ينهيها كلها:
   1) أول دور طالاج = WAITING_DISCARD بيد 15 (توزيع) → رمي فوراً
   2) خطتا chooseDraw المحفوظتان (_openPlanMove/_drawPlanIds) تُنفَّذان
   3) حارس الحصار الكامل: leftovers 1 أو ≥3 فقط (0 و2 ممنوعتان) + R15-FIX
   4) إدراج المسحوبة يستخدم canLayOff (يحترم حماية المجموعة الحرة) */
function expertTurn(game, player) {
  const rm = game.roundManager;
  /* طالاج: أول دور توزيع (يد 15) = مرحلة رمي مباشرة */
  if (rm.turnPhase === 'WAITING_DISCARD' && player.hand.length > game.rules.playHandSize - 1) {
    const dm0 = game.getLegalMoves(player.id).filter(m => m.type === 'discard');
    if (dm0.length) { game.executeMove(dm0[0]); return; }
  }
  if (rm.turnPhase === 'WAITING_DRAW') {
    let drawType = RamiExpertAI.chooseDraw(game, player, true);
    let res = game.executeMove({ type: drawType, playerId: player.id });
    if (!(res && (res.success || res.penaltyApplied))) {
      const alt = drawType === 'draw_deck' ? 'draw_deck' : 'draw_discard';
      res = game.executeMove({ type: alt, playerId: player.id });
      if (!(res && (res.success || res.penaltyApplied))) { rm.nextPlayer(); return; }
    }
  }
  if (game.gamePhase !== 'PLAYING') return;
  /* الافتتاح الخبير — خطة chooseDraw المحفوظة أولاً (PLAN-EXACT) */
  if (!player.hasOpened) {
    let open = null;
    if (player._openPlanMove) {
      const pm = player._openPlanMove; player._openPlanMove = null;
      if (pm.cardIds.every(id => player.hand.some(c => c.id === id))) open = pm;
    }
    if (!open) open = RamiExpertAI.expertOpening(game, player);
    if (open) game.executeMove(open);
    if (game.gamePhase !== 'PLAYING') return;
  }
  /* إنزال المجموعات المكتمّلة بعد الافتتاح — خطة الرسم أولاً ثم الحارس الكامل */
  if (player.hasOpened && rm.turnPhase !== 'WAITING_DRAW') {
    if (player._drawPlanIds && player._drawPlanIds.length) {
      const planIds = player._drawPlanIds.filter(id => player.hand.some(c => c.id === id));
      player._drawPlanIds = null;
      if (planIds.length >= 3) {
        const pr = game.executeMove({ type: 'open', playerId: player.id, cardIds: planIds });
        if (pr && pr.success && game.gamePhase !== 'PLAYING') return;
      }
    }
    const melds = partitionSelectedCards(player.hand.slice(), game.rules);
    if (melds && melds.length > 0) {
      let ids = melds.flatMap(m => m.cards.map(c => c.id));
      /* R15-FIX: يد كاملة القسمة → اقتطاع ورقة من مجموعة 4+ يترك ورقة الإنهاء */
      if (player.hand.length - ids.length === 0) {
        let dropId = null;
        for (const m of melds) {
          if (m.cards.length < 4) continue;
          if (m.type === MELD_TYPE.SET) { dropId = m.cards[m.cards.length - 1].id; break; }
          const ordSeq = (typeof ramiOrderSequenceCards === 'function')
            ? ramiOrderSequenceCards(m.cards.slice(), c => game.rules.isWildCard(c))
            : m.cards.slice();
          if (game.rules.isValidSequence(ordSeq.slice(0, -1), true)) { dropId = ordSeq[ordSeq.length - 1].id; break; }
          if (game.rules.isValidSequence(ordSeq.slice(1), true)) { dropId = ordSeq[0].id; break; }
        }
        if (dropId != null) ids = ids.filter(id => id !== dropId);
      }
      const leftovers = player.hand.length - ids.length;
      if (ids.length >= 3 && (leftovers === 1 || leftovers >= 3)) {
        game.executeMove({ type: 'open', playerId: player.id, cardIds: ids });
        if (game.gamePhase !== 'PLAYING') return;
      }
    }
  }
  /* الإدراج في طاولة الجميع (canLayOff: يطابق البوت الحقيقي) */
  if (player.hasOpened && rm.tableMelds.length > 0) {
    const botDrawn = player.drawnDiscardCard || player.drawnLaTourCard || null;
    const fitsMeld = (card) => {
      for (const meld of rm.tableMelds) {
        if (RamiExpertAI.canLayOff(game.rules, meld, card, botDrawn)) return meld;
      }
      return null;
    };
    /* إلزامي: المسحوبة المطابقة تُنزَّل فوراً */
    const drawnCard = player.drawnDiscardCard || player.drawnLaTourCard;
    if (drawnCard) {
      const meld = fitsMeld(drawnCard);
      if (meld) { player.removeCard(drawnCard.id); meld.cards.push(drawnCard); }
    }
    /* البقية فوق 3 فقط */
    for (const card of player.hand.slice()) {
      if (player.hand.length <= 3) break;
      const meld = fitsMeld(card);
      if (meld) { player.removeCard(card.id); meld.cards.push(card); }
    }
    /* إنقاذ من 3: ورقتان تدخلان الطاولة = فوز فوري */
    if (player.hand.length === 3) {
      const fitting = player.hand.filter(c => fitsMeld(c));
      if (fitting.length >= 2) {
        for (let fi = 0; fi < fitting.length && player.hand.length > 1; fi++) {
          const card = fitting[fi];
          const meld3 = fitsMeld(card);
          if (meld3) { player.removeCard(card.id); meld3.cards.push(card); }
        }
      }
    }
    /* إنقاذ من ورقتين: إدراج إحداهما ثم رمي الأخيرة = فوز */
    if (player.hand.length === 2) {
      for (let ci = 0; ci < 2 && player.hand.length === 2; ci++) {
        const card = player.hand[ci];
        if (!card) break;
        const meld = fitsMeld(card);
        if (meld) { player.removeCard(card.id); meld.cards.push(card); }
      }
    }
  }
  /* الإنهاء (السامبل: الإنهاء دون افتتاح مسموح) */
  if ((player.hasOpened || game.rules.mode !== 'talaj') && game.canFinish(player)) {
    const fr = game.executeMove({ type: 'finish', playerId: player.id });
    if (fr && (fr.success || fr.penaltyApplied)) return;
  }
  /* الرمي الخبير */
  const dm = game.getLegalMoves(player.id).filter(m => m.type === 'discard');
  if (dm.length > 0) {
    const id = RamiExpertAI.chooseDiscard(game, player);
    const mv = dm.find(m => m.cardId === id) || dm[0];
    const dr = game.executeMove(mv);
    /* رمي فشل + يد فوق الحد → ورقة قسرية (منع بقاء 15) */
    if (!(dr && (dr.success || dr.penaltyApplied)) && game.gamePhase === 'PLAYING' && player.hand.length > 0) {
      const maxHand = game.rules.playHandSize;
      if (player.hand.length > maxHand - 1 && rm.turnPhase === 'WAITING_DISCARD') {
        game.executeMove({ type: 'discard', playerId: player.id, cardId: player.hand[player.hand.length - 1].id });
      }
    }
  }
}

/* ── سائق الذكاء القديم (السلوك ما قبل التطوير: سحب تقريبي + رمي عشوائي) ── */
function oldTurn(game, player) {
  const rm = game.roundManager;
  if (rm.turnPhase === 'WAITING_DRAW') {
    let drawType = 'draw_deck';
    if (rm.discardPile.length > 0) {
      const top = rm.discardPile[rm.discardPile.length - 1];
      if (player.hasOpened && game.doesCardFitAnyTableMeld(top)) drawType = 'draw_discard';
      else if (!player.hasOpened) {
        const cand = partitionSelectedCards([...player.hand, top], game.rules);
        if (game.rules.validateOpening(cand, top, rm.jokerIndicator, rm.highestOpeningScore || 0, false).valid) drawType = 'draw_discard';
      }
    }
    let res = game.executeMove({ type: drawType, playerId: player.id });
    if (!(res && (res.success || res.penaltyApplied))) {
      const alt = drawType === 'draw_deck' ? 'draw_discard' : 'draw_deck';
      res = game.executeMove({ type: alt, playerId: player.id });
      if (!(res && (res.success || res.penaltyApplied))) { rm.nextPlayer(); return; }
    }
  }
  if (game.gamePhase !== 'PLAYING') return;
  const legal = game.getLegalMoves(player.id);
  const open = legal.find(m => m.type === 'open');
  if (open && !player.hasOpened) { game.executeMove(open); if (game.gamePhase !== 'PLAYING') return; }
  if (player.hasOpened && rm.tableMelds.length > 0) {
    for (const card of player.hand.slice()) {
      for (const meld of rm.tableMelds) {
        const temp = meld.cards.concat([card]);
        let can = false;
        if (meld.type === MELD_TYPE.SET && game.rules.isValidSet(temp, true)) can = true;
        if (meld.type === MELD_TYPE.SEQUENCE && game.rules.isValidSequence(temp, true)) can = true;
        if (can) { player.removeCard(card.id); meld.cards.push(card); break; }
      }
    }
  }
  if (player.hasOpened && game.canFinish(player)) {
    const fr = game.executeMove({ type: 'finish', playerId: player.id });
    if (fr && (fr.success || fr.penaltyApplied)) return;
  }
  const dm = game.getLegalMoves(player.id).filter(m => m.type === 'discard');
  if (dm.length > 0) game.executeMove(dm[Math.floor(Math.random() * dm.length)]);
}

function runGame(seed, driverFor) {
  const game = new RamiGame('talaj', driverFor.length, driverFor.length - 1, seed);
  game.startMatch();
  let turns = 0;
  while (game.gamePhase === 'PLAYING' && turns < 4000) {
    turns++;
    const p = game.roundManager.getCurrentPlayer();
    if (!p) break;
    driverFor[p.id](game, p);
    if (game.gamePhase === 'PLAYING' && game.roundManager.getCurrentPlayer().id === p.id) {
      /* لم يُمرَّر الدور (علِق) — تمرير قسري */
      game.roundManager.nextPlayer();
    }
  }
  return { game, turns };
}

/* ═══ 1) سلامة: 30 لعبة 4-بوت خبراء — صفر جزاءات وصفر انهيارات ═══ */
let crashes = 0, penalties = 0, unfinished = 0, turnSum = 0;
for (let i = 0; i < 12; i++) {
  try {
    const { game, turns } = runGame(1000 + i, [expertTurn, expertTurn, expertTurn, expertTurn]);
    if (game.gamePhase === 'PLAYING') unfinished++;
    turnSum += turns;
    for (const p of game.players) {
      const pen = (p.penaltyReasons || []).length;
      if (pen > 0) { penalties += pen; console.log('  penalty@seed' + (1000 + i), p.name, JSON.stringify(p.penaltyReasons.map(r => r.rule))); }
    }
  } catch (e) { crashes++; console.log('  CRASH@seed' + (1000 + i), e.message); }
}
console.log('[1] SAFETY 12x4bots: crashes=' + crashes + ' penalties=' + penalties + ' unfinished=' + unfinished + ' avgTurns=' + (turnSum / 12).toFixed(1));

/* ═══ 2) هيمنة: خبير(المقعد 0) ضد قديم(المقعد 1) — 100 لعبة ═══ */
let exWins = 0, oldWins = 0, ties = 0;
for (let i = 0; i < 60; i++) {
  const { game } = runGame(50000 + i, [expertTurn, oldTurn]);
  const w = game.roundManager.lastWinner;
  if (!w) ties++; else if (w.id === 0) exWins++; else oldWins++;
  if (game.gamePhase === 'PLAYING') console.log('  STALL@seed', 50000 + i);
}
console.log('[2] EXPERT vs OLD (60 games): expert=' + exWins + ' old=' + oldWins + ' ties=' + ties);

/* ═══ 3) الخبير ضد الخبير: ألعاب تنتهي دائماً وبعدد أدوار معقول ═══ */
let sum2 = 0, bad2 = 0;
for (let i = 0; i < 12; i++) {
  const { game, turns } = runGame(90000 + i, [expertTurn, expertTurn]);
  if (game.gamePhase === 'PLAYING') bad2++;
  sum2 += turns;
}
console.log('[3] EXPERT vs EXPERT (12 games): unfinished=' + bad2 + ' avgTurns=' + (sum2 / 12).toFixed(1));

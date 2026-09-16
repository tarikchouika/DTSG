/* اختبار حتمية المحرك للمزامنة الجماعية:
   نفس البذرة + نفس تسلسل الحركات ⇒ حالة مطابقة تماماً على «جهازين». */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/js/games/rami.js', 'utf8');
const engine = src.split('class RamiUIAdapter')[0]; /* المحرك فقط (بلا UI/DOM) */

const sandbox = {};
const fn = new Function('window', 'document', 'console', engine +
  '\n;return {RamiGame, RamiRules, MELD_TYPE, partitionSelectedCards, mulberry32, DeterministicRng};');
const E = fn(undefined, undefined, console);

const { RamiGame } = E;

/* تحويل لعبة كاملة على A عبر اختيار أول حركة قانونية لكل لاعب، وجمع الحركات */
function playFull(game, maxTurns) {
  const moves = [];
  let safety = maxTurns || 600;
  while (game.gamePhase === 'PLAYING' && safety-- > 0) {
    const cur = game.roundManager.getCurrentPlayer();
    game.normalizeTurnPhase();
    let legal = game.getLegalMoves(cur.id);
    if (!legal.length) { game.roundManager.nextPlayer(); continue; }
    /* ميّل نحو السحب/الرمي/الافتتاح/الإنهاء بالترتيب الواقعي */
    let pick;
    const open = legal.find(m => m.type === 'open');
    const finish = legal.find(m => m.type === 'finish');
    if (finish && Math.random() < 0.5) pick = finish;
    else if (open) pick = open;
    else {
      const draws = legal.filter(m => m.type === 'draw_deck' || m.type === 'draw_discard');
      pick = draws.length ? draws[Math.floor(Math.random()*draws.length)] : legal[0];
    }
    const res = game.executeMove(pick);
    moves.push({ move: pick, ok: !!(res && res.success), ended: !!(res && res.finished), penalty: !!(res && res.penaltyApplied) });
    if (game.gamePhase !== 'PLAYING') break;
  }
  return moves;
}

/* لقطة حالة موجزة للمقارنة */
function snapshot(game) {
  const rm = game.roundManager;
  return {
    phase: game.gamePhase,
    cur: rm.currentPlayerIndex,
    turnPhase: rm.turnPhase,
    drawLen: rm.drawPile.length,
    discardLen: rm.discardPile.length,
    discardTop: rm.discardPile.length ? rm.discardPile[rm.discardPile.length-1].id : null,
    tableMelds: rm.tableMelds.length,
    tableMeldCards: rm.tableMelds.reduce((s,m)=>s+m.cards.length,0),
    players: game.players.map(p => ({
      hand: p.hand.map(c=>c.id).join(','),
      melds: p.melds.map(m=>m.cards.map(c=>c.id).join('+')).join('|'),
      opened: p.hasOpened,
      total: p.totalScore,
      pen: p.penaltyScore
    })),
    deckIntegrity: (function(){ const ids=new Set(),dup=[]; const all=[].concat(rm.drawPile,rm.discardPile); if(rm.jokerIndicator)all.push(rm.jokerIndicator); for(const p of game.players){all.push(...p.hand); for(const m of p.melds)all.push(...m.cards);} for(const c of all){if(ids.has(c.id))dup.push(c.id);ids.add(c.id);} return dup.length?('DUP:'+dup.join(',')):'ok'; })()
  };
}

const MODES = ['talaj', 'simple'];
const SEEDS = [12345, 999, 4294967295, 7, 8675309];
let allPass = true;

for (const mode of MODES) {
  for (const seed of SEEDS) {
    const A = new RamiGame(mode, 4, 0, seed, 90);
    A.startMatch(999999); /* شوط واحد (لا إقصاء مبكر) */
    const moves = playFull(A, 800);
    const snapA = snapshot(A);

    /* الجهاز B: نفس البذرة، يطبّق نفس الحركات بالترتيب ذاته */
    const B = new RamiGame(mode, 4, 0, seed, 90);
    B.startMatch(999999);
    for (const mr of moves) {
      B.normalizeTurnPhase();
      B.executeMove(mr.move);
      if (B.gamePhase !== 'PLAYING') break;
    }
    const snapB = snapshot(B);

    const a = JSON.stringify(snapA), b = JSON.stringify(snapB);
    const ok = (a === b);
    if (!ok) allPass = false;
    console.log((ok?'✅':'❌') + ' mode=' + mode + ' seed=' + seed +
      ' turns=' + moves.length + ' phase=' + snapA.phase +
      ' melds=' + snapA.tableMelds + '/' + snapA.tableMeldCards +
      ' integrity=' + snapA.deckIntegrity);
    if (!ok) {
      console.log('  A: ' + a.slice(0, 400));
      console.log('  B: ' + b.slice(0, 400));
    }
  }
}
console.log(allPass ? '\n✅✅✅ حتمية المحرك مؤكدة عبر كل البذور والأوضاع' : '\n❌ فشل الحتمية — راجع الاختلافات أعلاه');
process.exit(allPass ? 0 : 1);

/**
 * tests/_rami_persistence_and_freeze_test.js
 * Verification of Rami melds persistence upon reload/resume & bot freeze recovery.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

console.log('═══ Starting Rami Persistence & Freeze Recovery Test Suite ═══\n');

const code = fs.readFileSync(path.join(__dirname, '../js/games/rami.js'), 'utf8');

const timeouts = [];
const makeElem = () => ({
  style: { setProperty: () => {} },
  setAttribute: () => {},
  appendChild: () => {},
  remove: () => {},
  querySelector: () => ({ textContent: '' }),
  querySelectorAll: () => [],
  classList: { add: () => {}, remove: () => {} },
  clientHeight: 100,
  innerHTML: ''
});

const fakeDoc = {
  getElementById: (id) => makeElem(),
  querySelector: () => makeElem(),
  querySelectorAll: () => [],
  createElement: () => makeElem(),
  body: makeElem(),
  addEventListener: () => {}
};

let storage = {};
const fakeLocalStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};

const ctx = {
  console: { log: () => {}, warn: () => {}, error: () => {} },
  Date, Math, JSON, Set, Map, Array, Object, Number, String,
  setTimeout: (fn, ms) => {
    timeouts.push({ fn, ms });
    return timeouts.length;
  },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  window: {},
  document: fakeDoc,
  localStorage: fakeLocalStorage
};
ctx.window.document = fakeDoc;
ctx.window.localStorage = fakeLocalStorage;
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__X = { RamiGame, RamiUIAdapter, RamiCard, RamiMeld, ramiSerializeGame, ramiDeserializeGame, partitionSelectedCards };', ctx);
const { RamiGame, RamiUIAdapter, RamiCard, RamiMeld, ramiSerializeGame, ramiDeserializeGame } = ctx.__X;

// ── 1. Test Melds Preservation on Reload ──
console.log('── 1) Testing Melds Preservation on Reload ──');
const game = new RamiGame('simple', 4, 3, 42, 90);
game.startMatch(501);

const twoDiamond = new RamiCard(200, 2, 'diamond');
game.roundManager.jokerIndicator = twoDiamond;
game.roundManager.jokerIndicatorInfo = { id: 'IND-2-diamond', rank: 2, suit: 'diamond', isJoker: false };
game.rules.jokerIndicator = game.roundManager.jokerIndicatorInfo;
game.roundManager.turnCount = 3;
game.roundManager.isFirstTourCycle = true;

const human = game.players[0];
const meld1 = new RamiMeld('sequence', [new RamiCard(1, 4, 'heart'), new RamiCard(2, 5, 'heart'), new RamiCard(3, 6, 'heart')]);
const meld2 = new RamiMeld('sequence', [new RamiCard(4, 7, 'spade'), new RamiCard(5, 8, 'spade'), new RamiCard(6, 9, 'spade')]);
const meld3 = new RamiMeld('set', [new RamiCard(7, 10, 'club'), new RamiCard(8, 10, 'diamond'), new RamiCard(9, 10, 'spade')]);
const meld4 = new RamiMeld('set', [new RamiCard(10, 12, 'heart'), new RamiCard(11, 12, 'club'), new RamiCard(12, 12, 'diamond'), new RamiCard(13, 12, 'spade')]);
const jackClub = new RamiCard(14, 11, 'club');
const threeSpade = new RamiCard(15, 3, 'spade');

human.hand = [...meld1.cards, ...meld2.cards, ...meld3.cards, ...meld4.cards, jackClub, threeSpade];
game.roundManager.currentPlayerIndex = 0;
game.roundManager.turnPhase = 'WAITING_DISCARD';

const adapter = new RamiUIAdapter();
adapter.game = game;
ctx.window.RAMI_STATE = game;
ctx.window.RamiAdapter = adapter;

// Open melds and discard
game.executeMove({
  type: 'open',
  playerId: 0,
  cardIds: [...meld1.cards, ...meld2.cards, ...meld3.cards, ...meld4.cards].map(c => c.id)
});
game.executeMove({ type: 'discard', playerId: 0, cardId: threeSpade.id });

adapter._updateHand();
assert.strictEqual(human.melds.length, 4, 'Human should have 4 melds');
assert.strictEqual(human.hand.length, 1, 'Human hand should have 1 card (J♣)');

// Save game state
ramiSerializeGame(game);
assert(storage['rc_rami_active_round'], 'Active round should be saved in localStorage');

// Deserialize game state (simulating page reload)
const restored = ramiDeserializeGame();
assert(restored, 'Game must deserialize cleanly');
assert.strictEqual(restored.rules.jokerIndicator.id, 'IND-2-diamond', 'Joker indicator info must be restored on rules');
assert.strictEqual(restored.roundManager.turnCount, 4, 'turnCount must be preserved');
assert(restored._savedHandSlots, '_savedHandSlots must be restored from localStorage');
assert.strictEqual(restored._savedHandSlots.length, 5, 'Must have 5 slots saved');

// Create new adapter and simulate UI reload
const reloadedAdapter = new RamiUIAdapter();
reloadedAdapter.game = restored;
ctx.window.RAMI_STATE = restored;
ctx.window.RamiAdapter = reloadedAdapter;

if (restored._savedHandSlots && restored._savedHandSlots.length === 5) {
  reloadedAdapter.handSlots = restored._savedHandSlots;
}
reloadedAdapter._updateHand();

// Total cards in slots must equal melded cards + remaining hand cards
const totalCardsInSlots = reloadedAdapter.handSlots.reduce((acc, s) => acc + s.length, 0);
assert.strictEqual(totalCardsInSlots, 14, 'Slots must contain all 13 melded cards + 1 hand card');
console.log('  ✅ Melds and unmelded cards preserved across serialization and reload (14 cards total)');

// ── 2. Cold Reload Slot Rebuilding ──
console.log('── 2) Testing Cold Reload Reconstruction (when saved slots missing) ──');
const coldAdapter = new RamiUIAdapter();
coldAdapter.game = restored;
coldAdapter.handSlots = [[], [], [], [], []];
coldAdapter._updateHand();
const coldTotalCards = coldAdapter.handSlots.reduce((acc, s) => acc + s.length, 0);
assert.strictEqual(coldTotalCards, 14, 'Cold adapter must reconstruct slots from player.melds + player.hand');
console.log('  ✅ Cold rebuild correctly populates slots from player.melds + player.hand');

// ── 3. Bot Turn Progress & Non-Stall Guarantee ──
console.log('── 3) Testing Bot Turn Progress & Fallback Advance ──');
const curP = restored.roundManager.getCurrentPlayer();
assert(curP.isBot, 'Current player after human discard must be a bot');
const initialBotId = curP.id;

timeouts.length = 0;
reloadedAdapter._runBotTurn(curP);
while (timeouts.length > 0) {
  const step = timeouts.shift();
  step.fn();
}

const nextP = restored.roundManager.getCurrentPlayer();
assert.notStrictEqual(nextP.id, initialBotId, 'Bot turn must advance to next player and not remain stuck on initial bot');
console.log('  ✅ Bot turn cleanly advances to next player without infinite 90s reset loop');

// ── 4. Bot Error Recovery ──
console.log('── 4) Testing Bot Error Recovery ──');
restored.roundManager.currentPlayerIndex = 1; // Set turn to Bot 1
const errorBot = restored.roundManager.getCurrentPlayer();
assert(errorBot.isBot, 'Must be a bot');
const botIdBeforeError = errorBot.id;

// Simulate an unhandled error inside step execution
timeouts.length = 0;
reloadedAdapter._deferBotStep(errorBot, () => {
  throw new Error('Simulated runtime error in bot step');
}, 100);

while (timeouts.length > 0) {
  const step = timeouts.shift();
  step.fn();
}

const afterErrorPlayer = restored.roundManager.getCurrentPlayer();
assert.notStrictEqual(afterErrorPlayer.id, botIdBeforeError, 'Error recovery must advance to next player');
console.log('  ✅ Unhandled bot step error triggers fallback nextPlayer() without freezing');

// ── 5. Stuck RAMI_BUSY Flag at 90s Timeout ──
console.log('── 5) Testing Stuck RAMI_BUSY at 90s Timeout ──');
// Force RAMI_BUSY to true
vm.runInContext('setRamiBusy(true);', ctx);
const isBusyBefore = vm.runInContext('checkRamiBusy();', ctx);
assert.strictEqual(isBusyBefore, true, 'RAMI_BUSY was forced to true');

// Current player before timeout
const timeoutPlayerBefore = restored.roundManager.getCurrentPlayer();
const timeoutPlayerIdBefore = timeoutPlayerBefore.id;

// Trigger turn timeout (should clear busy, execute auto-play, and advance turn)
reloadedAdapter._handleTurnTimeout();

const timeoutPlayerAfter = restored.roundManager.getCurrentPlayer();
assert.notStrictEqual(timeoutPlayerAfter.id, timeoutPlayerIdBefore, 'Timeout must advance turn even if RAMI_BUSY was stuck true');

// Drain any scheduled bot steps
while (timeouts.length > 0) {
  timeouts.shift().fn();
}
const isBusyAfter = vm.runInContext('checkRamiBusy();', ctx);
assert.strictEqual(isBusyAfter, false, 'RAMI_BUSY must be cleared once turn completes');
console.log('  ✅ Stuck RAMI_BUSY does not block 90s timeout; lock is cleared and turn advances');

// ── 6. Fallback Advance When Discard Fails in _doAutoPlay ──
console.log('── 6) Testing Fallback Advance in _doAutoPlay When Discard Fails ──');
const curBeforeFail = restored.roundManager.getCurrentPlayer();
const idBeforeFail = curBeforeFail.id;

// Force executeMove to return failure for discard to simulate unplayable card / state desync
const origExecute = restored.executeMove;
restored.executeMove = function(move) {
  if (move.type === 'discard') return { success: false, error: 'Simulated discard failure' };
  return origExecute.call(this, move);
};

reloadedAdapter._doAutoPlay(curBeforeFail, restored.roundManager, false);
restored.executeMove = origExecute;

const curAfterFail = restored.roundManager.getCurrentPlayer();
assert.notStrictEqual(curAfterFail.id, idBeforeFail, 'Turn must advance via fallback nextPlayer() even if discard fails');
console.log('  ✅ Even if discard fails, _doAutoPlay forcefully advances rm.nextPlayer() preventing freeze loop');

// ── 7. Graceful Handling of Draw/Deck Exhaustion (Winner = null) ──
console.log('── 7) Testing Round End with Null Winner (Stalemate / Exhaustion) ──');
assert.doesNotThrow(() => {
  restored.gamePhase = 'PLAYING';
  restored._endRound(null);
}, 'Ending round with null winner must not throw TypeError');
assert.strictEqual(restored.gamePhase, 'ROUND_END', 'Round phase must transition to ROUND_END');
console.log('  ✅ Stalemate / null winner safely handled without crashing');

// ── 8. Continuous Play Simulation (Human Timeouts & Bot Transitions) ──
console.log('── 8) Testing Continuous Game Cycles (Human Timeouts & Bot Transitions) ──');
const stressGame = new RamiGame('simple', 4, 3, 12345, 90);
stressGame.startMatch(501);
const stressAdapter = new RamiUIAdapter();
stressAdapter.game = stressGame;
ctx.window.RAMI_STATE = stressGame;
ctx.window.RamiAdapter = stressAdapter;

const rm = stressGame.roundManager;
let humanTimeouts = 0;
let botTurns = 0;

for (let cycle = 0; cycle < 30; cycle++) {
  if (stressGame.gamePhase === 'ROUND_END' || stressGame.gamePhase === 'MATCH_END') break;
  const curP = rm.getCurrentPlayer();
  if (curP.isBot) {
    botTurns++;
    stressAdapter._runBotTurn(curP);
  } else {
    humanTimeouts++;
    stressAdapter._handleTurnTimeout();
  }
  while (timeouts.length > 0) {
    timeouts.shift().fn();
  }
}

assert.ok(rm.turnCount >= 20, 'Must successfully execute 20+ turn transitions across all players without freeze');
console.log(`  ✅ Continuous play verified: executed ${rm.turnCount} turns smoothly (${humanTimeouts} human timeouts, ${botTurns} bot turns, 0 deadlocks)`);

// ── 9. Stale Callback / Re-entry Guard ──
console.log('── 9) Testing stale bot callbacks after turn change and re-entry ──');
const guardGame = new RamiGame('simple', 4, 3, 777, 90);
guardGame.startMatch(501);
guardGame.roundManager.currentPlayerIndex = 1; // bot 1
guardGame.roundManager.turnPhase = 'WAITING_DRAW';
guardGame.roundManager._turnStartedAt = Date.now();
const guardAdapter = new RamiUIAdapter();
guardAdapter.game = guardGame;
const guardBot = guardGame.roundManager.getCurrentPlayer();
let staleRan = false;
const staleStep = guardAdapter._deferBotStep(guardBot, () => { staleRan = true; }, 500);
// The turn changes before the browser callback fires.
guardGame.roundManager.currentPlayerIndex = 0;
guardAdapter._botTurnEpoch++;
staleStep.run();
assert.strictEqual(staleRan, false, 'A callback from the previous turn must be ignored');
assert.strictEqual(guardAdapter._botStep, null, 'Stale callback must not remain registered');

// A visibility/tick retry must not schedule a second step for the same turn.
guardGame.roundManager.currentPlayerIndex = 1;
guardGame.roundManager._turnStartedAt = Date.now();
guardAdapter._botTurnEpoch++;
timeouts.length = 0;
guardAdapter._runBotTurn(guardBot);
const scheduledStep = guardAdapter._botStep;
const scheduledCount = timeouts.length;
guardAdapter._runBotTurn(guardBot);
assert.strictEqual(guardAdapter._botStep, scheduledStep, 'Repeated wake-up must keep the current step');
assert.strictEqual(timeouts.length, scheduledCount, 'Repeated wake-up must not duplicate timers');
while (timeouts.length > 0) timeouts.shift().fn();
console.log('  ✅ Old turn callbacks are ignored and background wake-up is idempotent');

// A pathological duplicate-heavy hand used to make expert discard search block
// the UI immediately after the draw. The bounded decision must still discard.
console.log('── 10) Testing draw → discard with a duplicate-heavy bot hand ──');
const heavyGame = new RamiGame('simple', 4, 3, 778, 90);
heavyGame.startMatch(501);
const heavyBot = heavyGame.players[1];
heavyBot.hand = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]
  .map((rank, i) => new RamiCard(2000 + i, rank, 'heart'));
heavyGame.roundManager.currentPlayerIndex = 1;
heavyGame.roundManager.turnPhase = 'WAITING_DRAW';
heavyGame.roundManager._turnStartedAt = Date.now();
const heavyAdapter = new RamiUIAdapter();
heavyAdapter.game = heavyGame;
heavyAdapter._updateUI = () => {};
heavyAdapter._botEmit = () => {};
timeouts.length = 0;
heavyAdapter._runBotTurn(heavyBot);
while (timeouts.length > 0) timeouts.shift().fn();
assert(heavyGame.roundManager.discardPile.length > 0, 'Bot must discard after drawing from a hard hand');
assert.notStrictEqual(heavyGame.roundManager.getCurrentPlayer().id, heavyBot.id, 'Draw-heavy bot turn must advance');
console.log('  ✅ Duplicate-heavy hand completes draw → discard without stalling');

console.log('\n═══ ALL RAMI PERSISTENCE & FREEZE TESTS PASSED (100%) ═══');

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
const fakeDoc = {
  getElementById: (id) => ({
    id,
    innerHTML: '',
    style: { setProperty: () => {} },
    clientHeight: 100,
    classList: { add: () => {}, remove: () => {} },
    querySelectorAll: () => []
  }),
  querySelectorAll: () => [],
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

console.log('\n═══ ALL RAMI PERSISTENCE & FREEZE TESTS PASSED (100%) ═══');

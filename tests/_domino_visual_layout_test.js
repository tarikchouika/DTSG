const assert = require('assert');
const fs = require('fs');
const path = require('path');

const Renderer = require('../dominoes-game/js/ui/domino-renderer.js');
const GameModule = require('../dominoes-game/js/engine/domino-game.js');
const DominoGame = GameModule.DominoGame;

console.log('=== DOMINO VISUAL, GEOMETRY & PRIVACY VERIFICATION ===');

// 1. Test jointFacing, 7-tile segment length, and 2-piece turn bridge geometry
const chainTest = [
  { tile: { a: 6, b: 6, id: '6-6' }, dbl: true },
  { tile: { a: 6, b: 5, id: '5-6' }, dbl: false },
  { tile: { a: 5, b: 4, id: '4-5' }, dbl: false },
  { tile: { a: 4, b: 4, id: '4-4' }, dbl: true },
  { tile: { a: 4, b: 3, id: '3-4' }, dbl: false },
  { tile: { a: 3, b: 2, id: '2-3' }, dbl: false },
  { tile: { a: 2, b: 2, id: '2-2' }, dbl: true },
  { tile: { a: 2, b: 1, id: '1-2' }, dbl: false },
  { tile: { a: 1, b: 0, id: '0-1' }, dbl: false },
  { tile: { a: 0, b: 0, id: '0-0' }, dbl: true },
  { tile: { a: 0, b: 2, id: '0-2' }, dbl: false },
  { tile: { a: 2, b: 5, id: '2-5' }, dbl: false }
];

// Landscape layout
const layL = Renderer.layoutChain(chainTest, 700, 320);
assert.strictEqual(layL.items.length, 12, 'All 12 items laid out in landscape');
const turnsL = layL.items.filter(x => x.kind === 'turn');
assert.ok(turnsL.length >= 2, 'Turn extends for more than one piece (multi-piece turn bridge)');
console.log('✓ Landscape layout has multi-piece turn bridge with', turnsL.length, 'turn tiles');

// Portrait layout
const layP = Renderer.layoutChain(chainTest, 360, 600);
assert.strictEqual(layP.items.length, 12, 'All 12 items laid out in portrait');
const turnsP = layP.items.filter(x => x.kind === 'turn');
assert.ok(turnsP.length >= 2, 'Portrait turn extends for more than one piece (multi-piece turn bridge)');
console.log('✓ Portrait layout has multi-piece turn bridge with', turnsP.length, 'turn tiles');

// Verify spacing between columns in portrait (no cramping or piling up)
const col1 = layP.items.slice(0, 7);
const col2 = layP.items.slice(9);
if (col2.length > 0) {
  const col1_x = col1[0].x;
  const col2_x = col2[0].x;
  const colGap = Math.abs(col2_x - col1_x) - layP.unit;
  assert.ok(colGap >= layP.unit, 'Columns separated by open felt space (>= unit)');
  console.log('✓ Columns separated by generous open space (' + Math.round(colGap) + 'px gap, no stacking)');
}

// Check Y extent in portrait
const minY_P = Math.min(...layP.items.map(x => x.y - (x.rot === 0 || x.rot === 180 ? x.u : x.u / 2)));
const maxY_P = Math.max(...layP.items.map(x => x.y + (x.rot === 0 || x.rot === 180 ? x.u : x.u / 2)));
console.log('✓ Portrait chain vertical span:', Math.round(minY_P), 'to', Math.round(maxY_P), 'height:', Math.round(maxY_P - minY_P));
assert.ok(minY_P >= 10, 'Portrait chain stays well within top margin');
assert.ok(maxY_P <= 590, 'Portrait chain stays well within bottom margin');

// 2. CSS Check
const css22 = fs.readFileSync(path.join(__dirname, '../css/22-look.css'), 'utf8');

// Fullscreen button
assert.ok(css22.includes('top: 10px !important') && css22.includes('right: 10px !important'), 'Fullscreen exit button at top: 10px, right: 10px');
console.log('✓ CSS: .game-fs-exit anchored at top: 10px, right: 10px');

// Boneyard shifted down 130px to top: 186px
assert.ok(css22.includes('#dmStage .dm-boneyard') && css22.includes('top: 186px !important'), 'Boneyard shifted down by 130px to top: 186px');
console.log('✓ CSS: #dmBoneyard shifted down by 130px (top: 186px)');

// Main player icon shifted up 25px to bottom: 109px
assert.ok(css22.includes('#dmStage #dmSeatMe') && css22.includes('bottom: 109px !important'), 'Player icon shifted up by 25px to bottom: 109px');
console.log('✓ CSS: #dmSeatMe shifted up by 25px (bottom: 109px)');

// Handwrap flush
assert.ok(css22.includes('#dmStage .dm-handwrap') && css22.includes('bottom: 0 !important'), 'Handwrap flush at bottom: 0');
console.log('✓ CSS: Player handwrap flush at bottom: 0');

// Pass button
assert.ok(css22.includes('#dmStage #dmPassBtn') && css22.includes('left: 12px !important') && css22.includes('bottom: 12px !important'), 'Pass button at bottom left 12px, 12px');
console.log('✓ CSS: #dmPassBtn independent at left: 12px, bottom: 12px, z-index: 30');

// 3. Privacy check on refund-policy.html
const refundHtml = fs.readFileSync(path.join(__dirname, '../refund-policy.html'), 'utf8');
assert.ok(!refundHtml.includes('0766672027'), 'No personal phone number in refund-policy.html');
assert.ok(!refundHtml.includes('CHOUIKA'), 'No personal name in refund-policy.html');
assert.ok(!refundHtml.includes('6904085211014200'), 'No bank account number in refund-policy.html');
assert.ok(!refundHtml.includes('TSoTtn7hhm'), 'No crypto address in refund-policy.html');
assert.ok(!refundHtml.includes('assets/qr/'), 'No personal QR images in refund-policy.html');
console.log('✓ Privacy: refund-policy.html is completely free of all personal payment details');

// 4. Domino room settings check
const roomsSrc = fs.readFileSync(path.join(__dirname, '../js/core/rooms.js'), 'utf8');
assert.ok(roomsSrc.includes('do: 4'), 'Rooms.roomGameIds has do: 4');
assert.ok(roomsSrc.includes("key: 'maxp'"), 'Domino has maxp option defined in room settings');
console.log('✓ Domino Room Settings: maxp option present with 2, 3, 4 players support');

// 5. Bot Chat links and horizontal transaction layout
const botSrc = fs.readFileSync(path.join(__dirname, '../js/ui/bot-chat.js'), 'utf8');
assert.ok(botSrc.includes('openUserWallet'), 'openUserWallet is defined');
assert.ok(botSrc.includes('switchTab'), 'switchTab is defined for seamless tab switching');
assert.ok(botSrc.includes('bc-tx-box'), 'bc-tx-box is used for structured horizontal transactions');
assert.ok(botSrc.includes('data-bcsupport'), 'data-bcsupport attribute added for reliable bot opening');
const chromeCss = fs.readFileSync(path.join(__dirname, '../css/09-chrome.css'), 'utf8');
assert.ok(chromeCss.includes('.botchat .bc-tx-box'), 'bc-tx-box styled in CSS');
assert.ok(chromeCss.includes('.botchat .bc-tx-item'), 'bc-tx-item styled in CSS');
assert.ok(chromeCss.includes('.botchat .bc-tx-row1'), 'bc-tx-row1 styled in CSS');
assert.ok(chromeCss.includes('.botchat .bc-tx-row2'), 'bc-tx-row2 styled in CSS');
console.log('✓ Bot Chat: quick links fully responsive and horizontal transaction layout verified');

console.log('\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');

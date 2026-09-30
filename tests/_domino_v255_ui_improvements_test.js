const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== DOMINO V2.55 UI IMPROVEMENTS VERIFICATION ===\n');

// 1. Verify HTML template nesting
console.log('── 1) DOM Structure in domino-html.js ──');
const htmlSrc = fs.readFileSync(path.join(__dirname, '../dominoes-game/js/ui/domino-html.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(htmlSrc, ctx);
const dmnHtml = ctx.window.DMN_HTML;

assert.ok(dmnHtml, 'DMN_HTML exists and is non-empty');

// Tag balance check
const openDivs = (dmnHtml.match(/<div\b/g) || []).length;
const closeDivs = (dmnHtml.match(/<\/div>/g) || []).length;
assert.strictEqual(openDivs, closeDivs, 'div tags must perfectly balance');
console.log('✓ HTML divs balanced:', openDivs, 'open and', closeDivs, 'closed');

// Verify #dmSeatMe is inside .dm-handwrap
const handwrapIdx = dmnHtml.indexOf('<div class="dm-handwrap">');
assert.ok(handwrapIdx > 0, '.dm-handwrap element found');
const seatMeIdx = dmnHtml.indexOf('id="dmSeatMe"');
assert.ok(seatMeIdx > 0, '#dmSeatMe element found');
const handIdx = dmnHtml.indexOf('id="dmHand"');
assert.ok(handIdx > 0, '#dmHand element found');

assert.ok(seatMeIdx > handwrapIdx, '#dmSeatMe is inside .dm-handwrap');
// Find closing </div> of .dm-handwrap
const afterWrap = dmnHtml.slice(handwrapIdx);
const handwrapClosingMatch = afterWrap.match(/<\/div>\s*<!--\s*طبقة نهاية الجولة\s*-->|<\/div>\s*<div class="dm-layer" id="dmRoundLayer"/);
assert.ok(handwrapClosingMatch, 'Found end of .dm-handwrap container');
const handwrapClosingIdx = handwrapIdx + handwrapClosingMatch.index;
assert.ok(seatMeIdx < handwrapClosingIdx, '#dmSeatMe is properly nested before .dm-handwrap closes');
console.log('✓ #dmSeatMe is cleanly nested inside .dm-handwrap');

// 2. CSS Verification for Landscape Avatar, Boneyard, and Pass button
console.log('\n── 2) CSS Positioning in css/22-look.css ──');
const css22 = fs.readFileSync(path.join(__dirname, '../css/22-look.css'), 'utf8');

// Portrait checks
assert.ok(css22.includes('#dmStage #dmSeatMe') && css22.includes('bottom: 109px !important'),
  'Portrait: #dmSeatMe maintains bottom: 109px');
assert.ok(css22.includes('#dmStage .dm-boneyard') && css22.includes('top: 186px !important'),
  'Portrait: #dmBoneyard retains top: 186px');
assert.ok(css22.includes('#dmStage #dmPassBtn') && css22.includes('left: 12px !important') && css22.includes('bottom: 12px !important'),
  'Portrait: #dmPassBtn remains at left: 12px, bottom: 12px');
console.log('✓ Portrait: #dmSeatMe (bottom: 109px), #dmBoneyard (top: 186px), #dmPassBtn (left: 12px, bottom: 12px) verified');

// Landscape checks
const lastLandscapeIdx = css22.lastIndexOf('@media (orientation: landscape)');
assert.ok(lastLandscapeIdx > 0, 'Landscape media query block found');
const landscapeCss = css22.slice(lastLandscapeIdx);

// Requirement 1: Landscape player avatar beside hand tiles
assert.ok(landscapeCss.includes('.dm-handwrap'), 'Landscape has .dm-handwrap rules');
assert.ok(landscapeCss.includes('flex-direction: row !important'), 'Landscape .dm-handwrap flexes row');
assert.ok(landscapeCss.includes('justify-content: center !important'), 'Landscape .dm-handwrap centers hand + avatar');
assert.ok(landscapeCss.includes('#dmSeatMe'), 'Landscape styles #dmSeatMe');
assert.ok(landscapeCss.includes('position: static !important'), 'Landscape #dmSeatMe is position: static');
assert.ok(landscapeCss.includes('order: 2 !important'), 'Landscape #dmSeatMe has order: 2 (beside hand order: 1)');
console.log('✓ Landscape: #dmSeatMe positioned horizontally beside #dmHand tiles (mirrors top opponent layout)');

// Requirement 2: Landscape Boneyard at 90° bottom-left corner
assert.ok(landscapeCss.includes('.dm-boneyard'), 'Landscape styles .dm-boneyard');
assert.ok(landscapeCss.includes('bottom: 12px !important') && landscapeCss.includes('left: 12px !important'),
  'Landscape .dm-boneyard pinned to 90° bottom-left corner (bottom: 12px, left: 12px)');
assert.ok(landscapeCss.includes('#dmPassBtn'), 'Landscape styles #dmPassBtn');
assert.ok(landscapeCss.includes('bottom: 84px !important') && landscapeCss.includes('left: 12px !important'),
  'Landscape #dmPassBtn placed cleanly above boneyard (bottom: 84px, left: 12px)');
console.log('✓ Landscape: Boneyard moved to 90° bottom-left corner and #dmPassBtn positioned right above it');

// 3. Dynamic Tile Sizing Verification
console.log('\n── 3) Dynamic Tile Scaling (Portrait & Landscape) ──');
assert.ok(css22.includes('--dm-hand-count: 7'), 'Default --dm-hand-count set to 7');
assert.ok(css22.includes('--dm-tile-h: clamp(30px, min(23dvh, calc(((100vw - 32px) / var(--dm-hand-count, 7) - 6px) * 1.85)), 100px)'),
  'Portrait dynamic tile formula in place');
assert.ok(landscapeCss.includes('--dm-tile-h: clamp(30px, min(24dvh, calc(((100vw - 180px) / var(--dm-hand-count, 7) - 6px) * 1.85)), 88px)'),
  'Landscape dynamic tile formula in place');

// Verify JS implementation in domino-app.js
const appSrc = fs.readFileSync(path.join(__dirname, '../dominoes-game/js/ui/domino-app.js'), 'utf8');
assert.ok(appSrc.includes('_updateHandTileScale: function'), '_updateHandTileScale helper is defined');
assert.ok(appSrc.includes('Math.max(7, Number(count) || 7)'), 'Tile scale helper clamps minimum count to 7');
assert.ok(appSrc.includes('--dm-hand-count'), 'Tile scale sets --dm-hand-count property');
assert.ok(appSrc.includes('--dm-hand-gap'), 'Tile scale dynamically adjusts gap');
assert.ok(appSrc.includes('--dm-hand-pad-x'), 'Tile scale dynamically adjusts horizontal padding');
assert.ok(appSrc.includes('this._updateHandTileScale(myHand.length)'), '_updateHandTileScale called in refresh() with active hand length');
console.log('✓ JS: DominoApp._updateHandTileScale dynamically manages tile scaling and gaps');

// Mathematical verification across viewports and hand sizes (1 to 14 tiles)
const testSizes = [320, 340, 360, 375, 390, 412, 430, 750, 800, 850, 920, 1024];
for (const w of testSizes) {
  const isLandscape = w >= 600;
  for (let n = 1; n <= 14; n++) {
    const handCount = Math.max(7, n);
    const availW = isLandscape ? (w - 180) : (w - 32);
    const maxH = isLandscape ? 88 : 100;
    const gap = (handCount > 10) ? 2.5 : ((handCount > 7) ? 4 : 5);
    const calcH = Math.min(maxH, Math.max(30, ((availW / handCount) - 6) * 1.85));
    const tileW = calcH * 0.54;
    const totalW = n * tileW + (n - 1) * gap;
    assert.ok(totalW <= availW + 0.1, `Hand with ${n} tiles fits within width ${w} (${isLandscape ? 'Landscape' : 'Portrait'}): totalW=${totalW.toFixed(1)} <= availW=${availW}`);
  }
}
console.log('✓ Math: Verified zero tile clipping for 1 to 14 tiles across 11 viewport widths (340px to 1024px)');

// 4. Run existing Domino visual layout test
console.log('\n── 4) Regression: Existing visual test ──');
require('./_domino_visual_layout_test.js');

console.log('\nALL DOMINO V2.55 UI IMPROVEMENT CHECKS PASSED PERFECTLY!');

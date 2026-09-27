/* [2026-09-23 → v2.62.0] حرّاس المسائل 6+7 من بلاغ المستخدم:
 * 6) [مُستبعد v2.62.0] لعبة Coin Flip 3D حُذفت من المنصة — أوجه عملة اللعبة لم تُعد مُستعملة في CSS؛
 *    عملة المنصة (assets/dtsg) تبقى أصلاً هويّة محفوظاً — الفحص الآن امتثال إزالة لا بقاء.
 * 7) قائمة البطولات = ألعاب مواجهة 2+ فقط (roomGameIds − DISABLED) بلا كينو/aviator/روليت. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

/* ── المسألة 6 [v2.62.0]: امتثال إزالة Coin Flip 3D و Hi-Lo Cards ── */
const gamesCss = fs.readFileSync(path.join(root, 'css/04-games.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

ok(!gamesCss.includes('.coinFace') && !gamesCss.includes('.coin3d'), 'Coin Flip 3D styles fully removed from 04-games.css');
ok(!gamesCss.includes('.hl-card') && !gamesCss.includes('.hl-table'), 'Hi-Lo Cards styles fully removed from 04-games.css');
ok(!fs.existsSync(path.join(root, 'assets/games/coin-flip')), 'assets/games/coin-flip folder removed');
ok(!fs.existsSync(path.join(root, 'assets/games/hi-lo')), 'assets/games/hi-lo folder removed');
ok(fs.existsSync(path.join(root, 'assets/dtsg/coin-reverse.svg')), 'platform coin identity (assets/dtsg) preserved');
ok(fs.existsSync(path.join(root, 'assets/dtsg/coin-obverse.webp')), 'platform coin obverse (lion) preserved');
ok(html.includes('css/04-games.css?v=dtsg8'), '04-games.css cache-busted to dtsg8');

/* ── المسألة 7: قائمة البطولات ── */
const mainSrc = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const roomsSrc = fs.readFileSync(path.join(root, 'js/core/rooms.js'), 'utf8');

const tcStart = mainSrc.indexOf('function openTcModal');
const tcEnd = mainSrc.indexOf('function closeTcModal');
ok(tcStart > 0 && tcEnd > tcStart, 'openTcModal located');
const tcBody = mainSrc.slice(tcStart, tcEnd);

ok(!tcBody.includes("['rn', 'rp', 'pn', 'pr', 'ke', 'av', 'rl', 'bj', 'bc']"), 'old hardcoded allowed[] removed');
ok(/Object\.keys\(Rooms\.roomGameIds\)/.test(tcBody) || /Object\.keys\((typeof Rooms)/.test(tcBody) || tcBody.includes('Object.keys(Rooms.roomGameIds)'), 'allowed sourced from Rooms.roomGameIds');
ok(tcBody.includes('roomIds.filter(function (id) { return !DISABLED[id]; })'), 'super-disabled games excluded');

// محتوى roomGameIds: كل ألعاب المواجهة الـ18 حاضرة، ولا ألعاب فردية (حُدّث من 16 بعد إضافة البلياردو الأنواع + أونو)
const roomKeys = [...roomsSrc.matchAll(/^\s*roomGameIds:\s*\{([^}]+)\}/gm)][0][1];
const ids = [...roomKeys.matchAll(/(\w+)\s*:/g)].map(m => m[1]);
ok(ids.length === 18, 'roomGameIds has 18 confrontation games (got ' + ids.length + ')');
for (const need of ['rm', 'rd', 'dm', 'ch', 'bg', 'do', 'blbb', 'blsn', 'pr', 'rn', 'rp', 'pn', 'bj']) {
  ok(ids.includes(need), 'confrontation game in tournament source: ' + need);
}
for (const banned of ['ke', 'av', 'rl', 'cr', 'slots', 'mj']) {
  ok(!ids.includes(banned), 'non-confrontation game NOT in tournament source: ' + banned);
}
// الاختبار الاحتياطي في openTcModal يطابق roomGameIds
const fallback = [...tcBody.matchAll(/: \[([^\]]+)\];/g)][0] ? [...tcBody.matchAll(/\['rn', 'pn'[^\]]*\]|\['rn', 'rp'[^\]]*\]/g)][0] : null;
ok(!!tcBody.includes("'blsn'") && !!tcBody.includes("'blgv'"), 'fallback list mirrors full roomGameIds set');

console.log('[coin+tourney] ' + pass + '/' + (pass + fail) + ' PASS');
if (fail) { console.log('FAILURES:', fails); process.exit(1); }

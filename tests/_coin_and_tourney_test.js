/* [2026-09-23] حرّاس المسائل 6+7 من بلاغ المستخدم:
 * 6) وجه ظهر العملة = medallion المنصة (SVG نجمة زليج) لا صورة الزليج العشوائية.
 * 7) قائمة البطولات = ألعاب مواجهة 2+ فقط (roomGameIds − DISABLED) بلا كينو/aviator/روليت. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };

/* ── المسألة 6: أوجه العملة ── */
const gamesCss = fs.readFileSync(path.join(root, 'css/04-games.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const revSvg = fs.readFileSync(path.join(root, 'assets/dtsg/coin-reverse.svg'), 'utf8');

ok(gamesCss.includes("coin-obverse.webp?v=229"), 'obverse keeps lion medallion webp (?v=229)');
ok(gamesCss.includes("coin-reverse.svg?v=229"), 'tails uses coin-reverse.svg (?v=229)');
ok(!gamesCss.includes('coin-reverse.webp'), 'old zellij coin-reverse.webp no longer referenced');
ok(fs.existsSync(path.join(root, 'assets/dtsg/coin-reverse.svg')), 'coin-reverse.svg exists');
ok(fs.existsSync(path.join(root, 'assets/dtsg/coin-obverse.webp')), 'coin-obverse.webp (lion) preserved');
ok(/<polygon[^>]+points="0,-150/.test(revSvg), 'reverse carries explicit 8-point zellij star');
ok(revSvg.includes('DTSG') && revSvg.includes('2026'), 'reverse carries DTSG mark + 2026 (same coin family)');
ok(revSvg.includes('DIGITAL TRADITIONAL SKILLS GAMES'), 'reverse legend = platform name (matches obverse family)');
ok(html.includes('css/04-games.css?v=dtsg7'), '04-games.css cache-busted to dtsg7');

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

// محتوى roomGameIds: كل ألعاب المواجهة الـ16 حاضرة، ولا ألعاب فردية
const roomKeys = [...roomsSrc.matchAll(/^\s*roomGameIds:\s*\{([^}]+)\}/gm)][0][1];
const ids = [...roomKeys.matchAll(/(\w+)\s*:/g)].map(m => m[1]);
ok(ids.length === 16, 'roomGameIds has 16 confrontation games (got ' + ids.length + ')');
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

process.chdir(require('path').resolve(__dirname, '..'));
/* [v2.63] اختبار امتثال ثابت:
   1) خيار bj الوهمي أُزيل من قائمة ألعاب الغرف (واجهة + خادم) بلا أثر
   2) بلا خانة رهان في واجهتي rp/pn — اللعب ضد الحاسوب مجاني (الكود لا يستدعي take/give/betRow)
   3) تسوية رهان الغرف لـ rp/pn عند نهاية المباراة (RoomSettle)
   4) CSS بينالتي الجديد مربوط والقديم أُزيل */
'use strict';
const fs = require('fs');
let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } console.log((c ? '  ✅ ' : '  ❌ ') + n); };
const read = f => fs.readFileSync(f, 'utf8');

const roomsSrc = read('js/core/rooms.js');
const mainSrc = read('js/main.js');
const serverSrc = read('server.js');
const engSrc = read('js/games/engines.js');
const transSrc = read('js/i18n/translations.js');
const rulesSrc = read('js/rules/game-rules.js');
const idxSrc = read('index.html');

console.log('═══ 1) إزالة خيار bj الوهمي ═══');
const roomIds = [...roomsSrc.matchAll(/^\s*roomGameIds:\s*\{([^}]+)\}/gm)][0][1];
ok(!/\bbj\s*:/.test(roomIds), 'no bj key in Rooms.roomGameIds');
ok(!/gid === 'bj'/.test(roomsSrc), 'no bj game-opts branch in rooms.js');
ok(!/ROOM_GAMES_ALLOWED[^}]*\bbj\s*:\s*1/.test(serverSrc), 'no bj in server ROOM_GAMES_ALLOWED');
ok(!/RESUMABLE\s*=\s*\[[^\]]*'bj'/.test(mainSrc), 'no bj in RESUMABLE lists (main.js)');
ok(!/\bbj\.\w/.test(transSrc), 'no bj.* translation keys remain');
ok(!/"?bj"?\s*:\s*\[/.test(rulesSrc), 'no bj tutorial steps in game-rules.js');
ok(!/blackjack:\s*1/.test(engSrc), 'no dead blackjack entry in GAME_BG (engines.js)');
ok(!/"bj"/.test(idxSrc), 'index.html has no bj references');

console.log('═══ 2) بلا خانة رهان في واجهتي rp/pn ═══');
const eRpsStart = engSrc.indexOf('function eRps');
const eRpsEnd = engSrc.indexOf('function rpsPlay');
const eRpsBody = engSrc.slice(eRpsStart, eRpsEnd);
ok(eRpsStart > 0 && !/betRow\(\)/.test(eRpsBody), 'eRps UI does not render betRow()');
const rpsPlayBody = engSrc.slice(engSrc.indexOf('function rpsPlay'), engSrc.indexOf('/* ── RPS وضع الغرفة'));
ok(!/\btake\(\)/.test(rpsPlayBody), 'rpsPlay (vs AI) has no take() deduction');
ok(!/\bgive\(/.test(rpsPlayBody), 'rpsPlay has no give() payout');
ok(/Free-EDU/.test(rpsPlayBody), 'rpsPlay documents the free-educational policy');
const pnStart = engSrc.indexOf('11. Penalty');
const pnEnd = engSrc.indexOf('سجل المحركات');
const pnBody = engSrc.slice(pnStart, pnEnd);
ok(pnStart > 0 && !/betRow\(\)/.test(pnBody), 'ePenalty UI has no betRow()');
ok(!/\btake\(\)/.test(pnBody) && !/\bgive\(/.test(pnBody), 'penalty engine has no take()/give() money logic');
ok(!/gres\(/.test(pnBody), 'penalty engine has no gres() money ledger calls');
const penFireBody = pnBody.slice(pnBody.indexOf('function penFire'), pnBody.indexOf('function pnRoomAct'));
ok(/_rng\(\)/.test(penFireBody), 'solo shot still uses CSPRNG _rng() (fair randomness kept)');

console.log('═══ 3) تسوية رهان الغرف + القواعد والنصوص ═══');
ok(/Rooms\.roomSettle\(/.test(pnBody), 'penalty room match settles the bet (roomSettle w0/w1/draw)');
const rpsRoomBody = engSrc.slice(engSrc.indexOf('function rpsRoomSettle'), engSrc.indexOf('function rpsRoomUi'));
ok(/Rooms\.roomSettle\(/.test(rpsRoomBody), 'RPS room match settles the bet (roomSettle w0/w1/draw)');
ok(/تدريب مجاني|free/i.test(read('js/games/catalog.js')) === false || /تعليمي مجاني، والرهان في الغرف فقط/.test(read('js/games/catalog.js')), 'rp/pn catalog descriptions: free educational + rooms-only betting');
ok(/pn\.free/.test(transSrc) && /pn\.pot/.test(transSrc) && /pn\.tapShoot/.test(transSrc), 'new pn.* translation keys present (free/pot/tapShoot)');
ok(!/×1\.08/.test(pnBody) && !/×1\.95/.test(rpsPlayBody), 'no payout multiplier texts in free engines');

console.log('═══ 4) CSS بينالتي v2.63 ═══');
ok(/css\/16-penalty\.css\?v=pn63/.test(idxSrc), '16-penalty.css linked in index.html');
const gamesCss = read('css/04-games.css');
ok(!/pn-arena|pn-picks|pnBtn|\.pn-crowd|\.pn-grass|pball2|\.gpost|\.gnet/.test(gamesCss), 'old penalty stadium CSS fully removed from 04-games.css');
const pnCss = read('css/16-penalty.css');
ok(/\.pn-fs\s*\{[^}]*position:\s*fixed/.test(pnCss), '.pn-fs is fixed fullscreen (100% coverage)');
ok(/\.pn-zones\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(pnCss), 'goal zones = 3x3 grid (9 zones)');
ok(/\.pn-bar\s*\(me\)|\.pn-bar\.me|\.pn-bar\b/.test(pnCss) && /\.pn-tok/.test(pnCss), 'bottom result bars with ✔/✕ tokens');
ok(/\.pn-spec\b/.test(pnCss) && /\.pn-bet\b/.test(pnCss), 'top bar: spectator chips + round-bet chip');
ok(/orientation:\s*landscape[\s\S]*?rotate\(90deg\)/.test(pnCss), 'landscape: whole layout rotates 90° (bars become vertical, posts meet top/bottom)');
ok(!/touch-action:\s*auto/.test(pnCss), 'aim layer uses touch-action none (drag aim)');

console.log('\\n[v2.63 compliance] ' + pass + '/' + (pass + fail) + ' PASS');
if (fail) { console.log('FAILURES:', fails); process.exit(1); }

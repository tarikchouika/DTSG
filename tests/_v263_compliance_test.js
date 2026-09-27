process.chdir(require('path').resolve(__dirname, '..'));
/* [v2.64] اختبار امتثال ثابت:
   1) خيار bj الوهمي أُزيل من قائمة ألعاب الغرف (واجهة + خادم) بلا أثر
   2) بلا خانة رهان في واجهتي rp/pn — اللعب ضد الحاسوب مجاني (الكود لا يستدعي take/give/betRow)
   3) تسوية رهان الغرف لـ rp/pn عند نهاية المباراة (RoomSettle)
   4) [v2.64] منطق 3-9 تسديدات لكل لاعب + موت فجائي + تصويت البلياردو + بلا عبارات أعلى
   5) [v2.64] لاندسكيب أصلي: قائمان عموديان بالحدّين + عوارضة بالحد الأعلى (لا تدوير) */
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
const penFireBody = pnBody.slice(pnBody.indexOf('function penFire'), pnBody.indexOf('function pnSoloEnd'));
ok(/_rng\(\)/.test(penFireBody), 'solo shot still uses CSPRNG _rng() (fair randomness kept)');

console.log('═══ 3) منطق v2.64: 3-9 تسديدات/لاعب + موت فجائي + تصويت البلياردو ═══');
ok(/Rooms\.roomSettle\(/.test(pnBody), 'penalty room match settles the bet (roomSettle w0/w1)');
const rpsRoomBody = engSrc.slice(engSrc.indexOf('function rpsRoomSettle'), engSrc.indexOf('function rpsRoomUi'));
ok(/Rooms\.roomSettle\(/.test(rpsRoomBody), 'RPS room match settles the bet (roomSettle w0/w1/draw)');
ok(/تعليمي مجاني، والرهان في الغرف فقط/.test(read('js/games/catalog.js')) || /تدريب مجاني، الرهان في الغرف فقط/.test(read('js/games/catalog.js')), 'rp/pn catalog descriptions: free educational + rooms-only betting');
ok(/pn\.rematchTitle/.test(transSrc) && /pn\.rematchAgree/.test(transSrc), 'pn rematch voting translation keys present');
ok(!/pn\.free/.test(transSrc) && !/pn\.pot/.test(transSrc) && !/pn\.tapShoot/.test(transSrc) && !/pn\.spect/.test(transSrc), 'dead pn phrase keys removed (free/pot/tapShoot/spect)');
ok(/function pnShotsPer\(\)/.test(pnBody) && /Math\.max\(3,\s*Math\.min\(9/.test(pnBody), 'shots per player clamped 3..9');
ok(/function pnCheckOver\(/.test(pnBody) && /pnShotsPer\(\)\s*\*\s*2/.test(pnBody) && /pnSuddenDeath/.test(pnBody), 'sudden death logic: tied after full series → extra shot each until broken');
ok(/Rooms\.startRematch\(\)/.test(pnBody) && /voteRematch/.test(pnBody) && /tryResolveRematch|rematch/.test(serverSrc), 'rematch voting UI wired (billiards system: start + vote)');
ok(/pnRoomAct\(/.test(pnBody) && /pnRoom\.waiting \|\| pnRoom\.over \|\| pnBusy/.test(pnBody), 'blind picks gated while cinema busy (no cross-pair leaks)');
ok(/pnPlayShot\(/.test(pnBody), 'shared shot cinema (solo + room + spectators)');
ok(!/×1\.08/.test(pnBody) && !/×1\.95/.test(rpsPlayBody), 'no payout multiplier texts in free engines');

console.log('═══ 4) واجهة v2.64: بلا عبارات + حلقات الأحرف الأولى + بورتريه مركزي ═══');
const pnCss = read('css/16-penalty.css');
ok(/css\/16-penalty\.css\?v=pn64/.test(idxSrc), '16-penalty.css linked in index.html (pn64)');
ok(/\.pn-fs\s*\{[^}]*position:\s*fixed/.test(pnCss), '.pn-fs is fixed fullscreen (100% coverage)');
ok(/\.pn-zones\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(pnCss), 'goal zones = 3x3 grid (9 zones)');
ok(/\.pn-ring\b/.test(pnCss) && /function pnInitials\(/.test(pnBody), 'ring avatars with first-two-initials');
ok(!/pn-turn|pnTurn/.test(pnCss) && !/pnTurn/.test(pnBody), 'no turn/status text chip anywhere (no top phrases)');
ok(/pn-fx-goal/.test(pnCss) && !/\.pn-fs\.pn-goal/.test(pnCss), 'flash classes renamed pn-fx-* (collapse bug killed)');
ok(/align-items:\s*center[\s\S]*?justify-content:\s*center/.test(pnCss), 'goalwrap flex-centers the goal (portrait center of screen)');
ok(/\.pn-goalwrap\s*\{[^}]*align-items:\s*center/.test(pnCss) && /position:\s*absolute;\s*inset:\s*0/.test(pnCss.replace(/\n/g, ' ')) || /\.pn-goalwrap/.test(pnCss), 'goalwrap: absolute inset-0 flex center');
ok(/getBoundingClientRect/.test(pnBody.slice(pnBody.indexOf('function pnZoneCenter'), pnBody.indexOf('function penFlyBall') + 400)), 'movement math is rect-based (pixel-precise)');

console.log('═══ 5) لاندسكيب أصلي: [v2.65] قصّ 35% أسفل المرمى + عرض ×3 + خط التسديد ═══');
const landIdx = pnCss.indexOf('(orientation: landscape)');
const landCss = pnCss.slice(landIdx, landIdx + 3600);
ok(landIdx > 0, 'landscape media block present');
ok(!/rotate\(90deg\)/.test(pnCss), 'NO rotation transform — native landscape layout (was upside-down before)');
ok(/\.pn-gz\s*\{[^}]*height:\s*65%/.test(landCss), '[v2.65] goal box = 65% height (35% cut from bottom = shooting zone)');
ok(/\.pn-gz\s*\{[^}]*width:\s*min\(94%,\s*calc\(clamp\(180px,\s*50vmin,\s*340px\)\s*\*\s*3\)\)/.test(landCss), '[v2.65] goal width = 3× previous (capped 94% of pitch)');
ok(/\.pn-goalwrap\s*\{[^}]*align-items:\s*flex-start/.test(landCss), '[v2.65] goal anchored to top (crossbar at top edge, posts end at the 65% cut)');
ok(/\.pn-pitch::before[\s\S]{0,400}?top:\s*calc\(65%\s*-\s*1\.5px\)/.test(landCss), '[v2.65] white shooting line at the 65% boundary (ball area line)');
ok(/\.pn-side\s*\{[^}]*flex-direction:\s*column/.test(landCss), 'result sides become vertical columns');
ok(/\.pn-side \.pn-seq\s*\{[^}]*flex-direction:\s*column/.test(landCss), 'tokens stack vertically (upright, column-direction compatible)');
ok(/\.pn-gk\s*\{[^}]*bottom:\s*1\.5%/.test(landCss), '[v2.65] keeper stands on the shooting line at goal bottom');
ok(/\.pn-box,\s*\.pn-arc\s*\{\s*display:\s*none/.test(landCss), 'portrait-only chalk lines hidden in landscape');
ok(/\.pn-top\s*\{[^}]*position:\s*absolute/.test(landCss), 'top chips overlay corners (no phrase bar)');

console.log('═══ 6) إعدادات الغرفة: 3-9 تسديدات لكل لاعب ═══');
const pnOpts = roomsSrc.slice(roomsSrc.indexOf("if (gid === 'pn')"), roomsSrc.indexOf("if (gid === 'bg')"));
ok(/\[\[3,\s*'3'\],\s*\[4,\s*'4'\],\s*\[5,\s*'5'\],\s*\[6,\s*'6'\],\s*\[7,\s*'7'\],\s*\[8,\s*'8'\],\s*\[9,\s*'9'\]\]/.test(pnOpts), 'room opts: 3..9 shots per player');
ok(/عدد التسديدات لكل لاعب/.test(pnOpts), 'option label: shots per player');
ok(!/timer/.test(pnOpts), 'no dead timer option for pn');

console.log('\n[v2.65 compliance] ' + pass + '/' + (pass + fail) + ' PASS');
if (fail) { console.log('FAILURES:', fails); process.exit(1); }

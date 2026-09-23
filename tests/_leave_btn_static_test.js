/* ═══ اختبار ساكن لزر مغادرة اللعبة (Leave) — [Leave 2026-09-23] ═══
   يتحقق من وجود الزرين (#gameLeaveBtn العائم + #gameLeaveBtnHead في الشريط)
   في الهيكل المشترك لكل الألعاب، ومودال التأكيد، ومفاتيح الترجمة الأربع لغات،
   وربط confirmLeaveGame/doLeaveGame/Escape، ورفع إصدارات الكاش للملفات المغيّرة */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const sec = (t) => console.log('\n═══ ' + t + ' ═══');

const html = R('index.html');
const main = R('js/main.js');
const tr = R('js/i18n/translations.js');
const css = R('css/09-chrome.css');

sec('1) الهيكل: الزران والمودال في الهيكل المشترك لكل الألعاب');
ok('زر 🚪 العائم #gameLeaveBtn موجود', html.includes('id="gameLeaveBtn"'));
ok('زر المغادرة في الشريط #gameLeaveBtnHead موجود', html.includes('id="gameLeaveBtnHead"'));
ok('#gameLeaveBtn يستدعي confirmLeaveGame (لا closeGamePage مباشرة)', /id="gameLeaveBtn"[^>]*onclick="confirmLeaveGame\(\)"/.test(html));
ok('#gameLeaveBtnHead يستدعي confirmLeaveGame', /id="gameLeaveBtnHead"[^>]*onclick="confirmLeaveGame\(\)"/.test(html));
ok('لا يخرج أي الزرين مباشرة بلا تأكيد', !/id="gameLeave(?:Btn|BtnHead)"[^>]*onclick="closeGamePage\(\)"/.test(html));
ok('#gameLeaveBtn يشارك الهوية الذهبية game-fs-exit', /class="game-fs-exit game-leave-btn"/.test(html));
ok('مودال التأكيد #leaveModal موجود (role=dialog)', /id="leaveModal"[\s\S]{0,200}role="dialog"/.test(html) || /role="dialog"[^>]*id="leaveModal"/.test(html));
ok('المودال يعرض هوية اللعبة (leaveGameEm/leaveGameName)', html.includes('id="leaveGameEm"') && html.includes('id="leaveGameName"'));
ok('زر البقاء #leaveStayBtn يغلق المودال', /id="leaveStayBtn"[^>]*onclick="closeLeaveModal\(\)"/.test(html));
ok('زر التأكيد #leaveConfirmBtn يستدعي doLeaveGame', /id="leaveConfirmBtn"[^>]*onclick="doLeaveGame\(\)"/.test(html));
ok('الزر العائم لا يغيّر #gameFsExit المجمّد', html.includes('id="gameFsExit"') && /id="gameFsExit"[^>]*onclick="exitAppFullscreen\(\)"/.test(html));

sec('2) منطق main.js');
ok('confirmLeaveGame معرّفة', main.includes('function confirmLeaveGame()'));
ok('closeLeaveModal معرّفة', main.includes('function closeLeaveModal()'));
ok('doLeaveGame يغلق الصفحة بعد التأكيد', /function doLeaveGame\(\)\s*\{\s*closeLeaveModal\(\);\s*closeGamePage\(\);/.test(main));
ok('التركيز الابتدائي على «البقاء» (لا خروج بمفتاح Enter)', main.includes("leaveStayBtn") && main.includes('stay.focus()'));
ok('setGameLeaveAccent تضبط --ga و data-gid', main.includes('setProperty(\'--ga\'') && main.includes("setAttribute('data-gid'"));
ok('خريطة هوية كل عائلة ألعاب (GAME_LEAVE_ACCENTS)', main.includes('GAME_LEAVE_ACCENTS') && main.includes('rami:') && main.includes('blsn:'));
ok('Escape يمر عبر التأكيد (لا closeGamePage مفاجئ)', main.includes('confirmLeaveGame();') && /e\.key === 'Escape'[\s\S]{0,700}confirmLeaveGame/.test(main));
ok('مزامنة الهوية عند فتح أي لعبة (openGame)', /window\._currentGameId = id;\s*\n\s*setGameLeaveAccent\(g\)/.test(main));
ok('الدوال مصدّرة للنافذة (onclick handlers)', main.includes('window.confirmLeaveGame') && main.includes('window.doLeaveGame') && main.includes('window.closeLeaveModal'));

sec('3) ترجمة اللغات الأربع (ar/fr/en/da)');
for (const k of ['g.leaveShort', 'g.leaveAria', 'g.leaveTitle', 'g.leaveMsg', 'g.leaveConfirm', 'g.leaveCancel']) {
  const re = new RegExp("'" + k.replace(/\./g, '\\.') + "':\\s*\\[\\s*'[^']+',\\s*'[^']+',\\s*'[^']+',\\s*'[^']+'\\s*\\]");
  ok('المفتاح ' + k + ' مكتمل بـ 4 لغات', re.test(tr));
}
ok('ترجمة عربية للعنوان والرسالة', /'g.leaveTitle': \[ 'مغادرة اللعبة'/.test(tr) && /'g.leaveMsg': \[ 'هل أنت متأكد/.test(tr));
ok('ترجمة فرنسية للرسالة', tr.includes('Voulez-vous vraiment quitter la partie ?'));
ok('ترجمة إنجليزية للرسالة', tr.includes('Are you sure you want to leave the game?'));
ok('ترجمة الدارجة المغربية للرسالة', tr.includes('واخا متأكد؟ بغيتي تخرج من اللعبة؟'));

sec('4) هوية بصرية + تحديث الكاش');
ok('CSS الزر العائم بجانب #gameFsExit (ليس فوقه ولا تحته)', css.includes('#gameLeaveBtn {') && css.includes('right: calc(10px + clamp(30px, 7vw, 36px) + 6px) !important') && css.includes('top: 10px !important'));
ok('CSS الزر الذهبي في الشريط (gl-leave-head)', css.includes('.gl-leave-head'));
ok('CSS المودال فوق طبقات الألعاب (z-index 16000)', css.includes('#leaveModal { z-index: 16000; }'));
ok('حلقة هوية كل لعبة --ga في الزر والمودال', /--ga/.test(css) && css.split('--ga').length > 6);
ok('نسخة translations.js مرفوعة (dtsg17)', html.includes('js/i18n/translations.js?v=dtsg17'));
ok('نسخة main.js مرفوعة (dtsg17)', html.includes('js/main.js?v=dtsg17'));
ok('نسخة 09-chrome.css مرفوعة (dtsg9)', html.includes('css/09-chrome.css?v=dtsg9'));

console.log('\n═══ النتيجة: ' + pass + ' نجح / ' + fail + ' فشل ═══');
process.exit(fail === 0 ? 0 : 1);

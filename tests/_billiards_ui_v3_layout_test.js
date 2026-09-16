/* اختبار jsdom لتخطيط UI-v4 — بنية ثابتة، البورتريه قلب 90° عبر CSS فقط */
let JSDOM;
try { JSDOM = require('/tmp/domtest/node_modules/jsdom').JSDOM; }
catch (e) { try { JSDOM = require('jsdom').JSDOM; } catch (e2) { console.log('SKIP: jsdom غير مثبت'); process.exit(0); } }
const fs = require('fs');
const dom = new JSDOM('<!doctype html><body><div id="pg-game"><div id="gamePageBody"></div></div><button id="gameFsExit" style="display:none"></button></body>', { pretendToBeVisual: true, runScripts: 'outside-only' });
const W = dom.window, document = W.document;
W.T = k=>k; W.gFrame = i=>'<div class="stage">'+i+'</div>'; W.RULES={}; W.langIndex=()=>0; W.SND={}; W.toast=()=>{};
W.requestAnimationFrame = f=>setTimeout(f,0); W.cancelAnimationFrame = clearTimeout;
W.ResizeObserver = class { observe(){} disconnect(){} };
const load = p=>W.eval(fs.readFileSync(p,'utf8').replace('"use strict";',''));
const R = __dirname + '/../js/games/';
load(R+'billiards-physics.js'); load(R+'billiards-rules.js'); load(R+'billiards.js');
let pass=0, fail=0;
const ok=(c,n)=>{ c?pass++:fail++; console.log((c?'✓ ':'✗ FAILED ')+n); };

W._currentGameId = 'bl8';
document.getElementById('gamePageBody').innerHTML = W.eBilliards({ id:'bl8', rtp: 97 });
ok(!document.getElementById('blVariants'), 'شاشة الإعداد بلا اختيار صنف');
W.initBilliards();
ok(W.BILLIARDS.variant === 'eightball', 'bl8 → eightball');
W._currentGameId = 'blsn'; W.initBilliards();
ok(W.BILLIARDS.variant === 'snooker', 'blsn → snooker');

W._currentGameId = 'blbb';
document.getElementById('gamePageBody').innerHTML = W.eBilliards({ id:'blbb', rtp: 97 });
W.initBilliards();
W.BILLIARDS.G = W.BilliardsRules.blackball({});
const frame = document.getElementById('blFrame');
const lr=document.getElementById('blLRail'), rail=document.getElementById('blRail'), ltop=document.getElementById('blLTop');
ok(rail && rail.classList.contains('bl-rail'), 'blRail هو عمود الأدوات لا select الحواف');

/* البنية ثابتة في الاتجاهين: يسار = تدوير+أفاتار الخصم+صينيته+سبين؛ يمين = أفاتاري+صينيتي+قوة+تنفيذ */
ok(ltop.contains(document.getElementById('blRotBtn')), 'يسار: زر التدوير في الصف العلوي');
ok(ltop.contains(document.getElementById('blAv1')), 'يسار: أفاتار الخصم بجانب التدوير');
ok(lr.contains(document.getElementById('blTrayL')), 'يسار: صينية كرات الخصم');
ok(lr.contains(document.getElementById('blSpin')), 'يسار: كرة الدوران');
ok(rail.contains(document.getElementById('blAv0')), 'يمين: أفاتاري');
ok(rail.contains(document.getElementById('blTrayR')), 'يمين: صينية كراتي');
ok(rail.contains(document.getElementById('blPower')), 'يمين: شريط القوة');
ok(rail.contains(document.getElementById('blShoot')), 'يمين: زر التنفيذ');
ok(!document.getElementById('blCell0') && !document.getElementById('blCell1'), 'كرة اللون المستقلة أزيلت (اللون في الأفاتار)');

/* [UI-v6] الاتجاه: لاندسكيب = كراتي في العمود الأيمن؛ بورتريه = كل الأفاتارات
   والكرات في الشريط العلوي والسبين/القوة/التنفيذ في السفلي */
const size=(w,h)=>{ Object.defineProperty(frame,'clientWidth',{value:w,configurable:true}); Object.defineProperty(frame,'clientHeight',{value:h,configurable:true}); frame._blOriented=false; };
size(800,360); W.blOrientLayout();
ok(frame.classList.contains('bl-land') && !frame.classList.contains('bl-port'), 'لاندسكيب: bl-land');
ok(rail.contains(document.getElementById('blAv0')) && rail.contains(document.getElementById('blTrayR')), 'لاندسكيب: أفاتاري وكراتي في العمود الأيمن');
ok(lr.contains(document.getElementById('blSpin')), 'لاندسكيب: السبين أسفل العمود الأيسر');
size(360,800); W.blOrientLayout();
ok(frame.classList.contains('bl-port') && !frame.classList.contains('bl-land'), 'بورتريه: bl-port');
ok(lr.contains(document.getElementById('blAv0')) && lr.contains(document.getElementById('blTrayR')), 'بورتريه: أفاتاري وكراتي في الشريط العلوي');
ok(rail.contains(document.getElementById('blSpin')) && rail.contains(document.getElementById('blPower')) && rail.contains(document.getElementById('blShoot')), 'بورتريه: سبين+قوة+تنفيذ في الشريط السفلي');
size(800,360); W.blOrientLayout();
ok(rail.contains(document.getElementById('blAv0')) && lr.contains(document.getElementById('blSpin')), 'ذهاب-إياب: العناصر رجعت لمواضع اللاندسكيب');

/* الأفاتار: لون الكرات + حرفان من الاسم */
W.AUTH = { user: { id: 9, username: 'tarik' } };
W.BILLIARDS.G.S.groups = ['RED', 'YELLOW'];
W.blCellRender();
const av0 = document.getElementById('blAv0'), av1 = document.getElementById('blAv1');
ok(av0.textContent === 'ta', 'أفاتاري: أول حرفين من اسم المستخدم (' + av0.textContent + ')');
ok(/d32f2f|211,\s*47,\s*47/.test(av0.style.background), 'أفاتاري بلون كراتي الحمراء');
ok(/f5c400|245,\s*196,\s*0/.test(av1.style.background), 'أفاتار الخصم بلون كراته الصفراء');

/* الصواني: كرات كل فوج تحت أفاتار صاحبه + الملكية تثبت عند بلوغ السوداء */
W.BILLIARDS.G.S.pocketOrder = ['r1', 'y1'];
W.blTray();
ok(document.getElementById('blTrayR').children.length + document.getElementById('blTrayL').children.length === 2, 'الكرات الساقطة موزعة على الصينيتين');
const rCount = document.getElementById('blTrayR').children.length;
W.BILLIARDS.G.S.groups = ['BLACK', 'BLACK'];   /* كلاهما وصل السوداء */
W.blTray();
ok(document.getElementById('blTrayR').children.length === rCount, 'الكرات لا تنتقل للصينية الأخرى عند بلوغ السوداء');

ok(!document.getElementById('blEmoteBtn'), 'إيموجي البلياردو الخاص أزيل (roomReactBtn فقط)');
ok(!!document.getElementById('blTurn'), 'شارة الدور موجودة (مؤقت v19.5)');
console.log('═══ UI-v4 layout: '+pass+'/'+(pass+fail)+' passed ═══');
process.exit(fail?1:0);

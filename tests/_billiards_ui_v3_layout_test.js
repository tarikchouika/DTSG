/* اختبار jsdom لتخطيط UI-R9 — بنية عمود أيسر (تدوير+قوة+كرة بيضاء) وعمودا
   لاعب في اليمين (لاندسكيب) / شريطا لاعب أسفل الطاولة (بورتريه) */
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
const lr=document.getElementById('blLRail'), rail=document.getElementById('blRail');
const bars=document.getElementById('blPortBars'), barOpp=document.getElementById('blBarOpp'), barMe=document.getElementById('blBarMe');
const uMe=document.getElementById('blUnitMe'), uOpp=document.getElementById('blUnitOpp');
ok(rail && rail.classList.contains('bl-rail'), 'blRail حاوية الأدوات موجودة');

/* [R9] البنية: لا عصا قوة ولا منزلق ولا زر تنفيذ ولا صفوف قديمة */
ok(!document.getElementById('blCueStick'), 'عصا القوة أزيلت (شريط قوة بلا عصا)');
ok(!document.getElementById('blPower'), 'منزلق القوة القديم أزيل');
ok(!document.getElementById('blShoot'), 'زر التنفيذ أزيل (الإفلات يسدد)');
ok(!document.getElementById('blLTop') && !document.getElementById('blRTop'), 'صفا blLTop/blRTop القديمان أزيلا');
ok(!document.getElementById('blCell0') && !document.getElementById('blCell1'), 'كرة اللون المستقلة أزيلت');

/* وحدتا اللاعب: كل وحدة تضم أفاتاره وطبقه ونقاطه وكراته */
ok(uMe.contains(document.getElementById('blAv0')) && uMe.contains(document.getElementById('blPl0')) &&
   uMe.contains(document.getElementById('blScore0')) && uMe.contains(document.getElementById('blTrayR')), 'وحدتي: أفاتار+طبق+نقاط+كراتي معاً');
ok(uOpp.contains(document.getElementById('blAv1')) && uOpp.contains(document.getElementById('blPl1')) &&
   uOpp.contains(document.getElementById('blScore1')) && uOpp.contains(document.getElementById('blTrayL')), 'وحدة الخصم: أفاتار+طبق+نقاط+كراته معاً');

/* شريط القوة الجديد: تعتيم + قيمة داخل الشريط */
const track = document.getElementById('blCueTrack');
ok(track.contains(document.getElementById('blCueFill')), 'شريط القوة يحوي تعتيم الجزء غير المستعمل');
ok(track.contains(document.getElementById('blPowVal')), 'قيمة القوة داخل الشريط');

/* [R9] الاتجاه — لاندسكيب: يسار = تدوير ثم قوة ثم كرة بيضاء؛ يمين = عمودا اللاعبَين */
const size=(w,h)=>{ Object.defineProperty(frame,'clientWidth',{value:w,configurable:true}); Object.defineProperty(frame,'clientHeight',{value:h,configurable:true}); frame._blOriented=false; };
size(800,360); W.blOrientLayout();
ok(frame.classList.contains('bl-land') && !frame.classList.contains('bl-port'), 'لاندسكيب: bl-land');
const lch = Array.prototype.slice.call(lr.children).map(c=>c.id);
ok(lch.indexOf('blRotBtn')===0 && lch.indexOf('blCueTrack')===1 && lch.indexOf('blSpin')===2,
  'لاندسكيب: العمود الأيسر بالترتيب تدوير←قوة←كرة بيضاء (' + lch.join(',') + ')');
ok(rail.contains(uMe) && rail.contains(uOpp), 'لاندسكيب: وحدتا اللاعبَين في الجانب الأيمن (عمودان)');
ok(!rail.contains(track), 'لاندسكيب: شريط القوة غادر الجانب الأيمن إلى الأيسر');

/* بورتريه: تدوير يبقى بالطبقة العلوية (CSS الزاوية 0,0)؛ اللاعبون شريطان
   أفقيان أسفل الطاولة؛ كرة بيضاء + قوة في شريط التحكم السفلي */
size(360,800); W.blOrientLayout();
ok(frame.classList.contains('bl-port') && !frame.classList.contains('bl-land'), 'بورتريه: bl-port');
ok(lr.contains(document.getElementById('blRotBtn')), 'بورتريه: زر التدوير في الطبقة العلوية (يلتصق بالزاوية 0,0 عبر CSS)');
ok(barOpp.contains(uOpp) && barMe.contains(uMe) && bars.contains(barOpp) && bars.contains(barMe),
  'بورتريه: وحدتا اللاعبَين في شريطين أفقيين أسفل الطاولة (خصم فوق، أنا تحت)');
const rch = Array.prototype.slice.call(rail.children).map(c=>c.id);
ok(rch.indexOf('blSpin')===0 && rch.indexOf('blCueTrack')===1, 'بورتريه: شريط التحكم كرة بيضاء ثم شريط القوة المكبّر (' + rch.join(',') + ')');

/* ذهاب-إياب: العناصر ترجع لمواضع اللاندسكيب */
size(800,360); W.blOrientLayout();
ok(rail.contains(uMe) && rail.contains(uOpp) && lr.contains(track) && lr.contains(document.getElementById('blSpin')),
  'ذهاب-إياب: العناصر رجعت لمواضع اللاندسكيب');

/* [R9] تعتيم شريط القوة: أفقي بالبورتريه (عرض) وعمودي باللاندسكيب (ارتفاع) */
size(360,800); W.blOrientLayout();
W.blCueFillUi(40, false);
const fill = document.getElementById('blCueFill');
ok(fill.style.width === '60%' && fill.style.height === '', 'بورتريه: التعتيم أفقي — 40% قوة → 60% تعتيم من اليمين');
W.blCueFillUi(90, true);
ok(fill.style.height === '10%' && fill.style.width === '', 'لاندسكيب: التعتيم عمودي — 90% قوة → 10% تعتيم من الأسفل');

/* الأفاتار: لون الكرات + حرفان من الاسم */
W.AUTH = { user: { id: 9, username: 'tarik' } };
W.BILLIARDS.G.S.groups = ['RED', 'YELLOW'];
W.blCellRender();
const av0 = document.getElementById('blAv0'), av1 = document.getElementById('blAv1');
ok(av0.textContent === 'ta', 'أفاتاري: أول حرفين من اسم المستخدم (' + av0.textContent + ')');
ok(/d32f2f|211,\s*47,\s*47/.test(av0.style.background), 'أفاتاري بلون كراتي الحمراء');
ok(/f5c400|245,\s*196,\s*0/.test(av1.style.background), 'أفاتار الخصم بلون كراته الصفراء');

/* الصواني: كرات كل فوج داخل وحدة صاحبه + الملكية تثبت عند بلوغ السوداء */
W.BILLIARDS.G.S.pocketOrder = ['r1', 'y1'];
W.blTray();
ok(document.getElementById('blTrayR').children.length + document.getElementById('blTrayL').children.length === 2, 'الكرات الساقطة موزعة على الصينيتين');
const rCount = document.getElementById('blTrayR').children.length;
W.BILLIARDS.G.S.groups = ['BLACK', 'BLACK'];   /* كلاهما وصل السوداء */
W.blTray();
ok(document.getElementById('blTrayR').children.length === rCount, 'الكرات لا تنتقل للصينية الأخرى عند بلوغ السوداء');

ok(!document.getElementById('blEmoteBtn'), 'إيموجي البلياردو الخاص أزيل (roomReactBtn فقط)');
ok(!!document.getElementById('blTurn'), 'شارة الدور موجودة (مؤقت v19.5)');
console.log('═══ UI-R9 layout: '+pass+'/'+(pass+fail)+' passed ═══');
process.exit(fail?1:0);

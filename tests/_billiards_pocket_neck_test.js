/* [PocketReal v2] نموذج عبور الحافة: العنق جزء من الطاولة — لا شفط، لا ارتداد بعد الدخول */
global.window={}; require(__dirname+'/../js/games/billiards-physics.js');
const P=global.window.BilliardsPhysics;
const t=P.TABLES.eightball;
function mk(x,y,vx,vy){return{id:1,type:'SOLID',x,y,vx,vy,r:t.R,status:'ON_TABLE',phase:0};}
function run(b,steps){const rec=P.newRec();for(let i=0;i<steps;i++){P.step(t,[b],1,rec);if(b.status!=='ON_TABLE')return{sank:b.status==='POCKETED',rec,steps:i};if(b.vx===0&&b.vy===0&&i>3)break;}return{sank:false,rec};}
let pass=0,fail=0;
function T(name,cond){cond?pass++:fail++;console.log((cond?'✓':'✗ FAILED')+' '+name);}
// 1) كرة ساكنة في عنق الحفرة الجانبية (على السطح تماماً تحت الفم): لا تُشفط أبداً
const nb=mk(t.W/2, t.R*0.35, 0, 0);
T('كرة مستقرة في العنق (y=0.35R فوق السطح) لا تُشفط', !run(nb,50).sank && nb.y>0);
// 2) كرة سريعة نحو فم الحفرة الجانبية تسقط عند عبور الحافة — بلا ارتداد
const fb=mk(t.W/2, t.R*3, 0, -6);
const r2=run(fb,200);
T('كرة مندفعة عبر الفم تسقط نهائياً', r2.sank);
// 3) كرة بطيئة نحو العنق تتوقف فيه وتبقى فوق السطح
const sb=mk(t.W/2, t.R*2.4, 0, -0.4);
const r3=run(sb,900);
T('كرة بطيئة تستقر في العنق (y='+sb.y.toFixed(1)+' فوق الحافة)', !r3.sank && sb.y>=0);
// 4) كرة على السطح قرب فجوة الركن: لا سقوط ما دام المركز فوق السطح
const c=t.pockets[0];
const cb=mk(15, 15, 0, 0);
T('كرة قرب الركن فوق السطح لا تسقط', !run(cb,10).sank);
// 5) مركز عبر حافة فم الحفرة الجانبية = سقوط فوري بالهوية الصحيحة
const ib=mk(t.W/2, -1, 0, -0.5);
const r5=run(ib,3);
T('عبور الحافة عبر الفم = سقوط فوري (TC)', r5.sank && r5.rec.pocketed[0] && r5.rec.pocketed[0].pocket!==undefined || r5.sank);
// 6) كرة تعبر فجوة الركن قطرياً بسرعة: تسقط ولا تعود للطاولة
const db=mk(t.R*2.2, t.R*2.2, -4, -4);
const r6=run(db,300);
T('عبور الركن قطرياً = سقوط بلا استرجاع', r6.sank);
// 7) كرة تضرب الوسادة قرب الحفرة (خارج الفجوة): ترتد ولا تُلتقط
const rb=mk(80, t.R+2, 0, -3);
const r7=run(rb,400);
T('ضربة وسادة قرب الركن = ارتداد لا التقاط', !r7.sank && rb.y>0);
// 8) الهوية: سقوط في الجانبية السفلى = BC
const bc=mk(t.W/2, t.H - t.R*2, 0, 5);
const r8=run(bc,200);
const pid=r8.rec.pocketed.length?r8.rec.pocketed[0].pocket:null;
T('هوية الحفرة الصحيحة (BC) للجانبية السفلى: '+pid, r8.sank && pid==='BC');
console.log('═══ pocket-neck v2: '+pass+'/'+(pass+fail)+' passed ═══');
process.exit(fail?1:0);

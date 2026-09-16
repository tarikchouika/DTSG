/* اختبار headless: blTimerTick + blAutoShot ينفذان ضربة عند نفاد الوقت */
const fs=require('fs'),vm=require('vm');
const els={};
function mkEl2(){return{style:{},classList:{add:()=>{},remove:()=>{},toggle:()=>{}},textContent:""};}
function mkEl(){return{value:75,textContent:'',hidden:false,disabled:false,innerHTML:'',style:{},classList:{add:()=>{},remove:()=>{},toggle:()=>{}},setAttribute:()=>{},getAttribute:()=>null,getBoundingClientRect:()=>({width:800,height:450,left:0,top:0}),getContext:()=>({scale:()=>{},clearRect:()=>{},save:()=>{},restore:()=>{},beginPath:()=>{},arc:()=>{},fill:()=>{},stroke:()=>{},moveTo:()=>{},lineTo:()=>{},closePath:()=>{},fillRect:()=>{},strokeRect:()=>{},translate:()=>{},rotate:()=>{},setLineDash:()=>{},createLinearGradient:()=>({addColorStop:()=>{}}),createRadialGradient:()=>({addColorStop:()=>{}}),ellipse:()=>{},quadraticCurveTo:()=>{},fillText:()=>{},measureText:()=>({width:10})}),addEventListener:()=>{},closest:()=>null,querySelector:()=>mkEl2(),style:{setProperty:()=>{}},querySelectorAll:()=>[],appendChild:()=>{},insertBefore:()=>{},contains:()=>false,_k:null};}
const doc={getElementById:(id)=>{if(!els[id])els[id]=mkEl();return els[id];},querySelectorAll:()=>[],createElement:()=>mkEl(),body:{classList:{add:()=>{},remove:()=>{}}}};
const ctx={console,Date,Math,JSON,Set,Map,Array,Object,Number,String,performance:{now:()=>Date.now()},
  setTimeout:(fn)=>fn(),clearTimeout:()=>{},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},
  document:doc,window:{},toast:()=>{},T:(k)=>k,SND:{},localStorage:{getItem:()=>null,setItem:()=>{}}};
ctx.window=ctx; ctx.addEventListener=()=>{}; ctx.removeEventListener=()=>{}; ctx.ResizeObserver=function(){this.observe=()=>{};this.disconnect=()=>{};};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..')+'/js/games/billiards-physics.js','utf8'),ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..')+'/js/games/billiards-rules.js','utf8'),ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..')+'/js/games/billiards.js','utf8'),ctx);
const script=`
window._currentGameId="bl8";
initBilliards();
BILLIARDS.turnTimer=30;
billiardsStart("local");
var S=BILLIARDS.G.S;
var histBefore=S.history.length;
blTimerTick(1000);
console.log("timerLeft init:", BILLIARDS.timerLeft);
blTimerTick(1000+31*1000);
console.log("phase after timeout:", S.phase, "| history:", histBefore, "->", S.history.length);
var guard=0;
while(S.phase==="SHOT" && guard++<20000){BILLIARDS.G.stepPhysics();if(!BILLIARDS.G.shotRunning()){BILLIARDS.G.resolve();break;}}
console.log("resolved phase:", S.phase, "| history:", S.history.length, "| active:", S.active);
billiardsSetTimer(10); console.log("clamp low ->", BILLIARDS.turnTimer);
billiardsSetTimer(500); console.log("clamp high ->", BILLIARDS.turnTimer);
billiardsSetTimer(120); console.log("normal ->", BILLIARDS.turnTimer);
/* golvazor: مع أنونص — التلقائي يختار حفرة ثم يضرب */
window._currentGameId="blgv";
initBilliards();
BILLIARDS.turnTimer=30; BILLIARDS.gvFinish="ANNONCE";
billiardsStart("local");
var S2=BILLIARDS.G.S;
S2.breakShot=false; S2.open=false; S2.phase="AIM";
S2.groups[0]="BLACK"; S2.groups[1]="BLACK";
for (var i=0;i<S2.balls.length;i++){var b=S2.balls[i]; if(b.type!=="CUE"&&b.type!=="BLACK") b.status="POCKETED";}
BILLIARDS._timerKey=null;
blTimerTick(500000);
blTimerTick(500000+31*1000);
console.log("gv annonce auto: phase:", S2.phase, "| annPocket[0]:", S2.annPocket?S2.annPocket[0]:"n/a");
`;
vm.runInContext(script,ctx);

/* اللاعب الآلي + المرونة: مضيف + بوتات. المضيف ينقطع ويعود → تُستعاد الجولة ويواصل البوت. */
const { chromium } = require('playwright');
const BASE='http://localhost:3000/';
async function wait(p,fn,t=15000,a){const s=Date.now();let e;while(Date.now()-s<t){try{const r=await p.evaluate(fn,a);if(r)return r;}catch(x){e=x;}await p.waitForTimeout(200);}throw new Error('timeout'+(e?' '+e.message:''));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function snap(){return()=>{const ad=window.RamiAdapter;if(!ad||!ad.game)return null;const g=ad.game,rm=g.roundManager;return JSON.stringify({cur:rm.currentPlayerIndex,discard:rm.discardPile.length,hands:g.players.map(p=>p.hand.length),bots:g.players.filter(p=>p.isBot).length,seed:g.seed});};}
async function setup(ctx,u){const rr=await ctx.request.post(BASE+'api/register',{data:{username:u,password:'pw123456'}});if(!((await rr.json().catch(()=>({})))||{}).ok)await ctx.request.post(BASE+'api/login',{data:{username:u,password:'pw123456'}});const p=await ctx.newPage();const er=[];p.on('pageerror',e=>er.push(e.message.slice(0,80)));p._er=er;await p.goto(BASE,{waitUntil:'domcontentloaded'});await wait(p,()=>!!(typeof AUTH!=='undefined'&&AUTH.user&&typeof Rooms!=='undefined'));await p.waitForTimeout(600);return p;}
const ok=(c,m)=>console.log((c?'  ✓ ':'  ✗ ')+m);
(async()=>{
  const U=Date.now().toString().slice(-5);
  const results=[];
  console.log('\n[BotRes] مضيف + بوتات: انقطاع المضيف ثم العودة');
  {
    const b=await chromium.launch();const ctx=await b.newContext();
    const A=await setup(ctx,'br'+U);
    await A.evaluate(()=>openGame('rm'));await wait(A,()=>!!window.RamiAdapter);
    await A.evaluate(()=>Rooms.createRoom('rm', 10));await wait(A,()=>!!(Rooms.state&&Rooms.state.code));
    const rid=await A.evaluate(()=>Rooms.state.id);
    // بوتّان
    await ctx.request.post(BASE+'api/rooms/addBot',{data:{room_id:rid}});
    await ctx.request.post(BASE+'api/rooms/addBot',{data:{room_id:rid}});
    await wait(A,()=>Rooms.state.players.filter(p=>p.isBot).length>=2);
    await A.evaluate(()=>Rooms.setReady(true));await wait(A,()=>Rooms.state.players.every(p=>p.ready));
    await A.evaluate(()=>Rooms.startGame());
    await wait(A,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'),15000);
    const bots=await A.evaluate(()=>RamiAdapter.game.players.filter(p=>p.isBot).length);
    ok(bots>=2,'غرفة فيها بوتّان ('+bots+')');
    // المضيف يلعب دوراً ثم البوتات
    const c0=await A.evaluate(()=>{const g=RamiAdapter.game;g.normalizeTurnPhase();const p=g.roundManager.getCurrentPlayer();const m=g.getLegalMoves(p.id).filter(x=>x.type==='discard');return m.length?m[0].cardId:null;});
    if(c0!=null)await A.evaluate(c=>ramiAction('discard',c),c0);
    await sleep(2500);
    const snap1=await A.evaluate(snap());
    console.log('  قبل القطع:',snap1);
    // القطع والعودة
    await A.close();await sleep(1500);
    const A2=await ctx.newPage();await A2.goto(BASE,{waitUntil:'domcontentloaded'});
    await wait(A2,()=>!!(typeof AUTH!=='undefined'&&AUTH.user));await A2.evaluate(()=>openGame('rm'));
    const rebuilt=await wait(A2,()=>(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING')?'ok':null,15000);
    ok(!!rebuilt,'الجولة أُعيد بناؤها بعد العودة');
    const snap2b=await A2.evaluate(snap());
    console.log('  بعد العودة :',snap2b);
    ok(snap1===snap2b,'الحالة مُستعادة كاملةً (البذرة+الأيدي+المرموق)');
    // البوتات تواصل بعد العودة (المضيف سائقها)
    const d0=await A2.evaluate(()=>RamiAdapter.game.roundManager.discardPile.length);
    // إن كان دور المضيف: العب دوراً كاملاً (سحب إن لزم + رمي) لتفعيل البوتات
    const myTurn=await A2.evaluate(()=>RamiAdapter.game.roundManager.currentPlayerIndex===RamiAdapter.myPlayerId);
    if(myTurn){
      const ph=await A2.evaluate(()=>RamiAdapter.game.roundManager.turnPhase);
      if(ph==='WAITING_DRAW'){await A2.evaluate(()=>ramiAction('draw_deck'));await sleep(500);}
      const c1=await A2.evaluate(()=>{const g=RamiAdapter.game;g.normalizeTurnPhase();const p=g.roundManager.getCurrentPlayer();const m=g.getLegalMoves(p.id).filter(x=>x.type==='discard');return m.length?m[0].cardId:null;});
      if(c1!=null)await A2.evaluate(c=>ramiAction('discard',c),c1);
    }
    const resumed=await wait(A2,(d)=>RamiAdapter.game.roundManager.discardPile.length>d?'ok':null,12000,d0);
    ok(!!resumed,'البوتات واصلت اللعب بعد عودة المضيف');
    const er=(A2._er||[]).filter(e=>!/404|Failed/i.test(e));
    results.push(['room has 2 bots', bots>=2]);
    results.push(['game rebuilt after reconnect', !!rebuilt]);
    results.push(['state fully restored', snap1===snap2b]);
    results.push(['bots resumed after reconnect', !!resumed]);
    results.push(['no JS errors ('+er.length+')', er.length===0]);
    await b.close();
  }
  console.log('\n═══ النتائج ═══');
  let pass=0;for(const[m,c]of results){console.log((c?'✅ ':'❌ ')+m);if(c)pass++;}
  console.log('\nالنتيجة: '+pass+' نجح / '+(results.length-pass)+' فشل');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

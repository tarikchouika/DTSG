/* اختبار اللاعب الآلي في الغرفة الجماعية:
   (أ) مضيف + بوت واحد: البوت يلعب وفق القواعد وتتقدّم الجولة.
   (ب) مضيف + بوت + ضيف: الضيف يرى حركات البوت متطابقة (تزامن). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
async function wait(p,fn,t=15000,a){const s=Date.now();let e;while(Date.now()-s<t){try{const r=await p.evaluate(fn,a);if(r)return r;}catch(x){e=x;}await p.waitForTimeout(200);}throw new Error('timeout'+(e?' '+e.message:''));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function snapFn(){return()=>{const ad=window.RamiAdapter;if(!ad||!ad.game)return null;const g=ad.game,rm=g.roundManager;return JSON.stringify({cur:rm.currentPlayerIndex,phase:rm.turnPhase,drawLen:rm.drawPile.length,discardLen:rm.discardPile.length,discardTop:rm.discardPile.length?rm.discardPile[rm.discardPile.length-1].id:null,hands:g.players.map(p=>p.hand.length),melds:rm.tableMelds.length,bots:g.players.filter(p=>p.isBot).length,seed:g.seed});};}
async function setup(ctx,u){const rr=await ctx.request.post(BASE+'api/register',{data:{username:u,password:'pw123456'}});if(!((await rr.json().catch(()=>({})))||{}).ok)await ctx.request.post(BASE+'api/login',{data:{username:u,password:'pw123456'}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p._errs=errs;await p.goto(BASE,{waitUntil:'domcontentloaded'});await wait(p,()=>!!(typeof AUTH!=='undefined'&&AUTH.user&&typeof Rooms!=='undefined'));await p.waitForTimeout(700);return p;}

(async()=>{
  const U=Date.now().toString().slice(-5);
  const results=[];

  /* ═══ (أ) مضيف + بوت ═══ */
  console.log('\n[Bot-A] مضيف + بوت واحد — البوت يلعب قانونياً');
  {
    const b=await chromium.launch();const ctx=await b.newContext();
    const A=await setup(ctx,'hb'+U+'a');
    await A.evaluate(()=>openGame('rm'));await wait(A,()=>!!window.RamiAdapter);
    await A.evaluate(()=>Rooms.createRoom('rm', 10));await wait(A,()=>!!(Rooms.state&&Rooms.state.code));
    const rid=await A.evaluate(()=>Rooms.state.id);
    // أضف بوتاً
    await ctx.request.post(BASE+'api/rooms/addBot',{data:{room_id:rid}});
    await wait(A,()=>Rooms.state.players.some(p=>p.isBot),8000);
    const pc=await A.evaluate(()=>Rooms.state.players.length);
    ok(true,'البوت أُضيف للغرفة (لاعبون='+pc+')');
    await A.evaluate(()=>Rooms.setReady(true));
    await wait(A,()=>Rooms.state.players.every(p=>p.ready));
    await A.evaluate(()=>Rooms.startGame());
    await wait(A,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'),15000);
    const bots=await A.evaluate(()=>RamiAdapter.game.players.filter(p=>p.isBot).length);
    ok(bots===1,'المحرّك أنشأ بوتاً واحداً ('+bots+')');
    // لعب المضيف ثم انتظر دور البوت وحركته
    const firstCur=await A.evaluate(()=>RamiAdapter.game.roundManager.currentPlayerIndex);
    // إن كان دور المضيف: ارمِ ورقة لتمرير الدور للبوت
    if(firstCur===0){
      const c=await A.evaluate(()=>{const g=RamiAdapter.game;g.normalizeTurnPhase();const p=g.roundManager.getCurrentPlayer();const m=g.getLegalMoves(p.id).filter(x=>x.type==='discard');return m.length?m[0].cardId:null;});
      if(c!=null)await A.evaluate(cc=>ramiAction('discard',cc),c);
    }
    // انتظر أن يلعب البوت (المرموق ينمو أو الدور يعود للمضيف)
    const discard0=await A.evaluate(()=>RamiAdapter.game.roundManager.discardPile.length);
    const botPlayed=await wait(A,(d)=>{const rm=RamiAdapter.game.roundManager;return rm.discardPile.length>d?'ok':null;},12000,discard0);
    ok(!!botPlayed,'البوت لعب حركته (المرموق نما) — لا تجمّد');
    // تحقّق من قانونية المجموعات على الطاولة
    const meldsValid=await A.evaluate(()=>{const g=RamiAdapter.game,r=g.rules;for(const m of g.roundManager.tableMelds){if(m.type===1&&!r.isValidSet(m.cards,true))return false;if(m.type===2&&!r.isValidSequence(m.cards,true))return false;}return true;});
    ok(meldsValid,'مجموعات البوت على الطاولة قانونية');
    const live=await A.evaluate(()=>RamiAdapter.game.gamePhase==='PLAYING'?'live':'end');
    ok(live==='live','الجولة ما زالت حيّة');
    const ea=A._errs.filter(e=>!/404|Failed to load/i.test(e));
    results.push(['A: bot added to room', true]);
    results.push(['A: engine created bot', bots===1]);
    results.push(['A: bot played its turn', !!botPlayed]);
    results.push(['A: bot melds legal', meldsValid]);
    results.push(['A: no JS errors ('+ea.length+')', ea.length===0]);
    await b.close();
  }

  /* ═══ (ب) مضيف + بوت + ضيف (تزامن) ═══ */
  console.log('\n[Bot-B] مضيف + بوت + ضيف — الضيف يرى حركات البوت متطابقة');
  {
    const b=await chromium.launch();const cA=await b.newContext(),cB=await b.newContext();
    const A=await setup(cA,'sb'+U+'a'),B=await setup(cB,'sb'+U+'b');
    await A.evaluate(()=>openGame('rm'));await B.evaluate(()=>openGame('rm'));
    await wait(A,()=>!!window.RamiAdapter);await wait(B,()=>!!window.RamiAdapter);
    await A.evaluate(()=>Rooms.createRoom('rm', 10));await wait(A,()=>!!(Rooms.state&&Rooms.state.code));
    const code=await A.evaluate(()=>Rooms.state.code),rid=await A.evaluate(()=>Rooms.state.id);
    await cA.request.post(BASE+'api/rooms/addBot',{data:{room_id:rid}});  // بوت قبل الانضمام
    await wait(A,()=>Rooms.state.players.some(p=>p.isBot));
    await B.evaluate(c=>Rooms.joinRoom(c),code);
    await wait(A,()=>Rooms.state.players.length>=3);await wait(B,()=>Rooms.state.players.length>=3);
    await A.evaluate(()=>Rooms.setReady(true));await B.evaluate(()=>Rooms.setReady(true));
    await wait(A,()=>Rooms.state.players.every(p=>p.ready));
    await A.evaluate(()=>Rooms.startGame());
    await wait(A,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'),15000);
    await wait(B,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'),15000);
    const botsA=await A.evaluate(()=>RamiAdapter.game.players.filter(p=>p.isBot).length);
    ok(botsA>=1,'المحرك أنشأ البوت عند المضيف والضيف ('+botsA+')');
    // دع الجولة تجرى عدة أدوار (بوت يلعب) ثم قارن الحالة
    await sleep(6000);
    const sA=await A.evaluate(snapFn()),sB=await B.evaluate(snapFn());
    console.log('  مضيف:',sA);console.log('  ضيف :',sB);
    ok(sA===sB,'حالة المضيف والضيف متطابقة (البوت متزامن)');
    const ea=A._errs.filter(e=>!/404|Failed to load/i.test(e)).length;
    const eb=B._errs.filter(e=>!/404|Failed to load/i.test(e)).length;
    results.push(['B: bots created at both', botsA>=1]);
    results.push(['B: host==guest state (sync)', sA===sB]);
    results.push(['B: no JS errors A('+(await A.evaluate(()=>0)||ea)+')/B('+eb+')', ea===0&&eb===0]);
    await b.close();
  }

  function ok(c,m){console.log((c?'  ✓ ':'  ✗ ')+m);}
  console.log('\n═══ النتائج ═══');
  let pass=0;for(const[m,c]of results){console.log((c?'✅ ':'❌ ')+m);if(c)pass++;}
  console.log('\nالنتيجة: '+pass+' نجح / '+(results.length-pass)+' فشل');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

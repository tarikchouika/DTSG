/* تدقيق تدفّق اللاعب الآلي: (أ) لاعب فردي ضد الآلي لا يزال يعمل،
   (ب) غرفة تدريب ضد الآلي عبر الزر، (ج) زر «أضف آلياً» في غرفة عادية. */
const { chromium } = require('playwright');
const BASE='http://localhost:3000/';
async function wait(p,fn,t=15000,a){const s=Date.now();let e;while(Date.now()-s<t){try{const r=await p.evaluate(fn,a);if(r)return r;}catch(x){e=x;}await p.waitForTimeout(200);}throw new Error('timeout'+(e?' '+e.message:''));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(ctx,u){const rr=await ctx.request.post(BASE+'api/register',{data:{username:u,password:'pw123456'}});if(!((await rr.json().catch(()=>({})))||{}).ok)await ctx.request.post(BASE+'api/login',{data:{username:u,password:'pw123456'}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,100)));p._errs=errs;await p.goto(BASE,{waitUntil:'domcontentloaded'});await wait(p,()=>!!(typeof AUTH!=='undefined'&&AUTH.user&&typeof Rooms!=='undefined'));await p.waitForTimeout(600);return p;}
const ok=(c,m)=>console.log((c?'  ✓ ':'  ✗ ')+m);
(async()=>{
  const U=Date.now().toString().slice(-5);
  const results=[];

  // (أ) لاعب فردي ضد الآلي
  console.log('\n[Flow-A] لاعب فردي ضد الآلي (بدء عادي)');
  {
    const b=await chromium.launch();const ctx=await b.newContext();
    const A=await setup(ctx,'fa'+U);
    await A.evaluate(()=>{if(typeof ST!=='undefined')ST.gold=9000;if(typeof save==='function')save();});
    await A.evaluate(()=>openGame('rm'));await wait(A,()=>!!window.RamiAdapter);
    await A.evaluate(()=>ramiStartGame());
    await wait(A,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'),12000);
    const bots=await A.evaluate(()=>RamiAdapter.game.players.filter(p=>p.isBot).length);
    ok(bots>=1,'لاعب فردي: بوت واحد على الأقل ('+bots+')');
    results.push(['A: single-player vs AI works', bots>=1]);
    await b.close();
  }

  // (ب) غرفة تدريب ضد الآلي (الزر)
  console.log('\n[Flow-B] غرفة تدريب ضد الآلي عبر زر الآلي');
  {
    const b=await chromium.launch();const ctx=await b.newContext();
    const A=await setup(ctx,'fb'+U);
    await A.evaluate(()=>openGame('rm'));await wait(A,()=>!!window.RamiAdapter);
    await wait(A,()=>{const ab=document.getElementById('aiBtn');return ab&&ab.style.display!=='none';});
    await A.evaluate(()=>Rooms.practiceVsAi('rm'));
    await wait(A,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'),20000);
    const bots=await A.evaluate(()=>RamiAdapter.game.players.filter(p=>p.isBot).length);
    const humans=await A.evaluate(()=>RamiAdapter.game.players.filter(p=>!p.isBot).length);
    ok(humans===1&&bots>=1,'غرفة تدريب: لاعب بشري واحد + بوت ('+bots+')');
    // اللاعب البشري يلعب دوراً أولاً (دوره يبدأ أولاً في الطالاج) ليمرّر الدور للبوت
    const c0=await A.evaluate(()=>{const g=RamiAdapter.game;g.normalizeTurnPhase();const p=g.roundManager.getCurrentPlayer();const m=g.getLegalMoves(p.id).filter(x=>x.type==='discard');return m.length?m[0].cardId:null;});
    if(c0!=null)await A.evaluate(c=>ramiAction('discard',c),c0);
    await sleep(800);
    const d0=await A.evaluate(()=>RamiAdapter.game.roundManager.discardPile.length);
    const played=await wait(A,(d)=>RamiAdapter.game.roundManager.discardPile.length>d?'ok':null,14000,d0);
    ok(!!played,'البوت لعب في غرفة التدريب');
    const ea=A._errs.filter(e=>!/404|Failed to load/i.test(e));
    ok(ea.length===0,'لا أخطاء JS ('+ea.length+')');
    results.push(['B: practice room vs AI starts', humans===1&&bots>=1]);
    results.push(['B: bot plays in practice room', !!played]);
    results.push(['B: no JS errors', ea.length===0]);
    await b.close();
  }

  // (ج) زر «أضف آلياً» في غرفة عادية
  console.log('\n[Flow-C] زر «أضف آلياً» في الغرفة العادية');
  {
    const b=await chromium.launch();const ctx=await b.newContext();
    const A=await setup(ctx,'fc'+U);
    await A.evaluate(()=>openGame('rm'));await wait(A,()=>!!window.RamiAdapter);
    await A.evaluate(()=>Rooms.createRoom('rm', 10));await wait(A,()=>!!(Rooms.state&&Rooms.state.code));
    await A.evaluate(()=>Rooms.openModal());
    await wait(A,()=>{const b2=document.getElementById('roomBody');return b2&&b2.innerHTML.indexOf('Rooms.addBot')!==-1;});
    // انقر زر إضافة آلي
    await A.evaluate(()=>{ var btns=document.querySelectorAll('#roomBody button'); for(var i=0;i<btns.length;i++){ if(btns[i].getAttribute('onclick')&&btns[i].getAttribute('onclick').indexOf('Rooms.addBot')!==-1){ btns[i].click(); break; } } });
    await wait(A,()=>Rooms.state.players.some(p=>p.isBot),8000);
    const botInRoom=await A.evaluate(()=>Rooms.state.players.some(p=>p.isBot));
    ok(botInRoom,'البوت ظهر في الغرفة بعد النقر');
    results.push(['C: addBot button adds bot to room', botInRoom]);
    await b.close();
  }

  console.log('\n═══ النتائج ═══');
  let pass=0;for(const[m,c]of results){console.log((c?'✅ ':'❌ ')+m);if(c)pass++;}
  console.log('\nالنتيجة: '+pass+' نجح / '+(results.length-pass)+' فشل');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

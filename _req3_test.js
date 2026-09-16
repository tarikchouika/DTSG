/* اختبار البند 3: تصويت نهاية المباراة.
   - لوحة التصويت تظهر للاعبين (موافقة/رفض) وللمتفرج (قراءة فقط).
   - موافقة+رفض = لا مباراة جديدة. الموافقة+المغادرة = لا مباراة جديدة.
   - موافقة الجميع = مباراة جديدة بالموافقين برهان المُنشئ (بذرة جديدة). */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000/';
const U = Date.now().toString().slice(-5);
async function wait(p, fn, t=15000, arg){const s=Date.now();let e;while(Date.now()-s<t){try{const r=await p.evaluate(fn,arg);if(r)return r;}catch(x){e=x;}await p.waitForTimeout(200);}throw new Error('timeout'+(e?' '+e.message:''));}
async function setup(ctx,u){await ctx.request.post(BASE+'api/register',{data:{username:u,password:'p'}}).then(r=>r.json()).catch(()=>{});await ctx.request.post(BASE+'api/login',{data:{username:u,password:'p'}});const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg._errs=errs;await pg.goto(BASE,{waitUntil:'domcontentloaded'});await wait(pg,()=>!!(typeof AUTH!=='undefined'&&AUTH.user&&typeof Rooms!=='undefined'));await pg.waitForTimeout(800);return pg;}

(async()=>{
  let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);};};

  async function makeRoom(cA,cB,cC){
    const A=await setup(cA,'m3o'+U+Math.random().toString().slice(2,5)),B=await setup(cB,'m3p'+U+Math.random().toString().slice(2,5));
    let C=null; if(cC) C=await setup(cC,'m3s'+U+Math.random().toString().slice(2,5));
    const players=[A,B]; if(C) players.push(C);
    for(const p of players) await p.evaluate(()=>openGame('rm'));
    await wait(A,()=>!!window.RamiAdapter);
    const rr=await cA.request.post(BASE+'api/rooms',{data:{game_id:'rm',max_players:2}});
    const rj=(await rr.json())||{};
    await A.evaluate(r=>{Rooms.state=r;Rooms.render();},rj.room);
    await wait(A,()=>!!(Rooms.state&&Rooms.state.code));
    const code=await A.evaluate(()=>Rooms.state.code);
    await B.evaluate(c=>Rooms.joinRoom(c),code);
    if(C) await C.evaluate(c=>Rooms.joinRoom(c),code);
    if(C) await wait(A,()=>!!(Rooms.state&&Rooms.state.players.some(p=>p.spectate)));
    await A.evaluate(()=>Rooms.setReady(true));await B.evaluate(()=>Rooms.setReady(true));
    await wait(A,()=>Rooms.state.players.filter(p=>!p.spectate).every(p=>p.ready));
    await A.evaluate(()=>Rooms.startGame());
    await wait(A,()=>!!(RamiAdapter.multiplayer&&RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'));
    await wait(B,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'));
    return {A,B,C};
  }
  // helper: فرض نهاية المباراة على عميل وإظهار لوحة التصويت
  async function forceMatchEnd(pg){
    await pg.evaluate(()=>{ if(RamiAdapter&&RamiAdapter.game){ RamiAdapter.game.gamePhase='MATCH_END'; RamiAdapter._endRoundUI(); } });
  }

  console.log('\n[3-A] لوحة التصويت: لاعب يرى زرّي موافقة/رفض، متفرج يرى قراءة فقط');
  {
    const b1=await chromium.launch();
    const cA=b1.newContext(),cB=b1.newContext(),cC=b1.newContext();
    const {A,B,C}=await makeRoom(await cA,await cB,await cC);
    await forceMatchEnd(A);                 // المُنشئ يُطلق startRematch
    await wait(A,()=>!!(Rooms.state&&Rooms.state.rematch&&!Rooms.state.rematch.resolved),8000);
    await forceMatchEnd(B); await forceMatchEnd(C);
    await wait(B,()=>!!(Rooms.state&&Rooms.state.rematch),8000);
    await wait(C,()=>!!(Rooms.state&&Rooms.state.rematch),8000);
    ok(await A.evaluate(()=>!!document.querySelector('.rami-rematch-box')),'المُنشئ: لوحة التصويت ظاهرة');
    ok(await A.evaluate(()=>!!(document.querySelector('.rami-rematch-box button'))),'المُنشئ: يرى زرّي موافقة/رفض');
    ok(await A.evaluate(()=>(document.querySelectorAll('.rami-rematch-row').length)>=2),'المُنشئ: سرد المشاركين (≥2)');
    ok(await C.evaluate(()=>{const b=document.querySelector('.rami-rematch-box');return !!(b&&!b.querySelector('button'));}),'المتفرج: قراءة فقط (بلا أزرار)');
    await b1.close();
  }

  console.log('\n[3-B] موافقة + رفض = لا مباراة جديدة');
  {
    const b2=await chromium.launch();
    const cA=b2.newContext(),cB=b2.newContext();
    const A=await setup(await cA,'rfo'+U+Math.random().toString().slice(2,5)),B=await setup(await cB,'rfp'+U+Math.random().toString().slice(2,5));
    for(const p of[A,B])await p.evaluate(()=>openGame('rm'));
    await wait(A,()=>!!window.RamiAdapter);
    const rr=await(await cA).request.post(BASE+'api/rooms',{data:{game_id:'rm',max_players:2}});const rj=(await rr.json())||{};
    await A.evaluate(r=>{Rooms.state=r;Rooms.render();},rj.room);await wait(A,()=>!!Rooms.state.code);const code=await A.evaluate(()=>Rooms.state.code);
    await B.evaluate(c=>Rooms.joinRoom(c),code);
    await A.evaluate(()=>Rooms.setReady(true));await B.evaluate(()=>Rooms.setReady(true));
    await wait(A,()=>Rooms.state.players.filter(p=>!p.spectate).every(p=>p.ready));
    await A.evaluate(()=>Rooms.startGame());
    await wait(A,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'));
    await A.evaluate(()=>Rooms.startRematch());
    await wait(A,()=>!!(Rooms.state.rematch&&!Rooms.state.rematch.resolved),8000);
    await A.evaluate(()=>Rooms.voteRematch('agree'));
    await B.evaluate(()=>Rooms.voteRematch('refuse'));
    const resolved=await wait(A,()=>(Rooms.state.rematch&&Rooms.state.rematch.resolved)?Rooms.state.rematch:null,8000);
    ok(resolved&&!resolved.rematch,'موافقة+رفض ⇒ لا مباراة جديدة (rematch=false)');
    ok(await A.evaluate(()=>Rooms.state.status==='waiting'),'الغرفة بقيت في الانتظار (لم تبدأ مباراة)');
    await b2.close();
  }

  console.log('\n[3-C] موافقة الجميع = مباراة جديدة بالموافقين برهان المُنشئ');
  {
    const b3=await chromium.launch();
    const cA=b3.newContext(),cB=b3.newContext();
    const A=await setup(await cA,'ro'+U+Math.random().toString().slice(2,5)),B=await setup(await cB,'rp'+U+Math.random().toString().slice(2,5));
    for(const p of[A,B])await p.evaluate(()=>openGame('rm'));
    await wait(A,()=>!!window.RamiAdapter);
    const rr=await(await cA).request.post(BASE+'api/rooms',{data:{game_id:'rm',max_players:2}});const rj=(await rr.json())||{};
    await A.evaluate(r=>{Rooms.state=r;Rooms.render();},rj.room);await wait(A,()=>!!Rooms.state.code);const code=await A.evaluate(()=>Rooms.state.code);
    await B.evaluate(c=>Rooms.joinRoom(c),code);
    await A.evaluate(()=>Rooms.setReady(true));await B.evaluate(()=>Rooms.setReady(true));
    await wait(A,()=>Rooms.state.players.filter(p=>!p.spectate).every(p=>p.ready));
    await A.evaluate(()=>Rooms.startGame());
    await wait(A,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'));
    const seed0=await A.evaluate(()=>RamiAdapter.game.seed);
    await A.evaluate(()=>Rooms.startRematch());
    await wait(A,()=>!!(Rooms.state.rematch&&!Rooms.state.rematch.resolved),8000);
    await A.evaluate(()=>Rooms.voteRematch('agree'));
    await B.evaluate(()=>Rooms.voteRematch('agree'));
    // الحلّ ⇒ status=playing ⇒ إعادة تهيئة مباراة جديدة (بذرة جديدة)
    await wait(A,(s)=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'&&RamiAdapter.game.seed!==s),12000,seed0);
    const seedA=await A.evaluate(()=>RamiAdapter.game.seed);
    await wait(B,(s)=>!!(RamiAdapter.game&&RamiAdapter.game.seed===s),12000,seedA);
    ok(seedA!==seed0,'بدأت مباراة جديدة (بذرة جديدة) للموافقين');
    ok(await B.evaluate((s)=>RamiAdapter.game.seed===s, seedA),'الموافقان تلقيا نفس البذرة (مزامنة)');
    ok(await A.evaluate(()=>Rooms.state.status==='playing'),'حالة الغرفة عادت للعب (مباراة جديدة)');
    await b3.close();
  }

  console.log('\n[3-D] موافقة + مغادرة (=رفض) = لا مباراة جديدة');
  {
    const b4=await chromium.launch();
    const cA=b4.newContext(),cB=b4.newContext();
    const A=await setup(await cA,'lo'+U+Math.random().toString().slice(2,5)),B=await setup(await cB,'lp'+U+Math.random().toString().slice(2,5));
    for(const p of[A,B])await p.evaluate(()=>openGame('rm'));
    await wait(A,()=>!!window.RamiAdapter);
    const rr=await(await cA).request.post(BASE+'api/rooms',{data:{game_id:'rm',max_players:2}});const rj=(await rr.json())||{};
    await A.evaluate(r=>{Rooms.state=r;Rooms.render();},rj.room);await wait(A,()=>!!Rooms.state.code);const code=await A.evaluate(()=>Rooms.state.code),rid=await A.evaluate(()=>Rooms.state.id);
    await B.evaluate(c=>Rooms.joinRoom(c),code);
    await A.evaluate(()=>Rooms.setReady(true));await B.evaluate(()=>Rooms.setReady(true));
    await wait(A,()=>Rooms.state.players.filter(p=>!p.spectate).every(p=>p.ready));
    await A.evaluate(()=>Rooms.startGame());
    await wait(A,()=>!!(RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'));
    await A.evaluate(()=>Rooms.startRematch());
    await wait(A,()=>!!(Rooms.state.rematch&&!Rooms.state.rematch.resolved),8000);
    await A.evaluate(()=>Rooms.voteRematch('agree'));
    await (await cB).request.post(BASE+'api/rooms/leave',{data:{room_id:rid}}); // B يغادر = رفض
    const resolved=await wait(A,()=>(Rooms.state.rematch&&Rooms.state.rematch.resolved)?Rooms.state.rematch:null,8000);
    ok(resolved&&!resolved.rematch,'موافقة+مغادرة ⇒ لا مباراة جديدة');
    await b4.close();
  }

  console.log('\nالنتيجة: '+pass+' نجح / '+fail+' فشل');
  process.exit(fail?1:0);
})();

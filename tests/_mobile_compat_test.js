process.chdir(require('path').resolve(__dirname, '..'));
/* تدقيق توافق الهاتف/سطح المكتب: رامي جماعي يُحمَّل ويعمل على أبعاد الهاتف
   والسطح المكتب دون أخطاء، ويدعم إعادة الاتصال على كليهما. */
const { chromium, devices } = require('playwright');
const BASE = process.env.QA_BASE || 'http://localhost:4173/';   /* [v2.49-QABASE] */
async function wait(p,fn,t=15000,a){const s=Date.now();let e;while(Date.now()-s<t){try{const r=await p.evaluate(fn,a);if(r)return r;}catch(x){e=x;}await p.waitForTimeout(200);}throw new Error('timeout'+(e?' '+e.message:''));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(ctx,u){const rr=await ctx.request.post(BASE+'api/register',{data:{username:u,password:'pw123456'}});if(!((await rr.json().catch(()=>({})))||{}).ok)await ctx.request.post(BASE+'api/login',{data:{username:u,password:'pw123456'}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE:'+m.text().slice(0,60));});p._errs=errs;await p.goto(BASE,{waitUntil:'domcontentloaded'});await wait(p,()=>!!(typeof AUTH!=='undefined'&&AUTH.user&&typeof Rooms!=='undefined'));await p.waitForTimeout(700);return p;}
(async()=>{
  const U=Date.now().toString().slice(-5);
  const results=[];
  for (const [label, vp] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844,isMobile:true,hasTouch:true}]]) {
    const b=await chromium.launch();
    const cA=await b.newContext({viewport:vp,isMobile:vp.isMobile,hasTouch:vp.hasTouch});
    const cB=await b.newContext({viewport:vp,isMobile:vp.isMobile,hasTouch:vp.hasTouch});
    const A=await setup(cA,'mc'+label+U+'a'),B=await setup(cB,'mc'+label+U+'b');
    await A.evaluate(()=>openGame('rm'));await B.evaluate(()=>openGame('rm'));
    await wait(A,()=>!!window.RamiAdapter);await wait(B,()=>!!window.RamiAdapter);
    await A.evaluate(()=>Rooms.createRoom('rm', 10));await wait(A,()=>!!(Rooms.state&&Rooms.state.code));
    const code=await A.evaluate(()=>Rooms.state.code);
    await B.evaluate(c=>Rooms.joinRoom(c),code);
    await wait(A,()=>!!(Rooms.state&&Rooms.state.players.length>=2));
    await A.evaluate(()=>Rooms.setReady(true));await B.evaluate(()=>Rooms.setReady(true));
    await wait(A,()=>!!(Rooms.state&&Rooms.state.players.every(p=>p.ready)));
    await A.evaluate(()=>Rooms.startGame());
    await wait(A,()=>!!(RamiAdapter.multiplayer&&RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'),20000);
    await wait(B,()=>!!(RamiAdapter.multiplayer&&RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING'),20000);
    // تحقّق من عدم تجاوز المحتوى عرض الشاشة (لا فيضان أفقي)
    const noOverflow = await A.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2);
    // وجود عناصر اللوحة الأساسية
    const hasStage = await A.evaluate(()=>!!document.querySelector('.rami-stage,#ramiContainer'));
    results.push([label+': game loads PLAYING', true]);
    results.push([label+': no horizontal overflow', noOverflow]);
    results.push([label+': stage present', hasStage]);
    // إعادة اتصال على نفس الإطار
    await B.close();await sleep(1200);
    const B2=await cB.newPage();await B2.goto(BASE,{waitUntil:'domcontentloaded'});
    await wait(B2,()=>!!(typeof AUTH!=='undefined'&&AUTH.user));await B2.evaluate(()=>openGame('rm'));
    const rb=await wait(B2,()=>(RamiAdapter&&RamiAdapter.game&&RamiAdapter.game.gamePhase==='PLAYING')?'ok':null,15000);
    results.push([label+': reconnect rebuilds on viewport', !!rb]);
    const ea=A._errs.filter(e=>!/404|Failed to load resource/i.test(e));
    results.push([label+': no JS errors ('+ea.length+')', ea.length===0]);
    console.log(label+' done — overflow:'+noOverflow+' stage:'+hasStage+' reconnect:'+!!rb+' errs:'+ea.length);
    await b.close();
  }
  console.log('\n═══ توافق الهاتف/سطح المكتب ═══');
  let pass=0;for(const[m,c]of results){console.log((c?'✅ ':'❌ ')+m);if(c)pass++;}
  console.log('\nالنتيجة: '+pass+' نجح / '+(results.length-pass)+' فشل');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

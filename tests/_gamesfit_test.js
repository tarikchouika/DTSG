process.chdir(require('path').resolve(__dirname, '..'));
/* تحقّق من أن جميع الألعاب (عدا الرامي) تملأ الإطار بالكامل بلا قصّ على الهاتف وسطح المكتب. */
const { chromium } = require('playwright');
const BASE='http://localhost:3000/';
async function wait(p,fn,t=12000,a){const s=Date.now();let e;while(Date.now()-s<t){try{const r=await p.evaluate(fn,a);if(r)return r;}catch(x){e=x;}await p.waitForTimeout(150);}throw new Error('timeout'+(e?' '+e.message:''));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(ctx,u){const rr=await ctx.request.post(BASE+'api/register',{data:{username:u,password:'pw123456'}});const p=await ctx.newPage();const er=[];p.on('pageerror',e=>er.push(e.message.slice(0,80)));p._er=er;await p.goto(BASE,{waitUntil:'domcontentloaded'});await wait(p,()=>!!(typeof AUTH!=='undefined'&&AUTH.user&&typeof ST!=='undefined'));await p.evaluate(()=>{if(typeof ST!=='undefined')ST.gold=50000;});return p;}
// ألعاب تمثيلية تغطي المحركات المختلفة (كانفاس، ورق، ثلاثية الأبعاد، شبكة)
const GAMES=['pl','wf','hl','mn','dc','cf','ke','bj','sb','rl'];
async function measureFit(page, gid){
  const r=await page.evaluate((id)=>{
    const body=document.getElementById('gamePageBody');
    const stage=body&&body.querySelector('.stage');
    if(!stage) return {err:'no stage'};
    if(typeof fitGameStage==='function') fitGameStage();
    const b=body.getBoundingClientRect();
    const s=stage.getBoundingClientRect();
    const t=stage.style.transform||'';
    // هل المرحلة داخل الإطار؟ (بسماح 2px)
    const inV = s.top >= b.top-2 && s.bottom <= b.bottom+2;
    const inH = s.left >= b.left-2 && s.right <= b.right+2;
    return {
      bodyW: Math.round(b.width), bodyH: Math.round(b.height),
      stageW: Math.round(s.width), stageH: Math.round(s.height),
      top: Math.round(s.top-b.top), bottom: Math.round(s.bottom-b.bottom),
      inV, inH, transform: t.slice(0,40)
    };
  }, gid);
  return r;
}
(async()=>{
  const results=[];
  for (const [label, vp] of [['mobile',{width:390,height:780,isMobile:true,hasTouch:true}],['desktop',{width:1280,height:800}]]) {
    const b=await chromium.launch();
    const ctx=await b.newContext({viewport:vp,isMobile:vp.isMobile,hasTouch:vp.hasTouch});
    for (const gid of GAMES){
      const u='fit'+label+gid+Date.now().toString().slice(-4);
      const page=await setup(ctx,u);
      try{
        await page.evaluate((id)=>openGame(id),gid);
        await wait(page,()=>{const body=document.getElementById('gamePageBody');return body&&body.querySelector('.stage')?true:false;},10000);
        await sleep(700);
        const m=await measureFit(page,gid);
        const okFit = !m.err && m.inV && m.inH;
        results.push([label+'/'+gid+': fits ('+(m.stageW||'?')+'x'+(m.stageH||'?')+' in '+(m.bodyW||'?')+'x'+(m.bodyH||'?')+')', !!okFit]);
        if(!okFit) console.log('  CLIP',label,gid,JSON.stringify(m));
      }catch(e){ results.push([label+'/'+gid+': render ok', false]); console.log('  ERR',label,gid,e.message.slice(0,60)); }
      await page.close();
    }
    await b.close();
  }
  console.log('\n═══ ملاءمة الألعاب ═══');
  let pass=0;for(const[m,c]of results){console.log((c?'✅ ':'❌ ')+m);if(c)pass++;}
  console.log('\nالنتيجة: '+pass+' نجح / '+(results.length-pass)+' فشل');
  process.exit(pass===results.length?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

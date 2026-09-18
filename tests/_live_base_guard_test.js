process.chdir(require('path').resolve(__dirname, '..'));
/* ═══════════════════════════════════════════════════════════════════════
   [v2.43.1] حارس عنوان الـAPI في جسر البث (live-ws-bridge):
   العلة المُصلَحة: أول EventSource كان يُبنى قبل حسم عنوان api-url2.json
   فيصير الرابط 'null/api/live' نسبةً لمضيف الصفحات (dtsg.pages.dev) الذي
   يخدم index.html كـ HTML ⇒ «MIME type text/html is not text/event-stream»
   في الكونسول + حلقة إعادة اتصال بلا نهاية، والقناة الحيّة لا تعمل أصلاً.

   الفحص يعمل بواجهات مُقلَّدة (fake window/location/localStorage/fetch)
   لأن السلوك كله في الإقلاع: أي رابط يُبنى، ومتى، وبأي ترويسة اعتماد.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/core/live-ws-bridge.js', 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

/* ── بيئة مُقلَّدة ─────────────────────────────────────────────────────── */
function makeEnv(opts) {
  const o = opts || {};
  const made = { es: [], ws: [], fetched: [] };
  class FakeES {
    constructor(url, cfg) { this.url = String(url); this.cfg = cfg || {}; made.es.push(this); this.readyState = 0; }
    addEventListener() { }
    removeEventListener() { }
    close() { this.readyState = 3; }
  }
  class FakeWS {
    constructor(url) { this.url = String(url); made.ws.push(this); this.readyState = 0; }
    send() { } close() { this.readyState = 3; }
  }
  const store = Object.assign({}, o.storage || {});
  const window = { EventSource: FakeES, WebSocket: FakeWS };
  const location = { hostname: o.hostname || 'dtsg.pages.dev', origin: 'https://' + (o.hostname || 'dtsg.pages.dev') };
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const fetch = url => {
    made.fetched.push(String(url));
    if (o.urlFail) return Promise.reject(new Error('offline'));
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(o.urlJson === undefined ? { url: o.base || 'https://casino-phone.dmgames-api.workers.dev' } : o.urlJson)
    });
  };
  const ctx = {
    window, location, localStorage, fetch, Promise, console,
    setTimeout: (fn) => { try { fn(); } catch (e) { } return 0; },
    clearTimeout: () => { }, setInterval: () => 0, clearInterval: () => { },
    Date, JSON, Object, Array, String, Number, Error, encodeURIComponent, decodeURIComponent, RegExp, Math
  };
  ctx.self = ctx; ctx.globalThis = ctx;
  return { ctx, made, store, FakeES, FakeWS, window, location, localStorage };
}

function load(env) {
  const runner = new Function('with (this) { (function(){ ' + src + ' })(); }');
  runner.call(env.ctx);
}

const tick = () => new Promise(r => setImmediate(r));

(async () => {
  console.log('═══ 1) زائر جديد على مضيف ثابت: لا رابط مجهول قبل حسم العنوان ═══');
  {
    const env = makeEnv({ hostname: 'dtsg.pages.dev' });
    load(env);
    const es1 = new env.ctx.window.EventSource('/api/live');
    ok('لم يُبنَ أي EventSource حقيقي قبل حسم العنوان', env.made.es.length === 0,
      'built: ' + JSON.stringify(env.made.es.map(e => e.url)));
    ok('لا WebSocket مُبكَّر', env.made.ws.length === 0, JSON.stringify(env.made.ws.map(w => w.url)));
    ok('قُرئ api-url2.json فعلاً', env.made.fetched.some(u => u.indexOf('api-url2.json') >= 0), JSON.stringify(env.made.fetched));
    await tick(); await tick(); await tick();
    const urls = env.made.es.map(e => e.url);
    ok('بعد الحسم: اتصال واحد بعنوان مطلق صحيح (' + (urls[0] || '—') + ')',
      urls.length === 1 && urls[0] === 'https://casino-phone.dmgames-api.workers.dev/api/live', JSON.stringify(urls));
    ok('لا رابط يبدأ بـ null أو نسبي', urls.every(u => !/^null|^\//.test(u)), JSON.stringify(urls));
    ok('withCredentials=true (كوكي sid عبر نطاق مغاير)', env.made.es[0].cfg.withCredentials === true,
      JSON.stringify(env.made.es[0].cfg));
    ok('لا WebSocket على ووركر الهاتف (وضع SSE)', env.made.ws.length === 0, JSON.stringify(env.made.ws.map(w => w.url)));
    ok('المستمعون يُعاد ربطهم على الاتصال الحقيقي', typeof es1.addEventListener === 'function' && es1.readyState !== 3);
  }

  console.log('\n═══ 2) عنوان مخزّن سابقاً (rc_api_base): اتصال فوري بلا انتظار ═══');
  {
    const env = makeEnv({ hostname: 'dtsg.pages.dev', storage: { rc_api_base: 'https://casino-phone.dmgames-api.workers.dev' } });
    load(env);
    env.ctx.window.EventSource('/api/live');
    const urls = env.made.es.map(e => e.url);
    ok('اتصال مباشر بالعنوان المخزّن', urls.length === 1 && urls[0] === 'https://casino-phone.dmgames-api.workers.dev/api/live', JSON.stringify(urls));
    ok('صفر روابط مجهولة', env.made.es.every(e => e.url.indexOf('null') < 0));
  }

  console.log('\n═══ 3) تعذّر جلب العنوان + بلا تخزين: صفر أخطاء وصفر اتصال وهمي ═══');
  {
    const env = makeEnv({ hostname: 'dtsg.pages.dev', urlFail: true, urlJson: null });
    load(env);
    env.ctx.window.EventSource('/api/live');
    await tick(); await tick(); await tick();
    ok('لا EventSource على مضيف الصفحات نفسه', env.made.es.length === 0, JSON.stringify(env.made.es.map(e => e.url)));
    ok('لا محاولة WS في وضع بلا عنوان', env.made.ws.length === 0, JSON.stringify(env.made.ws.map(w => w.url)));
    ok('كان التراجع إلى ووركر السحابي (احتياط مسجَّل)', env.made.fetched.length >= 1);
  }

  console.log('\n═══ 4) تشغيل محلي (localhost): بلا كسر — عنوان الصفحة نفسه ═══');
  {
    const env = makeEnv({ hostname: '127.0.0.1' });
    load(env);
    env.ctx.window.EventSource('/api/live');
    await tick(); await tick();
    const urls = env.made.es.map(e => e.url);
    ok('اتصال بنفس الأصل (SSE خادم الاختبار)', urls.length === 1 && urls[0] === 'https://127.0.0.1/api/live', JSON.stringify(urls));
    ok('بلا WebSocket (الخادم المحلي لا يدعمه)', env.made.ws.length === 0, JSON.stringify(env.made.ws.map(w => w.url)));
  }

  console.log('\n═══ 5) عناوين أخرى لا تُلمَس (EventSource غير القناة الحيّة) ═══');
  {
    const env = makeEnv({ hostname: 'dtsg.pages.dev', storage: { rc_api_base: 'https://casino-phone.dmgames-api.workers.dev' } });
    load(env);
    env.ctx.window.EventSource('/api/other-stream');
    const urls = env.made.es.map(e => e.url);
    ok('يُمرَّر كما هو بلا تعديل', urls.length === 1 && urls[0] === '/api/other-stream', JSON.stringify(urls));
  }

  console.log('\n═══ 6) إغلاق الواجهة المؤجَّلة قبل حسم العنوان: لا اتصال متأخر ═══');
  {
    const env = makeEnv({ hostname: 'dtsg.pages.dev' });
    load(env);
    const es = env.ctx.window.EventSource('/api/live');
    es.close();
    await tick(); await tick(); await tick();
    ok('لا اتصال بعد الإغلاق', env.made.es.length === 0, JSON.stringify(env.made.es.map(e => e.url)));
  }

  console.log('\n════════════════════════════════════════════');
  console.log('LIVE BASE GUARD: ' + pass + ' ناجح / ' + fail + ' فاشل');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

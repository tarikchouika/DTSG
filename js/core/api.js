/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — API Client
   Thin fetch wrapper — يستهدف Worker API على Cloudflare
   (cookies عبر credentials: include لأن الباك على نطاق workers.dev)
   ═══════════════════════════════════════════ */
"use strict";
/* [PhoneLink] اختيار خادم الـAPI حسب نطاق الاستضافة:
   - window.API_BASE_URL (تجاوز يدوي) له الأولوية.
   - localhost/127.0.0.1 **بمنفذ صريح** وArena preview (.e2b.app) → same-origin (server.js يخدم الواجهة والـAPI معاً)؛
   - أما «localhost» بلا منفذ فهو WebView Capacitor في تطبيق الأندرويد [v2.81.3-APK] → لا same-origin أبداً.
   - الإنتاج → يقرأ /api-url2.json (بلا كاش) للحصول على عنوان الووركر الوسيط الدائم
     (casino-phone.dmgames-api.workers.dev) الذي يمرر الطلبات إلى نفق الهاتف
     حيث تعمل server.js + SQLite المحلية. عند فشل الجلب → Worker السحابي (D1) كاحتياط.
   [PhoneLink-fallback] الفشل يُكتشف ديناميكياً أيضاً: إن ردّ الووركر الوسيط خطأ/HTML غير JSON
     نتراجع تلقائياً إلى Worker السحابي في نفس الطلب — لا حاجة لإعادة تحميل الصفحة. */
const API_BASE_FALLBACK = 'https://casino-api.dmgames-api.workers.dev';
/* [v2.81.3-APK] تطبيق الأندرويد (Capacitor WebView): window.Capacitor متاح
   والمنصّة أصلية، وhostname هو «localhost» بلا منفذ — لا خادم API محلي إطلاقاً
   فيجب ألّا يُطبَّق اختصار same-origin الخاص بالتطوير المحلي، بل يُقرأ
   /api-url2.json من الحزمة كالإنتاج تماماً. */
var IS_NATIVE_APP = (typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
var API_BASE_PROMISE = (typeof window !== 'undefined' && typeof window.API_BASE_URL === 'string')
  ? Promise.resolve(window.API_BASE_URL)
  /* [v2.81.4·إصلاح] كان الفحص على location.hostname (لا يحمل منفذاً أبداً) بنمط
     يشترط «:\d+» ⇒ لا يطابق 127.0.0.1:PORT قط، وحتى بيئة QA المحلية كانت
     تنطلق نحو ووركر الإنتاج وكوكي الجلسة المحلية لا يفيد شيئاً (كشفه فحص
     e2e الحيّ: AUTH.user بقي null). الفحص الآن على location.host (بالمنفذ). */
  : ((typeof location !== 'undefined' && !IS_NATIVE_APP && (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(location.host) || /\.e2b\.app$/i.test(location.hostname)))
    ? Promise.resolve(location.origin)
    : fetch('/api-url2.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (cfg) { return (cfg && cfg.url) || API_BASE_FALLBACK; })
        .catch(function () { return API_BASE_FALLBACK; }));
/* [v2.42-Bugfix] كان يضع الوعد (Promise) في window.API_BASE_URL — وهو اسم يعني نصاً،
   فمن يقرؤه (مثل auth.js في beforeunload) ينشئ رابطاً مثل "[object Promise]/api/sync" ⇒ 404.
   الآن: نضع الوعد في متغيّر داخلي، وAPI_BASE_URL يبقى نصاً فقط (يُحدَّث عند الحل). */
if (typeof window !== 'undefined') {
  window.__API_BASE_PROMISE = API_BASE_PROMISE;
  if (typeof window.API_BASE_URL !== 'string') {
    API_BASE_PROMISE.then(function (b) {
      try { if (typeof b === 'string') window.API_BASE_URL = b; } catch (e) { }
      /* [v2.42] نخزّنه محلياً ليقرأه جسر WS بشكل متزامن عند الإقلاع التالي
         (يمنع محاولة WebSocket على نفق الهاتف الذي لا يدعمه ⇒ خطأ كونسول متكرر) */
      try { if (typeof b === 'string') localStorage.setItem('rc_api_base', b); } catch (e) { }
    });
  }
}

/* يكتشف ردّ غير JSON (HTML خطأ من نفق ميت مثلاً) لتفعيل التراجع */
function _looksBroken(res) {
  const ct = res.headers.get('content-type') || '';
  return !res.ok && (res.status >= 502 || ct.indexOf('text/html') !== -1);
}

/* [v2.96·توكن] رمز الجلسة من الدخول (rc_token): سفاري (ITP) وWebView أندرويد
   يحجبان كوكيز الطرف الثالث عبر النطاقات (pages.dev → workers.dev) فكانت
   الجلسة تموت لحظة نجاح الدخول. التوكن يُرفق بترويسة Authorization مع كل
   نداء (الووركر الوسيط يمرر الترويسات حرفياً — تحقق من مصدره)، والخادم
   يقبل المسارين: الترويسة أولاً ثم الكوكي — فالمتصفحات التي تعمل بالكوكي
   (كروم/فايرفوكس) لا تتغير تجربتها قيد أنملة. */
function _sessionToken() {
  try { return localStorage.getItem('rc_token') || ''; } catch (e) { return ''; }
}
function _authHeaders(hdrs) {
  const out = hdrs || {};
  const tk = _sessionToken();
  if (tk) out['Authorization'] = 'Bearer ' + tk;
  return out;
}

const API = {
  request(method, url, body) {
    const opts = {
      method: method,
      credentials: 'include',
      headers: _authHeaders({})
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return API_BASE_PROMISE.then(function (base) {
      return fetch(base + url, opts).then(function (res) {
        /* [PhoneLink-fallback] نفق/ووركر الوسيط معطل → أعد المحاولة على Worker السحابي فوراً */
        if (_looksBroken(res) && base !== API_BASE_FALLBACK) {
          return fetch(API_BASE_FALLBACK + url, opts).then(function (res2) {
            return res2.json().then(function (data) {
              return { status: res2.status, ok: res2.ok, data: data };
            }).catch(function () { return { status: res2.status, ok: res2.ok, data: null }; });
          });
        }
        return res.json().then(function (data) {
          if (res.status === 401 && typeof authHandle401 === 'function') {
            authHandle401();
          }
          return { status: res.status, ok: res.ok, data: data };
        }).catch(function () {
          return { status: res.status, ok: res.ok, data: null };
        });
      });
    });
  },
  get(url) {
    return this.request('GET', url);
  },
  post(url, body) {
    return this.request('POST', url, body);
  }
};

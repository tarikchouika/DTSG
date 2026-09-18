/* ═══════════════════════════════════════════
   DTSG — Digital Traditional Skills Games — API Client
   Thin fetch wrapper — يستهدف Worker API على Cloudflare
   (cookies عبر credentials: include لأن الباك على نطاق workers.dev)
   ═══════════════════════════════════════════ */
"use strict";
/* [PhoneLink] اختيار خادم الـAPI حسب نطاق الاستضافة:
   - window.API_BASE_URL (تجاوز يدوي) له الأولوية.
   - localhost/127.0.0.1 → same-origin (server.js يخدم الواجهة والـAPI معاً).
   - الإنتاج → يقرأ /api-url2.json (بلا كاش) للحصول على عنوان الووركر الوسيط الدائم
     (casino-phone.dmgames-api.workers.dev) الذي يمرر الطلبات إلى نفق الهاتف
     حيث تعمل server.js + SQLite المحلية. عند فشل الجلب → Worker السحابي (D1) كاحتياط.
   [PhoneLink-fallback] الفشل يُكتشف ديناميكياً أيضاً: إن ردّ الووركر الوسيط خطأ/HTML غير JSON
     نتراجع تلقائياً إلى Worker السحابي في نفس الطلب — لا حاجة لإعادة تحميل الصفحة. */
const API_BASE_FALLBACK = 'https://casino-api.dmgames-api.workers.dev';
var API_BASE_PROMISE = (typeof window !== 'undefined' && typeof window.API_BASE_URL === 'string')
  ? Promise.resolve(window.API_BASE_URL)
  : ((typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.hostname))
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
    API_BASE_PROMISE.then(function (b) { try { if (typeof b === 'string') window.API_BASE_URL = b; } catch (e) { } });
  }
}

/* يكتشف ردّ غير JSON (HTML خطأ من نفق ميت مثلاً) لتفعيل التراجع */
function _looksBroken(res) {
  const ct = res.headers.get('content-type') || '';
  return !res.ok && (res.status >= 502 || ct.indexOf('text/html') !== -1);
}

const API = {
  request(method, url, body) {
    const opts = {
      method: method,
      credentials: 'include',
      headers: {}
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

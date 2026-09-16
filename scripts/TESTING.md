# تشغيل الاختبارات محلياً (دليل سريع)

## المتطلبات
- Node ≥ 22.12 (يستخدم `node:sqlite` التجريبي)
- المتصفح: كروميوم 143 مُهيّأ عبر `scripts/prepare-browser.sh` (مرة واحدة)
  ```bash
  bash scripts/prepare-browser.sh
  ```

## تشغيل الخادم (وضع الاختبار — مطلوب لاختبارات E2E)
اختبارات المتصفح تُنشئ مستخدمين مؤقتين عبر `/api/register` وتفتح غرفاً برهان.
خادم الإنتاج يقفل التسجيل (للمشرفين فقط) — لذا للاختبارات المحلية شغّل بوضع الاختبار:
```bash
DM_TEST_MODE=1 node --experimental-sqlite server.js
```
ما يفعله `DM_TEST_MODE=1` (في server.js فقط، لا أثر له في الإنتاج):
1. يفتح `/api/register` للتسجيل الذاتي.
2. التسجيل يفتح جلسة تلقائياً (سجّل = ادخل).
3. المستخدم الجديد يبدأ برصيد 100,000 (لأن الغرف تتطلب رهاناً إلزامياً + رسم افتتاح).

بدون `DM_TEST_MODE` يبقى السلوك الإنتاجي: تسجيل المشرفين فقط، بلا جلسة تلقائية، رصيد 0.

## تشغيل اختبار
```bash
# محركات (بدون متصفح):
node _dama_engine_test.js
node _chess_engine_test.js
node _parchisi_engine_test.js

# متصفح (يتطلب الخادم بوضع الاختبار + chromium):
LD_LIBRARY_PATH="$PWD/node_modules/.chromium-143/al2023/lib" node _dama_browser_test.js
LD_LIBRARY_PATH="$PWD/node_modules/.chromium-143/al2023/lib" node tests/_rn_mp_test.js
```
الاختبارات في الجذر (`_*.js`) أو في `tests/` (`_*.js`) — كلاهما يُشغَّل مباشرة بـ node.

## لماذا إصلاحات api.js / index.html / live-ws-bridge.js؟
- **`js/core/api.js`**: في الإنتاج الواجهة (Pages) تستهلك Worker خارجي (`*.workers.dev`).
  محلياً يتجه `API_BASE` إلى `location.origin` (server.js يخدم API وواجهة معاً) — وإلا فشلت كل طلبات API.
- **`index.html` + `js/core/live-ws-bridge.js`**: جسر WebSocket (Durable Objects) خاص بالـ Worker.
  محلياً server.js يدعم SSE فقط، لذا لا يُحمَّل الجسر ويبقى `EventSource('/api/live')` الأصلي.

## ملاحظات على الاختبارات
- كلمات المرور في الاختبارات `pw123456` (لا `pw123` — الخادم يفرض ≥ 6 أحرف منذ 2026-08-29).
- إنشاء الغرف في الاختبارات يمرر رهاناً (`Rooms.createRoom('rm', 10)`) لأن الخادم يرفض الغرف المجانية.

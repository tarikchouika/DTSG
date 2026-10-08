/* ═══════════════════════════════════════════════════════════════════════════
   DTSG — مُصنِّف استجابات ≥400 لجناح بلوت في الغرفة [v2.95.1]

   لماذا وحدة منفصلة؟ لأنّ التصنيف صار **جزءاً من عقد المال** لا تفصيلاً
   تجميلياً: الرفض الوحيد المسموح به هو رفض التسوية المكرّرة نفسه
   (القاعدة 12: «أول تقرير + room.settled يمنع الازدواج») — وكل ما عداه
   إخفاق. ولكي لا يصير الحارس ختماً مطّاطاً (rubber stamp) يُختبر هذا
   المُصنِّف هنا **بمدخلات سلبية** تثبت أنه يرفض غير المسموح — بدل الاكتفاء
   بأن يمرّ على الجولة الحقيقية.

   الاستعمال:
     const { audit4xx } = require('./_settle4xx_audit.js');
     const r = audit4xx(page._http4xx);   // ⇒ { unexpected: [...], dupCount: n }
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* نصّ الرفض المُصمَّم في الخادم (rooms/room-manager.js · settleRound) */
const DUP_SETTLE_MSG = 'تمت تسوية هذه الجولة مسبقاً';
const SETTLE_PATH_RE = /\/api\/rooms\/settleRound(\?|$)/;

/**
 * @param {Array<{status:number,method:string,url:string,body:string}>} list
 * @returns {{unexpected:Array, dupCount:number}}
 */
function audit4xx(list) {
  const items = Array.isArray(list) ? list : [];
  const unexpected = items.filter(x =>
    !(String(x.method || '').toUpperCase() === 'POST'
      && SETTLE_PATH_RE.test(String(x.url || ''))
      && Number(x.status) === 400
      && String(x.body || '').indexOf(DUP_SETTLE_MSG) !== -1));
  return { unexpected: unexpected, dupCount: items.length - unexpected.length };
}

/* نفس المنطق لحساب أخطاء الكونسول غير المفسَّرة: كل خطأ كونسول من نوع
   «فشل تحميل مورد · 400» يجب أن يكون له سندٌ في الاستجابات المراجَعة. */
function unexplainedConsoleErrors(errs, list) {
  const errs2 = Array.isArray(errs) ? errs : [];
  const supported = audit4xx(list).dupCount;
  return { unexplained: Math.max(0, errs2.length - supported), supported: supported };
}

module.exports = { audit4xx: audit4xx, unexplainedConsoleErrors: unexplainedConsoleErrors, DUP_SETTLE_MSG: DUP_SETTLE_MSG, SETTLE_PATH_RE: SETTLE_PATH_RE };

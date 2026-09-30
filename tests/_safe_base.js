'use strict';
/* ═══ [v2.69.1] عنوان آمن للاختبارات — حجز ضد الكتابة في الإنتاج ═══
   الحادثة المرجعية: اختبارات الغرف/المال كانت تثبّت BASE على المنفذ 3000، وهو
   على هذا الهاتف منفذ خادم المنصة الحيّ (pm2 casino-server). تشغيلها بلا
   تعديل كان يفتح قاعدة الإنتاج، فتُكتب فيها مستخدمات اختبار وغرف اختبار
   وصفوف bet/win/refund في السجل المالي الحيّ.

   الاستخدام:
     const SB = require('./_safe_base.js');
     const BASE = SB.BASE;                  // بلا شرطة أخيرة (fetch + '/api/x')
     const BASE = SB.BASE_SLASH;            // بشرطة أخيرة (BASE + 'api/x')
     const BASE = { host: SB.host, port: SB.port };  // للاختبارات المبنية على http.request

   السلوك:
     • QA_BASE=http://127.0.0.1:3971/  ⇒ يعمل على خادم معزول بلا تحذير.
     • بلا QA_BASE ⇒ القيمة الافتراضية التاريخية (المنفذ 3000)، لكن إن كان ذلك
       المنفذ مربوطاً بخادم المنصة الحيّ (pm2) ⇒ يرفض الاختبار التشغيل ويشرح السبب.
   */
const { execSync } = require('child_process');

/* هل هذا المنفذ منفذ خادم المنصة الحيّ؟ البصمة: pm2 يدير casino-server
   على هذا المنفذ، والمنفذ يردّ /api/health كبصمة المنصة. (لا نعتمد على
   ss/netstat: الأول غير مثبّت على هذا الجهاز، والثاني لا يُظهر منافذ Node،
   و/proc/net/tcp محجوب بـEACCES.) */
function isLivePlatformPort(p) {
  let managed = false;
  try {
    const apps = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', timeout: 8000 }));
    managed = apps.some(a => /casino-server/.test(a.name) && a.pid);
  } catch (e) { return false; }
  if (!managed) return false;
  try {
    const body = execSync('curl -sf --max-time 4 http://127.0.0.1:' + p + '/api/health || true',
      { encoding: 'utf8', timeout: 8000 });
    return /"service"\s*:\s*"dmgames-arena"/.test(body);
  } catch (e) { return false; }
}

const RAW = String(process.env.QA_BASE || '');
/*طبيع: بلا شرطات زائدة، حتى لا ينتج عن_address '//api/x' عند الدمج */
const BASE = (RAW || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const u = new URL(BASE);
const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
const host = u.hostname;

if (!RAW && isLivePlatformPort(port)) {
  console.error(
    '\n✗ رفض التشغيل: هذا الاختبار يشير إلى المنفذ ' + port + ' وهو منفذ خادم المنصة الحيّ.\n' +
    '  تشغيله بلا QA_BASE يكتب بيانات اختبار في قاعدة الإنتاج وسجلها المالي.\n' +
    '  شغّله على خادم معزول:\n' +
    '    QA_BASE=http://127.0.0.1:3971/ node ' + (process.argv[1] || 'this-test.js') + '\n'
  );
  process.exit(2);
}

module.exports = {
  BASE,
  /* اختبارات تُركّب المسار بلا شرطة-leading (BASE + 'api/x') تحتاج شرطة أخيرة */
  BASE_SLASH: BASE.endsWith('/') ? BASE : BASE + '/',
  host, port, isIsolated: !!RAW, isLivePlatformPort
};
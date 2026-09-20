/* ═══════════════════════════════════════════════════════════════════════════
   tests/_v247_guard_test.js — أحراس انحدار لبنود طلب المالك (v2.47)
   ١) بوت الفوتشير: أكواد التعبئة فقط + دمج في شات المنصة مع بوت الدعم.
   ٢) شحن بايننس بوضع القراءة فقط (بلا أي صلاحية سحب) + مسار يدوي بديل.
   ٣) سحب المحفظة: يذهب لأدمن حساب المستخدم (users.admin_id) ويصادق عليه هو/السوبر.
   بلا شبكة — فحص ثابت على المصادر + عقد الواجهة/الخادم.
   التشغيل: node tests/_v247_guard_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (m, c) => { c === undefined || c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const BOT = read('scripts/voucher-bot.js');
const CORE = read('cf-worker/payments-core.js');
const SP = read('server-payments.js');
const SRV = read('server.js');
const CHAT = read('js/ui/bot-chat.js');
const WALLET = read('js/wallet.js');
const SCHEMA = read('cf-worker/schema.sql');

console.log('\n═══ ١) بوت أكواد التعبئة + الدمج في مركز المساعدة ═══');
ok('البوت يعلن نطاقه (أكواد التعبئة فقط) في الترحيب', /بوت أكواد التعبئة/.test(BOT));
ok('لا أزرار سحب/رصيد/دعم في لوحة البوت', !/'💸 طلب سحب'/.test(BOT) && !/'💰 رصيدي'/.test(BOT) && !/'🛟 الدعم'/.test(BOT));
ok('البوت يوجّه خارج النطاق (المحفظة للسحب + بوت الدعم)', /مخصص لأكواد التعبئة فقط/.test(BOT) && /dtsgsupports_bot/.test(BOT));
ok('بطاقة بوت التعبئة مضافة في مركز المساعدة (@dtsgvoucher_bot)', /dtsgvoucher_bot/.test(CHAT) && /cardVoucher/.test(CHAT));
ok('الرابط يربط الحساب تلقائياً (plt_<المعرّف>)', /start=plt_/.test(CHAT) && /start=plt_/.test(WALLET));

console.log('\n═══ ٢) بايننس: قراءة فقط للتحقق من التحويلات ═══');
ok('المسار القرائي الرسمي فقط (سجل Pay) بترويسة المفتاح',
  CORE.indexOf('/sapi/v1/pay/transactions') >= 0 && CORE.indexOf("'X-MBX-APIKEY'") >= 0);
ok('لا أي نداء سحب/تحويل على Binance من الواجهة الخلفية',
  !/\/sapi\/v1\/capital\/withdraw/.test(CORE) && !/\/wapi\/v3\/withdraw/.test(CORE) && !/binancePayTransfer|payout/i.test(CORE));
ok('توقيع الاستعلام HMAC-SHA256 على السلسلة الكاملة', /hmacSha256Hex\([^)]*BINANCE_PAY_SECRET_KEY/.test(CORE) && /signature=/.test(CORE));
ok('منع الشحن المزدوج بمرجع التحويل (transactionId في proof_details)', /proof_details LIKE/.test(CORE));
ok('تشخيص صريح عند رفض المفتاح (readonly-unavailable + IP الطلب)', /readonly-unavailable/.test(CORE) && /request_ip/.test(CORE));
ok('مفتاح الفحص للأدمن فقط (probe)', /binance-probe/.test(CORE) && /binanceReadOnlyReady/.test(CORE));
ok('الواجهة: وسيلة «تحقّق تلقائي» + زر التحقق + معرّف Pay',
  /binance_readonly/.test(WALLET) && /binance-verify/.test(WALLET) && /wl\.roVerify/.test(WALLET));
ok('مخطط القاعدة يقبل binance_readonly (ووركر + منصة)',
  /binance_readonly/.test(SCHEMA) && /binance_readonly/.test(SP) && /binance_readonly/.test(CORE));
ok('المسارات الجديدة مسجّلة في PAY_PATHS للمنصة',
  /'\/api\/payments\/binance-verify'/.test(SP) && /'\/api\/payments\/binance-probe'/.test(SP));

console.log('\n═══ ٣) السحب: أدمن حساب المستخدم (users.admin_id) ═══');
ok('مصدر واحد لإشعار السحب يقرأ أدمن التسجيل', /async function notifyWithdrawalOwner/.test(CORE) && /function userOwnerAdmin/.test(CORE));
ok('مساران يستعملانه: طلب المحفظة وطلب البوت',
  (CORE.match(/await notifyWithdrawalOwner\(/g) || []).length >= 2);
ok('المصادقة (wapp/wrej) تُفحص بـ actorTg في النواة', /adminActOnTransaction\(env, db, txId, act, actorTg\)/.test(CORE) && /not-owner-admin/.test(CORE));
ok('مسار تيليغرام يمرّر actor ويسمح لأدمن الحساب', /isOwnerAdminOf\(env, db, \(cq\.from && cq\.from\.id\)/.test(CORE));
ok('لوحة المنصة تمنع غير أدمن الحساب من مصادقة السحب', /not-owner-admin/.test(SRV) && /admin_id/.test(SRV));
ok('خطافات المنصة متوفّرة (__userAdminOf / __isUserAdminOf)',
  /__userAdminOf:/.test(SP) && /__isUserAdminOf:/.test(SP) && /function userAdminOfLocal/.test(SP));

console.log('\nالنتيجة: ' + pass + ' نجح / ' + fail + ' فشل');
process.exit(fail ? 1 : 0);

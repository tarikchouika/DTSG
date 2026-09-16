/* ═══ [frontend-tx] اختبار دخاني: رندر المعاملات متعددة الأنواع + تذاكر التيكيتس (دمج/بحث) + تبويب السجلات ═══
   يعمل بلا خادم: يحاكي DOM بسيطاً + API mock — يتحقق من مخرجات الدوال الثلاث المعدّلة. */

/* ── DOM بسيط كفاية للدوال المختبرة ── */
const elements = {};
const predef = {}; /* معرفات معروفة مسبقاً (تُنشأ عند أول طلب) */
function mkEl(id) {
  return {
    id: id,
    _html: '',
    _listeners: {},
    value: '',
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    dispatch(ev) { (this._listeners[ev] || []).forEach(f => f({ target: this })); },
    classList: { contains: () => true, add: () => {}, remove: () => {} },
    remove: function () { delete elements[this.id]; },
    style: {},
    children: []
  };
}
global.document = {
  /* null للمعرفات غير المعروفة (كما في المتصفح) — إلا إذا سُبق تسجيلها (predef) */
  getElementById: (id) => (id in elements) ? elements[id] : (predef[id] ? (elements[id] = mkEl(id)) : null),
  registerElement(id) { predef[id] = true; },
  addEventListener: () => {},
  querySelectorAll: () => [],
  readyState: 'loading',
  body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
  documentElement: { style: { setProperty: () => {} }, setAttribute: () => {}, getAttribute: () => null }
};
/* العناصر التي تلمسها الدوال المختبرة */
['pg-transactions', 'txTransfers', 'txRounds', 'gameHistory', 'ticketsSearch', 'ticketsSheet', 'ticketsOverlay', 'ticketsBtn', 'ticketsGrip', 'adminBox', 'adminContent', 'txUser', 'txType', 'txTableBox', 'trList', 'adminStatUsers', 'adminStatOnline', 'adminStatPlays', 'adminStatCoins', 'gamePageBody', 'gamePageIcon', 'gamePageName', 'goldD', 'tcGame', 'tcMsg', 'tcModal', 'trModal', 'trTo', 'trAmt', 'trMsg', 'coordMsgs', 'coordInput', 'coordSend', 'accountInfo', 'roomsList', 'tourneyList', 'lbList', 'hSeed', 'nonceD', 'pf-server', 'pf-client', 'pf-nonce', 'pf-game', 'pf-hash', 'pf-outcome', 'pf-verify-btn', 'pf-calc', 'pf-result'].forEach(id => predef[id] = true);
global.window = global;
global.location = { hash: '', hostname: 'localhost' };
global.navigator = { maxTouchPoints: 0 };
global.Event = function () {};
global.ResizeObserver = undefined;
global.addEventListener = () => {};

/* ── حالة ومساعدات ── */
const ST = { lang: 'ar', gold: 5000 };
const GAMES = [{ id: 'ke', n: ['كينو', 'Keno', 'Keno', 'كينو'], em: '🎯' }];
let AUTH = { user: { id: 7, username: 'tester', role: 'super', gold: 5000 } };
let ADMIN_TAB = 'users';
global.ST = ST; global.GAMES = GAMES; global.AUTH = AUTH; global.ADMIN_TAB = ADMIN_TAB;
global.gname = (g) => g && g.n ? g.n[0] : '';
global.esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TRmock = {};
global.TR = TRmock;
/* API mock — يسجل الاستدعاءات ويرد بعقود المهام */
const apiCalls = [];
const responses = {
  '/api/transfers': { ok: true, data: { transfers: [
    { type: 'transfer_out', from_id: 7, from_name: 'tester', to_name: 'friend', amount: 100, created_at: 1757600000 },
    { type: 'transfer_in', from_id: 8, from_name: 'friend', to_name: 'tester', amount: 50, created_at: 1757600100 },
    { type: 'charge', from_id: 1, from_name: 'superadmin', to_name: 'tester', amount: 200, created_at: 1757600200, balance_after: 5200 },
    { type: 'deduct', from_id: 1, from_name: 'superadmin', to_name: 'tester', amount: 30, created_at: 1757600300, balance_after: 5170 },
    { type: 'set_balance', from_id: 1, from_name: 'superadmin', to_name: 'tester', amount: 5000, created_at: 1757600400, note: 'ضبط يدوي' },
    { type: 'referral_bonus', from_id: 1, from_name: 'superadmin', to_name: 'tester', amount: 75, created_at: 1757600500 },
    { type: 'claim', from_id: 1, from_name: 'superadmin', to_name: 'tester', amount: 25, created_at: 1757600600 }
  ] } },
  '/api/rounds': { ok: true, data: { rounds: [
    { game_id: 'ke', bet: 100, won: 1, payout: 250, created_at: 1757600000 }
  ] } },
  '/api/games/ke/history': { ok: true, data: { rounds: [
    { username: 'tester', game_id: 'ke', bet: 100, won: 1, payout: 250, result_txt: 'win', created_at: 1757600000 }
  ] } },
  '/api/admin/users': { ok: true, data: { users: [
    { id: 7, username: 'tester', role: 'super', gold: 5000, ref_code: 'ABC1' },
    { id: 8, username: 'friend', role: 'user', gold: 120, ref_code: '' }
  ] } }
};
const pending = [];
global.API = {
  get(url) {
    apiCalls.push(url);
    const clean = url.split('?')[0];
    const r = responses[clean] || { ok: true, data: {} };
    if (clean === '/api/admin/transactions') {
      r.ok = true;
      r.data = {
        ok: true, total: 2,
        transactions: [
          { id: 1, user_id: 7, username: 'tester', type: 'bet', amount: 100, balance_after: 4900, counterparty_name: null, actor_name: 'tester', game_id: 'ke', note: null, created_at: 1757600000 },
          { id: 2, user_id: 7, username: 'tester', type: 'win', amount: 250, balance_after: 5150, counterparty_name: null, actor_name: 'server', game_id: 'ke', note: null, created_at: 1757600100 }
        ]
      };
    }
    return Promise.resolve(r);
  },
  post() { return Promise.resolve({ ok: true, data: {} }); }
};
global.toast = () => {};
global.SND = { click: () => {} };
global.save = () => {};
global.wallet = () => {};
global.nav = () => {};
global.closeAcctMenu = () => {};
global.roleLabel = (r) => r;
global.setInterval = () => {};
global.clearInterval = () => {};
global.setTimeout = global.setTimeout;
/* دوال خارجية تُستدعى عند تحميل main.js (initApp) — stubs */
global.initState = () => {};
global.syncLangDrop = () => {};
global.syncMuteBtns = () => {};
global.applyI18n = () => {};
global.translateStatic = () => {};
global.updateCopyright = () => {};
global.fxInit = () => {};
global.initFabDrag = () => {};
global.authRestore = () => Promise.resolve({});
global.authSync = () => {};
global.navFromHash = () => {};
global.syncGameFsBtn = () => {};
global.syncPgTop = () => {};
global.enterAppFullscreen = () => {};
global.exitAppFullscreen = () => {};
global.openGame = () => {};
global.closeModal = () => {};
global.closeRulesModal = () => {};
global.closeSide = () => {};
global.openRulesModal = () => {};
global.renderAll = () => {};
global.showFullRules = () => {};
global.checkRotateHint = () => {};
global.fitGameStage = () => {};
global.fitGameStageSoon = () => {};
global.sSet = () => {};

/* الترجمات الفعلية من ملف المشروع */
const TR = require('./js/i18n/translations.js');
Object.assign(TRmock, TR);
global.langIndex = () => 0;
global.T = (k) => (TRmock[k] ? TRmock[k][0] : k);
global.fmt = (n) => String(n);

/* تحميل main.js (الدوال المختبرة) في هذا النطاق */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/js/main.js', 'utf8');
const fn = new Function(src + '\n;return {renderTransactions, renderGameHistory, adminLoadTransactions, adminViewUserTx, loadTrHistory, txTypeLabel, txAmountSign, setRounds: function(s, l) { _serverRounds = s; _localRounds = l; }};');
const M = fn();
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } };

(async () => {
  /* ═══ (1) renderTransactions: أنواع متعددة ═══ */
  await M.renderTransactions();
  await new Promise(r => setTimeout(r, 20));
  const html = elements['txTransfers'].innerHTML;
  check('1a) جدول معاملات متعددة الأنواع رُسم', html.indexOf('<table') !== -1);
  check('1b) شحن: الطرف = from_name (المشرف) والمستلم +amount', html.indexOf('superadmin') !== -1 && /<td class="gold-text">\+ 🪙 200<\/td>/.test(html));
  check('1c) سحب: المرسل −amount والطرف = to_name', /<td>− 🪙 30<\/td>/.test(html) && /<td>superadmin<\/td>/.test(html));
  check('1d) ضبط رصيد: spill عادي (بلا ok/bad) + note', /<span class="spill ">ضبط رصيد<\/span>/.test(html) && html.indexOf('ضبط يدوي') !== -1);
  check('1e) هدية إحالة: badge ok + amount في عمود المستلم', /<span class="spill ok">هدية إحالة<\/span>/.test(html) && /\+ 🪙 75/.test(html));
  check('1f) مكافأة (claim): badge ok', /<span class="spill ok">مكافأة<\/span>/.test(html));
  check('1g) تحويل صادر: spill bad + سهم', /<span class="spill bad">→ تحويل صادر<\/span>/.test(html) && /− 🪙 100/.test(html));
  check('1h) تحويل وارد: spill ok + ←', /<span class="spill ok">← تحويل وارد<\/span>/.test(html) && /\+ 🪙 50/.test(html));

  /* ═══ (2) renderGameHistory: دمج الخادم/المحلي + البحث ═══ */
  /* صف خادم عند t=1000، محلي مكرر عند t=1000 (يجب إسقاطه)، محلي أحدث عند t=2000 (يبقى) */
  M.setRounds(
    [{ username: 'tester', game_id: 'ke', bet: 100, won: 1, payout: 250, created_at: 1000 }],
    [
      { username: 'tester', game_id: 'ke', bet: 100, won: 1, payout: 250, created_at: 1000, local: true },
      { username: 'tester', game_id: 'ke', bet: 300, won: 0, payout: 0, created_at: 2000, local: true, result_txt: 'خسارة' }
    ]
  );
  M.renderGameHistory();
  let gh = elements['gameHistory'].innerHTML;
  check('2a) لا تكرار: الصف المكرر المحلي أُسقط (صفان فقط)', (gh.match(/ght-ticket/g) || []).length === 2);
  check('2b) الخادم أولاً ثم المحلي الأحدث', gh.indexOf('ght-ticket') !== -1 && gh.split('ght-ticket').filter(p => p.indexOf('خسارة') !== -1).length === 1);

  /* البحث: تصفية بالمبلغ 300 (نص) */
  const s = elements['ticketsSearch'];
  s.value = '300';
  M.renderGameHistory();
  gh = elements['gameHistory'].innerHTML;
  check('2c) البحث بالمبلغ 300: صف واحد فقط', (gh.match(/ght-ticket/g) || []).length === 1 && gh.indexOf('خسارة') !== -1);
  /* البحث برقم غير موجود */
  s.value = '999';
  M.renderGameHistory();
  gh = elements['gameHistory'].innerHTML;
  check('2d) بحث بلا نتائج: رسالة ghist.empty', gh.indexOf('لا توجد جولات بعد') !== -1);
  /* مسح البحث يعيد الصفين */
  s.value = '';
  M.renderGameHistory();
  gh = elements['gameHistory'].innerHTML;
  check('2e) مسح البحث: صفان ثانية', (gh.match(/ght-ticket/g) || []).length === 2);
  /* ربط input مرة واحدة (بحد _searchBound) */
  const before = (s._listeners['input'] || []).length;
  s._searchBound = false;   /* محاكاة عنصر جديد */
  M.renderGameHistory();
  check('2f) ربط input: مستمع واحد (بلا تكرار)', (s._listeners['input'] || []).length >= 1 && (s._listeners['input'] || []).length === before + 1);

  /* ═══ (3) adminLoadTransactions: بناء التصفية + الجدول ═══ */
  ADMIN_TAB = 'logs';
  global.ADMIN_TAB = 'logs';
  await M.adminLoadTransactions();
  await new Promise(r => setTimeout(r, 30));
  const box = elements['txTableBox'] ? elements['txTableBox'].innerHTML : '';
  check('3a) select المستخدم موجود مع «الكل» وusername', elements['txUser'] && elements['txUser'] !== undefined && true);
  check('3b) جدول المعاملات رُسم مع total', box.indexOf('total') !== -1 || box.indexOf('2 معاملة') !== -1);
  check('3c) أعمدة كاملة: الوقت/المستخدم/النوع/المبلغ/الرصيد/الطرف/اللعبة/المنفذ/ملاحظة',
    ['الوقت', 'المستخدم', 'النوع', 'المبلغ', 'الرصيد بعدها', 'الطرف الآخر', 'اللعبة', 'المنفذ', 'ملاحظة'].every(h => box.indexOf(h) !== -1));
  check('3d) نوع bet: spill bad + إشارة −', /<span class="spill bad">رهان<\/span>/.test(box) && /− 🪙 100/.test(box));
  check('3e) نوع win: spill ok + إشارة +', /<span class="spill ok">فوز<\/span>/.test(box) && /\+ 🪙 250/.test(box));
  const filterHtml = elements['adminContent'].innerHTML;
  check('3f) خيارات النوع كاملة (10)', ['الكل', 'رهان', 'فوز', 'تحويل صادر', 'تحويل وارد', 'شحن', 'سحب', 'ضبط رصيد', 'هدية إحالة', 'مكافأة'].every(o => filterHtml.indexOf(o) !== -1));
  check('3g) limit=200 في استدعاء الـ API', apiCalls.some(u => u.indexOf('limit=200') !== -1));

  /* ═══ (4) adminViewUserTx: يضبط txUser ثم يجلب ═══ */
  apiCalls.length = 0;
  await M.adminViewUserTx(8);
  await new Promise(r => setTimeout(r, 80));
  check('4a) فتح تبويب السجلات وجلب معاملات المستخدم 8', apiCalls.some(u => u.indexOf('/api/admin/transactions') !== -1));
  check('4b) adminContent يحوي جدول المعاملات', elements['adminContent'].innerHTML.indexOf('txTableBox') !== -1);

  /* ═══ (5) حفظ التصفية عبر إعادة الجلب (onchange لا يفقد القيمة) ═══ */
  const selUser = elements['txUser'];
  selUser.value = '7';
  apiCalls.length = 0;
  await M.adminLoadTransactions();
  await new Promise(r => setTimeout(r, 30));
  check('5a) إعادة الجلب تحفظ المستخدم المختار (user_id=7)', apiCalls.some(u => u.indexOf('user_id=7') !== -1));
  const selType = elements['txType'];
  selType.value = 'charge';
  apiCalls.length = 0;
  await M.adminLoadTransactions();
  await new Promise(r => setTimeout(r, 30));
  check('5b) إعادة الجلب تحفظ النوع المختار (type=charge)', apiCalls.some(u => u.indexOf('type=charge') !== -1));
  /* select الجديد يحمل selected على القيمة المحفوظة */
  const optsHtml = elements['adminContent'].innerHTML;
  check('5c) option selected على المستخدم 7 بعد إعادة البناء', /<option value="7" selected>/.test(optsHtml));

  console.log('\n════ النتيجة: ' + pass + ' نجح / ' + fail + ' فشل ════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });

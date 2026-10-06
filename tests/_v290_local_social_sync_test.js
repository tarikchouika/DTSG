/* ═══════════════════════════════════════════════════════════════════════════
   [v2.90] المختبر الحي — تفاعل/رسائل الغرفة المحلية + أونو بلا لعب آلي +
            خصوصية الدومينو + زر تحميل APK المباشر
   ───────────────────────────────────────────────────────────────────────────
   بلاغ المالك 2026-10-07 (بعد تثبيت v2.89.0-build28):
     ① «الأيقونات التفاعلية الطافية والرسائل الصوتية والنصية لا تُزامن بين
        مستخدمي الغرفة المحلية» — الجذر: sendReact/sendQuickMsg/toggleVoice
        كانت ترسل عبر API للخادم والغرفة المحلية بلا خادم ⇒ لا يصل شيء.
     ② «اللاعب المستضاف (الأونو) يتعذر عليه دوره والدور يُلعب آلياً عند انتهاء
        العد» — الجذر: مودال اللوبي كان يُفتح فوق اللعبة بعد البدء فيبتلع
        النقرات، والمؤقت يعوّض غياب النقرات بلعب آلي باسم اللاعب.
     ③ «الدومينو: الضيف يرى أرقام حجارة الخصم + تموضع مشوه» — الجذر: شرط
        الكشف (me===0) + صنفا dm-opptiles/dm-opptiles-v بلا أي CSS.
     ④ زر تحميل APK مباشر أسفل الرئيسية وكل الصفحات القانونية + خطوات
        تثبيت مبسطة لتجاوز تحذير Play Protect «تطبيق غير معروف».

   هذا المختبر يغطي الأربعة: عقد المصدر (بنيوي) + مختبر حي بمتصفحين
   حقيقيين عبر جسر DTSGNative مزيف (نفس عقد جافا LocalNet حرفياً) — بما
   فيه تسجيل صوتي حقيقي عبر ميكروفون وهمي (MediaRecorder) يُبث بين الطرفين.
   تشغيل: QA_BASE=http://127.0.0.1:3971/ node tests/_v290_local_social_sync_test.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const SB = require('./_safe_base.js');
const BASE = SB.BASE, BASE_SLASH = SB.BASE_SLASH;
const REPO = path.join(__dirname, '..');
const APK_URL = 'https://github.com/tarikchouika/DTSG/releases/latest/download/DTSG-Gaming-App.apk';
let pass = 0, fail = 0;
function ok(cond, label, detail) { cond ? pass++ : fail++; console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail !== undefined ? ' — ' + detail : '')); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(cookie, method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null; try { json = await r.json(); } catch (e) {}
  return { status: r.status, json, cookie: r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(';')[0] : cookie };
}
async function ensureUser(name, pw) {
  let l = await api(null, 'POST', '/api/login', { username: name, password: pw });
  if (l.status !== 200) {
    await api(null, 'POST', '/api/register', { username: name, password: pw });
    l = await api(null, 'POST', '/api/login', { username: name, password: pw });
  }
  return { name, id: l.json && l.json.user && l.json.user.id, cookie: l.cookie };
}
async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { lastErr = e; }
    await page.waitForTimeout(150);
  }
  throw new Error('wait timeout: ' + (lastErr ? lastErr.message : ''));
}

/* ── الجسر الأصلي المزيف — نفس عقد جافا LocalNet حرفياً (نمط v289) ── */
function fakeNativeBridge(TAG) {
  if (window.__dtsgNativeFakeInstalled) return;
  window.__dtsgNativeFakeInstalled = true;
  var lnEv = function (o) { try { window.__dtsgLnEvt && window.__dtsgLnEvt(o); } catch (e) {} };
  var arbEv = function (o) { try { window.__dtsgArbEvt && window.__dtsgArbEvt(o); } catch (e) {} };
  window.__fakeLnEv = lnEv;
  window.__fakeArbEv = arbEv;
  window.__arbStarts = [];
  window.DTSGNative = {
    lnVersion: function () { return '2'; },
    hostRoom: function (json) {
      var j = {}; try { j = JSON.parse(json || '{}'); } catch (e) {}
      try { window.__hubHost(TAG, String(j.code || '')); } catch (e) {}
      setTimeout(function () { lnEv({ t: 'hostReady' }); }, 20);
    },
    hostUpdate: function () {},
    discoverStart: function () {},
    discoverStop: function () {},
    joinRoom: function (json) {
      var j = {}; try { j = JSON.parse(json || '{}'); } catch (e) {}
      try { window.__hubJoin(TAG, String(j.code || '')); } catch (e) {}
    },
    sendMsg: function (id, s) {
      try { window.__hubSend(TAG, Number(id) || 0, String(s || '')); } catch (e) {}
    },
    leaveRoom: function () { try { window.__hubLeave(TAG); } catch (e) {} },
    btPerms: function () { return 'granted'; },
    btOn: function () { return true; },
    btEnable: function () {},
    requestBtPerms: function () {},
    getInsets: function () { return '0|0'; },
    setBarsLight: function () {},
    arbShareVersion: function () { return '1'; },
    arbShareStart: function (json) { window.__arbStarts.push(String(json || '')); },
    arbShareStop: function () { arbEv({ t: 'state', state: 'stopped' }); }
  };
}

(async () => {
  /* ═══════════════════ 1) عقد المصدر (بنيوي) ═══════════════════ */
  console.log('═══ v2.90 · عقد المصدر — الجذور الأربعة ═══');
  const lmp = fs.readFileSync(path.join(REPO, 'js/core/local-mp.js'), 'utf8');
  const uno = fs.readFileSync(path.join(REPO, 'uno-game/js/ui/uno-app.js'), 'utf8');
  const dapp = fs.readFileSync(path.join(REPO, 'dominoes-game/js/ui/domino-app.js'), 'utf8');
  const dcss = fs.readFileSync(path.join(REPO, 'dominoes-game/css/dominoes.css'), 'utf8');
  const idx = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const lui = fs.readFileSync(path.join(REPO, 'js/ui/legal-ui.js'), 'utf8');
  const TR = require(path.join(REPO, 'js/i18n/translations.js'));

  /* ① تفاعل/رسائل الغرفة المحلية */
  ok(lmp.indexOf("if (m.t === 'react')") > 0 && lmp.indexOf("if (m.t === 'chat')") > 0 && lmp.indexOf("if (m.t === 'voice')") > 0,
    '① local-mp: مسارات استقبال react/chat/voice عند المضيف والضيف');
  ok(lmp.indexOf('VOICE_MAX_B64') > 0 && lmp.indexOf('feedReact') > 0 && lmp.indexOf('feedChat') > 0 && lmp.indexOf('feedVoice') > 0,
    '① local-mp: تغذية معالجات SSE القائمة (نفس مستقبلات الخادم) + سقف حجم الصوت');
  ok(/wrap\('sendReact', LocalMP\.sendReact\)/.test(lmp) && /wrap\('sendQuickMsg', LocalMP\.sendQuickMsg\)/.test(lmp) && /wrap\('toggleVoice', LocalMP\.toggleVoice\)/.test(lmp),
    '① local-mp: تغليف النقاط الثلاث (sendReact/sendQuickMsg/toggleVoice) — rooms.js لم تُمسّ');

  /* ② أونو: لا مودال فوق اللعبة + لا لعب آلي عند الحجب */
  ok(uno.indexOf('_uiBlocked: function') > 0, '② uno-app: حارس _uiBlocked موجود');
  ok(/isRoom && this\._uiBlocked\(\)\)/.test(uno), '② uno-app: تجميد العد عند حجب الواجهة (roomUiTimerTick)');
  const uiStartBlock = lmp.slice(lmp.indexOf('LocalMP.uiStart'), lmp.indexOf('LocalMP.uiLeave'));
  ok(uiStartBlock.indexOf('openModal') === -1,
    '② local-mp: uiStart لا يفتح مودال اللوبي فوق اللعبة بعد البدء (جذر بلاغ الأونو)');

  /* ③ دومينو: قطع الخصم مقلوبة في الغرفة + CSS التخطيط */
  ok(/\(isAI \|\| inRoom\)\s*\n\s*\? R\.backsHTML/.test(dapp), '③ domino-app: قطع الخصم مقلوبة في الغرفة عند كل الطرفين (backsHTML)');
  ok(dapp.indexOf('dmPickP2') > 0 && dapp.indexOf('_uiBlocked: function') > 0, '③ domino-app: منطق الجهاز المشترك محفوظ (dmPickP2) + حارس الحجب للمؤقت');
  ok(dcss.indexOf('.dm-opptiles {') > 0 && dcss.indexOf('.dm-opptiles-v {') > 0,
    '③ dominoes.css: صنفا حاوية قطع الخصم معرَّفان الآن (جذر «تموضع مشوه»)');

  /* ④ زر APK المباشر */
  const legalPages = ['2fa.html', 'about.html', 'admins.html', 'contact.html', 'fairness.html', 'privacy.html', 'refund-policy.html', 'support.html', 'terms.html'];
  ok(idx.indexOf('class="apk-dl"') > 0 && idx.indexOf(APK_URL) > 0, '④ index.html: بطاقة apk-dl + الرابط الدائم');
  ok(lui.indexOf('apk-dl') > 0 && lui.indexOf(APK_URL) > 0, '④ legal-ui.js: البطاقة في فوتر كل الصفحات القانونية');
  let allLegalUseLui = true;
  for (const p of legalPages) {
    const s = fs.readFileSync(path.join(REPO, p), 'utf8');
    if (s.indexOf('legal-ui') < 0) { allLegalUseLui = false; break; }
  }
  ok(allLegalUseLui, '④ كل الصفحات القانونية التسع تستخدم legal-ui (بطاقة واحدة تغطي الجميع)');
  const apkKeys = ['apk.dlTitle', 'apk.dlSub', 'apk.dlBtn', 'apk.stepsTitle', 'apk.step1', 'apk.step2', 'apk.step3', 'apk.step4'];
  let keysOk = true;
  for (const k of apkKeys) { const v = TR[k]; if (!v || v.length !== 4) keysOk = false; }
  ok(keysOk, '④ مفاتيح apk.* الثمانية بأربع لغات كاملة (عربية/فرنسية/إنجليزية/دارجة)');
  ok(String(TR['lmp.voiceTooBig']).length > 0 && TR['lmp.voiceTooBig'].length === 4, '④ مفتاح lmp.voiceTooBig بأربع لغات (رسالة الصوت الكبيرة)');

  /* ═══════════════════ 2) المختبر الحي — المزامنة الاجتماعية ═══════════════════ */
  console.log('═══ v2.90 · مختبر حي: مزامنة الإيموجي/الرسائل/الصوت في غرفة محلية ═══');
  const A = await ensureUser('v290_lab_host', 'Pw123456!');
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  let hostCode = null;
  let Hside = null, Gside = null;
  const evTo = async (side, o) => { await side.page.evaluate(arg => { try { window.__dtsgLnEvt(arg.o); } catch (e) {} }, { o }); };
  const mkSide = async (tag, login) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
    await ctx.addInitScript(fakeNativeBridge, tag);
    await ctx.exposeFunction('__hubHost', async (t, code) => { if (t === 'H') hostCode = code; });
    await ctx.exposeFunction('__hubJoin', async (t, code) => {
      if (t !== 'G' || !hostCode || code !== hostCode) return;
      await evTo(Hside, { t: 'peerOpen', id: 1, kind: 'wifi' });
      await evTo(Gside, { t: 'joined', kind: 'wifi' });
    });
    await ctx.exposeFunction('__hubSend', async (t, id, s) => {
      if (t === 'H') await evTo(Gside, { t: 'data', id: 0, s });
      else if (t === 'G' && id === 0) await evTo(Hside, { t: 'data', id: 1, s });
    });
    await ctx.exposeFunction('__hubLeave', async (t) => {
      if (t === 'H') await evTo(Gside, { t: 'data', id: 0, s: JSON.stringify({ t: 'bye' }) });
      else if (t === 'G') await evTo(Hside, { t: 'peerClose', id: 1 });
    });
    const page = await ctx.newPage();
    page._errs = [];
    page.on('pageerror', e => page._errs.push('[pageerror] ' + e.message));
    page.on('dialog', d => { d.accept(tag === 'G' ? 'Guest290' : ''); });
    if (login) await ctx.request.post(BASE_SLASH + 'api/login', { data: { username: A.name, password: 'Pw123456!' } });
    await page.goto(BASE_SLASH, { waitUntil: 'domcontentloaded' });
    await wait(page, () => !!(window.Rooms && window.LocalMP && window.DTSGNative && DTSGNative.lnVersion() === '2' && typeof window.__hubSend === 'function'));
    return { tag, ctx, page };
  };
  const H = await mkSide('H', true);
  const G = await mkSide('G', false);
  Hside = H; Gside = G;

  async function pairGame(gid) {
    await H.page.evaluate((g) => LocalMP.hostRoom(g, {}), gid);
    const code = await wait(H.page, () => (window.LocalMP.state().room && window.LocalMP.state().room.code) || null, 8000);
    hostCode = code;
    await G.page.evaluate((c) => {
      LocalMP.state().lnRooms[c] = { code: c, ip: '127.0.0.1', port: 1, game: '', name: 'H', players: 1, transport: 'wifi' };
      LocalMP.joinByCode(c);
    }, code);
    await wait(H.page, () => (window.LocalMP.state().peers || []).some(p => p.userId != null) ? 1 : null, 8000);
    await wait(G.page, () => window.Rooms.state && window.Rooms.state.players && window.Rooms.state.players.length === 2 ? 1 : null, 8000);
    await wait(H.page, () => window.Rooms.state && window.Rooms.state.players && window.Rooms.state.players.length === 2 ? 1 : null, 8000);
    return code;
  }
  async function bothReadyAndStart() {
    await H.page.evaluate(() => LocalMP.setReady(true));
    await G.page.evaluate(() => LocalMP.setReady(true));
    await sleep(300);
    await H.page.evaluate(() => LocalMP.startGame());
    await wait(H.page, () => window.Rooms.state && window.Rooms.state.status === 'playing' ? 1 : null, 10000);
    await wait(G.page, () => window.Rooms.state && window.Rooms.state.status === 'playing' ? 1 : null, 10000);
  }
  async function teardownPair() {
    try { await G.page.evaluate(() => { try { LocalMP.leaveRoom(); } catch (e) {} }); } catch (e) {}
    try { await H.page.evaluate(() => { try { LocalMP.leaveRoom(); } catch (e) {} }); } catch (e) {}
    await sleep(350);
  }
  /* مراقب على مستقبلات الغرفة عند طرف — يسجل كل ما يصل (بلا تعطيل الأصل) */
  async function armSpy(side, names) {
    await side.page.evaluate((ns) => {
      window.__spies = window.__spies || {};
      ns.forEach(function (n) {
        const orig = Rooms[n].bind(Rooms);
        window.__spies[n] = [];
        Rooms[n] = function (d) { try { window.__spies[n].push(JSON.parse(JSON.stringify(d || {}))); } catch (e) {} return orig(d); };
      });
    }, names);
  }
  const spyOf = (side, n) => side.page.evaluate((n) => (window.__spies && window.__spies[n]) || [], n);

  /* ── غرفة أونو: التفاعل والرسائل والصوت أثناء اللعب ── */
  await pairGame('un');
  await armSpy(H, ['_onReact', '_onChat', '_onVoice']);
  await armSpy(G, ['_onReact', '_onChat', '_onVoice']);
  await bothReadyAndStart();

  /* ① الإيموجي الطافي: ضيف → مضيف */
  await G.page.evaluate(() => Rooms.sendReact('🎉'));
  let burst = await wait(H.page, () => {
    const st = document.getElementById('roomReactStage');
    return st && st.querySelector('.room-react-burst') ? (st.querySelector('.rrb-emoji') || {}).textContent : null;
  }, 6000).catch(() => null);
  ok(burst === '🎉', '① إيموجي الضيف 🎉 طفا عند المضيف (الأيقونة التفاعلية متزامنة)', String(burst));
  let hr = await spyOf(H, '_onReact');
  ok(hr.length === 1 && hr[0].emoji === '🎉' && hr[0].from_name === 'Guest290',
    '① المضيف استقبل react بعلم هوية الضيف (from_name=Guest290)', JSON.stringify(hr[0] || null));

  /* الإيموجي: مضيف → ضيف */
  await H.page.evaluate(() => Rooms.sendReact('🔥'));
  let gr = await wait(G.page, () => (window.__spies._onReact.length ? 1 : null), 6000).then(() => spyOf(G, '_onReact')).catch(() => []);
  ok(gr.length === 1 && gr[0].emoji === '🔥' && gr[0].from_name === 'v290_lab_host',
    '① الضيف استقل react من المضيف بعلم هويته', JSON.stringify(gr[0] || null));

  /* ① الرسالة النصية: ضيف → مضيف */
  await G.page.evaluate(() => {
    Rooms._syncReactWidget();
    Rooms._toggleReactPanel(true);
    const inp = document.getElementById('roomReactInput');
    if (inp) inp.value = 'salam ya sadik';
    Rooms.sendQuickMsg();
  });
  let hc = await wait(H.page, () => (window.__spies._onChat.length ? 1 : null), 6000).then(() => spyOf(H, '_onChat')).catch(() => []);
  ok(hc.length === 1 && hc[0].text === 'salam ya sadik' && hc[0].from_name === 'Guest290',
    '① رسالة الضيف النصية وصلت للمضيف بنصه وهويته', JSON.stringify(hc[0] || null));
  const inpCleared = await G.page.evaluate(() => { const i = document.getElementById('roomReactInput'); return i ? i.value : ''; });
  ok(inpCleared === '', '① حقل الإدخال أُفرغ عند المرسل بعد الإرسال');

  /* ① الرسالة النصية: مضيف → ضيف */
  await H.page.evaluate(() => {
    Rooms._syncReactWidget();
    Rooms._toggleReactPanel(true);
    const inp = document.getElementById('roomReactInput');
    if (inp) inp.value = 'marhba!';
    Rooms.sendQuickMsg();
  });
  let gc = await wait(G.page, () => (window.__spies._onChat.some(m => m.text === 'marhba!') ? 1 : null), 6000)
    .then(() => spyOf(G, '_onChat')).catch(() => []);
  const hostMsg = (gc || []).filter(m => m.text === 'marhba!' && m.from_name === 'v290_lab_host');
  ok(hostMsg.length === 1,
    '① رسالة المضيف وصلت للضيف', JSON.stringify(gc));

  /* ① الرسالة الصوتية: ضيف يسجل (ميكروفون وهمي) → مضيف يستقبل dataURL */
  const voiceStarted = await G.page.evaluate(() => { try { Rooms.toggleVoice(); return true; } catch (e) { return false; } })
    .then(() => wait(G.page, () => (window.Rooms._mr ? 1 : null), 6000)).catch(() => null);
  ok(voiceStarted === 1, '① تسجيل الصوت بدأ عند الضيف (MediaRecorder عبر ميكروفون وهمي)', String(voiceStarted));
  await sleep(1400);
  await G.page.evaluate(() => Rooms.stopVoice());
  let hv = await wait(H.page, () => (window.__spies._onVoice.length ? 1 : null), 9000).then(() => spyOf(H, '_onVoice')).catch(() => []);
  ok(hv.length === 1 && typeof hv[0].audio === 'string' && hv[0].audio.indexOf('data:audio/') === 0 && hv[0].dur >= 1,
    '① الرسالة الصوتية وصلت للمضيف كاملة (data:audio/ + مدة)', JSON.stringify(hv[0] || {}).slice(0, 90));
  ok(hv.length === 1 && hv[0].from_name === 'Guest290', '① الرسالة الصوتية موسومة بهوية المرسل');
  const bubble = await H.page.evaluate(() => {
    const st = document.getElementById('roomReactStage');
    return st && st.querySelector('.room-voice-bubble') ? 1 : 0;
  });
  ok(bubble === 1, '① فقاعة الصوت ظهرت عند المضيف (قابلة لإعادة التشغيل)');

  /* ② أونو: لا مودال فوق اللعبة + الضيف يملك مقعده ويتحكم */
  const unoSeat = await G.page.evaluate(() => ({
    seat: window.UnoApp._roomSeat, spec: window.UnoApp._isSpectator,
    my: window.UnoApp._mySeat(window.UNGameNS.st),
    hand: document.querySelectorAll('#unHand .un-handcard').length,
    modalShown: document.getElementById('roomModal').classList.contains('show'),
    blocked: window.UnoApp._uiBlocked()
  }));
  ok(unoSeat.seat === 1 && unoSeat.spec === false && unoSeat.my === 1,
    '② الضيف يملك مقعده في الأونو (seat=1 — مشتق من order)', JSON.stringify(unoSeat));
  ok(unoSeat.hand >= 5, '② يد الضيف مرسومة وقابلة للعب', String(unoSeat.hand) + ' بطاقات');
  ok(unoSeat.modalShown === false && unoSeat.blocked === false,
    '② لا مودال فوق الطاولة بعد بدء الجولة (جذر بلاغ الأونو)', JSON.stringify({ modal: unoSeat.modalShown, blocked: unoSeat.blocked }));
  const unoSeatH = await H.page.evaluate(() => ({
    seat: window.UnoApp._roomSeat, modalShown: document.getElementById('roomModal').classList.contains('show')
  }));
  ok(unoSeatH.seat === 0 && unoSeatH.modalShown === false, '② المضيف كذلك: مقعده 0 ولا مودال فوق طاولته');

  /* ② حركة حقيقية: من يملك الدور ينقر بطاقة قانونية فتصل للطرف الآخر */
  const before = await H.page.evaluate(() => {
    const s = window.UNGameNS.st;
    return { turn: s.turn, discard: s.discard.length, top: s.discard[s.discard.length - 1].id };
  });
  const mover = before.turn === 1 ? G : H;
  const played = await mover.page.evaluate(() => {
    const app = window.UnoApp;
    const s = window.UNGameNS.st;
    const me = app._mySeat(s);
    if (s.turn !== me) return { skip: true };
    const hand = s.hands[me] || [];
    const el = document.querySelector('#unHand .un-handcard.un-legal');
    if (!el) return { skip: true };
    const id = parseInt(el.getAttribute('data-card'), 10);
    const card = hand.find(c => c.id === id);
    if (!card) return { skip: true };
    el.click();
    /* منقّح الألوان (K) يفتح طبقة اختيار — اختر لوناً كبشر */
    if (card.color === 'K' && app._colorPick) app._onColorPick('R');
    return { skip: false, id: id, v: card.value, c: card.color };
  });
  if (!played.skip) {
    const after = await wait(H.page, (b) => {
      const s = window.UNGameNS.st;
      return s.discard.length >= b.n + 1 ? { turn: s.turn, discard: s.discard.length, top: s.discard[s.discard.length - 1].id } : null;
    }, 8000, { n: before.discard }).catch(() => null);
    const afterG = await wait(G.page, (b) => {
      const s = window.UNGameNS.st;
      return s.discard.length >= b.n + 1 ? { turn: s.turn, discard: s.discard.length, top: s.discard[s.discard.length - 1].id } : null;
    }, 8000, { n: before.discard }).catch(() => null);
    ok(!!after && !!afterG && after.discard === before.discard + 1 && afterG.discard === after.discard && afterG.turn === after.turn && afterG.top === after.top,
      '② حركة بشرية حقيقية: بطاقة قانونية نُقرت فوصلت وطبقت عند الطرفين بالتطابق',
      JSON.stringify({ played: played, H: after, G: afterG }));
  } else {
    ok(true, '② (لا بطاقة قانونية متاحة — تجاوزنا النقر التفاعلي؛ التزامن مغطى بحركة v289)');
  }

  /* ② تجميد المؤقت عند الحجب: مودال مفتوح ⇒ لا عدّ ولا لعب آلي */
  await G.page.evaluate(() => {
    window.UnoApp._lastActAt = Date.now() - 999999;   /* مؤقت منتهٍ منذ زمن */
    document.getElementById('roomModal').classList.add('show');
    window.UnoApp.roomUiTimerTick();
  });
  const frozen = await G.page.evaluate(() => ({
    blocked: window.UnoApp._uiBlocked(),
    lastActAt: window.UnoApp._lastActAt,
    auto: window.UnoApp._autoPlayedTurn,
    discard: window.UNGameNS.st.discard.length
  }));
  ok(frozen.blocked === true && frozen.lastActAt > Date.now() - 3000 && frozen.auto === null,
    '② الواجهة محجوبة ⇒ المؤقت جمّد ولا لعب آلي باسم اللاعب', JSON.stringify({ blocked: frozen.blocked, auto: frozen.auto }));
  const stillSame = await H.page.evaluate(() => window.UNGameNS.st.discard.length);
  ok(stillSame === frozen.discard, '② لا حركة آلية عبرت القناة أثناء الحجب (حالة الطرفين متطابقة)');
  await G.page.evaluate(() => {
    document.getElementById('roomModal').classList.remove('show');
    window.UnoApp.roomUiTimerTick();
  });
  const unblocked = await G.page.evaluate(() => window.UnoApp._uiBlocked());
  ok(unblocked === false, '② إغلاق المودال يعيد التحكم فوراً (اللاعب يكمل دوره بكامل وقته)');
  await teardownPair();

  /* ═══════════════════ 3) المختبر الحي — الدومينو ═══════════════════ */
  console.log('═══ v2.90 · مختبر حي: خصوصية الدومينو وتخطيطه في غرفة محلية ═══');
  await pairGame('do');
  await bothReadyAndStart();
  await wait(G.page, () => (window.DominoApp && window.DominoApp.room && window.DominoApp.room.on) ? 1 : null, 10000);
  await wait(H.page, () => (window.DominoApp && window.DominoApp.room && window.DominoApp.room.on) ? 1 : null, 10000);
  const domG = await G.page.evaluate(() => {
    const v = window.DominoApp.game.view();
    const cont = document.getElementById('dmOppTiles1');
    return {
      mySeat: window.DominoApp.room.mySeat,
      oppCount: v.handsCount[0],
      backs: cont ? cont.querySelectorAll('.dm-back').length : -1,
      faceUp: cont ? cont.querySelectorAll('.dm-htile').length : -1,
      text: cont ? cont.textContent.trim() : '?',
      display: cont ? getComputedStyle(cont).display : '?'
    };
  });
  ok(domG.mySeat === 1, '③ الضيف في مقعد 1 (الدومينو)');
  ok(domG.backs === domG.oppCount && domG.oppCount > 0,
    '③ حجارة خصم الضيف كلها مقلوبة (backs) بعدد يده الفعلي', JSON.stringify({ backs: domG.backs, opp: domG.oppCount }));
  ok(domG.faceUp === 0 && domG.text === '',
    '③ صفر أرقام مكشوفة لحجارة الخصم عند الضيف (لا نصوص ولا وجه مكشوف)', JSON.stringify({ faceUp: domG.faceUp, text: domG.text }));
  const domH = await H.page.evaluate(() => {
    const v = window.DominoApp.game.view();
    const cont = document.getElementById('dmOppTiles1');
    return {
      mySeat: window.DominoApp.room.mySeat,
      oppCount: v.handsCount[1],
      backs: cont ? cont.querySelectorAll('.dm-back').length : -1,
      faceUp: cont ? cont.querySelectorAll('.dm-htile').length : -1,
      display: cont ? getComputedStyle(cont).display : '?'
    };
  });
  ok(domH.backs === domH.oppCount && domH.faceUp === 0,
    '③ المضيف أيضاً: حجارة خصمه مقلوبة بالكامل (الإخفاء عند الطرفين)', JSON.stringify({ backs: domH.backs, opp: domH.oppCount, faceUp: domH.faceUp }));
  ok(domG.display === 'flex' && domH.display === 'flex',
    '③ حاوية قطع الخصم مرنة الآن — التخطيط مضبوط (تموضع مشوه عولج)', domG.display + '/' + domH.display);
  /* حارس المؤقت المحلي في الدومينو: واجهة محجوبة ⇒ لا لعب آلي */
  const dmFrozen = await G.page.evaluate(() => {
    const app = window.DominoApp;
    const before = JSON.stringify(app.game.state);
    document.getElementById('roomModal').classList.add('show');
    try { app._autoPlayLocal(); } catch (e) {}
    const after = JSON.stringify(app.game.state);
    document.getElementById('roomModal').classList.remove('show');
    return { same: before === after, blocked: app._uiBlocked() };
  });
  ok(dmFrozen.same === true, '③ دومينو: واجهة محجوبة ⇒ _autoPlayLocal لا يلعب باسم اللاعب');
  await teardownPair();

  /* ═══════════════════ 4) زر تحميل APK المباشر — حي ═══════════════════ */
  console.log('═══ v2.90 · زر تحميل APK المباشر (الرئيسية + الصفحات القانونية) ═══');
  const pg = await browser.newPage({ viewport: { width: 420, height: 820 } });
  await pg.goto(BASE_SLASH, { waitUntil: 'domcontentloaded' });
  const apkIdx = await pg.evaluate((u) => {
    const box = document.querySelector('#apkDl');
    if (!box) return null;
    const btn = box.querySelector('a.apk-dl-btn');
    const steps = box.querySelectorAll('.apk-dl-steps li');
    const r = box.getBoundingClientRect();
    return {
      href: btn ? btn.href : null,
      steps: steps.length,
      visible: r.height > 10 && r.width > 10,
      text: (box.querySelector('.apk-dl-txt b') || {}).textContent || ''
    };
  }, APK_URL);
  ok(!!apkIdx && apkIdx.href === APK_URL && apkIdx.visible && apkIdx.steps === 4,
    '④ الرئيسية: بطاقة ظاهرة بأسفل الفوتر + الرابط الدائم + 4 خطوات تثبيت', JSON.stringify(apkIdx));
  ok(!!apkIdx && apkIdx.text.indexOf('DTSG') >= 0, '④ عنوان البطاقة يحمل اسم التطبيق');

  let legalOk = 0, legalTotal = 0;
  for (const lp of ['privacy.html', 'terms.html', 'fairness.html', 'refund-policy.html', 'support.html', 'about.html', 'contact.html', '2fa.html', 'admins.html']) {
    legalTotal++;
    try {
      await pg.goto(BASE_SLASH + lp, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const r = await pg.evaluate((u) => {
        const box = document.querySelector('#apkDl');
        if (!box) return null;
        const btn = box.querySelector('a.apk-dl-btn');
        return { href: btn ? btn.href : null, steps: box.querySelectorAll('.apk-dl-steps li').length };
      }, APK_URL);
      if (r && r.href === APK_URL && r.steps === 4) legalOk++;
      else console.log('    ⚠ ' + lp + ': ' + JSON.stringify(r));
    } catch (e) { console.log('    ⚠ ' + lp + ': ' + e.message.slice(0, 60)); }
  }
  ok(legalOk === legalTotal, '④ كل الصفحات القانونية التسع تعرض البطاقة كاملة', legalOk + '/' + legalTotal);

  await browser.close();
  console.log('\n═══ الخلاصة ═══');
  console.log('PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

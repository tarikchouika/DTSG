/* ═══════════════════════════════════════════════════════════════════
   RD v2.5 — مشترك لاختبارات المتصفح (Playwright)
   يوفر: إطلاق Chromium (ثنائي @sparticuz/chromium) + صفحة بها التقاط
   الأخطاء + انتظار مسحي + لقطات الحالة العامة للغرف.
   الاستعمال:  node tests/_rd_classic_browser_test.js
   (يتطلب الخادم شغالاً بـ DM_TEST_MODE=1 على المنفذ 4173)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
/* [v2.49-QABASE] قابل للتهيئة: QA_BASE=http://localhost:3971/ (خادم qa-env) —
   الافتراضي يبقى 4173 كما كان. */
const BASE = process.env.QA_BASE || 'http://localhost:4173/';

/* [aarch64] ثنائي @sparticuz/chromium مبني لـ x86-64 فقط — على الأجهزة
   ذات النواة ARM (هاتف cat) يفشل الإقلاع بـ ENOENT. نستخدم ثنائي
   Playwright المحلي المتوافق مع المعمارية إن تعذّر sparticuz. */
async function launchBrowser() {
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
  try {
    const execPath = await (await import('@sparticuz/chromium')).default.executablePath();
    const fs = require('fs');
    if (fs.existsSync(execPath)) {
      try { return await chromium.launch({ executablePath: execPath, args: args }); }
      catch (e) { /* ثنائي بمعمارية مختلفة — سقوط للنظامي */ }
    }
  } catch (e) { /* بلا sparticuz — سقوط للنظامي */ }
  return chromium.launch({ args: args });
}

async function newPage(browser, viewport) {
  /* [v2.16.1 auto-lang] كشف اللغة التلقائي يجعل الزائر بلا تفضيل محفوظ يرى لغة
     المتصفح — الاختبارات كُتبت بعربية ثابتة، فنضبط locale ar-MA (وأزرار
     data-lang تنقر العربية عند الحاجة) لاستقرار النتائج عبر الأجهزة. */
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 800 }, locale: 'ar-MA' });
  const page = await ctx.newPage();
  const errs = [];
  page._errs = errs;
  page.on('pageerror', e => errs.push(String(e.message)));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|404|net::ERR|favicon/i.test(m.text())) errs.push(m.text());
  });
  page.on('dialog', d => d.accept().catch(() => {}));
  return { page: page, ctx: ctx };
}

async function gotoGamePage(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(page, () => !!(typeof AUTH !== 'undefined' && typeof Rooms !== 'undefined' &&
                            typeof RondaApp !== 'undefined' && typeof RondaCore !== 'undefined'), 20000);
  await page.waitForTimeout(700);   /* SSE + welcome */
}

async function wait(page, fn, timeout, arg) {
  timeout = timeout || 15000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const r = await page.evaluate(fn, arg); if (r) return r; } catch (e) { /* poll */ }
    await page.waitForTimeout(170);
  }
  return null;
}

/* لقطة الحالة العامة للمحرك (كل ما يجب تطابقه بين العملاء — بلا ما يخص طرفاً) */
const pubState = () => {
  const app = window.RondaApp;
  if (!app || !app.game) return null;
  const st = app.game.state;
  return {
    mode: st.mode,
    round: st.roundNumber, deal: st.dealNumber,
    currentSeat: st.currentSeat,
    deck: st.deck.length, table: st.table.cards.length,
    scores: st.teams.map(t => t.score),
    phase: st.phase,
    handCounts: st.players.map(p => p.hand.length),
    teamCounts: st.teams.map(t => t.playerIds.length)
  };
};

module.exports = { BASE: BASE, launchBrowser: launchBrowser, newPage: newPage, gotoGamePage: gotoGamePage, wait: wait, pubState: pubState };

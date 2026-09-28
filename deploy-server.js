'use strict';
/* ════════════════════════════════════════════════════════════════
   DTSG — ناقل الملفات إلى GitHub (خادم المعاينة المستقل :8080)
   [2026-09-17] يعرض deploy.html كصفحة جذر ويخدم /api/deploy/manifest
   من نفس المنفذ، فيعمل الناقل داخل منطقة المعاينة وحدها.
   تشغيل: DEPLOY_MANIFEST=1 node deploy-server.js
   ════════════════════════════════════════════════════════════════ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const pay = require('./server-payments.js');
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

http.createServer(function (req, res) {
  const u = url.parse(req.url, true);
  if (u.pathname === '/' || u.pathname === '/index.html' || u.pathname === '/deploy.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(path.join(ROOT, 'deploy.html')));
    return;
  }
  if (u.pathname === '/api/deploy/manifest') { pay.serveManifest(req, res, u); return; }
  /* ملفات ساندة (أيقونة الصفحة مثلاً) */
  let fp = path.normalize(path.join(ROOT, u.pathname));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(fp, function (e, d) {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(8080, '0.0.0.0', function () {
  console.log('DTSG ناقل الملفات (deploy) يعمل على http://0.0.0.0:8080');
});

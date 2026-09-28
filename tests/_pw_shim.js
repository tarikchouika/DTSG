/* [shim] يطلق متصفح @sparticuz/chromium (متوفر عبر npm) بدل تنزيل متصفحات
   Playwright المحجوب خارجياً — يُحقن عبر NODE_OPTIONS=--require. */
const path = require('path');
const pw = require('playwright');
const sp = require('@sparticuz/chromium');
const Chr = sp.default;
const binDir = path.join(path.dirname(require.resolve('@sparticuz/chromium')), '..', 'bin');
const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async function (opts) {
  opts = opts || {};
  const exec = await Chr.executablePath();
  try { await sp.inflate(path.join(binDir, 'al2023.tar.br')); } catch (e) {}
  opts.executablePath = exec;
  opts.args = [...(opts.args || []), ...Chr.args, '--no-sandbox', '--disable-dev-shm-usage'];
  opts.env = Object.assign({}, process.env, opts.env || {}, {
    LD_LIBRARY_PATH: '/tmp/al2023/lib:' + (process.env.LD_LIBRARY_PATH || '')
  });
  return orig(opts);
};

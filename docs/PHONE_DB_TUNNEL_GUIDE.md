# 📱 DTSG — خادم قاعدة البيانات المحلية على الهاتف + النفق

> هذه نسخة المستودع بنسخٍ نائبة للمعرّفات (`${CLOUDFLARE_ACCOUNT_ID}` · `${TUNNEL_KV_NS}`) كي تبقى آمنة في مستودع عام؛ القيم الفعلية في نسخة الهاتف الخاصة.

دليل تشغيل عملي (يُقرأ مرة، ثم تُستعمل **قائمة التحقق السريعة** في الأخير بعد كل إعادة تشغيل للهاتف).

> ⚠️ المستودع **عام** ⇒ لا تكتب أي توكن في أي ملف. التوكنات تُصدَّر في البيئة فقط: `export CLOUDFLARE_API_TOKEN=...`

---

## 0) المعمارية في سطور

```
   المتصفح (اللاعب)
     └─ https://dtsg.pages.dev                    ← الواجهة (Cloudflare Pages)
          └─ يقرأ /api-url2.json (بلا كاش)  =  https://casino-phone.dmgames-api.workers.dev
               └─ ووركر وسيط (Worker: casino-phone)
                    └─ يقرأ المفتاح «url» من Cloudflare KV (كاش 15 ثانية)
                         └─ النفق  (localhost.run *.lhr.life أو cloudflared)
                              └─ خادم الهاتف:  node server.js  على المنفذ 3000
                                   └─ قاعدة البيانات: data/royalcoin.db   (SQLite + WAL)
```

**القاعدة الذهبية:** عند تغيّر عنوان النفق لا تعدّل الواجهة ولا `api-url2.json` ولا الووركر — بل حدّث **مفتاح KV الواحد `url`** (تفصيله في القسم 2.4).

**احتياطي تلقائي:** إن فشل الووركر الوسيط (نفق ميت/ردّ HTML) تتحوّل الواجهة في نفس الطلب إلى ووركر D1 السحابي `casino-api.dmgames-api.workers.dev`.

---

## 1) خادم قاعدة البيانات المحلية على الهاتف

### 1.1 المتطلبات

| البند | المطلوب | ملاحظة |
|---|---|---|
| النظام | Termux أو Ubuntu (proot-distro) | |
| Node.js | **24** (الموصى به) | `node:sqlite` بلا عَلَم منذ 22.13 و23.4؛ على 22.5→22.12 استعمل `node --experimental-sqlite server.js`. على Node 24 العَلَم بلا تأثير |
| أدوات | `curl` · `git` · `openssh` · `pm2` | pm2 اختياري لكن مُوصى به |

```bash
pkg install nodejs-lts git curl openssh     # Termux
npm i -g pm2
node -v                                     # يجب ≥ 24
```

### 1.2 تحديث الشجرة على الهاتف (يضمّ v2.44-EDGE والإصلاحات السابقة)

> 🔎 **الحالة المقيسة الآن:** الهاتف الحيّ يردّ `build: 2.43.1` عبر الووركر الوسيط، أي أنه **متأخّر عن v2.44** ⇒ نفّذ هذا القسم أولاً.

```bash
cd ~/DTSG                      # أو مسارك (مثال شائع: /root/dmgames-arena)
git fetch origin main
git reset --hard origin/main    # المتوقع: 2cb0b14  (v2.44-EDGE)
git log --oneline -1

# تأكيد الملفات الحاسمة (كل عدّاد يجب أن يكون > 0):
grep -c "money_log"        server.js
grep -c "settleGoldLocal"  server-payments.js
grep -c "bot/admin-act"    cf-worker/payments-core.js
ls -1 css/15-edge.css tests/_layout_edge_test.js scripts/phone-tunnel.sh
```

### 1.3 متغيرات البيئة

| المتغيّر | الوظيفة |
|---|---|
| `PORT` | منفذ الخادم محلياً (3000) |
| `ADMIN_API_SECRET` | حماية مسارات `/api/admin/*` |
| `PAYMENTS_SHARED_SECRET` | توقيع طلبات المدفوعات |
| `USD_GOLD_RATE` | 100 ⇒ 1$ = 100 كوين |
| `DM_TEST_MODE` | `0` في الإنتاج (يمنع وضع الاختبار) |
| `SUPPORT_BOT_TOKEN` · `SUPPORT_WEBHOOK_SECRET` · `SUPPORT_BOT_USERNAME` · `SUPPORT_SUPER_TG` | بوت الدعم (تيليغرام) — من BotFather و`openssl rand -hex 24` |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_ADMIN_CHAT_ID` · `TELEGRAM_ADMIN_PIN` | بوت المنصة/الإشعارات (إن كان مستعملاً) |

> 🔐 المفتاحان المكشوفان سابقاً (`SUPPORT_BOT_TOKEN` و`SUPPORT_WEBHOOK_SECRET` القديمان) يجب أن يبقيا **مُدوَّرين**: BotFather → `/revoke` ثم تصدير التوكن الجديد، ثم `bash scripts/setup-telegram-bots.sh` لتفعيل الويبهوك بالسرّ الجديد.

### 1.4 التشغيل

```bash
cd ~/DTSG
# تجربة سريعة:
PORT=3000 USD_GOLD_RATE=100 node server.js        # Node ≥ 24 (بلا عَلَم)

# الطريقة المعتمدة — pm2:
export PORT=3000 USD_GOLD_RATE=100 \
       ADMIN_API_SECRET='<سرّ الإدارة>' PAYMENTS_SHARED_SECRET='<سرّ المدفوعات>'
pm2 start server.js --name casino-server --update-env
pm2 save                     # يحفظ القائمة
pm2 startup                  # نفّذ الأمر الذي يطبعه (مرة واحدة) ليقلع تلقائياً مع الهاتف
pm2 logs casino-server --lines 30
```

**🔴 الفخّ الأشهر: pm2 يشغّل مجلداً غير الذي تحدّثه.** اكتشفه فوراً:

```bash
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{JSON.parse(s||"[]").forEach(x=>console.log(x.name,"→",(x.pm2_env||{}).pm_cwd))})'
# إن اختلف المجلد: pm2 delete casino-server ثم:
# pm2 start <مسار_الشجرة_الصحيحة>/server.js --name casino-server
# وبديل آلي يكتشف المجلد الصحيح بنفسه:  bash scripts/update-phone-server.sh
```

### 1.5 قاعدة البيانات (SQLite)

- **الملف:** `data/royalcoin.db` (ومعه `royalcoin.db-wal` و`royalcoin.db-shm` وهما جزء من القاعدة).
- **الوضع:** `PRAGMA journal_mode = WAL` — أسرع وأأمن مع القراءة المتزامنة.
- ⛔ **لا تحذف** ملفي `-wal/-shm` أثناء عمل الخادم، **ولا تنسخ** `royalcoin.db` وحده (تحصل على قاعدة ناقصة بلا أحدث الحركات).

**نسخة احتياطية صحيحة (والخادم يعمل):**

```bash
mkdir -p ~/backup
sqlite3 ~/DTSG/data/royalcoin.db ".backup '$HOME/backup/royalcoin-$(date +%F-%H%M).db'"
# إن لم يتوفّر sqlite3: نقطة تفتيش ثم نسخ الثلاثة
sqlite3 ~/DTSG/data/royalcoin.db "PRAGMA wal_checkpoint(TRUNCATE);" && cp ~/DTSG/data/royalcoin.db* ~/backup/
```

**استعادة:**

```bash
pm2 stop casino-server
cp ~/backup/royalcoin-<التاريخ>.db ~/DTSG/data/royalcoin.db
rm -f ~/DTSG/data/royalcoin.db-wal ~/DTSG/data/royalcoin.db-shm
pm2 start casino-server
```

**صيانة دورية (شهرياً، والخادم متوقف):**

```bash
sqlite3 data/royalcoin.db "PRAGMA integrity_check;"   # المتوقع: ok
sqlite3 data/royalcoin.db "VACUUM;"
```

**فحص السلامة المالية (لا كوينز من العدم):**

```bash
sqlite3 data/royalcoin.db "SELECT COUNT(*) users, SUM(coins) coins, SUM(usd) usd FROM users;"
sqlite3 data/royalcoin.db "SELECT kind, COUNT(*), SUM(amount) FROM money_log GROUP BY kind;"
```

### 1.6 التحقق من الخادم محلياً

```bash
curl -s localhost:3000/api/health | head -c 200           # {"ok":true,...,"build":"2.44.x","payments":true}
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/payments/methods   # 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/data/royalcoin.db      # 404  (غير مكشوف ✔)
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/server.js              # 404  (غير مكشوف ✔)

# تحقق آلي شامل:
ADMIN_API_SECRET='<سرّ الإدارة>' bash scripts/verify-phone-v244.sh http://127.0.0.1:3000
bash scripts/phone-doctor.sh        # تشخيص فقط — لا يغيّر أي شيء
```

---

## 2) النفق (Tunnel)

### 2.1 لماذا؟

الهاتف بلا IP عام ثابت؛ النفق يمنح المنصة عنواناً `https` مؤقتاً يصل إلى خادم الهاتف، والووركر الوسيط يُخفي تغيّر العنوان عن الواجهة.

### 2.2 الطريقة المعتمدة الآن: localhost.run (بلا حساب)

```bash
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
    -R 80:localhost:3000 nokey@localhost.run
# يُطبع عنوان من نوع: https://xxxxxxxx.lhr.life

# في الخلفية مع سجل:
nohup ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
      -R 80:localhost:3000 nokey@localhost.run >> ~/dtsg-tunnel.log 2>&1 &
```

### 2.3 البديل: cloudflared

```bash
cloudflared tunnel --url http://127.0.0.1:3000      # يعطي https://xxx.trycloudflare.com
# نفق مُسمّى بنطاق ثابت: cloudflared tunnel create dtsg-phone  (يحتاج نطاقاً في حسابك)
```

### 2.4 🎯 الخطوة الأهم: نشر العنوان إلى Cloudflare KV

الووركر الوسيط يقرأ المفتاح `url` من مساحة KV باسم **tunnel-url** (معرّفها `${TUNNEL_KV_NS}`، وربطها `TUNNEL_KV`).

```bash
export CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID}
export CLOUDFLARE_API_TOKEN='<توكن Cloudflare — لا يُكتب في ملف>'

bash scripts/phone-tunnel.sh publish https://<العنوان-الجديد>.lhr.life
```

أو بالأداة كاملة (فتح النفق + استخراج العنوان + النشر + التحقق):

```bash
bash scripts/phone-tunnel.sh up ssh        # أو: up cloudflare
bash scripts/phone-tunnel.sh status        # KV · الخادم محلياً · السلسلة عمومياً
bash scripts/phone-tunnel.sh down          # إيقاف النفق الذي فتحته الأداة
```

ما يعادل `publish` يدوياً:

```bash
curl -X PUT -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/storage/kv/namespaces/${TUNNEL_KV_NS}/values/url" \
  --data 'https://xxxx.lhr.life'
```

> `tunnel-live.json` ملف **مرجعي** يُحدّثه السكربت محلياً بعد النشر (لتتبّع آخر عنوان)؛ مصدر الحقيقة للووركر هو **KV**.

### 2.5 تأكيد السلسلة كاملة

```bash
curl -s https://casino-phone.dmgames-api.workers.dev/api/health   # {"ok":true,...,"build":"2.44.x"}
curl -s https://dtsg.pages.dev/api-url2.json                      # ما تقرأه الواجهة فعلاً
curl -s https://dtsg.pages.dev/tunnel-live.json                   # المرجعي (اختياري)
```

> كاش الووركر **15 ثانية** ⇒ انتظر ربع دقيقة بعد النشر ثم أعد الفحص.

### 2.6 تشغيل تلقائي بعد إقلاع الهاتف

```bash
mkdir -p ~/.termux/boot && cat > ~/.termux/boot/dtsg.sh <<'EOS'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
pm2 resurrect
cd "$HOME/DTSG" && bash scripts/phone-tunnel.sh up ssh >> "$HOME/dtsg-boot.log" 2>&1
EOS
chmod +x ~/.termux/boot/dtsg.sh
```

- يحتاج تطبيق **Termux:Boot** (من F-Droid).
- ضع متغيّرات البيئة (التوكنات) في ملف **خارج المستودع** مثل `~/.dtsg.env` واستوردها من `~/.bashrc`.
- `termux-wake-lock` يمنع النظام من قتل النفق عند قفل الشاشة (أضف استثناء البطارية لتطبيق Termux).

---

## 3) ✅ قائمة التحقق السريعة (بعد كل إعادة تشغيل)

1. `pm2 status` → `casino-server` «online» وفي المجلد الصحيح.
2. `curl -s localhost:3000/api/health` → `{"ok":true,...,"build":"2.44.x"}`.
3. `bash scripts/phone-tunnel.sh up ssh`
4. `bash scripts/phone-tunnel.sh status` → KV يحمل عنوان نفقك · محلياً ok · الووركر الوسيط ok.
5. افتح `https://dtsg.pages.dev` على متصفح الهاتف وسجّل دخولاً/شغّل لعبة للتأكد.

> عند تبديل الشبكة (Wi-Fi ↔ بيانات) ينقطع ssh ويتغيّر العنوان ⇒ أعد الخطوة 3 (والنشر تلقائي).

---

## 4) استكشاف الأعطال

| العَرَض | السبب المرجّح | الحل |
|---|---|---|
| الواجهة تعمل لكن «نظام الدفع غير موصول» | خادم قديم بلا طبقة المدفوعات | القسم 1.2 ثم `pm2 restart casino-server` |
| `/api/health` يعطي `build` قديماً | pm2 يشغّل مجلداً آخر (`pm_cwd`) | القسم 1.4 أو `update-phone-server.sh` |
| الووركر الوسيط يردّ 502 / HTML | النفق مقطوع | `up` ثم `publish` |
| الووركر يردّ لكن البيانات لا تُحفظ | عنوان KV قديم | `publish` العنوان الجديد |
| `SQLITE_BUSY` / «قاعدة مقفلة» | عمليتان على نفس الملف | خادم واحد فقط: `pm2 delete` للنسخة المكررة |
| الكوينز لا تزيد بعد تأكيد الشحن | الويبهوك لم يصل | افحص `SUPPORT_WEBHOOK_SECRET` ثم `setup-telegram-bots.sh` |
| النفق يقف عند قفل الشاشة | توفير طاقة أندرويد | `termux-wake-lock` + استثناء البطارية |
| `EADDRINUSE` على 3000 | نسخة قديمة تعمل | `pm2 delete casino-server` ثم `pm2 start` |
| 404 على `/api/bot/request` | خادم قديم (قبل v2.44) | القسم 1.2 ثم إعادة التشغيل |

---

## 5) الأمان (إلزامي)

- المستودع **عام** ⇒ لا توكنات في أي ملف متتبَّع؛ الحارس `node tests/_repo_hygiene_test.js` (4/0) يفشل عند أي مفتاح حقيقي.
- الخادم **يمنع** تقديم ملفات الخادم والقاعدة عمومياً (`server.js:17`) — تحقّق في 1.6.
- المسارات الإدارية محميّة بـ `ADMIN_API_SECRET`؛ لا تُرسل السرّ في الروابط.
- KV والووركر الوسيط لا يحملان أي سرّ (العنوان عام أصلاً).
- دوّر أي مفتاح لُمس: BotFather `/revoke` · Cloudflare → Roll token · GitHub → Revoke.

---

## 6) الملفات المساعدة في المستودع

| الملف | الوظيفة |
|---|---|
| `scripts/phone-tunnel.sh` | فتح النفق + نشر العنوان إلى KV + عرض الحالة الحيّة |
| `scripts/phone-doctor.sh` | تشخيص شامل (لا يغيّر أي شيء) |
| `scripts/update-phone-server.sh` | تحديث الشجرة على الهاتف + إعادة تشغيل pm2 + تحقق فعلي |
| `scripts/verify-phone-v244.sh` | 10 فحوص آلية لواجهة الخادم ومسارات المدفوعات |
| `scripts/setup-telegram-bots.sh` | تفعيل ويبهوك بوت الدعم بالسرّ الصحيح |
| `docs/PHONE_UPDATE_v244.md` | تفاصيل ما تغيّر في v2.44 على الهاتف |

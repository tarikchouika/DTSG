#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# [v2.88·درس بناء #25] injection_chain_verify.sh — محاكاة سلسلة حقن سير البناء
# محلياً قبل الدفع: يبني هيكل مشروع Capacitor القالبي (styles.xml ·
# MainActivity.java الفارغ · AndroidManifest.xml بمرساة INTERNET) ثم ينفذ
# خطوات الحقن بالترتيب نفسه الذي يعمل به السير (8.4 كاميرا ← 8.5 الجسر
# والغامر وArbShare ← 8.6 بلوتوث LocalNet) ويصادق النواتج — فشل أي مرساة
# أو شرط = إيقاف قبل الدفع (كان البناء #26 سيُسقطه لاكتشاف ذلك في CI فقط).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WF="$REPO/.github/workflows/build-apk.yml"
WORK="/tmp/dtsg-inject-chain"
rm -rf "$WORK"
mkdir -p "$WORK/android/app/src/main/java/com/dtsg/app" \
         "$WORK/android/app/src/main/res/values"

# ① القوالب كما يولّدها Capacitor (مرساة INTERNET في المانيفست)
cat > "$WORK/android/app/src/main/AndroidManifest.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme.NoActionBar">
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:label="@string/title_activity_main"
            android:launchMode="singleTask"
            android:name="com.dtsg.app.MainActivity"
            android:theme="@style/AppTheme.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
EOF
cat > "$WORK/android/app/src/main/res/values/styles.xml" <<'EOF'
<resources>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:background">@null</item>
    </style>
</resources>
EOF
printf 'package com.dtsg.app;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n' \
  > "$WORK/android/app/src/main/java/com/dtsg/app/MainActivity.java"

cd "$WORK"

# ② استخراج مقاطع python من السير وتنفيذها بالترتيب الحقيقي
extract_step() {  # $1 = اسم الخطوة (جملة مميزة في run:) · $2 = ملف الإخراج
  python3 - "$WF" "$1" "$2" <<'PYX'
import io, sys, re
wf = io.open(sys.argv[1], encoding='utf-8').read()
marker = sys.argv[2]
# ابحث خطوة run: | التي يسبق اسمها/تعليقها الجملة المميزة ثم استخرج heredoc python
steps = re.split(r'\n      - name: ', wf)
for st in steps:
    if marker in st.split('\n')[0] or marker in st[:600]:
        m = re.search(r"python3 - <<'(\w+)'\n(.*?)\n\s*\1\n", st, re.S)
        if m:
            import textwrap
            io.open(sys.argv[3], 'w', encoding='utf-8').write(textwrap.dedent(m.group(2)) + '\n')
            sys.exit(0)
sys.exit('X لم أجد خطوة الحقن: ' + marker)
PYX
}

echo "── 8.4 كاميرا (خطوة 9 في السير) ──"
extract_step "Inject CAMERA permission" cam.py
python3 cam.py
grep -q 'android.permission.CAMERA' android/app/src/main/AndroidManifest.xml && echo "OK CAMERA"

echo "── 8.5 الجسر + الغامر + ArbShare (خطوة 10) ──"
extract_step "Edge-to-edge fullscreen" bridge.py
python3 bridge.py
test -f android/app/src/main/java/com/dtsg/app/ArbShareService.java && echo "OK ArbShareService مكتوب"
grep -q 'FOREGROUND_SERVICE_MEDIA_PROJECTION' android/app/src/main/AndroidManifest.xml && echo "OK أذونات الإسقاط"
grep -q 'ArbShareService' android/app/src/main/AndroidManifest.xml && echo "OK إعلان الخدمة"
grep -q 'class ArbShare' android/app/src/main/java/com/dtsg/app/MainActivity.java && echo "OK ArbShare في MainActivity"
grep -q 'cacheInsets' android/app/src/main/java/com/dtsg/app/MainActivity.java && echo "OK الجسر"

echo "── 8.6 بلوتوث LocalNet ──"
extract_step "Inject local-network permissions" lnet.py
python3 lnet.py
grep -q 'android.permission.BLUETOOTH_CONNECT' android/app/src/main/AndroidManifest.xml && echo "OK بلوتوث LocalNet"

echo "── إعادة تشغيل (idempotency) ──"
python3 bridge.py && python3 lnet.py && echo "OK التكرار آمن"

echo "── المانيفست النهائي صالح XML ──"
python3 -c "
import xml.dom.minidom, io
xml.dom.minidom.parse('android/app/src/main/AndroidManifest.xml')
print('OK XML سليم')
"

echo "═══ سلسلة الحقن كاملة ناجحة محلياً ═══"

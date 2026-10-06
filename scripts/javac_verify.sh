#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# [v2.88] javac_verify.sh — التحقق الهندسي قبل الدفع (نمط درس بناء #24)
# يستخرج جافا MainActivity + ArbShareService من سير البناء نفسه (لا نسخ ثانية)
# ويرجمها فعلياً بjavac ضد android.jar (API 34) + ستubs كاملة
# (Capacitor + androidx) — فشل الترجمة = إيقاف الدفع.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WF="$REPO/.github/workflows/build-apk.yml"
JAVAC="${JAVAC_BIN:-/tmp/jdk-21.0.2/bin/javac}"
ANDROID_JAR="${ANDROID_JAR:-/tmp/android-34/android.jar}"
WORK="/tmp/dtsg-javac-verify"
STUBS="$WORK/stubs"
OUT="$WORK/out"

rm -rf "$WORK"; mkdir -p "$STUBS/com/getcapacitor" "$STUBS/androidx/core/view" "$STUBS/androidx/core/app" "$STUBS/androidx/core/content" "$OUT"

# ① استخراج الجافا من سير البناء (المصدر الوحيد للحقيقة)
python3 - "$WF" "$WORK" <<'PYX'
import io, sys, re
wf = io.open(sys.argv[1], encoding="utf-8").read()
work = sys.argv[2]

def extract(varname, outfile):
    # ابحث "varname = '''" (المحتوى يبدأ على السطر نفسه!) ثم اجمع حتى '''
    lines = wf.split("\n")
    start = None
    same_line = ""
    for i, ln in enumerate(lines):
        m = re.match(r"^(\s*)" + re.escape(varname) + r"\s*=\s*'''(.*)$", ln)
        if m:
            start = i
            same_line = m.group(2)
            break
    if start is None:
        sys.exit("X لم أجد " + varname + " في سير البناء")
    indent = len(lines[start]) - len(lines[start].lstrip())
    body = [same_line]
    for j in range(start + 1, len(lines)):
        ln = lines[j]
        if ln.strip() == "'''":
            break
        body.append(ln[indent:] if ln.startswith(" " * indent) else ln)
    io.open(outfile, "w", encoding="utf-8").write("\n".join(body) + "\n")
    return len(body)

n1 = extract("new", work + "/MainActivity.java")
n2 = extract("svc", work + "/ArbShareService.java")
print(f"OK استخراج: MainActivity ({n1} سطراً) + ArbShareService ({n2} سطراً)")

# فحص الشرطة المائلة العكسية (درس بناء — الحقن يسكن سلسلة python ثلاثية)
for f in [work + "/MainActivity.java", work + "/ArbShareService.java"]:
    s = io.open(f, encoding="utf-8").read()
    if "\\" in s:
        for i, ln in enumerate(s.split("\n")):
            if "\\" in ln:
                print("X شرطة مائلة في " + f + " سطر " + str(i + 1) + ": " + ln[:80])
        sys.exit("X شرطة مائلة عكسية في الجافا المُستخرج — يكسر الحقن")
print("OK لا شرطات مائلة عكسية في أي من الملفين (عقد الحقن)")
PYX

# ② ستubs: Capacitor + androidx (غير الموجودين في android.jar)
cat > "$STUBS/com/getcapacitor/BridgeActivity.java" <<'EOF'
package com.getcapacitor;
public abstract class BridgeActivity extends android.app.Activity {
    protected com.getcapacitor.Bridge bridge;
    protected void onCreate(android.os.Bundle b) { super.onCreate(b); }
    public com.getcapacitor.Bridge getBridge() { return bridge; }
    @Override public void onBackPressed() { }
}
EOF
cat > "$STUBS/com/getcapacitor/Bridge.java" <<'EOF'
package com.getcapacitor;
public class Bridge {
    public android.webkit.WebView getWebView() { return null; }
    public android.webkit.WebView getWebViewRef() { return null; }
}
EOF
cat > "$STUBS/androidx/core/view/WindowCompat.java" <<'EOF'
package androidx.core.view;
public final class WindowCompat {
    public static void setDecorFitsSystemWindows(android.view.Window w, boolean b) { }
    public static androidx.core.view.WindowInsetsControllerCompat getInsetsController(android.view.Window w, android.view.View v) { return null; }
}
EOF
cat > "$STUBS/androidx/core/view/WindowInsetsCompat.java" <<'EOF'
package androidx.core.view;
public final class WindowInsetsCompat {
    public static final class Type {
        public static final int systemBars() { return 2; }
    }
}
EOF
cat > "$STUBS/androidx/core/view/WindowInsetsControllerCompat.java" <<'EOF'
package androidx.core.view;
public final class WindowInsetsControllerCompat {
    public static final int BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE = 1;
    public void setSystemBarsBehavior(int b) { }
    public void hide(int t) { }
    public void setAppearanceLightStatusBars(boolean b) { }
    public void setAppearanceLightNavigationBars(boolean b) { }
}
EOF
cat > "$STUBS/androidx/core/app/ActivityCompat.java" <<'EOF'
package androidx.core.app;
public final class ActivityCompat {
    public static int checkSelfPermission(android.content.Context c, String p) { return 0; }
    public static void requestPermissions(android.app.Activity a, String[] perms, int code) { }
    public static boolean shouldShowRequestPermissionRationale(android.app.Activity a, String p) { return false; }
}
EOF
cat > "$STUBS/androidx/core/content/ContextCompat.java" <<'EOF'
package androidx.core.content;
public final class ContextCompat {
    public static int checkSelfPermission(android.content.Context c, String p) { return 0; }
    public static void startForegroundService(android.content.Context c, android.content.Intent i) { }
}
EOF

# ③ الترجمة الفعلية — فشل واحد = فشل التحقق كله
"$JAVAC" -nowarn -encoding UTF-8 \
  -classpath "$ANDROID_JAR:$STUBS" \
  -d "$OUT" \
  "$WORK/MainActivity.java" "$WORK/ArbShareService.java" "$STUBS"/com/getcapacitor/*.java "$STUBS"/androidx/core/*/*.java 2>&1 | grep -v "^Note:" || true

if [ ! -f "$OUT/com/dtsg/app/MainActivity.class" ]; then
  echo "═══ COMPILE FAILED ═══"
  "$JAVAC" -encoding UTF-8 -classpath "$ANDROID_JAR:$STUBS" -d "$OUT" \
    "$WORK/MainActivity.java" "$WORK/ArbShareService.java" 2>&1 | head -40
  exit 1
fi
echo "═══ COMPILE OK ═══ MainActivity + ArbShareService ترجُما بنجاح ضد API 34"
echo "الأنواع المولَّدة:"; ls "$OUT/com/dtsg/app/" | head -12

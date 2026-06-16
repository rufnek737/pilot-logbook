#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

# ── 1. <body> 바로 다음, authOverlay보다 먼저, 최상위 z-index로 splash 삽입 ──
OLD_BODY = """<body>

<!-- Auth Overlay -->"""

NEW_BODY = """<body>

<!-- Native Splash (WebView 즉시 페인트, OS 아이콘 스플래시 직후 표시) -->
<div id="nativeSplash" style="position:fixed;inset:0;z-index:999999;background:#0a1440 url('native-splash.jpg') center/cover no-repeat;transition:opacity .4s ease"></div>

<!-- Auth Overlay -->"""

assert OLD_BODY in c, "body marker not found"
c = c.replace(OLD_BODY, NEW_BODY, 1)

# ── 2. </body> 직전에 스플래시 제거 스크립트 삽입 ──
OLD_END = "</body>\n</html>"
NEW_END = """<script>
  // 네이티브 스플래시: 일정 시간 후 페이드아웃하며 제거
  setTimeout(function() {
    var sp = document.getElementById('nativeSplash');
    if (sp) {
      sp.style.opacity = '0';
      setTimeout(function() { sp.remove(); }, 400);
    }
  }, 1300);
</script>
</body>
</html>"""

assert OLD_END in c, "end marker not found"
c = c.replace(OLD_END, NEW_END, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('done')

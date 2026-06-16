#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

# ── 1. CSS: authOverlay를 영상 배경 레이어 구조로 변경 ──
OLD_CSS = """#authOverlay {
      position: fixed; inset: 0; z-index: 9999;
      background: var(--bg);
      display: flex; align-items: center; justify-content: center;
    }
    #authOverlay.hidden { display: none; }
    .auth-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 20px; padding: 40px 32px; text-align: center;
      max-width: 320px; width: 90%;
    }"""

NEW_CSS = """#authOverlay {
      position: fixed; inset: 0; z-index: 9999;
      background: #061a35;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    #authOverlay.hidden { display: none; }
    #authBgVideo {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; z-index: 0;
    }
    #authOverlay::after {
      content: ''; position: absolute; inset: 0; z-index: 1;
      background: linear-gradient(180deg, rgba(6,20,40,.55) 0%, rgba(6,20,40,.35) 45%, rgba(6,20,40,.75) 100%);
    }
    .auth-card {
      position: relative; z-index: 2;
      background: rgba(15,25,45,.55); border: 1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border-radius: 20px; padding: 40px 32px; text-align: center;
      max-width: 320px; width: 90%;
    }"""

assert OLD_CSS in c, "CSS marker not found"
c = c.replace(OLD_CSS, NEW_CSS, 1)

# ── 2. HTML: #authOverlay 시작 직후 <video> 삽입 ──
OLD_HTML = """<!-- Auth Overlay -->
<div id="authOverlay">
  <!-- 인앱 브라우저 경고 (카카오톡 등) -->"""

NEW_HTML = """<!-- Auth Overlay -->
<div id="authOverlay">
  <video id="authBgVideo" autoplay muted loop playsinline>
    <source src="auth-bg.mp4" type="video/mp4">
  </video>
  <!-- 인앱 브라우저 경고 (카카오톡 등) -->"""

assert OLD_HTML in c, "HTML marker not found"
c = c.replace(OLD_HTML, NEW_HTML, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('done')

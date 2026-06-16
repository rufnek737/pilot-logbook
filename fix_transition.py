#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

# ── 1. video 태그에 poster + preload 추가 (로딩 중 빈 화면 방지) ──
OLD_VIDEO = """  <video id="authBgVideo" autoplay muted loop playsinline>
    <source src="auth-bg.mp4" type="video/mp4">
  </video>"""
NEW_VIDEO = """  <video id="authBgVideo" autoplay muted loop playsinline preload="auto" poster="auth-bg-poster.jpg">
    <source src="auth-bg.mp4" type="video/mp4">
  </video>"""
assert OLD_VIDEO in c, "video marker not found"
c = c.replace(OLD_VIDEO, NEW_VIDEO, 1)

# ── 2. nativeSplash 페이드 전환을 더 부드럽게 (0.4s → 0.6s) ──
OLD_SPLASH_DIV = """<div id="nativeSplash" style="position:fixed;inset:0;z-index:999999;background:#0a1440 url('native-splash.jpg') center/cover no-repeat;transition:opacity .4s ease"></div>"""
NEW_SPLASH_DIV = """<div id="nativeSplash" style="position:fixed;inset:0;z-index:999999;background:#0a1440 url('native-splash.jpg') center/cover no-repeat;transition:opacity .6s ease"></div>"""
assert OLD_SPLASH_DIV in c, "splash div marker not found"
c = c.replace(OLD_SPLASH_DIV, NEW_SPLASH_DIV, 1)

OLD_SPLASH_JS = """setTimeout(function() {
    var sp = document.getElementById('nativeSplash');
    if (sp) {
      sp.style.opacity = '0';
      setTimeout(function() { sp.remove(); }, 400);
    }
  }, 1300);"""
NEW_SPLASH_JS = """setTimeout(function() {
    var sp = document.getElementById('nativeSplash');
    if (sp) {
      sp.style.opacity = '0';
      setTimeout(function() { sp.remove(); }, 600);
    }
  }, 1300);"""
assert OLD_SPLASH_JS in c, "splash js marker not found"
c = c.replace(OLD_SPLASH_JS, NEW_SPLASH_JS, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('done')

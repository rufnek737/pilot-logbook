#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

# ── 1. .auth-card 초기 opacity:0 + 트랜지션 추가 ──
OLD_CARD_CSS = """    .auth-card {
      position: relative; z-index: 2;
      background: rgba(15,25,45,.55); border: 1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border-radius: 20px; padding: 40px 32px; text-align: center;
      max-width: 320px; width: 90%;
    }"""
NEW_CARD_CSS = """    .auth-card {
      position: relative; z-index: 2;
      background: rgba(15,25,45,.55); border: 1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border-radius: 20px; padding: 40px 32px; text-align: center;
      max-width: 320px; width: 90%;
      opacity: 0; transition: opacity .5s ease;
    }
    .auth-card.show { opacity: 1; }"""
assert OLD_CARD_CSS in c, "card css marker not found"
c = c.replace(OLD_CARD_CSS, NEW_CARD_CSS, 1)

# ── 2. nativeSplash 제거 완료 후 auth-card 페이드인 트리거 ──
OLD_SPLASH_JS = """setTimeout(function() {
    var sp = document.getElementById('nativeSplash');
    if (sp) {
      sp.style.opacity = '0';
      setTimeout(function() { sp.remove(); }, 600);
    }
  }, 1300);"""
NEW_SPLASH_JS = """setTimeout(function() {
    var sp = document.getElementById('nativeSplash');
    if (sp) {
      sp.style.opacity = '0';
      setTimeout(function() {
        sp.remove();
        var card = document.getElementById('authCard');
        if (card) card.classList.add('show');
      }, 600);
    }
  }, 1300);"""
assert OLD_SPLASH_JS in c, "splash js marker not found"
c = c.replace(OLD_SPLASH_JS, NEW_SPLASH_JS, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('done')

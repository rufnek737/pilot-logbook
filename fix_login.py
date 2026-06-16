#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""www/index.html의 signInWithGoogle() 함수를 네이티브 Capacitor 버전으로 교체"""

import os

TARGET = os.path.join(os.path.dirname(__file__), 'www', 'index.html')

with open(TARGET, 'r', encoding='utf-8') as f:
    content = f.read()

print(f'파일 크기: {len(content)} bytes')

# ── 1. 함수 시작/끝 위치 파악 ──────────────────────────────────────────────
START_MARKER = 'async function signInWithGoogle() {'
start_idx = content.find(START_MARKER)
if start_idx == -1:
    print('❌ signInWithGoogle 함수를 찾을 수 없습니다!')
    exit(1)

print(f'함수 시작: {start_idx}')

# 중괄호 카운팅으로 함수 끝 탐색
depth = 0
in_string = False
string_char = None
end_idx = start_idx
i = start_idx

while i < len(content):
    c = content[i]
    if in_string:
        if c == '\\':
            i += 2
            continue
        if c == string_char:
            in_string = False
    else:
        if c in ('"', "'", '`'):
            in_string = True
            string_char = c
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end_idx = i + 1
                break
    i += 1

print(f'함수 끝: {end_idx}')

old_func = content[start_idx:end_idx]
print(f'기존 함수 길이: {len(old_func)} chars')

# ── 2. GOOGLE_BTN_HTML 상수가 이미 있는지 확인 ──────────────────────────────
has_btn_html = 'GOOGLE_BTN_HTML' in content

# ── 3. 새 함수 정의 ──────────────────────────────────────────────────────────
GOOGLE_SVG = """<svg width="20" height="20" viewBox="0 0 48 48" style="margin-right:8px;vertical-align:middle"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Google로 로그인"""

NEW_FUNC = f"""async function signInWithGoogle() {{
  const GOOGLE_BTN_HTML = `{GOOGLE_SVG}`;
  const btn = document.querySelector('.google-btn');
  if (btn) {{ btn.disabled = true; btn.textContent = '로그인 중...'; }}
  try {{
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform());
    if (isNative) {{
      const GoogleAuth = window.Capacitor.Plugins.GoogleAuth;
      if (!GoogleAuth) {{
        alert('GoogleAuth 플러그인 없음\\nnpx cap sync android 후 APK 재빌드 필요');
        return;
      }}
      await GoogleAuth.initialize({{
        clientId: '824870554939-vicqc3fpdmo2b4n14ot8hegjqn97uvb5.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      }});
      const googleUser = await GoogleAuth.signIn();
      const idToken = googleUser.authentication.idToken;
      const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
      await auth.signInWithCredential(credential);
    }} else {{
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      await auth.signInWithPopup(provider);
    }}
  }} catch(e) {{
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {{
      alert('[로그인 오류] ' + (e.message || JSON.stringify(e)));
    }}
    console.error('로그인 오류:', e);
  }} finally {{
    if (btn) {{ btn.disabled = false; btn.innerHTML = `{GOOGLE_SVG}`; }}
  }}
}}"""

# ── 4. 교체 ──────────────────────────────────────────────────────────────────
new_content = content[:start_idx] + NEW_FUNC + content[end_idx:]

print(f'새 파일 크기: {len(new_content)} bytes')

# ── 5. 저장 ──────────────────────────────────────────────────────────────────
with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('✅ www/index.html 업데이트 완료!')

# ── 6. 검증 ──────────────────────────────────────────────────────────────────
with open(TARGET, 'r', encoding='utf-8') as f:
    verify = f.read()

if 'isNativePlatform' in verify and 'GoogleAuth.signIn' in verify:
    print('✅ 네이티브 로그인 코드 확인됨')
else:
    print('❌ 검증 실패!')

if verify.endswith('</html>'):
    print('✅ 파일 끝 정상 (</html>)')
else:
    print('❌ 파일 끝 이상:', repr(verify[-50:]))

#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

# ── 1. CSS 추가 (.google-btn 정의 바로 위에) ──
OLD_CSS = """.google-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      width: 100%; padding: 14px; border-radius: 12px;
      background: #fff; color: #1f2937;
      border: none; font-size: 14px; font-weight: 700;
      cursor: pointer; transition: opacity .2s;
    }
    .google-btn:hover { opacity: .9; }
    .google-btn svg { flex-shrink: 0; }"""

NEW_CSS = """.google-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      width: 100%; padding: 14px; border-radius: 12px;
      background: #fff; color: #1f2937;
      border: none; font-size: 14px; font-weight: 700;
      cursor: pointer; transition: opacity .2s;
    }
    .google-btn:hover { opacity: .9; }
    .google-btn svg { flex-shrink: 0; }
    .auth-input {
      width: 100%; margin-bottom: 10px; padding: 13px 14px;
      background: var(--surface2); border: 1px solid var(--border);
      border-radius: 12px; color: var(--text); font-size: 14px;
      font-family: inherit; -webkit-appearance: none; transition: border-color .2s;
    }
    .auth-input:focus { outline: none; border-color: var(--accent); }
    .auth-row {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 12px; color: var(--text2); margin-bottom: 16px;
    }
    .auth-row label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .auth-row a, .auth-switch a { color: #d7a646; text-decoration: none; font-weight: 600; }
    .auth-btn-primary {
      width: 100%; padding: 14px; border: none; border-radius: 12px;
      background: linear-gradient(135deg, #f0c96a 0%, #d7a646 100%);
      color: #1a1306; font-size: 15px; font-weight: 700; cursor: pointer;
      transition: opacity .2s; margin-bottom: 16px;
    }
    .auth-btn-primary:hover { opacity: .92; }
    .auth-btn-primary:disabled { opacity: .6; cursor: default; }
    .auth-divider {
      display: flex; align-items: center; gap: 10px;
      color: var(--text3); font-size: 12px; margin-bottom: 16px;
    }
    .auth-divider::before, .auth-divider::after {
      content: ''; flex: 1; height: 1px; background: var(--border);
    }
    .auth-switch { margin-top: 16px; font-size: 13px; color: var(--text2); }"""

assert OLD_CSS in c, "CSS marker not found"
c = c.replace(OLD_CSS, NEW_CSS, 1)

# ── 2. authCard HTML 교체 (Google 전용 → 이메일/회원가입 포함) ──
OLD_CARD = """  <div class="auth-card" id="authCard">
    <div class="auth-logo">✈</div>
    <div class="auth-title">파일럿 로그북</div>
    <div class="auth-sub">Google 계정으로 로그인하면<br>모든 기기에서 데이터가 동기화됩니다.</div>
    <button class="google-btn" onclick="signInWithGoogle()">
      <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.8 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/><path fill="#FBBC05" d="M10.5 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.3-7.7 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>
      Google로 로그인
    </button>
  </div>"""

NEW_CARD = """  <div class="auth-card" id="authCard">
    <div class="auth-logo">✈</div>
    <div class="auth-title">파일럿 로그북</div>
    <div class="auth-sub" id="authSub">이메일로 로그인하거나<br>Google 계정으로 빠르게 시작하세요.</div>

    <!-- 로그인 폼 -->
    <div id="loginForm">
      <input type="email" id="loginEmail" class="auth-input" placeholder="이메일 주소" autocomplete="email" />
      <input type="password" id="loginPassword" class="auth-input" placeholder="비밀번호" autocomplete="current-password" />
      <div class="auth-row">
        <label><input type="checkbox" id="rememberMe" checked /> 로그인 상태 유지</label>
        <a href="#" onclick="resetPassword();return false;">비밀번호 찾기</a>
      </div>
      <button class="auth-btn-primary" onclick="signInWithEmail()">로그인</button>
      <div class="auth-divider"><span>또는</span></div>
      <button class="google-btn" onclick="signInWithGoogle()">
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.8 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/><path fill="#FBBC05" d="M10.5 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.3-7.7 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>
        Google로 로그인
      </button>
      <div class="auth-switch">계정이 없으신가요? <a href="#" onclick="toggleAuthMode();return false;">회원가입</a></div>
    </div>

    <!-- 회원가입 폼 -->
    <div id="signupForm" style="display:none">
      <input type="email" id="signupEmail" class="auth-input" placeholder="이메일 주소" autocomplete="email" />
      <input type="password" id="signupPassword" class="auth-input" placeholder="비밀번호 (6자 이상)" autocomplete="new-password" />
      <input type="password" id="signupPasswordConfirm" class="auth-input" placeholder="비밀번호 확인" autocomplete="new-password" />
      <button class="auth-btn-primary" onclick="signUpWithEmail()">가입하기</button>
      <div class="auth-divider"><span>또는</span></div>
      <button class="google-btn" onclick="signInWithGoogle()">
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.8 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/><path fill="#FBBC05" d="M10.5 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.3-7.7 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>
        Google로 로그인
      </button>
      <div class="auth-switch">이미 계정이 있으신가요? <a href="#" onclick="toggleAuthMode();return false;">로그인</a></div>
    </div>
  </div>"""

assert OLD_CARD in c, "authCard marker not found"
c = c.replace(OLD_CARD, NEW_CARD, 1)

# ── 3. JS 함수 추가 (signInWithGoogle 함수 정의 바로 앞에 삽입) ──
OLD_JS_MARKER = "function signInWithGoogle() {"
NEW_JS_FUNCS = """function toggleAuthMode() {
  const login = document.getElementById('loginForm');
  const signup = document.getElementById('signupForm');
  const sub = document.getElementById('authSub');
  const showSignup = login.style.display !== 'none';
  login.style.display = showSignup ? 'none' : '';
  signup.style.display = showSignup ? '' : 'none';
  sub.innerHTML = showSignup
    ? '이메일로 가입하고<br>비행 기록을 시작하세요.'
    : '이메일로 로그인하거나<br>Google 계정으로 빠르게 시작하세요.';
}

function emailAuthErrorMessage(e) {
  const map = {
    'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
    'auth/user-not-found': '등록되지 않은 이메일입니다.',
    'auth/wrong-password': '비밀번호가 일치하지 않습니다.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다.',
    'auth/weak-password': '비밀번호가 너무 약합니다 (6자 이상).',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/too-many-requests': '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
    'auth/missing-email': '이메일을 입력해주세요.',
  };
  return map[e.code] || e.message || JSON.stringify(e);
}

async function signInWithEmail() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { alert('이메일과 비밀번호를 입력해주세요.'); return; }
  const remember = document.getElementById('rememberMe').checked;
  const btn = document.querySelector('#loginForm .auth-btn-primary');
  btn.disabled = true; btn.textContent = '로그인 중...';
  try {
    await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    alert('[로그인 오류] ' + emailAuthErrorMessage(e));
    console.error('이메일 로그인 오류:', e);
  } finally {
    btn.disabled = false; btn.textContent = '로그인';
  }
}

async function signUpWithEmail() {
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupPasswordConfirm').value;
  if (!email || !password) { alert('이메일과 비밀번호를 입력해주세요.'); return; }
  if (password.length < 6) { alert('비밀번호는 6자 이상이어야 합니다.'); return; }
  if (password !== confirm) { alert('비밀번호가 일치하지 않습니다.'); return; }
  const btn = document.querySelector('#signupForm .auth-btn-primary');
  btn.disabled = true; btn.textContent = '가입 중...';
  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (e) {
    alert('[회원가입 오류] ' + emailAuthErrorMessage(e));
    console.error('회원가입 오류:', e);
  } finally {
    btn.disabled = false; btn.textContent = '가입하기';
  }
}

async function resetPassword() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { alert('비밀번호를 재설정할 이메일을 입력해주세요.'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    alert('비밀번호 재설정 메일을 보냈습니다. 이메일을 확인해주세요.');
  } catch (e) {
    alert('[오류] ' + emailAuthErrorMessage(e));
  }
}

function signInWithGoogle() {"""

assert c.count(OLD_JS_MARKER) == 1, f"signInWithGoogle marker count != 1 (found {c.count(OLD_JS_MARKER)})"
c = c.replace(OLD_JS_MARKER, NEW_JS_FUNCS, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('done')

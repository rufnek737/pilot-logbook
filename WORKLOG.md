# Pilot Logbook — Work Log

---

## 2026-06-16 (Windows — 로그인/스플래시 영상화)

### ✅ 완료된 작업

#### 이메일/비밀번호 로그인 추가
- 로그인 폼 (이메일/비밀번호, 로그인 상태 유지, 비밀번호 찾기) 추가
- 회원가입 폼 추가 (이메일/비밀번호/비밀번호 확인), "회원가입" 링크로 전환
- Firebase Console → Authentication → 이메일/비밀번호 공급자 사용 설정 완료
- **버그 수정**: 기존 `signInWithGoogle()` 함수가 `async` 누락 상태로 내부에서 `await` 사용 →
  SyntaxError로 해당 script 블록 전체가 깨져 Google 로그인이 실제로는 동작하지 않던 문제 발견 및 수정

#### 앱 아이콘/스플래시 — 실사 디자인으로 교체
- 사용자가 제공한 새 아이콘 이미지(흰 배경 → flood-fill로 투명화) → `assets/icon.png` → 전체 mipmap 적용
- `apply_icons.py`의 `SPLASH_SIZES`에 `night`/`ldpi` 변형 폴더 누락 발견 → 추가
  (다크모드에서 옛 아이콘이 스플래시로 보이던 버그 원인)

#### 스플래시 화면 영상화
- Android 12+ SplashScreen API는 풀스크린 이미지를 지원하지 않고 작은 아이콘만 지원 (OS 제약)
  → 인페이지 HTML `#nativeSplash` 오버레이 방식으로 직접 구현
- 사용자가 제공한 영상에서 UI 인트로(아이콘+"PILOT LOGBOOK" 텍스트 페이드 인/아웃, 0~3초) 추출
  → `www/splash-intro.mp4` (인트로 그대로 재생 후 페이드 → 로그인/메인 화면)
- 로그인 화면 배경에도 같은 원본 영상에서 UI 없는 구간(2.7초~끝)만 추출
  → `www/auth-bg.mp4` 로 루프 재생 (로그인 카드는 반투명+blur로 가독성 확보)
- `capacitor.config.json` `launchShowDuration: 200→0` — OS 아이콘 스플래시 최소화
- `MainActivity.java` — Capacitor `SplashScreenPlugin`이 자체적으로 `installSplashScreen()`을
  호출하는 걸 발견, 직접 추가했던 중복 호출 제거 (충돌로 스플래시가 즉시 사라지던 원인)
- 스플래시→로그인 전환 시 텍스트가 겹쳐 보이는 문제 → `.auth-card` 페이드인을
  스플래시 제거 완료 후로 순서 분리

---

## 2026-06-15 (Windows — Android 완료)

### ✅ 완료된 작업

#### 버그 수정 (www/index.html)
1. **출력 홀수행 보이지 않음** — print view에 `color-scheme: light` + `td { color:#111; background:#fff }` 추가
2. **프로필 아이콘 깨짐** — photoURL 없을 때 이니셜 원형 배지(`#userInitial`)로 대체
3. **"비행 기록" 타이틀 줄바꿈** — `.section-title { white-space: nowrap }`
4. **T/O LDG 표기** — 카드 + 출력 모두 PF=1, PM=0 숫자 표시
5. **출력 T/O 카운트 오류** — print rows `||0` → `||1` (카드와 동일 폴백)

#### 출력 기능 전면 재작성
- `window.open()` → **인페이지 오버레이** (`#printView`) 방식 (Android WebView 호환)
- 뒤로 버튼: `closePrintView()`로 오버레이 닫기
- 인쇄 버튼: Android `PrintManager` JavaScript Bridge 연결
- `@media print`: body 흰 배경 강제, 버튼 숨김, 앱 dark 배경 제거

#### Android 네이티브 (MainActivity.java)
- `PrintBridge` JavaScript Interface 추가
- `window.AndroidPrint.print()` → Android 시스템 인쇄 다이얼로그

---

## 다음 작업 — macOS (iOS 빌드)

### iOS 시작 명령어

```bash
git pull origin main
npm install
npx cap sync ios
npx cap open ios
```

### iOS 체크리스트
- [ ] GoogleService-Info.plist → `ios/App/App/` 에 배치 (Firebase Console에서 다운로드)
- [ ] Info.plist URL Scheme에 `REVERSED_CLIENT_ID` 등록
- [ ] 인쇄 기능 — iOS WKWebView에서 `window.print()` 동작 확인
  - 안되면 iOS용 PrintBridge 별도 구현 필요
- [ ] 스플래시/아이콘 Xcode Assets 확인
- [ ] Apple Developer Signing 설정 (Team, Bundle ID: `com.rufnek.pilotlogbook`)

### 기술 스택
| 항목 | 값 |
|------|-----|
| Firebase Project | pilot-logbook-22bb8 |
| Bundle ID | com.rufnek.pilotlogbook |
| Capacitor | v8 |
| Google Auth | @codetrix-studio/capacitor-google-auth@3.4.0-rc.4 |
| Workers URL | https://crewconnex.tae26001.workers.dev |
| GitHub | https://github.com/rufnek737/pilot-logbook (Private) |

---

## 2026-06-14 (Windows)
- Google 로그인 수정 (네이티브 Capacitor 플러그인)
- Cloudflare Workers 배포 (CC 동기화 서버)
- 앱 아이콘/스플래시 생성 및 적용
- Android styles.xml — Theme.SplashScreen → Theme.AppCompat (Android 12 splash 버그 수정)

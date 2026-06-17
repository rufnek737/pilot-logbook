# Pilot Logbook — Work Log

---

## 2026-06-17 (macOS — iOS UX 버그 수정)

### ✅ 완료된 작업

#### 새로고침 실패 메시지 숨김
- 풀투리프레시 실패 시 `#syncStatus`에 표시되던 "⚠ 새로고침 실패" 제거 → 빈 문자열로 대체

#### CC 가져오기 오류 메시지 개선
- `loginCrewConnex()`: 서버가 "로그인 성공 + Roster 페이지 없음" 에러를 반환할 때 (= 5일 이내 비행 없음)
  장황한 페이지 내용 전체 대신 "✅ 로그인 성공, 최근 5일 이내 비행이 없습니다"로 표시

### 📌 iOS 빌드 절차 (cap sync 후 매번 필요)
```bash
cd /Users/kaymac/projects/pilot-logbook
npx cap sync ios
rm -rf ios/App/CapApp-SPM ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
cd ios/App && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install && cd ../..
npx cap open ios   # Xcode → Cmd+Shift+K → Cmd+B
```

---

## 2026-06-17 (Windows — 낮/밤 모드 + 헤더 개선)

### ✅ 완료된 작업

#### 낮/밤 테마 전환 기능 추가
- CSS 변수 기반 `body.day { }` 라이트 테마 정의 (배경 밝은 회백색, 텍스트 다크 네이비)
- 헤더 우측에 `🌙/☀️` 토글 버튼 추가, `localStorage`로 선택값 저장/복원
- `toggleTheme()` JS 함수 추가, 페이지 로드 시 저장된 테마 자동 적용

#### 헤더 레이아웃 개선
- 낮/밤 모드 모두 헤더에 딥블루 gradient 고정 적용 (낮 모드: `#1e3a5f → #2563eb`)
- 로고 텍스트 `white-space: nowrap` 적용 → 줄바꿈 방지
- 로고 텍스트/서브텍스트 색상 흰색 고정 (테마에 무관하게 헤더는 항상 어두운 배경이므로)
- 헤더 비행 수 배지 (`#totalFlightsLabel`) 제거 → 통계 탭에서 확인 가능

#### 헤더 레이아웃 2차 수정
- `header-top` / `logo` align-items를 `center` → `flex-start`로 변경 → 우측 유저칩 상단 잘림 해결
- `logo-sub` `white-space: normal` + `max-width: 160px` → "PILOT ELECTRONIC LOGBOOK" 두 줄 표시
- `line-height: 1.3` 추가로 두 줄 간격 정리

#### Android Google 로그인 복구
- macOS 커밋(`6e741ab`)이 `www/index.html`의 `clientId`를 iOS용으로 덮어써서 Android 로그인 깨짐
- `Capacitor.getPlatform()`으로 플랫폼 분기 → Android/iOS 각각 올바른 clientId 사용

---

## 2026-06-17 (macOS — iOS 실기기 빌드/테스트)

### ✅ 완료된 작업

#### iOS CocoaPods 전환
- `@codetrix-studio/capacitor-google-auth`가 `Package.swift`를 제공하지 않아 SPM과 근본적으로
  호환 불가 (Capacitor 7+ 기본값인 SPM 워크플로우로는 빌드 자체에 플러그인이 포함되지 않음)
- Xcode에서 `CapApp-SPM` 패키지 참조 제거 (Frameworks 목록 + Package Dependencies)
- `ios/App/Podfile` 신규 작성 (Capacitor + 플러그인 전부 CocoaPods로 전환), `pod install` 적용
- `ios/debug.xcconfig`에 `#include "App/Pods/Target Support Files/Pods-App/Pods-App.debug.xcconfig"`
  추가 (커스텀 xcconfig라 CocoaPods가 자동으로 연결 못 하던 문제)

#### Google 로그인 iOS 활성화
- 원인 1: `npm install`로 플러그인 재설치 후 `npx cap sync ios`를 누락 → `capacitor.config.json`의
  `packageClassList`에 `GoogleAuth`가 빠져서 네이티브 플러그인 자체가 인식 안 됨 → 재sync로 해결
- 원인 2: 기존 클라이언트 ID가 Google Cloud Console에 **웹(Web)** 타입으로 등록돼 있어 iOS 커스텀
  URL 스킴 리다이렉트가 거부됨 (`Custom scheme URIs are not allowed for 'WEB' client type`)
  → Google Cloud Console에서 **iOS 타입 OAuth 클라이언트** 신규 생성 (Bundle ID: `com.rufnek.pilotlogbook`)
  → `www/index.html`의 `clientId`를 iOS 클라이언트 ID로 교체, 기존 웹 클라이언트 ID는
  `capacitor.config.json` → `plugins.GoogleAuth.serverClientId`로 이동 (Firebase 백엔드 토큰 검증용)
  → `Info.plist`에 새 iOS 클라이언트 ID 역순 문자열로 `CFBundleURLTypes` 등록
- 실기기에서 로그인 성공 확인

#### iOS 앱 아이콘 교체
- `apply_icons.py`가 Android 전용이라 iOS `AppIcon.appiconset`은 한 번도 갱신된 적 없이
  Capacitor 기본 placeholder 아이콘 그대로였음 → `pilot_logbook_app_icon_1024.png`로 교체

#### iOS 인쇄 기능 네이티브 브리지 신규 구현
- WKWebView는 안드로이드와 달리 `window.print()`만으로 인쇄 다이얼로그가 뜨지 않음
- `ios/App/App/PrintViewController.swift` 신규 추가 — `CAPBridgeViewController` 상속,
  `capacitorDidLoad()`에서 `WKScriptMessageHandler("iosPrint")` 등록 →
  `UIPrintInteractionController` + `webView.viewPrintFormatter()`로 시스템 인쇄 다이얼로그 호출
  (안드로이드 `PrintBridge`와 동일한 역할)
- `Main.storyboard`의 뷰 컨트롤러 customClass를 `CAPBridgeViewController` → `PrintViewController`로 변경
- `www/index.html` 인쇄 버튼 핸들러에 `window.webkit.messageHandlers.iosPrint` 분기 추가
- 빌드/적용 완료, 실기기 동작 테스트는 사용자 진행 중

### 📌 참고
- `ios/App/Podfile`, `Podfile.lock` 신규 — 앞으로 iOS 의존성 변경 시 `pod install` 필요
- Xcode는 항상 `.xcworkspace`로 열어야 함 (`.xcodeproj` 아님)

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
cd ios/App && pod install && cd ../..
npx cap open ios   # .xcworkspace로 열림 (CocoaPods 전환 완료, .xcodeproj 직접 열지 말 것)
```

### iOS 체크리스트
- [x] Info.plist URL Scheme에 `REVERSED_CLIENT_ID` 등록 (2026-06-17)
- [x] 인쇄 기능 — iOS용 PrintBridge 별도 구현 완료 (2026-06-17), 실기기 최종 확인 대기
- [x] 아이콘 Xcode Assets 확인 (2026-06-17, placeholder였던 걸 실제 아이콘으로 교체)
- [ ] 스플래시 영상(`auth-bg.mp4`/`splash-intro.mp4`) iOS 실기기 재생 확인
- [ ] Apple Developer Signing 설정 (Team, Bundle ID: `com.rufnek.pilotlogbook`) — 앱스토어 배포 전 필요

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

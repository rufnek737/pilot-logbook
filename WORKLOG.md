# Pilot Logbook — Work Log

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

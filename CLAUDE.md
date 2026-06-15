# Pilot Logbook — Claude Code 컨텍스트

## 프로젝트 개요
- 제주항공 기장용 파일럿 로그북 PWA + Android/iOS 앱
- Single-file SPA: `www/index.html` (앱 번들), `index.html` (Netlify 웹)
- Firebase Auth + Firestore, Capacitor v8

---

## ⚠️ 절대 규칙
- **Netlify 배포 금지** (June 17 이후만 가능)
- GitHub push만 가능
- `www/index.html`은 대용량 → macOS에서는 직접 편집 가능

---

## 현재 상태 (2026-06-15 기준)

### Android — 완료 ✅
- Google 로그인 (네이티브 Capacitor 플러그인)
- Cloudflare Workers CC 동기화 서버
- 출력 기능: 인페이지 오버레이 + Android PrintManager Bridge
- 아이콘/스플래시 적용 완료
- UI 버그 수정 완료 (홀수행, 프로필 아이콘, T/O 카운트 등)

### iOS — 다음 작업 🔧
맥북에서 시작:
```bash
git clone https://github.com/rufnek737/pilot-logbook.git
cd pilot-logbook
npm install
npx cap sync ios
npx cap open ios
```

#### iOS 필수 체크리스트
1. **GoogleService-Info.plist** — Firebase Console에서 iOS 앱용 다운로드
   → `ios/App/App/GoogleService-Info.plist` 에 배치
2. **URL Scheme** — Xcode Info.plist에 `REVERSED_CLIENT_ID` 등록
3. **Signing** — Xcode > Signing & Capabilities > Team 설정
4. **인쇄 기능** — iOS WKWebView에서 `window.print()` 동작 확인
   (안 되면 iOS용 PrintBridge 구현 필요)
5. **Bundle ID** — `com.rufnek.pilotlogbook` 확인

---

## 남은 작업 (전체)
- [ ] iOS 빌드 및 테스트
- [ ] 이메일/비밀번호 로그인 추가
- [ ] 디버그 alert 제거 (`[디버그]` 검색)
- [ ] Release APK/IPA 빌드 (서명)

---

## 파일 구조
```
pilot-logbook/
├── www/index.html          ← 앱 번들 (Android/iOS 공통)
├── index.html              ← 웹(Netlify) 버전
├── android/                ← Capacitor Android
│   └── app/src/main/java/com/rufnek/pilotlogbook/MainActivity.java  ← PrintBridge 포함
├── ios/                    ← Capacitor iOS
├── workers/crewconnex.js   ← Cloudflare Workers (배포 완료)
├── assets/icon.png         ← 1024x1024 아이콘 소스
├── assets/splash.png       ← 2732x2732 스플래시 소스
└── WORKLOG.md              ← 상세 작업 이력
```

---

## 기술 스택
| 항목 | 값 |
|------|-----|
| Firebase Project | pilot-logbook-22bb8 |
| Bundle ID | com.rufnek.pilotlogbook |
| Capacitor | v8 |
| Google Auth | @codetrix-studio/capacitor-google-auth@3.4.0-rc.4 |
| Android SHA-1 (debug) | 5E:24:89:C7:DF:B2:50:B5:73:2B:7E:12:E2:E4:38:D4:E0:75:B0:E9 |
| Workers URL | https://crewconnex.tae26001.workers.dev |
| GitHub | https://github.com/rufnek737/pilot-logbook (Private) |

# Pilot Logbook — Work Log

---

## 2026-07-17 (계정 관리·회원 탈퇴 + FAQ·정책 공개)

### ✅ 완료된 작업

#### 계정 및 도움말 메뉴
- 헤더 사용자 영역을 누르면 이름·이메일, FAQ, 개인정보처리방침, 이용약관 및 무료·유료 정책, 문의하기, 로그아웃, 회원 탈퇴를 한곳에서 확인하도록 구성.
- 문의 이메일을 `rufnek737@gmail.com`으로 연결.
- 로그인 전 화면에도 FAQ·개인정보처리방침·이용약관 링크를 노출해 가입 전에 확인 가능하도록 추가.
- 로그아웃 시 클라우드 저장 대기분을 먼저 반영하고 기기의 계정별 로컬 비행기록을 제거해 다른 계정과 섞이지 않도록 보완.

#### 앱 내 회원 탈퇴
- 이메일 계정은 현재 비밀번호, Google 계정은 Google 재인증으로 본인 확인 후 탈퇴하도록 구현.
- 실수 방지를 위해 경고문과 `탈퇴` 확인 문구를 모두 거쳐야 최종 삭제 버튼이 활성화되도록 구성.
- 탈퇴 시 Firestore 비행기록 문서 → 사용자 문서 → Firebase 로그인 계정 → 현재 기기 로컬 기록 순으로 삭제.
- 로그인 계정 삭제 단계가 실패하면 이미 지운 클라우드 비행기록을 복구 시도해 계정만 남고 기록만 사라지는 중간 상태를 방지.

#### FAQ·개인정보처리방침·이용약관
- `faq.html`: 제주항공 지원 범위, 전후 5일 조회, 재가져오기 검토, 기기 변경, 회원 탈퇴, 문의 방법 등을 안내.
- 요청에 따라 계기·야간시간과 개인 메모 보존 여부를 별도 FAQ 항목으로 만들지 않음.
- `privacy.html`: Firebase 계정·비행기록, CrewConnex 일회성 조회, 기기 내 PDF·Excel 처리, 외부 인프라, 보유·파기, 이용자 권리와 문의처를 실제 코드 흐름에 맞춰 정리.
- `terms.html`: 시험 운영 기간에는 제한 없음, 정식 유료화 이후 CrewConnex 자동 가져오기 최초 50편 무료, 이후 자동 가져오기만 유료 전환 원칙을 명시.
- 결제하지 않아도 기존 기록 조회·수정, 수동 입력, 인쇄·PDF 저장은 계속 무료이고 기존 기록을 잠그거나 삭제하지 않는 원칙을 명시.

### ✅ 검증
- 인라인 스크립트 2개 구문 검사, 정책 페이지 간 링크 및 요청 제외 FAQ 문구 검사 통과.
- 가짜 이메일 계정으로 비밀번호 재인증 → 비행기록 문서 삭제 → 사용자 문서 삭제 → Firebase 계정 삭제 순서 확인.
- FAQ가 앱 내부 문서창에서 정상 로드되고 지원 이메일·무료/유료 정책이 표시되는지 확인.
- 390×844 아이폰 크기에서 계정 메뉴 버튼, 정책 메뉴, 문의처, 로그아웃·회원 탈퇴 영역의 잘림과 가로 넘침이 없음을 확인.
- `npx cap sync ios`로 FAQ·정책 파일을 포함한 최신 웹 파일을 iOS 프로젝트에 동기화.
- CocoaPods 작업공간으로 iOS Debug 빌드 성공 후 `Kay phone`(iPhone 15 Pro Max)에 기존 앱 위로 설치·실행 완료.

### 출시 전 확인 필요
- 정식 상용화 전 사업자/운영자 법적 표기와 Firebase 실제 저장 리전을 확정한 뒤 개인정보처리방침의 국외 처리·위탁 내용을 최종 검토해야 함.

---

## 2026-07-17 (CrewConnex 재동기화 보존 규칙 + 편조/개인 메모 분리)

### ✅ 완료된 작업

#### CrewConnex 가져오기 변경 확인 및 선택 적용
- 가져온 비행을 기존 기록과 비교해 `신규`·`변경`·`동일`로 자동 분류하고 상단 요약에 편수를 표시.
- 변경된 편은 OUT/IN, 비행시간, 출·도착지, 기종, 기번, 역할, Duty Code, 편조의 이전값과 CrewConnex 값을 항목별로 펼쳐 확인 가능.
- 신규·변경 편만 기본 선택하고 동일 편은 선택·재저장에서 제외해 불필요한 동기화를 방지.
- 전체 선택과 개별 선택을 지원하고 실제 선택된 편만 적용하며, 완료 알림에 신규/변경 적용 편수를 구분해 표시.
- 상세 화면에서 개별 저장한 뒤에도 가져오기 검토 목록을 즉시 다시 비교해 상태를 최신화.
- 계기시간, 야간시간, PF/PM, 오토랜딩, 개인 메모 보존 규칙은 그대로 유지.

#### 가져오기 완료 안정성 보완
- 존재하지 않는 `totalFlightsLabel`을 갱신하며 발생하던 예외를 방지해 적용 후 렌더링과 완료 알림이 끝까지 실행되도록 수정.

#### CrewConnex 기존 기록 재동기화
- 기존 `선택 가져오기`는 같은 날짜·편명의 비행이 있으면 건너뛰었으나, 이제 기존 기록을 최신 CrewConnex 실적으로 갱신.
- 자동 갱신 항목: OUT/IN, 비행시간, 구간, 기번·기종, 역할, Duty Code, 편조.
- 사용자 입력 보존 항목: 계기시간, 야간시간, PF/PM, 오토랜딩, 개인 메모.
- 동기화 완료 토스트를 `신규 N편 · 기존 N편 갱신` 형식으로 변경.
- 개별 `상세` 가져오기에서도 기존 기록을 찾으면 신규 중복 생성 대신 저장 전 갱신 화면으로 연결.

#### `비고`를 `편조`와 `개인 메모`로 분리
- 기존 `remarks` 공용 필드를 `crewInfo`(자동 파싱 편조)와 `personalMemo`(사용자 메모)로 분리.
- 입력·수정 화면의 `비고`를 `편조`로 변경하고 별도 `개인 메모` 입력란 추가.
- 로그북 카드에는 편조를 읽기 영역으로, 개인 메모를 즉시 편집 가능한 입력란으로 구분 표시.
- 검색 대상에 편조와 개인 메모를 모두 포함.
- Firestore 실시간 동기화 중 작성 중인 개인 메모가 사라지지 않도록 포커스 값 보존 로직 변경.

#### 기존 데이터 호환
- 구버전 기록의 `remarks` 값은 최초 로드 시 `crewInfo`로 자동 이전.
- 구버전 앱과의 호환을 위해 `remarks`에는 편조 사본을 계속 유지.
- Excel/PDF 신규 가져오기와 PDF 업데이트에도 새 필드 구조를 적용하고 기존 개인 메모를 보존.

### ✅ 검증
- 인라인 스크립트 2개 구문 검사 통과.
- 데이터 병합 테스트 8개 통과: 기존 ID, 계기·야간, 착륙 항목, 개인 메모 보존 / CrewConnex 자동값·편조 갱신 / 신규 빈값 / 구버전 마이그레이션.
- 변경 검토 로직 테스트 15개 통과: 신규·변경·동일 분류, 변경 항목 추출, 구버전 편조 호환, 수동 입력값 보존.
- 390×844 테스트 화면에서 신규 1편·변경 1편·동일 1편 분류, 변경표 펼침, 선택 수 반영, 선택 적용 및 완료 알림 확인.
- 적용 후 변경 자동값·신규 편 반영과 개인 메모·계기·야간 보존, 가로 넘침 없음 확인.
- 변경 확인 기능 포함 iOS 빌드 성공 후 `Kay phone`에 덮어쓰기 설치·실행 완료.
- 390×844 모바일 화면에서 새 필드 존재, 가로 넘침 없음, 브라우저 오류 없음 확인.
- `npx cap sync ios`로 최신 웹 파일을 iOS 프로젝트에 동기화.
- `Kay phone`(iPhone 15 Pro Max) 대상 Debug 빌드·기존 앱 덮어쓰기 설치·실행 성공 확인.

---

## 2026-07-10 (macOS — 인정시간 PIC/SIC 명확화 + 3NC 계산 수정 + 합산 PIC/SIC)

### ✅ 완료된 작업

#### 3NC 인정시간 계산 버그 수정
- `calcCreditedTime()`의 3NC가 `⅓ PIC + ⅔ SIC`로 잘못 계산되고 있었음
  (옵션 라벨·규정은 `⅓ PIC + ⅓ SIC`)
- `sic: block*2/3` → `sic: block/3`로 수정 (예: 7:08 → PIC 2:23 / SIC 2:23)
- 상단 통계, 통계 탭 PIC/SIC 집계에도 자동 반영됨

#### 카드 "인정시간" 표시 명확화
- 기존: `cr.pic`만 표시 → 3NC 편은 PIC(⅓)만 보이고 SIC는 숨겨짐
- 수정: PIC/SIC가 모두 있는 편(3NC)은 `P 2:23 / S 2:23`처럼 두 줄로 둘 다 표시
- 순수 PIC/SIC 편은 색으로 구분 (파랑=PIC, 초록=SIC)

#### 기간 합산에 PIC/SIC 추가
- `calcRangeSum()`: `calcCreditedTime` 누적으로 PIC/SIC 합계 계산
- 합산 결과 패널: 총비행·야간·계기·편수 + PIC·SIC 칸 추가 (3열 2행)

> 참고: 인정시간 = 규정(SP.5.1) 기준 근무 형태별 PIC/SIC 환산 시간.
> 단독 운항은 기장=전체 PIC / 부기장=전체 SIC, 증편(3-set)은 3PC(⅔PIC)/3NC(⅓PIC+⅓SIC)/3F(⅔SIC)

---

## 2026-06-25 (macOS — CrewConnex 가져오기 인식 개선 + 중복 ALD 제거)

### ✅ 완료된 작업

#### CrewConnex 도착시간 익일(+1) 파싱
- 증상: `ICN 0701+1`처럼 익일 도착(+1) 표기가 있는 편의 도착시간이 빈 값으로 들어옴
- **Worker** `fmtTime()`: `+N` 익일 표기 제거 후 파싱 (`0701+1` → `07:01`)
- **클라이언트** 텍스트 붙여넣기 파서 `FLIGHT_RE`: 4자리 시각 뒤 `(?:\+\d)?` 허용
- 참고: DPS→ICN은 시차(발리 UTC+8 → 한국 UTC+9)로 BLH 7:19가 실제 정확값.
  도착시간만 자동으로 채워지면 손으로 건드릴 일이 없어 8:19로 잘못 덮어쓰는 일 방지

#### Duty code 자동 인식
- 증상: 본인 duty code가 비고(편조)엔 들어가는데 DUTY CODE 칸엔 항상 'C'로 하드코딩됨
- **Worker**: 로그인 아이디(=이름)를 각 편 crew 명단에서 찾아 본인 position을
  duty code/role로 매핑 (`posToDuty`, `applyDutyCode`) — 3PC/3NC/3F/Capt/FO 처리
- **클라이언트**: CC 가져오기(목록·상세) 시 서버가 준 `dutyCode`/`role` 사용

#### 기종 7M8 → B737-8 인식
- 증상: 7M8 편인데 기종이 B737-800으로 들어감 (AC Reg 컬럼 오인식/기종 컬럼 미검출 시 기본값)
- **Worker**: 컬럼 헤더 의존 대신 행 전체에서 기종 코드(7M8/B38M/738/A32x/Q400) 직접 스캔하는 폴백 추가
- **클라이언트**: `_ccAcType()` 헬퍼로 원본/매핑값 무엇이 와도 B737-8/B737-800 등으로 통일

> Worker(`workers/crewconnex.js`)는 `npx wrangler deploy`로 Cloudflare 재배포 완료
> (crewconnex.tae26001.workers.dev) — wrangler OAuth 로그인 상태에서 직접 배포

#### 비행 기록 입력/수정 폼 — 중복 ALD 필드 제거
- 착륙(LDG) 옆에 동작하지 않는 중복 "오토랜딩 (ALD)" 셀렉트(`fAldDup`)가 있었음
  (앱 최초 생성 커밋부터 존재, JS에서 미참조)
- 죽은 `fAldDup` 제거, 착륙(LDG)을 전체 너비로. 실제 동작 필드 `fAld`는 그대로 유지

#### CC 선택 가져오기 → 메인(로그북) 복귀
- 증상: 가져오기 후 CC 결과 페이지가 남아 불러오기 성공 여부 확인이 어려움
- `importSelectedFlights()`: CC 모달을 먼저 닫고 로그북 탭 전환 + 맨 위로 스크롤한 뒤
  저장·렌더링 (렌더링 예외와 무관하게 항상 닫히도록 순서 변경)

---

## 2026-06-24 (macOS — 헤더 안전영역 + 업로드 정리 + 수정 저장)

### ✅ 완료된 작업

#### 상단 헤더 안전영역 배경 비침 수정
- `viewport` 메타에 `viewport-fit=cover` 추가
  → 누락 시 iOS에서 `env(safe-area-inset-top)`이 0으로 계산되어 안전영역 커버가 사라지고
    카드 내용이 상태바 영역으로 비쳐 보이던 문제 해결
- 별도 오버레이(`#safeAreaTop` fixed 요소) 방식 제거 →
  헤더 자체 패딩에 안전영역 포함: `padding: calc(16px + env(safe-area-inset-top)) 20px 12px`
  → 헤더 그라데이션 배경이 상태바까지 끊김 없이 연속으로 덮음 (색 이음새 없음)
- `.header`의 `backdrop-filter: blur(20px)` 제거 (반투명 블러로 뒤 내용이 비치는 것 방지, 불투명 그라데이션만 유지)

#### 업로드 탭 "지원 형식 안내" 설명란 제거
- 업로드 탭 하단 `📋 지원 형식 안내` chart-card 블록 완전 삭제

#### 비행 기록 수정 → 저장 시 화면 닫힘 보장
- `saveEntry()`: 기존 `saveData() → renderFlights() → closeModal()` 순서에서
  중간 렌더링 예외 시 `closeModal()`에 도달 못 해 모달이 안 닫히던 문제
- `closeModal()`을 저장·렌더링보다 먼저 호출하도록 순서 변경 →
  저장 누르면 무조건 화면 먼저 닫힘 (`editingId`는 토스트 메시지용으로 사전 보관)

---

## 2026-06-17 (macOS — iOS UX 버그 수정)

### ✅ 완료된 작업

#### 새로고침 실패 메시지 숨김
- 풀투리프레시 실패 시 `#syncStatus`에 표시되던 "⚠ 새로고침 실패" 제거 → 빈 문자열로 대체

#### CC 가져오기 오류 메시지 개선
- `loginCrewConnex()`: 서버가 "로그인 성공 + Roster 페이지 없음" 에러를 반환할 때 (= 5일 이내 비행 없음)
  장황한 페이지 내용 전체 대신 "✅ 로그인 성공, 최근 5일 이내 비행이 없습니다"로 표시

#### iOS 오버스크롤 배경 깜빡임 방지
- `html` / `body` 모두 `overscroll-behavior: none` 추가
- 드래그 시 흰 배경이 비치던 문제 해결

#### CC 모달 배경 스크롤 방지 + 블러 개선
- `openCrewConnex()`: iOS body-lock 방식 적용 — `position:fixed` + `top: -scrollY` 저장/복원
  (`body.overflow = hidden`은 iOS WKWebView에서 배경 스크롤을 막지 못함)
- `closeCrewConnex()`: 저장된 scrollY로 `window.scrollTo()` 복원
- `.modal-overlay` backdrop-filter `blur(4px) → blur(8px)`, 불투명도 `0.7 → 0.75`

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

# Pilot Logbook - Work Log

---

## 2026-06-12

### Bug Fix: CrewConnex Enter키 자동 로딩 방지
- 아이디/비밀번호 입력 후 Enter 시 자동으로 데이터 로딩되던 문제 수정
- `onkeydown` 핸들러 제거 → **"비행 데이터 가져오기" 버튼 클릭 시에만 실행**

---

### Bug Fix: iOS Safari signInWithRedirect 에러 페이지 수정
- 팝업 차단 시 redirect 폴백 제거 → 팝업 허용 안내 메시지로 대체
- `getRedirectResult` 에러 조용히 무시
- **배포 예정: 2026-06-17 이후 Netlify**

---

### Feature: 기간 비행시간 합산 (종이 로그북 사용자용)
- 로그북 탭 상단 **📊 합산** 버튼 → 날짜 범위 선택 패널 토글
- 선택 기간의 총 비행시간 / 야간 / 계기 / 편수 합산 표시

---

### Feature: 월별 비행 PDF 인쇄
- 로그북 탭 상단 **🖨 인쇄** 버튼 → 월 선택 모달
- 선택한 월의 비행 전체를 표 형태로 새 창에서 인쇄 (브라우저 인쇄 다이얼로그)
- 하단 합계(편수/총비행/야간/계기/이륙/착륙) 포함
- ESC로 인쇄 모달 닫기 추가

---

## 2026-06-07

### Bug Fix: B38M 기종 표출 오류 수정
**증상:** B38M(B737-8 MAX) 항공기가 "B737-800"으로 표출됨

**원인:**
- PDF/Epaper 파서의 `mapAcType()` 함수가 `'-8 MAX'`(불완전한 문자열)를 반환
- CrewConnex 파서의 `AC_MAP`도 동일하게 `'-8 MAX'` 반환
- `importSelectedFlights`, `importCcFlight`의 `acTypeMap`에 B38M 항목 없음 → 'B737-800' 폴백

**수정 내용:**
- `mapAcType()`: `'-8 MAX'` → `'B737-8 MAX'`, `'-800'` → `'B737-800'`
- `AC_MAP`: `'B38M': '-8 MAX'` → `'B38M': 'B737-8 MAX'`
- `acTypeMap` (2곳): B737-8 MAX, B737-8, -8 MAX 모두 `'B737-8 MAX'`로 정규화
- `editEntry()`: 기존 저장된 레거시 값(`-8 MAX`, `B737-8`) 자동 정규화 추가
- 드롭다운 옵션 value: `'B737-8'` → `'B737-8 MAX'`

---

### Bug Fix: 수동 시간 수정 시 총 비행시간 자동 재계산
**증상:** 편집 모달에서 출발/도착시간을 수정해도 총 비행시간이 자동으로 변경되지 않음

**수정 내용:**
- `autoCalcTotal()` 함수 추가: 출발/도착시간으로 총 비행시간 계산 후 `fTotal` 필드 업데이트
- `fDepTime`, `fArrTime` 입력 필드의 `onblur` 핸들러에 `autoCalcTotal()` 연결
  - `formatTimeInput(this)` → `formatTimeInput(this); autoCalcTotal()`

---

### Feature: 모달 키보드 단축키 추가
**내용:**
- 모달 입력 필드에서 **Enter** → 현재 필드 확정(blur 트리거) + 다음 필드로 포커스 이동
  - 출발/도착시간 Enter 시 `autoCalcTotal()` 자동 실행으로 총 비행시간 즉시 갱신
- **ESC** → 비행 입력 모달 및 CrewConnex 모달 닫기 (전체 페이지 적용)
- `handleModalKey()` 함수 추가, `document.addEventListener('keydown')` 글로벌 ESC 핸들러 추가

---

## 이전 작업 이력 (요약)

| 날짜 | 작업 내용 |
|------|-----------|
| ~2026-06 | Excel 업로드 기능 추가 (SheetJS, processExcel 전면 재작성) |
| ~2026-06 | Duty code 'D' → 'O'(Observer) 수정 |
| ~2026-06 | 로그북 년/월 폴더형 네비게이션 추가 |
| ~2026-06 | 월별 페이지네이션 추가 (게시판 스타일) |
| ~2026-06 | 통계 탭 연도 필터 추가 (전체/연도별) |
| ~2026-06 | KakaoTalk 인앱 브라우저 경고 UI 추가 |
| ~2026-06 | 로그인 방식 signInWithPopup 우선으로 변경 (신규 사용자 무한루프 수정) |
| ~2026-06 | GitHub 초기 등록: rufnek737/pilot-logbook (Private) |

---

## 배포 정보
- **GitHub:** https://github.com/rufnek737/pilot-logbook (Private)
- **Netlify:** https://pilot-logbook.netlify.app
- **Firebase Auth 도메인:** pilot-logbook.netlify.app (등록 완료)
- **Netlify 배포:** main 브랜치 자동 배포 (또는 수동 드래그앤드롭)

---

## 알려진 이슈 / 향후 작업
- [ ] Multi-airline 아키텍처 확장 검토 (6개월 베타 후)
- [ ] 기존에 잘못 저장된 '-8 MAX' 값 → 'B737-8 MAX'로 일괄 마이그레이션 (Firestore)

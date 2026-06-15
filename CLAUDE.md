# Pilot Logbook — Claude Code 컨텍스트

## 프로젝트 개요
- 제주항공 기장용 파일럿 로그북 PWA + Android 앱
- Single-file SPA: `www/index.html` (Android), `index.html` (Netlify 웹)
- Firebase Auth + Firestore, Capacitor v8 (Android 래퍼)

---

## ⚠️ 절대 규칙
- **Netlify 배포 금지** (크레딧 없음, June 17 이후만 가능)
- GitHub push만 가능 (사용자가 PowerShell에서 직접 실행)
- `www/index.html`은 136KB → sandbox SMB에서 직접 읽기/쓰기 불가
  → 수정 시 반드시 Windows Python 스크립트 사용

---

## 2026-06-14 작업 현황

### ✅ 완료
1. **Google 로그인 수정** — `www/index.html`에 네이티브 Capacitor 로그인 적용
   - `@codetrix-studio/capacitor-google-auth` 플러그인 사용
   - Web Client ID: `824870554939-vicqc3fpdmo2b4n14ot8hegjqn97uvb5.apps.googleusercontent.com`
2. **Cloudflare Workers 배포** — CC 동기화 서버 이전 완료
   - URL: `https://crewconnex.tae26001.workers.dev`
   - 파일: `workers/crewconnex.js` (Netlify→Cloudflare 변환 버전)
   - `www/index.html`에 URL 적용 완료
3. **DEPLOY_CHECKLIST.md 생성** — 배포 전 체크리스트

### 🔧 미완료: 아이콘/스플래시 디자인

**문제:** `generate_assets.py`의 `wings_svg()` 함수가 날개를 "두꺼운 막대기"처럼 그림

**레퍼런스 디자인:**
- 아이콘: 네이비 가죽 로그북, 금색 캡틴 날개 엠블럼, PILOT LOGBOOK 텍스트
  스냅 버튼(오른쪽), 북마크 리본(하단), 흰색 스티칭
- 스플래시: 짙은 네이비 그라데이션, 흰색 날개 로고, 금색 태그라인

**핵심 수정 포인트** (`generate_assets.py` → `wings_svg()` 함수):
```python
# 현재 문제: 날개가 너무 두꺼움
h = w * 0.38  # ← 이걸

# 목표: 납작하고 넓게
h = w * 0.20  # ← 이렇게

# 날개 경로: 팁이 위로 약간 올라가야 함 (캡틴 날개 스타일)
# lw 경로에서 cy-h*0.30 → cy-h*0.80 (팁을 더 위로)
# 날개가 로고 너비 95%까지 펼쳐지게
```

**실행 방법:**
```bash
# sandbox에서만 실행 가능 (cairosvg Windows 미지원)
python3 /sessions/hopeful-happy-newton/mnt/pilot-logbook/generate_assets.py

# 생성 후 Windows PowerShell에서:
python apply_icons.py
npx cap sync android
# → Android Studio Run ▶️
```

---

## 남은 작업 목록 (배포 전)

- [ ] 아이콘 날개 디자인 수정 (`generate_assets.py`)
- [ ] 스플래시 화면 최종 확인
- [ ] 이메일/비밀번호 로그인 추가 (`www/index.html`)
- [ ] 디버그 alert 제거 (`www/index.html`에서 `[디버그]` 검색 후 삭제)
- [ ] Release APK 빌드 (서명)
- [ ] DEPLOY_CHECKLIST.md 전체 항목 확인

---

## 파일 구조 핵심

```
pilot-logbook/
├── www/index.html          ← Android 앱 번들 (136KB, 수정 주의)
├── index.html              ← 웹(Netlify) 버전
├── assets/
│   ├── icon.png            ← 1024x1024 소스
│   └── splash.png          ← 2732x2732 소스
├── android/                ← Capacitor Android 프로젝트
├── workers/crewconnex.js   ← Cloudflare Workers (배포 완료)
├── generate_assets.py      ← sandbox에서 실행 (cairosvg)
├── apply_icons.py          ← Windows에서 실행 (Pillow만)
├── fix_login.py            ← 로그인 코드 교체 (완료, 재사용 불필요)
├── update_worker_url.py    ← Workers URL 교체 (완료)
└── DEPLOY_CHECKLIST.md     ← 배포 전 필수 확인
```

---

## 기술 스택

| 항목 | 값 |
|------|-----|
| Firebase Project | pilot-logbook-22bb8 |
| Android Package | com.rufnek.pilotlogbook |
| Capacitor | v8 |
| Google Auth Plugin | @codetrix-studio/capacitor-google-auth@3.4.0-rc.4 |
| SHA-1 (debug) | 5E:24:89:C7:DF:B2:50:B5:73:2B:7E:12:E2:E4:38:D4:E0:75:B0:E9 |
| Netlify URL | https://pilot-logbook.netlify.app |
| Workers URL | https://crewconnex.tae26001.workers.dev |
| GitHub | https://github.com/rufnek737/pilot-logbook (Private) |

---

## www/index.html 수정 방법 (SMB 제한 우회)

파일이 136KB라 sandbox에서 직접 못 읽음. Windows Python 사용:

```python
# 읽기
result = subprocess.run(['git','show','HEAD:www/index.html'], capture_output=True)
content = result.stdout.decode('utf-8')

# 쓰기
with open(r'www\index.html', 'wb') as f:
    f.write(content.encode('utf-8'))

# 또는 Python 스크립트 파일 생성 후 사용자가 PowerShell에서 실행
```

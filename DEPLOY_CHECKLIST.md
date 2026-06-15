# 앱스토어 배포 전 필수 체크리스트

⚠️ 이 파일을 확인하지 않고 배포하면 사용자들이 CC 동기화를 사용할 수 없습니다!

---

## ✅ STEP 1: Cloudflare Workers 배포 (CC 동기화 서버)

Netlify 크레딧이 소진되면 모든 사용자의 CC 동기화가 중단됩니다.
Cloudflare Workers로 이전하면 무료로 하루 100,000 요청 처리 가능.

### 1-1. Cloudflare 계정 만들기
- https://dash.cloudflare.com 가입 (무료)

### 1-2. Wrangler CLI 설치 및 로그인
```powershell
npm install -g wrangler
wrangler login
```

### 1-3. Workers 배포
```powershell
cd C:\Users\PC\Desktop\projects\pilot-logbook\workers
npx wrangler deploy
```

### 1-4. 배포 후 URL 확인
배포 완료 시 터미널에 URL이 출력됩니다:
예: `https://crewconnex.YOUR-ID.workers.dev`

### 1-5. www/index.html URL 업데이트
아래 Python 스크립트를 실행해서 URL 교체:

```powershell
cd C:\Users\PC\Desktop\projects\pilot-logbook
python update_worker_url.py https://crewconnex.YOUR-ID.workers.dev
```

---

## ✅ STEP 2: 디버그 alert 제거 확인
www/index.html에서 아래 코드가 없는지 확인:
- `alert('[디버그]`
- `alert('[오류]`

---

## ✅ STEP 3: 아이콘/스플래시 적용 확인
```powershell
cd C:\Users\PC\Desktop\projects\pilot-logbook
npx @capacitor/assets generate --android
npx cap sync android
```

---

## ✅ STEP 4: Release APK 빌드 (서명된 APK)
Android Studio → Build → Generate Signed Bundle/APK

---

## ✅ STEP 5: 최종 테스트
- [ ] 구글 로그인
- [ ] CC 동기화 (Workers URL로 연결되는지)
- [ ] 비행기록 입력/조회
- [ ] 아이콘/스플래시 정상 표시

---

현재 CC 함수 위치:
- Netlify (현재): `netlify/functions/crewconnex.js`
- Cloudflare Workers (이전 예정): `workers/crewconnex.js`

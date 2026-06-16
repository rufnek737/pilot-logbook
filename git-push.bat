@echo off
cd /d "C:\Users\PC\Desktop\app 개발\pilot-logbook"

git config user.email "tae26001@gmail.com"
git config user.name "Kyungtae Kang"

git add index.html WORKLOG.md

git commit -m "Fix B38M mapping, auto total calc, Enter/ESC keyboard support

- B38M/7M8 -> B737-8 MAX in all parsers (mapAcType, AC_MAP, acTypeMap)
- Legacy stored values (-8 MAX, B737-8) normalized on modal open
- autoCalcTotal(): recalculates total flight time on dep/arr time blur
- handleModalKey(): Enter moves to next field, ESC closes modal
- Global ESC listener for both flight modal and CrewConnex modal
- Updated WORKLOG.md"

git push origin main

echo.
echo ===================================
echo   GitHub 푸시 완료!
echo   Netlify 자동 배포가 시작됩니다.
echo   약 1분 후 pilot-logbook.netlify.app 에서 확인하세요.
echo ===================================
pause

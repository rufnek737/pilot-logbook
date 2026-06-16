#!/usr/bin/env python3
"""
Cloudflare Workers URL을 www/index.html에 적용
사용법: python update_worker_url.py https://crewconnex.YOUR-ID.workers.dev
"""
import sys
import os

if len(sys.argv) < 2:
    print("사용법: python update_worker_url.py https://crewconnex.YOUR-ID.workers.dev")
    sys.exit(1)

new_url = sys.argv[1].rstrip('/')
target = os.path.join(os.path.dirname(__file__), 'www', 'index.html')

with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

# 기존 Netlify URL 패턴
OLD_PATTERNS = [
    "https://pilot-logbook.netlify.app/.netlify/functions/crewconnex",
    "/.netlify/functions/crewconnex",
]

replaced = False
for old in OLD_PATTERNS:
    if old in content:
        content = content.replace(old, new_url)
        print(f"✅ 교체: {old} → {new_url}")
        replaced = True

if not replaced:
    print("⚠️ Netlify URL을 찾지 못했습니다. 현재 fetch URL 확인:")
    for line in content.split('\n'):
        if 'crewconnex' in line.lower() or 'netlify' in line.lower() or 'workers.dev' in line.lower():
            print(f"   {line.strip()}")
    sys.exit(1)

with open(target, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"✅ www/index.html 저장 완료")
print(f"\n다음 단계:")
print(f"  npx cap sync android")
print(f"  → Android Studio에서 Run")

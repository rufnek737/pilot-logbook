#!/usr/bin/env python3
"""
pilot_logbook_app_icon.svg / pilot_logbook_splash_screen_portrait.svg
안의 base64 PNG를 그대로 추출해서 assets/icon.png, assets/splash.png 로 저장.
SVG를 재현하지 않고 원본 PNG를 그대로 사용 (사용자가 준 레퍼런스와 100% 동일).
"""
import base64
import re
import os

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, 'assets')
os.makedirs(ASSETS, exist_ok=True)

def extract_png(svg_path, out_path):
    with open(svg_path, encoding='utf-8') as f:
        content = f.read()
    m = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', content)
    if not m:
        print(f'❌ {svg_path}: base64 PNG를 찾지 못함')
        return False
    data = base64.b64decode(m.group(1))
    with open(out_path, 'wb') as f:
        f.write(data)
    print(f'✅ {os.path.basename(out_path)} 추출 완료 ({len(data)} bytes)')
    return True

extract_png(os.path.join(BASE, 'pilot_logbook_app_icon.svg'), os.path.join(ASSETS, 'icon.png'))
extract_png(os.path.join(BASE, 'pilot_logbook_splash_screen_portrait.svg'), os.path.join(ASSETS, 'splash.png'))

print('\n다음: python apply_icons.py')

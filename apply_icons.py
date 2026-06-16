#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
assets/icon.png + assets/splash.png → Android 모든 사이즈 자동 배치
Pillow만 필요 (pip install Pillow)
"""
from PIL import Image
import os

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, 'assets')
ANDROID_RES = os.path.join(BASE, 'android', 'app', 'src', 'main', 'res')

# ── 아이콘 사이즈 정의 ────────────────────────────────────────────────────────
ICON_SIZES = {
    'mipmap-mdpi':    48,
    'mipmap-hdpi':    72,
    'mipmap-xhdpi':   96,
    'mipmap-xxhdpi':  144,
    'mipmap-xxxhdpi': 192,
}

# ── 스플래쉬 사이즈 정의 ──────────────────────────────────────────────────────
SPLASH_SIZES = {
    'drawable':        (480,  800),
    'drawable-land':   (800,  480),
    'drawable-port':   (480,  800),
    'drawable-mdpi':   (480,  800),
    'drawable-hdpi':   (480,  800),
    'drawable-xhdpi':  (720, 1280),
    'drawable-xxhdpi': (960, 1600),
    'drawable-xxxhdpi':(1280,1920),
    'drawable-land-mdpi':   (800, 480),
    'drawable-land-hdpi':   (800, 480),
    'drawable-land-xhdpi':  (1280, 720),
    'drawable-land-xxhdpi': (1600, 960),
    'drawable-land-xxxhdpi': (1920, 1280),
    'drawable-land-ldpi':    (320, 240),
    'drawable-port-ldpi':    (240, 320),
    'drawable-port-xhdpi':   (720, 1280),
    'drawable-port-xxhdpi':  (960, 1600),
    'drawable-port-xxxhdpi': (1280, 1920),
    'drawable-night':            (320, 240),
    'drawable-land-night-hdpi':  (800, 480),
    'drawable-land-night-ldpi':  (320, 240),
    'drawable-land-night-mdpi':  (480, 320),
    'drawable-land-night-xhdpi': (1280, 720),
    'drawable-land-night-xxhdpi':(1600, 960),
    'drawable-land-night-xxxhdpi':(1920, 1280),
    'drawable-port-night-hdpi':  (480, 800),
    'drawable-port-night-ldpi':  (240, 320),
    'drawable-port-night-mdpi':  (320, 480),
    'drawable-port-night-xhdpi': (720, 1280),
    'drawable-port-night-xxhdpi':(960, 1600),
    'drawable-port-night-xxxhdpi':(1280, 1920),
}

def resize_contain(img, size):
    """비율 유지하면서 중앙 배치 (배경: 네이비 #0D1B3E)"""
    bg = Image.new('RGB', size, (13, 27, 62))
    img_copy = img.copy()
    img_copy.thumbnail(size, Image.LANCZOS)
    x = (size[0] - img_copy.width)  // 2
    y = (size[1] - img_copy.height) // 2
    if img_copy.mode == 'RGBA':
        bg.paste(img_copy, (x, y), img_copy)
    else:
        bg.paste(img_copy, (x, y))
    return bg

# ── 1. 아이콘 적용 ────────────────────────────────────────────────────────────
icon_src = os.path.join(ASSETS, 'icon.png')
if not os.path.exists(icon_src):
    print(f'❌ {icon_src} 없음! generate_assets.py 먼저 실행하세요.')
    exit(1)

icon = Image.open(icon_src).convert('RGBA')
print(f'📂 아이콘 소스: {icon.size}')

for folder, size in ICON_SIZES.items():
    out_dir = os.path.join(ANDROID_RES, folder)
    os.makedirs(out_dir, exist_ok=True)

    # ic_launcher.png
    ic = icon.resize((size, size), Image.LANCZOS)
    bg = Image.new('RGB', (size, size), (13, 27, 62))
    bg.paste(ic, (0, 0), ic)
    bg.save(os.path.join(out_dir, 'ic_launcher.png'))

    # ic_launcher_round.png (동일)
    bg.save(os.path.join(out_dir, 'ic_launcher_round.png'))

    # ic_launcher_foreground.png (어댑티브 아이콘용 - 108dp 기준)
    fg_size = int(size * 1.5)
    fg = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
    ic_fg = icon.resize((size, size), Image.LANCZOS)
    x = (fg_size - size) // 2
    fg.paste(ic_fg, (x, x), ic_fg)
    fg_rgb = Image.new('RGB', (fg_size, fg_size), (13, 27, 62))
    fg_rgb.paste(fg, (0, 0), fg)
    fg_rgb.save(os.path.join(out_dir, 'ic_launcher_foreground.png'))

    print(f'  ✅ {folder}: {size}x{size}')

# ── 2. 스플래쉬 적용 ──────────────────────────────────────────────────────────
splash_src = os.path.join(ASSETS, 'splash.png')
if not os.path.exists(splash_src):
    print(f'❌ {splash_src} 없음!')
    exit(1)

splash = Image.open(splash_src).convert('RGB')
print(f'\n📂 스플래쉬 소스: {splash.size}')

for folder, size in SPLASH_SIZES.items():
    out_dir = os.path.join(ANDROID_RES, folder)
    os.makedirs(out_dir, exist_ok=True)
    sp = resize_contain(splash, size)
    sp.save(os.path.join(out_dir, 'splash.png'))
    print(f'  ✅ {folder}: {size[0]}x{size[1]}')

# ── 3. 검증 ──────────────────────────────────────────────────────────────────
print('\n🎉 완료! 배치된 파일:')
for folder in list(ICON_SIZES.keys()) + list(SPLASH_SIZES.keys()):
    d = os.path.join(ANDROID_RES, folder)
    files = os.listdir(d) if os.path.exists(d) else []
    print(f'  {folder}: {len(files)}개 파일')

print('\n다음 단계: npx cap sync android → Android Studio Run ▶️')

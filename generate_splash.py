#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
splash.png 생성 — Pillow만 사용 (pip install Pillow)
pilot_logbook_splash_vector_simple.svg 디자인 재현
"""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE, 'assets')
os.makedirs(ASSETS_DIR, exist_ok=True)

W, H = 2732, 2732
img = Image.new('RGB', (W, H))
draw = ImageDraw.Draw(img)

# ── 배경 그라데이션 (세로: 짙은 네이비 → 약간 밝은 네이비) ──────────
for y in range(H):
    t = y / H
    r = int(6  + t * (9  - 6))
    g = int(26 + t * (40 - 26))
    b = int(53 + t * (71 - 53))
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# ── PILOT 텍스트 ─────────────────────────────────────────────────────
cx = W // 2

try:
    font_big  = ImageFont.truetype("arial.ttf", 220)
    font_med  = ImageFont.truetype("arial.ttf", 130)
    font_tag  = ImageFont.truetype("arial.ttf",  72)
    font_sub  = ImageFont.truetype("arial.ttf",  62)
except:
    font_big = font_med = font_tag = font_sub = ImageFont.load_default()

def draw_text_centered(text, y, font, color):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, y), text, font=font, fill=color)

WHITE  = (255, 255, 255)
GOLD   = (215, 166, 70)

# 날개 로고 자리 (간략한 선으로 표현)
wing_y = H // 2 - 420
draw.line([(cx - 340, wing_y), (cx + 340, wing_y)], fill=WHITE, width=6)
draw.line([(cx - 340, wing_y), (cx - 500, wing_y - 120)], fill=WHITE, width=6)
draw.line([(cx + 340, wing_y), (cx + 500, wing_y - 120)], fill=WHITE, width=6)

# PILOT
draw_text_centered("PILOT",   H // 2 - 200, font_big, WHITE)
# LOGBOOK
draw_text_centered("LOGBOOK", H // 2 - 20,  font_med, WHITE)

# 골드 구분선
lx1, lx2 = cx - 400, cx + 400
draw.line([(lx1, H // 2 + 100), (lx2, H // 2 + 100)], fill=GOLD, width=7)

# 태그라인
draw_text_centered("LOG IT. REVIEW IT. FLY BETTER.", H // 2 + 160, font_tag, GOLD)

# 하단 서브텍스트
draw_text_centered("YOUR FLIGHTS. YOUR STORY.", H - 460, font_sub, (255, 255, 255))

out = os.path.join(ASSETS_DIR, 'splash.png')
img.save(out)
print(f'✅ splash.png 생성 완료 ({W}x{H})')
print('다음: python apply_icons.py')

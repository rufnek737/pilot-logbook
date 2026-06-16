#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SVG → PNG 변환 (Windows 호환: svglib + reportlab)
pip install svglib reportlab
"""
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
import os

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE, 'assets')
os.makedirs(ASSETS_DIR, exist_ok=True)

ICON_SVG   = os.path.join(BASE, 'pilot_logbook_app_icon.svg')
SPLASH_SVG = os.path.join(BASE, 'pilot_logbook_splash_vector_simple.svg')

def svg_to_png(svg_path, out_path, width, height):
    drawing = svg2rlg(svg_path)
    sx = width  / drawing.width
    sy = height / drawing.height
    drawing.width  = width
    drawing.height = height
    drawing.transform = (sx, 0, 0, sy, 0, 0)
    renderPM.drawToFile(drawing, out_path, fmt='PNG')
    print(f'✅ {os.path.basename(out_path)} ({width}x{height})')

print('아이콘 렌더링...')
svg_to_png(ICON_SVG, os.path.join(ASSETS_DIR, 'icon.png'), 1024, 1024)

print('스플래시 렌더링...')
svg_to_png(SPLASH_SVG, os.path.join(ASSETS_DIR, 'splash.png'), 2732, 2732)

print('\n완료! 이제: python apply_icons.py')

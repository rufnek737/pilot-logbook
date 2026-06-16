#!/usr/bin/env python3
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
c = open(r'www\index.html', encoding='utf-8').read()

checks = [
    ('Fix1A body light', 'color-scheme: light'),
    ('Fix1B td color#111', 'color: #111; background: #fff;'),
    ('Fix2 userInitial', 'userInitial'),
    ('Fix3 nowrap', 'white-space: nowrap;'),
    ('Fix4a card 1/0', "f.toPf==='PF'?1:0"),
    ('Fix4b print 1/0', "f.toPf !== undefined ? (f.toPf==='PF'"),
]
for name, kw in checks:
    print(f"{name}: {'YES' if kw in c else 'NO'}")

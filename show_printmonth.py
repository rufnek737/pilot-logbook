#!/usr/bin/env python3
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
c = open(r'www\index.html', encoding='utf-8').read()
idx = c.find('function printMonth(ym)')
print(c[idx:idx+4500])

#!/usr/bin/env python3
c = open(r'www\index.html', encoding='utf-8').read()
idx = c.find('function printMonth(ym)')
chunk = c[idx:idx+4500]
with open('printmonth_dump.txt', 'w', encoding='utf-8') as f:
    f.write(chunk)
print("written")

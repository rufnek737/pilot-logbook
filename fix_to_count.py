#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

# Fix print rows: ||0 → ||1 to match card behavior
OLD = "      <td>${f.toPf !== undefined ? (f.toPf==='PF'?1:0) : (parseInt(f.takeoffs||f.toCnt||0)>0?1:0)}</td>\n      <td>${f.ldgPf !== undefined ? (f.ldgPf==='PF'?1:0) : (parseInt(f.landings||f.ldCnt||0)>0?1:0)}</td>"
NEW = "      <td>${f.toPf !== undefined ? (f.toPf==='PF'?1:0) : (parseInt(f.takeoffs||f.toCnt||1)>0?1:0)}</td>\n      <td>${f.ldgPf !== undefined ? (f.ldgPf==='PF'?1:0) : (parseInt(f.landings||f.ldCnt||1)>0?1:0)}</td>"

assert OLD in c, "not found"
c = c.replace(OLD, NEW, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("done")

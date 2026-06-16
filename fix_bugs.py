#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bug fixes:
1. Print odd rows invisible (dark mode WebView)
2. Profile icon broken img when no photoURL
3. Flight card section title wrapping
4. T/O/LDG PF=1, PM=0 (card + print)
"""
import re

with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

original = c

# ──────────────────────────────────────────────────────────────────────
# Fix 1: Print view — force light mode, add explicit odd-row background
# ──────────────────────────────────────────────────────────────────────
OLD_PRINT_CSS = """    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; }"""
NEW_PRINT_CSS = """    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; background: #fff; color-scheme: light; }"""
assert OLD_PRINT_CSS in c, "Fix1 A not found"
c = c.replace(OLD_PRINT_CSS, NEW_PRINT_CSS, 1)

OLD_PRINT_TD = """    td { padding: 5px 4px; border-bottom: 1px solid #ddd; text-align: center; }
    tr:nth-child(even) td { background: #f5f8ff; }"""
NEW_PRINT_TD = """    td { padding: 5px 4px; border-bottom: 1px solid #ddd; text-align: center; color: #111; background: #fff; }
    tr:nth-child(even) td { background: #f5f8ff; }"""
assert OLD_PRINT_TD in c, "Fix1 B not found"
c = c.replace(OLD_PRINT_TD, NEW_PRINT_TD, 1)

# ──────────────────────────────────────────────────────────────────────
# Fix 2: Profile icon — hide img if no photoURL, show initials instead
# ──────────────────────────────────────────────────────────────────────
OLD_CHIP_HTML = """      <div class="user-chip" id="userChip" style="display:none" onclick="signOutUser()">
        <img id="userPhoto" src="" alt="" />
        <span id="userName"></span>
      </div>"""
NEW_CHIP_HTML = """      <div class="user-chip" id="userChip" style="display:none" onclick="signOutUser()">
        <img id="userPhoto" src="" alt="" style="display:none" />
        <span id="userInitial" style="width:24px;height:24px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0"></span>
        <span id="userName"></span>
      </div>"""
assert OLD_CHIP_HTML in c, "Fix2 HTML not found"
c = c.replace(OLD_CHIP_HTML, NEW_CHIP_HTML, 1)

OLD_PHOTO_JS = """document.getElementById('userPhoto').src  = user.photoURL || '';
    document.getElementById('userName').textContent = user.displayName?.split(' ')[0] || '';"""
NEW_PHOTO_JS = """const photoEl = document.getElementById('userPhoto');
    const initEl = document.getElementById('userInitial');
    const name = user.displayName || '';
    if (user.photoURL) {
      photoEl.src = user.photoURL;
      photoEl.style.display = '';
      initEl.style.display = 'none';
    } else {
      photoEl.style.display = 'none';
      initEl.style.display = 'flex';
      initEl.textContent = name.charAt(0).toUpperCase() || '?';
    }
    document.getElementById('userName').textContent = name.split(' ')[0] || '';"""
assert OLD_PHOTO_JS in c, "Fix2 JS not found"
c = c.replace(OLD_PHOTO_JS, NEW_PHOTO_JS, 1)

# ──────────────────────────────────────────────────────────────────────
# Fix 3: Section title no-wrap
# ──────────────────────────────────────────────────────────────────────
OLD_TITLE_CSS = """      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .add-btn {"""
NEW_TITLE_CSS = """      text-transform: uppercase;
      letter-spacing: 0.8px;
      white-space: nowrap;
    }
    .add-btn {"""
assert OLD_TITLE_CSS in c, "Fix3 not found"
c = c.replace(OLD_TITLE_CSS, NEW_TITLE_CSS, 1)

# ──────────────────────────────────────────────────────────────────────
# Fix 4a: flightCard T/O LDG → 1/0
# ──────────────────────────────────────────────────────────────────────
OLD_CARD_TO = """        <div class="card-stat-val" style="font-size:11px">${f.toPf !== undefined ? f.toPf : (parseInt(f.takeoffs||f.toCnt||1)>0?'PF':'PM')}</div>
        <div class="card-stat-lbl">T/O</div>
      </div>
      <div class="card-stat">
        <div class="card-stat-val" style="font-size:11px">${f.ldgPf !== undefined ? f.ldgPf : (parseInt(f.landings||f.ldCnt||1)>0?'PF':'PM')}</div>
        <div class="card-stat-lbl">LDG</div>"""
NEW_CARD_TO = """        <div class="card-stat-val" style="font-size:11px">${f.toPf !== undefined ? (f.toPf==='PF'?1:0) : (parseInt(f.takeoffs||f.toCnt||1)>0?1:0)}</div>
        <div class="card-stat-lbl">T/O</div>
      </div>
      <div class="card-stat">
        <div class="card-stat-val" style="font-size:11px">${f.ldgPf !== undefined ? (f.ldgPf==='PF'?1:0) : (parseInt(f.landings||f.ldCnt||1)>0?1:0)}</div>
        <div class="card-stat-lbl">LDG</div>"""
assert OLD_CARD_TO in c, "Fix4a not found"
c = c.replace(OLD_CARD_TO, NEW_CARD_TO, 1)

# ──────────────────────────────────────────────────────────────────────
# Fix 4b: printMonth T/O LDG cells → 1/0
# ──────────────────────────────────────────────────────────────────────
OLD_PRINT_TO = """      <td>${f.toPf !== undefined ? f.toPf : (parseInt(f.takeoffs||f.toCnt||0)>0?'PF':'PM')}</td>
      <td>${f.ldgPf !== undefined ? f.ldgPf : (parseInt(f.landings||f.ldCnt||0)>0?'PF':'PM')}</td>"""
NEW_PRINT_TO = """      <td>${f.toPf !== undefined ? (f.toPf==='PF'?1:0) : (parseInt(f.takeoffs||f.toCnt||0)>0?1:0)}</td>
      <td>${f.ldgPf !== undefined ? (f.ldgPf==='PF'?1:0) : (parseInt(f.landings||f.ldCnt||0)>0?1:0)}</td>"""
assert OLD_PRINT_TO in c, "Fix4b not found"
c = c.replace(OLD_PRINT_TO, NEW_PRINT_TO, 1)

# ──────────────────────────────────────────────────────────────────────
# Fix 4c: printMonth summary counters (already correct — they count PF flights)
# Just verify T/O LDG tally logic uses PF check correctly (already does)
# ──────────────────────────────────────────────────────────────────────

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("✅ 모든 수정 완료")
print(f"   변경: {sum(1 for a,b in zip(original,c) if a!=b)} chars")

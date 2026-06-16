#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

OLD = """  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <title>Pilot Logbook - ${label}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; background: #fff; color-scheme: light; }
    h2 { font-size: 16px; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #555; margin-bottom: 16px; }"""

NEW = """  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <title>Pilot Logbook - ${label}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; background: #fff; color-scheme: light; }
    .toolbar { display:flex; gap:10px; margin-bottom:16px; }
    .toolbar button { padding:8px 18px; border:none; border-radius:6px; font-size:13px; cursor:pointer; font-weight:600; }
    .btn-back  { background:#e5e7eb; color:#111; }
    .btn-print { background:#1e3a5f; color:#fff; }
    @media print { .toolbar { display:none; } }
    h2 { font-size: 16px; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #555; margin-bottom: 16px; }"""

assert OLD in c, "OLD not found"
c = c.replace(OLD, NEW, 1)

# Add toolbar buttons right after <body>
OLD_BODY = """  <h2>Pilot Logbook — ${label}</h2>"""
NEW_BODY = """  <div class="toolbar">
    <button class="btn-back"  onclick="window.close()">← 뒤로</button>
    <button class="btn-print" onclick="window.print()">🖨 인쇄</button>
  </div>
  <h2>Pilot Logbook — ${label}</h2>"""

assert OLD_BODY in c, "OLD_BODY not found"
c = c.replace(OLD_BODY, NEW_BODY, 1)

# Remove auto-print on open
OLD_AUTO = """  setTimeout(() => { try { w.print(); } catch(e) {} }, 400);"""
NEW_AUTO = """  // print triggered manually via toolbar button"""

assert OLD_AUTO in c, "OLD_AUTO not found"
c = c.replace(OLD_AUTO, NEW_AUTO, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("done")

#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

# ── 1. Add print overlay div after syncStatus ──────────────────────
OLD_SYNC = '<div id="syncStatus"></div>'
NEW_SYNC = '''<div id="syncStatus"></div>

<!-- Print Overlay -->
<div id="printView" style="display:none;position:fixed;inset:0;background:#fff;z-index:9999;overflow-y:auto;padding:16px;box-sizing:border-box;color:#111;font-family:Arial,sans-serif;font-size:11px">
  <div id="printViewContent"></div>
</div>'''
assert OLD_SYNC in c, "syncStatus not found"
c = c.replace(OLD_SYNC, NEW_SYNC, 1)

# ── 2. Add print overlay CSS ───────────────────────────────────────
# Add before closing </style> of the main stylesheet (find a unique marker)
OLD_STYLE_END = '    @keyframes ptr-spin { to { transform: rotate(360deg); } }\n  </style>'
NEW_STYLE_END = '''    @keyframes ptr-spin { to { transform: rotate(360deg); } }
    @media print {
      body > *:not(#printView) { display: none !important; }
      #printView { position: static !important; padding: 0 !important; }
      #printToolbar { display: none !important; }
    }
  </style>'''
assert OLD_STYLE_END in c, "style end marker not found"
c = c.replace(OLD_STYLE_END, NEW_STYLE_END, 1)

# ── 3. Replace printMonth function body ────────────────────────────
# Find the window.open block and replace with overlay logic
OLD_OPEN = """  const w = window.open('', '_blank');
  if (!w) { alert('팝업이 차단되었습니다. 팝업을 허용해주세요.'); return; }
  w.document.write(html);
  w.document.close();
  // print triggered manually via toolbar button
  closePrintModal();
}"""

NEW_OPEN = """  // Show in-page overlay (works in Android WebView)
  const pv = document.getElementById('printView');
  const pc = document.getElementById('printViewContent');
  pc.innerHTML = html;
  pv.style.display = 'block';
  document.body.style.overflow = 'hidden';
  closePrintModal();
}

function closePrintView() {
  document.getElementById('printView').style.display = 'none';
  document.body.style.overflow = '';
}"""

assert OLD_OPEN in c, "OLD_OPEN not found"
c = c.replace(OLD_OPEN, NEW_OPEN, 1)

# ── 4. Update the HTML template inside printMonth ──────────────────
# Replace the toolbar inside the generated html template
OLD_TOOLBAR_HTML = """  <div class="toolbar">
    <button class="btn-back"  onclick="window.close()">← 뒤로</button>
    <button class="btn-print" onclick="window.print()">🖨 인쇄</button>
  </div>
  <h2>Pilot Logbook — ${label}</h2>"""

NEW_TOOLBAR_HTML = """  <div id="printToolbar" style="display:flex;gap:10px;margin-bottom:16px">
    <button onclick="closePrintView()" style="padding:8px 18px;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;background:#e5e7eb;color:#111">← 뒤로</button>
    <button onclick="window.print()" style="padding:8px 18px;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;background:#1e3a5f;color:#fff">🖨 인쇄</button>
  </div>
  <h2>Pilot Logbook — ${label}</h2>"""

assert OLD_TOOLBAR_HTML in c, "OLD_TOOLBAR_HTML not found"
c = c.replace(OLD_TOOLBAR_HTML, NEW_TOOLBAR_HTML, 1)

# ── 5. Remove old toolbar CSS and @media print from generated html ─
OLD_PRINT_CSS_IN_TEMPLATE = """    .toolbar { display:flex; gap:10px; margin-bottom:16px; }
    .toolbar button { padding:8px 18px; border:none; border-radius:6px; font-size:13px; cursor:pointer; font-weight:600; }
    .btn-back  { background:#e5e7eb; color:#111; }
    .btn-print { background:#1e3a5f; color:#fff; }
    @media print { .toolbar { display:none; } }"""
NEW_PRINT_CSS_IN_TEMPLATE = ""  # removed — toolbar is inline styled now

assert OLD_PRINT_CSS_IN_TEMPLATE in c, "OLD_PRINT_CSS_IN_TEMPLATE not found"
c = c.replace(OLD_PRINT_CSS_IN_TEMPLATE, NEW_PRINT_CSS_IN_TEMPLATE, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("done")

#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

# Find the broken innerHTML block and replace \${...} with ${...}
OLD = r"""  pc.innerHTML = `
    <style>
      #pv-table { width:100%; border-collapse:collapse; font-size:11px; }
      #pv-table th { background:#1e3a5f; color:#fff; padding:6px 4px; text-align:center; font-size:10px; }
      #pv-table td { padding:5px 4px; border-bottom:1px solid #ddd; text-align:center; color:#111; background:#fff; }
      #pv-table tr:nth-child(even) td { background:#f5f8ff; }
      #pv-summary { margin-top:14px; display:flex; gap:20px; font-size:12px; flex-wrap:wrap; }
      #pv-summary b { font-size:14px; color:#1e3a5f; }
    </style>
    <div id="pv-toolbar" style="display:flex;gap:10px;margin-bottom:16px">
      <button id="pv-back"  style="padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:700;background:#e5e7eb;color:#111;cursor:pointer">← 뒤로</button>
      <button id="pv-print" style="padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:700;background:#1e3a5f;color:#fff;cursor:pointer">인쇄</button>
    </div>
    <h2 style="font-size:16px;margin:0 0 4px">\${label}</h2>
    <div style="font-size:12px;color:#555;margin-bottom:14px">Kyungtae Kang · \${printDate}</div>
    <table id="pv-table">
      <thead><tr>
        <th>#</th><th>Date</th><th>Flight</th><th>From</th><th>To</th>
        <th>STD</th><th>STA</th><th>A/C</th><th>Reg</th><th>Duty</th>
        <th>Block</th><th>Night</th><th>IFR</th><th>T/O</th><th>LDG</th>
      </tr></thead>
      <tbody>\${rows}</tbody>
    </table>
    <div id="pv-summary">
      <div>Sectors: <b>\${sel.length}</b></div>
      <div>Total: <b>\${toHHMM(total)}</b></div>
      <div>Night: <b>\${toHHMM(night)}</b></div>
      <div>IFR: <b>\${toHHMM(ifr)}</b></div>
      <div>T/O: <b>\${to}</b></div>
      <div>LDG: <b>\${ldg}</b></div>
    </div>`;"""

NEW = """  pc.innerHTML = `
    <style>
      #pv-table { width:100%; border-collapse:collapse; font-size:11px; }
      #pv-table th { background:#1e3a5f; color:#fff; padding:6px 4px; text-align:center; font-size:10px; }
      #pv-table td { padding:5px 4px; border-bottom:1px solid #ddd; text-align:center; color:#111; background:#fff; }
      #pv-table tr:nth-child(even) td { background:#f5f8ff; }
      #pv-summary { margin-top:14px; display:flex; gap:20px; font-size:12px; flex-wrap:wrap; }
      #pv-summary b { font-size:14px; color:#1e3a5f; }
    </style>
    <div id="pv-toolbar" style="display:flex;gap:10px;margin-bottom:16px">
      <button id="pv-back"  style="padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:700;background:#e5e7eb;color:#111;cursor:pointer">← 뒤로</button>
      <button id="pv-print" style="padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:700;background:#1e3a5f;color:#fff;cursor:pointer">인쇄</button>
    </div>
    <h2 style="font-size:16px;margin:0 0 4px">${label}</h2>
    <div style="font-size:12px;color:#555;margin-bottom:14px">Kyungtae Kang · ${printDate}</div>
    <table id="pv-table">
      <thead><tr>
        <th>#</th><th>Date</th><th>Flight</th><th>From</th><th>To</th>
        <th>STD</th><th>STA</th><th>A/C</th><th>Reg</th><th>Duty</th>
        <th>Block</th><th>Night</th><th>IFR</th><th>T/O</th><th>LDG</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div id="pv-summary">
      <div>Sectors: <b>${sel.length}</b></div>
      <div>Total: <b>${toHHMM(total)}</b></div>
      <div>Night: <b>${toHHMM(night)}</b></div>
      <div>IFR: <b>${toHHMM(ifr)}</b></div>
      <div>T/O: <b>${to}</b></div>
      <div>LDG: <b>${ldg}</b></div>
    </div>`;"""

assert OLD in c, "block not found"
c = c.replace(OLD, NEW, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("done")

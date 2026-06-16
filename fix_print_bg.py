#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

OLD = """    @media print {
      body > *:not(#printView) { display: none !important; }
      #printView { position: static !important; padding: 0 !important; }
      #printToolbar { display: none !important; }
    }"""

NEW = """    @media print {
      body { background: #fff !important; color: #111 !important; }
      body > *:not(#printView) { display: none !important; }
      #printView { position: static !important; padding: 0 !important; background: #fff !important; }
      #pv-toolbar { display: none !important; }
    }"""

assert OLD in c, "not found"
c = c.replace(OLD, NEW, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("done")

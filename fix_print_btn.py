#!/usr/bin/env python3
with open(r'www\index.html', encoding='utf-8') as f:
    c = f.read()

OLD = "  document.getElementById('pv-print').addEventListener('click', function() { window.print(); });"
NEW = """  document.getElementById('pv-print').addEventListener('click', function() {
    if (window.AndroidPrint) {
      window.AndroidPrint.print();
    } else {
      window.print();
    }
  });"""

assert OLD in c, "not found"
c = c.replace(OLD, NEW, 1)

with open(r'www\index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("done")

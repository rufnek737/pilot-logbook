const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../www/index.html'), 'utf8');

test('iOS modal scroll lock fixes the body and restores the saved page position', () => {
  assert.match(html, /body\.modal-scroll-locked\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(html, /let _lockedBodyScrollY = 0/);
  assert.match(html, /_lockedBodyScrollY = window\.scrollY \|\| window\.pageYOffset \|\| 0/);
  assert.match(html, /document\.body\.style\.top = `-\$\{_lockedBodyScrollY\}px`/);
  assert.match(html, /requestAnimationFrame\(\(\) => window\.scrollTo\(0, restoreY\)\)/);
});

test('modal content keeps its own momentum scroll without propagating to the background', () => {
  assert.match(html, /\.modal-overlay\s*\{[\s\S]*?overscroll-behavior:\s*none/);
  assert.match(html, /\.modal\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
});

test('all modal families use the shared lock instead of direct overflow mutations', () => {
  assert.doesNotMatch(html, /document\.body\.style\.overflow/);
  assert.doesNotMatch(html, /document\.body\.dataset\.scrollY/);
  for (const functionName of [
    'openAccountMenu', 'closeAccountMenu', 'openInfoPage', 'closeInfoPage',
    'openCareerModal', 'closeCareerModal', 'openPrintModal', 'closePrintModal',
    'openModal', 'editEntry', 'closeModal', 'openCrewConnex', 'closeCrewConnex',
  ]) {
    const block = html.match(new RegExp(`function ${functionName}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(block, `${functionName} should exist`);
    assert.match(block[0], /syncBodyScrollLock\(\)/, `${functionName} should sync the body scroll lock`);
  }
});

test('print preview transitions keep one continuous scroll lock', () => {
  assert.match(html, /pv\.style\.display = 'block';\s*closePrintModal\(\)/);
  assert.match(html, /function closePrintView\(\) \{\s*document\.getElementById\('printView'\)\.style\.display = 'none';\s*openPrintModal\(\)/);
  assert.match(html, /function hasOpenScrollLockSurface\(\)[\s\S]*?printView\.style\.display !== 'none'/);
});

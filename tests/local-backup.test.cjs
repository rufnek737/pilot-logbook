const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const backup = require('../www/pilot-backup.js');
const localFiles = require('../www/local-files.js');

const root = path.resolve(__dirname, '..');

test('full backup payload round-trips flights, careers, and local attachments', () => {
  const payload = backup.buildPayload({
    flights: [{ id: 'flight-1', date: '2026-07-20', flight: '7C101' }],
    careerEntries: [{ id: 'career-1', airline: '제주항공' }],
    attachments: [{ id: 'file-1', careerId: 'career-1', name: '경력증명.pdf', size: 3, data: 'YWJj' }],
    exportedAt: '2026-07-20T12:00:00.000Z',
  });
  const parsed = backup.parse(JSON.stringify(payload));
  assert.equal(parsed.app, 'pilot-logbook');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.flights[0].id, 'flight-1');
  assert.equal(parsed.careerEntries[0].id, 'career-1');
  assert.equal(parsed.attachments[0].name, '경력증명.pdf');
});

test('backup parser rejects unrelated, malformed, and oversized record lists', () => {
  assert.throws(() => backup.parse('{bad json'), /JSON/);
  assert.throws(() => backup.parse(JSON.stringify({ app: 'other', version: 1, flights: [], careerEntries: [], attachments: [] })), /Pilot Logbook/);
  assert.throws(() => backup.parse(JSON.stringify({ app: 'pilot-logbook', version: 1, flights: [], careerEntries: [], attachments: new Array(301).fill({}) })), /첨부파일/);
});

test('backup restore merging updates matching ids and preserves device-only records', () => {
  const flights = backup.mergeFlights(
    [{ id: 'flight-1', total: '1:00' }, { id: 'flight-local', total: '2:00' }],
    [{ id: 'flight-1', total: '1:30' }, { id: 'flight-new', total: '3:00' }],
  );
  assert.equal(flights.length, 3);
  assert.equal(flights.find(flight => flight.id === 'flight-1').total, '1:30');
  assert.ok(flights.some(flight => flight.id === 'flight-local'));

  const careers = backup.mergeCareers([{ id: 'career-1', total: '10:00' }], [{ id: 'career-1', total: '20:00' }]);
  assert.deepEqual(careers, [{ id: 'career-1', total: '20:00' }]);
});

test('local attachment helpers accept only PDF/JPG/PNG and sanitize file names', () => {
  assert.equal(localFiles.normalizedType('proof.pdf', ''), 'application/pdf');
  assert.equal(localFiles.normalizedType('photo.JPEG', ''), 'image/jpeg');
  assert.equal(localFiles.normalizedType('scan.png', 'application/octet-stream'), 'image/png');
  assert.equal(localFiles.normalizedType('archive.zip', 'application/zip'), '');
  assert.equal(localFiles.cleanFileName('../경력/증명.pdf'), '.._경력_증명.pdf');
  assert.equal(localFiles.MAX_FILE_BYTES, 10 * 1024 * 1024);
  assert.equal(localFiles.MAX_OWNER_BYTES, 50 * 1024 * 1024);
  assert.equal(localFiles.MAX_FILES_PER_CAREER, 3);
});

test('app keeps evidence files out of Firestore and exposes device backup guidance', () => {
  const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
  const localSource = fs.readFileSync(path.join(root, 'www/local-files.js'), 'utf8');
  const firestoreSave = html.match(/async function saveToFirestore[\s\S]*?function scheduleFirestoreSave/)[0];
  assert.match(html, /<script src="local-files\.js"><\/script>/);
  assert.match(html, /<script src="pilot-backup\.js"><\/script>/);
  assert.match(html, /이 기기에만 저장/);
  assert.match(html, /휴대폰 이동용 전체 백업/);
  assert.match(html, /id="careerModalAttachmentList"/);
  assert.match(html, /selectCareerModalAttachment\(\)/);
  assert.match(html, /경력 저장 시 보관됩니다/);
  assert.match(html, /async function exportFullBackup/);
  assert.match(html, /async function restoreFullBackup/);
  assert.doesNotMatch(firestoreSave, /attachment|첨부/);
  assert.match(localSource, /indexedDB\.open/);
  assert.match(localSource, /async function validateFiles/);
  assert.match(localSource, /record\.ownerId === owner/);
  assert.match(localSource, /storageKey: `\$\{owner\}:\$\{id\}`/);
  assert.doesNotMatch(localSource, /deleteObjectStore/);
});

test('FAQ and privacy policy explain local-only files and manual restore', () => {
  const faq = fs.readFileSync(path.join(root, 'www/faq.html'), 'utf8');
  const privacy = fs.readFileSync(path.join(root, 'www/privacy.html'), 'utf8');
  const terms = fs.readFileSync(path.join(root, 'www/terms.html'), 'utf8');
  assert.match(faq, /경력 증빙 첨부파일은 클라우드 동기화 대상이 아니므로/);
  assert.match(privacy, /기존 경력 증빙 PDF·사진은 계정별로 구분된 기기 내부 저장소에만 보관/);
  assert.match(terms, /백업하지 않은 기기 전용 첨부파일은 운영자가 복구할 수 없습니다/);
});

test('native status bar height keeps the fixed header below the phone clock', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
  assert.equal(config.plugins.StatusBar.overlaysWebView, true);
  assert.match(html, /StatusBar\?\.getInfo\(\)/);
  assert.match(html, /--native-safe-top/);
  assert.match(html, /--app-safe-top: max\(env\(safe-area-inset-top\), var\(--native-safe-top\)\)/);
  assert.match(html, /body \{[\s\S]*?padding-top: var\(--app-safe-top\)/);
  assert.match(html, /\.header \{[^}]*position: fixed;[^}]*top: var\(--app-safe-top\)/);
  assert.match(html, /class="status-bar-background"/);
  assert.match(html, /class="header-spacer"/);
  assert.match(html, /--app-header-height/);
  assert.match(html, /ResizeObserver\(update\)\.observe\(header\)/);
  assert.doesNotMatch(html, /\.header \{[^}]*position: sticky/);
  assert.doesNotMatch(html, /\.header \{[^}]*padding-top: calc\(16px \+ max/);
});

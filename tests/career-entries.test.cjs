const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const career = require('../www/career-entries.js');

const root = path.resolve(__dirname, '..');

function validEntry(overrides = {}) {
  return {
    id: 'career-1', airline: '이스타항공', aircraftType: 'b737-800',
    startMonth: '2018-03', endMonth: '2024-05',
    total: '2500:00', pic: '1200:30', sic: '1299:30', night: '350:15', ifr: '800:45',
    landings: 1450, notes: '경력증명서 기준', ...overrides,
  };
}

test('career entry validates and normalizes airline, aircraft, times, and landings', () => {
  const result = career.validateEntry(validEntry());
  assert.equal(result.ok, true);
  assert.equal(result.entry.aircraftType, 'B737-800');
  assert.equal(result.entry.total, '2500:00');
  assert.equal(result.entry.landings, 1450);
});

test('career entry rejects an inverted employment period and malformed time', () => {
  assert.equal(career.validateEntry(validEntry({ startMonth: '2025-01', endMonth: '2024-12' })).ok, false);
  assert.equal(career.validateEntry(validEntry({ total: '2500:75' })).ok, false);
});

test('career totals combine multiple airline and aircraft records', () => {
  const entries = [
    validEntry(),
    validEntry({ id: 'career-2', airline: '제주항공', aircraftType: 'B737-8', total: '100:30', pic: '100:30', sic: '0:00', night: '10:00', ifr: '20:00', landings: 42 }),
  ];
  const totals = career.summarize(entries);
  assert.deepEqual(totals, { total: 156030, pic: 78060, sic: 77970, night: 21615, ifr: 49245, landings: 1492 });
});

test('synced career identifiers are limited to safe button values', () => {
  const entries = career.sanitizeEntries([validEntry({ id: "career-1');alert(1)//" })]);
  assert.equal(entries[0].id, 'career-1alert1');
});

test('app stores career separately, syncs it to Firestore, and excludes it from recent calculations', () => {
  const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
  assert.match(html, /<script src="career-entries\.js"><\/script>/);
  assert.match(html, /const CAREER_STORAGE_KEY = 'pilotLogbookCareerEntries'/);
  assert.match(html, /careerEntries: JSON\.parse\(JSON\.stringify\(careerEntries\)\)/);
  assert.match(html, /const prior = getCareerTotals\(\);[\s\S]*?let total=prior\.total/);
  assert.match(html, /chartYear === 'all' \? getCareerTotals\(\)/);
  assert.match(html, /if \(diff <= 90\) last90 \+= dur/);
  assert.match(html, /최근 90일, 월별 통계, 자격 유지 및 LogTen CSV에는 포함되지 않습니다/);
});

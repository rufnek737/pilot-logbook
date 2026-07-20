const assert = require('node:assert/strict');
const test = require('node:test');
const { buildLogTenCsv } = require('../www/logten-export.js');
const { parseCsvText, parseCsvRows, mergeCsvFlight, deduplicateFlights, normalizeDate, normalizeClock } = require('../www/csv-import.js');

test('Pilot Logbook LogTen CSV round-trips into app flight fields', () => {
  const csv = buildLogTenCsv([{
    date: '2026-07-16', flight: '7C1406', dep: 'FUK', arr: 'ICN',
    depTime: '17:35', arrTime: '19:01', total: '1:26', acType: 'B737-8', reg: 'HL8719',
    dutyCode: 'C', role: 'PIC', night: '0:15', ifr: '0:55', toPf: 'PF', ldgPf: 'PF',
    dayLdg: '1', nightLdg: '0', ald: 'Y', crewInfo: 'Capt: 강경태 / FO: 박윤서',
    personalMemo: 'Interview, checked',
  }]);
  const result = parseCsvRows(parseCsvText(`\uFEFF${csv}`));
  const [flight] = result.flights;

  assert.equal(result.profile, 'logten');
  assert.equal(flight.date, '2026-07-16');
  assert.equal(flight.flight, '7C1406');
  assert.equal(flight.depTime, '17:35');
  assert.equal(flight.acType, 'B737-8');
  assert.equal(flight.ifr, '0:55');
  assert.equal(flight.ald, 'Y');
  assert.equal(flight.personalMemo, 'Interview, checked');
});

test('flightHistory CSV uses the existing Jeju Air positional layout', () => {
  const headers = Array.from({ length: 19 }, (_, index) => `Column ${index}`);
  const row = Array(19).fill('');
  row[1] = '7M8'; row[2] = '20260717'; row[3] = '0830'; row[4] = '7C101';
  row[5] = 'HL8501'; row[6] = '26001'; row[7] = '강경태'; row[8] = 'Capt';
  row[10] = 'C'; row[11] = 'ICN'; row[12] = 'CJU'; row[13] = '0940';
  row[14] = '1:10'; row[15] = '0:10'; row[16] = '0:20'; row[17] = 'Y'; row[18] = 'Y';

  const result = parseCsvRows([headers, row]);
  const [flight] = result.flights;
  assert.equal(result.profile, 'flight-history');
  assert.equal(flight.acType, 'B737-8');
  assert.equal(flight.arrTime, '09:40');
  assert.equal(flight.role, 'PIC');
  assert.equal(flight.crewInfo, 'Capt 강경태(26001)');
});

test('CSV merge updates automatic data while preserving existing manual fields', () => {
  const previous = {
    id: 'existing', date: '2026-07-16', flight: '7C1406', dep: 'FUK', arr: 'ICN',
    depTime: '17:30', night: '0:22', ifr: '0:44', toPf: 'PM', ldgPf: 'PF',
    dayLdg: '1', nightLdg: '0', ald: 'Y', personalMemo: 'keep me',
    dutyCode: 'C1', role: 'PIC', dutyCodeManual: true, crewInfo: 'old crew',
  };
  const imported = {
    date: '2026-07-16', flight: '7C1406', dep: 'FUK', arr: 'ICN', depTime: '17:35',
    night: '0:10', ifr: '0:20', toPf: 'PF', ldgPf: 'PM', dayLdg: '0', nightLdg: '1',
    ald: 'N', personalMemo: 'replace me', dutyCode: 'C', role: 'PIC', crewInfo: 'new crew',
  };
  const merged = mergeCsvFlight(previous, imported);

  assert.equal(merged.id, 'existing');
  assert.equal(merged.depTime, '17:35');
  assert.equal(merged.night, '0:22');
  assert.equal(merged.ifr, '0:44');
  assert.equal(merged.personalMemo, 'keep me');
  assert.equal(merged.toPf, 'PM');
  assert.equal(merged.ald, 'Y');
  assert.equal(merged.dutyCode, 'C1');
  assert.equal(merged.crewInfo, 'new crew');
});

test('unknown CSV layouts are rejected before saving', () => {
  assert.throws(
    () => parseCsvRows([['Name', 'Value'], ['Unknown', 'Data']]),
    /지원하는 CSV 형식이 아닙니다/,
  );
});

test('duplicate flights and invalid date/time values are rejected or normalized safely', () => {
  const flight = { date: '2026-07-19', flight: '7C9999', dep: 'ICN', arr: 'CJU' };
  assert.equal(deduplicateFlights([flight, { ...flight, total: '2:00' }]).length, 1);
  assert.equal(normalizeDate('2026-02-30'), '');
  assert.equal(normalizeClock('25:10'), '');
  assert.throws(() => parseCsvText('"Date","Flight Number"\n"2026-07-19,"7C9999"'), /인용부호/);
});

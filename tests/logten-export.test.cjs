const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildLogTenCsv, buildLogTenRows } = require('../www/logten-export.js');

const root = path.resolve(__dirname, '..');

test('LogTen export preserves flight, credit, instrument, crew, and memo fields', () => {
  const flights = [{
    date: '2026-07-16', flight: '7C1406', dep: 'FUK', arr: 'ICN',
    depTime: '17:35', arrTime: '19:01', total: '1:26', acType: 'B737-8', reg: 'HL8719',
    dutyCode: 'C', role: 'PIC', night: '0:15', ifr: '0:55', toPf: 'PF', ldgPf: 'PF',
    dayLdg: '1', nightLdg: '0', ald: 'Y',
    crewInfo: 'Capt: 강경태 / FO: 박윤서 / PUR: 이지희',
    personalMemo: 'Interview, checked',
  }];
  const [row] = buildLogTenRows(flights);
  assert.equal(row['Aircraft Type'], 'B38M');
  assert.equal(row['Total Time'], '1:26');
  assert.equal(row.PIC, '1:26');
  assert.equal(row.SIC, '');
  assert.equal(row.Night, '0:15');
  assert.equal(row['Actual Instrument'], '0:55');
  assert.equal(row['PIC/P1 Crew'], '강경태');
  assert.equal(row.Remarks, 'Interview, checked');
  assert.equal(row.Autolands, 1);
});

test('LogTen export sorts by date, maps B737 variants, and applies divided duty credit', () => {
  const source = [
    { date: '2026-07-17', total: '3:00', dutyCode: '3NC', acType: 'B737-800' },
    { date: '2026-07-15', total: '1:00', dutyCode: 'F', acType: '-800' },
  ];
  const rows = buildLogTenRows(source);
  assert.deepEqual(rows.map(row => row.Date), ['2026-07-15', '2026-07-17']);
  assert.deepEqual(rows.map(row => row['Aircraft Type']), ['B738', 'B738']);
  assert.equal(rows[0].SIC, '1:00');
  assert.equal(rows[1].PIC, '1:00');
  assert.equal(rows[1].SIC, '1:00');
  assert.equal(source[0].date, '2026-07-17');
});

test('CSV is UTF-8 compatible, quotes commas, and neutralizes spreadsheet formulas', () => {
  const csv = buildLogTenCsv([{
    date: '2026-07-17', total: '1:00', dutyCode: 'C',
    personalMemo: '=HYPERLINK("https://example.invalid","memo")',
  }]);
  assert.match(csv, /"Date","Flight Number","From"/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid"",""memo""\)"/);
  assert.match(csv, /\r\n/);
});

test('app wires the export, bilingual print, and CSS-owned iOS safe area', () => {
  const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
  const capacitorConfig = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));

  assert.equal(capacitorConfig.ios.contentInset, 'never');
  assert.match(html, /<script src="logten-export\.js"><\/script>/);
  assert.match(html, /function exportLogTenCsv\(\)/);
  assert.match(html, /navigator\.share\(\{ files: \[file\] \}\)/);
  assert.match(html, /setPrintLanguage\('en'\)/);
  assert.match(html, /constant\(safe-area-inset-top\)/);
  assert.match(html, /env\(safe-area-inset-top\)/);
  assert.match(html, /#pv-toolbar \{ position:sticky; top:constant\(safe-area-inset-top\); top:env\(safe-area-inset-top\)/);
  assert.match(html, /LogTen은 Android를 지원하지 않습니다/);
});

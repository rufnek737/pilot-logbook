(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PilotLogbookExport = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HEADERS = [
    'Date', 'Flight Number', 'From', 'To', 'Aircraft ID', 'Aircraft Type',
    'Out Time', 'In Time', 'Total Time', 'PIC', 'SIC', 'Night',
    'Actual Instrument', 'Takeoffs', 'Landings', 'Day Landings',
    'Night Landings', 'Autolands', 'PIC/P1 Crew', 'Duty Code', 'Crew', 'Remarks',
  ];

  function parseMinutes(value) {
    if (!value) return 0;
    const match = String(value).trim().match(/^(\d+):(\d{2})$/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
    const decimal = Number.parseFloat(value);
    return Number.isFinite(decimal) ? Math.round(decimal * 60) : 0;
  }

  function formatMinutes(minutes) {
    if (!minutes || !Number.isFinite(minutes)) return '';
    const hours = Math.floor(Math.abs(minutes) / 60);
    const mins = Math.abs(minutes) % 60;
    return `${hours}:${String(mins).padStart(2, '0')}`;
  }

  function durationMinutes(flight) {
    const stored = parseMinutes(flight.total);
    if (stored) return stored;
    if (!flight.depTime || !flight.arrTime) return 0;
    const dep = String(flight.depTime).split(':').map(Number);
    const arr = String(flight.arrTime).split(':').map(Number);
    if (dep.length !== 2 || arr.length !== 2 || [...dep, ...arr].some(Number.isNaN)) return 0;
    let duration = (arr[0] * 60 + arr[1]) - (dep[0] * 60 + dep[1]);
    if (duration <= 0) duration += 24 * 60;
    return duration;
  }

  function creditedMinutes(flight) {
    const block = durationMinutes(flight);
    const dutyCode = String(flight.dutyCode || '').toUpperCase();
    if (['C', '2C', 'H', 'L', 'PC'].includes(dutyCode)) return { pic: block, sic: 0 };
    if (['C1', 'C2'].includes(dutyCode)) return { pic: Math.round(block / 2), sic: 0 };
    if (dutyCode === '3PC') return { pic: Math.round(block * 2 / 3), sic: 0 };
    if (dutyCode === '3NC') return { pic: Math.round(block / 3), sic: Math.round(block / 3) };
    if (['F', '2F', 'NC'].includes(dutyCode)) return { pic: 0, sic: block };
    if (['F1', 'F2'].includes(dutyCode)) return { pic: 0, sic: Math.round(block / 2) };
    if (dutyCode === '3F') return { pic: 0, sic: Math.round(block * 2 / 3) };
    if (['R', 'K', 'Y', 'O', '2NC', '2NF', 'D', 'EX', 'M'].includes(dutyCode)) return { pic: 0, sic: 0 };
    return flight.role === 'PIC' || flight.role === 'INST'
      ? { pic: block, sic: 0 }
      : { pic: 0, sic: block };
  }

  function aircraftType(value) {
    const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (['B737-8', 'B737-8MAX', '-8MAX', '7M8', 'B38M'].includes(normalized)) return 'B38M';
    if (['B737-800', '-800', '738', 'B738', 'B737'].includes(normalized)) return 'B738';
    return String(value || '').trim();
  }

  function isPilotFlying(flight, field, legacyFields) {
    if (flight[field] !== undefined) return flight[field] === 'PF';
    return legacyFields.some(key => Number.parseInt(flight[key] || 0, 10) > 0);
  }

  function crewPosition(crew, labels) {
    const parts = String(crew || '').split('/').map(part => part.trim()).filter(Boolean);
    for (const part of parts) {
      const separator = part.indexOf(':');
      if (separator < 0) continue;
      const position = part.slice(0, separator).trim().toUpperCase();
      if (labels.includes(position)) return part.slice(separator + 1).trim();
    }
    return '';
  }

  function buildLogTenRows(flights, options = {}) {
    const calculateCredits = options.calculateCredits || creditedMinutes;
    return [...(flights || [])]
      .filter(flight => flight && flight.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map(flight => {
        const total = durationMinutes(flight);
        const credit = calculateCredits(flight);
        const takeoffs = isPilotFlying(flight, 'toPf', ['takeoffs', 'toCnt']) ? 1 : 0;
        const landings = isPilotFlying(flight, 'ldgPf', ['landings', 'ldCnt']) ? 1 : 0;
        const crew = flight.crewInfo ?? flight.remarks ?? '';
        return {
          'Date': flight.date || '',
          'Flight Number': flight.flight || '',
          'From': flight.dep || '',
          'To': flight.arr || '',
          'Aircraft ID': flight.reg || '',
          'Aircraft Type': aircraftType(flight.acType),
          'Out Time': flight.depTime || '',
          'In Time': flight.arrTime || '',
          'Total Time': formatMinutes(total),
          'PIC': formatMinutes(credit.pic || 0),
          'SIC': formatMinutes(credit.sic || 0),
          'Night': formatMinutes(parseMinutes(flight.night)),
          'Actual Instrument': formatMinutes(parseMinutes(flight.ifr)),
          'Takeoffs': takeoffs || '',
          'Landings': landings || '',
          'Day Landings': Number.parseInt(flight.dayLdg || 0, 10) || '',
          'Night Landings': Number.parseInt(flight.nightLdg || 0, 10) || '',
          'Autolands': flight.ald === 'Y' ? 1 : '',
          'PIC/P1 Crew': crewPosition(crew, ['CAPT', 'CAPTAIN', 'CPT', 'PIC']),
          'Duty Code': flight.dutyCode || '',
          'Crew': crew,
          'Remarks': flight.personalMemo || '',
        };
      });
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function buildLogTenCsv(flights, options = {}) {
    const rows = buildLogTenRows(flights, options);
    return [
      HEADERS.map(csvCell).join(','),
      ...rows.map(row => HEADERS.map(header => csvCell(row[header])).join(',')),
    ].join('\r\n');
  }

  return { HEADERS, buildLogTenRows, buildLogTenCsv, aircraftType };
}));

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PilotLogbookCsvImport = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizedHeader(value) {
    return String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  }

  function restoreProtectedText(value) {
    const text = String(value ?? '').trim();
    return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
  }

  function detectDelimiter(text) {
    const firstLine = String(text || '').split(/\r?\n/, 1)[0] || '';
    const candidates = [',', '\t', ';'];
    let best = ',';
    let bestCount = -1;
    for (const delimiter of candidates) {
      let count = 0;
      let quoted = false;
      for (let i = 0; i < firstLine.length; i++) {
        if (firstLine[i] === '"') quoted = !quoted;
        else if (!quoted && firstLine[i] === delimiter) count++;
      }
      if (count > bestCount) { best = delimiter; bestCount = count; }
    }
    return best;
  }

  function parseCsvText(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(source);
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') {
        quoted = true;
      } else if (char === delimiter) {
        row.push(cell); cell = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && source[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(value => String(value).trim() !== '')) rows.push(row);
        row = [];
      } else {
        cell += char;
      }
    }
    if (quoted) throw new Error('CSV의 인용부호가 닫히지 않았습니다.');
    row.push(cell);
    if (row.some(value => String(value).trim() !== '')) rows.push(row);
    return rows;
  }

  function normalizeDate(value) {
    const text = String(value || '').trim();
    const parts = text.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/);
    if (!parts) return '';
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
    return `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
  }

  function normalizeClock(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const colon = text.match(/^(\d{1,2}):(\d{2})$/);
    if (colon) {
      const hours = Number(colon[1]);
      const minutes = Number(colon[2]);
      return hours <= 23 && minutes <= 59 ? `${colon[1].padStart(2, '0')}:${colon[2]}` : '';
    }
    const digits = text.replace(/\D/g, '').padStart(4, '0');
    if (digits.length !== 4) return '';
    const hours = Number(digits.slice(0, 2));
    const minutes = Number(digits.slice(2));
    return hours <= 23 && minutes <= 59 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : '';
  }

  function normalizeDuration(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const colon = text.match(/^(\d+):(\d{2})$/);
    if (colon) return Number(colon[2]) <= 59 ? `${Number(colon[1])}:${colon[2]}` : '';
    const decimal = Number.parseFloat(text);
    if (!Number.isFinite(decimal)) return '';
    const minutes = Math.round(decimal * 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function countValue(value) {
    const text = String(value || '').trim().toUpperCase();
    if (text === 'Y' || text === 'YES' || text === 'TRUE') return 1;
    const count = Number.parseInt(text || '0', 10);
    return Number.isFinite(count) ? count : 0;
  }

  function dutyRole(dutyCode, pic, sic) {
    const duty = String(dutyCode || '').trim().toUpperCase();
    if (['C', '2C', 'H', 'L', 'PC', '3PC', 'C1', 'C2'].includes(duty)) return 'PIC';
    if (['F', '2F', 'NC', '3F', '3NC', 'F1', 'F2', 'R', 'S'].includes(duty)) return 'SIC';
    if (duty === 'K') return 'INST';
    if (normalizeDuration(pic)) return 'PIC';
    if (normalizeDuration(sic)) return 'SIC';
    return 'PIC';
  }

  function appAircraftType(value) {
    const type = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (['B38M', '7M8', 'B737-8MAX', '-8MAX'].includes(type)) return 'B737-8';
    if (['B738', '738', '73H', '-800'].includes(type)) return 'B737-800';
    return String(value || '').trim();
  }

  function objectFromRow(headers, row) {
    const result = {};
    headers.forEach((header, index) => { result[normalizedHeader(header)] = row[index] ?? ''; });
    return result;
  }

  function parseLogTenRows(rows) {
    const headers = rows[0] || [];
    return rows.slice(1).map(row => {
      const item = objectFromRow(headers, row);
      const date = normalizeDate(item.date);
      const dep = String(item.from || '').trim().toUpperCase();
      const arr = String(item.to || '').trim().toUpperCase();
      if (!date || !dep || !arr) return null;
      const dutyCode = String(item['duty code'] || '').trim().toUpperCase();
      const takeoffs = countValue(item.takeoffs);
      const landings = countValue(item.landings);
      const crewInfo = restoreProtectedText(item.crew || item['pic/p1 crew'] || '');
      return {
        date,
        flight: String(item['flight number'] || '').trim().toUpperCase(),
        dep,
        arr,
        depTime: normalizeClock(item['out time']),
        arrTime: normalizeClock(item['in time']),
        reg: String(item['aircraft id'] || '').trim().toUpperCase(),
        acType: appAircraftType(item['aircraft type']),
        total: normalizeDuration(item['total time']),
        night: normalizeDuration(item.night),
        ifr: normalizeDuration(item['actual instrument']),
        dutyCode,
        role: dutyRole(dutyCode, item.pic, item.sic),
        toPf: takeoffs > 0 ? 'PF' : 'PM',
        ldgPf: landings > 0 ? 'PF' : 'PM',
        dayLdg: String(countValue(item['day landings'])),
        nightLdg: String(countValue(item['night landings'])),
        ald: countValue(item.autolands) > 0 ? 'Y' : 'N',
        crewInfo,
        personalMemo: restoreProtectedText(item.remarks || ''),
        remarks: crewInfo,
        source: 'csv-logten',
      };
    }).filter(Boolean);
  }

  function parseFlightHistoryRows(rows) {
    const acMap = { '738': 'B737-800', '73H': 'B737-800', '7M8': 'B737-8', 'B38M': 'B737-8', '320': 'A320', '321': 'A321' };
    return rows.slice(1).map(row => {
      const date = normalizeDate(row[2]);
      const dep = String(row[11] || '').trim().toUpperCase();
      const arr = String(row[12] || '').trim().toUpperCase();
      if (!date || !dep || !arr) return null;
      const dutyCode = String(row[10] || 'C').trim().toUpperCase();
      const monitor = ['3NC', '3F', 'R', 'S', 'O', 'D', 'Y', 'K', 'EX', '2NC', '2NF', 'M'].includes(dutyCode);
      const takeoffs = countValue(row[17]);
      const landings = countValue(row[18]);
      const employee = String(row[7] || '').trim();
      const employeeNo = String(row[6] || '').trim();
      const employeeClass = String(row[8] || '').trim();
      const crewInfo = employee ? `${employeeClass ? `${employeeClass} ` : ''}${employee}${employeeNo ? `(${employeeNo})` : ''}` : '';
      const rawType = String(row[1] || '').trim().toUpperCase();
      return {
        date,
        depTime: normalizeClock(row[3]),
        arrTime: normalizeClock(row[13]),
        flight: String(row[4] || '').trim().toUpperCase(),
        reg: String(row[5] || '').trim().toUpperCase(),
        dep,
        arr,
        acType: acMap[rawType] || String(row[1] || '').trim(),
        total: normalizeDuration(row[14]),
        night: normalizeDuration(row[15]),
        ifr: normalizeDuration(row[16]),
        dutyCode,
        role: dutyRole(dutyCode),
        toPf: takeoffs > 0 ? 'PF' : 'PM',
        ldgPf: landings > 0 ? 'PF' : 'PM',
        dayLdg: String(monitor ? 0 : landings),
        nightLdg: '0',
        ald: 'N',
        crewInfo,
        personalMemo: '',
        remarks: crewInfo,
        source: 'csv-flight-history',
      };
    }).filter(Boolean);
  }

  function parseCsvRows(rows) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error('CSV에 읽을 데이터가 없습니다.');
    const headers = (rows[0] || []).map(normalizedHeader);
    const isLogTen = ['date', 'flight number', 'from', 'to'].every(header => headers.includes(header));
    const flights = isLogTen ? parseLogTenRows(rows) : parseFlightHistoryRows(rows);
    if (!flights.length) throw new Error('지원하는 CSV 형식이 아닙니다. flightHistory 또는 Pilot Logbook LogTen CSV를 사용하세요.');
    return { profile: isLogTen ? 'logten' : 'flight-history', label: isLogTen ? 'LogTen CSV' : 'flightHistory CSV', flights };
  }

  function hasStoredValue(value) {
    return value !== undefined && value !== null && String(value) !== '';
  }

  function mergeCsvFlight(previous, imported) {
    if (!previous) return { ...imported };
    const merged = { ...previous, ...imported, id: previous.id };
    ['night', 'ifr', 'toPf', 'ldgPf', 'dayLdg', 'nightLdg', 'ald', 'personalMemo'].forEach(key => {
      if (hasStoredValue(previous[key])) merged[key] = previous[key];
    });
    if (previous.dutyCodeManual) {
      merged.dutyCode = previous.dutyCode;
      merged.role = previous.role;
      merged.dutyCodeManual = true;
    }
    merged.crewInfo = imported.crewInfo || previous.crewInfo || previous.remarks || '';
    merged.remarks = merged.crewInfo;
    return merged;
  }

  function flightKey(flight) {
    return `${flight.date || ''}-${flight.flight || ''}-${flight.dep || ''}-${flight.arr || ''}`;
  }

  function deduplicateFlights(flights) {
    const unique = new Map();
    (flights || []).forEach(flight => {
      const key = flightKey(flight);
      if (!unique.has(key)) unique.set(key, flight);
    });
    return [...unique.values()];
  }

  return { parseCsvText, parseCsvRows, mergeCsvFlight, deduplicateFlights, normalizeDate, normalizeClock, normalizeDuration };
}));

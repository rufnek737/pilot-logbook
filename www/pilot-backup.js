(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PilotLogbookBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const APP_ID = 'pilot-logbook';
  const VERSION = 1;
  const MAX_FLIGHTS = 20000;
  const MAX_CAREERS = 100;
  const MAX_ATTACHMENTS = 300;

  function buildPayload({ flights, careerEntries, attachments, exportedAt }) {
    return {
      app: APP_ID,
      version: VERSION,
      exportedAt: exportedAt || new Date().toISOString(),
      flights: JSON.parse(JSON.stringify(flights || [])),
      careerEntries: JSON.parse(JSON.stringify(careerEntries || [])),
      attachments: (attachments || []).map(attachment => ({ ...attachment })),
    };
  }

  function parse(text) {
    let payload;
    try { payload = JSON.parse(String(text || '')); }
    catch (_) { throw new Error('백업 파일의 JSON 형식이 올바르지 않습니다.'); }
    if (!payload || payload.app !== APP_ID || payload.version !== VERSION) throw new Error('Pilot Logbook 백업 파일이 아니거나 지원하지 않는 버전입니다.');
    if (!Array.isArray(payload.flights) || payload.flights.length > MAX_FLIGHTS) throw new Error('백업의 비행기록 목록이 올바르지 않습니다.');
    if (!Array.isArray(payload.careerEntries) || payload.careerEntries.length > MAX_CAREERS) throw new Error('백업의 기존 경력 목록이 올바르지 않습니다.');
    if (!Array.isArray(payload.attachments) || payload.attachments.length > MAX_ATTACHMENTS) throw new Error('백업의 첨부파일 목록이 올바르지 않습니다.');
    return payload;
  }

  function flightKey(flight) {
    if (flight && flight.id) return `id:${flight.id}`;
    return `flight:${[flight?.date, flight?.flight, flight?.dep, flight?.arr].map(value => String(value || '').trim().toUpperCase()).join('|')}`;
  }

  function mergeFlights(current, restored) {
    const merged = new Map();
    (current || []).forEach(flight => merged.set(flightKey(flight), flight));
    (restored || []).forEach(flight => merged.set(flightKey(flight), flight));
    return [...merged.values()];
  }

  function mergeCareers(current, restored) {
    const merged = new Map();
    (current || []).forEach(entry => { if (entry && entry.id) merged.set(entry.id, entry); });
    (restored || []).forEach(entry => { if (entry && entry.id) merged.set(entry.id, entry); });
    return [...merged.values()];
  }

  return { APP_ID, VERSION, buildPayload, parse, mergeFlights, mergeCareers };
});

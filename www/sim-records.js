(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PilotLogbookSim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function isSim(record) {
    return Boolean(record && (record.recordType === 'SIM' || record.role === 'SIM'));
  }

  function count(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function actualLandingCount(record) {
    if (!record || isSim(record)) return 0;
    const recorded = count(record.dayLdg) + count(record.nightLdg);
    if (recorded > 0) return recorded;
    if (record.ldgPf !== undefined) return record.ldgPf === 'PF' ? 1 : 0;
    const legacy = record.landings !== undefined ? record.landings : record.ldCnt;
    return legacy === undefined ? 1 : (count(legacy) > 0 ? 1 : 0);
  }

  function simLandingCount(record) {
    if (!isSim(record)) return 0;
    return count(record.simDayLandings) + count(record.simNightLandings);
  }

  function recordLandingCount(record) {
    return isSim(record) ? simLandingCount(record) : actualLandingCount(record);
  }

  function parseHHMM(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (!value) return 0;
    const text = String(value).trim();
    if (!/^\d{1,4}:\d{2}$/.test(text)) return 0;
    const parts = text.split(':').map(Number);
    if (parts[1] > 59) return 0;
    return parts[0] * 60 + parts[1];
  }

  function summarize(records) {
    return (records || []).reduce((sum, record) => {
      if (isSim(record)) {
        const landings = simLandingCount(record);
        sum.simMinutes += parseHHMM(record.total);
        sum.simLandings += landings;
        if (record.simApproved === true) sum.approvedSimLandings += landings;
      } else {
        sum.actualLandings += actualLandingCount(record);
      }
      sum.combinedLandings = sum.actualLandings + sum.simLandings;
      return sum;
    }, { actualLandings: 0, simLandings: 0, combinedLandings: 0, simMinutes: 0, approvedSimLandings: 0 });
  }

  function validateInput(input) {
    if (!input || !String(input.date || '').trim()) return '날짜를 입력해 주세요';
    if (parseHHMM(input.total) <= 0) return 'SIM 훈련시간을 입력해 주세요';
    const fields = ['simTakeoffs', 'simDayLandings', 'simNightLandings'];
    if (fields.some(key => !Number.isInteger(Number(input[key])) || Number(input[key]) < 0)) {
      return '이륙·착륙 횟수는 0 이상의 정수로 입력해 주세요';
    }
    return '';
  }

  return { isSim, count, actualLandingCount, simLandingCount, recordLandingCount, parseHHMM, summarize, validateInput };
});

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PilotLogbookCareer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const TIME_RE = /^(\d+):([0-5]\d)$/;

  function cleanText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
  }

  function cleanId(value) {
    return cleanText(value, 80).replace(/[^A-Za-z0-9_-]/g, '');
  }

  function parseTime(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const match = TIME_RE.exec(text);
    if (!match) return null;
    return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
  }

  function formatTime(minutes) {
    const safe = Math.max(0, Number(minutes) || 0);
    return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
  }

  function validateEntry(input) {
    const airline = cleanText(input?.airline, 80);
    const aircraftType = cleanText(input?.aircraftType, 40).toUpperCase();
    const startMonth = cleanText(input?.startMonth, 7);
    const endMonth = cleanText(input?.endMonth, 7);
    if (!airline) return { ok: false, error: '항공사를 입력해 주세요.' };
    if (!aircraftType) return { ok: false, error: '기종을 입력해 주세요.' };
    if (!MONTH_RE.test(startMonth) || !MONTH_RE.test(endMonth)) return { ok: false, error: '근무 시작월과 종료월을 입력해 주세요.' };
    if (startMonth > endMonth) return { ok: false, error: '종료월은 시작월보다 빠를 수 없습니다.' };

    const timeFields = ['total', 'pic', 'sic', 'night', 'ifr'];
    const minutes = {};
    for (const key of timeFields) {
      minutes[key] = parseTime(input?.[key]);
      if (minutes[key] == null) return { ok: false, error: `${key.toUpperCase()} 시간은 H:MM 형식으로 입력해 주세요.` };
    }
    if (minutes.total <= 0) return { ok: false, error: '총 비행시간을 입력해 주세요.' };

    const landingsText = String(input?.landings ?? '').trim();
    const landings = landingsText ? Number.parseInt(landingsText, 10) : 0;
    if (!Number.isInteger(landings) || landings < 0 || String(landings) !== String(Number(landingsText || 0))) {
      return { ok: false, error: '착륙 횟수는 0 이상의 정수로 입력해 주세요.' };
    }

    return {
      ok: true,
      entry: {
        airline,
        aircraftType,
        startMonth,
        endMonth,
        total: formatTime(minutes.total),
        pic: formatTime(minutes.pic),
        sic: formatTime(minutes.sic),
        night: formatTime(minutes.night),
        ifr: formatTime(minutes.ifr),
        landings,
        notes: cleanText(input?.notes, 500),
      },
    };
  }

  function sanitizeEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.slice(0, 100).map(raw => {
      const result = validateEntry(raw);
      if (!result.ok) return null;
      return {
        ...result.entry,
        id: cleanId(raw.id),
        createdAt: cleanText(raw.createdAt, 40),
        updatedAt: cleanText(raw.updatedAt, 40),
      };
    }).filter(entry => entry && entry.id);
  }

  function summarize(entries) {
    return sanitizeEntries(entries).reduce((sum, entry) => {
      sum.total += parseTime(entry.total) || 0;
      sum.pic += parseTime(entry.pic) || 0;
      sum.sic += parseTime(entry.sic) || 0;
      sum.night += parseTime(entry.night) || 0;
      sum.ifr += parseTime(entry.ifr) || 0;
      sum.landings += entry.landings || 0;
      return sum;
    }, { total: 0, pic: 0, sic: 0, night: 0, ifr: 0, landings: 0 });
  }

  return { parseTime, formatTime, validateEntry, sanitizeEntries, summarize };
});

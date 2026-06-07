'use strict';

const BASE = 'https://crewconnex.jejuair.net';

function stripHtml(s) {
  return (s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ')
    .trim();
}

function mapAc(code) {
  const c = (code || '').replace(/\s+/g, '').toUpperCase();
  if (c === '7M8' || c === 'B38M') return '-8 MAX';
  if (c === '738' || c === 'B738' || c === 'B737') return '-800';
  if (c.includes('A321')) return 'A321';
  if (c.includes('A320')) return 'A320';
  if (c.includes('Q400')) return 'Q400';
  return 'B737-800';
}

function fmtTime(s) {
  const t = (s || '').trim().split(/\s+/)[0];
  if (/^\d{4}$/.test(t)) return `${t.slice(0, 2)}:${t.slice(2)}`;
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  return '';
}

function updateJar(jar, arr) {
  for (const c of arr || []) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
}

function jarStr(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function getSetCookies(r) {
  if (typeof r.headers.getSetCookie === 'function') return r.headers.getSetCookie();
  const h = r.headers.get('set-cookie');
  return h ? [h] : [];
}

function extractNavInfo(html) {
  const seen = new Set();
  const add = (s, target) => { if (s && !seen.has(s)) { seen.add(s); target.push(s); } };
  const hrefs = [], forms = [], iframes = [], jsUrls = [];
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const h = m[1];
    if (h !== '#' && h !== '/' && !h.startsWith('javascript') && !h.startsWith('mailto')) add(h, hrefs);
  }
  const actRe = /action=["']([^"']+)["']/gi;
  while ((m = actRe.exec(html)) !== null) {
    if (!m[1].startsWith('javascript')) add(m[1], forms);
  }
  const ifRe = /<i?frame[^>]+src=["']([^"']+)["']/gi;
  while ((m = ifRe.exec(html)) !== null) add(m[1], iframes);
  const locRe = /(?:location\.href|window\.location)\s*=\s*["']([^"']+)["']/gi;
  while ((m = locRe.exec(html)) !== null) add(m[1], jsUrls);
  const navFnRe = /(?:goPage|navigate|loadPage|movePage|goMenu|changeMenu|openPage|showMenu|goPg|fnGo|menuClick)\s*\(\s*["']([^"']+)["']/gi;
  while ((m = navFnRe.exec(html)) !== null) add(m[1], jsUrls);
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleM ? titleM[1].trim() : '';
  return { title, hrefs: hrefs.slice(0, 30), forms, iframes, jsUrls: jsUrls.slice(0, 20) };
}

function findRosterUrl(html) {
  let m = html.match(/href=["']([^"'#][^"']*(?:roster|checkin|check-in|pairing|schedule)[^"']*)["']/i);
  if (m) return m[1];
  m = html.match(/<a\s[^>]*href=["']([^"'#][^"']+)["'][^>]*>\s*(?:Roster|Schedule|Check.?In|Pairing|로스터|스케줄|체크인|배정)\s*<\/a>/i);
  if (m) return m[1];
  m = html.match(/href=["']([^"'#][^"']+)["'][^>]{0,200}>\s*(?:Roster|Schedule|Check.?In|Pairing|로스터|스케줄|체크인|배정)/i);
  if (m) return m[1];
  m = html.match(/(?:menu|page|tab|go|move|load|open|show|fn)\w*\s*\(\s*['"]([^'"]*(?:[Rr]oster|[Ss]chedule|[Cc]heck[Ii]n|[Pp]airing|[Cc][Ii])[^'"]*)["']/);
  if (m) return m[1];
  m = html.match(/(?:location\.href|window\.location)\s*=\s*["']([^"']*(?:roster|schedule|checkin|pairing)[^"']*)["']/i);
  if (m) return m[1];
  m = html.match(/href=["']([^"']*[?&](?:tab|menu|page|view|mn)=[^"']*(?:[Rr]oster|[Ss]chedule|[Cc]heck|[Pp]airing)[^"']*)["']/i);
  if (m) return m[1];
  return null;
}

function extractTableRows(tableHtml) {
  const rows = [];
  const rRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rM;
  while ((rM = rRe.exec(tableHtml)) !== null) {
    const cells = [];
    const cRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cM;
    while ((cM = cRe.exec(rM[1])) !== null) cells.push(stripHtml(cM[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// 행 텍스트에서 편조 추출 — 사번(7자리) 기준으로 직책·이름을 매핑
function extractCrewFromRow(rowText) {
  const empNos = [...rowText.matchAll(/\d{7}/g)].map(x => x[0]);
  if (empNos.length === 0) return [];

  const names  = [...rowText.matchAll(/[가-힣]{2,4}[A-Za-z]?(?=\s|$)/g)].map(x => x[0]);
  if (names.length < empNos.length) return [];

  const posMatches = [];
  // 3PC|3NC|3F 먼저, JCI(=JC1 이체자) 포함, Capt(PIC) 정규화
  const posRe = /3PC|3NC|3FO|3F|Capt\s*\(PIC\)|SFO|FO|PUR|JCI|JC\d|FA|Capt/g;
  let pm;
  while ((pm = posRe.exec(rowText)) !== null) {
    // 정규화: "Capt (PIC)" / "SFO" → "Capt", "JCI" → "JC1", "3FO" → "3F"
    let pos = pm[0];
    if (/^Capt\s*\(PIC\)$/.test(pos) || pos === 'SFO') pos = 'Capt';
    else if (pos === 'JCI') pos = 'JC1';
    else if (pos === '3FO') pos = '3F';
    posMatches.push(pos);
  }

  return empNos.map((empNo, idx) => ({
    position: posMatches[idx] || '',
    empNo,
    name: names[idx] || '',
  }));
}

function parseRosterHtml(html) {
  const flights = [];
  const today   = new Date();
  let trackYear  = today.getFullYear();
  let trackMonth = today.getMonth() + 1;
  let prevDayNum = 0;

  function dayToDate(dayStr) {
    const d = parseInt((dayStr || '').replace(/\D/g, ''));
    if (!d) return null;
    if (prevDayNum > 20 && d <= 5) {
      trackMonth++;
      if (trackMonth > 12) { trackMonth = 1; trackYear++; }
    }
    prevDayNum = d;
    return `${trackYear}-${String(trackMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const tRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tM;
  while ((tM = tRe.exec(html)) !== null) {
    const rows = extractTableRows(tM[0]);
    if (rows.length < 2) continue;

    const hdr = rows[0].map(c => c.toLowerCase().replace(/[\s\/\(\)\.\-\#]/g, ''));
    if (!hdr.some(h => h === 'from') || !hdr.some(h => h === 'blh')) continue;

    const iDate = hdr.findIndex(h => h === 'date');
    const iRem  = hdr.findIndex(h => h.includes('remark'));
    const iAct  = hdr.findIndex(h => h === 'activity');
    const iFrom = hdr.findIndex(h => h === 'from');
    const iTo   = hdr.findIndex(h => h === 'to');

    const iStd = (() => {
      let i = hdr.findIndex(h => h === 'stdl');
      if (i < 0) i = hdr.findIndex(h => h.startsWith('std'));
      return i;
    })();
    const iSta = (() => {
      let i = hdr.findIndex(h => h === 'stal');
      if (i < 0) i = hdr.findIndex(h => h.startsWith('sta'));
      return i;
    })();

    const iAc  = hdr.findIndex(h => h === 'achotel' || h.startsWith('ac'));
    const iBLH = hdr.findIndex(h => h === 'blh');
    const iReg = hdr.findIndex(h => h.includes('acreg'));

    let lastDate = today.toISOString().slice(0, 10);
    let lastFlight = null; // 편조를 나중 행에서 찾기 위해 마지막 파싱된 비행 추적

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 3) continue;

      if (iDate >= 0 && r[iDate] && /\d/.test(r[iDate])) {
        lastDate = dayToDate(r[iDate]) || lastDate;
      }

      let flt = (iRem >= 0 ? r[iRem] : '').trim();
      if (!flt && iAct >= 0) {
        const act = (r[iAct] || '').trim();
        if (/^\d{3,4}$/.test(act)) flt = '7C' + act;
      }
      flt = flt.replace(/\s+/g, '').toUpperCase();

      const from = iFrom >= 0 ? r[iFrom].slice(0, 3).trim().toUpperCase() : '';
      const to   = iTo   >= 0 ? r[iTo].slice(0, 3).trim().toUpperCase()   : '';
      const std  = iStd  >= 0 ? fmtTime(r[iStd])                          : '';
      const sta  = iSta  >= 0 ? fmtTime(r[iSta])                          : '';
      const ac   = iAc   >= 0 ? mapAc(r[iAc].split(/\s+/)[0])             : 'B737-800';
      const blh  = iBLH  >= 0 ? r[iBLH].trim()                            : '';
      let acReg  = iReg  >= 0 ? r[iReg]                                   : '';
      const regM = acReg.match(/HL\d{4,5}/);
      if (regM) acReg = regM[0];

      if (from && to && flt && blh) {
        const rowText = r.join(' ');
        const crew = extractCrewFromRow(rowText);
        const entry = { date: lastDate, flight: flt, from, to, stdLocal: std, staLocal: sta, acType: ac, acReg, blh, crew };
        flights.push(entry);
        lastFlight = entry;
      } else if (lastFlight) {
        // 비행 행이 아닌 경우: 크루 누적 (크루가 행마다 1명씩 나오는 경우 대응)
        const rowText = r.join(' ');
        const crew = extractCrewFromRow(rowText);
        if (crew.length > 0) {
          // 이미 있는 empNo는 건너뜀 (중복 방지)
          const seen = new Set(lastFlight.crew.map(c => c.empNo));
          crew.forEach(c => {
            if (c.empNo && !seen.has(c.empNo)) {
              lastFlight.crew.push(c);
              seen.add(c.empNo);
            }
          });
        }
      }
    }
  }

  // ±5일 필터
  const todayMs  = today.getTime();
  const windowMs = 5 * 24 * 60 * 60 * 1000;
  const filtered = flights.filter(f => {
    const diff = new Date(f.date).getTime() - todayMs;
    return diff >= -windowMs && diff <= windowMs;
  });

  // 같은 날짜끼리 편조 공유: 날짜별로 가장 완전한(멤버 수 많은) 편조를 기준으로
  const dateCrewMap = {};
  filtered.forEach(f => {
    if (f.crew && f.crew.length > 0) {
      if (!dateCrewMap[f.date] || f.crew.length > dateCrewMap[f.date].length) {
        dateCrewMap[f.date] = f.crew;
      }
    }
  });
  // 편조가 없거나 부분 편조(1명)인 비행에 같은 날 가장 완전한 편조를 적용
  filtered.forEach(f => {
    const best = dateCrewMap[f.date];
    if (best && (!f.crew || f.crew.length <= 1) && best.length > (f.crew?.length || 0)) {
      f.crew = best;
    }
  });

  // 하위 호환성: crew는 편조가 있는 첫 비행의 crew
  const crew = filtered.find(f => f.crew && f.crew.length > 0)?.crew || [];
  return { flights: filtered, crew };
}

async function tryFetch(url, jar, referer) {
  try {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const r  = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'ko-KR,ko', 'Cookie': jarStr(jar), 'Referer': referer },
      redirect: 'follow',
    });
    updateJar(jar, getSetCookies(r));
    if (!r.ok || r.url.includes('login')) return null;
    const html   = await r.text();
    const result = parseRosterHtml(html);
    return result.flights.length > 0 ? result : null;
  } catch (_) { return null; }
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
  };
  const ok   = body       => ({ statusCode: 200, headers: cors, body: JSON.stringify(body) });
  const fail = (code, msg) => ({ statusCode: code, headers: cors, body: JSON.stringify({ error: msg }) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST')   return fail(405, 'Method Not Allowed');

  let username, password;
  try { ({ username, password } = JSON.parse(event.body || '{}')); }
  catch { return fail(400, '잘못된 요청'); }
  if (!username || !password) return fail(400, '아이디/비밀번호를 입력해 주세요');

  const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const jar = {};
  const H   = (extra = {}) => ({
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Cookie': jarStr(jar),
    ...extra,
  });

  try {
    const r0 = await fetch(`${BASE}/`, { headers: H(), redirect: 'follow' });
    updateJar(jar, getSetCookies(r0));
    const loginHtml = await r0.text();

    const actionM = loginHtml.match(/<form[^>]+action=["']([^"']*)["']/i);
    const postUrl = (actionM && actionM[1])
      ? new URL(actionM[1], r0.url).href
      : `${BASE}/default.aspx`;

    const inputs = {};
    const iRe = /<input([^>]*)>/gi;
    let iM;
    while ((iM = iRe.exec(loginHtml)) !== null) {
      const attrs = iM[1];
      const nm  = (attrs.match(/\bname=["']([^"']+)["']/i)  || [])[1];
      const tp  = (attrs.match(/\btype=["']([^"']+)["']/i)  || ['', 'text'])[1].toLowerCase();
      const val = (attrs.match(/\bvalue=["']([^"']*)["']/i) || ['', ''])[1];
      if (nm) inputs[nm] = { type: tp, value: val };
    }

    const userField = Object.keys(inputs).find(k => {
      const t = inputs[k].type, kl = k.toLowerCase();
      return (t === 'text' || t === 'email') &&
             (kl.includes('user') || kl.includes('id') || kl.includes('emp') ||
              kl.includes('login') || kl.includes('name') || kl.includes('nm') || kl.includes('acc'));
    }) || Object.keys(inputs).find(k => {
      const t = inputs[k].type;
      return (t === 'text' || t === 'email') && !inputs[k].value;
    }) || 'username';
    const pwField = Object.keys(inputs).find(k => inputs[k].type === 'password') || 'password';

    const postBody = new URLSearchParams();
    postBody.set(userField, username);
    postBody.set(pwField, password);
    for (const [k, v] of Object.entries(inputs)) {
      if (v.type === 'hidden') postBody.set(k, v.value);
    }

    const submitRe = /<input([^>]+)>/gi;
    let sbM;
    while ((sbM = submitRe.exec(loginHtml)) !== null) {
      const attrs = sbM[1];
      const tp  = (attrs.match(/\btype=["']([^"']+)["']/i) || ['', ''])[1].toLowerCase();
      const nm  = (attrs.match(/\bname=["']([^"']+)["']/i) || [])[1];
      const val = (attrs.match(/\bvalue=["']([^"']*)["']/i) || ['', 'Login'])[1];
      if ((tp === 'submit' || tp === 'image') && nm) { postBody.set(nm, val || 'Login'); break; }
    }

    const btnRe2 = /<button([^>]*)>/gi;
    let bM2;
    while ((bM2 = btnRe2.exec(loginHtml)) !== null) {
      const attrs = bM2[1];
      const tp  = (attrs.match(/\btype=["']([^"']+)["']/i) || ['', 'submit'])[1].toLowerCase();
      const nm  = (attrs.match(/\bname=["']([^"']+)["']/i) || [])[1];
      const val = (attrs.match(/\bvalue=["']([^"']*)["']/i) || ['', 'Login'])[1];
      if (tp === 'submit' && nm) { postBody.set(nm, val || 'Login'); break; }
    }

    const r1 = await fetch(postUrl, {
      method:  'POST',
      headers: H({ 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': r0.url, 'Origin': BASE }),
      body:    postBody.toString(),
      redirect: 'manual',
    });
    updateJar(jar, getSetCookies(r1));

    const dbg = `[postUrl:${postUrl}] [status:${r1.status}] [idField:${userField}] [pwField:${pwField}] [loginPage:${r0.url}]`;

    if (r1.status === 401 || r1.status === 403) return fail(401, `로그인 실패 — 아이디/비밀번호를 확인해 주세요\n${dbg}`);

    let mainUrl;
    const loc1 = r1.headers.get('location') || '';

    if (r1.status >= 300 && r1.status < 400) {
      mainUrl = new URL(loc1, r0.url).href;
    } else {
      const r1Body = await r1.text();
      if (/invalid|incorrect|실패|오류|틀린|없는|만료|wrong|fail/i.test(r1Body)) {
        return fail(401, `로그인 실패 — 아이디/비밀번호를 확인해 주세요\n${dbg}`);
      }
      const directParsed = parseRosterHtml(r1Body);
      if (directParsed.flights.length > 0) return ok(directParsed);
      const jsM = r1Body.match(/(?:location\.href|location\.replace|window\.location)\s*=\s*["']([^"']+)["']/);
      if (jsM) { mainUrl = new URL(jsM[1], r0.url).href; }
      if (!mainUrl) {
        const metaM = r1Body.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^;]*;\s*url=([^\s"']+)/i);
        if (metaM) mainUrl = new URL(metaM[1], r0.url).href;
      }
      if (!mainUrl) mainUrl = BASE;
    }

    const r2 = await fetch(mainUrl, { headers: H({ 'Referer': r0.url }), redirect: 'follow' });
    updateJar(jar, getSetCookies(r2));
    const mainHtml = await r2.text();

    const mainTitle = (mainHtml.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
    if (r2.url.includes('login') || /login|로그인/i.test(mainTitle)) {
      return fail(401, `로그인 실패 — 아이디/비밀번호를 확인해 주세요\n${dbg}\n[최종URL:${r2.url}]\n[제목:${mainTitle}]`);
    }

    const rosterRel = findRosterUrl(mainHtml);
    if (rosterRel) {
      const rosterUrl = rosterRel.startsWith('http') ? rosterRel
        : BASE + (rosterRel.startsWith('/') ? rosterRel : '/' + rosterRel);
      const parsed = await tryFetch(rosterUrl, jar, r2.url);
      if (parsed) return ok(parsed);
    }

    const candidatePaths = [
      '/roster', '/roster.do', '/crew/roster', '/crew/roster.do',
      '/schedule/roster', '/pairing', '/pairing.do', '/crew/pairing',
      '/crew/pairing.do', '/crew/schedule', '/crew/schedule.do',
      '/main/roster', '/roster/view', '/checkin', '/checkin.do',
      '/crew/checkin', '/crew/checkin.do', '/schedule', '/schedule.do',
      '/schedule/checkin', '/crewschedule', '/crewschedule.do',
    ];
    for (const path of candidatePaths) {
      const parsed = await tryFetch(BASE + path, jar, r2.url);
      if (parsed) return ok(parsed);
    }

    const mainParsed = parseRosterHtml(mainHtml);
    if (mainParsed.flights.length > 0) return ok(mainParsed);

    const nav = extractNavInfo(mainHtml);
    const lines = [
      `로그인 성공, Roster 페이지를 찾을 수 없습니다.`,
      `현재 페이지: ${r2.url}`,
      nav.title ? `페이지 제목: ${nav.title}` : '',
      nav.hrefs.length   ? `\n[링크]\n${nav.hrefs.join('\n')}` : '',
      nav.forms.length   ? `\n[폼 action]\n${nav.forms.join('\n')}` : '',
      nav.iframes.length ? `\n[iframe]\n${nav.iframes.join('\n')}` : '',
      nav.jsUrls.length  ? `\n[JS 네비]\n${nav.jsUrls.join('\n')}` : '',
    ].filter(Boolean);

    return fail(404, lines.join('\n'));

  } catch (e) {
    return fail(500, `서버 오류: ${e.message}`);
  }
};

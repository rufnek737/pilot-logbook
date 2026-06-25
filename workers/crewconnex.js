'use strict';

// ─── Cloudflare Workers 버전 (Netlify Functions에서 이전) ─────────────────
// 원본: netlify/functions/crewconnex.js
// 변경사항: exports.handler → export default fetch handler
// 배포: cd workers && npx wrangler deploy
// ────────────────────────────────────────────────────────────────────────────

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
  let t = (s || '').trim().split(/\s+/)[0];
  t = t.replace(/\+\d+$/, '');   // 익일(+1) 표기 제거: 0701+1 → 0701
  if (/^\d{4}$/.test(t)) return `${t.slice(0, 2)}:${t.slice(2)}`;
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  return '';
}

// crew position → 본인 duty code/role 매핑
function posToDuty(pos) {
  const p = (pos || '').toUpperCase();
  if (p === '3PC') return { dutyCode: '3PC', role: 'PIC' };
  if (p === '3NC') return { dutyCode: '3NC', role: 'PIC' };
  if (p === '3F')  return { dutyCode: '3F',  role: 'SIC' };
  if (p === 'CAPT') return { dutyCode: 'C', role: 'PIC' };
  if (p === 'FO' || p === 'SFO') return { dutyCode: 'F', role: 'SIC' };
  return null;
}

// 로그인 아이디(=이름)를 crew 명단에서 찾아 본인 duty code 자동 설정
function applyDutyCode(result, username) {
  if (!result || !result.flights || !username) return result;
  const uname = String(username).trim().replace(/\s+/g, '');
  result.flights.forEach(f => {
    if (!f.crew || !f.crew.length) return;
    const me = f.crew.find(c => c.name && c.name.replace(/\s+/g, '') === uname)
            || f.crew.find(c => c.name && c.name.replace(/[A-Za-z]+$/, '') === uname);
    if (!me) return;
    const d = posToDuty(me.position);
    if (d) { f.dutyCode = d.dutyCode; f.role = d.role; }
  });
  return result;
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

function extractCrewFromRow(rowText) {
  const empNos = [...rowText.matchAll(/\d{7}/g)].map(x => x[0]);
  if (empNos.length === 0) return [];
  const names  = [...rowText.matchAll(/[가-힣]{2,4}[A-Za-z]?(?=\s|$)/g)].map(x => x[0]);
  if (names.length < empNos.length) return [];
  const posMatches = [];
  const posRe = /3PC|3NC|3FO|3F|Capt\s*\(PIC\)|SFO|FO|PUR|JCI|JC\d|FA|Capt|OBSP|OBSR|OBS/g;
  let pm;
  while ((pm = posRe.exec(rowText)) !== null) {
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
    let lastFlight = null;

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
      let ac     = iAc   >= 0 ? mapAc(r[iAc].split(/\s+/)[0])             : '';
      // 컬럼 미검출/기본값이면 행 전체에서 기종 코드 직접 탐색 (AC Reg 컬럼 오인식 등 방지)
      if (!ac || ac === 'B737-800') {
        const acM = r.join(' ').toUpperCase().match(/\b(7M8|B38M|A321|A320|A319|Q400|B738|738)\b/);
        if (acM) ac = mapAc(acM[1]);
      }
      if (!ac) ac = 'B737-800';
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
      } else if (lastFlight && lastDate === lastFlight.date) {
        const rowFrom = (iFrom >= 0 ? r[iFrom] : '').slice(0, 3).trim().toUpperCase();
        const rowTo   = (iTo   >= 0 ? r[iTo]   : '').slice(0, 3).trim().toUpperCase();
        if (!rowFrom || rowFrom !== rowTo) {
          const rowText = r.join(' ');
          const crew = extractCrewFromRow(rowText);
          if (crew.length > 0) {
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
  }

  const todayMs  = today.getTime();
  const windowMs = 5 * 24 * 60 * 60 * 1000;
  const filtered = flights.filter(f => {
    const diff = new Date(f.date).getTime() - todayMs;
    return diff >= -windowMs && diff <= windowMs;
  });

  const dateCrewMap = {};
  filtered.forEach(f => {
    if (f.crew && f.crew.length > 0) {
      if (!dateCrewMap[f.date] || f.crew.length > dateCrewMap[f.date].length) {
        dateCrewMap[f.date] = f.crew;
      }
    }
  });
  filtered.forEach(f => {
    const best = dateCrewMap[f.date];
    if (best && (!f.crew || f.crew.length <= 1) && best.length > (f.crew?.length || 0)) {
      f.crew = best;
    }
  });

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

// ─── Cloudflare Workers 핸들러 (Netlify와 다른 부분) ───────────────────────
export default {
  async fetch(request, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type':                 'application/json',
    };

    const ok   = body        => new Response(JSON.stringify(applyDutyCode(body, username)), { status: 200, headers: cors });
    const fail = (code, msg) => new Response(JSON.stringify({ error: msg }), { status: code, headers: cors });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST')   return fail(405, 'Method Not Allowed');

    let username, password;
    try { ({ username, password } = JSON.parse(await request.text() || '{}')); }
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

      const dbg = `[postUrl:${postUrl}] [status:${r1.status}] [idField:${userField}] [pwField:${pwField}]`;

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
        return fail(401, `로그인 실패 — 아이디/비밀번호를 확인해 주세요\n${dbg}`);
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
      ].filter(Boolean);

      return fail(404, lines.join('\n'));

    } catch (e) {
      return fail(500, `서버 오류: ${e.message}`);
    }
  }
};

'use strict';

// ─── Cloudflare Workers 버전 (Netlify Functions에서 이전) ─────────────────
// 원본: netlify/functions/crewconnex.js
// 변경사항: exports.handler → export default fetch handler
// 배포: cd workers && npx wrangler deploy
// ────────────────────────────────────────────────────────────────────────────

const BASE = 'https://crewconnex.jejuair.net';
const DEFAULT_FIREBASE_PROJECT_ID = 'pilot-logbook-22bb8';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const ALLOWED_ORIGINS = new Set([
  'https://rufnek737.github.io',
  'https://pilot-logbook.netlify.app',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
]);
const MAX_REQUEST_BYTES = 4096;
const AUTO_IMPORT_FREE_LIMIT = 100;
const APP_BUNDLE_ID = 'com.rufnek.pilotlogbook';
const SUBSCRIPTION_PRODUCTS = new Set([
  'com.rufnek.pilotlogbook.autoimport.monthly',
  'com.rufnek.pilotlogbook.autoimport.annual',
]);

let firebaseCertCache = { certificates: null, expiresAt: 0 };

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function readDerElement(bytes, offset) {
  if (offset >= bytes.length) throw new Error('Invalid DER');
  const start = offset;
  const tag = bytes[offset++];
  if (offset >= bytes.length) throw new Error('Invalid DER length');
  let length = bytes[offset++];
  if (length & 0x80) {
    const count = length & 0x7f;
    if (!count || count > 4 || offset + count > bytes.length) throw new Error('Invalid DER length');
    length = 0;
    for (let i = 0; i < count; i++) length = (length * 256) + bytes[offset++];
  }
  const contentStart = offset;
  const end = contentStart + length;
  if (end > bytes.length) throw new Error('Invalid DER bounds');
  return { tag, start, contentStart, end };
}

// Firebase가 제공하는 X.509 인증서에서 Web Crypto가 요구하는 SPKI 공개키를 추출한다.
export function extractSpkiFromCertificate(pem) {
  const body = String(pem || '')
    .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '');
  if (!body) throw new Error('Missing certificate');
  const certificate = Uint8Array.from(atob(body), ch => ch.charCodeAt(0));
  const root = readDerElement(certificate, 0);
  if (root.tag !== 0x30 || root.end !== certificate.length) throw new Error('Invalid certificate');
  const tbs = readDerElement(certificate, root.contentStart);
  if (tbs.tag !== 0x30) throw new Error('Invalid certificate body');

  let offset = tbs.contentStart;
  let element = readDerElement(certificate, offset);
  if (element.tag === 0xa0) {
    offset = element.end;
    element = readDerElement(certificate, offset);
  }
  // serialNumber, signature, issuer, validity, subject
  for (let i = 0; i < 5; i++) {
    offset = element.end;
    element = readDerElement(certificate, offset);
  }
  if (element.tag !== 0x30 || element.end > tbs.end) throw new Error('Invalid public key');
  return certificate.slice(element.start, element.end);
}

function cacheMaxAge(headers) {
  const match = (headers.get('cache-control') || '').match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Math.max(60, Number(match[1])) : 3600;
}

async function getFirebaseCertificates(fetchImpl, nowMs) {
  if (firebaseCertCache.certificates && firebaseCertCache.expiresAt > nowMs) {
    return firebaseCertCache.certificates;
  }
  const response = await fetchImpl(FIREBASE_CERTS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Certificate fetch failed');
  const certificates = await response.json();
  firebaseCertCache = {
    certificates,
    expiresAt: nowMs + cacheMaxAge(response.headers) * 1000,
  };
  return certificates;
}

export async function verifyFirebaseIdToken(token, projectId, options = {}) {
  if (typeof token !== 'string' || token.length > 8192) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !part)) throw new Error('Invalid token');

  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  } catch (_) {
    throw new Error('Invalid token');
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Invalid token header');
  }

  const nowMs = options.nowMs ?? Date.now();
  const now = Math.floor(nowMs / 1000);
  const issuer = `https://securetoken.google.com/${projectId}`;
  if (payload.aud !== projectId || payload.iss !== issuer) throw new Error('Invalid token project');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new Error('Invalid token subject');
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error('Expired token');
  if (!Number.isFinite(payload.iat) || payload.iat > now) throw new Error('Invalid issued time');
  if (!Number.isFinite(payload.auth_time) || payload.auth_time > now) throw new Error('Invalid auth time');

  const certificates = options.certificates
    || await getFirebaseCertificates(options.fetchImpl || fetch, nowMs);
  const certificate = certificates[header.kid];
  if (!certificate) throw new Error('Unknown signing key');
  const spki = extractSpkiFromCertificate(certificate);
  const publicKey = await crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const verified = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) throw new Error('Invalid token signature');
  return { ...payload, uid: payload.sub };
}

function responseHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function billingEnforced(env) {
  return String(env.BILLING_ENFORCED || '').toLowerCase() === 'true';
}

export function autoImportFlightKey(flight) {
  return [flight?.date, flight?.flight, flight?.from, flight?.to]
    .map(value => String(value || '').trim().toUpperCase())
    .join('|');
}

async function readBillingStatus(env, uid) {
  if (!env.BILLING_DB) {
    return {
      active: false,
      productId: null,
      expiresAt: null,
      usedCount: 0,
      freeLimit: AUTO_IMPORT_FREE_LIMIT,
      remaining: AUTO_IMPORT_FREE_LIMIT,
      enforced: billingEnforced(env),
    };
  }
  const now = Date.now();
  const [entitlement, usage] = await Promise.all([
    env.BILLING_DB.prepare(`
      SELECT product_id AS productId, expires_at AS expiresAt
      FROM subscription_entitlements
      WHERE uid = ?1 AND expires_at > ?2 AND revoked = 0
      LIMIT 1
    `).bind(uid, now).first(),
    env.BILLING_DB.prepare(`
      SELECT COUNT(*) AS usedCount FROM auto_import_flights WHERE uid = ?1
    `).bind(uid).first(),
  ]);
  const usedCount = Number(usage?.usedCount || 0);
  return {
    active: Boolean(entitlement),
    productId: entitlement?.productId || null,
    expiresAt: entitlement?.expiresAt || null,
    usedCount,
    freeLimit: AUTO_IMPORT_FREE_LIMIT,
    remaining: Math.max(0, AUTO_IMPORT_FREE_LIMIT - usedCount),
    enforced: billingEnforced(env),
  };
}

async function recordAutoImportFlights(env, uid, flights) {
  if (!env.BILLING_DB || !Array.isArray(flights) || !flights.length) return;
  const now = Date.now();
  const statements = flights
    .map(autoImportFlightKey)
    .filter(key => key && key !== '|||')
    .map(key => env.BILLING_DB.prepare(`
      INSERT OR IGNORE INTO auto_import_flights (uid, flight_key, created_at)
      VALUES (?1, ?2, ?3)
    `).bind(uid, key, now));
  if (statements.length) await env.BILLING_DB.batch(statements);
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function utf8Base64Url(value) {
  return base64UrlEncode(new TextEncoder().encode(value));
}

function pemToBytes(pem) {
  const body = String(pem || '')
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  if (!body) throw new Error('Missing App Store private key');
  return Uint8Array.from(atob(body), ch => ch.charCodeAt(0));
}

async function createAppStoreToken(env, nowMs = Date.now()) {
  if (!env.APP_STORE_ISSUER_ID || !env.APP_STORE_KEY_ID || !env.APP_STORE_PRIVATE_KEY) {
    throw new Error('Missing App Store credentials');
  }
  const now = Math.floor(nowMs / 1000);
  const header = utf8Base64Url(JSON.stringify({ alg: 'ES256', kid: env.APP_STORE_KEY_ID, typ: 'JWT' }));
  const payload = utf8Base64Url(JSON.stringify({
    iss: env.APP_STORE_ISSUER_ID,
    iat: now,
    exp: now + 300,
    aud: 'appstoreconnect-v1',
    bid: APP_BUNDLE_ID,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(env.APP_STORE_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  ));
  return `${header}.${payload}.${base64UrlEncode(signature)}`;
}

function decodeJwsPayload(jws) {
  const part = String(jws || '').split('.')[1];
  if (!part) throw new Error('Invalid signed transaction');
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
}

async function fetchSubscriptionFromApple(env, transactionId, fetchImpl = fetch) {
  const token = await createAppStoreToken(env);
  const paths = [
    'https://api.storekit.itunes.apple.com',
    'https://api.storekit-sandbox.itunes.apple.com',
  ];
  let lastResponse;
  for (const base of paths) {
    const response = await fetchImpl(`${base}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    lastResponse = response;
    if (response.ok) return { body: await response.json(), environment: base.includes('sandbox') ? 'Sandbox' : 'Production' };
    if (![404, 400].includes(response.status)) break;
  }
  throw new Error(`Apple verification failed (${lastResponse?.status || 0})`);
}

export function selectActiveAppleSubscription(body, nowMs = Date.now()) {
  const candidates = [];
  for (const group of body?.data || []) {
    if (![1, 4].includes(Number(group?.status))) continue;
    for (const item of group?.lastTransactions || []) {
      try {
        const info = decodeJwsPayload(item?.signedTransactionInfo);
        if (info.bundleId !== APP_BUNDLE_ID) continue;
        if (!SUBSCRIPTION_PRODUCTS.has(info.productId)) continue;
        if (Number(info.expiresDate || 0) <= nowMs || info.revocationDate) continue;
        candidates.push(info);
      } catch (_) { /* malformed entries are ignored */ }
    }
  }
  candidates.sort((a, b) => Number(b.expiresDate || 0) - Number(a.expiresDate || 0));
  return candidates[0] || null;
}

async function verifyAndStoreSubscription(env, uid, transactionId, fetchImpl) {
  if (!env.BILLING_DB) throw new Error('Billing database unavailable');
  const verified = await fetchSubscriptionFromApple(env, transactionId, fetchImpl);
  const subscription = selectActiveAppleSubscription(verified.body);
  if (!subscription) throw new Error('Active subscription not found');
  const originalTransactionId = String(subscription.originalTransactionId || subscription.transactionId || '');
  if (!originalTransactionId) throw new Error('Missing original transaction');

  const owner = await env.BILLING_DB.prepare(`
    SELECT uid FROM subscription_entitlements WHERE original_transaction_id = ?1 LIMIT 1
  `).bind(originalTransactionId).first();
  if (owner?.uid && owner.uid !== uid) throw new Error('Subscription belongs to another account');

  await env.BILLING_DB.prepare(`
    INSERT INTO subscription_entitlements
      (uid, product_id, original_transaction_id, expires_at, environment, revoked, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)
    ON CONFLICT(uid) DO UPDATE SET
      product_id = excluded.product_id,
      original_transaction_id = excluded.original_transaction_id,
      expires_at = excluded.expires_at,
      environment = excluded.environment,
      revoked = 0,
      updated_at = excluded.updated_at
  `).bind(
    uid,
    subscription.productId,
    originalTransactionId,
    Number(subscription.expiresDate),
    verified.environment,
    Date.now(),
  ).run();
  return readBillingStatus(env, uid);
}

function bearerToken(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

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
export function applyDutyCode(result, username) {
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

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// 가져오기 대상 기간(오늘 ±5일)을 'YYYY-MM-DD' 문자열로 반환.
// 날짜 문자열끼리 비교하므로 시:분 차이로 경계일이 잘려나가지 않는다.
export function rosterWindow(now = new Date(), days = 5) {
  const toStr = ms => new Date(ms).toISOString().slice(0, 10);
  const dayMs = 24 * 60 * 60 * 1000;
  return { start: toStr(now.getTime() - days * dayMs), end: toStr(now.getTime() + days * dayMs) };
}

export function parseRosterHtml(html) {
  const flights = [];
  const today   = new Date();
  let trackYear  = today.getFullYear();
  let trackMonth = today.getMonth() + 1;
  let prevDayNum = 0;

  // 로스터의 날짜 칸은 "Tue 01 Sep"처럼 월 이름을 직접 담고 있으므로 그대로 사용한다.
  // (월 이름이 없는 옛 형식만 일(日) 숫자 롤오버 추정으로 보조 처리)
  function dayToDate(dayStr) {
    const text = String(dayStr || '');
    const d = parseInt(text.replace(/\D/g, ''));
    if (!d) return null;

    const monthMatch = text.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
    if (monthMatch) {
      const month = MONTH_NAMES[monthMatch[1]];
      // 연도는 표에 없으므로 오늘 기준으로 추정 — 6개월 이상 벌어지면 인접 연도로 본다.
      let year = today.getFullYear();
      const monthGap = month - (today.getMonth() + 1);
      if (monthGap > 6) year -= 1;
      else if (monthGap < -6) year += 1;
      trackYear = year;
      trackMonth = month;
      prevDayNum = d;
      return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

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

  // 날짜 단위 비교 — 시:분까지 비교하면 정확히 5일 전 비행(예: 오늘 9/5의 8/31)이
  // 몇 시간 차이로 잘려나간다.
  const { start: winStart, end: winEnd } = rosterWindow();
  const filtered = flights.filter(f => f.date >= winStart && f.date <= winEnd);

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

function extractHiddenFields(html) {
  const fields = {};
  const re = /<input[^>]+type=["']hidden["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const name = (tag.match(/\bname=["']([^"']+)["']/i) || [])[1];
    if (!name) continue;
    const value = (tag.match(/\bvalue=["']([^"']*)["']/i) || [])[1] || '';
    fields[name] = decodeEntities(value);
  }
  return fields;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

// 로스터 상단의 기간 선택 <select> 옵션 파싱
// 옵션 형식: value="2026-08-01|2026-08-31" → AUG26 (01Aug26..31Aug26)
function extractPeriodOptions(html) {
  const sel = html.match(/<select[^>]+name=["']ctl00\$Main\$periodSelect["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!sel) return [];
  return [...sel[1].matchAll(/<option([^>]*)>([^<]*)</gi)].map(m => {
    const attrs = m[1];
    const value = (attrs.match(/value=["']([^"']*)["']/i) || [])[1] || '';
    const [start, end] = value.split('|');
    return { value, start, end, selected: /\bselected\b/i.test(attrs), label: m[2].trim() };
  }).filter(o => o.start && o.end);
}

// 기간 선택 후 "Period" 버튼(submit)으로 해당 월 로스터를 조회.
// 주의: 이 버튼들은 type=submit 이므로 __EVENTTARGET이 아니라
// 버튼의 name=value 쌍을 본문에 넣어야 서버가 조회를 실행한다.
async function fetchRosterPeriod(rosterUrl, jar, html, option) {
  try {
    const fields = extractHiddenFields(html);
    if (!fields.__VIEWSTATE) return null;

    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    body.set('__EVENTTARGET', '');
    body.set('__EVENTARGUMENT', '');
    body.set('ctl00$Main$periodSelect', option.value);
    body.set('ctl00$Main$activitySelectDropdown', 'period');
    body.set('ctl00$Main$period', 'Period'); // submit 버튼

    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const r = await fetch(rosterUrl, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,*/*',
        'Accept-Language': 'ko-KR,ko',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': jarStr(jar),
        'Referer': rosterUrl,
      },
      body: body.toString(),
      redirect: 'follow',
    });
    updateJar(jar, getSetCookies(r));
    if (!r.ok) return null;
    const respHtml = await r.text();
    return parseRosterHtml(respHtml);
  } catch (_) {
    return null;
  }
}

// 기본(이번 달) 조회 결과에, ±5일 창과 겹치는 인접 월을 추가 조회해 합친다.
async function fetchAdjacentPeriods(rosterUrl, jar, html, base) {
  const options = extractPeriodOptions(html);
  if (!options.length) return base;

  // 날짜 단위로 비교한다. 시:분까지 비교하면 "8/31까지"인 달 옵션이
  // 현재 시각 기준 창 시작(8/31 01:40)보다 앞서 탈락하는 문제가 생긴다.
  const { start: winStart, end: winEnd } = rosterWindow();

  // 현재 선택된 달을 제외하고, 조회 창과 날짜 범위가 겹치는 달만 추가 조회
  const targets = options.filter(o => !o.selected
    && o.start <= winEnd && o.end >= winStart).slice(0, 2);
  if (!targets.length) return base;

  let merged = base;
  for (const option of targets) {
    const parsed = await fetchRosterPeriod(rosterUrl, jar, html, option);
    if (parsed && parsed.flights.length) merged = mergeRosterResults(merged, parsed);
  }
  return merged;
}

// 기본 조회 + 기간 조회 결과를 date+flight+from+to 기준으로 중복 없이 합침
function mergeRosterResults(base, extra) {
  const key = f => `${f.date}|${f.flight}|${f.from}|${f.to}`;
  const byKey = new Map();
  for (const f of [...(base.flights || []), ...(extra.flights || [])]) {
    const k = key(f);
    const prev = byKey.get(k);
    // 편조 정보가 더 많은 쪽을 남긴다
    if (!prev || (f.crew?.length || 0) > (prev.crew?.length || 0)) byKey.set(k, f);
  }
  const flights = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { flights, crew: base.crew?.length ? base.crew : (extra.crew || []) };
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
    if (result.flights.length === 0) return null;
    // 로스터 기본 화면은 "선택된 달 전체"만 준다. 월 경계(오늘이 월초/월말)에서는
    // 조회 창에 걸치는 인접 달을 기간 선택으로 추가 조회해 합쳐야 누락되지 않는다.
    return await fetchAdjacentPeriods(r.url, jar, html, result);
  } catch (_) {
    return null;
  }
}

// ─── Cloudflare Workers 핸들러 (Netlify와 다른 부분) ───────────────────────
export async function handleRequest(request, env = {}, dependencies = {}) {
    const origin = request.headers.get('origin') || '';
    const cors = responseHeaders(origin);
    let verifiedUser;
    let username;
    const ok = async body => {
      const mapped = applyDutyCode(body, username);
      const billing = verifiedUser ? await readBillingStatus(env, verifiedUser.uid) : null;
      return new Response(JSON.stringify({ ...mapped, billing }), {
      status: 200,
      headers: cors,
      });
    };
    const fail = (status, error, code) => new Response(JSON.stringify({ error, code }), {
      status,
      headers: cors,
    });

    if (!ALLOWED_ORIGINS.has(origin)) {
      return fail(403, '허용되지 않은 앱 환경입니다.', 'ORIGIN_NOT_ALLOWED');
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const isBillingStatus = pathname === '/billing/status';
    const isBillingVerify = pathname === '/billing/verify';
    const isBillingImports = pathname === '/billing/imports';
    if (isBillingStatus && request.method !== 'GET') return fail(405, '지원하지 않는 요청입니다.', 'METHOD_NOT_ALLOWED');
    if (!isBillingStatus && request.method !== 'POST') return fail(405, '지원하지 않는 요청입니다.', 'METHOD_NOT_ALLOWED');

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_REQUEST_BYTES) return fail(413, '요청 내용이 너무 큽니다.', 'REQUEST_TOO_LARGE');

    const token = bearerToken(request);
    if (!token) {
      return fail(401, 'Pilot Logbook에 로그인한 뒤 다시 시도해 주세요.', 'AUTH_REQUIRED');
    }

    try {
      const verifyToken = dependencies.verifyToken || verifyFirebaseIdToken;
      verifiedUser = await verifyToken(token, env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID);
    } catch (_) {
      return fail(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.', 'AUTH_INVALID');
    }

    if (isBillingStatus) {
      try {
        return new Response(JSON.stringify(await readBillingStatus(env, verifiedUser.uid)), { status: 200, headers: cors });
      } catch (_) {
        return fail(503, '구독 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'BILLING_UNAVAILABLE');
      }
    }

    if (isBillingVerify) {
      let body;
      try { body = await request.json(); } catch (_) { return fail(400, '잘못된 요청입니다.', 'INVALID_REQUEST'); }
      const transactionId = typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
      if (!/^\d{6,32}$/.test(transactionId)) return fail(400, '구매 정보를 확인할 수 없습니다.', 'INVALID_TRANSACTION');
      try {
        const status = await verifyAndStoreSubscription(env, verifiedUser.uid, transactionId, dependencies.fetchImpl || fetch);
        return new Response(JSON.stringify(status), { status: 200, headers: cors });
      } catch (_) {
        return fail(400, '활성 구독을 확인하지 못했습니다. App Store 계정을 확인해 주세요.', 'SUBSCRIPTION_NOT_ACTIVE');
      }
    }

    if (isBillingImports) {
      let body;
      try { body = await request.json(); } catch (_) { return fail(400, '잘못된 요청입니다.', 'INVALID_REQUEST'); }
      const flights = Array.isArray(body?.flights) ? body.flights.slice(0, 20) : [];
      if (!flights.length) return fail(400, '저장된 비행 정보가 없습니다.', 'INVALID_REQUEST');
      try {
        await recordAutoImportFlights(env, verifiedUser.uid, flights);
        return new Response(JSON.stringify(await readBillingStatus(env, verifiedUser.uid)), { status: 200, headers: cors });
      } catch (_) {
        return fail(503, '자동 가져오기 사용량을 저장하지 못했습니다.', 'BILLING_UNAVAILABLE');
      }
    }

    let currentBilling;
    try {
      currentBilling = await readBillingStatus(env, verifiedUser.uid);
    } catch (_) {
      if (billingEnforced(env)) return fail(503, '구독 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'BILLING_UNAVAILABLE');
    }
    if (billingEnforced(env) && !currentBilling?.active && currentBilling?.remaining <= 0) {
      return fail(402, '무료 자동 가져오기 100편을 모두 사용했습니다. 구독 후 무제한으로 이용할 수 있습니다.', 'FREE_LIMIT_REACHED');
    }

    if (!env.CREWCONNEX_RATE_LIMITER || typeof env.CREWCONNEX_RATE_LIMITER.limit !== 'function') {
      return fail(503, '가져오기 보안 설정을 확인 중입니다. 잠시 후 다시 시도해 주세요.', 'RATE_LIMIT_UNAVAILABLE');
    }
    try {
      const rateLimit = await env.CREWCONNEX_RATE_LIMITER.limit({ key: `crewconnex:${verifiedUser.uid}` });
      if (!rateLimit.success) {
        return fail(429, '요청이 너무 많습니다. 1분 후 다시 시도해 주세요.', 'RATE_LIMITED');
      }
    } catch (_) {
      return fail(503, '가져오기 보안 설정을 확인 중입니다. 잠시 후 다시 시도해 주세요.', 'RATE_LIMIT_UNAVAILABLE');
    }

    let password;
    try {
      const requestBody = await request.text();
      if (new TextEncoder().encode(requestBody).byteLength > MAX_REQUEST_BYTES) {
        return fail(413, '요청 내용이 너무 큽니다.', 'REQUEST_TOO_LARGE');
      }
      ({ username, password } = JSON.parse(requestBody || '{}'));
    } catch (_) {
      return fail(400, '잘못된 요청입니다.', 'INVALID_REQUEST');
    }
    username = typeof username === 'string' ? username.trim() : '';
    password = typeof password === 'string' ? password : '';
    if (!username || !password || username.length > 128 || password.length > 256) {
      return fail(400, '아이디/비밀번호를 확인해 주세요.', 'INVALID_CREDENTIALS');
    }

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

      if (r1.status === 401 || r1.status === 403) {
        return fail(401, 'CrewConnex 로그인 실패 — 아이디/비밀번호를 확인해 주세요.', 'CREWCONNEX_LOGIN_FAILED');
      }

      let mainUrl;
      const loc1 = r1.headers.get('location') || '';

      if (r1.status >= 300 && r1.status < 400) {
        mainUrl = new URL(loc1, r0.url).href;
      } else {
        const r1Body = await r1.text();
        if (/invalid|incorrect|실패|오류|틀린|없는|만료|wrong|fail/i.test(r1Body)) {
          return fail(401, 'CrewConnex 로그인 실패 — 아이디/비밀번호를 확인해 주세요.', 'CREWCONNEX_LOGIN_FAILED');
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
        return fail(401, 'CrewConnex 로그인 실패 — 아이디/비밀번호를 확인해 주세요.', 'CREWCONNEX_LOGIN_FAILED');
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

      return fail(404, '로그인 성공, 최근 5일 이내 비행을 찾을 수 없습니다.', 'NO_RECENT_FLIGHTS');

    } catch (_) {
      return fail(502, 'CrewConnex 연결 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'UPSTREAM_ERROR');
    }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

'use strict';

// ─── Cloudflare Workers 버전 (Netlify Functions에서 이전) ─────────────────
// 원본: netlify/functions/crewconnex.js
// 변경사항: exports.handler → export default fetch handler
// 배포: cd workers && npx wrangler deploy
// ────────────────────────────────────────────────────────────────────────────

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
const AUTO_IMPORT_FREE_LIMIT = 50;
const APP_BUNDLE_ID = 'com.rufnekcrew.flylog';
const ANDROID_PACKAGE_NAME = 'com.rufnek.pilotlogbook';
// 구독이 아니라 한 번 결제로 끝나는 평생 이용권이다
// (애플: 비소모성, 구글: 관리형 제품).
const LIFETIME_PRODUCT_ID = 'com.rufnekcrew.flylog.autoimport.lifetime';
// 만료가 없는 권한을 기존 entitlement 스키마(expires_at)에 담기 위한 먼 미래 값(2100-01-01).
const LIFETIME_EXPIRES_AT = 4102444800000;

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

// 운영 오리진 + 로컬 개발 미리보기(localhost/127.0.0.1 아무 포트). 인증은 Firebase가 따로 한다.
function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
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
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

// 개발자/운영자 계정은 한도 없이 사용한다.
// 저장소가 공개라 이메일은 코드가 아니라 시크릿(BILLING_UNLIMITED_EMAILS, 쉼표 구분)에 둔다.
function isUnlimitedAccount(env, email) {
  if (!email) return false;
  const allow = String(env.BILLING_UNLIMITED_EMAILS || '')
    .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return allow.includes(String(email).toLowerCase());
}

function billingEnforced(env) {
  return String(env.BILLING_ENFORCED || '').toLowerCase() === 'true';
}

export function autoImportFlightKey(flight) {
  return [flight?.date, flight?.flight, flight?.from, flight?.to]
    .map(value => String(value || '').trim().toUpperCase())
    .join('|');
}

async function readBillingStatus(env, uid, email) {
  const unlimited = isUnlimitedAccount(env, email);
  if (!env.BILLING_DB) {
    return {
      active: false,
      productId: null,
      expiresAt: null,
      usedCount: 0,
      freeLimit: AUTO_IMPORT_FREE_LIMIT,
      remaining: AUTO_IMPORT_FREE_LIMIT,
      enforced: billingEnforced(env),
      unlimited,
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
    active: unlimited || Boolean(entitlement),
    productId: entitlement?.productId || null,
    expiresAt: entitlement?.expiresAt || null,
    usedCount,
    freeLimit: AUTO_IMPORT_FREE_LIMIT,
    remaining: unlimited ? AUTO_IMPORT_FREE_LIMIT : Math.max(0, AUTO_IMPORT_FREE_LIMIT - usedCount),
    enforced: billingEnforced(env),
    unlimited,
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

async function fetchTransactionFromApple(env, transactionId, fetchImpl = fetch) {
  const token = await createAppStoreToken(env);
  const paths = [
    'https://api.storekit.itunes.apple.com',
    'https://api.storekit-sandbox.itunes.apple.com',
  ];
  let lastResponse;
  for (const base of paths) {
    const response = await fetchImpl(`${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    lastResponse = response;
    if (response.ok) return { body: await response.json(), environment: base.includes('sandbox') ? 'Sandbox' : 'Production' };
    if (![404, 400].includes(response.status)) break;
  }
  throw new Error(`Apple verification failed (${lastResponse?.status || 0})`);
}

// 평생 이용권은 만료일이 없다. 환불(revocationDate)된 거래만 걸러낸다.
export function selectAppleLifetimePurchase(body) {
  let info;
  try {
    info = decodeJwsPayload(body?.signedTransactionInfo);
  } catch (_) {
    return null;
  }
  if (info.bundleId !== APP_BUNDLE_ID) return null;
  if (info.productId !== LIFETIME_PRODUCT_ID) return null;
  if (info.revocationDate) return null;
  const originalTransactionId = String(info.originalTransactionId || info.transactionId || '');
  if (!originalTransactionId) return null;
  return { productId: info.productId, originalTransactionId };
}

// ─── Google Play 구독 검증 ──────────────────────────────────────────────
// 서비스 계정 키로 RS256 JWT를 만들어 androidpublisher 액세스 토큰을 받는다.
async function createGooglePlayToken(env, fetchImpl = fetch, nowMs = Date.now()) {
  if (!env.GOOGLE_PLAY_SA_EMAIL || !env.GOOGLE_PLAY_SA_PRIVATE_KEY) {
    throw new Error('Missing Google Play credentials');
  }
  const now = Math.floor(nowMs / 1000);
  const header = utf8Base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = utf8Base64Url(JSON.stringify({
    iss: env.GOOGLE_PLAY_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 300,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(env.GOOGLE_PLAY_SA_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  ));
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${payload}.${base64UrlEncode(signature)}`,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Google token request failed (${response.status})`);
  const body = await response.json();
  if (!body.access_token) throw new Error('Google token missing');
  return body.access_token;
}

async function fetchProductPurchaseFromGoogle(env, purchaseToken, fetchImpl = fetch) {
  const token = await createGooglePlayToken(env, fetchImpl);
  const url = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
    + `${ANDROID_PACKAGE_NAME}/purchases/products/${encodeURIComponent(LIFETIME_PRODUCT_ID)}`
    + `/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Google verification failed (${response.status})`);
  return response.json();
}

// purchaseState 0=구매 완료, 1=취소, 2=보류. 취소·보류는 권한을 주지 않는다.
export function selectGoogleLifetimePurchase(body) {
  if (Number(body?.purchaseState) !== 0) return null;
  const orderId = String(body?.orderId || '');
  if (!orderId) return null;
  // purchaseType 0=테스트 구매(라이선스 테스터), 1=프로모션, 2=리워드
  return {
    productId: LIFETIME_PRODUCT_ID,
    originalTransactionId: orderId,
    testPurchase: Number(body?.purchaseType) === 0,
  };
}

// iOS는 숫자 거래번호, Android는 Play 구매 토큰을 보낸다.
export function parsePurchaseRequest(body) {
  const purchaseToken = typeof body?.purchaseToken === 'string' ? body.purchaseToken.trim() : '';
  if (purchaseToken) {
    return /^[A-Za-z0-9._~-]{20,512}$/.test(purchaseToken) ? { platform: 'android', purchaseToken } : null;
  }
  const transactionId = typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
  return /^\d{6,32}$/.test(transactionId) ? { platform: 'ios', transactionId } : null;
}

async function verifyAndStorePurchase(env, uid, purchase, fetchImpl) {
  if (!env.BILLING_DB) throw new Error('Billing database unavailable');
  let productId;
  let originalTransactionId;
  let environment;
  if (purchase.platform === 'android') {
    const verified = selectGoogleLifetimePurchase(
      await fetchProductPurchaseFromGoogle(env, purchase.purchaseToken, fetchImpl));
    if (!verified) throw new Error('Purchase not found');
    productId = verified.productId;
    originalTransactionId = verified.originalTransactionId;
    environment = verified.testPurchase ? 'Sandbox' : 'Production';
  } else {
    const verified = await fetchTransactionFromApple(env, purchase.transactionId, fetchImpl);
    const purchased = selectAppleLifetimePurchase(verified.body);
    if (!purchased) throw new Error('Purchase not found');
    productId = purchased.productId;
    originalTransactionId = purchased.originalTransactionId;
    environment = verified.environment;
  }
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
    productId,
    originalTransactionId,
    LIFETIME_EXPIRES_AT,
    environment,
    Date.now(),
  ).run();
  return readBillingStatus(env, uid);
}

function bearerToken(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

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


// 가져오기 대상 기간(오늘 ±5일)을 'YYYY-MM-DD' 문자열로 반환.
// 날짜 문자열끼리 비교하므로 시:분 차이로 경계일이 잘려나가지 않는다.
// Workers 런타임은 UTC라 KST 00~09시에는 하루 전 날짜가 나온다.
// 로스터 날짜는 한국 날짜 기준이므로 +9시간으로 맞춘 뒤 자른다.
export function rosterWindow(now = new Date(), days = 5) {
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const toStr = ms => new Date(ms + KST_OFFSET).toISOString().slice(0, 10);
  const dayMs = 24 * 60 * 60 * 1000;
  return { start: toStr(now.getTime() - days * dayMs), end: toStr(now.getTime() + days * dayMs) };
}

// ─── PDC CrewConnex 앱 백엔드 (crewconnexapp.jejuair.net, JSON-RPC 2.0) ──────
// roster.aspx(웹)와 다른 백엔드. 웹엔 없는 air flighttime(계기시간)·blockhours가 여기 있다.
// 모든 호출은 POST /pdccrew2, body {method, jsonrpc:"2.0", id, params}.
// 인증은 login으로 받은 JWT를 params.authentication 에 실어 보낸다(OpenID·인증서 불필요).
// 전체 API 맵은 메모리 crewconnex-app-api 참고.
const PDC_BASE = 'https://crewconnexapp.jejuair.net';
const PDC_RPC  = `${PDC_BASE}/pdccrew2`;

let _pdcRpcId = 0;

// JWT payload의 sub(=crewCode, 본인 한글 이름)를 UTF-8로 안전하게 꺼낸다.
// atob만 쓰면 한글이 깨져 서버가 'not a valid crewmember'를 돌려준다.
export function pdcCrewCodeFromToken(token) {
  const part = String(token || '').split('.')[1] || '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  return payload.sub || '';
}

async function pdcRpc(method, params, auth, fetchImpl = fetch) {
  _pdcRpcId += 1;
  const body = { method, jsonrpc: '2.0', id: String(_pdcRpcId), params: { ...params, timeOutput: 'iso' } };
  if (auth) body.params.authentication = auth;
  const res = await fetchImpl(PDC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json && json.error) {
    const e = new Error(String(json.error.message || json.error.code || 'RPC error'));
    e.pdcCode = json.error.code;
    throw e;
  }
  let result = json ? json.result : null;
  if (typeof result === 'string') { try { result = JSON.parse(result); } catch (_) {} }
  // 실패는 result에 {code,message}로 오기도 한다(성공 응답엔 result:"OK"만 있고 code는 없다).
  if (result && typeof result === 'object' && !Array.isArray(result)
      && 'code' in result && 'message' in result) {
    const e = new Error(String(result.message));
    e.pdcCode = result.code;
    throw e;
  }
  return result;
}

async function pdcLogin(username, password, fetchImpl = fetch) {
  const result = await pdcRpc('login', { username, password, crewmemberLogin: true }, null, fetchImpl);
  const auth = result && result.authentication;
  if (!auth) {
    const e = new Error('PDC_NO_TOKEN');
    e.pdcLoginFailed = true;
    throw e;
  }
  return { auth, crewCode: pdcCrewCodeFromToken(auth) };
}

// "ICN-KIX 7C 1303" → { from:'ICN', to:'KIX', flight:'7C1303' }
function parsePdcActivityId(id) {
  const m = String(id || '').match(/^([A-Z]{3})-([A-Z]{3})\s+(.+)$/);
  if (!m) return null;
  return { from: m[1], to: m[2], flight: m[3].replace(/\s+/g, '').toUpperCase() };
}

function pdcNamed(list, label) {
  const e = (list || []).find(x => x && x.label === label);
  return e ? String(e.val == null ? '' : e.val).trim() : '';
}

// {base,local,utc} 시각에서 local "HH:MM"만 꺼낸다. (local은 "2026-11-04T09:02Z" 형태)
function pdcLocalTime(t) {
  const m = ((t && t.local) || '').match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

// air flight time(H:MM) → 계기시간. "그 값보다 작은 가장 큰 5의 배수"로 내린다.
// 28분→25, 29분→25(5 미만은 내림), 25분→20, 30분→25(5의 배수는 -5), 1:00(60분)→0:55.
export function instrumentTimeFromFlightTime(hmm) {
  const m = String(hmm || '').match(/^(\d+):([0-5]\d)$/);
  if (!m) return '';
  const total = Number(m[1]) * 60 + Number(m[2]);
  if (total <= 0) return '';
  const rounded = Math.floor((total - 1) / 5) * 5;   // 경계값(5의 배수)은 한 칸 아래로 떨어진다
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

// 앱 직책 라벨을 roster.aspx 파서가 쓰는 표기로 정규화 → 기존 posToDuty가 그대로 처리한다.
function normPdcPos(pos) {
  const p = String(pos || '').trim();
  if (/^Capt/i.test(p) || /^SFO$/i.test(p)) return 'Capt';   // "Capt (PIC)"·SFO → Capt (기존과 동일)
  if (/^3(PC|NC)$/i.test(p)) return p.toUpperCase();
  if (/^3(F|FO)$/i.test(p)) return '3F';
  return p;                                                   // FO/PUR/JC1/FA/MECH 등은 그대로
}

// NG(737-800) 전체 기번. 제주항공 운항기술팀 Aircraft Specifications(2026-08-13 기준).
// 제주항공 NG는 더 늘지 않으며, 이 목록 밖 기번은 전부 MAX(737-8)다.
const PDC_NG_REGS = new Set([
  'HL7213', 'HL8031', 'HL8032', 'HL8034', 'HL8050', 'HL8051', 'HL8061', 'HL8062', 'HL8063', 'HL8064',
  'HL8087', 'HL8089', 'HL8090', 'HL8295', 'HL8301', 'HL8302', 'HL8303', 'HL8304', 'HL8305', 'HL8321',
  'HL8322', 'HL8331', 'HL8332', 'HL8333', 'HL8334', 'HL8335', 'HL8336', 'HL8337', 'HL8339', 'HL8527', 'HL8539',
]);
// pdc는 편대번호(보통 기번 뒤 3자리, 예 "593")만 준다. NG 역조회용 last3 → 전체 기번 맵.
// MAX는 전부 HL8xxx라 뒤 3자리로 복원되지만, NG에는 HL7213처럼 HL8이 아닌 예외가 있어 맵이 필요하다.
const PDC_NG_BY_LAST3 = new Map([...PDC_NG_REGS].map(r => [r.slice(-3), r]));

// 편대번호 → 전체 기번(HL####). "593"→HL8593, "031"→HL8031, "213"→HL7213(NG 예외).
export function pdcReg(fleetNo) {
  const s = String(fleetNo || '').trim().toUpperCase();
  if (/^HL\d{4}$/.test(s)) return s;                       // 이미 전체 기번
  const m = s.match(/^(\d{3,4})$/);
  if (!m) return s;                                        // 숫자 형태가 아니면 원본 유지
  if (m[1].length === 4) return `HL${m[1]}`;              // 전체 숫자면 HL 접두
  return PDC_NG_BY_LAST3.get(m[1]) || `HL8${m[1]}`;       // 3자리: NG 역조회, 없으면 HL8(=MAX)
}

export function pdcAcType(reg) {
  return PDC_NG_REGS.has(String(reg || '').toUpperCase()) ? 'B737-800' : 'B737-8';
}

// getDutyInfo 결과 → 비행 배열(기존 shape + flightTime). 순수 함수(테스트용).
export function parsePdcDutyInfo(info) {
  const flights = [];
  const acts = (info && info.activityInfoList) || [];
  const crewList = (((info && info.crewInfoList) || [])[0] || {}).crewList || [];
  const crew = crewList.map(m => {
    const ni = m.namedInfoList || [];
    return { position: normPdcPos(pdcNamed(ni, 'Pos')), empNo: pdcNamed(ni, 'Emp. No'), name: pdcNamed(ni, 'CrewCode') };
  }).filter(c => c.empNo || c.name);

  for (const a of acts) {
    if (a.blockType !== 'FDP') continue;                 // 지상(GND)·휴식(HTL) 등 제외
    const route = parsePdcActivityId(a.activityIdentification);
    if (!route) continue;                                // 비행 leg만 (MED 등 제외)
    const ni = a.namedInfoList || [];
    const reg = pdcReg(pdcNamed(ni, 'AcReg') || a.aircraftReg);  // 편대번호 → 전체 기번
    flights.push({
      date: ((a.start && a.start.local) || '').slice(0, 10),
      flight: route.flight,
      from: a.fromStation || route.from,
      to: a.toStation || route.to,
      stdLocal: pdcLocalTime(a.start),
      staLocal: pdcLocalTime(a.end),
      acType: pdcAcType(reg),                            // NG 목록 밖이면 MAX(B737-8)
      acReg: reg,
      blh: pdcNamed(ni, 'blockhours'),
      flightTime: pdcNamed(ni, 'flighttime'),            // ← 계기시간 소스(웹엔 없던 데이터)
      instrumentTime: instrumentTimeFromFlightTime(pdcNamed(ni, 'flighttime')),  // 5분 내림
      crew,
    });
  }
  return flights;
}

// 앱 백엔드로 로스터(오늘 ±5일) + 비행별 flighttime 가져오기. 기존 {flights, crew} shape 반환.
export async function fetchPdcRoster(username, password, fetchImpl = fetch, now = new Date()) {
  const { auth, crewCode } = await pdcLogin(username, password, fetchImpl);
  const { start, end } = rosterWindow(now);
  const cal = await pdcRpc('getCalendarBlocks',
    { crewCode, dayDefinition: 'Base', blockType: 'PerDay', from: start, to: end }, auth, fetchImpl);
  const blocks = (cal && cal.calendarBlocks) || [];
  const dutyIds = [...new Set(blocks
    .filter(b => b.blockType === 'FDP' && /^fdp\(/.test(b.dutyId || '') && /-/.test(b.label1 || ''))
    .map(b => b.dutyId))];

  let flights = [];
  for (const dutyId of dutyIds) {
    const info = await pdcRpc('getDutyInfo', { dutyId }, auth, fetchImpl);
    flights = flights.concat(parsePdcDutyInfo(info));
  }
  // rosterWindow 범위(날짜 문자열)로 거른다 — getCalendarBlocks가 이미 한정하지만 leg가 걸칠 수 있다.
  flights = flights.filter(f => f.date >= start && f.date <= end);
  const crew = flights.find(f => f.crew && f.crew.length > 0)?.crew || [];
  return { flights, crew };
}

// ─── Cloudflare Workers 핸들러 (Netlify와 다른 부분) ───────────────────────
export async function handleRequest(request, env = {}, dependencies = {}) {
    const origin = request.headers.get('origin') || '';
    const cors = responseHeaders(origin);
    let verifiedUser;
    let username;
    const ok = async body => {
      const mapped = applyDutyCode(body, username);
      const billing = verifiedUser ? await readBillingStatus(env, verifiedUser.uid, verifiedUser.email) : null;
      return new Response(JSON.stringify({ ...mapped, billing }), {
      status: 200,
      headers: cors,
      });
    };
    const fail = (status, error, code) => new Response(JSON.stringify({ error, code }), {
      status,
      headers: cors,
    });

    if (!isAllowedOrigin(origin)) {
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
        return new Response(JSON.stringify(await readBillingStatus(env, verifiedUser.uid, verifiedUser.email)), { status: 200, headers: cors });
      } catch (_) {
        return fail(503, '이용권 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'BILLING_UNAVAILABLE');
      }
    }

    if (isBillingVerify) {
      let body;
      try { body = await request.json(); } catch (_) { return fail(400, '잘못된 요청입니다.', 'INVALID_REQUEST'); }
      const purchase = parsePurchaseRequest(body);
      if (!purchase) return fail(400, '구매 정보를 확인할 수 없습니다.', 'INVALID_TRANSACTION');
      try {
        const status = await verifyAndStorePurchase(env, verifiedUser.uid, purchase, dependencies.fetchImpl || fetch);
        return new Response(JSON.stringify(status), { status: 200, headers: cors });
      } catch (_) {
        return fail(400, '구매 내역을 확인하지 못했습니다. 스토어 계정을 확인해 주세요.', 'PURCHASE_NOT_FOUND');
      }
    }

    if (isBillingImports) {
      let body;
      try { body = await request.json(); } catch (_) { return fail(400, '잘못된 요청입니다.', 'INVALID_REQUEST'); }
      const flights = Array.isArray(body?.flights) ? body.flights.slice(0, 20) : [];
      if (!flights.length) return fail(400, '저장된 비행 정보가 없습니다.', 'INVALID_REQUEST');
      try {
        await recordAutoImportFlights(env, verifiedUser.uid, flights);
        return new Response(JSON.stringify(await readBillingStatus(env, verifiedUser.uid, verifiedUser.email)), { status: 200, headers: cors });
      } catch (_) {
        return fail(503, '자동 가져오기 사용량을 저장하지 못했습니다.', 'BILLING_UNAVAILABLE');
      }
    }

    let currentBilling;
    try {
      currentBilling = await readBillingStatus(env, verifiedUser.uid, verifiedUser.email);
    } catch (_) {
      if (billingEnforced(env)) return fail(503, '이용권 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'BILLING_UNAVAILABLE');
    }
    if (billingEnforced(env) && !currentBilling?.active && currentBilling?.remaining <= 0) {
      return fail(402, `무료 자동 가져오기 ${AUTO_IMPORT_FREE_LIMIT}편을 모두 사용했습니다. 평생 이용권을 구매하면 무제한으로 이용할 수 있습니다.`, 'FREE_LIMIT_REACHED');
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

    // CrewConnex 앱 백엔드(pdccrew2)로 가져오기 — flighttime(계기시간) 포함. 단일 백엔드.
    try {
      const parsed = await fetchPdcRoster(username, password);
      if (parsed.flights.length > 0) return ok(parsed);
      return fail(404, '로그인 성공, 최근 5일 이내 비행을 찾을 수 없습니다.', 'NO_RECENT_FLIGHTS');
    } catch (e) {
      if (e && (e.pdcLoginFailed || e.pdcCode === 401 || /login|password|crewmember|자격|인증/i.test(e.message || ''))) {
        return fail(401, 'CrewConnex 로그인 실패 — 아이디/비밀번호를 확인해 주세요.', 'CREWCONNEX_LOGIN_FAILED');
      }
      console.log('[PDC_ERROR] ' + String((e && e.message) || e).slice(0, 160));
      return fail(502, 'CrewConnex 연결 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'UPSTREAM_ERROR');
    }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

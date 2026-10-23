import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDutyCode,
  autoImportFlightKey,
  handleRequest,
  parseRosterHtml,
  parsePurchaseRequest,
  selectActiveAppleSubscription,
  selectActiveGoogleSubscription,
  verifyFirebaseIdToken,
} from './crewconnex.js';

function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function derLength(length) {
  if (length < 128) return Uint8Array.of(length);
  const bytes = [];
  for (let value = length; value; value >>= 8) bytes.unshift(value & 0xff);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function der(tag, ...parts) {
  const content = concat(...parts);
  return concat(Uint8Array.of(tag), derLength(content.length), content);
}

function certificatePemFromSpki(spki) {
  const integer = value => der(0x02, Uint8Array.of(value));
  const emptySequence = der(0x30);
  const version = der(0xa0, integer(2));
  const tbs = der(
    0x30,
    version,
    integer(1),
    emptySequence,
    emptySequence,
    emptySequence,
    emptySequence,
    spki,
  );
  const certificate = der(0x30, tbs, emptySequence, der(0x03, Uint8Array.of(0)));
  const base64 = Buffer.from(certificate).toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----`;
}

function base64Url(value) {
  const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
  return bytes.toString('base64url');
}

async function signedToken(privateKey, payload, kid = 'test-key') {
  const header = base64Url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64Url(signature)}`;
}

test('Firebase token verification checks RS256 signature and required claims', async () => {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
  const certificate = certificatePemFromSpki(spki);
  const projectId = 'pilot-logbook-22bb8';
  const now = 1_800_000_000;
  const claims = {
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: 'firebase-user-1',
    exp: now + 3600,
    iat: now - 30,
    auth_time: now - 60,
  };
  const token = await signedToken(keys.privateKey, claims);
  const verified = await verifyFirebaseIdToken(token, projectId, {
    certificates: { 'test-key': certificate },
    nowMs: now * 1000,
  });
  assert.equal(verified.uid, claims.sub);

  const tokenParts = token.split('.');
  const changedSignature = Buffer.from(tokenParts[2], 'base64url');
  changedSignature[0] ^= 0x01;
  const tampered = `${tokenParts[0]}.${tokenParts[1]}.${changedSignature.toString('base64url')}`;
  await assert.rejects(() => verifyFirebaseIdToken(tampered, projectId, {
    certificates: { 'test-key': certificate },
    nowMs: now * 1000,
  }));

  const wrongProjectToken = await signedToken(keys.privateKey, { ...claims, aud: 'other-project' });
  await assert.rejects(() => verifyFirebaseIdToken(wrongProjectToken, projectId, {
    certificates: { 'test-key': certificate },
    nowMs: now * 1000,
  }));
});

test('Worker rejects blocked origins, missing login tokens, and repeated requests', async () => {
  const blocked = await handleRequest(new Request('https://worker.example', {
    method: 'POST',
    headers: { Origin: 'https://attacker.example' },
  }));
  assert.equal(blocked.status, 403);

  const preflight = await handleRequest(new Request('https://worker.example', {
    method: 'OPTIONS',
    headers: { Origin: 'capacitor://localhost' },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);

  const unauthenticated = await handleRequest(new Request('https://worker.example', {
    method: 'POST',
    headers: { Origin: 'https://rufnek737.github.io' },
  }));
  assert.equal(unauthenticated.status, 401);

  const rateLimited = await handleRequest(new Request('https://worker.example', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify({ username: 'pilot', password: 'secret' }),
  }), {
    FIREBASE_PROJECT_ID: 'pilot-logbook-22bb8',
    CREWCONNEX_RATE_LIMITER: { limit: async () => ({ success: false }) },
  }, {
    verifyToken: async () => ({ uid: 'firebase-user-1' }),
  });
  assert.equal(rateLimited.status, 429);
});

test('Roster parsing and automatic crew duty mapping remain unchanged', () => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const html = `
    <table>
      <tr><th>Date</th><th>Remark</th><th>From</th><th>To</th><th>STD(L)</th><th>STA(L)</th><th>AC</th><th>BLH</th><th>AC Reg</th><th>Crew</th></tr>
      <tr><td>${day}</td><td>7C123</td><td>CJU</td><td>GMP</td><td>0700</td><td>0810</td><td>7M8</td><td>0110</td><td>HL8501</td><td>3PC 1234567 홍길동</td></tr>
    </table>`;
  const parsed = parseRosterHtml(html);
  assert.equal(parsed.flights.length, 1);
  assert.equal(parsed.flights[0].flight, '7C123');
  assert.equal(parsed.flights[0].acType, '-8 MAX');
  assert.equal(parsed.flights[0].crew[0].name, '홍길동');

  const withDuty = applyDutyCode(parsed, '홍길동');
  assert.equal(withDuty.flights[0].dutyCode, '3PC');
  assert.equal(withDuty.flights[0].role, 'PIC');
});

test('Automatic import usage key is stable and identifies a unique flight', () => {
  assert.equal(autoImportFlightKey({
    date: '2026-08-23', flight: '7c101', from: 'icn', to: 'cju',
  }), '2026-08-23|7C101|ICN|CJU');
  assert.notEqual(
    autoImportFlightKey({ date: '2026-08-23', flight: '7C101', from: 'ICN', to: 'CJU' }),
    autoImportFlightKey({ date: '2026-08-24', flight: '7C101', from: 'ICN', to: 'CJU' }),
  );
});

test('Apple subscription selection only accepts active 날고적고 products', () => {
  const now = Date.now();
  const jws = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
  const active = selectActiveAppleSubscription({
    data: [{
      status: 1,
      lastTransactions: [{ signedTransactionInfo: jws({
        bundleId: 'com.rufnekcrew.flylog',
        productId: 'com.rufnekcrew.flylog.autoimport.annual',
        transactionId: '200000000000001',
        originalTransactionId: '200000000000000',
        expiresDate: now + 86_400_000,
      }) }],
    }],
  }, now);
  assert.equal(active.productId, 'com.rufnekcrew.flylog.autoimport.annual');

  const expired = selectActiveAppleSubscription({
    data: [{ status: 1, lastTransactions: [{ signedTransactionInfo: jws({
      bundleId: 'com.rufnekcrew.flylog',
      productId: 'com.rufnekcrew.flylog.autoimport.monthly',
      expiresDate: now - 1,
    }) }] }],
  }, now);
  assert.equal(expired, null);

  const otherApp = selectActiveAppleSubscription({
    data: [{ status: 1, lastTransactions: [{ signedTransactionInfo: jws({
      bundleId: 'com.example.other',
      productId: 'com.rufnekcrew.flylog.autoimport.monthly',
      expiresDate: now + 86_400_000,
    }) }] }],
  }, now);
  assert.equal(otherApp, null);
});

test('Google Play subscription selection accepts active and cancelled-but-unexpired purchases', () => {
  const now = Date.now();
  const future = new Date(now + 86_400_000).toISOString();

  const active = selectActiveGoogleSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    latestOrderId: 'GPA.1234-5678-9012-34567..3',
    lineItems: [{ productId: 'com.rufnekcrew.flylog.autoimport.annual', expiryTime: future }],
  }, now);
  assert.equal(active.productId, 'com.rufnekcrew.flylog.autoimport.annual');
  // 갱신 때마다 바뀌는 ..N 꼬리를 떼어 구독 식별자를 안정적으로 유지한다
  assert.equal(active.originalTransactionId, 'GPA.1234-5678-9012-34567');

  // 해지 예약 상태라도 만료 전까지는 이용할 수 있어야 한다
  assert.ok(selectActiveGoogleSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    latestOrderId: 'GPA.1111-2222-3333-44444',
    lineItems: [{ productId: 'com.rufnekcrew.flylog.autoimport.monthly', expiryTime: future }],
  }, now));

  assert.equal(selectActiveGoogleSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
    lineItems: [{ productId: 'com.rufnekcrew.flylog.autoimport.monthly', expiryTime: future }],
  }, now), null);

  assert.equal(selectActiveGoogleSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    lineItems: [{ productId: 'com.rufnekcrew.flylog.autoimport.monthly', expiryTime: new Date(now - 1).toISOString() }],
  }, now), null);

  assert.equal(selectActiveGoogleSubscription({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    lineItems: [{ productId: 'com.example.other.monthly', expiryTime: future }],
  }, now), null);
});

test('purchase requests are routed to the right store', () => {
  assert.deepEqual(parsePurchaseRequest({ transactionId: '200000000000001' }),
    { platform: 'ios', transactionId: '200000000000001' });
  assert.deepEqual(parsePurchaseRequest({ purchaseToken: 'abcdefghijklmnopqrstuvwxyz.AO-J1Ox_token-value' }),
    { platform: 'android', purchaseToken: 'abcdefghijklmnopqrstuvwxyz.AO-J1Ox_token-value' });
  assert.equal(parsePurchaseRequest({ purchaseToken: 'too-short' }), null);
  assert.equal(parsePurchaseRequest({ transactionId: 'not-a-number' }), null);
  assert.equal(parsePurchaseRequest({}), null);
});

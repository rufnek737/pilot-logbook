import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDutyCode,
  autoImportFlightKey,
  fetchPdcRoster,
  instrumentTimeFromFlightTime,
  handleRequest,
  parsePdcDutyInfo,
  pdcAcType,
  pdcCrewCodeFromToken,
  pdcReg,
  parsePurchaseRequest,
  selectAppleLifetimePurchase,
  selectGoogleLifetimePurchase,
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

test('Automatic import usage key is stable and identifies a unique flight', () => {
  assert.equal(autoImportFlightKey({
    date: '2026-08-23', flight: '7c101', from: 'icn', to: 'cju',
  }), '2026-08-23|7C101|ICN|CJU');
  assert.notEqual(
    autoImportFlightKey({ date: '2026-08-23', flight: '7C101', from: 'ICN', to: 'CJU' }),
    autoImportFlightKey({ date: '2026-08-24', flight: '7C101', from: 'ICN', to: 'CJU' }),
  );
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

test('Apple lifetime purchase is accepted only for this app and product', () => {
  const jws = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
  const base = {
    bundleId: 'com.rufnekcrew.flylog',
    productId: 'com.rufnekcrew.flylog.autoimport.lifetime',
    transactionId: '200000000000001',
    originalTransactionId: '200000000000000',
  };

  const ok = selectAppleLifetimePurchase({ signedTransactionInfo: jws(base) });
  assert.equal(ok.productId, 'com.rufnekcrew.flylog.autoimport.lifetime');
  // 갱신이 없으므로 originalTransactionId가 영구 식별자다
  assert.equal(ok.originalTransactionId, '200000000000000');

  // 환불된 거래는 권한을 주지 않는다
  assert.equal(selectAppleLifetimePurchase({
    signedTransactionInfo: jws({ ...base, revocationDate: Date.now() }),
  }), null);

  assert.equal(selectAppleLifetimePurchase({
    signedTransactionInfo: jws({ ...base, productId: 'com.rufnekcrew.flylog.autoimport.monthly' }),
  }), null);

  assert.equal(selectAppleLifetimePurchase({
    signedTransactionInfo: jws({ ...base, bundleId: 'com.example.other' }),
  }), null);

  assert.equal(selectAppleLifetimePurchase({ signedTransactionInfo: 'not-a-jws' }), null);
});

test('Google lifetime purchase requires a completed purchase state', () => {
  const ok = selectGoogleLifetimePurchase({ purchaseState: 0, orderId: 'GPA.1234-5678-9012-34567' });
  assert.equal(ok.originalTransactionId, 'GPA.1234-5678-9012-34567');
  assert.equal(ok.productId, 'com.rufnekcrew.flylog.autoimport.lifetime');
  assert.equal(ok.testPurchase, false);

  // 라이선스 테스터 구매는 Sandbox로 기록한다
  assert.equal(selectGoogleLifetimePurchase({
    purchaseState: 0, orderId: 'GPA.1111', purchaseType: 0,
  }).testPurchase, true);

  // 1=취소, 2=보류
  assert.equal(selectGoogleLifetimePurchase({ purchaseState: 1, orderId: 'GPA.1111' }), null);
  assert.equal(selectGoogleLifetimePurchase({ purchaseState: 2, orderId: 'GPA.1111' }), null);
  assert.equal(selectGoogleLifetimePurchase({ purchaseState: 0 }), null);
});

// ─── PDC CrewConnex 앱 백엔드(pdccrew2) 파싱 ───────────────────────────────
// 실데이터 구조를 익명화한 fixture(동료 개인정보 제외). 실제 응답으로 라이브 검증 후 작성.

// JWT(HS256 아님, 서명 무의미 — sub만 읽으므로) — sub은 한글 crewCode. UTF-8 디코드 확인용.
function fakePdcToken(sub) {
  const b64url = obj => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub, scope: 'app', user_type: 'c' })}.sig`;
}

// getDutyInfo 응답 1건(2 leg 왕복, 둘 다 비행 완료라 flighttime 존재)
function dutyInfoFixture() {
  return {
    activityInfoList: [
      {
        activityIdentification: 'ICN-KIX 7C 1303', aircraftReg: '553', blockType: 'FDP',
        dutyCode: '7C 1303', fromStation: 'ICN', toStation: 'KIX',
        start: { local: '2026-11-04T09:02Z' }, end: { local: '2026-11-04T11:04Z' },
        namedInfoList: [
          { label: 'AcReg', val: '553' }, { label: 'Turn Time', val: '0:46' },
          { label: 'blockhours', val: '2:02' }, { label: 'flighttime', val: '1:28' },
        ],
      },
      {
        activityIdentification: 'KIX-ICN 7C 1304', aircraftReg: '553', blockType: 'FDP',
        dutyCode: '7C 1304', fromStation: 'KIX', toStation: 'ICN',
        start: { local: '2026-11-04T11:50Z' }, end: { local: '2026-11-04T13:41Z' },
        namedInfoList: [
          { label: 'AcReg', val: '553' },
          { label: 'blockhours', val: '1:51' }, { label: 'flighttime', val: '1:30' },
        ],
      },
    ],
    crewInfoList: [{
      crewList: [
        { fullName: 'TESTER, PILOT', namedInfoList: [
          { label: 'CrewCode', val: '홍길동' }, { label: 'Emp. No', val: '1700001' }, { label: 'Pos', val: 'Capt (PIC)' },
        ]},
        { fullName: 'TESTER, FIRST', namedInfoList: [
          { label: 'CrewCode', val: '김부기' }, { label: 'Emp. No', val: '1800002' }, { label: 'Pos', val: 'FO' },
        ]},
      ],
    }],
    result: 'OK',
  };
}

test('PDC: JWT sub(한글 crewCode)를 UTF-8로 올바르게 디코드한다', () => {
  assert.equal(pdcCrewCodeFromToken(fakePdcToken('강경태')), '강경태');
});

test('PDC: getDutyInfo를 기존 비행 shape + flightTime으로 파싱한다', () => {
  const flights = parsePdcDutyInfo(dutyInfoFixture());
  assert.equal(flights.length, 2);

  const out = flights[0];
  assert.equal(out.date, '2026-11-04');
  assert.equal(out.flight, '7C1303');
  assert.equal(out.from, 'ICN');
  assert.equal(out.to, 'KIX');
  assert.equal(out.stdLocal, '09:02');
  assert.equal(out.staLocal, '11:04');
  assert.equal(out.blh, '2:02');
  assert.equal(out.flightTime, '1:28');        // ← 웹엔 없던 계기시간
  assert.equal(flights[1].flightTime, '1:30');
  assert.equal(out.acReg, 'HL8553');   // 편대번호 553 → 전체 기번 HL8553
  assert.equal(out.acType, 'B737-8');  // NG 목록 밖 → MAX

  // 승무원 직책이 기존 posToDuty가 읽는 표기로 정규화된다
  assert.equal(out.crew[0].name, '홍길동');
  assert.equal(out.crew[0].position, 'Capt');  // "Capt (PIC)" → Capt
  assert.equal(out.crew[1].position, 'FO');
});

test('PDC: 지상근무(GND)/비행 아닌 leg는 비행으로 집계하지 않는다', () => {
  const ground = {
    activityInfoList: [{
      activityIdentification: '', blockType: 'GND', dutyCode: 'MED',
      fromStation: 'GMP', toStation: 'GMP', start: { local: '2026-11-07T09:00Z' }, end: { local: '2026-11-07T18:00Z' },
      namedInfoList: [{ label: 'Activity Type', val: 'Physical Examination' }],
    }],
    crewInfoList: [{ crewList: [] }],
  };
  assert.equal(parsePdcDutyInfo(ground).length, 0);
});

test('PDC: applyDutyCode가 앱 crew에서 본인 직책으로 PIC/SIC를 채운다', () => {
  const result = { flights: parsePdcDutyInfo(dutyInfoFixture()), crew: [] };
  const withDuty = applyDutyCode(result, '홍길동');
  assert.equal(withDuty.flights[0].dutyCode, 'C');
  assert.equal(withDuty.flights[0].role, 'PIC');
  assert.equal(withDuty.flights[0].flightTime, '1:28');  // flightTime은 그대로 보존
});

test('PDC: 로그인→getCalendarBlocks→getDutyInfo 오케스트레이션(중복 제거·창 필터)', async () => {
  const token = fakePdcToken('홍길동');
  const calendar = {
    calendarBlocks: [
      // 비행(FDP) — 수집 대상
      { blockType: 'FDP', dutyId: 'fdp(1001)', day: '2026-11-04', label1: ' ICN-KIX-ICN' },
      // 멀티데이 비행이 continuation으로 두 번 나와도 dutyId로 중복 제거
      { blockType: 'FDP', dutyId: 'fdp(1002)', day: '2026-11-05', label1: ' ICN-DPS' },
      { blockType: 'FDP', dutyId: 'fdp(1002)', day: '2026-11-06', label1: ' ICN-DPS' },
      // 비행 아님 — 제외
      { blockType: 'OFF', dutyId: 'cra(2001)', day: '2026-11-03', label1: 'OFF' },
      { blockType: 'GND', dutyId: 'fdp(3001)', day: '2026-11-07', label1: 'MED' },   // 대시 없음
    ],
    from: '2026-10-30', to: '2026-11-09', result: 'OK',
  };
  const duties = {
    'fdp(1001)': dutyInfoFixture(),  // 11-04 왕복 2편
    'fdp(1002)': {
      activityInfoList: [{
        activityIdentification: 'ICN-DPS 7C 5303', aircraftReg: '821', blockType: 'FDP',
        fromStation: 'ICN', toStation: 'DPS',
        start: { local: '2026-11-05T13:00Z' }, end: { local: '2026-11-05T20:10Z' },
        namedInfoList: [{ label: 'blockhours', val: '7:10' }, { label: 'flighttime', val: '6:52' }],
      }],
      crewInfoList: [{ crewList: [] }],
    },
  };
  const calls = [];
  const fakeFetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body.method);
    let result;
    if (body.method === 'login') result = { authentication: token };
    else if (body.method === 'getCalendarBlocks') result = calendar;
    else if (body.method === 'getDutyInfo') result = duties[body.params.dutyId];
    else result = { code: 404, message: 'unexpected' };
    return { json: async () => ({ jsonrpc: '2.0', result }) };
  };

  const now = new Date('2026-11-04T06:00:00Z');   // 창 = 10-30 ~ 11-09, 결정적
  const { flights, crew } = await fetchPdcRoster('홍길동', 'pw', fakeFetch, now);

  assert.deepEqual(calls, ['login', 'getCalendarBlocks', 'getDutyInfo', 'getDutyInfo']); // 중복 fdp(1002) 1회만
  assert.equal(flights.length, 3);                 // 1303, 1304, 5303
  assert.deepEqual(flights.map(f => f.flight), ['7C1303', '7C1304', '7C5303']);
  assert.equal(flights[2].flightTime, '6:52');
  assert.equal(crew[0].name, '홍길동');
});

test('PDC: 로그인 응답에 토큰이 없으면 로그인 실패로 처리한다', async () => {
  const fakeFetch = async () => ({ json: async () => ({ result: {} }) });
  await assert.rejects(() => fetchPdcRoster('u', 'p', fakeFetch, new Date('2026-11-04')),
    err => err && err.pdcLoginFailed === true);
});

test('PDC: 계기시간은 air flight time을 5분 미만으로 내리되 경계값은 -5한다', () => {
  // 사용자 규칙: 그 값보다 작은 가장 큰 5의 배수
  assert.equal(instrumentTimeFromFlightTime('1:28'), '1:25');  // 28→25
  assert.equal(instrumentTimeFromFlightTime('1:29'), '1:25');  // 29→25
  assert.equal(instrumentTimeFromFlightTime('1:30'), '1:25');  // 30(배수)→25
  assert.equal(instrumentTimeFromFlightTime('1:25'), '1:20');  // 25(배수)→20
  assert.equal(instrumentTimeFromFlightTime('1:26'), '1:25');  // 26→25
  assert.equal(instrumentTimeFromFlightTime('2:00'), '1:55');  // 60(배수)→55, 시 경계 넘김
  assert.equal(instrumentTimeFromFlightTime('6:52'), '6:50');  // 52→50
  assert.equal(instrumentTimeFromFlightTime(''), '');
  assert.equal(instrumentTimeFromFlightTime('bad'), '');
});

test('PDC: 파싱 결과에 계기시간(instrumentTime)이 함께 채워진다', () => {
  const flights = parsePdcDutyInfo(dutyInfoFixture());
  assert.equal(flights[0].flightTime, '1:28');
  assert.equal(flights[0].instrumentTime, '1:25');
  assert.equal(flights[1].flightTime, '1:30');
  assert.equal(flights[1].instrumentTime, '1:25');
});

test('PDC: 편대번호→전체 기번 복원 + NG 목록 역조회로 기종 판정', () => {
  // MAX(HL8xxx, NG 목록 밖): HL8 접두로 복원, 기종 MAX
  assert.equal(pdcReg('593'), 'HL8593');
  assert.equal(pdcAcType('HL8593'), 'B737-8');
  assert.equal(pdcReg('553'), 'HL8553');
  assert.equal(pdcAcType('HL8553'), 'B737-8');

  // NG(HL8xxx): last3 역조회로 복원, 기종 NG
  assert.equal(pdcReg('031'), 'HL8031');
  assert.equal(pdcAcType('HL8031'), 'B737-800');
  assert.equal(pdcReg('321'), 'HL8321');      // 8321은 스펙시트상 NG
  assert.equal(pdcAcType('HL8321'), 'B737-800');

  // NG 예외(HL7213): pdc "213" → HL8213이 아니라 HL7213으로 복원되고 NG로 판정
  assert.equal(pdcReg('213'), 'HL7213');
  assert.equal(pdcAcType('HL7213'), 'B737-800');

  // 전체 기번/숫자 입력도 처리
  assert.equal(pdcReg('8593'), 'HL8593');
  assert.equal(pdcReg('HL8593'), 'HL8593');
  assert.equal(pdcReg(''), '');
});

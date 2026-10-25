const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');
const billing = fs.readFileSync(path.join(root, 'www', 'billing.js'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'www', 'terms.html'), 'utf8');
const faq = fs.readFileSync(path.join(root, 'www', 'faq.html'), 'utf8');

test('billing UI uses StoreKit localized product data and supports restore', () => {
  assert.match(billing, /getProducts\s*\(/);
  assert.match(billing, /priceString/);
  assert.match(billing, /purchaseProduct\s*\(/);
  assert.match(billing, /restorePurchases\s*\(/);
  assert.match(billing, /options\.onlyCurrentEntitlements = true/);
  assert.match(billing, /async function syncStoreEntitlement/);
  assert.match(billing, /if \(!status\?\.active\) await syncStoreEntitlement\(\)/);
  assert.match(billing, /appAccountToken:\s*await accountToken\(\)/);
  assert.match(html, /이전 구매 복원/);
  // 자동 갱신이 없으므로 구독 관리 화면으로 보내면 안 된다
  assert.doesNotMatch(billing, /manageSubscriptions/);
  assert.doesNotMatch(html, /구독 관리/);
});

test('auto-import unlock is a one-time lifetime purchase, not a subscription', () => {
  assert.match(billing, /LIFETIME_PRODUCT = 'com\.rufnekcrew\.flylog\.autoimport\.lifetime'/);
  assert.match(billing, /productType: 'inapp'/);
  assert.doesNotMatch(billing, /productType: 'subs'/);
  assert.match(html, /billingLifetimeButton/);
  // 만료일 표시는 평생 이용권에 맞지 않는다
  assert.doesNotMatch(billing, /formatDate\(status\.expiresAt\)/);
  for (const source of [html, terms, faq]) assert.doesNotMatch(source, /자동 갱신 구독/);
});

test('billing works on both stores — Play sends the purchase token', () => {
  // iOS 전용 분기가 남아 있으면 안드로이드에서 구매·복원이 막힌다
  assert.doesNotMatch(billing, /isNativeIOS/);
  assert.match(billing, /function storePlatform/);
  assert.match(billing, /name === 'ios' \|\| name === 'android'/);
  assert.match(billing, /purchaseToken: String\(transaction\?\.purchaseToken/);
  assert.match(billing, /'Google Play' : 'App Store'/);
});

test('free import and purchase policy is consistent at 50 flights', () => {
  for (const source of [html, terms, faq]) assert.match(source, /50편/);
  for (const source of [html, terms, faq]) assert.doesNotMatch(source, /100편/);
  assert.match(terms, /평생 이용권/);
});

test('main screen shows automatic import usage and milestone guidance', () => {
  assert.match(html, /billingOverviewCard/);
  assert.match(html, /0 \/ 50편 사용/);
  assert.match(html, /50편 남음/);
  assert.match(html, /billingProgressFill/);
  assert.match(billing, /pct >= 100 \? 100 : pct >= 90 \? 90 : pct >= 80 \? 80/);
  assert.match(billing, /milestone-\$\{threshold\}/);
});

test('usage is reported only after newly saved CrewConnex flights', () => {
  assert.match(html, /recordImports/);
  assert.match(billing, /billing\/imports/);
  assert.match(html, /새로 저장한 고유 비행만 1편으로 계산됩니다/);
});

test('web build does not hardcode a purchase price', () => {
  assert.doesNotMatch(billing, /\$0\.99|\$9\.99|₩|원\s*\/\s*(월|년)/);
});

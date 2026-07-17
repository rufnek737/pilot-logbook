import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);

test('Firestore rules restrict every user document and nested document to its owner', async () => {
  const rules = await readFile(new URL('firestore.rules', rootUrl), 'utf8');
  assert.match(rules, /match \/users\/\{userId\}/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /request\.auth != null && request\.auth\.uid == userId/);
  assert.doesNotMatch(rules, /allow\s+(?:read|write|read,\s*write)[^;]*:\s*if\s+true/);
});

test('Firebase deploy configuration points to the checked-in rules', async () => {
  const config = JSON.parse(await readFile(new URL('firebase.json', rootUrl), 'utf8'));
  const projects = JSON.parse(await readFile(new URL('.firebaserc', rootUrl), 'utf8'));
  assert.equal(config.firestore.rules, 'firestore.rules');
  assert.equal(projects.projects.default, 'pilot-logbook-22bb8');
});

test('CrewConnex client sends the signed-in Firebase ID token', async () => {
  const html = await readFile(new URL('www/index.html', rootUrl), 'utf8');
  assert.match(html, /signedInUser\.getIdToken\(\)/);
  assert.match(html, /'Authorization': `Bearer \$\{firebaseIdToken\}`/);
  assert.doesNotMatch(html, /localStorage\.setItem\([^\n]*(?:ccPassword|password)/i);
});

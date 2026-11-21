import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPasswordHash,
  timingSafeCompareSecret,
  signSessionToken,
  verifySessionToken,
} from './authHelpers';

test('hashPassword and verifyPasswordHash verify matching passwords and reject mismatches', () => {
  const hash = hashPassword('StrongPass!123');
  assert.equal(hash.includes(':'), true);
  assert.equal(verifyPasswordHash('StrongPass!123', hash), true);
  assert.equal(verifyPasswordHash('WrongPass!123', hash), false);
  assert.equal(verifyPasswordHash('', hash), false);
});

test('timingSafeCompareSecret validates identical secrets and rejects differences', () => {
  assert.equal(timingSafeCompareSecret('secret-abc', 'secret-abc'), true);
  assert.equal(timingSafeCompareSecret('secret-abc', 'secret-abd'), false);
  assert.equal(timingSafeCompareSecret('', 'secret-abc'), false);
});

test('signSessionToken and verifySessionToken round-trip valid tokens and reject tampered or expired ones', () => {
  const secret = 'test-signing-key-32-bytes-minimum-ok';
  const now = 1_700_000_000_000;
  const token = signSessionToken({ userId: 'usr-admin', role: 'admin' }, secret, 60_000);

  const verified = verifySessionToken(token, secret, now);
  assert.deepEqual(verified?.userId, 'usr-admin');
  assert.deepEqual(verified?.role, 'admin');

  // Tampered payload
  const [, sig] = token.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({ userId: 'usr-admin', role: 'admin', exp: now + 999_999 })
  ).toString('base64url');
  assert.equal(verifySessionToken(`${forgedPayload}.${sig}`, secret, now), null);

  // Wrong secret
  assert.equal(verifySessionToken(token, 'wrong-secret', now), null);

  // Expired token
  assert.equal(verifySessionToken(token, secret, Date.now() + 120_000), null);
});

import crypto from 'crypto';

export interface SessionTokenPayload {
  userId: string;
  role: 'admin' | 'user';
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordHash(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  } catch {
    return false;
  }
}

export function timingSafeCompareSecret(input: string, expected: string): boolean {
  if (!input || !expected) return false;
  const a = crypto.createHash('sha256').update(input, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export function signSessionToken(
  payload: { userId: string; role: 'admin' | 'user' },
  secret: string,
  ttlMs = 24 * 60 * 60 * 1000
): string {
  const body: SessionTokenPayload = {
    userId: payload.userId,
    role: payload.role,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  nowMs = Date.now()
): SessionTokenPayload | null {
  if (!token || !secret) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  try {
    const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (
      !decoded ||
      typeof decoded.userId !== 'string' ||
      (decoded.role !== 'admin' && decoded.role !== 'user') ||
      typeof decoded.exp !== 'number' ||
      decoded.exp <= nowMs
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

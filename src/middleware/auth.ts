import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser, getUserByUid, type StoredDbUser } from '../db/users.ts';
import { verifySessionToken } from '../utils/authHelpers.ts';

export const SESSION_SECRET =
  (process.env.SESSION_SECRET || '').trim() ||
  crypto.createHash('sha256').update(process.env.SQL_PASSWORD || 'sparkcat-default-session-key').digest('hex');

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  authUser?: StoredDbUser;
}

export const SESSION_COOKIE_NAME = 'sparkcat_session';

export function extractCookieToken(req: Request): string | null {
  const rawCookie = req.headers.cookie;
  if (!rawCookie || typeof rawCookie !== 'string') return null;
  const parts = rawCookie.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE_NAME) {
      const val = rest.join('=').trim();
      if (val) {
        try {
          return decodeURIComponent(val);
        } catch {
          return val;
        }
      }
    }
  }
  return null;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  return extractCookieToken(req);
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  const sameSite = isSecure ? 'None; Secure' : 'Lax';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}; SameSite=${sameSite}`
  );
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  const sameSite = isSecure ? 'None; Secure' : 'Lax';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=${sameSite}`
  );
}

export async function resolveAuthenticatedUser(req: AuthRequest): Promise<StoredDbUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  // 1. Check local signed session token (supports Admin & Engineer email/password sign-in)
  const localPayload = verifySessionToken(token, SESSION_SECRET);
  if (localPayload) {
    const dbUser = await getUserByUid(localPayload.userId);
    if (dbUser) {
      req.authUser = dbUser;
      return dbUser;
    }
  }

  // 2. Verify Firebase Auth ID token (Google Sign-In via Firebase Authentication)
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    const dbUser = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || `${decodedToken.uid}@sparkcat.hub`,
      decodedToken.name
    );
    req.authUser = dbUser;
    return dbUser;
  } catch (error) {
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    next();
  } catch (error) {
    console.error('Error verifying authentication token:', error);
    return res.status(401).json({ error: 'Authentication required.' });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    next();
  } catch (error) {
    console.error('Error verifying administrator access:', error);
    return res.status(401).json({ error: 'Authentication required.' });
  }
};

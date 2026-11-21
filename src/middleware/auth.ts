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

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
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

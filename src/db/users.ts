import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';
import type { User } from '../types.ts';

export interface StoredDbUser extends User {
  passwordHash?: string | null;
}

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@sparkcat.hub').trim();
export const DEFAULT_ADMIN_HASH =
  'a99cd4e8aef01ede98362a93eb648b3e:646be82c12e4282956588395f2530b684622824141151eb9bff6242700ada689767a4c39ceda18823543c4735c402b5b74150ed5113cdcb3cc1a7f2316ec1f7c';

export function isKnownAdminEmail(email: string): boolean {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === DEFAULT_ADMIN_EMAIL.toLowerCase() ||
    normalized === 'venimurugesh@gmail.com' ||
    normalized === 'vinaygasundaram2007@gmail.com' ||
    normalized === 'admin@sparkcat.hub' ||
    normalized === 'admin@sparkcat.com' ||
    normalized === 'admin@sparkcat.io'
  );
}

export const SEED_USERS: StoredDbUser[] = [
  {
    id: 'usr-admin',
    name: 'Spark Cat Admin',
    email: DEFAULT_ADMIN_EMAIL,
    role: 'admin',
    favorites: [],
    downloadHistory: [],
    createdAt: '2026-10-01',
    passwordHash: DEFAULT_ADMIN_HASH,
  },
  {
    id: 'usr-engineer',
    name: 'Alex Mercer (Lead Engineer)',
    email: 'alex@engineering.io',
    role: 'user',
    favorites: [],
    downloadHistory: [],
    createdAt: '2026-10-15',
    passwordHash: null,
  },
];

function mapRowToUser(row: typeof users.$inferSelect): StoredDbUser {
  return {
    id: row.uid,
    name: row.name,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'user',
    favorites: Array.isArray(row.favorites) ? row.favorites : [],
    downloadHistory: Array.isArray(row.downloadHistory) ? row.downloadHistory : [],
    createdAt: row.createdAt,
    passwordHash: row.passwordHash,
  };
}

export function sanitizeDbUser(u: StoredDbUser): User {
  const { passwordHash: _ignored, ...safe } = u;
  return safe;
}

let seedUsersInFlight: Promise<void> | null = null;

export async function ensureSeedUsers(): Promise<void> {
  if (seedUsersInFlight) {
    return seedUsersInFlight;
  }

  seedUsersInFlight = (async () => {
    try {
      const existing = await db.select().from(users);
      if (existing.length > 0) return;

      for (const seed of SEED_USERS) {
        await db
          .insert(users)
          .values({
            uid: seed.id,
            name: seed.name,
            email: seed.email,
            role: seed.role,
            favorites: seed.favorites,
            downloadHistory: seed.downloadHistory,
            passwordHash: seed.passwordHash ?? null,
            createdAt: seed.createdAt,
          })
          .onConflictDoNothing();
      }
    } catch (error) {
      console.error('Database seed users failed:', error);
      throw new Error('Failed to initialize users in database.', { cause: error });
    } finally {
      seedUsersInFlight = null;
    }
  })();

  return seedUsersInFlight;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<StoredDbUser> {
  try {
    await ensureSeedUsers();
    const isAutoAdmin = isKnownAdminEmail(email);
    const fallbackName =
      (displayName && displayName.trim()) ||
      (email ? email.split('@')[0] : 'Spark Cat Engineer');

    const existingByUid = await db.select().from(users).where(eq(users.uid, uid));
    if (existingByUid.length > 0) {
      const current = existingByUid[0];
      const nextRole = isAutoAdmin ? 'admin' : current.role;
      const updated = await db
        .update(users)
        .set({
          email: email || current.email,
          role: nextRole,
        })
        .where(eq(users.uid, uid))
        .returning();
      return mapRowToUser(updated[0]);
    }

    const inserted = await db
      .insert(users)
      .values({
        uid,
        name: fallbackName,
        email: email || `${uid}@sparkcat.hub`,
        role: isAutoAdmin ? 'admin' : 'user',
        favorites: [],
        downloadHistory: [],
        passwordHash: null,
        createdAt: new Date().toISOString().split('T')[0],
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: email || `${uid}@sparkcat.hub`,
        },
      })
      .returning();

    return mapRowToUser(inserted[0]);
  } catch (error) {
    console.error('Database getOrCreateUser failed:', error);
    throw new Error('Database user synchronization failed.', { cause: error });
  }
}

export async function getAllUsers(): Promise<StoredDbUser[]> {
  try {
    await ensureSeedUsers();
    const rows = await db.select().from(users);
    return rows.map(mapRowToUser);
  } catch (error) {
    console.error('Database getAllUsers failed:', error);
    throw new Error('Failed to load users from database.', { cause: error });
  }
}

export async function getUserByUid(uid: string): Promise<StoredDbUser | null> {
  try {
    await ensureSeedUsers();
    const rows = await db.select().from(users).where(eq(users.uid, uid));
    return rows.length > 0 ? mapRowToUser(rows[0]) : null;
  } catch (error) {
    console.error('Database getUserByUid failed:', error);
    throw new Error('Failed to load user from database.', { cause: error });
  }
}

export async function getUserByEmail(email: string): Promise<StoredDbUser | null> {
  try {
    await ensureSeedUsers();
    const normalized = email.trim().toLowerCase();
    const rows = await db.select().from(users);
    const match = rows.find((r) => r.email.toLowerCase() === normalized);
    if (match) return mapRowToUser(match);
    // Also allow matching the seeded admin account if logging in with any recognized admin email
    if (isKnownAdminEmail(normalized)) {
      const adminRow = rows.find((r) => r.uid === 'usr-admin' || r.role === 'admin');
      if (adminRow) return mapRowToUser(adminRow);
    }
    return null;
  } catch (error) {
    console.error('Database getUserByEmail failed:', error);
    throw new Error('Failed to query user by email.', { cause: error });
  }
}

export async function createLocalUser(params: {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  passwordHash: string;
}): Promise<StoredDbUser> {
  try {
    await ensureSeedUsers();
    const inserted = await db
      .insert(users)
      .values({
        uid: params.uid,
        name: params.name,
        email: params.email,
        role: params.role,
        favorites: [],
        downloadHistory: [],
        passwordHash: params.passwordHash,
        createdAt: new Date().toISOString().split('T')[0],
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          name: params.name,
          email: params.email,
          role: params.role,
          passwordHash: params.passwordHash,
        },
      })
      .returning();
    return mapRowToUser(inserted[0]);
  } catch (error) {
    console.error('Database createLocalUser failed:', error);
    throw new Error('Failed to create user account in database.', { cause: error });
  }
}

export async function updateUserRecord(
  uid: string,
  updates: Partial<{
    name: string;
    email: string;
    role: 'admin' | 'user';
    favorites: string[];
    downloadHistory: { designId: string; downloadedAt: string }[];
    passwordHash: string | null;
  }>
): Promise<StoredDbUser | null> {
  try {
    const updated = await db
      .update(users)
      .set(updates)
      .where(eq(users.uid, uid))
      .returning();
    return updated.length > 0 ? mapRowToUser(updated[0]) : null;
  } catch (error) {
    console.error('Database updateUserRecord failed:', error);
    throw new Error('Failed to update user in database.', { cause: error });
  }
}

export async function deleteUserByUid(uid: string): Promise<boolean> {
  try {
    const deleted = await db.delete(users).where(eq(users.uid, uid)).returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('Database deleteUserByUid failed:', error);
    throw new Error('Failed to delete user from database.', { cause: error });
  }
}

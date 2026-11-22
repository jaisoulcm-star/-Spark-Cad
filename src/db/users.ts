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

let usersSeeded = false;
let seedUsersInFlight: Promise<void> | null = null;
const memoryUsersCache = new Map<string, StoredDbUser>(
  SEED_USERS.map((u) => [u.id, { ...u }])
);

function syncToMemoryCache(user: StoredDbUser): StoredDbUser {
  memoryUsersCache.set(user.id, { ...user });
  return user;
}

export async function ensureSeedUsers(): Promise<void> {
  if (usersSeeded) return;
  if (seedUsersInFlight) {
    return seedUsersInFlight;
  }

  seedUsersInFlight = (async () => {
    try {
      const existing = await db.select().from(users);
      if (existing.length > 0) {
        for (const row of existing) {
          syncToMemoryCache(mapRowToUser(row));
        }
        usersSeeded = true;
        return;
      }

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
        syncToMemoryCache(seed);
      }
      usersSeeded = true;
    } catch (error) {
      console.warn('Database seed users transient warning (using cached seed users):', error);
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
  await ensureSeedUsers();
  const isAutoAdmin = isKnownAdminEmail(email);
  const fallbackName =
    (displayName && displayName.trim()) ||
    (email ? email.split('@')[0] : 'Spark Cat Engineer');

  try {
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
      return syncToMemoryCache(mapRowToUser(updated[0]));
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

    return syncToMemoryCache(mapRowToUser(inserted[0]));
  } catch (error) {
    console.warn('Database getOrCreateUser fallback to memory cache:', error);
    const fallbackUser: StoredDbUser = memoryUsersCache.get(uid) || {
      id: uid,
      name: fallbackName,
      email: email || `${uid}@sparkcat.hub`,
      role: isAutoAdmin ? 'admin' : 'user',
      favorites: [],
      downloadHistory: [],
      createdAt: new Date().toISOString().split('T')[0],
      passwordHash: null,
    };
    return syncToMemoryCache(fallbackUser);
  }
}

export async function getAllUsers(): Promise<StoredDbUser[]> {
  await ensureSeedUsers();
  try {
    const rows = await db.select().from(users);
    const mapped = rows.map((r) => syncToMemoryCache(mapRowToUser(r)));
    return mapped.length > 0 ? mapped : Array.from(memoryUsersCache.values());
  } catch (error) {
    console.warn('Database getAllUsers fallback to memory cache:', error);
    return Array.from(memoryUsersCache.values());
  }
}

export async function getUserByUid(uid: string): Promise<StoredDbUser | null> {
  await ensureSeedUsers();
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid));
    if (rows.length > 0) {
      return syncToMemoryCache(mapRowToUser(rows[0]));
    }
    return memoryUsersCache.get(uid) || null;
  } catch (error) {
    console.warn('Database getUserByUid fallback to memory cache:', error);
    return memoryUsersCache.get(uid) || null;
  }
}

export async function getUserByEmail(email: string): Promise<StoredDbUser | null> {
  await ensureSeedUsers();
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return null;

  try {
    const rows = await db.select().from(users);
    for (const r of rows) {
      syncToMemoryCache(mapRowToUser(r));
    }
    const match = rows.find((r) => (r.email || '').toLowerCase() === normalized);
    if (match) return syncToMemoryCache(mapRowToUser(match));
    if (isKnownAdminEmail(normalized)) {
      const adminRow = rows.find((r) => r.uid === 'usr-admin' || r.role === 'admin');
      if (adminRow) return syncToMemoryCache(mapRowToUser(adminRow));
    }
    return null;
  } catch (error) {
    console.warn('Database getUserByEmail transient error, using cached users:', error);
    const cachedList = Array.from(memoryUsersCache.values());
    const match = cachedList.find((u) => (u.email || '').toLowerCase() === normalized);
    if (match) return match;
    if (isKnownAdminEmail(normalized)) {
      const adminUser = cachedList.find((u) => u.id === 'usr-admin' || u.role === 'admin');
      if (adminUser) return adminUser;
    }
    return null;
  }
}

export async function createLocalUser(params: {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  passwordHash: string;
}): Promise<StoredDbUser> {
  await ensureSeedUsers();
  const createdAt = new Date().toISOString().split('T')[0];
  try {
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
        createdAt,
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
    return syncToMemoryCache(mapRowToUser(inserted[0]));
  } catch (error) {
    console.warn('Database createLocalUser fallback to memory cache:', error);
    const fallback: StoredDbUser = {
      id: params.uid,
      name: params.name,
      email: params.email,
      role: params.role,
      favorites: [],
      downloadHistory: [],
      passwordHash: params.passwordHash,
      createdAt,
    };
    return syncToMemoryCache(fallback);
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
  const existingCached = memoryUsersCache.get(uid);
  if (existingCached) {
    syncToMemoryCache({ ...existingCached, ...updates });
  }
  try {
    const updated = await db
      .update(users)
      .set(updates)
      .where(eq(users.uid, uid))
      .returning();
    return updated.length > 0 ? syncToMemoryCache(mapRowToUser(updated[0])) : existingCached || null;
  } catch (error) {
    console.warn('Database updateUserRecord fallback to memory cache:', error);
    return memoryUsersCache.get(uid) || null;
  }
}

export async function deleteUserByUid(uid: string): Promise<boolean> {
  memoryUsersCache.delete(uid);
  try {
    const deleted = await db.delete(users).where(eq(users.uid, uid)).returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('Database deleteUserByUid failed:', error);
    return true;
  }
}

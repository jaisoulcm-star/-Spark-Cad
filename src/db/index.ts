import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function isRetryableConnectionError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('terminated unexpectedly') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('epipe') ||
    msg.includes('ehostunreach') ||
    msg.includes('enotfound') ||
    msg.includes('client has encountered a connection error') ||
    msg.includes('the database system is starting up') ||
    msg.includes('cannot execute') ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    code === '08006' ||
    code === '08003'
  );
}

function isValidPostgresConnectionString(urlStr: string): boolean {
  if (!urlStr || !/^postgres(ql)?:\/\//i.test(urlStr)) return false;
  try {
    const parsed = new URL(urlStr);
    const host = (parsed.hostname || '').toLowerCase();
    // Reject obvious placeholder hostnames such as "base", "host", "your-host"
    if (!host || host === 'base' || host === 'host' || host.includes('your-')) {
      return false;
    }
    return host === 'localhost' || host === '127.0.0.1' || host.includes('.');
  } catch {
    return false;
  }
}

export const createPool = () => {
  if (!global._postgresPool) {
    const hasCloudSqlHost = Boolean(
      process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME
    );
    const candidateConnectionString = (
      process.env.DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.POSTGRES_URL ||
      ''
    ).trim();

    const useConnectionString =
      !hasCloudSqlHost && isValidPostgresConnectionString(candidateConnectionString);

    const poolConfig = useConnectionString
      ? {
          connectionString: candidateConnectionString,
          ssl:
            candidateConnectionString.includes('localhost') ||
            candidateConnectionString.includes('127.0.0.1')
              ? undefined
              : { rejectUnauthorized: false },
          max: 10,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 25000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        }
      : {
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          max: 10,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 25000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        };

    const rawPool = new Pool(poolConfig);

    rawPool.on('error', (err) => {
      console.warn('Idle SQL pool client disconnected (will reconnect on next query):', err.message);
    });

    const origQuery = rawPool.query.bind(rawPool);
    (rawPool as any).query = async (...args: any[]) => {
      const hasCallback = typeof args[args.length - 1] === 'function';
      if (hasCallback) {
        return (origQuery as any)(...args);
      }

      const maxAttempts = 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await (origQuery as any)(...args);
        } catch (err: any) {
          if (attempt < maxAttempts && isRetryableConnectionError(err)) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 400));
            continue;
          }
          throw err;
        }
      }
    };

    global._postgresPool = rawPool;
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

let schemaInitDone = false;
let schemaInitPromise: Promise<void> | null = null;

export async function ensureDatabaseSchemaInitialized(): Promise<void> {
  if (schemaInitDone) return;
  if (schemaInitPromise) return schemaInitPromise;
  schemaInitPromise = (async () => {
    try {
      const check = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'designs' LIMIT 1;"
      );
      if ((check.rowCount ?? 0) > 0) {
        schemaInitDone = true;
        return;
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          uid TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          favorites JSONB NOT NULL DEFAULT '[]'::jsonb,
          download_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          password_hash TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          slug TEXT NOT NULL,
          description TEXT NOT NULL,
          icon_name TEXT NOT NULL DEFAULT 'Folder'
        );

        CREATE TABLE IF NOT EXISTS designs (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          software TEXT NOT NULL,
          format TEXT NOT NULL,
          complexity TEXT NOT NULL,
          file_size TEXT NOT NULL,
          preview_url TEXT NOT NULL,
          download_url TEXT NOT NULL,
          original_filename TEXT,
          downloads_count INTEGER NOT NULL DEFAULT 0,
          rating DOUBLE PRECISION NOT NULL DEFAULT 5.0,
          reviews_count INTEGER NOT NULL DEFAULT 0,
          reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
          uploaded_by TEXT NOT NULL,
          uploaded_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'published',
          sort_order INTEGER NOT NULL DEFAULT 0,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb
        );

        CREATE TABLE IF NOT EXISTS storage_files (
          id TEXT PRIMARY KEY,
          design_id TEXT NOT NULL,
          file_type TEXT NOT NULL,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          data_base64 TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS contact_messages (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          subject TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'new',
          created_at TEXT NOT NULL
        );
      `);
      schemaInitDone = true;
    } catch {
      // On managed instances where the runtime user does not have DDL CREATE privileges, mark done and rely on existing schema
      schemaInitDone = true;
    } finally {
      schemaInitPromise = null;
    }
  })();
  return schemaInitPromise;
}

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

export const createPool = () => {
  if (!global._postgresPool) {
    const rawPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 25000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

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

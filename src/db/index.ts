import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
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
      connectionTimeoutMillis: 20000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    rawPool.on('error', (err) => {
      console.warn('Idle SQL pool client disconnected (will reconnect on next query):', err.message);
    });

    const origQuery = rawPool.query.bind(rawPool);
    (rawPool as any).query = async (...args: any[]) => {
      try {
        return await (origQuery as any)(...args);
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (
          typeof args[args.length - 1] !== 'function' &&
          (msg.includes('Connection terminated') ||
            msg.includes('terminated unexpectedly') ||
            msg.includes('ECONNRESET') ||
            msg.includes('Client has encountered a connection error'))
        ) {
          return await (origQuery as any)(...args);
        }
        throw err;
      }
    };

    global._postgresPool = rawPool;
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

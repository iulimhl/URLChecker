import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { ScreeningStore } from './store.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL in .env or in the environment.');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3001);
const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
pool.on('error', () => console.error('An idle database connection was lost.'));

const store = new ScreeningStore(pool);
try {
  await store.initialize();
} catch {
  await pool.end();
  throw new Error('Could not initialize PostgreSQL. Check that the database is running and DATABASE_URL is correct.');
}

const server = createApp(store, resolve('dist/web')).listen(port, host, () => {
  console.log('URL Checker listening at http://' + host + ':' + port);
});
const stop = () => server.close(() => void pool.end());
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

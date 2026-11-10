import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { Pool } from 'pg';
import type { Screening, ScreeningDetail } from '../shared/screening.js';
import { createApp } from '../server/app.js';
import { ScreeningStore } from '../server/store.js';

test('REST workflow validates input and persists screenings and review history in PostgreSQL', async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'Set TEST_DATABASE_URL to a development or test PostgreSQL database.');
  const schema = 'test_screenings_' + randomUUID().replaceAll('-', '');
  const admin = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  t.after(() => admin.end());
  await admin.query('CREATE SCHEMA ' + schema);

  let pool: Pool | undefined;
  let server: Server | undefined;
  let baseUrl: string;

  async function stop() {
    if (server) {
      const activeServer = server;
      server = undefined;
      await new Promise<void>((resolve, reject) => activeServer.close((error) => error ? reject(error) : resolve()));
    }
    if (pool) {
      const activePool = pool;
      pool = undefined;
      await activePool.end();
    }
  }

  t.after(async () => {
    await stop();
    const cleanup = new Pool({ connectionString });
    try {
      await cleanup.query('DROP SCHEMA ' + schema + ' CASCADE');
    } finally {
      await cleanup.end();
    }
  });

  async function start() {
    pool = new Pool({ connectionString, options: '-c search_path=' + schema, connectionTimeoutMillis: 5_000 });
    const store = new ScreeningStore(pool);
    await store.initialize();
    server = createApp(store).listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api';
  }

  function request(path: string, data?: object) {
    return fetch(baseUrl + path, data ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    } : {});
  }

  await start();
  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/screenings', { url: 'ftp://example.org' })).status, 400);
  assert.deepEqual(await (await request('/screenings')).json(), []);

  const created = await request('/screenings', { url: 'http://192.0.2.42:8080/?token=demo-token' });
  assert.equal(created.status, 201);
  const item: Screening = await created.json();
  assert.equal(item.status, 'pending');
  assert.equal(item.risk, 'high');
  assert.doesNotMatch(item.url, /demo-token/);
  assert.equal(created.headers.get('location'), '/api/screenings/' + item.id);
  const path = '/screenings/' + item.id;
  assert.equal((await request(path + '/reviews', { decision: 'pending' })).status, 400);
  assert.equal((await request('/screenings/' + randomUUID() + '/reviews', { decision: 'safe' })).status, 404);

  const first = await request(path + '/reviews', { decision: 'suspicious', note: 'Numeric hostname and unencrypted HTTP.' });
  assert.equal(first.status, 201);
  const second = await request(path + '/reviews', { decision: 'safe', note: 'Confirmed this is a test address.' });
  assert.equal(second.status, 201);
  const pending: Screening[] = await (await request('/screenings?status=pending')).json();
  assert.equal(pending.length, 0);

  await stop();
  await start();
  const persisted: ScreeningDetail = await (await request(path)).json();
  assert.equal(persisted.status, 'safe');
  assert.equal(persisted.score, item.score);
  assert.deepEqual(persisted.reviews.map(({ decision, note }) => ({ decision, note })), [
    { decision: 'safe', note: 'Confirmed this is a test address.' },
    { decision: 'suspicious', note: 'Numeric hostname and unencrypted HTTP.' },
  ]);
});

import express, { type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { InvalidUrl, analyzeUrl } from './screening.js';
import type { ScreeningStore } from './store.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function createApp(store: ScreeningStore, webDir?: string) {
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Request-Id': randomUUID() });
    next();
  });
  app.use('/api', express.json({ limit: '12kb' }));

  app.get('/api/health', async (_req, res) => {
    await store.ping();
    res.json({ status: 'ok' });
  });

  app.get('/api/screenings', async (req, res) => {
    const status = req.query.status;
    if (status !== undefined && status !== 'pending' && status !== 'safe' && status !== 'suspicious') {
      res.status(400).json({ error: 'Unknown screening status.' });
      return;
    }
    res.json(await store.list(status));
  });

  app.post('/api/screenings', async (req, res) => {
    const analysis = analyzeUrl(req.body?.url);
    const screening = await store.create(analysis);
    res.location('/api/screenings/' + screening.id).status(201).json(screening);
  });

  app.get('/api/screenings/:id', async (req, res) => {
    const screening = uuid.test(req.params.id) ? await store.get(req.params.id) : null;
    if (!screening) {
      res.status(404).json({ error: 'Screening not found.' });
      return;
    }
    res.json(screening);
  });

  app.post('/api/screenings/:id/reviews', async (req, res) => {
    const { decision, note = '' } = req.body ?? {};
    if ((decision !== 'safe' && decision !== 'suspicious') || typeof note !== 'string' || note.length > 500) {
      res.status(400).json({ error: 'Choose safe or suspicious and use at most 500 characters for the note.' });
      return;
    }
    const screening = uuid.test(req.params.id) ? await store.review(req.params.id, decision, note.trim()) : null;
    if (!screening) {
      res.status(404).json({ error: 'Screening not found.' });
      return;
    }
    res.status(201).json(screening);
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  if (webDir) app.use(express.static(webDir));

  const handleError: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof InvalidUrl) {
      res.status(400).json({ error: error.message });
    } else if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON body.' });
    } else if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large.' });
    } else {
      const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'unknown';
      console.error(JSON.stringify({ event: 'api_error', method: req.method, requestId: res.get('X-Request-Id'), code }));
      res.status(500).json({ error: 'The server could not complete the request.' });
    }
  };
  app.use(handleError);
  return app;
}

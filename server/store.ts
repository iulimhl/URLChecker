import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Analysis, Decision, Review, Screening, ScreeningStatus } from '../shared/screening.js';

type Row = Omit<Screening, 'createdAt'> & { createdAt: Date };

const columns = 'id, url, hostname, score, risk, findings, status, created_at AS "createdAt"';
const serialize = (row: Row): Screening => ({ ...row, createdAt: row.createdAt.toISOString() });

export class ScreeningStore {
  constructor(private db: Pool) {}

  async initialize() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS screenings (
        id uuid PRIMARY KEY,
        url text NOT NULL,
        hostname text NOT NULL,
        score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
        risk text NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
        findings jsonb NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'safe', 'suspicious')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        screening_id uuid NOT NULL REFERENCES screenings (id),
        decision text NOT NULL CHECK (decision IN ('safe', 'suspicious')),
        note text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS reviews_screening_idx ON reviews (screening_id, id);
    `);
  }

  async ping() {
    await this.db.query('SELECT 1');
  }

  async create(analysis: Analysis) {
    const { rows } = await this.db.query<Row>(`
      INSERT INTO screenings (id, url, hostname, score, risk, findings)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${columns}
    `, [randomUUID(), analysis.url, analysis.hostname, analysis.score, analysis.risk, JSON.stringify(analysis.findings)]);
    return serialize(rows[0]);
  }

  async list(status?: ScreeningStatus) {
    const { rows } = await this.db.query<Row>(`
      SELECT ${columns} FROM screenings
      WHERE $1::text IS NULL OR status = $1
      ORDER BY created_at DESC, id DESC LIMIT 100
    `, [status ?? null]);
    return rows.map(serialize);
  }

  async get(id: string) {
    const { rows } = await this.db.query<Row & { reviews: Review[] }>(`
      SELECT ${columns}, (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', reviews.id::text, 'decision', reviews.decision,
          'note', reviews.note, 'createdAt', reviews.created_at
        ) ORDER BY reviews.id DESC), '[]'::jsonb)
        FROM reviews WHERE reviews.screening_id = screenings.id
      ) AS reviews
      FROM screenings WHERE id = $1
    `, [id]);
    return rows[0] ? { ...serialize(rows[0]), reviews: rows[0].reviews } : null;
  }

  async review(id: string, decision: Decision, note: string) {
    const result = await this.db.query(`
      WITH updated AS (
        UPDATE screenings SET status = $2 WHERE id = $1 RETURNING id
      )
      INSERT INTO reviews (screening_id, decision, note) SELECT id, $2, $3 FROM updated
    `, [id, decision, note]);
    return result.rowCount ? this.get(id) : null;
  }
}

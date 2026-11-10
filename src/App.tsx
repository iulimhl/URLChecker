import { useEffect, useState, type FormEvent } from 'react';
import type { Decision, Screening, ScreeningDetail, ScreeningStatus } from '../shared/screening';

type Filter = 'all' | ScreeningStatus;

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'safe', label: 'Safe' },
  { id: 'suspicious', label: 'Suspicious' },
];
const examples = [
  { label: 'Clean example', url: 'https://example.org/resources' },
  { label: 'Flagged example', url: 'http://192.0.2.42:8080/verify?redirect=example.org' },
];
const timestamp = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

async function api<T>(path: string, data?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api' + path, {
    signal,
    ...(data && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'The request failed. Try again.');
  }
  return response.json() as Promise<T>;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function Status({ status }: { status: ScreeningStatus }) {
  return <span className={'status ' + status}>{status}</span>;
}

function ReviewForm({ onSave }: { onSave: (decision: Decision, note: string) => Promise<void> }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    setSaving(true);
    setError('');
    try {
      await onSave(decision, note);
      setDecision(null);
      setNote('');
    } catch (error) {
      setError(message(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="review-form" onSubmit={submit}>
      <fieldset disabled={saving}>
        <legend>Review decision</legend>
        <div className="decisions">
          <label><input type="radio" name="decision" value="safe" checked={decision === 'safe'} onChange={() => setDecision('safe')} /> Safe</label>
          <label><input type="radio" name="decision" value="suspicious" checked={decision === 'suspicious'} onChange={() => setDecision('suspicious')} /> Suspicious</label>
        </div>
        <label className="note-label" htmlFor="note">Review note (optional)</label>
        <textarea id="note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={!decision}>{saving ? 'Saving…' : 'Save decision'}</button>
      </fieldset>
    </form>
  );
}

export function App() {
  const [url, setUrl] = useState('');
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScreeningDetail | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [screening, setScreening] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<Screening[]>('/screenings', undefined, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setScreenings(items);
        setSelected((id) => id ?? items[0]?.id ?? null);
      })
      .catch((error) => { if (!controller.signal.aborted) setListError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setInitialLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    api<ScreeningDetail>('/screenings/' + selected, undefined, controller.signal)
      .then((item) => { if (!controller.signal.aborted) setDetail(item); })
      .catch((error) => { if (!controller.signal.aborted) setDetailError(message(error)); });
    return () => controller.abort();
  }, [selected]);

  function select(id: string) {
    if (id !== selected) {
      setDetailError('');
      setSelected(id);
    }
  }

  async function screen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScreening(true);
    setSubmitError('');
    try {
      const item = await api<Screening>('/screenings', { url });
      setScreenings((items) => [item, ...items].slice(0, 100));
      setFilter('all');
      setUrl('');
      select(item.id);
    } catch (error) {
      setSubmitError(message(error));
    } finally {
      setScreening(false);
    }
  }

  async function review(decision: Decision, note: string) {
    const updated = await api<ScreeningDetail>('/screenings/' + selected + '/reviews', { decision, note });
    setScreenings((items) => items.map((item) => item.id === updated.id ? { ...item, status: updated.status } : item));
    setDetail((item) => item?.id === updated.id ? updated : item);
  }

  const active = detail?.id === selected ? detail : null;
  const visible = screenings.filter((item) => filter === 'all' || item.status === filter);
  const pendingCount = screenings.filter((item) => item.status === 'pending').length;

  return (
    <main className="frame">
      <header className="intro">
        <h1>URL Checker</h1>
        <p>Check the structure of a link and record a review.</p>
      </header>

      <section className="url-check" aria-label="Screen a URL">
        <form onSubmit={screen}>
          <label htmlFor="url">URL to check</label>
          <div className="url-row">
            <input id="url" name="url" inputMode="url" placeholder="https://example.org" autoComplete="off" spellCheck={false} required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} />
            <button className="primary" disabled={initialLoading || screening || !url.trim()}>{screening ? 'Checking…' : 'Check URL'}</button>
          </div>
          {submitError && <p className="error" role="alert">{submitError}</p>}
        </form>
        <div className="submit-foot">
          <small>Links are never opened. Query values are hidden.</small>
          <div className="examples">
            {examples.map((example) => <button key={example.label} type="button" className="text-button" onClick={() => setUrl(example.url)}>{example.label}</button>)}
          </div>
        </div>
      </section>

      <div className="workspace">
        <section className="queue" aria-labelledby="queue-title">
          <header className="panel-heading">
            <h2 id="queue-title">Recent checks</h2>
            <span className="count">{pendingCount} pending</span>
          </header>
          <div className="filters" aria-label="Filter screenings">
            {filters.map(({ id, label }) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
          {initialLoading ? <p className="empty" role="status">Loading screenings…</p> : listError ? (
            <div className="empty">
              <p className="error" role="alert">{listError}</p>
              <button className="text-button" type="button" onClick={() => { setListError(''); setInitialLoading(true); setRefresh(refresh + 1); }}>Try again</button>
            </div>
          ) : visible.length ? (
            <div className="queue-results">
              <div className="queue-columns" aria-hidden="true"><span>URL</span><span>Score</span><span>Status</span></div>
              <ul className="queue-list">
                {visible.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="queue-item" aria-pressed={selected === item.id} onClick={() => select(item.id)}>
                      <span className="queue-address">
                        <strong>{item.hostname}</strong>
                        <small>{item.url}</small>
                      </span>
                      <span className={'risk ' + item.risk} aria-label={'Score: ' + item.score}>{item.score}</span>
                      <Status status={item.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="empty">{screenings.length ? 'No results for this filter.' : 'No URLs checked yet.'}</p>}
        </section>

        <section className="detail" aria-labelledby="detail-title">
          <header className="panel-heading">
            <h2 id="detail-title">Result</h2>
            {active && <Status status={active.status} />}
          </header>
          {active ? (
            <>
              <div className="subject">
                <h3>{active.hostname}</h3>
                <code>{active.url}</code>
                <p className="score"><strong>{active.score}</strong> / 100 <span className={'risk ' + active.risk}>{active.risk} risk</span></p>
              </div>
              <div className="findings">
                <h3>Risk signals</h3>
                {active.findings.length ? <ul>{active.findings.map((finding) => (
                  <li key={finding.id}><div><strong>{finding.title}</strong><p>{finding.detail}</p></div><span>+{finding.points}</span></li>
                ))}</ul> : <p className="muted">No risk signals found by these rules.</p>}
              </div>
              <ReviewForm key={active.id} onSave={review} />
              <div className="history">
                <h3>Review history</h3>
                {active.reviews.length ? <ul>{active.reviews.map((entry) => (
                  <li key={entry.id}>
                    <div><Status status={entry.decision} /><time dateTime={entry.createdAt}>{timestamp.format(new Date(entry.createdAt))}</time></div>
                    {entry.note && <p>{entry.note}</p>}
                  </li>
                ))}</ul> : <p className="muted">No decisions recorded yet.</p>}
              </div>
            </>
          ) : <p className={'empty' + (detailError ? ' error' : '')} role={detailError ? 'alert' : 'status'}>{detailError || (selected ? 'Loading details…' : 'Check a URL or select a result from the list.')}</p>}
        </section>
      </div>
    </main>
  );
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeUrl, InvalidUrl } from '../server/screening.js';

test('a normal HTTPS URL has no risk signals', () => {
  const result = analyzeUrl('example.org/resources');
  assert.equal(result.url, 'https://example.org/resources');
  assert.equal(result.score, 0);
  assert.equal(result.risk, 'low');
  assert.deepEqual(result.findings, []);
});

test('identifies a numeric hostname, HTTP, a nonstandard port and redirect parameters', () => {
  const result = analyzeUrl('http://192.0.2.42:8080/verify?redirect=example.org&redirect=other.example&token=private#fragment');
  assert.equal(result.score, 60);
  assert.equal(result.risk, 'high');
  assert.deepEqual(new Set(result.findings.map(({ id }) => id)), new Set(['http', 'port', 'ip', 'query']));
  assert.match(result.url, /redirect=\[hidden\]/);
  assert.doesNotMatch(JSON.stringify(result), /private|fragment|other\.example/);
});

test('flags shorteners and brand lookalikes without flagging the official domain', () => {
  assert.ok(analyzeUrl('https://bit.ly/demo').findings.some(({ id }) => id === 'shortener'));
  assert.ok(analyzeUrl('https://paypa1.example').findings.some(({ id }) => id === 'lookalike'));
  assert.ok(analyzeUrl('https://www.paypal.com').findings.every(({ id }) => id !== 'lookalike'));
});

test('rejects malformed links, non-web protocols and embedded credentials', () => {
  for (const value of ['', 'https://', 'not a URL', 'ftp://example.org', 'https://name:secret@example.org', 'https://example.org:99999', null]) {
    assert.throws(() => analyzeUrl(value), InvalidUrl);
  }
});

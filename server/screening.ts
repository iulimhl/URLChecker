import { isIP } from 'node:net';
import { parse } from 'tldts';
import type { Analysis, Finding, Risk } from '../shared/screening.js';

const shorteners = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'rebrand.ly', 'cutt.ly', 'is.gd']);
const tlds = new Set(['zip', 'top', 'xyz', 'click', 'link']);
const queryKeys = new Set(['redirect', 'return', 'return_url', 'next', 'url', 'token', 'session', 'password', 'login']);
const brands = ['google.com', 'gmail.com', 'github.com', 'paypal.com', 'microsoft.com'];
const lookalikeCharacters: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't' };
const normalizeLabel = (label: string) => label.replace(/[013457]/g, (character) => lookalikeCharacters[character]);

export class InvalidUrl extends Error {}

function readUrl(input: unknown): URL {
  if (typeof input !== 'string' || input.length > 2048 || !input.trim() || /[\s\\]/u.test(input.trim())) {
    throw new InvalidUrl('Enter a URL with no spaces and at most 2,048 characters.');
  }
  try {
    const value = input.trim();
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const validHost = isIP(host) || (
      host.includes('.') && host.length <= 253 &&
      host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    );
    if (!validHost || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error();
    }
    return url;
  } catch {
    throw new InvalidUrl('Enter an HTTP or HTTPS URL without embedded credentials.');
  }
}

function oneEditAway(first: string, second: string): boolean {
  if (Math.abs(first.length - second.length) > 1) return false;
  let a = 0;
  let b = 0;
  let edits = 0;
  while (a < first.length && b < second.length) {
    if (first[a] === second[b]) {
      a++;
      b++;
    } else {
      if (++edits > 1) return false;
      if (first.length >= second.length) a++;
      if (second.length >= first.length) b++;
    }
  }
  return edits + first.length - a + second.length - b <= 1;
}

function findLookalike(domain: string, label: string) {
  if (brands.includes(domain)) return undefined;
  const normalized = normalizeLabel(label);
  return brands.find((brand) => {
    const official = brand.split('.')[0];
    return normalized.includes(official) || (normalized.length >= 4 && oneEditAway(normalized, official));
  });
}

export function analyzeUrl(input: unknown): Analysis {
  const parsed = readUrl(input);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const findings: Finding[] = [];
  const add = (id: string, title: string, detail: string, points: number) => findings.push({ id, title, detail, points });
  const keys = [...new Set([...parsed.searchParams.keys()].map((key) => key.toLowerCase()).filter((key) => queryKeys.has(key)))].sort();

  if (parsed.protocol === 'http:') add('http', 'Unencrypted HTTP', 'The link does not use HTTPS.', 12);
  if (parsed.port && !['80', '443'].includes(parsed.port)) add('port', 'Unusual port', 'Port ' + parsed.port + ' is uncommon for web traffic.', 8);
  if (keys.length) add('query', 'Sensitive or redirect parameters', 'Parameters: ' + keys.join(', ') + '.', 20);
  if (shorteners.has(hostname)) add('shortener', 'Shortened link', 'The destination is hidden behind a URL shortener.', 15);

  if (isIP(hostname)) {
    add('ip', 'IP address as hostname', 'The link uses a numeric address instead of a domain name.', 20);
  } else {
    const { domain, domainWithoutSuffix, publicSuffix, subdomain } = parse(hostname, { allowPrivateDomains: true });
    const label = domainWithoutSuffix ?? hostname.split('.')[0];
    const subdomainCount = subdomain ? subdomain.split('.').length : 0;
    if (subdomainCount >= 3) add('subdomains', 'Many subdomains', 'The hostname has ' + subdomainCount + ' subdomains.', 10);
    if (label.length >= 24 || (label.match(/-/g)?.length ?? 0) >= 2 || (label.match(/\d/g)?.length ?? 0) >= 3) {
      add('shape', 'Unusual domain shape', 'The domain has a long or noisy label.', 8);
    }
    if (publicSuffix && tlds.has(publicSuffix)) add('suffix', 'Uncommon domain extension', 'The domain ends in .' + publicSuffix + '.', 8);
    const brand = domain && findLookalike(domain, label);
    if (brand) add('lookalike', 'Possible brand lookalike', domain + ' resembles ' + brand + '.', 20);
  }

  const score = Math.min(100, findings.reduce((sum, finding) => sum + finding.points, 0));
  const risk: Risk = score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low';
  for (const key of new Set(parsed.searchParams.keys())) parsed.searchParams.set(key, '[hidden]');
  parsed.hash = '';
  return {
    url: parsed.href.replaceAll('%5Bhidden%5D', '[hidden]'),
    hostname,
    score,
    risk,
    findings: findings.sort((a, b) => b.points - a.points),
  };
}

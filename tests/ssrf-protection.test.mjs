import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIp, resolvePublicTarget, validateTarget } from '../lib/ssrf-policy.js';
import { analyzeUrl, AnalyzerError } from '../lib/analyzer.ts';

function dnsResponse(url, records = {}) {
  const type = url.searchParams.get('type');
  const name = url.searchParams.get('name');
  const data = records[name]?.[type] ?? (type === 'A' ? ['93.184.216.34'] : []);
  return Response.json({ Status: 0, Answer: data.map((address) => ({ type: type === 'A' ? 1 : 28, data: address })) });
}

test('URL policy allows public HTTP(S) on standard ports only', () => {
  assert.equal(validateTarget('https://example.com/terms').hostname, 'example.com');
  assert.equal(validateTarget('http://example.com:80').hostname, 'example.com');
  assert.equal(validateTarget('https://example.com:443').hostname, 'example.com');
  for (const value of [
    'ftp://example.com',
    'http://example.com:8080',
    'http://user:secret@example.com',
    'http://localhost',
    'http://service.internal',
    'http://127.0.0.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://0177.0.0.1',
    'http://10.1.2.3',
    'http://169.254.169.254/latest/meta-data',
    'http://172.20.0.1',
    'http://192.168.1.1',
    'http://[::1]',
    'http://[fe80::1]',
    'http://[fc00::1]',
    'http://[::ffff:127.0.0.1]',
  ]) assert.throws(() => validateTarget(value), { name: 'SsrfPolicyError' }, value);
});

test('IP classifier blocks reserved, private, mapped and metadata ranges', () => {
  for (const ip of ['0.1.2.3', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.1', '172.31.0.1', '192.168.1.1', '198.19.1.2', '224.0.0.1', '::', '::1', '::ffff:10.0.0.1', 'fc00::2', 'fe80::abcd', 'ff02::1', '2001:db8::1', '2002:7f00:1::']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
});

test('DNS preflight rejects any private A or AAAA answer', async () => {
  const url = validateTarget('https://mixed-dns.example/');
  await assert.rejects(
    resolvePublicTarget(url, { fetchImpl: (request) => dnsResponse(new URL(request), { 'mixed-dns.example': { A: ['93.184.216.34'], AAAA: ['fd00::1'] } }) }),
    /приватну, локальну або спеціальну IP-мережу/,
  );
});

test('second DNS sample rejects a common public-to-private rebinding response', async () => {
  const url = validateTarget('https://rebinding.example/');
  let aLookups = 0;
  const fetchImpl = (request) => {
    const parsed = new URL(request);
    if (parsed.searchParams.get('type') === 'AAAA') return dnsResponse(parsed, { 'rebinding.example': { AAAA: [] } });
    aLookups += 1;
    return dnsResponse(parsed, { 'rebinding.example': { A: [aLookups === 1 ? '93.184.216.34' : '10.0.0.4'] } });
  };
  await assert.rejects(resolvePublicTarget(url, { fetchImpl }), /приватну, локальну або спеціальну IP-мережу/);
});

test('redirect destination is validated and DNS-checked before a second fetch', async () => {
  const records = {
    'public.example': { A: ['93.184.216.34'], AAAA: [] },
    'internal.example': { A: ['169.254.169.254'], AAAA: [] },
  };
  let outboundCalls = 0;
  const fetchImpl = (request) => {
    const url = new URL(request);
    if (url.hostname === 'cloudflare-dns.com') return dnsResponse(url, records);
    outboundCalls += 1;
    return new Response(null, { status: 302, headers: { location: 'https://internal.example/latest/meta-data' } });
  };
  await assert.rejects(analyzeUrl('https://public.example/page', { fetchImpl }), (error) => error instanceof AnalyzerError && /приватну, локальну або спеціальну IP-мережу/.test(error.message));
  assert.equal(outboundCalls, 1);
});

test('redirect limit is three and page body is not fetched past that limit', async () => {
  let outboundCalls = 0;
  const fetchImpl = (request) => {
    const url = new URL(request);
    if (url.hostname === 'cloudflare-dns.com') return dnsResponse(url);
    outboundCalls += 1;
    return new Response(null, { status: 302, headers: { location: `/step-${outboundCalls}` } });
  };
  await assert.rejects(analyzeUrl('https://public.example/start', { fetchImpl }), /максимум 3/);
  assert.equal(outboundCalls, 4);
});

test('analyzer refuses non-HTML content types and body larger than 2 MiB', async () => {
  const makeFetch = (body, type, extraHeaders = {}) => (request) => {
    const url = new URL(request);
    if (url.hostname === 'cloudflare-dns.com') return dnsResponse(url);
    return new Response(body, { headers: { 'content-type': type, ...extraHeaders } });
  };
  await assert.rejects(analyzeUrl('https://public.example/page', { fetchImpl: makeFetch('no', 'application/json') }), /не HTML-сторінка/);
  await assert.rejects(analyzeUrl('https://public.example/page', { fetchImpl: makeFetch('x'.repeat(2 * 1024 * 1024 + 1), 'text/html') }), /ліміт 2 МБ/);
});

test('analyzer success path connects cleaned HTML, parsed price evidence and deterministic score', async () => {
  const longTerms = Array.from({ length: 90 }, (_, index) => `additional term ${index}`).join(' ');
  const html = `<html><head><title>Subscription Terms</title></head><body><p>Pricing is $12 monthly. The subscription automatically renews monthly. Refund policy available within 30 days. Cancel subscription any time.</p>${longTerms}</body></html>`;
  const fetchImpl = (request) => {
    const url = new URL(request);
    if (url.hostname === 'cloudflare-dns.com') return dnsResponse(url);
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  };

  const first = await analyzeUrl('https://public.example/terms', { fetchImpl });
  const second = await analyzeUrl('https://public.example/terms', { fetchImpl });
  assert.equal(first.title, 'Subscription Terms');
  assert.deepEqual(first.prices, ['$12']);
  assert.deepEqual(first.findings.map(({ kind }) => kind), ['renewal', 'refund', 'cancellation', 'price']);
  assert.equal(first.score, 90);
  assert.equal(first.decision, 'buy');
  assert.equal(first.score, second.score);
  assert.equal(first.decision, second.decision);
  assert.deepEqual(first.prices, second.prices);
});

test('8-second overall deadline aborts a hanging request', async () => {
  const fetchImpl = (request, init) => {
    const url = new URL(request);
    if (url.hostname === 'cloudflare-dns.com') return dnsResponse(url);
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
  };
  await assert.rejects(analyzeUrl('https://public.example/page', { fetchImpl, timeoutMs: 15 }), (error) => error instanceof AnalyzerError && error.status === 504);
});

test('overall deadline also covers a hanging DNS preflight', async () => {
  const fetchImpl = (_request, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
  await assert.rejects(analyzeUrl('https://public.example/page', { fetchImpl, timeoutMs: 15 }), (error) => error instanceof AnalyzerError && error.status === 504);
});

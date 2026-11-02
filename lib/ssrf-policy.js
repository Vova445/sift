const DNS_JSON_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

export class SsrfPolicyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'SsrfPolicyError';
    this.status = status;
  }
}

function parseIpv4(value) {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return null;
  return octets;
}

function isBlockedIpv4(value) {
  const ip = parseIpv4(value);
  if (!ip) return true;
  const [a, b, c, d] = ip;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99) || (b === 51 && c === 100))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 || (a === 255 && b === 255 && c === 255 && d === 255);
}

function parseIpv6(value) {
  let input = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (input.includes('%')) return null;
  const embedded = input.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) {
    const v4 = parseIpv4(embedded[1]);
    if (!v4) return null;
    const tail = `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
    input = input.slice(0, input.length - embedded[1].length) + tail;
  }
  if ((input.match(/::/g) || []).length > 1) return null;
  let words;
  if (input.includes('::')) {
    const [left, right] = input.split('::');
    const l = left ? left.split(':') : [];
    const r = right ? right.split(':') : [];
    const missing = 8 - l.length - r.length;
    if (missing < 1) return null;
    words = [...l, ...Array(missing).fill('0'), ...r];
  } else {
    words = input.split(':');
    if (words.length !== 8) return null;
  }
  if (words.length !== 8 || words.some((word) => !/^[\da-f]{1,4}$/.test(word))) return null;
  return words.map((word) => parseInt(word, 16));
}

function isBlockedIpv6(value) {
  const words = parseIpv6(value);
  if (!words) return true;
  const allZero = words.every((word) => word === 0);
  const loopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const mappedIpv4 = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const nat64 = words[0] === 0x64 && words[1] === 0xff9b;
  const localNat64 = words[0] === 0x64 && words[1] === 0xff9b && words[2] === 1;
  const uniqueLocal = (words[0] & 0xfe00) === 0xfc00;
  const linkLocal = (words[0] & 0xffc0) === 0xfe80;
  const multicast = (words[0] & 0xff00) === 0xff00;
  const globalUnicast = (words[0] & 0xe000) === 0x2000;
  const documentation = words[0] === 0x2001 && words[1] === 0x0db8;
  const protocolAssignment = words[0] === 0x2001 && words[1] <= 0x01ff;
  const sixToFour = words[0] === 0x2002;
  const orchid = words[0] === 0x2001 && (words[1] & 0xfff0) === 0x0010;
  return allZero || loopback || mappedIpv4 || nat64 || localNat64 || uniqueLocal || linkLocal || multicast ||
    !globalUnicast || documentation || protocolAssignment || sixToFour || orchid;
}

export function isPublicIp(value) {
  const unwrapped = String(value).replace(/^\[|\]$/g, '');
  if (!unwrapped.includes(':')) return !isBlockedIpv4(unwrapped);
  return !isBlockedIpv6(unwrapped);
}

function isLocalHostname(host) {
  const h = host.toLowerCase().replace(/\.$/, '');
  return !h.includes('.') || /\.(?:localhost|local|localdomain|internal|lan|home|corp|intranet|test|invalid|onion)$/.test(h) ||
    h === 'metadata' || h === 'metadata.google.internal' || h.endsWith('.metadata.google.internal');
}

export function validateTarget(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfPolicyError('Введіть повне коректне посилання, що починається з https://');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const allowedPort = !url.port || url.port === '80' || url.port === '443';
  const literalIp = /^[\d.]+$/.test(hostname) || hostname.includes(':');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !allowedPort || isLocalHostname(hostname) ||
      (literalIp && !isPublicIp(hostname))) {
    throw new SsrfPolicyError('Дозволені лише публічні HTTP(S) адреси на портах 80 або 443.');
  }
  if (!url.hostname || hostname.length > 253) throw new SsrfPolicyError('Некоректне доменне ім’я.');
  return url;
}

async function queryDns(hostname, type, fetchImpl, signal) {
  const endpoint = new URL(DNS_JSON_ENDPOINT);
  endpoint.searchParams.set('name', hostname);
  endpoint.searchParams.set('type', type);
  let response;
  try {
    response = await fetchImpl(endpoint, { headers: { accept: 'application/dns-json' }, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new SsrfPolicyError('Не вдалося безпечно перевірити DNS-адресу сайту.', 502);
  }
  if (!response.ok) throw new SsrfPolicyError('DNS-сервер не зміг перевірити адресу сайту.', 502);
  const result = await response.json();
  if (result.Status !== 0 && result.Status !== 3) throw new SsrfPolicyError('Домен не має коректного DNS-запису.', 422);
  return (result.Answer || []).filter((answer) => answer.type === (type === 'A' ? 1 : 28)).map((answer) => answer.data);
}

/**
 * Resolve and validate every A/AAAA answer before each outbound request.
 * Cloudflare Workers' fetch API does not expose a way to pin an arbitrary
 * external URL to these answers; see SSRF deployment note in docs/security.
 */
export async function resolvePublicTarget(url, { fetchImpl = fetch, signal } = {}) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (/^[\da-f:.]+$/i.test(hostname)) {
    if (!isPublicIp(hostname)) throw new SsrfPolicyError('Адреса веде до приватної або спеціальної IP-мережі.');
    return [hostname];
  }
  if (isLocalHostname(hostname)) throw new SsrfPolicyError('Локальні та службові домени заборонені.');
  const inspectAnswers = async () => {
    const [v4, v6] = await Promise.all([
      queryDns(hostname, 'A', fetchImpl, signal),
      queryDns(hostname, 'AAAA', fetchImpl, signal),
    ]);
    return [...new Set([...v4, ...v6])];
  };
  // A second lookup catches common rebinding responses that rotate from a
  // public answer to a private one between consecutive DNS queries.
  const [firstAnswers, secondAnswers] = await Promise.all([inspectAnswers(), inspectAnswers()]);
  const addresses = [...new Set([...firstAnswers, ...secondAnswers])];
  if (!addresses.length) throw new SsrfPolicyError('Домен не має доступних IP-адрес. Перевірте адресу сайту.', 422);
  if (addresses.some((address) => !isPublicIp(address))) {
    throw new SsrfPolicyError('Домен вказує на приватну, локальну або спеціальну IP-мережу.');
  }
  return addresses;
}

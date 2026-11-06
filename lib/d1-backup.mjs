const API_ORIGIN = 'https://api.cloudflare.com/client/v4';

export const D1_BACKUP_RETENTION_DAYS = 30;
export const D1_BACKUP_RETENTION_MS = D1_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const D1_BACKUP_PREFIX = 'd1/';

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function safeApiError(payload, status) {
  const message = payload?.errors?.map((item) => item?.message).filter(Boolean).join('; ')
    || payload?.result?.error
    || `Cloudflare D1 export API returned HTTP ${status}`;
  return new Error(message.slice(0, 500));
}

async function postExport({ accountId, databaseId, token, bookmark, fetchImpl }) {
  const url = `${API_ORIGIN}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/export`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(bookmark ? { current_bookmark: bookmark } : { output_format: 'polling' }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) throw safeApiError(payload, response.status);
  if (!payload?.result || typeof payload.result !== 'object') throw new Error('Cloudflare D1 export response is missing result data');
  return payload.result;
}

export async function startD1Export({ accountId, databaseId, token, fetchImpl = fetch }) {
  const result = await postExport({
    accountId: required(accountId, 'accountId'),
    databaseId: required(databaseId, 'databaseId'),
    token: required(token, 'token'),
    fetchImpl,
  });
  if (typeof result.at_bookmark !== 'string' || !result.at_bookmark) {
    if (result.status === 'error') throw new Error(result.error || 'Cloudflare D1 export failed to start');
    throw new Error('Cloudflare D1 export response is missing its stable bookmark');
  }
  return { bookmark: result.at_bookmark };
}

export async function pollD1Export({ accountId, databaseId, token, bookmark, fetchImpl = fetch }) {
  const result = await postExport({
    accountId: required(accountId, 'accountId'),
    databaseId: required(databaseId, 'databaseId'),
    token: required(token, 'token'),
    bookmark: required(bookmark, 'bookmark'),
    fetchImpl,
  });

  const nested = result.result && typeof result.result === 'object' ? result.result : {};
  const state = { ...result, ...nested };
  if (result.status === 'error' || state.error) throw new Error(state.error || 'Cloudflare D1 export failed');
  if (state.signed_url && state.filename) {
    const signedUrl = new URL(state.signed_url);
    if (signedUrl.protocol !== 'https:' || signedUrl.username || signedUrl.password) {
      throw new Error('Cloudflare returned an invalid D1 export download URL');
    }
    return { status: 'complete', signedUrl: signedUrl.href, filename: state.filename };
  }
  return { status: 'pending' };
}

function backupKey({ now, filename }) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error('Backup timestamp is invalid');
  const timestamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const safeFilename = String(filename || 'export.sql').split(/[\\/]/).at(-1).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${D1_BACKUP_PREFIX}${date.toISOString().slice(0, 10)}/sift-${timestamp}-${safeFilename}`;
}

export async function saveD1ExportToR2({ bucket, signedUrl, filename, bookmark, databaseId, now = new Date(), fetchImpl = fetch }) {
  if (!bucket || typeof bucket.put !== 'function') throw new Error('BACKUP_BUCKET binding is unavailable');
  const url = new URL(required(signedUrl, 'signedUrl'));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid signed D1 export URL');
  const response = await fetchImpl(url.href);
  if (!response.ok || !response.body) throw new Error(`Could not download D1 export (HTTP ${response.status})`);

  const key = backupKey({ now, filename });
  await bucket.put(key, response.body, {
    httpMetadata: { contentType: 'application/sql; charset=utf-8' },
    customMetadata: {
      backupType: 'cloudflare-d1-sql',
      databaseId: required(databaseId, 'databaseId'),
      bookmark: required(bookmark, 'bookmark'),
      exportedAt: new Date(now).toISOString(),
      sourceFilename: String(filename).slice(0, 200),
    },
  });
  return { key, filename, bookmark, exportedAt: new Date(now).toISOString() };
}

export async function pruneExpiredD1Backups({ bucket, now = Date.now(), retentionMs = D1_BACKUP_RETENTION_MS }) {
  if (!bucket || typeof bucket.list !== 'function' || typeof bucket.delete !== 'function') {
    throw new Error('BACKUP_BUCKET retention operations are unavailable');
  }
  const cutoff = new Date(now).getTime() - retentionMs;
  if (!Number.isFinite(cutoff)) throw new Error('Retention timestamp is invalid');

  let cursor;
  let deleted = 0;
  do {
    const page = await bucket.list({ prefix: D1_BACKUP_PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    const expired = (page.objects || [])
      .filter((object) => object.key.startsWith(D1_BACKUP_PREFIX) && object.uploaded instanceof Date && object.uploaded.getTime() < cutoff)
      .map((object) => object.key);
    for (let offset = 0; offset < expired.length; offset += 1000) {
      const keys = expired.slice(offset, offset + 1000);
      if (keys.length) await bucket.delete(keys);
      deleted += keys.length;
    }
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw new Error('R2 retention listing did not advance its cursor');
    cursor = page.cursor;
  } while (true);

  return { deleted, retentionDays: D1_BACKUP_RETENTION_DAYS };
}

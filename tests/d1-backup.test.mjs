import test from 'node:test';
import assert from 'node:assert/strict';
import { runD1BackupWorkflow } from '../lib/d1-backup-orchestrator.mjs';
import {
  D1_BACKUP_RETENTION_DAYS,
  pollD1Export,
  pruneExpiredD1Backups,
  saveD1ExportToR2,
  startD1Export,
} from '../lib/d1-backup.mjs';

const API_URL = 'https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db/export';

function apiResponse(result, { status = 200, success = true } = {}) {
  return new Response(JSON.stringify({ success, result }), { status, headers: { 'content-type': 'application/json' } });
}

test('starts a D1 export with polling format and captures its stable bookmark', async () => {
  let request;
  const started = await startD1Export({
    accountId: 'acct', databaseId: 'db', token: 'test-token',
    fetchImpl: async (url, options) => { request = { url, options }; return apiResponse({ at_bookmark: 'bookmark-1' }); },
  });
  assert.deepEqual(started, { bookmark: 'bookmark-1' });
  assert.equal(request.url, API_URL);
  assert.equal(request.options.headers.authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(request.options.body), { output_format: 'polling' });
});

test('polls a D1 export and recognizes nested completion payloads', async () => {
  let requestBody;
  const result = await pollD1Export({
    accountId: 'acct', databaseId: 'db', token: 'test-token', bookmark: 'bookmark-1',
    fetchImpl: async (_url, options) => { requestBody = JSON.parse(options.body); return apiResponse({ status: 'complete', result: { filename: 'export.sql', signed_url: 'https://downloads.cloudflare.com/signed.sql' } }); },
  });
  assert.deepEqual(requestBody, { current_bookmark: 'bookmark-1' });
  assert.deepEqual(result, { status: 'complete', filename: 'export.sql', signedUrl: 'https://downloads.cloudflare.com/signed.sql' });
});

test('keeps pending exports pending and rejects API failures without leaking request credentials', async () => {
  const pending = await pollD1Export({
    accountId: 'acct', databaseId: 'db', token: 'test-token', bookmark: 'bookmark-1',
    fetchImpl: async () => apiResponse({ status: 'running' }),
  });
  assert.deepEqual(pending, { status: 'pending' });

  await assert.rejects(startD1Export({
    accountId: 'acct', databaseId: 'db', token: 'secret-value',
    fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'database missing' }] }), { status: 404 }),
  }), (error) => error.message === 'database missing' && !error.message.includes('secret-value'));
});

test('streams a completed SQL dump into a timestamped private R2 key with recovery metadata', async () => {
  let stored;
  const backup = await saveD1ExportToR2({
    bucket: { put: async (key, body, options) => { stored = { key, body: await new Response(body).text(), options }; } },
    signedUrl: 'https://downloads.cloudflare.com/signed.sql', filename: 'cloudflare-export.sql',
    bookmark: 'bookmark-2', databaseId: 'db', now: new Date('2026-11-03T02:00:00.000Z'),
    fetchImpl: async () => new Response('CREATE TABLE users(id TEXT);', { status: 200 }),
  });
  assert.equal(backup.key, 'd1/2026-11-03/sift-20261103T020000Z-cloudflare-export.sql');
  assert.equal(stored.body, 'CREATE TABLE users(id TEXT);');
  assert.equal(stored.options.customMetadata.bookmark, 'bookmark-2');
  assert.equal(stored.options.customMetadata.databaseId, 'db');
  assert.equal(stored.options.httpMetadata.contentType, 'application/sql; charset=utf-8');
});

test('rejects unsafe export URLs and failed SQL downloads', async () => {
  const bucket = { put: async () => assert.fail('must not write an invalid backup') };
  await assert.rejects(saveD1ExportToR2({ bucket, signedUrl: 'http://downloads.invalid/a.sql', filename: 'a.sql', bookmark: 'b', databaseId: 'db' }), /Invalid signed D1 export URL/);
  await assert.rejects(saveD1ExportToR2({
    bucket, signedUrl: 'https://downloads.cloudflare.com/a.sql', filename: 'a.sql', bookmark: 'b', databaseId: 'db',
    fetchImpl: async () => new Response('failed', { status: 503 }),
  }), /Could not download D1 export/);
});

test('deletes only D1 backups older than 30 days and walks R2 pages', async () => {
  const now = Date.parse('2026-11-03T02:00:00.000Z');
  const deleted = [];
  const calls = [];
  const bucket = {
    async list(options) {
      calls.push(options.cursor || 'first');
      if (!options.cursor) return {
        objects: [
          { key: 'd1/old.sql', uploaded: new Date(now - D1_BACKUP_RETENTION_DAYS * 86400000 - 1) },
          { key: 'd1/keep.sql', uploaded: new Date(now - D1_BACKUP_RETENTION_DAYS * 86400000) },
        ], truncated: true, cursor: 'page-2',
      };
      return { objects: [{ key: 'other/old.sql', uploaded: new Date(0) }], truncated: false };
    },
    async delete(keys) { deleted.push(...keys); },
  };
  const result = await pruneExpiredD1Backups({ bucket, now });
  assert.deepEqual(result, { deleted: 1, retentionDays: 30 });
  assert.deepEqual(deleted, ['d1/old.sql']);
  assert.deepEqual(calls, ['first', 'page-2']);
});

test('fails closed if the R2 pagination cursor stops advancing', async () => {
  await assert.rejects(pruneExpiredD1Backups({
    bucket: {
      list: async () => ({ objects: [], truncated: true, cursor: 'same' }),
      delete: async () => {},
    },
  }), /did not advance its cursor/);
});

test('runs the durable backup workflow from export through R2 retention', async () => {
  const storedObjects = [];
  const deletedObjects = [];
  const stepNames = [];
  const bucket = {
    async put(key, body, options) { storedObjects.push({ key, body: await new Response(body).text(), options }); },
    async list() { return { objects: [{ key: 'd1/expired.sql', uploaded: new Date(0) }, ...storedObjects.map((object) => ({ key: object.key, uploaded: new Date() }))], truncated: false }; },
    async delete(keys) { deletedObjects.push(...keys); },
  };
  let pollCount = 0;
  const fetchImpl = async (url, options) => {
    if (url === API_URL) {
      const body = JSON.parse(options.body);
      if (body.output_format === 'polling') return apiResponse({ at_bookmark: 'durable-bookmark' });
      pollCount += 1;
      if (pollCount === 1) return apiResponse({ status: 'running' });
      return apiResponse({ status: 'complete', result: { filename: 'daily.sql', signed_url: 'https://downloads.cloudflare.com/daily.sql' } });
    }
    return new Response('CREATE TABLE backup_fixture(id TEXT);', { status: 200 });
  };
  const step = {
    async do(name, config, callback) { stepNames.push(name); return callback({ attempt: 1, config }); },
    async sleep(name, duration) { stepNames.push(`${name}:${duration}`); },
  };

  const result = await runD1BackupWorkflow({
    event: { payload: { scheduledAt: '2026-11-03T02:00:00.000Z' } },
    step,
    env: { CF_ACCOUNT_ID: 'acct', D1_BACKUP_DATABASE_ID: 'db', D1_REST_API_TOKEN: 'token', BACKUP_BUCKET: bucket },
    fetchImpl,
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.backup.bookmark, 'durable-bookmark');
  assert.equal(result.retentionDays, 30);
  assert.equal(result.scheduledAt, '2026-11-03T02:00:00.000Z');
  assert.equal(storedObjects.length, 1);
  assert.equal(storedObjects[0].body, 'CREATE TABLE backup_fixture(id TEXT);');
  assert.deepEqual(deletedObjects, ['d1/expired.sql']);
  assert.ok(stepNames.includes('wait-for-export-1:30 seconds'));
  assert.ok(stepNames.includes('poll-export-2'));
  assert.ok(stepNames.includes('save-sql-to-r2'));
  assert.ok(stepNames.includes('remove-backups-older-than-30-days'));
});

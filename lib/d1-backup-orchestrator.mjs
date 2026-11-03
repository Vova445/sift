import {
  pollD1Export,
  pruneExpiredD1Backups,
  saveD1ExportToR2,
  startD1Export,
} from './d1-backup.mjs';

const POLL_INTERVAL = '30 seconds';
const MAX_POLLS = 240;
const RETRY_POLICY = { retries: { limit: 5, delay: '10 seconds', backoff: 'exponential' }, timeout: '1 minute' };

export async function runD1BackupWorkflow({ event, step, env, fetchImpl = fetch }) {
  const { CF_ACCOUNT_ID, D1_BACKUP_DATABASE_ID, D1_REST_API_TOKEN, BACKUP_BUCKET } = env;
  if (!CF_ACCOUNT_ID || !D1_BACKUP_DATABASE_ID || !D1_REST_API_TOKEN || !BACKUP_BUCKET) {
    throw new Error('D1 backup configuration is incomplete');
  }

  const { bookmark } = await step.do('start-d1-export', RETRY_POLICY, () => startD1Export({
    accountId: CF_ACCOUNT_ID,
    databaseId: D1_BACKUP_DATABASE_ID,
    token: D1_REST_API_TOKEN,
    fetchImpl,
  }));

  let exported = { status: 'pending' };
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    await step.sleep(`wait-for-export-${attempt}`, POLL_INTERVAL);
    exported = await step.do(`poll-export-${attempt}`, RETRY_POLICY, () => pollD1Export({
      accountId: CF_ACCOUNT_ID,
      databaseId: D1_BACKUP_DATABASE_ID,
      token: D1_REST_API_TOKEN,
      bookmark,
      fetchImpl,
    }));
    if (exported.status === 'complete') break;
  }
  if (exported.status !== 'complete') throw new Error('D1 export did not complete within two hours');

  const stored = await step.do('save-sql-to-r2', RETRY_POLICY, () => saveD1ExportToR2({
    bucket: BACKUP_BUCKET,
    signedUrl: exported.signedUrl,
    filename: exported.filename,
    bookmark,
    databaseId: D1_BACKUP_DATABASE_ID,
    fetchImpl,
  }));
  const retention = await step.do('remove-backups-older-than-30-days', RETRY_POLICY, () => pruneExpiredD1Backups({ bucket: BACKUP_BUCKET }));

  return {
    status: 'complete',
    backup: stored,
    prunedObjects: retention.deleted,
    retentionDays: retention.retentionDays,
    scheduledAt: event?.payload?.scheduledAt || event?.timestamp?.toISOString?.() || null,
  };
}

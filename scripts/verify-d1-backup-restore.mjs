import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const wrangler = join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const workRoot = await mkdtemp(join(tmpdir(), 'sift-d1-restore-'));
const sourceStore = join(workRoot, 'source');
const stagingStore = join(workRoot, 'staging');
const sourceConfig = join(sourceStore, 'wrangler.jsonc');
const stagingConfig = join(stagingStore, 'wrangler.jsonc');
const seedFile = join(workRoot, 'seed.sql');
const backupFile = join(workRoot, 'daily-backup.sql');
const email = `d1-restore-${Date.now()}@example.invalid`;
const scanId = `restore-${Date.now()}`;
const migrationsDir = resolve(projectRoot, 'migrations');

function testD1Config(databaseName) {
  return JSON.stringify({
    name: 'sift-d1-backup-restore-test',
    compatibility_date: '2026-11-03',
    d1_databases: [{
      binding: 'DB',
      database_name: databaseName,
      database_id: randomUUID(),
      migrations_dir: migrationsDir,
    }],
  }, null, 2);
}

function wranglerCommand(args) {
  try {
    return execFileSync(process.execPath, [wrangler, ...args], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5 * 60 * 1000,
      env: process.env,
    });
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').slice(-4000);
    throw new Error(`wrangler ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`, { cause: error });
  }
}

const started = performance.now();
try {
  await mkdir(sourceStore, { recursive: true });
  await mkdir(stagingStore, { recursive: true });
  await writeFile(sourceConfig, testD1Config('sift-backup-source'), 'utf8');
  await writeFile(stagingConfig, testD1Config('sift-backup-staging'), 'utf8');
  await writeFile(seedFile, [
    `INSERT INTO users (id, email, password_hash, salt, created_at, password_iterations) VALUES ('restore-fixture', '${email}', 'fixture-hash', 'fixture-salt', '2026-11-03T00:00:00.000Z', 310000);`,
    `INSERT INTO scans (id, device_id, url, title, score, result_json, created_at, user_id) VALUES ('${scanId}', 'restore-device', 'https://example.com/terms', 'Restore fixture', 88, '{"restored":true}', '2026-11-03T00:01:00.000Z', 'restore-fixture');`,
  ].join('\n'), 'utf8');

  wranglerCommand(['d1', 'migrations', 'apply', 'sift-backup-source', '--local', '--config', sourceConfig]);
  wranglerCommand(['d1', 'execute', 'sift-backup-source', '--local', '--config', sourceConfig, '--file', seedFile]);
  wranglerCommand(['d1', 'export', 'sift-backup-source', '--local', '--config', sourceConfig, '--output', backupFile]);
  wranglerCommand(['d1', 'execute', 'sift-backup-staging', '--local', '--config', stagingConfig, '--file', backupFile]);

  const verification = wranglerCommand([
    'd1', 'execute', 'sift-backup-staging', '--local', '--config', stagingConfig,
    '--command', `SELECT u.email, s.id, (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_scans_user_created') AS has_user_scan_index FROM users u JOIN scans s ON s.user_id = u.id WHERE u.email = '${email}' AND s.id = '${scanId}';`,
  ]);
  if (!verification.includes(email) || !verification.includes(scanId) || !verification.includes('1')) {
    throw new Error(`Staging restore verification did not find the fixture rows and index:\n${verification}`);
  }

  const elapsedSeconds = ((performance.now() - started) / 1000).toFixed(2);
  console.log(`Local D1 backup/restore round trip: PASS (${elapsedSeconds}s)`);
  console.log('Verified: current migrations, restored fixture user, restored report, and user-created_at index.');
  console.log('Scope: isolated local staging D1; no remote database was read or modified.');
} finally {
  await rm(workRoot, { recursive: true, force: true });
}

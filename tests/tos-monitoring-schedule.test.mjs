import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('production config schedules weekly checks and hourly retry/backlog processing', async () => {
  const [configText, wrapper] = await Promise.all([
    readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/wrap-worker-entry.mjs', import.meta.url), 'utf8'),
  ]);
  const config = JSON.parse(configText);
  assert.ok(config.triggers.crons.includes('0 8 * * 1'));
  assert.match(wrapper, /controller\.cron === '0 8 \* \* 1'[\s\S]*?\/api\/internal\/tos-monitoring/);
  assert.match(wrapper, /\['terms monitoring', '\/api\/internal\/tos-monitoring'\]/);
});

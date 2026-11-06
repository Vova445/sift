import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';
import { join } from 'node:path';
import { localDevDir } from './scripts/local-dev-path.mjs';

const { r2 } = hostingConfig;
const isLocalDev = process.env.SIFT_LOCAL_DEV === '1';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  ...(!isLocalDev ? { ai: { binding: 'AI', remote: true } } : {}),
  // D1 is bound only in wrangler.jsonc. Repeating the same binding here makes
  // Wrangler emit duplicate D1 bindings in the built Worker config.
  r2_buckets: !isLocalDev && r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= isLocalDev ? join(localDevDir, 'logs') : '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= isLocalDev ? join(localDevDir, 'registry') : '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        ...(isLocalDev
          ? {
              configPath: './wrangler.local.jsonc',
              persistState: { path: join(localDevDir, 'worker-state') },
              remoteBindings: false,
            }
          : {}),
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});

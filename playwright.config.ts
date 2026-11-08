import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 'chur-browser-'))
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3187', trace: 'retain-on-failure' },
  metadata: { dataDir },
  globalTeardown: './tests/browser/teardown.ts',
  webServer: {
    command: 'pnpm start',
    url: 'http://127.0.0.1:3187/api/health/ready',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { HOST: '127.0.0.1', PORT: '3187', CHUR_DATA_DIR: dataDir,
      CHUR_SECURE_COOKIES: 'false' },
  },
})

import type { FullConfig } from '@playwright/test'
import { rm } from 'node:fs/promises'
import { basename } from 'node:path'
export default async function teardown(config: FullConfig) {
  const dir = config.metadata.dataDir
  if (typeof dir === 'string' && basename(dir).startsWith('chur-browser-')) await rm(dir, { recursive: true, force: true })
}

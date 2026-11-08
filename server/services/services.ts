import { credentialRepository } from '../repositories/credentials.ts'
import { storageRepository } from '../repositories/storage.ts'
import { createBackup } from './backups.ts'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { readConfig, type AppConfig } from './config.ts'
import { getDatabase } from '../repositories/database.ts'
import { CredentialVault, loadMasterKey, privateFile } from './secrets.ts'
import { createCsrfService } from './csrf.ts'
import { createAuthService } from './auth.ts'
import { createJobService, JobWorker } from './jobs.ts'

export type Services = ReturnType<typeof createAppServices>

export function createAppServices(config: AppConfig = readConfig()) {
  getDatabase()

  if (!existsSync(join(config.dataDir, 'master.key')) && credentialRepository.hasCredentials()) {
    throw new Error('Credential encryption key is missing. Restore the matching backup.')
  }

  const key = loadMasterKey(config.dataDir)
  const token = privateFile(join(config.dataDir, 'setup.token'), () => Buffer.from(randomBytes(32).toString('base64url'))).toString('utf8').trim()

  if (token.length < 32) {
    throw new Error('Invalid initial setup token. Check the private setup token file.')
  }

  const auth = createAuthService(token)
  const vault = new CredentialVault(key)
  const jobs = createJobService()
  const worker = new JobWorker(jobs, {
    'system.check': async () => { storageRepository.check() },
  })

  return {
    config, auth, vault, jobs, worker, csrf: createCsrfService(key),
    checkStorage: () => storageRepository.check(),
    createBackup: () => createBackup(config),
    startedAt: new Date().toISOString(),
    async close() { await worker.stop() },
  }
}

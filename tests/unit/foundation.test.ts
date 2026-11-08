import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, initDatabase, getDatabase, closeDatabase } from '../../server/repositories/database.ts'
import { createAppServices } from '../../server/services/services.ts'
import { CredentialVault, loadMasterKey } from '../../server/services/secrets.ts'
import { createJobService, JobWorker } from '../../server/services/jobs.ts'
import { createAuthService } from '../../server/services/auth.ts'
import { createBackup, restoreBackup } from '../../server/services/backups.ts'

const dirs: string[] = []
const databases: DatabaseSync[] = []
function directory() { const d = mkdtempSync(join(tmpdir(), 'chur-test-')); dirs.push(d); return d }
function open(dir = directory()) { closeDatabase(); initDatabase(dir); return getDatabase() }
afterEach(() => {
  closeDatabase()
  for (const db of databases.splice(0)) { try { db.close() } catch {} }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('database lifecycle', () => {
  it('requires initialisation before repository use and refuses a second initialisation', () => {
    closeDatabase()
    const jobs = createJobService()
    expect(() => jobs.list()).toThrow('not initialised')
    const dir = directory()
    initDatabase(dir)
    expect(jobs.list()).toEqual([])
    expect(() => initDatabase(directory())).toThrow('already initialised')
    expect(getDatabase().prepare('SELECT count(*) AS n FROM schema_migrations').get()?.n).toBe(1)
    closeDatabase()
    expect(() => jobs.list()).toThrow('not initialised')
  })

  it('does not publish a connection when migrations fail, and allows a later successful startup', () => {
    const dir = directory()
    const db = openDatabase(dir)
    db.prepare("UPDATE schema_migrations SET checksum='modified'").run()
    db.close()
    expect(() => initDatabase(dir)).toThrow('checksum')
    expect(() => getDatabase()).toThrow('not initialised')
    initDatabase(directory())
    expect(createJobService().list()).toEqual([])
  })
})

describe('storage and backups', () => {
  it('applies migrations once, preserves data across reopen, and rejects edited migration records', () => {
    const dir = directory(); const first = openDatabase(dir); databases.push(first)
    initDatabase(dir)
    createJobService().enqueue('system.check')
    const second = open(dir)
    expect(second.prepare('SELECT count(*) AS n FROM schema_migrations').get()?.n).toBe(1)
    expect(createJobService().list()).toHaveLength(1)
    first.prepare("UPDATE schema_migrations SET checksum='modified'").run()
    expect(() => openDatabase(dir)).toThrow('checksum')
    expect(statSync(join(dir, 'chur.sqlite')).mode & 0o777).toBe(0o600)
  })

  it('encrypts credentials with authenticated names and keeps the key private', () => {
    const dir = directory(), db = open(dir), key = loadMasterKey(dir)
    const vault = new CredentialVault(key)
    vault.set('radarr', 'fixture-api-secret')
    expect(vault.get('radarr')).toBe('fixture-api-secret')
    const raw = db.prepare('SELECT encrypted_value FROM credentials').get()?.encrypted_value
    expect(String(raw)).not.toContain('fixture-api-secret')
    db.prepare("INSERT INTO credentials SELECT 'other',encrypted_value,updated_at FROM credentials WHERE name='radarr'").run()
    expect(() => vault.get('other')).toThrow()
    expect(statSync(join(dir, 'master.key')).mode & 0o777).toBe(0o600)
  })

  it('restores a consistent live backup including its decryption key and refuses overwrites', async () => {
    const dir = directory(); open(dir)
    const vault = new CredentialVault(loadMasterKey(dir))
    vault.set('radarr', 'backup-secret')
    const id = createJobService().enqueue('system.check', {}, { retrySafe: true })
    const snapshot = await createBackup({ dataDir: dir })
    const target = join(directory(), 'restored')
    await restoreBackup(join(dir, 'backups', snapshot.id), target)
    open(target)
    expect(new CredentialVault(loadMasterKey(target)).get('radarr')).toBe('backup-secret')
    expect(createJobService().list()[0]?.id).toBe(id)
    await expect(restoreBackup(join(dir, 'backups', snapshot.id), target)).rejects.toThrow('non-existent')
    writeFileSync(join(dir, 'backups', snapshot.id, 'master.key'), Buffer.alloc(32))
    await expect(restoreBackup(join(dir, 'backups', snapshot.id), join(directory(), 'bad'))).rejects.toThrow('verification')
  })
})

describe('durable jobs', () => {
  it('deduplicates intake and recovers a retry-safe lease after restart', () => {
    const dir = directory(); open(dir)
    const store = createJobService()
    const id = store.enqueue('system.check', {}, { dedupeKey: 'same-event', retrySafe: true, now: 100 })
    expect(store.enqueue('system.check', {}, { dedupeKey: 'same-event', retrySafe: true, now: 100 })).toBe(id)
    expect(store.claim('old', 101, 10)?.id).toBe(id)
    closeDatabase()
    open(dir)
    const reopened = createJobService()
    expect(reopened.claim('new', 112)?.attempts).toBe(2)
    expect(reopened.complete(id, 'old', 113)).toBe(false)
    expect(reopened.complete(id, 'new', 113)).toBe(true)
    expect(reopened.list()[0]?.status).toBe('succeeded')
  })

  it('sends uncertain unsafe work for review instead of replaying it', () => {
    open()
    const store = createJobService()
    store.enqueue('future.download', {}, { now: 100 })
    store.claim('old', 101, 10)
    expect(store.claim('new', 112)).toBeUndefined()
    expect(store.list()[0]?.status).toBe('needs_review')
  })

  it('bounds safe retries and records no secret-bearing handler errors', async () => {
    open()
    const store = createJobService()
    const id = store.enqueue('system.check', {}, { retrySafe: true, maxAttempts: 1 })
    const worker = new JobWorker(store, { 'system.check': async () => { throw new Error('https://tracker.invalid/?apikey=secret') } })
    await worker.tick()
    expect(store.list()[0]).toMatchObject({ id, status: 'failed', last_error: 'Handler failed' })
  })

  it('does not treat inherited object methods as registered job handlers', async () => {
    open()
    const store = createJobService()
    store.enqueue('toString', {}, { retrySafe: true, maxAttempts: 1 })
    await new JobWorker(store, {}).tick()
    expect(store.list()[0]?.status).toBe('failed')
  })

  it('allows only one claimant across competing worker threads and SQLite connections', async () => {
    const dir = directory(); open(dir)
    createJobService().enqueue('system.check', {}, { retrySafe: true })
    const signal = new SharedArrayBuffer(4)
    const workers = Array.from({ length: 4 }, (_, i) => new Worker(new URL('../helpers/claim-worker.mjs', import.meta.url), { workerData: { dir, owner: `worker-${i}`, signal }, execArgv: [] }))
    const results: Promise<string | null>[] = []
    try {
      await Promise.all(workers.map(worker => new Promise<void>((resolve, reject) => {
        worker.once('error', reject)
        worker.on('message', message => { if (message === 'ready') resolve() })
      })))
      for (const worker of workers) results.push(new Promise((resolve, reject) => {
        worker.once('error', reject)
        worker.on('message', message => { if (message !== 'ready') resolve(message.id) })
      }))
      Atomics.store(new Int32Array(signal), 0, 1)
      Atomics.notify(new Int32Array(signal), 0)
      expect((await Promise.all(results)).filter(Boolean)).toHaveLength(1)
    } finally { await Promise.all(workers.map(worker => worker.terminate())) }
  })
})

describe('authentication', () => {
  const password = 'a-long-test-password'
  it('requires the setup token, stores hashes, survives restart and revokes sessions', async () => {
    const dir = directory(), db = open(dir), auth = createAuthService('test-setup-token')
    await expect(auth.setup('admin', password, 'wrong', 'local')).rejects.toMatchObject({ status: 401 })
    const token = await auth.setup('admin', password, 'test-setup-token', 'local', 1000)
    const stored = db.prepare('SELECT password_hash FROM admin').get()?.password_hash
    expect(stored).not.toContain(password)
    expect(db.prepare('SELECT token_hash FROM sessions').get()?.token_hash).not.toBe(token)
    open(dir)
    const reopened = createAuthService('different-setup-token')
    expect(reopened.session(token, 1001)?.username).toBe('admin')
    await expect(reopened.setup('other', password, 'different-setup-token', 'local')).rejects.toMatchObject({ status: 409 })
    await expect(reopened.login('admin', 'wrong', 'local')).rejects.toMatchObject({ status: 401 })
    const session = await reopened.login('admin', password, 'local')
    expect(reopened.session(session)?.username).toBe('admin')
    reopened.logout(session)
    expect(reopened.session(session)).toBeUndefined()
    expect(reopened.session(token, 1000 + 8 * 24 * 60 * 60_000)).toBeUndefined()
  })

  it('persists failed-attempt limits across service restart', async () => {
    const dir = directory(); open(dir)
    const auth = createAuthService('setup-token')
    for (let i = 0; i < 10; i++) await expect(auth.setup('admin', password, 'bad', 'local', 100)).rejects.toMatchObject({ status: 401 })
    open(dir)
    const reopened = createAuthService('setup-token')
    await expect(reopened.setup('admin', password, 'setup-token', 'local', 101)).rejects.toMatchObject({ status: 429 })
  })

  it('refuses to replace a missing encryption key when stored credentials exist', async () => {
    const dir = directory()
    open(dir)
    const services = createAppServices({ dataDir: dir, secureCookies: false })
    services.vault.set('radarr', 'fixture-secret')
    await services.close()
    rmSync(join(dir, 'master.key'))
    expect(() => createAppServices({ dataDir: dir, secureCookies: false })).toThrow('encryption key is missing')
  })

  it('initialises dry-run foundation without connecting to media services', async () => {
    const dir = directory()
    open(dir)
    const services = createAppServices({ dataDir: dir, secureCookies: false })
    try {
      expect(services.auth.needsSetup()).toBe(true)
      const id = services.jobs.enqueue('system.check', {}, { retrySafe: true })
      await services.worker.tick()
      expect(services.jobs.list()[0]).toMatchObject({ id, status: 'succeeded' })
    } finally { await services.close() }
  })
})

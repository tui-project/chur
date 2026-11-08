import { credentialRepository } from '../../server/repositories/credentials.ts'
import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJobService } from '../../server/services/jobs.ts'
import { CredentialVault } from '../../server/services/secrets.ts'
import { jobRepository, type JobRepository } from '../../server/repositories/jobs.ts'

afterEach(() => vi.restoreAllMocks())

describe('services using their repositories', () => {
  it('encrypts credentials before handing them to persistence', () => {
    const records = new Map<string, string>()
    const repository = {
      hasCredentials: () => records.size > 0,
      set: (name: string, value: string) => { records.set(name, value) },
      get: (name: string) => records.get(name),
    }
    vi.spyOn(credentialRepository, 'set').mockImplementation(repository.set)
    vi.spyOn(credentialRepository, 'get').mockImplementation(repository.get)
    const vault = new CredentialVault(randomBytes(32))
    vault.set('radarr', 'private-api-key')
    expect(records.get('radarr')).not.toContain('private-api-key')
    expect(vault.get('radarr')).toBe('private-api-key')
    expect(vault.get('missing')).toBeUndefined()
  })

  it('supplies job defaults and retry timing without opening SQLite', () => {
    const repository: JobRepository = {
      insert: vi.fn(() => 'saved-job'), claim: vi.fn(), heartbeat: vi.fn(() => true),
      complete: vi.fn(() => true), fail: vi.fn(), list: vi.fn(() => []), counts: vi.fn(() => ({})),
    }
    vi.spyOn(jobRepository, 'insert').mockImplementation(repository.insert)
    vi.spyOn(jobRepository, 'claim').mockImplementation(repository.claim)
    vi.spyOn(jobRepository, 'fail').mockImplementation(repository.fail)
    const jobs = createJobService()
    expect(jobs.enqueue('system.check', { test: true }, { now: 100 })).toBe('saved-job')
    expect(repository.insert).toHaveBeenCalledWith({
      id: expect.any(String), kind: 'system.check', payload: '{"test":true}',
      dedupeKey: null, retrySafe: false, maxAttempts: 3, now: 100,
    })
    jobs.claim('worker', 200)
    expect(repository.claim).toHaveBeenCalledWith('worker', 200, 30_000)
    jobs.fail('saved-job', 'worker', 300)
    expect(repository.fail).toHaveBeenCalledWith('saved-job', 'worker', 300, 5300)
  })
})

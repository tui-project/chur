import { randomUUID } from 'node:crypto'
import { jobRepository as repository, type Job } from '../repositories/jobs.ts'
export type { Job } from '../repositories/jobs.ts'

// Services choose defaults; repositories preserve atomic state transitions.
export function createJobService() {
  return {
    enqueue(kind: string, payload: Record<string, unknown> = {}, options: { dedupeKey?: string; retrySafe?: boolean; maxAttempts?: number; now?: number } = {}): string {
      return repository.insert({
        id: randomUUID(), kind, payload: JSON.stringify(payload),
        dedupeKey: options.dedupeKey ?? null, retrySafe: options.retrySafe ?? false,
        maxAttempts: options.maxAttempts ?? 3, now: options.now ?? Date.now(),
      })
    },
    claim: (owner: string, now = Date.now(), leaseMs = 30_000) => repository.claim(owner, now, leaseMs),
    heartbeat: (id: string, owner: string, now = Date.now()) => repository.heartbeat(id, owner, now, 30_000),
    complete: (id: string, owner: string, now = Date.now()) => repository.complete(id, owner, now),
    fail: (id: string, owner: string, now = Date.now()) => repository.fail(id, owner, now, now + 5000),
    list: repository.list,
    counts: repository.counts,
  }
}
export type JobStore = ReturnType<typeof createJobService>

export class JobWorker {
  readonly owner = randomUUID()
  running = false
  lastTickAt: number | null = null
  private timer?: ReturnType<typeof setTimeout>
  private inFlight?: Promise<void>

  private store: JobStore
  private handlers: Record<string, (job: Job) => Promise<void>>
  constructor(store: JobStore, handlers: Record<string, (job: Job) => Promise<void>>) { this.store = store; this.handlers = handlers }

  async tick() {
    const job = this.store.claim(this.owner)
    this.lastTickAt = Date.now()
    if (!job) return
    const heartbeat = setInterval(() => this.store.heartbeat(job.id, this.owner), 10_000)
    try {
      const handler = Object.hasOwn(this.handlers, job.kind) ? this.handlers[job.kind] : undefined
      if (!handler) throw new Error('Unknown job handler')
      await handler(job)
      this.store.complete(job.id, this.owner)
    } catch {
      this.store.fail(job.id, this.owner)
    } finally { clearInterval(heartbeat) }
  }

  start() {
    if (this.running) return
    this.running = true
    const loop = async () => {
      this.inFlight = this.tick()
      try { await this.inFlight } catch { /* Readiness exposes a stale heartbeat if storage fails. */ }
      if (this.running) this.timer = setTimeout(loop, 1000)
    }
    void loop()
  }

  async stop() {
    this.running = false
    clearTimeout(this.timer)
    await this.inFlight
  }
}

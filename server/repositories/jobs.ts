import { getDatabase, transaction } from './database.ts'

export interface Job {
  id: string
  kind: string
  payload: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'needs_review'
  attempts: number
  max_attempts: number
  retry_safe: number
  lease_owner: string | null
  lease_until: number | null
  created_at: number
  updated_at: number
  completed_at: number | null
  last_error: string | null
}


function insert(job: { id: string; kind: string; payload: string; dedupeKey: string | null; retrySafe: boolean; maxAttempts: number; now: number }): string {
  const { id, kind, payload, dedupeKey, retrySafe, maxAttempts, now } = job
  getDatabase().prepare(`INSERT INTO jobs (id,kind,payload,dedupe_key,status,retry_safe,max_attempts,available_at,created_at,updated_at)
    VALUES (?,?,?,?,'queued',?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`)
    .run(id, kind, payload, dedupeKey, retrySafe ? 1 : 0, maxAttempts, now, now, now)
  if (dedupeKey) {
    return (getDatabase().prepare('SELECT id FROM jobs WHERE dedupe_key=?').get(dedupeKey) as { id: string }).id
  }
  return id
}

function claim(owner: string, now: number, leaseMs: number): Job | undefined {
  return transaction(getDatabase(), () => {
    getDatabase().prepare(`UPDATE jobs SET status=CASE WHEN retry_safe=0 THEN 'needs_review'
      WHEN attempts<max_attempts THEN 'queued' ELSE 'failed' END,
      lease_owner=NULL,lease_until=NULL,available_at=?,updated_at=?,last_error='Worker lease expired'
      WHERE status='running' AND lease_until<=?`).run(now, now, now)
    return getDatabase().prepare(`UPDATE jobs SET status='running',attempts=attempts+1,lease_owner=?,lease_until=?,updated_at=?
      WHERE id=(SELECT id FROM jobs WHERE status='queued' AND available_at<=? AND attempts<max_attempts ORDER BY created_at,id LIMIT 1)
      RETURNING *`).get(owner, now + leaseMs, now, now) as unknown as Job | undefined
  })
}

function heartbeat(id: string, owner: string, now: number, leaseMs: number): boolean {
  return getDatabase().prepare("UPDATE jobs SET lease_until=? WHERE id=? AND lease_owner=? AND status='running' AND lease_until>?")
    .run(now + leaseMs, id, owner, now).changes === 1
}

function complete(id: string, owner: string, now: number): boolean {
  return getDatabase().prepare("UPDATE jobs SET status='succeeded',lease_owner=NULL,lease_until=NULL,updated_at=?,completed_at=?,last_error=NULL WHERE id=? AND lease_owner=? AND status='running' AND lease_until>?")
    .run(now, now, id, owner, now).changes === 1
}

function fail(id: string, owner: string, now: number, retryAt: number) {
  // Persist a fixed diagnostic code, never raw external errors or secret-bearing URLs.
  getDatabase().prepare(`UPDATE jobs SET status=CASE WHEN retry_safe=0 THEN 'needs_review'
    WHEN attempts<max_attempts THEN 'queued' ELSE 'failed' END,
    available_at=?,updated_at=?,lease_owner=NULL,lease_until=NULL,last_error='Handler failed'
    WHERE id=? AND lease_owner=? AND status='running' AND lease_until>?`).run(retryAt, now, id, owner, now)
}

function list(): Job[] {
  return getDatabase().prepare('SELECT * FROM jobs ORDER BY created_at DESC,id LIMIT 50').all() as unknown as Job[]
}

function counts(): Record<string, number> {
  return Object.fromEntries((getDatabase().prepare('SELECT status,count(*) AS count FROM jobs GROUP BY status').all() as { status: string; count: number }[]).map(r => [r.status, r.count]))
}

export const jobRepository = { insert, claim, heartbeat, complete, fail, list, counts }


export type JobRepository = typeof jobRepository

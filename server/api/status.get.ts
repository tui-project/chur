import type { SystemStatus } from '../../shared/types.ts'
import { servicesFor } from '../utils/services.ts'
import { defineEventHandler } from 'h3'
export default defineEventHandler((event): SystemStatus => {
  const { worker, jobs, startedAt } = servicesFor(event)
  return { version: '0.1.0', mode: 'dry-run' as const, automationEnabled: false, startedAt,
    worker: { running: worker.running, lastTickAt: worker.lastTickAt }, jobs: jobs.counts(), connectionsConfigured: 0 }
})

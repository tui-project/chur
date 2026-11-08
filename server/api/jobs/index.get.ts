import type { JobSummary } from '../../../shared/types.ts'
import { servicesFor } from '../../utils/services.ts'
import { defineEventHandler } from 'h3'
export default defineEventHandler((event): JobSummary[] => servicesFor(event).jobs.list().map(job => ({
  id: job.id, kind: job.kind, status: job.status, attempts: job.attempts,
  createdAt: job.created_at, completedAt: job.completed_at,
})))

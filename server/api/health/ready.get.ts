import { servicesFor } from '../../utils/services.ts'
import { createError, defineEventHandler } from 'h3'
export default defineEventHandler((event) => {
  const { checkStorage, worker } = servicesFor(event)
  try { checkStorage() } catch { throw createError({ statusCode: 503, statusMessage: 'Storage unavailable.' }) }
  if (!worker.running || !worker.lastTickAt || Date.now() - worker.lastTickAt > 10_000) throw createError({ statusCode: 503, statusMessage: 'Worker unavailable.' })
  return { status: 'ready' }
})

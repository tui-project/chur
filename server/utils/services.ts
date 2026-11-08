import { createError, type H3Event } from 'h3'
import type { Services } from '../services/services.ts'
export function servicesFor(event: H3Event): Services {
  if (!event.context.services) throw createError({ statusCode: 503, statusMessage: 'Application is starting.' })
  return event.context.services as Services
}

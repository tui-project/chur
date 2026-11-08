import { requireCsrf } from '../utils/csrf.ts'
import { createError, defineEventHandler, getCookie, getRequestURL, setHeaders } from 'h3'

const publicPaths = new Set(['/api/auth/status', '/api/auth/setup', '/api/auth/login', '/api/health/live', '/api/health/ready'])

export default defineEventHandler((event) => {
  setHeaders(event, { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' })
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return
  setHeaders(event, { 'Cache-Control': 'no-store' })
  const services = event.context.services
  if (!services) throw createError({ statusCode: 503, statusMessage: 'Application is starting.' })
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.method)) {
    requireCsrf(event)
  }
  event.context.admin = services.auth.session(getCookie(event, 'chur_session'))
  if (!publicPaths.has(url.pathname) && !event.context.admin) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
})

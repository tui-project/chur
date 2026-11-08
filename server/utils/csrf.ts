import { createError, getCookie, getHeader, setCookie, type H3Event } from 'h3'
import { servicesFor } from './services.ts'
import { SESSION_SECONDS } from '../services/auth.ts'

export function csrfToken(event: H3Event): string {
  const { csrf, config } = servicesFor(event)
  const session = getCookie(event, 'chur_session')
  const existing = getCookie(event, 'chur_csrf')
  if (csrf.valid(existing, session)) return existing
  const token = csrf.issue(session)
  setCookie(event, 'chur_csrf', token, {
    httpOnly: true, secure: config.secureCookies, sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS,
  })
  return token
}

export function requireCsrf(event: H3Event): void {
  const token = getHeader(event, 'x-csrf-token')
  if (getHeader(event, 'sec-fetch-site') === 'cross-site'
    || token !== getCookie(event, 'chur_csrf')
    || !servicesFor(event).csrf.valid(token, getCookie(event, 'chur_session'))) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid CSRF token. Refresh the page and try again.' })
  }
}

import { servicesFor } from './services.ts'
import { createError, setCookie, type H3Event } from 'h3'
import { AuthError, SESSION_SECONDS } from '../services/auth.ts'

export function sessionCookie(event: H3Event, token: string) {
  setCookie(event, 'chur_session', token, {
    httpOnly: true, secure: servicesFor(event).config.secureCookies,
    sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS,
  })
}

export function authError(error: unknown): never {
  if (error instanceof AuthError) throw createError({ statusCode: error.status, statusMessage: error.message })
  throw createError({ statusCode: 500, statusMessage: 'Unable to complete authentication.' })
}

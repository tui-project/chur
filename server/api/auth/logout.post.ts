import { servicesFor } from '../../utils/services.ts'
import { defineEventHandler, deleteCookie, getCookie } from 'h3'
export default defineEventHandler((event) => {
  servicesFor(event).auth.logout(getCookie(event, 'chur_session'))
  deleteCookie(event, 'chur_session', { path: '/', secure: servicesFor(event).config.secureCookies, httpOnly: true, sameSite: 'strict' })
  return { ok: true }
})

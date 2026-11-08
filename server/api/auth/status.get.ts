import { csrfToken } from '../../utils/csrf.ts'
import type { AuthStatus } from '../../../shared/types.ts'
import { servicesFor } from '../../utils/services.ts'
import { defineEventHandler } from 'h3'
export default defineEventHandler((event): AuthStatus => ({
  csrfToken: csrfToken(event),
  needsSetup: servicesFor(event).auth.needsSetup(),
  authenticated: !!event.context.admin,
  username: event.context.admin?.username,
}))

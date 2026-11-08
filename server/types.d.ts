import type { Services } from './services/services'
declare module 'h3' {
  interface H3EventContext {
    services: Services
    admin?: { username: string }
  }
}
export {}

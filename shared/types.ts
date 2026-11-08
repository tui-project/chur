export interface AuthStatus {
  csrfToken: string
  needsSetup: boolean
  authenticated: boolean
  username?: string
}
export interface SystemStatus {
  version: string
  mode: 'dry-run'
  automationEnabled: false
  startedAt: string
  worker: { running: boolean; lastTickAt: number | null }
  jobs: Record<string, number>
  connectionsConfigured: number
}
export interface JobSummary {
  id: string
  kind: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'needs_review'
  attempts: number
  createdAt: number
  completedAt: number | null
}

<script setup lang="ts">
const { data: session, refresh: refreshSession } = await useFetch('/api/auth/status', { server: false })
const { data: status, execute: refreshStatus } = await useFetch('/api/status', { immediate: false, server: false })
const { data: jobs, execute: refreshJobs } = await useFetch('/api/jobs', { immediate: false, server: false })
const username = ref('admin')
const password = ref('')
const token = ref('')
const busy = ref(false)
const checking = ref(false)
const backingUp = ref(false)
const error = ref('')
const notice = ref('')
const needsSetup = computed(() => session.value?.needsSetup ?? false)
let timer: ReturnType<typeof setInterval> | undefined

async function refreshDashboard() {
  await refreshSession()
  if (session.value?.authenticated) await Promise.all([refreshStatus(), refreshJobs()])
}
onMounted(() => {
  void refreshDashboard()
  timer = setInterval(() => { if (session.value?.authenticated) void refreshDashboard() }, 3000)
})
onUnmounted(() => clearInterval(timer))

function message(cause: unknown, fallback: string) {
  return (cause as { data?: { statusMessage?: string } })?.data?.statusMessage ?? fallback
}
async function authenticate() {
  busy.value = true
  error.value = ''
  try {
    if (needsSetup.value) await $fetch('/api/auth/setup', { method: 'POST', headers: { 'X-CSRF-Token': session.value?.csrfToken ?? '' }, body: { username: username.value, password: password.value, token: token.value } })
    else await $fetch('/api/auth/login', { method: 'POST', headers: { 'X-CSRF-Token': session.value?.csrfToken ?? '' }, body: { username: username.value, password: password.value } })
    password.value = ''; token.value = ''
    await refreshDashboard()
  } catch (cause) { error.value = message(cause, 'Unable to sign in. Please try again.') }
  finally { busy.value = false }
}
async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session.value?.csrfToken ?? '' } })
  status.value = undefined; jobs.value = undefined; notice.value = ''
  await refreshSession()
}
function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
async function runCheck() {
  checking.value = true; error.value = ''; notice.value = ''
  try {
    await $fetch('/api/jobs', { method: 'POST', headers: { 'X-CSRF-Token': session.value?.csrfToken ?? '' }, body: { kind: 'system.check', requestId: requestId() } })
    await refreshDashboard()
    notice.value = 'System check queued.'
  } catch (cause) { error.value = message(cause, 'Unable to queue the system check.') }
  finally { checking.value = false }
}
async function backup() {
  backingUp.value = true; error.value = ''; notice.value = ''
  try {
    await $fetch('/api/backups', { method: 'POST', headers: { 'X-CSRF-Token': session.value?.csrfToken ?? '' } })
    notice.value = 'Backup saved on this server.'
  } catch (cause) { error.value = message(cause, 'Unable to create a backup.') }
  finally { backingUp.value = false }
}
const completed = computed(() => status.value?.jobs.succeeded ?? 0)
</script>

<template>
  <div v-if="!session?.authenticated" class="access-page">
    <header class="brand"><span class="brand-mark" aria-hidden="true">c.</span>chur<span class="brand-dot">/</span></header>
    <main class="access-card">
      <p class="eyebrow">YOUR MEDIA, YOUR RULES</p>
      <h1>{{ needsSetup ? 'Make yourself at home.' : 'Welcome back.' }}</h1>
      <p class="muted">{{ needsSetup ? 'Create your administrator account to get started.' : 'Sign in to your Chur workspace.' }}</p>
      <form @submit.prevent="authenticate">
        <label v-if="needsSetup">Setup token
          <input v-model="token" type="password" autocomplete="off" required spellcheck="false" />
          <span class="field-hint">Use the setup token from your server’s configuration directory.</span>
        </label>
        <label>Username<input v-model="username" autocomplete="username" required maxlength="64" /></label>
        <label>Password
          <input v-model="password" type="password" :autocomplete="needsSetup ? 'new-password' : 'current-password'" :minlength="needsSetup ? 12 : 1" maxlength="256" required />
          <span v-if="needsSetup" class="field-hint">At least 12 characters.</span>
        </label>
        <p v-if="error" class="alert error" role="alert">{{ error }}</p>
        <button class="button primary full" :disabled="busy" type="submit">{{ busy ? 'Please wait…' : needsSetup ? 'Create account' : 'Sign in' }}<span aria-hidden="true">↗</span></button>
      </form>
    </main>
    <p class="access-footer">A little more thought behind every release.</p>
  </div>

  <div v-else class="workspace">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">c.</span>chur<span class="brand-dot">/</span></div>
      <p class="nav-label">WORKSPACE</p>
      <a class="nav-item active" href="#overview"><span aria-hidden="true">◫</span>Overview</a>
      <div class="sidebar-note"><span class="status-dot"></span><div>Dry-run mode<small>Downloads are paused.</small></div></div>
      <div class="account"><span class="avatar" aria-hidden="true">{{ session.username?.slice(0, 1).toUpperCase() }}</span><span>{{ session.username }}</span><button class="text-button" @click="signOut">Sign out</button></div>
    </aside>
    <div class="content">
      <header class="topbar"><span>Workspace <span class="slash">/</span> Overview</span><span class="badge dry">DRY RUN</span></header>
      <main id="overview">
        <div class="page-heading"><div><p class="eyebrow">YOUR WORKSPACE</p><h1>Overview<span class="heading-dot">.</span></h1><p class="muted">A clear view of what’s running, and what comes next.</p></div><button class="button secondary" :disabled="backingUp" @click="backup">{{ backingUp ? 'Saving…' : 'Create backup' }}</button></div>
        <p v-if="error" class="alert error" role="alert">{{ error }}</p>
        <p v-if="notice" class="alert notice" role="status">{{ notice }}</p>
        <section class="stats" aria-label="System summary">
          <article class="stat"><p>OPERATING MODE</p><div>Dry run<span class="tiny-indicator amber"></span></div><span>Automation is disabled</span></article>
          <article class="stat"><p>BACKGROUND WORKER</p><div>{{ status?.worker.running ? 'Running' : 'Checking…' }}<span class="tiny-indicator" :class="{ green: status?.worker.running }"></span></div><span>Ready for background tasks</span></article>
          <article class="stat"><p>COMPLETED JOBS</p><div>{{ completed.toString().padStart(2, '0') }}</div><span>This workspace’s task history</span></article>
        </section>
        <section class="panel connections" aria-labelledby="connections-title">
          <div class="section-title"><div><h2 id="connections-title">Connections</h2><p class="muted">Your library and release sources, together.</p></div><span class="quiet-count">0 CONNECTED</span></div>
          <div class="connection-grid">
            <article class="connection"><span class="service-icon" aria-hidden="true">R</span><div><h3>Radarr</h3><p>Film library</p></div><span class="connection-state">Not connected</span></article>
            <article class="connection"><span class="service-icon prowlarr" aria-hidden="true">P</span><div><h3>Prowlarr</h3><p>Release discovery</p></div><span class="connection-state">Not connected</span></article>
          </div>
          <p class="panel-footnote">No services are configured. Chur won’t search for or download media.</p>
        </section>
        <section class="panel" aria-labelledby="jobs-title">
          <div class="section-title"><div><h2 id="jobs-title">Background jobs</h2><p class="muted">Tasks stay here through restarts.</p></div><button class="button secondary" :disabled="checking" @click="runCheck">{{ checking ? 'Queuing…' : 'Run system check' }}</button></div>
          <div v-if="!jobs?.length" class="empty-state"><span class="empty-icon" aria-hidden="true">↳</span><h3>Nothing in the queue.</h3><p class="muted">Run a system check to confirm Chur is ready.</p></div>
          <div v-else class="table-wrap"><table><thead><tr><th>Task</th><th>Status</th><th>Attempts</th><th>Created</th></tr></thead><tbody><tr v-for="job in jobs" :key="job.id"><td><span class="job-icon" aria-hidden="true">↳</span>{{ job.kind === 'system.check' ? 'System check' : job.kind }}</td><td><span class="job-state" :class="job.status" data-testid="job-status">{{ job.status.replaceAll('_', ' ') }}</span></td><td>{{ job.attempts }}</td><td class="muted">{{ new Date(job.createdAt).toLocaleTimeString('en-GB') }}</td></tr></tbody></table></div>
        </section>
        <footer class="workspace-footer"><span>CHUR <span class="slash">/</span> {{ status?.version ?? '0.1.0' }}</span><span>Thoughtful choices. Better releases.</span></footer>
      </main>
    </div>
  </div>
</template>

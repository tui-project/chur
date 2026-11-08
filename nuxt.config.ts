export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  nitro: { preset: 'node-server' },
  app: { head: { title: 'Chur', meta: [{ name: 'description', content: 'Your media, your release preferences.' }] } },
})

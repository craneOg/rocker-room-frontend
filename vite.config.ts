import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { createMockApi } from './dev/mockApi.ts'

/** `npm run dev:mock`: serves /api from memory. Dev server only, never part of a build. */
const mockApi = (): Plugin => ({
  name: 'mock-api',
  apply: (_, env) => env.command === 'serve' && env.mode === 'mock',
  configureServer(server) {
    server.middlewares.use(createMockApi())
  },
})

export default defineConfig({
  plugins: [react(), mockApi()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? ''),
  },
  server: { proxy: { '/api': 'http://localhost:8080' } },
  test: { environment: 'jsdom' },
})

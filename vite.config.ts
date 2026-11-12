import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import { createMockApi } from './dev/mockApi.ts'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
  version: string
}

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
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: { proxy: { '/api': 'http://localhost:8080' } },
  // Nested agent worktrees under .claude/ hold full copies of the sources: keep them out of the run.
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})

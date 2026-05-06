import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: 'src/main/index.ts',
          worker: 'src/main/pipeline/worker.ts'
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      rollupOptions: {
        input: 'src/preload/index.ts'
      }
    },
    plugins: [externalizeDepsPlugin()]
  }
  // renderer: migrated to Vite in Phase 2 — served as static files via loadFile() for now
})

import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createBridgeHost } from './server/bridgeHost.mjs'

/**
 * The SOAP workbench's bridge host, mounted on the dev and preview servers
 * under /bridge: a WSDL uploaded in the workbench is published here and its
 * REST routes answer at /bridge/b/<id>/... with nothing to download or run.
 * A static deployment sets VITE_BRIDGE_HOST to a standalone host instead
 * (`node server/bridge-host.mjs`).
 */
const bridgeHostPlugin = () => {
  // The workbench is off (src/features.js), so nothing publishes here and
  // the host is not mounted. VITE_SOAP_WORKBENCH=on brings both back.
  if (String(process.env.VITE_SOAP_WORKBENCH || '').toLowerCase() !== 'on') return { name: 'vizroute-bridge-host (off)' }
  const host = createBridgeHost({ prefix: '/bridge', dataDir: 'node_modules/.vizroute/bridges' })
  return {
    name: 'vizroute-bridge-host',
    configureServer(server) {
      server.middlewares.use((req, res, next) => host.handler(req, res, next))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => host.handler(req, res, next))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), bridgeHostPlugin()],
  test: {
    // Unit tests must never reach a real sign-in service, whatever
    // .env.local holds on the machine running them.
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" },
  },
})

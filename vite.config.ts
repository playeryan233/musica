/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';

/**
 * Deployment base path. Root deployments use the default `/`; sub-path
 * deployments (GitHub Pages project sites, `example.com/musica/`) set
 * `DEPLOY_BASE=/musica/` at build time. The value is normalized so that
 * `musica`, `/musica` and `/musica/` all behave the same.
 *
 * It must be an absolute path (never `./`): the app uses history routing, so
 * relative asset URLs resolve against the current route (`/songs/x`) and 404
 * on a direct load or refresh.
 */
function resolveBase(): string {
  const raw = (process.env.DEPLOY_BASE || '/').trim();
  if (/^https?:\/\//.test(raw)) {
    return raw.endsWith('/') ? raw : `${raw}/`;
  }
  const path = raw.replace(/^\/+|\/+$/g, '');
  return path ? `/${path}/` : '/';
}

// https://vite.dev/config/
export default defineConfig({
  base: resolveBase(),
  plugins: [react(), ...alphaTab()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});

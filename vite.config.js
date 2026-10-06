import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readdirSync } from 'node:fs';

// truck models: public/models/<truck id>.fbx, copied into the build as they are (plain names, no content hash)
const TRUCK_MODELS = readdirSync(new URL('./public/models', import.meta.url)).filter((f) => f.endsWith('.fbx')).map((f) => f.slice(0, -4)).sort();

export default defineConfig({
  base: './',
  define: { __TRUCK_MODELS__: JSON.stringify(TRUCK_MODELS) },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    // plain file names (index.js, index.css, fredoka-latin-500-normal.woff2, ...) instead of name-<hash>: some hosts
    // reject the hashed ones. The service worker still picks up new versions (it tracks a revision per file).
    rollupOptions: { output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' } },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json', // (not .webmanifest: some hosts reject that file type)
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Meal Steel',
        short_name: 'Meal Steel',
        description: 'Suped-up food trucks race, rumble, play soccer and musical chairs. Bet, drive, win the pot.',
        theme_color: '#4db6f5',
        background_color: '#bfe6ff',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        inlineWorkboxRuntime: true, // one sw.js, no separately hashed workbox-<hash>.js
        globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // truck models are fetched on demand, then served from cache (also offline)
        runtimeCaching: [{ urlPattern: /\.fbx$/, handler: 'CacheFirst', options: { cacheName: 'truck-models', expiration: { maxEntries: 40 } } }],
      },
    }),
  ],
});

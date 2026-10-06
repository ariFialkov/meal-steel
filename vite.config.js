import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';


export default defineConfig({
  base: './',
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
        // truck textures (models/*.jpg) are fetched on demand, then served from cache (also offline)
        runtimeCaching: [{ urlPattern: /models\/[^/]+\.jpg$/, handler: 'CacheFirst', options: { cacheName: 'truck-models', expiration: { maxEntries: 40 } } }],
      },
    }),
  ],
});

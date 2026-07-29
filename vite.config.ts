import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    Icons({
      autoInstall: true,
      compiler: 'jsx',
      jsx: 'preact'
    }),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,svg,png,ico,wasm,sqlite}'],
        // 20 MB
        maximumFileSizeToCacheInBytes: 20 * 1000 * 1000
      },
      manifest: {
        name: 'Hōkō',
        short_name: 'Hōkō',
        description: 'Community BMTC bus tracking',
        theme_color: '#CEE5A8',
        background_color: '#CEE5A8',
        icons: [
          ...[48, 72, 144, 192, 512].map(size => {
            return {
              src: `icon-${size}-${size}.png`,
              sizes: `${size}x${size}`,
              type: 'image/png'
            }
          })
        ]
      }
    })
  ],
  build: {
    target: 'esnext',
    cssMinify: 'lightningcss'
  },
  resolve: {
    dedupe: ['preact'],
    alias: [
      { find: 'react', replacement: 'preact/compat' },
      { find: 'react-dom/test-utils', replacement: 'preact/test-utils' },
      { find: 'react-dom', replacement: 'preact/compat' },
      { find: 'react/jsx-runtime', replacement: 'preact/jsx-runtime' }
    ]
  },
  optimizeDeps: {
    exclude: ['genosdb']
  },
  server: {
    allowedHosts: ['hoko.test']
  }
})

import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    }),
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: '.'
        },
        {
          src: 'icons',
          dest: '.'
        },
        {
          src: 'public/_locales',
          dest: '_locales'
        },
        {
          src: 'src/popup/index.html',
          dest: 'popup',
          rename: 'popup.html'
        },
        {
          src: 'src/options/index.html',
          dest: 'options',
          rename: 'options.html'
        },
        {
          src: 'src/options/style.css',
          dest: 'options',
          rename: 'style.css'
        },
        {
          src: 'src/popup/style.css',
          dest: 'popup',
          rename: 'style.css'
        }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'src/popup/index.js',
        options: 'src/options/index.js',
        background: 'src/background/index.js'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});

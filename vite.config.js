import fs from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'b2b-server-pin-auth',
      transformIndexHtml() {
        return {
          tags: [
            { tag: 'script', attrs: { type: 'module', src: '/pin-auth.js' }, injectTo: 'body' },
            { tag: 'script', attrs: { type: 'module', src: '/pin-userlist-guard.mjs' }, injectTo: 'body' }
          ]
        };
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'pin-auth.js',
          source: fs.readFileSync(new URL('./pin-auth.js', import.meta.url), 'utf8')
        });
      }
    }
  ]
});

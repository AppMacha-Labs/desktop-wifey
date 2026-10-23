import { defineConfig } from 'vite';

// https://vitejs.dev/config
// Two pages: index.html is the transparent desktop overlay, home.html is her
// window (chat, today, preferences).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        home: 'home.html',
      },
    },
  },
});

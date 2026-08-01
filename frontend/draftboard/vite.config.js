import { defineConfig } from 'vite';
import { resolve } from "path";
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(() => {
    const viteServerPort = 3001;

    return {
        base: "/static/js/draftboard",
        plugins: [react()],
        build: {
          // Nested so files land under /static/js/draftboard/... via
          // STATICFILES_DIRS (which points at dist/), matching the URLs
          // django-vite builds from static_url_prefix.
          outDir: "dist/js/draftboard",
          emptyOutDir: true,
          manifest: true,
          rollupOptions: {
            input: resolve("./src/main.jsx"),
          }
        },
        server: {
            host: true,
            port: viteServerPort,
            open: false,
            watch: {
                usePolling: true,
                disableGlobbing: false,
            }
        }
        

    }
})

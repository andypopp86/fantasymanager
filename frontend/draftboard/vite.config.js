import { defineConfig } from 'vite';
import { resolve } from "path";
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig((config) => {
    const viteServerPort = 3001;

    return {
        base: "/static/js/draftboard",
        plugins: [react()],
        build: {
          outDir: "/static/js/draftboard/",
          emptyOutDir: true,
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

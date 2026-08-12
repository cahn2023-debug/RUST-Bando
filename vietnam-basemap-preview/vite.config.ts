import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    root: __dirname,
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        port: 1421,
        strictPort: true,
    },
    build: {
        outDir: path.resolve(__dirname, 'dist-basemap-preview'),
        emptyOutDir: true,
        sourcemap: process.env.TAURI_DEBUG === 'true',
        target: 'chrome105',
    },
    resolve: {
        dedupe: ['react', 'react-dom', 'maplibre-gl'],
    },
});

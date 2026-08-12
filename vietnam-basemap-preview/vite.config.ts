import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    root: __dirname,
    envDir: __dirname,
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        port: 1421,
        strictPort: true,
        proxy: {
            '/api/v1/google-tile': {
                target: 'https://mt1.google.com',
                changeOrigin: true,
                rewrite: path => {
                    const request = new URL(path, 'http://127.0.0.1');
                    const layer = request.searchParams.get('lyrs');
                    const x = request.searchParams.get('x');
                    const y = request.searchParams.get('y');
                    const z = request.searchParams.get('z');
                    const apistyle = request.searchParams.get('apistyle');
                    const suffix = apistyle ? `&apistyle=${encodeURIComponent(apistyle)}` : '';
                    return `/vt/lyrs=${layer}&x=${x}&y=${y}&z=${z}${suffix}`;
                },
            },
        },
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

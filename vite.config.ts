import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wasm()
  ],
  optimizeDeps: {
    include: ["@turf/turf"]
  },
  server: {
    port: 3000,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: [
        "**/docs/**",
        "**/BAK/**",
        "**/*.log",
        "**/live_*"
      ]
    }
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM === "windows" || process.platform === "win32" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  resolve: {
    alias: {
      "@HOME": path.resolve(__dirname, "src/modules/home"),
      "@DESIGN": path.resolve(__dirname, "src/modules/design"),
      "@CONTRACT": path.resolve(__dirname, "src/modules/contract"),
      "@IMPLEMENT": path.resolve(__dirname, "src/modules/implement"),
      "@TOOL": path.resolve(__dirname, "src/modules/tool"),
      "@ANALYTICS": path.resolve(__dirname, "src/modules/analytics"),
      "@": path.resolve(__dirname, "src"),
    }
  },
  // @ts-ignore
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "src/test-setup.ts",
  }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    // Select ONNX Runtime's external-WASM entry. Transformers.js already pins
    // the matching CDN URLs at runtime, so Cloudflare Pages does not need to
    // deploy the unused 25.6 MiB Asyncify binary emitted by the bundled entry.
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Nền Sạch — Xóa nền ảnh trên thiết bị",
        short_name: "Nền Sạch",
        description:
          "Xóa nền ảnh tự động, riêng tư và chất lượng cao ngay trên trình duyệt.",
        theme_color: "#111827",
        background_color: "#f7f7f5",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/pwa-512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 1600 },
});

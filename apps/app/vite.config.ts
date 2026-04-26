import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const api = process.env.VITE_API_URL ?? "http://localhost:3001";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-index-to-404",
      closeBundle() {
        const dist = resolve(rootDir, "dist");
        const src = resolve(dist, "index.html");
        const dst = resolve(dist, "404.html");
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: api,
        changeOrigin: true,
      },
    },
  },
});

import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import fs from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const api = process.env.VITE_API_URL ?? "http://localhost:3001";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-index-to-404",
      closeBundle() {
        const dist = resolve(__dirname, "dist");
        fs.copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
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

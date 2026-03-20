import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3786,
    proxy: {
      "/api": "http://localhost:3784",
    },
  },
  build: {
    outDir: "dist",
  },
});

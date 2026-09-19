import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "^/api/": `http://127.0.0.1:${process.env.API_PORT ?? 3001}` },
  },
  build: { outDir: "../../dist/dashboard", emptyOutDir: true },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// NETPAD_API_URL is set by run.py when API port differs from 8000
const apiTarget = process.env.NETPAD_API_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});

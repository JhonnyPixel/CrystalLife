import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    // Three.js WebGL renderer supera di poco soglia Vite predefinita.
    chunkSizeWarningLimit: 550,
  },
});

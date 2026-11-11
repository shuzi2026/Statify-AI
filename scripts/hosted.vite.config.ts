import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    ssr: "scripts/hosted-server.ts",
    target: "node24",
    outDir: "output/build/hackathon/server",
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "server.mjs" } },
  },
});

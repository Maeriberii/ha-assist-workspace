import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins:
    process.env.ANALYZE === "true"
      ? [
          visualizer({
            filename: "bundle-stats.html",
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : [],
  build: {
    emptyOutDir: false,
    outDir: "../custom_components/assist_workspace/frontend",
    lib: {
      entry: "src/assist-workspace-card.ts",
      formats: ["es"],
      fileName: () => "assist-workspace-card.js",
    },
  },
});

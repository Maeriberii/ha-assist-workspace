import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const systemChromium = "/usr/bin/chromium";
const executablePath = existsSync(systemChromium) ? systemChromium : undefined;

export default defineConfig({
  testDir: "./e2e",
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      executablePath,
      args: process.getuid?.() === 0 ? ["--no-sandbox"] : [],
    },
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: true,
  },
});

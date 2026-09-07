import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./assignment/__tests__",
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    headless: process.env.HEADLESS !== "false",
  },
});

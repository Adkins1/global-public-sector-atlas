import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: process.env.ATLAS_BASE_URL || "http://127.0.0.1:4321",
    headless: true,
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "npm run preview -- --port 4321",
    url: "http://127.0.0.1:4321/pl/",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});

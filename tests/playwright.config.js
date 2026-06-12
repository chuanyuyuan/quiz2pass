// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testMatch: 'tests.spec.js',
  timeout: 15000,
  use: {
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14 size
    locale: 'zh-CN',
  },
  webServer: {
    command: 'python3 -m http.server 8080',
    port: 8080,
    cwd: 'D:/projects/Quiz2Pass',
    reuseExistingServer: true,
    timeout: 10000,
  },
});

import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,forbidOnly:Boolean(process.env.CI),retries:0,
  timeout:30000,expect:{timeout:10000},reporter:process.env.CI?'github':'list',
  outputDir:'artifacts/browser-results',
  use:{baseURL:'http://127.0.0.1:3017',trace:'retain-on-failure',screenshot:'only-on-failure',
    // Network-failure journeys must reach their route handler: a claimed PWA
    // worker can otherwise fetch/cache the chunk outside page interception.
    // This isolates the test context; the production service worker is intact.
    serviceWorkers:'block',
    // Functional journeys use the Canvas fallback, avoiding software-WebGL
    // GPU stalls on CI runners. Physical/GPU acceptance remains separate.
    launchOptions:{args:['--disable-webgl','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},
  },
  projects:[{name:'chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}}],
  webServer:{command:'node scripts/browser-test-server.mjs',url:'http://127.0.0.1:3017/guest',reuseExistingServer:false,timeout:30000},
});

import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', fullyParallel:false, workers:1,
  use:{ baseURL:'http://127.0.0.1:5173', headless:true, viewport:{width:1400,height:1000} },
  webServer:{ command:'npm run preview',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI },
});

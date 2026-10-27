import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 2, retries: 0, timeout: 40000,
  expect: {timeout:15000},
  reporter: [['list'], ['html',{open:'never'}]],
  use: {
    baseURL:process.env.ATLAS_URL??'http://127.0.0.1:5190', trace:'retain-on-failure', screenshot:'only-on-failure',
    launchOptions:{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']},
  },
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:960}}},
    {name:'phone-chromium',use:{...devices['Pixel 7'],viewport:{width:390,height:844}}},
  ],
  webServer:process.env.ATLAS_URL?undefined:{command:'npm run preview -- --strictPort',url:'http://127.0.0.1:5190',reuseExistingServer:true},
})

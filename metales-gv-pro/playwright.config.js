const {defineConfig}=require('@playwright/test');
const os=require('node:os'),path=require('node:path');
module.exports=defineConfig({
 testDir:'./tests/ui',workers:1,timeout:30000,reporter:'list',
 use:{headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure',
  launchOptions:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:process.platform==='linux'?['--no-sandbox']:[]}},
});

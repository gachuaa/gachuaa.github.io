import { defineConfig } from 'astro/config';
import { readConfig } from './src/lib/model.mjs';
const {site}=readConfig();
export default defineConfig({
  site:site.url,
  base:site.base,
  output:'static',
  trailingSlash:'always',
  markdown:{ shikiConfig:{themes:{light:'github-light',dark:'github-dark'},wrap:false} },
  vite:{server:{allowedHosts:['terminal.local']}}
});
